import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { createInitialState } from './initialState';
import { commuteCostMultiplier, locationForCurrentJob, locationSummary } from './locations';

describe('city locations', () => {
  it('resolves stable locations and makes a cross-region commute visible', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    expect(locationForCurrentJob(state, contentRegistry)?.id).toBe('location.industrial');
    expect(commuteCostMultiplier(state, contentRegistry)).toBeGreaterThan(1);
    expect(locationSummary(contentRegistry)).toHaveLength(3);
  });
});
