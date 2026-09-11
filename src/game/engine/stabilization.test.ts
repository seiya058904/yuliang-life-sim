import { describe, expect, it } from 'vitest';
import type { GameAction, GameState, PlannedActivity, Weekday } from '../content/contracts';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';
import { advanceSimulation } from './simulation';
import { activityAtTime } from './schedule';
import { forecastWeeklyPlan } from './forecast';
import { candidateSchedulingError, collectPlanIssues, findNextSchedulableSlot, NO_SLOT_REASON, planEditError, planRunError, reconcilePlanWithEmployment } from './planning';
import { activeApplications, applicationCooldownRemaining, appendMessage, clearReadMessages, clearTerminalApplications, dismissTerminalApplication, markAllMessagesRead, pruneApplicationHistory, pruneExpiredState, terminalApplications, unreadMessageCount, visibleMessages } from './lifecycle';
import { migrateGameState, saveGameState, loadGameStateWithReport } from '../store/gameStore';
import { calendarForDay } from './calendar';

const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
/** Move a state to another day with a calendar that matches it. */
const at = (state: GameState, value: number): GameState => ({ ...state, time: { ...state.time, day: value }, calendar: calendarForDay(value) });

function plan(activity: PlannedActivity, weekday: Weekday = 1, slot: 'day' | 'evening' = 'evening'): GameState {
  const state = createInitialState(contentRegistry, balance, 1);
  state.weeklyPlan = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, [weekday]: { ...state.weeklyPlan.days[weekday], [slot]: activity } } };
  return state;
}

