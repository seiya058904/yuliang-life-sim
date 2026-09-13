import { expect, test } from '@playwright/test';

// Single-writer save protection: once another tab persists a newer save, a
// stale tab must freeze (no dispatch, no flush, no pagehide write) and point
// the player at the fresh state instead of silently overwriting it.
test.describe('cross-tab save conflict protection', () => {
  // The reload must hand back a page whose debug bridge store is fully usable;
  // waiting on the callable store removes any module-eval race after reload.
  const bootWithBridge = async (page: import('@playwright/test').Page) => {
    await page.goto('./');
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => localStorage.setItem('yuliang-e2e-hook', '1'));
    await page.reload();
    await page.waitForFunction(() => typeof (window as unknown as { __yuliang?: { store?: { getState?: unknown } } }).__yuliang?.store?.getState === 'function');
  };

  // Wait until the store's deferred (Web Locks critical section) save has
  // landed in storage before reading or reloading.
  const awaitSaveSynced = async (page: import('@playwright/test').Page) => {
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('yuliang-save-v1');
      return raw !== null && raw === JSON.stringify(window.__yuliang.store.getState().game);
    }, undefined, { timeout: 5000 });
  };

  const buyViaShopUi = async (page: import('@playwright/test').Page) => {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '商店', exact: true }).click();
    await page.getByRole('button', { name: '加入购物袋' }).first().click();
    await page.getByRole('button', { name: '一次购买' }).click();
  };

  test('a stale tab cannot overwrite the newer save from another tab', async ({ browser }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();
    await bootWithBridge(tab1);
    // Eligibility fixture: make sure any first catalog item is affordable.
    await tab1.evaluate(() => {
      const store = (window as unknown as { __yuliang?: { store: { setState: (patch: unknown) => void; getState: () => { game: { cash: number } } } } }).__yuliang!.store;
      store.setState({ game: { ...store.getState().game, cash: 5_000 } });
    });
    const tab2 = await context.newPage();
    await bootWithBridge(tab2);

    // tab1 buys through the real shop flow; the save fires a storage event
    // into tab2, which must turn stale on its own.
    await buyViaShopUi(tab1);
    await awaitSaveSynced(tab1);
    const savedByTab1 = await tab1.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1');
    expect(savedByTab1).toBeTruthy();

    await expect(tab2.getByRole('alert').filter({ hasText: '另一个游戏窗口已经更新了存档' })).toBeVisible();

    // tab2 can no longer change game state, and its flush/pagehide must not
    // write either.
    const rejected = await tab2.evaluate(() => {
      const store = (window as unknown as { __yuliang?: { store: { getState: () => { dispatch: (action: unknown) => boolean } } } }).__yuliang!.store;
      return store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 3 } });
    });
    expect(rejected).toBe(false);
    await tab2.evaluate(() => { window.__yuliang.store.getState().flushSave(); });
    await tab2.close();
    const afterClose = await tab1.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1');
    expect(afterClose).toBe(savedByTab1);

    // Reloading the stale tab picks up tab1's newer save and clears the conflict.
    const tab2Reloaded = await context.newPage();
    await tab2Reloaded.goto('./');
    await tab2Reloaded.reload();
    await expect(tab2Reloaded.getByRole('alert').filter({ hasText: '另一个游戏窗口' })).toHaveCount(0);
    const loaded = await tab2Reloaded.evaluate(() => {
      const game = (window as unknown as { __yuliang?: { store: { getState: () => { game: { lifeHistory: Array<{ title: string }> } } } } }).__yuliang!.store.getState().game;
      return game.lifeHistory.some((record) => record.title.startsWith('购买'));
    });
    expect(loaded).toBe(true);
    await context.close();
  });

  test('simultaneous writers: exactly one persists and the loser goes stale', async ({ browser }) => {
    const context = await browser.newContext();
    const tab1 = await context.newPage();
    await bootWithBridge(tab1);
    const tab2 = await context.newPage();
    await bootWithBridge(tab2);

    // Arm a different action per tab, then fire both through a concurrent
    // barrier: both sync pre-checks run while storage is still untouched, so
    // only the Web Locks critical section can order the writes.
    const arm = (page: import('@playwright/test').Page, quantity: number) => page.evaluate((qty) => {
      (window as unknown as { __fire?: () => boolean }).__fire = () => (window as unknown as { __yuliang: { store: { getState: () => { dispatch: (action: unknown) => boolean } } } }).__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': qty } });
    }, quantity);
    await arm(tab1, 1);
    await arm(tab2, 3);
    await Promise.all([
      tab1.evaluate(() => (window as unknown as { __fire: () => boolean }).__fire!()),
      tab2.evaluate(() => (window as unknown as { __fire: () => boolean }).__fire!()),
    ]);

    // Exactly one writer persisted: 1 or 3 vouchers, never 4 and never none.
    await tab1.waitForFunction(() => {
      const raw = localStorage.getItem('yuliang-save-v1');
      if (!raw) return false;
      const count = (JSON.parse(raw).inventory ?? {})['item.breakfast-voucher'] ?? 0;
      return count === 1 || count === 3;
    }, undefined, { timeout: 5000 });
    const count = await tab1.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}').inventory ?? {})['item.breakfast-voucher'] ?? 0, 'yuliang-save-v1');

    // The loser detected the winner and shows the blocking conflict state.
    const loser = count === 1 ? tab2 : tab1;
    await expect(loser.getByRole('alert').filter({ hasText: '另一个游戏窗口已经更新了存档' }).first()).toBeVisible();

    // Closing the loser must not overwrite the winner's progress.
    const winner = count === 1 ? tab1 : tab2;
    const payloadAfter = await winner.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1');
    await loser.close();
    await winner.waitForTimeout(150);
    expect(await winner.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1')).toBe(payloadAfter);
    await context.close();
  });

  test('an action taken just before close survives via the pagehide flush', async ({ browser }) => {
    const context = await browser.newContext();
    const tab = await context.newPage();
    // Hold every save inside a controllable lock before the app boots: the
    // write for the action below is queued, never executed.
    await tab.addInitScript(() => {
      try {
        const queue: Array<() => Promise<void> | void> = [];
        Object.defineProperty(navigator, 'locks', {
          configurable: true,
          value: { request: (name: string, _options: unknown, callback: () => Promise<void> | void) => { queue.push(callback); return Promise.resolve({ name, mode: 'exclusive' }); } },
        });
        (window as unknown as { __releaseLocks?: () => Promise<void> }).__releaseLocks = async () => {
          const list = queue.splice(0);
          for (const callback of list) await callback();
        };
      } catch { /* keep the app booting without locks */ }
      try { localStorage.setItem('yuliang-e2e-hook', '1'); } catch { /* ignore */ }
    });
    await tab.goto('./');
    await tab.reload();

    // A real purchase: memory changes while the write stays held in the lock.
    await tab.evaluate(() => { window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } }); });
    expect(await tab.evaluate(() => (window.__yuliang.store.getState().game.inventory['item.breakfast-voucher'] ?? 0) === 1)).toBe(true);
    expect(await tab.evaluate(() => {
      const raw = localStorage.getItem('yuliang-save-v1');
      return raw !== null && (JSON.parse(raw).inventory ?? {})['item.breakfast-voucher'] === 1;
    })).toBe(false);

    // Real pagehide through tab.close(): the flush cannot hold the writer
    // lock, so it records an emergency candidate instead of touching the
    // canonical save.
    await tab.close();
    const reader = await context.newPage();
    await reader.goto('./');
    // The next boot detects the candidate and offers it through the
    // write-protected recovery flow.
    await expect(reader.getByRole('alert').filter({ hasText: '未能写入正式存档' })).toBeVisible();
    expect(await reader.evaluate(() => (JSON.parse(localStorage.getItem('yuliang-save-v1') ?? '{}').inventory ?? {})['item.breakfast-voucher'] ?? 0)).toBe(0);
    // Confirming the recovery promotes the candidate into the canonical save.
    await reader.getByRole('button', { name: '确认恢复并继续' }).click();
    await reader.waitForFunction(() => (JSON.parse(localStorage.getItem('yuliang-save-v1') ?? '{}').inventory ?? {})['item.breakfast-voucher'] === 1, undefined, { timeout: 5000 });
    await context.close();
  });

  test('a pagehide flush during another tab held write preserves state without touching the canonical save', async ({ browser }) => {
    const context = await browser.newContext();
    const armTab = async (quantity: number) => {
      const page = await context.newPage();
      await page.addInitScript(() => {
        try {
          const queue: Array<() => Promise<void> | void> = [];
          Object.defineProperty(navigator, 'locks', {
            configurable: true,
            value: { request: (name: string, _options: unknown, callback: () => Promise<void> | void) => { queue.push(callback); return Promise.resolve({ name, mode: 'exclusive' }); } },
          });
          (window as unknown as { __releaseLocks?: () => Promise<void> }).__releaseLocks = async () => {
            const list = queue.splice(0);
            for (const callback of list) await callback();
          };
        } catch { /* keep the app booting without locks */ }
        try { localStorage.setItem('yuliang-e2e-hook', '1'); } catch { /* ignore */ }
      });
      await page.goto('./');
      await page.reload();
      await page.evaluate((qty) => { window.__yuliang.store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': qty } }); }, quantity);
      return page;
    };
    const tabA = await armTab(1);
    const tabB = await armTab(3);
    // Both writes are held in their page-local locks: storage still untouched.
    expect(await tabA.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1')).toBeNull();

    // Tab B hides inside tab A's pending write window: its pagehide flush must
    // not write the canonical save; B's state survives as an emergency record.
    await tabB.close();
    expect(await tabA.evaluate((key) => localStorage.getItem(key), 'yuliang-save-v1')).toBeNull();
    const emergency = await tabA.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('yuliang-pending-')).map((key) => JSON.parse(localStorage.getItem(key)!)));
    expect(emergency).toHaveLength(1);
    expect((emergency[0].save.inventory ?? {})['item.breakfast-voucher']).toBe(3);

    // Releasing A's held callback lands A's write under the lock; A never saw
    // a divergent canonical payload because B never wrote one.
    await tabA.evaluate(() => (window as unknown as { __releaseLocks: () => Promise<void> }).__releaseLocks!());
    await tabA.waitForFunction(() => localStorage.getItem('yuliang-save-v1') !== null, undefined, { timeout: 5000 });
    expect(await tabA.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}').inventory ?? {})['item.breakfast-voucher'] ?? 0, 'yuliang-save-v1')).toBe(1);
    expect(await tabA.evaluate(() => (window as unknown as { __yuliang?: { store: { getState: () => { externalSaveConflict: boolean } } } }).__yuliang!.store.getState().externalSaveConflict)).toBe(false);
    await context.close();
  });

  test('the pre-write guard catches a divergent write whose storage event was lost', async ({ page }) => {
    await bootWithBridge(page);
    // Simulate the race window: storage changes without this tab seeing a
    // storage event (same-tab setItem never fires one).
    await page.evaluate((key) => {
      const raw = localStorage.getItem(key) ?? '{}';
      const external = JSON.stringify({ ...JSON.parse(raw), cash: 432_432 });
      localStorage.setItem(key, external);
    }, 'yuliang-save-v1');

    const rejected = await page.evaluate(() => {
      const store = (window as unknown as { __yuliang?: { store: { getState: () => { dispatch: (action: unknown) => boolean } } } }).__yuliang!.store;
      return store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } });
    });
    expect(rejected).toBe(false);
    await expect(page.getByRole('alert').filter({ hasText: '另一个游戏窗口已经更新了存档' }).first()).toBeVisible();
    const preserved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).cash, 'yuliang-save-v1');
    expect(preserved).toBe(432_432);

    // The offered way out: reload into the winning state.
    await page.getByRole('button', { name: '加载最新存档' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('alert').filter({ hasText: '另一个游戏窗口' })).toHaveCount(0);
    const reloaded = await page.evaluate(() => (window as unknown as { __yuliang?: { store: { getState: () => { game: { cash: number } } } } }).__yuliang!.store.getState().game.cash);
    expect(reloaded).toBe(432_432);
  });
});
