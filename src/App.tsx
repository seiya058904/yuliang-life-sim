import { useEffect, useMemo, useState } from 'react';
import { balanceConfig } from './game/balance/config';
import { contentRegistry } from './game/content/registry';
import type { ContentId, GameAction, GameState, PlannedActivity, PlanSlot, ViewId, Weekday } from './game/content/contracts';
import { calculateDailyBusinessProfit, calculateLifestyle, calculateNetWorth, wealthTierForNetWorth } from './game/engine/economy';
import { activityAtTime, deriveActivityProgress, defaultJobSchedule, getDailyActivities } from './game/engine/schedule';
import { formatClock, formatDate, absoluteMinute } from './game/engine/time';
import { calendarForDay, weekdayLabel } from './game/engine/calendar';
import { getItemCost } from './game/engine/actions';
import { createGameStore } from './game/store/gameStore';
import { explainCondition, evaluateCondition } from './game/engine/conditions';
import { getAttribute } from './game/engine/attributes';
import { investmentUnitValue } from './game/engine/investments';
import { summarizeFinancialLedger } from './game/engine/financialLedger';
import { CareerView } from './game/ui/CareerView';
import { LifeHistoryList } from './game/ui/LifeHistoryList';
import { forecastWeeklyPlan } from './game/engine/forecast';
import { housingMortgageTerms, housingPrice, housingRentPerDay, locationSummary, locationForCurrentJob } from './game/engine/locations';
import { getStorylineStage } from './game/engine/storylines';
import { getDialogue } from './game/engine/dialogue';
import { activityCashCost, activityCooldownRemaining, activityDiscountLabel, interestFamiliarityLabel, interestFamiliarityStage } from './game/engine/activities';
import { serviceCooldownRemaining } from './game/engine/services';
import './styles.css';

export const appStore = createGameStore(contentRegistry, balanceConfig);
const gameStore = appStore;
const navItems = [
  ['life', '生活'], ['work', '职业'], ['shop', '商店'], ['wealth', '财富'], ['relations', '社交'], ['city', '城市'], ['profile', '我的'],
] as const;
const speedMinutesPerSecond = { 1: 360, 2: 720, 4: 1440 } as const;

function money(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

const categoryLabels: Record<string, string> = {
  consumable: '日用品', technology: '科技', clothing: '服装', furniture: '家居', leisure_item: '休闲用品', entertainment: '休闲用品', luxury: '奢侈品', collectible: '收藏品',
};
const interactionCategoryLabels: Record<string, string> = { meal: '吃饭', work: '工作话题', outing: '出行', travel: '旅行', gift: '礼物', business: '经营' };
const attributeLabels: Record<string, string> = { professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情' };
const statLabels: Record<string, string> = { ability: '能力', reputation: '声誉', lifestyle: '生活水平' };
const capabilityLabels: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };
const financialLabels: Record<string, string> = { wage: '工资', side_job: '兼职', bonus: '奖金', business_income: '企业收入', property_income: '房产收入', investment_dividend: '投资分红', event_income: '事件收入', other_income: '其他收入', housing: '住房', living: '基础生活', food: '餐饮', transport: '交通', communication: '通讯', shopping: '购物', entertainment: '娱乐', social: '社交', education: '教育', travel: '旅行', service: '服务', maintenance: '维修', business_cost: '企业成本', other_expense: '其他消费', investment_transfer: '投资配置', property_transfer: '房产配置', business_transfer: '企业配置', collectible_transfer: '收藏配置', asset_liquidation: '资产变现' };
const investmentRiskLabels: Record<string, string> = { low: '低', medium: '中', high: '高' };
const investmentKindLabels: Record<string, string> = { savings: '储蓄', fund: '基金', gold: '黄金', stock: '股票', reit: '房产基金', company_equity: '企业股权', property_fund: '房产基金', private_equity: '私人股权' };

function acquisitionRoute(condition: Parameters<typeof explainCondition>[0]): { view: ViewId; label: string } {
  switch (condition.type) {
    case 'relationship_at_least':
    case 'relationship_stage_at_least':
      return { view: 'relations', label: '去社交推进关系' };
    case 'owns_item':
      return { view: 'shop', label: '去商店准备商品' };
    case 'has_capability':
    case 'flag':
    case 'completed_event':
      return { view: 'relations', label: '去社交寻找机会' };
    case 'cash_at_least':
    case 'owns_asset':
    case 'owns_investment':
    case 'housing_is':
      return { view: 'wealth', label: '去财富页查看准备项' };
    default:
      return { view: 'work', label: '去职业页提升条件' };
  }
}

function AcquisitionHint({ condition, game, onNavigate }: { condition: Parameters<typeof explainCondition>[0]; game: GameState; onNavigate: (view: ViewId) => void }) {
  const route = acquisitionRoute(condition);
  return <div className="requirement-box"><strong>获取路径</strong><span className="requirement-missing">{explainCondition(condition, game, contentRegistry, balanceConfig)}</span><button className="text-button" onClick={() => onNavigate(route.view)}>{route.label}</button></div>;
}

function AcquisitionRequirementsPanel({ game, onNavigate, scope }: { game: GameState; onNavigate: (view: ViewId) => void; scope: 'shop' | 'life' | 'wealth' }) {
  const entries: Array<{ id: string; name: string; condition: Parameters<typeof explainCondition>[0] }> = [];
  if (scope === 'shop') contentRegistry.items.filter((item) => item.requirements && !evaluateCondition(item.requirements, game, contentRegistry, balanceConfig)).forEach((item) => entries.push({ id: item.id, name: item.name, condition: item.requirements! }));
  if (scope === 'life') contentRegistry.housing.filter((home) => home.requirements && !game.unlockedHousingIds.includes(home.id) && !evaluateCondition(home.requirements, game, contentRegistry, balanceConfig)).forEach((home) => entries.push({ id: home.id, name: home.name, condition: home.requirements! }));
  if (scope === 'wealth') {
    contentRegistry.investments?.filter((investment) => investment.requirements && !evaluateCondition(investment.requirements, game, contentRegistry, balanceConfig)).forEach((investment) => entries.push({ id: investment.id, name: investment.name, condition: investment.requirements! }));
    contentRegistry.assets.filter((asset) => asset.requirements && !game.unlockedAssetIds.includes(asset.id) && !evaluateCondition(asset.requirements, game, contentRegistry, balanceConfig)).forEach((asset) => entries.push({ id: asset.id, name: asset.name, condition: asset.requirements! }));
  }
  if (!entries.length) return null;
  return <section className="detail-panel" aria-label="获取路径"><div className="section-heading compact"><div><span className="eyebrow">条件透明</span><h2>还差什么，下一步去哪</h2></div><p>锁定内容会显示真实条件和现有可执行入口；满足后回来即可继续操作。</p></div><div className="item-list">{entries.map((entry) => <div className="item-row" key={entry.id}><div><h3>{entry.name}</h3></div><AcquisitionHint condition={entry.condition} game={game} onNavigate={onNavigate} /></div>)}</div></section>;
}

function App() {
  const game = gameStore((store) => store.game);
  const activeView = gameStore((store) => store.activeView);
  const effects = gameStore((store) => store.effects);
  const lastError = gameStore((store) => store.lastError);
  const dispatch = gameStore((store) => store.dispatch);
  const setView = gameStore((store) => store.setView);
  const consumeEffects = gameStore((store) => store.consumeEffects);
  const reset = gameStore((store) => store.reset);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (game.simulationMode !== 'running') return undefined;
    let frame = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(120, now - last);
      last = now;
      carry += elapsed / 1000 * speedMinutesPerSecond[game.simulationSpeed];
      const minutes = Math.floor(carry);
      carry -= minutes;
      if (minutes > 0) dispatch({ type: 'advance_simulation', minutes });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dispatch, game.simulationMode, game.simulationSpeed]);

  useEffect(() => {
    if (!effects.length) return undefined;
    const timeout = window.setTimeout(consumeEffects, 2400);
    return () => window.clearTimeout(timeout);
  }, [effects, consumeEffects]);

  const netWorth = useMemo(() => calculateNetWorth(game, contentRegistry, balanceConfig), [game]);
  const lifestyle = useMemo(() => calculateLifestyle(game, contentRegistry), [game]);
  const pendingEvent = game.pendingEventId ? contentRegistry.events.find((event) => event.id === game.pendingEventId) : undefined;
  const activeRecruitment = game.activeRecruitment ? contentRegistry.jobs.find((job) => job.id === game.activeRecruitment?.jobId) : undefined;

  return (
    <div className={`app-shell mode-${game.simulationMode}`}>
      <header className="topbar">
        <div className="brand-block"><h1 className="brand-mark">余量</h1><span className="brand-subtitle">自动人生循环</span></div>
        <div className="status-line" aria-label="当前状态">
          <span data-testid="date-value">{formatDate(game.time)}</span>
          <span><b>第 {game.calendar.week} 周</b> · 周{weekdayLabel(game.calendar.weekday)}</span>
          <span data-testid="cash-value"><b>现金</b> {money(game.cash)}</span>
          <span><b>净资产</b> {money(netWorth)}</span>
        </div>
      </header>

      <nav className="main-nav" aria-label="主导航">
        {navItems.map(([id, label]) => <button key={id} className={activeView === id ? 'nav-item active' : 'nav-item'} onClick={() => setView(id)}>{label}</button>)}
      </nav>

      <main className="main-content">
        <TimeConsole game={game} dispatch={dispatch} />
        <section className="metric-strip" aria-label="成长指标">
          <Metric label="生活水平" value={lifestyle} /><Metric label="能力" value={game.ability} /><Metric label="声誉" value={game.reputation} /><Metric label="关系" value={Object.values(game.relationships).reduce((sum, value) => sum + value, 0)} />
        </section>
        {lastError && <div className="notice error" role="alert">{lastError}</div>}
        {activeView === 'life' && <><LifeView game={game} dispatch={dispatch} /><AcquisitionRequirementsPanel game={game} onNavigate={setView} scope="life" /></>}
        {activeView === 'work' && <><CareerView game={game} dispatch={dispatch} jobs={contentRegistry.jobs} onNavigate={setView} /><section className="planning-section"><div className="section-heading compact"><div><span className="eyebrow">周计划</span><h2>安排本周</h2></div><p>正式工作自动占用；下方数值均为预计。</p></div><WeekPlanner game={game} dispatch={dispatch} /></section><CourseMarket game={game} dispatch={dispatch} /><ForecastPanel game={game} /></>}
        {activeView === 'shop' && <><ShopView game={game} dispatch={dispatch} /><AcquisitionRequirementsPanel game={game} onNavigate={setView} scope="shop" /><ActivityAcquisitionHints game={game} dispatch={dispatch} /><InventoryPanel game={game} dispatch={dispatch} /><WishlistPanel game={game} dispatch={dispatch} /><ServiceMarket game={game} dispatch={dispatch} /></>}
        {activeView === 'wealth' && <><AssetsView game={game} dispatch={dispatch} /><AcquisitionRequirementsPanel game={game} onNavigate={setView} scope="wealth" /><BusinessOperationsView game={game} dispatch={dispatch} /><BusinessPublicFloatView game={game} /><BusinessLocationSummary game={game} dispatch={dispatch} /><PortfolioSummary game={game} /><PortfolioAllocation game={game} /><PortfolioHistory game={game} /></>}
        {activeView === 'relations' && <><RelationsView game={game} dispatch={dispatch} /><GiftPanel game={game} dispatch={dispatch} /><CharacterPreferenceSummary game={game} /><StorylinePanel game={game} dispatch={dispatch} /></>}
        {activeView === 'city' && <CityView game={game} onNavigate={setView} />}
        {activeView === 'profile' && <><ProfileView game={game} netWorth={netWorth} lifestyle={lifestyle} onReset={() => setResetOpen(true)} /><WealthMilestoneView game={game} /><MilestoneProgressView game={game} /><AnnualHistoryView game={game} /><WorldHistoryView game={game} /><WorldEquityHistoryView game={game} /></>}
      </main>

      <footer className="footer-note">你负责规划，世界负责继续运行。</footer>
      {pendingEvent && <EventModal event={pendingEvent} onChoose={(choiceId) => dispatch({ type: 'choose_event', eventId: pendingEvent.id, choiceId })} />}
      {activeRecruitment && game.activeRecruitment && <RecruitmentModal game={game} job={activeRecruitment} dispatch={dispatch} />}
      {game.pendingReward && <RewardModal reward={game.pendingReward} dispatch={dispatch} />}
      {game.activeResignation && <ResignationModal game={game} dispatch={dispatch} />}
      {game.pendingMonthlySummary && <MonthlySummaryModal game={game} dispatch={dispatch} />}
      {effects.length > 0 && <EffectRail effects={effects} />}
      {resetOpen && <ConfirmReset onCancel={() => setResetOpen(false)} onConfirm={() => { reset(); setResetOpen(false); }} />}
    </div>
  );
}

