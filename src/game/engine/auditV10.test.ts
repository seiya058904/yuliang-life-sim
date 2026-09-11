import { beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry as content } from '../content/registry';
import type { GameAction, GameState } from '../content/contracts';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';
import { advanceSimulation } from './simulation';
import { calendarForDay } from './calendar';
import { activityAtTime } from './schedule';
import { canonicalConflictKey, collectPlanIssues, courseCooldownRemaining } from './planning';
import { factsFromHistory, recentInteractionCount, recentGiftCount, lastCompletedDay } from './businessFacts';
import { serviceCooldownRemaining } from './services';
import { known, amount, unknown } from './knownAmount';
import { closeMonth } from './monthlySettlement';
import { emptyFinancialLedger, summarizeFinancialLedger } from './financialLedger';
import { createGameStore, loadGameStateWithReport, migrateGameState, saveGameState, SAVE_KEY } from '../store/gameStore';
import { forecastWeeklyPlan } from './forecast';
import { dailyCosts, fixedMonthBudget, shiftPay, studyRewards } from './settlementMath';

const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
function fresh(day = 1): GameState {
  const state = createInitialState(content, balance, 1);
  state.cash = 100000;
  state.ability = 100;
  state.reputation = 100;
  for (const value of Object.values(state.weeklyPlan.days)) { value.day = { kind: 'free' }; value.evening = { kind: 'free' }; }
  state.time = { day, hour: 8, minute: 0 };
  state.calendar = calendarForDay(day);
  state.lastSettledDay = day - 1;
  state.currentJobId = undefined;
  state.employment = undefined;
  state.autoRepeatPlan = false;
  state.weeklyPlan.autoRepeat = false;
  return state;
}
function run(state: GameState, action: GameAction): GameState {
  const result = dispatchGameAction(state, action, content, balance);
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('v10 audit regressions', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it('rejects reverse-order cooldown insertion and preserves canonical participants', () => {
    let state = fresh();
    state = run(state, { type: 'set_plan', weekday: 5, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.weekend-getaway', optionId: 'standard' } });
    state = run(run(state, { type: 'start_week' }), { type: 'pause_simulation' });
    const result = dispatchGameAction(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.weekend-getaway', optionId: 'standard' } }, content, balance);
    expect(result.error).toContain('间隔不足');
    const invalid = structuredClone(state);
    invalid.weeklyPlan.days[2].evening = { kind: 'activity', activityId: 'activity.weekend-getaway', optionId: 'standard' };
    expect(dispatchGameAction(invalid, { type: 'resume_simulation' }, content, balance).error).toBeDefined();
    const issue = collectPlanIssues(invalid.weeklyPlan, invalid, { content, balance }).find(i => i.code === 'ACTIVITY_COOLDOWN')!;
    expect(issue.participants).toHaveLength(2);
    expect(canonicalConflictKey(issue)).toBe(canonicalConflictKey({ ...issue, weekday: 2, message: 'different', participants: [...issue.participants!].reverse() }));
    // Even externally-invalid running state cannot settle both occurrences.
    invalid.simulationMode = 'running';
    const advanced = advanceSimulation(invalid, 5 * 1440, content, balance).state;
    expect(advanced.lifeHistory.filter(r => r.sourceId === 'activity.weekend-getaway')).toHaveLength(1);
  });

  it('never creates a previous-week trip from a new Sunday plan', () => {
    let state = fresh(8);
    state = run(state, { type: 'set_plan', weekday: 7, slot: 'day', activity: { kind: 'activity', activityId: 'activity.premium-weekend', optionId: 'premium-stay' } });
    expect(activityAtTime(state.time, state.weeklyPlan, undefined, content, state).kind).not.toBe('activity');
    state = run(state, { type: 'start_week' });
    state = advanceSimulation(state, 1500, content, balance).state;
    expect(state.lifeHistory.some(r => r.sourceId === 'activity.premium-weekend')).toBe(false);
    expect(state.longActivity).toBeUndefined();
  });

  it.each([
    ['activity.premium-weekend', 'premium-stay', 2],
    ['activity.domestic-standard', 'explore', 3],
    ['activity.luxury-vacation', 'resort', 5],
  ] as const)('persists %s across weeks and settles once after reload', (activityId, optionId, days) => {
    let state = fresh(7);
    state.weeklyPlan.days[7].day = { kind: 'activity', activityId, optionId };
    state.autoRepeatPlan = true;
    state.weeklyPlan.autoRepeat = true;
    state = run(state, { type: 'start_week' });
    state = advanceSimulation(state, 70, content, balance).state;
    expect(state.longActivity?.activity.start).toEqual({ day: 7, hour: 9, minute: 0 });
    expect(saveGameState(state).status).toBe('full');
    state = loadGameStateWithReport(content, balance).state;
    state = run(state, { type: 'resume_simulation' });
    // Editing the future template cannot remove the started instance.
    state.weeklyPlan.days[7].day = { kind: 'free' };
    state = advanceSimulation(state, days * 1440 - 10, content, balance).state;
    expect(state.time).toEqual({ day: 7 + days, hour: 9, minute: 0 });
    expect(state.longActivity).toBeUndefined();
    expect(state.lifeHistory.filter(r => r.sourceId === activityId)).toHaveLength(1);
    saveGameState(state);
    const again = run(loadGameStateWithReport(content, balance).state, { type: 'resume_simulation' });
    expect(advanceSimulation(again, 1, content, balance).state.lifeHistory.filter(r => r.sourceId === activityId)).toHaveLength(1);
  });

  it('keeps v9 projected long activity untrusted and asks for recovery', () => {
    const state = fresh(8);
    state.version = 9;
    state.currentActivity = { kind: 'activity', activityId: 'activity.premium-weekend', optionId: 'premium-stay', start: { day: 7, hour: 9, minute: 0 }, end: { day: 9, hour: 9, minute: 0 } };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const store = createGameStore(content, balance);
    expect(store.getState().recovery?.kind).toBe('compatibility');
    expect(store.getState().game.longActivity).toBeUndefined();
    store.getState().acceptRecovery();
    expect(store.getState().game.simulationMode).toBe('paused');
    expect(store.getState().game.lifeHistory).toEqual(state.lifeHistory);
  });

  it('preserves service, course, activity and interaction facts through successful quota compression', () => {
    const state = fresh(2);
    const course = content.courses!.find(c => c.cooldownDays)!;
    state.lifeHistory = [
      { id: 'service', day: 1, category: 'service', sourceId: 'service.fitness-assessment', title: '完成服务' },
      { id: 'course', day: 1, category: 'activity', sourceId: course.id, title: '完成课程' },
      { id: 'activity', day: 1, category: 'activity', sourceId: 'activity.weekend-getaway', title: '完成活动' },
      { id: 'interaction', day: 1, category: 'relationship', sourceId: 'interaction.test', title: '互动' },
      { id: 'gift', day: 1, category: 'relationship', sourceId: 'item.test', title: '礼物', detail: '送给林晨' },
      ...Array.from({ length: 210 }, (_, i) => ({ id: `other.${i}`, day: 2, category: 'career' as const, title: '其他记录' })),
    ];
    state.businessFacts = factsFromHistory(state.lifeHistory, state.time.day);
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      if (JSON.parse(value).lifeHistory.length > 200) throw new Error('quota');
      realSet.call(localStorage, key, value);
    });
    expect(saveGameState(state).status).toBe('compressed');
    const restored = loadGameStateWithReport(content, balance).state;
    const service = content.services!.find(s => s.id === 'service.fitness-assessment')!;
    expect(serviceCooldownRemaining(restored, service)).toBe(59);
    expect(courseCooldownRemaining(restored, course)).toBe(courseCooldownRemaining(state, course));
    expect(lastCompletedDay(restored, 'activity', 'activity.weekend-getaway')).toBe(1);
    expect(recentInteractionCount(restored, 'interaction.test')).toBe(1);
    expect(recentGiftCount(restored, 'item.test', '林晨')).toBe(1);
    expect(recentGiftCount(restored, 'item.test', '周妍')).toBe(0);
    expect(migrateGameState(restored, content, balance)).toEqual(restored);
  });

  it('preserves independent financial fields and propagates unknown through month close', () => {
    const state = fresh(20);
    state.financialLedger = emptyFinancialLedger(1, 10000, 50000);
    const restored = migrateGameState(JSON.parse(JSON.stringify(state)), content, balance);
    expect(restored.financialLedger).toEqual(state.financialLedger);
    const left = structuredClone(state), right = structuredClone(restored);
    closeMonth(left, 1, content, balance, []);
    closeMonth(right, 1, content, balance, []);
    expect(left.lastFinancialSummary).toEqual(right.lastFinancialSummary);
    state.financialLedger.cashStart = unknown();
    const summary = summarizeFinancialLedger(state.financialLedger, state.financialLedger.cashStart, 11000, known(50000), 52000);
    expect(summary.cashChange).toMatchObject({ kind: 'unknown' });
    expect(summary.cashEnd).toEqual(known(11000));
    expect(summary.totalIncome).toEqual(known(0));
    expect(summary.netWorthChange).toEqual(known(2000));
    closeMonth(state, 1, content, balance, []);
    expect(state.lastFinancialSummary?.cashChange).toMatchObject({ kind: 'unknown' });
    expect(amount(state.financialLedger.cashStart).kind).toBe('known');
  });

  it('records the actual total enterprise investment on injection and whole exit', () => {
    let state = fresh();
    state.unlockedBusinessIds.push('business.seed-kiosk');
    state.unlockedCapabilities.push('business_license');
    state = run(state, { type: 'buy_business', businessId: 'business.seed-kiosk' });
    const initial = amount(state.businesses['business.seed-kiosk'].playerCostBasis);
    expect(initial).toEqual(known(3200));
    state = run(state, { type: 'inject_business_capital', businessId: 'business.seed-kiosk', amount: 1000 });
    expect(state.businesses['business.seed-kiosk'].playerCostBasis).toEqual(known(4200));
    state = run(state, { type: 'sell_business', businessId: 'business.seed-kiosk' });
    const entries = state.financialLedger!.entries;
    expect(entries.find(e => e.category === 'realized_loss')?.amount).toBe(1470);
    expect(entries.filter(e => e.category === 'realized_gain')).toHaveLength(0);
  });

  it('never washes unknown enterprise basis through injection or partial sale', () => {
    let state = fresh();
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', purchasePrice: 3200, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, equityPercent: 100, playerCostBasis: unknown() };
    state = run(state, { type: 'inject_business_capital', businessId: 'business.seed-kiosk', amount: 1000 });
    state = run(state, { type: 'sell_business_stake', businessId: 'business.seed-kiosk', percent: 10 });
    state = migrateGameState(state, content, balance);
    expect(state.businesses['business.seed-kiosk'].playerCostBasis).toMatchObject({ kind: 'unknown' });
    expect(state.financialLedger!.entries.some(e => e.category === 'realized_gain' || e.category === 'realized_loss')).toBe(false);
  });

  it('shares known wage/study/commute calculations and owned-home budgeting', () => {
    const state = fresh();
    state.housing.mode = 'owned';
    expect(fixedMonthBudget(state, content, balance).rent).toBe(0);
    state.weeklyPlan.days[1].evening = { kind: 'study', durationMinutes: 120 };
    const prediction = forecastWeeklyPlan(state, state.weeklyPlan, content, balance);
    expect(prediction.attributes).toMatchObject(studyRewards(state, 120));
    expect(prediction.expense).toBe(Array.from({ length: 7 }, (_, i) => dailyCosts(state, content, balance, i + 1).total).reduce((a, b) => a + b));
    expect(shiftPay(state, content.jobs[0], false)).toBe(Math.round(content.jobs[0].basePay));
  });

  it('keeps actual modified study and side-job rewards equal to the forecast', () => {
    let state = fresh();
    state.unlockedCapabilities.push('remote_work');
    for (const key of Object.keys(state.attributes!) as Array<keyof NonNullable<GameState['attributes']>>) state.attributes![key] = 100;
    state.acquiredSideJobs = { 'job.seed-remote': { jobId: 'job.seed-remote', acquiredDay: 1 } };
    state.modifiers = [{ target: 'study_gain', mode: 'add', value: 3 }, { target: 'work_pay', mode: 'multiply', value: 1.137, tags: ['remote'] }];
    state.weeklyPlan.days[1].evening = { kind: 'study', durationMinutes: 120 };
    state.weeklyPlan.days[2].evening = { kind: 'side_job', jobId: 'job.seed-remote', durationMinutes: 240 };
    const before = structuredClone(state);
    const forecast = forecastWeeklyPlan(state, state.weeklyPlan, content, balance);
    expect(state).toEqual(before);
    state = run(state, { type: 'start_week' });
    state = advanceSimulation(state, 7 * 1440, content, balance).state;
    expect(state.attributes!.knowledge - before.attributes!.knowledge).toBe(forecast.attributes.knowledge);
    expect(state.attributes!.professional - before.attributes!.professional).toBe(forecast.attributes.professional);
    expect(state.financialLedger!.entries.filter(e => e.category === 'side_job').reduce((sum, e) => sum + e.amount, 0)).toBe(forecast.income);
  });

  it('does not activate a pending replacement early and preserves its absolute date through migration', () => {
    let state = createInitialState(content, balance, 1);
    state.cash = 100000;
    state.time = { day: 3, hour: 8, minute: 0 };
    state.calendar = calendarForDay(3);
    state.lastSettledDay = 2;
    state.simulationMode = 'paused';
    state.autoRepeatPlan = state.weeklyPlan.autoRepeat = true;
    state.employment!.pendingJobId = 'job.seed-warehouse';
    state.employment!.pendingEffectiveDay = 8;
    state = migrateGameState(state, content, balance);
    expect(state.employment!.pendingEffectiveDay).toBe(8);
    const started = run(state, { type: 'start_week' });
    expect(started.currentJobId).toBe(state.currentJobId);
    expect(started.employmentHistory).toEqual(state.employmentHistory);
    const normal = advanceSimulation(run(state, { type: 'resume_simulation' }), 28 * 1440, content, balance).state;
    const long = run(state, { type: 'advance_period', months: 1 });
    expect(long.employment).toEqual(normal.employment);
    expect(long.employmentHistory).toEqual(normal.employmentHistory);
    expect(long.lastFinancialSummary).toEqual(normal.lastFinancialSummary);
    expect(long.employment!.startedDay).toBe(8);
    expect(migrateGameState(state, content, balance)).toEqual(state);
  });

  it('allows immediate acceptance when unemployed and retains both legitimate salary stages', () => {
    let state = fresh();
    state.activeRecruitment = { jobId: 'job.seed-shop-clerk', stage: 'offer' };
    state = run(state, { type: 'accept_job_offer', jobId: 'job.seed-shop-clerk' });
    expect(state.employment!.pendingJobId).toBeUndefined();
    expect(state.employment!.startedDay).toBe(1);
    state.jobExperience['job.seed-shop-clerk'] = 0;
    const stay = (value: GameState) => run(run(run(value, { type: 'start_resignation' }), { type: 'advance_resignation' }), { type: 'choose_resignation', choice: 'stay' });
    const first = stay(state);
    const again = stay(migrateGameState(first, content, balance));
    expect(again.reputation).toBe(first.reputation);
    expect(again.cash).toBe(first.cash);
    const oldEmployment = structuredClone(again.employment);
    let rejoined = run(run(run(again, { type: 'start_resignation' }), { type: 'advance_resignation' }), { type: 'choose_resignation', choice: 'leave' });
    rejoined.employment = oldEmployment;
    rejoined.currentJobId = oldEmployment!.jobId;
    expect(stay(rejoined).reputation).toBe(first.reputation);
    rejoined.jobExperience['job.seed-shop-clerk'] = 20;
    rejoined = stay(rejoined);
    expect(rejoined.employment!.negotiationStage).toBe(1);
    rejoined.jobExperience['job.seed-shop-clerk'] = 60;
    rejoined = stay(rejoined);
    expect(rejoined.employment!.negotiationStage).toBe(2);
  });

  it('gates reward and monthly continuations on the same remaining-plan rules', () => {
    const state = fresh();
    state.weeklyPlan.days[2].evening = { kind: 'side_job', jobId: 'missing', durationMinutes: 120 };
    state.simulationMode = 'reward';
    state.pendingReward = { eventId: 'already-applied', lines: [] };
    const claimed = run(state, { type: 'claim_reward', resume: true });
    expect(claimed.pendingReward).toBeUndefined();
    expect(claimed.simulationMode).toBe('planning');
    expect(claimed.planIssues!.length).toBeGreaterThan(0);
    claimed.autoRepeatPlan = true;
    claimed.pendingMonthlySummary = { month: 1, summary: { month: 1, ledger: claimed.monthlyLedger }, resumeMode: 'running', highlights: [] };
    const acknowledged = run(claimed, { type: 'acknowledge_monthly_summary' });
    expect(acknowledged.pendingMonthlySummary).toBeUndefined();
    expect(acknowledged.simulationMode).toBe('planning');
  });

  it('keeps an unknown annual cash baseline independent from known income and net worth', () => {
    const state = fresh(337);
    const sample = summarizeFinancialLedger(emptyFinancialLedger(1, unknown(), known(1000)), unknown(), 1200, known(1000), 1400);
    state.financialHistory = Array.from({ length: 11 }, (_, i) => ({ ...structuredClone(sample), month: i + 1 }));
    state.financialLedger = emptyFinancialLedger(12, known(1200), known(1400));
    closeMonth(state, 12, content, balance, []);
    expect(state.annualHistory![0].cashStart).toMatchObject({ kind: 'unknown' });
    expect(state.annualHistory![0].totalIncome).toEqual(known(0));
    expect(state.annualHistory![0].netWorthStart).toEqual(known(1000));
    expect(state.financialLedger.cashStart).toEqual(known(state.cash));
    const restored = migrateGameState(state, content, balance);
    expect(migrateGameState(restored, content, balance)).toEqual(restored);
  });
});
