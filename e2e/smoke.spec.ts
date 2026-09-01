import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

async function openLifeDetails(page: import('@playwright/test').Page) {
  await page.getByLabel('主导航').getByRole('button', { name: '生活', exact: true }).click();
  const details = page.getByRole('button', { name: '查看生活详情' });
  if (await details.isVisible()) await details.click();
}

async function openLifeLongRun(page: import('@playwright/test').Page) {
  await openLifeDetails(page);
}

async function runLongPeriod(page: import('@playwright/test').Page, months: 1 | 3) {
  await openLifeLongRun(page);
  await page.getByRole('button', { name: `运行 ${months} 个月` }).click();
}

async function openCareerTools(page: import('@playwright/test').Page) {
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  const pageMenu = page.getByRole('button', { name: /^职业页面/ });
  if (!(await pageMenu.count())) await page.getByRole('button', { name: '招聘市场', exact: true }).click();
  await page.getByRole('button', { name: '安排本周与课程' }).click();
  await expect(page.getByRole('dialog', { name: '职业工具' })).toBeVisible();
}

async function closeCareerTools(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '关闭职业工具' }).click();
  await expect(page.getByRole('dialog', { name: '职业工具' })).toHaveCount(0);
}

async function openCareerPage(page: import('@playwright/test').Page, label: string) {
  const pageMenu = page.getByRole('button', { name: /^职业页面/ });
  if (await pageMenu.count()) {
    await pageMenu.click();
    await page.getByRole('navigation', { name: '职业页面导航' }).getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: label, exact: true }).click();
}

test('discovers a named city venue and reaches its activity entry', async ({ page }) => {
  await page.getByRole('button', { name: '城市', exact: true }).click();
  const venue = page.getByRole('heading', { name: '云庭咖啡' }).locator('..');
  await expect(venue).toContainText('去咖啡馆坐一会');
  await venue.getByRole('button', { name: '去安排活动' }).click();
  await expect(page.getByRole('heading', { name: '娱乐与生活活动' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '去咖啡馆坐一会 · 只是休息' })).toBeVisible();
});

test('discovers the bookstore venue and reaches its knowledge activity', async ({ page }) => {
  await page.getByRole('button', { name: '城市', exact: true }).click();
  const venue = page.getByRole('heading', { name: '叶脉书店' }).locator('..');
  await expect(venue).toContainText('周末逛书店');
  await venue.getByRole('button', { name: '去安排活动' }).click();
  await expect(page.getByRole('heading', { name: '周末逛书店 · 随便逛逛' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '周末逛书店 · 和周妍一起逛' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '周末逛书店 · 和林晨一起逛' })).toBeVisible();
});

test('discovers the riverside night market venue and reaches its activity entry', async ({ page }) => {
  await page.getByRole('button', { name: '城市', exact: true }).click();
  const venue = page.getByRole('heading', { name: '临江夜市' }).locator('..');
  await expect(venue).toContainText('河畔夜市');
  await venue.getByRole('button', { name: '去安排活动' }).click();
  await expect(page.getByRole('heading', { name: '河畔夜市 · 逛一圈' })).toBeVisible();
});

test('uses the public market, plans a week, pauses for shopping, and restores the save', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '余量', exact: true })).toBeVisible();
  await expect(page.getByText('第 1 周', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '职业', exact: true }).click();
  await expect(page.getByRole('heading', { name: '招聘市场' })).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('远望');
  await expect(page.getByText('远望零售').first()).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('环流');
  await expect(page.getByText('环流物流').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '环流物流协调员' })).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('');
  await page.getByRole('button', { name: '申请职位' }).first().click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByText(/当前竞争力：/)).toBeVisible();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText(/人物推荐、内部转岗、猎头和剧情机会/)).toBeVisible();

  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.getByRole('button', { name: '开始本周' }).click();
  await expect(page.getByText('运行中')).toBeVisible();
  await page.getByRole('button', { name: '×4' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await page.getByRole('dialog').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: '收下并暂停' })).toBeVisible();
  await expect(page.getByRole('button', { name: '收下并继续运行' })).toBeVisible();
  await page.getByRole('button', { name: '收下并继续运行' }).click();
  await expect(page.getByText('运行中')).toBeVisible();
  await page.getByRole('button', { name: '暂停' }).click();

  const pausedClock = await page.getByTestId('clock-value').innerText();
  await page.getByRole('button', { name: '商店' }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  await expect(page.getByRole('heading', { name: '周末短途旅行 · 临江夜游' })).toBeVisible();
  await page.getByRole('tab', { name: '商品', exact: true }).click();
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡' }).click();
  await page.getByRole('button', { name: '加入购物袋：实用手机' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);

  const persistedCash = await page.getByTestId('cash-value').innerText();
  await page.reload();
  await expect(page.getByTestId('cash-value')).toHaveText(persistedCash);
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);
});

test('selects a shop product from its card surface without swallowing purchase controls', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const phone = page.locator('article.item-card').filter({ hasText: '实用手机' }).first();
  await phone.getByRole('button', { name: '查看详情：实用手机', exact: true }).click();
  await expect(phone).toHaveClass(/selected/);
  await expect(page.getByRole('region', { name: '已选商品详情' }).getByRole('heading', { name: '实用手机', exact: true })).toBeVisible();

  await phone.getByRole('button', { name: '加入购物袋：实用手机', exact: true }).click();
  await expect(page.getByRole('button', { name: '一次购买' })).toBeVisible();
});

test('keeps real Shop purchase feedback above the persistent HUD', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'desktop feedback rail geometry is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡', exact: true }).click();
  await page.getByRole('button', { name: '一次购买', exact: true }).click();

  const rail = page.locator('.effect-rail');
  await expect(rail).toBeVisible();
  const geometry = await rail.evaluate((element) => {
    const railRect = element.getBoundingClientRect();
    const item = element.querySelector<HTMLElement>('.effect-item');
    const itemStyle = item ? getComputedStyle(item) : null;
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    return {
      railBottom: railRect.bottom,
      footerTop: footer?.top ?? 0,
      background: itemStyle?.backgroundColor ?? '',
      color: itemStyle?.color ?? '',
      border: itemStyle?.borderTopStyle ?? '',
    };
  });

  expect(geometry.railBottom).toBeLessThanOrEqual(geometry.footerTop - 8);
  expect(geometry.background).toBe('rgb(7, 7, 7)');
  expect(geometry.color).toBe('rgb(245, 245, 241)');
  expect(geometry.border).toBe('solid');
});

test('keeps the selected Shop product detail in four reference information lanes', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'selected product detail lanes target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const detail = page.locator('.view-shop .shop-detail');
  const labels = await detail.locator('.shop-detail-fact dt').allTextContents();
  expect(labels).toEqual(['属性变化', '关系变化', '支出分类', '时间消耗']);
  await expect(detail.getByText('无直接关系变化', { exact: true })).toBeVisible();
  await expect(detail.getByText('购物', { exact: true })).toBeVisible();

  const geometry = await detail.evaluate((element) => {
    const frame = element.getBoundingClientRect();
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    const lanes = [...element.querySelectorAll<HTMLElement>('.shop-detail-fact')].map((lane) => lane.getBoundingClientRect());
    return {
      height: frame.height,
      bottomGap: (footer?.top ?? 0) - frame.bottom,
      laneCount: lanes.length,
      laneWidth: Math.min(...lanes.map((lane) => lane.width)),
      laneHeights: lanes.map((lane) => lane.height),
    };
  });

  expect(geometry.height).toBeGreaterThanOrEqual(104);
  expect(geometry.bottomGap).toBeGreaterThanOrEqual(10);
  expect(geometry.laneCount).toBe(4);
  expect(geometry.laneWidth).toBeGreaterThanOrEqual(90);
  expect(geometry.laneHeights.every((height) => height >= 34)).toBe(true);
});

test('keeps the selected Shop product effect meters visible in the detail lane', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'selected product effect meters target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const meters = await page.locator('.view-shop .shop-detail-fact[data-fact="属性变化"] .catalog-meter-row').evaluateAll((rows) => rows.map((row) => {
    const rect = row.getBoundingClientRect();
    const meter = row.querySelector('.segment-meter')?.getBoundingClientRect();
    return {
      display: getComputedStyle(row).display,
      rowWidth: rect.width,
      rowHeight: rect.height,
      meterWidth: meter?.width ?? 0,
      meterHeight: meter?.height ?? 0,
    };
  }));

  expect(meters.length).toBeGreaterThan(0);
  expect(meters.every(({ display, rowWidth, rowHeight, meterWidth, meterHeight }) =>
    display === 'grid' && rowWidth > 0 && rowHeight >= 10 && meterWidth > 0 && meterHeight >= 5
  )).toBe(true);
});

test('keeps Shop product facts above the purchase rail', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop product-card rhythm targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const cards = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 12).map((card) => {
    const facts = card.querySelector('.catalog-facts');
    const foot = card.querySelector('.item-card-foot');
    const factStyle = facts ? getComputedStyle(facts.querySelector('dd') ?? facts) : null;
    const factRow = facts?.querySelector('div');
    return {
      factsBottom: facts?.getBoundingClientRect().bottom ?? 0,
      footTop: foot?.getBoundingClientRect().top ?? 0,
      factFontSize: factStyle ? Number.parseFloat(factStyle.fontSize) : 0,
      factRowHeight: factRow?.getBoundingClientRect().height ?? 0,
    };
  }));

  expect(cards.length).toBe(12);
  expect(cards.every(({ factsBottom, footTop, factFontSize, factRowHeight }) => factsBottom <= footTop && factFontSize >= 10 && factRowHeight >= 13)).toBe(true);
});

test('keeps Shop catalog cards on the shared stepped pixel corners', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop card frame geometry targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const frames = await page.locator('.view-shop .shop-main .item-card, .view-shop .shop-main .activity-card').evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card);
    return { clipPath: style.clipPath, borderWidth: style.borderTopWidth };
  }));

  expect(frames.length).toBeGreaterThanOrEqual(12);
  expect(frames.every(({ clipPath, borderWidth }) => clipPath !== 'none' && borderWidth === '1px')).toBe(true);
});

test('keeps the shop utility rail on the stepped header-row-footer surfaces', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'inverse Rail assertion targets the supported desktop landscape surface');
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const phone = page.locator('article.item-card').filter({ hasText: '实用手机' }).first();
  await phone.getByRole('button', { name: '加入购物袋：实用手机', exact: true }).click();

  const cart = page.locator('.shop-rail .rail-cart');
  const schedule = page.locator('.shop-rail .rail-schedule');
  await expect(cart).toHaveCSS('background-color', 'rgb(9, 9, 9)');
  await expect(cart.locator('header')).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(cart.locator('.rail-rows li').first()).toHaveCSS('background-color', 'rgb(244, 244, 239)');
  await expect(cart.getByRole('button', { name: '一次购买' })).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(schedule).toHaveCSS('background-color', 'rgb(9, 9, 9)');
  await expect(schedule.locator('header')).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(schedule.locator('.rail-rows li').first()).toHaveCSS('background-color', 'rgb(244, 244, 239)');
  await expect(schedule.getByRole('button', { name: '查看完整安排' })).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(page.locator('.shop-rail .rail-inventory')).toHaveCSS('background-color', 'rgb(9, 9, 9)');

  for (const moduleSelector of ['.rail-inventory', '.rail-wishlist']) {
    const heading = page.locator(`.shop-rail ${moduleSelector} .section-heading`);
    await expect(heading).toHaveCSS('background-color', 'rgb(7, 7, 7)');
    await expect(heading.getByRole('heading')).toHaveCSS('color', 'rgb(255, 255, 255)');
  }
});

test('keeps the Shop catalog and utility rail in the reference proportion', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop catalog proportions target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const layout = await page.locator('.view-shop .shop-layout').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const main = element.querySelector('.shop-main')?.getBoundingClientRect();
    const rail = element.querySelector('.shop-rail')?.getBoundingClientRect();
    const tabs = element.querySelector('.shop-tab-bar')?.getBoundingClientRect();
    const tabButtons = Array.from(element.querySelectorAll<HTMLElement>('.shop-tab-bar .shop-tab')).map((tab) => tab.getBoundingClientRect());
    const toolbar = element.querySelector('.shop-tab-bar .shop-toolbar')?.getBoundingClientRect();
    const toolbarControls = Array.from(element.querySelectorAll<HTMLElement>('.shop-tab-bar .shop-toolbar > *')).map((control) => control.getBoundingClientRect());
    return {
      width: rect.width,
      mainWidth: main?.width ?? 0,
      railWidth: rail?.width ?? 0,
      gap: rail && main ? rail.left - main.right : 0,
      railTop: rail?.top ?? 0,
      tabsTop: tabs?.top ?? 0,
      tabWidths: tabButtons.map((tab) => tab.width),
      tabGaps: tabButtons.slice(1).map((tab, index) => tab.left - tabButtons[index].right),
      tabLeftInset: tabButtons[0] && main ? tabButtons[0].left - main.left : 0,
      tabToToolbarGap: toolbar && tabButtons.length ? toolbar.left - tabButtons.at(-1)!.right : 0,
      toolbarRightInset: toolbar && main ? main.right - toolbar.right : 0,
      toolbarGaps: toolbarControls.slice(1).map((control, index) => control.left - toolbarControls[index].right),
      toolbarControlWidths: toolbarControls.map((control) => control.width),
    };
  });

  expect(layout.width).toBeGreaterThanOrEqual(1380);
  expect(layout.width).toBeLessThanOrEqual(1400);
  expect(layout.mainWidth).toBeGreaterThanOrEqual(1000);
  expect(layout.mainWidth).toBeLessThanOrEqual(1040);
  expect(layout.railWidth).toBeGreaterThanOrEqual(350);
  expect(layout.railWidth).toBeLessThanOrEqual(370);
  expect(layout.gap).toBeGreaterThanOrEqual(10);
  expect(layout.gap).toBeLessThanOrEqual(20);
  expect(Math.abs(layout.railTop - layout.tabsTop)).toBeLessThanOrEqual(2);
  expect(layout.tabWidths).toHaveLength(6);
  expect(layout.tabWidths.every((width) => width >= 94 && width <= 106)).toBe(true);
  expect(layout.tabGaps.every((gap) => gap >= 14 && gap <= 24)).toBe(true);
  expect(layout.tabLeftInset).toBeGreaterThanOrEqual(12);
  expect(layout.tabLeftInset).toBeLessThanOrEqual(20);
  expect(layout.tabToToolbarGap).toBeGreaterThanOrEqual(44);
  expect(layout.tabToToolbarGap).toBeLessThanOrEqual(66);
  expect(layout.toolbarRightInset).toBeGreaterThanOrEqual(12);
  expect(layout.toolbarRightInset).toBeLessThanOrEqual(24);
  expect(layout.toolbarGaps.every((gap) => gap >= 14 && gap <= 24)).toBe(true);
  expect(layout.toolbarControlWidths[0]).toBeGreaterThanOrEqual(108);
  expect(layout.toolbarControlWidths[0]).toBeLessThanOrEqual(118);
  expect(layout.toolbarControlWidths[1]).toBeGreaterThanOrEqual(104);
  expect(layout.toolbarControlWidths[1]).toBeLessThanOrEqual(116);
});

test('keeps empty Career and Shop support bodies on explicit state lanes', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'support-body surface assertions target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  await page.getByRole('button', { name: '职业', exact: true }).click();
  const careerEmptyStyles = await page.locator('.career-section.market-mode .career-bottom-panel:nth-child(-n+3) > .career-bottom-empty').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    const icon = item.querySelector('.pixel-illustration');
    const copy = item.querySelector('strong');
    return {
      background: style.backgroundColor,
      border: style.borderTopColor,
      color: copy ? getComputedStyle(copy).color : '',
      iconColor: icon ? getComputedStyle(icon).color : '',
    };
  }));

  expect(careerEmptyStyles).toHaveLength(3);
  expect(careerEmptyStyles.every(({ background, border, color, iconColor }) =>
    background === 'rgb(244, 244, 239)' && border === 'rgb(153, 153, 153)' && color === 'rgb(7, 7, 7)' && iconColor === 'rgb(7, 7, 7)'
  )).toBe(true);

  await page.getByRole('button', { name: '商店', exact: true }).click();
  const rail = page.locator('.shop-rail');
  const emptyStates = rail.locator('.shop-rail-empty');
  await expect(emptyStates).toHaveCount(3);
  for (let index = 0; index < await emptyStates.count(); index += 1) {
    await expect(emptyStates.nth(index)).toHaveCSS('background-color', 'rgb(9, 9, 9)');
    await expect(emptyStates.nth(index).locator('strong')).toHaveCSS('color', 'rgb(244, 244, 239)');
    await expect(emptyStates.nth(index).locator('small')).toHaveCSS('color', 'rgb(170, 170, 170)');
  }
});

test('keeps an empty Shop Rail in the tall reference frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'tall empty Shop Rail footprint targets the primary desktop surface');
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const rail = page.locator('.shop-rail');
  const footprint = await rail.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const modules = Array.from(element.querySelectorAll(':scope > .rail-module')).map((module) => {
      const moduleRect = module.getBoundingClientRect();
      return { height: moduleRect.height, bottom: moduleRect.bottom };
    });
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    return {
      height: rect.height,
      bottom: rect.bottom,
      footerTop: footer?.top ?? Number.POSITIVE_INFINITY,
      modules,
    };
  });

  expect(footprint.height).toBeGreaterThanOrEqual(780);
  expect(footprint.bottom).toBeLessThanOrEqual(footprint.footerTop);
  expect(footprint.modules).toHaveLength(4);
  expect(footprint.modules[0].height).toBeGreaterThanOrEqual(180);
  expect(footprint.modules[1].height).toBeGreaterThanOrEqual(240);
  expect(footprint.modules[2].height).toBeGreaterThanOrEqual(84);
  expect(footprint.modules[3].height).toBeGreaterThanOrEqual(200);

  const emptyStates = rail.locator('.shop-rail-empty');
  await expect(emptyStates).toHaveCount(3);
  for (let index = 0; index < await emptyStates.count(); index += 1) {
    await expect(emptyStates.nth(index)).toHaveCSS('background-color', 'rgb(9, 9, 9)');
    await expect(emptyStates.nth(index).locator('strong')).toHaveCSS('color', 'rgb(244, 244, 239)');
    await expect(emptyStates.nth(index).locator('small')).toHaveCSS('color', 'rgb(170, 170, 170)');
  }
});

test('keeps the tall Shop inventory lane as a compact dark strip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'inventory strip proportion targets the primary desktop surface');
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const inventory = page.locator('.shop-rail .rail-inventory');
  const geometry = await inventory.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const heading = element.querySelector('.section-heading')?.getBoundingClientRect();
    const state = element.querySelector('.shop-rail-empty')?.getBoundingClientRect();
    return {
      height: rect.height,
      headingHeight: heading?.height ?? 0,
      stateHeight: state?.height ?? 0,
    };
  });

  expect(geometry.height).toBeGreaterThanOrEqual(84);
  expect(geometry.height).toBeLessThanOrEqual(104);
  expect(geometry.headingHeight).toBeLessThanOrEqual(42);
  expect(geometry.stateHeight).toBeLessThanOrEqual(70);
});

test('keeps populated Shop inventory as an actionable pixel strip', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'populated inventory strip targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.inventory = { 'item.seed-coffee': 1, 'item.seed-phone': 1 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const inventory = page.locator('.shop-rail .rail-inventory');
  const strip = inventory.locator('.inventory-strip');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.inventory-item')).toHaveCount(2);
  await expect(strip.getByText('现磨咖啡', { exact: true })).toBeVisible();
  await expect(strip.getByText('实用手机', { exact: true })).toBeVisible();
  await expect(strip.getByRole('button', { name: '使用一次', exact: true })).toBeVisible();
  await expect(strip.getByRole('button', { name: '出售一次', exact: true })).toBeVisible();

  const geometry = await inventory.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const stripRect = element.querySelector('.inventory-strip')?.getBoundingClientRect();
    const strip = element.querySelector<HTMLElement>('.inventory-strip');
    return {
      height: rect.height,
      stripHeight: stripRect?.height ?? 0,
      stripScrollWidth: strip?.scrollWidth ?? 0,
      stripClientWidth: strip?.clientWidth ?? 0,
    };
  });
  expect(geometry.height).toBeLessThanOrEqual(104);
  expect(geometry.stripHeight).toBeGreaterThanOrEqual(42);
  expect(geometry.stripHeight).toBeLessThanOrEqual(62);
  expect(geometry.stripScrollWidth).toBeLessThanOrEqual(geometry.stripClientWidth);

  await strip.getByRole('button', { name: '使用一次', exact: true }).click();
  await expect(strip.getByText('现磨咖啡', { exact: true })).toHaveCount(0);
});

test('keeps populated Shop wishlist as light action rows under a dark header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'populated wishlist surface targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.wishlist = ['item.seed-phone'];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const wishlist = page.locator('.shop-rail .rail-wishlist');
  const heading = wishlist.locator('.section-heading');
  const row = wishlist.locator('.item-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('实用手机');
  await expect(row.getByRole('button', { name: '买下', exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: '移除', exact: true })).toBeVisible();
  await expect(wishlist).toHaveCSS('background-color', 'rgb(9, 9, 9)');
  await expect(heading).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(heading.getByRole('heading')).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(row).toHaveCSS('background-color', 'rgb(244, 244, 239)');
  await expect(row.getByRole('button', { name: '买下', exact: true })).toHaveCSS('color', 'rgb(7, 7, 7)');
});

test('keeps low-height Shop support content in the main scroll context', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height Shop scrolling targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const layout = await page.locator('.view-shop .shop-support-panels').evaluate((element) => {
    const style = getComputedStyle(element);
    const main = document.querySelector<HTMLElement>('.main-content');
    const footer = document.querySelector<HTMLElement>('.persistent-status');
    const mainRect = main?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      supportOverflowY: style.overflowY,
      supportMaxHeight: style.maxHeight,
      supportScrollHeight: element.scrollHeight,
      supportClientHeight: element.clientHeight,
      mainOverflowY: main ? getComputedStyle(main).overflowY : '',
      mainScrollHeight: main?.scrollHeight ?? 0,
      mainClientHeight: main?.clientHeight ?? 0,
      mainBottom: mainRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
    };
  });

  expect(layout.supportOverflowY).toBe('visible');
  expect(layout.supportMaxHeight).toBe('none');
  expect(layout.supportScrollHeight).toBe(layout.supportClientHeight);
  expect(layout.mainOverflowY).toBe('auto');
  expect(layout.mainScrollHeight).toBeGreaterThan(layout.mainClientHeight);
  expect(layout.footerTop).toBeGreaterThanOrEqual(layout.mainBottom);
});

test('keeps the low-height Shop product matrix above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop product fit targets the supported landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const layout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.view-shop .shop-main .item-card')).slice(0, 12).map((card) => {
      const rect = card.getBoundingClientRect();
      const cta = card.querySelector<HTMLElement>('.item-card-foot .primary-button')?.getBoundingClientRect();
      const contentBottom = Math.max(
        card.querySelector<HTMLElement>('.card-art')?.getBoundingClientRect().bottom ?? 0,
        card.querySelector<HTMLElement>('.catalog-title-row')?.getBoundingClientRect().bottom ?? 0,
        card.querySelector<HTMLElement>('.catalog-facts')?.getBoundingClientRect().bottom ?? 0,
        card.querySelector<HTMLElement>('.item-card-foot')?.getBoundingClientRect().bottom ?? 0,
      );
      return {
        bottom: rect.bottom,
        height: rect.height,
        ctaBottom: cta?.bottom ?? 0,
        contentBottom,
      };
    });
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    const pager = document.querySelector('.view-shop .catalog-pager')?.getBoundingClientRect();
    return {
      cards,
      footerTop: footer?.top ?? 0,
      pagerTop: pager?.top ?? 0,
      maxBottom: Math.max(...cards.map(({ bottom }) => bottom)),
    };
  });

  expect(layout.cards).toHaveLength(12);
  expect(layout.cards.every(({ height, ctaBottom, contentBottom, bottom }) =>
    height >= 108 && height <= 120 && ctaBottom <= bottom + 0.5 && contentBottom <= bottom - 1
  )).toBe(true);
  expect(layout.maxBottom).toBeLessThanOrEqual(layout.footerTop - 8);
  expect(layout.pagerTop).toBeGreaterThanOrEqual(layout.footerTop);
});

test('keeps the low-height Shop entertainment matrix above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop activity fit targets the supported landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();

  const layout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.view-shop .shop-main .activity-card')).slice(0, 12).map((card) => {
      const rect = card.getBoundingClientRect();
      const cta = card.querySelector<HTMLElement>('.activity-card-body > .secondary-button')?.getBoundingClientRect();
      const contentBottom = Math.max(
        card.querySelector<HTMLElement>('.card-art')?.getBoundingClientRect().bottom ?? 0,
        card.querySelector<HTMLElement>('.catalog-title-row')?.getBoundingClientRect().bottom ?? 0,
        card.querySelector<HTMLElement>('.catalog-facts')?.getBoundingClientRect().bottom ?? 0,
        cta?.bottom ?? 0,
      );
      return { bottom: rect.bottom, height: rect.height, ctaBottom: cta?.bottom ?? 0, contentBottom };
    });
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    const pager = document.querySelector('.view-shop .catalog-pager')?.getBoundingClientRect();
    return {
      cards,
      footerTop: footer?.top ?? 0,
      pagerTop: pager?.top ?? 0,
      maxBottom: Math.max(...cards.map(({ bottom }) => bottom)),
    };
  });

  expect(layout.cards).toHaveLength(12);
  expect(layout.cards.every(({ height, ctaBottom, contentBottom, bottom }) =>
    height >= 108 && height <= 120 && ctaBottom <= bottom + 0.5 && contentBottom <= bottom - 1
  )).toBe(true);
  expect(layout.maxBottom).toBeLessThanOrEqual(layout.footerTop - 8);
  expect(layout.pagerTop).toBeGreaterThanOrEqual(layout.footerTop);
});

