/**
 * Planning Domain — the single source of truth for weekly-plan legality.
 *
 * Every stage of the planning pipeline shares these rules:
 *   can this be scheduled · what is the next legal candidate · where is the
 *   next free future slot · is the whole week valid · what will actually run ·
 *   is the plan still valid after a week rollover.
 *
 * Callers differ only in the `from` position they pass in (edits must respect
 * already-started slots, whole-week checks must not).
 */
import type { BalanceConfig } from '../balance/config';
import type {
  ActivityDuration, ActivityOption, ContentId, ContentRegistry, CourseDefinition, GameState, PlanSlot, PlannedActivity, Weekday, WeeklyPlan,
} from '../content/contracts';
import { getActivityDefinition, getActivityOption } from './activities';
import { evaluateCondition, explainCondition } from './conditions';
import { employmentWorkWindow, studyGain } from './effects';
import { absoluteMinute, type GameTime } from './time';

export const DAY_START = 9 * 60;
export const DAY_END = 17 * 60;
export const EVENING_START = 19 * 60;
export const EVENING_END = 23 * 60;
export const MINUTES_PER_DAY = 24 * 60;
export const LONG_ACTIVITY_MIN_DURATION = 2880;

/** Canonical study/side-job durations. Legacy saves may still carry 180. */
export const CANONICAL_DURATIONS: readonly ActivityDuration[] = [60, 120, 180, 240];

/** `from` sentinel meaning "the whole week is still editable" (validation, migration). */
export const WEEK_START_FROM = { kind: 'week_start' } as const;
/** `from` sentinel meaning "everything before the current instant is settled". */
export const CURRENT_TIME_FROM = { kind: 'current_time' } as const;

/** `true` means "resolve against the live clock". */
export type PlanPosition = GameTime | typeof WEEK_START_FROM | typeof CURRENT_TIME_FROM;

export type PlanIssueCode =
  | 'PAST_SLOT'
  | 'SLOT_OCCUPIED'
  | 'EMPLOYMENT_CONFLICT'
  | 'EMPLOYMENT_LOCKED'
  | 'INVALID_DURATION'
  | 'UNKNOWN_JOB'
  | 'NOT_SIDE_JOB'
  | 'SIDE_JOB_NOT_ACQUIRED'
  | 'REGULAR_JOB_IN_PLAN'
  | 'UNKNOWN_ACTIVITY'
  | 'UNKNOWN_ACTIVITY_OPTION'
  | 'ACTIVITY_TOO_LONG'
  | 'ACTIVITY_REQUIREMENTS'
  | 'ACTIVITY_COOLDOWN'
  | 'UNKNOWN_COURSE'
  | 'COURSE_MAX_COMPLETIONS'
  | 'COURSE_REQUIREMENTS'
  | 'COURSE_COOLDOWN'
  | 'COURSE_CASH'
  | 'MULTI_DAY_CONFLICT'
  | 'PLAN_ALREADY_FULL';

export interface PlanIssue {
  code: PlanIssueCode;
  /** The weekday (1-7) whose cell the player can fix. */
  weekday: Weekday;
  /** `next` marks an overrun slot that belongs to the following week. */
  slot: PlanSlot | 'next';
  message: string;
}

export interface PlanIssueContext {
  content: ContentRegistry;
  balance: BalanceConfig;
  employment?: GameState['employment'];
  /** Resolve position. Defaults to the whole week (see `WEEK_START_FROM`). */
  from?: PlanPosition;
}

export interface ScheduleCandidate {
  weekday: Weekday;
  slot: PlanSlot;
  activity: PlannedActivity;
}

/** The one scheduler refuses to overwrite an occupied cell: only `free` cells are placeable. */
function occupiedCellIssue(candidate: ScheduleCandidate, plan: WeeklyPlan): PlanIssue[] {
  const existing = plan.days[candidate.weekday]?.[candidate.slot];
  if (!existing || existing.kind === 'free') return [];
  return [buildIssue('SLOT_OCCUPIED', candidate.weekday, candidate.slot, `周${weekdayLabel(candidate.weekday)}${slotLabel(candidate.slot)}已经安排过内容`)];
}

