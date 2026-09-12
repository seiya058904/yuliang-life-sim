import { expect, test, type Page } from '@playwright/test';

const navigate = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click();
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__yuliang));
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
    const last = page.locator('.shop-main .item-card-foot button').last();
    await last.scrollIntoViewIfNeeded();
    await last.click();
    await expect(page.locator('.rail-cart')).toContainText('购物袋（1）');
    expect(errors).toEqual([]);
  });
}

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
