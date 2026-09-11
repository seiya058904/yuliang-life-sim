import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EmploymentState, GameState, JobDefinition, WeeklyPlan } from '../content/contracts';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule, deriveActivityProgress, getDailyActivities } from './schedule';
import { collectPlanIssues, planRunError } from './planning';
import { balanceConfig } from '../balance/config';

const job: JobDefinition = {
  id: 'job.test-regular', contentStatus: 'seed', name: '测试工作', description: '测试', tags: ['work'],
  kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 100, careerXp: 1, isLongTerm: true,
};
const sideJob: JobDefinition = { ...job, id: 'job.test-side', kind: 'temporary', employmentKind: 'gig', hours: 4, isLongTerm: false };
const content = { jobs: [job, sideJob], items: [], housing: [], businesses: [], assets: [], characters: [], events: [], eventChains: [], milestones: [], vocabulary: { capabilities: [], tags: ['work'] } } as unknown as ContentRegistry;
const employment: EmploymentState = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: 1 };
const travelContent = {
  ...content,
  activities: [{ id: 'activity.test-weekend', contentStatus: 'official', name: '测试周末旅行', description: '测试', tags: ['travel'], category: 'travel', options: [{ id: 'stay', label: '连续两天', durationMinutes: 2880, cashCost: 100 }, { id: 'three-days', label: '连续三天', durationMinutes: 4320, cashCost: 200 }, { id: 'five-days', label: '连续五天', durationMinutes: 7200, cashCost: 400 }] }],
} as unknown as ContentRegistry;

describe('weekly schedule', () => {
  it('keeps formal employment out of the editable plan while supporting timed study and side jobs', () => {
    const plan = clearWeekPlan();
    plan.days[1].evening = { kind: 'study', durationMinutes: 120 };
    plan.days[6].day = { kind: 'side_job', jobId: sideJob.id, durationMinutes: 240 };

    expect(plan.days[1].day.kind).toBe('free');
    expect(plan.days[1].evening).toEqual({ kind: 'study', durationMinutes: 120 });
    expect(plan.days[6].day).toEqual({ kind: 'side_job', jobId: sideJob.id, durationMinutes: 240 });
    expect(planRunError(stateFor(plan, employment, content), plan, content, balanceConfig)).toBeUndefined();
  });

  it('rejects planned work that overlaps the automatic employment schedule', () => {
    const plan = clearWeekPlan();
    plan.days[1].day = { kind: 'study', durationMinutes: 60 };
    expect(planRunError(stateFor(plan, employment, content), plan, content, balanceConfig)).toBe('周一白天与正式工作排班冲突');
  });

  it('derives activity progress from time rather than persisting progress', () => {
    const activity = getDailyActivities(1, planFor({ kind: 'study', durationMinutes: 120 }), employment, content).find((entry) => entry.kind === 'study');
    expect(activity).toBeDefined();
    expect('progress' in (activity ?? {})).toBe(false);
    expect(deriveActivityProgress(activity!, { day: 1, hour: 20, minute: 0 })).toBe(0.5);
  });

  it('keeps a two-day activity active across midnight and restores free time after it ends', () => {
    const plan = clearWeekPlan();
    plan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'stay' };

    expect(planRunError(stateFor(plan, undefined, travelContent), plan, travelContent, balanceConfig)).toBeUndefined();
    expect(activityAtTime({ day: 6, hour: 10, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 7, hour: 14, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 8, hour: 8, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 8, hour: 10, minute: 0 }, plan, undefined, travelContent).kind).toBe('free');
  });

  it('reports the plan conflict and the work-schedule conflict of a multi-day activity', () => {
    const plan = clearWeekPlan();
    plan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'stay' };
    plan.days[7].evening = { kind: 'study', durationMinutes: 120 };
    const weekendEmployment = { ...employment, schedule: { workDays: [7] as const, startMinute: 9 * 60, endMinute: 17 * 60 } };
    const issues = collectPlanIssues(plan, stateFor(plan, weekendEmployment, travelContent), { content: travelContent, balance: balanceConfig, employment: weekendEmployment });
    expect(issues.map((issue) => issue.message)).toEqual([
      '周六多日活动与周日计划冲突',
      '周六多日活动与周日正式工作排班冲突',
    ]);
    expect(issues.every((issue) => issue.code === 'MULTI_DAY_CONFLICT')).toBe(true);

    const workPlan = clearWeekPlan();
    workPlan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'stay' };
    const workIssues = collectPlanIssues(workPlan, stateFor(workPlan, weekendEmployment, travelContent), { content: travelContent, balance: balanceConfig, employment: weekendEmployment });
    expect(workIssues.map((issue) => issue.message)).toEqual(['周六多日活动与周日正式工作排班冲突']);
  });
  it('keeps three-day and five-day activities active until their exact end time', () => {
    const threeDayPlan = clearWeekPlan();
    threeDayPlan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'three-days' };
    expect(planRunError(stateFor(threeDayPlan, undefined, travelContent), threeDayPlan, travelContent, balanceConfig)).toBeUndefined();
    expect(activityAtTime({ day: 8, hour: 23, minute: 0 }, threeDayPlan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 9, hour: 8, minute: 59 }, threeDayPlan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 9, hour: 9, minute: 0 }, threeDayPlan, undefined, travelContent).kind).toBe('free');

    const fiveDayPlan = clearWeekPlan();
    fiveDayPlan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'five-days' };
    expect(planRunError(stateFor(fiveDayPlan, undefined, travelContent), fiveDayPlan, travelContent, balanceConfig)).toBeUndefined();
    expect(activityAtTime({ day: 10, hour: 23, minute: 0 }, fiveDayPlan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 11, hour: 9, minute: 0 }, fiveDayPlan, undefined, travelContent).kind).toBe('free');
  });
});

function clearWeekPlan(): WeeklyPlan {
  const plan = createDefaultWeeklyPlan();
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) plan.days[weekday] = { day: { kind: 'free' }, evening: { kind: 'free' } };
  return plan;
}

function stateFor(plan: WeeklyPlan, employment: EmploymentState | undefined, _content: ContentRegistry, options: { sideJob?: boolean } = {}): GameState {
  return {
    time: { day: 1, hour: 8, minute: 0 },
    calendar: { year: 1, month: 1, week: 1, weekday: 1, weekOfMonth: 1 },
    weeklyPlan: plan,
    employment,
    modifiers: [],
    lifeHistory: [],
    courseProgress: {},
    acquiredSideJobs: options.sideJob === false ? {} : { [sideJob.id]: { jobId: sideJob.id, acquiredDay: 1 } },
  } as unknown as GameState;
}

function planFor(evening: WeeklyPlan['days'][1]['evening']): WeeklyPlan {
  const plan = createDefaultWeeklyPlan();
  plan.days[1].evening = evening;
  return plan;
}