test('keeps Shop Rail modules on the shared stepped outer-frame grammar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Rail frame grammar targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const frames = await page.locator('.view-shop .shop-rail > .rail-module').evaluateAll((modules) => modules.map((module) => {
    const style = getComputedStyle(module);
    return { clipPath: style.clipPath, borderWidth: style.borderTopWidth };
  }));

  expect(frames).toHaveLength(4);
  expect(frames.every(({ clipPath, borderWidth }) => clipPath !== 'none' && borderWidth === '2px')).toBe(true);
});

test('keeps Shop inventory and wishlist rail headers on the shared icon grammar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop Rail header icons target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  await expect(page.locator('.shop-rail .rail-inventory .section-heading .pixel-icon')).toHaveAttribute('data-rail-icon', 'bag');
  await expect(page.locator('.shop-rail .rail-wishlist .section-heading .pixel-icon')).toHaveAttribute('data-rail-icon', 'heart');
  await expect(page.locator('.shop-rail .rail-wishlist .shop-rail-empty .pixel-illustration')).toHaveClass(/il-heart/);
});

test('keeps the Life forecast header on the reference inverse surface', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'forecast header assertion targets the supported desktop landscape surface');
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const forecast = page.locator('.view-life .life-hero-grid > .forecast-strip.inverse');
  const header = forecast.locator('.forecast-head');
  const title = header.getByRole('heading', { name: '本周预测', exact: true });
  const headerGeometry = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
  });

  await expect(header).toHaveCSS('background-color', 'rgb(7, 7, 7)');
  await expect(title).toHaveCSS('color', 'rgb(255, 255, 255)');
  expect(headerGeometry.height).toBeGreaterThanOrEqual(42);
  expect(headerGeometry.height).toBeLessThanOrEqual(58);
  expect(headerGeometry.scrollWidth).toBeLessThanOrEqual(headerGeometry.clientWidth);
});

test('keeps the tall Life Hero clock on the dominant pixel-display tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Life Hero display tier is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const clock = await page.locator('.view-life .hero-clock').evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      unit: Number.parseFloat(style.getPropertyValue('--pixel-clock-unit')),
      width: rect.width,
      height: rect.height,
    };
  });

  expect(clock.unit).toBeGreaterThanOrEqual(12);
  expect(clock.width).toBeGreaterThanOrEqual(315);
  expect(clock.height).toBeGreaterThanOrEqual(90);
});

test('keeps the Life forecast net row on the light reading surface', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'forecast surface assertion targets the supported desktop landscape surface');
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const net = page.locator('.view-life .life-hero-grid > .forecast-strip.inverse .forecast-net');
  await expect(net).toHaveCSS('background-color', 'rgb(244, 244, 239)');
  await expect(net).toHaveCSS('color', 'rgb(7, 7, 7)');
  await expect(net.locator('span')).toHaveCSS('color', 'rgb(7, 7, 7)');
  await expect(net.locator('strong')).toHaveCSS('color', 'rgb(7, 7, 7)');
});

test('keeps the tall Life forecast rail on the extended reference tier', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'tall Life forecast footprint targets the desktop project');
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1181 || (page.viewportSize()?.height ?? 0) < 801, 'tall Life forecast footprint targets the primary desktop surface');
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const geometry = await page.locator('.view-life .life-hero-grid > .forecast-strip.inverse').evaluate((forecast) => {
    const forecastRect = forecast.getBoundingClientRect();
    const consoleRect = forecast.parentElement?.querySelector('.time-console')?.getBoundingClientRect();
    const planningRect = document.querySelector('.view-life .life-planning-section')?.getBoundingClientRect();
    const moreRect = forecast.querySelector('.forecast-more')?.getBoundingClientRect();
    return {
      forecastHeight: forecastRect.height,
      forecastBottom: forecastRect.bottom,
      consoleBottom: consoleRect?.bottom ?? 0,
      planningTop: planningRect?.top ?? 0,
      moreBottom: moreRect?.bottom ?? 0,
    };
  });

  expect(geometry.forecastHeight).toBeGreaterThanOrEqual(396);
  expect(geometry.forecastBottom).toBeGreaterThan(geometry.consoleBottom + 18);
  expect(geometry.forecastBottom).toBeLessThanOrEqual(geometry.planningTop + 24);
  expect(geometry.moreBottom).toBeGreaterThan(geometry.consoleBottom + 12);
});

test('keeps the fitted Life forecast data surface flat inside its inverse frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'forecast frame assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const innerFrames = await page.locator('.view-life .life-hero-grid > .forecast-strip.inverse > :is(.forecast-row, .forecast-net, .forecast-attrs)').evaluateAll((elements) => elements.map((element) => {
    const pseudo = getComputedStyle(element, '::before');
    return pseudo.display;
  }));

  expect(innerFrames).toHaveLength(4);
  expect(innerFrames.every((display) => display === 'none')).toBe(true);
});

test('keeps the Life activity progress and next-action band in the lower half of the hero', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Life Hero rhythm targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const geometry = await page.locator('.view-life .life-hero-grid .time-console').evaluate((hero) => {
    const progress = hero.querySelector<HTMLElement>('.hero-activity .activity-progress')?.getBoundingClientRect();
    const next = hero.querySelector<HTMLElement>('.hero-activity .hero-next')?.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    return {
      heroTop: heroRect.top,
      heroHeight: heroRect.height,
      progressTop: progress?.top ?? 0,
      nextBottom: next?.bottom ?? 0,
    };
  });

  expect(geometry.progressTop).toBeGreaterThanOrEqual(geometry.heroTop + geometry.heroHeight * 0.55);
  expect(geometry.nextBottom).toBeGreaterThanOrEqual(geometry.heroTop + geometry.heroHeight * 0.74);
});

test('keeps a long Life activity title on one reference-like Hero line', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Life Hero title assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const titleGeometry = await page.locator('.view-life .hero-activity h2').evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      lineHeight: parseFloat(style.lineHeight),
      whiteSpace: style.whiteSpace,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    };
  });

  expect(titleGeometry.whiteSpace).toBe('nowrap');
  expect(titleGeometry.height).toBeLessThanOrEqual(titleGeometry.lineHeight * 1.1);
  expect(titleGeometry.scrollWidth).toBeLessThanOrEqual(titleGeometry.clientWidth);
});

test('keeps collapsed Life details as a floating affordance without a full-width row', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'life details affordance targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const drawer = page.locator('.view-life .life-secondary-drawer:not(.is-open)');
  const row = drawer.locator('.life-secondary-toggle-row');
  const button = drawer.getByRole('button', { name: '查看生活详情', exact: true });
  await expect(button).toBeVisible();

  const geometry = await drawer.evaluate((element) => {
    const drawerRect = element.getBoundingClientRect();
    const rowRect = element.querySelector('.life-secondary-toggle-row')?.getBoundingClientRect();
    const buttonRect = element.querySelector('button')?.getBoundingClientRect();
    const footerRect = document.querySelector('.persistent-status')?.getBoundingClientRect();
    return {
      drawerHeight: drawerRect.height,
      rowHeight: rowRect?.height ?? 0,
      buttonHeight: buttonRect?.height ?? 0,
      buttonBottom: buttonRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
    };
  });

  expect(geometry.drawerHeight).toBeLessThanOrEqual(2);
  expect(geometry.rowHeight).toBeLessThanOrEqual(2);
  expect(geometry.buttonHeight).toBeGreaterThanOrEqual(24);
  expect(geometry.buttonBottom).toBeLessThanOrEqual(geometry.footerTop);
  expect(geometry.buttonBottom).toBeGreaterThanOrEqual(geometry.footerTop - 32);
  await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('keeps navigation and panel anchors in the shared structural pixel tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'structural icon tiers target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const sizes = await page.locator('.main-nav .nav-item .pixel-icon, .view-life .inbox-head .pixel-icon').evaluateAll((icons) => icons.map((icon) => {
    const rect = icon.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));

  expect(sizes.length).toBeGreaterThanOrEqual(11);
  expect(sizes.every(({ width, height }) => width >= 20 && height >= 20 && width <= 24 && height <= 24)).toBe(true);
});

test('hides dormant scroll tracks on the fitted tall desktop surface', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'tall desktop scrollbar treatment targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const overflow = await page.locator('.main-nav, .main-content').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      className: element.className,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    };
  }));

  expect(overflow).toHaveLength(2);
  expect(overflow.every(({ overflowX, overflowY, scrollWidth, clientWidth, scrollHeight, clientHeight }) =>
    overflowX === 'hidden' && overflowY === 'hidden' &&
    scrollWidth <= clientWidth + 2 && scrollHeight <= clientHeight + 1
  )).toBe(true);

  await page.getByRole('button', { name: '查看生活详情', exact: true }).click();
  const detailOverflow = await page.locator('.main-content').evaluate((element) => {
    const style = getComputedStyle(element);
    return { overflowY: style.overflowY, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
  });

  expect(detailOverflow.overflowY).toBe('auto');
  expect(detailOverflow.scrollHeight).toBeGreaterThan(detailOverflow.clientHeight);
});

test('keeps tall desktop marks on shared pixel primitives without live scrollbars', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'tall desktop pixel-system audit targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  for (const view of ['生活', '职业', '商店']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    const audit = await page.evaluate(() => {
      const visible = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const liveScrollbars = Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter((element) => visible(element))
        .filter((element) => {
          const style = getComputedStyle(element);
          const scrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1;
          const scrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 1;
          return scrollX || scrollY;
        })
        .map((element) => element.className || element.tagName);
      const nonPixelSvgs = Array.from(document.querySelectorAll<SVGElement>('svg'))
        .filter((element) => visible(element as unknown as HTMLElement))
        .filter((element) => !element.classList.contains('pixel-icon') && !element.classList.contains('pixel-illustration'))
        .map((element) => element.outerHTML.slice(0, 80));
      const directionalTextMarkers = Array.from(document.querySelectorAll<HTMLElement>('.forecast-more, .inbox-foot button, .rail-link, .status-detail, .career-toolbar-popover > summary'))
        .filter((element) => visible(element))
        .filter((element) => element.textContent?.includes('▸'))
        .map((element) => element.textContent?.trim() ?? '');
      const directionalIconCount = Array.from(document.querySelectorAll<HTMLElement>('.forecast-more, .inbox-foot button, .rail-link, .status-detail, .career-toolbar-popover > summary'))
        .filter((element) => visible(element))
        .filter((element) => element.querySelector('.pixel-action .pixel-icon'))
        .length;
      return { liveScrollbars, nonPixelSvgs, directionalTextMarkers, directionalIconCount };
    });

    expect(audit.liveScrollbars, `${view} has a live scrollbar`).toEqual([]);
    expect(audit.nonPixelSvgs, `${view} has a non-pixel SVG`).toEqual([]);
    expect(audit.directionalTextMarkers, `${view} has a visible text arrow`).toEqual([]);
    expect(audit.directionalIconCount, `${view} has no shared directional icon`).toBeGreaterThan(0);
  }
});

test('keeps the header brand cat as a dense stepped 1-bit mark', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'brand mark anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const metrics = await page.locator('.brand-mascot').evaluate((element) => {
    const rects = Array.from(element.querySelectorAll('rect'));
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const brandBlock = element.closest('.brand-block');
    const wordmark = element.closest('.brand-block')?.querySelector('.brand-wordmark');
    const subtitle = element.closest('.brand-block')?.querySelector('.brand-subtitle');
    const mark = element.closest('.brand-block')?.querySelector('.brand-mark');
    const markRect = mark?.getBoundingClientRect();
    const subtitleRect = subtitle?.getBoundingClientRect();
    return {
      rectCount: rects.length,
      width: box.width,
      height: box.height,
      x: box.x,
      y: box.y,
      markX: markRect ? Math.round(markRect.x) : null,
      markY: markRect ? Math.round(markRect.y) : null,
      subtitleX: subtitleRect ? Math.round(subtitleRect.x) : null,
      subtitleY: subtitleRect ? Math.round(subtitleRect.y) : null,
      backgroundColor: style.backgroundColor,
      borderStyle: style.borderStyle,
      padding: style.padding,
      brandGap: brandBlock ? getComputedStyle(brandBlock).gap : '',
      wordmarkGap: wordmark ? getComputedStyle(wordmark).gap : '',
      subtitleFontSize: subtitle ? getComputedStyle(subtitle).fontSize : '',
    };
  });

  expect(metrics.rectCount).toBeGreaterThanOrEqual(30);
  expect(metrics.width).toBe(56);
  expect(metrics.height).toBe(56);
  expect(Math.round(metrics.x)).toBe(272);
  expect(Math.round(metrics.y)).toBe(33);
  expect(metrics.markX).toBe(44);
  expect(metrics.markY).toBe(27);
  expect(metrics.subtitleX).toBe(174);
  expect(metrics.subtitleY).toBe(35);
  expect(metrics.brandGap).toBe('23px');
  expect(metrics.wordmarkGap).toBe('18px');
  expect(metrics.subtitleFontSize).toBe('18px');
  expect(metrics.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(metrics.borderStyle).toBe('none');
  expect(metrics.padding).toBe('0px');
});

test('renders the header brand cat on a fine 1-bit sprite grid', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'brand sprite density targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const sprite = await page.locator('.brand-mascot').evaluate((element) => ({
    viewBox: element.getAttribute('viewBox'),
    className: element.getAttribute('class') ?? '',
    shapeRendering: element.getAttribute('shape-rendering'),
    rectCount: element.querySelectorAll('rect').length,
  }));

  expect(sprite.viewBox).toBe('0 0 56 56');
  expect(sprite.className).toContain('fine-grid');
  expect(sprite.shapeRendering).toBe('crispEdges');
  expect(sprite.rectCount).toBeGreaterThanOrEqual(100);
});

test('keeps the persistent mascot fully inside its tall portrait slot', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'persistent portrait framing targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const geometry = await page.locator('.persistent-status .pixel-avatar').evaluate((element) => {
    const slot = element.getBoundingClientRect();
    const sprite = element.querySelector('svg')?.getBoundingClientRect();
    return {
      slotLeft: slot.left,
      slotRight: slot.right,
      spriteLeft: sprite?.left ?? 0,
      spriteRight: sprite?.right ?? 0,
      spriteWidth: sprite?.width ?? 0,
    };
  });

  expect(geometry.spriteWidth).toBeGreaterThanOrEqual(58);
  expect(geometry.spriteLeft).toBeGreaterThanOrEqual(geometry.slotLeft - 0.5);
  expect(geometry.spriteRight).toBeLessThanOrEqual(geometry.slotRight + 0.5);
});

test('keeps empty Life inboxes as compact one-line pixel status lanes', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'life empty-state anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const states = await page.locator('.view-life .inbox-panel .inbox-empty').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    const mark = item.querySelector('.inbox-empty-mark');
    const markRect = mark?.getBoundingClientRect();
    const copy = item.querySelector('.inbox-empty-copy');
    const copyRect = copy?.getBoundingClientRect();
    const hint = item.querySelector('.inbox-empty-copy small');
    const itemRect = item.getBoundingClientRect();
    return {
      gridTemplateColumns: style.gridTemplateColumns,
      textAlign: style.textAlign,
      justifyItems: style.justifyItems,
      markWidth: markRect?.width ?? 0,
      markHeight: markRect?.height ?? 0,
      emptyWidth: itemRect.width,
      emptyHeight: itemRect.height,
      copyLeft: copyRect?.left ?? 0,
      copyTop: copyRect?.top ?? 0,
      markRight: markRect?.right ?? 0,
      markCenterY: markRect ? markRect.top + markRect.height / 2 : 0,
      copyCenterY: copyRect ? copyRect.top + copyRect.height / 2 : 0,
      strongFontSize: copy?.querySelector('strong') ? Number.parseFloat(getComputedStyle(copy.querySelector('strong')!).fontSize) : 0,
      hintFontSize: hint ? Number.parseFloat(getComputedStyle(hint).fontSize) : 0,
      hintHeight: hint?.getBoundingClientRect().height ?? 0,
      hintPresent: Boolean(hint),
      backgroundColor: style.backgroundColor,
      borderTopStyle: style.borderTopStyle,
      borderBottomStyle: style.borderBottomStyle,
      hintVisible: hint ? getComputedStyle(hint).display !== 'none' : false,
    };
  }));

  expect(states.length).toBeGreaterThanOrEqual(2);
  expect(states.every(({ gridTemplateColumns, textAlign, justifyItems, markWidth, markHeight, emptyWidth, emptyHeight, copyLeft, copyTop, markRight, markCenterY, copyCenterY, strongFontSize, hintHeight, hintPresent, backgroundColor, borderTopStyle, borderBottomStyle, hintVisible }) =>
    gridTemplateColumns.trim().split(/\s+/).length === 2 && textAlign === 'left' && justifyItems === 'start' &&
    markWidth >= 32 && markWidth <= 36 && markHeight >= 32 && markHeight <= 36 &&
    emptyWidth >= 300 && emptyWidth <= 330 &&
    emptyHeight >= 64 && emptyHeight <= 76 &&
    copyLeft >= markRight + 6 && copyTop >= 0 &&
    Math.abs(markCenterY - copyCenterY) <= 12 &&
    strongFontSize >= 11.5 && hintPresent && hintHeight <= 1 && !hintVisible &&
    backgroundColor === 'rgba(0, 0, 0, 0)' &&
    borderTopStyle === 'dotted' && borderBottomStyle === 'dotted' && !hintVisible
  )).toBe(true);
});

test('keeps a four-row Life inbox inside its fixed panel frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'life populated-row anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const messages = Array.from({ length: 4 }, (_, index) => ({
    id: `message.visual-${index + 1}`,
    day: index + 2,
    characterId: 'character.seed-lin',
    title: `林晨发来消息 ${index + 1}`,
    body: '这是一条用于比较真实行高的消息。',
    sourceId: 'interaction.seed-lin-meal',
    read: index % 2 === 0,
  }));
  await page.evaluate((nextMessages) => {
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ messages: nextMessages }));
  }, messages);
  await page.reload();
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const geometry = await page.locator('.view-life .inbox-messages').evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const footer = element.querySelector<HTMLElement>('.inbox-foot')?.getBoundingClientRect();
    return {
      rowCount: element.querySelectorAll('.inbox-list > li').length,
      panelBottom: panel.bottom,
      lastRowBottom: element.querySelector<HTMLElement>('.inbox-list > li:last-child')?.getBoundingClientRect().bottom ?? 0,
      footerTop: footer?.top ?? 0,
      footerBottom: footer?.bottom ?? 0,
    };
  });

  expect(geometry.rowCount).toBe(4);
  expect(geometry.lastRowBottom).toBeLessThanOrEqual(geometry.footerTop + 0.5);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.panelBottom + 0.5);
});

test('keeps a four-row Life inbox inside its low-height panel frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height Life populated-row anatomy is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  const messages = Array.from({ length: 4 }, (_, index) => ({
    id: `message.visual-low-${index + 1}`,
    day: index + 2,
    characterId: 'character.seed-lin',
    title: `林晨发来消息 ${index + 1}`,
    body: '这是一条用于比较真实行高的消息。',
    sourceId: 'interaction.seed-lin-meal',
    read: false,
  }));
  await page.evaluate((nextMessages) => {
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ messages: nextMessages }));
  }, messages);
  await page.reload();
  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.locator('.view-life .inbox-messages').scrollIntoViewIfNeeded();

  const geometry = await page.locator('.view-life .inbox-messages').evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const footer = element.querySelector<HTMLElement>('.inbox-foot')?.getBoundingClientRect();
    return { panelBottom: panel.bottom, footerBottom: footer?.bottom ?? 0 };
  });

  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.panelBottom + 0.5);
});

test('keeps Life weekly plan activity icons on the reference anchor tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'weekly plan icon tier targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const cells = await page.locator('.view-life .life-planning-section .plan-cell').evaluateAll((items) => items.map((cell) => {
    const icon = cell.querySelector('.pixel-icon')?.getBoundingClientRect();
    const strong = cell.querySelector('strong');
    const small = cell.querySelector('small');
    const style = getComputedStyle(cell);
    return {
      iconWidth: icon?.width ?? 0,
      iconHeight: icon?.height ?? 0,
      gridColumns: style.gridTemplateColumns,
      strongClientHeight: strong?.clientHeight ?? 0,
      strongScrollHeight: strong?.scrollHeight ?? 0,
      smallClientHeight: small?.clientHeight ?? 0,
      smallScrollHeight: small?.scrollHeight ?? 0,
    };
  }));

  expect(cells.length).toBe(14);
  expect(cells.every(({ iconWidth, iconHeight, gridColumns }) =>
    iconWidth >= 28 && iconHeight >= 28 && iconWidth <= 34 && iconHeight <= 34 && gridColumns.trim().split(/\s+/).length === 2
  )).toBe(true);
  expect(cells.every(({ strongClientHeight, strongScrollHeight, smallClientHeight, smallScrollHeight }) =>
    strongClientHeight >= strongScrollHeight - 1 && smallClientHeight >= smallScrollHeight - 1
  )).toBe(true);
});

test('anchors partially populated Life inboxes with a neutral end row', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'life inbox end-row anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const pending = page.locator('.view-life .inbox-pending');
  await expect(pending).toContainText('本周计划待开始');
  const endRow = pending.locator('.inbox-list-end');
  await expect(endRow).toHaveText('暂无更多');

  const geometry = await endRow.evaluate((element) => {
    const row = element.getBoundingClientRect();
    const panel = element.closest('.inbox-panel')?.getBoundingClientRect();
    return { rowBottom: row.bottom, panelBottom: panel?.bottom ?? 0, rowHeight: row.height };
  });
  expect(geometry.rowHeight).toBeGreaterThanOrEqual(20);
  expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.panelBottom - 6);
});

test('keeps the persistent status bar at the reference HUD text tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'persistent HUD typography is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const metrics = await page.locator('.persistent-status .persistent-stat').evaluateAll((items) => items.map((item) => {
    const label = item.querySelector(':scope > span');
    const value = item.querySelector(':scope > strong');
    const cell = item.querySelector('.segment-meter i');
    const labelStyle = label ? getComputedStyle(label) : null;
    const valueStyle = value ? getComputedStyle(value) : null;
    const cellRect = cell?.getBoundingClientRect();
    return {
      labelFontSize: labelStyle ? Number.parseFloat(labelStyle.fontSize) : 0,
      valueFontSize: valueStyle ? Number.parseFloat(valueStyle.fontSize) : 0,
      cellWidth: cellRect?.width ?? 0,
      cellHeight: cellRect?.height ?? 0,
    };
  }));
  const bar = await page.locator('.persistent-status').evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));

  expect(metrics).toHaveLength(5);
  expect(metrics.every(({ labelFontSize, valueFontSize, cellWidth, cellHeight }) =>
    labelFontSize >= 12 && valueFontSize >= 16 && cellWidth >= 12 && cellHeight >= 10
  )).toBe(true);
  expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);
});

test('keeps persistent attributes on the shared semantic pixel icon tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'persistent attribute icon anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const icons = await page.locator('.persistent-status .persistent-stat').evaluateAll((items) => items.map((item) => {
    const icon = item.querySelector<SVGElement>(':scope > .pixel-icon');
    const rect = icon?.getBoundingClientRect();
    return {
      label: item.querySelector(':scope > span')?.textContent?.trim() ?? '',
      iconLabel: icon?.getAttribute('data-attribute-icon') ?? '',
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    };
  }));

  expect(icons).toEqual([
    expect.objectContaining({ label: '体能', iconLabel: '体能' }),
    expect.objectContaining({ label: '心情', iconLabel: '心情' }),
    expect.objectContaining({ label: '专业', iconLabel: '专业' }),
    expect.objectContaining({ label: '知识', iconLabel: '知识' }),
    expect.objectContaining({ label: '人脉', iconLabel: '人脉' }),
  ]);
  expect(icons.every(({ width, height }) => width >= 14 && height >= 14 && width <= 18 && height <= 18)).toBe(true);
});

test('keeps career toolbar filters in the reference stacked-label anatomy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career toolbar reference anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const controls = await page.locator('.career-market-filters .career-toolbar-select').evaluateAll((labels) => labels.map((label) => {
    const labelRect = label.querySelector('span')?.getBoundingClientRect();
    const selectRect = label.querySelector('select')?.getBoundingClientRect();
    return {
      labelBottom: labelRect?.bottom ?? 0,
      selectTop: selectRect?.top ?? 0,
      selectHeight: selectRect?.height ?? 0,
      selectWidth: selectRect?.width ?? 0,
    };
  }));

  expect(controls).toHaveLength(3);
  expect(controls.every(({ labelBottom, selectTop, selectHeight, selectWidth }) =>
    selectTop - labelBottom >= 2 && selectHeight >= 30 && selectWidth >= 118 && selectWidth <= 132
  )).toBe(true);
});

test('keeps the Career toolbar on the shared stepped pixel frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career toolbar frame assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const frame = await page.locator('.career-section.market-mode .career-toolbar').evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      borderWidth: style.borderTopWidth,
      clipPath: style.clipPath,
      pointerEvents: style.pointerEvents,
    };
  });

  expect(frame.borderWidth).toBe('1px');
  expect(frame.clipPath).not.toBe('none');
  expect(frame.pointerEvents).toBe('none');
});

test('keeps the Career search field on the shared stepped icon affordance', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career search affordance targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const input = page.locator('.career-search-control input');
  const icon = page.locator('.career-search-control .pixel-icon');
  await expect(input).toHaveAttribute('aria-label', '搜索岗位或公司');
  await expect(icon).toHaveAttribute('shape-rendering', 'crispEdges');
  await expect(icon.locator('path')).toHaveCount(0);

  const geometry = await input.evaluate((element) => {
    const inputRect = element.getBoundingClientRect();
    const iconRect = element.parentElement?.querySelector('svg')?.getBoundingClientRect();
    return {
      input: { left: inputRect.left, right: inputRect.right },
      icon: iconRect ? { left: iconRect.left, right: iconRect.right, width: iconRect.width } : null,
    };
  });

  expect(geometry.icon).not.toBeNull();
  expect(geometry.icon?.width).toBeGreaterThanOrEqual(12);
  expect(geometry.icon?.width).toBeLessThanOrEqual(16);
  expect(geometry.icon?.left).toBeGreaterThan(geometry.input.left + 90);
  expect(geometry.icon?.right).toBeLessThanOrEqual(geometry.input.right - 4);
});