function CityView({ game, onNavigate }: { game: GameState; onNavigate: (view: ViewId) => void }) {
  const home = contentRegistry.housing.find((entry) => entry.id === game.housing.housingId);
  const jobLocation = locationForCurrentJob(game, contentRegistry);
  const ambientLog = (game.ambientLog ?? []).slice(-6);
  return <section className="city-section">
    <div className="section-heading compact"><div><span className="eyebrow">澄川市</span><h1>城市与地点</h1></div><p>地点会影响通勤反馈与每日交通费用；访问次数只是记录，不是新的玩家等级。</p></div>
    <div className="item-grid">{locationSummary(contentRegistry).map((location) => <article className="item-card" key={location.id}><div className="job-card-head"><span className="job-kind">{location.region}</span><span className="muted">{location.id === home?.locationId ? '当前居住' : location.id === jobLocation?.id ? '当前工作' : '可发现'}</span></div><h2>{location.name}</h2><p>{location.description}</p><span className="muted">发展阶段 {game.locationDevelopment?.[location.id] ?? 0}/5 · 交通系数 ×{location.transportCostMultiplier.toFixed(2)} · 已访问 {game.locationVisits?.[location.id] ?? 0} 次</span></article>)}</div>
    <section className="detail-panel" aria-label="城市场所"><div className="section-heading compact"><div><span className="eyebrow">Venue 网络</span><h2>城市里的场所</h2></div><p>先查看一个真实场所，再进入商店安排它承载的活动；执行后仍按正常规则结算并记录。</p></div><div className="item-grid">{(contentRegistry.venues ?? []).map((venue) => { const location = contentRegistry.locations?.find((entry) => entry.id === venue.locationId); const activities = venue.activityIds.map((id) => contentRegistry.activities?.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)); return <article className="item-card" key={venue.id}><div className="job-card-head"><span className="job-kind">{location?.name ?? venue.locationId}</span><span className="muted">{venue.priceRange ?? '按活动计费'}</span></div><h2>{venue.name}</h2><p>{venue.description}</p><div className="item-effect">可承载：{activities.map((activity) => activity.name).join('、')}</div><button className="secondary-button" onClick={() => onNavigate('shop')}>去安排活动</button></article>; })}</div></section>
    <section className="detail-panel" aria-label="城市见闻"><div className="section-heading compact"><div><span className="eyebrow">低频世界变化</span><h2>城市见闻</h2></div><p>这里保留自动运行中偶尔遇到的环境变化，不提供强制奖励。</p></div>{ambientLog.length ? <div className="item-list">{ambientLog.map((entry) => <div className="item-row" key={`${entry.day}-${entry.text}`}><span className="job-kind">第 {entry.day} 天</span><p>{entry.text}</p></div>)}</div> : <p className="muted">城市开始运行后，这里会留下偶尔发生的见闻。</p>}</section>
  </section>;
}

function PortfolioSummary({ game }: { game: GameState }) {
  const currentHome = contentRegistry.housing.find((home) => home.id === game.housing.housingId);
  const currentHomeValue = game.housing.mode === 'owned' && currentHome ? (housingPrice(game, currentHome) ?? currentHome.valuation ?? 0) : 0;
  const holdingValue = Object.values(game.housingHoldings ?? {}).reduce((total, holding) => total + holding.currentValuation, 0);
  const propertyValue = currentHomeValue + holdingValue;
  const mortgage = game.mortgage?.remainingPrincipal ?? 0;
  const rentalCashFlow = Object.values(game.housingHoldings ?? {}).reduce((total, holding) => {
    if (holding.occupancy !== 'rented') return total;
    const home = contentRegistry.housing.find((entry) => entry.id === holding.housingId);
    return total + (home ? Math.round(housingRentPerDay(game, home) * 28 * 0.88) : 0);
  }, 0);
  const investmentValue = Object.values(game.investments ?? {}).reduce((total, holding) => total + holding.currentValuation, 0);
  const vehicleAndCollectibleValue = Object.values(game.assets).reduce((total, holding) => total + holding.currentValuation, 0);
  return <section className="detail-panel" aria-label="财富组合摘要"><div className="section-heading compact"><div><span className="eyebrow">资产结构</span><h2>我的财富组合</h2></div><p>把现金、现金流、资产估值和贷款余额分开看；估值变化不是现金收入。</p></div><div className="profile-grid"><div className="info-panel"><span>现金余额</span><strong>{money(game.cash)}</strong></div><div className="info-panel"><span>房产总值</span><strong>{money(propertyValue)}</strong></div><div className="info-panel"><span>贷款余额</span><strong>{money(mortgage)}</strong></div><div className="info-panel"><span>房产净值</span><strong>{money(propertyValue - mortgage)}</strong></div><div className="info-panel"><span>本月净租金</span><strong>{rentalCashFlow >= 0 ? '+' : '-'}{money(Math.abs(rentalCashFlow))}</strong></div><div className="info-panel"><span>投资资产</span><strong>{money(investmentValue)}</strong></div><div className="info-panel"><span>车辆与收藏</span><strong>{money(vehicleAndCollectibleValue)}</strong></div></div></section>;
}

