/** Native IndexedDB request-error ordering; the quota error name is injected. */
import { expect, test, type Page } from '@playwright/test';
import { awaitCanonicalSynced, bootWithBridge, readCanonicalRecord } from './harness';

async function failOneRequest(page: Page, quotaName: boolean) {
  await bootWithBridge(page);
  await page.evaluate(() => window.__yuliang.store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 }));
  await awaitCanonicalSynced(page);
  const before = await readCanonicalRecord(page);
  const observed = await page.evaluate(async ({ quotaName }) => {
    const store = window.__yuliang.store;
    const game = structuredClone(store.getState().game);
    game.lifeHistory = Array.from({ length: 210 }, (_, index) => ({ id: `life.request-error.1.${index}`, day: 1, category: 'activity' as const, title: '存储失败测试' }));
    store.setState({ game });

    const proto = IDBObjectStore.prototype;
    const originalPut = proto.put;
    const originalAdd = proto.add;
    let puts = 0;
    let failedTransaction: IDBTransaction | undefined;
    let requestError = '';
    let transactionErrorDuringRequest: string | null | undefined;
    // add() against the existing main key produces a real asynchronous native
    // ConstraintError and rollback. Only the request's quota classification is
    // injected; this test does not claim to exhaust the browser's disk quota.
    proto.put = function (value: unknown, key?: IDBValidKey) {
      puts += 1;
      const method = puts === 1 ? originalAdd : originalPut;
      const request = arguments.length > 1 ? method.call(this, value, key as IDBValidKey) : method.call(this, value);
      if (puts === 1) {
        failedTransaction = this.transaction;
        if (quotaName) Object.defineProperty(request, 'error', { configurable: true, get: () => new DOMException('isolated quota test', 'QuotaExceededError') });
        request.addEventListener('error', () => {
          requestError = request.error?.message ?? '';
          transactionErrorDuringRequest = this.transaction.error?.name ?? null;
        });
      }
      return request;
    } as typeof proto.put;

    let unsubscribe = () => {};
    try {
      const settled = new Promise<{ saveError: string; reportedBeforeRollback: boolean }>(resolve => {
        unsubscribe = store.subscribe(next => {
          if (next.saveError) resolve({ saveError: next.saveError, reportedBeforeRollback: failedTransaction?.error == null });
        });
      });
      store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
      const outcome = await settled;
      return { ...outcome, puts, requestError, transactionErrorDuringRequest };
    } finally {
      unsubscribe();
      proto.put = originalPut;
    }
  }, { quotaName });
  return { before, after: await readCanonicalRecord(page), observed };
}

test('native request failure is reported after rollback with its cause and unchanged canonical record', async ({ page }) => {
  const { before, after, observed } = await failOneRequest(page, false);
  expect(observed.transactionErrorDuringRequest).toBeNull();
  expect(observed.requestError).not.toBe('');
  expect(observed.saveError).toContain(observed.requestError);
  expect(observed.reportedBeforeRollback).toBe(false);
  expect(observed.puts).toBe(1);
  expect(after).toEqual(before);
  await expect(page.getByRole('alert')).toContainText(observed.requestError);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toContainText(observed.requestError);
  await expect(settings.locator('.detail-facts')).toContainText('有存档提示');
  await expect(settings.locator('.detail-facts')).not.toContainText('保存失败');
});

test('an injected quota-classified native request failure retries only after rollback and commits trimmed history', async ({ page }) => {
  const { before, after, observed } = await failOneRequest(page, true);
  expect(observed.transactionErrorDuringRequest).toBeNull();
  expect(observed.requestError).toBe('isolated quota test');
  expect(observed.saveError).toContain('已压缩历史后保存');
  expect(observed.reportedBeforeRollback).toBe(false);
  expect(observed.puts).toBe(2);
  expect(after?.generation).toBe(before?.generation);
  expect(after?.revision).toBe(before!.revision + 1);
  const saved = JSON.parse(after!.payload);
  expect(saved.lifeHistory).toHaveLength(200);
  expect(saved.simulationSpeed).toBe(4);
  await expect(page.getByRole('alert')).toContainText('已压缩历史后保存');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const settings = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(settings).toContainText('已压缩历史后保存');
  await expect(settings.locator('.detail-facts')).toContainText('有存档提示');
  await expect(settings.locator('.detail-facts')).not.toContainText('保存失败');
});