test('keeps the Career page menu clickable above the clipped filter rail', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career page-menu stacking targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  await page.getByRole('button', { name: /^职业页面/ }).click();
  const pageMenu = page.getByRole('navigation', { name: '职业页面导航' });
  await expect(pageMenu).toBeVisible();
  await pageMenu.getByRole('button', { name: '我的申请', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的申请', exact: true })).toBeVisible();
});

test('keeps the Career search hint aligned with the reference filter rail', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career filter-rail typography targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  await expect(page.getByLabel('搜索岗位或公司')).toHaveAttribute('placeholder', '搜索岗位 / 公司 / 关键词');
});

test('keeps Career planning tools as a quiet utility affordance outside the market filters', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career utility presentation targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const trigger = page.getByRole('button', { name: '安排本周与课程' });
  const style = await trigger.evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      background: computed.backgroundColor,
      borderTop: computed.borderTopStyle,
      borderRight: computed.borderRightStyle,
      borderBottom: computed.borderBottomStyle,
      borderLeft: computed.borderLeftStyle,
      fontSize: Number.parseFloat(computed.fontSize),
      textAlign: computed.textAlign,
    };
  });

  expect(style.height).toBeLessThanOrEqual(23);
  expect(style.background).toBe('rgba(0, 0, 0, 0)');
  expect(style.borderTop).toBe('none');
  expect(style.borderRight).toBe('none');
  expect(style.borderBottom).toBe('none');
  expect(style.borderLeft).toBe('dotted');
  expect(style.fontSize).toBeGreaterThanOrEqual(10);
  expect(style.textAlign).toBe('left');
});

test('keeps the Career identity mark beside the market title without expanding the filter rail', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career identity anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const identity = page.locator('.career-market-identity');
  const geometry = await identity.evaluate((element) => {
    const mark = element.querySelector('.career-market-identity-mark')?.getBoundingClientRect();
    const title = element.querySelector('h1')?.getBoundingClientRect();
    const input = element.parentElement?.querySelector('input')?.getBoundingClientRect();
    const identityRect = element.getBoundingClientRect();
    return {
      markWidth: mark?.width ?? 0,
      markHeight: mark?.height ?? 0,
      markRight: mark?.right ?? 0,
      titleLeft: title?.left ?? 0,
      titleTop: title?.top ?? 0,
      identityHeight: identityRect.height,
      inputTop: input?.top ?? 0,
    };
  });

  expect(geometry.markWidth).toBeGreaterThanOrEqual(28);
  expect(geometry.markWidth).toBeLessThanOrEqual(34);
  expect(geometry.markHeight).toBeGreaterThanOrEqual(28);
  expect(geometry.markHeight).toBeLessThanOrEqual(34);
  expect(geometry.titleLeft - geometry.markRight).toBeGreaterThanOrEqual(4);
  expect(geometry.titleTop).toBeGreaterThanOrEqual(geometry.markHeight - 1);
  expect(geometry.identityHeight).toBeLessThanOrEqual(82);
  expect(geometry.inputTop).toBeLessThanOrEqual(252);
});

test('keeps low-height Career toolbar filters readable', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height Career toolbar anatomy is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const controls = await page.locator('.career-market-filters .career-toolbar-select').evaluateAll((labels) => labels.map((label) => {
    const select = label.querySelector('select')?.getBoundingClientRect();
    return { width: select?.width ?? 0, height: select?.height ?? 0 };
  }));
  const toolbar = await page.locator('.career-section.market-mode .career-toolbar').boundingBox();

  expect(controls).toHaveLength(3);
  expect(controls.every(({ width, height }) => width >= 120 && height >= 30)).toBe(true);
  expect(toolbar?.height ?? 0).toBeGreaterThanOrEqual(60);
});

test('keeps Career toolbar labels in the readable pixel tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career toolbar typography targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const typography = await page.locator('.career-market-filters .career-toolbar-select').evaluateAll((labels) => labels.map((label) => ({
    labelFontSize: Number.parseFloat(getComputedStyle(label.querySelector('span') ?? label).fontSize),
    selectFontSize: Number.parseFloat(getComputedStyle(label.querySelector('select') ?? label).fontSize),
    selectHeight: label.querySelector('select')?.getBoundingClientRect().height ?? 0,
  })));

  expect(typography).toHaveLength(3);
  expect(typography.every(({ labelFontSize, selectFontSize, selectHeight }) =>
    labelFontSize >= 12 && selectFontSize >= 13 && selectHeight >= 34
  )).toBe(true);
});

test('keeps Career sorting and filtering as compact real disclosure controls', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career toolbar action anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const sort = page.locator('.career-sort-popover');
  const filter = page.locator('.career-filter-popover');
  await expect(sort.locator('summary')).toHaveAttribute('aria-label', '招聘排序：匹配度');
  await expect(filter.locator('summary')).toHaveText('筛选');

  const actionHeights = await sort.locator('summary').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
  expect(actionHeights[0]).toBeGreaterThanOrEqual(30);

  await sort.locator('summary').click();
  await expect(sort.getByRole('menu', { name: '招聘排序选项' })).toBeVisible();
  await sort.getByRole('menuitem', { name: '薪资最高', exact: true }).click();
  await expect(sort.locator('summary')).toHaveAttribute('aria-label', '招聘排序：薪资最高');

  await filter.locator('summary').click();
  await expect(filter.getByRole('group', { name: '岗位类型快捷筛选' })).toBeVisible();
  await filter.getByRole('button', { name: '兼职', exact: true }).click();
  await expect(page.locator('.career-filters [data-filter-group="category"].career-filter-option.selected')).toContainText('兼职');
});

test('keeps the Career market on the reference filter, results, and detail proportions', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career market proportions target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const widths = await page.locator('.career-section.market-mode .career-market-shell > .career-filters, .career-section.market-mode .career-market-shell > .career-results, .career-section.market-mode .career-market-shell > .career-detail').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));

  expect(widths).toHaveLength(3);
  const [filters, results, detail] = widths;
  expect(filters).toBeGreaterThanOrEqual(230);
  expect(filters).toBeLessThanOrEqual(250);
  expect(results).toBeGreaterThanOrEqual(700);
  expect(results).toBeLessThanOrEqual(770);
  expect(detail).toBeGreaterThanOrEqual(380);
  expect(detail).toBeLessThanOrEqual(410);
});

test('gives the inverse Career detail rail a visible shared pixel-corner frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career detail frame assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const frame = await page.locator('.career-section.market-mode .career-detail.inverse').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { content: style.content, borderColor: style.borderTopColor, clipPath: style.clipPath };
  });

  expect(frame).toEqual({ content: '""', borderColor: 'rgb(7, 7, 7)', clipPath: expect.not.stringMatching(/^none$/) });
});

test('keeps the Career detail identity marker compact beside the job title', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career detail identity marker targets the supported desktop landscape surface');
  for (const viewport of [{ width: 1440, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: '职业', exact: true }).click();

    const marker = await page.locator('.career-section.market-mode .career-detail-visual').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const art = element.querySelector('.pixel-illustration')?.getBoundingClientRect();
      return { width: rect.width, height: rect.height, artWidth: art?.width ?? 0, artHeight: art?.height ?? 0 };
    });

    expect(marker.width).toBeLessThanOrEqual(64);
    expect(marker.height).toBeLessThanOrEqual(64);
    expect(marker.artWidth).toBeLessThanOrEqual(46);
    expect(marker.artHeight).toBeLessThanOrEqual(46);
  }
});

test('anchors a satisfied Career requirement state inside the inverse detail rail', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career detail empty-state treatment is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const status = page.locator('.career-section.market-mode .career-detail.inverse > section:first-of-type > .requirement-ok');
  await expect(status).toBeVisible();
  await expect(status).toHaveText('当前条件已满足');
  await expect(status).toHaveCSS('background-color', 'rgb(9, 9, 9)');
});

test('gives the Career market insight its readable pixel dashboard weight', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career insight reference anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const insight = page.locator('.career-bottom-insight');
  await expect(insight).toBeVisible();
  const bodyGeometry = await insight.locator('.career-insight-body').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const metrics = element.querySelector('.career-insight-metrics');
    const metricItems = Array.from(element.querySelectorAll('.career-insight-metric'));
    const metricsRect = metrics?.getBoundingClientRect();
    const first = metricItems[0]?.getBoundingClientRect();
    const last = metricItems.at(-1)?.getBoundingClientRect();
    const chart = element.querySelector('.pixel-illustration')?.getBoundingClientRect();
    return {
      bodyHeight: rect.height,
      metricsHeight: metricsRect?.height ?? 0,
      metricSpan: first && last ? last.bottom - first.top : 0,
      chartWidth: chart?.width ?? 0,
      chartHeight: chart?.height ?? 0,
    };
  });
  expect(bodyGeometry.bodyHeight).toBeGreaterThanOrEqual(90);
  expect(bodyGeometry.metricsHeight).toBeGreaterThanOrEqual(80);
  expect(bodyGeometry.metricSpan).toBeGreaterThanOrEqual(65);
  expect(bodyGeometry.chartWidth).toBeGreaterThanOrEqual(72);
  expect(bodyGeometry.chartHeight).toBeGreaterThanOrEqual(72);
  const metrics = await insight.locator('.career-insight-metric').evaluateAll((items) => items.map((item) => {
    const root = getComputedStyle(item);
    const label = item.querySelector('span');
    const meterCell = item.querySelector('.segment-meter i');
    const labelStyle = label ? getComputedStyle(label) : null;
    const meterStyle = meterCell ? getComputedStyle(meterCell) : null;
    const chart = item.parentElement?.parentElement?.querySelector('.pixel-illustration');
    const chartRect = chart?.getBoundingClientRect();
    return {
      fontSize: Number.parseFloat(root.fontSize),
      labelFontSize: labelStyle ? Number.parseFloat(labelStyle.fontSize) : 0,
      meterHeight: meterStyle ? Number.parseFloat(meterStyle.height) : 0,
      chartWidth: chartRect?.width ?? 0,
      chartHeight: chartRect?.height ?? 0,
    };
  }));

  expect(metrics.length).toBeGreaterThan(0);
  expect(metrics.every(({ fontSize, labelFontSize, meterHeight, chartWidth, chartHeight }) =>
    fontSize >= 11 && labelFontSize >= 11 && meterHeight >= 10 && chartWidth >= 72 && chartHeight >= 72
  )).toBe(true);
});

test('uses the chart pixel mark for the Career market insight header', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career market insight icon targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  await expect(page.locator('.career-bottom-insight .inbox-head .pixel-icon')).toHaveAttribute('data-panel-icon', 'chart');
});

test('uses reference-shaped marks for the Career offer and history headers', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career support panel icons target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  await expect(page.locator('.career-bottom-offers .inbox-head .pixel-icon')).toHaveAttribute('data-panel-icon', 'star');
  await expect(page.locator('.career-bottom-history .inbox-head .pixel-icon')).toHaveAttribute('data-panel-icon', 'career');
});

test('keeps Career vacancy descriptions compact inside the fixed card anatomy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career vacancy-card anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const cards = await page.locator('.career-results .job-card').evaluateAll((items) => items.slice(0, 6).map((card) => {
    const description = card.querySelector('.job-card-description');
    const actions = card.querySelector('.job-actions');
    const cardStyle = getComputedStyle(card);
    const descriptionStyle = description ? getComputedStyle(description) : null;
    const cardRect = card.getBoundingClientRect();
    const descriptionRect = description?.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      descriptionHeight: descriptionRect?.height ?? 0,
      descriptionMinHeight: descriptionStyle ? Number.parseFloat(descriptionStyle.minHeight) : 0,
      actionsHeight: actionsRect?.height ?? 0,
      alignContent: cardStyle.alignContent,
    };
  }));

  expect(cards.length).toBeGreaterThan(0);
  expect(cards.every(({ cardHeight, descriptionHeight, descriptionMinHeight, actionsHeight, alignContent }) =>
    cardHeight >= 240 && descriptionHeight <= 42 && descriptionMinHeight === 0 && actionsHeight >= 29 && alignContent === 'space-between'
  )).toBe(true);
});

test('keeps Career vacancy art compact beside the card identity', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career vacancy-art anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const art = await page.locator('.career-results .job-card').evaluateAll((items) => items.slice(0, 6).map((card) => {
    const frame = card.querySelector('.career-card-art');
    const illustration = frame?.querySelector('.pixel-illustration');
    const frameRect = frame?.getBoundingClientRect();
    const illustrationRect = illustration?.getBoundingClientRect();
    return {
      frameWidth: Math.round(frameRect?.width ?? 0),
      frameHeight: Math.round(frameRect?.height ?? 0),
      illustrationWidth: Math.round(illustrationRect?.width ?? 0),
      illustrationHeight: Math.round(illustrationRect?.height ?? 0),
    };
  }));

  expect(art.length).toBeGreaterThan(0);
  expect(art.every(({ frameWidth, frameHeight, illustrationWidth, illustrationHeight }) =>
    frameWidth === 40 && frameHeight === 40 &&
    illustrationWidth >= 36 && illustrationWidth <= 38 &&
    illustrationHeight >= 36 && illustrationHeight <= 38
  )).toBe(true);
});

test('keeps Career card identity beside a frameless semantic icon', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career identity anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const identity = await page.locator('.career-results .job-card').evaluateAll((items) => items.slice(0, 6).map((card) => {
    const frame = card.querySelector<HTMLElement>('.career-card-art');
    const icon = frame?.querySelector<HTMLElement>('.pixel-illustration');
    const identityRow = card.querySelector<HTMLElement>('.job-card-identity');
    const kind = identityRow?.querySelector<HTMLElement>('.job-card-head');
    const title = identityRow?.querySelector<HTMLElement>('h2');
    const company = identityRow?.querySelector<HTMLElement>('.job-company');
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const bounds = (element?: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      frame: bounds(frame),
      icon: bounds(icon),
      kind: bounds(kind),
      title: bounds(title),
      company: bounds(company),
      frameBorder: frameStyle?.borderTopStyle ?? '',
      frameBackground: frameStyle?.backgroundColor ?? '',
    };
  }));
  expect(identity).toHaveLength(6);
  expect(identity.every(({ frame, icon, kind, title, company, frameBorder, frameBackground }) =>
    frame?.width === 40 && frame.height === 40 &&
    icon && icon.width >= 36 && icon.width <= 38 && icon.height >= 36 && icon.height <= 38 &&
    kind && title && company &&
    Math.abs(kind.top - title.top) <= 5 &&
    company.top >= title.bottom - 0.5 &&
    frameBorder === 'none' &&
    frameBackground === 'rgba(0, 0, 0, 0)'
  )).toBe(true);
});

test('keeps low-height Career card identity clear of its fact strip', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height Career card anatomy is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const overlaps = await page.locator('.career-results .job-card').evaluateAll((cards) => cards.slice(0, 6).map((card) => {
    const facts = card.querySelector('.job-facts')?.getBoundingClientRect();
    const identityContentBottom = Math.max(...['.job-card-head', 'h2', '.job-company'].map((selector) =>
      card.querySelector(selector)?.getBoundingClientRect().bottom ?? 0
    ));
    return {
      identityContentBottom,
      factsTop: facts?.top ?? 0,
    };
  }));

  expect(overlaps.length).toBe(6);
  expect(overlaps.every(({ identityContentBottom, factsTop }) => identityContentBottom <= factsTop + 0.5)).toBe(true);
});

test('keeps Career vacancy CTAs on the readable action tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career vacancy CTA anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const buttons = await page.locator('.career-results .job-card .job-actions button').evaluateAll((elements) => elements.slice(0, 6).map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { fontSize: Number.parseFloat(style.fontSize), height: rect.height };
  }));

  expect(buttons.length).toBeGreaterThan(0);
  expect(buttons.every(({ fontSize, height }) => fontSize >= 11 && height >= 30)).toBe(true);
});

test('keeps the initial Career detail anchored to a visible selected vacancy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career selection anchor targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const selected = page.locator('.career-results .job-card.selected');
  await expect(selected).toHaveCount(1);
  const detailTitle = await page.locator('.career-detail .career-detail-title').innerText();
  await expect(selected).toContainText(detailTitle);
});

test('keeps the tall Career vacancy grid at the reference card rhythm', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career card-grid rhythm targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const geometry = await page.locator('.career-results .job-grid').evaluate((grid) => {
    const gridRect = grid.getBoundingClientRect();
    const results = grid.closest('.career-results');
    const resultsRect = results?.getBoundingClientRect();
    const resultsStyle = results ? getComputedStyle(results) : null;
    const contentRight = resultsRect ? resultsRect.right - Number.parseFloat(resultsStyle?.paddingRight ?? '0') : gridRect.right;
    const cards = Array.from(grid.querySelectorAll(':scope > .job-card')).slice(0, 3).map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      width: gridRect.width,
      rightInset: contentRight - (cards.at(-1)?.right ?? contentRight),
      cards,
      firstGap: cards[1] ? cards[1].left - cards[0].right : 0,
      secondGap: cards[2] ? cards[2].left - cards[1].right : 0,
    };
  });

  expect(geometry.cards).toHaveLength(3);
  expect(geometry.width).toBeGreaterThanOrEqual(690);
  expect(geometry.width).toBeLessThanOrEqual(700);
  expect(geometry.cards.every(({ width }) => width >= 218 && width <= 225)).toBe(true);
  expect(geometry.firstGap).toBeGreaterThanOrEqual(13);
  expect(geometry.firstGap).toBeLessThanOrEqual(16);
  expect(geometry.secondGap).toBeGreaterThanOrEqual(13);
  expect(geometry.secondGap).toBeLessThanOrEqual(16);
  expect(geometry.rightInset).toBeGreaterThanOrEqual(20);
  expect(geometry.rightInset).toBeLessThanOrEqual(28);
});

test('keeps Career vacancy facts on the readable metadata tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career vacancy metadata is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const facts = await page.locator('.career-results .job-card .job-fact').evaluateAll((elements) => elements.slice(0, 6).map((element) => {
    const icon = element.querySelector('.pixel-icon');
    return {
      fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
      iconSize: icon?.getBoundingClientRect().width ?? 0,
    };
  }));

  expect(facts.length).toBeGreaterThan(0);
  expect(facts.every(({ fontSize, iconSize }) => fontSize >= 11 && iconSize >= 13)).toBe(true);
});

test('keeps Career card facts and descriptions on the primary reading tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career card copy hierarchy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const typography = await page.locator('.career-results .job-card').evaluateAll((cards) => cards.slice(0, 6).map((card) => ({
    factFontSize: Number.parseFloat(getComputedStyle(card.querySelector('.job-fact')!).fontSize),
    descriptionFontSize: Number.parseFloat(getComputedStyle(card.querySelector('.job-card-description')!).fontSize),
  })));

  expect(typography.length).toBeGreaterThan(0);
  expect(typography.every(({ factFontSize, descriptionFontSize }) => factFontSize >= 12 && descriptionFontSize >= 13)).toBe(true);
});

test('keeps tall Career cards on a strong identity and action tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career card identity hierarchy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const typography = await page.locator('.career-results .job-card').evaluateAll((cards) => cards.slice(0, 6).map((card) => {
    const title = card.querySelector('.job-card-identity h2');
    const company = card.querySelector('.job-card-identity .job-company');
    const status = card.querySelector('.job-card-status strong');
    const cta = card.querySelector('.job-actions button');
    const ctaRect = cta?.getBoundingClientRect();
    return {
      titleFontSize: Number.parseFloat(getComputedStyle(title!).fontSize),
      companyFontSize: Number.parseFloat(getComputedStyle(company!).fontSize),
      statusFontSize: Number.parseFloat(getComputedStyle(status!).fontSize),
      ctaFontSize: Number.parseFloat(getComputedStyle(cta!).fontSize),
      ctaHeight: ctaRect?.height ?? 0,
    };
  }));

  expect(typography.length).toBe(6);
  expect(typography.every(({ titleFontSize, companyFontSize, statusFontSize, ctaFontSize, ctaHeight }) =>
    titleFontSize >= 17 && titleFontSize <= 19 && companyFontSize >= 11 && statusFontSize >= 11 && ctaFontSize >= 12 && ctaHeight >= 31
  )).toBe(true);
});

test('keeps Career support panels on the reference inverse surface split', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career support surface split is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const surfaces = await page.locator('.career-bottom-panel').evaluateAll((elements) => elements.map((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
  })));

  expect(surfaces).toHaveLength(4);
  expect(surfaces).toEqual([
    { background: 'rgb(9, 9, 9)', color: 'rgb(244, 244, 239)' },
    { background: 'rgb(9, 9, 9)', color: 'rgb(244, 244, 239)' },
    { background: 'rgb(9, 9, 9)', color: 'rgb(244, 244, 239)' },
    { background: 'rgb(12, 12, 12)', color: 'rgb(244, 244, 239)' },
  ]);
});

test('keeps empty Career support lanes readable inside dark shells', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career support lane surfaces are desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const lanes = await page.locator('.career-bottom-panel:nth-child(-n+3) > .career-bottom-empty').evaluateAll((elements) => elements.map((element) => {
    const icon = element.querySelector('.pixel-illustration');
    const strong = element.querySelector('strong');
    return {
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
      border: getComputedStyle(element).borderColor,
      iconColor: icon ? getComputedStyle(icon).color : '',
      strongColor: strong ? getComputedStyle(strong).color : '',
    };
  }));

  expect(lanes).toHaveLength(3);
  expect(lanes.every(({ background, color, border, iconColor, strongColor }) =>
    background === 'rgb(244, 244, 239)' &&
    color === 'rgb(34, 34, 34)' &&
    border === 'rgb(153, 153, 153)' &&
    iconColor === 'rgb(7, 7, 7)' &&
    strongColor === 'rgb(7, 7, 7)'
  )).toBe(true);
  await expect(page.locator('.career-bottom-insight')).toHaveCSS('background-color', 'rgb(12, 12, 12)');
});

test('keeps empty Career support copy in a compact horizontal status lane', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'career support empty-state anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const lanes = await page.locator('.career-bottom-panel:nth-child(-n+3) > .career-bottom-empty').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector('.pixel-illustration')?.getBoundingClientRect();
    const strong = element.querySelector('strong')?.getBoundingClientRect();
    const small = element.querySelector('small')?.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.split(' ').length,
      textAlign: style.textAlign,
      iconWidth: icon?.width ?? 0,
      iconHeight: icon?.height ?? 0,
      copyCenter: strong && small ? (strong.left + strong.width / 2 + small.left + small.width / 2) / 2 : 0,
      iconCenter: icon ? icon.left + icon.width / 2 : 0,
    };
  }));

  expect(lanes).toHaveLength(3);
  expect(lanes.every(({ columns, textAlign, iconWidth, iconHeight, copyCenter, iconCenter }) =>
    columns === 2 && textAlign === 'left' && iconWidth >= 30 && iconHeight >= 30 && Math.abs(copyCenter - iconCenter) <= 120
  )).toBe(true);
});

test('uses light inverse surfaces for populated Career support rows', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'populated Career support surfaces are desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.applications = [{
      applicationId: 'application.visual-career',
      vacancyId: 'vacancy.visual-career',
      jobId: 'job.seed-remote',
      companyId: 'company.xinghe',
      salaryRange: [80, 100],
      route: 'market',
      submittedDay: 1,
      resultDay: 2,
      status: 'offer',
      competitivenessTier: 'competitive',
      probabilityBand: 0.7,
      willReceiveOffer: true,
      feedback: ['条件符合岗位期待'],
      offerExpiresDay: 8,
    }];
    state.employmentHistory = [{ jobId: 'job.seed-warehouse', companyId: 'company.yuanwang', startedDay: 1, endedDay: 4, finalPay: 130 }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const surfaces = await page.locator('.career-bottom-panel:nth-child(-n+3):has(> .rail-rows)').evaluateAll((elements) => elements.map((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    headerBackground: getComputedStyle(element.querySelector('.inbox-head')!).backgroundColor,
    rowBackground: getComputedStyle(element.querySelector('.rail-rows')!).backgroundColor,
  })));

  expect(surfaces).toHaveLength(3);
  expect(surfaces.every(({ background, color, headerBackground, rowBackground }) =>
    background === 'rgb(9, 9, 9)' &&
    color === 'rgb(244, 244, 239)' &&
    headerBackground === 'rgb(9, 9, 9)' &&
    rowBackground === 'rgb(244, 244, 239)'
  )).toBe(true);

  const rowGeometry = await page.locator('.career-bottom-panel:nth-child(-n+3):has(> .rail-rows)').evaluateAll((elements) => elements.map((element) => {
    const rows = element.querySelector<HTMLElement>('.rail-rows')!;
    const item = rows.querySelector<HTMLElement>('li')!;
    const rowsRect = rows.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    return {
      itemHeight: itemRect.height,
      rowsHeight: rowsRect.height,
      centerOffset: Math.abs((itemRect.top + itemRect.height / 2) - (rowsRect.top + rowsRect.height / 2)),
    };
  }));

  expect(rowGeometry.every(({ itemHeight, rowsHeight, centerOffset }) =>
    itemHeight < rowsHeight - 20 && centerOffset <= 2
  )).toBe(true);
});

test('keeps the selected Career card frame brighter than idle cards', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career card frame contrast is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const frames = await page.locator('.career-results .job-card').evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card, '::after');
    return {
      selected: card.classList.contains('selected'),
      borderColor: style.borderTopColor,
      clipPath: style.clipPath,
    };
  }));

  expect(frames.length).toBeGreaterThan(1);
  expect(frames.filter(({ selected }) => selected)).toHaveLength(1);
  expect(frames.find(({ selected }) => selected)?.borderColor).toBe('rgb(244, 244, 239)');
  expect(frames.filter(({ selected }) => !selected).every(({ borderColor, clipPath }) =>
    borderColor === 'rgb(199, 199, 192)' && clipPath !== 'none'
  )).toBe(true);
});

test('keeps Career vacancy surfaces on the shared stepped outer frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career card silhouettes are desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const frames = await page.locator('.career-results .job-card').evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card);
    return { borderWidth: style.borderTopWidth, clipPath: style.clipPath };
  }));

  expect(frames.length).toBeGreaterThan(1);
  expect(frames.every(({ borderWidth, clipPath }) => borderWidth === '1px' && clipPath !== 'none')).toBe(true);
});

