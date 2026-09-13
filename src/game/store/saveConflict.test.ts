import { beforeEach, describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { collectEmergencyCandidates, createGameStore, EMERGENCY_SAVE_PREFIX, SAVE_KEY } from './gameStore';

const content = contentRegistry;
const balance = balanceConfig;

const buyBreakfast = { type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } } as const;

beforeEach(() => { localStorage.clear(); });

/** Replace navigator.locks with a controllable hold: callbacks queue, never run. */
function holdLocks(): { releaseAll: () => Promise<void> } {
  const pending: Array<() => Promise<void> | void> = [];
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (name: string, _options: { mode: 'exclusive' }, callback: () => Promise<void> | void) => {
        pending.push(callback);
        return { name, mode: 'exclusive' };
      },
    },
  });
  return {
    releaseAll: async () => {
      const list = pending.splice(0);
      for (const callback of list) await callback();
    },
  };
}

function unholdLocks(): void {
  delete (navigator as unknown as { locks?: unknown }).locks;
}

describe('persistence lifecycle under a held save lock', () => {
  it('keeps the latest action when the page hides while the lock holds the write', async () => {
    const lock = holdLocks();
    try {
      const store = createGameStore(content, balance, 31);
      expect(store.getState().dispatch(buyBreakfast)).toBe(true);
      // Memory changed while the write is queued inside the lock.
      expect(store.getState().game.inventory['item.breakfast-voucher']).toBe(1);
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      // pagehide / visibilitychange: the flush cannot take the writer lock
      // synchronously, so it records an emergency candidate and never touches
      // the canonical SAVE_KEY.
      store.getState().flushSave();
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      const [candidate] = collectEmergencyCandidates();
      expect((candidate.state as { inventory: Record<string, number> }).inventory['item.breakfast-voucher']).toBe(1);
      // Releasing the held callback lands the canonical write; the emergency
      // candidate it supersedes is then pruned.
      await lock.releaseAll();
      expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBe(1);
      expect(store.getState().externalSaveConflict).toBe(false);
      expect(collectEmergencyCandidates()).toEqual([]);
    } finally {
      unholdLocks();
    }
  });

  it('a pagehide flush and a held in-lock write never let the stale version win', async () => {
    const lock = holdLocks();
    try {
      const tabA = createGameStore(content, balance, 32);
      const tabB = createGameStore(content, balance, 33);
      // Both tabs fire while the lock holds every write: both sync pre-checks
      // passed on the same untouched payload — the exact simultaneous race.
      tabA.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } });
      tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      // Tab B hides: its flush preserves B's latest memory as an emergency
      // candidate instead of writing the canonical key.
      tabB.getState().flushSave();
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      // Releasing the held callbacks: A's write lands under the lock; B's own
      // callback detects A's payload and goes stale without writing.
      await lock.releaseAll();
      expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBe(1);
      expect(tabA.getState().externalSaveConflict).toBe(false);
      expect(tabB.getState().externalSaveConflict).toBe(true);
      // B's fork lost the write race, so its candidate is superseded.
      expect(collectEmergencyCandidates()).toEqual([]);
    } finally {
      unholdLocks();
    }
  });

  it('a confirmed reset supersedes a queued lock write instead of being reverted', async () => {
    const lock = holdLocks();
    try {
      const store = createGameStore(content, balance, 34);
      store.getState().dispatch(buyBreakfast);
      store.getState().reset(4242);
      // The reset write holds the same writer lock, so while the lock is held
      // nothing has landed yet.
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      // Releasing: the queued pre-reset callback must skip, and the reset
      // callback must write the reset state — never the reverse order.
      await lock.releaseAll();
      expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBeUndefined();
      expect(store.getState().externalSaveConflict).toBe(false);
    } finally {
      unholdLocks();
    }
  });

  it('reset is refused while a newer external save has been detected', () => {
    const store = createGameStore(content, balance, 35);
    store.getState().dispatch(buyBreakfast);
    const external = JSON.stringify({ ...JSON.parse(localStorage.getItem(SAVE_KEY)!), cash: 654_321 });
    localStorage.setItem(SAVE_KEY, external);
    window.dispatchEvent(new StorageEvent('storage', { key: SAVE_KEY }));
    expect(store.getState().externalSaveConflict).toBe(true);
    store.getState().reset(4242);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).cash).toBe(654_321);
  });

  it('acceptRecovery is refused while a newer external save has been detected', () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toBeTruthy();
    const external = JSON.stringify({ cash: 222_222 });
    localStorage.setItem(SAVE_KEY, external);
    window.dispatchEvent(new StorageEvent('storage', { key: SAVE_KEY }));
    expect(store.getState().externalSaveConflict).toBe(true);
    store.getState().acceptRecovery();
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).cash).toBe(222_222);
  });
});