function PortfolioAllocation({ game }: { game: GameState }) {
  const home = contentRegistry.housing.find((entry) => entry.id === game.housing.housingId);
  const categories = [
    ['现金', game.cash],
    ['自住房净值', game.housing.mode === 'owned' && home ? Math.max(0, (housingPrice(game, home) ?? home.valuation) - (game.mortgage?.remainingPrincipal ?? 0)) : 0],
    ['投资房', Object.values(game.housingHoldings ?? {}).reduce((sum, holding) => sum + holding.currentValuation, 0)],
    ['金融投资', Object.values(game.investments ?? {}).reduce((sum, holding) => sum + holding.currentValuation, 0)],
    ['企业与股权', Object.values(game.businesses).reduce((sum, holding) => sum + Math.round((holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balanceConfig.businessValuationRatio * ((holding.equityPercent ?? 100) / 100)), 0)],
    ['车辆与收藏', Object.values(game.assets).reduce((sum, holding) => sum + holding.currentValuation, 0)],
  ] as const;
  return <section className="detail-panel" aria-label="财富配置"><div className="section-heading compact"><div><span className="eyebrow">估值拆分</span><h2>财富配置</h2></div><p>这里展示当前各类持有物的估值；资产配置变化会继续进入月度账本。</p></div><div className="item-list">{categories.filter(([, value]) => value > 0).map(([label, value]) => <div className="item-row" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div></section>;
}

function PortfolioHistory({ game }: { game: GameState }) {
  const history = (game.financialHistory ?? []).slice(-6);
  return <section className="detail-panel" aria-label="财富组合历史"><div className="section-heading compact"><div><span className="eyebrow">每月归档</span><h2>财富组合历史</h2></div><p>记录每月现金、净资产与资产配置变化；数据来自已保存的月结账本。</p></div>{history.length === 0 ? <p className="muted">完成第一个月结后，这里会出现组合变化记录。</p> : <div className="item-list">{history.map((entry) => <article className="item-row" key={entry.month}><div><span className="job-kind">第 {entry.month} 月</span><h3>现金 {money(entry.cashStart)} → {money(entry.cashEnd)}</h3><p>净资产 {money(entry.netWorthStart)} → {money(entry.netWorthEnd)} · 变化 {entry.netWorthChange >= 0 ? '+' : '-'}{money(Math.abs(entry.netWorthChange))}</p></div><div className="row-meta"><span>投资配置 {money(entry.assetAllocation.categories.investment_transfer ?? 0)}</span><span>分红 {money(entry.income.categories.investment_dividend ?? 0)}</span></div></article>)}</div>}</section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ForecastPanel({ game }: { game: GameState }) {
  const forecast = useMemo(() => forecastWeeklyPlan(game, game.weeklyPlan, contentRegistry, balanceConfig), [game]);
  return <section className="forecast-strip"><div><span className="eyebrow">本周预计</span><h2>确定性计划变化</h2><small>不包含随机事件、市场价格变化、未确定招聘结果</small></div><div><span>确定性收入</span><strong>+{money(forecast.income)}</strong></div><div><span>确定性支出</span><strong>-{money(forecast.expense)}</strong></div><div><span>预计现金结余</span><strong>{forecast.netCash >= 0 ? '+' : '-'}{money(Math.abs(forecast.netCash))}</strong></div><div><span>预计成长</span><strong>{Object.entries(forecast.attributes).map(([key, value]) => (attributeLabels[key] ?? key) + ' +' + value).join(' · ') || '—'}</strong></div></section>;
}

function TimeConsole({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const currentJob = contentRegistry.jobs.find((job) => job.id === game.currentJobId);
  const activity = game.currentActivity ?? activityAtTime(game.time, game.weeklyPlan, game.employment, contentRegistry);
  const progress = deriveActivityProgress(activity, game.time);
  const dayActivities = getDailyActivities(game.time.day, game.weeklyPlan, game.employment, contentRegistry);
  const next = dayActivities.find((entry) => absoluteMinute(entry.start) > absoluteMinute(game.time) && !['sleep', 'life', 'free'].includes(entry.kind));
  const modeLabel = game.simulationMode === 'running' ? '运行中' : game.simulationMode === 'event' ? '事件暂停' : game.simulationMode === 'reward' ? '奖励结算' : game.simulationMode === 'monthly_summary' ? '月结待确认' : game.simulationMode === 'paused' ? '已暂停' : '等待规划';
  const actionLabel = game.simulationMode === 'running' ? '暂停' : game.simulationMode === 'paused' ? '继续运行' : game.simulationMode === 'planning' ? '开始本周' : '等待处理';
  const actionType: GameAction['type'] = game.simulationMode === 'running' ? 'pause_simulation' : game.simulationMode === 'paused' ? 'resume_simulation' : 'start_week';
  const weeklyPay = currentJob?.kind === 'regular' ? currentJob.basePay * (game.employment?.schedule.workDays.length ?? 5) : 0;
  return <section className="time-console" aria-label="世界时间">
    <div className="console-head"><div><span className="console-kicker">现在</span><strong className="week-title">第 {game.calendar.week} 周 · 周{weekdayLabel(game.calendar.weekday)}</strong></div><div className="console-clock" data-testid="clock-value">{formatClock(game.time.hour, game.time.minute)}</div></div>
    <div className="week-track" aria-label="本周进度">{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => <span key={weekday} className={weekday === game.calendar.weekday ? 'track-day current' : weekday < game.calendar.weekday ? 'track-day passed' : 'track-day'}>周{weekdayLabel(weekday)}</span>)}</div>
    <div className="console-grid"><div><span className="console-kicker">当前活动</span><h2>{activity.kind === 'work' ? currentJob?.name ?? '工作中' : activity.kind === 'study' ? '学习' : activity.kind === 'side_job' ? contentRegistry.jobs.find((job) => job.id === activity.jobId)?.name ?? '兼职' : activity.kind === 'activity' ? contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.name ?? '生活活动' : activity.kind === 'sleep' ? '睡眠' : activity.kind === 'life' ? '基础生活' : '自由时间'}</h2><p>{formatClock(activity.start.hour, activity.start.minute)} — {formatClock(activity.end.hour, activity.end.minute)} · {activity.kind === 'work' ? '自动排班' : '自动发生'}</p><div className="activity-progress"><i style={{ width: `${progress * 100}%` }} /></div><span className="progress-caption">{Math.round(progress * 100)}% · 今日活动进度</span></div><div className="console-side"><span>本周工资</span><strong>{weeklyPay ? money(weeklyPay) : '—'}</strong><span>下一项</span><b>{next ? `${formatClock(next.start.hour, next.start.minute)} · ${next.kind === 'study' ? '学习' : next.kind === 'side_job' ? '兼职' : next.kind === 'activity' ? '生活活动' : '安排'}` : '今天没有特殊安排'}</b></div></div>
     <div className="console-controls"><div className="speed-controls" aria-label="运行倍率">{([1, 2, 4] as const).map((speed) => <button key={speed} className={game.simulationSpeed === speed ? 'speed-button active' : 'speed-button'} aria-pressed={game.simulationSpeed === speed} onClick={() => dispatch({ type: 'set_simulation_speed', speed })}>×{speed}</button>)}</div><div className="run-controls"><span className={`mode-label mode-${game.simulationMode}`}>{modeLabel}</span><button className="primary-button" disabled={game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => dispatch({ type: actionType } as GameAction)}>{actionLabel}</button><button className="text-button" disabled={!['planning', 'paused', 'week_complete'].includes(game.simulationMode)} onClick={() => dispatch({ type: 'advance_period', months: 1 })}>运行 1 个月</button><button className="text-button" disabled={!['planning', 'paused', 'week_complete'].includes(game.simulationMode)} onClick={() => dispatch({ type: 'advance_period', months: 3 })}>运行 3 个月</button></div></div>
  </section>;
}

function LifeView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const home = contentRegistry.housing.find((entry) => entry.id === game.housing.housingId);
  const lifestyleScore = calculateLifestyle(game, contentRegistry);
  const lifestyleFactor = Math.min(balanceConfig.lifestyleCostFactorCap, Math.max(0, lifestyleScore * balanceConfig.lifestyleCostFactor));
  const dailyRent = home ? housingRentPerDay(game, home) : 0;
  const fixed = dailyRent * 28 + Math.round(balanceConfig.dailyLivingCost * (1 + lifestyleFactor) * 28) + Math.round(balanceConfig.dailyTransportCost * (1 + lifestyleFactor / 2) * 28) + balanceConfig.monthlyCommunicationCost + (home?.fixedMonthlyCost ?? 0);
  return <><section className="forecast-strip"><div><span className="eyebrow">本月预计</span><h2>先看余量，再安排生活</h2></div><div><span>固定支出</span><strong>{money(fixed)}</strong></div><div><span>房租</span><strong>{money(dailyRent * 28)}</strong></div><div><span>生活与交通</span><strong>{money(fixed - dailyRent * 28 - balanceConfig.monthlyCommunicationCost)}</strong></div></section><HousingView game={game} dispatch={dispatch} /><FinancialSummaryView game={game} compact /></>;
}

function WorkView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  return <><section className="planning-section"><div className="section-heading compact"><div><span className="eyebrow">一周只规划几格</span><h1>本周计划</h1></div><p>正式工作由排班自动占用；这里只安排学习、课程、兼职、活动和自由时间。</p></div><WeekPlanner game={game} dispatch={dispatch} /></section><CourseMarket game={game} dispatch={dispatch} /><section className="market-section"><div className="section-heading compact"><div><span className="eyebrow">招聘市场 · 条件透明</span><h1>工作机会</h1></div><p>先看清缺什么，再决定要不要投入时间准备。</p></div><div className="job-grid">{contentRegistry.jobs.map((job) => { const current = game.currentJobId === job.id; const unlocked = game.unlockedJobIds.includes(job.id); const legacyMissing = job.abilityRequired !== undefined && game.ability < job.abilityRequired; const reputationMissing = job.reputationRequired !== undefined && game.reputation < job.reputationRequired; const conditionOk = !job.requirements || evaluateCondition(job.requirements, game, contentRegistry, balanceConfig); const itemMissing = job.requiredItems?.find((itemId) => (game.inventory[itemId] ?? 0) < 1); const capabilityMissing = job.requiredCapabilities?.find((capability) => !game.unlockedCapabilities.includes(capability)); const conditionMessage = !conditionOk ? explainCondition(job.requirements!, game, contentRegistry, balanceConfig) : itemMissing ? `需要：${contentRegistry.items.find((item) => item.id === itemMissing)?.name ?? itemMissing}` : capabilityMissing ? `需要：${capabilityLabels[capabilityMissing] ?? capabilityMissing}` : '已满足申请条件'; const missingLegacy = !unlocked ? (conditionMessage === '已满足申请条件' ? '需要通过人物推荐或事件解锁' : conditionMessage) : legacyMissing ? `能力 ≥ ${job.abilityRequired}（当前 ${game.ability}）` : reputationMissing ? `声誉 ≥ ${job.reputationRequired}（当前 ${game.reputation}）` : conditionMessage; const blocked = !unlocked || legacyMissing || reputationMissing || !conditionOk || Boolean(itemMissing) || Boolean(capabilityMissing); const schedule = defaultJobSchedule(job); return <article className={current ? 'job-card current' : 'job-card'} key={job.id}><div className="job-card-head"><span className="job-kind">{job.category ?? (job.kind === 'regular' ? '基础岗位' : '自由职业')}</span><span className={current ? 'current-label' : 'muted'}>{current ? '当前工作' : job.kind === 'regular' ? '长期岗位' : '可安排兼职'}</span></div><h2>{job.name}</h2><p>{job.description}</p><div className="job-facts"><span>{job.kind === 'regular' ? `月薪约 ${money(job.basePay * 20)}` : `${money(job.basePay)} / 次`}</span><span>{job.kind === 'regular' ? `${schedule.workDays.length * job.hours}h / 周` : `${job.hours}h / 次`}</span></div><div className="requirement-box"><strong>申请条件</strong><span className={blocked && !current ? 'requirement-missing' : 'requirement-ok'}>{current ? '已在这份工作中' : missingLegacy}</span></div><div className="job-actions">{current ? <button className="secondary-button" onClick={() => dispatch({ type: 'start_resignation' })}>离开当前工作</button> : <button className="primary-button" aria-label={blocked ? `暂不可申请：${job.name}` : `查看招聘：${job.name}`} disabled={blocked} onClick={() => dispatch({ type: 'start_recruitment', jobId: job.id })}>{blocked ? '暂不可申请' : '查看招聘'}</button>}</div></article>; })}</div></section>{game.lastMonthlySummary && <MonthlySummary summary={game.lastMonthlySummary} financial={game.lastFinancialSummary} />}</>;
}

function WeekPlanner({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const sideJobs = contentRegistry.jobs.filter((job) => job.kind !== 'regular' && Boolean(game.acquiredSideJobs?.[job.id]));
  const cycle = (weekday: Weekday, slot: PlanSlot) => {
    const current = game.weeklyPlan.days[weekday][slot];
    const options: PlannedActivity[] = [{ kind: 'free' }, { kind: 'study', durationMinutes: 60 }, { kind: 'study', durationMinutes: 120 }, { kind: 'study', durationMinutes: 240 }, ...(contentRegistry.courses?.map((course) => ({ kind: 'course' as const, courseId: course.id })) ?? []), ...(contentRegistry.activities?.flatMap((activity) => activity.options.map((option) => ({ kind: 'activity' as const, activityId: activity.id, optionId: option.id }))) ?? []), ...sideJobs.map((job) => ({ kind: 'side_job' as const, jobId: job.id, durationMinutes: Math.min(240, Math.max(60, job.hours * 60)) as 60 | 120 | 240 }))];
    const index = options.findIndex((option) => JSON.stringify(option) === JSON.stringify(current));
    dispatch({ type: 'set_plan', weekday, slot, activity: options[(index + 1) % options.length] });
  };
    const planLabel = (activity: PlannedActivity) => activity.kind === 'free' ? '自由' : activity.kind === 'study' ? `学习 ${activity.durationMinutes / 60} 小时` : activity.kind === 'course' ? `课程 · ${contentRegistry.courses?.find((course) => course.id === activity.courseId)?.name ?? activity.courseId}` : activity.kind === 'side_job' ? `${contentRegistry.jobs.find((job) => job.id === activity.jobId)?.name ?? '兼职'} ${activity.durationMinutes / 60} 小时` : `${contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.name ?? '活动'} · ${activity.optionId}`;
    const plannedCost = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((weekday) => [game.weeklyPlan.days[weekday].day, game.weeklyPlan.days[weekday].evening]).reduce((sum, activity) => { if (activity.kind !== 'activity') return sum + (activity.kind === 'course' ? contentRegistry.courses?.find((course) => course.id === activity.courseId)?.cashCost ?? 0 : 0); const definition = contentRegistry.activities?.find((entry) => entry.id === activity.activityId); const option = definition?.options.find((entry) => entry.id === activity.optionId); return sum + (definition && option ? activityCashCost(game, definition, option, contentRegistry) : 0); }, 0);
  return <div className="planner"><div className="planner-head"><span>计划格</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => <strong key={weekday} className={weekday === game.calendar.weekday ? 'today' : ''}>周{weekdayLabel(weekday)}</strong>)}</div><div className="planner-row"><span>白天</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => { const working = game.employment?.schedule.workDays.includes(weekday); return <button key={weekday} className={working ? 'plan-cell locked' : 'plan-cell'} disabled={working || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => cycle(weekday, 'day')} aria-label={`周${weekdayLabel(weekday)}白天计划`}>{working ? '工作' : planLabel(game.weeklyPlan.days[weekday].day)}</button>; })}</div><div className="planner-row"><span>晚间</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => <button key={weekday} className="plan-cell" disabled={game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => cycle(weekday, 'evening')} aria-label={`周${weekdayLabel(weekday)}晚间计划`}>{planLabel(game.weeklyPlan.days[weekday].evening)}</button>)}</div><div className="planner-actions"><button className="secondary-button" onClick={() => dispatch({ type: 'copy_previous_plan' })}>使用上周计划</button><label className="repeat-toggle"><input type="checkbox" checked={game.autoRepeatPlan} onChange={(event) => dispatch({ type: 'set_auto_repeat_plan', enabled: event.target.checked })} /> 自动重复计划</label><span className="plan-cost">本周课程与活动预计 {money(plannedCost)}</span></div></div>;
}

function InventoryPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const entries = contentRegistry.items.filter((item) => (game.inventory[item.id] ?? 0) > 0);
  return <section className="detail-panel" aria-label="我的库存"><div className="section-heading compact"><div><span className="eyebrow">库存</span><h2>我的商品</h2></div><p>消耗品可以使用；耐用品可以出售，所有变化都会进入账本与人生记录。</p></div>{entries.length ? <div className="item-list">{entries.map((item) => <div className="item-row" key={item.id}><div><h2>{item.name}</h2><p>库存 ×{game.inventory[item.id]}</p></div><div className="button-pair">{item.consumable && <button className="secondary-button" onClick={() => dispatch({ type: 'use_item', itemId: item.id })}>使用一次</button>}{item.sellable && <button className="text-button" onClick={() => dispatch({ type: 'sell_item', itemId: item.id, quantity: 1 })}>出售一次</button>}</div></div>)}</div> : <p className="muted">购买商品后，会在这里管理库存。</p>}</section>;
}

function WishlistPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const items = (game.wishlist ?? []).map((itemId) => contentRegistry.items.find((item) => item.id === itemId)).filter((item): item is (typeof contentRegistry.items)[number] => Boolean(item));
  return <section className="detail-panel" aria-label="愿望清单"><div className="section-heading compact"><div><span className="eyebrow">消费目标</span><h2>愿望清单</h2></div><p>把想买的东西先记下来，查看距离目标还差多少现金。</p></div>{items.length ? <div className="item-list">{items.map((item) => { const price = getItemCost(game, item); const missing = Math.max(0, price - game.cash); return <div className="item-row" key={item.id}><div><h2>{item.name}</h2><p>{missing ? `还差 ${money(missing)}` : '现在可以买'}</p></div><div className="row-meta"><strong>{money(price)}</strong><div className="button-pair"><button className="text-button" disabled={missing > 0} onClick={() => dispatch({ type: 'purchase_items', items: { [item.id]: 1 } })}>买下</button><button className="text-button" onClick={() => dispatch({ type: 'manage_wishlist', itemId: item.id, enabled: false })}>移除</button></div></div></div>; })}</div> : <p className="muted">在商品卡片加入目标后，会在这里查看进度。</p>}</section>;
}

function ServiceMarket({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  return <section className="detail-panel" aria-label="服务与订阅"><div className="section-heading compact"><div><span className="eyebrow">日常生活</span><h2>服务与订阅</h2></div><p>一次性服务立即结算；订阅在每月结算时自动扣费，可随时取消。</p></div><div className="item-list">{(contentRegistry.services ?? []).map((service) => { const available = !service.requirements || evaluateCondition(service.requirements, game, contentRegistry, balanceConfig); const cooldown = serviceCooldownRemaining(game, service); const usable = available && cooldown === 0 && game.cash >= service.price; return <div className="item-row" key={service.id}><div><span className="job-kind">一次性服务</span><h2>{service.name}</h2><p>{service.description}</p>{cooldown > 0 ? <span className="requirement-missing">冷却中 · 还需 {cooldown} 天</span> : service.requirements && <span className={available ? 'requirement-ok' : 'requirement-missing'}>{explainCondition(service.requirements, game, contentRegistry, balanceConfig)}</span>}</div><div className="row-meta"><strong>{money(service.price)}</strong><button className="text-button" disabled={!usable} onClick={() => dispatch({ type: 'use_service', serviceId: service.id })}>{cooldown > 0 ? `冷却中 · 还需 ${cooldown} 天` : '使用服务'}</button></div></div>; })}</div><div className="item-list">{(contentRegistry.subscriptions ?? []).map((subscription) => { const active = Boolean(game.activeSubscriptions?.[subscription.id]); return <div className="item-row" key={subscription.id}><div><span className="job-kind">月度订阅</span><h2>{subscription.name}</h2><p>{subscription.description}</p></div><div className="row-meta"><strong>{money(subscription.monthlyFee)} /月</strong><button className="text-button" onClick={() => dispatch({ type: 'manage_subscription', subscriptionId: subscription.id, enabled: !active })}>{active ? '取消订阅' : '开通订阅'}</button></div></div>; })}</div><ServiceHistoryView game={game} /></section>;
}

function ServiceHistoryView({ game }: { game: GameState }) {
  const records = (game.lifeHistory ?? []).filter((record) => record.category === 'service').slice(-6);
  return <div className="ledger-detail" role="region" aria-label="服务记录"><span>最近服务记录</span><small>{records.length ? records.map((record) => `第 ${record.day} 天 · ${record.title}`).join(' · ') : '使用服务或开通订阅后，这里会保留最近记录'}</small></div>;
}

function ShopView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const [cart, setCart] = useState<Record<ContentId, number>>({});
  const [category, setCategory] = useState<string>('all');
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const total = Object.entries(cart).reduce((sum, [itemId, quantity]) => { const item = contentRegistry.items.find((entry) => entry.id === itemId); return sum + (item ? getItemCost(game, item) : 0) * quantity; }, 0);
  const categories = ['all', ...new Set(contentRegistry.items.map((item) => item.category))];
  const items = contentRegistry.items.filter((item) => category === 'all' || item.category === category);
  const scheduleActivity = (activityId: ContentId, optionId: string) => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
      if (weekday < game.calendar.weekday) continue;
      for (const slot of ['day', 'evening'] as const) {
        if (slot === 'day' && game.employment?.schedule.workDays.includes(weekday)) continue;
        if (game.weeklyPlan.days[weekday][slot].kind !== 'free') continue;
        dispatch({ type: 'set_plan', weekday, slot, activity: { kind: 'activity', activityId, optionId } });
        return;
      }
    }
  };
  return <><div className="section-heading compact"><div><span className="eyebrow">浏览不消耗时间 · 功能先说清楚</span><h1>商品</h1></div><p>商品会说明它改善什么、解锁什么，以及是否值得纳入生活。</p></div><div className="filter-row" aria-label="商品分类">{categories.map((entry) => <button key={entry} className={category === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setCategory(entry)}>{entry === 'all' ? '全部' : categoryLabels[entry] ?? entry}</button>)}</div><div className="shop-layout"><div className="item-grid">{items.map((item) => { const owned = (game.inventory[item.id] ?? 0) > 0; const wishlisted = game.wishlist?.includes(item.id); const effects = Object.entries(item.attributeEffects ?? {}).map(([id, value]) => `${attributeLabels[id] ?? id} ${value >= 0 ? '+' : ''}${value}`).concat(Object.entries(item.statEffects ?? {}).map(([id, value]) => `${statLabels[id] ?? id} ${value >= 0 ? '+' : ''}${value}`)).slice(0, 2); return <article className="item-card" key={item.id}><div className="item-card-head"><span className="job-kind">{categoryLabels[item.category] ?? item.category}</span>{owned && <span className="current-label">已拥有</span>}</div><h2>{item.name}</h2><p>{item.description}</p><div className="item-effect">{effects.length ? effects.join(' · ') : item.capabilities?.length ? `解锁：${item.capabilities.map((capability) => capabilityLabels[capability] ?? capability).join('、')}` : '生活品质与收藏价值'}</div><div className="item-card-foot"><strong>{money(getItemCost(game, item))}</strong><div className="button-pair"><button className="primary-button" onClick={() => setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }))} aria-label={`加入购物袋：${item.name}`}>加入</button>{!owned && <button className="text-button" onClick={() => dispatch({ type: 'manage_wishlist', itemId: item.id, enabled: !wishlisted })} aria-label={`${wishlisted ? '移出' : '加入'}愿望清单：${item.name}`}>{wishlisted ? '已加入目标' : '加入目标'}</button>}</div></div></article>; })}</div><aside className="side-panel"><span className="console-kicker">当前购物会话</span><h2>购物袋（{cartCount}）</h2>{cartCount === 0 ? <p className="muted">还没有选择商品。</p> : <>{Object.entries(cart).map(([itemId, quantity]) => <div className="cart-row" key={itemId}><span>{contentRegistry.items.find((item) => item.id === itemId)?.name}</span><span>×{quantity}</span></div>)}<div className="total-row"><span>消费合计</span><strong>{money(total)}</strong></div><button className="primary-button full" onClick={() => { dispatch({ type: 'purchase_items', items: cart }); setCart({}); }} aria-label="一次购买">一次购买</button></>}</aside></div><section className="activity-market"><div className="section-heading compact"><div><span className="eyebrow">不为赚钱服务的时间</span><h2>娱乐与生活活动</h2></div><p>活动会占用周计划中的自由时间；每个 Option 都有自己的时长、费用和效果。</p></div><div className="activity-grid">{contentRegistry.activities?.flatMap((activity) => activity.options.map((option) => { const optionEffects = (option.effects ?? []).map((effect) => effect.type === 'attribute' ? `${attributeLabels[effect.attribute] ?? effect.attribute} ${effect.amount >= 0 ? '+' : ''}${effect.amount}` : effect.type === 'stat' ? `${statLabels[effect.stat] ?? effect.stat} ${effect.amount >= 0 ? '+' : ''}${effect.amount}` : effect.type === 'relation' ? `关系 ${effect.amount >= 0 ? '+' : ''}${effect.amount}` : '新的进展'); const project = option.businessProject; const projectReady = !project || Boolean(game.businesses[project.businessId]); const projectDone = Boolean(project && game.completedBusinessProjects?.includes(`${activity.id}.${option.id}`)); const cost = activityCashCost(game, activity, option, contentRegistry); const cooldownRemaining = activityCooldownRemaining(game, activity, option); return <article className="activity-card" key={`${activity.id}-${option.id}`}><span className="job-kind">{activity.category}</span><h3>{activity.name} · {option.label}</h3><p>{activity.description}</p><div className="activity-facts"><span>{option.durationMinutes / 60 >= 24 ? '2 天' : `${option.durationMinutes / 60} 小时`}</span><strong>{project ? `收入 ${money(project.revenue)} · 成本 ${money(project.cost)}` : money(cost)}</strong></div><div className="activity-effect">{project ? `企业项目利润 · ${projectDone ? '已完成' : projectReady ? '可承接' : '需要对应企业'}` : `${optionEffects.join(' · ') || '给生活留一点空间'}${activityDiscountLabel(game, activity, contentRegistry) ? ` · ${activityDiscountLabel(game, activity, contentRegistry)}` : ''}`}</div>{cooldownRemaining > 0 && <span className="requirement-missing">冷却中 · 还需 {cooldownRemaining} 天</span>}<button className="secondary-button" disabled={!projectReady || projectDone || cooldownRemaining > 0 || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => scheduleActivity(activity.id, option.id)}>{projectDone ? '项目已完成' : cooldownRemaining > 0 ? `冷却中 · 还需 ${cooldownRemaining} 天` : '安排到本周自由时间'}</button></article>; }))}</div></section></>;
}

