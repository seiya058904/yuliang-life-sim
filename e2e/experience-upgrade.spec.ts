import { expect, test } from '@playwright/test';
import { awaitCanonicalSynced, bootWithBridge, navigate, readPersistedState } from './harness';

test.beforeEach(async ({ page }) => { await bootWithBridge(page); });

test('keyboard navigation, page memory and shopping do not consume game time', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const time = await page.evaluate(() => window.__yuliang!.store.getState().game.time);
  const nav = page.getByRole('navigation', { name: '主导航', exact: true });
  await nav.getByRole('button', { name: '生活', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav.getByRole('button', { name: '职业', exact: true })).toBeFocused();
  await page.getByLabel('搜索岗位或公司').fill('青禾');
  await navigate(page, '商店');
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡', exact: true }).click();
  await navigate(page, '社交');
  await navigate(page, '职业');
  await expect(page.getByLabel('搜索岗位或公司')).toHaveValue('青禾');
  await navigate(page, '商店');
  await expect(page.getByRole('region', { name: '购物清单' })).toContainText('购物袋（1）');
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.time)).toEqual(time);
  await page.getByRole('button', { name: '一次购买', exact: true }).click();
  await awaitCanonicalSynced(page);
  const saved = await readPersistedState(page);
  expect(saved.cash).toBe(482);
  expect(saved.inventory['item.seed-coffee']).toBe(1);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__yuliang));
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.time)).toEqual(time);
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.inventory['item.seed-coffee'])).toBe(1);
});

test('purchase feedback survives the next running simulation frames', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => { const store = window.__yuliang!.store; store.setState({ game: { ...store.getState().game, eventMeter: -10000 } }); });
  await page.getByRole('button', { name: '开始本周', exact: true }).click();
  await navigate(page, '商店');
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡', exact: true }).click();
  await page.getByRole('button', { name: '一次购买', exact: true }).click();
  const feedback = page.getByRole('status', { name: '即时变化' });
  await expect(feedback).toContainText('现磨咖啡');
  await page.waitForTimeout(650);
  await expect(feedback).toContainText('现磨咖啡');
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.inventory['item.seed-coffee'])).toBe(1);
  await page.locator('.shell-run-control').getByRole('button', { name: '暂停', exact: true }).click();
});

test('all authored contact choices show their actual costs and relationship changes', async ({ page }) => {
  await navigate(page, '社交');
  const detail = page.locator('.contact-detail');
  const bookstore = detail.getByRole('button', { name: /逛书店/ });
  await expect(bookstore).toBeVisible();
  await expect(detail.getByRole('button', { name: /一起吃饭/ })).toBeVisible();
  const before = await page.evaluate(() => window.__yuliang!.store.getState().game);
  await bookstore.click();
  await expect(page.getByRole('status', { name: '即时变化' })).toContainText('与林晨的关系');
  const after = await page.evaluate(() => window.__yuliang!.store.getState().game);
  expect(after.time).toEqual(before.time);
  expect(after.relationships['character.seed-lin']).toBeGreaterThan(before.relationships['character.seed-lin'] ?? 0);
  await awaitCanonicalSynced(page);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__yuliang));
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.relationships['character.seed-lin'])).toBe(after.relationships['character.seed-lin']);
});

test('the living scene and timeline follow the real clock and modified work schedule', async ({ page }) => {
  await page.evaluate(() => {
    const store = window.__yuliang!.store;
    const game = structuredClone(store.getState().game);
    game.modifiers.push({ target: 'work_hours', mode: 'add', value: -120, tags: ['work'] });
    store.setState({ game });
  });
  const work = page.getByRole('region', { name: '今日时间线' }).locator('.kind-work');
  await expect(work).toHaveAttribute('title', /09:00.*15:00/);
  await page.evaluate(() => { const store = window.__yuliang!.store; store.setState({ game: { ...store.getState().game, time: { day: 1, hour: 20, minute: 0 } } }); });
  await expect(page.locator('.living-scene')).toHaveClass(/is-night/);
  await expect(page.locator('.living-scene')).not.toHaveClass(/is-running/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.living-scene-person')).toHaveCSS('animation-name', 'none');
});

test('wealth and profile section selection survives navigation without changing the save', async ({ page }) => {
  const before = await page.evaluate(() => window.__yuliang!.store.getState().game);
  await navigate(page, '财富');
  await page.getByRole('navigation', { name: '财富分区' }).getByRole('button', { name: '历史', exact: true }).click();
  await navigate(page, '我的');
  await page.getByRole('navigation', { name: '我的分区' }).getByRole('button', { name: '经历与历史', exact: true }).click();
  await navigate(page, '财富');
  await expect(page.getByRole('navigation', { name: '财富分区' }).getByRole('button', { name: '历史', exact: true })).toHaveAttribute('aria-current', 'page');
  await navigate(page, '我的');
  await expect(page.getByRole('navigation', { name: '我的分区' }).getByRole('button', { name: '经历与历史', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game)).toEqual(before);
});
