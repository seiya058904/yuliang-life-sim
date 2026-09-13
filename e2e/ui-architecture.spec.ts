import { expect, test, type Page } from '@playwright/test';
import {
  clickAtVerifiedPoint,
  navigate,
  openApp,
  PERSISTENT_STATUS,
  readMainMetrics,
  targetVisibility,
  wheelMainToBottom,
  wheelToAndClick,
} from './harness';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  await openApp(page);
});

for (const [width, height] of [[1448,1086], [1366,768], [1920,1080], [932,430]]) {
  test(`seven pages retain readable controls and fit ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const name of ['生活','职业','商店','财富','社交','城市','我的']) {
      await navigate(page, name);
      await expect(page.locator('.main-content')).toBeVisible();
      await page.waitForTimeout(650); // Inspect settled transitions, matching screenshot acceptance.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const shell = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar')!.getBoundingClientRect();
        const nav = document.querySelector('.main-nav')!.getBoundingClientRect();
        const footer = document.querySelector('.persistent-status')!.getBoundingClientRect();
        const brand = document.querySelector('.brand-mark')!.getBoundingClientRect();
        return { footerBottom: footer.bottom, footerTop: footer.top, navBottom: nav.bottom, brandBottom: brand.bottom, topbarBottom: topbar.bottom };
      });
      expect(shell.footerBottom).toBeLessThanOrEqual(height);
      expect(shell.footerTop).toBeGreaterThan(shell.navBottom);
      expect(shell.brandBottom).toBeLessThanOrEqual(shell.topbarBottom);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    }
    await navigate(page, '商店');
    await expect(page.locator('.shop-main .item-card')).toHaveCount(6);
    const facts = await page.locator('.shop-main .catalog-facts :is(dt,dd)').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
    expect(Math.min(...facts)).toBeGreaterThanOrEqual(12);
    for (const selector of ['.shop-main .item-card-foot button', '.catalog-secondary-action']) {
      expect(await page.locator(selector).evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 36))).toBe(true);
    }
    // Real wheel reachability: locator auto-scroll and scrollIntoView must not
    // be the delivery mechanism for the last catalog action.
    const shop = await readMainMetrics(page);
    expect(shop.overflowY, '商店页主区应为页面级滚动容器').toBe('auto');
    expect(shop.scrollHeight, `商店页在 ${width}x${height} 应有溢出内容`).toBeGreaterThan(shop.clientHeight);
    await wheelToAndClick(page, page.locator('.shop-main .item-card-foot button').last());
    await expect(page.locator('.rail-cart')).toContainText('购物袋（1）');
    expect(errors).toEqual([]);
  });
}

// Both sides of the height and width breakpoints share one rule: overflowing
// pages must be wheel-reachable to the bottom, and the status bar must stay
// inside the viewport (no 720px floor pushing it off-screen).
const wheelViewports = [[1920, 1080], [1366, 801], [1366, 800], [1181, 900], [1180, 900], [1280, 600]] as const;
for (const [width, height] of wheelViewports) {
  test(`mouse wheel reaches page bottoms at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const name of ['财富', '城市']) {
      await navigate(page, name);
      await page.waitForTimeout(650);
      const before = await readMainMetrics(page);
      expect(before.overflowY, `${name} 主区应为页面级滚动容器`).toBe('auto');
      expect(before.scrollHeight, `${name} 在 ${width}x${height} 应有溢出内容`).toBeGreaterThan(before.clientHeight);
      const bottom = await wheelMainToBottom(page);
      expect(bottom.scrollTop, '真实滚轮必须产生实际位移并到达底部').toBeGreaterThan(0);
      expect(bottom.scrollTop).toBeGreaterThanOrEqual(bottom.scrollHeight - bottom.clientHeight - 2);
      const footerBottom = await page.evaluate((selector) => document.querySelector(selector)!.getBoundingClientRect().bottom, PERSISTENT_STATUS);
      expect(footerBottom, '状态栏必须始终留在视口内').toBeLessThanOrEqual(height);
    }
  });
}