function ActivityAcquisitionHints({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const hints = (contentRegistry.activities ?? []).flatMap((activity) => activity.options.map((option) => ({ activity, option }))).filter(({ option }) => option.requirements && !evaluateCondition(option.requirements, game, contentRegistry, balanceConfig));
  if (!hints.length) return null;
  return <section className="detail-panel" aria-label="活动获取提示"><div className="section-heading compact"><div><span className="eyebrow">先准备，再安排</span><h2>活动获取提示</h2></div><p>满足这些条件后，活动才会进入周计划并在结算时生效。</p></div><div className="item-list">{hints.map(({ activity, option }) => <div className="item-row" key={`${activity.id}.${option.id}`}><div><h3>{activity.name} · {option.label}</h3><p className="requirement-missing">{explainCondition(option.requirements!, game, contentRegistry, balanceConfig)}</p></div>{option.requirements?.type === 'owns_item' && (() => { const requirement = option.requirements as { type: 'owns_item'; itemId: ContentId }; const item = contentRegistry.items.find((entry) => entry.id === requirement.itemId); const cost = item ? getItemCost(game, item) : 0; return item ? <button className="text-button" disabled={game.cash < cost} onClick={() => dispatch({ type: 'purchase_items', items: { [item.id]: 1 } })}>购买 {item.name}</button> : null; })()}</div>)}</div></section>;
}

function HousingView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { return <><div className="section-heading compact"><div><span className="eyebrow">住房是生活的底色</span><h1>住房</h1></div><p>租金和住房收益会在日结中自动进入月度账本；支持分期的住房会显示首付与月供。</p></div><div className="item-list">{contentRegistry.housing.map((home) => { const current = game.housing.housingId === home.id; const unlocked = game.unlockedHousingIds.includes(home.id); const rent = housingRentPerDay(game, home); const price = housingPrice(game, home); const mortgage = price !== undefined ? housingMortgageTerms(game, home) : undefined; const holding = game.housingHoldings?.[home.id]; return <div className="item-row" key={home.id}><div><span className="job-kind">{current ? '当前住处' : holding ? `投资房 · ${holding.occupancy === 'rented' ? '已出租' : '空置'}` : '住房市场'}</span><h2>{home.name}</h2><p>{home.description}</p><span className="muted">生活水平 +{home.lifestyleDelta} · {rent ? `${money(rent)} /天` : '免租'}</span>{current && game.mortgage && <span className="muted">分期中 · 剩余本金 {money(game.mortgage.remainingPrincipal)} · 已还 {game.mortgage.paidMonths}/{game.mortgage.totalMonths} 期</span>}{holding && <span className="muted">估值 {money(holding.currentValuation)} · 本月预计净租金 {money(Math.round(rent * 28 * 0.88))}</span>}</div><div className="row-meta">{price !== undefined && <strong>{money(price)}</strong>}{mortgage && !current && !holding && <span className="muted">首付 {money(mortgage.downPayment)} · 月供 {money(mortgage.monthlyPayment)}</span>}{unlocked || current ? <div className="button-pair">{!holding && <><button className="text-button" disabled={current || Boolean(game.mortgage)} onClick={() => dispatch({ type: 'move_housing', housingId: home.id, mode: 'rent' })}>租住</button>{price !== undefined && <button className="text-button" disabled={current || Boolean(game.mortgage)} onClick={() => dispatch({ type: 'move_housing', housingId: home.id, mode: 'owned' })}>买下</button>}{price !== undefined && <button className="text-button" disabled={current || Boolean(game.mortgage) || game.cash < price} onClick={() => dispatch({ type: 'buy_rental_housing', housingId: home.id })}>买作投资房</button>}{mortgage && <button className="text-button" disabled={current || Boolean(game.mortgage) || game.cash < mortgage.downPayment} onClick={() => dispatch({ type: 'finance_housing', housingId: home.id })}>分期购买</button>}</>}{holding && <><button className="text-button" onClick={() => dispatch({ type: 'set_housing_rental', housingId: home.id, rented: holding.occupancy !== 'rented' })}>{holding.occupancy === 'rented' ? '收回空置' : '开始出租'}</button><button className="text-button" onClick={() => dispatch({ type: 'sell_rental_housing', housingId: home.id })}>出售房产</button></>}{current && game.housing.mode === 'owned' && <button className="text-button" onClick={() => dispatch({ type: 'sell_housing' })}>出售</button>}</div> : <span className="muted">未解锁</span>}</div></div>; })}</div></>; }

function CourseMarket({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const courses = contentRegistry.courses ?? [];
  const scheduleCourse = (courseId: ContentId) => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
      for (const slot of ['day', 'evening'] as const) {
        if (slot === 'day' && game.employment?.schedule.workDays.includes(weekday)) continue;
        if (game.weeklyPlan.days[weekday][slot].kind !== 'free') continue;
        dispatch({ type: 'set_plan', weekday, slot, activity: { kind: 'course', courseId } });
        return;
      }
    }
  };
  if (!courses.length) return null;
  return <section className="market-section"><div className="section-heading compact"><div><span className="eyebrow">成长路径 · 可执行</span><h2>课程与资格</h2></div><p>查看费用和要求，把课程安排进本周空闲时间；完成后会写入资格、职业经验和历史。</p></div><div className="item-list">{courses.map((course) => { const completed = game.courseProgress?.[course.id] ?? 0; const requirementMet = !course.requirements || evaluateCondition(course.requirements, game, contentRegistry, balanceConfig); const finished = course.maxCompletions !== undefined && completed >= course.maxCompletions; return <div className="item-row" key={course.id}><div><span className="job-kind">{finished ? '已完成' : '课程'}</span><h3>{course.name}</h3><p>{course.description}</p><span className="muted">{course.durationMinutes / 60} 小时 · {money(course.cashCost)} · {course.qualificationId ? `资格：${course.qualificationId}` : '提升职业经验'}</span>{!requirementMet && <span className="requirement-missing">当前条件未满足</span>}</div><div className="row-meta"><span className="muted">完成 {completed} 次</span><button className="text-button" disabled={finished || !requirementMet || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => scheduleCourse(course.id)}>安排课程</button></div></div>; })}</div></section>;
}

function AssetsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { return <><div className="section-heading compact"><div><span className="eyebrow">现金只是财富的一种形态</span><h1>财富</h1></div><p>投资、企业、投资房产和月度现金流在同一个地方看清楚。</p></div><FinancialSummaryView game={game} /><div className="asset-columns">{contentRegistry.investments?.map((investment) => { const holding = game.investments?.[investment.id]; const value = holding?.currentValuation ?? investmentUnitValue(investment, game.rng.seed, game.time.day); return <article className="asset-card" key={investment.id}><div className="item-card-head"><span className="job-kind">{investmentRiskLabels[investment.risk] ?? investment.risk}风险 · {investmentKindLabels[investment.kind] ?? investment.kind}</span>{holding && <span className="current-label">持有 {holding.units} 份</span>}</div><h2>{investment.name}</h2><p>{investment.description}</p><div className="investment-value"><span>当前单位估值</span><strong>{money(value)}</strong></div><div className="button-pair"><button className="primary-button" disabled={game.cash < value} onClick={() => dispatch({ type: 'buy_investment', investmentId: investment.id, units: 1 })}>买入 1 份</button>{holding && <button className="secondary-button" onClick={() => dispatch({ type: 'sell_investment', investmentId: investment.id, units: 1 })}>卖出 1 份</button>}</div></article>; })}{contentRegistry.businesses.map((business) => { const holding = game.businesses[business.id]; const unlocked = game.unlockedBusinessIds.includes(business.id); const profit = holding ? calculateDailyBusinessProfit(holding, business) : undefined; return <div className="item-row" key={business.id}><div><span className="job-kind">企业</span><h2>{business.name}</h2><p>{business.description}</p>{profit && <span className="muted">预计净利润 {money(profit.profit)} /天</span>}</div><div className="row-meta">{holding ? <span className="current-label">已拥有</span> : unlocked ? <button className="text-button" onClick={() => dispatch({ type: 'buy_business', businessId: business.id })}>买入 {money(business.price)}</button> : <span className="muted">等待机会</span>}</div></div>; })}{contentRegistry.assets.map((asset) => { const holding = game.assets[asset.id]; const unlocked = game.unlockedAssetIds.includes(asset.id); return <div className="item-row" key={asset.id}><div><span className="job-kind">{asset.kind === 'vehicle' ? '车辆' : '投资房产 / 资产'}</span><h2>{asset.name}</h2><p>{asset.description}</p><span className="muted">{asset.kind === 'vehicle' ? `当前估值 ${money(holding?.currentValuation ?? asset.valuation)} · 约 ${money(asset.monthlyCost ?? 0)} /月车辆成本` : `预计收入 ${money(asset.dailyIncome)} /天`}</span></div><div className="row-meta">{holding ? <button className="text-button" onClick={() => dispatch({ type: 'sell_asset', assetId: asset.id })}>出售 {money(holding.currentValuation)}</button> : unlocked ? <button className="text-button" onClick={() => dispatch({ type: 'buy_asset', assetId: asset.id })}>买入 {money(asset.price)}</button> : <span className="muted">等待机会</span>}</div></div>; })}</div><VehicleMaintenanceHistory game={game} /></>; }

function VehicleMaintenanceHistory({ game }: { game: GameState }) { const records = (game.financialLedger?.entries ?? []).filter((entry) => entry.category === 'maintenance' && entry.sourceType === 'vehicle').slice(-6); return <div className="ledger-detail" role="region" aria-label="车辆维护记录"><span>最近车辆维护</span><small>{records.length ? records.map((entry) => `第 ${entry.day} 天 · ${entry.label} ${money(entry.amount)}`).join(' · ') : '拥有车辆并运行时间后，这里会保留维护记录'}</small></div>; }

function RelationsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { const messages = game.messages ?? []; return <><div className="section-heading compact"><div><span className="eyebrow">人物不是数字，是生活入口</span><h1>社交</h1></div><p>关系会带来推荐、合作和一起度过的时间。互动在暂停后完成，不打断自动运行。</p></div>{messages.length > 0 && <section className="detail-panel" aria-label="消息"><div className="section-heading compact"><div><span className="eyebrow">联系人的来信</span><h2>消息</h2></div><span className="muted">未读 {messages.filter((message) => !message.read).length} 条</span></div><div className="item-list">{messages.slice().reverse().map((message) => { const character = contentRegistry.characters.find((entry) => entry.id === message.characterId); return <div className="item-row" key={message.id}><div><span className="job-kind">{message.read ? '已读' : '未读'} · 第 {message.day} 天</span><h3>{message.title}</h3><p>{message.body}</p><span className="muted">来自 {character?.name ?? '联系人'}</span></div>{!message.read && <button className="text-button" onClick={() => dispatch({ type: 'read_message', messageId: message.id })}>查看消息</button>}</div>; })}</div></section>}<div className="relation-grid">{contentRegistry.characters.map((character) => { const value = game.relationships[character.id] ?? 0; const stage = [...character.stages].reverse().find((entry) => value >= entry.threshold); const interaction = contentRegistry.relationshipInteractions?.find((entry) => entry.characterId === character.id); const option = interaction?.options[0]; return <article className="relation-card" key={character.id}><div className="job-card-head"><span className="job-kind">{character.identity}</span><strong>{value}</strong></div><h2>{character.name}</h2><p>{character.description}</p><div className="relation-stage">{stage?.label ?? '认识'} · {value >= 60 ? '会出现更长期的机会' : value >= 40 ? '可能提供推荐' : '继续相处会更了解彼此'}</div><div className="meter"><i style={{ width: `${value}%` }} /></div>{interaction && option && <button className="secondary-button full" disabled={game.cash < option.cashCost} onClick={() => dispatch({ type: 'interact_character', interactionId: interaction.id, optionId: option.id })}>{option.label} · {money(option.cashCost)}</button>}</article>; })}</div></>; }

function StorylinePanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const storylines = contentRegistry.storylines ?? [];
  if (!storylines.length) return null;
  return <section className="detail-panel" aria-label="故事线"><div className="section-heading compact"><div><span className="eyebrow">关系会继续发生</span><h2>正在发生的故事</h2></div><p>故事可以暂时放下，不会强迫你进入某个人生阶段。</p></div><div className="item-list">{storylines.map((storyline) => { const stage = getStorylineStage(contentRegistry, game, storyline.id); const dialogue = stage?.dialogueId ? getDialogue(contentRegistry, stage.dialogueId) : undefined; const started = Boolean(game.storylineStages?.[storyline.id]); const completed = stage?.id === 'complete'; return <div className="item-row" key={storyline.id}><div><span className="job-kind">{completed ? '已完成' : started ? '进行中' : '可开始'}</span><h3>{storyline.name}</h3><p>{storyline.description}</p>{started && dialogue && <div className="dialogue-transcript">{dialogue.lines.map((line) => <p key={line.id ?? line.text}>{contentRegistry.characters.find((character) => character.id === line.speakerId)?.name ?? line.speakerName ?? '对方'}：{line.text}</p>)}</div>}{started && stage?.branches && <div className="button-pair">{stage.branches.map((branch) => <button className="text-button" key={branch.id} onClick={() => dispatch({ type: 'choose_storyline_branch', storylineId: storyline.id, branchId: branch.id })}>{branch.text ?? '作出选择'}</button>)}</div>}</div>{!started && <button className="secondary-button" onClick={() => dispatch({ type: 'start_storyline', storylineId: storyline.id })}>开始故事</button>}</div>; })}</div></section>;
}

function BusinessOperationsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const owned = contentRegistry.businesses.filter((business) => game.businesses[business.id]);
  if (!owned.length) return null;
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">经营决策 · 会进入日结</span><h2>企业经营</h2></div><p>调整定价、人员和备货水平；资本投入与融资单独记录，不混入日常经营费用。</p></div><div className="item-list">{owned.map((business) => { const holding = game.businesses[business.id]; const profit = calculateDailyBusinessProfit(holding, business); const update = (key: 'priceLevel' | 'wageLevel' | 'inventoryLevel', max: number) => dispatch({ type: 'update_business', businessId: business.id, priceLevel: key === 'priceLevel' ? (holding.priceLevel + 1) % max : holding.priceLevel, wageLevel: key === 'wageLevel' ? (holding.wageLevel + 1) % max : holding.wageLevel, inventoryLevel: key === 'inventoryLevel' ? (holding.inventoryLevel + 1) % max : holding.inventoryLevel }); const fundingRound = holding.fundingRound ?? 0; const listingLocked = Boolean(holding.listedDay && game.time.day < holding.listedDay + 28); const publicFloat = holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100)); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p>预计净利润 {money(profit.profit)} /天 · 定价 {holding.priceLevel + 1} · 人员 {holding.wageLevel + 1} · 备货 {holding.inventoryLevel + 1}</p><p className="muted">持股 {holding.equityPercent ?? 100}% · 已投入资本 {money(holding.capitalInvested ?? 0)} · 融资 {money(holding.fundingRaised ?? 0)} · 融资轮次 {fundingRound}/3 · {holding.listed ? '已上市' : '未上市'}</p></div><div className="button-pair"><button className="text-button" onClick={() => update('priceLevel', business.priceLevels.length)}>调整定价</button><button className="text-button" onClick={() => update('wageLevel', business.wageLevels.length)}>调整人员</button><button className="text-button" onClick={() => update('inventoryLevel', business.inventoryLevels.length)}>调整备货</button><button className="text-button" disabled={game.cash - 1000 < 0} onClick={() => dispatch({ type: 'inject_business_capital', businessId: business.id, amount: 1000 })}>投入 ¥1,000</button><button className="text-button" disabled={fundingRound >= 3} onClick={() => dispatch({ type: 'raise_business_funding', businessId: business.id })}>{fundingRound >= 3 ? '融资轮次已达上限' : fundingRound ? '继续融资' : '发起融资'}</button><button className="text-button" disabled={Boolean(holding.listed) || fundingRound < 2} onClick={() => dispatch({ type: 'list_business', businessId: business.id })}>{holding.listed ? '已上市' : fundingRound < 2 ? '两轮融资后上市' : '申请上市'}</button>{holding.listed && publicFloat >= 10 && <button className="text-button" disabled={listingLocked || game.cash - 520 < 0} onClick={() => dispatch({ type: 'buy_business_equity', businessId: business.id, percent: 10 })}>{listingLocked ? `锁定至第 ${holding.listedDay! + 28} 天` : '回购 10% 股权'}</button>}{holding.listed && (holding.equityPercent ?? 100) > 10 && <button className="text-button" disabled={listingLocked} onClick={() => dispatch({ type: 'sell_business_equity', businessId: business.id, percent: 10 })}>{listingLocked ? `锁定至第 ${holding.listedDay! + 28} 天` : '出售 10% 股权'}</button>}<button className="text-button" onClick={() => dispatch({ type: 'sell_business', businessId: business.id })}>退出企业</button></div></div>; })}</div></section>;
}

function BusinessPublicFloatView({ game }: { game: GameState }) {
  const listed = contentRegistry.businesses.filter((business) => game.businesses[business.id]?.listed);
  if (!listed.length) return null;
  return <section className="detail-panel" aria-label="公开股权"><div className="section-heading compact"><div><span className="eyebrow">上市后的外部持有人</span><h2>公开股权流通</h2></div><p>流通比例独立记录，不与普通金融投资混在一起；出售会增加市场流通量，回购会减少流通量。</p></div><div className="item-list">{listed.map((business) => { const holding = game.businesses[business.id]; const publicFloat = holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100)); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">你的持股 {holding.equityPercent ?? 100}% · 外部公开流通 {publicFloat}%</p></div><span className="current-label">独立股权状态</span></div>; })}</div></section>;
}

function FinancialSummaryView({ game, compact = false }: { game: GameState; compact?: boolean }) { const ledger = game.financialLedger ?? { month: game.calendar.month, nextSequence: 1, entries: [], cashStart: game.cash, netWorthStart: game.cash }; const summary = summarizeFinancialLedger(ledger, ledger.cashStart ?? game.cash, game.cash, ledger.netWorthStart ?? game.cash, calculateNetWorth(game, contentRegistry, balanceConfig)); const row = (label: string, value: number, className = '') => <div className="finance-row"><span>{label}</span><strong className={className}>{value >= 0 ? '+' : '-'}{money(Math.abs(value))}</strong></div>; const categories = (entries: Record<string, number>) => Object.entries(entries).map(([category, amount]) => `${financialLabels[category] ?? category} ${money(amount)}`).join(' · ') || '暂无'; return <section className={compact ? 'finance-panel compact' : 'finance-panel'}><div className="section-heading compact"><div><span className="eyebrow">第 {summary.month} 月 · 本月账本</span><h2>钱从哪里来，又去了哪里</h2></div><span className="finance-note">资产配置不算消费</span></div><div className="finance-columns"><div><span className="finance-label">收入</span>{row('全部收入', summary.totalIncome, 'positive')}</div><div><span className="finance-label">消费支出</span>{row('生活与主动消费', -summary.totalConsumption, 'negative')}</div><div><span className="finance-label">资产配置</span>{row('现金 → 投资资产', -summary.totalAssetAllocation, 'transfer')}</div><div><span className="finance-label">现金结余</span>{row('本月现金变化', summary.cashChange, summary.cashChange >= 0 ? 'positive' : 'negative')}</div></div><div className="finance-total"><span>净资产变化</span><strong>{money(summary.netWorthStart)} → {money(summary.netWorthEnd)}（{summary.netWorthChange >= 0 ? '+' : ''}{money(summary.netWorthChange)}）</strong></div>{!compact && <><div className="ledger-detail"><span>收入来源</span><small>{categories(summary.income.categories)}</small></div><div className="ledger-detail"><span>消费分类</span><small>{categories(summary.consumption.categories)}</small></div><div className="ledger-detail"><span>资产配置</span><small>{categories(summary.assetAllocation.categories)}</small></div><div className="ledger-detail"><span>最近月份</span><small>{(game.financialHistory ?? []).slice(-6).map((entry) => `第${entry.month}月 ${money(entry.cashChange)}`).join(' · ') || '还没有已归档月份'}</small></div></>}</section>; }

function BusinessLocationSummary({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const owned = contentRegistry.businesses.filter((business) => game.businesses[business.id]);
  if (!owned.length) return null;
  const acquisitionTargets = contentRegistry.businesses.filter((business) => !game.businesses[business.id] && game.unlockedBusinessIds.includes(business.id));
  return <><section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">企业与城市</span><h2>经营地点</h2></div><p>企业拥有稳定地点引用；购买企业会记录一次到访，后续项目和经营仍可继续累积地点记录。</p></div><div className="item-list">{owned.map((business) => { const location = contentRegistry.locations?.find((entry) => entry.id === business.locationId); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">{location ? `${location.name} · ${location.region}` : '未指定地点'}</p></div><div className="row-meta"><span className="current-label">已访问 {game.locationVisits?.[business.locationId ?? ''] ?? 0} 次</span></div></div>; })}</div></section>{acquisitionTargets.length > 0 && <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">企业组合</span><h2>可并购企业</h2></div><p>以现有企业为基础并购另一家已解锁企业，交易会进入企业账本和人生记录。</p></div><div className="item-list">{acquisitionTargets.map((business) => <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">并购价 {money(Math.round(business.price * 1.1))} · 纳入企业组合</p></div><button className="text-button" onClick={() => dispatch({ type: 'acquire_business', businessId: business.id })}>并购 {money(Math.round(business.price * 1.1))}</button></div>)}</div></section>}</>;
}

function GiftPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const gifts = contentRegistry.items.filter((item) => item.giftable && (game.inventory[item.id] ?? 0) > 0);
  if (!gifts.length) return null;
  return <section className="detail-panel" aria-label="礼物"><div className="section-heading compact"><div><span className="eyebrow">小心意，不是关系任务</span><h2>准备一份礼物</h2></div><p>合适的礼物会带来一点额外关系进展；不需要靠昂贵礼物维持关系。</p></div><div className="item-list">{contentRegistry.characters.filter((character) => (game.relationships[character.id] ?? 0) > 0).map((character) => <div className="item-row" key={character.id}><div><h3>{character.name}</h3><span className="muted">偏好：{character.preferredGiftTags?.join('、') ?? '没有特别偏好'}</span></div><div className="button-pair">{gifts.map((item) => <button className="text-button" key={`${character.id}.${item.id}`} onClick={() => dispatch({ type: 'gift_item', characterId: character.id, itemId: item.id })}>送 {item.name}（×{game.inventory[item.id]}）</button>)}</div></div>)}</div></section>;
}

function CharacterPreferenceSummary({ game }: { game: GameState }) {
  const entries = contentRegistry.characters.filter((character) => character.preferredInteractionCategories?.length);
  if (!entries.length) return null;
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">关系反馈</span><h2>人物偏好</h2></div><p>选择对方偏好的互动类型，会让关系进展更顺利；偏好会在互动结算时生效并写入历史。</p></div><div className="item-list">{entries.map((character) => <div className="item-row" key={character.id}><div><h3>{character.name}</h3><span className="muted">偏好：{character.preferredInteractionCategories!.map((category) => interactionCategoryLabels[category] ?? category).join('、')}</span></div><div className="row-meta"><span className="current-label">当前关系 {game.relationships[character.id] ?? 0}</span></div></div>)}</div></section>;
}

function RelationshipHistoryView({ game }: { game: GameState }) {
  const records = game.lifeHistory ?? [];
  const monthlyRecords = records.filter((record) => record.category === 'relationship').reduce<Record<number, number>>((result, record) => {
    const month = Math.max(1, Math.ceil(record.day / 28));
    result[month] = (result[month] ?? 0) + 1;
    return result;
  }, {});
  const entries = contentRegistry.characters.map((character) => {
    const interactionIds = new Set((contentRegistry.relationshipInteractions ?? []).filter((interaction) => interaction.characterId === character.id).map((interaction) => interaction.id));
    const contactRecords = records.filter((record) => record.category === 'relationship' && (record.sourceId === character.id || (record.sourceId ? interactionIds.has(record.sourceId) : false)));
    return { character, contactRecords };
  }).filter(({ character, contactRecords }) => (game.relationships[character.id] ?? 0) > 0 || contactRecords.length > 0);
  const annualRecords = (game.worldHistory ?? []).slice(-5);
  return <section className="detail-panel" aria-label="关系历史"><div className="section-heading compact"><div><span className="eyebrow">关系账本</span><h2>关系历史</h2></div><p>这里汇总已保存的互动与消息记录；关系数值不会因为暂时没有点击而自动下降。</p></div>{entries.length === 0 ? <p className="muted">和第一个联系人发生互动后，这里会留下记录。</p> : <><div className="item-list">{entries.map(({ character, contactRecords }) => <div className="item-row" key={character.id}><div><h3>{character.name}</h3><p>当前关系 {game.relationships[character.id] ?? 0} · {contactRecords.length} 次记录</p><span className="muted">{contactRecords.slice(-3).map((record) => record.title).join(' · ') || '还没有可展示的互动记录'}</span></div></div>)}</div><div className="ledger-detail"><span>按月互动</span><small>{Object.entries(monthlyRecords).slice(-6).map(([month, count]) => `第 ${month} 月 · ${count} 次关系记录`).join(' · ')}</small></div></>}{annualRecords.length > 0 && <div className="ledger-detail" aria-label="年度关系趋势"><span>年度关系趋势</span><small>{annualRecords.map((record) => `第 ${record.year} 年 · 联系人 ${record.relationshipCount} 人`).join(' · ')}</small></div>}</section>;
}

function AnnualHistoryView({ game }: { game: GameState }) {
  const entries = game.annualHistory ?? [];
  const worldHistory = game.worldHistory ?? [];
  const [range, setRange] = useState<3 | 5 | 10>(5);
  const visible = entries.slice(-range);
  const first = visible[0];
  const last = visible.at(-1);
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">长期记录</span><h2>年度回顾</h2></div><p>年度记录来自已完成的十二个月，不改变自动模拟的暂停与决策节点。</p></div>{entries.length > 0 && <div className="filter-row" aria-label="年度跨度">{([3, 5, 10] as const).map((value) => <button key={value} className={range === value ? 'filter-button selected' : 'filter-button'} aria-pressed={range === value} onClick={() => setRange(value)}>近 {value} 年</button>)}</div>}{first && last && visible.length >= 3 && <div className="finance-total"><span>近 {visible.length} 年净资产变化</span><strong>{money(first.netWorthStart)} → {money(last.netWorthEnd)}（{last.netWorthEnd - first.netWorthStart >= 0 ? '+' : ''}{money(last.netWorthEnd - first.netWorthStart)}）</strong></div>}{entries.length ? <div className="item-list">{visible.map((entry) => { const world = worldHistory.find((snapshot) => snapshot.year === entry.year); return <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年</h3><p>{entry.months} 个月 · 收入 {money(entry.totalIncome)} · 消费 {money(entry.totalConsumption)} · 联系人 {world?.relationshipCount ?? '—'} 人</p></div><div className="row-meta"><strong>{money(entry.netWorthStart)} → {money(entry.netWorthEnd)}</strong><span className="muted">现金 {money(entry.cashStart)} → {money(entry.cashEnd)}</span></div></div>; })}</div> : <p className="muted">完成第一个年度后，这里会出现年度现金流与净资产记录。</p>}</section>;
}

function WorldHistoryView({ game }: { game: GameState }) {
  const entries = game.worldHistory ?? [];
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">世界记录</span><h2>世界记录</h2></div><p>每年结算时保存一次生活所处的世界状态，不改变玩家的规划权。</p></div>{entries.length ? <div className="item-list">{entries.map((entry) => <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年 · 经营 {entry.businessCount} 家企业</h3><p>{entry.currentJobId ? `当前职业：${contentRegistry.jobs.find((job) => job.id === entry.currentJobId)?.name ?? entry.currentJobId}` : '当前没有正式职业'} · 关系联系人 {entry.relationshipCount} 人</p></div><div className="row-meta"><strong>{money(entry.netWorth)}</strong><span className="muted">访问 {entry.visitedLocationCount} 个地点</span>{entry.locationDevelopment && <span className="muted">发展：{Object.entries(entry.locationDevelopment).map(([id, level]) => `${contentRegistry.locations?.find((location) => location.id === id)?.name ?? id} ${level}/5`).join(" · ")}</span>}</div></div>)}</div> : <p className="muted">完成第一个年度后，这里会出现企业、关系、地点和净资产的世界快照。</p>}</section>;
}

function WorldEquityHistoryView({ game }: { game: GameState }) {
  const entries = (game.worldHistory ?? []).filter((entry) => entry.listedBusinessCount !== undefined);
  if (!entries.length) return null;
  return <section className="detail-panel" aria-label="年度公开股权记录"><div className="section-heading compact"><div><span className="eyebrow">企业股权变化</span><h2>年度公开股权记录</h2></div><p>上市企业和公开流通比例会随年度结算归档，作为世界状态的一部分保留。</p></div><div className="item-list">{entries.map((entry) => <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年</h3><p>上市企业 {entry.listedBusinessCount} 家</p></div><div className="row-meta"><strong>公开流通 {entry.publicFloatPercent ?? 0}%</strong></div></div>)}</div></section>;
}

function ProfileView({ game, netWorth, lifestyle, onReset }: { game: GameState; netWorth: number; lifestyle: number; onReset: () => void }) { const currentJob = contentRegistry.jobs.find((job) => job.id === game.currentJobId); const attributes = game.attributes; const wealthTier = wealthTierForNetWorth(netWorth); const labels: Array<[string, number]> = [['专业', attributes?.professional ?? game.ability], ['知识', attributes?.knowledge ?? game.ability], ['沟通', attributes?.communication ?? game.ability], ['体能', attributes?.fitness ?? game.ability], ['形象', attributes?.appearance ?? lifestyle], ['人脉', attributes?.network ?? 0], ['心情', attributes?.mood ?? 50]]; return <><div className="section-heading compact"><div><span className="eyebrow">把进步看清楚</span><h1>我的</h1></div><p>每个数字都来自正在运行的生活。</p></div><div className="profile-grid"><div className="info-panel"><span>现金</span><strong>{money(game.cash)}</strong></div><div className="info-panel"><span>净资产</span><strong>{money(netWorth)}</strong></div><div className="info-panel"><span>财富阶段</span><strong>{wealthTier.name}</strong></div><div className="info-panel"><span>当前工作</span><strong>{currentJob?.name ?? '暂无'}</strong></div></div><div className="detail-panel"><span className="eyebrow">长期财富阶梯</span><h2>{wealthTier.name}</h2><p>{wealthTier.description}</p>{(wealthTier.id === 'world' || wealthTier.id === 'global') && <p className="requirement-met">世界级财富阶段已达成 · 继续生活</p>}</div><div className="attribute-grid">{labels.map(([label, value]) => <div className="attribute-row" key={label}><span>{label}</span><strong>{value}</strong><i style={{ width: `${Math.min(100, value)}%` }} /></div>)}</div>{Object.entries(game.interestFamiliarity ?? {}).length > 0 && <div className="detail-panel"><span className="eyebrow">兴趣熟练度</span><h2>在生活里慢慢熟悉</h2><div className="item-list">{Object.entries(game.interestFamiliarity ?? {}).map(([tag, value]) => <div className="item-row" key={tag}><span>{interestFamiliarityLabel(tag)}</span><strong>{interestFamiliarityStage(Number(value))}</strong></div>)}</div></div>}<FinancialSummaryView game={game} /><RelationshipHistoryView game={game} /><LifeHistoryList entries={game.lifeHistory ?? []} /><div className="detail-panel"><h2>存档</h2><p>每次重要状态变化都会保存。刷新会停在当前分钟，不产生离线时间。</p><button className="secondary-button" onClick={onReset}>重新开始</button></div></>; }

