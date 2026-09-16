import type { ContentRegistry, GameEffect, GameState, GigOpportunityState, JobDefinition, PlannedActivity, PlanSlot, Weekday } from '../content/contracts';
import { getActivityDefinition } from './activities';
import { calendarForDay } from './calendar';
import { applyCareerExperience } from './careerProgression';
import { recordStateFinancialEntry } from './financialLedger';
import { addLifeRecord } from './lifeHistory';
import { DAY_START, EVENING_START, employmentActiveOn } from './planning';
import { longActivityAtMinute } from './schedule';
import { absoluteMinute } from './time';

/**
 * The zero-gig (一次性零工) work record.
 *
 * A gig is work the player actually takes. The card on the career page is only an
 * **opportunity**: `startedMinute` records the moment the player started the
 * shift (开工), and until it is set the world passing over the window works
 * nothing. Once it is set, the shift is in progress and the clock banks one
 * minute per minute it spends inside the window, up to the promised hours — so an
 * event, an Offer or 月结 pausing the clock mid-shift never throws the work away,
 * and a reload resumes the same shift.
 *
 * Two rules keep a minute from being paid twice:
 *
 * - only a started shift is credited, and the start itself goes through the same
 *   conflict rules the button does (`gigWorkConflict`), so a refused shift cannot
 *   be worked behind the player's back by time passing;
 * - a minute already occupied by the weekly plan or by the formal shift is never
 *   credited, whether the clash appeared before or after the shift started.
 *
 * Both entry paths write the window in **absolute** minutes
 * (`(day - 1) * 1440 + minuteOfDay`), so a window that crosses midnight is one
 * continuous range; legacy saves holding minute-of-day values are converted by
 * the store's migration.
 */

/** The promised length of a gig, in minutes. */
export function promisedGigMinuteCount(job: { hours: number }): number {
  return Math.max(1, Math.round(job.hours * 60));
}

/**
 * What a gig pays for the hours actually worked inside its window. Working less
 * than the promised shift pays proportionally; work that happened always pays at
 * least ¥1; a window that was never worked pays nothing.
 */
export function gigPayFor(gig: { pay: number }, workedMinutes: number, promisedMinutes: number): number {
  if (workedMinutes <= 0) return 0;
  return Math.max(1, Math.round(gig.pay * (workedMinutes / promisedMinutes)));
}

export function gigWorkedMinutes(gig: { workedMinutes?: number }): number {
  return Number.isFinite(gig.workedMinutes) ? Math.max(0, Math.round(Number(gig.workedMinutes))) : 0;
}

/**
 * Drops hours that no start record backs, keeping them as a backup.
 *
 * Saves written before 开工 existed banked hours under a passive credit, so such a
 * record carries `workedMinutes` with no `startedMinute`. Those hours are not
 * wages and must not become wages later: if the player clicks 开工 on such a
 * record, a rule that only checked `startedMinute` at payout time would settle the
 * old minutes too. The minutes are therefore moved out of `workedMinutes` — the
 * only field the accrual and the settlement read — into `unverifiedWorkedMinutes`,
 * which nothing pays out and which keeps the original value traceable.
 *
 * Returns whether the record changed.
 */
export function dropUnverifiedGigMinutes(gig: GigOpportunityState): boolean {
  const minutes = gigWorkedMinutes(gig);
  if (Number.isInteger(gig.startedMinute) || minutes <= 0) return false;
  const backup = Number.isFinite(gig.unverifiedWorkedMinutes) ? Math.max(0, Math.round(Number(gig.unverifiedWorkedMinutes))) : 0;
  gig.unverifiedWorkedMinutes = backup + minutes;
  gig.workedMinutes = 0;
  return true;
}

/** Whether the player has taken this shift, i.e. whether the clock may work it. */
export function gigIsWorking(gig: { startedMinute?: number }): boolean {
  return Number.isFinite(gig.startedMinute);
}