export interface SlotSearchResult {
  found: boolean;
  reason?: string;
  result?: ScheduleCandidate;
}

export interface CourseAvailability {
  completed: number;
  durationMinutes: number;
  reason?: string;
  cooldownRemaining: number;
  /** `hard` blocks planning and execution; `warning` only affects the forecast. */
  cash: 'ok' | 'hard';
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const PLAN_SLOTS = ['day', 'evening'] as const;

const SLOT_WINDOW: Record<PlanSlot, readonly [number, number]> = { day: [DAY_START, DAY_END], evening: [EVENING_START, EVENING_END] };

export function weekdayLabel(weekday: Weekday): string {
  return ['一', '二', '三', '四', '五', '六', '日'][weekday - 1];
}

export function slotLabel(slot: PlanSlot | 'next'): string {
  return slot === 'day' ? '白天' : slot === 'evening' ? '晚间' : '次日';
}

export function weekdayAfter(weekday: Weekday, offset: number): Weekday {
  return ((((weekday - 1) + offset) % 7) + 1) as Weekday;
}

export function weekStartDayOf(day: number): number {
  const weekday = ((day - 1) % 7) + 1;
  return Math.max(1, day - weekday + 1);
}

/** Resolve a plan position into an absolute minute for comparisons. */
export function resolvePlanMinute(from: PlanPosition, time: GameTime): number {
  if ('kind' in from) {
    if (from.kind === 'current_time') return absoluteMinute(time);
    return absoluteMinute({ day: weekStartDayOf(time.day), hour: 0, minute: 0 });
  }
  return absoluteMinute(from);
}

/** Absolute minute at which a planned slot begins. */
export function slotStartMinute(weekday: Weekday, slot: PlanSlot, time: GameTime): number {
  return (weekStartDayOf(time.day) + weekday - 2) * MINUTES_PER_DAY + SLOT_WINDOW[slot][0];
}

/** `within` is "not before the resolve position": past slots are locked mid-week. */
export function slotWithin(weekday: Weekday, slot: PlanSlot, from: PlanPosition, time: GameTime): boolean {
  return slotStartMinute(weekday, slot, time) >= resolvePlanMinute(from, time);
}

function buildIssue(code: PlanIssueCode, weekday: Weekday, slot: PlanSlot | 'next', message: string): PlanIssue {
  return { code, weekday, slot, message };
}

function nextWeekDay(time: GameTime, offset: number): number {
  return weekStartDayOf(time.day) + 7 + offset;
}

interface OverrunState { busy: boolean; workConflict: boolean; planConflict: boolean }

/** Weekday reached `offset` days after the planned day, wrapping into the next week. */
function weekdayAtOffset(from: Weekday, offset: number): Weekday {
  return (((((from - 1) + offset) % 7) + 7) % 7 + 1) as Weekday;
}

function dayOverrunState(plan: WeeklyPlan, from: Weekday, offset: number, employment: PlanIssueContext['employment']): OverrunState {
  const weekday = weekdayAtOffset(from, offset);
  const workConflict = Boolean(employment?.schedule.workDays.includes(weekday));
  const overrun = plan.days[weekday];
  if (!overrun) return { busy: true, workConflict, planConflict: false };
  const planConflict = overrun.day.kind !== 'free' || overrun.evening.kind !== 'free';
  return { busy: planConflict || workConflict, workConflict, planConflict };
}

function durationText(minutes: number): string {
  return minutes >= 1440 ? `${minutes / 1440} 天` : `${minutes / 60} 小时`;
}

export function resolveActivityOption(content: ContentRegistry, activityId: ContentId, optionId: string): { definition: ReturnType<typeof getActivityDefinition>; option: ActivityOption | undefined } {
  const definition = getActivityDefinition(content, activityId);
  return { definition, option: definition ? getActivityOption(definition, optionId) : undefined };
}

/**
 * Unified course eligibility. CourseMarket, the planner and execution all read
 * this so a course can never be scheduled when the engine would refuse it.
 */
export function courseAvailability(state: GameState, course: CourseDefinition, content: ContentRegistry, balance: BalanceConfig): CourseAvailability {
  const completed = state.courseProgress?.[course.id] ?? 0;
  const cooldownRemaining = courseCooldownRemaining(state, course);
  const availability: CourseAvailability = {
    completed,
    durationMinutes: course.durationMinutes,
    cooldownRemaining,
    cash: state.cash >= course.cashCost ? 'ok' : 'hard',
  };
  if (course.maxCompletions !== undefined && completed >= course.maxCompletions) return { ...availability, reason: '这门课程已经完成过了' };
  if (cooldownRemaining > 0) return { ...availability, reason: `${course.name}仍在冷却中，还需要 ${cooldownRemaining} 天` };
  if (course.requirements && !evaluateCondition(course.requirements, state, content, balance)) {
    return { ...availability, reason: `${course.name}：${explainCondition(course.requirements, state, content, balance)}` };
  }
  if (availability.cash === 'hard') return { ...availability, reason: `${course.name}：现金不足，需要 ${course.cashCost}` };
  return availability;
}

export function courseCooldownRemaining(state: GameState, course: CourseDefinition): number {
  if (!course.cooldownDays) return 0;
  const days = (state.lifeHistory ?? [])
    .filter((record) => record.category === 'activity' && record.sourceId === course.id)
    .map((record) => record.day);
  if (!days.length) return 0;
  const lastDay = days.reduce((latest, day) => (day > latest ? day : latest), days[0]);
  return Math.max(0, course.cooldownDays - (state.time.day - lastDay));
}

/** Planned (not yet executed) activity occurrences, in schedule order. */
interface PlannedOccurrence { weekday: Weekday; slot: PlanSlot; definition: NonNullable<ReturnType<typeof getActivityDefinition>>; option: ActivityOption }

function collectPlannedOccurrences(plan: WeeklyPlan, content: ContentRegistry): PlannedOccurrence[] {
  const occurrences: PlannedOccurrence[] = [];
  for (const weekday of WEEKDAYS) {
    for (const slot of PLAN_SLOTS) {
      const activity = plan.days[weekday]?.[slot];
      if (activity?.kind !== 'activity') continue;
      const definition = getActivityDefinition(content, activity.activityId);
      const option = definition && getActivityOption(definition, activity.optionId);
      if (definition && option) occurrences.push({ weekday, slot, definition, option });
    }
  }
  return occurrences;
}

interface ActivityTimelineStep { weekday: Weekday; slot: PlanSlot; definition: NonNullable<ReturnType<typeof getActivityDefinition>>; option: ActivityOption; durationMinutes: number }

/**
 * Cooldowns are evaluated on the **projected execution day**, not on "today",
 * and every earlier planned occurrence of the same activity is folded into the
 * timeline so a week cannot stage several runs of one cooldown activity.
 */
function activityTimeline(plan: WeeklyPlan, content: ContentRegistry): ActivityTimelineStep[] {
  return collectPlannedOccurrences(plan, content)
    .map((occurrence) => ({
      ...occurrence,
      durationMinutes: occurrence.option.durationMinutes,
    }))
    .sort((left, right) => left.weekday - right.weekday || PLAN_SLOTS.indexOf(left.slot) - PLAN_SLOTS.indexOf(right.slot));
}

/** Projected execution day of the n-th step in the timeline. */
function projectedDays(timeline: readonly ActivityTimelineStep[], state: GameState): number[] {
  const weekStart = weekStartDayOf(state.time.day);
  const today = state.time.day;
  const cursor: Record<string, number> = {};
  return timeline.map((step) => {
    const slotKey = `${step.weekday}:${step.slot}`;
    const slotDay = weekStart + step.weekday - 1;
    // A slot that has already started never runs this week; anything freed by a
    // same-week duplicate cooldown fallback can be re-placed on the next Monday.
    const minimum = slotWithin(step.weekday, step.slot, CURRENT_TIME_FROM, state.time) ? slotDay : slotDay + 7;
    const day = Math.max(today, minimum, cursor[step.definition.id] ?? 1, cursor[slotKey] ?? 1);
    cursor[step.definition.id] = day + Math.max(1, Math.ceil(step.durationMinutes / MINUTES_PER_DAY) + 1);
    cursor[slotKey] = day + 1;
    return day;
  });
}

function scanActivityCooldownIssues(plan: WeeklyPlan, timelineSteps: readonly ActivityTimelineStep[], state: GameState, projected: readonly number[]): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const lastScheduledDay = new Map<ContentId, number>();
  timelineSteps.forEach((step, index) => {
    const day = projected[index];
    if (step.option.cooldownDays) {
      const executed = state.lifeHistory ?? [];
      const lastExecuted = executed
        .filter((record) => record.category === 'activity' && record.sourceId === step.definition.id && record.day <= day)
        .reduce<number | undefined>((latest, record) => (latest === undefined || record.day > latest ? record.day : latest), undefined);
      const previousPlanned = lastScheduledDay.get(step.definition.id);
      const anchor = previousPlanned ?? lastExecuted;
      if (anchor !== undefined && day - anchor < step.option.cooldownDays) {
        issues.push(buildIssue('ACTIVITY_COOLDOWN', step.weekday, step.slot, `周${weekdayLabel(step.weekday)}${slotLabel(step.slot)}${step.definition.name}与上次执行间隔不足 ${step.option.cooldownDays} 天`));
      }
      lastScheduledDay.set(step.definition.id, day);
      return;
    }
    lastScheduledDay.set(step.definition.id, day);
  });
  return issues;
}

