import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

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
});

test('uses the public market, plans a week, pauses for shopping, and restores the save', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '余量' })).toBeVisible();
  await expect(page.getByText('第 1 周', { exact: true })).toBeVisible();

  await expect(page.getByRole('heading', { name: '招聘市场' })).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('远望');
  await expect(page.getByText('远望零售').first()).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('环流');
  await expect(page.getByText('环流物流').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '环流物流协调员' })).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('');
  await page.getByRole('button', { name: '申请职位' }).first().click();
  await page.getByRole('button', { name: '我的申请' }).click();
  await expect(page.getByText(/当前竞争力：/)).toBeVisible();
  await page.getByRole('button', { name: '工作机会' }).click();
  await expect(page.getByText(/人物推荐、内部转岗、猎头和剧情机会/)).toBeVisible();

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
  await expect(page.getByRole('heading', { name: '周末短途旅行 · 临江夜游' })).toBeVisible();
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡' }).click();
  await page.getByRole('button', { name: '加入购物袋：实用手机' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);

  const persistedCash = await page.getByTestId('cash-value').innerText();
  await page.reload();
  await expect(page.getByTestId('cash-value')).toHaveText(persistedCash);
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);
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
  await page.getByRole('button', { name: '我的申请' }).click();
  await expect(page.getByRole('heading', { name: '课程运营助理' })).toBeVisible();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByRole('button', { name: '我的申请' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
  await expect(page.getByRole('heading', { name: '线上课程助教' })).toBeVisible();
  await page.getByRole('button', { name: '接受 Offer' }).click();
  await page.getByRole('button', { name: '我的兼职' }).click();
  await expect(page.getByRole('heading', { name: '线上课程助教' })).toBeVisible();
  await page.getByRole('button', { name: '安排到本周' }).click();
  await expect(page.getByText('线上课程助教 4 小时', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '运行 1 个月' }).click();
  await expect(page.getByText('月结待确认')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('线上课程助教');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByLabel('主导航').getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '完成线上课程助教' }).first()).toBeVisible();
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByRole('button', { name: '我的兼职' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
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
  await page.getByRole('button', { name: '我的申请' }).click();
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
  const getaway = page.getByRole('heading', { name: '周末短途旅行 · 慢慢走走' }).locator('..');
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
  await page.getByRole('button', { name: '使用服务' }).first().click();
  const serviceMarket = page.getByRole('region', { name: '服务与订阅' });
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础理发');
  await expect(serviceMarket).toContainText('最近服务记录');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础理发');
});

test('applies and persists a cooldown after using a repeatable service', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  const haircut = page.getByRole('heading', { name: '基础理发' }).locator('..').locator('..');
  await haircut.getByRole('button', { name: '使用服务' }).click();
  await expect(haircut.getByRole('button', { name: '冷却中 · 还需 14 天' })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
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

test('uses the basic fitness assessment service and keeps its history', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  const fitness = page.getByRole('heading', { name: '基础体能评估' }).locator('..').locator('..');
  await fitness.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础体能评估');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('基础体能评估');
});

test('discovers the riverside night market activity', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  const market = page.locator('article.activity-card').filter({ hasText: '河畔夜市 · 逛一圈' });
  await expect(market.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
});

test('discovers the industrial design exhibition trip', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  const exhibition = page.locator('article.activity-card').filter({ hasText: '北部产业设计展 · 看展' });
  await expect(exhibition).toContainText('¥280');
  await expect(exhibition.getByRole('button', { name: '安排到本周自由时间' })).toBeVisible();
});

test('trades a listed business equity slice from the wealth flow', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.cash = 10_000;
    state.time = { ...state.time, day: 29 };
    state.businesses = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3_200, equityPercent: 80, listed: true, listedDay: 1 } };
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('heading', { name: '企业经营' })).toBeVisible();
  await page.getByRole('button', { name: '出售 10% 股权' }).click();
  await expect(page.getByText('持股 70% · 已投入资本 ¥0 · 融资 ¥0')).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('出售早餐与咖啡档 10% 股权')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('region', { name: '公开股权' })).toContainText('你的持股 70% · 外部公开流通 30%');
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
  await page.getByRole('button', { name: '运行 1 个月' }).click();
  await expect(page.getByText('月结待确认')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog')).toContainText('企业收入');
  await page.getByRole('button', { name: '进入下个月' }).click();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '早餐与咖啡档完成融资' }).first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '财富', exact: true }).click();
  await expect(page.getByRole('button', { name: '已上市' })).toBeVisible();
  await expect(page.getByRole('region', { name: '公开股权' })).toContainText('早餐与咖啡档');
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
  await page.getByRole('button', { name: '工作机会' }).click();
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
  await page.getByRole('button', { name: '工作机会' }).click();
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
  await page.getByRole('button', { name: '城市' }).click();
  await expect(page.getByRole('heading', { name: '北部产业区', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '城市' }).click();
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
  const service = page.getByRole('heading', { name: '车辆年度保养' }).locator('..').locator('..');
  await expect(service).toContainText('车辆年度保养');
  await service.getByRole('button', { name: '使用服务' }).click();
  await expect(page.getByRole('region', { name: '服务记录' })).toContainText('车辆年度保养');
  await page.reload();
  await page.getByRole('button', { name: '商店', exact: true }).click();
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
  await expect(page.getByRole('region', { name: '活动获取提示' })).toContainText('需要商品 复古相机');
  const outing = page.locator('article').filter({ hasText: '和陈宇坐坐' });
  await expect(outing).toContainText('和陈宇坐坐');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByRole('button', { name: '职业', exact: true })).toBeVisible();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await expect(page.getByText('去咖啡馆坐一会 · with-chenyu')).toBeVisible();
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
  const outing = page.locator('article').filter({ hasText: '和周妍看一场' });
  await expect(outing).toContainText('和周妍看一场');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByText('看电影 · 和周妍看一场')).toBeVisible();
});

