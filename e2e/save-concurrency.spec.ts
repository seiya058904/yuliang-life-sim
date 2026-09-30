/**
 * Release-gate proof for the canonical save protocol.
 *
 * The authoritative save is one record in IndexedDB —
 * `{ slot, generation, revision, payload }` — and every save is a
 * compare-and-commit inside a single `readwrite` transaction: read the record,
 * compare the version this window confirmed, then replace the payload and
 * advance the revision. This file exists because the earlier protocol (an
 * exclusive Web Lock around a read-compare-write of `localStorage`) was
 * measured to let two writes land from the same version: with two independently
 * created documents and a fast handover (0.1–0.4 ms) the second writer's
 * in-lock read returned the pre-write snapshot, so it passed a check that
 * should have failed and stored the payload *and* the revision a second time.
 * A lock orders callbacks; it does not make a non-transactional store atomic.
 *
 * What each test proves, in business terms rather than storage mechanics:
 *
 * - **One write per version.** Two independently created same-origin documents
 *   (separate renderer processes) that confirm the same version and commit
 *   different states must produce exactly one canonical write and exactly one
 *   new version. The write *count* is asserted, not only the final value: the
 *   defect this replaced produced a plausible-looking final value out of two
 *   writes.
 * - **Measured phases.** The race, the loser's follow-up and the winner's
 *   follow-up are counted separately, because letting the winner act again
 *   before reading the record is what made an earlier version of this file
 *   report a legal follow-up save as a second write of the race.
 * - **A `put` is not a commit.** The transaction is aborted after the payload
 *   write request succeeded; the record must keep its payload and version, and
 *   the save must be reported as failed, never as saved.
 * - **No notification dependency.** A window learns it is stale from the
 *   transaction that refuses it, so a missing or delayed notification cannot
 *   make a stale write land.
 * - **Unfinished is not saved.** The unload path records a session candidate
 *   instead of claiming a commit, and a superseded queued save stores only the
 *   newest state.
 *
 * Everything runs against the same server as the rest of the suite: `npm run
 * dev` by default, and the production `vite preview` build when
 * `YULIANG_E2E_SERVER=preview` is set (see playwright.config.ts). The record is
 * read straight out of IndexedDB, so the assertions observe the database path
 * rather than the application's own reporting.
 *
 * The only injected faults are the ones that cannot be reached from the UI (an
 * aborted transaction, a suspended commit), and they say so in their names and
 * in their `test.describe` block.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  awaitAppReady,
  awaitCanonicalSynced,
  bootWithBridge,
  canonicalHead,
  openApp,
  readCanonicalRecord,
  readCanonicalState,
  saveRevision,
  writeCanonicalState,
} from './harness';

/** Session-scoped unload candidates. */
const EMERGENCY_PREFIX = 'yuliang-pending-';

interface WriteObservation { revision: number; at: number }

declare global {
  interface Window {
    __canonicalWrites?: WriteObservation[];
    __releaseSaveCommits?: () => void;
  }
}

/**
 * Count the payload writes this document issues to the canonical store, by
 * wrapping `IDBObjectStore.put` and delegating every call unchanged. A
 * conflicting commit issues no request at all, so this counts the commits that
 * attempted a payload; only a committed transaction can advance the record,
 * which is why every assertion below also checks the stored version.
 */
async function countCanonicalWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    const proto = IDBObjectStore.prototype;
    const original = proto.put;
    window.__canonicalWrites = [];
    proto.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const record = value as { slot?: string; revision?: number } | null;
      if (record && record.slot === 'main') window.__canonicalWrites!.push({ revision: Number(record.revision), at: performance.timeOrigin + performance.now() });
      return arguments.length > 1 ? original.call(this, value, key as IDBValidKey) : original.call(this, value);
    } as typeof proto.put;
  });
}

const canonicalWrites = (page: Page): Promise<WriteObservation[]> =>
  page.evaluate(() => window.__canonicalWrites ?? []);

/** Restart this document's write count, so one phase cannot be charged to another. */
async function resetWriteCount(page: Page): Promise<void> {
  await page.evaluate(() => { window.__canonicalWrites = []; });
}

