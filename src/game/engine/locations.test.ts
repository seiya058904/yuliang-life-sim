import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { createInitialState } from './initialState';
import { commuteCostMultiplier, housingPrice, housingRentPerDay, locationForCurrentJob, locationSummary, recordLocationVisit } from './locations';

describe('city locations', () => {
  it('resolves stable locations and makes a cross-region commute visible', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    expect(locationForCurrentJob(state, contentRegistry)?.id).toBe('location.industrial');
    expect(commuteCostMultiplier(state, contentRegistry)).toBeGreaterThan(1);
    expect(locationSummary(contentRegistry)).toHaveLength(6);
  });

  it('applies a vehicle convenience factor to commute cost', () => {
    const withoutVehicle = createInitialState(contentRegistry, balanceConfig, 3);
    const withVehicle = structuredClone(withoutVehicle);
    withVehicle.assets['asset.used-compact'] = {
      assetId: 'asset.used-compact',
      purchasePrice: 35000,
      purchaseDay: 1,
      currentValuation: 35000,
    };

    expect(commuteCostMultiplier(withVehicle, contentRegistry)).toBeCloseTo(commuteCostMultiplier(withoutVehicle, contentRegistry) * 0.8);
  });

  it('records visits without introducing a player level', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);

    recordLocationVisit(state, 'location.riverside', contentRegistry);
    recordLocationVisit(state, 'location.riverside', contentRegistry);
    recordLocationVisit(state, 'location.unknown', contentRegistry);

    expect(state.locationVisits).toEqual({ 'location.riverside': 2 });
  });

  it('applies the persisted location development level consistently to housing prices and rent', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.locationDevelopment = { 'location.central': 3 };
    const home = contentRegistry.housing.find((entry) => entry.id === 'housing.city-condo')!;

    expect(housingRentPerDay(state, home)).toBe(Math.round(home.rentPerDay * 1.06));
    expect(housingPrice(state, home)).toBe(Math.round(home.price! * 1.09));
  });

  it('reduces cross-region commute with development at the work location', () => {
    const baseline = createInitialState(contentRegistry, balanceConfig, 3);
    const developed = structuredClone(baseline);
    developed.locationDevelopment = { 'location.industrial': 3 };

    expect(commuteCostMultiplier(developed, contentRegistry)).toBeCloseTo(commuteCostMultiplier(baseline, contentRegistry) * 0.97);
  });
});