/** Minutes a planned entry occupies, or 0 when it has no runnable duration. */
export function plannedActivityMinutes(planned: PlannedActivity, content: ContentRegistry): number {
  switch (planned.kind) {
    case 'study':
    case 'side_job':
      return planned.durationMinutes;
    case 'course':
      return content.courses?.find((course) => course.id === planned.courseId)?.durationMinutes ?? 0;
    case 'activity': {
      const definition = content.activities?.find((activity) => activity.id === planned.activityId);
      const option = definition?.options.find((entry) => entry.id === planned.optionId);
      return option?.durationMinutes ?? 0;
    }
    default:
      return 0;
  }
}

/** Whether the formal shift covers this absolute minute. */
function shiftCoversMinute(state: GameState, minute: number): boolean {
  const employment = state.employment;
  if (!employment) return false;
  const day = Math.floor(minute / 1440) + 1;
  if (!employmentActiveOn(employment, day)) return false;
  if (!employment.schedule.workDays.includes(calendarForDay(day).weekday)) return false;
  const shiftFrom = (day - 1) * 1440 + employment.schedule.startMinute;
  const shiftTo = (day - 1) * 1440 + employment.schedule.endMinute;
  return minute >= shiftFrom && minute < shiftTo;
}

/** Whether a weekly-plan entry that can actually run covers this absolute minute. */
function planCoversMinute(state: GameState, content: ContentRegistry, minute: number): boolean {
  const day = Math.floor(minute / 1440) + 1;
  const slots = state.weeklyPlan.days[calendarForDay(day).weekday as Weekday];
  if (!slots) return false;
  for (const [slotName, planned] of Object.entries(slots) as [PlanSlot, PlannedActivity][]) {
    if (planned.kind === 'free') continue;
    const duration = plannedActivityMinutes(planned, content);
    if (duration <= 0) continue;
    const slotFrom = (day - 1) * 1440 + (slotName === 'day' ? DAY_START : EVENING_START);
    if (minute >= slotFrom && minute < slotFrom + duration) return true;
  }
  return false;
}

/** Whether a multi-day activity (still running, or planned) owns this minute. */
function longActivityCoversMinute(state: GameState, content: ContentRegistry, minute: number): boolean {
  return longActivityAtMinute(state, content, minute) !== undefined;
}

/** How a refused start names the multi-day activity standing in the way. */
function longActivityMessage(state: GameState, content: ContentRegistry, minute: number): string {
  const activity = longActivityAtMinute(state, content, minute);
  const name = (activity?.activityId ? getActivityDefinition(content, activity.activityId)?.name : undefined) ?? '其他活动';
  const running = state.longActivity?.activity;
  const underway = running !== undefined && absoluteMinute(running.start) <= minute && minute < absoluteMinute(running.end);
  return underway ? `这段时间还在${name}中，请先结束它再开工` : `这段时间已安排${name}，请先空出这段时间`;
}

/** Whether this minute is already spent on something other than this gig. */
export function gigMinuteIsOccupied(state: GameState, content: ContentRegistry, minute: number): boolean {
  return shiftCoversMinute(state, minute) || planCoversMinute(state, content, minute) || longActivityCoversMinute(state, content, minute);
}

/** The first minute of the window satisfying the predicate, or `undefined`. */
function firstMinuteIn(startMinute: number, endMinute: number, predicate: (minute: number) => boolean): number | undefined {
  for (let minute = Math.max(0, startMinute); minute < endMinute; minute += 1) if (predicate(minute)) return minute;
  return undefined;
}

/** Whether any minute of the window satisfies the predicate. */
function anyMinuteIn(startMinute: number, endMinute: number, predicate: (minute: number) => boolean): boolean {
  return firstMinuteIn(startMinute, endMinute, predicate) !== undefined;
}

/** The formal shift alone, which is all that is checked when a shift is taken on. */
export function gigShiftConflict(state: GameState, startMinute: number, endMinute: number): string | undefined {
  if (anyMinuteIn(startMinute, endMinute, (minute) => shiftCoversMinute(state, minute))) return '当前班次与零工时间冲突，请先安排其它时段';
  return undefined;
}