const writeCounts = async (pages: Page[]): Promise<WriteObservation[]> => {
  const logs = await Promise.all(pages.map(canonicalWrites));
  return logs.flat().sort((a, b) => a.at - b.at);
};

const dispatchPurchase = (page: Page, vouchers: number): Promise<boolean> =>
  page.evaluate((count) => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': count } }), vouchers);

const persistedVouchers = async (page: Page): Promise<number> => {
  const state = await readCanonicalState(page);
  const inventory = state.inventory as Record<string, number> | undefined;
  return inventory?.['item.breakfast-voucher'] ?? 0;
};

const isFrozen = (page: Page): Promise<boolean> => page.evaluate(() => window.__yuliang.store.getState().externalSaveConflict);
const confirmedHead = (page: Page) => page.evaluate(() => window.__yuliang.store.getState().canonical.head ?? null);
const saveError = (page: Page) => page.evaluate(() => window.__yuliang.store.getState().saveError ?? null);
const recoveryState = (page: Page) => page.evaluate(() => {
  const recovery = window.__yuliang.store.getState().recovery;
  return recovery ? { writeProtected: Boolean(recovery.writeProtected), reason: recovery.reason } : null;
});
const inMemoryVouchers = (page: Page): Promise<number> => page.evaluate(() => window.__yuliang.store.getState().game.inventory['item.breakfast-voucher'] ?? 0);

/** Open a second same-origin document in its own renderer process. */
async function openSecondDocument(context: BrowserContext): Promise<Page> {
  const second = await context.newPage();
  // The debug-bridge flag is already in this context's `localStorage`, so this
  // document boots with the bridge without wiping the shared record.
  await openApp(second);
  await countCanonicalWrites(second);
  return second;
}

/** Hold every commit of this document open until `releaseSuspendedCommits`. */
async function suspendCommits(page: Page): Promise<void> {
  await page.evaluate(() => {
    const releases: Array<() => void> = [];
    let released = false;
    window.__releaseSaveCommits = () => {
      released = true;
      for (const release of releases.splice(0)) release();
    };
    // Once released, every later commit goes straight through: a commit queued
    // behind the suspended one must not need a second release that nobody makes.
    window.__yuliang.saveHooks.beforeCommitRequest = () => (released ? undefined : new Promise<void>((resolve) => { releases.push(resolve); }));
  });
}

const releaseSuspendedCommits = (page: Page): Promise<void> =>
  page.evaluate(() => window.__releaseSaveCommits?.());

interface PendingCandidate {
  baseGeneration?: string;
  baseRevision: number;
  payloadId?: string;
  trimmedId?: string;
  issued?: string[];
  save: { inventory?: Record<string, number> };
}

/** Session unload candidates this document can see, parsed. */
const pendingCandidates = (page: Page): Promise<PendingCandidate[]> => page.evaluate((prefix) => Object.keys(localStorage)
  .filter((key) => key.startsWith(prefix))
  .map((key) => JSON.parse(localStorage.getItem(key) ?? '{}')), EMERGENCY_PREFIX);

interface PageAction { type: string; [key: string]: unknown }

const purchase = (vouchers: number): PageAction => ({ type: 'purchase_items', items: { 'item.breakfast-voucher': vouchers } });
const setSpeed = (speed: number): PageAction => ({ type: 'set_simulation_speed', speed });
/** Test-only marker, not a game action: `reset` is a store method, not a dispatchable action. */
const resetWorld = (seed: number): PageAction => ({ type: 'e2e:reset', seed });

/**
 * Hide with a commit already in flight: the first step reaches the backend, a
 * second step is taken while that write is still open, and the flush —
 * `pagehide` and `visibilitychange` share one handler — then records the current
 * memory. It runs entirely in microtasks on purpose: an IndexedDB transaction
 * can only settle in a later task, so the record provably does not have the
 * first write yet and the candidate's base version is one behind the memory it
 * carries. That is the shape the candidate lineage has to survive.
 *
 * The payload the in-flight commit is writing is returned: the world right after
 * the first step, serialized by the same call the commit makes.
 */
async function hideWithCommitInFlight(page: Page, first: PageAction, second?: PageAction): Promise<string> {
  return page.evaluate(({ first: pending, second: queued }) => {
    const store = window.__yuliang.store;
    const run = (step: { type: string; [key: string]: unknown }) => {
      if (step.type === 'e2e:reset') store.getState().reset(Number(step.seed));
      else store.getState().dispatch(step as never);
    };
    run(pending);
    const pendingPayload = JSON.stringify(store.getState().game);
    let chain = Promise.resolve();
    for (let hop = 0; hop < 4; hop += 1) chain = chain.then(() => undefined);
    return chain.then(() => {
      if (queued) run(queued);
      document.dispatchEvent(new Event('visibilitychange'));
      return pendingPayload;
    });
  }, { first, second });
}

/**
 * Refuse the nth commit of this document after its payload request succeeded,
 * which rolls that transaction back. The committed-then-rolled-back write is
 * exactly what a page that dies before its write commits leaves behind.
 */
async function abortCommitNumber(page: Page, nth: number): Promise<void> {
  await page.evaluate((target) => {
    let calls = 0;
    window.__yuliang.saveHooks.afterPutBeforeComplete = () => (++calls === target ? 'abort' : undefined);
  }, nth);
}

/** Refuse every commit from the nth on: the page died before any of them landed. */
async function abortCommitsFrom(page: Page, nth: number): Promise<void> {
  await page.evaluate((from) => {
    let calls = 0;
    window.__yuliang.saveHooks.afterPutBeforeComplete = () => (++calls >= from ? 'abort' : undefined);
  }, nth);
}

test.describe('canonical save protocol (one IndexedDB transaction per save)', () => {
  test('an action commits the canonical record exactly once and advances its version', async ({ page }) => {
    await bootWithBridge(page);
    expect(await canonicalHead(page)).toBeNull();
    await countCanonicalWrites(page);

    expect(await dispatchPurchase(page, 2)).toBe(true);
    await awaitCanonicalSynced(page);

    expect(await writeCounts([page])).toHaveLength(1);
    expect(await persistedVouchers(page)).toBe(2);
    expect(await saveRevision(page)).toBe(1);
    expect(await isFrozen(page)).toBe(false);

    // A second action is another save: a new version, still one write each.
    await resetWriteCount(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(2);
    expect(await writeCounts([page])).toHaveLength(1);
    expect(await persistedVouchers(page)).toBe(3);
  });

  test('a normally running game autosaves without leaving unsaved progress behind', async ({ page }) => {
    await bootWithBridge(page);

    // Run the simulation long enough for the throttled autosave to fire.
    await page.evaluate(() => {
      const store = window.__yuliang.store;
      store.setState({ game: { ...store.getState().game, simulationMode: 'running' } });
      store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
    });
    await expect.poll(async () => ((await readCanonicalState(page)).time as { minute?: number } | undefined)?.minute ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);

    await awaitCanonicalSynced(page);
    const inMemory = await page.evaluate(() => (window.__yuliang.store.getState().game as unknown as { time: unknown }).time);
    expect((await readCanonicalState(page)).time).toEqual(inMemory);
    expect(await saveRevision(page)).toBeGreaterThan(0);

    // A normal autosave must not leave an "unsaved progress" anomaly behind.
    const pendingKeys = await page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)), EMERGENCY_PREFIX);
    expect(pendingKeys).toEqual([]);
    await openApp(page);
    expect(await recoveryState(page)).toBeNull();
  });

  for (const shape of ['A commits first', 'B commits first', 'both commit at once'] as const) {
    test(`two documents committing from the same version land exactly one write (${shape})`, async ({ context, page }) => {
      for (let round = 1; round <= 2; round += 1) {
        await bootWithBridge(page);
        // Round setup: one canonical version that both documents confirm.
        expect(await dispatchPurchase(page, 1)).toBe(true);
        await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
        const second = await openSecondDocument(context);
        await countCanonicalWrites(page);
        const before = (await canonicalHead(page))!;
        expect(await confirmedHead(page)).toEqual(before);
        await expect.poll(() => confirmedHead(second), { timeout: 10_000 }).toEqual(before);

        try {
          // ---- phase 1: the race, with its own write count -------------------
          if (shape === 'both commit at once') {
            await Promise.all([dispatchPurchase(page, 2), dispatchPurchase(second, 3)]);
          } else if (shape === 'A commits first') {
            await dispatchPurchase(page, 2);
            await dispatchPurchase(second, 3);
          } else {
            await dispatchPurchase(second, 3);
            await dispatchPurchase(page, 2);
          }
          await expect.poll(async () => (await writeCounts([page, second])).length, {
            timeout: 10_000,
            message: `第 ${round} 轮：竞争阶段只允许一次正式写入`,
          }).toBe(1);
          await expect.poll(async () => [await isFrozen(page), await isFrozen(second)].filter(Boolean).length, {
            timeout: 10_000,
            message: `第 ${round} 轮：落败的一方必须被事务拒绝并冻结`,
          }).toBe(1);

          const after = (await canonicalHead(page))!;
          const vouchers = await persistedVouchers(page);
          expect(after.generation, `第 ${round} 轮：正式记录只在同一世代内前进`).toBe(before.generation);
          expect(after.revision, `第 ${round} 轮：版本只前进一次`).toBe(before.revision + 1);
          // The setup bought one voucher, so the winner's own state is 1+2 or
          // 1+3: either window may win, but the record is never a blend of both.
          expect([3, 4], `第 ${round} 轮：正式记录必须是某一方的完整状态`).toContain(vouchers);

          const winner = vouchers === 3 ? page : second;
          const loser = vouchers === 3 ? second : page;
          expect(await isFrozen(winner)).toBe(false);
          expect(await isFrozen(loser)).toBe(true);

          // ---- phase 2: the loser may not write, and the record does not move
          expect(await dispatchPurchase(loser, 9)).toBe(false);
          expect(await persistedVouchers(page)).toBe(vouchers);
          expect((await canonicalHead(page))!.revision).toBe(before.revision + 1);

          // ---- phase 3: the winner's own later action is a new, counted save
          await resetWriteCount(page);
          await resetWriteCount(second);
          expect(await dispatchPurchase(winner, 1)).toBe(true);
          await expect.poll(async () => (await canonicalHead(page))!.revision, { timeout: 10_000 }).toBe(before.revision + 2);
          expect(await writeCounts([winner]), `第 ${round} 轮：赢家的后续操作是一次独立写入`).toHaveLength(1);
          expect(await writeCounts([loser]), `第 ${round} 轮：落败方在后续阶段不得写入`).toHaveLength(0);
          expect(await persistedVouchers(page)).toBe(vouchers + 1);
        } finally {
          await second.close();
        }
      }
    });
  }

  test('a window learns it is stale from the transaction that refuses it, not from a notification', async ({ context, page }) => {
    await bootWithBridge(page);
    const second = await openSecondDocument(context);
    try {
      // Both windows confirmed the same (absent) version; the first one creates it.
      expect(await dispatchPurchase(page, 1)).toBe(true);
      await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
      // Nothing is delivered to the second window: no event, no channel.
      expect(await isFrozen(second)).toBe(false);

      await countCanonicalWrites(second);
      expect(await dispatchPurchase(second, 4)).toBe(true);
      // Its commit carries the version it confirmed, so the transaction refuses
      // it: the record keeps the first window's payload and version, the refused
      // window is frozen, and no payload write was ever issued.
      await expect.poll(() => isFrozen(second), { timeout: 10_000 }).toBe(true);
      expect(await writeCounts([second])).toHaveLength(0);
      expect(await persistedVouchers(page)).toBe(1);
      expect(await saveRevision(page)).toBe(1);
      // The freeze is what the player sees in the refused window; nothing there
      // claims the progress was saved.
      await expect(second.getByRole('alert').filter({ hasText: '另一个游戏窗口已经更新了存档' })).toBeVisible();
    } finally {
      await second.close();
    }
  });

  test('two windows migrating the same legacy save cannot both create the record', async ({ context, page }) => {
    await bootWithBridge(page);
    // Only the legacy payload exists: no canonical record at all, which is
    // exactly the state an upgrading player is in.
    await page.evaluate(() => {
      const state = { inventory: { 'item.breakfast-voucher': 0 }, cash: 500, simulationMode: 'paused' };
      localStorage.setItem('yuliang-save-v1', JSON.stringify(state));
    });
    expect(await canonicalHead(page)).toBeNull();

    const second = await context.newPage();
    await Promise.all([openApp(page), openApp(second)]);
    // Neither window wrote at boot: the migration is stored by the first commit.
    expect(await canonicalHead(page)).toBeNull();
    expect(await confirmedHead(page)).toBeNull();
    expect(await inMemoryVouchers(page)).toBe(0);

    await countCanonicalWrites(page);
    await countCanonicalWrites(second);
    await Promise.all([dispatchPurchase(page, 2), dispatchPurchase(second, 3)]);
    await expect.poll(async () => (await writeCounts([page, second])).length, { timeout: 10_000, message: '首次迁移只允许创建一个正式记录' }).toBe(1);
    await expect.poll(async () => [await isFrozen(page), await isFrozen(second)].filter(Boolean).length, { timeout: 10_000 }).toBe(1);

    const record = (await canonicalHead(page))!;
    expect(record.revision).toBe(1);
    expect([2, 3]).toContain(await persistedVouchers(page));
    // The legacy payload is left untouched: it is a downgrade copy, never a source.
    expect(await page.evaluate(() => localStorage.getItem('yuliang-save-v1'))).not.toBeNull();
    await second.close();
  });

  test('the unload path records a candidate and never writes the canonical record', async ({ context, page }) => {
    await bootWithBridge(page);
    await countCanonicalWrites(page);
    // A commit that never settles: the page hides with unsaved progress.
    await suspendCommits(page);
    expect(await dispatchPurchase(page, 3)).toBe(true);
    expect(await writeCounts([page])).toHaveLength(0);

    // pagehide/visibilitychange: the flush cannot wait for a transaction, so it
    // records a session candidate instead of claiming the save landed.
    await page.goto('about:blank');

    // A new same-origin window is the only place the record can be observed now.
    const fresh = await context.newPage();
    await openApp(fresh);
    expect(await readCanonicalRecord(fresh), '卸载路径不得写入正式记录').toBeNull();
    await expect.poll(async () => (await recoveryState(fresh))?.writeProtected ?? false, { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await recoveryState(fresh))?.reason ?? '', { timeout: 10_000 }).toContain('未能写入正式存档');
    expect(await inMemoryVouchers(fresh)).toBe(3);

    // The explicit confirmation promotes the candidate into the canonical save.
    await fresh.evaluate(() => window.__yuliang.store.getState().acceptRecovery());
    await expect.poll(() => saveRevision(fresh), { timeout: 10_000 }).toBe(1);
    expect(await persistedVouchers(fresh)).toBe(3);
  });

  test('a queued save that a newer action superseded commits only the newer state', async ({ page }) => {
    await bootWithBridge(page);
    await countCanonicalWrites(page);
    await suspendCommits(page);
    expect(await dispatchPurchase(page, 2)).toBe(true);
    expect(await dispatchPurchase(page, 5)).toBe(true);
    expect(await canonicalHead(page)).toBeNull();

    await releaseSuspendedCommits(page);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    // The superseded request never wrote: only the newest state is stored, once.
    expect(await writeCounts([page])).toHaveLength(1);
    expect(await persistedVouchers(page)).toBe(7);
    expect(await isFrozen(page)).toBe(false);
  });

  test('reset starts a new generation, and is refused once another window advanced the version', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    const firstHead = (await canonicalHead(page))!;

    // A reset by the window that owns the current version rotates the generation.
    await page.evaluate(() => window.__yuliang.store.getState().reset(4242));
    await expect.poll(async () => (await canonicalHead(page))!.generation, { timeout: 10_000 }).not.toBe(firstHead.generation);
    const rotated = (await canonicalHead(page))!;
    expect(rotated.revision).toBe(1);
    expect(await persistedVouchers(page)).toBe(0);

    // Once another window advances the version, the same window's reset is
    // refused: an older queued request cannot be re-qualified either.
    const second = await openSecondDocument(context);
    try {
      await expect.poll(() => confirmedHead(second), { timeout: 10_000 }).toEqual(rotated);
      expect(await dispatchPurchase(second, 4)).toBe(true);
      await expect.poll(async () => (await canonicalHead(page))!.revision, { timeout: 10_000 }).toBe(rotated.revision + 1);
      await page.evaluate(() => window.__yuliang.store.getState().reset(777));
      await expect.poll(() => isFrozen(page), { timeout: 10_000 }).toBe(true);
      expect((await canonicalHead(page))!.revision).toBe(rotated.revision + 1);
      expect(await persistedVouchers(page)).toBe(4);
    } finally {
      await second.close();
    }
  });
});

