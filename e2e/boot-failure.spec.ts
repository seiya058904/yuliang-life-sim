import { expect, test } from '@playwright/test';
import { gotoAppRoot } from './harness';

// Independent init scope on purpose: with storage denied, the optional debug
// bridge is exactly what must degrade silently, so this spec must not set the
// 'yuliang-e2e-hook' flag or wait for window.__yuliang — a healthy degraded
// boot never exposes it.
test('boots the game and navigates when the browser denies localStorage reads', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Simulate a browser profile that blocks storage reads before any app script runs.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
  });
  await gotoAppRoot(page);

  // The shell and real game content render instead of a blank #root.
  await expect(page.getByRole('navigation', { name: '主导航', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '余量' })).toBeVisible();
  await expect(page.getByRole('region', { name: '角色状态' })).toBeVisible();

  // The failed save read keeps its own recovery notice; the debug bridge's
  // silent degradation must not swallow it.
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('自动保存已暂停');
  await expect(alert.getByRole('button', { name: '导出原始存档' })).toBeVisible();

  // At least one navigation works on the degraded boot.
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '城市地区' })).toBeVisible();

  expect(pageErrors, `出现未捕获的启动异常：${pageErrors.join(' | ')}`).toEqual([]);
});