/**
 * Activity legality and cooldowns. The cooldown scan is also the authoritative
 * source for "will this slot still execute?": a slot whose projected run day has
 * already passed never runs again, so it is not editable either.
 */
function collectActivityIssues(plan: WeeklyPlan, state: GameState, content: ContentRegistry, balance: BalanceConfig): { issues: PlanIssue[]; projected: number[]; timeline: ActivityTimelineStep[] } {
  const issues: PlanIssue[] = [];
  const timeline = activityTimeline(plan, content);
  for (const weekday of WEEKDAYS) {
    for (const slot of PLAN_SLOTS) {
      const activity = plan.days[weekday]?.[slot];
      if (activity?.kind !== 'activity') continue;
      const { definition, option } = resolveActivityOption(content, activity.activityId, activity.optionId);
      if (!definition) { issues.push(buildIssue('UNKNOWN_ACTIVITY', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}活动不存在`)); continue; }
      if (!option) { issues.push(buildIssue('UNKNOWN_ACTIVITY_OPTION', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}活动选项不存在`)); continue; }
      const window = SLOT_WINDOW[slot][1] - SLOT_WINDOW[slot][0];
      if (option.durationMinutes >= LONG_ACTIVITY_MIN_DURATION) {
        if (slot !== 'day') { issues.push(buildIssue('ACTIVITY_TOO_LONG', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}多日活动只能从白天开始`)); continue; }
        const covered = Math.floor((option.durationMinutes - (MINUTES_PER_DAY - DAY_START)) / MINUTES_PER_DAY);
        for (let offset = 1; offset <= covered; offset += 1) {
          // The activity occupies the whole covered day started at DAY_START, so any
          // workday or plan entry on that day is a real conflict.
          const crosses = weekday + offset > 7;
          const overrun = dayOverrunState(plan, weekday, offset, state.employment);
          if (!overrun.busy) continue;
          const label = crosses
            ? `下周周${weekdayLabel(weekdayAfter(weekday, offset))}`
            : `周${weekdayLabel(weekdayAfter(weekday, offset))}`;
          // A day can be blocked by both a plan entry and a workday; report both
          // causes so the player knows exactly what to clear.
          const planBlocked = overrun.planConflict;
          if (planBlocked) issues.push(buildIssue('MULTI_DAY_CONFLICT', weekday, slot, `周${weekdayLabel(weekday)}多日活动与${label}计划冲突`));
          if (overrun.workConflict) issues.push(buildIssue('MULTI_DAY_CONFLICT', weekday, slot, `周${weekdayLabel(weekday)}多日活动与${label}正式工作排班冲突`));
        }
        continue;
      }
      if (option.durationMinutes > window) { issues.push(buildIssue('ACTIVITY_TOO_LONG', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}活动时长超出可规划时间（${durationText(option.durationMinutes)}）`)); continue; }
      if (option.requirements && !evaluateCondition(option.requirements, state, content, balance)) {
        issues.push(buildIssue('ACTIVITY_REQUIREMENTS', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}${definition.name} · ${option.label}：${explainCondition(option.requirements, state, content, balance)}`));
      }
    }
  }
  const projected = projectedDays(timeline, state);
  issues.push(...scanActivityCooldownIssues(plan, timeline, state, projected));
  return { issues, projected, timeline };
}

function collectCourseIssues(plan: WeeklyPlan, state: GameState, content: ContentRegistry, balance: BalanceConfig): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (const weekday of WEEKDAYS) {
    for (const slot of PLAN_SLOTS) {
      const activity = plan.days[weekday]?.[slot];
      if (activity?.kind !== 'course') continue;
      const course = (content.courses ?? []).find((entry) => entry.id === activity.courseId);
      if (!course) { issues.push(buildIssue('UNKNOWN_COURSE', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}课程不存在`)); continue; }
      const availability = courseAvailability(state, course, content, balance);
      if (availability.reason) {
        const code = availability.cash === 'hard' ? 'COURSE_CASH' : 'COURSE_REQUIREMENTS';
        issues.push(buildIssue(code, weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}${availability.reason}`));
        continue;
      }
      if (course.durationMinutes > SLOT_WINDOW[slot][1] - SLOT_WINDOW[slot][0]) {
        issues.push(buildIssue('ACTIVITY_TOO_LONG', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}课程时长超出可规划时间（${durationText(course.durationMinutes)}）`));
      }
    }
  }
  return issues;
}