test('large desktop real-input regression covers every main page', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const name of ['生活', '职业', '商店', '财富', '社交', '城市', '我的']) {
    await navigate(page, name);
    await page.waitForTimeout(650);
    const metrics = await readMainMetrics(page);
    expect(metrics.overflowY, `${name} 主区应为页面级滚动容器`).toBe('auto');
    if (metrics.scrollHeight > metrics.clientHeight + 1) {
      // Overflowing page: real wheel input must reach the last content.
      const bottom = await wheelMainToBottom(page);
      expect(bottom.scrollTop, `${name} 溢出内容必须能被真实滚轮滚到末尾`).toBeGreaterThan(0);
    } else {
      // Fitting page: content is complete — nothing clipped, no forced track.
      expect(metrics.scrollWidth, `${name} 无溢出时不得有被裁切的横向内容`).toBeLessThanOrEqual(metrics.clientWidth + 2);
      const footerBottom = await page.evaluate((selector) => document.querySelector(selector)!.getBoundingClientRect().bottom, PERSISTENT_STATUS);
      expect(footerBottom).toBeLessThanOrEqual(1080);
    }
  }
});

test('life drawer long content stays wheel-reachable on tall desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await navigate(page, '生活');
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: '查看生活详情', exact: true }).click();
  await page.waitForTimeout(650);
  const expanded = await readMainMetrics(page);
  expect(expanded.scrollHeight, '展开生活详情后主区应出现长内容').toBeGreaterThan(expanded.clientHeight);
  const bottom = await wheelMainToBottom(page);
  expect(bottom.scrollTop, '真实滚轮必须能滚到展开内容末尾').toBeGreaterThan(0);
  expect(bottom.scrollTop).toBeGreaterThanOrEqual(bottom.scrollHeight - bottom.clientHeight - 2);
  const lastRow = page.locator('.life-secondary-details').last();
  expect((await targetVisibility(page, lastRow)).rect.bottom).toBeLessThanOrEqual(1080);
});

test('settings traps Tab, cancels and restores focus, reset remains a separate confirmation', async ({ page }) => {
  const trigger = page.getByRole('button', { name: '设置', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(12, 12);
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('dialog').getByRole('button', { name: '重新开始', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '重新开始确认' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.cash)).toBe(500);
});

test('forecast destination, click-to-cycle plan and shared runtime controls preserve state', async ({ page }) => {
  const original = await page.evaluate(() => window.__yuliang!.store.getState().game.weeklyPlan.days[1].evening);
  await page.getByRole('button', { name: '查看本周计划', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /周一晚间计划/ }).click();
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.weeklyPlan.days[1].evening)).not.toEqual(original);
  await expect(page.getByRole('meter', { name: '知识当前值' })).toHaveAttribute('aria-valuenow', '10');
  await page.evaluate(() => { const store = window.__yuliang!.store; store.setState({ game: { ...store.getState().game, eventMeter: -10000 } }); });
  await page.getByRole('button', { name: '开始本周', exact: true }).click();
  await navigate(page, '商店');
  await page.locator('.shell-run-control').getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await page.evaluate(() => window.__yuliang!.store.getState().game.time);
  await navigate(page, '城市');
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.time)).toEqual(paused);
  await page.locator('.shell-run-control').getByRole('button', { name: '继续运行' }).click();
  await expect.poll(() => page.evaluate(() => window.__yuliang!.store.getState().game.simulationMode)).toBe('running');
  await page.locator('.shell-run-control').getByRole('button', { name: '暂停', exact: true }).click();
});

test('cart remove and purchase update real cash, inventory and reload persistence', async ({ page }) => {
  await navigate(page, '商店');
  const add = page.getByRole('button', { name: '加入购物袋：现磨咖啡', exact: true });
  await add.click();
  await page.getByRole('button', { name: '移除购物袋商品：现磨咖啡', exact: true }).click();
  await expect(page.locator('.rail-cart')).toContainText('购物袋（0）');
  await add.click();
  await page.getByRole('button', { name: '一次购买', exact: true }).click();
  await expect(page.getByTestId('cash-value')).toContainText('¥482');
  await expect(page.getByRole('region', { name: '我的库存' })).toContainText('现磨咖啡');
  await page.reload();
  await expect(page.getByTestId('cash-value')).toContainText('¥482');
});

