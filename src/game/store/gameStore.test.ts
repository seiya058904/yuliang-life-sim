import { describe, expect, it, beforeEach } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createGameStore, loadGameState, saveGameState } from './gameStore';

describe('game store persistence', () => {
  beforeEach(() => localStorage.clear());

  it('persists the exact minute and restores the current schedule activity', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const first = createGameStore(contentRegistry, balance, 1);
    first.getState().dispatch({ type: 'start_week' });
    first.getState().dispatch({ type: 'advance_simulation', minutes: 386 });
    const persisted = loadGameState(contentRegistry, balance);

    expect(persisted.time).toEqual({ day: 1, hour: 14, minute: 26 });
    expect(persisted.currentActivity?.kind).toBe('work');
    expect(persisted.simulationMode).toBe('paused');
  });

  it('migrates an old hour-only save without losing the world state', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 0, time: { day: 3, hour: 14 }, weeklyPlan: undefined, simulationMode: undefined }));
    const restored = loadGameState(contentRegistry, balanceConfig);
    expect(restored.time).toEqual({ day: 3, hour: 14, minute: 0 });
    expect(restored.calendar.week).toBe(1);
    expect(restored.weeklyPlan.days[3]).toBeDefined();
  });

  it('migrates an old save without life history to the current version while preserving time and pausing', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    const oldSave = { ...state, version: 1, time: { day: 9, hour: 17, minute: 42 }, simulationMode: 'running' };
    delete (oldSave as Partial<typeof oldSave>).lifeHistory;
    localStorage.setItem('yuliang-save-v1', JSON.stringify(oldSave));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.version).toBe(balanceConfig.saveVersion);
    expect(restored.time).toEqual({ day: 9, hour: 17, minute: 42 });
    expect(restored.simulationMode).toBe('paused');
    expect(restored.lifeHistory).toEqual([]);
  });

  it('migrates tagged career progress and removes unknown progression ids', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 1, time: { day: 11, hour: 9, minute: 17 }, simulationMode: 'running', careerExperience: { office: 21, hacked: 999 }, qualifications: ['office_basics', 'unknown'] }));
    const restored = loadGameState(contentRegistry, balanceConfig);
    expect(restored.time).toEqual({ day: 11, hour: 9, minute: 17 });
    expect(restored.simulationMode).toBe('paused');
    expect(restored.careerExperience).toEqual({ office: 21 });
    expect(restored.qualifications).toEqual(['office_basics']);
  });

  it('migrates subscription records and removes subscriptions from unknown content', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 3, activeSubscriptions: {
      'subscription.mobile-basic': { subscriptionId: 'subscription.mobile-basic', startedDay: 6 },
      'subscription.unknown': { subscriptionId: 'subscription.unknown', startedDay: 6 },
    } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.version).toBe(balanceConfig.saveVersion);
    expect(restored.activeSubscriptions).toEqual({ 'subscription.mobile-basic': { subscriptionId: 'subscription.mobile-basic', startedDay: 6 } });
  });

  it('does not persist animation-only effect data as authoritative state', () => {
    const store = createGameStore(contentRegistry, balanceConfig, 1);
    const state = store.getState().game;
    saveGameState(state);
    expect(localStorage.getItem('yuliang-save-v1')).not.toContain('progress');
  });
});