function collectSideJobIssues(plan: WeeklyPlan, state: GameState, content: ContentRegistry): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (const weekday of WEEKDAYS) {
    for (const slot of PLAN_SLOTS) {
      const activity = plan.days[weekday]?.[slot];
      if (activity?.kind === 'study') {
        if (!CANONICAL_DURATIONS.includes(activity.durationMinutes)) issues.push(buildIssue('INVALID_DURATION', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}时长无效`));
        continue;
      }
      if (activity?.kind !== 'side_job') continue;
      if (!CANONICAL_DURATIONS.includes(activity.durationMinutes)) issues.push(buildIssue('INVALID_DURATION', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}时长无效`));
      const job = content.jobs.find((entry) => entry.id === activity.jobId);
      if (!job) { issues.push(buildIssue('UNKNOWN_JOB', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}兼职不存在`)); continue; }
      if (job.kind === 'regular') { issues.push(buildIssue('REGULAR_JOB_IN_PLAN', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}不能安排正式工作`)); continue; }
      if (!state.acquiredSideJobs?.[job.id]) issues.push(buildIssue('SIDE_JOB_NOT_ACQUIRED', weekday, slot, `需要先获得${job.name}兼职资格`));
    }
  }
  return issues;
}

function collectEmploymentIssues(plan: WeeklyPlan, employment: PlanIssueContext['employment']): PlanIssue[] {
  if (!employment) return [];
  const issues: PlanIssue[] = [];
  for (const weekday of WEEKDAYS) {
    if (!employment.schedule.workDays.includes(weekday)) continue;
    const planned = plan.days[weekday]?.day;
    if (planned && planned.kind !== 'free') {
      issues.push(buildIssue('EMPLOYMENT_CONFLICT', weekday, 'day', `周${weekdayLabel(weekday)}白天与正式工作排班冲突`));
    }
  }
  return issues;
}