test('keeps tall Career support panels above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Career footer boundary targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const geometry = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.career-bottom-panel'));
    const footer = document.querySelector<HTMLElement>('.persistent-status');
    return {
      panelHeight: panels[0]?.getBoundingClientRect().height ?? 0,
      panelBottom: Math.max(...panels.map((panel) => panel.getBoundingClientRect().bottom)),
      footerTop: footer?.getBoundingClientRect().top ?? 0,
    };
  });

  expect(geometry.panelHeight).toBeGreaterThanOrEqual(160);
  expect(geometry.panelHeight).toBeLessThanOrEqual(170);
  expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.footerTop - 4);
});

test('keeps the low-height Career pager above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop footer boundary is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const geometry = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.main-content');
    const footer = document.querySelector<HTMLElement>('.persistent-status');
    const grid = document.querySelector<HTMLElement>('.career-results .job-grid');
    const pager = document.querySelector<HTMLElement>('.career-results .pager-row');
    const mainRect = main?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    const pagerRect = pager?.getBoundingClientRect();
    return {
      mainBottom: mainRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
      gridBottom: gridRect?.bottom ?? 0,
      pagerTop: pagerRect?.top ?? 0,
      pagerBottom: pagerRect?.bottom ?? 0,
      scrollHeight: main?.scrollHeight ?? 0,
      clientHeight: main?.clientHeight ?? 0,
    };
  });

  expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.mainBottom - 0.5);
  expect(geometry.gridBottom).toBeLessThanOrEqual(geometry.pagerTop + 0.5);
  expect(geometry.pagerBottom).toBeLessThanOrEqual(geometry.mainBottom + 0.5);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
});

test('uses the installed pixel console face for high-signal display headings', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'display font tier is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const fontFamily = await page.locator('.career-results .job-card .card-select h2').first().evaluate((heading) =>
    getComputedStyle(heading).fontFamily
  );

  expect(fontFamily).toContain('MS Gothic');
});

test('keeps Shop product metadata and secondary actions in the readable pixel tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop product-card anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const cards = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const art = card.querySelector('.card-art');
    const illustration = card.querySelector('.card-art .pixel-illustration');
    const facts = card.querySelector('.catalog-facts > div');
    const secondary = card.querySelector('.catalog-secondary-action');
    const primary = card.querySelector('.item-card-foot .primary-button');
    const factStyle = facts ? getComputedStyle(facts) : null;
    const primaryStyle = primary ? getComputedStyle(primary) : null;
    const cardRect = card.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      artWidth: art?.getBoundingClientRect().width ?? 0,
      artHeight: art?.getBoundingClientRect().height ?? 0,
      illustrationWidth: illustration?.getBoundingClientRect().width ?? 0,
      illustrationHeight: illustration?.getBoundingClientRect().height ?? 0,
      factFontSize: factStyle ? Number.parseFloat(factStyle.fontSize) : 0,
      secondaryWidth: secondary?.getBoundingClientRect().width ?? 0,
      secondaryHeight: secondary?.getBoundingClientRect().height ?? 0,
      hasPixelIcon: Boolean(secondary?.querySelector('.pixel-icon')),
      primaryFontSize: primaryStyle ? Number.parseFloat(primaryStyle.fontSize) : 0,
      primaryHeight: primary?.getBoundingClientRect().height ?? 0,
    };
  }));

  expect(cards.length).toBeGreaterThan(0);
  expect(cards.every(({ cardHeight, artWidth, artHeight, illustrationWidth, illustrationHeight, factFontSize, secondaryWidth, secondaryHeight, hasPixelIcon, primaryFontSize, primaryHeight }) =>
    cardHeight >= 150 && artWidth >= 64 && artHeight >= 64 && illustrationWidth >= 60 && illustrationHeight >= 60 &&
    factFontSize >= 10 && secondaryWidth >= 18 && secondaryHeight >= 18 && hasPixelIcon && primaryFontSize >= 11 && primaryHeight >= 25
  )).toBe(true);
});

test('keeps Shop product goal actions as labeled pixel affordances', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop product-card goal action is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const actions = await page.locator('.view-shop .shop-main .item-card .catalog-secondary-action').evaluateAll((buttons) => buttons.slice(0, 4).map((button) => ({
    text: button.textContent?.trim() ?? '',
    hasPixelIcon: Boolean(button.querySelector('.pixel-icon')),
    width: button.getBoundingClientRect().width,
  })));

  expect(actions.length).toBeGreaterThan(0);
  expect(actions.every(({ text, hasPixelIcon, width }) => text.includes('加入目标') && hasPixelIcon && width >= 18 && width <= 24)).toBe(true);
});

test('keeps Shop product CTAs in the reference icon-plus-label anatomy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop product-card CTA anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const ctas = await page.locator('.view-shop .shop-main .item-card .item-card-foot .primary-button').evaluateAll((items) => items.slice(0, 4).map((button) => {
    const icon = button.querySelector('.pixel-icon');
    const iconRect = icon?.getBoundingClientRect();
    return {
      text: button.textContent?.trim() ?? '',
      hasPixelIcon: Boolean(icon),
      iconWidth: iconRect?.width ?? 0,
      iconHeight: iconRect?.height ?? 0,
      iconHidden: icon?.getAttribute('aria-hidden') === 'true',
    };
  }));

  expect(ctas.length).toBeGreaterThan(0);
  expect(ctas.every(({ text, hasPixelIcon, iconWidth, iconHeight, iconHidden }) =>
    text.includes('加入清单') && hasPixelIcon && iconWidth >= 10 && iconHeight >= 10 && iconHidden
  )).toBe(true);
});

test('keeps Shop product facts and primary CTA above the tiny web-copy tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop product-card typography is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const typography = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const fact = card.querySelector('.catalog-facts > div');
    const primary = card.querySelector('.item-card-foot .primary-button');
    return {
      factFontSize: fact ? Number.parseFloat(getComputedStyle(fact).fontSize) : 0,
      primaryFontSize: primary ? Number.parseFloat(getComputedStyle(primary).fontSize) : 0,
    };
  }));

  expect(typography.length).toBeGreaterThan(0);
  expect(typography.every(({ factFontSize, primaryFontSize }) =>
    factFontSize >= 11 && primaryFontSize >= 12
  )).toBe(true);
});

test('keeps Shop product titles on the primary catalog tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop product title hierarchy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const typography = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const title = card.querySelector('.catalog-title-row h2');
    const price = card.querySelector('.catalog-price');
    return {
      titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      priceFontSize: price ? Number.parseFloat(getComputedStyle(price).fontSize) : 0,
    };
  }));

  expect(typography.length).toBeGreaterThan(0);
  expect(typography.every(({ titleFontSize, priceFontSize }) => titleFontSize >= 17 && priceFontSize >= 13)).toBe(true);
});

test('keeps Shop product identity on one first-scan row', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop product identity anatomy is desktop-only');
  for (const viewport of [{ width: 1440, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: '商店', exact: true }).click();
    for (const section of [
      { tabName: '商品', cardSelector: '.item-card', titleSelector: '.catalog-title-row h2' },
      { tabName: '娱乐', cardSelector: '.activity-card', titleSelector: '.catalog-title-row h3' },
    ]) {
      await page.getByRole('tab', { name: section.tabName, exact: true }).click();
      const rows = await page.locator(`.view-shop .shop-main ${section.cardSelector}`).evaluateAll((items, titleSelector) => items.slice(0, 4).map((card) => {
        const badge = card.querySelector('.catalog-badge')?.getBoundingClientRect();
        const title = card.querySelector(titleSelector)?.getBoundingClientRect();
        const price = card.querySelector('.catalog-price')?.getBoundingClientRect();
        const status = card.querySelector('.catalog-card-status')?.getBoundingClientRect();
        const tops = [badge?.top, title?.top, price?.top, status && status.width > 0 && status.height > 0 ? status.top : undefined]
          .filter((value): value is number => value !== undefined);
        return {
          topSpread: tops.length ? Math.max(...tops) - Math.min(...tops) : Number.POSITIVE_INFINITY,
          titleWidth: title?.width ?? 0,
          priceWidth: price?.width ?? 0,
        };
      }), section.titleSelector);

      expect(rows).toHaveLength(4);
      expect(rows.every(({ topSpread, titleWidth, priceWidth }) => topSpread <= 5 && titleWidth > 0 && priceWidth > 0)).toBe(true);
    }
  }
});

test('gives Shop product cards a stronger reference reading tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop product reading hierarchy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const typography = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const title = card.querySelector('.catalog-title-row h2');
    const price = card.querySelector('.catalog-price');
    const fact = card.querySelector('.catalog-facts > div');
    const primary = card.querySelector('.item-card-foot .primary-button');
    return {
      titleFontSize: title ? Number.parseFloat(getComputedStyle(title).fontSize) : 0,
      priceFontSize: price ? Number.parseFloat(getComputedStyle(price).fontSize) : 0,
      factFontSize: fact ? Number.parseFloat(getComputedStyle(fact).fontSize) : 0,
      primaryFontSize: primary ? Number.parseFloat(getComputedStyle(primary).fontSize) : 0,
    };
  }));

  expect(typography.length).toBeGreaterThan(0);
  expect(typography.every(({ titleFontSize, priceFontSize, factFontSize, primaryFontSize }) =>
    titleFontSize >= 18 && priceFontSize >= 14 && factFontSize >= 12 && primaryFontSize >= 12
  )).toBe(true);
});

test('keeps the selected Shop product frame brighter than idle cards', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Shop product frame contrast is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const frames = await page.locator('.view-shop .shop-main .item-card').evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card, '::after');
    return {
      selected: card.classList.contains('selected'),
      borderColor: style.borderTopColor,
      clipPath: style.clipPath,
    };
  }));

  expect(frames.length).toBeGreaterThan(1);
  expect(frames.filter(({ selected }) => selected)).toHaveLength(1);
  expect(frames.find(({ selected }) => selected)?.borderColor).toBe('rgb(244, 244, 239)');
  expect(frames.filter(({ selected }) => !selected).every(({ borderColor, clipPath }) =>
    borderColor === 'rgb(199, 199, 192)' && clipPath !== 'none'
  )).toBe(true);
});

test('keeps Shop Entertainment cards on the Goods card and action tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop entertainment-card anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();
  await expect(page.getByRole('heading', { name: '娱乐与生活活动', exact: true })).toBeHidden();

  const cards = await page.locator('.view-shop .shop-main .activity-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const art = card.querySelector('.card-art');
    const titleRow = card.querySelector('.catalog-title-row');
    const fact = card.querySelector('.catalog-facts > div');
    const cta = card.querySelector('.secondary-button');
    const cardRect = card.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const titleRect = titleRow?.getBoundingClientRect();
    const ctaRect = cta?.getBoundingClientRect();
    return {
      cardHeight: cardRect.height,
      artWidth: artRect?.width ?? 0,
      artHeight: artRect?.height ?? 0,
      factFontSize: fact ? Number.parseFloat(getComputedStyle(fact).fontSize) : 0,
      ctaFontSize: cta ? Number.parseFloat(getComputedStyle(cta).fontSize) : 0,
      ctaWidth: ctaRect?.width ?? 0,
      cardWidth: cardRect.width,
      contentWidth: titleRect?.width ?? 0,
      meterRows: card.querySelectorAll('.catalog-meter-row').length,
    };
  }));

  expect(cards.length).toBeGreaterThan(0);
  expect(cards.every(({ cardHeight, artWidth, artHeight, factFontSize, ctaFontSize, ctaWidth, cardWidth, contentWidth, meterRows }) =>
    cardHeight >= 150 && artWidth >= 54 && artHeight >= 54 &&
    factFontSize >= 11 && ctaFontSize >= 11 && ctaWidth >= cardWidth - 18 && contentWidth > 0 && meterRows === 0
  )).toBe(true);
});

test('keeps a real selected activity detail visible when switching Shop tabs', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop activity detail anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();

  await expect(page.locator('.view-shop .shop-detail')).toBeVisible();
  const anatomy = await page.evaluate(() => {
    const selected = document.querySelectorAll('.view-shop .shop-main .activity-card.selected');
    const grid = document.querySelector('.view-shop .shop-main .activity-grid');
    const detail = document.querySelector('.view-shop .shop-detail');
    const detailRect = detail?.getBoundingClientRect();
    return {
      selectedCount: selected.length,
      detailLabel: detail?.querySelector('.eyebrow')?.textContent?.trim() ?? '',
      detailTop: detailRect?.top ?? 0,
      gridBottom: grid?.getBoundingClientRect().bottom ?? 0,
      detailHeight: detailRect?.height ?? 0,
    };
  });

  expect(anatomy.selectedCount).toBe(1);
  expect(anatomy.detailLabel).toBe('已选活动');
  expect(anatomy.detailTop).toBeGreaterThan(anatomy.gridBottom);
  expect(anatomy.detailHeight).toBeGreaterThanOrEqual(100);
});

test('keeps Shop Entertainment CTA inside the card at low-height desktop', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop layout is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();

  const layout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.activity-card')).slice(0, 4).map((card) => {
      const cardRect = card.getBoundingClientRect();
      const ctaRect = card.querySelector('.secondary-button')?.getBoundingClientRect();
      return { ctaBottom: ctaRect?.bottom ?? 0, cardBottom: cardRect.bottom };
    });
    const main = document.querySelector('.main-content')?.getBoundingClientRect();
    const footer = document.querySelector('.persistent-status')?.getBoundingClientRect();
    return {
      cards,
      mainBottom: main?.bottom ?? 0,
      footerTop: footer?.top ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  expect(layout.cards.length).toBeGreaterThan(0);
  expect(layout.cards.every(({ ctaBottom, cardBottom }) => ctaBottom <= cardBottom + 0.5)).toBe(true);
  expect(layout.footerTop).toBeGreaterThanOrEqual(layout.mainBottom - 0.5);
  expect(layout.horizontalOverflow).toBe(false);
});

test('keeps Shop product CTAs across the full card frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop product-card anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const ctas = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const footer = card.querySelector('.item-card-foot');
    const cardRect = card.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const style = footer ? getComputedStyle(footer) : null;
    return {
      cardWidth: cardRect.width,
      footerWidth: footerRect?.width ?? 0,
      leftInset: footerRect ? footerRect.left - cardRect.left : 0,
      rightInset: footerRect ? cardRect.right - footerRect.right : 0,
      footerTop: footerRect?.top ?? 0,
      footerBottom: footerRect?.bottom ?? 0,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      gridColumn: style?.gridColumn ?? '',
    };
  }));

  expect(ctas.length).toBeGreaterThan(0);
  expect(ctas.every(({ cardWidth, footerWidth, leftInset, rightInset, footerTop, footerBottom, cardTop, cardBottom, gridColumn }) =>
    gridColumn === '1 / -1' && footerWidth >= cardWidth - 22 && leftInset <= 11 && rightInset <= 11 &&
    footerTop > cardTop + (cardBottom - cardTop) / 2 && footerBottom <= cardBottom + 0.5
  )).toBe(true);
});

test('shows the pending settlement mode in the top status while the ceremony is open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  await expect(page.locator('.status-clock .status-clock-copy > small')).toHaveText('月结待确认');
  const settlementHud = await page.evaluate(() => {
    const topbar = document.querySelector<HTMLElement>('.topbar');
    const brand = document.querySelector<HTMLElement>('.brand-mark');
    const style = topbar ? getComputedStyle(topbar) : null;
    const brandStyle = brand ? getComputedStyle(brand) : null;
    return {
      position: style?.position ?? '',
      zIndex: style?.zIndex ?? '',
      opacity: style?.opacity ?? '',
      filter: style?.filter ?? '',
      brandColor: brandStyle?.color ?? '',
    };
  });
  expect(settlementHud).toEqual(expect.objectContaining({
    position: 'relative',
    zIndex: '21',
    opacity: '1',
    filter: 'none',
    brandColor: 'rgb(255, 255, 255)',
  }));

  const settlementCopy = await page.locator('.monthly-summary.fullframe').innerText();
  expect(settlementCopy).not.toMatch(/\b[A-Za-z]+(?:_[A-Za-z0-9-]+)+\b/);
});

test('keeps the tall Settlement board separated from its compact HUD', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'tall Settlement frame geometry targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const geometry = await page.evaluate(() => {
    const read = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
    const topbar = read('.topbar');
    const frame = read('.monthly-summary.fullframe');
    const title = read('.monthly-summary.fullframe .settle-title-wrap');
    const grid = read('.monthly-summary.fullframe .settle-grid');
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.monthly-summary.fullframe .settle-grid > .settle-panel, .monthly-summary.fullframe .settle-grid > .settle-result-column')).map((element) => element.getBoundingClientRect());
    return {
      topbarHeight: topbar?.height ?? 0,
      hudToFrameGap: (frame?.top ?? 0) - (topbar?.bottom ?? 0),
      frameLeft: frame?.left ?? 0,
      frameRight: frame?.right ?? 0,
      frameWidth: frame?.width ?? 0,
      gridLeft: grid?.left ?? 0,
      gridRight: grid?.right ?? 0,
      panelGaps: panels.slice(1).map((panel, index) => panel.left - panels[index].right),
      titleTop: title?.top ?? 0,
      gridTop: grid?.top ?? 0,
      frameBottom: frame?.bottom ?? 0,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });

  expect(geometry.topbarHeight).toBeGreaterThanOrEqual(90);
  expect(geometry.topbarHeight).toBeLessThanOrEqual(98);
  expect(geometry.hudToFrameGap).toBeGreaterThanOrEqual(14);
  expect(geometry.hudToFrameGap).toBeLessThanOrEqual(24);
  expect(geometry.hudToFrameGap).toBeLessThanOrEqual(16);
  expect(geometry.frameLeft).toBeLessThanOrEqual(8);
  expect(geometry.frameRight).toBeGreaterThanOrEqual(1432);
  expect(geometry.frameWidth).toBeGreaterThanOrEqual(1424);
  expect(geometry.gridLeft).toBeGreaterThanOrEqual(36);
  expect(geometry.gridRight).toBeLessThanOrEqual(1404);
  expect(geometry.panelGaps.every((gap) => gap >= 12)).toBe(true);
  expect(geometry.titleTop).toBeGreaterThanOrEqual(124);
  expect(geometry.titleTop).toBeLessThanOrEqual(138);
  expect(geometry.gridTop).toBeGreaterThanOrEqual(224);
  expect(geometry.gridTop).toBeLessThanOrEqual(236);
  expect(geometry.frameBottom).toBeGreaterThanOrEqual(1040);
  expect(geometry.bodyWidth).toBe(geometry.viewportWidth);
});

test('lets the tall Settlement frame use the reference bottom edge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'tall Settlement frame footprint targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const frameBottom = await page.locator('.monthly-summary.fullframe').evaluate((element) => element.getBoundingClientRect().bottom);
  expect(frameBottom).toBeGreaterThanOrEqual(1068);
  expect(frameBottom).toBeLessThanOrEqual(1078);
});

test('gives the Settlement net-worth Hero value a primary reading tier', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'Settlement Hero typography targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const geometry = await page.locator('.monthly-summary.fullframe .settle-result-inverse').evaluate((element) => {
    const big = element.querySelector<HTMLElement>('.settle-big');
    const range = element.querySelector<HTMLElement>('.settle-range');
    const bigRect = big?.getBoundingClientRect();
    const rangeRect = range?.getBoundingClientRect();
    return {
      fontSize: Number.parseFloat(getComputedStyle(big!).fontSize),
      height: bigRect?.height ?? 0,
      bigBottom: bigRect?.bottom ?? 0,
      rangeTop: rangeRect?.top ?? 0,
    };
  });

  expect(geometry.fontSize).toBeGreaterThanOrEqual(60);
  expect(geometry.height).toBeGreaterThanOrEqual(60);
  expect(geometry.rangeTop).toBeGreaterThanOrEqual(geometry.bigBottom);
});

test('keeps visible Settlement copy free of internal identifiers', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement copy audit targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const visibleCopy = await page.locator('.monthly-summary.fullframe').innerText();
  expect(visibleCopy).not.toMatch(/[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*/);
  expect(visibleCopy).not.toContain('sourceId');
  expect(visibleCopy).not.toContain('pendingReward');
});

test('keeps Shop catalog art on the open 1-bit illustration tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop catalog-art anatomy is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const art = await page.locator('.view-shop .shop-main .item-card').evaluateAll((items) => items.slice(0, 4).map((card) => {
    const frame = card.querySelector('.card-art');
    const illustration = card.querySelector('.card-art .pixel-illustration');
    const frameStyle = frame ? getComputedStyle(frame) : null;
    return {
      background: frameStyle?.backgroundColor ?? '',
      topBorder: frameStyle?.borderTopStyle ?? '',
      rightBorder: frameStyle?.borderRightStyle ?? '',
      illustrationSize: illustration?.getBoundingClientRect().width ?? 0,
    };
  }));

  expect(art.length).toBeGreaterThan(0);
  expect(art.every(({ background, topBorder, rightBorder, illustrationSize }) =>
    background === 'rgba(0, 0, 0, 0)' && topBorder === 'none' && rightBorder === 'dotted' && illustrationSize >= 52
  )).toBe(true);
});

test('keeps the breakfast voucher visually distinct from meal products', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shop semantic-art assertion is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const voucherCard = page.locator('.view-shop .shop-main .item-card').filter({ hasText: '早餐券' });
  await expect(voucherCard).toHaveCount(1);
  await expect(voucherCard.locator('.pixel-illustration.il-voucher')).toHaveCount(1);
});

test('keeps low-height life content scrollable above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop footer boundary is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });

  const main = page.locator('.main-content');
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight - element.clientHeight; });
  await page.waitForTimeout(80);

  const geometry = await page.evaluate(() => {
    const content = document.querySelector('.main-content');
    const planner = document.querySelector('.planner');
    const footer = document.querySelector('.persistent-status');
    const plannerRect = planner?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      scrollTop: content?.scrollTop ?? 0,
      plannerBottom: plannerRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
    };
  });

  expect(geometry.scrollTop).toBeGreaterThan(0);
  expect(geometry.plannerBottom).toBeLessThanOrEqual(geometry.footerTop);
});

test('keeps the low-height Life weekly planner fully above the persistent footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height desktop planner fit is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const geometry = await page.evaluate(() => {
    const planner = document.querySelector('.view-life .planner');
    const footer = document.querySelector('.persistent-status');
    const plannerRect = planner?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.view-life .planner-row')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    });
    const actions = document.querySelector('.view-life .planner-actions');
    const actionRect = actions?.getBoundingClientRect();
    const actionButton = actions?.querySelector('button');
    const actionButtonRect = actionButton?.getBoundingClientRect();
    const cells = [...document.querySelectorAll('.view-life .planner-row .plan-cell')].map((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    return {
      plannerBottom: plannerRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
      rowCount: rows.length,
      rows,
      actionsBottom: actionRect?.bottom ?? 0,
      actionButtonBottom: actionButtonRect?.bottom ?? 0,
      cells,
    };
  });

  expect(geometry.rowCount).toBe(2);
  expect(geometry.plannerBottom).toBeLessThanOrEqual(geometry.footerTop - 8);
  expect(geometry.rows.every(({ bottom, clientHeight, scrollHeight }) => bottom <= geometry.plannerBottom + 1 && scrollHeight <= clientHeight + 1)).toBe(true);
  expect(geometry.actionsBottom).toBeLessThanOrEqual(geometry.plannerBottom + 1);
  expect(geometry.actionButtonBottom).toBeLessThanOrEqual(geometry.actionsBottom + 1);
  expect(geometry.cells.every(({ clientHeight, scrollHeight }) => scrollHeight <= clientHeight + 1)).toBe(true);
});

test('keeps the Life forecast attribute rows on the readable pixel tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'forecast attribute tier is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const rows = await page.locator('.view-life .forecast-attr').evaluateAll((elements) => elements.map((element) => {
    const row = element.getBoundingClientRect();
    const label = element.querySelector(':scope > span:not(.forecast-sub)');
    const icon = element.querySelector('.pixel-icon');
    return {
      rowHeight: row.height,
      labelFontSize: label ? Number.parseFloat(getComputedStyle(label).fontSize) : 0,
      iconSize: icon?.getBoundingClientRect().width ?? 0,
    };
  }));

  expect(rows.length).toBe(5);
  expect(rows.every(({ rowHeight, labelFontSize, iconSize }) => rowHeight >= 22 && labelFontSize >= 11 && iconSize >= 14)).toBe(true);
});

test('keeps Life forecast meters on the ten-step reference scale', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'forecast meter scale targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const meters = await page.locator('.view-life .forecast-attr .segment-meter').evaluateAll((elements) => elements.map((element) => ({
    segments: element.querySelectorAll('i').length,
    ariaMax: element.getAttribute('aria-valuemax'),
  })));

  expect(meters).toHaveLength(5);
  expect(meters.every(({ segments, ariaMax }) => segments === 10 && ariaMax === '100')).toBe(true);
});

test('keeps the weekly planner utility row compact without removing its controls', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'planner utility density is desktop-only');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const utilities = page.locator('.life-planning-section .planner-actions');
  await expect(utilities).toBeVisible();
  const geometry = await utilities.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    buttonHeight: element.querySelector('button')?.getBoundingClientRect().height ?? 0,
  }));

  expect(geometry.height).toBeLessThanOrEqual(32);
  expect(geometry.buttonHeight).toBeGreaterThanOrEqual(22);
  await expect(utilities.getByRole('checkbox', { name: '自动重复计划' })).toBeVisible();
  await expect(utilities.getByText(/预计/)).toBeVisible();
});

test('keeps settlement achievement copy inside cards at low-height desktop', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 720 });
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const bounds = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection)').evaluateAll((cards) => cards.map((card) => {
    const frame = card.getBoundingClientRect();
    const content = [...card.querySelectorAll('h3, .highlight-description, small')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    return { frame: { top: frame.top, bottom: frame.bottom }, content };
  }));

  expect(bounds).toHaveLength(5);
  expect(bounds.every(({ frame, content }) => content.every(({ top, bottom }) => top >= frame.top && bottom <= frame.bottom))).toBe(true);
});

