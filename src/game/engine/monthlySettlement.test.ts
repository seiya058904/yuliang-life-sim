import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameEffect } from '../content/contracts';
import { createInitialState } from './initialState';
import { closeMonth } from './monthlySettlement';

describe('annual world snapshots', () => {
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