export function collectPlanIssues(plan: WeeklyPlan, state: GameState, context: PlanIssueContext): PlanIssue[] {
  const from = context.from ?? WEEK_START_FROM;
  const issues = [
    ...collectEmploymentIssues(plan, context.employment),
    ...collectSideJobIssues(plan, state, context.content),
    ...collectActivityIssues(plan, state, context.content, context.balance).issues,
    ...collectCourseIssues(plan, state, context.content, context.balance),
  ];
  if (resolvePlanMinute(from, state.time) > resolvePlanMinute(WEEK_START_FROM, state.time)) {
    for (const weekday of WEEKDAYS) {
      for (const slot of PLAN_SLOTS) {
        if (slotWithin(weekday, slot, from, state.time)) continue;
        issues.push(buildIssue('PAST_SLOT', weekday, slot, `周${weekdayLabel(weekday)}${slotLabel(slot)}已经过去，不能再修改`));
      }
    }
  }
  return issues;
}

function issueMessage(issue: PlanIssue): string {
  // Detail already carries the slot wording; no second suffix is appended.
  return issue.message;
}

export function formatPlanIssues(issues: readonly PlanIssue[]): string[] {
  return issues.map(issueMessage);
}

export interface EditableCell { weekday: Weekday; position: PlanSlot }