test('discovers and plans the old-town cultural trip', async ({ page }) => {
  await page.getByRole('button', { name: '商店', exact: true }).click();
  const outing = page.getByRole('heading', { name: '旧城文化日 · 看一场展览' }).locator('..');
  await expect(outing).toContainText('旧城文化日 · 看一场展览');
  await outing.getByRole('button', { name: '安排到本周自由时间' }).click();
  await expect(page.getByText('旧城文化日 · 看一场展览')).toBeVisible();
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
  await page.getByRole('button', { name: '城市' }).click();
  await expect(page.getByText('发展阶段 1/5')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '城市' }).click();
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
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await page.getByRole('button', { name: '工作机会' }).click();
  await expect(page.getByText('星河科技业务扩展')).toBeVisible();
  await expect(page.getByText('独立项目顾问')).toBeVisible();
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
  await page.getByRole('button', { name: '工作机会' }).click();
  await expect(page.getByText('许衡主动联系')).toBeVisible();
  await expect(page.getByText('品类运营专家')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '职业', exact: true }).click();
  await page.getByRole('button', { name: '工作机会' }).click();
  await expect(page.getByText('许衡主动联系')).toBeVisible();
});

test('unlocks and trades the high-value collectible through the wealth flow', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.time = { ...state.time, day: 6 };
    state.calendar = { ...state.calendar, month: 1 };
    state.ability = 14;
    state.cash = 20_000;
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
    state.worldHistory = [{ year: 1, day: 337, netWorth: 1_800, businessCount: 0, relationshipCount: 2, visitedLocationCount: 1 }];
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
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '财富阶段记录' })).toContainText('稳定');
});

test('archives and restores annual public equity history in the profile', async ({ page }) => {
  const saveKey = 'yuliang-save-v1';
  const initial = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}'), saveKey);
  await page.evaluate(({ key, state }) => {
    state.worldHistory = [{ year: 1, day: 337, netWorth: 42_000, businessCount: 1, relationshipCount: 2, visitedLocationCount: 3, listedBusinessCount: 1, publicFloatPercent: 35 }];
    state.simulationMode = 'paused';
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: saveKey, state: initial });
  await page.reload();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  const equityHistory = page.getByRole('region', { name: '年度公开股权记录' });
  await expect(equityHistory).toContainText('第 1 年');
  await expect(equityHistory).toContainText('上市企业 1 家');
  await expect(equityHistory).toContainText('公开流通 35%');
  await page.reload();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度公开股权记录' })).toContainText('公开流通 35%');
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

  await page.getByRole('button', { name: '生活', exact: true }).click();
  const homeRow = page.getByRole('heading', { name: '独立单间' }).locator('..').locator('..');
  await expect(homeRow).toContainText('首付');
  await homeRow.getByRole('button', { name: '分期购买' }).click();
  await expect(page.getByText('分期中')).toBeVisible();
  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('分期买下独立单间')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: '生活', exact: true }).click();
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

  await page.getByRole('button', { name: '生活', exact: true }).click();
  const homeRow = page.getByRole('heading', { name: '独立单间' }).locator('..').locator('..');
  await homeRow.getByRole('button', { name: '买作投资房' }).click();
  await homeRow.getByRole('button', { name: '开始出租' }).click();
  await expect(homeRow).toContainText('已出租');
  await expect(homeRow).toContainText('本月预计净租金');

  await page.reload();
  await page.getByRole('button', { name: '生活', exact: true }).click();
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

  await page.getByRole('button', { name: '运行 1 个月' }).click();
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

  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  const course = page.getByRole('heading', { name: '职场基础课' }).locator('xpath=ancestor::div[contains(@class, "item-row")]');
  await expect(course).toContainText('¥180');
  await course.getByRole('button', { name: '安排课程' }).click();
  await page.getByRole('button', { name: '运行 1 个月' }).click();
  await expect(page.getByRole('dialog')).toContainText('第 1 月');
  await page.getByRole('dialog').getByRole('button', { name: '进入下个月' }).click();

  await page.getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByText('完成课程：职场基础课')).toBeVisible();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
  await expect(page.getByRole('heading', { name: '职场基础课' }).locator('xpath=ancestor::div[contains(@class, "item-row")]')).toContainText('已完成');
  await page.reload();
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).click();
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
