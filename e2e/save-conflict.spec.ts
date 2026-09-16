import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { awaitCanonicalSynced, bootWithBridge, canonicalHead, openApp, readCanonicalRecord, writeCanonicalState } from './harness';

/**
 * Cross-window save protection against the canonical IndexedDB record.
 *
 * A window commits by comparing the version it confirmed inside one `readwrite`
 * transaction, so a window whose version has been replaced is refused by the
 * transaction itself. This spec drives that through the real UI and the real
 * database: two same-origin documents, one `localStorage`-free path, and a
 * pagehide flush that must never claim a save it could not make.
 *
 * Deliberate behaviour note: a window that is idle learns it is stale on its
 * next write attempt (nothing relies on a cross-document notification), so the
 * conflict banner appears when the player acts rather than the moment another
 * window saves. The end state is the same: the stale window is frozen, keeps
 * its memory, and offers a reload into the winning save.
 */
const CONFLICT_TEXT = '另一个游戏窗口已经更新了存档';

const confirmedHead = (page: Page) => page.evaluate(() => window.__yuliang.store.getState().canonical.head ?? null);
const isFrozen = (page: Page) => page.evaluate(() => window.__yuliang.store.getState().externalSaveConflict);
const persistedVouchers = async (page: Page): Promise<number> => {
  const record = await readCanonicalRecord(page);
  if (!record) return 0;
  const state = JSON.parse(record.payload) as { inventory?: Record<string, number> };
  return state.inventory?.['item.breakfast-voucher'] ?? 0;
};

async function buyViaShopUi(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('button', { name: '加入购物袋' }).first().click();
  await page.getByRole('button', { name: '一次购买' }).click();
}

/** Hold every commit of this document open until the returned release runs. */
async function suspendCommits(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => {
    const releases: Array<() => void> = [];
    let released = false;
    (window as unknown as { __releaseSaveCommits?: () => void }).__releaseSaveCommits = () => {
      released = true;
      for (const release of releases.splice(0)) release();
    };
    window.__yuliang.saveHooks.beforeCommitRequest = () => (released ? undefined : new Promise<void>((resolve) => { releases.push(resolve); }));
  });
  return async () => {
    await page.evaluate(() => (window as unknown as { __releaseSaveCommits?: () => void }).__releaseSaveCommits?.());
  };
}

/** Arm the debug bridge on a fresh context document without clearing the save. */
async function openWithBridge(context: BrowserContext, flag = true): Promise<Page> {
  const page = await context.newPage();
  if (flag) await page.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  await openApp(page);
  return page;
}

