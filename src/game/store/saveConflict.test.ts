import { beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { SimulationSpeed } from '../content/contracts';
import { collectEmergencyCandidates, createGameStore, EMERGENCY_SAVE_PREFIX, payloadIdentity, SAVE_KEY, saveGameState } from './gameStore';
import { canonicalSaveDouble, canonicalSaveHead, canonicalSaveRaw, canonicalSaveStored, failNextCanonicalCommit, settleCanonicalSave, settleFirstCanonicalCommit, yieldToCommitQueue } from './canonicalSaveTestDouble';

const content = contentRegistry;
const balance = balanceConfig;

const buyBreakfast = { type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } } as const;

beforeEach(() => {
  localStorage.clear();
});

/**
 * Hold every commit open, so "the write is in flight" is an observable state
 * rather than a race. `release()` decides the held commits in issue order —
 * exactly as a serialized IndexedDB transaction queue would — and `abandon()`
 * drops them, which is the page that died with a write in flight.
 */
function holdCommits(): { release: () => Promise<void>; abandon: () => void } {
  canonicalSaveDouble().hold();
  return {
    release: async () => { await settleCanonicalSave(); },
    abandon: () => { canonicalSaveDouble().abandon(); },
  };
}

/** The stored canonical payload, or a failure when nothing was stored at all. */
function storedPayload(): Record<string, unknown> {
  const raw = canonicalSaveRaw();
  if (raw === null) throw new Error('正式存档不存在');
  return JSON.parse(raw) as Record<string, unknown>;
}

function storedVouchers(): number {
  const inventory = storedPayload().inventory as Record<string, number> | undefined;
  return inventory?.['item.breakfast-voucher'] ?? 0;
}

/** `simulationSpeed` is persisted and fully reversible: 1 ↔ 2 ↔ 4, no history entry. */
const setSpeed = (speed: SimulationSpeed) => ({ type: 'set_simulation_speed', speed }) as const;
function storedSpeed(): number {
  return Number(storedPayload().simulationSpeed);
}

/** Another window committing its own state: the version this one holds loses. */
async function anotherWindowCommits(cash: number): Promise<void> {
  const state = { ...(JSON.parse(canonicalSaveRaw() ?? '{}') as Record<string, unknown>), cash };
  await saveGameState(state as unknown as Parameters<typeof saveGameState>[0]);
}