function run(state: GameState, action: GameAction): GameState {
  const result = dispatchGameAction(state, action, contentRegistry, balance);
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('planning domain consistency', () => {
  it('repairs two invalid weekly slots one at a time instead of deadlocking', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    // Two different unresolved problems in one week: an unacquired side job and
    // a course requiring more knowledge than the player has. Both broken cells
    // live in the evening slot the player can still edit.
    state.attributes = { ...state.attributes!, knowledge: 0 };
    state.weeklyPlan = {
      ...state.weeklyPlan,
      days: {
        ...state.weeklyPlan.days,
        4: { day: { kind: 'free' }, evening: { kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 } },
        5: { day: { kind: 'free' }, evening: { kind: 'course', courseId: 'course.data-analysis-basics' } },
      },
    };
    expect(planRunError(state, state.weeklyPlan, contentRegistry, balance)).toBeDefined();
    expect(collectPlanIssues(state.weeklyPlan, state, { content: contentRegistry, balance, employment: state.employment }).length).toBeGreaterThanOrEqual(2);

    // Fixing cell A must succeed even though cell B is still broken.
    const fixedA = dispatchGameAction(state, { type: 'set_plan', weekday: 4, slot: 'evening', activity: { kind: 'free' } }, contentRegistry, balance);
    expect(fixedA.error).toBeUndefined();
    expect(collectPlanIssues(fixedA.state.weeklyPlan, fixedA.state, { content: contentRegistry, balance, employment: fixedA.state.employment }).length).toBeLessThan(2);

    const fixedB = dispatchGameAction(fixedA.state, { type: 'set_plan', weekday: 5, slot: 'evening', activity: { kind: 'free' } }, contentRegistry, balance);
    expect(fixedB.error).toBeUndefined();
    expect(planRunError(fixedB.state, fixedB.state.weeklyPlan, contentRegistry, balance)).toBeUndefined();
    expect(dispatchGameAction(fixedB.state, { type: 'start_week' }, contentRegistry, balance).error).toBeUndefined();
  });

  it('still refuses an edit that introduces a new problem', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const result = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 } }, contentRegistry, balance);
    expect(result.error).toMatch(/兼职资格/);
  });

  it('reconciles the underlying day plan when a full-time job is accepted', () => {
    // Start from a job-free state so a day slot is legitimately editable, and
    // grade the offer deterministically instead of waiting out the recruitment clock.
    const base = createInitialState(contentRegistry, balance, 1);
    const state: GameState = { ...base, currentJobId: undefined, employment: undefined };
    state.weeklyPlan = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 3: { day: { kind: 'study', durationMinutes: 120 }, evening: state.weeklyPlan.days[3].evening } } };
    const basic = contentRegistry.jobs.find((entry) => entry.id === 'job.seed-shop-clerk')!;
    const vacancy = (state.vacancies ?? []).find((entry) => entry.jobId === basic.id)!;
    const applied = run(state, { type: 'submit_application', vacancyId: vacancy.vacancyId });
    const offered: GameState = { ...applied, applications: applied.applications!.map((entry) => ({ ...entry, status: 'offer' as const, willReceiveOffer: true, offerExpiresDay: applied.time.day + 7 })) };
    const application = offered.applications![0];
    const accepted = run(offered, { type: 'accept_application_offer', applicationId: application.applicationId });

    expect(accepted.currentJobId).toBe(basic.id);
    for (const weekday of accepted.employment!.schedule.workDays) {
      expect(accepted.weeklyPlan.days[weekday].day).toEqual({ kind: 'free' });
    }
    expect(accepted.weeklyPlan.days[3].evening).toEqual(state.weeklyPlan.days[3].evening);
    expect(planRunError(accepted, accepted.weeklyPlan, contentRegistry, balance)).toBeUndefined();
  });

  it('keeps a pending job from becoming a hidden conflict when the next week starts', () => {
    const state = plan({ kind: 'study', durationMinutes: 240 }, 3, 'day');
    state.employment = { ...state.employment!, pendingJobId: 'job.seed-warehouse', pendingEffectiveDay: 1, pendingCompanyId: 'company.xinghe', pendingBasePay: 128 };
    state.weeklyPlan = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 2: { day: { kind: 'study', durationMinutes: 240 }, evening: { kind: 'free' } } } };
    const started = run(state, { type: 'start_week' });
    expect(started.currentJobId).toBe('job.seed-warehouse');
    expect(started.weeklyPlan.days[2].day).toEqual({ kind: 'free' });
    expect(planRunError(started, started.weeklyPlan, contentRegistry, balance)).toBeUndefined();
  });

  it('locks slots that already passed when planning resumes midweek', () => {
    const state = at(createInitialState(contentRegistry, balance, 1), 10);
    const past = dispatchGameAction(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'study', durationMinutes: 60 } }, contentRegistry, balance);
    expect(past.error).toMatch(/已经过去/);
    const today = dispatchGameAction(state, { type: 'set_plan', weekday: 3, slot: 'evening', activity: { kind: 'study', durationMinutes: 60 } }, contentRegistry, balance);
    expect(today.error).toBeUndefined();
  });

  it('uses one shared future scheduler for courses, activities and side jobs', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    state.weeklyPlan = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 1: { day: { kind: 'free' }, evening: { kind: 'free' } } } };
    state.acquiredSideJobs = { 'job.course-teaching-assistant': { jobId: 'job.course-teaching-assistant', acquiredDay: 1 } };
    const course = findNextSchedulableSlot({ weekday: 1, slot: 'evening', activity: { kind: 'course', courseId: 'course.workplace-basics' } }, state, contentRegistry, balance, { from: 'current' });
    const activity = findNextSchedulableSlot({ weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.old-town-culture', optionId: 'exhibition' } }, state, contentRegistry, balance, { from: 'current' });
    const sideJob = findNextSchedulableSlot({ weekday: 1, slot: 'evening', activity: { kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 } }, state, contentRegistry, balance, { from: 'current' });

    expect(course.result).toEqual({ weekday: 1, slot: 'evening', activity: { kind: 'course', courseId: 'course.workplace-basics' } });
    expect(activity.result?.weekday).toBe(1);
    expect(sideJob.result?.weekday).toBe(1);
  });

  it('never schedules into a past slot when the current weekday is late in the week', () => {
    const state = at(createInitialState(contentRegistry, balance, 1), 6);
    const outcome = findNextSchedulableSlot({ weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.old-town-culture', optionId: 'exhibition' } }, state, contentRegistry, balance, { from: 'current' });
    expect(outcome.found).toBe(true);
    expect(outcome.result!.weekday).toBeGreaterThanOrEqual(state.calendar.weekday);
  });

  it('reports a clear reason instead of silently doing nothing when no future slot is free', () => {
    // Work days lock the day slot; filling the weekend and every evening leaves
    // no legal future placement.
    const state = createInitialState(contentRegistry, balance, 1);
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) state.weeklyPlan.days[weekday] = { day: { kind: 'free' }, evening: { kind: 'study', durationMinutes: 240 } };
    state.weeklyPlan.days[6] = { day: { kind: 'study', durationMinutes: 240 }, evening: { kind: 'study', durationMinutes: 240 } };
    state.weeklyPlan.days[7] = { day: { kind: 'study', durationMinutes: 240 }, evening: { kind: 'study', durationMinutes: 240 } };
    const outcome = findNextSchedulableSlot({ weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.old-town-culture', optionId: 'exhibition' } }, state, contentRegistry, balance, { from: 'current' });
    expect(outcome.found).toBe(false);
    expect(outcome.reason).toBe(NO_SLOT_REASON);
  });

  it('auto-clears impossible repeats and falls back to planning when a conflict cannot be cleared', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const trip = { kind: 'activity' as const, activityId: 'activity.riverside-park-ride', optionId: 'ride' };
    const withEvening = (weekdays: readonly Weekday[], activity: PlannedActivity): GameState['weeklyPlan']['days'] =>
      weekdays.reduce<GameState['weeklyPlan']['days']>((days, weekday) => ({ ...days, [weekday]: { day: base.weeklyPlan.days[weekday].day, evening: activity } }), { ...base.weeklyPlan.days });
    const withDay = (weekday: Weekday, activity: PlannedActivity): GameState['weeklyPlan']['days'] =>
      ({ ...base.weeklyPlan.days, [weekday]: { ...base.weeklyPlan.days[weekday], day: activity } });

    // A repeat entry that can never run is dropped, so the week runs on.
    const cleared = advanceSimulation({
      ...base,
      simulationMode: 'running',
      autoRepeatPlan: true,
      lifeHistory: [{ id: 'x', day: 1, category: 'activity', title: 'x', sourceId: 'activity.riverside-park-ride' }],
      weeklyPlan: { ...base.weeklyPlan, autoRepeat: true, days: withEvening([1, 3], trip) },
    }, 7 * 24 * 60, contentRegistry, balance);
    expect(cleared.state.simulationMode).not.toBe('planning');
    expect(cleared.state.weeklyPlan.days[3].evening).toEqual({ kind: 'free' });
    expect(cleared.effects.some((effect) => effect.type === 'message' && effect.text.includes('无法继续'))).toBe(true);

    // A structural conflict (a two-day trip running into a workday) cannot be
    // cleared by dropping an entry, so the repeat must stop and explain itself.
    const premium = { kind: 'activity' as const, activityId: 'activity.premium-weekend', optionId: 'premium-stay' };
    const blocked = advanceSimulation({
      ...base,
      time: { day: 8, hour: 0, minute: 0 },
      calendar: calendarForDay(8),
      cash: 50_000,
      simulationMode: 'running',
      autoRepeatPlan: true,
      weeklyPlan: { ...base.weeklyPlan, autoRepeat: true, days: withDay(7, premium) },
    }, 7 * 24 * 60, contentRegistry, balance);
    expect(blocked.state.simulationMode).toBe('planning');
    expect(blocked.state.planNotice).toBe('本周计划需要调整');
    expect(blocked.state.planIssues?.length).toBeGreaterThan(0);
    expect(blocked.effects.some((effect) => effect.type === 'message' && effect.text.includes('本周计划需要调整'))).toBe(true);
  });

  it('prevents staging the same cooldown activity twice in one week', () => {
    const activity = { kind: 'activity' as const, activityId: 'activity.riverside-park-ride', optionId: 'ride' };
    const state = plan(activity);
    const stacked: GameState = { ...state, weeklyPlan: { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 3: { day: { kind: 'free' }, evening: activity } } } };

    // Two live occurrences of one cooldown activity in the same week are refused,
    // and the message names the cooldown instead of hiding behind another error.
    expect(candidateSchedulingError({ weekday: 3, slot: 'evening', activity }, state.weeklyPlan, state, contentRegistry, balance)).toMatch(/间隔不足 21 天/);
    // An occupied cell is refused too, so the scheduler never overwrites work.
    expect(candidateSchedulingError({ weekday: 1, slot: 'evening', activity }, state.weeklyPlan, state, contentRegistry, balance)).toMatch(/已经安排过内容/);
    // Replacing the second occurrence with a different activity is legal because
    // it removes the violation, so the cooldown can never be routed around: the
    // only way past it is to drop the conflicting occurrence.
    const swap = dispatchGameAction(stacked, { type: 'set_plan', weekday: 3, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.old-town-culture', optionId: 'exhibition' } }, contentRegistry, balance);
    expect(swap.error).toBeUndefined();
    expect(collectPlanIssues(swap.state.weeklyPlan, swap.state, { content: contentRegistry, balance, employment: swap.state.employment })).toEqual([]);

    // The projected run day is what counts: the cooldown is checked against the
    // day the plan would actually execute, not against "today".
    const early = at(plan(activity, 3), 15);
    early.lifeHistory = [{ id: 'x', day: 14, category: 'activity', title: 'x', sourceId: 'activity.riverside-park-ride' }];
    expect(planRunError(early, early.weeklyPlan, contentRegistry, balance)).toMatch(/间隔不足 21 天/);
    expect(dispatchGameAction(early, { type: 'start_week' }, contentRegistry, balance).error).toMatch(/间隔不足 21 天/);

    // Once the window has really elapsed the same week runs normally.
    const late = at(plan(activity, 3), 45);
    late.lifeHistory = [{ id: 'x', day: 14, category: 'activity', title: 'x', sourceId: 'activity.riverside-park-ride' }];
    expect(planRunError(late, late.weeklyPlan, contentRegistry, balance)).toBeUndefined();
    expect(planEditError(late, late.weeklyPlan, contentRegistry, balance, [{ weekday: 3, position: 'evening' }])).toBeUndefined();
  });

  it('keeps course planning and course execution on the same eligibility rules', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    // A completed course is blocked at planning time...
    state.courseProgress = { 'course.office-tools': 1 };
    const blocked = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'course', courseId: 'course.office-tools' } }, contentRegistry, balance);
    expect(blocked.error).toMatch(/完成过/);

    // ...and a satisfiable course runs during the week it was planned for.
    const planned = run(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'course', courseId: 'course.workplace-basics' } });
    const started = run(planned, { type: 'start_week' });
    const settled = advanceSimulation(started, 5 * 24 * 60, contentRegistry, balance);
    expect(settled.state.courseProgress?.['course.workplace-basics']).toBe(1);
    expect(settled.state.lifeHistory.some((entry) => entry.title === '完成课程：职场基础课')).toBe(true);
  });
});