/**
 * Edit-time validation. A pre-existing broken cell never blocks fixing a
 * different cell: the edit is accepted when it introduces no new issue and does
 * not increase the number of known problems. A cell that already started, or
 * whose projected run day has passed, is frozen and reports that instead.
 */
export function planEditIssues(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig, cells?: readonly EditableCell[]): PlanIssue[] {
  const context: PlanIssueContext = { content, balance, employment: state.employment, from: CURRENT_TIME_FROM };
  const changedWeekdays = cellsToChangedWeekdays(cells, state.time);
  const projectedPast = projectedPastCells(plan, state, content);
  return collectPlanIssues(plan, state, context).filter((issue) => issueIsEditable(issue, changedWeekdays, projectedPast, state.time));
}

function cellsToChangedWeekdays(cells: readonly EditableCell[] | undefined, time: GameTime): Set<Weekday> | undefined {
  if (!cells?.length) return undefined;
  // Any problem reported on an edited weekday was caused by this edit: the cell
  // contents differ from what the validator saw a moment ago.
  return new Set(cells.filter((cell) => slotWithin(cell.weekday, cell.position, CURRENT_TIME_FROM, time)).map((cell) => cell.weekday));
}

/** Cells whose planned activity will not run again this week, because its projected day is behind today. */
function projectedPastCells(plan: WeeklyPlan, state: GameState, content: ContentRegistry): Set<string> {
  const frozen = new Set<string>();
  const timeline = activityTimeline(plan, content);
  const projected = projectedDays(timeline, state);
  timeline.forEach((step, index) => {
    if (projected[index] < state.time.day) frozen.add(`${step.weekday}:${step.slot}`);
  });
  return frozen;
}

function issueIsEditable(issue: PlanIssue, changedWeekdays: Set<Weekday> | undefined, projectedPast: Set<string>, time: GameTime): boolean {
  if (issue.slot === 'next') return true;
  // A slot that already started only reports that fact when the caller is
  // resolving a whole-week question; a single-cell edit never reports it, because
  // `set_plan` already refuses to touch a started slot.
  if (!slotWithin(issue.weekday, issue.slot, CURRENT_TIME_FROM, time)) return !changedWeekdays && issue.code === 'PAST_SLOT';
  // A cell whose projected run day is already behind today will never execute
  // again this week, so its problems are not something the player can repair now.
  if (projectedPast.has(`${issue.weekday}:${issue.slot}`)) return false;
  if (!changedWeekdays) return true;
  return changedWeekdays.has(issue.weekday);
}

function issueSignature(issue: PlanIssue): string {
  return `${issue.code}:${issue.weekday}:${issue.slot}`;
}

