import type {
  ActivityState, ContentRegistry, EmploymentState, GameState, JobDefinition, PlannedActivity, Weekday, WeeklyPlan,
} from '../content/contracts';
import { calendarForDay } from './calendar';
import { employmentWorkWindow } from './effects';
import { absoluteMinute, type GameTime } from './time';
import { getActivityDefinition, getActivityOption } from './activities';

/** The slice of game state the schedule projection needs (permanent modifiers). */
export type ScheduleModifierSource = Pick<GameState, 'modifiers'>;

const DAY_START = 9 * 60;
const DAY_END = 17 * 60;
const EVENING_START = 19 * 60;
const EVENING_END = 23 * 60;
const LONG_ACTIVITY_MIN_DURATION = 2880;
const MINUTES_PER_DAY = 24 * 60;

export function createDefaultWeeklyPlan(): WeeklyPlan {
  const days = {} as WeeklyPlan['days'];
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    days[weekday] = {
      day: { kind: 'free' },
      evening: weekday === 1 || weekday === 2 || weekday === 4 ? { kind: 'study', durationMinutes: 120 } : { kind: 'free' },
    };
  }
  return { days, autoRepeat: true };
}

export function defaultJobSchedule(job: JobDefinition): EmploymentState['schedule'] {
  if (job.schedule) return { workDays: [...job.schedule.workDays], startMinute: job.schedule.startMinute, endMinute: job.schedule.endMinute };
  const startMinute = DAY_START;
  return { workDays: [1, 2, 3, 4, 5], startMinute, endMinute: startMinute + job.hours * 60 };
}

export function getDailyActivities(day: number, plan: WeeklyPlan, employment: EmploymentState | undefined, content: ContentRegistry, state: ScheduleModifierSource = { modifiers: [] }): ActivityState[] {
  const weekday = calendarForDay(day).weekday;
  const activities: ActivityState[] = [
    activity(day, 0, 7 * 60, 'sleep'),
    activity(day, 7 * 60, DAY_START, 'life'),
    activity(day, DAY_START, DAY_END, 'free'),
    activity(day, DAY_END, EVENING_START, 'life'),
    activity(day, EVENING_START, EVENING_END, 'free'),
    activity(day, EVENING_END, 24 * 60, 'sleep'),
  ];
  const schedule = employment && employment.effectiveWeek <= calendarForDay(day).week ? employment.schedule : undefined;
  if (schedule?.workDays.includes(weekday)) {
    const job = content.jobs.find((entry) => entry.id === employment?.jobId);
    if (job) {
      const window = employmentWorkWindow(state as GameState, schedule);
      replaceRange(activities, window.startMinute, window.endMinute, activity(day, window.startMinute, window.endMinute, 'work', job.id));
    }
  }
  const dayPlan = plan.days[weekday]?.day;
  if (dayPlan && dayPlan.kind !== 'free' && !schedule?.workDays.includes(weekday)) replaceRange(activities, DAY_START, DAY_START + durationOf(dayPlan, content), plannedActivity(day, DAY_START, dayPlan, content));
  const eveningPlan = plan.days[weekday]?.evening;
  if (eveningPlan && eveningPlan.kind !== 'free') replaceRange(activities, EVENING_START, EVENING_START + durationOf(eveningPlan, content), plannedActivity(day, EVENING_START, eveningPlan, content));
  const longActivity = findLongActivity(day, plan, content);
  if (longActivity) return overlayLongActivity(activities, longActivity);
  return activities.sort((left, right) => absoluteMinute(left.start) - absoluteMinute(right.start));
}

export function deriveActivityProgress(activity: ActivityState, time: GameTime): number {
  const total = absoluteMinute(activity.end) - absoluteMinute(activity.start);
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (absoluteMinute(time) - absoluteMinute(activity.start)) / total));
}

export function activityAtTime(time: GameTime, plan: WeeklyPlan, employment: EmploymentState | undefined, content: ContentRegistry, state: ScheduleModifierSource = { modifiers: [] }): ActivityState {
  const activities = getDailyActivities(time.day, plan, employment, content, state);
  const minute = absoluteMinute(time);
  return activities.find((entry) => absoluteMinute(entry.start) <= minute && minute < absoluteMinute(entry.end)) ?? activities[activities.length - 1];
}