test('keeps the low-height settlement highlights row free of a dead band', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height settlement framing targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const layout = await page.locator('.monthly-summary.fullframe .settle-highlights').evaluate((element) => {
    const section = element.getBoundingClientRect();
    const heading = element.querySelector('.settle-highlights-head')?.getBoundingClientRect();
    const row = element.querySelector('.highlight-row')?.getBoundingClientRect();
    return {
      sectionHeight: section.height,
      headingHeight: heading?.height ?? 0,
      headingBottom: heading?.bottom ?? 0,
      rowTop: row?.top ?? 0,
      rowBottom: row?.bottom ?? 0,
      sectionBottom: section.bottom,
    };
  });

  expect(layout.headingHeight).toBeLessThanOrEqual(24);
  expect(layout.rowTop - layout.headingBottom).toBeLessThanOrEqual(8);
  expect(layout.sectionBottom - layout.rowBottom).toBeLessThanOrEqual(2);
  expect(layout.sectionHeight).toBeGreaterThanOrEqual(200);
});

test('keeps settlement footer attributes in one readable desktop row', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'footer row assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const attrs = await page.locator('.monthly-summary.fullframe .settle-attrs > div').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    const label = item.querySelector('dt')?.getBoundingClientRect();
    const meter = item.querySelector('.segment-meter i')?.getBoundingClientRect();
    return { top: rect.top, labelHeight: label?.height ?? 0, meterHeight: meter?.height ?? 0, segmentCount: item.querySelectorAll('.segment-meter i').length };
  }));

  expect(attrs).toHaveLength(6);
  expect(new Set(attrs.map(({ top }) => Math.round(top))).size).toBe(1);
  expect(attrs.every(({ labelHeight, meterHeight, segmentCount }) => labelHeight >= 14 && meterHeight >= 9 && segmentCount === 6)).toBe(true);
});

test('keeps the tall Settlement footer above the micro-copy tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'tall settlement footer typography targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const typography = await page.locator('.monthly-summary.fullframe .settle-footer').evaluate((footer) => ({
    summaryFontSize: Number.parseFloat(getComputedStyle(footer.querySelector<HTMLElement>('.settle-foot-text')!).fontSize),
    attrs: Array.from(footer.querySelectorAll<HTMLElement>('.settle-attrs > div')).map((item) => ({
      labelFontSize: Number.parseFloat(getComputedStyle(item.querySelector<HTMLElement>('dt')!).fontSize),
      valueFontSize: Number.parseFloat(getComputedStyle(item.querySelector<HTMLElement>('b')!).fontSize),
      meterHeight: Number.parseFloat(getComputedStyle(item.querySelector<HTMLElement>('.segment-meter i')!).height),
    })),
  }));

  expect(typography.summaryFontSize).toBeGreaterThanOrEqual(12);
  expect(typography.attrs).toHaveLength(6);
  expect(typography.attrs.every(({ labelFontSize, valueFontSize, meterHeight }) =>
    labelFontSize >= 12.5 && valueFontSize >= 13 && meterHeight >= 11
  )).toBe(true);
});

test('keeps tall settlement ledger rows in the readable reference tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'tall settlement ledger typography targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const typography = await page.locator('.monthly-summary.fullframe .settle-panel').evaluateAll((panels) => panels.map((panel) => ({
    headingFontSize: Number.parseFloat(getComputedStyle(panel.querySelector<HTMLElement>('h3')!).fontSize),
    rows: Array.from(panel.querySelectorAll<HTMLElement>('.settle-rows li')).map((row) => ({
      fontSize: Number.parseFloat(getComputedStyle(row).fontSize),
      iconWidth: row.querySelector<HTMLElement>('.pixel-icon')?.getBoundingClientRect().width ?? null,
      amountFontSize: Number.parseFloat(getComputedStyle(row.querySelector<HTMLElement>('b')!).fontSize),
    })),
  })));

  expect(typography.every(({ headingFontSize, rows }) =>
    headingFontSize >= 15 && rows.every(({ fontSize, iconWidth, amountFontSize }) =>
      fontSize >= 13 && (iconWidth === null || iconWidth >= 18) && amountFontSize >= 13
    )
  )).toBe(true);
});

test('keeps the Settlement advance CTA in the reference arrow-label anatomy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'tall settlement CTA anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const cta = page.locator('.monthly-summary.fullframe .settle-continue');
  const anatomy = await cta.evaluate((button) => {
    const icon = button.querySelector('.pixel-icon');
    const rect = icon?.getBoundingClientRect();
    return {
      text: button.textContent?.trim() ?? '',
      hasPixelIcon: Boolean(icon),
      iconWidth: rect?.width ?? 0,
      iconHeight: rect?.height ?? 0,
      iconHidden: icon?.getAttribute('aria-hidden') === 'true',
    };
  });

  expect(anatomy.text).toContain('进入下个月');
  expect(anatomy.hasPixelIcon).toBe(true);
  expect(anatomy.iconWidth).toBeGreaterThanOrEqual(12);
  expect(anatomy.iconHeight).toBeGreaterThanOrEqual(12);
  expect(anatomy.iconHidden).toBe(true);
});

test('keeps the Settlement footer summary and attribute rail stacked beside the primary CTA', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'footer anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const layout = await page.locator('.monthly-summary.fullframe .settle-footer').evaluate((footer) => {
    const rect = (selector: string) => {
      const element = footer.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const summary = footer.closest<HTMLElement>('.monthly-summary.fullframe')?.getBoundingClientRect();
    const cta = rect('.settle-continue');
    return {
      text: rect('.settle-foot-text'),
      attrs: rect('.settle-attrs'),
      cta,
      ctaRightInset: summary && cta ? summary.right - cta.x - cta.width : null,
    };
  });

  expect(layout.text).not.toBeNull();
  expect(layout.attrs).not.toBeNull();
  expect(layout.cta).not.toBeNull();
  expect(Math.abs((layout.text?.x ?? 0) - (layout.attrs?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(layout.attrs?.y ?? 0).toBeGreaterThan((layout.text?.y ?? 0) + (layout.text?.height ?? 0) - 2);
  expect(layout.cta?.x ?? 0).toBeGreaterThan((layout.attrs?.x ?? 0) + (layout.attrs?.width ?? 0));
  expect(layout.cta?.y ?? 0).toBeLessThanOrEqual((layout.text?.y ?? 0) + 2);
  expect((layout.cta?.y ?? 0) + (layout.cta?.height ?? 0)).toBeGreaterThanOrEqual((layout.attrs?.y ?? 0) - 2);
  expect(layout.ctaRightInset ?? 0).toBeGreaterThanOrEqual(36);
});

test('keeps settlement financial panels in the reference proportion', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement panel proportions target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const widths = await page.locator('.monthly-summary.fullframe .settle-grid > .settle-panel, .monthly-summary.fullframe .settle-grid > .settle-result-column').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().width));

  expect(widths).toHaveLength(4);
  const [income, expense, allocation, result] = widths;
  expect(income / expense).toBeGreaterThan(1.02);
  expect(allocation / expense).toBeLessThan(0.93);
  expect(result / expense).toBeGreaterThan(1.32);
});

test('keeps settlement totals as outlined readouts on black panels', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement total contrast targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const totals = await page.locator('.monthly-summary.fullframe .settle-panel .metric-box').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderTopStyle, borderColor: style.borderTopColor };
  }));

  expect(totals).toHaveLength(2);
  expect(totals.every(({ background, color, border, borderColor }) =>
    background === 'rgb(9, 9, 9)' && color === 'rgb(244, 244, 239)' && border === 'solid' && borderColor === 'rgb(244, 244, 239)'
  )).toBe(true);
});

test('keeps settlement NEW ribbons as stepped corner flags at low height', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement achievement flags target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const ribbon = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection) .new-ribbon').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: style.left, clipPath: style.clipPath, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height };
  });

  expect(ribbon.left).toBe('-1px');
  expect(ribbon.clipPath).toContain('polygon');
  expect(ribbon.width).toBeGreaterThanOrEqual(28);
  expect(ribbon.height).toBeGreaterThanOrEqual(18);
});

test('keeps settlement allocation meters legible on the black board', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement allocation contrast targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const meters = await page.locator('.monthly-summary.fullframe .settle-rows.alloc .segment-meter').evaluateAll((items) => items.map((meter) => {
    const cells = [...meter.querySelectorAll('i')];
    return {
      cellCount: cells.length,
      emptyCells: cells.filter((cell) => !cell.classList.contains('filled')).map((cell) => {
        const style = getComputedStyle(cell);
        return { background: style.backgroundColor, border: style.borderTopColor, height: cell.getBoundingClientRect().height };
      }),
    };
  }));

  expect(meters.length).toBeGreaterThanOrEqual(4);
  expect(meters.every(({ cellCount, emptyCells }) => cellCount === 10 && emptyCells.length > 0 && emptyCells.every(({ background, border, height }) => {
    const channels = background.match(/\d+/g)?.map(Number) ?? [];
    const borderChannels = border.match(/\d+/g)?.map(Number) ?? [];
    return height >= 8 && channels[0] >= 56 && channels[1] >= 56 && channels[2] >= 56 && borderChannels[0] >= 110;
  }))).toBe(true);
});

test('keeps Settlement allocation meters on the readable segment tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement allocation meter tier targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const cells = await page.locator('.monthly-summary.fullframe .settle-rows.alloc .segment-meter i').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      filled: element.classList.contains('filled'),
      height: element.getBoundingClientRect().height,
      background: style.backgroundColor,
      border: style.borderTopColor,
    };
  }));

  expect(cells.length).toBeGreaterThan(0);
  expect(cells.every(({ filled, height, background, border }) =>
    height >= 9 && (filled
      ? background === 'rgb(244, 244, 239)' && border === 'rgb(244, 244, 239)'
      : background === 'rgb(68, 68, 64)' && border === 'rgb(153, 153, 144)')
  )).toBe(true);
});

test('keeps the Settlement allocation illustration visible as a lower-right anchor', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement illustration anchor targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const anchor = await page.locator('.monthly-summary.fullframe .settle-allocation .settle-panel-art').evaluate((element) => {
    const panel = element.closest('.settle-panel');
    const svg = element.querySelector('svg');
    const artRect = element.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const style = getComputedStyle(element);
    const svgStyle = svg ? getComputedStyle(svg) : null;
    const whiteCells = [...(svg?.querySelectorAll('rect') ?? [])].filter((cell) => getComputedStyle(cell).fill === 'rgb(244, 244, 239)');
    return {
      display: style.display,
      opacity: Number.parseFloat(style.opacity),
      svgDisplay: svgStyle?.display ?? '',
      svgVisibility: svgStyle?.visibility ?? '',
      artWidth: artRect.width,
      artHeight: artRect.height,
      insidePanel: Boolean(panelRect && artRect.right <= panelRect.right + 1 && artRect.bottom <= panelRect.bottom + 1),
      whiteCellCount: whiteCells.length,
    };
  });

  expect(anchor).toEqual(expect.objectContaining({ display: 'grid', svgDisplay: 'block', svgVisibility: 'visible', insidePanel: true }));
  expect(anchor.opacity).toBeGreaterThan(0.5);
  expect(anchor.artWidth).toBeGreaterThanOrEqual(88);
  expect(anchor.artHeight).toBeGreaterThanOrEqual(88);
  expect(anchor.whiteCellCount).toBeGreaterThanOrEqual(8);
});

test('gives sparse Settlement ledger panels a readable character-and-note anchor', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'sparse settlement composition targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const anchors = await page.locator('.monthly-summary.fullframe .settle-panel:not(.settle-allocation)').evaluateAll((panels) => panels.map((panel) => {
    const art = panel.querySelector<HTMLElement>('.settle-panel-art')?.getBoundingClientRect();
    const note = panel.querySelector<HTMLElement>('.settle-panel-note')?.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      artWidth: art?.width ?? 0,
      artHeight: art?.height ?? 0,
      noteHeight: note?.height ?? 0,
      artInside: Boolean(art && art.left >= panelRect.left && art.bottom <= panelRect.bottom + 1),
      noteInside: Boolean(note && note.left >= panelRect.left && note.right <= panelRect.right + 1 && note.bottom <= panelRect.bottom + 1),
    };
  }));

  expect(anchors).toHaveLength(2);
  expect(anchors.every(({ artWidth, artHeight, noteHeight, artInside, noteInside }) =>
    artWidth >= 126 && artHeight >= 126 && noteHeight >= 48 && artInside && noteInside
  )).toBe(true);
});

test('gives empty settlement ledgers a framed neutral status lane', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'empty settlement anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.pendingMonthlySummary = {
      month: 1,
      resumeMode: 'planning',
      summary: { month: 1, ledger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: 500, netWorthEnd: 500 } },
      highlights: [],
    };
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await expect(page.getByRole('dialog', { name: '第 1 月结算' })).toBeVisible({ timeout: 15_000 });

  const lanes = await page.locator('.monthly-summary.fullframe .settle-panel.is-empty .settle-empty-row').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    const rect = item.getBoundingClientRect();
    return { height: rect.height, borderStyle: style.borderTopStyle, background: style.backgroundColor };
  }));

  expect(lanes).toHaveLength(3);
  expect(lanes.every(({ height, borderStyle, background }) => height >= 78 && borderStyle === 'dashed' && background === 'rgb(16, 16, 16)')).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
  const lowHeight = await page.locator('.monthly-summary.fullframe .settle-panel.is-empty .settle-empty-row').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    const copyStyle = getComputedStyle(item.querySelector('.settle-empty-copy') ?? item);
    const rect = item.getBoundingClientRect();
    return { height: rect.height, whiteSpace: copyStyle.whiteSpace, borderStyle: style.borderTopStyle };
  }));
  expect(lowHeight).toHaveLength(3);
  expect(lowHeight.every(({ height, whiteSpace, borderStyle }) => height >= 28 && whiteSpace === 'nowrap' && borderStyle === 'dashed')).toBe(true);
});

test('gives settlement financial panels a shared pixel-corner frame', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement frame assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const frames = await page.locator('.monthly-summary.fullframe .settle-grid > .settle-panel').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item, '::after');
    return { content: style.content, borderWidth: style.borderTopWidth, clipPath: style.clipPath, surfaceClipPath: getComputedStyle(item).clipPath };
  }));

  expect(frames).toHaveLength(3);
  expect(frames.every(({ content, borderWidth, clipPath, surfaceClipPath }) => content === '""' && Number.parseFloat(borderWidth) >= 1 && clipPath !== 'none' && surfaceClipPath !== 'none')).toBe(true);
});

test('gives the settlement Hero a full-width title divider', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement Hero assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const title = page.locator('.monthly-summary.fullframe .settle-result-title');
  const titleStyle = await title.evaluate((item) => {
    const style = getComputedStyle(item);
    const rect = item.getBoundingClientRect();
    return { borderWidth: style.borderBottomWidth, width: rect.width };
  });

  expect(Number.parseFloat(titleStyle.borderWidth)).toBeGreaterThanOrEqual(1);
  expect(titleStyle.width).toBeGreaterThan(300);
});

test('frames the Settlement net-worth Hero with distributed reference rays', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement Hero burst targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const anatomy = await page.locator('.monthly-summary.fullframe .settle-result-inverse').evaluate((hero) => {
    const heroRect = hero.getBoundingClientRect();
    const motif = hero.querySelector<HTMLElement>('.settle-result-motif')?.getBoundingClientRect();
    const art = hero.querySelector<HTMLElement>('.settle-result-art')?.getBoundingClientRect();
    const rayStyles = Array.from(hero.querySelectorAll<HTMLElement>('.settle-ray')).map((ray) => {
      const style = getComputedStyle(ray);
      return {
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
        left: style.left,
        top: style.top,
        backgroundImage: style.backgroundImage,
        backgroundColor: style.backgroundColor,
      };
    });
    return {
      hero: { left: heroRect.left, right: heroRect.right, center: (heroRect.left + heroRect.right) / 2 },
      motif: motif ? { left: motif.left, right: motif.right, width: motif.width, height: motif.height, center: (motif.left + motif.right) / 2 } : null,
      art: art ? { width: art.width, height: art.height } : null,
      rayStyles,
    };
  });

  expect(anatomy.motif).not.toBeNull();
  expect(anatomy.art).not.toBeNull();
  expect(anatomy.motif?.width).toBeGreaterThanOrEqual(340);
  expect(anatomy.motif?.height).toBeGreaterThanOrEqual(260);
  expect(Math.abs((anatomy.motif?.center ?? 0) - anatomy.hero.center)).toBeLessThanOrEqual(2);
  expect(anatomy.motif?.left).toBeGreaterThanOrEqual(anatomy.hero.left - 1);
  expect(anatomy.motif?.right).toBeLessThanOrEqual(anatomy.hero.right + 1);
  expect(anatomy.art?.width).toBeGreaterThanOrEqual(120);
  expect(anatomy.art?.height).toBeGreaterThanOrEqual(120);
  expect(anatomy.rayStyles).toHaveLength(16);
  expect(anatomy.rayStyles.every(({ height }) => height >= 2 && height <= 3)).toBe(true);
  expect(anatomy.rayStyles.every(({ backgroundImage, backgroundColor }) => backgroundImage === 'none' && backgroundColor === 'rgb(244, 244, 239)')).toBe(true);
  expect(new Set(anatomy.rayStyles.map(({ left, top }) => `${left}|${top}`)).size).toBeGreaterThanOrEqual(8);
  expect(Math.min(...anatomy.rayStyles.map(({ width }) => width))).toBeGreaterThanOrEqual(24);
  expect(Math.max(...anatomy.rayStyles.map(({ width }) => width))).toBeGreaterThanOrEqual(50);
});

test('keeps the Settlement Hero secondary spark field dense enough for the reference rhythm', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement Hero spark density targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const sparks = await page.locator('.monthly-summary.fullframe .settle-result-motif .settle-spark').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { width: rect.width, height: rect.height, top: rect.top, left: rect.left };
  }));
  const motif = await page.locator('.monthly-summary.fullframe .settle-result-motif').boundingBox();

  expect(sparks).toHaveLength(14);
  expect(motif).not.toBeNull();
  expect(sparks.every(({ width, height, top, left }) => width >= 4 && height >= 4 && top >= (motif?.y ?? 0) && left >= (motif?.x ?? 0))).toBe(true);
});

test('keeps a compact Settlement Hero motif visible at low desktop height', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height Settlement Hero targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1280, height: 720 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const anatomy = await page.locator('.monthly-summary.fullframe .settle-result-inverse').evaluate((hero) => {
    const motif = hero.querySelector<HTMLElement>('.settle-result-motif');
    const art = hero.querySelector<HTMLElement>('.settle-result-art');
    const motifStyle = motif ? getComputedStyle(motif) : null;
    const motifRect = motif?.getBoundingClientRect();
    const artRect = art?.getBoundingClientRect();
    const rays = Array.from(hero.querySelectorAll<HTMLElement>('.settle-ray')).map((ray) => ({
      display: getComputedStyle(ray).display,
      height: Number.parseFloat(getComputedStyle(ray).height),
      left: getComputedStyle(ray).left,
      top: getComputedStyle(ray).top,
    }));
    return {
      motifDisplay: motifStyle?.display ?? 'none',
      motifWidth: motifRect?.width ?? 0,
      motifHeight: motifRect?.height ?? 0,
      artDisplay: art ? getComputedStyle(art).display : 'none',
      artWidth: artRect?.width ?? 0,
      artHeight: artRect?.height ?? 0,
      rays,
    };
  });

  expect(anatomy.motifDisplay).toBe('block');
  expect(anatomy.motifWidth).toBeGreaterThanOrEqual(120);
  expect(anatomy.motifHeight).toBeGreaterThanOrEqual(90);
  expect(anatomy.artDisplay).not.toBe('none');
  expect(anatomy.artWidth).toBeGreaterThanOrEqual(56);
  expect(anatomy.artHeight).toBeGreaterThanOrEqual(56);
  expect(anatomy.rays).toHaveLength(16);
  expect(anatomy.rays.every(({ display, height }) => display !== 'none' && height >= 1 && height <= 2)).toBe(true);
  expect(new Set(anatomy.rays.map(({ left, top }) => `${left}|${top}`)).size).toBeGreaterThanOrEqual(8);
});

test('keeps the settlement Hero character near the burst origin', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement Hero composition targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const centers = await page.locator('.monthly-summary.fullframe .settle-result-inverse').evaluate((hero) => {
    const heroRect = hero.getBoundingClientRect();
    const motif = hero.querySelector<HTMLElement>('.settle-result-motif')?.getBoundingClientRect();
    const art = hero.querySelector<HTMLElement>('.settle-result-art')?.getBoundingClientRect();
    return {
      heroWidth: heroRect.width,
      motifCenter: motif ? (motif.left + motif.right) / 2 : null,
      artCenter: art ? (art.left + art.right) / 2 : null,
    };
  });

  expect(centers.motifCenter).not.toBeNull();
  expect(centers.artCenter).not.toBeNull();
  expect(Math.abs((centers.artCenter ?? 0) - (centers.motifCenter ?? 0))).toBeLessThanOrEqual(centers.heroWidth * 0.06);
});

test('keeps the settlement title on the reference three-spark rhythm', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement title decoration targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const sparks = await page.locator('.monthly-summary.fullframe .settle-title-spark').evaluateAll((items) => items.map((item) => {
    const rect = item.getBoundingClientRect();
    return { className: item.className, width: Math.round(rect.width), height: Math.round(rect.height) };
  }));

  expect(sparks).toHaveLength(3);
  expect(sparks.map(({ width, height }) => [width, height])).toEqual([[26, 26], [16, 16], [22, 22]]);
});

test('keeps the settlement Hero character at the reference character tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement character assertion targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const art = page.locator('.monthly-summary.fullframe .settle-result-art');
  const artSize = await art.evaluate((item) => {
    const rect = item.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  expect(artSize.width).toBeGreaterThanOrEqual(104);
  expect(artSize.height).toBeGreaterThanOrEqual(104);
});

test('gives populated settlement achievements a title-body-meta hierarchy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'achievement anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const anatomy = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection):not(.placeholder)').evaluateAll((cards) => cards.map((card) => {
    const style = getComputedStyle(card);
    const title = card.querySelector('h3')?.getBoundingClientRect();
    const art = card.querySelector('.highlight-art')?.getBoundingClientRect();
    const detail = card.querySelector('.highlight-description')?.getBoundingClientRect();
    const meta = card.querySelector('small')?.getBoundingClientRect();
    return {
      areas: style.gridTemplateAreas,
      titleTop: title?.top ?? 0,
      artTop: art?.top ?? 0,
      artCenter: art ? art.top + art.height / 2 : 0,
      artWidth: art?.width ?? 0,
      detailTop: detail?.top ?? 0,
      detailCenter: detail ? detail.top + detail.height / 2 : 0,
      metaTop: meta?.top ?? 0,
      titleWidth: title?.width ?? 0,
      cardWidth: card.getBoundingClientRect().width,
    };
  }));

  expect(anatomy).toHaveLength(5);
  expect(anatomy.every(({ areas, titleTop, artTop, artCenter, artWidth, detailTop, detailCenter, metaTop, titleWidth, cardWidth }) =>
    areas === '"title title" "icon detail" "meta meta"' &&
    titleTop < artTop &&
    artWidth >= 56 &&
    Math.abs(detailCenter - artCenter) <= 10 &&
    artTop < metaTop &&
    detailTop < metaTop &&
    titleWidth >= cardWidth * 0.8
  )).toBe(true);
});

test('keeps populated settlement achievement copy above the tiny metadata tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'achievement typography targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const typography = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection):not(.placeholder)').evaluateAll((cards) => cards.map((card) => ({
    titleFontSize: Number.parseFloat(getComputedStyle(card.querySelector('h3')!).fontSize),
    descriptionFontSize: Number.parseFloat(getComputedStyle(card.querySelector('.highlight-description')!).fontSize),
    metaFontSize: Number.parseFloat(getComputedStyle(card.querySelector('small')!).fontSize),
  })));

  expect(typography).toHaveLength(5);
  expect(typography.every(({ titleFontSize, descriptionFontSize, metaFontSize }) =>
    titleFontSize >= 17 && descriptionFontSize >= 13 && metaFontSize >= 11
  )).toBe(true);
});

test('keeps populated settlement achievement art open on the black board', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'achievement art treatment targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const art = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection):not(.placeholder) .highlight-art').first().evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, background: style.backgroundColor, border: style.borderTopStyle, padding: style.padding };
  });

  expect(art).toEqual({ width: expect.any(Number), height: expect.any(Number), background: 'rgba(0, 0, 0, 0)', border: 'none', padding: '0px' });
  expect(art.width).toBeGreaterThanOrEqual(68);
  expect(art.height).toBeGreaterThanOrEqual(68);
});

test('gives populated settlement achievements a deliberate closing baseline', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'achievement footer treatment targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const baselines = await page.locator('.monthly-summary.fullframe .highlight-card:not(.reflection):not(.placeholder)').evaluateAll((cards) => cards.map((card) => {
    const frame = card.getBoundingClientRect();
    const meta = card.querySelector('small')?.getBoundingClientRect();
    const style = getComputedStyle(card.querySelector('small')!);
    return {
      cardWidth: frame.width,
      metaWidth: meta?.width ?? 0,
      borderStyle: style.borderTopStyle,
      borderColor: style.borderTopColor,
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  }));

  expect(baselines).toHaveLength(5);
  expect(baselines.every(({ cardWidth, metaWidth, borderStyle, borderColor, paddingTop }) =>
    metaWidth >= cardWidth * 0.8 && borderStyle === 'dotted' && borderColor === 'rgb(85, 85, 85)' && paddingTop >= 4
  )).toBe(true);
});