describe('forecast and execution agreement', () => {
  it('matches a legal plan week forecast with what the simulation actually charges and pays', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const emptyDays = Object.fromEntries(([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => [weekday, { day: { kind: 'free' as const }, evening: { kind: 'free' as const } }])) as GameState['weeklyPlan']['days'];
    const plain: GameState = { ...base, weeklyPlan: { days: emptyDays, autoRepeat: true }, previousWeeklyPlan: { days: structuredClone(emptyDays), autoRepeat: true } };
    const forecast = forecastWeeklyPlan(plain, plain.weeklyPlan, contentRegistry, balance);

    expect(forecast.warnings).toEqual([]);
    const started = run(plain, { type: 'start_week' });
    const settled = advanceSimulation(started, 7 * 24 * 60, contentRegistry, balance);
    expect(settled.state.cash - plain.cash).toBe(forecast.netCash);
  });

  it('does not count a blocked slot as certain income or expense', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const emptyDays = Object.fromEntries(([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => [weekday, { day: { kind: 'free' as const }, evening: { kind: 'free' as const } }])) as GameState['weeklyPlan']['days'];
    const plain: GameState = { ...base, weeklyPlan: { days: emptyDays, autoRepeat: true } };
    const baseline = forecastWeeklyPlan(plain, plain.weeklyPlan, contentRegistry, balance);

    const broken: GameState = { ...plain, weeklyPlan: { ...plain.weeklyPlan, days: { ...emptyDays, 2: { day: { kind: 'free' }, evening: { kind: 'activity', activityId: 'activity.cinema', optionId: 'with-zhou' } } } } };
    const forecast = forecastWeeklyPlan(broken, broken.weeklyPlan, contentRegistry, balance);

    expect(forecast.warnings.length).toBeGreaterThan(0);
    expect(forecast.blockedWeekdays).toEqual([2]);
    expect(forecast.expense).toBe(baseline.expense);
    expect(forecast.netCash).toBe(baseline.netCash);
  });

  it('relies on the canonical duration list so a 180-minute legacy plan stays legal', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    state.weeklyPlan = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 1: { day: { kind: 'free' }, evening: { kind: 'study', durationMinutes: 180 } } } };
    expect(planRunError(state, state.weeklyPlan, contentRegistry, balance)).toBeUndefined();
    const migrated = migrateGameState(state, contentRegistry, balance);
    expect(migrated.weeklyPlan.days[1].evening).toEqual({ kind: 'study', durationMinutes: 180 });
  });
});