function durationOf(activity: PlannedActivity, content: ContentRegistry): number {
  if (activity.kind === 'free') return 0;
  if (activity.kind === 'activity') return getActivityOption(getActivityDefinition(content, activity.activityId)!, activity.optionId)?.durationMinutes ?? 0;
  if (activity.kind === 'course') return content.courses?.find((course) => course.id === activity.courseId)?.durationMinutes ?? 0;
  return activity.durationMinutes;
}

function plannedActivity(day: number, startMinute: number, planned: Exclude<PlannedActivity, { kind: 'free' }>, content: ContentRegistry): ActivityState {
  const duration = durationOf(planned, content);
  return {
    ...activity(day, startMinute, startMinute + duration, planned.kind === 'activity' ? 'activity' : planned.kind, planned.kind === 'side_job' ? planned.jobId : undefined),
    ...(planned.kind === 'activity' ? { activityId: planned.activityId, optionId: planned.optionId } : {}),
    ...(planned.kind === 'course' ? { courseId: planned.courseId } : {}),
  };
}

function findLongActivity(day: number, plan: WeeklyPlan, content: ContentRegistry): ActivityState | undefined {
  const targetStart = absoluteMinute({ day, hour: 0, minute: 0 });
  const targetEnd = targetStart + MINUTES_PER_DAY;
  const targetWeek = calendarForDay(day).week;
  for (const week of [targetWeek - 1, targetWeek]) {
    if (week < 1) continue;
    const weekStartDay = (week - 1) * 7 + 1;
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
      const planned = plan.days[weekday]?.day;
      if (!planned || planned.kind !== 'activity') continue;
      const definition = getActivityDefinition(content, planned.activityId);
      const option = definition && getActivityOption(definition, planned.optionId);
      if (!option || option.durationMinutes < LONG_ACTIVITY_MIN_DURATION) continue;
      const candidate = plannedActivity(weekStartDay + weekday - 1, DAY_START, planned, content);
      if (absoluteMinute(candidate.start) < targetEnd && absoluteMinute(candidate.end) > targetStart) return candidate;
    }
  }
  return undefined;
}

function overlayLongActivity(activities: ActivityState[], longActivity: ActivityState): ActivityState[] {
  const longStart = absoluteMinute(longActivity.start);
  const longEnd = absoluteMinute(longActivity.end);
  const preserved = activities.flatMap((current) => {
    const currentStart = absoluteMinute(current.start);
    const currentEnd = absoluteMinute(current.end);
    if (currentEnd <= longStart || currentStart >= longEnd) return [current];
    const fragments: ActivityState[] = [];
    if (currentStart < longStart) fragments.push({ ...current, start: timeFromAbsolute(currentStart), end: timeFromAbsolute(Math.min(currentEnd, longStart)) });
    if (currentEnd > longEnd) fragments.push({ ...current, start: timeFromAbsolute(Math.max(currentStart, longEnd)), end: timeFromAbsolute(currentEnd) });
    return fragments;
  });
  preserved.push(longActivity);
  return preserved.sort((left, right) => absoluteMinute(left.start) - absoluteMinute(right.start));
}

function activity(day: number, startMinute: number, endMinute: number, kind: ActivityState['kind'], jobId?: string): ActivityState {
  return { kind, start: timeAt(day, startMinute), end: timeAt(day, endMinute), ...(jobId ? { jobId } : {}) };
}

function timeAt(day: number, minuteOfDay: number): GameTime {
  if (minuteOfDay >= 24 * 60) return { day: day + Math.floor(minuteOfDay / (24 * 60)), hour: Math.floor((minuteOfDay % (24 * 60)) / 60), minute: minuteOfDay % 60 };
  return { day, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 };
}

function timeFromAbsolute(minutes: number): GameTime {
  const day = Math.floor(minutes / MINUTES_PER_DAY) + 1;
  return timeAt(day, minutes % MINUTES_PER_DAY);
}

function replaceRange(activities: ActivityState[], startMinute: number, endMinute: number, replacement: ActivityState): void {
  const result: ActivityState[] = [];
  for (const current of activities) {
    const currentStart = current.start.hour * 60 + current.start.minute;
    const currentEnd = current.end.hour * 60 + current.end.minute;
    if (currentEnd <= startMinute || currentStart >= endMinute) {
      result.push(current);
      continue;
    }
    if (currentStart < startMinute) result.push(activity(current.start.day, currentStart, startMinute, current.kind, current.jobId));
    if (currentEnd > endMinute) result.push(activity(current.start.day, endMinute, currentEnd, current.kind, current.jobId));
  }
  result.push(replacement);
  activities.splice(0, activities.length, ...result);
}