test('keeps the Settlement review card on the shared visual anchor tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement review anchor targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const metrics = await page.locator('.monthly-summary.fullframe .highlight-card.reflection').evaluate((card) => {
    const icon = card.querySelector('.pixel-icon')?.getBoundingClientRect();
    const metric = card.querySelector('.reflection-metric')?.getBoundingClientRect();
    const title = card.querySelector('h3')?.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const centered = (rect?: DOMRect) => rect ? rect.left + rect.width / 2 : 0;
    const recordWidths = Array.from(card.parentElement?.querySelectorAll<HTMLElement>('.highlight-card:not(.reflection)') ?? [])
      .map((record) => record.getBoundingClientRect().width);
    return {
      cardWidth: cardRect.width,
      iconWidth: icon?.width ?? 0,
      iconHeight: icon?.height ?? 0,
      metricHeight: metric?.height ?? 0,
      metricFontSize: metric ? Number.parseFloat(getComputedStyle(card.querySelector('.reflection-metric')!).fontSize) : 0,
      cardCenterX: cardRect.left + cardRect.width / 2,
      iconCenterX: centered(icon),
      titleCenterX: centered(title),
      metricCenterX: centered(metric),
      recordWidths,
    };
  });

  expect(metrics.cardWidth).toBeGreaterThanOrEqual(210);
  expect(metrics.recordWidths).toHaveLength(5);
  expect(metrics.cardWidth).toBeGreaterThan(Math.max(...metrics.recordWidths) * 1.15);
  expect(metrics.iconWidth).toBeGreaterThanOrEqual(32);
  expect(metrics.iconHeight).toBeGreaterThanOrEqual(32);
  expect(metrics.metricHeight).toBeGreaterThanOrEqual(22);
  expect(metrics.metricFontSize).toBeGreaterThanOrEqual(28);
  expect(Math.abs(metrics.iconCenterX - metrics.cardCenterX)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.titleCenterX - metrics.cardCenterX)).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.metricCenterX - metrics.cardCenterX)).toBeLessThanOrEqual(1);
});

test('keeps the tall Settlement achievement row on the reference width rhythm', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'tall settlement achievement rhythm targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const rhythm = await page.locator('.monthly-summary.fullframe .highlight-row').evaluate((row) => {
    const rowRect = row.getBoundingClientRect();
    const cards = Array.from(row.querySelectorAll<HTMLElement>(':scope > .highlight-card')).map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, reflection: card.classList.contains('reflection') };
    });
    return {
      left: rowRect.left,
      right: rowRect.right,
      width: rowRect.width,
      gaps: cards.slice(1).map((card, index) => card.left - cards[index].right),
      cards,
    };
  });

  expect(rhythm.cards).toHaveLength(6);
  expect(rhythm.left).toBeLessThanOrEqual(24);
  expect(rhythm.right).toBeGreaterThanOrEqual(1414);
  expect(rhythm.width).toBeGreaterThanOrEqual(1390);
  expect(rhythm.cards[0].top).toBeLessThanOrEqual(730);
  expect(rhythm.cards[0].width).toBeGreaterThanOrEqual(220);
  expect(rhythm.cards.slice(1, 5).every(({ width }) => width >= 190 && width <= 205)).toBe(true);
  expect(rhythm.cards[5].width).toBeGreaterThanOrEqual(260);
  expect(rhythm.gaps.every((gap) => gap >= 18)).toBe(true);
});

test('keeps the tall Settlement footer attached to the achievement row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  test.skip((page.viewportSize()?.width ?? 0) < 1321 || (page.viewportSize()?.height ?? 0) < 801, 'tall settlement footer rhythm targets the primary desktop surface');
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const geometry = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>('.monthly-summary.fullframe .highlight-row')?.getBoundingClientRect();
    const footer = document.querySelector<HTMLElement>('.monthly-summary.fullframe .settle-footer')?.getBoundingClientRect();
    return {
      rowBottom: row?.bottom ?? 0,
      footerTop: footer?.top ?? 0,
      footerHeight: footer?.height ?? 0,
    };
  });

  expect(geometry.footerTop).toBeGreaterThanOrEqual(geometry.rowBottom);
  expect(geometry.footerTop - geometry.rowBottom).toBeLessThanOrEqual(20);
  expect(geometry.footerHeight).toBeGreaterThanOrEqual(110);
});

test('opens the settlement stage without revealing the underlying page', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'settlement stage opacity targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const backdropStyle = await page.locator('.modal-backdrop.settlement-mode').evaluate((element) => {
    const style = getComputedStyle(element);
    const topbar = getComputedStyle(document.querySelector('.app-shell.mode-monthly_summary > .topbar') ?? document.body);
    return {
      backgroundColor: style.backgroundColor,
      animationName: style.animationName,
      opacity: style.opacity,
      topbarOpacity: topbar.opacity,
    };
  });
  expect(backdropStyle).toEqual({
    backgroundColor: 'rgb(5, 5, 5)',
    animationName: 'none',
    opacity: '1',
    topbarOpacity: '1',
  });
});

test('fills the low-height settlement frame without a trailing dead band', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'low-height settlement framing is desktop-only');
  await page.setViewportSize({ width: 1280, height: 720 });
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.simulationMode = 'paused';
    state.majorEventsThisMonth = 3;
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem('yuliang-e2e-hook', '1');
  }, { key: saveKey, state: initial });
  await page.reload();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });

  const frame = await page.locator('.modal-backdrop.settlement-mode .monthly-summary.fullframe').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewportHeight: window.innerHeight };
  });

  expect(frame.top).toBeGreaterThanOrEqual(100);
  expect(frame.bottom).toBeGreaterThanOrEqual(frame.viewportHeight - 20);
  expect(frame.height).toBeGreaterThanOrEqual(590);
});

test('uses crisp grayscale typography across the desktop console', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'typography rendering contract targets the supported desktop landscape surface');
  const typography = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const button = getComputedStyle(document.querySelector('.nav-item') ?? document.body);
    const title = getComputedStyle(document.querySelector('.life-planning-section .section-heading h1') ?? document.body);
    const copy = getComputedStyle(document.querySelector('.view-life .forecast-attr') ?? document.body);
    const firstFamily = (value: string) => value.split(',')[0].replaceAll('"', '').trim();
    return {
      bodyFamily: firstFamily(body.fontFamily),
      buttonFamily: firstFamily(button.fontFamily),
      titleFamily: firstFamily(title.fontFamily),
      copyFamily: firstFamily(copy.fontFamily),
      bodySmoothing: body.getPropertyValue('-webkit-font-smoothing'),
      buttonSmoothing: button.getPropertyValue('-webkit-font-smoothing'),
      bodyRendering: body.textRendering,
      buttonRendering: button.textRendering,
    };
  });
  expect(typography).toEqual({
    bodyFamily: 'MS Gothic',
    buttonFamily: 'MS Gothic',
    titleFamily: 'MS Gothic',
    copyFamily: 'MS Gothic',
    bodySmoothing: 'none',
    buttonSmoothing: 'none',
    bodyRendering: 'geometricprecision',
    buttonRendering: 'geometricprecision',
  });
});

test('extends the crisp pixel edge to shared desktop copy', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'desktop copy rendering contract targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '职业', exact: true }).click();

  const strokeWidths = await page.evaluate(() => [
    document.body,
    document.querySelector('.career-market-identity p'),
    document.querySelector('.career-results .job-card .job-card-description'),
    document.querySelector('.career-results .job-card .job-card-status small'),
  ].map((element) => Number.parseFloat(getComputedStyle(element ?? document.body).webkitTextStrokeWidth)));

  expect(strokeWidths.every((width) => width >= 0.1)).toBe(true);
});

test('keeps the header settings glyph on an integer pixel scale', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'header icon scale targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const icon = await page.locator('.settings-button .pixel-icon').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  expect(icon).toEqual({ width: 32, height: 32 });
});

test('keeps the header date copy before its trailing calendar anchor', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'header date anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const layout = await page.locator('.status-date').evaluate((element) => {
    const icon = element.querySelector<SVGElement>(':scope > .pixel-icon');
    const copy = element.querySelector<HTMLElement>(':scope > span');
    const iconRect = icon?.getBoundingClientRect();
    const copyRect = copy?.getBoundingClientRect();
    return {
      childOrder: Array.from(element.children).map((child) => child.tagName),
      copyRight: copyRect?.right ?? 0,
      iconLeft: iconRect?.left ?? 0,
      iconTop: iconRect?.top ?? 0,
      copyBottom: copyRect?.bottom ?? 0,
    };
  });

  expect(layout.childOrder).toEqual(['SPAN', 'svg']);
  expect(layout.iconLeft).toBeGreaterThanOrEqual(layout.copyRight);
  expect(layout.iconTop).toBeGreaterThanOrEqual(layout.copyBottom - 20);
});

test('keeps shared panels on the stepped corner and divider grammar', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'shared frame grammar targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const grammar = await page.evaluate(() => {
    const read = (selector: string, pseudo: '::before' | '::after') => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element, pseudo);
      return {
        backgroundImage: style.backgroundImage,
        borderWidth: style.borderTopWidth,
        borderColor: style.borderTopColor,
      };
    };
    const divider = document.querySelector('.view-life .inbox-head');
    const dividerStyle = divider ? getComputedStyle(divider) : null;
    return {
      hero: read('.view-life .time-console', '::before'),
      inbox: read('.view-life .inbox-panel', '::after'),
      planner: read('.view-life .planner.pixel-corners', '::before'),
      divider: dividerStyle ? {
        style: dividerStyle.borderBottomStyle,
        color: dividerStyle.borderBottomColor,
      } : null,
    };
  });

  expect(grammar.hero?.backgroundImage).toContain('linear-gradient');
  expect(grammar.inbox?.backgroundImage).toContain('linear-gradient');
  expect(grammar.planner?.backgroundImage).toContain('linear-gradient');
  expect(grammar.divider).toEqual({ style: 'dotted', color: 'rgb(87, 87, 83)' });
});

test('keeps Life board surfaces on the shared stepped pixel silhouette', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Life surface silhouette targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '生活', exact: true }).click();

  const frames = await page.locator('.view-life .time-console, .view-life .planner.pixel-corners, .view-life .inbox-panel.pixel-corners').evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { clipPath: style.clipPath, overflowX: style.overflowX, overflowY: style.overflowY };
  }));

  expect(frames).toHaveLength(6);
  expect(frames.every(({ clipPath, overflowX, overflowY }) => clipPath !== 'none' && overflowX !== 'scroll' && overflowY !== 'scroll')).toBe(true);
});

test('keeps secondary desktop surfaces on the shared stepped pixel silhouette', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'secondary surface silhouettes target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const surfaces = [
    { nav: '职业', selector: '.career-filters, .career-detail.inverse, .career-bottom-panel' },
    { nav: '商店', selector: '.view-shop .shop-rail .rail-module, .view-shop .shop-detail' },
    { nav: '生活', selector: '.view-life .forecast-strip.inverse' },
  ];

  for (const { nav, selector } of surfaces) {
    await page.getByRole('button', { name: nav, exact: true }).click();
    const frames = await page.locator(selector).evaluateAll((elements) => elements.map((element) => ({
      clipPath: getComputedStyle(element).clipPath,
      overflowX: getComputedStyle(element).overflowX,
      overflowY: getComputedStyle(element).overflowY,
    })));

    expect(frames.length, `${nav} should expose its real secondary surfaces`).toBeGreaterThan(0);
    expect(frames.every(({ clipPath, overflowX, overflowY }) => clipPath !== 'none' && overflowX !== 'scroll' && overflowY !== 'scroll')).toBe(true);
  }
});

test('keeps the desktop outer frame as a restrained one-bit boundary', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'outer frame treatment targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const frame = await page.locator('.outer-frame').evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      inset: Math.round(rect.left),
      borderWidth: style.borderTopWidth,
      borderColor: style.borderTopColor,
    };
  });

  expect(frame).toEqual({
    inset: 7,
    borderWidth: '1px',
    borderColor: 'rgb(119, 119, 119)',
  });
});

test('keeps the wide desktop navigation at the reference rhythm', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'wide navigation rhythm targets the primary desktop surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const navigation = await page.locator('.main-nav').evaluate((element) => {
    const items = Array.from(element.querySelectorAll<HTMLElement>('.nav-tabs .nav-item'));
    const first = items[0]?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      paddingLeft: Math.round(Number.parseFloat(style.paddingLeft)),
      firstLeft: first ? Math.round(first.left) : null,
      widths: items.map((item) => Math.round(item.getBoundingClientRect().width)),
    };
  });

  expect(navigation).toEqual({
    paddingLeft: 36,
    firstLeft: 36,
    widths: [118, 118, 118, 118, 118, 118, 118],
  });
});

test('keeps desktop footer portraits open instead of boxed terminal icons', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'footer portrait anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  const portrait = await page.locator('.persistent-status .pixel-avatar').evaluate((element) => {
    const box = element.getBoundingClientRect();
    const illustration = element.querySelector('svg')?.getBoundingClientRect();
    const style = getComputedStyle(element);
    const cells = Array.from(element.querySelectorAll('svg.il-mascot rect')).map((cell) => ({
      x: cell.getAttribute('x'),
      y: cell.getAttribute('y'),
      width: cell.getAttribute('width'),
      height: cell.getAttribute('height'),
      fill: cell.getAttribute('fill'),
    }));
    return {
      boxWidth: Math.round(box.width),
      boxHeight: Math.round(box.height),
      slotLeft: Math.round(box.left),
      firstStatLeft: Math.round(element.closest('.persistent-status')?.querySelector<HTMLElement>('.persistent-stat')?.getBoundingClientRect().left ?? 0),
      svgWidth: Math.round(illustration?.width ?? 0),
      svgHeight: Math.round(illustration?.height ?? 0),
      svgBottom: Math.round(illustration?.bottom ?? 0),
      footerTop: Math.round(element.closest('.persistent-status')?.getBoundingClientRect().top ?? 0),
      footerBottom: Math.round(element.closest('.persistent-status')?.getBoundingClientRect().bottom ?? 0),
      footerHeight: Math.round(element.closest('.persistent-status')?.getBoundingClientRect().height ?? 0),
      backgroundColor: style.backgroundColor,
      borderStyle: style.borderStyle,
      hasOpenShoulder: cells.some(({ x, y, width, height }) => x === '9' && y === '18' && width === '1' && height === '1'),
      hasOpenCollar: cells.some(({ x, y, width, height }) => x === '9' && y === '20' && width === '1' && height === '1'),
    };
  });

  expect(portrait).toEqual(expect.objectContaining({
    boxWidth: 60,
    boxHeight: 58,
    slotLeft: 24,
    firstStatLeft: 102,
    svgWidth: 60,
    svgHeight: 60,
    svgBottom: expect.any(Number),
    footerTop: 1000,
    footerBottom: expect.any(Number),
    footerHeight: 80,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderStyle: 'none',
    hasOpenShoulder: true,
    hasOpenCollar: true,
  }));
  expect(portrait.svgBottom).toBeLessThanOrEqual(portrait.footerBottom - 2);
});

test('keeps low-height desktop footer portraits open without a frame', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'low-height footer portrait anatomy targets desktop landscape');
  await page.setViewportSize({ width: 1280, height: 720 });

  const portrait = await page.locator('.persistent-status .pixel-avatar').evaluate((element) => {
    const illustration = element.querySelector('svg')?.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      svgWidth: Math.round(illustration?.width ?? 0),
      svgHeight: Math.round(illustration?.height ?? 0),
      backgroundColor: style.backgroundColor,
      borderStyle: style.borderStyle,
    };
  });

  expect(portrait).toEqual({
    svgWidth: 46,
    svgHeight: 46,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderStyle: 'none',
  });
});

test('gives low-height desktop content a visible pixel scroll affordance', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'low-height scroll affordance targets desktop landscape');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const scrolling = await page.locator('.main-content').evaluate((element) => {
    const style = getComputedStyle(element);
    const scrollbar = getComputedStyle(element, '::-webkit-scrollbar');
    return {
      overflowY: style.overflowY,
      scrollbarWidth: style.scrollbarWidth,
      webkitWidth: scrollbar.width,
      canScroll: element.scrollHeight > element.clientHeight,
    };
  });

  expect(scrolling).toEqual({
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    webkitWidth: '6px',
    canScroll: true,
  });
});

test('keeps empty Shop rail modules on dark shells with light status lanes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Shop rail surface anatomy targets the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const surfaces = await page.evaluate(() => Object.fromEntries([
    ['cart', '.rail-cart > .shop-rail-empty'],
    ['inventory', '.rail-inventory .shop-rail-empty'],
    ['wishlist', '.rail-wishlist .shop-rail-empty'],
  ].map(([key, selector]) => {
    const element = document.querySelector(selector);
    const style = element ? getComputedStyle(element) : null;
    const shell = element?.closest('.rail-module');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    return [key, {
      backgroundColor: style?.backgroundColor,
      color: style?.color,
      shellBackgroundColor: shellStyle?.backgroundColor,
    }];
  })));

  expect(surfaces).toEqual({
    cart: { backgroundColor: 'rgb(9, 9, 9)', color: 'rgb(170, 170, 170)', shellBackgroundColor: 'rgb(9, 9, 9)' },
    inventory: { backgroundColor: 'rgb(9, 9, 9)', color: 'rgb(170, 170, 170)', shellBackgroundColor: 'rgb(9, 9, 9)' },
    wishlist: { backgroundColor: 'rgb(9, 9, 9)', color: 'rgb(170, 170, 170)', shellBackgroundColor: 'rgb(9, 9, 9)' },
  });
});

test('keeps tall Shop Rail empty-state copy above the micro tier', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'tall Shop Rail copy tier targets the primary desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole('button', { name: '商店', exact: true }).click();

  const copy = await page.locator('.view-shop .shop-rail .shop-rail-empty').evaluateAll((states) => states.map((state) => ({
    title: Number.parseFloat(getComputedStyle(state.querySelector('strong')!).fontSize),
    hint: Number.parseFloat(getComputedStyle(state.querySelector('small')!).fontSize),
  })));

  expect(copy).toHaveLength(3);
  expect(copy.every(({ title, hint }) => title >= 11 && hint >= 9)).toBe(true);
});

test('keeps desktop card descriptions above the micro-copy tier', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'desktop card copy tier targets the supported landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  await page.getByRole('button', { name: '职业', exact: true }).click();
  const careerDescriptionSize = await page.locator('.career-results .job-card > .job-card-description').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await page.getByRole('button', { name: '商店', exact: true }).click();
  const shopDescriptionSize = await page.locator('.view-shop .shop-main .item-card p').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  await page.getByRole('button', { name: '生活', exact: true }).click();
  const lifeInboxSize = await page.locator('.view-life .inbox-list li').first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));

  expect(careerDescriptionSize).toBeGreaterThanOrEqual(12);
  expect(shopDescriptionSize).toBeGreaterThanOrEqual(11);
  expect(lifeInboxSize).toBeGreaterThanOrEqual(11);
});

test('lets the tall Life inbox strip use the board height before the footer', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1181, 'Life board proportions target the supported desktop landscape surface');
  await page.setViewportSize({ width: 1440, height: 1080 });

  await page.getByRole('button', { name: '生活', exact: true }).click();
  const panels = await page.locator('.view-life .life-primary-dashboard .inbox-panel').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, bottom: rect.bottom };
  }));
  const footerTop = await page.locator('.persistent-status').evaluate((element) => element.getBoundingClientRect().top);

  expect(panels).toHaveLength(4);
  expect(panels.every(({ height }) => height >= 226)).toBe(true);
  expect(Math.max(...panels.map(({ bottom }) => bottom))).toBeLessThanOrEqual(footerTop - 8);
});

test('discovers and applies to the official education operations route', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), knowledge: 20, communication: 20, appearance: 12 };
    state.ability = 20;
    state.reputation = 10;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('青禾');
  const vacancy = page.getByRole('heading', { name: '课程运营助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('青禾教育科技');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '课程运营助理' })).toBeVisible();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '课程运营助理' })).toBeVisible();
});

test('turns the education course qualification into a persistent teaching assistant side job', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 2_000;
    state.attributes = { ...(state.attributes ?? {}), professional: 14, knowledge: 14, communication: 14, fitness: 14 };
    state.ability = 14;
    state.reputation = 3;
    state.qualifications = [...new Set([...(state.qualifications ?? []), 'qualification.workplace-basics'])];
    state.rng = { ...(state.rng ?? {}), seed: 24, cursor: 0 };
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('青禾');
  const vacancy = page.getByRole('heading', { name: '线上课程助教' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '线上课程助教' })).toBeVisible();
  await page.getByRole('button', { name: '接受 Offer' }).click();
  await openCareerPage(page, '我的兼职');
  await expect(page.getByRole('heading', { name: '线上课程助教' })).toBeVisible();
  await page.getByRole('button', { name: '安排到本周' }).click();
  await openCareerTools(page);
  await expect(page.getByText('线上课程助教 4 小时', { exact: true })).toBeVisible();
  await closeCareerTools(page);
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('线上课程助教');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByLabel('主导航').getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完成线上课程助教' }).first()).toBeVisible();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '我的兼职');
  await expect(page.getByRole('heading', { name: '线上课程助教' })).toBeVisible();
});

test('discovers the consulting research route and shows its real acquisition gate', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 26, knowledge: 26, communication: 26, fitness: 26 };
    state.ability = 26;
    state.reputation = 8;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('澄明');
  const vacancy = page.getByRole('heading', { name: '研究助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('澄明商业咨询');
  await expect(vacancy).toContainText('获得轻薄笔记本电脑');
  await expect(vacancy.getByRole('button', { name: '申请职位' })).toBeDisabled();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('澄明');
  await expect(page.getByRole('heading', { name: '研究助理' })).toBeVisible();
});