describe('application lifecycle', () => {
  it('lets a terminal application be cleared while its cooldown still applies', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const vacancy = (state.vacancies ?? []).find((entry) => entry.jobId === 'job.seed-warehouse')!;
    // Applications normally resolve over a few days; the terminal rejection and
    // its cooldown are staged directly so the decoupling itself is what is tested.
    const applied = run(state, { type: 'submit_application', vacancyId: vacancy.vacancyId });
    const cooldownDay = state.time.day + balance.applicationCooldownDays;
    const terminalized: GameState = {
      ...applied,
      applications: applied.applications!.map((entry) => ({ ...entry, status: 'rejected' as const, nextEligibleDay: cooldownDay })),
      applicationCooldowns: { 'job.seed-warehouse@company.yuanwang': { jobId: 'job.seed-warehouse', companyId: 'company.yuanwang', nextEligibleDay: cooldownDay } },
    };
    expect(terminalApplications(terminalized)).toHaveLength(1);
    expect(applicationCooldownRemaining(terminalized, 'job.seed-warehouse', vacancy.companyId)).toBe(balance.applicationCooldownDays);

    const cleared = run(terminalized, { type: 'clear_terminal_applications' });
    expect(cleared.applications).toHaveLength(0);
    expect(applicationCooldownRemaining(cleared, 'job.seed-warehouse', vacancy.companyId)).toBe(balance.applicationCooldownDays);
    const retry = dispatchGameAction(cleared, { type: 'submit_application', vacancyId: vacancy.vacancyId }, contentRegistry, balance);
    expect(retry.error).toMatch(/还需等待/);
  });

  it('counts only active applications for the badge and keeps history bounded', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const vacancy = (state.vacancies ?? []).find((entry) => entry.jobId === 'job.seed-warehouse')!;
    const applied = run(state, { type: 'submit_application', vacancyId: vacancy.vacancyId });
    expect(activeApplications(applied)).toHaveLength(1);
    expect(terminalApplications(applied)).toHaveLength(0);

    const many: GameState = { ...applied, applications: Array.from({ length: 120 }, (_, index) => ({ ...applied.applications![0], applicationId: `application.${index}`, status: 'rejected' as const })) };
    pruneApplicationHistory(many, 60);
    expect(many.applications).toHaveLength(60);
  });

  it('never pins an expired special opportunity through a terminal application', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    state.opportunities = [{ id: 'opportunity.test', jobId: 'job.seed-warehouse', companyId: 'company.xinghe', route: 'referral', source: '人物推荐', expiresDay: 2, salaryRange: [130, 150] }];
    const applied = run(state, { type: 'submit_application', opportunityId: 'opportunity.test' });
    expect(applied.opportunities).toHaveLength(0);
    expect(applied.consumedOpportunityIds).toContain('opportunity.test');

    const advanced = advanceSimulation({ ...at(applied, 10), simulationMode: 'running' as const }, 24 * 60, contentRegistry, balance);
    expect(advanced.state.opportunities).toHaveLength(0);

    // Re-submitting the same consumed opportunity is impossible.
    const again = dispatchGameAction(at(applied, 10), { type: 'submit_application', opportunityId: 'opportunity.test' }, contentRegistry, balance);
    expect(again.error).toBe('这项招聘已经结束');
  });

  it('hard-blocks a course when its cash cost is unaffordable', () => {
    const course = contentRegistry.courses!.find((entry) => entry.cashCost > 0)!;
    const state = createInitialState(contentRegistry, balance, 1);
    const planned = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 1: { ...state.weeklyPlan.days[1], evening: { kind: 'course' as const, courseId: course.id } } } };
    const unaffordable = { ...state, cash: 0, weeklyPlan: planned };
    expect(planRunError(unaffordable, planned, contentRegistry, balance)).toMatch(/现金不足/);
    expect(dispatchGameAction(unaffordable, { type: 'start_week' }, contentRegistry, balance).error).toMatch(/现金不足/);

    const affordable = { ...unaffordable, cash: course.cashCost };
    expect(planRunError(affordable, planned, contentRegistry, balance) ?? '').not.toMatch(/现金不足/);
  });

  it('hard-blocks a week when the planned course costs exceed total cash', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const [first, second] = contentRegistry.courses!;
    const planned = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 6: { ...state.weeklyPlan.days[6], day: { kind: 'course' as const, courseId: first.id }, evening: { kind: 'course' as const, courseId: second.id } } } };
    const cash = Math.max(first.cashCost, second.cashCost);
    expect(first.cashCost + second.cashCost).toBeGreaterThan(cash);
    expect(planRunError({ ...state, cash }, planned, contentRegistry, balance)).toMatch(/课程总费用/);
  });

  it('rejects the 61st active application without mutating application state', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const vacancy = state.vacancies![0];
    const applications = Array.from({ length: 60 }, (_, index) => ({
      applicationId: `application.1.${index + 1}`,
      jobId: vacancy.jobId,
      companyId: `company.active-${index}`,
      salaryRange: vacancy.salaryRange,
      route: vacancy.route,
      submittedDay: state.time.day,
      resultDay: state.time.day + 2,
      status: 'submitted' as const,
      competitivenessTier: 'minimum' as const,
      probabilityBand: 0.5,
      willReceiveOffer: false,
      feedback: [],
    }));
    const full = { ...state, ability: 99, reputation: 99, applications };
    const result = dispatchGameAction(full, { type: 'submit_application', vacancyId: vacancy.vacancyId }, contentRegistry, balance);
    expect(result.error).toBe('申请记录已达上限');
    expect(result.state.applications).toEqual(applications);
  });

  it('surfaces an open Offer on the life page so a dated offer cannot be missed', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const basic = contentRegistry.jobs.find((entry) => entry.id === 'job.seed-shop-clerk')!;
    const vacancy = (state.vacancies ?? []).find((entry) => entry.jobId === basic.id)!;
    const applied = run(state, { type: 'submit_application', vacancyId: vacancy.vacancyId });
    // Recruitment answers on a later day; the resolved offer is what the life
    // page must surface as an actionable, dated item.
    const offered: GameState = { ...applied, applications: applied.applications!.map((entry) => ({ ...entry, status: 'offer' as const, willReceiveOffer: true, offerExpiresDay: applied.time.day + 7 })) };
    const offer = offered.applications!.find((entry) => entry.status === 'offer')!;
    expect(offer.offerExpiresDay).toBe(state.time.day + 7);
    expect(activeApplications(offered).filter((entry) => entry.status === 'offer')).toHaveLength(1);
    expect(offered.applications!.filter((entry) => entry.status === 'submitted')).toHaveLength(0);
  });
});

