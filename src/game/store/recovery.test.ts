import { beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createGameStore, SAVE_KEY, saveGameState } from './gameStore';

describe('recovery write ownership', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it.each(['{ broken', 'null'])('retains original payload even after hiding the notice: %s', raw => {
    localStorage.setItem(SAVE_KEY, raw);
    const store = createGameStore(contentRegistry, balanceConfig);
    store.getState().dismissLoadProblem();
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 });
    expect(localStorage.getItem(SAVE_KEY)).toBe(raw);
    expect(createGameStore(contentRegistry, balanceConfig).getState().recovery?.raw).toBe(raw);
    expect(JSON.stringify(store.getState().game)).not.toContain('writeProtected');
    store.getState().acceptRecovery();
    expect(store.getState().recovery).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).simulationSpeed).toBe(2);
  });
  it('keeps ownership protected when explicit replacement fails', () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(contentRegistry, balanceConfig);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    store.getState().acceptRecovery();
    expect(store.getState().recovery?.writeProtected).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBe('{broken');
  });
  it('distinguishes compressed persistence from failure', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    state.lifeHistory = Array.from({ length: 210 }, (_, i) => ({ id: String(i), day: 1, category: 'service' as const, sourceId: 'service.fitness-assessment', title: '记录' }));
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      if (JSON.parse(value).lifeHistory.length > 200) throw new Error('quota');
      setItem.call(localStorage, key, value);
    });
    expect(saveGameState(state).status).toBe('compressed');
  });
  it('releases recovery ownership when the replacement was compressed successfully', () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(contentRegistry, balanceConfig);
    const game = structuredClone(store.getState().game);
    game.lifeHistory = Array.from({ length: 210 }, (_, i) => ({ id: String(i), day: 1, category: 'career' as const, title: '记录' }));
    store.setState({ game });
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      if (JSON.parse(value).lifeHistory.length > 200) throw new Error('quota');
      setItem.call(localStorage, key, value);
    });
    store.getState().acceptRecovery();
    expect(store.getState().recovery).toBeUndefined();
    expect(store.getState().saveError).toContain('已压缩历史后保存');
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).lifeHistory).toHaveLength(200);
  });
  it('recovers a removed next event into reward without applying it again', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    state.pendingEventId = 'event.deleted';
    state.pendingReward = { eventId: 'event.old', lines: ['已应用'] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const store = createGameStore(contentRegistry, balanceConfig);
    const cash = store.getState().game.cash;
    store.getState().acceptRecovery();
    expect(store.getState().game.simulationMode).toBe('reward');
    expect(store.getState().game.pendingReward).toEqual(state.pendingReward);
    expect(store.getState().game.cash).toBe(cash);
  });
});
