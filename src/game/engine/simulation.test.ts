import { describe, expect, it } from 'vitest';
import type { GameState } from '../content/contracts';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { advanceSimulation } from './simulation';
import { dispatchGameAction } from './actions';

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
    expect(result.state.locationVisits?.['location.central']).toBe(1);
  });

  it('applies a vehicle travel discount and records the self-drive feedback', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    initial.assets['asset.used-compact'] = { assetId: 'asset.used-compact', purchasePrice: 4800, purchaseDay: 1, currentValuation: 4800 };
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'activity', activityId: 'activity.weekend-getaway', optionId: 'standard' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'activity.weekend-getaway' && entry.amount === 288)).toBe(true);
    expect(result.state.lifeHistory?.some((entry) => entry.sourceId === 'activity.weekend-getaway' && entry.detail === '自驾出行，交通费用有所减少')).toBe(true);
  });

  it('persists interest familiarity from a completed tagged activity', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'activity', activityId: 'activity.cinema', optionId: 'standard' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.interestFamiliarity?.film).toBe(1);
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'activity.cinema' && entry.detail?.includes('电影兴趣'))).toBe(true);
  });

  it('settles a relationship-gated cinema outing with Zhou into relation and history', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    initial.cash = 1000;
    initial.relationships['character.seed-zhou'] = 6;
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'activity', activityId: 'activity.cinema', optionId: 'with-zhou' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.relationships['character.seed-zhou']).toBe(8);
    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'activity.cinema' && entry.amount === 160)).toBe(true);
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'activity.cinema' && entry.detail?.includes('和周妍一起'))).toBe(true);
  });

  it('settles an owned business project as one-time equity-proportional profit', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    initial.businesses['business.service-studio'] = { businessId: 'business.service-studio', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 14500, equityPercent: 50 };
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'activity', activityId: 'activity.brand-film-project', optionId: 'contract' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.completedBusinessProjects).toContain('activity.brand-film-project.contract');
    expect(result.state.cash).toBeGreaterThan(initial.cash);
    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'business.service-studio' && entry.category === 'business_income' && entry.amount === 2400)).toBe(true);
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'business.service-studio' && entry.title === '完成企业项目：品牌短片项目')).toBe(true);
  });

  it('settles a scheduled course into qualification, career experience, ledger and life history', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    initial.cash = 1000;
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'course', courseId: 'course.workplace-basics' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.courseProgress?.['course.workplace-basics']).toBe(1);
    expect(result.state.qualifications).toContain('qualification.workplace-basics');
    expect(result.state.careerExperience?.office).toBe(2);
    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'course.workplace-basics' && entry.category === 'education')).toBe(true);
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'course.workplace-basics' && entry.title === '完成课程：职场基础课')).toBe(true);
  });

  it('settles the management foundation course into its qualification and management experience', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 23);
    initial.cash = 4000;
    initial.attributes = { ...initial.attributes!, communication: 30, professional: 30 };
    const plan = structuredClone(initial.weeklyPlan);
    plan.days[6].day = { kind: 'course', courseId: 'course.people-management' };
    const running = { ...initial, weeklyPlan: plan, autoRepeatPlan: false, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 6 * 24 * 60, contentRegistry, balance);

    expect(result.state.courseProgress?.['course.people-management']).toBe(1);
    expect(result.state.qualifications).toContain('people_management_basics');
    expect(result.state.careerExperience?.management).toBe(2);
    expect(result.state.financialLedger?.entries.some((entry) => entry.sourceId === 'course.people-management' && entry.category === 'education')).toBe(true);
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'course.people-management' && entry.title === '完成课程：团队管理基础')).toBe(true);
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

  it('pays company-equity dividends as investment income without changing the holding valuation semantics', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 31);
    initial.investments = { 'investment.qiming-equity': { investmentId: 'investment.qiming-equity', units: 1000, averageCost: 220, currentValuation: 220000, lastValuationDay: 1 } };
    const running = { ...initial, simulationMode: 'running' as const };
    const result = advanceSimulation(running, 24 * 60, contentRegistry, balance);

    const dividend = result.state.financialLedger?.entries.find((entry) => entry.category === 'investment_dividend');
    expect(dividend?.amount).toBeGreaterThan(0);
    expect(dividend?.direction).toBe('income');
    expect(result.state.investments?.['investment.qiming-equity'].currentValuation).toBeGreaterThan(0);
    expect(result.state.completedMilestones).toContain('milestone.first-investment-dividend');
    expect(result.state.lifeHistory.some((entry) => entry.sourceId === 'milestone.first-investment-dividend')).toBe(true);
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

  it('keeps deterministic annual records through five years of monthly summaries', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 41);
    let state: GameState = { ...initial, simulationMode: 'running', autoRepeatPlan: true, weeklyPlan: { ...initial.weeklyPlan, autoRepeat: true } };
    for (let month = 1; month <= 60; month += 1) {
      const result = advanceSimulation(state, 28 * 24 * 60, contentRegistry, balance);
      expect(result.error).toBeUndefined();
      state = result.state;
      if (state.simulationMode === 'monthly_summary') {
        const acknowledged = dispatchGameAction(state, { type: 'acknowledge_monthly_summary' }, contentRegistry, balance);
        expect(acknowledged.error).toBeUndefined();
        state = acknowledged.state;
      }
    }

    expect(state.time.day).toBe(1681);
    expect(state.annualHistory).toHaveLength(5);
    expect(state.annualHistory?.map((entry) => entry.year)).toEqual([1, 2, 3, 4, 5]);
    expect(state.annualHistory?.every((entry) => entry.months === 12)).toBe(true);
    expect(state.worldHistory).toHaveLength(5);
    expect(state.worldHistory?.map((entry) => entry.year)).toEqual([1, 2, 3, 4, 5]);
    expect(state.worldHistory?.every((entry) => entry.day > 0 && entry.businessCount >= 0)).toBe(true);
  });
});