describe('persistence lifecycle while a commit is in flight', () => {
  it('keeps the latest action when the page hides while the commit is held', async () => {
    const held = holdCommits();
    try {
      const store = createGameStore(content, balance, 31);
      expect(store.getState().dispatch(buyBreakfast)).toBe(true);
      // Memory changed while the write is in flight.
      expect(store.getState().game.inventory['item.breakfast-voucher']).toBe(1);
      expect(canonicalSaveRaw()).toBeNull();
      // pagehide / visibilitychange: the flush cannot wait for a transaction to
      // commit, so it records an emergency candidate and never touches the
      // canonical record.
      store.getState().flushSave();
      expect(canonicalSaveRaw()).toBeNull();
      const [candidate] = collectEmergencyCandidates();
      expect((candidate.state as { inventory: Record<string, number> }).inventory['item.breakfast-voucher']).toBe(1);
      // Releasing the held commit lands the canonical write; the emergency
      // candidate it supersedes is then pruned.
      await held.release();
      expect(storedVouchers()).toBe(1);
      expect(store.getState().externalSaveConflict).toBe(false);
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('lets exactly one of two windows that commit from the same version land', async () => {
    const held = holdCommits();
    try {
      const tabA = createGameStore(content, balance, 32);
      const tabB = createGameStore(content, balance, 33);
      // Both windows boot from "no record at all" and commit different states:
      // the exact simultaneous race, with neither commit decided yet.
      tabA.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } });
      tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
      expect(canonicalSaveRaw()).toBeNull();
      // Tab B hides: its flush preserves B's latest memory as an emergency
      // candidate instead of writing the canonical record.
      tabB.getState().flushSave();
      expect(canonicalSaveRaw()).toBeNull();
      // Releasing: A's commit creates the record, B's finds a version it never
      // confirmed and is refused by the transaction instead of overwriting it.
      await held.release();
      expect(storedVouchers()).toBe(1);
      expect(tabA.getState().externalSaveConflict).toBe(false);
      expect(tabB.getState().externalSaveConflict).toBe(true);
      // B's fork lost the race, so its candidate is superseded.
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('a confirmed reset supersedes a queued pre-reset write instead of being reverted', async () => {
    const held = holdCommits();
    try {
      const store = createGameStore(content, balance, 34);
      store.getState().dispatch(buyBreakfast);
      store.getState().reset(4242);
      // Both commits are still in flight: nothing has landed yet.
      expect(canonicalSaveRaw()).toBeNull();
      // Releasing: the queued pre-reset commit must be superseded, and the reset
      // must store the reset state — never the reverse order.
      await held.release();
      expect(storedVouchers()).toBe(0);
      expect(store.getState().externalSaveConflict).toBe(false);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('refuses to reset over a version another window has already replaced', async () => {
    const store = createGameStore(content, balance, 35);
    store.getState().dispatch(buyBreakfast);
    await anotherWindowCommits(654_321);
    store.getState().reset(4242);
    // The reset is refused, so the newer version is still the stored one.
    expect(store.getState().externalSaveConflict).toBe(true);
    expect(storedPayload().cash).toBe(654_321);
  });

  it('refuses to confirm a recovery over a version another window has replaced', async () => {
    localStorage.setItem(SAVE_KEY, '{broken');
    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toBeTruthy();
    await anotherWindowCommits(222_222);
    store.getState().acceptRecovery();
    expect(store.getState().externalSaveConflict).toBe(true);
    expect(storedPayload().cash).toBe(222_222);
  });
});

describe('single-writer save conflict protection', () => {
  it('rejects a write whose base version was replaced, without landing in memory', async () => {
    const store = createGameStore(content, balance, 11);
    expect(store.getState().externalSaveConflict).toBe(false);
    expect(store.getState().dispatch(buyBreakfast)).toBe(true);

    // Another window commits from the same base version first.
    await anotherWindowCommits(999_999);

    // The next write carries the version this window confirmed, so the
    // transaction refuses it: the action must not land in memory either, and
    // every later write is blocked.
    expect(store.getState().dispatch(buyBreakfast)).toBe(false);
    expect(store.getState().externalSaveConflict).toBe(true);
    expect(store.getState().game.simulationMode).not.toBe('running');
    expect(storedPayload().cash).toBe(999_999);
    store.getState().flushSave();
    expect(storedPayload().cash).toBe(999_999);
  });

  it('does not flag or block saves when no other window wrote', () => {
    const store = createGameStore(content, balance, 13);
    expect(store.getState().dispatch(buyBreakfast)).toBe(true);
    expect(store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 2 } })).toBe(true);
    expect(store.getState().externalSaveConflict).toBe(false);
    expect(storedVouchers()).toBe(3);
  });

  it('a fresh window loads the version that won the conflict', async () => {
    const loser = createGameStore(content, balance, 14);
    loser.getState().dispatch(buyBreakfast);
    await anotherWindowCommits(777_777);
    expect(loser.getState().dispatch(buyBreakfast)).toBe(false);
    expect(loser.getState().externalSaveConflict).toBe(true);

    const fresh = createGameStore(content, balance);
    expect(fresh.getState().game.cash).toBe(777_777);
    expect(fresh.getState().externalSaveConflict).toBe(false);
  });

  it('reset still persists when there is no conflict', () => {
    const store = createGameStore(content, balance, 15);
    store.getState().dispatch(buyBreakfast);
    store.getState().reset(4242);
    expect(storedVouchers()).toBe(0);
    expect(store.getState().externalSaveConflict).toBe(false);
  });

  it('two windows committing from the same version leave exactly one stored version', async () => {
    // Two windows boot from the same empty record and fire different actions.
    // Both commits carry the same expectation; only one transaction may land.
    const held = holdCommits();
    try {
      const tabA = createGameStore(content, balance, 21);
      const tabB = createGameStore(content, balance, 22);
      tabA.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } });
      tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
      await held.release();

      // Exactly one writer persisted: 1 or 3 vouchers, never 4 and never none.
      const voucherCount = storedVouchers();
      expect([1, 3]).toContain(voucherCount);
      expect(canonicalSaveHead()?.revision).toBe(1);

      // The loser was refused by the transaction and is frozen.
      const loser = voucherCount === 1 ? tabB : tabA;
      expect(loser.getState().externalSaveConflict).toBe(true);
      expect(loser.getState().dispatch(buyBreakfast)).toBe(false);

      // The winner is unaffected and can still save legitimately.
      const winner = voucherCount === 1 ? tabA : tabB;
      expect(winner.getState().externalSaveConflict).toBe(false);
      expect(winner.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } })).toBe(true);
      expect(storedVouchers()).toBe(voucherCount + 1);
      expect(canonicalSaveHead()?.revision).toBe(2);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it.each([
    { label: 'the document that commits first holds fewer vouchers', first: 1, second: 4 },
    { label: 'the document that commits first holds more vouchers', first: 4, second: 1 },
  ])('lets the document that commits first keep the canonical save and refuses the later one ($label)', async ({ first, second }) => {
    // The order is exact here, which a browser test cannot give us (see the note
    // in `e2e/save-concurrency.spec.ts`): the double holds every commit, so both
    // windows are decided in commit order. The one that commits first creates the
    // version; the second finds a version it never confirmed and is refused
    // instead of overwriting it — regardless of which document holds more
    // progress.
    const held = holdCommits();
    try {
      const queuedFirst = createGameStore(content, balance, 41);
      const queuedSecond = createGameStore(content, balance, 42);
      expect(queuedFirst.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': first } })).toBe(true);
      expect(queuedSecond.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': second } })).toBe(true);
      expect(canonicalSaveRaw()).toBeNull();

      await held.release();

      // Exactly one write landed, and it is the first commit's payload.
      expect(storedVouchers()).toBe(first);
      expect(canonicalSaveHead()?.revision).toBe(1);
      expect(queuedFirst.getState().externalSaveConflict).toBe(false);
      expect(queuedSecond.getState().externalSaveConflict).toBe(true);
      // The refused document cannot write later either, so it cannot overwrite it.
      expect(queuedSecond.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 9 } })).toBe(false);
      expect(storedVouchers()).toBe(first);
    } finally {
      canonicalSaveDouble().release();
    }
  });
});

