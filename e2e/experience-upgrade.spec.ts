import { expect, test } from '@playwright/test';
import { balanceConfig } from '../src/game/balance/config';
import { contentRegistry } from '../src/game/content/registry';
import { createInitialState } from '../src/game/engine/initialState';
import { awaitCanonicalSynced, bootWithBridge, navigate, readPersistedState, writeCanonicalState } from './harness';
import { expectReadableContrast } from './visual-contract';

test.beforeEach(async ({ page }) => { await bootWithBridge(page); });

test('keeps landscape navigation and all five real attributes inside the shared shell', async ({ page }) => {
  await page.setViewportSize({ width: 863, height: 360 });
  await navigate(page, '职业');
  const nav = await page.getByLabel('主导航').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(nav.scrollWidth).toBeLessThanOrEqual(nav.width);
  const run = page.locator('.shell-run-control button');
  const navRight = (await page.getByLabel('主导航').boundingBox())!.width;
  const action = (await run.boundingBox())!;
  expect(action.x + action.width).toBeLessThanOrEqual(navRight);
  await expect(page.locator('.persistent-status .pixel-avatar')).toBeVisible();
  await expect(page.locator('.persistent-status > .status-detail')).toBeVisible();
  const cells = await page.locator('.persistent-stat').evaluateAll(elements => elements.map(element => {
    const cell = element.getBoundingClientRect();
    return { width: cell.width, fits: [...element.children].every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= cell.left && rect.right <= cell.right + 0.5 && rect.top >= cell.top && rect.bottom <= cell.bottom + 0.5;
    }) };
  }));
  expect(cells).toHaveLength(5);
  for (const cell of cells) {
    expect(cell.width).toBeGreaterThan(100);
    expect(cell.fits, '属性名称、仪表和数值必须在各自单元内').toBe(true);
  }
});

test('keeps low-height monthly copy readable and its header clear of the financial panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const fixture = createInitialState(contentRegistry, balanceConfig, 20260825);
  fixture.majorEventsThisMonth = 3;
  await writeCanonicalState(page, fixture);
  await page.reload();
  await page.getByRole('button', { name: '查看生活详情', exact: true }).click();
  await page.getByRole('button', { name: '运行 1 个月', exact: true }).click();
  const summary = page.locator('.monthly-summary');
  await expect(summary).toBeVisible();
  const geometry = await summary.evaluate(element => {
    const head = element.querySelector('.settle-head')!.getBoundingClientRect();
    const grid = element.querySelector('.settle-grid')!.getBoundingClientRect();
    const texts = element.querySelectorAll('.settle-meta, .settle-title-wrap h2, .settle-title-wrap p');
    const hero = element.querySelector('.settle-result-inverse')!.getBoundingClientRect();
    const art = element.querySelector('.settle-result-art')!.getBoundingClientRect();
    const range = element.querySelector('.settle-range')!.getBoundingClientRect();
    const amount = element.querySelector('.settle-big')!.getBoundingClientRect();
    return { headBottom: head.bottom, gridTop: grid.top, textBottoms: [...texts].map(text => text.getBoundingClientRect().bottom), artBottom: art.bottom, heroBottom: hero.bottom, artLeft: art.left, rangeRight: range.right, artTop: art.top, amountBottom: amount.bottom };
  });
  expect(Math.max(...geometry.textBottoms)).toBeLessThanOrEqual(geometry.headBottom);
  expect(geometry.gridTop).toBeGreaterThan(geometry.headBottom);
  expect(geometry.artBottom, '像素人物不得被结果面板裁掉').toBeLessThanOrEqual(geometry.heroBottom);
  expect(geometry.artLeft).toBeGreaterThan(geometry.rangeRight);
  expect(geometry.artTop).toBeGreaterThan(geometry.amountBottom);
  const copy = summary.locator('.settle-meta :is(span,b,small), .settle-title-wrap p, .settle-rows li, .settle-half :is(h4,small), .highlight-description, .highlight-card small');
  const sizes = await copy.evaluateAll(elements => elements.map(element => ({ text: element.textContent, size: parseFloat(getComputedStyle(element).fontSize) })));
  expect(sizes.length).toBeGreaterThan(10);
  for (const reading of sizes) expect(reading.size, `${reading.text} 必须可读`).toBeGreaterThanOrEqual(12);
  await expectReadableContrast(copy);
  const continueButton = summary.getByRole('button', { name: /进入下个月/ });
  await continueButton.click();
  await expect(summary).toHaveCount(0);
});

test('keeps low-height Career filter labels below utility actions and controls hittable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  const readings = await page.locator('.career-market-filters label').evaluateAll(labels => labels.map(label => {
    const caption = label.querySelector('span')!.getBoundingClientRect();
    const control = label.querySelector('select')!;
    const select = control.getBoundingClientRect();
    const toolbar = label.closest('.career-toolbar')!;
    const actions = toolbar.querySelector('.career-toolbar-actions')!.getBoundingClientRect();
    const count = toolbar.querySelector('.career-toolbar-count')!.getBoundingClientRect();
    const hit = document.elementFromPoint(select.left + select.width / 2, select.top + select.height / 2);
    return { captionTop: caption.top, captionBottom: caption.bottom, selectTop: select.top, utilitiesBottom: Math.max(actions.bottom, count.bottom), hit: hit === control };
  }));
  expect(readings).toHaveLength(3);
  for (const reading of readings) {
    expect(reading.captionTop, '筛选标签不得进入排序/筛选按钮的区域').toBeGreaterThanOrEqual(reading.utilitiesBottom + 3.5);
    expect(reading.captionBottom).toBeLessThanOrEqual(reading.selectTop);
    expect(reading.hit, '下拉框的中心必须可以实际命中').toBe(true);
  }
  const duration = page.getByLabel('时长', { exact: true });
  await duration.focus();
  await expect(duration).toBeFocused();
});

test('keeps Profile identity copy readable on its inverse panel', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await navigate(page, '我的');
  const identity = page.locator('.profile-identity');
  await expect(identity.locator('.eyebrow')).toHaveText('你的生活，正在积累');
  await expectReadableContrast(identity.locator('h2, p, .eyebrow'));
});

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