describe('single-writer save conflict protection', () => {
  it('marks the tab stale via the storage event and blocks every later write', () => {
    const store = createGameStore(content, balance, 11);
    expect(store.getState().externalSaveConflict).toBe(false);
    expect(store.getState().dispatch(buyBreakfast)).toBe(true);
    const savedByThisTab = localStorage.getItem(SAVE_KEY)!;

    // Another tab persists its own divergent state and the browser delivers the event.
    const external = JSON.stringify({ ...JSON.parse(savedByThisTab), cash: 999_999 });
    localStorage.setItem(SAVE_KEY, external);
    window.dispatchEvent(new StorageEvent('storage', { key: SAVE_KEY }));

    expect(store.getState().externalSaveConflict).toBe(true);
    expect(store.getState().game.simulationMode).not.toBe('running');
    expect(store.getState().dispatch(buyBreakfast)).toBe(false);
    store.getState().flushSave();
    expect(localStorage.getItem(SAVE_KEY)).toBe(external);
  });

  it('catches divergent writes the storage event never delivered (pre-write guard)', () => {
    const store = createGameStore(content, balance, 12);
    // Same-tab setItem fires no storage event: exactly the race the pre-write
    // check exists for.
    const external = JSON.stringify({ ...JSON.parse(localStorage.getItem(SAVE_KEY)!), cash: 12_345 });
    localStorage.setItem(SAVE_KEY, external);
    expect(store.getState().externalSaveConflict).toBe(false);

    expect(store.getState().dispatch(buyBreakfast)).toBe(false);
    expect(store.getState().externalSaveConflict).toBe(true);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).cash).toBe(12_345);
  });

  it('does not flag or block saves when no other tab wrote', () => {
    const store = createGameStore(content, balance, 13);
    expect(store.getState().dispatch(buyBreakfast)).toBe(true);
    expect(store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 2 } })).toBe(true);
    expect(store.getState().externalSaveConflict).toBe(false);
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBe(3);
  });

  it('a fresh tab loads the latest save that won the conflict', () => {
    const loser = createGameStore(content, balance, 14);
    loser.getState().dispatch(buyBreakfast);
    const winnerPayload = JSON.stringify({ ...JSON.parse(localStorage.getItem(SAVE_KEY)!), cash: 777_777 });
    localStorage.setItem(SAVE_KEY, winnerPayload);
    window.dispatchEvent(new StorageEvent('storage', { key: SAVE_KEY }));
    expect(loser.getState().externalSaveConflict).toBe(true);

    const fresh = createGameStore(content, balance);
    expect(fresh.getState().game.cash).toBe(777_777);
    expect(fresh.getState().externalSaveConflict).toBe(false);
  });

  it('reset still persists when there is no conflict', () => {
    const store = createGameStore(content, balance, 15);
    store.getState().dispatch(buyBreakfast);
    store.getState().reset(4242);
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY)!);
    expect(parsed.inventory['item.breakfast-voucher']).toBeUndefined();
    expect(store.getState().externalSaveConflict).toBe(false);
  });

  it('serializes simultaneous writers through the Web Locks critical section', async () => {
    // Fake shared exclusive lock manager standing in for navigator.locks: the
    // same primitive the real cross-tab path relies on.
    let chain: Promise<void> = Promise.resolve();
    const request = async (name: string, _options: { mode: 'exclusive' }, callback: () => Promise<void> | void) => {
      const run = chain.then(() => callback());
      chain = run.then(() => undefined, () => undefined);
      await run;
      return { name, mode: 'exclusive' };
    };
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    try {
      // Two tabs boot from the same empty storage, then fire different actions
      // simultaneously. Both sync pre-checks pass before either write lands;
      // only the lock serializes them.
      const tabA = createGameStore(content, balance, 21);
      const tabB = createGameStore(content, balance, 22);
      await Promise.all([
        Promise.resolve(tabA.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } })),
        Promise.resolve(tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } })),
      ]);
      // Let the deferred lock callbacks settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Exactly one writer persisted: 1 or 3 vouchers, never 4 and never none.
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!);
      const voucherCount = saved.inventory?.['item.breakfast-voucher'] ?? 0;
      expect([1, 3]).toContain(voucherCount);

      // The loser detected the winner inside the lock and is frozen.
      const loser = voucherCount === 1 ? tabB : tabA;
      expect(loser.getState().externalSaveConflict).toBe(true);
      expect(loser.getState().dispatch(buyBreakfast)).toBe(false);

      // The winner is unaffected.
      const winner = voucherCount === 1 ? tabA : tabB;
      expect(winner.getState().externalSaveConflict).toBe(false);
      expect(winner.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } })).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const after = JSON.parse(localStorage.getItem(SAVE_KEY)!);
      expect(after.inventory['item.breakfast-voucher']).toBe(voucherCount + 1);
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });
});

