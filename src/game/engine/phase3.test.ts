import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { applyAttributeDelta, calculateLegacyAbility, migrateAttributes } from './attributes';
import { explainCondition, evaluateCondition } from './conditions';
import { emptyFinancialLedger, recordFinancialEntry, summarizeFinancialLedger } from './financialLedger';
import { activityCashCost, activityCooldownRemaining, activityDiscountLabel, getActivityOption } from './activities';
import { dispatchGameAction } from './actions';
import { composeContentPacks } from '../content/registry';
import { advanceSimulation } from './simulation';

describe('phase 3 additive systems', () => {
  it('settles the official industrial design exhibition trip through the weekly plan', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 7);
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.industrial-design-exhibition')!;
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: activity.id, optionId: 'exhibition' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '北部产业设计展 · 看展', sourceId: activity.id }));
    expect(settled.state.financialLedger?.entries).toContainEqual(expect.objectContaining({ label: '北部产业设计展 · 看展', amount: 280, category: 'travel' }));
  });

  it('settles the official riverside night market through the weekly plan', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 7);
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.riverside-night-market')!;
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: activity.id, optionId: 'market' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '河畔夜市 · 逛一圈', sourceId: activity.id }));
    expect(settled.state.financialLedger?.entries).toContainEqual(expect.objectContaining({ label: '河畔夜市 · 逛一圈', amount: 96, category: 'entertainment' }));
  });

  it('settles the official riverside park ride through the weekly plan', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 7);
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.riverside-park-ride')!;
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: activity.id, optionId: 'ride' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '临江公园骑行 · 沿江骑行', sourceId: activity.id }));
    expect(settled.state.financialLedger?.entries).toContainEqual(expect.objectContaining({ label: '临江公园骑行 · 沿江骑行', amount: 180, category: 'travel' }));
    expect(settled.state.attributes?.fitness).toBeGreaterThan(state.attributes?.fitness ?? 0);
  });

  it('applies location development discount to activities at that location', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    state.locationDevelopment = { 'location.riverside': 3 };
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.weekend-getaway')!;
    const option = getActivityOption(activity, 'standard')!;

    expect(activityCashCost(state, activity, option, contentRegistry)).toBe(349);
    expect(activityDiscountLabel(state, activity, contentRegistry)).toBe('地点发展优惠');
  });

  it('keeps the alternate travel option discoverable with its own duration and cost', () => {
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.weekend-getaway')!;
    const option = getActivityOption(activity, 'evening-walk');

    expect(option).toMatchObject({ label: '临江夜游', durationMinutes: 240, cashCost: 520 });
    expect(activityCashCost(createInitialState(contentRegistry, balanceConfig, 7), activity, option!, contentRegistry)).toBe(520);
  });

  it('reports the remaining cooldown after a repeated travel activity', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    const activity = contentRegistry.activities?.find((entry) => entry.id === 'activity.weekend-getaway')!;
    const option = getActivityOption(activity, 'standard')!;
    state.lifeHistory = [{ id: 'life.activity.last-trip', day: 10, category: 'activity', title: '周末短途旅行 · 慢慢走走', sourceId: activity.id }];
    state.time.day = 15;

    expect(activityCooldownRemaining(state, activity, option)).toBe(9);
    state.time.day = 24;
    expect(activityCooldownRemaining(state, activity, option)).toBe(0);
  });

  it('blocks planning a travel option while its cooldown is active', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    state.time.day = 15;
    state.lifeHistory = [{ id: 'life.activity.last-trip', day: 10, category: 'activity', title: '周末短途旅行 · 慢慢走走', sourceId: 'activity.weekend-getaway' }];
    const activity = { kind: 'activity' as const, activityId: 'activity.weekend-getaway', optionId: 'standard' };

    expect(dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity }, contentRegistry, balanceConfig).error).toMatch(/冷却中/);
    state.time.day = 24;
    expect(dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity }, contentRegistry, balanceConfig).error).toBeUndefined();
  });

  it('keeps legacy ability synchronized with fine attributes', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    expect(calculateLegacyAbility(state.attributes!)).toBe(state.ability);

    applyAttributeDelta(state, 'professional', 4);
    expect(state.attributes!.professional).toBeGreaterThan(0);
    expect(state.ability).toBe(calculateLegacyAbility(state.attributes!));
  });

  it('migrates an old ability save into stable fine attributes', () => {
    const attributes = migrateAttributes(undefined, 24, 10, {});
    expect(calculateLegacyAbility(attributes)).toBe(24);
    expect(attributes.professional).toBe(24);
    expect(attributes.knowledge).toBe(24);
  });

  it('explains a fine-attribute condition without exposing engine vocabulary', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    const condition = { type: 'attribute_at_least', attribute: 'professional', amount: 30 } as const;
    expect(evaluateCondition(condition, state, contentRegistry, balanceConfig)).toBe(false);
    expect(explainCondition(condition, state, contentRegistry, balanceConfig)).toMatch(/专业/);
    expect(explainCondition(condition, state, contentRegistry, balanceConfig)).toMatch(/还需要/);
  });

  it('explains an interest gate with a player-facing label', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    const condition = { type: 'interest_familiarity_at_least', tag: 'photography', amount: 2 } as const;
    expect(explainCondition(condition, state, contentRegistry, balanceConfig)).toMatch(/摄影兴趣熟练度/);
  });

  it('blocks a gated activity before it enters the weekly plan and explains the acquisition path', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.weeklyPlan.days[2].evening = { kind: 'free' };
    const result = dispatchGameAction(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.city-photography', optionId: 'walk' } }, contentRegistry, balanceConfig);
    expect(result.error).toMatch(/需要商品 复古相机/);
    expect(result.state.weeklyPlan.days[2].evening).toEqual({ kind: 'free' });
  });

  it('uses the camping gear acquisition hint and settles the weekend camping activity', () => {
    const state = { ...createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 3), cash: 3_000 };
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const locked = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.weekend-camping', optionId: 'camp' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(locked.error).toMatch(/需要商品 露营装备/);
    const bought = dispatchGameAction(state, { type: 'purchase_items', items: { 'item.camping-gear': 1 } }, contentRegistry, balanceConfig);
    const planned = dispatchGameAction(bought.state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.weekend-camping', optionId: 'camp' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '周末露营 · 搭帐篷住一晚', sourceId: 'activity.weekend-camping' }));
    expect(settled.state.financialLedger?.entries).toContainEqual(expect.objectContaining({ label: '周末露营 · 搭帐篷住一晚', amount: 260, category: 'travel' }));
    expect(settled.state.attributes?.fitness).toBeGreaterThan(state.attributes?.fitness ?? 0);
  });

  it('opens a friend-specific activity only after the relationship requirement and records the companion', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 3);
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const locked = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.cafe-break', optionId: 'with-chenyu' } }, contentRegistry, balanceConfig);
    expect(locked.error).toMatch(/与陈宇的关系 ≥ 4.*当前 0/);
    state.relationships['character.chenyu'] = 4;
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.cafe-break', optionId: 'with-chenyu' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '去咖啡馆坐一会 · 和陈宇坐坐', detail: expect.stringContaining('和陈宇一起') }));
    expect(settled.state.relationships['character.chenyu']).toBeGreaterThan(4);
  });

  it('settles Lin morning bookstore outing with a preference-specific relationship bonus', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 3);
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.browse-bookstore', optionId: 'with-lin' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '周末逛书店 · 和林晨一起逛', detail: expect.stringContaining('林晨喜欢这类活动') }));
    expect(settled.state.relationships['character.seed-lin']).toBeGreaterThan(state.relationships['character.seed-lin']);
  });

  it('settles Xuke technology coffee with his preference-specific relationship bonus', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 3);
    state.relationships['character.xuke'] = 12;
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.coffee-with-contact', optionId: 'with-xuke' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '和联系人喝咖啡 · 和徐可聊设备', detail: expect.stringContaining('徐可喜欢这类活动') }));
    expect(settled.state.relationships['character.xuke']).toBeGreaterThan(12);
  });

  it('settles Heyan housing dinner with his meal preference-specific relationship bonus', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 3);
    state.relationships['character.heyan'] = 10;
    state.weeklyPlan.days[1].evening = { kind: 'free' };
    const planned = dispatchGameAction(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'activity', activityId: 'activity.dinner-with-friend', optionId: 'with-heyan' } }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    expect(planned.error).toBeUndefined();
    const started = dispatchGameAction(planned.state, { type: 'start_week' }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });
    const settled = dispatchGameAction(started.state, { type: 'advance_simulation', minutes: 24 * 60 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '一起吃饭 · 和何彦聊房子', detail: expect.stringContaining('何彦喜欢这类活动') }));
    expect(settled.state.relationships['character.heyan']).toBeGreaterThan(10);
  });

  it('records income, consumption, and asset allocation as different cash-flow groups', () => {
    let ledger = emptyFinancialLedger(1);
    ledger = recordFinancialEntry(ledger, { day: 1, direction: 'income', category: 'wage', amount: 620, label: '工资' });
    ledger = recordFinancialEntry(ledger, { day: 2, direction: 'expense', category: 'entertainment', amount: 68, label: '看电影' });
    ledger = recordFinancialEntry(ledger, { day: 3, direction: 'transfer', category: 'investment_transfer', amount: 200, label: '买入基金' });
    const summary = summarizeFinancialLedger(ledger, 500, 852, 1000, 1304);

    expect(summary.totalIncome).toBe(620);
    expect(summary.totalConsumption).toBe(68);
    expect(summary.totalAssetAllocation).toBe(200);
    expect(summary.cashChange).toBe(352);
    expect(summary.netWorthChange).toBe(304);
  });

  it('records investment principal as liquidation and only the realized gain as income', () => {
    let ledger = emptyFinancialLedger(1, 1000, 1000);
    ledger = recordFinancialEntry(ledger, { day: 1, direction: 'transfer', category: 'asset_liquidation', amount: 2300, costBasis: 2000, label: '资产变现' });
    ledger = recordFinancialEntry(ledger, { day: 1, direction: 'income', category: 'realized_gain', amount: 300, cashDelta: 0, label: '已实现收益' });
    const summary = summarizeFinancialLedger(ledger, 1000, 3300, 1000, 1300);

    expect(summary.totalIncome).toBe(300);
    expect(summary.totalAssetLiquidation).toBe(2300);
    expect(ledger.entries[1].cashDelta).toBe(0);
  });

  it('defines activity cost and effects per option rather than per activity', () => {
    const activity = contentRegistry.activities!.find((entry) => entry.id === 'activity.seed-movie');
    expect(activity).toBeDefined();
    expect(activity?.options.map((option) => option.durationMinutes)).toEqual([180, 240]);
    expect(getActivityOption(activity!, 'standard')?.cashCost).toBe(68);
    expect(getActivityOption(activity!, 'premium')?.cashCost).toBe(128);
  });

  it('keeps investment purchases out of consumption while changing cash and net worth composition', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 11);
    const result = dispatchGameAction(state, { type: 'buy_investment', investmentId: 'investment.seed-index', units: 2 }, contentRegistry, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.investments?.['investment.seed-index']?.units).toBe(2);
    expect(result.state.financialLedger?.entries.at(-1)?.group).toBe('asset_allocation');
    expect(result.state.financialLedger?.entries.at(-1)?.category).toBe('investment_transfer');
  });

  it('requires reward acknowledgement and supports resuming directly from the reward screen', () => {
    const state = { ...createInitialState(contentRegistry, balanceConfig, 1), pendingEventId: 'event.seed-bonus', simulationMode: 'event' as const };
    const chosen = dispatchGameAction(state, { type: 'choose_event', eventId: 'event.seed-bonus', choiceId: 'take' }, contentRegistry, balanceConfig);
    expect(chosen.state.simulationMode).toBe('reward');
    expect(dispatchGameAction(chosen.state, { type: 'continue_after_event' }, contentRegistry, balanceConfig).error).toMatch(/奖励/);
    const claimed = dispatchGameAction(chosen.state, { type: 'claim_reward', resume: true }, contentRegistry, balanceConfig);
    expect(claimed.state.simulationMode).toBe('running');
  });

  it('composes an extension pack without changing the stable registry categories', () => {
    const extended = composeContentPacks([{ packId: 'test-extension', version: 1, contentStatus: 'seed', content: { activities: [{ ...contentRegistry.activities![0], id: 'activity.test-extension' }] } }]);
    expect(extended.jobs.length).toBe(contentRegistry.jobs.length);
    expect(extended.activities?.some((entry) => entry.id === 'activity.test-extension')).toBe(true);
  });

  it('produces identical automatic simulation results from identical state and seed', () => {
    const balance = { ...balanceConfig, eventDailyLimit: 0 };
    const first = dispatchGameAction(createInitialState(contentRegistry, balance, 99), { type: 'start_week' }, contentRegistry, balance).state;
    const second = structuredClone(first);
    const resultA = advanceSimulation(first, 8 * 60, contentRegistry, balance);
    const resultB = advanceSimulation(second, 8 * 60, contentRegistry, balance);
    expect(resultA.state).toEqual(resultB.state);
  });
});