test('discovers the travel product assistant route in the public market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 18, knowledge: 18, communication: 18, fitness: 18 };
    state.ability = 18;
    state.reputation = 5;
    state.rng = { ...(state.rng ?? {}), seed: 1, cursor: 0 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('栖岸');
  const vacancy = page.getByRole('heading', { name: '旅行产品助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('栖岸文旅');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '旅行产品助理' })).toBeVisible();
});

test('discovers the low-barrier ecommerce operations route in the public market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 12, knowledge: 12, communication: 12, fitness: 12 };
    state.ability = 12;
    state.reputation = 2;
    state.rng = { ...(state.rng ?? {}), seed: 37, cursor: 0 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('星桥');
  const vacancy = page.getByRole('heading', { name: '订单运营助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('星桥电商');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '订单运营助理' })).toBeVisible();
});

test('discovers the neworder automotive service route in the public market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 12, knowledge: 12, communication: 10, fitness: 12, appearance: 8, network: 4 };
    state.ability = 12;
    state.reputation = 2;
    state.rng = { ...(state.rng ?? {}), seed: 17, cursor: 0 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('新序');
  const vacancy = page.getByRole('heading', { name: '门店服务助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('新序汽车服务');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '门店服务助理' })).toBeVisible();
});

test('discovers the frame media production route in the public market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 12, knowledge: 12, communication: 12, fitness: 12, appearance: 10, network: 4 };
    state.ability = 12;
    state.reputation = 2;
    state.rng = { ...(state.rng ?? {}), seed: 100, cursor: 0 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('映界');
  const vacancy = page.getByRole('heading', { name: '制作助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('映界传媒');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '制作助理' })).toBeVisible();
});

test('discovers the isle lifestyle customer experience route in the public market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.attributes = { ...(state.attributes ?? {}), professional: 12, knowledge: 12, communication: 12, fitness: 12, appearance: 10, network: 4 };
    state.ability = 12;
    state.reputation = 2;
    state.rng = { ...(state.rng ?? {}), seed: 15, cursor: 0 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByLabel('搜索岗位或公司').fill('一屿');
  const vacancy = page.getByRole('heading', { name: '客户体验助理' }).locator('xpath=ancestor::article[1]');
  await expect(vacancy).toContainText('一屿生活科技');
  await expect(vacancy).toContainText('符合条件');
  await vacancy.getByRole('button', { name: '申请职位' }).click();
  await openCareerPage(page, '我的申请');
  await expect(page.getByRole('heading', { name: '客户体验助理' })).toBeVisible();
});

test('enforces the persisted travel cooldown in the activity market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { day: 15, hour: 8, minute: 0 };
    state.lifeHistory = [{ id: 'life.activity.last-trip', day: 10, category: 'activity', title: '周末短途旅行 · 慢慢走走', sourceId: 'activity.weekend-getaway' }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  const getaway = page.getByRole('heading', { name: '周末短途旅行 · 慢慢走走' }).locator('xpath=ancestor::article[1]');
  await expect(getaway).toContainText('冷却中 · 还需 9 天');
  await expect(getaway.getByRole('button', { name: '冷却中 · 还需 9 天' })).toBeDisabled();
});

test('shows the persisted service history beside the service market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 500;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await page.getByRole('button', { name: '使用服务' }).first().click();
  const serviceMarket = page.getByRole('region', { name: '服务与订阅' });
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础理发');
  await expect(serviceMarket).toContainText('最近服务记录');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础理发');
});

test('applies and persists a cooldown after using a repeatable service', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const haircut = page.getByRole('heading', { name: '基础理发' }).locator('..').locator('..');
  await haircut.getByRole('button', { name: '使用服务' }).click();
  await expect(haircut.getByRole('button', { name: '冷却中 · 还需 14 天' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await expect(page.getByRole('heading', { name: '基础理发' }).locator('..').locator('..').getByRole('button', { name: '冷却中 · 还需 14 天' })).toBeDisabled();
});

test('discovers the expanded daily services and subscriptions', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  state.cash = 1000;
  state.simulationMode = 'paused';
  await page.evaluate(({ key, nextState }) => localStorage.setItem(key, JSON.stringify(nextState)), { key: saveKey, nextState: state });
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const styling = page.getByRole('heading', { name: '专业形象咨询' }).locator('..').locator('..');
  await styling.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('专业形象咨询');
  const nutrition = page.getByRole('heading', { name: '营养餐计划' }).locator('..').locator('..');
  await nutrition.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('营养餐计划');
  const workdayMeal = page.getByRole('heading', { name: '工作日简餐' }).locator('..').locator('..');
  await workdayMeal.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('工作日简餐');
  const video = page.getByRole('heading', { name: '视频会员' }).locator('..').locator('..');
  await video.getByRole('button', { name: '开通订阅' }).click();
  await expect(video.getByRole('button', { name: '取消订阅' })).toBeVisible();
});

test('shows locked wealth requirements with an actionable acquisition route', async ({ page }) => {
  await page.getByRole('button', { name: '财富', exact: true }).click();
  const panel = page.getByRole('region', { name: '获取路径' });
  await expect(panel).toContainText('精品珠宝');
  await expect(panel).toContainText('需要能力 市场洞察');
  await expect(panel).toContainText('早餐与咖啡档');
  await expect(panel).toContainText('需要能力 经营资格');
  await panel.getByRole('button', { name: '去社交寻找机会' }).first().click();
  await expect(page.getByRole('heading', { name: '社交', exact: true })).toBeVisible();
});

test('negotiates salary and persists a voluntary departure in career history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.jobExperience = { ...(state.jobExperience ?? {}), 'job.seed-shop-clerk': 20 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '当前工作');
  await page.getByRole('button', { name: '离开当前工作' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '继续沟通' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '留下来谈谈' }).click();
  const negotiated = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(negotiated.employment.salaryAdjustment).toBe(5);
  expect(negotiated.employment.negotiationStage).toBe(1);

  await openCareerPage(page, '当前工作');
  await page.getByRole('button', { name: '离开当前工作' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '继续沟通' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '我想换个方向' }).click();
  await openCareerPage(page, '职业履历');
  await expect(page.getByRole('heading', { name: '便利店店员' })).toBeVisible();
  await expect(page.getByText(/至第 1 天 · 离职/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '职业履历');
  await expect(page.getByText(/至第 1 天 · 离职/)).toBeVisible();
});

test('charges and cancels a monthly subscription with persisted history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 1_000;
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const subscription = page.getByRole('heading', { name: '基础通信套餐' }).locator('..').locator('..');
  await subscription.getByRole('button', { name: '开通订阅' }).click();
  await expect(subscription.getByRole('button', { name: '取消订阅' })).toBeVisible();

  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toContainText('第 1 月', { timeout: 15_000 });
  await page.getByRole('dialog').getByRole('button', { name: '进入下个月' }).click();
  const chargedState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(chargedState.activeSubscriptions['subscription.mobile-basic']).toBeDefined();
  expect(chargedState.lifeHistory).toContainEqual(expect.objectContaining({ title: '基础通信套餐月度扣费', amount: -39 }));
  expect(chargedState.financialHistory).toContainEqual(expect.objectContaining({ consumption: expect.objectContaining({ categories: expect.objectContaining({ service: 39 }) }) }));

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await page.getByRole('heading', { name: '基础通信套餐' }).locator('..').locator('..').getByRole('button', { name: '取消订阅' }).click();
  await expect(subscription.getByRole('button', { name: '开通订阅' })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('开通基础通信套餐')).toBeVisible();
  await expect(page.getByText('取消基础通信套餐')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('基础通信套餐月度扣费')).toBeVisible();
  await expect(page.getByText('取消基础通信套餐')).toBeVisible();
});

test('uses the basic fitness assessment service and keeps its history', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const fitness = page.getByRole('heading', { name: '基础体能评估' }).locator('..').locator('..');
  await fitness.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础体能评估');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础体能评估');
});

test('discovers the riverside night market activity', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();
  const market = page.locator('article.activity-card').filter({ hasText: '河畔夜市 · 逛一圈' });
  await expect(market.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
});

test('discovers the industrial design exhibition trip', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  const exhibition = page.locator('article.activity-card').filter({ hasText: '北部产业设计展 · 看展' });
  await expect(exhibition).toContainText('¥280');
  await expect(exhibition.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
});

test('discovers and plans the expanded dining and concert activities', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '社交', exact: true }).click();
  const dining = page.locator('article.activity-card').filter({ hasText: '精品餐厅晚餐 · 慢慢吃完' });
  await expect(dining).toContainText('¥380');
  await expect(dining.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  await dining.getByRole('button', { name: '安排到本周自由时间' }).click();
  await page.getByRole('tab', { name: '学习', exact: true }).click();
  const concert = page.locator('article.activity-card').filter({ hasText: '演唱会 · 去现场' });
  await expect(concert).toContainText('¥680');
  await expect(concert.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  await openCareerTools(page);
  await expect(page.getByRole('button', { name: /晚间计划/ }).filter({ hasText: '精品餐厅晚餐 · 慢慢吃完' })).toBeVisible();
});

test('discovers the expanded home, cinema, and fitness activities', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();
  const cinema = page.locator('article.activity-card').filter({ hasText: 'IMAX 高规格电影 · 特别放映厅' });
  await expect(cinema).toContainText('¥138');
  await expect(cinema.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  const fitness = page.locator('article.activity-card').filter({ hasText: '去健身房 · 训练一小时' });
  await expect(fitness).toContainText('¥45');
  await expect(fitness).toContainText('体能 +1');
  await expect(fitness.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  const homeMovie = page.locator('article.activity-card').filter({ hasText: '在家看电影 · 在家看一部' });
  await expect(homeMovie.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
});

test('discovers the expanded travel tiers and schedules a premium weekend', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  initial.currentJobId = null;
  initial.employment = null;
  initial.cash = 5000;
  await page.evaluate(({ key, nextState }) => localStorage.setItem(key, JSON.stringify(nextState)), { key: saveKey, nextState: initial });
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  const dayTrip = page.locator('article.activity-card').filter({ hasText: '城郊一日游 · 安排一日出行' });
  await expect(dayTrip).toContainText('¥280');
  const premiumWeekend = page.locator('article.activity-card').filter({ hasText: '品质周末旅行 · 安排品质周末' });
  await expect(premiumWeekend).toContainText('¥2,200');
  await expect(premiumWeekend.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  const domestic = page.locator('article.activity-card').filter({ hasText: '普通国内旅行 · 安排国内探索' });
  await expect(domestic).toContainText('¥2,800');
  await expect(domestic).toContainText('3 天');
  const luxury = page.locator('article.activity-card').filter({ hasText: '豪华度假 · 安排豪华度假' });
  await expect(luxury).toContainText('¥18,000');
  await expect(luxury).toContainText('5 天');
  await premiumWeekend.getByRole('button', { name: '安排到本周自由时间' }).click();
  await openCareerTools(page);
  await expect(page.getByRole('button', { name: /周[一二三四五六日]白天计划/ }).filter({ hasText: '品质周末旅行 · 安排品质周末' })).toBeVisible();
});

test('discovers a contact-specific activity and schedules it with its relationship gate', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '社交', exact: true }).click();
  const coffee = page.locator('article.activity-card').filter({ hasText: '和联系人喝咖啡 · 和林晨聊聊' });
  await expect(coffee).toContainText('¥100');
  await expect(coffee).toContainText('关系 +3');
  await expect(coffee.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  await coffee.getByRole('button', { name: '安排到本周自由时间' }).click();
  await openCareerTools(page);
  await expect(page.getByRole('button', { name: /晚间计划/ }).filter({ hasText: '和联系人喝咖啡 · 和林晨聊聊' })).toBeVisible();
});

test('acquires camping gear and unlocks the weekend camping plan', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 3_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  const hints = page.getByRole('region', { name: '活动获取提示' });
  await expect(hints).toContainText('周末露营 · 搭帐篷住一晚');
  await expect(hints).toContainText('需要商品 露营装备');
  await hints.getByRole('button', { name: '购买 露营装备' }).click();
  const camping = page.locator('article.activity-card').filter({ hasText: '周末露营 · 搭帐篷住一晚' });
  await expect(camping.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
  await camping.getByRole('button', { name: '安排到本周自由时间' }).click();
  await openCareerTools(page);
  await expect(page.getByRole('button', { name: /晚间计划/ }).filter({ hasText: '周末露营 · 搭帐篷住一晚' })).toBeVisible();
});

test('trades a listed business equity slice from the wealth flow', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.time = { ...state.time, day: 29 };
    state.businesses = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3_200, equityPercent: 80, listed: true, listedDay: 1 } };
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('heading', { name: '企业经营' })).toBeVisible();
  await page.getByRole('button', { name: '出售 10% 股权' }).click();
  await expect(page.getByText('持股 70% · 已投入资本 ¥0 · 融资 ¥0')).toBeVisible();
  await page.getByRole('button', { name: '买入公开股权 ¥208' }).click();
  await expect(page.getByRole('region', { name: '公开股权' })).toContainText('你持有公开份额 10%');
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('投资分红');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('出售早餐与咖啡档 10% 股权')).toBeVisible();
  await expect(page.getByText('买入早餐与咖啡档公开股权')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '公开股权' })).toContainText('企业持股 70% · 市场流通 30%');
});

test('runs a business from purchase through funding, listing, daily profit and persistence', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 50_000;
    state.unlockedCapabilities = [...new Set([...(state.unlockedCapabilities ?? []), 'business_license'])];
    state.unlockedBusinessIds = ['business.seed-kiosk'];
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    state.rng = { ...(state.rng ?? {}), seed: 41, cursor: 0 };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await page.getByRole('button', { name: '买入 ¥3,200' }).click();
  await expect(page.getByRole('heading', { name: '企业经营' })).toBeVisible();
  await page.getByRole('button', { name: '投入 ¥1,000' }).click();
  await page.getByRole('button', { name: '发起融资' }).click();
  await page.getByRole('button', { name: '继续融资' }).click();
  await page.getByRole('button', { name: '申请上市' }).click();
  await expect(page.getByRole('button', { name: '已上市' })).toBeVisible();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('企业收入');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '早餐与咖啡档完成融资' }).first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('button', { name: '已上市' })).toBeVisible();
  await expect(page.getByRole('region', { name: '公开股权' })).toContainText('早餐与咖啡档');
});

test('acquires an unlocked business and persists the holding history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 15_000;
    state.ability = 18;
    state.attributes = { ...(state.attributes ?? {}), professional: 18, knowledge: 18, communication: 18, fitness: 18, appearance: 10, network: 0, mood: 50 };
    state.unlockedCapabilities = ['business_license', 'remote_work'];
    state.unlockedBusinessIds = ['business.seed-kiosk', 'business.online-store'];
    state.businesses = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3_200, equityPercent: 100 } };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('heading', { name: '可并购企业' })).toBeVisible();
  await page.getByRole('button', { name: '并购 ¥8,580' }).click();
  await expect(page.getByRole('heading', { name: '线上小店' }).last()).toBeVisible();
  const acquiredState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(acquiredState.businesses['business.online-store']).toBeDefined();
  expect(acquiredState.lifeHistory).toContainEqual(expect.objectContaining({ title: '并购线上小店' }));
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('并购线上小店')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('并购线上小店')).toBeVisible();
});

test('joins a relationship-gated business partnership and persists the partial holding', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.ability = 18;
    state.attributes = { ...(state.attributes ?? {}), professional: 18, knowledge: 18, communication: 18, fitness: 18, appearance: 10, network: 0, mood: 50 };
    state.relationships = { ...(state.relationships ?? {}), 'character.seed-zhou': 20 };
    state.unlockedCapabilities = ['business_license', 'remote_work'];
    state.unlockedBusinessIds = ['business.online-store'];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByText('合伙方案：与周妍共同经营 · 你持股 50%')).toBeVisible();
  await page.getByRole('button', { name: '加入合伙 ¥4,200' }).click();
  await expect(page.getByText('预计净利润 ¥330 /天 · 持股 50%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('加入线上小店合伙')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByText('预计净利润 ¥330 /天 · 持股 50%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('加入线上小店合伙')).toBeVisible();
});

test('joins and settles the official consulting studio partnership through the business loop', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 30_000;
    state.ability = 28;
    state.reputation = 20;
    state.attributes = { ...(state.attributes ?? {}), professional: 28, knowledge: 28, communication: 28, fitness: 28, appearance: 10, network: 0, mood: 50 };
    state.unlockedCapabilities = ['business_license'];
    state.unlockedBusinessIds = ['business.consulting-studio'];
    state.relationships = { ...(state.relationships ?? {}), 'character.guqing': 40 };
    state.flags = { ...(state.flags ?? {}), consulting_project_completed: true };
    state.businesses = {};
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await page.getByRole('button', { name: '加入合伙 ¥12,000' }).click();
  await expect(page.getByRole('heading', { name: '企业经营' })).toBeVisible();
  await expect(page.getByText(/咨询工作室/).first()).toBeVisible();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('企业收入');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('加入咨询工作室合伙')).toBeVisible();
  const settledState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(settledState.financialHistory?.length).toBeGreaterThan(0);
  expect(settledState.financialHistory.at(-1).income.categories.business_income).toBeGreaterThan(0);

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('heading', { name: '企业经营' })).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('加入咨询工作室合伙')).toBeVisible();
});

test('completes a wishlist purchase goal and persists its history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 2_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('button', { name: '加入愿望清单：新款手机' }).click();
  const wishlist = page.getByRole('region', { name: '愿望清单' });
  await expect(wishlist).toContainText('新款手机');
  await expect(wishlist).toContainText('现在可以买');
  await wishlist.getByRole('button', { name: '买下' }).click();
  await expect(page.getByTestId('cash-value')).toHaveText('现金 ¥820');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('愿望清单完成：新款手机')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('愿望清单完成：新款手机')).toBeVisible();
});

test('executes an offered gig and persists its income and career history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 2_000;
    const day = state.time?.day ?? 1;
    state.gigs = [{ id: 'gig.e2e-delivery', jobId: 'job.delivery-shift', validFromDay: day, expiresDay: day + 6, executableDay: day, startMinute: 1080, endMinute: 1320, pay: 76, source: '公开市场' }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  const gig = page.getByRole('heading', { name: '同城配送' }).locator('xpath=ancestor::article[1]');
  await expect(gig).toContainText('结算 ¥76');
  await gig.getByRole('button', { name: '执行一次' }).click();
  await expect(page.getByText('+¥76')).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完成同城配送' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完成同城配送' })).toBeVisible();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByRole('heading', { name: '同城配送' })).not.toBeVisible();
});

test('buys and persists the Isle lifestyle technology smart-home set', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();
  const beforePurchase = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('navigation', { name: '商品分页' }).getByRole('button', { name: '3', exact: true }).click();
  const item = page.locator('article.item-card').filter({ hasText: '智能家居套装' });
  await expect(item).toContainText('¥5,999');
  await item.getByRole('button', { name: '加入购物袋：智能家居套装' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByRole('heading', { name: '智能家居套装' }).first()).toBeVisible();
  const settled = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(settled.cash).toBe(4_001);
  expect(settled.lifestyle - (beforePurchase.lifestyle ?? 10)).toBe(6);
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('购买智能家居套装')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await expect(page.getByText('库存 ×1')).toBeVisible();
});

test('settles a business operating risk event with persisted financial history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 1_000;
    state.businesses = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 2_000, equityPercent: 100, publicFloatPercent: 0 } };
    state.pendingEventId = 'event.business-equipment-failure';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  const event = page.getByRole('dialog');
  await expect(event).toContainText('设备今天不太配合');
  await event.getByRole('button', { name: '马上维修设备' }).click();
  await expect(event).toContainText('-300¥');
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('设备今天不太配合')).toBeVisible();
  const settled = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(settled.cash).toBe(700);
  expect(settled.reputation).toBe((initial.reputation ?? 0) + 1);

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('设备今天不太配合')).toBeVisible();
});

test('applies the industrial hub city event and persists its development', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 180 };
    state.pendingEventId = 'event.industrial-hub-upgrade';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('北部产业区的物流枢纽升级');
  await page.getByRole('dialog').getByRole('button', { name: /支持这项升级/ }).click();
  await expect(page.getByRole('dialog')).toContainText('北部产业区发展 +1');
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByLabel('主导航').getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByRole('heading', { name: '北部产业区', exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByText('发展阶段 1/5')).toBeVisible();
});

test('reads and persists the official storyline dialogue', async ({ page }) => {
  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '远程连接' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await expect(storyline).toContainText('最近这段时间，你好像一直在处理很复杂的事情。');
  await storyline.getByRole('button', { name: '约个时间聊聊' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('远程连接：约个时间聊聊')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('远程连接：约个时间聊聊')).toBeVisible();
});

test('completes the first fund investment storyline after entering the market', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.investments = { ...(state.investments ?? {}), 'investment.broad-market-index': { investmentId: 'investment.broad-market-index', units: 1, averageCost: 108, currentValuation: 108, lastValuationDay: 1 } };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '第一次买基金' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await expect(storyline).toContainText('你已经开始把钱放进投资里了');
  await storyline.getByRole('button', { name: '先从低风险开始' }).click();
  await storyline.getByRole('button', { name: '把投资留在生活计划里' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('第一次买基金：把投资留在生活计划里')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('第一次买基金：把投资留在生活计划里')).toBeVisible();
});

test('unlocks the warehouse-to-office career storyline opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.currentJobId = 'job.huanliu-warehouse-assistant';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.huanliu-warehouse-assistant', companyId: 'company.huanliu', startedDay: 1 };
    state.careerExperience = { ...(state.careerExperience ?? {}), logistics: 22 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '从仓库走进办公室' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await expect(storyline).toContainText('有没有想过以后做调度');
  await storyline.getByRole('button', { name: '有兴趣' }).click();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  const opportunity = page.getByRole('heading', { name: '环流物流协调员' }).locator('..');
  await expect(opportunity).toContainText('环流物流内部调度机会');
  await expect(opportunity.getByRole('button', { name: '申请机会' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('环流物流内部调度机会')).toBeVisible();
});

test('completes the first real consulting project storyline with a persisted outcome', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.currentJobId = 'job.research-assistant';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.research-assistant', companyId: 'company.clearview-consulting', startedDay: 1 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '第一次真正的项目' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await storyline.getByRole('button', { name: '参加客户会议' }).click();
  await storyline.getByRole('button', { name: '多花 2h 准备' }).click();
  await storyline.getByRole('button', { name: '根据现有数据给出初步判断' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('第一次真正的项目：根据现有数据给出初步判断')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('第一次真正的项目：根据现有数据给出初步判断')).toBeVisible();
});

test('completes the ecommerce big-promotion storyline with a persisted career reward', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.currentJobId = 'job.order-operations-assistant';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.order-operations-assistant', companyId: 'company.starbridge-ecommerce', startedDay: 1 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '大促' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await storyline.getByRole('button', { name: '加入核心项目' }).click();
  await storyline.getByRole('button', { name: '完成项目复盘' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('大促：完成项目复盘')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('大促：完成项目复盘')).toBeVisible();
});

test('turns a client poaching storyline into a persisted referral opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.currentJobId = 'job.business-analyst';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.business-analyst', companyId: 'company.clearview-consulting', startedDay: 1 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '客户想把你挖走' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await storyline.getByRole('button', { name: '听听条件' }).click();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('合作公司负责人私下邀请')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('合作公司负责人私下邀请')).toBeVisible();
});

test('uses the employee purchase plan to buy a discounted smart-home set', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 5_000;
    state.reputation = 12;
    state.currentJobId = 'job.customer-experience-assistant';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.customer-experience-assistant', companyId: 'company.isle-lifestyle', startedDay: 1 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const storyline = page.getByRole('heading', { name: '员工内部购买计划' }).locator('..').locator('..');
  await storyline.getByRole('button', { name: '开始故事' }).click();
  await storyline.getByRole('button', { name: '折扣购买' }).click();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('navigation', { name: '商品分页' }).getByRole('button', { name: '3', exact: true }).click();
  const item = page.locator('article.item-card').filter({ hasText: '智能家居套装' });
  await expect(item).toContainText('¥4,499');
  await item.getByRole('button', { name: '加入购物袋：智能家居套装' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByRole('heading', { name: '智能家居套装' }).first()).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('购买智能家居套装')).toBeVisible();
});

test('uses and persists the vehicle annual service from the shop', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 1000;
    state.assets = { ...(state.assets ?? {}), 'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 35000 } };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const service = page.getByRole('heading', { name: '车辆年度保养' }).locator('..').locator('..');
  await expect(service).toContainText('车辆年度保养');
  await service.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('车辆年度保养');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('车辆年度保养');
});

test('shows persisted vehicle maintenance history in wealth', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 50000;
    state.assets = { 'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 34900 } };
    state.financialLedger = { month: 2, nextSequence: 2, entries: [{ id: 'ledger.vehicle.1', day: 28, direction: 'expense', group: 'consumption', category: 'maintenance', amount: 300, cashDelta: -300, sourceType: 'vehicle', sourceId: 'asset.used-compact', label: '实用二手小车车辆成本' }], cashStart: 50000, netWorthStart: 50000 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '车辆维护记录' })).toContainText('实用二手小车车辆成本');
});

test('shows persisted ambient city sightings in the city view', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.ambientLog = [{ day: 12, text: '中央区的夜间公交延长了运营时间。' }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByRole('region', { name: '城市见闻' })).toContainText('夜间公交延长');
});

test('discovers and plans the friend-specific cafe activity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 500;
    state.relationships = { ...(state.relationships ?? {}), 'character.chenyu': 4 };
    state.simulationMode = 'planning';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '学习', exact: true }).click();
  await expect(page.getByRole('region', { name: '活动获取提示' })).toContainText('需要商品 复古相机');
  const outing = page.locator('article').filter({ hasText: '和陈宇坐坐' });
  await expect(outing).toContainText('和陈宇坐坐');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByRole('button', { name: '职业', exact: true })).toBeVisible();
  await openCareerTools(page);
  await expect(page.getByText('去咖啡馆坐一会 · 和陈宇坐坐')).toBeVisible();
});

test('discovers and plans the relationship-gated cinema outing with Zhou', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 1000;
    state.relationships = { ...(state.relationships ?? {}), 'character.seed-zhou': 6 };
    state.simulationMode = 'planning';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '娱乐', exact: true }).click();
  const outing = page.locator('article').filter({ hasText: '和周妍看一场' });
  await expect(outing).toContainText('和周妍看一场');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByText('看电影 · 和周妍看一场')).toBeVisible();
});

test('discovers and plans the old-town cultural trip', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '学习', exact: true }).click();
  const outing = page.getByRole('heading', { name: '旧城文化日 · 看一场展览' }).locator('xpath=ancestor::article[1]');
  await expect(outing).toContainText('旧城文化日 · 看一场展览');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByText('旧城文化日 · 看一场展览')).toBeVisible();
});

test('discovers and plans the riverside park ride', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('tab', { name: '旅行', exact: true }).click();
  const ride = page.getByRole('heading', { name: '临江公园骑行 · 沿江骑行' }).locator('xpath=ancestor::article[1]');
  await expect(ride).toContainText('¥180');
  await expect(ride).toContainText('体能 +2');
  await ride.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByText('临江公园骑行 · 沿江骑行')).toBeVisible();
});

test('buys and gives a preference-matching gift with persisted social history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 1000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('navigation', { name: '商品分页' }).getByRole('button', { name: '3', exact: true }).click();
  const flowers = page.locator('article').filter({ hasText: '一束花' }).first();
  await flowers.getByRole('button', { name: '加入购物袋：一束花' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await page.getByRole('button', { name: '社交', exact: true }).click();
  const gifts = page.getByRole('region', { name: '礼物' });
  await gifts.getByRole('button', { name: '送 一束花（×1）' }).first().click();
  await expect(page.getByRole('region', { name: '消息' })).toContainText('林晨收到礼物');
  await page.reload();
  await page.getByRole('button', { name: '社交', exact: true }).click();
  await expect(page.getByRole('region', { name: '消息' })).toContainText('林晨收到礼物');
});

test('settles a city development event and keeps the location change after reload', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 90 };
    state.calendar = { ...state.calendar, month: 4 };
    state.pendingEventId = 'event.city-transit-upgrade';
    state.simulationMode = 'event';
    state.locationDevelopment = { ...(state.locationDevelopment ?? {}), 'location.riverside': 0 };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('临江区的变化');
  await page.getByRole('dialog').getByRole('button', { name: /支持这项建设/ }).click();
  await expect(page.getByRole('dialog')).toContainText('临江区发展 +1');
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByLabel('主导航').getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByText('发展阶段 1/5')).toBeVisible();

  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.getByText('发展阶段 1/5')).toBeVisible();
});

test('turns a company expansion event into a visible internal career opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 1 };
    state.currentJobId = 'job.category-operations-expert';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.category-operations-expert', companyId: 'company.xinghe', basePay: 720, salaryAdjustment: 0 };
    state.reputation = 28;
    state.pendingEventId = 'event.xinghe-expansion';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('星河科技的业务扩展');
  await page.getByRole('dialog').getByRole('button', { name: /参与前期项目/ }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  const changedState = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  expect(changedState.flags?.xinghe_service_line_launched).toBe(true);
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('星河科技业务扩展')).toBeVisible();
  await expect(page.getByText('独立项目顾问')).toBeVisible();
});

test('shows the player-triggered company state in annual world history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.worldHistory = [{ year: 1, day: 337, netWorth: 18_000, businessCount: 0, relationshipCount: 1, visitedLocationCount: 1, companyStates: { 'company.xinghe': '企业服务线提前启动（玩家参与）' } }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  const worldHistory = page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]');
  await expect(worldHistory).toContainText('星河科技');
  await expect(worldHistory).toContainText('企业服务线提前启动（玩家参与）');
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('企业服务线提前启动（玩家参与）');
});

test('turns a qualifying manager state into a persisted headhunter opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.currentJobId = 'job.regional-operations-manager';
    state.employment = { ...(state.employment ?? {}), jobId: 'job.regional-operations-manager', companyId: 'company.yuanwang', basePay: 620, salaryAdjustment: 0 };
    state.reputation = 30;
    state.pendingEventId = 'event.headhunter-contact';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('有猎头看过你的经历');
  await page.getByRole('dialog').getByRole('button', { name: '听听看' }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('许衡主动联系')).toBeVisible();
  await expect(page.getByText('品类运营专家')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '工作机会');
  await expect(page.getByText('许衡主动联系')).toBeVisible();
});