export function planEditError(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig, cells?: readonly EditableCell[]): string | undefined {
  const existing = planEditIssues(state, state.weeklyPlan, content, balance, cells);
  const next = planEditIssues(state, plan, content, balance, cells);
  if (!next.length) return undefined;
  const before = new Set(existing.map(issueSignature));
  const introduced = next.filter((issue) => !before.has(issueSignature(issue)));
  if (!introduced.length && next.length <= existing.length) return undefined;
  return issueMessage(introduced[0] ?? next[0]);
}

export function weeklyPlanErrors(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): string[] {
  return formatPlanIssues(collectPlanIssues(plan, state, { content, balance, employment: state.employment, from: WEEK_START_FROM }));
}

/**
 * Strict whole-week validation used by start_week, auto-repeat and final runs.
 * Returns `undefined` when the week may run.
 */
export function planRunError(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): string | undefined {
  const issues = collectPlanIssues(plan, state, { content, balance, employment: state.employment, from: WEEK_START_FROM });
  return issues.length ? issueMessage(issues[0]) : undefined;
}

/** Issues for a single prospective cell placement, ignoring past-slot locks. */
function candidateIssues(candidate: ScheduleCandidate, plan: WeeklyPlan, state: GameState, content: ContentRegistry, balance: BalanceConfig): PlanIssue[] {
  const prospective: WeeklyPlan = {
    ...plan,
    days: {
      ...plan.days,
      [candidate.weekday]: {
        day: plan.days[candidate.weekday].day,
        evening: plan.days[candidate.weekday].evening,
        [candidate.slot]: candidate.activity,
      },
    },
  };
  return [
    ...occupiedCellIssue(candidate, plan),
    ...collectPlanIssues(prospective, state, { content, balance, employment: state.employment, from: WEEK_START_FROM })
      .filter((issue) => issue.weekday === candidate.weekday),
  ];
}

export function candidateSchedulingError(candidate: ScheduleCandidate, plan: WeeklyPlan, state: GameState, content: ContentRegistry, balance: BalanceConfig): string | undefined {
  const issues = candidateIssues(candidate, plan, state, content, balance);
  return issues.length ? issueMessage(issues[0]) : undefined;
}

export function canScheduleCandidate(candidate: ScheduleCandidate, plan: WeeklyPlan, state: GameState, content: ContentRegistry, balance: BalanceConfig): boolean {
  return candidateIssues(candidate, plan, state, content, balance).length === 0;
}

export const NO_SLOT_REASON = '本周剩余时间没有可用的计划格';

export interface SlotSearchOptions {
  /** `current` only searches after the live clock; `week` searches the whole week. */
  from?: 'current' | 'week';
}

/**
 * The one scheduler behind every "安排到本周" button. Only future slots are
 * considered, employment workdays lock the day slot, multi-day activities are
 * checked against the days they would occupy, and the candidate's own
 * requirements/cooldown are enforced through the shared planning rules.
 */
export function findNextSchedulableSlot(candidate: ScheduleCandidate, state: GameState, content: ContentRegistry, balance: BalanceConfig, options: SlotSearchOptions = {}): SlotSearchResult {
  const from = options.from === 'current' ? CURRENT_TIME_FROM : WEEK_START_FROM;
  const startWeekday = options.from === 'current' ? state.calendar.weekday : 1;
  const plan = state.weeklyPlan;
  for (let weekday = startWeekday; weekday <= 7; weekday += 1) {
    for (const slot of PLAN_SLOTS) {
      if (!slotWithin(weekday as Weekday, slot, from, state.time)) continue;
      const placed: ScheduleCandidate = { ...candidate, weekday: weekday as Weekday, slot };
      if (canScheduleCandidate(placed, plan, state, content, balance)) return { found: true, result: placed };
    }
  }
  return { found: false, reason: NO_SLOT_REASON };
}

