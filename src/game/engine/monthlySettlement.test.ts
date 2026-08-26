import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameEffect } from '../content/contracts';
import { createInitialState } from './initialState';
import { closeMonth } from './monthlySettlement';

describe('annual world snapshots', () => {
  it('records the first achieved wealth tier at month close and keeps it in life history', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 12_000;
    state.time = { day: 28, hour: 8, minute: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.wealthMilestones).toEqual([{ id: 'savings', day: 28, netWorth: 12_000 }]);
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ category: 'event', title: '财富阶段：有积蓄', sourceId: 'savings', amount: 12_000 }));
    expect(effects).toContainEqual({ type: 'message', text: '财富阶段达到：有积蓄' });
  });

  it('charges a mortgage installment, reduces principal, and records the housing cost', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 10_000;
    state.time = { day: 28, hour: 8, minute: 0 };
    state.housing = { housingId: 'housing.seed-room', mode: 'owned' };
    state.mortgage = { housingId: 'housing.seed-room', remainingPrincipal: 4_350, monthlyPayment: 199, totalMonths: 24, paidMonths: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.cash).toBe(9_801);
    expect(state.mortgage).toMatchObject({ remainingPrincipal: 4168, paidMonths: 1 });
    expect(state.lastFinancialSummary?.consumption.categories).toMatchObject({ housing: 199 });
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '住房分期还款', category: 'housing', amount: -199 }));
  });

  it('settles rent and maintenance for a rented housing holding', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 20_000;
    state.housingHoldings = { 'housing.seed-room': { housingId: 'housing.seed-room', purchasePrice: 5_800, currentValuation: 5_800, occupancy: 'rented' } };
    state.time = { day: 28, hour: 8, minute: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.cash).toBe(21_035);
    expect(state.lastFinancialSummary?.income.categories).toMatchObject({ property_income: 1_176 });
    expect(state.lastFinancialSummary?.consumption.categories).toMatchObject({ maintenance: 141 });
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '收到独立单间租金', amount: 1_176 }));
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '独立单间维护', amount: -141 }));
  });

  it('evolves location development from real business and visit state at year close', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 337, hour: 8, minute: 0 };
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200 };
    state.locationVisits = { 'location.central': 3, 'location.riverside': 1 };
    const effects: GameEffect[] = [];

    closeMonth(state, 12, contentRegistry, balanceConfig, effects);

    expect(state.locationDevelopment).toMatchObject({ 'location.central': 2, 'location.riverside': 0 });
    expect(state.worldHistory?.[0]).toMatchObject({ year: 1, businessCount: 1, visitedLocationCount: 2, locationDevelopment: { 'location.central': 2, 'location.riverside': 0 } });
  });
});
