import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
  await page.getByRole('button', { name: '职业', exact: true }).click();
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