describe('periodic autosave uses the canonical writer', () => {
  it('writes the canonical save on the throttle timer instead of an emergency candidate', async () => {
    vi.useFakeTimers();
    try {
      const store = createGameStore(content, balance, 61);
      store.getState().dispatch({ type: 'set_simulation_speed', speed: 1 });
      // Start the week so the simulation can advance, then let the throttle
      // timer persist the tick through the canonical writer.
      const started = store.getState().dispatch({ type: 'start_week' });
      expect(started || store.getState().game.simulationMode === 'running').toBe(true);
      store.setState({ game: { ...store.getState().game, simulationMode: 'running' } });
      expect(store.getState().dispatch({ type: 'advance_simulation', minutes: 5 })).toBe(true);

      await vi.advanceTimersByTimeAsync(2_100);

      expect(storedPayload().time).toMatchObject({ hour: 8, minute: 5 });
      expect(canonicalSaveHead()?.revision).toBeGreaterThan(0);
      // A normal autosave lands canonically: the next boot must not be told the
      // session ended with unsaved progress.
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().recovery).toBeUndefined();
      expect(fresh.getState().game.time).toMatchObject({ hour: 8, minute: 5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a write that is still in flight as neither saved nor failed', async () => {
    const held = holdCommits();
    try {
      const store = createGameStore(content, balance, 62);
      expect(store.getState().dispatch(buyBreakfast)).toBe(true);
      // The commit is in flight: nothing was written and nothing claims to be.
      expect(canonicalSaveRaw()).toBeNull();
      expect(store.getState().saveError).toBeUndefined();
      const flushing = store.getState().flushSaveAsync();
      expect(canonicalSaveRaw()).toBeNull();
      await held.release();
      await flushing;
      expect(storedVouchers()).toBe(1);
    } finally {
      canonicalSaveDouble().release();
    }
  });
});

describe('a failed save always reaches the visible error state', () => {
  it('surfaces a storage failure raised inside a commit that was still in flight', async () => {
    const held = holdCommits();
    try {
      const store = createGameStore(content, balance, 63);
      failNextCanonicalCommit('quota exceeded');
      expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 1 })).toBe(true);
      // The commit is in flight, so its failure lands after dispatch returned.
      expect(store.getState().saveError).toBeUndefined();
      await held.release();
      expect(store.getState().saveError).toContain('quota exceeded');
      expect(canonicalSaveRaw()).toBeNull();
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('surfaces a storage failure raised during a commit that completes inside the dispatch', async () => {
    const store = createGameStore(content, balance, 64);
    failNextCanonicalCommit('quota exceeded');
    expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 1 })).toBe(true);
    expect(store.getState().saveError).toContain('quota exceeded');
    expect(canonicalSaveRaw()).toBeNull();
  });

  it('surfaces a failing throttled autosave when it cannot be committed immediately', async () => {
    vi.useFakeTimers();
    try {
      const held = holdCommits();
      const store = createGameStore(content, balance, 65);
      store.setState({ game: { ...store.getState().game, simulationMode: 'running' } });
      expect(store.getState().dispatch({ type: 'advance_simulation', minutes: 5 })).toBe(true);
      failNextCanonicalCommit('quota exceeded');
      await vi.advanceTimersByTimeAsync(2_100);
      await held.release();
      expect(canonicalSaveRaw()).toBeNull();
      expect(store.getState().saveError).toContain('quota exceeded');
    } finally {
      vi.useRealTimers();
      canonicalSaveDouble().release();
    }
  });
});

