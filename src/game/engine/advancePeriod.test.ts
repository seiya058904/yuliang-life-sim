import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';

const content = contentRegistry;

function manualPlanner(seed = 9) {
  const state = createInitialState(content, balanceConfig, seed);
  state.autoRepeatPlan = false;
  state.weeklyPlan = { ...state.weeklyPlan, autoRepeat: false };
  return state;
}

describe('advance_period restores the player auto-repeat preference', () => {
  it('restores autoRepeatPlan=false after the long run stops at a monthly summary', () => {
    const state = manualPlanner();
    const result = dispatchGameAction(state, { type: 'advance_period', months: 1 }, content, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.autoRepeatPlan).toBe(false);
    expect(result.state.weeklyPlan.autoRepeat).toBe(false);
  });

  it('restores autoRepeatPlan=false when the run stops at an event gate', () => {
    const state = manualPlanner();
    const result = dispatchGameAction(state, { type: 'advance_period', months: 3 }, content, balanceConfig);
    expect(result.error).toBeUndefined();
    // With the default balance an event fires within three months; whenever the
    // run stops (event gate or month summary), the preference must be restored.
    expect(['event', 'reward', 'monthly_summary', 'paused', 'planning']).toContain(result.state.simulationMode);
    expect(result.state.autoRepeatPlan).toBe(false);
    expect(result.state.weeklyPlan.autoRepeat).toBe(false);
  });

  it('keeps autoRepeatPlan=true for players who opted in', () => {
    const state = createInitialState(content, balanceConfig, 21);
    state.autoRepeatPlan = true;
    state.weeklyPlan = { ...state.weeklyPlan, autoRepeat: true };
    const result = dispatchGameAction(state, { type: 'advance_period', months: 1 }, content, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.autoRepeatPlan).toBe(true);
    expect(result.state.weeklyPlan.autoRepeat).toBe(true);
  });
});