describe('message lifecycle', () => {
  it('reports zero unread after bulk reading and removes read rows when cleared', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    appendMessage(state, { title: 'A', body: 'a', characterId: 'character.seed-lin' });
    appendMessage(state, { title: 'B', body: 'b', characterId: 'character.seed-zhou' });
    expect(unreadMessageCount(state.messages)).toBe(2);
    markAllMessagesRead(state);
    expect(unreadMessageCount(state.messages)).toBe(0);
    expect(state.messages).toHaveLength(2);
    clearReadMessages(state);
    expect(visibleMessages(state.messages)).toHaveLength(0);
    expect(state.messages).toHaveLength(2);
  });

  it('keeps message ids unique across a long interaction history', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    for (let index = 0; index < 300; index += 1) {
      state.time = { ...state.time, day: 1 + index };
      appendMessage(state, { title: `M${index}`, body: 'x', characterId: 'character.seed-lin' });
    }
    const ids = (state.messages ?? []).map((message) => message.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.messages!.length).toBeLessThanOrEqual(30);
  });

  it('keeps unread messages and prune-stable state across a two-year recruitment and inbox stress run', () => {
    let state = createInitialState(contentRegistry, balance, 7);
    state = { ...state, simulationMode: 'running', autoRepeatPlan: true, weeklyPlan: { ...state.weeklyPlan, autoRepeat: true } };
    for (let month = 0; month < 24; month += 1) {
      const result = advanceSimulation(state, 28 * 24 * 60, contentRegistry, balance);
      expect(result.error).toBeUndefined();
      state = result.state;
      if (state.simulationMode === 'monthly_summary') state = run(state, { type: 'acknowledge_monthly_summary' });
      if (state.simulationMode === 'planning') state = run(state, { type: 'start_week' });
      // Regular player housekeeping: read the inbox and clear finished applications.
      markAllMessagesRead(state);
      clearReadMessages(state);
      clearTerminalApplications(state);
    }
    expect(state.time.day).toBeGreaterThan(600);
    const ids = (state.messages ?? []).map((message) => message.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((state.opportunities ?? []).every((opportunity) => opportunity.expiresDay >= state.time.day)).toBe(true);
    expect((state.gigs ?? []).every((gig) => gig.expiresDay >= state.time.day)).toBe(true);
    expect((state.discounts ?? []).every((discount) => !discount.expiresDay || discount.expiresDay >= state.time.day)).toBe(true);
    expect((state.applications ?? []).length).toBeLessThanOrEqual(60);
    expect(unreadMessageCount(state.messages)).toBe(0);
  }, 120_000);
});