test.describe('cross-window save conflict protection', () => {
  test('a stale window cannot overwrite the newer save made by another window', async ({ browser }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();
    await bootWithBridge(tab1);
    // Eligibility fixture: make sure any first catalog item is affordable.
    await tab1.evaluate(() => {
      const store = (window as unknown as { __yuliang: { store: { setState: (patch: unknown) => void; getState: () => { game: { cash: number } } } } }).__yuliang.store;
      store.setState({ game: { ...store.getState().game, cash: 5_000 } });
    });
    const tab2 = await openWithBridge(context);
    await expect.poll(() => confirmedHead(tab2), { timeout: 10_000 }).toBeNull();

    // tab1 buys through the real shop flow and commits the first version.
    await buyViaShopUi(tab1);
    await awaitCanonicalSynced(tab1);
    const savedByTab1 = await readCanonicalRecord(tab1);
    expect(savedByTab1).not.toBeNull();
    const headAfterTab1 = (await canonicalHead(tab1))!;
    expect(headAfterTab1.revision).toBe(1);

    // tab2's own write is refused by the transaction, and it is frozen.
    const rejected = await tab2.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } }));
    expect(rejected).toBe(true);
    await tab2.getByRole('alert').filter({ hasText: CONFLICT_TEXT }).waitFor({ timeout: 10_000 });
    expect(await isFrozen(tab2)).toBe(true);
    expect(await tab2.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } }))).toBe(false);

    // Its unload flush cannot write either.
    await tab2.evaluate(() => { window.__yuliang.store.getState().flushSave(); });
    await tab2.close();
    expect((await readCanonicalRecord(tab1))!.payload).toBe(savedByTab1!.payload);
    expect((await canonicalHead(tab1))!).toEqual(headAfterTab1);

    // The way out the banner offers: a reload into the winning save.
    const reloaded = await openWithBridge(context);
    await expect(reloaded.getByRole('alert').filter({ hasText: CONFLICT_TEXT })).toHaveCount(0);
    expect(await reloaded.evaluate(() => window.__yuliang.store.getState().game.lifeHistory.some((record: { title: string }) => record.title.startsWith('购买')))).toBe(true);
    await context.close();
  });

  test('simultaneous writers: exactly one commits and the other is refused', async ({ browser }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();
    await bootWithBridge(tab1);
    const tab2 = await openWithBridge(context);
    await expect.poll(() => confirmedHead(tab2), { timeout: 10_000 }).toBeNull();

    // Both windows confirmed "no version yet" and fire a different purchase at
    // the same moment: only one transaction may create the record.
    await Promise.all([
      tab1.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } })),
      tab2.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } })),
    ]);

    await expect.poll(async () => persistedVouchers(tab1), { timeout: 10_000 }).toBeGreaterThan(0);
    const count = await persistedVouchers(tab1);
    // Exactly one writer persisted: 1 or 3 vouchers, never 4 and never none.
    expect([1, 3]).toContain(count);
    expect((await canonicalHead(tab1))!.revision).toBe(1);

    const loser = count === 1 ? tab2 : tab1;
    const winner = count === 1 ? tab1 : tab2;
    await loser.getByRole('alert').filter({ hasText: CONFLICT_TEXT }).waitFor({ timeout: 10_000 });
    expect(await isFrozen(loser)).toBe(true);
    expect(await isFrozen(winner)).toBe(false);

    // Closing the loser must not touch the winner's progress.
    const payloadAfter = (await readCanonicalRecord(winner))!.payload;
    await loser.close();
    await winner.waitForTimeout(200);
    expect((await readCanonicalRecord(winner))!.payload).toBe(payloadAfter);
    await context.close();
  });

  test('an action taken just before close survives as a recovery candidate', async ({ browser }) => {
    const context = await browser.newContext();
    const tab = await context.newPage();
    await tab.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
    await openApp(tab);
    // The commit for the action below is suspended, so the page closes with
    // unsaved memory — the case the unload path exists for.
    await suspendCommits(tab);
    await tab.evaluate(() => { window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } }); });
    expect(await tab.evaluate(() => window.__yuliang.store.getState().game.inventory['item.breakfast-voucher'])).toBe(1);
    expect(await readCanonicalRecord(tab)).toBeNull();

    // A real pagehide through tab.close(): the flush cannot wait for a
    // transaction, so it records an emergency candidate instead.
    await tab.close();
    const reader = await openWithBridge(context);
    // The next boot detects the candidate and offers it through the
    // write-protected recovery flow.
    await expect(reader.getByRole('alert').filter({ hasText: '未能写入正式存档' })).toBeVisible();
    expect(await readCanonicalRecord(reader)).toBeNull();
    await reader.getByRole('button', { name: '确认恢复并继续' }).click();
    await expect.poll(() => persistedVouchers(reader), { timeout: 10_000 }).toBe(1);
    expect((await canonicalHead(reader))!.revision).toBe(1);
    await context.close();
  });

  test('a pagehide flush during another window pending write preserves state without touching the record', async ({ browser }) => {
    const context = await browser.newContext();
    const armTab = async (quantity: number) => {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
      await openApp(page);
      await suspendCommits(page);
      await page.evaluate((qty) => { window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': qty } }); }, quantity);
      return page;
    };
    const tabA = await armTab(1);
    const tabB = await armTab(3);
    // Both commits are suspended: the record still does not exist.
    expect(await readCanonicalRecord(tabA)).toBeNull();

    // Tab B hides inside tab A's pending write window: its pagehide flush must
    // not write the record; B's state survives as an emergency candidate.
    await tabB.close();
    expect(await readCanonicalRecord(tabA)).toBeNull();
    const emergency = await tabA.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('yuliang-pending-')).map((key) => JSON.parse(localStorage.getItem(key) ?? '{}')));
    expect(emergency).toHaveLength(1);
    expect(emergency[0].save.inventory['item.breakfast-voucher']).toBe(3);

    // Releasing A's suspended commit lands it: A never saw a divergent record,
    // because B never wrote one.
    await tabA.evaluate(() => (window as unknown as { __releaseSaveCommits?: () => void }).__releaseSaveCommits?.());
    await expect.poll(() => persistedVouchers(tabA), { timeout: 10_000 }).toBe(1);
    expect(await isFrozen(tabA)).toBe(false);
    await context.close();
  });

  test('a write whose version was replaced without any notification is still refused', async ({ page }) => {
    await bootWithBridge(page);
    // Simulate the race window the old pre-write guard covered: the record is
    // replaced by another window, and this window never hears about it.
    await writeCanonicalState(page, { cash: 432_432, simulationMode: 'paused' });
    expect(await confirmedHead(page)).toBeNull();

    const rejected = await page.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } }));
    expect(rejected).toBe(true);
    await page.getByRole('alert').filter({ hasText: CONFLICT_TEXT }).first().waitFor({ timeout: 10_000 });
    expect(await isFrozen(page)).toBe(true);
    expect(await page.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } }))).toBe(false);

    // The replaced save is preserved, and the offered way out loads it.
    const preserved = JSON.parse((await readCanonicalRecord(page))!.payload) as { cash: number };
    expect(preserved.cash).toBe(432_432);

    await page.getByRole('button', { name: '加载最新存档' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('alert').filter({ hasText: CONFLICT_TEXT })).toHaveCount(0);
    expect(await page.evaluate(() => window.__yuliang.store.getState().game.cash)).toBe(432_432);
  });
});