describe('expired gig records are cleaned up through the store, not just the engine', () => {
  /** A running world holding one gig whose window is already past. */
  function worldWithExpiredGig(seed: number) {
    const store = createGameStore(content, balance, seed);
    const game = store.getState().game;
    store.setState({
      game: {
        ...game,
        simulationMode: 'running',
        currentJobId: undefined,
        employment: undefined,
        time: { day: 40, hour: 18, minute: 0 },
        gigs: [{
          id: 'gig.stale',
          jobId: 'job.delivery-shift',
          validFromDay: 40,
          expiresDay: 46,
          executableDay: 40,
          startMinute: (40 - 1) * 1440 + 8 * 60,
          endMinute: (40 - 1) * 1440 + 12 * 60,
          pay: 76,
          source: '测试市场',
          workedMinutes: 0,
        }],
      },
    });
    return store;
  }

  it('removes a window that closed while the clock was paused and persists the removal', async () => {
    // The engine returns the removal as a committed state change with a notice.
    // The store must commit it — the earlier shape returned the removal together
    // with an `error`, and the store drops the state of any action that errored,
    // so the card claiming "需要重新申请" stayed on screen and in the save.
    const store = worldWithExpiredGig(71);

    // A paused world: the window still closes in game time, and the next action
    // is what runs the cleanup. Nothing here reads the engine's return value.
    expect(store.getState().dispatch({ type: 'pause_simulation' })).toBe(true);
    expect(store.getState().game.gigs).toEqual([]);
    expect(store.getState().lastError).toBeUndefined();
    expect(store.getState().lastNotice).toContain('已经过去');
    expect(store.getState().game.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));

    await store.getState().flushSaveAsync();
    expect((storedPayload() as { gigs?: unknown[] }).gigs).toEqual([]);

    const reloaded = createGameStore(content, balance).getState().game;
    expect(reloaded.gigs).toEqual([]);
    expect(reloaded.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
  });

  it('settles and pays the hours the running clock worked on the record', async () => {
    // The player started the shift and left the world running. The running clock
    // banks the hours it spends inside the window (that accumulation is what the
    // P1 defect lost), and the next action after the window closes settles them:
    // the income is recorded and the card leaves the state and the save.
    const store = worldWithExpiredGig(72);
    const before = store.getState().game.cash;
    const startAbs = (40 - 1) * 1440 + 16 * 60;
    store.setState({
      game: {
        ...store.getState().game,
        time: { day: 40, hour: 16, minute: 0 },
        // `startedMinute` is what makes this the player's shift: the clock works a
        // window it took on, and never one that was only offered.
        gigs: [{ ...store.getState().game.gigs![0], startMinute: startAbs, endMinute: startAbs + 240, startedMinute: startAbs }],
      },
    });

    const advanced = store.getState().dispatch({ type: 'advance_simulation', minutes: 60 });
    if (!advanced) throw new Error(`advance refused: ${store.getState().lastError}`);
    // An hour of the window was really worked and is on the record.
    expect(store.getState().game.gigs?.[0]?.workedMinutes).toBe(60);
    expect(store.getState().game.cash).toBe(before);

    // The window closes later: the banked hour is paid, once.
    store.setState({ game: { ...store.getState().game, time: { day: 40, hour: 20, minute: 0 }, simulationMode: 'paused' } });
    expect(store.getState().dispatch({ type: 'pause_simulation' })).toBe(true);
    expect(store.getState().game.gigs).toEqual([]);
    expect(store.getState().game.cash).toBe(before + 19);
    expect(store.getState().game.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 19 }));

    await store.getState().flushSaveAsync();
    expect((storedPayload() as { gigs?: unknown[] }).gigs).toEqual([]);

    const reloaded = createGameStore(content, balance).getState().game;
    expect(reloaded.gigs).toEqual([]);
    expect(reloaded.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 19 }));
  });

  it('banks nothing for a shift that was never started, and keeps a started one in progress across a reload', async () => {
    // 18:00–22:00 sits outside the seed job's 09:00–17:00 shift, so every minute
    // here is decided by the gig's own state and not by a clash with the shift.
    const startAbs = (40 - 1) * 1440 + 18 * 60;
    const window = { startMinute: startAbs, endMinute: startAbs + 240 };
    // An offered window the player never took on: the running clock passes over it
    // and banks nothing.
    const offered = worldWithExpiredGig(73);
    offered.setState({
      game: { ...offered.getState().game, time: { day: 40, hour: 18, minute: 0 }, gigs: [{ ...offered.getState().game.gigs![0], ...window }] },
    });
    const crossed = offered.getState().dispatch({ type: 'advance_simulation', minutes: 60 });
    if (!crossed) throw new Error(`advance refused: ${offered.getState().lastError}`);
    expect(offered.getState().game.gigs?.[0]?.workedMinutes).toBe(0);
    expect(offered.getState().game.lifeHistory ?? []).not.toContainEqual(expect.objectContaining({ title: '完成同城配送' }));

    // The same record with 开工 on it is the player's shift: it survives the save,
    // and the reloaded world keeps working the same window.
    const store = worldWithExpiredGig(74);
    store.setState({
      game: {
        ...store.getState().game,
        time: { day: 40, hour: 18, minute: 0 },
        gigs: [{ ...store.getState().game.gigs![0], ...window, startedMinute: startAbs }],
      },
    });
    // Any action schedules the canonical write, exactly as the running world does.
    expect(store.getState().dispatch({ type: 'pause_simulation' })).toBe(true);
    await store.getState().flushSaveAsync();
    expect((storedPayload() as { gigs?: unknown[] }).gigs).toHaveLength(1);

    const reloaded = createGameStore(content, balance);
    expect(reloaded.getState().game.gigs?.[0]).toMatchObject({ startedMinute: startAbs, workedMinutes: 0 });
    reloaded.setState({ game: { ...reloaded.getState().game, simulationMode: 'running' } });
    const advanced = reloaded.getState().dispatch({ type: 'advance_simulation', minutes: 60 });
    if (!advanced) throw new Error(`advance refused: ${reloaded.getState().lastError}`);
    expect(reloaded.getState().game.gigs?.[0]?.workedMinutes).toBe(60);
  });

  it('keeps a multi-day activity occupying the shift window across a reload', async () => {
    const startAbs = (40 - 1) * 1440 + 18 * 60;
    const store = worldWithExpiredGig(75);
    const before = store.getState().game.cash;
    store.setState({
      game: {
        ...store.getState().game,
        time: { day: 40, hour: 18, minute: 0 },
        // 品质周末旅行 第 40 天 09:00 → 第 42 天 09:00: the player is away when the shift's
        // window opens, and the clock day's plan cells say nothing about it.
        longActivity: {
          id: 'activity.premium-weekend.56700',
          activity: { kind: 'activity', start: { day: 40, hour: 9, minute: 0 }, end: { day: 42, hour: 9, minute: 0 }, activityId: 'activity.premium-weekend', optionId: 'premium-stay' },
        },
        gigs: [{ ...store.getState().game.gigs![0], startMinute: startAbs, endMinute: startAbs + 240 }],
      },
    });
    expect(store.getState().dispatch({ type: 'pause_simulation' })).toBe(true);
    await store.getState().flushSaveAsync();

    const reloaded = createGameStore(content, balance);
    // The activity survives the save as the same running activity…
    expect(reloaded.getState().game.longActivity?.activity).toMatchObject({ activityId: 'activity.premium-weekend' });
    // …and the reloaded world still refuses the shift, because the trip owns those minutes.
    expect(reloaded.getState().dispatch({ type: 'execute_gig', gigId: 'gig.stale' })).toBe(false);
    expect(reloaded.getState().lastError).toContain('品质周末旅行');
    expect(reloaded.getState().game.gigs?.[0]?.startedMinute).toBeUndefined();
    expect(reloaded.getState().game.cash).toBe(before);
  });
});