test.describe('unload candidate lineage against the committed record', () => {
  test("an in-flight commit of this window does not supersede its own unload candidate", async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);

    // The write that lands is the first one; the write queued behind it is
    // refused at commit time, which is what a page that dies before its second
    // write commits leaves behind.
    await abortCommitNumber(page, 2);
    await hideWithCommitInFlight(page, purchase(1), purchase(1));

    const [candidate] = await pendingCandidates(page);
    expect(candidate.baseRevision).toBe(1);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(3);

    // The in-flight write lands on its own: the record advances to the state it
    // was already writing, which is *behind* the candidate, not past it.
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(2);
    expect(await persistedVouchers(page)).toBe(2);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');
    expect(await inMemoryVouchers(page)).toBe(3);

    // A fresh boot: the record is a revision ahead of the candidate's base, but
    // its payload is a write this window issued before the snapshot, so the
    // action that never got its own commit is recovered instead of dropped.
    const reader = await openSecondDocument(context);
    await expect.poll(async () => (await recoveryState(reader))?.writeProtected ?? false, { timeout: 10_000 }).toBe(true);
    expect(await recoveryState(reader)).not.toBeNull();
    expect(await inMemoryVouchers(reader)).toBe(3);
    expect(await persistedVouchers(reader), '恢复只是提议，正式记录不得被改写').toBe(2);
  });

  test('a candidate whose own queued write landed as well is cleared, not offered', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    await countCanonicalWrites(page);

    await hideWithCommitInFlight(page, purchase(1), purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(3);

    // Both writes commit: the record ends up holding exactly the candidate's
    // world, so there is nothing left to recover.
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(3);
    expect(await persistedVouchers(page)).toBe(3);
    expect(await writeCounts([page]), '两次业务写入各发出一次写请求').toHaveLength(2);
    expect(await isFrozen(page)).toBe(false);

    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await inMemoryVouchers(reader)).toBe(3);
    expect(await pendingCandidates(reader)).toEqual([]);
  });

  test('a candidate is dropped when another window advanced the record after it', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);

    // The other window confirms version 1 before this one hides, so it can still
    // write after this window's own commit has been rolled back.
    const other = await openSecondDocument(context);
    await abortCommitNumber(page, 1);
    await hideWithCommitInFlight(page, purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(2);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');
    expect(await saveRevision(page)).toBe(1);

    expect(await dispatchPurchase(other, 5)).toBe(true);
    await expect.poll(() => saveRevision(other), { timeout: 10_000 }).toBe(2);
    expect(await persistedVouchers(other)).toBe(6);

    // Revision 2 is neither this candidate's world nor a payload this window
    // issued, so the candidate lost the race and must not be offered.
    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await inMemoryVouchers(reader)).toBe(6);
    expect(await pendingCandidates(reader)).toEqual([]);
  });

  test('a candidate its own window has overtaken is not offered as recovery', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);

    // Hide with a write in flight, then keep playing: the flush is a snapshot of
    // memory, and this window's own next write moves the record past it (a page
    // that comes back from the background does exactly this).
    await hideWithCommitInFlight(page, purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.baseRevision).toBe(1);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(2);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(2);

    expect(await dispatchPurchase(page, 3)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(3);
    expect(await persistedVouchers(page)).toBe(5);

    // The record is newer than the candidate and was written by this same
    // window, so nothing was lost: offering the older snapshot as recovery would
    // offer to roll the player back.
    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await inMemoryVouchers(reader)).toBe(5);
    expect(await pendingCandidates(reader)).toEqual([]);
  });

  test('a later write that repeats an earlier payload does not keep the candidate', async ({ context, page }) => {
    await bootWithBridge(page);
    // The simulation speed is persisted and reversible, so the very same payload
    // can legitimately be written again later. Evidence made of past payloads
    // cannot tell that apart from the write a candidate is waiting for.
    await page.evaluate((action) => { window.__yuliang.store.getState().dispatch(action as never); }, setSpeed(4));
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    const firstPayload = (await readCanonicalRecord(page))!.payload;
    await page.evaluate((action) => { window.__yuliang.store.getState().dispatch(action as never); }, setSpeed(2));
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(2);

    // The write in flight when the page hides is rolled back, so the record keeps
    // version 2 while the candidate carries the (uncommitted) speed-1 world.
    await abortCommitNumber(page, 1);
    await hideWithCommitInFlight(page, setSpeed(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.baseRevision).toBe(2);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');
    expect(await saveRevision(page)).toBe(2);

    // The page keeps running and the player sets the speed back to 4: a new write
    // at revision 3 whose payload is byte-identical to revision 1.
    await page.evaluate((action) => { window.__yuliang.store.getState().dispatch(action as never); }, setSpeed(4));
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(3);
    expect((await readCanonicalRecord(page))!.payload).toBe(firstPayload);

    // The record repeats an old world, but it is not the commit the candidate was
    // waiting for, and it is a revision the candidate does not explain.
    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await page.evaluate(() => window.__yuliang.store.getState().game.simulationSpeed)).toBe(4);
    expect(await reader.evaluate(() => window.__yuliang.store.getState().game.simulationSpeed)).toBe(4);
    expect(await pendingCandidates(reader)).toEqual([]);
  });

  test('a rotated generation supersedes a candidate even when the record repeats an in-flight payload', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);

    // Hide with one write in flight and one queued behind it; the helper returns
    // the payload that in-flight write is putting on the wire.
    const pendingPayload = await hideWithCommitInFlight(page, purchase(1), purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(3);

    // Another window rotates the save: a first revision in a new generation whose
    // payload is byte-identical to the commit this window had in flight. The
    // fixture writes straight to the database, so no document boots in between
    // and prunes the candidate before the rotation is even in place.
    await writeCanonicalState(page, JSON.parse(pendingPayload) as unknown);
    const rotated = (await canonicalHead(page))!;
    expect(rotated.revision).toBe(1);
    expect(rotated.generation).not.toBe(candidate.baseGeneration);
    expect((await readCanonicalRecord(page))!.payload).toBe(pendingPayload);

    // The identity matches, but this window did not create that generation: the
    // candidate belongs to a generation that no longer exists.
    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await inMemoryVouchers(reader)).toBe(2);
    expect(await pendingCandidates(reader)).toEqual([]);
  });

  test("this window's own reset in flight keeps the candidate it was carrying", async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    const before = (await canonicalHead(page))!;

    // The reset is in flight and the action behind it is already in memory; the
    // action is refused at commit time, so the page dies with it unwritten.
    await abortCommitNumber(page, 2);
    await hideWithCommitInFlight(page, resetWorld(4242), purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.baseRevision).toBe(1);
    expect(candidate.save.inventory!['item.breakfast-voucher']).toBe(1);

    // The reset lands — a first revision in the generation this window created —
    // and the action queued behind it does not.
    await expect.poll(async () => (await canonicalHead(page))!.generation, { timeout: 10_000 }).not.toBe(before.generation);
    expect((await canonicalHead(page))!.revision).toBe(1);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');
    expect(await persistedVouchers(page)).toBe(0);

    // Boot: the new generation is provably this window's own, so the action that
    // never got its own commit is recovered instead of dropped.
    const reader = await openSecondDocument(context);
    await expect.poll(async () => (await recoveryState(reader))?.writeProtected ?? false, { timeout: 10_000 }).toBe(true);
    expect(await inMemoryVouchers(reader)).toBe(1);
    expect(await persistedVouchers(reader), '恢复只是提议，正式记录不得被改写').toBe(0);
  });

  test('a foreign generation that repeats the reset payload does not keep the candidate', async ({ context, page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    const before = (await canonicalHead(page))!;

    // This window's reset is in flight and is rolled back together with the
    // action behind it, so the generation it was creating never exists.
    await abortCommitsFrom(page, 1);
    const resetPayload = await hideWithCommitInFlight(page, resetWorld(4242), purchase(1));
    const [candidate] = await pendingCandidates(page);
    expect(candidate.baseRevision).toBe(1);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');
    expect(await saveRevision(page)).toBe(1);

    // Another window resets the same record and happens to produce exactly the
    // same world: same payload bytes, different generation.
    await writeCanonicalState(page, JSON.parse(resetPayload) as unknown);
    const foreign = (await canonicalHead(page))!;
    expect(foreign.revision).toBe(1);
    expect(foreign.generation).not.toBe(before.generation);
    expect((await readCanonicalRecord(page))!.payload).toBe(resetPayload);

    // Matching payload bytes are not proof that this window created that
    // generation, so the candidate must not cross the reset boundary.
    const reader = await openSecondDocument(context);
    expect(await recoveryState(reader)).toBeNull();
    expect(await pendingCandidates(reader)).toEqual([]);
  });
});