/**
 * The reason this shift cannot be started, or `undefined` when it can.
 *
 * The very same rule runs on the clock's credit step: only a shift that passed
 * here is ever in progress, and a shift already in progress is re-checked minute
 * by minute, so the button and the passing world can never disagree about
 * whether the player is working.
 */
export function gigWorkConflict(state: GameState, content: ContentRegistry, gigId: string, startMinute: number, endMinute: number): string | undefined {
  const taken = (state.gigs ?? []).find((gig) => gig.id !== gigId && gigIsWorking(gig) && gig.startMinute < endMinute && gig.endMinute > startMinute);
  if (taken) return '这段时间已经在做另一份零工，请先完成它';
  const shift = gigShiftConflict(state, startMinute, endMinute);
  if (shift) return shift;
  const planMinute = firstMinuteIn(startMinute, endMinute, (minute) => planCoversMinute(state, content, minute));
  if (planMinute !== undefined) return '本周计划与零工时间冲突，请先空出这段时间';
  // A multi-day activity is not in today's plan cells, so the plan check above
  // cannot see it: only the activity itself knows the player is still away.
  const awayMinute = firstMinuteIn(startMinute, endMinute, (minute) => longActivityCoversMinute(state, content, minute));
  if (awayMinute !== undefined) return longActivityMessage(state, content, awayMinute);
  return undefined;
}

/**
 * Settles one gig exactly once: the fee lands on the record, the work is removed
 * from the list, and the reason the shift ended is reported.
 */
export function settleGig(
  state: GameState,
  gig: GigOpportunityState,
  job: JobDefinition,
  worked: number,
  promised: number,
  reason: string,
  effects: GameEffect[],
): void {
  state.gigs = (state.gigs ?? []).filter((entry) => entry.id !== gig.id);
  // Hours with no start behind them never become wages, whichever path got here.
  // Clearing the field leaves exactly the payable amount, which is 0.
  const payable = dropUnverifiedGigMinutes(gig) ? 0 : worked;
  const pay = gigPayFor(gig, payable, promised);
  if (pay <= 0) {
    addLifeRecord(state, { id: `life.gig.missed.${gig.id}`, category: 'career', title: `错过${job.name}`, detail: '零工窗口内没有工作，未产生报酬', sourceId: job.id });
    effects.push({ type: 'message', text: `${job.name}：${reason}，未产生报酬` });
    return;
  }
  state.cash += pay;
  applyCareerExperience(state, job.experienceTags ?? [], job.careerXp);
  recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'side_job', amount: pay, label: `${job.name}结算`, sourceType: 'job', sourceId: job.id });
  addLifeRecord(state, { id: `life.gig.done.${gig.id}`, category: 'career', title: `完成${job.name}`, detail: `零工按实际工时结算 ${Math.round(payable / 6) / 10} 小时`, sourceId: job.id, amount: pay });
  state.monthlyHighlights = [...(state.monthlyHighlights ?? []), { id: `gig.completed.${gig.id}`, kind: 'gig_completed', day: state.time.day, label: `完成零工 · ${job.name}`, sourceId: job.id }];
  effects.push({ type: 'cash', amount: pay, reason: `${job.name}结算` });
  effects.push({ type: 'message', text: `${job.name}结算：已工作 ${Math.round(payable / 6) / 10} 小时，¥${pay.toLocaleString('zh-CN')} 已入账` });
}

/**
 * Books one minute per minute the clock actually spent working a **started**
 * shift, up to the hours it promised.
 *
 * A shift that is only offered is not worked by time passing at all, and a minute
 * the plan or the formal shift occupies is not work either — so the same hour can
 * never be settled twice, and a window the player never took pays nothing. The
 * credit is driven by the clock's own step, so an interruption keeps the hours
 * already banked and a resume continues from there.
 */
