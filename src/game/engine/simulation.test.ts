import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { advanceSimulation } from './simulation';

describe('automatic simulation', () => {
  it('runs a deterministic planned week and never turns one day into repeated full-time work', () => {
    const initial = createInitialState(contentRegistry, balanceConfig, 7);
    const running = { ...initial, simulationMode: 'running' as const, autoRepeatPlan: false, weeklyPlan: { ...initial.weeklyPlan, autoRepeat: false } };
    const result = advanceSimulation(running, 7 * 24 * 60, contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }));

    expect(result.state.cash).toBeGreaterThan(initial.cash);
    expect(result.state.jobExperience[running.currentJobId!]).toBe(5);
    expect(result.state.careerExperience?.retail).toBe(5);
    expect(result.state.monthlyHighlights?.some((entry) => entry.sourceId === 'retail')).toBe(true);
    expect(result.state.calendar.week).toBe(2);
    expect(result.state.simulationMode).toBe('planning');
  });

  it('pauses at the first triggered event and does not simulate past it', () => {
    const initial = createInitialState(contentRegistry, balanceConfig, 11);
    const running = { ...initial, simulationMode: 'running' as const, eventMeter: balanceConfig.eventMeterThreshold - 0.01 };
    const result = advanceSimulation(running, 60, contentRegistry, balanceConfig);

    expect(result.state.pendingEventId).toBeDefined();
    expect(result.state.simulationMode).toBe('event');
    expect(result.state.time.minute).toBeLessThanOrEqual(60);
    expect(result.effects.some((effect) => effect.type === 'event')).toBe(true);
  });

  it('settles planned study and side-job duration without touching the formal work schedule', () => {
    const initial = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 13);
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'side_job', jobId: 'job.delivery-shift', durationMinutes: 240 };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 7 * 24 * 60, contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }));

    expect(result.state.jobExperience['job.delivery-shift']).toBe(1);
    expect(result.state.monthlyLedger.sideJobIncome).toBe(76);
    expect(result.state.ability).toBeGreaterThan(initial.ability);
    expect(result.state.jobExperience['job.seed-shop-clerk']).toBe(5);
  });

  it('records a scheduled activity after it settles its cost and effects', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'activity', activityId: 'activity.seed-movie', optionId: 'standard' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'activity.seed-movie' && entry.amount === 68)).toBe(true);
    expect(result.state.lifeHistory?.some((entry) => entry.sourceId === 'activity.seed-movie' && entry.title === '看电影 · 普通影厅')).toBe(true);
  });

  it('closes a month after four weeks without requiring a confirmation action', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 17);
    const running = { ...initial, simulationMode: 'running' as const, autoRepeatPlan: true, weeklyPlan: { ...initial.weeklyPlan, autoRepeat: true } };
    const result = advanceSimulation(running, 28 * 24 * 60, contentRegistry, balance);

    expect(result.state.time.day).toBe(29);
    expect(result.state.lastMonthlySummary?.month).toBe(1);
    expect(result.effects.some((effect) => effect.type === 'month')).toBe(true);
  });

  it('blocks at the month boundary until the player acknowledges the generated summary', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 17);
    const running = { ...initial, simulationMode: 'running' as const, autoRepeatPlan: true, weeklyPlan: { ...initial.weeklyPlan, autoRepeat: true } };
    const result = advanceSimulation(running, 28 * 24 * 60, contentRegistry, balance);

    expect(result.state.simulationMode).toBe('monthly_summary');
    expect(result.state.pendingMonthlySummary?.month).toBe(1);
  });

  it('charges an active subscription in the monthly summary and keeps its record active', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 29);
    initial.activeSubscriptions = { 'subscription.mobile-basic': { subscriptionId: 'subscription.mobile-basic', startedDay: 1 } };
    const running = { ...initial, simulationMode: 'running' as const, autoRepeatPlan: true, weeklyPlan: { ...initial.weeklyPlan, autoRepeat: true } };
    const result = advanceSimulation(running, 28 * 24 * 60, contentRegistry, balance);

    expect(result.state.activeSubscriptions?.['subscription.mobile-basic']).toBeDefined();
    expect(result.state.lastFinancialSummary?.consumption.categories.service).toBe(39);
    expect(result.state.lifeHistory.some((entry) => entry.title === '基础通信套餐月度扣费')).toBe(true);
  });

  it('applies gentle vehicle depreciation and a monthly vehicle cost without treating depreciation as consumption', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 31);
    initial.cash = 50000;
    initial.assets['asset.used-compact'] = { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 35000 };
    const running = { ...initial, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 24 * 60, contentRegistry, balance);

    expect(result.state.assets['asset.used-compact'].currentValuation).toBeLessThan(35000);
    expect(result.state.financialLedger?.entries.some((entry) => entry.category === 'valuation_change' && entry.cashDelta === 0)).toBe(true);
    expect(result.state.financialLedger?.entries.some((entry) => entry.category === 'maintenance' && entry.amount > 0)).toBe(true);
  });
});
