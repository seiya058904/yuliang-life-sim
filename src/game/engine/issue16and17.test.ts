import { describe, expect, it } from 'vitest';
import type { GameAction, GameState } from '../content/contracts';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { migrateGameState } from '../store/gameStore';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';

const act = (state: GameState, action: GameAction) => dispatchGameAction(state, action, contentRegistry, balanceConfig);
const restore = (state: unknown) => migrateGameState(JSON.parse(JSON.stringify(state)), contentRegistry, balanceConfig);
const schedule: GameAction = { type: 'set_plan', weekday: 7, slot: 'evening', activity: { kind: 'side_job', jobId: 'job.seed-remote', durationMinutes: 60 } };

function laptopOwner() {
  const initial = createInitialState(contentRegistry, balanceConfig, 1);
  initial.cash = 5000;
  initial.ability = 20;
  const bought = act(initial, { type: 'purchase_items', items: { 'item.seed-laptop': 1 } });
  expect(bought.error).toBeUndefined();
  expect(bought.state.unlockedJobIds).toEqual(expect.arrayContaining(['job.seed-remote', 'job.data-entry']));
  return bought.state;
}

describe('qualification migration (#16)', () => {
  it('preserves empty current qualifications after a real laptop purchase and repeated restores', () => {
    let state = laptopOwner();
    expect(act(state, schedule).error).toContain('兼职资格');
    for (let i = 0; i < 3; i++) {
      state = restore(state);
      expect(state.acquiredSideJobs).toEqual({});
      expect(state.applications).toEqual([]);
      expect(act(state, schedule).error).toContain('兼职资格');
    }
  });
  it.each([9, 10])('preserves an explicit partial qualification table in schema %s', version => {
    const state = laptopOwner();
    state.version = version;
    state.acquiredSideJobs = { 'job.seed-remote': { jobId: 'job.seed-remote', acquiredDay: 1 } };
    expect(restore(state).acquiredSideJobs).toEqual(state.acquiredSideJobs);
  });
  it('backfills only missing legacy qualifications, preserving old saves without application ids', () => {
    const state = laptopOwner();
    state.version = 9;
    delete state.acquiredSideJobs;
    const restored = restore(state);
    expect(Object.keys(restored.acquiredSideJobs!)).toEqual(expect.arrayContaining(['job.seed-remote', 'job.data-entry']));
    expect(act(restored, schedule).error).toBeUndefined();
    expect(restore(restored).acquiredSideJobs).toEqual(restored.acquiredSideJobs);
  });
  it('does not grant qualifications for a missing current-schema field', () => {
    const state = laptopOwner();
    delete state.acquiredSideJobs;
    expect(restore(state).acquiredSideJobs).toEqual({});
  });
  it.each([{ value: null }, { value: [] }, { value: 'invalid' }])('rejects a damaged qualification field $value', ({ value }) => {
    expect(() => restore({ ...laptopOwner(), acquiredSideJobs: value })).toThrow();
  });
});

function businessOwner(listed = true) {
  let state = createInitialState(contentRegistry, balanceConfig, 1);
  state.cash = 10000;
  state.unlockedCapabilities.push('business_license');
  state.unlockedBusinessIds.push('business.seed-kiosk');
  const actions: GameAction[] = [{ type: 'buy_business', businessId: 'business.seed-kiosk' }];
  if (listed) actions.push({ type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, { type: 'raise_business_funding', businessId: 'business.seed-kiosk' }, { type: 'list_business', businessId: 'business.seed-kiosk' });
  for (const action of actions) {
    const result = act(state, action);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  return state;
}

describe('listed holding sale lock (#17)', () => {
  it.each([1, 28, 29])('uses the same 28-day lock for partial sale and whole exit on day %s', day => {
    const state = businessOwner();
    expect(state.businesses['business.seed-kiosk'].listedDay).toBe(1);
    state.time.day = day;
    for (const action of [{ type: 'sell_business_equity', businessId: 'business.seed-kiosk', percent: 10 }, { type: 'sell_business', businessId: 'business.seed-kiosk' }] as GameAction[]) {
      const result = act(state, action);
      if (day < 29) {
        expect(result.error).toContain('锁定期');
        expect(result.state).toEqual(state);
      } else {
        expect(result.error).toBeUndefined();
        expect(result.state.cash).toBeGreaterThan(state.cash);
        if (action.type === 'sell_business') expect(result.state.businesses['business.seed-kiosk']).toBeUndefined();
      }
    }
  });
  it('keeps non-listed exit and the independent public holding guard', () => {
    expect(act(businessOwner(false), { type: 'sell_business', businessId: 'business.seed-kiosk' }).error).toBeUndefined();
    let state = businessOwner();
    state.time.day = 29;
    const bought = act(state, { type: 'buy_public_business_equity', businessId: 'business.seed-kiosk', percent: 10 });
    expect(bought.error).toBeUndefined();
    state = bought.state;
    const result = act(state, { type: 'sell_business', businessId: 'business.seed-kiosk' });
    expect(result.error).toContain('请先出售');
    expect(result.state).toEqual(state);
  });
});