describe('unload emergency save protocol', () => {
  it('refuses the suspended window whose base version was replaced while it waited', async () => {
    // The barrier suspends A before it opens its transaction; B commits and
    // creates the version in the meantime. A's commit then carries a version the
    // record no longer has, so it is refused instead of replacing B's save.
    const held = holdCommits();
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    let reachedBarrier!: () => void;
    const reached = new Promise<void>((resolve) => { reachedBarrier = resolve; });
    const tabA = createGameStore(content, balance, 41, {
      beforeCommitRequest: async () => { reachedBarrier(); await barrier; },
    });
    tabA.getState().dispatch(buyBreakfast);
    await reached;
    expect(canonicalSaveRaw()).toBeNull();

    const tabB = createGameStore(content, balance, 42);
    tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
    // B's commit is in flight, so B hiding now has unsaved memory: its pagehide
    // flush must not write the canonical record, it records a candidate instead.
    expect(canonicalSaveRaw()).toBeNull();
    tabB.getState().flushSave();
    expect(canonicalSaveRaw()).toBeNull();
    const [candidate] = collectEmergencyCandidates();
    expect(candidate.state).toMatchObject({ inventory: { 'item.breakfast-voucher': 3 } });

    await held.release();
    expect(storedVouchers()).toBe(3);
    releaseBarrier();
    await settleCanonicalSave();
    // A's version was superseded while it waited, so A is refused and B keeps
    // the record; B's candidate is now behind the stored version.
    expect(storedVouchers()).toBe(3);
    expect(tabA.getState().externalSaveConflict).toBe(true);
    expect(tabB.getState().externalSaveConflict).toBe(false);
    expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
  });

  it('lets the suspended window commit when nothing replaced its version', async () => {
    // Same barrier, nothing else commits: the decision is taken inside the
    // transaction after the barrier, so the write lands verbatim.
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    let reachedBarrier!: () => void;
    const reached = new Promise<void>((resolve) => { reachedBarrier = resolve; });
    const tabA = createGameStore(content, balance, 43, {
      beforeCommitRequest: async () => { reachedBarrier(); await barrier; },
    });
    tabA.getState().dispatch(buyBreakfast);
    await reached;
    expect(canonicalSaveRaw()).toBeNull();

    releaseBarrier();
    await settleCanonicalSave();
    expect(storedVouchers()).toBe(1);
    expect(tabA.getState().externalSaveConflict).toBe(false);
  });

  it('a boot adopts an emergency candidate recorded at the current version', () => {
    // The commit is held open and then abandoned: the page died with the write
    // in flight, which is exactly when the emergency candidate exists.
    const held = holdCommits();
    const tabB = createGameStore(content, balance, 51);
    tabB.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
    expect(canonicalSaveRaw()).toBeNull();
    tabB.getState().flushSave();
    const [candidate] = collectEmergencyCandidates();
    expect(candidate.state).toMatchObject({ inventory: { 'item.breakfast-voucher': 3 } });
    held.abandon();
    // The next boot detects the candidate and offers it through the
    // write-protected recovery flow instead of silently trusting it.
    const fresh = createGameStore(content, balance);
    expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(3);
    expect(fresh.getState().recovery?.writeProtected).toBe(true);
    expect(fresh.getState().recovery?.reason).toContain('未能写入正式存档');
    // The explicit confirmation promotes the candidate into the canonical save.
    fresh.getState().acceptRecovery();
    expect(storedVouchers()).toBe(3);
    expect(fresh.getState().externalSaveConflict).toBe(false);
  });

  it('prunes emergency candidates the canonical record has already moved past', () => {
    const store = createGameStore(content, balance, 52);
    store.getState().dispatch(buyBreakfast);
    const head = canonicalSaveHead()!;
    expect(head.revision).toBe(1);
    const record = (base: { baseGeneration?: string; baseRevision: number }, voucher: number) =>
      JSON.stringify({ ...base, save: { inventory: { 'item.breakfast-voucher': voucher } } });
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'behind.session', record({ baseGeneration: head.generation, baseRevision: head.revision - 1 }, 9));
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'old-generation.session', record({ baseGeneration: 'gen-previous', baseRevision: head.revision }, 8));
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'current.session', record({ baseGeneration: head.generation, baseRevision: head.revision }, 7));

    const fresh = createGameStore(content, balance);
    // Behind the stored revision, or from a generation that no longer exists.
    expect(localStorage.getItem(EMERGENCY_SAVE_PREFIX + 'behind.session')).toBeNull();
    expect(localStorage.getItem(EMERGENCY_SAVE_PREFIX + 'old-generation.session')).toBeNull();
    // The candidate that descends from the stored version survives and is offered.
    expect(fresh.getState().recovery?.reason).toContain('未能写入正式存档');
    expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(7);
  });

  it('keeps a valid candidate that follows a pruned one in storage order', () => {
    // Pruning deletes keys while iterating; a forward index walk would skip the
    // entry that slides into the freed slot and lose a recoverable save.
    const record = (baseRevision: number) => JSON.stringify({ baseRevision, save: { cash: baseRevision } });
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'a.valid', record(1));
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'b.broken', '{not json');
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'c.valid', record(2));
    const candidates = collectEmergencyCandidates();
    expect(candidates.map((candidate) => candidate.state)).toEqual([{ cash: 1 }, { cash: 2 }]);
  });
});

