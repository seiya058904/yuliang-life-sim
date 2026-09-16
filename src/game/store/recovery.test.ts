import { beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createGameStore, SAVE_KEY, saveGameState } from './gameStore';
import { canonicalSaveDouble, canonicalSaveRaw, failNextCanonicalCommit, settleCanonicalSave } from './canonicalSaveTestDouble';

/**
 * Every test here seeds the *legacy* `localStorage` payload, so each one starts
 * from a world with no canonical record: the save a window boots from is the
 * payload the test just wrote.
 */
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('recovery write ownership', () => {
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
    expect(JSON.parse(canonicalSaveRaw()!).simulationSpeed).toBe(2);
  });
  it('keeps ownership protected when explicit replacement fails', async () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(contentRegistry, balanceConfig);
    failNextCanonicalCommit('quota exceeded');
    store.getState().acceptRecovery();
    expect(store.getState().recovery?.writeProtected).toBe(true);
    expect(localStorage.getItem(SAVE_KEY)).toBe('{broken');
    // The failed write left no canonical record behind either.
    expect(canonicalSaveRaw()).toBeNull();
  });
  it('keeps recovery ownership until the queued commit actually settles', async () => {
    // The canonical write is held open, so "queued" can be observed as its own
    // state: scheduling a write is not the same as a successful one.
    canonicalSaveDouble().hold();
    try {
      localStorage.setItem(SAVE_KEY, '{broken');
      const store = createGameStore(contentRegistry, balanceConfig);
      expect(store.getState().recovery?.writeProtected).toBe(true);
      failNextCanonicalCommit('quota exceeded');
      store.getState().acceptRecovery();
      expect(store.getState().recovery?.writeProtected).toBe(true);
      await settleCanonicalSave();
      expect(store.getState().recovery?.writeProtected).toBe(true);
      expect(store.getState().saveError).toBeDefined();
      expect(canonicalSaveRaw()).toBeNull();

      // Once storage recovers, the same confirmation lands and releases it.
      store.getState().acceptRecovery();
      await settleCanonicalSave();
      expect(store.getState().recovery).toBeUndefined();
      expect(JSON.parse(canonicalSaveRaw()!).simulationSpeed).toBeDefined();
    } finally {
      canonicalSaveDouble().release();
    }
  });
  it('distinguishes compressed persistence from failure', async () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    state.lifeHistory = Array.from({ length: 210 }, (_, i) => ({ id: String(i), day: 1, category: 'service' as const, sourceId: 'service.fitness-assessment', title: '记录' }));
    failNextCanonicalCommit('QuotaExceededError: quota exceeded', true);
    const outcome = await saveGameState(state);
    expect(outcome.status).toBe('compressed');
    expect(JSON.parse(canonicalSaveRaw()!).lifeHistory).toHaveLength(200);
  });
  it('releases recovery ownership when the replacement was compressed successfully', async () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(contentRegistry, balanceConfig);
    const game = structuredClone(store.getState().game);
    game.lifeHistory = Array.from({ length: 210 }, (_, i) => ({ id: String(i), day: 1, category: 'career' as const, title: '记录' }));
    store.setState({ game });
    failNextCanonicalCommit('QuotaExceededError: quota exceeded', true);
    store.getState().acceptRecovery();
    expect(store.getState().recovery).toBeUndefined();
    expect(store.getState().saveError).toContain('已压缩历史后保存');
    expect(JSON.parse(canonicalSaveRaw()!).lifeHistory).toHaveLength(200);
  });
  it('recovers a removed next event into reward without applying it again', async () => {
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

describe('recovery messaging', () => {
  it('broken JSON shows a stable Chinese reason without raw parser text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(SAVE_KEY, '{ broken');
    const recovery = createGameStore(contentRegistry, balanceConfig).getState().recovery!;
    expect(recovery.kind).toBe('unreadable');
    expect(recovery.raw).toBe('{ broken');
    expect(recovery.reason).toBe('存档文件已损坏');
    // 玩家界面不得泄漏浏览器 JSON parser 的原始英文文案。
    expect(recovery.reason).not.toMatch(/Expected|position|JSON|property|token/i);
  });

  it('structurally invalid saves show a stable Chinese reason too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(SAVE_KEY, 'null');
    const recovery = createGameStore(contentRegistry, balanceConfig).getState().recovery!;
    expect(recovery.kind).toBe('unreadable');
    expect(recovery.reason).toBe('存档内容无法识别');
    expect(recovery.reason).not.toMatch(/Error|must be|throw/i);
  });

  it('remaps the pending offer notice when migration rebuilds application ids', async () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    const vacancy = state.vacancies!.find((entry) => entry.jobId !== state.currentJobId)!;
    state.applications = [{ applicationId: 'legacy-offer', vacancyId: vacancy.vacancyId, jobId: vacancy.jobId, companyId: vacancy.companyId, salaryRange: vacancy.salaryRange, route: 'market', submittedDay: 1, resultDay: 1, offerExpiresDay: 12, status: 'offer', competitivenessTier: 'competitive', probabilityBand: 80, willReceiveOffer: true, feedback: [] }];
    state.pendingOfferApplicationId = 'legacy-offer';
    state.simulationMode = 'paused';
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    const loaded = createGameStore(contentRegistry, balanceConfig).getState().game;
    // 迁移重建了 applicationId 之后，待确认通知必须跟着指向同一条申请。
    const migrated = loaded.applications![0];
    expect(migrated.applicationId).not.toBe('legacy-offer');
    expect(loaded.pendingOfferApplicationId).toBe(migrated.applicationId);
    expect(migrated.status).toBe('offer');
  });
});