function creditGigsForElapsed(state: GameState, content: ContentRegistry, from: number, to: number): void {
  const working = (state.gigs ?? []).filter(gigIsWorking);
  if (!working.length || to <= from) return;
  const claimed = new Set<number>();
  for (const gig of working) {
    const job = content.jobs.find((entry) => entry.id === gig.jobId);
    if (!job) continue;
    const promised = promisedGigMinuteCount(job);
    let worked = gigWorkedMinutes(gig);
    const openedAt = Math.max(from, gig.startMinute, Number(gig.startedMinute));
    const closesAt = Math.min(to, gig.endMinute);
    for (let minute = openedAt; minute < closesAt && worked < promised; minute += 1) {
      if (claimed.has(minute) || gigMinuteIsOccupied(state, content, minute)) continue;
      claimed.add(minute);
      worked += 1;
    }
    if (worked !== gigWorkedMinutes(gig)) gig.workedMinutes = worked;
  }
}

/**
 * Settles every gig whose reserved window (or validity) has already ended,
 * paying the hours on its record. Called by the running clock and by the action
 * boundary, so a shift that ends exactly on a day/month gate is still paid.
 */
export function settleDueGigs(state: GameState, content: ContentRegistry, effects: GameEffect[], elapsed?: { from: number; to: number }): number {
  const gigs = state.gigs ?? [];
  if (!gigs.length) return 0;
  if (elapsed) creditGigsForElapsed(state, content, elapsed.from, elapsed.to);
  const now = absoluteMinute(state.time);
  const day = state.time.day;
  const due = gigs.filter((gig) => now >= gig.endMinute || day > gig.expiresDay);
  if (!due.length) return 0;
  for (const gig of due) {
    const job = content.jobs.find((entry) => entry.id === gig.jobId);
    if (!job) {
      state.gigs = (state.gigs ?? []).filter((entry) => entry.id !== gig.id);
      continue;
    }
    const promised = promisedGigMinuteCount(job);
    const worked = gigWorkedMinutes(gig);
    settleGig(state, gig, job, worked, promised, worked >= promised ? '工时已完成' : '窗口已经结束', effects);
  }
  return due.length;
}

/** How many of the gigs that just settled left their window completely unworked. */
function countMissedGigs(gigs: readonly GigOpportunityState[], content: ContentRegistry, now: number, day: number): number {
  return gigs.filter((gig) => {
    if (!content.jobs.some((job) => job.id === gig.jobId)) return false;
    if (now < gig.endMinute && day <= gig.expiresDay) return false;
    return gigWorkedMinutes(gig) === 0;
  }).length;
}

/**
 * Lifecycle cleanup for gig records that can no longer be worked. A window whose
 * hours were completed is settled first, so pruning never discards earned pay.
 * Returns the notice the player must see when an unworked window expired — the
 * caller reports it as a committed state change, not as an action error.
 */
export function pruneGigRecords(state: GameState, content: ContentRegistry, effects: GameEffect[]): { settled: number; notice?: string } {
  const before = state.gigs ?? [];
  const now = absoluteMinute(state.time);
  const day = state.time.day;
  // Hours with no start behind them are moved aside before anything is counted, so
  // a record the baseline credited passively counts as unworked rather than as work
  // that still owes a fee.
  for (const gig of before) dropUnverifiedGigMinutes(gig);
  const missed = countMissedGigs(before, content, now, day);
  const settled = settleDueGigs(state, content, effects);
  const settledIds = new Set(before.map((gig) => gig.id));
  const leftovers = (state.gigs ?? []).filter((gig) => settledIds.has(gig.id) && (now >= gig.endMinute || day > gig.expiresDay));
  if (leftovers.length) {
    const leftoverIds = new Set(leftovers.map((gig) => gig.id));
    state.gigs = (state.gigs ?? []).filter((gig) => !leftoverIds.has(gig.id));
  }
  const missedTotal = missed + leftovers.filter((gig) => gigWorkedMinutes(gig) === 0).length;
  return {
    settled: settled + leftovers.length,
    notice: missedTotal > 0 ? '这项零工的安排时间已经过去，需要重新申请' : undefined,
  };
}
