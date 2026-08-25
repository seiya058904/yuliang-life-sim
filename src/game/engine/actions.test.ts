import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';

describe('game action dispatcher', () => {
  it('runs a planned day automatically and pays the scheduled job once', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const state = createInitialState(contentRegistry, balance, 1);
    const started = dispatchGameAction(state, { type: 'start_week' }, contentRegistry, balance);
    const result = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 12 * 60 }, contentRegistry, balance);

    expect(result.error).toBeUndefined();
    expect(result.state.jobExperience['job.seed-shop-clerk']).toBe(1);
    expect(result.state.cash).toBeGreaterThan(state.cash);
    expect(result.state.time).toEqual({ day: 1, hour: 20, minute: 0 });
  });

  it('requires the short recruitment flow before a regular job becomes active', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const viewed = dispatchGameAction(state, { type: 'start_recruitment', jobId: 'job.seed-warehouse' }, contentRegistry, balanceConfig);
    expect(viewed.state.activeRecruitment?.stage).toBe('dialogue');
    expect(viewed.state.activeRecruitment?.recruiterCharacterId).toBeDefined();

    const offer = dispatchGameAction(viewed.state, { type: 'advance_recruitment', jobId: 'job.seed-warehouse' }, contentRegistry, balanceConfig);
    const accepted = dispatchGameAction(offer.state, { type: 'accept_job_offer', jobId: 'job.seed-warehouse' }, contentRegistry, balanceConfig);
    expect(accepted.error).toBeUndefined();
    expect(accepted.state.currentJobId).toBe('job.seed-warehouse');
    expect(accepted.state.employment?.schedule.workDays).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not consume time when settling a batch shopping cart', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const result = dispatchGameAction(state, { type: 'purchase_items', items: { 'item.seed-coffee': 2, 'item.seed-phone': 1 } }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(500 - 18 * 2 - 420);
    expect(result.state.time).toEqual({ day: 1, hour: 8, minute: 0 });
    expect(result.state.monthlyLedger.purchaseExpense).toBe(456);
    expect(result.effects.filter((effect) => effect.type === 'time')).toHaveLength(0);
  });

  it('lets the player claim an event reward and choose whether simulation resumes', () => {
    const state = { ...createInitialState(contentRegistry, balanceConfig, 1), pendingEventId: 'event.seed-bonus', simulationMode: 'event' as const };
    const blocked = dispatchGameAction(state, { type: 'advance_simulation', minutes: 1 }, contentRegistry, balanceConfig);
    expect(blocked.error).toMatch(/先处理当前事件/);
    const chosen = dispatchGameAction(state, { type: 'choose_event', eventId: 'event.seed-bonus', choiceId: 'take' }, contentRegistry, balanceConfig);
    expect(chosen.error).toBeUndefined();
    expect(chosen.state.pendingEventId).toBeUndefined();
    expect(chosen.state.simulationMode).toBe('reward');
    const paused = dispatchGameAction(chosen.state, { type: 'claim_reward' }, contentRegistry, balanceConfig);
    expect(paused.state.simulationMode).toBe('paused');
    const resumed = dispatchGameAction(chosen.state, { type: 'claim_reward', resume: true }, contentRegistry, balanceConfig);
    expect(resumed.state.simulationMode).toBe('running');
  });

  it('copies the stored previous weekly plan instead of only showing a message', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const changed = dispatchGameAction(state, {
      type: 'set_plan', weekday: 6, slot: 'day', activity: { kind: 'study', durationMinutes: 240 },
    }, contentRegistry, balanceConfig);
    expect(changed.error).toBeUndefined();
    const copied = dispatchGameAction(changed.state, { type: 'copy_previous_plan' }, contentRegistry, balanceConfig);
    expect(copied.error).toBeUndefined();
    expect(copied.state.weeklyPlan.days[6].day).toEqual(state.weeklyPlan.days[6].day);
  });

  it('pauses recruitment while running and activates a pending job on the next auto-repeated week', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const initial = createInitialState(contentRegistry, balance, 3);
    const started = dispatchGameAction(initial, { type: 'start_week' }, contentRegistry, balance);
    const viewed = dispatchGameAction(started.state, { type: 'start_recruitment', jobId: 'job.seed-warehouse' }, contentRegistry, balance);
    const offer = dispatchGameAction(viewed.state, { type: 'advance_recruitment', jobId: 'job.seed-warehouse' }, contentRegistry, balance);
    const accepted = dispatchGameAction(offer.state, { type: 'accept_job_offer', jobId: 'job.seed-warehouse' }, contentRegistry, balance);
    expect(viewed.state.simulationMode).toBe('paused');
    expect(accepted.state.currentJobId).toBe('job.seed-shop-clerk');
    expect(accepted.state.employment?.pendingJobId).toBe('job.seed-warehouse');

    const resumed = dispatchGameAction(accepted.state, { type: 'resume_simulation' }, contentRegistry, balance);
    const nextWeek = dispatchGameAction(resumed.state, { type: 'advance_simulation', minutes: 7 * 24 * 60 }, contentRegistry, balance);
    expect(nextWeek.error).toBeUndefined();
    expect(nextWeek.state.currentJobId).toBe('job.seed-warehouse');
    expect(nextWeek.state.employment?.pendingJobId).toBeUndefined();
    expect(nextWeek.state.employment?.effectiveWeek).toBe(2);
  });

  it('records successful life-history actions at domain boundaries and leaves failures quiet', () => {
    const base = createInitialState(contentRegistry, balanceConfig, 11);
    const applicationState = {
      ...base,
      applications: [{
        applicationId: 'application.history',
        vacancyId: 'vacancy.history',
        jobId: 'job.seed-warehouse',
        companyId: 'company.yuanwang',
        salaryRange: [130, 150] as const,
        route: 'market' as const,
        submittedDay: 1,
        resultDay: 1,
        offerExpiresDay: 8,
        status: 'offer' as const,
        competitivenessTier: 'minimum' as const,
        probabilityBand: 0.7,
        willReceiveOffer: true,
        feedback: [],
      }],
    };

    const career = dispatchGameAction(applicationState, { type: 'accept_application_offer', applicationId: 'application.history' }, contentRegistry, balanceConfig);
    expect(career.error).toBeUndefined();
    expect(career.state.lifeHistory?.at(-1)).toMatchObject({ category: 'career', day: 1, title: '接受仓库理货员 Offer', sourceId: 'job.seed-warehouse', amount: 130 });

    const purchase = dispatchGameAction(career.state, { type: 'purchase_items', items: { 'item.seed-coffee': 1 } }, contentRegistry, balanceConfig);
    expect(purchase.error).toBeUndefined();
    expect(purchase.state.lifeHistory?.at(-1)).toMatchObject({ category: 'purchase', day: 1, title: '购买现磨咖啡', sourceId: 'item.seed-coffee', amount: -18 });

    const relationship = dispatchGameAction(purchase.state, { type: 'interact_character', interactionId: 'interaction.seed-lin-meal', optionId: 'meal' }, contentRegistry, balanceConfig);
    expect(relationship.error).toBeUndefined();
    expect(relationship.state.lifeHistory?.at(-1)).toMatchObject({ category: 'relationship', day: 1, sourceId: 'interaction.seed-lin-meal' });

    const investor = { ...relationship.state, cash: 10_000 };
    const investment = dispatchGameAction(investor, { type: 'buy_investment', investmentId: 'investment.seed-index', units: 1 }, contentRegistry, balanceConfig);
    expect(investment.error).toBeUndefined();
    expect(investment.state.lifeHistory?.at(-1)).toMatchObject({ category: 'investment', day: 1, title: '买入稳健指数基金', sourceId: 'investment.seed-index' });

    const beforeFailureCount = investment.state.lifeHistory?.length ?? 0;
    const failed = dispatchGameAction({ ...investment.state, cash: 0 }, { type: 'purchase_items', items: { 'item.seed-phone': 1 } }, contentRegistry, balanceConfig);
    expect(failed.error).toBeDefined();
    expect(failed.state.lifeHistory).toHaveLength(beforeFailureCount);
  });
});
