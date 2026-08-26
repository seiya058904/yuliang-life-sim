import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import App from './App';
import { appStore } from './App';
import type { MonthlyFinancialSummary } from './game/content/contracts';

describe('余量 app flow', () => {
  beforeEach(() => { localStorage.clear(); appStore.getState().reset(1); localStorage.clear(); });

  it('shows the living clock and lets the player plan, start, and pause a week', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: '余量' })).toBeInTheDocument();
    expect(screen.getByText('第 1 周')).toBeInTheDocument();
    expect(screen.getByText('便利店店员')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /周一晚间计划/ }));
    expect(screen.getByText(/学习 4 小时/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始本周' }));
    expect(screen.getByText('运行中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('discovers an official course and schedules it into a free planning slot', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: '职场基础课' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '安排课程' })[0]);
    expect(screen.getByText('课程 · 职场基础课')).toBeInTheDocument();
  });

  it('discovers a business project only after owning the required enterprise', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, businesses: { 'business.service-studio': { businessId: 'business.service-studio', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 14500 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    const project = screen.getByRole('heading', { name: '品牌短片项目 · 完成客户合同' }).closest('.activity-card');
    expect(project).not.toBeNull();
    expect(within(project as HTMLElement).getByText('企业项目利润 · 可承接')).toBeInTheDocument();
    await user.click(within(project as HTMLElement).getByRole('button', { name: '安排到本周自由时间' }));
    expect(screen.getByText(/品牌短片项目/)).toBeInTheDocument();
  });

  it('submits a public-market application without reopening the legacy recruitment dialog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '职业' }));
    await user.click(screen.getAllByRole('button', { name: '申请职位' })[0]);
    await user.click(screen.getByRole('button', { name: '我的申请' }));
    expect(screen.getByText(/当前竞争力：/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('browses the official shop without time passing and checks out multiple items once', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('button', { name: '加入购物袋：现磨咖啡' }));
    await user.click(screen.getByRole('button', { name: '加入购物袋：实用手机' }));
    expect(screen.getByText('购物袋（2）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '一次购买' }));
    expect(screen.getByTestId('date-value')).toHaveTextContent('08:00');
    expect(screen.getByTestId('cash-value')).toHaveTextContent('¥62');
  });

  it('manages an owned durable item from the reachable shop inventory', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, inventory: { ...game.inventory, 'item.seed-phone': 1 }, itemPurchasePrices: { ...game.itemPurchasePrices, 'item.seed-phone': 420 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    expect(screen.getByRole('region', { name: '我的库存' })).toHaveTextContent('实用手机');
    await user.click(screen.getByRole('button', { name: '出售一次' }));
    expect(screen.getByTestId('cash-value')).toHaveTextContent('¥689');
    expect(screen.getByRole('region', { name: '我的库存' })).toHaveTextContent('购买商品后，会在这里管理库存。');
  });

  it('reaches an official character interaction and records the relationship outcome', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    await user.click(screen.getByRole('button', { name: /聊聊远程工作/ }));
    expect(screen.getByRole('region', { name: '消息' })).toHaveTextContent('未读 1 条');
    await user.click(screen.getByRole('button', { name: '查看消息' }));
    expect(screen.getByRole('region', { name: '消息' })).toHaveTextContent('未读 0 条');
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('和徐可聊设备 · 聊聊远程工作')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '人生记录' })).getByText(/查看消息：徐可发来新消息/)).toBeInTheDocument();
  });

  it('starts and advances the official relationship storyline from social', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    expect(screen.getByRole('heading', { name: '正在发生的故事' })).toBeInTheDocument();
    const storyline = screen.getByRole('heading', { name: '远程连接' }).closest('.item-row');
    expect(storyline).not.toBeNull();
    await user.click(within(storyline as HTMLElement).getByRole('button', { name: '开始故事' }));
    await user.click(within(storyline as HTMLElement).getByRole('button', { name: '约个时间聊聊' }));
    expect(screen.getByText('进行中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '职业' }));
    await user.click(screen.getByRole('button', { name: '工作机会' }));
    expect(screen.getByText('徐可的朋友推荐')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '申请机会' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText(/远程连接：约个时间聊聊/)).toBeInTheDocument();
  });

  it('trades an official investment through the wealth page and records both sides', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByRole('heading', { name: '灵活储蓄' })).toBeInTheDocument();
    const investmentCard = screen.getByRole('heading', { name: '灵活储蓄' }).closest('article');
    expect(investmentCard).not.toBeNull();
    await user.click(within(investmentCard as HTMLElement).getByRole('button', { name: '买入 1 份' }));
    await user.click(within(investmentCard as HTMLElement).getByRole('button', { name: '卖出 1 份' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('买入灵活储蓄')).toBeInTheDocument();
    expect(screen.getByText('卖出灵活储蓄')).toBeInTheDocument();
  });

  it('exposes operating controls for an owned business in the wealth view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByRole('heading', { name: '企业经营' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '经营地点' })).toBeInTheDocument();
    expect(screen.getByText(/中央区 · 澄川市/)).toBeInTheDocument();
    expect(screen.getByText('已访问 0 次')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '调整定价' }));
    expect(screen.getByText(/定价 3/)).toBeInTheDocument();
  });

  it('exposes an acquisition action for another unlocked business', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 15000, ability: 18, unlockedCapabilities: ['business_license', 'remote_work'], unlockedBusinessIds: ['business.seed-kiosk', 'business.online-store'], businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByRole('heading', { name: '可并购企业' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '并购 ¥8,580' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('并购线上小店')).toBeInTheDocument();
  });

  it('exposes long-run period controls from the time console', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: '运行 1 个月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运行 3 个月' })).toBeInTheDocument();
  });

  it('exposes separate business capital and funding decisions', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, capitalInvested: 0, equityPercent: 100, fundingRaised: 0, fundingRound: 0 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    await user.click(screen.getByRole('button', { name: '投入 ¥1,000' }));
    expect(screen.getByText(/已投入资本 ¥1,000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '发起融资' }));
    expect(screen.getByText(/持股 80%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续融资' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '继续融资' }));
    expect(screen.getByText(/持股 65%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '申请上市' }));
    expect(screen.getByRole('button', { name: '已上市' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '锁定至第 29 天' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '锁定至第 29 天' })[0]).toBeDisabled();
  });

  it('exposes a business exit and clears the operating panel after liquidation', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 100 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    await user.click(screen.getByRole('button', { name: '退出企业' }));
    expect(screen.queryByRole('heading', { name: '企业经营' })).not.toBeInTheDocument();
  });

  it('uses a service and manages a monthly subscription from the shop', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getAllByRole('button', { name: '使用服务' })[0]);
    const subscriptionRow = screen.getByRole('heading', { name: '基础通信套餐' }).closest('.item-row');
    expect(subscriptionRow).not.toBeNull();
    await user.click(within(subscriptionRow as HTMLElement).getByRole('button', { name: '开通订阅' }));
    await user.click(within(subscriptionRow as HTMLElement).getByRole('button', { name: '取消订阅' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('基础理发')).toBeInTheDocument();
    expect(screen.getByText('开通基础通信套餐')).toBeInTheDocument();
    expect(screen.getByText('取消基础通信套餐')).toBeInTheDocument();
  });

  it('adds a large item to the wishlist, shows progress, and completes it through the goal panel', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 2000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('button', { name: '加入愿望清单：新款手机' }));
    const wishlist = screen.getByRole('region', { name: '愿望清单' });
    expect(wishlist).toHaveTextContent('新款手机');
    await user.click(within(wishlist).getByRole('button', { name: '买下' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('愿望清单完成：新款手机')).toBeInTheDocument();
  });

  it('buys and sells a vehicle from the reachable wealth market', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 50000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    const vehicleRow = screen.getByRole('heading', { name: '实用二手小车' }).closest('.item-row');
    expect(vehicleRow).not.toBeNull();
    await user.click(within(vehicleRow as HTMLElement).getByRole('button', { name: '买入 ¥35,000' }));
    expect(within(vehicleRow as HTMLElement).getByRole('button', { name: /出售/ })).toBeInTheDocument();
    await user.click(within(vehicleRow as HTMLElement).getByRole('button', { name: /出售/ }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('买入实用二手小车')).toBeInTheDocument();
    expect(screen.getByText('出售实用二手小车')).toBeInTheDocument();
  });

  it('buys and sells a reachable home through the life view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, unlockedHousingIds: [...game.unlockedHousingIds, 'housing.seed-room'] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '生活' }));
    const home = screen.getByRole('heading', { name: '独立单间' }).closest('.item-row');
    expect(home).not.toBeNull();
    await user.click(within(home as HTMLElement).getByRole('button', { name: '买下' }));
    expect(screen.getByRole('button', { name: '出售' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '出售' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('出售独立单间')).toBeInTheDocument();
  });

  it('navigates from a rejected application hint and renders life history newest first', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({
      activeView: 'work',
      game: {
        ...game,
        lifeHistory: [
          { id: 'purchase.old', day: 1, category: 'purchase', title: '购买现磨咖啡', amount: -18 },
          { id: 'career.new', day: 3, category: 'career', title: '接受仓库助理 Offer', amount: 130 },
        ],
        applications: [{
          applicationId: 'application.rejected',
          vacancyId: 'vacancy.rejected',
          jobId: 'job.seed-remote',
          companyId: 'company.xinghe',
          salaryRange: [80, 100],
          route: 'market',
          submittedDay: 1,
          resultDay: 1,
          status: 'rejected',
          competitivenessTier: 'minimum',
          probabilityBand: 0.7,
          willReceiveOffer: false,
          feedback: ['缺少远程工具'],
        }],
      },
    });

    render(<App />);
    await user.click(screen.getByRole('button', { name: '我的申请' }));
    await user.click(screen.getByRole('button', { name: /去商店/ }));
    expect(screen.getByRole('heading', { name: '商品' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '我的' }));
    const newest = screen.getByText('接受仓库助理 Offer');
    const oldest = screen.getByText('购买现磨咖啡');
    expect(newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(within(screen.getByLabelText('人生记录')).getByRole('button', { name: '职业' }));
    expect(screen.getByText('接受仓库助理 Offer')).toBeInTheDocument();
    expect(screen.queryByText('购买现磨咖啡')).not.toBeInTheDocument();
  });

  it('shows persisted annual records in the profile view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, annualHistory: [{ year: 1, cashStart: 1000, cashEnd: 1400, netWorthStart: 1000, netWorthEnd: 1800, totalIncome: 900, totalConsumption: 500, months: 12 }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByRole('heading', { name: '年度回顾' })).toBeInTheDocument();
    expect(screen.getByText('第 1 年')).toBeInTheDocument();
    expect(screen.getByText(/收入 ¥900/)).toBeInTheDocument();
  });

  it('switches the annual review between three-year and five-year spans', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    const annualHistory = [1, 2, 3, 4, 5].map((year) => ({ year, cashStart: year * 1000, cashEnd: year * 1200, netWorthStart: year * 1000, netWorthEnd: year * 1500, totalIncome: 900, totalConsumption: 500, months: 12 }));
    appStore.setState({ game: { ...game, annualHistory } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('近 5 年净资产变化')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '近 3 年' }));
    expect(screen.getByText('近 3 年净资产变化')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '第 3 年' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '第 1 年' })).not.toBeInTheDocument();
  });

  it('shows persisted annual world snapshots alongside financial review', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, worldHistory: [{ year: 1, day: 337, netWorth: 12000, businessCount: 1, relationshipCount: 2, visitedLocationCount: 3, currentJobId: game.currentJobId }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByRole('heading', { name: '世界记录' })).toBeInTheDocument();
    expect(screen.getByText(/第 1 年 · 经营 1 家企业/)).toBeInTheDocument();
    expect(screen.getByText(/访问 3 个地点/)).toBeInTheDocument();
  });

  it('shows the long-term wealth tier without ending the life simulation', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 100_000_000_000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getAllByText('世界级财富')).toHaveLength(2);
    expect(screen.getByText('世界级财富阶段已达成 · 继续生活')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生活' })).toBeInTheDocument();
  });

  it('shows persisted wealth milestones separately from the current wealth tier', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 200_000, wealthMilestones: [{ id: 'savings', day: 28, netWorth: 12_000 }, { id: 'stable', day: 90, netWorth: 100_000 }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    const records = screen.getByRole('region', { name: '财富阶段记录' });
    expect(records).toHaveTextContent('有积蓄');
    expect(records).toHaveTextContent('稳定');
    expect(records).toHaveTextContent('第 28 天');
  });

  it('shows persisted location visits in the city view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, locationVisits: { 'location.central': 3 }, locationDevelopment: { 'location.central': 2 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '城市' }));
    expect(screen.getByRole('heading', { name: '城市与地点' })).toBeInTheDocument();
    const central = screen.getByRole('heading', { name: '中央区' }).closest('article');
    expect(central).not.toBeNull();
    expect(central).toHaveTextContent('已访问 3 次');
    expect(central).toHaveTextContent('发展阶段 2/5');
  });

  it('discovers and schedules the official short trip activity', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    const getaway = screen.getByRole('heading', { name: '周末短途旅行 · 慢慢走走' }).closest('article');
    expect(getaway).not.toBeNull();
    await user.click(within(getaway as HTMLElement).getByRole('button', { name: '安排到本周自由时间' }));
    expect(screen.getByText(/周末短途旅行 · 慢慢走走/)).toBeInTheDocument();
  });

  it('shows contact preferences in the social view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    expect(screen.getByRole('heading', { name: '人物偏好' })).toBeInTheDocument();
    expect(screen.getAllByText('偏好：吃饭')).toHaveLength(2);
  });

  it('shows the real wealth portfolio summary from homes, debt, investments and rentals', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: {
      ...game,
      cash: 7650,
      housing: { housingId: 'housing.seed-room', mode: 'owned' },
      mortgage: { housingId: 'housing.seed-room', remainingPrincipal: 4350, monthlyPayment: 199, totalMonths: 24, paidMonths: 1 },
      housingHoldings: { 'housing.seed-apartment': { housingId: 'housing.seed-apartment', purchasePrice: 12800, currentValuation: 12800, occupancy: 'rented' } },
      investments: { 'investment.flexible-savings': { investmentId: 'investment.flexible-savings', units: 10, averageCost: 1000, currentValuation: 1100, lastValuationDay: 1 } },
      assets: { 'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 1200, purchaseDay: 1, currentValuation: 1000 } },
    } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    const summary = screen.getByRole('region', { name: '财富组合摘要' });
    expect(summary).toHaveTextContent('房产总值');
    expect(summary).toHaveTextContent('现金余额');
    expect(summary).toHaveTextContent('¥7,650');
    expect(summary).toHaveTextContent('贷款余额');
    expect(summary).toHaveTextContent('房产净值');
    expect(summary).toHaveTextContent('本月净租金');
    expect(summary).toHaveTextContent('投资资产');
    expect(summary).toHaveTextContent('¥1,100');
    expect(summary).toHaveTextContent('车辆与收藏');
    expect(summary).toHaveTextContent('¥1,000');
  });

  it('shows persisted monthly portfolio history in the wealth view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    const summary = (month: number, cashStart: number, cashEnd: number, netWorthStart: number, netWorthEnd: number, investmentTransfer: number, dividend: number): MonthlyFinancialSummary => ({
      month,
      income: { group: 'income', amount: dividend, categories: { investment_dividend: dividend } },
      consumption: { group: 'consumption', amount: 300, categories: { living: 300 } },
      assetAllocation: { group: 'asset_allocation', amount: investmentTransfer, categories: { investment_transfer: investmentTransfer } },
      assetLiquidation: { group: 'asset_liquidation', amount: 0, categories: {} },
      totalIncome: dividend,
      totalConsumption: 300,
      totalAssetAllocation: investmentTransfer,
      totalAssetLiquidation: 0,
      cashStart,
      cashEnd,
      cashChange: cashEnd - cashStart,
      netWorthStart,
      netWorthEnd,
      netWorthChange: netWorthEnd - netWorthStart,
    });
    appStore.setState({ game: { ...game, financialHistory: [summary(2, 10_000, 9_700, 12_000, 12_450, 1_000, 50), summary(3, 9_700, 9_900, 12_450, 12_300, 0, 80)] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    const history = screen.getByRole('region', { name: '财富组合历史' });
    expect(history).toHaveTextContent('第 2 月');
    expect(history).toHaveTextContent('第 3 月');
    expect(history).toHaveTextContent('现金 ¥10,000 → ¥9,700');
    expect(history).toHaveTextContent('净资产 ¥12,450 → ¥12,300');
    expect(history).toHaveTextContent('投资配置 ¥1,000');
    expect(history).toHaveTextContent('分红 ¥80');
  });

  it('shows completed content milestones in the profile', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, completedMilestones: ['milestone.cash-10000'] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    const records = screen.getByRole('region', { name: '里程碑记录' });
    expect(records).toHaveTextContent('第一万现金');
    expect(records).toHaveTextContent('已达成');
  });

  it('shows persisted relationship history grouped by contact in the profile', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, lifeHistory: [
      { id: 'life.relationship.1', day: 8, category: 'relationship', title: '周妍 · 一起看看店', detail: '关系留下了新的进展', sourceId: 'interaction.business-with-zhou' },
      { id: 'life.relationship.2', day: 9, category: 'relationship', title: '查看消息：周妍发来新消息', detail: '对方想继续和你保持联系。', sourceId: 'interaction.business-with-zhou' },
    ], relationships: { ...game.relationships, 'character.seed-zhou': 12 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    const history = screen.getByRole('region', { name: '关系历史' });
    expect(history).toHaveTextContent('周妍');
    expect(history).toHaveTextContent('当前关系 12');
    expect(history).toHaveTextContent('2 次记录');
    expect(history).toHaveTextContent('一起看看店');
  });
});
