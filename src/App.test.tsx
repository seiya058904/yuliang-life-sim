import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import App from './App';
import { appStore } from './App';
import type { MonthlyFinancialSummary } from './game/content/contracts';

describe('余量 app flow', () => {
  beforeEach(() => {
    localStorage.clear();
    appStore.getState().reset(1);
    appStore.setState({ activeView: 'work' });
    localStorage.clear();
  });

  it('shows the living clock and lets the player plan, start, and pause a week', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: '余量' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '主导航' })).toHaveAttribute('data-pixel-nav', 'true');
    expect(screen.getByRole('button', { current: 'page' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('region', { name: '角色状态' })).toHaveTextContent('体能');
    expect(screen.getByText('第 1 周')).toBeInTheDocument();
    expect(screen.getByText('便利店店员')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '生活' }));
    await user.click(screen.getByRole('button', { name: /周一晚间计划/ }));
    expect(screen.getByText(/学习 4 小时/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始本周' }));
    expect(screen.getByText('运行中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('keeps simulation controls in the Life console and gives the shell a semantic settings control', async () => {
    const user = userEvent.setup();
    render(<App />);

    const header = document.querySelector('.topbar') as HTMLElement;
    expect(within(header).getByRole('button', { name: '设置' })).toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: '开始本周' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '职业' }));
    expect(within(header).queryByRole('button', { name: '开始本周' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '生活' }));
    const lifeConsole = screen.getByRole('region', { name: '生活主控制台' });
    expect(lifeConsole).toHaveClass('life-hero-dashboard');
    expect(lifeConsole).toHaveTextContent('当前时间');
    expect(lifeConsole).not.toHaveTextContent('主循环 · 现在');
    expect(within(lifeConsole).getByRole('button', { name: '开始本周' })).toBeInTheDocument();
  });

  it('returns the shared content viewport to the top when switching pages', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '生活' }));
    const main = document.querySelector('.main-content') as HTMLElement;
    main.scrollTop = 240;

    await user.click(screen.getByRole('button', { name: '职业' }));

    expect(main.scrollTop).toBe(0);
  });

  it('keeps the career market as the primary surface and gates planning tools behind a drawer', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '职业' }));

    expect(screen.getByRole('region', { name: '招聘市场布局' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '职场基础课' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '安排本周与课程' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '安排本周与课程' }));
    expect(screen.getByRole('dialog', { name: '职业工具' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '职场基础课' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭职业工具' }));
    expect(screen.queryByRole('dialog', { name: '职业工具' })).not.toBeInTheDocument();
  });

  it('keeps career page navigation out of the filter rail and exposes it from a compact toolbar menu', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '职业' }));

    const market = screen.getByRole('region', { name: '招聘市场布局' });
    const filters = market.querySelector('.career-filters') as HTMLElement;
    expect(within(filters).queryByRole('button', { name: '当前工作' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '职业页面导航' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '职业页面' }));
    expect(screen.getByRole('navigation', { name: '职业页面导航' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '当前工作' }));
    expect(screen.getByRole('heading', { name: '当前工作' })).toBeInTheDocument();
  });

  it('filters the career market from the compact region, salary, and duration toolbar', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '职业' }));

    const market = screen.getByRole('region', { name: '招聘市场布局' });
    const toolbar = market.querySelector('.career-toolbar') as HTMLElement;
    const region = within(toolbar).getByRole('combobox', { name: '地区' });
    const salary = within(toolbar).getByRole('combobox', { name: '薪资范围' });
    const duration = within(toolbar).getByRole('combobox', { name: '时长' });

    expect(region).toHaveValue('all');
    expect(salary).toHaveValue('all');
    expect(duration).toHaveValue('all');
    expect(toolbar).toHaveTextContent('公开机会 18');

    await user.selectOptions(region, 'location.central');
    expect(region).toHaveValue('location.central');
    expect(toolbar.textContent).not.toContain('公开机会 18');
  });

  it('keeps Life secondary finance and housing details reachable without stacking them into the home dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '生活' }));

    expect(screen.getByRole('button', { name: '查看生活详情' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('heading', { name: '住房' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '查看生活详情' }));
    expect(screen.getByRole('button', { name: '收起生活详情' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: '住房' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '生活信息面板' })).toBeInTheDocument();
  });

  it('groups the four reference-driven surfaces into stable visual regions', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '生活' }));
    expect(screen.getByRole('region', { name: '生活主控制台' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看生活详情' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看生活详情' }));
    expect(screen.getByRole('region', { name: '生活信息面板' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '职业' }));
    expect(screen.getByRole('region', { name: '招聘市场布局' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '商店' }));
    expect(screen.getByRole('region', { name: '商品目录布局' })).toBeInTheDocument();
  });

  it('separates canonical cash flow and asset movement in month settlement', () => {
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, simulationMode: 'monthly_summary', pendingMonthlySummary: {
      month: 1,
      resumeMode: 'planning',
      summary: { month: 1, ledger: { wageIncome: 1000, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 200, purchaseExpense: 0, livingExpense: 100, netWorthStart: 500, netWorthEnd: 1250 } },
      financial: {
        month: 1,
        income: { group: 'income', amount: 1000, categories: { wage: 1000, realized_gain: 50 } },
        consumption: { group: 'consumption', amount: 300, categories: { housing: 200, living: 100 } },
        assetAllocation: { group: 'asset_allocation', amount: 200, categories: { investment_transfer: 200 } },
        assetLiquidation: { group: 'asset_liquidation', amount: 25, categories: { asset_liquidation: 25 } },
        totalIncome: 1000, totalConsumption: 300, totalAssetAllocation: 200, totalAssetLiquidation: 25,
        cashStart: 500, cashEnd: 1025, cashChange: 525, netWorthStart: 500, netWorthEnd: 1250, netWorthChange: 750,
      },
      highlights: [{ id: 'highlight-1', kind: 'new_job', day: 28, label: '新工作 · 便利店店员' }],
    } } });

    render(<App />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('资产配置');
    expect(dialog).toHaveTextContent('资产变现');
    expect(dialog).toHaveTextContent('已实现收益');
    expect(dialog).toHaveTextContent('净资产变化');
    expect(within(dialog).getByRole('region', { name: '净资产结果' })).toHaveClass('settle-result-inverse');
    expect(dialog.querySelector('.highlight-row')).toHaveClass('highlight-row-1');
    expect(dialog).not.toHaveTextContent('✦');
    expect(dialog).not.toHaveTextContent('✧');
  });

  it('discovers an official course and schedules it into a free planning slot', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '安排本周与课程' }));
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
    const shop = screen.getByRole('region', { name: '商品目录布局' });
    await user.click(within(shop).getByRole('tab', { name: '社交' }));
    const activityPager = within(shop).queryByRole('navigation', { name: '活动分页' });
    if (activityPager) await user.click(within(activityPager).getByRole('button', { name: '下一页活动' }));
    const project = within(shop).getByRole('heading', { name: '品牌短片项目 · 完成客户合同' }).closest('.activity-card');
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
    await user.click(screen.getByRole('button', { name: '职业页面' }));
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

  it('buys and gives a preference-matching gift through the social view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 1000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('button', { name: '休闲用品' }));
    const flowers = screen.getByRole('heading', { name: '一束花' }).closest('article') as HTMLElement;
    await user.click(within(flowers).getByRole('button', { name: '加入购物袋：一束花' }));
    await user.click(screen.getByRole('button', { name: '一次购买' }));
    await user.click(screen.getByRole('button', { name: '社交' }));
    const gifts = screen.getByRole('region', { name: '礼物' });
    await user.click(within(gifts).getAllByRole('button', { name: '送 一束花（×1）' })[0]);
    expect(gifts).toHaveTextContent('准备一份礼物');
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('送给林晨：一束花')).toBeInTheDocument();
  });

  it('starts and advances the official relationship storyline from social', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    expect(screen.getByRole('heading', { name: '正在发生的故事' })).toBeInTheDocument();
    const storyline = screen.getByRole('heading', { name: '远程连接' }).closest('.item-row');
    expect(storyline).not.toBeNull();
    await user.click(within(storyline as HTMLElement).getByRole('button', { name: '开始故事' }));
    expect(within(storyline as HTMLElement).getByText('徐可：最近这段时间，你好像一直在处理很复杂的事情。')).toBeInTheDocument();
    await user.click(within(storyline as HTMLElement).getByRole('button', { name: '约个时间聊聊' }));
    expect(screen.getByText('进行中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '职业' }));
    await user.click(screen.getByRole('button', { name: '职业页面' }));
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

  it('exposes the relationship-gated partner business offer', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, ability: 18, relationships: { ...game.relationships, 'character.seed-zhou': 20 }, unlockedCapabilities: ['business_license', 'remote_work'], unlockedBusinessIds: ['business.online-store'] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByText(/合伙方案：与周妍共同经营 · 你持股 50%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '加入合伙 ¥4,200' }));
    expect(screen.getByText(/预计净利润 .*持股 50%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('加入线上小店合伙')).toBeInTheDocument();
  });

  it('exposes long-run period controls from the time console', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '生活' }));
    await user.click(screen.getByRole('button', { name: '查看生活详情' }));

    expect(screen.getByRole('button', { name: '运行 1 个月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运行 3 个月' })).toBeInTheDocument();
  });

  it('exposes separate business capital and funding decisions', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, capitalInvested: 0, equityPercent: 100, fundingRaised: 0, fundingRound: 0 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    const businessPanel = screen.getByRole('heading', { name: '企业经营' }).closest('section') as HTMLElement;
    await user.click(screen.getByRole('button', { name: '投入 ¥1,000' }));
    expect(screen.getByText(/已投入资本 ¥1,000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '发起融资' }));
    expect(within(businessPanel).getByText(/持股 80%/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续融资' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '继续融资' }));
    expect(within(businessPanel).getByText(/持股 65%/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '申请上市' }));
    expect(screen.getByRole('button', { name: '已上市' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '公开股权' })).toHaveTextContent('市场流通 35%');
    expect(screen.getAllByRole('button', { name: '锁定至第 29 天' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '锁定至第 29 天' })[0]).toBeDisabled();
  });

  it('uses persisted public float when deciding whether repurchase is available', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10_000, time: { ...game.time, day: 29 }, businesses: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 50, publicFloatPercent: 5, listed: true, listedDay: 1 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByRole('region', { name: '公开股权' })).toHaveTextContent('市场流通 5%');
    expect(screen.queryByRole('button', { name: '回购 10% 股权' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('tab', { name: '服务' }));
    await user.click(screen.getAllByRole('button', { name: '使用服务' })[0]);
    const subscriptionRow = screen.getByRole('heading', { name: '基础通信套餐' }).closest('.item-row');
    expect(subscriptionRow).not.toBeNull();
    await user.click(within(subscriptionRow as HTMLElement).getByRole('button', { name: '开通订阅' }));
    await user.click(within(subscriptionRow as HTMLElement).getByRole('button', { name: '取消订阅' }));
    expect(screen.getByRole('region', { name: '服务与订阅' })).toHaveTextContent('基础理发');
    expect(screen.getByRole('region', { name: '服务与订阅' })).toHaveTextContent('最近服务记录');
    expect(screen.getByRole('region', { name: '服务记录' })).toHaveTextContent('基础理发');
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('基础理发')).toBeInTheDocument();
    expect(screen.getByText('开通基础通信套餐')).toBeInTheDocument();
    expect(screen.getByText('取消基础通信套餐')).toBeInTheDocument();
  });

  it('keeps the shop catalog scoped to the selected activity tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    const shop = screen.getByRole('region', { name: '商品目录布局' });
    expect(within(shop).queryAllByRole('heading', { name: '看电影 · 普通影厅' })).toHaveLength(0);
    await user.click(within(shop).getByRole('tab', { name: '娱乐' }));
    expect(within(shop).getAllByRole('heading', { name: '看电影 · 普通影厅' }).length).toBeGreaterThan(0);
    expect(within(shop).queryAllByRole('heading', { name: '旧城文化日 · 看一场展览' })).toHaveLength(0);
    await user.click(within(shop).getByRole('tab', { name: '学习' }));
    expect(within(shop).getByRole('heading', { name: '旧城文化日 · 看一场展览' })).toBeInTheDocument();
  });

  it('shows semantic segmented meters on every visible shop catalog card', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    const shop = screen.getByRole('region', { name: '商品目录布局' });
    const itemCards = Array.from(shop.querySelectorAll('[data-catalog-card]'));
    expect(itemCards).toHaveLength(12);
    itemCards.forEach((card) => expect(card.querySelectorAll('.catalog-meter-row')).toHaveLength(2));

    await user.click(within(shop).getByRole('tab', { name: '娱乐' }));
    const activityCards = Array.from(shop.querySelectorAll('[data-catalog-card]'));
    expect(activityCards.length).toBeGreaterThan(0);
    activityCards.forEach((card) => expect(card.querySelectorAll('.catalog-meter-row')).toHaveLength(2));
  });

  it('keeps the entertainment catalog paged within the compact three-column surface', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    const shop = screen.getByRole('region', { name: '商品目录布局' });
    await user.click(within(shop).getByRole('tab', { name: '娱乐' }));
    const grid = shop.querySelector('.activity-grid');
    expect(grid).not.toBeNull();
    expect(grid?.children).toHaveLength(12);
    expect(within(shop).getByRole('navigation', { name: '活动分页' })).toBeInTheDocument();

    const firstPageTitle = grid?.querySelector('h3')?.textContent;
    await user.click(within(shop).getByRole('button', { name: '下一页活动' }));
    expect(grid?.children.length).toBeGreaterThan(0);
    expect(grid?.querySelector('h3')?.textContent).not.toBe(firstPageTitle);
  });

  it('gives shop cards one clear primary action and a semantic pixel silhouette', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '商店' }));

    const shop = screen.getByRole('region', { name: '商品目录布局' });
    const expectedIcons = [['现磨咖啡', 'coffee'], ['实用手机', 'phone'], ['轻薄笔记本电脑', 'laptop'], ['简洁书桌', 'desk'], ['合身衬衫', 'hoodie'], ['电影票', 'film'], ['实用书籍', 'book']] as const;
    for (const [title, illustration] of expectedIcons) {
      const card = Array.from(shop.querySelectorAll<HTMLElement>('[data-catalog-card]')).find((entry) => entry.querySelector('h2')?.textContent === title);
      expect(card).not.toBeNull();
      expect(card?.querySelector(`.pixel-illustration.il-${illustration}`)).not.toBeNull();
    }

    const itemCard = screen.getByRole('heading', { name: '实用手机' }).closest('[data-catalog-card]') as HTMLElement;
    expect(itemCard.querySelectorAll('button.primary-button')).toHaveLength(1);
    expect(itemCard.querySelector('.button-pair')).toBeNull();
    expect(itemCard.querySelector('.catalog-secondary-action')).not.toBeNull();
  });

  it('keeps the Life plan header compact instead of presenting a webpage slogan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '生活' }));

    expect(screen.getByRole('heading', { name: '本周计划' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '把时间留给什么' })).not.toBeInTheDocument();
  });

  it('gives an empty market insight panel a complete visual state', () => {
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, vacancies: [] } });
    render(<App />);

    const insight = screen.getByText('市场洞察').closest('.career-bottom-panel') as HTMLElement;
    expect(insight).not.toBeNull();
    expect(insight).toHaveClass('career-bottom-insight');
    expect(within(insight).getByText('本期暂无公开机会')).toBeInTheDocument();
    expect(within(insight).getByLabelText('市场洞察空态')).toBeInTheDocument();
  });

  it('discovers the expanded daily service and subscription content', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 1000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '服务' }));
    const styling = screen.getByRole('heading', { name: '专业形象咨询' }).closest('.item-row');
    expect(styling).not.toBeNull();
    await user.click(within(styling as HTMLElement).getByRole('button', { name: '使用服务' }));
    expect(screen.getByRole('region', { name: '服务记录' })).toHaveTextContent('专业形象咨询');
    const nutrition = screen.getByRole('heading', { name: '营养餐计划' }).closest('.item-row') as HTMLElement;
    await user.click(within(nutrition).getByRole('button', { name: '使用服务' }));
    expect(screen.getByRole('region', { name: '服务记录' })).toHaveTextContent('营养餐计划');
    const fitness = screen.getByRole('heading', { name: '基础体能评估' }).closest('.item-row') as HTMLElement;
    await user.click(within(fitness).getByRole('button', { name: '使用服务' }));
    expect(screen.getByRole('region', { name: '服务记录' })).toHaveTextContent('基础体能评估');

    const video = screen.getByRole('heading', { name: '视频会员' }).closest('.item-row');
    expect(video).not.toBeNull();
    await user.click(within(video as HTMLElement).getByRole('button', { name: '开通订阅' }));
    expect(within(video as HTMLElement).getByRole('button', { name: '取消订阅' })).toBeInTheDocument();
  });

  it('uses the vehicle annual service from the shop when a vehicle is owned', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 1000, assets: { 'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 35000 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '服务' }));
    const service = screen.getByRole('heading', { name: '车辆年度保养' }).closest('.item-row');
    expect(service).not.toBeNull();
    await user.click(within(service as HTMLElement).getByRole('button', { name: '使用服务' }));
    expect(screen.getByRole('region', { name: '服务记录' })).toHaveTextContent('车辆年度保养');
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

  it('shows persisted vehicle maintenance records in the wealth view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, assets: { 'asset.used-compact': { assetId: 'asset.used-compact', purchasePrice: 35000, purchaseDay: 1, currentValuation: 34900 } }, financialLedger: { month: 2, nextSequence: 2, entries: [{ id: 'ledger.vehicle.1', day: 28, direction: 'expense', group: 'consumption', category: 'maintenance', amount: 300, cashDelta: -300, sourceType: 'vehicle', sourceId: 'asset.used-compact', label: '实用二手小车车辆成本' }], cashStart: 50000, netWorthStart: 50000 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    expect(screen.getByRole('region', { name: '车辆维护记录' })).toHaveTextContent('实用二手小车车辆成本');
  });

  it('buys and sells a reachable home through the life view', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 10000, unlockedHousingIds: [...game.unlockedHousingIds, 'housing.seed-room'] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '生活' }));
    await user.click(screen.getByRole('button', { name: '查看生活详情' }));
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
    await user.click(screen.getByRole('button', { name: '职业页面' }));
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
    appStore.setState({ game: { ...game, annualHistory: [{ year: 1, cashStart: 1000, cashEnd: 1400, netWorthStart: 1000, netWorthEnd: 1800, totalIncome: 900, totalConsumption: 500, months: 12 }], worldHistory: [{ year: 1, day: 337, netWorth: 1800, businessCount: 0, relationshipCount: 2, relationshipValues: { 'character.seed-zhou': 42 }, companyStates: { 'company.yuanwang': '门店与社区零售' }, visitedLocationCount: 1 }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByRole('heading', { name: '年度回顾' })).toBeInTheDocument();
    expect(screen.getByText('第 1 年')).toBeInTheDocument();
    expect(screen.getByText(/收入 ¥900/)).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: '年度回顾' }).closest('section') as HTMLElement).getByText(/联系人 2 人/)).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: '年度回顾' }).closest('section') as HTMLElement).getByText(/周妍 42/)).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: '年度回顾' }).closest('section') as HTMLElement).getByText(/远望零售：门店与社区零售/)).toBeInTheDocument();
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
    appStore.setState({ game: { ...game, worldHistory: [{ year: 1, day: 337, netWorth: 12000, businessCount: 1, relationshipCount: 2, visitedLocationCount: 3, relationshipValues: { 'character.seed-zhou': 42 }, characterCareerStates: { 'character.seed-lin': '远望零售 · 门店员工' }, companyStates: { 'company.yuanwang': '持续经营' }, listedBusinessCount: 1, publicFloatPercent: 35, currentJobId: game.currentJobId }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByRole('heading', { name: '世界记录' })).toBeInTheDocument();
    expect(screen.getByText(/第 1 年 · 经营 1 家企业/)).toBeInTheDocument();
    expect(screen.getByText(/访问 3 个地点/)).toBeInTheDocument();
    expect(screen.getByText(/周妍 42/)).toBeInTheDocument();
    expect(screen.getByText(/林晨：远望零售 · 门店员工/)).toBeInTheDocument();
    expect(screen.getByText(/远望零售：持续经营/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '年度公开股权记录' })).toHaveTextContent('公开流通 35%');
  });

  it('starts and completes the investment storyline after entering the fund market', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, investments: { 'investment.broad-market-index': { investmentId: 'investment.broad-market-index', units: 1, averageCost: 108, currentValuation: 108, lastValuationDay: 1 } } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    const storyline = screen.getByRole('heading', { name: '第一次买基金' }).closest('.item-row') as HTMLElement;
    await user.click(within(storyline).getByRole('button', { name: '开始故事' }));
    expect(storyline).toHaveTextContent('你已经开始把钱放进投资里了');
    await user.click(within(storyline).getByRole('button', { name: '先从低风险开始' }));
    await user.click(within(storyline).getByRole('button', { name: '把投资留在生活计划里' }));
    await user.click(screen.getByRole('button', { name: '我的' }));
    expect(screen.getByText('第一次买基金：把投资留在生活计划里')).toBeInTheDocument();
  });

  it('shows annual public business equity positions in world history', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, worldHistory: [{ year: 1, day: 337, netWorth: 12000, businessCount: 1, relationshipCount: 0, visitedLocationCount: 0, listedBusinessCount: 1, publicFloatPercent: 35, publicBusinessEquities: { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', percent: 10, investedAmount: 208, currentValue: 220 } } }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));

    expect(screen.getByRole('region', { name: '年度公开股权记录' })).toHaveTextContent('早餐与咖啡档 10% · 年末估值 ¥220');
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
    appStore.setState({ game: { ...game, locationVisits: { 'location.central': 3 }, locationDevelopment: { 'location.central': 2 }, ambientLog: [{ day: 12, text: '中央区的夜间公交延长了运营时间。' }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '城市' }));
    expect(screen.getByRole('heading', { name: '城市与地点' })).toBeInTheDocument();
    const central = screen.getByRole('heading', { name: '中央区' }).closest('article');
    expect(central).not.toBeNull();
    expect(central).toHaveTextContent('已访问 3 次');
    expect(central).toHaveTextContent('发展阶段 2/5');
    expect(screen.getByRole('region', { name: '城市见闻' })).toHaveTextContent('夜间公交延长');
  });

  it('discovers a venue and reaches its executable activity entry', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '城市' }));
    const venue = screen.getByRole('heading', { name: '云庭咖啡' }).closest('article');
    expect(venue).not.toBeNull();
    expect(venue).toHaveTextContent('去咖啡馆坐一会');
    await user.click(within(venue as HTMLElement).getByRole('button', { name: '去安排活动' }));
    expect(screen.getByRole('heading', { name: '娱乐与生活活动' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '去咖啡馆坐一会 · 只是休息' })).toBeInTheDocument();
  });

  it('discovers the bookstore venue and its knowledge activity', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '城市' }));
    const venue = screen.getByRole('heading', { name: '叶脉书店' }).closest('article') as HTMLElement;
    expect(venue).toHaveTextContent('周末逛书店');
    await user.click(within(venue).getByRole('button', { name: '去安排活动' }));
    expect(screen.getByRole('heading', { name: '周末逛书店 · 随便逛逛' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '周末逛书店 · 和周妍一起逛' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '周末逛书店 · 和林晨一起逛' })).toBeInTheDocument();
  });

  it('discovers and schedules the official short trip activity', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '旅行' }));
    const getaway = screen.getByRole('heading', { name: '周末短途旅行 · 慢慢走走' }).closest('article');
    expect(getaway).not.toBeNull();
    expect(screen.getByRole('heading', { name: '周末短途旅行 · 临江夜游' })).toBeInTheDocument();
    await user.click(within(getaway as HTMLElement).getByRole('button', { name: '安排到本周自由时间' }));
    expect(screen.getByText(/周末短途旅行 · 慢慢走走/)).toBeInTheDocument();
  });

  it('discovers and schedules the relationship-gated cinema outing with Zhou', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, relationships: { ...game.relationships, 'character.seed-zhou': 6 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '娱乐' }));
    const outing = screen.getByRole('heading', { name: '看电影 · 和周妍看一场' }).closest('article');
    expect(outing).not.toBeNull();
    await user.click(within(outing as HTMLElement).getByRole('button', { name: '安排到本周自由时间' }));
    expect(screen.getByText(/看电影 · 和周妍看一场/)).toBeInTheDocument();
  });

  it('discovers and schedules the old-town cultural trip', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '学习' }));
    const outing = screen.getByRole('heading', { name: '旧城文化日 · 看一场展览' }).closest('article');
    expect(outing).not.toBeNull();
    await user.click(within(outing as HTMLElement).getByRole('button', { name: '安排到本周自由时间' }));
    expect(screen.getByText(/旧城文化日 · 看一场展览/)).toBeInTheDocument();
  });

  it('shows an actionable acquisition hint for a gated activity', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, cash: 5000 } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '学习' }));
    const hints = screen.getByRole('region', { name: '活动获取提示' });
    expect(hints).toHaveTextContent('城市摄影练习 · 街区取景');
    expect(hints).toHaveTextContent('需要商品 复古相机');
    expect(within(hints).getByRole('button', { name: '购买 复古相机' })).toBeEnabled();
  });

  it('shows and enforces the travel cooldown in the activity market', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: { ...game, time: { ...game.time, day: 15 }, lifeHistory: [{ id: 'life.activity.last-trip', day: 10, category: 'activity', title: '周末短途旅行 · 慢慢走走', sourceId: 'activity.weekend-getaway' }] } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('tab', { name: '旅行' }));
    const getaway = screen.getByRole('heading', { name: '周末短途旅行 · 慢慢走走' }).closest('article') as HTMLElement;
    expect(within(getaway).getAllByText('冷却中 · 还需 9 天')).toHaveLength(2);
    expect(within(getaway).getByRole('button', { name: '冷却中 · 还需 9 天' })).toBeDisabled();
  });

  it('shows contact preferences in the social view', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    expect(screen.getByRole('heading', { name: '人物偏好' })).toBeInTheDocument();
    expect(screen.getAllByText('偏好：吃饭').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the authored NPC career history available in the current year', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '社交' }));
    const lin = screen.getByRole('heading', { name: '林晨', level: 2 }).closest('article') as HTMLElement;
    expect(lin).toHaveTextContent('职业经历');
    expect(lin).toHaveTextContent('第 1 年 · 远望零售 · 门店员工');
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
    const allocation = screen.getByRole('region', { name: '财富配置' });
    expect(allocation).toHaveTextContent('现金');
    expect(allocation).toHaveTextContent('金融投资');
    expect(allocation).toHaveTextContent('投资房');
  });

  it('shows holding cost, valuation and return details for an investment', async () => {
    const user = userEvent.setup();
    const game = appStore.getState().game;
    appStore.setState({ game: {
      ...game,
      time: { ...game.time, day: 40 },
      investments: { 'investment.broad-market-index': { investmentId: 'investment.broad-market-index', units: 10, averageCost: 100, currentValuation: 1150, lastValuationDay: 40 } },
    } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '财富' }));
    const investment = screen.getByRole('heading', { name: '广域市场指数基金' }).closest('article') as HTMLElement;
    expect(investment).toHaveTextContent('已投入');
    expect(investment).toHaveTextContent('¥1,000');
    expect(investment).toHaveTextContent('持有 10 份');
    expect(investment).toHaveTextContent('平均成本');
    expect(investment).toHaveTextContent('当前价值');
    expect(investment).toHaveTextContent('未实现收益');
    expect(investment).toHaveTextContent('+¥150');
    expect(investment).toHaveTextContent('30 日变化');
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
      { id: 'life.relationship.3', day: 40, category: 'relationship', title: '周妍 · 后续联系', detail: '关系留下了新的进展', sourceId: 'interaction.business-with-zhou' },
    ], worldHistory: [{ year: 1, day: 337, netWorth: 12000, businessCount: 0, relationshipCount: 2, visitedLocationCount: 1 }], relationships: { ...game.relationships, 'character.seed-zhou': 12 } } });
    render(<App />);

    await user.click(screen.getByRole('button', { name: '我的' }));
    const history = screen.getByRole('region', { name: '关系历史' });
    expect(history).toHaveTextContent('周妍');
    expect(history).toHaveTextContent('当前关系 12');
    expect(history).toHaveTextContent('3 次记录');
    expect(history).toHaveTextContent('一起看看店');
    expect(history).toHaveTextContent('第 1 月 · 2 次关系记录');
    expect(history).toHaveTextContent('第 2 月 · 1 次关系记录');
    expect(history).toHaveTextContent('第 1 年 · 联系人 2 人');
  });
});