test('wealth partition keeps buy and sell reachable and profile preserves the history', async ({ page }) => {
  await navigate(page, '财富');
  const sections = page.getByRole('navigation', { name: '财富分区' });
  await sections.getByRole('button', { name: '市场', exact: true }).click();
  const heading = page.getByRole('heading', { name: '灵活储蓄', exact: true });
  await heading.locator('..').getByRole('button', { name: '买入 1 份' }).click();
  await sections.getByRole('button', { name: '持有', exact: true }).click();
  await heading.locator('..').getByRole('button', { name: '卖出 1 份' }).click();
  await expect(page.getByText('目前没有持有物。先在「概览」了解现金状况，再浏览市场。')).toBeVisible();
  await navigate(page, '我的');
  await page.getByRole('navigation', { name: '我的分区' }).getByRole('button', { name: '经历与历史' }).click();
  await expect(page.getByRole('region', { name: '人生记录' })).toContainText('卖出灵活储蓄');
});

test('contact selection controls the actual interaction and district navigation locates the correct activity page', async ({ page }) => {
  await navigate(page, '社交');
  await page.getByRole('navigation', { name: '联系人' }).getByRole('button', { name: /徐可/ }).click();
  const detail = page.getByRole('complementary', { name: '选中人物详情' });
  await expect(detail.getByRole('heading', { name: '徐可' })).toBeVisible();
  await detail.getByRole('button', { name: /聊聊远程工作/ }).click();
  await expect(page.getByRole('region', { name: '消息' })).toContainText('未读 1 条');
  await navigate(page, '城市');
  await page.getByRole('navigation', { name: '城市地区' }).getByRole('button', { name: '旧城文化区', exact: true }).click();
  await page.getByRole('heading', { name: '旧城黑胶小馆' }).locator('..').getByRole('button', { name: '去安排活动' }).click();
  await expect(page.getByRole('region', { name: '已选活动详情' })).toContainText('演唱会');
});

test('fresh Offer and monthly gates contain keyboard focus and require explicit decisions', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // Explicit test fixture on an isolated browser context; no ordinary save is touched.
  await page.evaluate(() => {
    const store = window.__yuliang!.store;
    const game = structuredClone(store.getState().game);
    const vacancy = game.vacancies!.find(entry => entry.jobId !== game.currentJobId)!;
    game.applications = [{ applicationId: 'ui-offer', vacancyId: vacancy.vacancyId, jobId: vacancy.jobId, companyId: vacancy.companyId, salaryRange: vacancy.salaryRange, route: 'market', submittedDay: 1, resultDay: 1, offerExpiresDay: 7, status: 'offer', competitivenessTier: 'competitive', probabilityBand: 80, willReceiveOffer: true, feedback: [] }];
    game.pendingOfferApplicationId = 'ui-offer';
    game.simulationMode = 'paused';
    store.setState({ game });
  });
  await expect(page.getByRole('dialog')).toContainText('Offer');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '前往职业页处理' }).click();
  const menu = page.getByRole('button', { name: /^职业页面/ });
  if (await menu.isVisible()) {
    await menu.click();
    await page.getByRole('navigation', { name: '职业页面导航' }).getByRole('button', { name: '我的申请' }).click();
  } else {
    await page.getByRole('button', { name: '我的申请', exact: true }).click();
  }
  await page.getByRole('button', { name: '接受 Offer' }).click();
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.applications![0].status)).toBe('accepted');
  await page.evaluate(() => {
    const store = window.__yuliang!.store;
    const game = structuredClone(store.getState().game);
    game.simulationMode = 'monthly_summary';
    game.pendingMonthlySummary = { month: 1, resumeMode: 'planning', summary: { month: 1, ledger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: { kind: 'known', value: game.cash }, netWorthEnd: { kind: 'known', value: game.cash } } }, highlights: [] };
    store.setState({ game });
  });
  const month = page.getByRole('dialog', { name: '第 1 月结算' });
  await expect(month).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(month).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await month.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await month.getByRole('button', { name: '进入下个月' }).click();
  await expect(month).toHaveCount(0);
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.pendingMonthlySummary)).toBeUndefined();
});