function RecruitmentModal({ game, job, dispatch }: { game: GameState; job: (typeof contentRegistry.jobs)[number]; dispatch: (action: GameAction) => void }) { const recruitment = game.activeRecruitment!; const recruiter = contentRegistry.characters.find((character) => character.id === recruitment.recruiterCharacterId); const schedule = defaultJobSchedule(job); const recruitmentData = job.recruitment; return <div className="modal-backdrop"><section className="event-modal recruitment-modal" role="dialog" aria-modal="true" aria-labelledby="recruitment-title">{recruitment.stage === 'dialogue' ? <><span className="eyebrow">{recruiter?.identity ?? '招聘联系人'}</span><h2 id="recruitment-title">{recruiter?.name ?? '招聘联系人'}</h2><p>{recruitmentData?.intro?.[0]?.text ?? '“最近这边正好缺人。”'}</p><p>{recruitmentData?.intro?.[1]?.text ?? `“${job.name}主要负责${job.description.replace(/[。．]$/, '')}。”`}</p><div className="dialogue-person">{recruiter?.description ?? '有人愿意和你聊聊这份工作。'}</div><button className="primary-button" onClick={() => dispatch({ type: 'advance_recruitment', jobId: job.id })}>继续了解</button></> : recruitment.stage === 'interview' ? <><span className="eyebrow">面试</span><h2 id="recruitment-title">简单聊聊</h2><p>{recruitmentData?.interview?.[0]?.text ?? '“你之前做过哪些类似的事情？”'}</p><p>{recruitmentData?.interview?.[1]?.text ?? '“我们更看重稳定、愿意学习和把事情做完。”'}</p><button className="primary-button" onClick={() => dispatch({ type: 'advance_recruitment', jobId: job.id })}>进入工作邀请</button></> : <><span className="eyebrow">工作邀请</span><h2 id="recruitment-title">{job.name}</h2><p>{recruitmentData?.offerText ?? '这是一份清晰、稳定的工作安排。'}</p><div className="offer-grid"><span>月薪</span><strong>{job.kind === 'regular' ? money(job.basePay * 20) : money(job.basePay)}</strong><span>工作时间</span><strong>{job.kind === 'regular' ? `${schedule.workDays.length * job.hours}h / 周` : `${job.hours}h / 次`}</strong><span>排班</span><strong>{job.kind === 'regular' ? `周一至周五 · ${formatClock(Math.floor(schedule.startMinute / 60), schedule.startMinute % 60)}–${formatClock(Math.floor(schedule.endMinute / 60), schedule.endMinute % 60)}` : '由你的周计划安排'}</strong></div><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'accept_job_offer', jobId: job.id })}>接受工作</button><button className="secondary-button" onClick={() => dispatch({ type: 'decline_job_offer', jobId: job.id })}>暂时不接受</button></div></>}</section></div>; }

function RewardModal({ reward, dispatch }: { reward: NonNullable<GameState['pendingReward']>; dispatch: (action: GameAction) => void }) {
  return <div className="modal-backdrop event-paused"><section className="event-modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title"><span className="eyebrow">本次获得</span><h2 id="reward-title">结果已经写入人生</h2><div className="reward-lines">{reward.lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div><p className="reward-auto-note">奖励已经结算。选择接下来是否继续运行。</p><div className="button-pair"><button className="secondary-button" onClick={() => dispatch({ type: 'claim_reward' })}>收下并暂停</button><button className="primary-button" onClick={() => dispatch({ type: 'claim_reward', resume: true })}>收下并继续运行</button></div></section></div>;
}

function ResignationModal({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { const job = contentRegistry.jobs.find((entry) => entry.id === game.activeResignation?.jobId); const outcome = game.activeResignation?.stage === 'outcome'; return <div className="modal-backdrop"><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="resignation-title"><span className="eyebrow">离职沟通</span><h2 id="resignation-title">{job?.name ?? '当前工作'}</h2>{!outcome ? <><p>主管看着你的安排：“你确定要离开吗？最近你的表现其实不错。”</p><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'advance_resignation' })}>继续沟通</button></div></> : <><p>“如果待遇可以提高，我愿意替你争取一下。”你也可以选择换一个方向。</p><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'choose_resignation', choice: 'stay' })}>留下来谈谈</button><button className="secondary-button" onClick={() => dispatch({ type: 'choose_resignation', choice: 'leave' })}>我想换个方向</button></div></>}</section></div>; }

function MonthlySummary({ summary, financial }: { summary: NonNullable<GameState['lastMonthlySummary']>; financial?: GameState['lastFinancialSummary'] }) { const fallback = [['工资', summary.ledger.wageIncome], ['兼职', summary.ledger.sideJobIncome], ['企业收益', summary.ledger.businessIncome], ['投资收益', summary.ledger.assetIncome], ['固定生活支出', -(summary.ledger.rentExpense + summary.ledger.livingExpense)], ['主动消费', -summary.ledger.purchaseExpense]]; const group = (label: string, entries: Record<string, number> | undefined, sign: 1 | -1) => <div className="summary-group" key={label}><span className="summary-group-title">{label}</span>{Object.entries(entries ?? {}).filter(([, amount]) => amount > 0).map(([category, amount]) => <div key={category}><span>{financialLabels[category] ?? category}</span><strong className={sign > 0 ? 'positive' : 'negative'}>{sign > 0 ? '+' : '-'}{money(amount)}</strong></div>)}</div>; return <section className="monthly-summary"><div><span className="eyebrow">四周结算 · 现金流仪式</span><h2>第 {summary.month} 月账单</h2><p>现金变化和净资产变化分开计算；买入资产只是把现金换成了另一种财富。</p></div><div className="summary-lines">{financial ? <>{group('收入', financial.income.categories, 1)}{group('消费支出', financial.consumption.categories, -1)}{group('资产配置 · 现金转为资产', financial.assetAllocation.categories, -1)}{group('资产变现', financial.assetLiquidation.categories, 1)}</> : fallback.map(([label, amount]) => <div key={label as string}><span>{label}</span><strong className={(amount as number) >= 0 ? 'positive' : 'negative'}>{(amount as number) >= 0 ? '+' : ''}{money(amount as number)}</strong></div>)}</div><div className="summary-total"><span>收入</span><strong>{money(financial?.totalIncome ?? summary.ledger.wageIncome + summary.ledger.sideJobIncome + summary.ledger.businessIncome + summary.ledger.assetIncome)}</strong><span>消费支出</span><strong>{money(financial?.totalConsumption ?? summary.ledger.rentExpense + summary.ledger.livingExpense + summary.ledger.purchaseExpense)}</strong><span>现金变化</span><strong>{financial ? `${money(financial.cashStart)} → ${money(financial.cashEnd)}` : '—'}</strong><span>净资产</span><strong>{money(summary.ledger.netWorthStart)} → {money(summary.ledger.netWorthEnd)}</strong></div></section>; }

function MonthlySummaryModal({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const pending = game.pendingMonthlySummary!;
  const financial = pending.financial;
  const incomeSources = Object.entries(financial?.income.categories ?? {}).filter(([, amount]) => amount > 0);
  return <div className="modal-backdrop event-paused"><section className="event-modal monthly-summary" role="dialog" aria-modal="true" aria-labelledby="monthly-title"><span className="eyebrow">月度结算 · 世界已暂停</span><h2 id="monthly-title">第 {pending.month} 月</h2><div className="summary-total"><span>收入</span><strong>{money(financial?.totalIncome ?? pending.summary.ledger.wageIncome + pending.summary.ledger.sideJobIncome)}</strong><span>消费支出</span><strong>{money(financial?.totalConsumption ?? pending.summary.ledger.livingExpense + pending.summary.ledger.rentExpense)}</strong><span>现金变化</span><strong>{financial ? money(financial.cashChange) : '—'}</strong><span>净资产</span><strong>{money(pending.summary.ledger.netWorthStart)} → {money(pending.summary.ledger.netWorthEnd)}</strong></div>{incomeSources.length > 0 && <div className="ledger-detail"><span>收入来源</span><small>{incomeSources.map(([category, amount]) => `${financialLabels[category] ?? category} ${money(amount)}`).join(' · ')}</small></div>}<div className="reward-lines">{pending.highlights.map((highlight) => <div key={highlight.id}>{highlight.label}</div>)}</div><button className="primary-button" onClick={() => dispatch({ type: 'acknowledge_monthly_summary' })}>进入下个月</button></section></div>;
}

function EventModal({ event, onChoose }: { event: (typeof contentRegistry.events)[number]; onChoose: (choiceId: string) => void }) { return <div className="modal-backdrop event-paused"><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title"><span className="eyebrow">世界已暂停 · 发生了一件事</span><h2 id="event-title">{event.title}</h2><p>{event.body}</p><div className="event-choices">{event.choices.map((choice) => <button key={choice.id} className="choice-button" onClick={() => onChoose(choice.id)}>{choice.text}<span>选择</span></button>)}</div></section></div>; }

function EffectRail({ effects }: { effects: ReturnType<typeof gameStore.getState>['effects'] }) { const visible = effects.filter((effect) => effect.type !== 'time' && effect.type !== 'activity'); if (!visible.length) return null; return <div className="effect-rail" aria-live="polite">{visible.slice(-4).map((effect, index) => <div className="effect-item" key={`${effect.type}-${index}`}>{effect.type === 'cash' ? `${effect.amount >= 0 ? '+' : ''}${money(effect.amount)}` : effect.type === 'stat' ? `${effect.stat === 'ability' ? '能力' : effect.stat === 'reputation' ? '声誉' : '生活水平'} ${effect.amount >= 0 ? '+' : ''}${effect.amount}` : effect.type === 'month' ? `第 ${effect.summary.month} 月结算` : effect.type === 'settlement' ? `第 ${effect.day} 天结算` : effect.type === 'unlock' ? `解锁：${effect.id}` : effect.type === 'purchase' ? `已购买 ${effect.quantity} 件` : effect.type === 'message' ? effect.text : '进展更新'}</div>)}</div>; }

function ConfirmReset({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) { return <div className="modal-backdrop"><section className="confirm-modal" role="dialog" aria-modal="true"><h2>重新开始？</h2><p>当前存档会被新的开始替换，之后可以从头体验。</p><div className="button-pair"><button className="secondary-button" onClick={onCancel}>先不重来</button><button className="primary-button" onClick={onConfirm}>确认重新开始</button></div></section></div>; }

function WealthMilestoneView({ game }: { game: GameState }) {
  if (!game.wealthMilestones?.length) return null;
  return <section className="detail-panel" aria-label="财富阶段记录"><span className="eyebrow">已走过的财富阶段</span><div className="item-list">{game.wealthMilestones.map((milestone) => <div className="item-row" key={milestone.id}><div><h3>{wealthTierForNetWorth(milestone.netWorth).name}</h3><p className="muted">第 {milestone.day} 天 · 净资产 {money(milestone.netWorth)}</p></div><span className="requirement-met">已记录</span></div>)}</div></section>;
}

function MilestoneProgressView({ game }: { game: GameState }) {
  const milestones = contentRegistry.milestones.filter((milestone) => game.completedMilestones.includes(milestone.id));
  if (!milestones.length) return null;
  return <section className="detail-panel" aria-label="里程碑记录"><div className="section-heading compact"><div><span className="eyebrow">生活中的节点</span><h2>里程碑记录</h2></div><p>这些记录来自已经发生的选择，不是新的等级系统。</p></div><div className="item-list">{milestones.map((milestone) => <div className="item-row" key={milestone.id}><div><h3>{milestone.name}</h3><p className="muted">{milestone.description}</p></div><span className="requirement-met">已达成</span></div>)}</div></section>;
}

export default App;