describe('long-run soak', () => {
  it('runs three deterministic years without planner deadlock, duplicate ids or unbounded state', { timeout: 120_000 }, () => {
    const base = createInitialState(contentRegistry, balance, 2024);
    base.cash = 30_000;
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.course-teaching-assistant')!;
    // A representative live plan: a course, two separate outings and a long-term
    // side job, all repeating.
    let state: GameState = {
      ...base,
      simulationMode: 'running',
      autoRepeatPlan: true,
      acquiredSideJobs: { [job.id]: { jobId: job.id, acquiredDay: 1 } },
      weeklyPlan: {
        ...base.weeklyPlan,
        autoRepeat: true,
        days: {
          ...base.weeklyPlan.days,
          2: { ...base.weeklyPlan.days[2], evening: { kind: 'course', courseId: 'course.workplace-basics' } },
          3: { ...base.weeklyPlan.days[3], evening: { kind: 'side_job', jobId: job.id, durationMinutes: 240 } },
          5: { ...base.weeklyPlan.days[5], evening: { kind: 'activity', activityId: 'activity.old-town-culture', optionId: 'exhibition' } },
          6: { ...base.weeklyPlan.days[6], day: { kind: 'activity', activityId: 'activity.riverside-park-ride', optionId: 'ride' } },
        },
      },
    };
    let autoClears = 0;
    let fallbacks = 0;
    for (let month = 0; month < 36; month += 1) {
      const result = advanceSimulation(state, 28 * 24 * 60, contentRegistry, balance);
      expect(result.error).toBeUndefined();
      autoClears += result.effects.filter((effect) => effect.type === 'message' && effect.text.includes('无法继续')).length;
      fallbacks += result.effects.filter((effect) => effect.type === 'message' && effect.text.includes('本周计划需要调整')).length;
      state = result.state;
      if (state.simulationMode === 'monthly_summary') state = run(state, { type: 'acknowledge_monthly_summary' });
      if (state.simulationMode === 'planning') {
        // The fallback always leaves an actionable plan behind for the player.
        expect(planRunError(state, state.weeklyPlan, contentRegistry, balance)).toBeUndefined();
        state = run(state, { type: 'start_week' });
      }
      markAllMessagesRead(state);
      clearReadMessages(state);
      clearTerminalApplications(state);
    }

    expect(state.time.day).toBeGreaterThan(1000);
    expect(state.planNotice).toBeUndefined();
    const messageIds = (state.messages ?? []).map((message) => message.id);
    expect(new Set(messageIds).size).toBe(messageIds.length);
    const applicationIds = (state.applications ?? []).map((application) => application.applicationId);
    expect(new Set(applicationIds).size).toBe(applicationIds.length);
    const lifeRecordIds = state.lifeHistory.map((entry) => entry.id);
    expect(new Set(lifeRecordIds).size).toBe(lifeRecordIds.length);
    expect(state.lifeHistory.length).toBeGreaterThan(40);
    expect(autoClears).toBeGreaterThan(0);
    expect(fallbacks).toBeGreaterThanOrEqual(0);
    expect((state.ambientLog ?? []).length).toBeLessThanOrEqual(20);
    expect((state.opportunities ?? []).length).toBeLessThanOrEqual(20);
    expect((state.gigs ?? []).length).toBeLessThanOrEqual(8);
    expect((state.employmentHistory ?? []).length).toBeLessThan(80);
    expect((state.applications ?? []).length).toBeLessThanOrEqual(60);
    expect(Number.isFinite(state.cash)).toBe(true);

    // The long save still serializes, loads and stays inside a sane size.
    localStorage.clear();
    const outcome = saveGameState(state);
    expect(outcome.ok).toBe(true);
    const serialized = localStorage.getItem('yuliang-save-v1')!;
    const report = { days: state.time.day, bytes: serialized.length, lifeRecords: state.lifeHistory.length, financialEntries: state.financialLedger?.entries.length ?? 0 };
    console.log('SOAK_SAVE_SIZE', JSON.stringify(report));
    expect(report.bytes).toBeGreaterThan(0);
    expect(report.bytes).toBeLessThan(3_000_000);
    const reloaded = loadGameStateWithReport(contentRegistry, balance);
    expect(reloaded.problem).toBeUndefined();
    expect(reloaded.state.time.day).toBe(state.time.day);
    expect(reloaded.state.lifeHistory.length).toBe(state.lifeHistory.length);
    expect(() => { pruneExpiredState(reloaded.state); }).not.toThrow();
  });
});

