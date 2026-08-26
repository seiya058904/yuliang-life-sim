import { describe, expect, it } from 'vitest';
import type { ContentRegistry, EmploymentState, JobDefinition, WeeklyPlan } from '../content/contracts';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule, deriveActivityProgress, getDailyActivities, validateWeeklyPlan } from './schedule';

const job: JobDefinition = {
  id: 'job.test-regular', contentStatus: 'seed', name: '测试工作', description: '测试', tags: ['work'],
  kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 100, careerXp: 1, isLongTerm: true,
};
const sideJob: JobDefinition = { ...job, id: 'job.test-side', kind: 'temporary', employmentKind: 'gig', hours: 4, isLongTerm: false };
const content = { jobs: [job, sideJob], items: [], housing: [], businesses: [], assets: [], characters: [], events: [], eventChains: [], milestones: [], vocabulary: { capabilities: [], tags: ['work'] } } as unknown as ContentRegistry;
const employment: EmploymentState = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: 1 };
const travelContent = {
  ...content,
  activities: [{ id: 'activity.test-weekend', contentStatus: 'official', name: '测试周末旅行', description: '测试', tags: ['travel'], category: 'travel', options: [{ id: 'stay', label: '连续两天', durationMinutes: 2880, cashCost: 100 }] }],
} as unknown as ContentRegistry;

describe('weekly schedule', () => {
  it('keeps formal employment out of the editable plan while supporting timed study and side jobs', () => {
    const plan = createDefaultWeeklyPlan();
    plan.days[1].evening = { kind: 'study', durationMinutes: 120 };
    plan.days[6].day = { kind: 'side_job', jobId: sideJob.id, durationMinutes: 240 };

    expect(plan.days[1].day.kind).toBe('free');
    expect(plan.days[1].evening).toEqual({ kind: 'study', durationMinutes: 120 });
    expect(plan.days[6].day).toEqual({ kind: 'side_job', jobId: sideJob.id, durationMinutes: 240 });
    expect(validateWeeklyPlan(plan, employment, content)).toEqual([]);
  });

  it('rejects planned work that overlaps the automatic employment schedule', () => {
    const plan = createDefaultWeeklyPlan();
    plan.days[1].day = { kind: 'study', durationMinutes: 60 };
    expect(validateWeeklyPlan(plan, employment, content)).toContain('周一白天与正式工作排班冲突');
  });

  it('derives activity progress from time rather than persisting progress', () => {
    const activity = getDailyActivities(1, planFor({ kind: 'study', durationMinutes: 120 }), employment, content).find((entry) => entry.kind === 'study');
    expect(activity).toBeDefined();
    expect('progress' in (activity ?? {})).toBe(false);
    expect(deriveActivityProgress(activity!, { day: 1, hour: 20, minute: 0 })).toBe(0.5);
  });

  it('keeps a two-day activity active across midnight and restores free time after it ends', () => {
    const plan = createDefaultWeeklyPlan();
    plan.days[6].day = { kind: 'activity', activityId: 'activity.test-weekend', optionId: 'stay' };

    expect(validateWeeklyPlan(plan, undefined, travelContent)).toEqual([]);
    expect(activityAtTime({ day: 6, hour: 10, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 7, hour: 14, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 8, hour: 8, minute: 0 }, plan, undefined, travelContent).kind).toBe('activity');
    expect(activityAtTime({ day: 8, hour: 10, minute: 0 }, plan, undefined, travelContent).kind).toBe('free');
  });
});

function planFor(evening: WeeklyPlan['days'][1]['evening']): WeeklyPlan {
  const plan = createDefaultWeeklyPlan();
  plan.days[1].evening = evening;
  return plan;
}