/**
 * Candidate lineage: which unload record survives the next boot.
 *
 * A candidate carries the version this window had *confirmed*, and `flushSave`
 * records the current memory — which already contains the action whose commit is
 * still in flight. So a candidate can be one revision ahead of its own base, and
 * the record that lands behind it can be this window's own earlier write. These
 * four cases are the ones the version arithmetic gets wrong in either direction:
 * it deletes progress that only this window could have written, and it would
 * keep a snapshot its own window has already overtaken.
 */
describe('unload candidate lineage against the committed record', () => {
  it('identifies a payload by the bytes the record would hold, not by a version', () => {
    const world = JSON.stringify({ cash: 500, inventory: { 'item.breakfast-voucher': 2 } });
    expect(payloadIdentity(world)).toBe(payloadIdentity(world));
    expect(payloadIdentity(`${world} `)).not.toBe(payloadIdentity(world));
    expect(payloadIdentity(JSON.stringify({ cash: 501, inventory: { 'item.breakfast-voucher': 2 } }))).not.toBe(payloadIdentity(world));
  });

  /** One committed version (one voucher), with nothing else in flight. */
  function bootWithOneVersion(seed: number, expected: number): ReturnType<typeof createGameStore> {
    const store = createGameStore(content, balance, seed);
    store.getState().dispatch(buyBreakfast);
    expect(storedVouchers()).toBe(expected);
    return store;
  }

  it("keeps the candidate when this window's own in-flight commit lands behind it", async () => {
    const store = bootWithOneVersion(61, 1);
    const base = canonicalSaveHead()!;
    const held = holdCommits();
    try {
      // A is issued and in flight; B is queued behind it and already in memory,
      // which is the state the pagehide flush writes.
      store.getState().dispatch(buyBreakfast);
      await yieldToCommitQueue();
      store.getState().dispatch(buyBreakfast);
      expect(store.getState().game.inventory['item.breakfast-voucher']).toBe(3);
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.baseRevision).toBe(base.revision);
      expect(candidate.state).toMatchObject({ inventory: { 'item.breakfast-voucher': 3 } });

      // A lands; B never does, because the page died with it still queued.
      await settleFirstCanonicalCommit();
      expect(canonicalSaveHead()!.revision).toBe(base.revision + 1);
      expect(storedVouchers()).toBe(2);
      held.abandon();
      expect(storedVouchers()).toBe(2);

      // The record is ahead of the candidate's base but holds this window's own
      // earlier state, so the candidate — which carries B — survives and boots.
      expect(collectEmergencyCandidates(canonicalSaveStored())).toHaveLength(1);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(3);
      expect(fresh.getState().recovery?.writeProtected).toBe(true);
      expect(fresh.getState().recovery?.reason).toContain('未能写入正式存档');
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it("clears the candidate once this window's own queued write landed as well", async () => {
    const store = bootWithOneVersion(63, 1);
    const held = holdCommits();
    try {
      store.getState().dispatch(buyBreakfast);
      await yieldToCommitQueue();
      store.getState().dispatch(buyBreakfast);
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.state).toMatchObject({ inventory: { 'item.breakfast-voucher': 3 } });

      // Both writes land: the record ends up holding exactly the candidate's world.
      await settleCanonicalSave();
      expect(storedVouchers()).toBe(3);
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
      expect(localStorage.getItem(candidate.key)).toBeNull();

      const fresh = createGameStore(content, balance);
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(3);
      expect(fresh.getState().recovery).toBeUndefined();
    } finally {
      held.abandon();
    }
  });

  it("drops the candidate when another window wrote the record after it", async () => {
    const store = bootWithOneVersion(65, 1);
    const held = holdCommits();
    try {
      store.getState().dispatch(buyBreakfast);
      await yieldToCommitQueue();
      store.getState().flushSave();
      expect(collectEmergencyCandidates()).toHaveLength(1);
      await settleFirstCanonicalCommit();
      held.abandon();
      expect(storedVouchers()).toBe(2);

      // Another window commits its own world on top of that version.
      await anotherWindowCommits(777);
      expect(canonicalSaveHead()!.revision).toBe(3);

      // Revision 3 is neither this candidate's world nor a payload this window
      // issued, so the candidate lost the race and must not be offered.
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().recovery).toBeUndefined();
      expect(fresh.getState().game.cash).toBe(777);
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(2);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it("drops the candidate its own window has overtaken after the snapshot", async () => {
    const store = bootWithOneVersion(67, 1);
    const held = holdCommits();
    try {
      // Same window, same shape as the case above — except the write that lands
      // after the snapshot is this window's own. It is still not this window's
      // *earlier* write: the payload is issued after the snapshot, so the record
      // is newer than the candidate and the candidate must not be offered.
      store.getState().dispatch(buyBreakfast);
      await yieldToCommitQueue();
      store.getState().flushSave();
      expect(collectEmergencyCandidates()).toHaveLength(1);

      store.getState().dispatch(buyBreakfast);
      await settleCanonicalSave();
      expect(storedVouchers()).toBe(3);
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);

      const fresh = createGameStore(content, balance);
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(3);
      expect(fresh.getState().recovery).toBeUndefined();
    } finally {
      held.abandon();
    }
  });

  it('does not keep a candidate when a later write repeats an earlier payload', async () => {
    // `simulationSpeed` is persisted and reversible, so the *same* payload can
    // legitimately be written again after the snapshot. A record that repeats a
    // payload from this window's past is therefore not evidence that the record
    // is the write the candidate was waiting for.
    const store = createGameStore(content, balance, 71);
    store.getState().dispatch(setSpeed(4));
    await settleCanonicalSave();
    expect(storedSpeed()).toBe(4);
    store.getState().dispatch(setSpeed(2));
    await settleCanonicalSave();
    const base = canonicalSaveHead()!;
    expect(base.revision).toBe(2);

    const held = holdCommits();
    try {
      // A (speed 1) is issued and in flight; nothing else changes the memory, so
      // the candidate carries exactly the payload A is writing.
      store.getState().dispatch(setSpeed(1));
      await yieldToCommitQueue();
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.lineage).toBe('current');
      expect(candidate.inFlight).toHaveLength(1);
      expect(candidate.inFlight[0]).toBe(candidate.payloadId);

      // A never lands (its transaction fails), and after the snapshot the player
      // sets the speed back to 4: a new write, one revision after the base, whose
      // payload is identical to the one stored at revision 1.
      failNextCanonicalCommit('提交失败');
      store.getState().dispatch(setSpeed(4));
      await settleCanonicalSave();
      expect(canonicalSaveHead()!.revision).toBe(base.revision + 1);
      expect(storedSpeed()).toBe(4);

      expect(collectEmergencyCandidates(canonicalSaveStored()), '重复的旧载荷不是候选等待的那次提交').toEqual([]);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().recovery).toBeUndefined();
      expect(fresh.getState().game.simulationSpeed).toBe(4);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('a rotated generation supersedes a candidate even when the record repeats an in-flight payload', async () => {
    const store = createGameStore(content, balance, 72);
    store.getState().dispatch(buyBreakfast);
    await settleCanonicalSave();

    const held = holdCommits();
    try {
      // Exactly what the next commit writes: the world right after this action,
      // serialized by the same call the commit itself makes.
      store.getState().dispatch(buyBreakfast);
      const pendingPayload = JSON.stringify(store.getState().game);
      await yieldToCommitQueue();
      store.getState().dispatch(buyBreakfast);
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.inFlight).toEqual([payloadIdentity(pendingPayload)]);
      expect(candidate.payloadId).not.toBe(payloadIdentity(pendingPayload));
      held.abandon();

      // Another window rotates the save: a first revision in a new generation
      // whose payload is byte-identical to the commit this window had in flight.
      const rotated = await canonicalSaveDouble().commit({ expected: canonicalSaveHead(), payload: pendingPayload, rotate: true });
      expect(rotated.status).toBe('committed');
      const head = canonicalSaveHead()!;
      expect(head.revision).toBe(1);
      expect(head.generation).not.toBe(candidate.baseGeneration);

      // The identity matches, but this window did not create that generation, so
      // the candidate belongs to a generation that no longer exists.
      expect(collectEmergencyCandidates(canonicalSaveStored())).toEqual([]);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().recovery).toBeUndefined();
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(2);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it("keeps the candidate when this window's own reset is the commit still in flight", async () => {
    const store = createGameStore(content, balance, 73);
    store.getState().dispatch(buyBreakfast);
    await settleCanonicalSave();
    const held = holdCommits();
    try {
      // The reset is in flight when the page hides; the purchase behind it is
      // already in memory, so the candidate is the reset world plus that action.
      store.getState().reset(4242);
      await yieldToCommitQueue();
      store.getState().dispatch(buyBreakfast);
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.creatingGeneration, '创建世代的令牌必须在提交前就确定').toBeDefined();
      expect(candidate.inFlight).toHaveLength(1);

      // The reset lands — a first revision in the new generation, which is the
      // commit the candidate was waiting for — and the queued action never does.
      await settleFirstCanonicalCommit();
      held.abandon();
      const head = canonicalSaveHead()!;
      expect(head.revision).toBe(1);
      expect(head.generation).not.toBe(candidate.baseGeneration);

      expect(collectEmergencyCandidates(canonicalSaveStored())).toHaveLength(1);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(1);
      expect(fresh.getState().recovery?.writeProtected).toBe(true);
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('a foreign generation that repeats the reset payload does not keep the candidate', async () => {
    const store = createGameStore(content, balance, 75);
    store.getState().dispatch(buyBreakfast);
    await settleCanonicalSave();
    const base = canonicalSaveHead()!;

    const held = holdCommits();
    try {
      // The reset is in flight and is never written; the action behind it is
      // already in memory, so the candidate is the reset world plus that action.
      store.getState().reset(4242);
      const resetPayload = JSON.stringify(store.getState().game);
      await yieldToCommitQueue();
      store.getState().dispatch(buyBreakfast);
      store.getState().flushSave();
      const [candidate] = collectEmergencyCandidates();
      expect(candidate.baseRevision).toBe(base.revision);
      expect(candidate.creatingGeneration, '创建世代的令牌必须在提交前就确定').toBeDefined();
      held.abandon();

      // Another window resets the same record and happens to produce exactly the
      // same world: identical payload bytes, different generation.
      const foreign = await canonicalSaveDouble().commit({ expected: base, payload: resetPayload, rotate: true });
      expect(foreign.status).toBe('committed');
      const head = canonicalSaveHead()!;
      expect(head.revision).toBe(1);
      expect(head.generation).not.toBe(candidate.creatingGeneration);

      expect(collectEmergencyCandidates(canonicalSaveStored()), '载荷字节相同不等于世代是本窗口创建的').toEqual([]);
      const fresh = createGameStore(content, balance);
      expect(fresh.getState().recovery).toBeUndefined();
    } finally {
      canonicalSaveDouble().release();
    }
  });

  it('keeps a current-format candidate whose lineage fields cannot be read', () => {
    const store = createGameStore(content, balance, 74);
    store.getState().dispatch(buyBreakfast);
    const head = canonicalSaveHead()!;
    const behind = { baseGeneration: head.generation, baseRevision: head.revision - 1, save: { inventory: { 'item.breakfast-voucher': 9 } } };
    // Claiming the current lineage format with unreadable evidence is not the
    // same as being an old record: it is kept and offered, never pruned as if
    // the version arithmetic were all there was.
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'damaged.lineage', JSON.stringify({ ...behind, lineageVersion: 1, inFlight: 'not-an-array' }));
    localStorage.setItem(EMERGENCY_SAVE_PREFIX + 'old.format', JSON.stringify(behind));

    const fresh = createGameStore(content, balance);
    expect(fresh.getState().recovery?.reason).toContain('未能写入正式存档');
    expect(fresh.getState().game.inventory['item.breakfast-voucher']).toBe(9);
    // The old record, which carries no marker at all, still falls back to the
    // version arithmetic and is pruned behind the stored revision.
    expect(localStorage.getItem(EMERGENCY_SAVE_PREFIX + 'old.format')).toBeNull();
    expect(localStorage.getItem(EMERGENCY_SAVE_PREFIX + 'damaged.lineage')).not.toBeNull();
    expect(collectEmergencyCandidates(canonicalSaveStored()).map((entry) => entry.key)).toEqual(['yuliang-pending-damaged.lineage']);
  });
});