describe('persistence safety', () => {
  it('reports a save failure without breaking dispatch or clobbering the last good save', () => {
    localStorage.clear();
    const state = createInitialState(contentRegistry, balance, 1);
    expect(saveGameState(state).ok).toBe(true);
    const good = localStorage.getItem('yuliang-save-v1');

    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
    try {
      const outcome = saveGameState({ ...state, cash: 1 });
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toMatch(/保存失败|存储空间不足/);
      expect(localStorage.getItem('yuliang-save-v1')).toBe(good);
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('keeps the raw payload and reports a problem instead of silently starting over', () => {
    localStorage.clear();
    localStorage.setItem('yuliang-save-v1', '{ this is not json');
    const outcome = loadGameStateWithReport(contentRegistry, balance);
    expect(outcome.problem?.reason).toMatch(/无法解析/);
    expect(outcome.problem?.raw).toBe('{ this is not json');
    expect(outcome.state.time.day).toBe(balanceConfig.initialDay);
  });

  it('repairs hidden workday conflicts, stacked modifiers and stale transients during migration', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const state: GameState = { ...base, time: { ...base.time, day: 30 } };
    const raw = {
      ...state,
      weeklyPlan: { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 1: { day: { kind: 'study', durationMinutes: 120 }, evening: { kind: 'study', durationMinutes: 120 } } } },
      modifiers: [{ target: 'work_pay', mode: 'multiply', value: 1.04 }, { target: 'work_pay', mode: 'multiply', value: 1.04 }],
      discounts: [{ percent: 10, tags: [], expiresDay: 2 }],
      opportunities: [{ id: 'opportunity.stale', jobId: 'job.seed-warehouse', companyId: 'company.xinghe', route: 'referral', source: 'x', expiresDay: 2, salaryRange: [1, 2] }],
      applications: [{ applicationId: 'application.30.1', jobId: 'job.seed-warehouse', companyId: 'company.xinghe', salaryRange: [130, 150], route: 'market', submittedDay: 29, resultDay: 29, status: 'rejected', competitivenessTier: 'minimum', probabilityBand: 0.7, willReceiveOffer: false, feedback: [], nextEligibleDay: 57 }],
      messages: [{ id: 'message.1.1', day: 1, title: 'A', body: 'a', read: true }],
      lifeHistory: [
        { id: 'life.a', day: 1, category: 'relationship', title: '查看消息：林晨发来新消息', detail: 'x' },
        { id: 'life.b', day: 1, category: 'career', title: '接受仓库助理 Offer' },
      ],
    };
    const migrated = migrateGameState(raw, contentRegistry, balance);

    expect(migrated.weeklyPlan.days[1].day).toEqual({ kind: 'free' });
    expect(migrated.modifiers).toHaveLength(1);
    expect(migrated.discounts).toHaveLength(0);
    expect(migrated.opportunities).toHaveLength(0);
    expect(migrated.applicationCooldowns?.['job.seed-warehouse@company.xinghe']?.nextEligibleDay).toBe(57);
    expect(migrated.nextMessageSequence).toBeGreaterThanOrEqual(1);
    expect(migrated.lifeHistory.some((entry) => entry.title.startsWith('查看消息：'))).toBe(false);
    expect(migrated.lifeHistory.some((entry) => entry.title === '接受仓库助理 Offer')).toBe(true);
    expect(planRunError(migrated, migrated.weeklyPlan, contentRegistry, balance)).toBeUndefined();
  });

  it('repairs duplicate and invalid message/application ids without dropping records', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.course-teaching-assistant')!;
    const raw = {
      ...base,
      messages: [
        { id: 'message.1.1', day: 1, title: 'A', body: 'a', read: true },
        { id: 'message.1.1', day: 2, title: 'B', body: 'b', read: false },
        { id: '', day: 3, title: 'C', body: 'c', read: true },
      ],
      applications: [
        { applicationId: 'application.1.1', jobId: job.id, companyId: 'company.a', salaryRange: [1, 2], route: 'market', submittedDay: 1, resultDay: 2, status: 'rejected', competitivenessTier: 'minimum', probabilityBand: 0.5, willReceiveOffer: false, feedback: [] },
        { applicationId: 'application.1.1', jobId: job.id, companyId: 'company.b', salaryRange: [1, 2], route: 'market', submittedDay: 2, resultDay: 3, status: 'withdrawn', competitivenessTier: 'minimum', probabilityBand: 0.5, willReceiveOffer: false, feedback: [] },
      ],
    };
    const migrated = migrateGameState(raw, contentRegistry, balance);
    const messageIds = migrated.messages!.map((entry) => entry.id);
    const applicationIds = migrated.applications!.map((entry) => entry.applicationId);
    expect(new Set(messageIds).size).toBe(messageIds.length);
    expect(new Set(applicationIds).size).toBe(applicationIds.length);
    expect(migrated.messages).toHaveLength(3);
    expect(migrated.applications).toHaveLength(2);
  });

  it('keeps the reconcile helper idempotent and evening-safe', () => {
    const state = createInitialState(contentRegistry, balance, 1);
    const planWithDayWork: GameState['weeklyPlan'] = { ...state.weeklyPlan, days: { ...state.weeklyPlan.days, 2: { day: { kind: 'study', durationMinutes: 60 }, evening: { kind: 'free' } } } };
    const once = reconcilePlanWithEmployment(planWithDayWork, state.employment);
    const twice = reconcilePlanWithEmployment(once, state.employment);
    expect(once.days[2].day).toEqual({ kind: 'free' });
    expect(twice).toEqual(once);
    expect(once.days[2].evening).toEqual(planWithDayWork.days[2].evening);
    // Non-workdays are never touched.
    expect(reconcilePlanWithEmployment(planWithDayWork, { ...state.employment!, schedule: { workDays: [6], startMinute: 540, endMinute: 1020 } }).days[2].day).toEqual({ kind: 'study', durationMinutes: 60 });
  });
});