describe('unload emergency save protocol', () => {
  it('a pagehide flush cannot interleave a canonical write into another tab in-lock check→write window', async () => {
    // Real exclusive-lock semantics: B's request waits until A's callback has
    // fully finished. A is frozen by the test-only barrier exactly between its
    // in-lock pre-write check and its canonical setItem.
    let chain: Promise<void> = Promise.resolve();
    const request = async (name: string, _options: { mode: 'exclusive' }, callback: () => Promise<void> | void) => {
      const run = chain.then(() => callback());
      chain = run.then(() => undefined, () => undefined);
      await run;
      return { name, mode: 'exclusive' };
    };
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    let reachBarrier!: () => void;
    const reached = new Promise<void>((resolve) => { reachBarrier = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    try {
      const tabA = createGameStore(content, balance, 41, { afterPreWriteCheckBeforeSet: () => { reachBarrier(); return gate; } });
      tabA.getState().dispatch(buyBreakfast);
      // A holds the lock, has read the canonical key, compared it against its
      // lastKnown payload and paused right before localStorage.setItem.
      await reached;
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();

      const tabB = createGameStore(content, balance, 42);
      tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
      // B hides exactly inside A's check→write window. Its pagehide flush must
      // not write the canonical SAVE_KEY (it holds no writer ownership); it
      // records B's state as an emergency candidate instead.
      tabB.getState().flushSave();
      expect(localStorage.getItem(SAVE_KEY)).toBeNull();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.baseRevision).toBe(0);
      expect((candidate.state as { inventory: Record<string, number> }).inventory['item.breakfast-voucher']).toBe(3);

      // A resumes: its write lands verbatim and nothing overwrote the window.
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBe(1);
      expect(tabA.getState().externalSaveConflict).toBe(false);
      // B's queued callback detects A's payload inside the lock and goes stale
      // without writing; B's losing fork is superseded.
      expect(tabB.getState().externalSaveConflict).toBe(true);
      expect(collectEmergencyCandidates()).toEqual([]);
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });

  it('a boot adopts an emergency candidate recorded at the current canonical revision', () => {
    const lock = holdLocks();
    const tabB = createGameStore(content, balance, 51);
    tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
    tabB.getState().flushSave();
    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
    unholdLocks();
    // The next boot detects the candidate and offers it through the
    // write-protected recovery flow instead of silently trusting it.
    const fresh = createGameStore(content, balance);
    expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(3);
    expect(fresh.getState().recovery?.writeProtected).toBe(true);
    expect(fresh.getState().recovery?.reason).toContain('未能写入正式存档');
    // The explicit confirmation promotes the candidate into the canonical save.
    fresh.getState().acceptRecovery();
    expect(JSON.parse(localStorage.getItem(SAVE_KEY)!).inventory['item.breakfast-voucher']).toBe(3);
    expect(fresh.getState().externalSaveConflict).toBe(false);
  });

  it('an emergency candidate superseded by a newer canonical revision is pruned at boot', () => {
    const store = createGameStore(content, balance, 52);
    store.getState().dispatch(buyBreakfast);
    const staleCandidate = { baseRevision: 0, save: JSON.parse(localStorage.getItem(SAVE_KEY)!) };
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'stale.session', JSON.stringify(staleCandidate));
    const fresh = createGameStore(content, balance);
    expect(localStorage.getItem(EMERGENCY_SAVE_PREFIX + 'stale.session')).toBeNull();
    expect(fresh.getState().recovery).toBeUndefined();
    expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(1);
  });
});
