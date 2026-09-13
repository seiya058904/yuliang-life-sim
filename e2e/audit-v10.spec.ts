import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.__yuliang));
});

for (const viewport of [{ width: 1440, height: 1080 }, { width: 1280, height: 720 }]) {
  test(`recovery, reward gate and budget at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.evaluate(() => localStorage.setItem('yuliang-save-v1', '{ broken payload'));
    await page.reload();
    await expect(page.getByRole('button', { name: '导出原始存档' })).toBeVisible();
    await page.getByRole('button', { name: '暂时隐藏' }).click();
    await page.getByRole('button', { name: /周一晚间计划/ }).click();
    expect(await page.evaluate(() => localStorage.getItem('yuliang-save-v1'))).toBe('{ broken payload');
    await page.reload();
    await page.getByRole('button', { name: '继续使用当前临时存档' }).click();
    await expect(page.getByRole('button', { name: '导出原始存档' })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yuliang-save-v1')!).version)).toBe(10);
    await page.evaluate(() => {
      const state = window.__yuliang!.store.getState().game;
      state.pendingEventId = 'event.deleted';
      state.pendingReward = { eventId: 'event.old', lines: ['奖励已经应用，请确认'] };
      localStorage.setItem('yuliang-save-v1', JSON.stringify(state));
    });
    await page.reload();
    await page.getByRole('button', { name: '确认恢复并继续' }).click();
    expect(await page.evaluate(() => window.__yuliang!.store.getState().game.simulationMode)).toBe('reward');
    await expect(page.getByRole('dialog')).toContainText('奖励已经应用，请确认');
    await page.evaluate(() => {
      const store = window.__yuliang!.store;
      store.getState().dispatch({ type: 'claim_reward' });
      const game = structuredClone(store.getState().game);
      game.housing.mode = 'owned';
      game.financialLedger!.cashStart = { kind: 'unknown', reason: '历史缺失' };
      store.setState({ game });
    });
    await page.getByRole('button', { name: '查看生活详情' }).click();
    await expect(page.getByText('按当前状态折算 28 天')).toBeVisible();
    await expect(page.locator('.monthly-forecast').getByText('房租', { exact: true }).locator('..')).toContainText('¥0');
    await expect(page.locator('.finance-panel').first()).toContainText('记录不完整');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    await expect(page.locator('body')).not.toContainText('NaN');
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.locator('.monthly-forecast').evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(page.locator('.monthly-forecast')).toBeInViewport({ ratio: 0.9 });
    await page.screenshot({ path: join(tmpdir(), `yuliang-v10-budget-${viewport.width}.png`), fullPage: true });
  });
}

test('planning and repeated resignation are enforced through real controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => { const store = window.__yuliang!.store; store.setState({ game: { ...store.getState().game, eventMeter: -10000 } }); });
  await page.getByRole('button', { name: /周一晚间计划/ }).click();
  await page.getByRole('button', { name: '开始本周', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '职业', exact: true }).click();
  const leave = page.getByRole('button', { name: '离开当前工作', exact: true });
  if (!(await leave.isVisible())) {
    await page.getByRole('button', { name: /^职业页面/ }).click();
    await page.getByRole('navigation', { name: '职业页面导航' }).getByRole('button', { name: '当前工作', exact: true }).click();
  }
  const values: number[] = [];
  for (let i = 0; i < 2; i++) {
    await leave.click();
    await page.getByRole('button', { name: '继续沟通', exact: true }).click();
    await page.getByRole('button', { name: '留下来谈谈', exact: true }).click();
    values.push(await page.evaluate(() => window.__yuliang!.store.getState().game.reputation));
  }
  expect(values[1]).toBe(values[0]);
});