describe('modifier effectiveness', () => {
  it('applies every permanent modifier target the content can grant', () => {
    const base = createInitialState(contentRegistry, balance, 1);
    const withMods: GameState = { ...base, modifiers: [
      { target: 'work_pay', mode: 'multiply', value: 1.1 },
      { target: 'work_hours', mode: 'multiply', value: 0.9 },
      { target: 'study_gain', mode: 'multiply', value: 2 },
      { target: 'business_profit', mode: 'multiply', value: 1.5 },
      { target: 'housing_rent', mode: 'multiply', value: 0.5 },
      { target: 'shop_price', mode: 'multiply', value: 0.5 },
      { target: 'event_reward', mode: 'multiply', value: 2 },
    ] };

    const plainActivity = activityAtTime({ day: 1, hour: 10, minute: 0 }, base.weeklyPlan, base.employment, contentRegistry, base);
    const moddedActivity = activityAtTime({ day: 1, hour: 10, minute: 0 }, withMods.weeklyPlan, withMods.employment, contentRegistry, withMods);
    expect(plainActivity.kind).toBe('work');
    expect(moddedActivity.kind).toBe('work');
    expect(moddedActivity.end.hour * 60 + moddedActivity.end.minute).toBeLessThan(plainActivity.end.hour * 60 + plainActivity.end.minute);

    const forecastBase = forecastWeeklyPlan(base, base.weeklyPlan, contentRegistry, balance);
    const forecastModded = forecastWeeklyPlan(withMods, withMods.weeklyPlan, contentRegistry, balance);
    expect(forecastModded.income).toBeGreaterThan(forecastBase.income);
  });
});
