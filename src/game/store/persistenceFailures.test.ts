import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createGameStore, EMERGENCY_SAVE_PREFIX, SAVE_KEY } from './gameStore';
import { canonicalSaveDouble, canonicalSaveRaw, failNextCanonicalCommit, settleCanonicalSave, yieldToCommitQueue } from './canonicalSaveTestDouble';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { canonicalSaveDouble().release(); vi.useRealTimers(); });
const create = () => createGameStore(contentRegistry, balanceConfig);
const savedSpeed = () => JSON.parse(canonicalSaveRaw()!).simulationSpeed;
const emergency = () => Object.keys(localStorage).filter(key => key.startsWith(EMERGENCY_SAVE_PREFIX)).map(key => JSON.parse(localStorage.getItem(key)!));

describe('persistence failure ownership', () => {
  it.each([false, true])('retains failed dirty state for unload and explicit retry (queued=%s)', async queued => {
    const store = create();
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 });
    if (queued) canonicalSaveDouble().hold();
    failNextCanonicalCommit('transaction abort');
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
    await settleCanonicalSave();
    expect(savedSpeed()).toBe(2);
    expect(store.getState().saveError).toBeDefined();
    store.getState().flushSave();
    expect(emergency().at(-1)?.save.simulationSpeed).toBe(4);
    await store.getState().flushSaveAsync();
    expect(savedSpeed()).toBe(4);
    expect(store.getState().saveError).toBeUndefined();
  });

  it('keeps failure visible through real ticks and pending commits until success', async () => {
    const store = create();
    failNextCanonicalCommit('transaction abort');
    expect(store.getState().dispatch({ type: 'start_week' })).toBe(true);
    const error = store.getState().saveError;
    expect(error).toBeDefined();
    for (let i = 0; i < 3; i++) {
      expect(store.getState().dispatch({ type: 'advance_simulation', minutes: 1 })).toBe(true);
      expect(store.getState().saveError).toBe(error);
    }
    canonicalSaveDouble().hold();
    const flushed = store.getState().flushSaveAsync();
    await yieldToCommitQueue();
    expect(store.getState().saveError).toBe(error);
    await settleCanonicalSave();
    await flushed;
    expect(store.getState().saveError).toBeUndefined();
  });

  it.each([false, true])('blocks only the confirmation window and retains recovery on failure=%s', async fail => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = create();
    expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 })).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBe('{broken');
    canonicalSaveDouble().hold();
    if (fail) failNextCanonicalCommit('transaction abort');
    store.getState().acceptRecovery();
    await yieldToCommitQueue();
    expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 })).toBe(false);
    expect(store.getState().lastError).toBeDefined();
    expect(store.getState().game.simulationSpeed).toBe(2);
    store.getState().acceptRecovery();
    store.getState().reset(33);
    expect(store.getState().game.simulationSpeed).toBe(2);
    store.getState().flushSave();
    const flushed = store.getState().flushSaveAsync();
    await settleCanonicalSave();
    await flushed;
    if (fail) {
      expect(store.getState().recovery?.writeProtected).toBe(true);
      expect(localStorage.getItem(SAVE_KEY)).toBe('{broken');
      expect(canonicalSaveRaw()).toBeNull();
      expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 })).toBe(true);
      store.getState().acceptRecovery();
      await settleCanonicalSave();
      expect(savedSpeed()).toBe(4);
    } else {
      expect(store.getState().recovery).toBeUndefined();
      expect(savedSpeed()).toBe(2);
      expect(create().getState().game.simulationSpeed).toBe(2);
    }
  });
});