test.describe('fault injection (not reachable from the UI)', () => {
  test('an aborted transaction keeps the payload and the version and is reported as unsaved', async ({ page }) => {
    await bootWithBridge(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    const before = (await canonicalHead(page))!;
    const payloadBefore = (await readCanonicalRecord(page))!.payload;

    // The payload write request succeeds and the transaction is then aborted:
    // nothing about the record may change, and the save must not be reported as
    // saved. This is what a crash in the middle of a transaction produces.
    await countCanonicalWrites(page);
    await page.evaluate(() => { window.__yuliang.saveHooks.afterPutBeforeComplete = () => 'abort'; });
    expect(await dispatchPurchase(page, 4)).toBe(true);
    await expect.poll(() => saveError(page), { timeout: 10_000 }).toContain('未被替换');

    expect(await writeCounts([page]), '写入请求确实发出过，被中止的是事务').toHaveLength(1);
    await page.waitForTimeout(250);
    expect(await canonicalHead(page)).toEqual(before);
    expect((await readCanonicalRecord(page))!.payload).toBe(payloadBefore);
    // The refused action is still in memory — the player never loses the click —
    // but the record did not follow it, which is what the error above reports.
    expect(await inMemoryVouchers(page)).toBe(5);
    expect(await persistedVouchers(page)).toBe(1);

    // Once the fault is gone the same window saves normally again.
    await page.evaluate(() => { delete window.__yuliang.saveHooks.afterPutBeforeComplete; });
    await resetWriteCount(page);
    expect(await dispatchPurchase(page, 1)).toBe(true);
    await expect.poll(async () => (await canonicalHead(page))!.revision, { timeout: 10_000 }).toBe(before.revision + 1);
    expect(await writeCounts([page])).toHaveLength(1);
    expect(await persistedVouchers(page)).toBe(6);
  });

  test('failed saves stay visible during real ticks until an explicit retry commits', async ({ page }) => {
    await bootWithBridge(page);
    await page.evaluate(() => { window.__yuliang.saveHooks.afterPutBeforeComplete = () => 'abort'; });
    await page.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'start_week' }));
    await expect.poll(() => saveError(page)).toContain('未被替换');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '设置', exact: true });
    await expect(dialog.locator('strong.requirement-missing')).toHaveText('保存失败');
    await page.evaluate(() => {
      for (let tick = 0; tick < 3; tick++) window.__yuliang.store.getState().dispatch({ type: 'advance_simulation', minutes: 1 });
    });
    await expect(dialog).toContainText('未被替换');
    await suspendCommits(page);
    await page.evaluate(() => { void window.__yuliang.store.getState().flushSaveAsync(); });
    await expect(dialog.locator('strong.requirement-missing')).toHaveText('保存失败');
    await page.evaluate(() => { delete window.__yuliang.saveHooks.afterPutBeforeComplete; });
    await releaseSuspendedCommits(page);
    await expect.poll(() => saveError(page)).toBeNull();
    await expect(dialog.locator('strong.requirement-ok')).toHaveText('正常');
  });

  test('a suspended commit writes nothing until it settles, then commits once', async ({ page }) => {
    await bootWithBridge(page);
    await countCanonicalWrites(page);
    await suspendCommits(page);
    expect(await dispatchPurchase(page, 2)).toBe(true);
    expect(await canonicalHead(page), '未提交的写入不得改变正式记录').toBeNull();
    expect(await saveError(page)).toBeNull();

    await releaseSuspendedCommits(page);
    await expect.poll(() => saveRevision(page), { timeout: 10_000 }).toBe(1);
    expect(await writeCounts([page])).toHaveLength(1);
    expect(await persistedVouchers(page)).toBe(2);
  });
});