test('unlocks and trades the high-value collectible through the wealth flow', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 6 };
    state.calendar = { ...state.calendar, month: 1 };
    state.ability = 14;
    state.cash = 50_000;
    state.pendingEventId = 'event.investment-note';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('一份很简单的理财说明');
  await page.getByRole('dialog').getByRole('button', { name: /花点时间看懂它/ }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByText('限量机械腕表')).toBeVisible();
  await page.getByRole('button', { name: '买入 ¥18,000' }).click();
  await expect(page.getByRole('button', { name: '出售 ¥18,000' })).toBeVisible();
  await page.getByRole('button', { name: '出售 ¥18,000' }).click();
  await expect(page.getByRole('button', { name: '买入 ¥18,000' })).toBeVisible();
  await expect(page.getByText('精品珠宝')).toBeVisible();
  await page.getByRole('button', { name: '买入 ¥28,000' }).click();
  await expect(page.getByRole('button', { name: '出售 ¥28,000' })).toBeVisible();
  await page.getByRole('button', { name: '出售 ¥28,000' }).click();
  await expect(page.getByRole('button', { name: '买入 ¥28,000' })).toBeVisible();
});

test('buys and resells the official diamond pendant with persisted purchase history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 20_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '商店', exact: true }).click();
  await page.getByRole('navigation', { name: '商品分页' }).getByRole('button', { name: '3', exact: true }).click();
  const product = page.getByRole('heading', { name: '小型钻石吊坠' }).locator('xpath=ancestor::article[1]');
  await product.getByRole('button', { name: '加入购物袋：小型钻石吊坠' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByText('库存 ×1')).toBeVisible();
  await page.getByRole('button', { name: '出售一次' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '人生记录' })).toContainText('购买小型钻石吊坠');
  await expect(page.getByRole('region', { name: '人生记录' })).toContainText('出售小型钻石吊坠');
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '人生记录' })).toContainText('出售小型钻石吊坠');
});

test('shows persisted wealth milestones in the profile on desktop and mobile', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 200_000;
    state.wealthMilestones = [
      { id: 'savings', day: 28, netWorth: 12_000 },
      { id: 'stable', day: 90, netWorth: 100_000 },
    ];
    state.annualHistory = [{ year: 1, cashStart: 1_000, cashEnd: 1_400, netWorthStart: 1_000, netWorthEnd: 1_800, totalIncome: 900, totalConsumption: 500, months: 12 }];
    state.worldHistory = [{ year: 1, day: 337, netWorth: 1_800, businessCount: 0, relationshipCount: 2, companyStates: { 'company.yuanwang': '门店与社区零售' }, visitedLocationCount: 1 }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  const records = page.getByRole('region', { name: '财富阶段记录' });
  await expect(records).toContainText('有积蓄');
  await expect(records).toContainText('稳定');
  await expect(records).toContainText('第 28 天');
  const annualReview = page.getByRole('heading', { name: '年度回顾' }).locator('xpath=ancestor::section[1]');
  await expect(annualReview).toBeVisible();
  await expect(annualReview).toContainText('联系人 2 人');
  await expect(annualReview).toContainText('远望零售：门店与社区零售');
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '财富阶段记录' })).toContainText('稳定');
});

test('archives and restores annual public equity history in the profile', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.annualHistory = [{ year: 1, cashStart: 10_000, cashEnd: 40_000, netWorthStart: 10_000, netWorthEnd: 42_000, totalIncome: 35_000, totalConsumption: 5_000, months: 12 }];
    state.worldHistory = [{ year: 1, day: 337, netWorth: 42_000, businessCount: 1, relationshipCount: 2, relationshipValues: { 'character.seed-zhou': 42 }, characterCareerStates: { 'character.seed-lin': '远望零售 · 门店员工' }, companyStates: { 'company.yuanwang': '门店与社区零售' }, visitedLocationCount: 3, listedBusinessCount: 1, publicFloatPercent: 35, publicBusinessEquities: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', percent: 10, investedAmount: 208, currentValue: 220 } } }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  const equityHistory = page.getByRole('region', { name: '年度公开股权记录' });
  await expect(equityHistory).toContainText('第 1 年');
  await expect(equityHistory).toContainText('上市企业 1 家');
  await expect(equityHistory).toContainText('公开流通 35%');
  await expect(equityHistory).toContainText('早餐与咖啡档 10% · 年末估值 ¥220');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('周妍 42');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('林晨：远望零售 · 门店员工');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('远望零售：门店与社区零售');
  await expect(page.getByRole('heading', { name: '年度回顾' }).locator('xpath=ancestor::section[1]')).toContainText('周妍 42');
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度公开股权记录' })).toContainText('公开流通 35%');
  await expect(page.getByRole('region', { name: '年度公开股权记录' })).toContainText('早餐与咖啡档 10% · 年末估值 ¥220');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('周妍 42');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('林晨：远望零售 · 门店员工');
  await expect(page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]')).toContainText('远望零售：门店与社区零售');
  await expect(page.getByRole('heading', { name: '年度回顾' }).locator('xpath=ancestor::section[1]')).toContainText('周妍 42');
});

test('finances a home and restores the mortgage state after reload', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.unlockedHousingIds = [...new Set([...(state.unlockedHousingIds ?? []), 'housing.seed-room'])];
    state.housing = { housingId: 'housing.shared-room', mode: 'rent' };
    state.mortgage = undefined;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await openLifeDetails(page);
  const homeRow = page.getByRole('heading', { name: '独立单间' }).locator('..').locator('..');
  await expect(homeRow).toContainText('首付');
  await homeRow.getByRole('button', { name: '分期购买' }).click();
  await expect(page.getByText('分期中')).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('分期买下独立单间')).toBeVisible();

  await page.reload();
  await openLifeDetails(page);
  await expect(page.getByText('分期中')).toBeVisible();
  await expect(page.getByText('住房分期还款')).toHaveCount(0);
});

test('buys and rents a second home with persisted portfolio controls', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 20_000;
    state.unlockedHousingIds = [...new Set([...(state.unlockedHousingIds ?? []), 'housing.seed-room'])];
    state.housing = { housingId: 'housing.shared-room', mode: 'rent' };
    state.housingHoldings = {};
    state.mortgage = undefined;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await openLifeDetails(page);
  const homeRow = page.getByRole('heading', { name: '独立单间' }).locator('..').locator('..');
  await homeRow.getByRole('button', { name: '买作投资房' }).click();
  await homeRow.getByRole('button', { name: '开始出租' }).click();
  await expect(homeRow).toContainText('已出租');
  await expect(homeRow).toContainText('本月预计净租金');

  await page.reload();
  await openLifeDetails(page);
  await expect(page.getByRole('heading', { name: '独立单间' }).locator('..').locator('..')).toContainText('已出租');
});

test('unlocks and persists a private-equity opportunity from a relationship event', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 30 };
    state.relationships = { ...(state.relationships ?? {}), 'character.xuke': 40 };
    state.cash = 20_000;
    state.pendingEventId = 'event.private-equity-introduction';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('一个没有挂在市场上的机会');
  await page.getByRole('dialog').getByRole('button', { name: '了解这个项目' }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  const investment = page.getByRole('heading', { name: '城际生活早期股权' }).locator('..');
  await expect(investment).toContainText('私人股权');
  await investment.getByRole('button', { name: '买入 1 份' }).click();
  await expect(investment).toContainText('持有 1 份');

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('heading', { name: '城际生活早期股权' }).locator('..')).toContainText('持有 1 份');
});

test('settles the authored private-equity exit opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 120 };
    state.cash = 5_000;
    state.flags = { ...(state.flags ?? {}), private_equity_access: true };
    state.investments = { ...(state.investments ?? {}), 'investment.citylife-private-equity': { investmentId: 'investment.citylife-private-equity', units: 1, averageCost: 10_000, currentValuation: 10_000, lastValuationDay: 30 } };
    state.pendingEventId = 'event.private-equity-exit-offer';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('有人愿意接手这部分股权');
  await page.getByRole('dialog').getByRole('button', { name: '接受收购报价' }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  const investment = page.getByRole('heading', { name: '城际生活早期股权' }).locator('..');
  await investment.getByRole('button', { name: '卖出 1 份' }).click();
  await expect(investment).not.toContainText('持有 1 份');
  await expect(investment).toContainText('买入 1 份');
});

test('unlocks and trades the authored local restaurant investment opportunity', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 60 };
    state.relationships = { ...(state.relationships ?? {}), 'character.seed-zhou': 40 };
    state.cash = 10_000;
    state.pendingEventId = 'event.local-restaurant-investment';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await expect(page.getByRole('dialog')).toContainText('这家店想找长期合伙人');
  await page.getByRole('dialog').getByRole('button', { name: '了解合伙条件' }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  const investment = page.getByRole('heading', { name: '小型餐饮项目合伙份额' }).locator('..');
  await expect(investment).toContainText('私人股权');
  await investment.getByRole('button', { name: '买入 1 份' }).click();
  await expect(investment).toContainText('持有 1 份');

  await page.evaluate(({ key }) => {
    const state = JSON.parse(localStorage.getItem(key) ?? '{}');
    state.time = { ...state.time, day: 150 };
    state.pendingEventId = 'event.local-restaurant-exit-offer';
    state.simulationMode = 'event';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('这份合伙份额可以退出了');
  await page.getByRole('dialog').getByRole('button', { name: '接受退出报价' }).click();
  await page.getByRole('button', { name: '收下并暂停' }).click();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  const matureInvestment = page.getByRole('heading', { name: '小型餐饮项目合伙份额' }).locator('..');
  await matureInvestment.getByRole('button', { name: '卖出 1 份' }).click();
  await expect(matureInvestment).not.toContainText('持有 1 份');
});

test('buys and sells independent public company equity with persisted history', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  const equity = page.getByRole('heading', { name: '启明服务公开股权' }).locator('..');
  await expect(equity).toContainText('独立于自营企业');
  await equity.getByRole('button', { name: '买入 1 份' }).click();
  await expect(equity).toContainText('持有 1 份');
  await expect(equity).toContainText('已投入');
  await expect(equity).toContainText('平均成本');
  await expect(equity).toContainText('当前价值');
  await expect(equity).toContainText('未实现收益');
  await expect(equity).toContainText('30 日变化');
  await equity.getByRole('button', { name: '卖出 1 份' }).click();
  await expect(equity).not.toContainText('持有 1 份');

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('买入启明服务公开股权')).toBeVisible();
  await expect(page.getByText('卖出启明服务公开股权')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('卖出启明服务公开股权')).toBeVisible();
});

test('shows the persisted wealth portfolio summary across the wealth flow', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.housing = { housingId: 'housing.seed-room', mode: 'owned' };
    state.cash = 7_650;
    state.mortgage = { housingId: 'housing.seed-room', remainingPrincipal: 4_350, monthlyPayment: 199, totalMonths: 24, paidMonths: 1 };
    state.housingHoldings = {
      'housing.seed-apartment': { housingId: 'housing.seed-apartment', purchasePrice: 12_800, currentValuation: 12_800, occupancy: 'rented' },
    };
    state.investments = {
      'investment.flexible-savings': { investmentId: 'investment.flexible-savings', units: 10, averageCost: 1_000, currentValuation: 1_100, lastValuationDay: 1 },
    };
    state.assets = {
      'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 1_200, purchaseDay: 1, currentValuation: 1_000 },
    };
    state.financialHistory = [
      {
        month: 2,
        income: { group: 'income', amount: 50, categories: { investment_dividend: 50 } },
        consumption: { group: 'consumption', amount: 300, categories: { living: 300 } },
        assetAllocation: { group: 'asset_allocation', amount: 1_000, categories: { investment_transfer: 1_000 } },
        assetLiquidation: { group: 'asset_liquidation', amount: 0, categories: {} },
        totalIncome: 50,
        totalConsumption: 300,
        totalAssetAllocation: 1_000,
        totalAssetLiquidation: 0,
        cashStart: 10_000,
        cashEnd: 9_700,
        cashChange: -300,
        netWorthStart: 12_000,
        netWorthEnd: 12_450,
        netWorthChange: 450,
      },
      {
        month: 3,
        income: { group: 'income', amount: 80, categories: { investment_dividend: 80 } },
        consumption: { group: 'consumption', amount: 300, categories: { living: 300 } },
        assetAllocation: { group: 'asset_allocation', amount: 0, categories: {} },
        assetLiquidation: { group: 'asset_liquidation', amount: 0, categories: {} },
        totalIncome: 80,
        totalConsumption: 300,
        totalAssetAllocation: 0,
        totalAssetLiquidation: 0,
        cashStart: 9_700,
        cashEnd: 9_900,
        cashChange: 200,
        netWorthStart: 12_450,
        netWorthEnd: 12_300,
        netWorthChange: -150,
      },
    ];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  const summary = page.getByRole('region', { name: '财富组合摘要' });
  await expect(summary).toContainText('房产总值');
  await expect(summary).toContainText('现金余额');
  await expect(summary).toContainText('¥7,650');
  await expect(summary).toContainText('贷款余额');
  await expect(summary).toContainText('房产净值');
  await expect(summary).toContainText('本月净租金');
  await expect(summary).toContainText('投资资产');
  await expect(summary).toContainText('¥1,100');
  await expect(summary).toContainText('车辆与收藏');
  await expect(summary).toContainText('¥1,000');
  const allocation = page.getByRole('region', { name: '财富配置' });
  await expect(allocation).toContainText('现金');
  await expect(allocation).toContainText('金融投资');
  await expect(allocation).toContainText('投资房');
  const history = page.getByRole('region', { name: '财富组合历史' });
  await expect(history).toContainText('第 2 月');
  await expect(history).toContainText('第 3 月');
  await expect(history).toContainText('现金 ¥10,000 → ¥9,700');
  await expect(history).toContainText('净资产 ¥12,450 → ¥12,300');
  await expect(history).toContainText('投资配置 ¥1,000');
  await expect(history).toContainText('分红 ¥80');

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '财富组合摘要' })).toContainText('房产净值');
  await expect(page.getByRole('region', { name: '财富组合历史' })).toContainText('第 3 月');
});

test('records and shows a reached milestone in the profile', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.simulationMode = 'planning';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '生活', exact: true }).click();
  await page.getByRole('button', { name: '开始本周' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  const records = page.getByRole('region', { name: '里程碑记录' });
  await expect(records).toContainText('第一万现金');
  await expect(records).toContainText('已达成');

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '里程碑记录' })).toContainText('第一万现金');
});

test('records the first investment dividend as a milestone after monthly settlement', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 50_000;
    state.investments = {
      'investment.qiming-equity': { investmentId: 'investment.qiming-equity', units: 1_000, averageCost: 220, currentValuation: 220_000, lastValuationDay: 1 },
    };
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toContainText('第 1 月');
  await page.getByRole('dialog').getByRole('button', { name: '进入下个月' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '里程碑记录' })).toContainText('第一笔投资分红');

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '里程碑记录' })).toContainText('第一笔投资分红');
});

test('completes and persists an official course through the weekly plan', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 2_000;
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await openCareerTools(page);
  const course = page.getByRole('heading', { name: '职场基础课' }).locator('xpath=ancestor::div[contains(@class, "item-row")]');
  await expect(course).toContainText('¥180');
  await course.getByRole('button', { name: '安排课程' }).click();
  await closeCareerTools(page);
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toContainText('第 1 月');
  await page.getByRole('dialog').getByRole('button', { name: '进入下个月' }).click();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('完成课程：职场基础课')).toBeVisible();
  await openCareerTools(page);
  await expect(page.getByRole('heading', { name: '职场基础课' }).locator('xpath=ancestor::div[contains(@class, "item-row")]')).toContainText('已完成');
  await page.reload();
  await openCareerTools(page);
  await expect(page.getByRole('heading', { name: '职场基础课' }).locator('xpath=ancestor::div[contains(@class, "item-row")]')).toContainText('已完成');
});

test('settles Zhou business interaction and persists the follow-up message', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 500;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const contact = page.locator('article.relation-card').filter({ has: page.getByRole('heading', { name: '周妍', exact: true }) });
  await contact.getByRole('button', { name: /一起看看店/ }).click();
  await expect(contact).toContainText('12');
  await expect(page.getByRole('region', { name: '消息' })).toContainText('周妍发来新消息');

  await page.reload();
  await page.getByRole('button', { name: '社交', exact: true }).click();
  await expect(page.getByRole('region', { name: '消息' })).toContainText('周妍发来新消息');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  const relationshipHistory = page.getByRole('region', { name: '关系历史' });
  await expect(relationshipHistory).toContainText('周妍');
  await expect(relationshipHistory).toContainText('当前关系 12');
  await expect(relationshipHistory).toContainText('1 次记录');
  await expect(relationshipHistory).toContainText('一起看看店');
  await expect(relationshipHistory).toContainText('第 1 月 · 1 次关系记录');
});

test('settles Guqing consulting review interaction with preference feedback', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 500;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const contact = page.locator('article.relation-card').filter({ has: page.getByRole('heading', { name: '顾清', exact: true }) });
  await contact.getByRole('button', { name: /一起复盘项目/ }).click();
  await expect(contact).toContainText('7');
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '关系历史' })).toContainText('和顾清复盘项目');
  await page.reload();
  await page.getByRole('button', { name: '社交', exact: true }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '关系历史' })).toContainText('和顾清复盘项目');
});


test('builds a controlling stake through staged entry and persists board decisions', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 30000;
    state.ability = 18;
    state.attributes = { ...(state.attributes ?? {}), professional: 18, knowledge: 18, communication: 18, fitness: 18, appearance: 10, network: 0, mood: 50 };
    state.unlockedCapabilities = ['business_license'];
    state.unlockedBusinessIds = ['business.seed-kiosk'];
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '企业组合' })).toHaveCount(0);
  await page.getByRole('button', { name: /入股 30%/ }).click();
  const group = page.getByRole('region', { name: '企业组合' });
  await expect(group).toBeVisible();
  await expect(group).toContainText('战略 / 少数股权');
  // Minority holders cannot touch daily operations until they cross the 50% boundary.
  await expect(page.getByRole('button', { name: /增持 10%/ })).toBeVisible();

  await page.getByRole('button', { name: /增持 10%/ }).click();
  await page.getByRole('button', { name: /增持 10%/ }).click();
  await expect(page.getByText('控股企业 · 持股 50%').first()).toBeVisible();
  await page.getByRole('button', { name: /精简组织/ }).click();
  await expect(page.getByText(/重组效率 \+5%/).first()).toBeVisible();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('入股早餐与咖啡档')).toBeVisible();
  await expect(page.getByText('早餐与咖啡档完成组织精简')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '企业组合' })).toContainText('组合归母估值');
  await expect(page.getByText(/重组效率 \+5%/).first()).toBeVisible();
});
test('evolves NPC and company timelines from world state and archives them', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 20_000;
    state.time = { day: 1300, hour: 9, minute: 0 };
    state.completedEvents = ['event.industrial-hub-upgrade', 'event.city-transit-upgrade'];
    state.flags = { ...(state.flags ?? {}), xinghe_service_line_launched: true };
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  // Live evolution: the social timeline reshapes from persisted world state.
  await page.getByRole('button', { name: '社交', exact: true }).click();
  const linCard = page.locator('article.relation-card').filter({ has: page.getByRole('heading', { name: '林晨', exact: true }) });
  await expect(linCard).toContainText('临江内容工作室 · 联合创始人');
  await expect(linCard).not.toContainText('电商运营助理');
  const xukeCard = page.locator('article.relation-card').filter({ has: page.getByRole('heading', { name: '徐可', exact: true }) });
  await expect(xukeCard).toContainText('星河企业服务线 · 技术合伙人');

  // Archived evolution: a completed annual snapshot renders its branched company and NPC states after reload.
  const seeded = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.worldHistory = [{ year: 4, day: 1344, netWorth: 24_000, businessCount: 0, relationshipCount: 1, visitedLocationCount: 1, listedBusinessCount: 0, controlledBusinessCount: 1,
      characterCareerStates: { 'character.seed-lin': '临江内容工作室 · 联合创始人' },
      companyStates: { 'company.greenfield-education': '北部转岗培训中心', 'company.xinghe': '企业服务线并购整合' } }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: seeded });
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  const worldRecords = page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]');
  await expect(worldRecords).toContainText('北部转岗培训中心');
  await expect(worldRecords).toContainText('企业服务线并购整合');
  await expect(worldRecords).toContainText('临江内容工作室 · 联合创始人');

  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  const worldAfterReload = page.getByRole('heading', { name: '世界记录' }).locator('xpath=ancestor::section[1]');
  await expect(worldAfterReload).toContainText('北部转岗培训中心');
});
test('shows cross-industry mobility distance and a senior expert ladder', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 20_000;
    state.ability = 45;
    state.careerExperience = { retail: 60, customer_service: 40, operations: 30, data: 152, office: 138, project: 58 };
    state.qualifications = [];
    state.vacancies = [];
    state.marketJobIds = [];
    // The boundary regenerates under the NEXT month's rotation phase: this seed lands on a
    // senior-rotation week featuring the 首席分析专家 anchor.
    state.time = { day: 25, hour: 9, minute: 0 };
    state.lastSettledDay = 24;
    state.majorEventsThisMonth = 3;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '职业', exact: true }).click();
  await runLongPeriod(page, 1);
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '进入下个月' }).click();

  // Dedicated tab keeps the market list untouched while framing movement between industries.
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '跨行业');
  const mobility = page.locator('section[aria-label="跨行业流动"]');
  await expect(mobility).toContainText('换行业的距离');
  await expect(mobility).toContainText('还差');
  await expect(mobility).toContainText('可迁移基础');

  // Senior anchors remain reachable in the regenerated public market with real hints.
  await openCareerPage(page, '招聘市场');
  await page.getByLabel('搜索岗位或公司').fill('首席分析专家');
  const seniorCard = page.locator('.job-card', { hasText: '首席分析专家' });
  await expect(seniorCard).toBeVisible();
  await expect(seniorCard).toContainText('还需准备');
  await expect(seniorCard.getByRole('button', { name: '申请职位' })).toBeDisabled();

  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await openCareerPage(page, '跨行业');
  await expect(page.locator('section[aria-label="跨行业流动"]')).toContainText('换行业的距离');
});
test('starts the old-photo storyline with song-yuran and persists its branch', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 5_000;
    state.time = { day: 90, hour: 10, minute: 0 };
    state.relationships = { ...(state.relationships ?? {}), 'character.song-yuran': 30 };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '社交', exact: true }).click();
  const albumStory = page.locator('.item-row').filter({ hasText: '旧相册' }).first();
  await expect(albumStory).toBeVisible();
  await albumStory.getByRole('button', { name: '开始故事' }).click();
  await expect(page.getByRole('region', { name: '故事线' }).or(page.locator('section', { hasText: '正在发生的故事' })).last()).toContainText('进行中');
  await page.getByRole('button', { name: /周末去旧城见她|先在线上聊聊/ }).first().click();
  await page.getByRole('button', { name: '把这页翻过去' }).click();
  await expect(page.getByText('已完成').first()).toBeVisible();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('把这页翻过去').first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '社交', exact: true }).click();
  const albumAfterReload = page.locator('.item-row').filter({ hasText: '旧相册' }).first();
  await expect(albumAfterReload).toContainText('已完成');
});
test('discovers the new districts and reaches their venue activities', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 5_000;
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '城市', exact: true }).click();
  await expect(page.locator('.item-card', { hasText: '南岸居住区' }).first()).toBeVisible();

  // Reach the tech-park venue card and jump into its bound activity.
  const lectureVenue = page.locator('article.item-card').filter({ hasText: '科技园路演厅' });
  await expect(lectureVenue).toContainText('园区公开课');
  await page.getByRole('button', { name: '去安排活动' }).last().click();
  await expect(page.locator('.activity-card', { hasText: '园区公开课' })).toBeVisible();
});
test('runs a multi-year life in the real browser and keeps annual records consistent', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 6_000;
    state.ability = 30;
    state.simulationMode = 'paused';
    state.rng = { ...(state.rng ?? {}), seed: 7, cursor: 0 };
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  const targetDay = 840; // roughly two and a half years
  for (let cycle = 0; cycle < 80 && await page.evaluate(() => window.__yuliang.store.getState().game.time.day) < targetDay; cycle += 1) {
    await page.evaluate(() => { window.__yuliang.store.getState().dispatch({ type: 'advance_period', months: 3 }); });
    for (let guard = 0; guard < 60; guard += 1) {
      const status = await page.evaluate(() => {
        const st = window.__yuliang.store.getState();
        const game = st.game;
        const out = { day: game.time.day, mode: game.simulationMode, event: (game.pendingEventId ?? null) as string | null, reward: Boolean(game.pendingReward), summary: Boolean(game.pendingMonthlySummary), choices: [] as string[] };
        if (out.event) out.choices = [...(window.__yuliang.eventChoices[out.event] ?? [])];
        return out;
      });
      if (status.event && status.choices.length > 0) {
        await page.evaluate(({ eventId, choiceId }: { eventId: string; choiceId: string }) => {
          window.__yuliang.store.getState().dispatch({ type: 'choose_event', eventId, choiceId } as never);
        }, { eventId: status.event, choiceId: status.choices[0] });
        continue;
      }
      if (status.reward) {
        await page.evaluate(() => { window.__yuliang.store.getState().dispatch({ type: 'claim_reward' }); });
        continue;
      }
      if (status.summary) {
        await page.evaluate(() => { window.__yuliang.store.getState().dispatch({ type: 'acknowledge_monthly_summary' }); });
        continue;
      }
      break;
    }
  }

  const snapshot = await page.evaluate(() => {
    const g = window.__yuliang.store.getState().game;
    return {
      day: g.time.day,
      years: (g.annualHistory ?? []).map((entry: { year: number }) => entry.year),
      worlds: (g.worldHistory ?? []).map((entry: { year: number }) => entry.year),
      hasWageEntry: (g.financialLedger?.entries ?? []).some((entry: { category: string }) => entry.category === 'wage'),
      mode: g.simulationMode,
    };
  });
  console.log('MULTIYEAR:', JSON.stringify(snapshot));
  expect(snapshot.day).toBeGreaterThanOrEqual(280);
  expect(snapshot.years.length).toBeGreaterThanOrEqual(2);
  expect(new Set(snapshot.years).size).toBe(snapshot.years.length);
  expect(snapshot.hasWageEntry).toBe(true);

  await page.reload();
  const restored = await page.evaluate(() => (window.__yuliang.store.getState().game.annualHistory ?? []).length);
  expect(restored).toBeGreaterThanOrEqual(2);
});
