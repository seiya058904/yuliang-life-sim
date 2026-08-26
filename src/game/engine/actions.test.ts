import { describe, expect, it } from 'vitest';
import type { GameAction } from '../content/contracts';
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

  it('uses an owned consumable and records its effect without charging again', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.inventory['item.seed-coffee'] = 1;
    const result = dispatchGameAction(state, { type: 'use_item', itemId: 'item.seed-coffee' }, contentRegistry, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.inventory['item.seed-coffee']).toBe(0);
    expect(result.state.lifestyle).toBe(state.lifestyle + 1);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ category: 'purchase', title: '使用现磨咖啡' });
  });

  it('sells an owned item and records liquidation in life history', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.inventory['item.seed-phone'] = 1;
    state.itemPurchasePrices['item.seed-phone'] = 420;
    const result = dispatchGameAction(state, { type: 'sell_item', itemId: 'item.seed-phone', quantity: 1 }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.inventory['item.seed-phone']).toBe(0);
    expect(result.state.cash).toBe(state.cash + 189);
    expect(result.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'asset_liquidation', amount: 189 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ title: '出售实用手机', category: 'purchase', amount: 189 });
  });

  it('buys and resells the official diamond pendant with appearance feedback', () => {
    const state = { ...createInitialState(contentRegistry, balanceConfig, 1), cash: 20_000 };
    const bought = dispatchGameAction(state, { type: 'purchase_items', items: { 'item.diamond-pendant': 1 } }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();
    expect(bought.state.inventory['item.diamond-pendant']).toBe(1);
    expect(bought.state.attributes?.appearance).toBe((state.attributes?.appearance ?? 0) + 7);
    expect(bought.state.lifeHistory?.at(-1)).toMatchObject({ title: '购买小型钻石吊坠' });

    const sold = dispatchGameAction(bought.state, { type: 'sell_item', itemId: 'item.diamond-pendant', quantity: 1 }, contentRegistry, balanceConfig);
    expect(sold.error).toBeUndefined();
    expect(sold.state.inventory['item.diamond-pendant']).toBe(0);
    expect(sold.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'asset_liquidation', amount: 11692 });
    expect(sold.state.lifeHistory?.at(-1)).toMatchObject({ title: '出售小型钻石吊坠' });
  });

  it('uses a service without advancing time and records the service expense', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const result = dispatchGameAction(state, { type: 'use_service', serviceId: 'service.haircut-basic' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(state.cash - 68);
    expect(result.state.time).toEqual(state.time);
    expect(result.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'service', amount: 68 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ category: 'service', title: '基础理发' });
  });

  it('blocks a service during its cooldown and allows it again after the cooldown', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const first = dispatchGameAction(state, { type: 'use_service', serviceId: 'service.haircut-basic' }, contentRegistry, balanceConfig);
    const blocked = dispatchGameAction(first.state, { type: 'use_service', serviceId: 'service.haircut-basic' }, contentRegistry, balanceConfig);

    expect(blocked.error).toContain('冷却中');
    expect(blocked.state.cash).toBe(first.state.cash);

    const ready = dispatchGameAction({ ...blocked.state, time: { ...blocked.state.time, day: 15 } }, { type: 'use_service', serviceId: 'service.haircut-basic' }, contentRegistry, balanceConfig);
    expect(ready.error).toBeUndefined();
    expect(ready.state.lifeHistory?.filter((record) => record.sourceId === 'service.haircut-basic')).toHaveLength(2);
  });

  it('settles the nutrition coaching service with a real attribute effect', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const before = state.attributes?.fitness ?? 0;
    const result = dispatchGameAction(state, { type: 'use_service', serviceId: 'service.nutrition-coaching' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(state.cash - 160);
    expect(result.state.attributes?.fitness).toBe(before + 1);
    expect(result.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'service', amount: 160 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ category: 'service', title: '营养餐计划', sourceId: 'service.nutrition-coaching' });
  });

  it('settles the workday meal service and records its short cooldown', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const before = state.attributes?.mood ?? 0;
    const result = dispatchGameAction(state, { type: 'use_service', serviceId: 'service.workday-meal' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(state.cash - 42);
    expect(result.state.attributes?.mood).toBe(before + 1);
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ category: 'service', title: '工作日简餐', sourceId: 'service.workday-meal' });
    expect(dispatchGameAction(result.state, { type: 'use_service', serviceId: 'service.workday-meal' }, contentRegistry, balanceConfig).error).toContain('冷却中');
  });

  it('uses the vehicle annual service only when a vehicle is owned', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 1000;
    state.assets['asset.used-compact'] = { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 35000 };
    const result = dispatchGameAction(state, { type: 'use_service', serviceId: 'service.vehicle-annual' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(400);
    expect(result.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'maintenance', amount: 600 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ category: 'service', title: '车辆年度保养' });
  });

  it('starts and cancels a subscription with a persisted active record', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const started = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: 'subscription.mobile-basic', enabled: true }, contentRegistry, balanceConfig);
    expect(started.error).toBeUndefined();
    expect(started.state.activeSubscriptions?.['subscription.mobile-basic']).toMatchObject({ subscriptionId: 'subscription.mobile-basic', startedDay: 1 });
    const cancelled = dispatchGameAction(started.state, { type: 'manage_subscription', subscriptionId: 'subscription.mobile-basic', enabled: false }, contentRegistry, balanceConfig);
    expect(cancelled.error).toBeUndefined();
    expect(cancelled.state.activeSubscriptions?.['subscription.mobile-basic']).toBeUndefined();
    expect(cancelled.state.lifeHistory?.at(-1)).toMatchObject({ category: 'service', title: '取消基础通信套餐' });
  });

  it('negotiates a salary increase and records a voluntary departure', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const jobId = state.currentJobId!;
    state.jobExperience[jobId] = 20;

    const started = dispatchGameAction(state, { type: 'start_resignation' }, contentRegistry, balanceConfig);
    const outcome = dispatchGameAction(started.state, { type: 'advance_resignation' }, contentRegistry, balanceConfig);
    const stayed = dispatchGameAction(outcome.state, { type: 'choose_resignation', choice: 'stay' }, contentRegistry, balanceConfig);

    expect(stayed.error).toBeUndefined();
    expect(stayed.state.employment?.negotiationStage).toBe(1);
    expect(stayed.state.employment?.salaryAdjustment).toBe(Math.round((stayed.state.employment?.basePay ?? 0) * 0.05));

    const secondStart = dispatchGameAction(stayed.state, { type: 'start_resignation' }, contentRegistry, balanceConfig);
    const secondOutcome = dispatchGameAction(secondStart.state, { type: 'advance_resignation' }, contentRegistry, balanceConfig);
    const left = dispatchGameAction(secondOutcome.state, { type: 'choose_resignation', choice: 'leave' }, contentRegistry, balanceConfig);

    expect(left.error).toBeUndefined();
    expect(left.state.currentJobId).toBeUndefined();
    expect(left.state.employmentHistory).toContainEqual(expect.objectContaining({ jobId, startedDay: 1, endedDay: 1, reason: '离职', finalPay: (state.employment?.basePay ?? 0) + Math.round((state.employment?.basePay ?? 0) * 0.05) }));
  });

  it('tracks a wishlist item and completes the goal when the item is purchased', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const added = dispatchGameAction(state, { type: 'manage_wishlist', itemId: 'item.seed-phone', enabled: true }, contentRegistry, balanceConfig);
    expect(added.error).toBeUndefined();
    expect(added.state.wishlist).toContain('item.seed-phone');

    const purchased = dispatchGameAction(added.state, { type: 'purchase_items', items: { 'item.seed-phone': 1 } }, contentRegistry, balanceConfig);
    expect(purchased.error).toBeUndefined();
    expect(purchased.state.wishlist).not.toContain('item.seed-phone');
    expect(purchased.state.lifeHistory?.at(-1)).toMatchObject({ title: '愿望清单完成：实用手机' });
  });

  it('buys a reachable vehicle as an asset and records the vehicle purchase', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 50000;
    state.unlockedAssetIds.push('asset.used-compact');
    const result = dispatchGameAction(state, { type: 'buy_asset', assetId: 'asset.used-compact' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.assets['asset.used-compact']).toMatchObject({ purchasePrice: 35000, currentValuation: 35000 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ title: '买入实用二手小车', category: 'asset' });
  });

  it('buys and sells the gated high-value collectible through the asset ledger', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 20_000;
    state.unlockedCapabilities.push('market_insight');
    state.unlockedAssetIds.push('asset.vintage-watch');
    const bought = dispatchGameAction(state, { type: 'buy_asset', assetId: 'asset.vintage-watch' }, contentRegistry, balanceConfig);
    const sold = dispatchGameAction(bought.state, { type: 'sell_asset', assetId: 'asset.vintage-watch' }, contentRegistry, balanceConfig);

    expect(bought.error).toBeUndefined();
    expect(bought.state.assets['asset.vintage-watch']).toMatchObject({ purchasePrice: 18_000, currentValuation: 18_000 });
    expect(sold.error).toBeUndefined();
    expect(sold.state.assets['asset.vintage-watch']).toBeUndefined();
    expect(sold.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'asset_liquidation', amount: 18_000 });
    expect(sold.state.lifeHistory.at(-1)).toMatchObject({ category: 'asset', title: '出售限量机械腕表' });
  });

  it('sells an owned home, returns its valuation, and moves the player back to rent', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10000;
    state.unlockedHousingIds.push('housing.seed-room');
    const bought = dispatchGameAction(state, { type: 'move_housing', housingId: 'housing.seed-room', mode: 'owned' }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();

    const sold = dispatchGameAction(bought.state, { type: 'sell_housing' }, contentRegistry, balanceConfig);

    expect(sold.error).toBeUndefined();
    expect(sold.state.cash).toBe(10000);
    expect(sold.state.housing).toEqual({ housingId: 'housing.shared-room', mode: 'rent' });
    expect(sold.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'asset_liquidation', amount: 5800, sourceId: 'housing.seed-room' });
    expect(sold.state.lifeHistory?.at(-1)).toMatchObject({ title: '出售独立单间', category: 'housing' });
  });

  it('buys a home with a down payment and persists the remaining mortgage', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10000;
    state.unlockedHousingIds.push('housing.seed-room');
    const result = dispatchGameAction(state, { type: 'finance_housing', housingId: 'housing.seed-room' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(8550);
    expect(result.state.housing).toEqual({ housingId: 'housing.seed-room', mode: 'owned' });
    expect(result.state.mortgage).toMatchObject({ housingId: 'housing.seed-room', remainingPrincipal: 4350, monthlyPayment: 199, totalMonths: 24, paidMonths: 0 });
    expect(result.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'property_transfer', amount: 1450 });
    expect(result.state.lifeHistory?.at(-1)).toMatchObject({ title: '分期买下独立单间', category: 'housing' });
  });

  it('buys a second home, switches it to rental, and can sell it', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 20_000;
    state.unlockedHousingIds = [...new Set([...state.unlockedHousingIds, 'housing.seed-room'])];

    const bought = dispatchGameAction(state, { type: 'buy_rental_housing', housingId: 'housing.seed-room' }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();
    expect(bought.state.housingHoldings?.['housing.seed-room']).toMatchObject({ housingId: 'housing.seed-room', purchasePrice: 5_800, occupancy: 'vacant' });
    expect(bought.state.housing.housingId).toBe('housing.shared-room');

    const rented = dispatchGameAction(bought.state, { type: 'set_housing_rental', housingId: 'housing.seed-room', rented: true }, contentRegistry, balanceConfig);
    expect(rented.error).toBeUndefined();
    expect(rented.state.housingHoldings?.['housing.seed-room']?.occupancy).toBe('rented');

    const sold = dispatchGameAction(rented.state, { type: 'sell_rental_housing', housingId: 'housing.seed-room' }, contentRegistry, balanceConfig);
    expect(sold.error).toBeUndefined();
    expect(sold.state.housingHoldings?.['housing.seed-room']).toBeUndefined();
    expect(sold.state.cash).toBe(20_000);
    expect(sold.state.lifeHistory.at(-1)).toMatchObject({ category: 'housing', title: '出售独立单间' });
  });

  it('unlocks, buys, locks, and later exits a private-equity opportunity', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 20_000;
    state.time = { day: 30, hour: 8, minute: 0 };
    state.relationships['character.xuke'] = 40;
    state.pendingEventId = 'event.private-equity-introduction';
    state.simulationMode = 'event';

    const introduced = dispatchGameAction(state, { type: 'choose_event', eventId: 'event.private-equity-introduction', choiceId: 'learn' }, contentRegistry, balanceConfig);
    expect(introduced.error).toBeUndefined();
    expect(introduced.state.flags.private_equity_access).toBe(true);
    const acknowledged = dispatchGameAction(introduced.state, { type: 'claim_reward', resume: true }, contentRegistry, balanceConfig);

    const bought = dispatchGameAction(acknowledged.state, { type: 'buy_investment', investmentId: 'investment.citylife-private-equity', units: 1 }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();
    expect(bought.state.investments?.['investment.citylife-private-equity']).toMatchObject({ units: 1, lastValuationDay: 30 });
    expect(bought.state.investments?.['investment.citylife-private-equity']?.averageCost).toBeGreaterThan(9_000);

    const locked = dispatchGameAction(bought.state, { type: 'sell_investment', investmentId: 'investment.citylife-private-equity', units: 1 }, contentRegistry, balanceConfig);
    expect(locked.error).toBe('私人股权仍在锁定期内');

    const offered = { ...bought.state, time: { day: 120, hour: 8, minute: 0 }, pendingEventId: 'event.private-equity-exit-offer', simulationMode: 'event' as const };
    const exitEvent = dispatchGameAction(offered, { type: 'choose_event', eventId: 'event.private-equity-exit-offer', choiceId: 'accept' }, contentRegistry, balanceConfig);
    expect(exitEvent.error).toBeUndefined();
    expect(exitEvent.state.flags.private_equity_exit_offer).toBe(true);
    const acknowledgedExit = dispatchGameAction(exitEvent.state, { type: 'claim_reward', resume: true }, contentRegistry, balanceConfig);
    const sold = dispatchGameAction(acknowledgedExit.state, { type: 'sell_investment', investmentId: 'investment.citylife-private-equity', units: 1 }, contentRegistry, balanceConfig);
    expect(sold.error).toBeUndefined();
    expect(sold.state.investments?.['investment.citylife-private-equity']).toBeUndefined();
    expect(sold.state.lifeHistory.at(-1)?.category).toBe('investment');
  });

  it('updates owned business operating levers and records the decision in life history', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 5000;
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.seed-kiosk');
    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();

    const updated = dispatchGameAction(bought.state, { type: 'update_business', businessId: 'business.seed-kiosk', priceLevel: 2, wageLevel: 0, inventoryLevel: 2 }, contentRegistry, balanceConfig);

    expect(updated.error).toBeUndefined();
    expect(updated.state.businesses['business.seed-kiosk']).toMatchObject({ priceLevel: 2, wageLevel: 0, inventoryLevel: 2 });
    expect(updated.state.lifeHistory?.at(-1)).toMatchObject({ title: '调整早餐与咖啡档经营', category: 'business' });
  });

  it('records the business location when a business is purchased', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 5000;
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.seed-kiosk');

    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);

    expect(bought.error).toBeUndefined();
    expect(bought.state.locationVisits?.['location.central']).toBe(1);
  });

  it('acquires a second unlocked business and records the holding-group transfer', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 15000;
    state.ability = 18;
    state.unlockedCapabilities.push('business_license', 'remote_work');
    state.unlockedBusinessIds.push('business.seed-kiosk', 'business.online-store');
    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const acquired = dispatchGameAction(bought.state, { type: 'acquire_business', businessId: 'business.online-store' }, contentRegistry, balanceConfig);

    expect(acquired.error).toBeUndefined();
    expect(acquired.state.businesses['business.online-store']).toMatchObject({ purchasePrice: 8580, acquiredDay: 1, acquiredFromBusinessId: 'business.seed-kiosk' });
    expect(acquired.state.locationVisits?.['location.industrial']).toBe(1);
    expect(acquired.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', amount: 8580, cashDelta: -8580 });
    expect(acquired.state.lifeHistory.at(-1)).toMatchObject({ category: 'business', title: '并购线上小店', amount: -8580 });
  });

  it('joins an unlocked partner business with a partial holding and records the contribution', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10_000;
    state.ability = 18;
    state.relationships['character.seed-zhou'] = 20;
    state.unlockedCapabilities.push('business_license', 'remote_work');
    state.unlockedBusinessIds.push('business.online-store');

    const joined = dispatchGameAction(state, { type: 'join_business_partnership', businessId: 'business.online-store' }, contentRegistry, balanceConfig);

    expect(joined.error).toBeUndefined();
    expect(joined.state.businesses['business.online-store']).toMatchObject({ purchasePrice: 4200, equityPercent: 50, publicFloatPercent: 0, partnerCharacterId: 'character.seed-zhou' });
    expect(joined.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', amount: 4200, cashDelta: -4200 });
    expect(joined.state.lifeHistory.at(-1)).toMatchObject({ category: 'business', title: '加入线上小店合伙', amount: -4200 });
  });

  it('buys the unlocked consulting studio and records its operating location', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 30_000;
    state.ability = 28;
    state.reputation = 20;
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.consulting-studio');

    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.consulting-studio' }, contentRegistry, balanceConfig);

    expect(bought.error).toBeUndefined();
    expect(bought.state.businesses['business.consulting-studio']).toMatchObject({ purchasePrice: 24000, equityPercent: 100 });
    expect(bought.state.locationVisits?.['location.central']).toBe(1);
    expect(bought.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', amount: 24000 });
    expect(bought.state.lifeHistory.at(-1)).toMatchObject({ title: '买入咨询工作室', category: 'business' });
  });

  it('joins the consulting studio partnership after the authored project', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 15_000;
    state.ability = 28;
    state.reputation = 20;
    state.attributes = { appearance: 10, fitness: 28, mood: 50, network: 0, knowledge: 28, professional: 28, communication: 28 };
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.consulting-studio');
    state.relationships['character.guqing'] = 40;
    state.flags.consulting_project_completed = true;

    const joined = dispatchGameAction(state, { type: 'join_business_partnership', businessId: 'business.consulting-studio' }, contentRegistry, balanceConfig);

    expect(joined.error).toBeUndefined();
    expect(joined.state.businesses['business.consulting-studio']).toMatchObject({ purchasePrice: 12000, equityPercent: 60, partnerCharacterId: 'character.guqing' });
    expect(joined.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', amount: 12000 });
    expect(joined.state.lifeHistory.at(-1)).toMatchObject({ title: '加入咨询工作室合伙', category: 'business' });
  });

  it('keeps business capital separate and records one dilutive funding round', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10000;
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.seed-kiosk');
    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const injected = dispatchGameAction(bought.state, { type: 'inject_business_capital', businessId: 'business.seed-kiosk', amount: 1000 }, contentRegistry, balanceConfig);
    const funded = dispatchGameAction(injected.state, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const holding = funded.state.businesses['business.seed-kiosk'];

    expect(funded.error).toBeUndefined();
    expect(holding.capitalInvested).toBe(1000);
    expect(holding.fundingRaised).toBe(2400);
    expect(holding.equityPercent).toBe(80);
    expect(funded.state.financialLedger?.entries.filter((entry) => entry.sourceId === 'business.seed-kiosk' && entry.category === 'business_transfer')).toHaveLength(3);
    expect(funded.state.lifeHistory.filter((entry) => entry.sourceId === 'business.seed-kiosk')).toHaveLength(3);

    const second = dispatchGameAction(funded.state, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const third = dispatchGameAction(second.state, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const fourth = dispatchGameAction(third.state, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    expect(second.error).toBeUndefined();
    expect(third.error).toBeUndefined();
    expect(third.state.businesses['business.seed-kiosk']).toMatchObject({ fundingRound: 3, equityPercent: 50 });
    expect(fourth.error).toBe('这项企业已达到融资轮次上限');
  });

  it('exits a funded business at its equity-adjusted valuation', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10000;
    state.unlockedCapabilities.push('business_license');
    state.unlockedBusinessIds.push('business.seed-kiosk');
    const bought = dispatchGameAction(state, { type: 'buy_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const funded = dispatchGameAction(bought.state, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const exited = dispatchGameAction(funded.state, { type: 'sell_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);

    expect(exited.error).toBeUndefined();
    expect(exited.state.businesses['business.seed-kiosk']).toBeUndefined();
    expect(exited.state.cash).toBe(10000 - 3200 + 2400 + 2912);
    expect(exited.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', group: 'asset_liquidation', amount: 2912, cashDelta: 2912 });
    expect(exited.state.lifeHistory?.at(-1)).toMatchObject({ title: '退出早餐与咖啡档', category: 'business' });
  });

  it('lists a mature business and sells a partial public equity stake', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 10000;
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, fundingRaised: 4800, fundingRound: 2, equityPercent: 65 };
    const listed = dispatchGameAction(state, { type: 'list_business', businessId: 'business.seed-kiosk' }, contentRegistry, balanceConfig);
    const lockedSale = dispatchGameAction(listed.state, { type: 'sell_business_equity', businessId: 'business.seed-kiosk', percent: 10 }, contentRegistry, balanceConfig);
    const afterLock = { ...listed.state, time: { ...listed.state.time, day: 29 } };
    const sold = dispatchGameAction(afterLock, { type: 'sell_business_equity', businessId: 'business.seed-kiosk', percent: 10 }, contentRegistry, balanceConfig);

    expect(listed.error).toBeUndefined();
    expect(listed.state.businesses['business.seed-kiosk'].listed).toBe(true);
    expect(listed.state.businesses['business.seed-kiosk'].listedDay).toBe(1);
    expect(listed.state.businesses['business.seed-kiosk'].publicFloatPercent).toBe(35);
    expect(lockedSale.error).toBe('上市股权仍在锁定期内');
    expect(sold.error).toBeUndefined();
    expect(sold.state.businesses['business.seed-kiosk'].equityPercent).toBe(55);
    expect(sold.state.businesses['business.seed-kiosk'].publicFloatPercent).toBe(45);
    expect(sold.state.cash).toBe(10000 + 520);
    expect(sold.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', amount: 520, cashDelta: 520 });
    expect(sold.state.lifeHistory.at(-1)).toMatchObject({ category: 'business', title: '出售早餐与咖啡档 10% 股权' });

    const bought = dispatchGameAction(sold.state, { type: 'buy_business_equity', businessId: 'business.seed-kiosk', percent: 5 }, contentRegistry, balanceConfig);
    expect(bought.error).toBeUndefined();
    expect(bought.state.businesses['business.seed-kiosk'].equityPercent).toBe(60);
    expect(bought.state.businesses['business.seed-kiosk'].publicFloatPercent).toBe(40);
    expect(bought.state.cash).toBe(10000 + 520 - 260);
    expect(bought.state.financialLedger?.entries.at(-1)).toMatchObject({ category: 'business_transfer', group: 'asset_allocation', amount: 260, cashDelta: -260 });
    expect(bought.state.lifeHistory.at(-1)).toMatchObject({ category: 'business', title: '回购早餐与咖啡档 5% 股权' });
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

  it('turns an event choice into a persisted headhunter opportunity instead of an automatic offer', () => {
    const event = {
      id: 'event.test-headhunter', contentStatus: 'seed' as const, name: '猎头联系', description: '测试猎头联系。',
      title: '猎头联系', body: '有猎头看过你的经历。', category: 'career' as const, weight: 1, cooldownDays: 99,
      choices: [
        { id: 'listen', text: '听听看', effects: [{ type: 'relation' as const, characterId: 'character.seed-lin', amount: 1 }], opportunity: { jobId: 'job.category-operations-expert', companyId: 'company.xinghe', route: 'headhunter' as const, source: '许衡主动联系', expiresInDays: 14, salaryRange: [780, 900] as const } },
        { id: 'decline', text: '目前不考虑', effects: [{ type: 'stat' as const, stat: 'reputation' as const, amount: 1 }] },
      ],
    };
    const content = { ...contentRegistry, events: [...contentRegistry.events, event] };
    const state = { ...createInitialState(content, balanceConfig, 1), pendingEventId: event.id, simulationMode: 'event' as const };

    const chosen = dispatchGameAction(state, { type: 'choose_event', eventId: event.id, choiceId: 'listen' }, content, balanceConfig);

    expect(chosen.error).toBeUndefined();
    expect(chosen.state.opportunities).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: 'job.category-operations-expert', route: 'headhunter', source: '许衡主动联系', expiresDay: 15, salaryRange: [780, 900] })]));
    expect(chosen.state.applications).toHaveLength(0);
  });

  it('settles a city development event into persisted location state and event history', () => {
    const event = {
      id: 'event.test-city-development', contentStatus: 'seed' as const, name: '城市建设', description: '测试城市建设。',
      title: '城市建设', body: '临江区的公共空间正在升级。', category: 'life' as const, weight: 1, cooldownDays: 99,
      choices: [{ id: 'support', text: '支持建设', effects: [{ type: 'location_development' as const, locationId: 'location.riverside', amount: 2 }] }],
    };
    const content = { ...contentRegistry, events: [...contentRegistry.events, event] };
    const state = { ...createInitialState(content, balanceConfig, 1), pendingEventId: event.id, simulationMode: 'event' as const };

    const chosen = dispatchGameAction(state, { type: 'choose_event', eventId: event.id, choiceId: 'support' }, content, balanceConfig);

    expect(chosen.error).toBeUndefined();
    expect(chosen.state.locationDevelopment?.['location.riverside']).toBe(2);
    expect(chosen.state.lifeHistory.at(-1)).toMatchObject({ category: 'event', title: '城市建设' });
    expect(chosen.state.pendingReward?.lines).toContain('临江区发展 +2');
  });

  it('applies the industrial hub event to the persisted location state', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.pendingEventId = 'event.industrial-hub-upgrade';
    state.simulationMode = 'event';
    const result = dispatchGameAction(state, { type: 'choose_event', eventId: 'event.industrial-hub-upgrade', choiceId: 'support' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.locationDevelopment?.['location.industrial']).toBe(1);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ category: 'event', sourceId: 'event.industrial-hub-upgrade' });
  });

  it('turns a company expansion choice into an internal consultant opportunity', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.currentJobId = 'job.category-operations-expert';
    state.employment = { ...state.employment!, jobId: 'job.category-operations-expert', companyId: 'company.xinghe', basePay: 720, salaryAdjustment: 0 };
    state.reputation = 28;
    state.pendingEventId = 'event.xinghe-expansion';
    state.simulationMode = 'event';

    const chosen = dispatchGameAction(state, { type: 'choose_event', eventId: 'event.xinghe-expansion', choiceId: 'join-project' }, contentRegistry, balanceConfig);

    expect(chosen.error).toBeUndefined();
    expect(chosen.state.opportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: 'job.independent-consultant', companyId: 'company.xinghe', route: 'internal', expiresDay: 22 }),
    ]));
    expect(chosen.state.lifeHistory.at(-1)).toMatchObject({ category: 'event', title: '星河科技的业务扩展' });
  });

  it('runs a requested month through the normal weekly and monthly settlement loop', () => {
    const state = createInitialState(contentRegistry, { ...balanceConfig, eventDailyLimit: 0 }, 1);

    const result = dispatchGameAction(state, { type: 'advance_period', months: 1 }, contentRegistry, { ...balanceConfig, eventDailyLimit: 0 });

    expect(result.error).toBeUndefined();
    expect(result.state.time.day).toBe(29);
    expect(result.state.simulationMode).toBe('monthly_summary');
    expect(result.state.pendingMonthlySummary?.month).toBe(1);
    expect(result.state.financialHistory).toHaveLength(1);
  });

  it('applies the contact preference bonus when the interaction category matches', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 200;

    const result = dispatchGameAction(state, { type: 'interact_character', interactionId: 'interaction.coffee-with-recruiter', optionId: 'coffee' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.relationships['character.chenyu']).toBe(6);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ detail: '符合对方偏好，关系进展更顺利' });
  });

  it('consumes a gift, applies the recipient preference, and queues a message', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.inventory['gift.flowers'] = 1;

    const result = dispatchGameAction(state, { type: 'gift_item', characterId: 'character.seed-lin', itemId: 'gift.flowers' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.inventory['gift.flowers']).toBe(0);
    expect(result.state.relationships['character.seed-lin']).toBe(11);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ title: '送给林晨：一束花', detail: expect.stringContaining('符合对方偏好') });
    expect(result.state.messages?.at(-1)).toMatchObject({ characterId: 'character.seed-lin', read: false });
  });

  it('settles the official business interaction with Zhou and queues a persisted message', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 500;

    const result = dispatchGameAction(state, { type: 'interact_character', interactionId: 'interaction.business-with-zhou', optionId: 'visit' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.relationships['character.seed-zhou']).toBe(12);
    expect(result.state.cash).toBe(420);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ category: 'relationship', sourceId: 'interaction.business-with-zhou' });
    expect(result.state.messages?.at(-1)).toMatchObject({ characterId: 'character.seed-zhou', read: false, sourceId: 'interaction.business-with-zhou' });
  });

  it('diminishes repeated relationship gains without decaying the stored relationship', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.cash = 1_000;
    const first = dispatchGameAction(state, { type: 'interact_character', interactionId: 'interaction.coffee-with-recruiter', optionId: 'coffee' }, contentRegistry, balanceConfig);
    const second = dispatchGameAction(first.state, { type: 'interact_character', interactionId: 'interaction.coffee-with-recruiter', optionId: 'coffee' }, contentRegistry, balanceConfig);
    const third = dispatchGameAction(second.state, { type: 'interact_character', interactionId: 'interaction.coffee-with-recruiter', optionId: 'coffee' }, contentRegistry, balanceConfig);

    expect(first.state.relationships['character.chenyu']).toBe(6);
    expect(second.state.relationships['character.chenyu']).toBe(11);
    expect(third.state.relationships['character.chenyu']).toBe(14);
    expect(third.state.lifeHistory.at(-1)?.detail).toContain('近期重复互动收益递减');
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

  it('only allows an acquired long-term side job to enter the weekly plan', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const blocked = dispatchGameAction(state, { type: 'set_plan', weekday: 6, slot: 'day', activity: { kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 } }, contentRegistry, balanceConfig);
    expect(blocked.error).toContain('兼职资格');

    state.acquiredSideJobs = { 'job.course-teaching-assistant': { jobId: 'job.course-teaching-assistant', acquiredDay: 1 } };
    const scheduled = dispatchGameAction(state, { type: 'set_plan', weekday: 6, slot: 'day', activity: { kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 } }, contentRegistry, balanceConfig);
    expect(scheduled.error).toBeUndefined();
    expect(scheduled.state.weeklyPlan.days[6].day).toEqual({ kind: 'side_job', jobId: 'job.course-teaching-assistant', durationMinutes: 240 });
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

    const message = relationship.state.messages?.[0];
    expect(message).toMatchObject({ characterId: 'character.seed-lin', read: false });
    const read = dispatchGameAction(relationship.state, { type: 'read_message', messageId: message!.id }, contentRegistry, balanceConfig);
    expect(read.error).toBeUndefined();
    expect(read.state.messages?.[0].read).toBe(true);
    expect(read.state.lifeHistory?.at(-1)).toMatchObject({ category: 'relationship', title: expect.stringContaining('查看消息') });
    const duplicateRead = dispatchGameAction(read.state, { type: 'read_message', messageId: message!.id }, contentRegistry, balanceConfig);
    expect(duplicateRead.error).toBeUndefined();
    expect(duplicateRead.state.lifeHistory).toHaveLength(read.state.lifeHistory.length);

    const investor = { ...relationship.state, cash: 10_000 };
    const investment = dispatchGameAction(investor, { type: 'buy_investment', investmentId: 'investment.seed-index', units: 1 }, contentRegistry, balanceConfig);
    expect(investment.error).toBeUndefined();
    expect(investment.state.lifeHistory?.at(-1)).toMatchObject({ category: 'investment', day: 1, title: '买入稳健指数基金', sourceId: 'investment.seed-index' });

    const equityBought = dispatchGameAction({ ...createInitialState(contentRegistry, balanceConfig, 1), cash: 1000 }, { type: 'buy_investment', investmentId: 'investment.qiming-equity', units: 1 }, contentRegistry, balanceConfig);
    const equitySold = dispatchGameAction(equityBought.state, { type: 'sell_investment', investmentId: 'investment.qiming-equity', units: 1 }, contentRegistry, balanceConfig);
    expect(equityBought.error).toBeUndefined();
    expect(equityBought.state.investments?.['investment.qiming-equity']).toMatchObject({ units: 1 });
    expect(equitySold.error).toBeUndefined();
    expect(equitySold.state.lifeHistory?.at(-1)).toMatchObject({ category: 'investment', sourceId: 'investment.qiming-equity' });

    const beforeFailureCount = investment.state.lifeHistory?.length ?? 0;
    const failed = dispatchGameAction({ ...investment.state, cash: 0 }, { type: 'purchase_items', items: { 'item.seed-phone': 1 } }, contentRegistry, balanceConfig);
    expect(failed.error).toBeDefined();
    expect(failed.state.lifeHistory).toHaveLength(beforeFailureCount);
  });

  it('executes an offered gig once and records its income and career progress', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 9);
    state.gigs = [{ id: 'gig.test', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 1080, endMinute: 1320, pay: 76, source: '测试市场' }];
    const result = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.test' }, contentRegistry, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.cash).toBe(balanceConfig.initialCash + 76);
    expect(result.state.gigs).toEqual([]);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ category: 'career', title: '完成同城配送', amount: 76 });
  });

  it('starts an official storyline and settles a chosen relationship branch', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 9);
    const started = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.remote-connection' } as GameAction, contentRegistry, balanceConfig);
    expect(started.error).toBeUndefined();
    expect(started.state.storylineStages?.['storyline.remote-connection']).toBe('invite');

    const advanced = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.remote-connection', branchId: 'meet' } as GameAction, contentRegistry, balanceConfig);
    expect(advanced.error).toBeUndefined();
    expect(advanced.state.storylineStages?.['storyline.remote-connection']).toBe('follow-up');
    expect(advanced.state.relationships['character.xuke']).toBeGreaterThan(state.relationships['character.xuke']);
    expect(advanced.state.opportunities).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: 'job.delivery-shift', source: '徐可的朋友推荐' })]));
    expect(advanced.state.lifeHistory.at(-1)).toMatchObject({ category: 'relationship', sourceId: 'storyline.remote-connection' });
  });

  it('gates the warehouse career storyline and creates its internal opportunity', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 9);
    const locked = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.warehouse-to-office' }, contentRegistry, balanceConfig);
    expect(locked.error).toContain('条件');
    const eligible = { ...state, currentJobId: 'job.huanliu-warehouse-assistant', employment: { ...state.employment!, jobId: 'job.huanliu-warehouse-assistant', companyId: 'company.huanliu' } };
    const started = dispatchGameAction(eligible, { type: 'start_storyline', storylineId: 'storyline.warehouse-to-office' }, contentRegistry, balanceConfig);
    const chosen = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.warehouse-to-office', branchId: 'interested' }, contentRegistry, balanceConfig);
    expect(chosen.error).toBeUndefined();
    expect(chosen.state.opportunities).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: 'job.huanliu-dispatch-coordinator', source: '环流物流内部调度机会' })]));
    expect(chosen.state.lifeHistory.at(-1)).toMatchObject({ title: '从仓库走进办公室：有兴趣' });
  });

  it('runs the consulting project storyline through preparation and a settled outcome', () => {
    const state = { ...createInitialState(contentRegistry, balanceConfig, 7), currentJobId: 'job.research-assistant', employment: { ...createInitialState(contentRegistry, balanceConfig, 7).employment!, jobId: 'job.research-assistant', companyId: 'company.clearview-consulting' } };
    const started = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.first-real-project' }, contentRegistry, balanceConfig);
    const invited = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.first-real-project', branchId: 'join' }, contentRegistry, balanceConfig);
    const prepared = dispatchGameAction(invited.state, { type: 'choose_storyline_branch', storylineId: 'storyline.first-real-project', branchId: 'deep-prep' }, contentRegistry, balanceConfig);
    const settled = dispatchGameAction(prepared.state, { type: 'choose_storyline_branch', storylineId: 'storyline.first-real-project', branchId: 'data-judgment' }, contentRegistry, balanceConfig);
    expect(settled.error).toBeUndefined();
    expect(settled.state.cash).toBe(balanceConfig.initialCash + 500);
    expect(settled.state.flags.consulting_project_completed).toBe(true);
    expect(settled.state.lifeHistory.at(-1)).toMatchObject({ title: '第一次真正的项目：根据现有数据给出初步判断' });
  });

  it('settles the ecommerce big-promotion storyline and unlocks its growth route', () => {
    const initial = createInitialState(contentRegistry, balanceConfig, 11);
    const state = { ...initial, currentJobId: 'job.order-operations-assistant', employment: { ...initial.employment!, jobId: 'job.order-operations-assistant', companyId: 'company.starbridge-ecommerce' } };
    const started = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.big-promotion' }, contentRegistry, balanceConfig);
    const joined = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.big-promotion', branchId: 'core' }, contentRegistry, balanceConfig);
    const settled = dispatchGameAction(joined.state, { type: 'choose_storyline_branch', storylineId: 'storyline.big-promotion', branchId: 'close' }, contentRegistry, balanceConfig);
    expect(settled.error).toBeUndefined();
    expect(settled.state.cash).toBe(balanceConfig.initialCash + 500);
    expect(settled.state.unlockedJobIds).toContain('job.growth-operations');
    expect(settled.state.flags.big_promotion_completed).toBe(true);
  });

  it('turns a client poaching question into a time-limited referral opportunity', () => {
    const initial = createInitialState(contentRegistry, balanceConfig, 13);
    const state = { ...initial, currentJobId: 'job.business-analyst', employment: { ...initial.employment!, jobId: 'job.business-analyst', companyId: 'company.clearview-consulting' } };
    const started = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.client-poach' }, contentRegistry, balanceConfig);
    const chosen = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.client-poach', branchId: 'hear-terms' }, contentRegistry, balanceConfig);
    expect(chosen.error).toBeUndefined();
    expect(chosen.state.opportunities).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: 'job.independent-consultant', source: '合作公司负责人私下邀请' })]));
    expect(chosen.state.lifeHistory.at(-1)).toMatchObject({ title: '客户想把你挖走：听听条件' });
  });

  it('settles the employee purchase plan as a technology discount', () => {
    const initial = createInitialState(contentRegistry, balanceConfig, 15);
    const state = { ...initial, reputation: 12, currentJobId: 'job.customer-experience-assistant', employment: { ...initial.employment!, jobId: 'job.customer-experience-assistant', companyId: 'company.isle-lifestyle' } };
    const started = dispatchGameAction(state, { type: 'start_storyline', storylineId: 'storyline.employee-purchase' }, contentRegistry, balanceConfig);
    const chosen = dispatchGameAction(started.state, { type: 'choose_storyline_branch', storylineId: 'storyline.employee-purchase', branchId: 'discount' }, contentRegistry, balanceConfig);
    expect(chosen.error).toBeUndefined();
    expect(chosen.state.discounts).toEqual(expect.arrayContaining([expect.objectContaining({ percent: 25, tags: ['technology'] })]));
    expect(chosen.state.flags.employee_purchase_access).toBe(true);
  });

  it('completes a reached milestone with its reward, history, and monthly highlight', () => {
    const state = { ...createInitialState(contentRegistry, balanceConfig, 12), cash: 10_000 };
    const result = dispatchGameAction(state, { type: 'start_week' }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.completedMilestones).toContain('milestone.cash-10000');
    expect(result.state.reputation).toBe(state.reputation + 3);
    expect(result.state.lifeHistory.at(-1)).toMatchObject({ category: 'event', sourceId: 'milestone.cash-10000', title: '达成里程碑：第一万现金' });
    expect(result.state.monthlyHighlights).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'attribute_milestone', sourceId: 'milestone.cash-10000' })]));
    expect(result.effects).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'message', text: '达成里程碑：第一万现金' })]));
  });
});