/**
 * Formal work lives in the employment schedule, not in the weekly plan. Every
 * path that activates or changes a formal job funnels through here so the
 * underlying day slots never keep a stale activity that the UI then shows as
 * locked work while the validator reports a conflict.
 */
export function reconcilePlanWithEmployment(plan: WeeklyPlan, employment: GameState['employment']): WeeklyPlan {
  if (!employment?.schedule.workDays.length) return plan;
  const days = { ...plan.days };
  let changed = false;
  for (const weekday of employment.schedule.workDays) {
    const planned = days[weekday];
    if (!planned || planned.day.kind === 'free') continue;
    days[weekday] = { ...planned, day: { kind: 'free' } };
    changed = true;
  }
  return changed ? { ...plan, days } : plan;
}

/** Repair every plan slot in a save so stored state can never hold a hidden conflict. */
export function reconcileStateWithEmployment(state: GameState): void {
  if (!state.employment) return;
  state.weeklyPlan = reconcilePlanWithEmployment(state.weeklyPlan, state.employment);
  if (state.previousWeeklyPlan) state.previousWeeklyPlan = reconcilePlanWithEmployment(state.previousWeeklyPlan, state.employment);
}

/**
 * A week may keep repeating, but an entry that can no longer execute at all
 * (course already completed, cooldown still open, qualification lost, content
 * removed) has to be dropped instead of freezing the whole week behind a
 * validator error the player never asked for.
 */
/**
 * Codes that describe an entry which can never run: dropping the entry resolves
 * them, so a repeating week must not be frozen behind one of them.
 */
const CLEARABLE_ISSUE_CODES: readonly PlanIssueCode[] = [
  'UNKNOWN_ACTIVITY', 'UNKNOWN_ACTIVITY_OPTION', 'ACTIVITY_REQUIREMENTS', 'ACTIVITY_COOLDOWN', 'ACTIVITY_TOO_LONG',
  'UNKNOWN_COURSE', 'COURSE_REQUIREMENTS', 'COURSE_MAX_COMPLETIONS', 'COURSE_COOLDOWN', 'COURSE_CASH',
  'UNKNOWN_JOB', 'NOT_SIDE_JOB', 'SIDE_JOB_NOT_ACQUIRED', 'REGULAR_JOB_IN_PLAN', 'INVALID_DURATION',
];

/**
 * A week may keep repeating, but an entry that can never run (completed course,
 * cooldown still open, qualification lost, removed content) has to be dropped
 * instead of freezing the whole week behind a validator error. Structural
 * conflicts such as a multi-day overrun are left to the player, so the fallback
 * path still exists and still explains itself.
 */
export function reconcilePlanWithContent(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): { plan: WeeklyPlan; cleared: string[] } {
  let working = plan;
  const cleared: string[] = [];
  const context: PlanIssueContext = { content, balance, employment: state.employment, from: WEEK_START_FROM };
  for (const weekday of WEEKDAYS) {
    for (const slot of PLAN_SLOTS) {
      const activity = working.days[weekday]?.[slot];
      if (!activity || activity.kind === 'free' || activity.kind === 'study') continue;
      const issues = collectPlanIssues(working, state, context).filter((issue) => issue.weekday === weekday && issue.slot === slot);
      if (!issues.length || !issues.every((issue) => CLEARABLE_ISSUE_CODES.includes(issue.code))) continue;
      const prospective: WeeklyPlan = {
        ...working,
        days: { ...working.days, [weekday]: { ...working.days[weekday], [slot]: { kind: 'free' } } },
      };
      const remaining = collectPlanIssues(prospective, state, context);
      const resolved = issues.every((issue) => !remaining.some((candidate) => candidate.code === issue.code && candidate.weekday === issue.weekday && candidate.slot === issue.slot));
      if (!resolved) continue;
      working = prospective;
      cleared.push(`${weekdayLabel(weekday)}${slotLabel(slot)} · ${issues[0].message}`);
    }
  }
  return { plan: working, cleared };
}

export interface WorkWindow { startMinute: number; endMinute: number; durationMinutes: number }

export { employmentWorkWindow, studyGain };
