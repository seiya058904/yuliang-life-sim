import { fixedMonthBudget } from './game/engine/settlementMath';
import { amount, amountText, subtractAmount, scaleAmount, unknown } from './game/engine/knownAmount';
import type { KnownAmount } from './game/content/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { balanceConfig } from './game/balance/config';
import { contentRegistry } from './game/content/registry';
import type { ActivityOption, AttributeId, CharacterDefinition, ContentId, EffectDefinition, GameAction, GameState, JobDefinition, MonthlyHighlight, PlannedActivity, PlanSlot, StatName, ViewId, Weekday } from './game/content/contracts';
import { businessValuation, calculateDailyBusinessProfit, calculateLifestyle, calculateNetWorth, canDirectBusinessOperations, effectiveBusinessLocationId, ownershipTierForEquity, ownershipTierForHolding, wealthTierForNetWorth } from './game/engine/economy';
import { activityAtTime, deriveActivityProgress, defaultJobSchedule, getDailyActivities } from './game/engine/schedule';
import { formatClock, formatDate, absoluteMinute } from './game/engine/time';
import { calendarForDay, weekdayLabel } from './game/engine/calendar';
import { findNextPlanOption, getItemCost } from './game/engine/actions';
import { createGameStore } from './game/store/gameStore';
import { explainCondition, evaluateCondition } from './game/engine/conditions';
import { getAttribute } from './game/engine/attributes';
import { investmentUnitValue } from './game/engine/investments';
import { summarizeFinancialLedger } from './game/engine/financialLedger';
import { CareerView, jobArtFor } from './game/ui/CareerView';
import { LifeHistoryList } from './game/ui/LifeHistoryList';
import { PixelIcon, type PixelIconName } from './game/ui/pixel/PixelIcon';
import { PixelIllustration } from './game/ui/pixel/PixelIllustration';
import type { PixelIllustrationName } from './game/ui/pixel/PixelIllustration';
import { PixelAction, PixelClock, SegmentMeter } from './game/ui/pixel/PixelUI';
import { PersistentStatusBar } from './game/ui/pixel/PersistentStatusBar';
import { displayContentName, displayMappedLabel, displaySettlementHighlightLabel, humanizeContentId } from './game/ui/pixel/displayNames';
import { forecastWeeklyPlan } from './game/engine/forecast';
import { housingMortgageTerms, housingPrice, housingRentPerDay, locationSummary, locationForCurrentJob } from './game/engine/locations';
import { getStorylineStage } from './game/engine/storylines';
import { characterCareerAt, makeWorldBranchEvaluator } from './game/engine/worldEvolution';
import { getDialogue } from './game/engine/dialogue';
import { activityCashCost, activityCooldownRemaining, activityDiscountLabel, interestFamiliarityLabel, interestFamiliarityStage } from './game/engine/activities';
import { serviceCooldownRemaining } from './game/engine/services';
import { useWeekScheduler } from './game/ui/weekScheduler';
import { CURRENT_TIME_FROM, CANONICAL_DURATIONS, collectPlanIssues, courseAvailability, slotWithin } from './game/engine/planning';
import { applicationCooldownRemaining, activeApplications, openOfferApplications, terminalApplications, unreadMessageCount, visibleMessages } from './game/engine/lifecycle';
import './styles.css';

export const appStore = createGameStore(contentRegistry, balanceConfig);
const gameStore = appStore;
// Opt-in debug bridge for browser long-run verification (activated by the test suite via localStorage).
declare global {
  interface Window {
    __yuliang?: { store: typeof appStore; eventChoices: Record<string, readonly string[]> };
  }
}
if (typeof window !== 'undefined' && window.localStorage.getItem('yuliang-e2e-hook') === '1') {
  const eventChoices: Record<string, readonly string[]> = {};
  for (const event of contentRegistry.events) {
    eventChoices[event.id] = event.choices.map((choice) => choice.id);
  }
  (window as unknown as { __yuliang?: unknown }).__yuliang = { store: appStore, eventChoices };
}
const navItems: ReadonlyArray<readonly [ViewId, string, PixelIconName]> = [
  ['life', '生活', 'home'], ['work', '职业', 'career'], ['shop', '商店', 'shop'], ['wealth', '财富', 'wealth'], ['relations', '社交', 'social'], ['city', '城市', 'city'], ['profile', '我的', 'profile'],
] as const;
const speedMinutesPerSecond = { 1: 360, 2: 720, 4: 1440 } as const;

function money(value: number | KnownAmount): string {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? '记录不完整' : `¥${Math.round(parsed.value).toLocaleString('zh-CN')}`;
}
function signedMoney(value: number | KnownAmount): string {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? '记录不完整' : `${parsed.value >= 0 ? '+' : '-'}${money(Math.abs(parsed.value))}`;
}
function amountClass(value: number | KnownAmount): string {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? '' : parsed.value >= 0 ? 'positive' : 'negative';
}
function amountDirection(value: number | KnownAmount): string {
  const parsed = amount(value);
  return parsed.kind === 'unknown' ? '记录不完整' : parsed.value >= 0 ? '增加' : '减少';
}

const categoryLabels: Record<string, string> = {
  consumable: '日用品', technology: '科技', clothing: '服装', furniture: '家居', leisure_item: '休闲用品', entertainment: '休闲用品', luxury: '奢侈品', collectible: '收藏品',
};
const activityCategoryLabels: Record<string, string> = {
  game: '游戏', film: '电影', nightlife: '夜生活', fitness: '健身', culture: '展览', hobby: '兴趣', social: '社交', food: '餐饮', premium: '品质生活', travel: '旅行',
};
const interactionCategoryLabels: Record<string, string> = { meal: '吃饭', work: '工作话题', outing: '出行', travel: '旅行', gift: '礼物', business: '经营' };
const attributeLabels: Record<string, string> = { professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情' };
const forecastAttributeOrder: readonly AttributeId[] = ['fitness', 'mood', 'professional', 'knowledge', 'network'];
const forecastAttributeIcons: Partial<Record<AttributeId, PixelIconName>> = { fitness: 'bolt', mood: 'heart', professional: 'career', knowledge: 'book', network: 'users' };
const statLabels: Record<string, string> = { ability: '能力', reputation: '声誉', lifestyle: '生活水平' };
const capabilityLabels: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };
const qualificationLabels: Record<string, string> = { 'qualification.workplace-basics': '职场基础', 'qualification.office-tools': '办公工具', 'qualification.data-analysis-basics': '数据分析基础', people_management_basics: '人员管理基础' };
const financialLabels: Record<string, string> = { wage: '工资', side_job: '兼职', bonus: '奖金', business_income: '企业收入', property_income: '房产收入', investment_dividend: '投资分红', event_income: '事件收入', other_income: '其他收入', housing: '住房', living: '基础生活', food: '餐饮', transport: '交通', communication: '通讯', shopping: '购物', entertainment: '娱乐', social: '社交', education: '教育', travel: '旅行', service: '服务', maintenance: '维修', business_cost: '企业成本', other_expense: '其他消费', investment_transfer: '投资配置', property_transfer: '房产配置', business_transfer: '企业配置', collectible_transfer: '收藏配置', asset_liquidation: '资产变现', cash: '现金', stock: '股票', fund: '基金', bonds: '债券', digital_asset: '数字资产', property: '房产', other_asset: '其他资产', realized_gain: '已实现收益', realized_loss: '已实现亏损' };
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

function shopTabForActivityCategory(category?: string): string {
  if (category === 'travel') return 'travel';
  if (['game', 'film', 'nightlife', 'fitness'].includes(category ?? '')) return 'fun';
  if (['culture', 'hobby'].includes(category ?? '')) return 'learn';
  if (['social', 'food', 'premium'].includes(category ?? '')) return 'social';
  return 'learn';
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
    contentRegistry.businesses.filter((business) => business.requirements && !game.unlockedBusinessIds.includes(business.id) && !evaluateCondition(business.requirements, game, contentRegistry, balanceConfig)).forEach((business) => entries.push({ id: business.id, name: business.name, condition: business.requirements! }));
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
  const saveError = gameStore((store) => store.saveError);
  const recovery = gameStore((store) => store.recovery);
  const acceptRecovery = gameStore((store) => store.acceptRecovery);
  const showRecovery = gameStore((store) => store.showRecovery);
  const dismissLoadProblem = gameStore((store) => store.dismissLoadProblem);
  const [resetOpen, setResetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shopTab, setShopTab] = useState('goods');

  const navigateToView = (view: ViewId) => {
    if (view === 'shop') setShopTab('goods');
    setView(view);
  };
  const navigateToShopActivity = (category?: string) => {
    setShopTab(shopTabForActivityCategory(category));
    setView('shop');
  };

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
    const main = document.querySelector('.main-content');
    if (main) {
      main.scrollTop = 0;
      main.scrollLeft = 0;
    }
  }, [activeView]);

  useEffect(() => {
    if (!effects.length) return undefined;
    const timeout = window.setTimeout(consumeEffects, 2400);
    return () => window.clearTimeout(timeout);
  }, [effects, consumeEffects]);

  const netWorth = useMemo(() => calculateNetWorth(game, contentRegistry, balanceConfig), [game]);
  const lifestyle = useMemo(() => calculateLifestyle(game, contentRegistry), [game]);
  const pendingEvent = game.pendingEventId ? contentRegistry.events.find((event) => event.id === game.pendingEventId) : undefined;
  const activeRecruitment = game.activeRecruitment ? contentRegistry.jobs.find((job) => job.id === game.activeRecruitment?.jobId) : undefined;
  const shellMode = game.pendingMonthlySummary ? 'monthly_summary' : game.simulationMode;

  return (
    <div className={`app-shell mode-${shellMode} view-${activeView}`}>
      <div className="outer-frame" aria-hidden="true" />
      <header className="topbar">
        <div className="brand-block"><div className="brand-wordmark"><h1 className="brand-mark"><span className="sr-only">余量</span><PixelIllustration name="brand-wordmark" size={120} className="brand-wordmark-art" /></h1><span className="brand-subtitle">人生模拟<small>v{game.contentVersion} · 澄川市</small></span></div><PixelIllustration name="brand-cat" size={48} className="brand-mascot" /></div>
        <div className="status-line" aria-label="当前状态">
          <span className="status-date"><span><b><span>第 {game.calendar.week} 周</span> · 周{weekdayLabel(game.calendar.weekday)}</b><small data-testid="date-value">{formatDate(game.time)}</small></span><PixelIcon name="calendar" /></span>
          <span className="status-clock"><PixelIcon name="clock" /><span className="status-clock-copy"><PixelClock className="status-clock-value" size="compact" data-testid={activeView === 'life' ? undefined : 'clock-value'} value={formatClock(game.time.hour, game.time.minute)} /><small>{game.pendingMonthlySummary ? modeText(shellMode) : activeView === 'life' ? '主循环' : modeText(shellMode)}</small></span></span>
          <span><PixelIcon name="cash" /><b data-testid="cash-value">现金 {money(game.cash)}</b></span>
          <span><PixelIcon name="wealth" /><span><small>净资产</small><b>{money(netWorth)}</b></span></span>
          <button type="button" className="settings-button" aria-label="设置" title="设置" aria-expanded={settingsOpen} aria-haspopup="dialog" onClick={() => setSettingsOpen((open) => !open)}><PixelIcon name="settings" size={32} /></button>
        </div>
      </header>

      <nav className="main-nav" aria-label="主导航" data-pixel-nav="true">
        <div className="nav-tabs">
          {navItems.map(([id, label, icon]) => <button key={id} className={activeView === id ? 'nav-item active' : 'nav-item'} aria-current={activeView === id ? 'page' : undefined} onClick={() => navigateToView(id)}><PixelIcon name={icon} />{label}</button>)}
        </div>
      </nav>

      <main className="main-content">
        {activeView === 'life' && <section className="life-hero-grid life-hero-dashboard" aria-label="生活主控制台"><TimeConsole game={game} dispatch={dispatch} /><ForecastPanel game={game} /></section>}
        <section className="metric-strip" aria-label="成长指标">
          <Metric label="生活水平" value={lifestyle} /><Metric label="能力" value={game.ability} /><Metric label="声誉" value={game.reputation} /><Metric label="关系" value={Object.values(game.relationships).reduce((sum, value) => sum + value, 0)} />
        </section>
        {lastError && <div className="notice error" role="alert">{lastError}</div>}
        {saveError && <div className="notice error" role="alert">{saveError}</div>}
        {recovery && (recovery.noticeVisible ? <div className="notice error" role="alert"><span>{recovery.reason}。原始存档尚未被替换，自动保存已暂停。{game.businessFacts?.history === 'partial' ? '旧历史仅恢复现存证据。' : ''}</span><div className="button-pair"><button className="text-button" onClick={acceptRecovery}>{recovery.kind === 'compatibility' ? '确认恢复并继续' : '继续使用当前临时存档'}</button><button className="text-button" onClick={() => reset()}>确认重置存档</button><button className="text-button" onClick={() => { const url = URL.createObjectURL(new Blob([recovery.raw], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'yuliang-original-save.txt'; link.click(); URL.revokeObjectURL(url); }}>导出原始存档</button><button className="text-button" onClick={dismissLoadProblem}>暂时隐藏</button></div></div> : <button onClick={showRecovery}>存档恢复待确认 · 自动保存已暂停</button>)}
        {activeView === 'life' && <LifeView game={game} dispatch={dispatch} onNavigate={navigateToView} />}
        {activeView === 'work' && <CareerWorkspace game={game} dispatch={dispatch} onNavigate={navigateToView} />}
        {activeView === 'shop' && <><ShopView game={game} dispatch={dispatch} onNavigate={navigateToView} initialTab={shopTab} /><div className="shop-support-panels"><AcquisitionRequirementsPanel game={game} onNavigate={navigateToView} scope="shop" /><ActivityAcquisitionHints game={game} dispatch={dispatch} /></div></>}
        {activeView === 'wealth' && <><AssetsView game={game} dispatch={dispatch} /><AcquisitionRequirementsPanel game={game} onNavigate={navigateToView} scope="wealth" /><BusinessGroupView game={game} dispatch={dispatch} /><BusinessOperationsView game={game} dispatch={dispatch} /><BusinessPublicFloatView game={game} dispatch={dispatch} /><BusinessLocationSummary game={game} dispatch={dispatch} /><PortfolioSummary game={game} /><PortfolioAllocation game={game} /><PortfolioHistory game={game} /></>}
        {activeView === 'relations' && <div className="social-page"><div className="social-primary"><RelationsView game={game} dispatch={dispatch} /></div><SocialDetail game={game} dispatch={dispatch} /><div className="social-support"><GiftPanel game={game} dispatch={dispatch} /><CharacterPreferenceSummary game={game} /><StorylinePanel game={game} dispatch={dispatch} /></div></div>}
        {activeView === 'city' && <CityView game={game} onNavigate={navigateToView} onShopActivity={navigateToShopActivity} />}
        {activeView === 'profile' && <><ProfileView game={game} netWorth={netWorth} lifestyle={lifestyle} onReset={() => setResetOpen(true)} /><WealthMilestoneView game={game} /><MilestoneProgressView game={game} /><AnnualHistoryView game={game} /><WorldHistoryView game={game} /><WorldEquityHistoryView game={game} /></>}
      </main>
      {!game.pendingMonthlySummary && <PersistentStatusBar game={game} onNavigate={navigateToView} />}

      <footer className="footer-note">你负责规划，世界负责继续运行。</footer>
      {!recovery && pendingEvent && <EventModal event={pendingEvent} onChoose={(choiceId) => dispatch({ type: 'choose_event', eventId: pendingEvent.id, choiceId })} />}
      {!recovery && activeRecruitment && game.activeRecruitment && <RecruitmentModal game={game} job={activeRecruitment} dispatch={dispatch} />}
      {!recovery && game.pendingReward && <RewardModal reward={game.pendingReward} dispatch={dispatch} />}
      {!recovery && game.activeResignation && <ResignationModal game={game} dispatch={dispatch} />}
      {!recovery && game.pendingMonthlySummary && <MonthlySummaryModal game={game} dispatch={dispatch} />}
      {effects.length > 0 && <EffectRail effects={effects} />}
      {resetOpen && <ConfirmReset onCancel={() => setResetOpen(false)} onConfirm={() => { reset(); setResetOpen(false); }} />}
      {settingsOpen && <SettingsPanel game={game} saveError={saveError} onClose={() => setSettingsOpen(false)} onReset={() => { setSettingsOpen(false); setResetOpen(true); }} />}
    </div>
  );
}

function CityView({ game, onNavigate, onShopActivity }: { game: GameState; onNavigate: (view: ViewId) => void; onShopActivity: (category?: string) => void }) {
  const home = contentRegistry.housing.find((entry) => entry.id === game.housing.housingId);
  const jobLocation = locationForCurrentJob(game, contentRegistry);
  const ambientLog = (game.ambientLog ?? []).slice(-6);
  return <section className="city-section">
    <div className="section-heading compact"><div><span className="eyebrow">澄川市</span><h1>城市与地点</h1></div><p>地点会影响通勤反馈与每日交通费用；访问次数只是记录，不是新的玩家等级。</p></div>
    <div className="item-grid">{locationSummary(contentRegistry).map((location) => <article className="item-card" key={location.id}><div className="secondary-card-art"><PixelIllustration name="city" size={70} /></div><div className="job-card-head"><span className="job-kind">{location.region}</span><span className="muted">{location.id === home?.locationId ? '当前居住' : location.id === jobLocation?.id ? '当前工作' : '可发现'}</span></div><h2>{location.name}</h2><p>{location.description}</p><span className="muted">发展阶段 {game.locationDevelopment?.[location.id] ?? 0}/5 · 交通系数 ×{location.transportCostMultiplier.toFixed(2)} · 已访问 {game.locationVisits?.[location.id] ?? 0} 次</span></article>)}</div>
    <section className="detail-panel" aria-label="城市场所"><div className="section-heading compact"><div><span className="eyebrow">Venue 网络</span><h2>城市里的场所</h2></div><p>先查看一个真实场所，再进入商店安排它承载的活动；执行后仍按正常规则结算并记录。</p></div><div className="item-grid">{(contentRegistry.venues ?? []).map((venue) => { const location = contentRegistry.locations?.find((entry) => entry.id === venue.locationId); const activities = venue.activityIds.map((id) => contentRegistry.activities?.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)); return <article className="item-card" key={venue.id}><div className="secondary-card-art"><PixelIllustration name="coffee" size={70} /></div><div className="job-card-head"><span className="job-kind">{location?.name ?? displayContentName(venue.locationId, contentRegistry.locations ?? [], '城市地点')}</span><span className="muted">{venue.priceRange ?? '按活动计费'}</span></div><h2>{venue.name}</h2><p>{venue.description}</p><div className="item-effect">可承载：{activities.map((activity) => activity.name).join('、')}</div><button className="secondary-button" onClick={() => onShopActivity(activities[0]?.category)}>去安排活动</button></article>; })}</div></section>
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
  return <section className="detail-panel" aria-label="财富组合历史"><div className="section-heading compact"><div><span className="eyebrow">每月归档</span><h2>财富组合历史</h2></div><p>记录每月现金、净资产与资产配置变化；数据来自已保存的月结账本。</p></div>{history.length === 0 ? <p className="muted">完成第一个月结后，这里会出现组合变化记录。</p> : <div className="item-list">{history.map((entry) => <article className="item-row" key={entry.month}><div><span className="job-kind">第 {entry.month} 月</span><h3>现金 {money(entry.cashStart)} → {money(entry.cashEnd)}</h3><p>净资产 {money(entry.netWorthStart)} → {money(entry.netWorthEnd)} · 变化 {signedMoney(entry.netWorthChange)}</p></div><div className="row-meta"><span>投资配置 {money(entry.assetAllocation.categories.investment_transfer ?? 0)}</span><span>分红 {money(entry.income.categories.investment_dividend ?? 0)}</span></div></article>)}</div>}</section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function CareerWorkspace({ game, dispatch, onNavigate }: { game: GameState; dispatch: (action: GameAction) => void; onNavigate: (view: ViewId) => void }) {
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => {
    if (!toolsOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toolsOpen]);

  return <>
    <CareerView game={game} dispatch={dispatch} jobs={contentRegistry.jobs} onNavigate={onNavigate} onOpenTools={() => setToolsOpen(true)} />
    {toolsOpen && <CareerToolsDrawer game={game} dispatch={dispatch} onClose={() => setToolsOpen(false)} />}
  </>;
}

function CareerToolsDrawer({ game, dispatch, onClose }: { game: GameState; dispatch: (action: GameAction) => void; onClose: () => void }) {
  return <section className="career-tools-drawer" role="dialog" aria-modal="true" aria-label="职业工具">
    <header className="career-tools-head">
      <div><span className="eyebrow">职业工具</span><h2 id="career-tools-title">安排与成长</h2></div>
      <button type="button" className="secondary-button" onClick={onClose}>关闭职业工具</button>
    </header>
    <div className="career-tools-content">
      <section className="planning-section career-tools-planning" aria-label="职业周计划"><div className="section-heading compact"><div><span className="eyebrow">周计划</span><h2>安排本周</h2></div><p>正式工作自动占用；下方数值均为预计。</p></div><WeekPlanner game={game} dispatch={dispatch} /></section>
      <CourseMarket game={game} dispatch={dispatch} />
      <ForecastPanel game={game} scrollTarget=".career-tools-planning" />
    </div>
  </section>;
}

/** 参考图反相面板：黑底白字的本周预测。 */
function ForecastPanel({ game, scrollTarget = '.life-planning-section' }: { game: GameState; scrollTarget?: string }) {
  const forecast = useMemo(() => forecastWeeklyPlan(game, game.weeklyPlan, contentRegistry, balanceConfig), [game]);
  const attributes = forecastAttributeOrder.map((key) => [key, forecast.attributes[key] ?? 0] as const);
  return <section className="forecast-strip inverse">
    <header className="forecast-head"><h2>本周剩余安排</h2><small>确定性计划变化 · 不包含随机事件、市场价格变化、未确定招聘结果</small></header>
    {forecast.warnings.length > 0 && <ul className="forecast-warnings" aria-label="无法执行的计划格">{forecast.warnings.slice(0, 4).map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    <div className="forecast-row"><span>预计收入</span><strong>+{money(forecast.income)}</strong></div>
    <div className="forecast-row"><span>预计支出</span><strong>-{money(forecast.expense)}</strong></div>
    <div className="forecast-net"><span>现金净变化</span><strong>{forecast.netCash >= 0 ? '+' : '-'}{money(Math.abs(forecast.netCash))}</strong></div>
    <div className="forecast-attrs"><span className="forecast-sub">属性变化</span>
      {attributes.map(([key, value]) => <div className="forecast-attr" key={key}><PixelIcon name={forecastAttributeIcons[key] ?? 'spark'} size={13} /><span>{attributeLabels[key] ?? key}</span><SegmentMeter value={getAttribute(game, key)} max={100} segments={10} /><b>{value > 0 ? '+' : value < 0 ? '-' : '±'}{Math.abs(value)}</b></div>)}
    </div>
    <button className="forecast-more" onClick={() => document.querySelector(scrollTarget)?.scrollIntoView({ behavior: 'smooth' })}><PixelAction label="详细预测" /></button>
  </section>;
}

const activitySceneByCategory: Record<string, PixelIllustrationName> = {
  travel: 'mountain', social: 'users', game: 'controller', film: 'film', nightlife: 'city',
  fitness: 'dumbbell', culture: 'painting', hobby: 'book', food: 'meal', premium: 'meal',
};
const activitySceneById: Record<string, PixelIllustrationName> = {
  'activity.cinema': 'film',
  'activity.premium-cinema': 'camera',
  'activity.home-movie': 'record',
  'activity.home-gaming': 'controller',
  'activity.new-game-night': 'controller',
  'activity.riverside-night-market': 'city',
  'activity.gym-session': 'dumbbell',
  'activity.personal-training': 'dumbbell',
  'activity.city-run': 'dumbbell',
};
function activitySceneFor(activity: { id: string; category: string }): PixelIllustrationName {
  return activitySceneById[activity.id] ?? activitySceneByCategory[activity.category] ?? 'controller';
}

export function workSceneFor(job?: JobDefinition): PixelIllustrationName {
  return job ? jobArtFor(job) : 'work';
}

function activityKinds(activity: PlannedActivity | NonNullable<GameState['currentActivity']>, currentJob?: JobDefinition): PixelIllustrationName {
  if (activity.kind === 'work') return workSceneFor(currentJob);
  if (activity.kind === 'sleep') return 'sleep';
  if (activity.kind === 'study' || activity.kind === 'course') return 'book';
  if (activity.kind === 'side_job') return 'coin';
  if (activity.kind === 'activity') {
    const definition = contentRegistry.activities?.find((entry) => entry.id === activity.activityId);
    return definition ? activitySceneFor(definition) : 'controller';
  }
  return 'life-activity';
}

function timeOfDayLabel(hour: number) {
  if (hour < 5) return '凌晨';
  if (hour < 11) return '上午';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  if (hour < 23) return '晚上';
  return '深夜';
}

function modeText(mode: GameState['simulationMode']) {
  return mode === 'running' ? '运行中' : mode === 'event' ? '事件暂停' : mode === 'reward' ? '奖励结算' : mode === 'monthly_summary' ? '月结待确认' : mode === 'paused' ? '已暂停' : '等待规划';
}

function primaryAction(mode: GameState['simulationMode']) {
  return { label: mode === 'running' ? '暂停' : mode === 'paused' ? '继续运行' : mode === 'planning' ? '开始本周' : '等待处理',
    type: (mode === 'running' ? 'pause_simulation' : mode === 'paused' ? 'resume_simulation' : 'start_week') as GameAction['type'],
    disabled: mode === 'event' || mode === 'reward',
    runEnabled: ['planning', 'paused', 'week_complete'].includes(mode) };
}

/** 参考图三段式 Hero：时间 / 当前活动 / 运行控制。 */
function TimeConsole({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const currentJob = contentRegistry.jobs.find((job) => job.id === game.currentJobId);
  const activity = game.currentActivity ?? activityAtTime(game.time, game.weeklyPlan, game.employment, contentRegistry);
  const progress = deriveActivityProgress(activity, game.time);
  const progressPercent = Math.round(progress * 100);
  const progressSegments = 20;
  const filledSegments = Math.round(progress * progressSegments);
  const dayActivities = getDailyActivities(game.time.day, game.weeklyPlan, game.employment, contentRegistry);
  const next = dayActivities.find((entry) => absoluteMinute(entry.start) > absoluteMinute(game.time) && !['sleep', 'life', 'free'].includes(entry.kind));
  const action = primaryAction(game.simulationMode);
  const title = activity.kind === 'work' ? currentJob?.name ?? '工作中' : activity.kind === 'study' ? '学习' : activity.kind === 'side_job' ? contentRegistry.jobs.find((job) => job.id === activity.jobId)?.name ?? '兼职' : activity.kind === 'activity' ? contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.name ?? '生活活动' : activity.kind === 'sleep' ? '睡眠' : activity.kind === 'life' ? '基础生活' : '自由时间';
  const scene = activityKinds(activity, currentJob);
  const nextLabel = next ? `${formatClock(next.start.hour, next.start.minute)} · ${next.kind === 'study' ? '学习' : next.kind === 'side_job' ? '兼职' : next.kind === 'activity' ? '生活活动' : '安排'}` : '今天没有特殊安排';
  return <section className="time-console" aria-label="世界时间">
    <div className="hero-cols">
      <div className="hero-time">
        <span className="console-kicker">当前时间</span>
        <PixelClock className="hero-clock" data-testid="clock-value" value={formatClock(game.time.hour, game.time.minute)} />
        <div className="hero-date"><b>第 {game.calendar.week} 周 · 周{weekdayLabel(game.calendar.weekday)}</b><small>{formatDate(game.time)} · {timeOfDayLabel(game.time.hour)}</small></div>
        <PixelIcon name="spark" size={28} className="hero-day-icon" />
        <div className="week-track" aria-label="本周进度">{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => <span key={weekday} className={weekday === game.calendar.weekday ? 'track-day current' : weekday < game.calendar.weekday ? 'track-day passed' : 'track-day'}>周{weekdayLabel(weekday)}</span>)}</div>
      </div>
      <div className="hero-activity">
      <div className="hero-activity-head"><PixelIcon name={scene === 'life' || scene === 'life-main' || scene === 'life-activity' ? 'home' : scene === 'work' || scene.startsWith('job-') ? 'career' : scene === 'sleep' ? 'sleep' : scene === 'book' ? 'book' : scene === 'coin' ? 'cash' : scene === 'suitcase' ? 'plane' : scene === 'users' ? 'users' : scene === 'cash' ? 'wealth' : scene === 'bag' ? 'shop' : 'spark'} /><span className="console-kicker">当前活动</span></div>
        <PixelIllustration name={scene} size={84} />
        <h2>{title}</h2>
        <p className="hero-range">{formatClock(activity.start.hour, activity.start.minute)} — {formatClock(activity.end.hour, activity.end.minute)} · {activity.kind === 'work' ? '自动排班' : '自动发生'}</p>
        <div className="activity-progress" role="meter" aria-label="今日活动进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>{Array.from({ length: progressSegments }, (_, index) => <i key={index} className={index < filledSegments ? 'filled' : undefined} />)}</div>
        <span className="progress-caption"><span>今日活动进度</span><b>{progressPercent}%</b></span>
        <div className="hero-next"><span>下一活动</span><b>{nextLabel}</b></div>
      </div>
      <div className="hero-controls">
        <span className="console-kicker">时间速度</span>
        <div className="speed-controls">{([1, 2, 4] as const).map((speed) => <button key={speed} className={game.simulationSpeed === speed ? 'speed-button active' : 'speed-button'} aria-pressed={game.simulationSpeed === speed} onClick={() => dispatch({ type: 'set_simulation_speed', speed })}>×{speed}</button>)}</div>
        <button className="primary-button hero-start" disabled={action.disabled} onClick={() => dispatch({ type: action.type } as GameAction)}>{action.label}</button>
        {game.simulationMode !== 'running' && <button className="secondary-button hero-pause" type="button" aria-label="暂停" disabled>暂停 Ⅱ</button>}
        <span className={`mode-label mode-${game.simulationMode}`}>{modeText(game.simulationMode)}</span>
      </div>
    </div>
  </section>;
}

function LifeView({ game, dispatch, onNavigate }: { game: GameState; dispatch: (action: GameAction) => void; onNavigate: (view: ViewId) => void }) {
  const home = contentRegistry.housing.find((entry) => entry.id === game.housing.housingId);
  const lifestyleScore = calculateLifestyle(game, contentRegistry);
  const lifestyleFactor = Math.min(balanceConfig.lifestyleCostFactorCap, Math.max(0, lifestyleScore * balanceConfig.lifestyleCostFactor));
  const monthlyBudget = fixedMonthBudget(game, contentRegistry, balanceConfig);
  const dailyRent = monthlyBudget.rent / 28;
  const fixed = monthlyBudget.total;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const action = primaryAction(game.simulationMode);
  return <>
    <section className="life-primary-dashboard" aria-label="生活核心面板">
      <section className="life-planning-section"><div className="section-heading compact"><div><h1>本周计划</h1></div><div className="planner-heading-side"><p>工作自动占用；其他时间由你安排。</p><PlanLegend /></div></div><WeekPlanner game={game} dispatch={dispatch} /></section>
      <InboxGrid game={game} onNavigate={onNavigate} />
    </section>
    <section className={`life-secondary-drawer${detailsOpen ? ' is-open' : ''}`} aria-label="生活详情">
      <div className="life-secondary-toggle-row"><span className="eyebrow">账本与居住</span><button className="secondary-button" aria-expanded={detailsOpen} aria-controls="life-secondary-details" onClick={() => setDetailsOpen((open) => !open)}>{detailsOpen ? '收起生活详情' : '查看生活详情'}</button></div>
      {detailsOpen && <div id="life-secondary-details" className="life-secondary-details">
        <section className="life-advanced-controls" aria-label="高级时间控制"><span className="eyebrow">更多时间</span><span className="muted">把已规划的人生交给世界运行。</span><button className="text-button" disabled={!action.runEnabled} onClick={() => dispatch({ type: 'advance_period', months: 1 })}>运行 1 个月</button><button className="text-button" disabled={!action.runEnabled} onClick={() => dispatch({ type: 'advance_period', months: 3 })}>运行 3 个月</button></section>
        <section className="life-info-grid" aria-label="生活信息面板"><section className="forecast-strip monthly-forecast"><div><span className="eyebrow">按当前状态折算 28 天</span><h2>先看余量，再安排生活</h2></div><div><span>固定支出</span><strong>{money(fixed)}</strong></div><div><span>房租</span><strong>{money(dailyRent * 28)}</strong></div><div><span>生活与交通</span><strong>{money(monthlyBudget.livingTransport)}</strong></div><div><span>维护与居住费用</span><strong>{money(monthlyBudget.maintenance)}</strong></div><div><span>房贷</span><strong>{money(monthlyBudget.mortgage)}</strong></div><div><span>通信与订阅</span><strong>{money(monthlyBudget.communication + monthlyBudget.subscriptions)}</strong></div></section><FinancialSummaryView game={game} compact /></section>
        <HousingView game={game} dispatch={dispatch} />
        <AcquisitionRequirementsPanel game={game} onNavigate={onNavigate} scope="life" />
      </div>}
    </section>
  </>;
}

const planLegend: ReadonlyArray<readonly [PixelIconName, string]> = [
  ['career', '工作'], ['book', '学习'], ['users', '社交'], ['cup', '生活'], ['controller', '自由'], ['spark', '其他'],
];

function PlanLegend() {
  return <div className="planner-legend" role="list" aria-label="计划类型图例">
    {planLegend.map(([icon, label]) => <span role="listitem" key={label}><PixelIcon name={icon} size={14} /><span>{label}</span></span>)}
  </div>;
}

interface InboxItem { icon: PixelIconName; title: string; meta?: string; unread?: boolean }

function inboxList(items: readonly InboxItem[], emptyText: string, emptyIllustration: PixelIllustrationName = 'mail', emptyHint = '', hasMore = false) {
  if (!items.length) {
    const label = emptyText || '暂无内容';
    return <div className="inbox-empty" role="status" aria-label={label}><span className="inbox-empty-mark"><PixelIllustration name={emptyIllustration} size={34} /></span><span className="inbox-empty-copy"><strong>{label}</strong>{emptyHint && <small>{emptyHint}</small>}</span></div>;
  }
  const visibleItems = items.slice(0, 4);
  const showEndRow = !hasMore && visibleItems.length < 4;
  return <ul className="inbox-list">{visibleItems.map((item, index) => (
    <li key={`${item.title}-${index}`}>
      <PixelIcon name={item.icon} size={16} />
      <span className="inbox-title"><b>{item.title}</b>{item.meta && <small>{item.meta}</small>}</span>
      {item.unread && <i className="inbox-dot" aria-label="未读" />}
    </li>
  ))}{showEndRow && <li className="inbox-list-end"><span>暂无更多</span></li>}</ul>;
}

/** 参考图第一屏的四格信息区：待处理 / 消息 / 事件 / Offer。 */
function InboxGrid({ game, onNavigate }: { game: GameState; onNavigate?: (view: ViewId) => void }) {
  const pending: InboxItem[] = [];
  const pendingEvent = game.pendingEventId ? contentRegistry.events.find((event) => event.id === game.pendingEventId) : undefined;
  if (pendingEvent) pending.push({ icon: 'alert', title: pendingEvent.title, meta: '事件待处理' });
  if (game.activeRecruitment) {
    const stageLabel = game.activeRecruitment.stage === 'offer' ? 'Offer 待回复' : game.activeRecruitment.stage === 'interview' ? '面试安排中' : '招聘对话中';
    pending.push({ icon: 'users', title: contentRegistry.jobs.find((job) => job.id === game.activeRecruitment!.jobId)?.name ?? '招聘流程', meta: stageLabel });
  }
  if (game.activeResignation) pending.push({ icon: 'career', title: '离职流程', meta: '等待结算确认' });
  // A dated Offer is actionable: it must reach the life page even if the player
  // never opens the career page, otherwise it silently expires.
  const openOffers = openOfferApplications(game);
  for (const application of openOffers.slice(0, 3)) {
    const jobName = displayContentName(application.jobId, contentRegistry.jobs, '工作机会');
    pending.push({ icon: 'tag', title: `Offer 待回复：${jobName}`, meta: application.offerExpiresDay !== undefined ? `第 ${application.offerExpiresDay} 天前有效` : '尽快回复' });
  }
  if (game.simulationMode === 'planning') pending.push({ icon: 'calendar', title: game.planNotice ?? '本周计划待开始', meta: game.planNotice ? `第 ${game.calendar.week} 周 · 部分计划格需要调整` : `第 ${game.calendar.week} 周 · 周${weekdayLabel(game.calendar.weekday)}` });
  const unreadCount = unreadMessageCount(game.messages);
  if (unreadCount) pending.push({ icon: 'mail', title: `${unreadCount} 条未读消息`, meta: '收件箱里有新的对话' });

  const allMessages = [...visibleMessages(game.messages)].reverse();
  const messageRowSource = [...allMessages.filter((m) => !m.read), ...allMessages.filter((m) => m.read)];
  const messageRows = messageRowSource.slice(0, 4).map((message): InboxItem => ({ icon: 'mail', title: message.title, meta: `第 ${message.day} 天`, unread: !message.read }));

  const eventRows: InboxItem[] = [];
  const ambientEntries = [...(game.ambientLog ?? [])].reverse();
  if (game.majorEventsThisMonth) eventRows.push({ icon: 'alert', title: `本月重要事件 ×${game.majorEventsThisMonth}`, meta: '已发生并写入记录' });
  for (const entry of ambientEntries.slice(0, 3)) eventRows.push({ icon: 'spark', title: entry.text, meta: `第 ${entry.day} 天` });

  const opportunities = game.opportunities ?? [];
  const gigs = game.gigs ?? [];
  const offerRows: InboxItem[] = openOffers.slice(0, 2).map((application): InboxItem => ({
    icon: 'tag',
    title: `Offer 待回复：${displayContentName(application.jobId, contentRegistry.jobs, '工作机会')}`,
    meta: application.offerExpiresDay !== undefined ? `第 ${application.offerExpiresDay} 天前回复 · 去职业页处理` : '去职业页处理',
  })).concat(opportunities.slice(0, 2).map((opportunity): InboxItem => ({
    icon: 'tag',
    title: displayContentName(opportunity.jobId, contentRegistry.jobs, '职业机会'),
    meta: `${opportunity.source} · 第 ${opportunity.expiresDay} 天前`,
  }))).concat(gigs.slice(0, 1).map((gig): InboxItem => ({
    icon: 'cash',
    title: displayContentName(gig.jobId, contentRegistry.jobs, '一次性机会'),
    meta: `一次性 Gig · 结算 ${money(gig.pay)}`,
  })));
  if (!offerRows.length) {
    const eligibleCount = (game.vacancies ?? []).filter((vacancy) => {
      const job = contentRegistry.jobs.find((candidate) => candidate.id === vacancy.jobId);
      return Boolean(job) && (job!.abilityRequired ?? 0) <= game.ability && (job!.reputationRequired ?? 0) <= game.reputation;
    }).length;
    offerRows.push({ icon: 'target', title: `${eligibleCount} 个岗位符合当前条件`, meta: '去招聘市场查看公开机会' });
  }

  const panels = [
    { key: 'pending', icon: 'alert' as PixelIconName, title: '待处理事项', count: pending.length, empty: '世界会按计划继续运转。', emptyHint: '安排下一周后，新的节点会在这里出现。', emptyIllustration: 'flag' as PixelIllustrationName, rows: pending, hasMore: pending.length > 4, action: '我的档案', target: 'profile' as ViewId },
    { key: 'messages', icon: 'mail' as PixelIconName, title: '消息', count: unreadCount, empty: '收件箱暂时是空的。', emptyHint: '新的对话会在关系变化后出现。', emptyIllustration: 'mail' as PixelIllustrationName, rows: messageRows, hasMore: messageRowSource.length > messageRows.length, action: '前往社交', target: 'relations' as ViewId },
    { key: 'events', icon: 'spark' as PixelIconName, title: '事件', count: game.eventsToday || eventRows.length, empty: '这一周风平浪静。', emptyHint: '城市开始运行后，见闻会被记录在这里。', emptyIllustration: 'spark' as PixelIllustrationName, rows: eventRows, hasMore: ambientEntries.length > 3, action: '打开城市', target: 'city' as ViewId },
    { key: 'offers', icon: 'tag' as PixelIconName, title: 'Offer 与机会', count: openOffers.length + opportunities.length + gigs.length, empty: '', emptyIllustration: 'tag' as PixelIllustrationName, rows: offerRows, hasMore: openOffers.length + opportunities.length > 2 || gigs.length > 1, action: openOffers.length ? '处理 Offer' : '进入招聘市场', target: 'work' as ViewId },
  ];
  return <section className="inbox-grid" aria-label="生活信息四宫格">
    {panels.map((panel) => <article className={`pixel-panel secondary inbox-panel inbox-${panel.key} pixel-corners`} key={panel.key}>
      <header className="inbox-head"><PixelIcon name={panel.icon} size={18} /><h2>{panel.title}</h2>{panel.count > 0 && <b className="inbox-count">{panel.count}</b>}</header>
      {inboxList(panel.rows, panel.empty, panel.emptyIllustration, panel.emptyHint, panel.hasMore)}
      <footer className="inbox-foot"><button onClick={() => onNavigate?.(panel.target)}><PixelAction label={panel.action} /></button></footer>
    </article>)}
  </section>;
}

function WorkView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  return <><section className="planning-section"><div className="section-heading compact"><div><span className="eyebrow">一周只规划几格</span><h1>本周计划</h1></div><p>正式工作由排班自动占用；这里只安排学习、课程、兼职、活动和自由时间。</p></div><WeekPlanner game={game} dispatch={dispatch} /></section><CourseMarket game={game} dispatch={dispatch} /><section className="market-section"><div className="section-heading compact"><div><span className="eyebrow">招聘市场 · 条件透明</span><h1>工作机会</h1></div><p>先看清缺什么，再决定要不要投入时间准备。</p></div><div className="job-grid">{contentRegistry.jobs.map((job) => { const current = game.currentJobId === job.id; const unlocked = game.unlockedJobIds.includes(job.id); const legacyMissing = job.abilityRequired !== undefined && game.ability < job.abilityRequired; const reputationMissing = job.reputationRequired !== undefined && game.reputation < job.reputationRequired; const conditionOk = !job.requirements || evaluateCondition(job.requirements, game, contentRegistry, balanceConfig); const itemMissing = job.requiredItems?.find((itemId) => (game.inventory[itemId] ?? 0) < 1); const capabilityMissing = job.requiredCapabilities?.find((capability) => !game.unlockedCapabilities.includes(capability)); const conditionMessage = !conditionOk ? explainCondition(job.requirements!, game, contentRegistry, balanceConfig) : itemMissing ? `需要：${displayContentName(itemMissing, contentRegistry.items)}` : capabilityMissing ? `需要：${displayMappedLabel(capabilityMissing, capabilityLabels)}` : '已满足申请条件'; const missingLegacy = !unlocked ? (conditionMessage === '已满足申请条件' ? '需要通过人物推荐或事件解锁' : conditionMessage) : legacyMissing ? `能力 ≥ ${job.abilityRequired}（当前 ${game.ability}）` : reputationMissing ? `声誉 ≥ ${job.reputationRequired}（当前 ${game.reputation}）` : conditionMessage; const blocked = !unlocked || legacyMissing || reputationMissing || !conditionOk || Boolean(itemMissing) || Boolean(capabilityMissing); const schedule = defaultJobSchedule(job); return <article className={current ? 'job-card current' : 'job-card'} key={job.id}><div className="job-card-head"><span className="job-kind">{job.category ?? (job.kind === 'regular' ? '基础岗位' : '自由职业')}</span><span className={current ? 'current-label' : 'muted'}>{current ? '当前工作' : job.kind === 'regular' ? '长期岗位' : '可安排兼职'}</span></div><h2>{job.name}</h2><p>{job.description}</p><div className="job-facts"><span>{job.kind === 'regular' ? `月薪约 ${money(job.basePay * 20)}` : `${money(job.basePay)} / 次`}</span><span>{job.kind === 'regular' ? `${schedule.workDays.length * job.hours}h / 周` : `${job.hours}h / 次`}</span></div><div className="requirement-box"><strong>申请条件</strong><span className={blocked && !current ? 'requirement-missing' : 'requirement-ok'}>{current ? '已在这份工作中' : missingLegacy}</span></div><div className="job-actions">{current ? <button className="secondary-button" onClick={() => dispatch({ type: 'start_resignation' })}>离开当前工作</button> : <button className="primary-button" aria-label={blocked ? `暂不可申请：${job.name}` : `查看招聘：${job.name}`} disabled={blocked} onClick={() => dispatch({ type: 'start_recruitment', jobId: job.id })}>{blocked ? '暂不可申请' : '查看招聘'}</button>}</div></article>; })}</div></section>{game.lastMonthlySummary && <MonthlySummary summary={game.lastMonthlySummary} financial={game.lastFinancialSummary} />}</>;
}

function WeekPlanner({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const sideJobs = contentRegistry.jobs.filter((job) => job.kind !== 'regular' && Boolean(game.acquiredSideJobs?.[job.id]));
  const weekStartDay = Math.max(1, game.time.day - game.calendar.weekday + 1);
  const cycle = (weekday: Weekday, slot: PlanSlot) => {
    const current = game.weeklyPlan.days[weekday][slot];
    const options: PlannedActivity[] = [{ kind: 'free' }, { kind: 'study', durationMinutes: 60 }, { kind: 'study', durationMinutes: 120 }, { kind: 'study', durationMinutes: 240 }, ...(contentRegistry.courses?.map((course) => ({ kind: 'course' as const, courseId: course.id })) ?? []), ...(contentRegistry.activities?.flatMap((activity) => activity.options.map((option) => ({ kind: 'activity' as const, activityId: activity.id, optionId: option.id }))) ?? []), ...sideJobs.map((job) => ({ kind: 'side_job' as const, jobId: job.id, durationMinutes: Math.min(240, Math.max(60, job.hours * 60)) as 60 | 120 | 240 }))];
    const index = options.findIndex((option) => JSON.stringify(option) === JSON.stringify(current));
    // Scan forward through the whole candidate ring and skip any option the
    // engine would reject (cooldown, requirements, side-job qualification,
    // weekly-plan constraints), so a single unplayable candidate can never
    // wedge the cell. If nothing else is legal, keep the current value.
    const next = findNextPlanOption(game, weekday, slot, game.weeklyPlan, options, index, contentRegistry, balanceConfig);
    if (next) dispatch({ type: 'set_plan', weekday, slot, activity: next.activity });
  };
    const planLabel = (activity: PlannedActivity) => activity.kind === 'free' ? '自由活动' : activity.kind === 'study' ? `学习 ${activity.durationMinutes / 60} 小时` : activity.kind === 'course' ? `课程 · ${displayContentName(activity.courseId, contentRegistry.courses ?? [], '课程')}` : activity.kind === 'side_job' ? `${contentRegistry.jobs.find((job) => job.id === activity.jobId)?.name ?? '兼职'} ${activity.durationMinutes / 60} 小时` : `${contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.name ?? '活动'} · ${contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.options.find((option) => option.id === activity.optionId)?.label ?? humanizeContentId(activity.optionId)}`;
    const planIcon = (activity: PlannedActivity, working = false): PixelIconName => {
      if (working || activity.kind === 'side_job') return 'career';
      if (activity.kind === 'study' || activity.kind === 'course') return 'book';
      if (activity.kind === 'free') return 'controller';
      const category = contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.category;
      return category === 'food' ? 'cup' : category === 'travel' ? 'plane' : category === 'social' ? 'users' : category === 'fitness' ? 'target' : category === 'film' || category === 'game' || category === 'nightlife' ? 'controller' : 'spark';
    };
    const planTimeLabel = (activity: PlannedActivity, slot: PlanSlot, working = false) => {
      const schedule = working ? game.employment?.schedule : undefined;
      const start = schedule?.startMinute ?? (slot === 'day' ? 9 * 60 : 19 * 60);
      const endOfSlot = slot === 'day' ? 17 * 60 : 23 * 60;
      const duration = activity.kind === 'free' ? endOfSlot - start : activity.kind === 'course' ? contentRegistry.courses?.find((course) => course.id === activity.courseId)?.durationMinutes ?? 0 : activity.kind === 'activity' ? contentRegistry.activities?.find((entry) => entry.id === activity.activityId)?.options.find((option) => option.id === activity.optionId)?.durationMinutes ?? 0 : activity.durationMinutes;
      const end = schedule?.endMinute ?? Math.min(endOfSlot, start + duration);
      return `${formatClock(Math.floor(start / 60), start % 60)}–${formatClock(Math.floor(end / 60), end % 60)}`;
    };
    const planContent = (activity: PlannedActivity, slot: PlanSlot, working = false) => <><PixelIcon name={planIcon(activity, working)} size={14} /><strong>{working ? '工作' : planLabel(activity)}</strong><small>{planTimeLabel(activity, slot, working)}</small></>;
    const plannedCost = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((weekday) => [game.weeklyPlan.days[weekday].day, game.weeklyPlan.days[weekday].evening]).reduce((sum, activity) => { if (activity.kind !== 'activity') return sum + (activity.kind === 'course' ? contentRegistry.courses?.find((course) => course.id === activity.courseId)?.cashCost ?? 0 : 0); const definition = contentRegistry.activities?.find((entry) => entry.id === activity.activityId); const option = definition?.options.find((entry) => entry.id === activity.optionId); return sum + (definition && option ? activityCashCost(game, definition, option, contentRegistry) : 0); }, 0);
  // Planning domain drives the cell states: a started slot is history, and a
  // slot the engine currently refuses is marked so the player can fix it.
  const planIssues = collectPlanIssues(game.weeklyPlan, game, { content: contentRegistry, balance: balanceConfig, employment: game.employment });
  const issueFor = (weekday: Weekday, slot: PlanSlot | 'next') => planIssues.find((issue) => issue.weekday === weekday && issue.slot === slot);
  const blocked = new Set(planIssues.map((issue) => `${issue.weekday}:${issue.slot}`));
  const frozen = (weekday: Weekday, slot: PlanSlot) => !slotWithin(weekday, slot, CURRENT_TIME_FROM, game.time);
  const locked = game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward';
  const cell = (weekday: Weekday, slot: PlanSlot, label: string, extraClass: string, disabled: boolean, content: React.ReactNode) => {
    const issue = issueFor(weekday, slot) ?? (slot === 'day' ? issueFor(weekday, 'next') : undefined);
    const isFrozen = frozen(weekday, slot);
    const classes = ['plan-cell', extraClass, isFrozen ? 'past' : '', issue ? 'has-issue' : ''].filter(Boolean).join(' ');
    const title = isFrozen ? '这一格已经过去，不能再修改' : issue ? issue.message : undefined;
    return <button key={weekday} className={classes} title={title} disabled={disabled} onClick={() => cycle(weekday, slot)} aria-label={`${label}${isFrozen ? '（已过去）' : ''}${issue ? `（需要调整：${issue.message}）` : ''}`}>{content}{isFrozen && <span className="plan-cell-flag">已完成</span>}{issue && !isFrozen && <span className="plan-cell-warn" aria-hidden="true">!</span>}</button>;
  };
  const notice = game.planNotice ?? [...new Set(planIssues.map((issue) => issue.message))].slice(0, 2).join('；');
  return <div className="planner pixel-corners">{notice && <p className={game.planNotice ? 'planner-notice alert' : 'planner-notice'} role="status">{game.planNotice ? `${game.planNotice}：` : ''}{notice}</p>}<div className="planner-head"><span>计划格</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday, index) => <strong key={weekday} className={weekday === game.calendar.weekday ? 'today' : ''}><span>周{weekdayLabel(weekday)}</span><small>第 {weekStartDay + index} 天</small></strong>)}</div><div className="planner-row"><span>白天</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => { const working = game.employment?.schedule.workDays.includes(weekday); const plan = game.weeklyPlan.days[weekday].day; return cell(weekday, 'day', `周${weekdayLabel(weekday)}白天计划`, working ? 'locked' : '', working || frozen(weekday, 'day') || locked, planContent(plan, 'day', working)); })}</div><div className="planner-row"><span>晚间</span>{([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => { const plan = game.weeklyPlan.days[weekday].evening; return cell(weekday, 'evening', `周${weekdayLabel(weekday)}晚间计划`, '', frozen(weekday, 'evening') || locked, planContent(plan, 'evening')); })}</div><div className="planner-actions"><button className="secondary-button" onClick={() => dispatch({ type: 'copy_previous_plan' })}>使用上周计划</button><label className="repeat-toggle"><input type="checkbox" checked={game.autoRepeatPlan} onChange={(event) => dispatch({ type: 'set_auto_repeat_plan', enabled: event.target.checked })} /> 自动重复计划</label><span className="plan-cost">本周课程与活动预计 {money(plannedCost)}</span></div></div>;
}

function InventoryPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const entries = contentRegistry.items.filter((item) => (game.inventory[item.id] ?? 0) > 0);
  return <section className="detail-panel" aria-label="我的库存"><div className="section-heading compact"><div><PixelIcon name="bag" size={16} data-rail-icon="bag" /><span className="eyebrow">库存</span><h2>我的商品</h2></div><p>消耗品可以使用；耐用品可以出售，所有变化都会进入账本与人生记录。</p></div>{entries.length ? <div className="inventory-strip" aria-label="库存商品">{entries.map((item) => <article className="inventory-item" key={item.id}><PixelIllustration name={itemIllustrationFor(item)} size={30} className="inventory-item-art" aria-hidden="true" /><div className="inventory-item-copy"><h3>{item.name}</h3><span>库存 ×{game.inventory[item.id]}</span></div><div className="inventory-item-actions">{item.consumable && <button className="secondary-button" title={`使用一次：${item.name}`} onClick={() => dispatch({ type: 'use_item', itemId: item.id })}>使用一次</button>}{item.sellable && <button className="text-button" title={`出售一次：${item.name}`} onClick={() => dispatch({ type: 'sell_item', itemId: item.id, quantity: 1 })}>出售一次</button>}</div></article>)}</div> : <ShopRailEmptyState illustration="bag" title="库存还是空的" hint="购买商品后，会在这里管理库存。" />}</section>;
}

function WishlistPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const items = (game.wishlist ?? []).map((itemId) => contentRegistry.items.find((item) => item.id === itemId)).filter((item): item is (typeof contentRegistry.items)[number] => Boolean(item));
  return <section className="detail-panel" aria-label="愿望清单"><div className="section-heading compact"><div><PixelIcon name="heart" size={16} data-rail-icon="heart" /><span className="eyebrow">消费目标</span><h2>愿望清单</h2></div><p>把想买的东西先记下来，查看距离目标还差多少现金。</p></div>{items.length ? <div className="item-list">{items.map((item) => { const price = getItemCost(game, item); const missing = Math.max(0, price - game.cash); return <div className="item-row" key={item.id}><div><PixelIcon name="heart" size={14} aria-hidden="true" data-wishlist-row-icon="heart" /><h2>{item.name}</h2><p>{missing ? `还差 ${money(missing)}` : '现在可以买'}</p></div><div className="row-meta"><strong>{money(price)}</strong><div className="button-pair"><button className="text-button" disabled={missing > 0} onClick={() => dispatch({ type: 'purchase_items', items: { [item.id]: 1 } })}>买下</button><button className="text-button" onClick={() => dispatch({ type: 'manage_wishlist', itemId: item.id, enabled: false })}>移除</button></div></div></div>; })}</div> : <ShopRailEmptyState illustration="heart" title="还没有消费目标" hint="在商品卡片加入目标后，会在这里查看进度。" />}</section>;
}

function ShopRailEmptyState({ illustration, title, hint }: { illustration: PixelIllustrationName; title: string; hint: string }) {
  return <div className="shop-rail-empty" role="status"><PixelIllustration name={illustration} size={34} aria-hidden="true" /><strong>{title}</strong><small>{hint}</small></div>;
}

function ServiceMarket({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  return <section className="detail-panel" aria-label="服务与订阅"><div className="section-heading compact"><div><span className="eyebrow">日常生活</span><h2>服务与订阅</h2></div><p>一次性服务立即结算；订阅在每月结算时自动扣费，可随时取消。</p></div><div className="item-list">{(contentRegistry.services ?? []).map((service) => { const available = !service.requirements || evaluateCondition(service.requirements, game, contentRegistry, balanceConfig); const cooldown = serviceCooldownRemaining(game, service); const usable = available && cooldown === 0 && game.cash >= service.price; return <div className="item-row" key={service.id}><div><span className="job-kind">一次性服务</span><h2>{service.name}</h2><p>{service.description}</p>{cooldown > 0 ? <span className="requirement-missing">冷却中 · 还需 {cooldown} 天</span> : service.requirements && <span className={available ? 'requirement-ok' : 'requirement-missing'}>{explainCondition(service.requirements, game, contentRegistry, balanceConfig)}</span>}</div><div className="row-meta"><strong>{money(service.price)}</strong><button className="text-button" disabled={!usable} onClick={() => dispatch({ type: 'use_service', serviceId: service.id })}>{cooldown > 0 ? `冷却中 · 还需 ${cooldown} 天` : '使用服务'}</button></div></div>; })}</div><div className="item-list">{(contentRegistry.subscriptions ?? []).map((subscription) => { const active = Boolean(game.activeSubscriptions?.[subscription.id]); return <div className="item-row" key={subscription.id}><div><span className="job-kind">月度订阅</span><h2>{subscription.name}</h2><p>{subscription.description}</p></div><div className="row-meta"><strong>{money(subscription.monthlyFee)} /月</strong><button className="text-button" onClick={() => dispatch({ type: 'manage_subscription', subscriptionId: subscription.id, enabled: !active })}>{active ? '取消订阅' : '开通订阅'}</button></div></div>; })}</div><ServiceHistoryView game={game} /></section>;
}

function ServiceHistoryView({ game }: { game: GameState }) {
  const records = (game.lifeHistory ?? []).filter((record) => record.category === 'service').slice(-6);
  return <div className="ledger-detail" role="region" aria-label="服务记录"><span>最近服务记录</span><small>{records.length ? records.map((record) => `第 ${record.day} 天 · ${record.title}`).join(' · ') : '使用服务或开通订阅后，这里会保留最近记录'}</small></div>;
}

/** 参考图 Shop 结构：六类大标签 + 高密度目录 + 右侧工具栏 + 底部选中详情。 */
const shopTabs: ReadonlyArray<readonly [string, string]> = [
  ['goods', '商品'], ['services', '服务'], ['fun', '娱乐'], ['learn', '学习'], ['social', '社交'], ['travel', '旅行'],
];
const itemArt: Record<string, PixelIllustrationName> = {
  technology: 'phone', consumable: 'meal', clothing: 'hoodie', furniture: 'desk',
  leisure_item: 'tag', entertainment: 'film', luxury: 'watch', collectible: 'record',
};
const itemArtById: Partial<Record<ContentId, PixelIllustrationName>> = {
  'item.seed-coffee': 'coffee', 'item.seed-phone': 'phone', 'item.seed-laptop': 'laptop',
  'item.seed-desk': 'desk', 'item.seed-shirt': 'hoodie', 'item.seed-watch': 'watch',
  'item.seed-record': 'record', 'item.breakfast-voucher': 'voucher', 'item.good-meal': 'meal',
  'item.movie-ticket': 'film', 'item.book-set': 'book', 'item.smartphone': 'phone',
  'item.pro-laptop': 'laptop', 'item.headphones': 'headphones', 'item.tablet': 'tablet',
  'item.sneakers': 'sneakers', 'item.jacket': 'hoodie', 'item.suit': 'hoodie',
  'item.good-bed': 'sleep', 'item.office-chair': 'desk', 'item.kitchen-set': 'meal',
  'item.sofa': 'house', 'item.monitor': 'laptop', 'item.gold-bracelet': 'watch',
  'item.vintage-camera': 'camera', 'item.fountain-pen': 'book', 'item.designer-bag': 'bag',
  'item.art-print': 'painting', 'item.diamond-pendant': 'diamond', 'item.camping-gear': 'mountain',
  'gift.flowers': 'flower', 'gift.dessert-box': 'meal', 'gift.coffee-set': 'coffee',
  'item.smart-home-set': 'house',
};
function itemIllustrationFor(item: (typeof contentRegistry.items)[number]): PixelIllustrationName {
  return itemArtById[item.id] ?? itemArt[item.category] ?? 'tag';
}
const shopTabCategories: Record<string, readonly string[]> = {
  fun: ['game', 'film', 'nightlife', 'fitness'],
  learn: ['culture', 'hobby'],
  social: ['social', 'food', 'premium'],
  travel: ['travel'],
};

function statMapTexts(map: Partial<Record<AttributeId | StatName, number>> | undefined): string[] {
  return Object.entries(map ?? {}).map(([id, value]) => `${displayMappedLabel(id, { ...attributeLabels, ...statLabels })} ${value >= 0 ? '+' : ''}${value}`);
}

function effectTexts(effects: readonly EffectDefinition[] | undefined): string[] {
  return (effects ?? []).filter((effect) => ['attribute', 'stat', 'relation', 'cash'].includes(effect.type)).map((effect) => {
    switch (effect.type) {
      case 'attribute': return `${displayMappedLabel(effect.attribute, attributeLabels)} ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
      case 'stat': return `${displayMappedLabel(effect.stat, statLabels)} ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
      case 'relation': return `关系 ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
      case 'cash': return `${effect.amount >= 0 ? '+' : '-'}${money(Math.abs(effect.amount))}`;
      default: return '新的进展';
    }
  });
}

interface CatalogMeterDefinition {
  label: string;
  value: number;
  max: number;
  caption: string;
}

function catalogMeterMax(value: number, base = 5): number {
  return Math.max(base, Math.ceil(Math.abs(value) / base) * base);
}

function CatalogMeters({ metrics, ariaLabel }: { metrics: readonly CatalogMeterDefinition[]; ariaLabel: string }) {
  return <div className="catalog-meter-stack" aria-label={ariaLabel}>
    {metrics.map((metric, index) => <div className="catalog-meter-row" key={`${metric.label}-${index}`}>
      <span>{metric.label}</span>
      <SegmentMeter value={metric.value} max={metric.max} segments={6} label={`${metric.label} ${metric.caption}`} />
      <b>{metric.caption}</b>
    </div>)}
  </div>;
}

type CatalogFact = readonly [string, string];

function CatalogFacts({ facts, ariaLabel }: { facts: readonly CatalogFact[]; ariaLabel: string }) {
  return <dl className="catalog-facts" aria-label={ariaLabel}>
    {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}
  </dl>;
}

function itemCatalogFacts(item: (typeof contentRegistry.items)[number], game: GameState): CatalogFact[] {
  const effects = [...statMapTexts(item.attributeEffects), ...statMapTexts(item.statEffects)].slice(0, 2).join(' · ')
    || (item.capabilities?.length ? `解锁：${item.capabilities.map((capability) => displayMappedLabel(capability, capabilityLabels)).join('、')}` : `生活水平 ${item.lifestyleDelta >= 0 ? '+' : ''}${item.lifestyleDelta}`);
  const type = item.consumable ? '消耗品' : item.sellable ? '耐用品 · 可出售' : '耐用品';
  return [
    ['时间', '不消耗'],
    ['效果', effects],
    ['前提', item.requirements ? explainCondition(item.requirements, game, contentRegistry, balanceConfig) : '无'],
    ['类型', type],
  ];
}

function itemCatalogMetrics(item: (typeof contentRegistry.items)[number]): CatalogMeterDefinition[] {
  const effectEntries: [string, number][] = [
    ...(Object.entries(item.attributeEffects ?? {}) as [string, number][]),
    ...(Object.entries(item.statEffects ?? {}) as [string, number][]),
  ];
  if (effectEntries.length === 0 && item.lifestyleDelta !== 0) effectEntries.push(['lifestyle', item.lifestyleDelta]);
  const labels = { ...attributeLabels, ...statLabels };
  return effectEntries.slice(0, 2).map(([key, value]) => ({
    label: displayMappedLabel(key, labels),
    value: Math.abs(value),
    max: catalogMeterMax(value),
    caption: `${value >= 0 ? '+' : ''}${value}`,
  }));
}

function itemCatalogDetailFacts(item: (typeof contentRegistry.items)[number], game: GameState): CatalogFact[] {
  const effect = itemCatalogFacts(item, game).find(([label]) => label === '效果')?.[1] ?? '没有额外变化';
  const relationEffects = (item.effects ?? [])
    .filter((entry): entry is Extract<NonNullable<typeof item.effects>[number], { type: 'relation' }> => entry.type === 'relation')
    .map((entry) => {
      const character = contentRegistry.characters.find((candidate) => candidate.id === entry.characterId);
      return `${character?.name ?? '联系人'} ${entry.amount >= 0 ? '+' : ''}${entry.amount}`;
    });
  return [
    ['属性变化', effect],
    ['关系变化', relationEffects.join(' · ') || '无直接关系变化'],
    ['支出分类', displayMappedLabel(item.financialCategory ?? 'shopping', financialLabels)],
    ['时间消耗', '不消耗'],
  ];
}

function ShopView({ game, dispatch, onNavigate, initialTab }: { game: GameState; dispatch: (action: GameAction) => void; onNavigate: (view: ViewId) => void; initialTab: string }) {
  const [cart, setCart] = useState<Record<ContentId, number>>({});
  const [itemCategory, setItemCategory] = useState<string>('all');
  const [itemSort, setItemSort] = useState<'default' | 'price-asc' | 'price-desc'>('default');
  const [shopFiltersOpen, setShopFiltersOpen] = useState(false);
  const [itemPage, setItemPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [tab, setTab] = useState<string>(initialTab);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => contentRegistry.items[0] ? `item:${contentRegistry.items[0].id}` : null);
  useEffect(() => {
    setTab(initialTab);
    setActivityPage(0);
  }, [initialTab]);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const total = Object.entries(cart).reduce((sum, [itemId, quantity]) => { const item = contentRegistry.items.find((entry) => entry.id === itemId); return sum + (item ? getItemCost(game, item) : 0) * quantity; }, 0);
  const categories = ['all', ...new Set(contentRegistry.items.map((item) => categoryLabels[item.category] ?? item.category))];
  const items = [...contentRegistry.items.filter((item) => itemCategory === 'all' || (categoryLabels[item.category] ?? item.category) === itemCategory)].sort((left, right) => {
    if (itemSort === 'default') return 0;
    const priceDelta = getItemCost(game, left) - getItemCost(game, right);
    return itemSort === 'price-asc' ? priceDelta : -priceDelta;
  });
  const selectItemCategory = (entry: string) => {
    setItemCategory(entry);
    setItemPage(0);
    const first = items.find((item) => entry === 'all' || (categoryLabels[item.category] ?? item.category) === entry);
    setSelectedKey(first ? `item:${first.id}` : null);
  };
  const { schedule, notice: scheduleNotice, clearNotice } = useWeekScheduler(game, dispatch);
  const owned = (itemId: ContentId) => (game.inventory[itemId] ?? 0) > 0;
  const activeCategories = shopTabCategories[tab];
  const activities = (contentRegistry.activities ?? []).filter((activity) => activeCategories?.includes(activity.category));
  const displayActivities = tab === 'goods' ? (contentRegistry.activities ?? []) : activities;
  const visibleActivities = displayActivities.filter((activity) => (shopTabCategories[tab] ?? []).includes(activity.category));
  const activityEntries = visibleActivities.flatMap((activity) => activity.options.map((option) => ({ activity, option })));
  const activityPageCount = Math.max(1, Math.ceil(activityEntries.length / 12));
  const safeActivityPage = Math.min(activityPage, activityPageCount - 1);
  const pagedActivityEntries = activityEntries.slice(safeActivityPage * 12, safeActivityPage * 12 + 12);
  const weekRows = ([1, 2, 3, 4, 5, 6, 7] as const).flatMap((weekday) => {
    if (game.employment?.schedule.workDays.includes(weekday)) return [{ key: `w${weekday}`, day: `周${weekdayLabel(weekday)}`, text: '工作 · 自动排班', icon: 'career' as PixelIconName }];
    return (['day', 'evening'] as const).map((slot) => {
      const plan = game.weeklyPlan.days[weekday][slot];
      const prefix = slot === 'day' ? '白天' : '晚间';
      const text = plan.kind === 'free' ? `${prefix} 自由` : plan.kind === 'study' ? `${prefix} 学习 ${plan.durationMinutes / 60} 小时` : plan.kind === 'side_job' ? `${prefix} 兼职 ${plan.durationMinutes / 60} 小时` : plan.kind === 'course' ? `${prefix} 课程 ${contentRegistry.courses?.find((course) => course.id === plan.courseId)?.name ?? ''}` : `${prefix} ${contentRegistry.activities?.find((entry) => entry.id === (plan as { activityId?: ContentId }).activityId)?.name ?? '活动'}`;
      const icon: PixelIconName = plan.kind === 'free' ? 'controller' : plan.kind === 'study' || plan.kind === 'course' ? 'book' : plan.kind === 'side_job' ? 'bag' : 'cup';
      return { key: `w${weekday}${slot}`, day: `周${weekdayLabel(weekday)}`, text, icon };
    });
  });

  // ---- 底部选中详情区域的数据 ----
  let detail: null | { icon: PixelIllustrationName; title: string; desc: string; facts: CatalogFact[]; metrics?: readonly CatalogMeterDefinition[]; price?: string; ctaLabel: string; onCta?: () => void; disabled?: boolean } = null;
  if (selectedKey?.startsWith('item:')) {
    const item = contentRegistry.items.find((entry) => entry.id === selectedKey.slice(5));
    if (item) {
      detail = {
        icon: itemIllustrationFor(item),
        title: item.name,
        desc: item.description,
        price: money(getItemCost(game, item)),
        facts: itemCatalogDetailFacts(item, game),
        metrics: itemCatalogMetrics(item),
        ctaLabel: '加入购物袋',
        onCta: () => setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 })),
      };
    }
  } else if (selectedKey?.startsWith('act:')) {
    const [activityId, optionId] = selectedKey.slice(4).split('|');
    const definition = contentRegistry.activities?.find((entry) => entry.id === activityId);
    const option = definition?.options.find((entry) => entry.id === optionId);
    if (definition && option) {
      const cost = activityCashCost(game, definition, option, contentRegistry);
      const cooldown = activityCooldownRemaining(game, definition, option);
      const durationLabel = option.durationMinutes >= 2880 ? `${option.durationMinutes / 1440} 天` : `${option.durationMinutes / 60} 小时`;
      detail = {
        icon: activitySceneFor(definition),
        title: `${definition.name} · ${option.label}`,
        desc: definition.description,
        facts: [['时间', durationLabel], ['费用', money(cost)], ['效果', effectTexts(option.effects).join(' · ') || '给生活留一点空间'], ['状态', cooldown > 0 ? `冷却中 · 还需 ${cooldown} 天` : '本周可安排']],
        ctaLabel: cooldown > 0 ? `冷却中 · 还需 ${cooldown} 天` : '安排到本周自由时间',
        onCta: () => { clearNotice(); schedule({ kind: 'activity', activityId: definition.id, optionId: option.id }, { label: `${definition.name} · ${option.label}` }); },
        disabled: cooldown > 0 || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward',
      };
    }
  }

  const itemPageCount = Math.max(1, Math.ceil(items.length / 12));
  const featuredItems = items.slice(itemPage * 12, (itemPage + 1) * 12);
  const selectItemPage = (page: number) => {
    setItemPage(page);
    const first = items[page * 12];
    if (first) setSelectedKey(`item:${first.id}`);
  };
  const selectedActivityVisible = selectedKey?.startsWith('act:') && pagedActivityEntries.some(({ activity, option }) => `act:${activity.id}|${option.id}` === selectedKey);
  const shouldRenderSelectedDetail = Boolean(detail && (
    (tab === 'goods' && selectedKey?.startsWith('item:')) ||
    (tab !== 'services' && selectedActivityVisible)
  ));
  const detailIsActivity = selectedKey?.startsWith('act:') ?? false;
  const selectShopTab = (nextTab: string) => {
    setTab(nextTab);
    setActivityPage(0);
    if (nextTab === 'services') {
      setSelectedKey(null);
      return;
    }
    if (nextTab === 'goods') {
      const first = items[0];
      setSelectedKey(first ? `item:${first.id}` : null);
      return;
    }
    const categories = shopTabCategories[nextTab] ?? [];
    const first = (contentRegistry.activities ?? [])
      .filter((activity) => categories.includes(activity.category))
      .flatMap((activity) => activity.options.map((option) => ({ activity, option })))[0];
    setSelectedKey(first ? `act:${first.activity.id}|${first.option.id}` : null);
  };
  const selectedDetail = shouldRenderSelectedDetail && detail ? <section className="shop-detail inverse pixel-corners" aria-label={detailIsActivity ? '已选活动详情' : '已选商品详情'}><PixelIllustration name={detail.icon} size={72} /><div className="shop-detail-copy"><div className="shop-detail-title-row"><div><span className="eyebrow">{detailIsActivity ? '已选活动' : '已选商品'}</span><h2>{detail.title}</h2></div>{detail.price && <strong className="shop-detail-price">{detail.price}</strong>}</div><p>{detail.desc}</p></div><dl className="shop-detail-facts" aria-label={`${detail.title} 详情事实`}>{detail.facts.filter(([, value]) => Boolean(value)).map(([label, value]) => <div className="shop-detail-fact" data-fact={label} key={label}><dt>{label}</dt><dd title={value}>{(label === '效果' || label === '属性变化') && detail.metrics?.length ? <CatalogMeters metrics={detail.metrics} ariaLabel={`${detail.title}效果变化`} /> : value}</dd></div>)}</dl><button className="primary-button" disabled={detail.disabled} onClick={() => detail?.onCta?.()}>{detail.ctaLabel}</button></section> : null;
  const renderItemCard = (item: (typeof contentRegistry.items)[number]) => {
    const hasItem = owned(item.id);
    const wishlisted = game.wishlist?.includes(item.id);
    return <article className={selectedKey === `item:${item.id}` ? 'item-card selected' : 'item-card'} key={item.id} data-catalog-card><button className="card-overlay" onClick={() => setSelectedKey(`item:${item.id}`)} aria-label={`查看详情：${item.name}`} /><div className="card-art"><PixelIllustration name={itemIllustrationFor(item)} size={64} /></div><div className="catalog-title-row"><span className="catalog-badge">{displayMappedLabel(item.category, categoryLabels)}</span><h2>{item.name}</h2><strong className="catalog-price">{money(getItemCost(game, item))}</strong><span className="catalog-card-status">{hasItem ? <span className="current-label">已拥有</span> : <button className="catalog-secondary-action" onClick={() => dispatch({ type: 'manage_wishlist', itemId: item.id, enabled: !wishlisted })} aria-label={`${wishlisted ? '移出' : '加入'}愿望清单：${item.name}`} aria-pressed={wishlisted} title={wishlisted ? '移出愿望清单' : '加入愿望清单'}><PixelIcon name="heart" size={12} aria-hidden="true" /><span>{wishlisted ? '已加入目标' : '加入目标'}</span></button>}</span></div><p>{item.description}</p><CatalogFacts facts={itemCatalogFacts(item, game)} ariaLabel={`${item.name} 商品信息`} /><div className="item-card-foot"><button className="primary-button" onClick={() => { setSelectedKey(`item:${item.id}`); setCart((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 })); }} aria-label={`加入购物袋：${item.name}`}><PixelIcon name="bag" size={12} aria-hidden="true" />加入清单</button></div></article>;
  };
  return <section className="shop-page" aria-label="商品目录布局">
    <div className="section-heading compact"><div><span className="eyebrow">商店 · 生活内容</span><h1>商品</h1></div><p>浏览不消耗时间；购买与安排都会进入真实账本、周计划和人生记录。</p></div>
    {scheduleNotice && <p className="planner-notice" role="status">{scheduleNotice}</p>}
    <div className="shop-layout">
      <div className={`shop-main shop-main-tab-${tab}`}>
        <div className="shop-tab-bar">
          <div className="shop-tabs" role="tablist" aria-label="商店分类">{shopTabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'shop-tab selected' : 'shop-tab'} onClick={() => selectShopTab(id)}>{label}</button>)}</div>
          {tab === 'goods' && <div className="shop-toolbar" aria-label="商品工具栏"><label className="shop-sort-control"><span>排序</span><select aria-label="商品排序" value={itemSort} onChange={(event) => { setItemSort(event.target.value as 'default' | 'price-asc' | 'price-desc'); setItemPage(0); }}><option value="default">默认排序</option><option value="price-asc">价格从低到高</option><option value="price-desc">价格从高到低</option></select></label><button className="shop-toolbar-button" aria-controls="shop-category-filters" aria-expanded={shopFiltersOpen} onClick={() => setShopFiltersOpen((open) => !open)}>筛选{itemCategory === 'all' ? '' : ' 1'} ▾</button></div>}
        </div>
        {tab === 'goods' && <>
          <div id="shop-category-filters" className={shopFiltersOpen ? 'filter-row shop-category-filters is-open' : 'filter-row shop-category-filters'} aria-label="商品分类">{categories.map((entry) => <button key={entry} className={itemCategory === entry ? 'filter-button selected' : 'filter-button'} onClick={() => selectItemCategory(entry)}>{entry === 'all' ? '全部' : entry}</button>)}</div>
          <div className="item-grid">{featuredItems.map(renderItemCard)}</div>
          {itemPageCount > 1 && <nav className="catalog-pager" aria-label="商品分页"><button className="text-button" disabled={itemPage === 0} aria-label="上一页商品" onClick={() => selectItemPage(Math.max(0, itemPage - 1))}><PixelIcon name="arrow-left" size={12} /></button>{Array.from({ length: itemPageCount }, (_, page) => <button key={page} className={page === itemPage ? 'filter-button selected' : 'filter-button'} aria-current={page === itemPage ? 'page' : undefined} onClick={() => selectItemPage(page)}>{page + 1}</button>)}<button className="text-button" disabled={itemPage === itemPageCount - 1} aria-label="下一页商品" onClick={() => selectItemPage(Math.min(itemPageCount - 1, itemPage + 1))}><PixelIcon name="arrow-right" size={12} /></button></nav>}
        </>}
        {tab === 'services' && <ServiceMarket game={game} dispatch={dispatch} />}
        {tab !== 'goods' && tab !== 'services' && pagedActivityEntries.length > 0 && <>
          <div className="section-heading compact"><div><span className="eyebrow">不为赚钱服务的时间</span><h2>娱乐与生活活动</h2></div><p>活动会占用周计划中的自由时间；每个 Option 都有自己的时长、费用和效果。</p></div>
          <div className="activity-grid">
            {pagedActivityEntries.map(({ activity, option }) => {
              const project = option.businessProject;
              const projectReady = !project || Boolean(game.businesses[project.businessId]);
              const projectDone = Boolean(project && game.completedBusinessProjects?.includes(`${activity.id}.${option.id}`));
              const cost = activityCashCost(game, activity, option, contentRegistry);
              const cooldownRemaining = activityCooldownRemaining(game, activity, option);
              const durationLabel = option.durationMinutes >= 2880 ? `${option.durationMinutes / 1440} 天` : `${option.durationMinutes / 60} 小时`;
              const effects = effectTexts(option.effects);
              const effectLabel = project
                ? `企业项目利润 · ${projectDone ? '已完成' : projectReady ? '可承接' : '需要对应企业'}`
                : `${effects.join(' · ') || '给生活留一点空间'}${activityDiscountLabel(game, activity, contentRegistry) ? ` · ${activityDiscountLabel(game, activity, contentRegistry)}` : ''}`;
              return <article className={selectedKey === `act:${activity.id}|${option.id}` ? 'activity-card selected' : 'activity-card'} key={`${activity.id}-${option.id}`} data-catalog-card>
                <button className="card-overlay" onClick={() => setSelectedKey(`act:${activity.id}|${option.id}`)} aria-label={`查看详情：${activity.name} ${option.label}`} />
                <div className="card-art"><PixelIllustration name={activitySceneFor(activity)} size={64} /></div>
                <div className="activity-card-body">
                  <div className="catalog-title-row"><span className="catalog-badge">{activityCategoryLabels[activity.category] ?? activity.category}</span><h3>{activity.name} · {option.label}</h3><strong className="catalog-price">{money(cost)}</strong><span className="catalog-card-status">{projectDone ? <span className="current-label">已完成</span> : cooldownRemaining > 0 ? <span className="requirement-missing">冷却中</span> : null}</span></div>
                  <p>{activity.description}</p>
                  <CatalogFacts facts={[['时间', durationLabel], ['效果', effectLabel], ['前提', option.requirements ? explainCondition(option.requirements, game, contentRegistry, balanceConfig) : project ? '对应企业' : '无'], ['类型', `${activityCategoryLabels[activity.category] ?? activity.category}活动`]]} ariaLabel={`${activity.name} ${option.label} 活动信息`} />
                  {cooldownRemaining > 0 && <span className="requirement-missing">冷却中 · 还需 {cooldownRemaining} 天</span>}
                  <button className="secondary-button" disabled={!projectReady || projectDone || cooldownRemaining > 0 || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => { clearNotice(); schedule({ kind: 'activity', activityId: activity.id, optionId: option.id }, { label: `${activity.name} · ${option.label}` }); }}>{projectDone ? '项目已完成' : cooldownRemaining > 0 ? `冷却中 · 还需 ${cooldownRemaining} 天` : '安排到本周自由时间'}</button>
                </div>
              </article>;
            })}
          </div>
          {activityPageCount > 1 && <nav className="catalog-pager" aria-label="活动分页"><button className="text-button" disabled={safeActivityPage === 0} aria-label="上一页活动" onClick={() => setActivityPage(Math.max(0, safeActivityPage - 1))}><PixelIcon name="arrow-left" size={12} /></button>{Array.from({ length: activityPageCount }, (_, page) => <button key={page} className={page === safeActivityPage ? 'filter-button selected' : 'filter-button'} aria-current={page === safeActivityPage ? 'page' : undefined} onClick={() => setActivityPage(page)}>{page + 1}</button>)}<button className="text-button" disabled={safeActivityPage === activityPageCount - 1} aria-label="下一页活动" onClick={() => setActivityPage(Math.min(activityPageCount - 1, safeActivityPage + 1))}><PixelIcon name="arrow-right" size={12} /></button></nav>}
        </>}
        {selectedDetail}
      </div>
      <aside className="shop-rail" aria-label="商店辅助信息">
        <section className="rail-module rail-cart" aria-label="购物清单"><header><PixelIcon name="bag" size={16} /><h3>购物袋（{cartCount}）</h3></header>
          {cartCount === 0 ? <ShopRailEmptyState illustration="bag" title="购物袋是空的" hint="选择商品后，会在这里结算。" /> : <>
            <ul className="rail-rows">{Object.entries(cart).map(([itemId, quantity]) => { const item = contentRegistry.items.find((entry) => entry.id === itemId); return <li key={itemId}><PixelIllustration name={item ? itemIllustrationFor(item) : 'bag'} size={18} className="rail-row-art" aria-hidden="true" /><span>{item?.name}</span><b>×{quantity}</b></li>; })}</ul>
            <div className="total-row"><span>消费合计</span><strong>{money(total)}</strong></div>
            <button className="primary-button full" onClick={() => { dispatch({ type: 'purchase_items', items: cart }); setCart({}); }} aria-label="一次购买">一次购买</button>
          </>}
        </section>
        <section className="rail-module rail-schedule" aria-label="本周安排"><header><PixelIcon name="calendar" size={16} /><h3>本周安排</h3></header><ul className="rail-rows compact">{weekRows.slice(0, 6).map((row) => <li key={row.key}><small>{row.day}</small><span>{row.text}</span><PixelIcon name={row.icon} size={14} aria-hidden="true" data-schedule-row-icon={row.icon} /></li>)}</ul><button className="text-button rail-link" onClick={() => onNavigate('life')}><PixelAction label="查看完整安排" /></button></section>
        <section className="rail-module rail-fill rail-inventory" aria-label="已拥有模块"><InventoryPanel game={game} dispatch={dispatch} /></section>
        <section className="rail-module rail-fill rail-wishlist" aria-label="消费目标快捷区"><WishlistPanel game={game} dispatch={dispatch} /></section>
      </aside>
    </div>
  </section>;
}

function ActivityAcquisitionHints({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const hints = (contentRegistry.activities ?? []).flatMap((activity) => activity.options.map((option) => ({ activity, option }))).filter(({ option }) => option.requirements && !evaluateCondition(option.requirements, game, contentRegistry, balanceConfig));
  if (!hints.length) return null;
  return <section className="detail-panel" aria-label="活动获取提示"><div className="section-heading compact"><div><span className="eyebrow">先准备，再安排</span><h2>活动获取提示</h2></div><p>满足这些条件后，活动才会进入周计划并在结算时生效。</p></div><div className="item-list">{hints.map(({ activity, option }) => <div className="item-row" key={`${activity.id}.${option.id}`}><div><h3>{activity.name} · {option.label}</h3><p className="requirement-missing">{explainCondition(option.requirements!, game, contentRegistry, balanceConfig)}</p></div>{option.requirements?.type === 'owns_item' && (() => { const requirement = option.requirements as { type: 'owns_item'; itemId: ContentId }; const item = contentRegistry.items.find((entry) => entry.id === requirement.itemId); const cost = item ? getItemCost(game, item) : 0; return item ? <button className="text-button" disabled={game.cash < cost} onClick={() => dispatch({ type: 'purchase_items', items: { [item.id]: 1 } })}>购买 {item.name}</button> : null; })()}</div>)}</div></section>;
}

function HousingView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { return <><div className="section-heading compact"><div><span className="eyebrow">住房是生活的底色</span><h1>住房</h1></div><p>租金和住房收益会在日结中自动进入月度账本；支持分期的住房会显示首付与月供。</p></div><div className="item-list">{contentRegistry.housing.map((home) => { const current = game.housing.housingId === home.id; const unlocked = game.unlockedHousingIds.includes(home.id); const rent = housingRentPerDay(game, home); const price = housingPrice(game, home); const mortgage = price !== undefined ? housingMortgageTerms(game, home) : undefined; const holding = game.housingHoldings?.[home.id]; return <div className="item-row" key={home.id}><div><span className="job-kind">{current ? '当前住处' : holding ? `投资房 · ${holding.occupancy === 'rented' ? '已出租' : '空置'}` : '住房市场'}</span><h2>{home.name}</h2><p>{home.description}</p><span className="muted">生活水平 +{home.lifestyleDelta} · {rent ? `${money(rent)} /天` : '免租'}</span>{current && game.mortgage && <span className="muted">分期中 · 剩余本金 {money(game.mortgage.remainingPrincipal)} · 已还 {game.mortgage.paidMonths}/{game.mortgage.totalMonths} 期</span>}{holding && <span className="muted">估值 {money(holding.currentValuation)} · 本月预计净租金 {money(Math.round(rent * 28 * 0.88))}</span>}</div><div className="row-meta">{price !== undefined && <strong>{money(price)}</strong>}{mortgage && !current && !holding && <span className="muted">首付 {money(mortgage.downPayment)} · 月供 {money(mortgage.monthlyPayment)}</span>}{unlocked || current ? <div className="button-pair">{!holding && <><button className="text-button" disabled={current || Boolean(game.mortgage)} onClick={() => dispatch({ type: 'move_housing', housingId: home.id, mode: 'rent' })}>租住</button>{price !== undefined && <button className="text-button" disabled={current || Boolean(game.mortgage)} onClick={() => dispatch({ type: 'move_housing', housingId: home.id, mode: 'owned' })}>买下</button>}{price !== undefined && <button className="text-button" disabled={current || Boolean(game.mortgage) || game.cash < price} onClick={() => dispatch({ type: 'buy_rental_housing', housingId: home.id })}>买作投资房</button>}{mortgage && <button className="text-button" disabled={current || Boolean(game.mortgage) || game.cash < mortgage.downPayment} onClick={() => dispatch({ type: 'finance_housing', housingId: home.id })}>分期购买</button>}</>}{holding && <><button className="text-button" onClick={() => dispatch({ type: 'set_housing_rental', housingId: home.id, rented: holding.occupancy !== 'rented' })}>{holding.occupancy === 'rented' ? '收回空置' : '开始出租'}</button><button className="text-button" onClick={() => dispatch({ type: 'sell_rental_housing', housingId: home.id })}>出售房产</button></>}{current && game.housing.mode === 'owned' && <button className="text-button" onClick={() => dispatch({ type: 'sell_housing' })}>出售</button>}</div> : <span className="muted">未解锁</span>}</div></div>; })}</div></>; }

function CourseMarket({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const courses = contentRegistry.courses ?? [];
  // Course eligibility comes from the shared planning domain, so the market can
  // never offer a course the planner or the executor would refuse.
  const { schedule, notice, clearNotice } = useWeekScheduler(game, dispatch);
  if (!courses.length) return null;
  return <section className="market-section"><div className="section-heading compact"><div><span className="eyebrow">成长路径 · 可执行</span><h2>课程与资格</h2></div><p>查看费用和要求，把课程安排进本周空闲时间；完成后会写入资格、职业经验和历史。</p></div>{notice && <p className="planner-notice" role="status">{notice}</p>}<div className="item-list">{courses.map((course) => { const availability = courseAvailability(game, course, contentRegistry, balanceConfig); const finished = course.maxCompletions !== undefined && availability.completed >= course.maxCompletions; const blocked = Boolean(availability.reason); return <div className="item-row" key={course.id}><div><span className="job-kind">{finished ? '已完成' : availability.cooldownRemaining > 0 ? '冷却中' : '课程'}</span><h3>{course.name}</h3><p>{course.description}</p><span className="muted">{course.durationMinutes / 60} 小时 · {money(course.cashCost)} · {course.qualificationId ? `资格：${displayMappedLabel(course.qualificationId, qualificationLabels)}` : '提升职业经验'}</span>{availability.reason && <span className="requirement-missing">{availability.reason}</span>}{availability.cash === 'hard' && !blocked && <span className="muted">现金不足时执行会被跳过</span>}</div><div className="row-meta"><span className="muted">完成 {availability.completed} 次</span><button className="text-button" disabled={blocked || game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => { clearNotice(); schedule({ kind: 'course', courseId: course.id }, { label: course.name }); }}>安排课程</button></div></div>; })}</div></section>;
}

function AssetsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { return <><div className="section-heading compact"><div><span className="eyebrow">现金只是财富的一种形态</span><h1>财富</h1></div><p>投资、企业、投资房产和月度现金流在同一个地方看清楚。</p></div><FinancialSummaryView game={game} /><div className="asset-columns">{contentRegistry.investments?.map((investment) => { const holding = game.investments?.[investment.id]; const value = holding?.currentValuation ?? investmentUnitValue(investment, game.rng.seed, game.time.day); const referenceValue = investmentUnitValue(investment, game.rng.seed, Math.max(1, game.time.day - 30)); const changePercent = referenceValue > 0 ? Math.round(((investmentUnitValue(investment, game.rng.seed, game.time.day) / referenceValue) - 1) * 1000) / 10 : 0; const invested = holding ? holding.averageCost * holding.units : 0; const unrealized = holding ? holding.currentValuation - invested : 0; return <article className="asset-card" key={investment.id}><div className="secondary-card-art"><PixelIllustration name="wealth" size={70} /></div><div className="item-card-head"><span className="job-kind">{investmentRiskLabels[investment.risk] ?? investment.risk}风险 · {investmentKindLabels[investment.kind] ?? investment.kind}</span>{holding && <span className="current-label">持有 {holding.units} 份</span>}</div><h2>{investment.name}</h2><p>{investment.description}</p><div className="investment-value"><span>当前单位估值</span><strong>{money(value)}</strong></div><div className="investment-detail-grid"><span>30 日变化</span><strong>{changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%</strong>{holding && <><span>已投入</span><strong>{money(invested)}</strong><span>平均成本</span><strong>{money(holding.averageCost)}</strong><span>当前价值</span><strong>{money(holding.currentValuation)}</strong><span>未实现收益</span><strong>{unrealized >= 0 ? '+' : '-'}{money(Math.abs(unrealized))}</strong></>}</div><div className="button-pair"><button className="primary-button" disabled={game.cash < value} onClick={() => dispatch({ type: 'buy_investment', investmentId: investment.id, units: 1 })}>买入 1 份</button>{holding && <button className="secondary-button" onClick={() => dispatch({ type: 'sell_investment', investmentId: investment.id, units: 1 })}>卖出 1 份</button>}</div></article>; })}{contentRegistry.businesses.map((business) => { const holding = game.businesses[business.id]; const unlocked = game.unlockedBusinessIds.includes(business.id); const tier = holding ? ownershipTierForHolding(holding) : undefined; const profit = holding ? calculateDailyBusinessProfit(holding, business) : undefined; const partnership = business.partnership; const partner = partnership ? contentRegistry.characters.find((character) => character.id === partnership.characterId) : undefined; const partnershipReady = Boolean(partnership && (!partnership.requirements || evaluateCondition(partnership.requirements, game, contentRegistry, balanceConfig))); return <div className="item-row" key={business.id}><div><span className="job-kind">企业{tier ? ` · ${tier.name}` : ''}</span><h2>{business.name}</h2><p>{business.description}</p>{profit && <span className="muted">预计净利润 {money(profit.profit)} /天 · 持股 {game.businesses[business.id]?.equityPercent ?? 100}%</span>}{holding && <span className="muted">{tier!.description}</span>}{!holding && unlocked && <span className="muted">{ownershipTierForEquity(30).description}</span>}{!holding && unlocked && partnership && <span className="muted">合伙方案：与{partner?.name ?? displayContentName(partnership.characterId, contentRegistry.characters, '合作联系人')}共同经营 · 你持股 {partnership.playerEquityPercent}%</span>}{!holding && unlocked && partnership && !partnershipReady && <span className="requirement-missing">{explainCondition(partnership.requirements!, game, contentRegistry, balanceConfig)}</span>}</div><div className="row-meta">{holding ? <span className="current-label">已拥有</span> : unlocked ? <div className="button-pair"><button className="text-button" onClick={() => dispatch({ type: 'buy_business_stake', businessId: business.id, percent: 10 })}>入股 10% {money(Math.round(business.price * 0.1))}</button><button className="text-button" onClick={() => dispatch({ type: 'buy_business_stake', businessId: business.id, percent: 30 })}>入股 30% {money(Math.round(business.price * 0.3))}</button>{partnership && <button className="text-button" disabled={!partnershipReady || game.cash - partnership.entryPrice < 0} onClick={() => dispatch({ type: 'join_business_partnership', businessId: business.id })}>加入合伙 {money(partnership.entryPrice)}</button>}<button className="text-button" disabled={game.cash - business.price < 0} onClick={() => dispatch({ type: 'buy_business', businessId: business.id })}>{business.price >= 10000 ? '全资买入' : '买入'} {money(business.price)}</button></div> : <span className="muted">等待机会</span>}</div></div>; })}{contentRegistry.assets.map((asset) => { const holding = game.assets[asset.id]; const unlocked = game.unlockedAssetIds.includes(asset.id); return <div className="item-row" key={asset.id}><div><span className="job-kind">{asset.kind === 'vehicle' ? '车辆' : '投资房产 / 资产'}</span><h2>{asset.name}</h2><p>{asset.description}</p><span className="muted">{asset.kind === 'vehicle' ? `当前估值 ${money(holding?.currentValuation ?? asset.valuation)} · 约 ${money(asset.monthlyCost ?? 0)} /月车辆成本` : `预计收入 ${money(asset.dailyIncome)} /天`}</span></div><div className="row-meta">{holding ? <button className="text-button" onClick={() => dispatch({ type: 'sell_asset', assetId: asset.id })}>出售 {money(holding.currentValuation)}</button> : unlocked ? <button className="text-button" onClick={() => dispatch({ type: 'buy_asset', assetId: asset.id })}>买入 {money(asset.price)}</button> : <span className="muted">等待机会</span>}</div></div>; })}</div><VehicleMaintenanceHistory game={game} /></>; }

function VehicleMaintenanceHistory({ game }: { game: GameState }) { const records = (game.financialLedger?.entries ?? []).filter((entry) => entry.category === 'maintenance' && entry.sourceType === 'vehicle').slice(-6); return <div className="ledger-detail" role="region" aria-label="车辆维护记录"><span>最近车辆维护</span><small>{records.length ? records.map((entry) => `第 ${entry.day} 天 · ${entry.label} ${money(entry.amount)}`).join(' · ') : '拥有车辆并运行时间后，这里会保留维护记录'}</small></div>; }

function characterCareerHistoryText(game: GameState, character: CharacterDefinition, year: number): string {
  const evalBranch = makeWorldBranchEvaluator(game, contentRegistry, balanceConfig);
  const started = (character.careerHistory ?? []).filter((entry) => entry.startYear <= year).map((entry) => entry.startYear);
  const lines: string[] = [];
  for (const startYear of [...new Set(started)].sort((a, b) => a - b)) {
    const entry = characterCareerAt(character, startYear, evalBranch);
    if (!entry || entry.startYear !== startYear && !entry.branchCondition) continue;
    if (lines.some((line) => line.endsWith(entry.title))) continue;
    const company = entry.companyId ? contentRegistry.companies?.find((candidate) => candidate.id === entry.companyId)?.name : undefined;
    lines.push(`第 ${startYear} 年 · ${company ? `${company} · ` : ''}${entry.title}`);
  }
  return lines.join(' · ');
}

const socialPortraits: readonly PixelIllustrationName[] = ['social', 'social-alt', 'social-mentor', 'social-colleague'];
const socialPortraitFor = (index: number) => socialPortraits[index % socialPortraits.length];

/**
 * Inbox lifecycle: `unread` still needs handling, `read` stays in the recent
 * list, and clearing removes a row from the main inbox. Reading is UI state
 * only — the underlying interaction already wrote its own life record.
 */
function MessageInbox({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const messages = [...visibleMessages(game.messages)].reverse();
  const unread = unreadMessageCount(game.messages);
  const readCount = messages.filter((message) => message.read).length;
  if (!messages.length) return null;
  return <section className="detail-panel" aria-label="消息">
    <div className="section-heading compact">
      <div><span className="eyebrow">联系人的来信</span><h2>消息</h2></div>
      <span className="muted">未读 {unread} 条 · 最近 {messages.length} 条</span>
      <div className="button-pair">
        {unread > 0 && <button className="text-button" onClick={() => dispatch({ type: 'read_all_messages' })}>全部已读</button>}
        {readCount > 0 && <button className="text-button" onClick={() => dispatch({ type: 'clear_read_messages' })}>清除已读</button>}
      </div>
    </div>
    <div className="item-list">{messages.map((message) => {
      const character = contentRegistry.characters.find((entry) => entry.id === message.characterId);
      return <div className="item-row" key={message.id}><div><span className="job-kind">{message.read ? '已读' : '未读'} · 第 {message.day} 天</span><h3>{message.title}</h3><p>{message.body}</p><span className="muted">来自 {character?.name ?? '联系人'}</span></div><div className="button-pair">{!message.read && <button className="text-button" onClick={() => dispatch({ type: 'read_message', messageId: message.id })}>查看消息</button>}<button className="text-button" onClick={() => dispatch({ type: 'dismiss_message', messageId: message.id })}>清除</button></div></div>;
    })}</div>
  </section>;
}

function RelationsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { const currentYear = Math.max(1, Math.ceil(game.calendar.month / 12)); return <><div className="section-heading compact"><div><span className="eyebrow">人物不是数字，是生活入口</span><h1>社交</h1></div><p>关系会带来推荐、合作和一起度过的时间。互动在暂停后完成，不打断自动运行。</p></div><MessageInbox game={game} dispatch={dispatch} /><div className="relation-grid">{contentRegistry.characters.map((character, index) => { const value = game.relationships[character.id] ?? 0; const stage = [...character.stages].reverse().find((entry) => value >= entry.threshold); const interaction = contentRegistry.relationshipInteractions?.find((entry) => entry.characterId === character.id); const option = interaction?.options[0]; const careerHistory = characterCareerHistoryText(game, character, currentYear); return <article className="relation-card" key={character.id}><div className="secondary-card-art"><PixelIllustration name={socialPortraitFor(index)} size={70} /></div><div className="job-card-head"><span className="job-kind">{character.identity}</span><strong>{value}</strong></div><h2>{character.name}</h2><p>{character.description}</p>{careerHistory && <span className="muted">职业经历：{careerHistory}</span>}<div className="relation-stage">{stage?.label ?? '认识'} · {value >= 60 ? '会出现更长期的机会' : value >= 40 ? '可能提供推荐' : '继续相处会更了解彼此'}</div><div className="meter"><i style={{ width: `${value}%` }} /></div>{interaction && option && <button className="secondary-button full" disabled={game.cash < option.cashCost} onClick={() => dispatch({ type: 'interact_character', interactionId: interaction.id, optionId: option.id })}>{option.label} · {money(option.cashCost)}</button>}</article>; })}</div></>; }

function SocialDetail({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const character = contentRegistry.characters.reduce((selected, candidate) => (game.relationships[candidate.id] ?? 0) > (game.relationships[selected.id] ?? 0) ? candidate : selected, contentRegistry.characters[0]);
  if (!character) return null;
  const characterIndex = contentRegistry.characters.findIndex((candidate) => candidate.id === character.id);
  const value = game.relationships[character.id] ?? 0;
  const currentYear = Math.max(1, Math.ceil(game.calendar.month / 12));
  const stage = [...character.stages].reverse().find((entry) => value >= entry.threshold);
  const interaction = contentRegistry.relationshipInteractions?.find((entry) => entry.characterId === character.id);
  const option = interaction?.options[0];
  const location = character.locationId ? contentRegistry.locations?.find((entry) => entry.id === character.locationId) : undefined;
  const careerHistory = characterCareerHistoryText(game, character, currentYear);
  const giftLabels: Record<string, string> = { dessert: '甜点', flower: '花束', coffee: '咖啡', book: '书籍' };
  const preferredInteractions = character.preferredInteractionCategories?.map((category) => displayMappedLabel(category, interactionCategoryLabels)).join('、');
  const preferredGifts = character.preferredGiftTags?.map((tag) => giftLabels[tag] ?? tag).join('、');
  return <aside className="social-detail pixel-corners" aria-label="选中人物详情"><div className="social-detail-head"><div className="social-detail-art"><PixelIllustration name={socialPortraitFor(Math.max(0, characterIndex))} size={88} /></div><div><span className="eyebrow">当前焦点 · 关系档案</span><h3>{character.name}</h3><p>{character.identity}{location ? ` · ${location.name}` : ''}</p></div></div><div className="social-detail-score"><span>当前关系</span><strong>{value}</strong><span>{stage?.label ?? '认识'}</span></div><div className="meter"><i style={{ width: `${value}%` }} /></div><section><span className="eyebrow">人物画像</span><p>{character.description}</p>{careerHistory && <p className="muted">职业经历：{careerHistory}</p>}</section><dl className="social-detail-facts"><div><dt>偏好互动</dt><dd>{preferredInteractions || '按当下关系自然相处'}</dd></div><div><dt>礼物偏好</dt><dd>{preferredGifts || '没有特别偏好'}</dd></div><div><dt>关系提示</dt><dd>{value >= 60 ? '可以留意更长期的合作与故事' : value >= 40 ? '会逐渐带来推荐和合作线索' : '先从低成本、符合偏好的互动开始'}</dd></div></dl>{interaction && option && <button className="primary-button full" disabled={game.cash < option.cashCost} onClick={() => dispatch({ type: 'interact_character', interactionId: interaction.id, optionId: option.id })}>{option.label} · {money(option.cashCost)}</button>}</aside>;
}

function StorylinePanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const storylines = (contentRegistry.storylines ?? []).filter((storyline) => !storyline.conditions || evaluateCondition(storyline.conditions, game, contentRegistry, balanceConfig));
  if (!storylines.length) return null;
  return <section className="detail-panel" aria-label="故事线"><div className="section-heading compact"><div><span className="eyebrow">关系会继续发生</span><h2>正在发生的故事</h2></div><p>故事可以暂时放下，不会强迫你进入某个人生阶段。</p></div><div className="item-list">{storylines.map((storyline) => { const stage = getStorylineStage(contentRegistry, game, storyline.id); const dialogue = stage?.dialogueId ? getDialogue(contentRegistry, stage.dialogueId) : undefined; const started = Boolean(game.storylineStages?.[storyline.id]); const completed = stage?.id === 'complete'; return <div className="item-row" key={storyline.id}><div><span className="job-kind">{completed ? '已完成' : started ? '进行中' : '可开始'}</span><h3>{storyline.name}</h3><p>{storyline.description}</p>{started && dialogue && <div className="dialogue-transcript">{dialogue.lines.map((line) => <p key={line.id ?? line.text}>{contentRegistry.characters.find((character) => character.id === line.speakerId)?.name ?? line.speakerName ?? '对方'}：{line.text}</p>)}</div>}{started && stage?.branches && <div className="button-pair">{stage.branches.map((branch) => <button className="text-button" key={branch.id} onClick={() => dispatch({ type: 'choose_storyline_branch', storylineId: storyline.id, branchId: branch.id })}>{branch.text ?? '作出选择'}</button>)}</div>}</div>{!started && <button className="secondary-button" onClick={() => dispatch({ type: 'start_storyline', storylineId: storyline.id })}>开始故事</button>}</div>; })}</div></section>;
}

function BusinessGroupView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const holdings = Object.values(game.businesses);
  if (!holdings.length) return null;
  const tierCount = { minority: 0, strategic: 0, controlling: 0, wholly_owned: 0 } as Record<string, number>;
  let groupValuation = 0;
  let groupProfit = 0;
  const members = holdings.map((holding) => {
    const business = contentRegistry.businesses.find((entry) => entry.id === holding.businessId)!;
    const tier = ownershipTierForHolding(holding);
    tierCount[tier.tier] += 1;
    const valuation = Math.round(businessValuation(holding, balanceConfig) * (holding.equityPercent ?? 100) / 100);
    const profitShare = Math.round(calculateDailyBusinessProfit(holding, business).profit * (holding.equityPercent ?? 100) / 100);
    groupValuation += valuation;
    groupProfit += profitShare;
    return { holding, business, tier, valuation, profitShare };
  });
  return <section className="detail-panel" aria-label="企业组合"><div className="section-heading compact"><div><span className="eyebrow">控股与持股 · 董事会决策 · 世界记录归档</span><h2>企业组合</h2></div><p>全资、控股、战略持股和少数股权投资汇总在这里；控股及以上可以对单家企业做出一次性董事会调整。</p></div><div className="profile-grid"><div className="info-panel"><span>组合成员</span><strong>{members.length} 家</strong></div><div className="info-panel"><span>控股 / 全资</span><strong>{tierCount.controlling + tierCount.wholly_owned} 家</strong></div><div className="info-panel"><span>战略 / 少数股权</span><strong>{tierCount.strategic + tierCount.minority} 家</strong></div><div className="info-panel"><span>组合归母估值</span><strong>{money(groupValuation)}</strong></div><div className="info-panel"><span>组合日均归属利润</span><strong>{groupProfit >= 0 ? '+' : ''}{money(groupProfit)}</strong></div></div><div className="item-list">{members.map(({ holding, business, tier, valuation, profitShare }) => { const equityNow = holding.equityPercent ?? 100; const directable = canDirectBusinessOperations(holding); const streamlineUsed = Boolean(game.flags[`${business.id}.decision.streamline`]); const relocateUsed = Boolean(game.flags[`${business.id}.decision.relocate`]); const streamlineCost = Math.max(2000, Math.round(calculateDailyBusinessProfit(holding, business).wage * 6)); const currentLocationId = effectiveBusinessLocationId(holding, business); const relocationTargets = (contentRegistry.locations ?? []).filter((location) => location.id !== currentLocationId); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">{tier.name} · 持股 {equityNow}% · 归属估值 {money(valuation)} · 日均归属利润 {money(profitShare)}{holding.operatingBonusPercent ? ` · 重组效率 +${holding.operatingBonusPercent}%` : ''}</p>{directable && (!streamlineUsed || !relocateUsed) && <span className="muted">董事会可执行的一次性调整：</span>}{!directable && equityNow < 50 && <span className="muted">增持到至少 50% 后，可以接管这家企业的董事会。</span>}</div>{directable && (!streamlineUsed || !relocateUsed) ? <div className="button-pair">{!streamlineUsed && <button className="text-button" disabled={game.cash - streamlineCost < 0} onClick={() => dispatch({ type: 'make_control_decision', businessId: business.id, decisionId: 'streamline_operations' })}>精简组织 {money(streamlineCost)}</button>}{!relocateUsed && relocationTargets.slice(0, 3).map((location) => <button className="text-button" key={location.id} disabled={game.cash - 2000 < 0} onClick={() => dispatch({ type: 'make_control_decision', businessId: business.id, decisionId: 'relocate_operations', targetLocationId: location.id })}>迁入{location.name} ¥2,000</button>)}</div> : <span className="current-label">{tier.name}</span>}</div>; })}</div></section>;
}

function BusinessOperationsView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const owned = contentRegistry.businesses.filter((business) => game.businesses[business.id]);
  if (!owned.length) return null;
  const canDirect = canDirectBusinessOperations(game.businesses[owned[0].id]);
  void canDirect;
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">股权分层 · 少数股权不插手日常经营</span><h2>企业经营</h2></div><p>调整定价、人员和备货属于经营决策，需要至少控股 50%；少数股权按持股分享利润，可以增持或减持。</p></div><div className="item-list">{owned.map((business) => {
    const holding = game.businesses[business.id];
    const profit = calculateDailyBusinessProfit(holding, business);
    const tier = ownershipTierForHolding(holding);
    const directable = canDirectBusinessOperations(holding);
    const update = (key: 'priceLevel' | 'wageLevel' | 'inventoryLevel', max: number) => dispatch({ type: 'update_business', businessId: business.id, priceLevel: key === 'priceLevel' ? (holding.priceLevel + 1) % max : holding.priceLevel, wageLevel: key === 'wageLevel' ? (holding.wageLevel + 1) % max : holding.wageLevel, inventoryLevel: key === 'inventoryLevel' ? (holding.inventoryLevel + 1) % max : holding.inventoryLevel });
    const fundingRound = holding.fundingRound ?? 0;
    const listingLocked = Boolean(holding.listedDay && game.time.day < holding.listedDay + 28);
    const publicFloat = holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100));
    const equity = holding.equityPercent ?? 100;
    const impliedValue = businessValuation(holding, balanceConfig);
    const increaseCost = Math.round(impliedValue * 10 / 100 * 1.15);
    return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p>预计净利润 {money(profit.profit)} /天 · 定价 {holding.priceLevel + 1} · 人员 {holding.wageLevel + 1} · 备货 {holding.inventoryLevel + 1}</p><p className="muted">{tier.name} · 持股 {equity}% · 已投入资本 {money(holding.capitalInvested ?? 0)} · 融资 {money(holding.fundingRaised ?? 0)} · 融资轮次 {fundingRound}/3 · {holding.listed ? '已上市' : '未上市'}{holding.operatingBonusPercent ? ` · 重组效率 +${holding.operatingBonusPercent}%` : ''}</p></div><div className="button-pair">{directable ? <>
      <button className="text-button" onClick={() => update('priceLevel', business.priceLevels.length)}>调整定价</button>
      <button className="text-button" onClick={() => update('wageLevel', business.wageLevels.length)}>调整人员</button>
      <button className="text-button" onClick={() => update('inventoryLevel', business.inventoryLevels.length)}>调整备货</button>
      <button className="text-button" disabled={game.cash - 1000 < 0} onClick={() => dispatch({ type: 'inject_business_capital', businessId: business.id, amount: 1000 })}>投入 ¥1,000</button>
      <button className="text-button" disabled={fundingRound >= 3} onClick={() => dispatch({ type: 'raise_business_funding', businessId: business.id })}>{fundingRound >= 3 ? '融资轮次已达上限' : fundingRound ? '继续融资' : '发起融资'}</button>
      <button className="text-button" disabled={Boolean(holding.listed) || fundingRound < 2} onClick={() => dispatch({ type: 'list_business', businessId: business.id })}>{holding.listed ? '已上市' : fundingRound < 2 ? '两轮融资后上市' : '申请上市'}</button>
      {holding.listed && publicFloat >= 10 && <button className="text-button" disabled={listingLocked || game.cash - 520 < 0} onClick={() => dispatch({ type: 'buy_business_equity', businessId: business.id, percent: 10 })}>{listingLocked ? `锁定至第 ${holding.listedDay! + 28} 天` : '回购 10% 股权'}</button>}
      {holding.listed && equity > 10 && <button className="text-button" disabled={listingLocked} onClick={() => dispatch({ type: 'sell_business_equity', businessId: business.id, percent: 10 })}>{listingLocked ? `锁定至第 ${holding.listedDay! + 28} 天` : '出售 10% 股权'}</button>}
        </> : <>
      {!holding.listed && equity <= 90 && <button className="text-button" disabled={game.cash - increaseCost < 0} onClick={() => dispatch({ type: 'increase_business_stake', businessId: business.id, percent: 10 })}>增持 10%（含战略溢价 {money(increaseCost)}）</button>}
      {!holding.listed && equity > 10 && <button className="text-button" onClick={() => dispatch({ type: 'sell_business_stake', businessId: business.id, percent: 10 })}>减持 10% {money(Math.round(impliedValue * 0.1))}</button>}
      {equity < 50 && <span className="muted">需要增持到至少 50% 才能接管董事会决策</span>}
      {holding.listed && publicFloat >= 10 && listingLocked && <span className="muted">公开回购需等锁定期结束（第 {(holding.listedDay ?? 0) + 28} 天后）</span>}
      {holding.listed && publicFloat >= 10 && !listingLocked && <button className="text-button" disabled={game.cash - 520 < 0} onClick={() => dispatch({ type: 'buy_public_business_equity', businessId: business.id, percent: 10 })}>买入公开流通股 ¥520</button>}
    </>}<button className="text-button" onClick={() => dispatch({ type: 'sell_business', businessId: business.id })}>退出企业</button></div></div>;
  })}</div></section>;
}

function BusinessPublicFloatView({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const listed = contentRegistry.businesses.filter((business) => game.businesses[business.id]?.listed);
  if (!listed.length) return null;
  return <section className="detail-panel" aria-label="公开股权"><div className="section-heading compact"><div><span className="eyebrow">上市后的外部持有人</span><h2>公开股权流通</h2></div><p>公开份额独立记录，不与企业经营股权或普通金融投资混在一起；持有公开份额后按企业经营利润获得分红。</p></div><div className="item-list">{listed.map((business) => { const holding = game.businesses[business.id]; const publicFloat = holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100)); const publicHolding = game.publicBusinessEquities?.[business.id]; const available = Math.max(0, publicFloat - (publicHolding?.percent ?? 0)); const tenPercentValue = Math.max(1, Math.round(businessValuation(holding, balanceConfig) * 0.1)); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">企业持股 {holding.equityPercent ?? 100}% · 市场流通 {publicFloat}%</p>{publicHolding && <p className="muted">你持有公开份额 {publicHolding.percent}% · 当前估值约 {money(Math.round(businessValuation(holding, balanceConfig) * publicHolding.percent / 100))}</p>}</div><div className="button-pair"><button className="text-button" disabled={available < 10 || game.cash - tenPercentValue < 0} onClick={() => dispatch({ type: 'buy_public_business_equity', businessId: business.id, percent: 10 })}>买入公开股权 ¥{tenPercentValue.toLocaleString('zh-CN')}</button>{publicHolding && <button className="text-button" onClick={() => dispatch({ type: 'sell_public_business_equity', businessId: business.id, percent: 10 })}>出售公开股权</button>}</div></div>; })}</div></section>;
}

function FinancialSummaryView({ game, compact = false }: { game: GameState; compact?: boolean }) { const ledger = game.financialLedger ?? { month: game.calendar.month, nextSequence: 1, entries: [], cashStart: unknown(), netWorthStart: unknown(), entriesComplete: false }; const summary = summarizeFinancialLedger(ledger, ledger.cashStart, game.cash, ledger.netWorthStart, calculateNetWorth(game, contentRegistry, balanceConfig)); const row = (label: string, value: number | KnownAmount, className = '') => <div className="finance-row"><span>{label}</span><strong className={className}>{signedMoney(value)}</strong></div>; const categories = (entries: Record<string, number>) => Object.entries(entries).map(([category, amount]) => `${displayMappedLabel(category, financialLabels)} ${money(amount)}`).join(' · ') || '暂无'; return <section className={compact ? 'finance-panel compact' : 'finance-panel'}><div className="section-heading compact"><div><span className="eyebrow">第 {summary.month} 月 · 本月账本</span><h2>钱从哪里来，又去了哪里</h2></div><span className="finance-note">资产配置不算消费</span></div><div className="finance-columns"><div><span className="finance-label">收入</span>{row('全部收入', summary.totalIncome, 'positive')}</div><div><span className="finance-label">消费支出</span>{row('生活与主动消费', scaleAmount(summary.totalConsumption, -1), 'negative')}</div><div><span className="finance-label">资产配置</span>{row('现金 → 投资资产', -summary.totalAssetAllocation, 'transfer')}</div><div><span className="finance-label">现金结余</span>{row('本月现金变化', summary.cashChange, amountClass(summary.cashChange))}</div></div><div className="finance-total"><span>净资产变化</span><strong>{money(summary.netWorthStart)} → {money(summary.netWorthEnd)}（{signedMoney(summary.netWorthChange)}）</strong></div>{!compact && <><div className="ledger-detail"><span>收入来源</span><small>{categories(summary.income.categories)}</small></div><div className="ledger-detail"><span>消费分类</span><small>{categories(summary.consumption.categories)}</small></div><div className="ledger-detail"><span>资产配置</span><small>{categories(summary.assetAllocation.categories)}</small></div><div className="ledger-detail"><span>最近月份</span><small>{(game.financialHistory ?? []).slice(-6).map((entry) => `第${entry.month}月 ${money(entry.cashChange)}`).join(' · ') || '还没有已归档月份'}</small></div></>}</section>; }

function BusinessLocationSummary({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const owned = contentRegistry.businesses.filter((business) => game.businesses[business.id]);
  if (!owned.length) return null;
  const acquisitionTargets = contentRegistry.businesses.filter((business) => !game.businesses[business.id] && game.unlockedBusinessIds.includes(business.id));
  return <><section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">企业与城市</span><h2>经营地点</h2></div><p>企业拥有稳定地点引用；购买、入股和董事会搬迁都会更新这家企业的经营地点与到访记录。</p></div><div className="item-list">{owned.map((business) => { const holding = game.businesses[business.id]; const locationId = effectiveBusinessLocationId(holding, business); const location = contentRegistry.locations?.find((entry) => entry.id === locationId); const relocated = Boolean(holding.relocatedLocationId && holding.relocatedLocationId !== business.locationId); return <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">{location ? `${location.name} · ${location.region}${relocated ? ' · 董事会搬迁后新址' : ''}` : '未指定地点'}</p></div><div className="row-meta"><span className="current-label">已访问 {game.locationVisits?.[locationId ?? ''] ?? 0} 次</span></div></div>; })}</div></section>{acquisitionTargets.length > 0 && <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">企业组合</span><h2>可并购企业</h2></div><p>以现有企业为基础并购另一家已解锁企业，交易会进入企业账本和人生记录。</p></div><div className="item-list">{acquisitionTargets.map((business) => <div className="item-row" key={business.id}><div><h3>{business.name}</h3><p className="muted">并购价 {money(Math.round(business.price * 1.1))} · 纳入企业组合</p></div><button className="text-button" onClick={() => dispatch({ type: 'acquire_business', businessId: business.id })}>并购 {money(Math.round(business.price * 1.1))}</button></div>)}</div></section>}</>;
}

function GiftPanel({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const gifts = contentRegistry.items.filter((item) => item.giftable && (game.inventory[item.id] ?? 0) > 0);
  if (!gifts.length) return null;
  return <section className="detail-panel" aria-label="礼物"><div className="section-heading compact"><div><span className="eyebrow">小心意，不是关系任务</span><h2>准备一份礼物</h2></div><p>合适的礼物会带来一点额外关系进展；不需要靠昂贵礼物维持关系。</p></div><div className="item-list">{contentRegistry.characters.filter((character) => (game.relationships[character.id] ?? 0) > 0).map((character) => <div className="item-row" key={character.id}><div><h3>{character.name}</h3><span className="muted">偏好：{character.preferredGiftTags?.join('、') ?? '没有特别偏好'}</span></div><div className="button-pair">{gifts.map((item) => <button className="text-button" key={`${character.id}.${item.id}`} onClick={() => dispatch({ type: 'gift_item', characterId: character.id, itemId: item.id })}>送 {item.name}（×{game.inventory[item.id]}）</button>)}</div></div>)}</div></section>;
}

function CharacterPreferenceSummary({ game }: { game: GameState }) {
  const entries = contentRegistry.characters.filter((character) => character.preferredInteractionCategories?.length);
  if (!entries.length) return null;
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">关系反馈</span><h2>人物偏好</h2></div><p>选择对方偏好的互动类型，会让关系进展更顺利；偏好会在互动结算时生效并写入历史。</p></div><div className="item-list">{entries.map((character) => <div className="item-row" key={character.id}><div><h3>{character.name}</h3><span className="muted">偏好：{character.preferredInteractionCategories!.map((category) => displayMappedLabel(category, interactionCategoryLabels)).join('、')}</span></div><div className="row-meta"><span className="current-label">当前关系 {game.relationships[character.id] ?? 0}</span></div></div>)}</div></section>;
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
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">长期记录</span><h2>年度回顾</h2></div>{game.businessFacts?.history === 'partial' && <p>旧版历史仅恢复现存证据，不补造冷却日期；旧岗位的挽留奖励按已领取处理。</p>}<p>年度记录来自已完成的十二个月，不改变自动模拟的暂停与决策节点。</p></div>{entries.length > 0 && <div className="filter-row" aria-label="年度跨度">{([3, 5, 10] as const).map((value) => <button key={value} className={range === value ? 'filter-button selected' : 'filter-button'} aria-pressed={range === value} onClick={() => setRange(value)}>近 {value} 年</button>)}</div>}{first && last && visible.length >= 3 && <div className="finance-total"><span>近 {visible.length} 年净资产变化</span><strong>{money(first.netWorthStart)} → {money(last.netWorthEnd)}（{signedMoney(subtractAmount(last.netWorthEnd, first.netWorthStart))}）</strong></div>}{entries.length ? <div className="item-list">{visible.map((entry) => { const world = worldHistory.find((snapshot) => snapshot.year === entry.year); const relationships = Object.entries(world?.relationshipValues ?? {}).filter(([, value]) => value > 0).map(([id, value]) => `${displayContentName(id, contentRegistry.characters, '联系人')} ${value}`).join(' · '); const companyStates = Object.entries(world?.companyStates ?? {}).map(([id, title]) => `${displayContentName(id, contentRegistry.companies ?? [], '企业')}：${title}`).join(' · '); return <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年</h3><p>{entry.months} 个月 · 收入 {money(entry.totalIncome)} · 消费 {money(entry.totalConsumption)} · 联系人 {world?.relationshipCount ?? '—'} 人</p>{relationships && <span className="muted">关系：{relationships}</span>}{companyStates && <span className="muted">公司状态：{companyStates}</span>}</div><div className="row-meta"><strong>{money(entry.netWorthStart)} → {money(entry.netWorthEnd)}</strong><span className="muted">现金 {money(entry.cashStart)} → {money(entry.cashEnd)}</span></div></div>; })}</div> : <p className="muted">完成第一个年度后，这里会出现年度现金流与净资产记录。</p>}</section>;
}

function WorldHistoryView({ game }: { game: GameState }) {
  const entries = game.worldHistory ?? [];
  return <section className="detail-panel"><div className="section-heading compact"><div><span className="eyebrow">世界记录</span><h2>世界记录</h2></div><p>每年结算时保存一次生活所处的世界状态，不改变玩家的规划权。</p></div>{entries.length ? <div className="item-list">{entries.map((entry) => { const relationships = Object.entries(entry.relationshipValues ?? {}).filter(([, value]) => value > 0).map(([id, value]) => `${displayContentName(id, contentRegistry.characters, '联系人')} ${value}`).join(' · '); const careerStates = Object.entries(entry.characterCareerStates ?? {}).map(([id, title]) => `${displayContentName(id, contentRegistry.characters, '联系人')}：${title}`).join(' · '); const companyStates = Object.entries(entry.companyStates ?? {}).map(([id, title]) => `${displayContentName(id, contentRegistry.companies ?? [], '企业')}：${title}`).join(' · '); return <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年 · 经营 {entry.businessCount} 家企业{entry.controlledBusinessCount !== undefined ? `（控股 ${entry.controlledBusinessCount} 家）` : ''}</h3><p>{entry.currentJobId ? `当前职业：${displayContentName(entry.currentJobId, contentRegistry.jobs, '职业')}` : '当前没有正式职业'} · 关系联系人 {entry.relationshipCount} 人</p>{relationships && <span className="muted">关系：{relationships}</span>}{careerStates && <span className="muted">人物职业：{careerStates}</span>}{companyStates && <span className="muted">公司状态：{companyStates}</span>}</div><div className="row-meta"><strong>{money(entry.netWorth)}</strong><span className="muted">访问 {entry.visitedLocationCount} 个地点</span>{entry.locationDevelopment && <span className="muted">发展：{Object.entries(entry.locationDevelopment).map(([id, level]) => `${displayContentName(id, contentRegistry.locations ?? [], '地点')} ${level}/5`).join(" · ")}</span>}</div></div>; })}</div> : <p className="muted">完成第一个年度后，这里会出现企业、关系、地点和净资产的世界快照。</p>}</section>;
}

function WorldEquityHistoryView({ game }: { game: GameState }) {
  const entries = (game.worldHistory ?? []).filter((entry) => entry.listedBusinessCount !== undefined);
  if (!entries.length) return null;
  return <section className="detail-panel" aria-label="年度公开股权记录"><div className="section-heading compact"><div><span className="eyebrow">企业股权变化</span><h2>年度公开股权记录</h2></div><p>上市企业和公开流通比例会随年度结算归档，作为世界状态的一部分保留。</p></div><div className="item-list">{entries.map((entry) => { const publicEquities = Object.entries(entry.publicBusinessEquities ?? {}); return <div className="item-row" key={entry.year}><div><h3>第 {entry.year} 年</h3><p>上市企业 {entry.listedBusinessCount} 家</p>{publicEquities.map(([id, holding]) => <span className="muted" key={id}>{displayContentName(id, contentRegistry.businesses, '企业')} {holding.percent}% · 年末估值 {money(holding.currentValue)}</span>)}</div><div className="row-meta"><strong>公开流通 {entry.publicFloatPercent ?? 0}%</strong></div></div>; })}</div></section>;
}

function ProfileView({ game, netWorth, lifestyle, onReset }: { game: GameState; netWorth: number; lifestyle: number; onReset: () => void }) { const currentJob = contentRegistry.jobs.find((job) => job.id === game.currentJobId); const attributes = game.attributes; const wealthTier = wealthTierForNetWorth(netWorth); const labels: Array<[string, number]> = [['专业', attributes?.professional ?? game.ability], ['知识', attributes?.knowledge ?? game.ability], ['沟通', attributes?.communication ?? game.ability], ['体能', attributes?.fitness ?? game.ability], ['形象', attributes?.appearance ?? lifestyle], ['人脉', attributes?.network ?? 0], ['心情', attributes?.mood ?? 50]]; return <><div className="section-heading compact"><PixelIllustration name="profile" size={72} className="profile-heading-art" /><div><span className="eyebrow">把进步看清楚</span><h1>我的</h1></div><p>每个数字都来自正在运行的生活。</p></div><div className="profile-grid"><div className="info-panel"><span>现金</span><strong>{money(game.cash)}</strong></div><div className="info-panel"><span>净资产</span><strong>{money(netWorth)}</strong></div><div className="info-panel"><span>财富阶段</span><strong>{wealthTier.name}</strong></div><div className="info-panel"><span>当前工作</span><strong>{currentJob?.name ?? '暂无'}</strong></div></div><div className="detail-panel"><span className="eyebrow">长期财富阶梯</span><h2>{wealthTier.name}</h2><p>{wealthTier.description}</p>{(wealthTier.id === 'world' || wealthTier.id === 'global') && <p className="requirement-met">世界级财富阶段已达成 · 继续生活</p>}</div><div className="attribute-grid">{labels.map(([label, value]) => <div className="attribute-row" key={label}><span>{label}</span><strong>{value}</strong><i style={{ width: `${Math.min(100, value)}%` }} /></div>)}</div>{Object.entries(game.interestFamiliarity ?? {}).length > 0 && <div className="detail-panel"><span className="eyebrow">兴趣熟练度</span><h2>在生活里慢慢熟悉</h2><div className="item-list">{Object.entries(game.interestFamiliarity ?? {}).map(([tag, value]) => <div className="item-row" key={tag}><span>{interestFamiliarityLabel(tag)}</span><strong>{interestFamiliarityStage(Number(value))}</strong></div>)}</div></div>}<FinancialSummaryView game={game} /><RelationshipHistoryView game={game} /><LifeHistoryList entries={game.lifeHistory ?? []} /><div className="detail-panel"><h2>存档</h2><p>每次重要状态变化都会保存。刷新会停在当前分钟，不产生离线时间。</p><button className="secondary-button" onClick={onReset}>重新开始</button></div></>; }

function RecruitmentModal({ game, job, dispatch }: { game: GameState; job: (typeof contentRegistry.jobs)[number]; dispatch: (action: GameAction) => void }) { const recruitment = game.activeRecruitment!; const recruiter = contentRegistry.characters.find((character) => character.id === recruitment.recruiterCharacterId); const schedule = defaultJobSchedule(job); const recruitmentData = job.recruitment; return <div className="modal-backdrop"><section className="event-modal recruitment-modal" role="dialog" aria-modal="true" aria-labelledby="recruitment-title">{recruitment.stage === 'dialogue' ? <><span className="eyebrow">{recruiter?.identity ?? '招聘联系人'}</span><h2 id="recruitment-title">{recruiter?.name ?? '招聘联系人'}</h2><p>{recruitmentData?.intro?.[0]?.text ?? '“最近这边正好缺人。”'}</p><p>{recruitmentData?.intro?.[1]?.text ?? `“${job.name}主要负责${job.description.replace(/[。．]$/, '')}。”`}</p><div className="dialogue-person">{recruiter?.description ?? '有人愿意和你聊聊这份工作。'}</div><button className="primary-button" onClick={() => dispatch({ type: 'advance_recruitment', jobId: job.id })}>继续了解</button></> : recruitment.stage === 'interview' ? <><span className="eyebrow">面试</span><h2 id="recruitment-title">简单聊聊</h2><p>{recruitmentData?.interview?.[0]?.text ?? '“你之前做过哪些类似的事情？”'}</p><p>{recruitmentData?.interview?.[1]?.text ?? '“我们更看重稳定、愿意学习和把事情做完。”'}</p><button className="primary-button" onClick={() => dispatch({ type: 'advance_recruitment', jobId: job.id })}>进入工作邀请</button></> : <><span className="eyebrow">工作邀请</span><h2 id="recruitment-title">{job.name}</h2><p>{recruitmentData?.offerText ?? '这是一份清晰、稳定的工作安排。'}</p><div className="offer-grid"><span>月薪</span><strong>{job.kind === 'regular' ? money(job.basePay * 20) : money(job.basePay)}</strong><span>工作时间</span><strong>{job.kind === 'regular' ? `${schedule.workDays.length * job.hours}h / 周` : `${job.hours}h / 次`}</strong><span>排班</span><strong>{job.kind === 'regular' ? `周一至周五 · ${formatClock(Math.floor(schedule.startMinute / 60), schedule.startMinute % 60)}–${formatClock(Math.floor(schedule.endMinute / 60), schedule.endMinute % 60)}` : '由你的周计划安排'}</strong></div><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'accept_job_offer', jobId: job.id })}>接受工作</button><button className="secondary-button" onClick={() => dispatch({ type: 'decline_job_offer', jobId: job.id })}>暂时不接受</button></div></>}</section></div>; }

function RewardModal({ reward, dispatch }: { reward: NonNullable<GameState['pendingReward']>; dispatch: (action: GameAction) => void }) {
  return <div className="modal-backdrop event-paused"><section className="event-modal reward-modal" role="dialog" aria-modal="true" aria-labelledby="reward-title"><span className="eyebrow">本次获得</span><h2 id="reward-title">结果已经写入人生</h2><div className="reward-lines">{reward.lines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div><p className="reward-auto-note">奖励已经结算。选择接下来是否继续运行。</p><div className="button-pair"><button className="secondary-button" onClick={() => dispatch({ type: 'claim_reward' })}>收下并暂停</button><button className="primary-button" onClick={() => dispatch({ type: 'claim_reward', resume: true })}>收下并继续运行</button></div></section></div>;
}

function ResignationModal({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) { const job = contentRegistry.jobs.find((entry) => entry.id === game.activeResignation?.jobId); const outcome = game.activeResignation?.stage === 'outcome'; return <div className="modal-backdrop"><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="resignation-title"><span className="eyebrow">离职沟通</span><h2 id="resignation-title">{job?.name ?? '当前工作'}</h2>{!outcome ? <><p>主管看着你的安排：“你确定要离开吗？最近你的表现其实不错。”</p><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'advance_resignation' })}>继续沟通</button></div></> : <><p>“如果待遇可以提高，我愿意替你争取一下。”你也可以选择换一个方向。</p><div className="button-pair"><button className="primary-button" onClick={() => dispatch({ type: 'choose_resignation', choice: 'stay' })}>留下来谈谈</button><button className="secondary-button" onClick={() => dispatch({ type: 'choose_resignation', choice: 'leave' })}>我想换个方向</button></div></>}</section></div>; }

function MonthlySummary({ summary, financial }: { summary: NonNullable<GameState['lastMonthlySummary']>; financial?: GameState['lastFinancialSummary'] }) { const fallback = [['工资', summary.ledger.wageIncome], ['兼职', summary.ledger.sideJobIncome], ['企业收益', summary.ledger.businessIncome], ['投资收益', summary.ledger.assetIncome], ['固定生活支出', -(summary.ledger.rentExpense + summary.ledger.livingExpense)], ['主动消费', -summary.ledger.purchaseExpense]]; const group = (label: string, entries: Record<string, number> | undefined, sign: 1 | -1) => <div className="summary-group" key={label}><span className="summary-group-title">{label}</span>{Object.entries(entries ?? {}).filter(([, amount]) => amount > 0).map(([category, amount]) => <div key={category}><span>{displayMappedLabel(category, financialLabels)}</span><strong className={sign > 0 ? 'positive' : 'negative'}>{sign > 0 ? '+' : '-'}{money(amount)}</strong></div>)}</div>; return <section className="monthly-summary"><div><span className="eyebrow">四周结算 · 现金流仪式</span><h2>第 {summary.month} 月账单</h2><p>现金变化和净资产变化分开计算；买入资产只是把现金换成了另一种财富。</p></div><div className="summary-lines">{financial ? <>{group('收入', financial.income.categories, 1)}{group('消费支出', financial.consumption.categories, -1)}{group('资产配置 · 现金转为资产', financial.assetAllocation.categories, -1)}{group('资产变现', financial.assetLiquidation.categories, 1)}</> : fallback.map(([label, amount]) => <div key={label as string}><span>{label}</span><strong className={(amount as number) >= 0 ? 'positive' : 'negative'}>{(amount as number) >= 0 ? '+' : ''}{money(amount as number)}</strong></div>)}</div><div className="summary-total"><span>收入</span><strong>{money(financial?.totalIncome ?? summary.ledger.wageIncome + summary.ledger.sideJobIncome + summary.ledger.businessIncome + summary.ledger.assetIncome)}</strong><span>消费支出</span><strong>{money(financial?.totalConsumption ?? summary.ledger.rentExpense + summary.ledger.livingExpense + summary.ledger.purchaseExpense)}</strong><span>现金变化</span><strong>{financial ? `${money(financial.cashStart)} → ${money(financial.cashEnd)}` : '—'}</strong><span>净资产</span><strong>{money(summary.ledger.netWorthStart)} → {money(summary.ledger.netWorthEnd)}</strong></div></section>; }

const highlightKindIcon: Record<string, PixelIconName> = {
  new_job: 'career', new_contact: 'users', side_job_acquired: 'cash', gig_completed: 'cash',
  major_purchase: 'bag', new_asset: 'house', attribute_milestone: 'chart', storyline_completed: 'book',
  career_milestone: 'career', relationship: 'users', qualification: 'tag', asset: 'house', investment: 'wealth',
};
const careerExperienceHighlightIcon: Record<string, PixelIconName> = {
  office: 'book', operations: 'settings', customer_service: 'users', retail: 'shop', logistics: 'plane',
  data: 'chart', project: 'target', management: 'users', media: 'spark', finance: 'wealth',
};
const careerExperienceHighlightIllustration: Record<string, PixelIllustrationName> = {
  office: 'job-office', operations: 'job-warehouse', customer_service: 'social', retail: 'job-shop', logistics: 'job-logistics',
  data: 'laptop', project: 'book', management: 'job-manager', media: 'camera', finance: 'wealth',
  retail_operations_experience: 'job-warehouse', client_service_experience: 'social-mentor', 'milestone.seed-job': 'career-market',
};
const highlightIllustrationByKind: Partial<Record<MonthlyHighlight['kind'], PixelIllustrationName>> = {
  new_job: 'suitcase', new_contact: 'users', side_job_acquired: 'coin', gig_completed: 'coin',
  major_purchase: 'wealth', new_asset: 'house', attribute_milestone: 'tag', storyline_completed: 'book',
};
const highlightPlaceholderIllustrations: readonly PixelIllustrationName[] = ['job-office', 'social', 'book', 'house', 'wealth'];
export function highlightIconFor(highlight: Pick<MonthlyHighlight, 'kind' | 'label' | 'sourceId'>): PixelIconName {
  if (highlight.kind === 'attribute_milestone') {
    if (highlight.label.includes('资格')) return 'tag';
    if (highlight.sourceId && careerExperienceHighlightIcon[highlight.sourceId]) return careerExperienceHighlightIcon[highlight.sourceId];
    if (highlight.label.includes('经验')) return 'career';
    if (highlight.label.includes('里程碑')) return 'target';
  }
  return highlightKindIcon[highlight.kind] ?? 'spark';
}
export function highlightIllustrationFor(highlight: Pick<MonthlyHighlight, 'kind' | 'label' | 'sourceId'>): PixelIllustrationName {
  if (highlight.kind === 'attribute_milestone' && highlight.label.includes('资格')) return 'tag';
  if (highlight.kind === 'attribute_milestone' && highlight.sourceId && careerExperienceHighlightIllustration[highlight.sourceId]) {
    return careerExperienceHighlightIllustration[highlight.sourceId];
  }
  return highlightIllustrationByKind[highlight.kind] ?? 'diamond';
}
const highlightTitleByKind: Partial<Record<MonthlyHighlight['kind'], string>> = {
  new_job: '新工作', new_contact: '新联系人', side_job_acquired: '新副业', gig_completed: '零工完成',
  major_purchase: '新投资机会', new_asset: '新资产', storyline_completed: '剧情进展',
};
export function highlightTitleFor(highlight: Pick<MonthlyHighlight, 'kind' | 'label'>): string {
  if (highlight.kind === 'attribute_milestone') {
    if (highlight.label.includes('资格')) return '新资格';
    if (highlight.label.includes('里程碑')) return '新里程碑';
    if (highlight.label.includes('经验')) return '经验进展';
  }
  return highlightTitleByKind[highlight.kind] ?? '重要变化';
}
const incomeCategoryIcon: Record<string, PixelIconName> = { wage: 'career', side_job: 'clock', bonus: 'spark', business_income: 'city', property_income: 'house', investment_dividend: 'wealth', event_income: 'mail', other_income: 'tag' };
const expenseCategoryIcon: Record<string, PixelIconName> = { housing: 'house', living: 'home', food: 'bag', transport: 'plane', communication: 'mail', shopping: 'shop', entertainment: 'controller', social: 'users', education: 'book', travel: 'plane', service: 'spark', maintenance: 'settings', other_expense: 'tag' };
const settlementAttributeIcons: Record<string, PixelIconName> = { 专业: 'career', 知识: 'book', 沟通: 'users', 体能: 'bolt', 形象: 'profile', 人脉: 'users' };

/** 参考图整幅月结仪式：状态栏保持可见，下方是一个完整的结算大框，而不是小弹窗。 */
function MonthlySummaryModal({ game, dispatch }: { game: GameState; dispatch: (action: GameAction) => void }) {
  const pending = game.pendingMonthlySummary!;
  const financial = pending.financial;
  const ledger = pending.summary.ledger;
  const netWorthStart = ledger.netWorthStart;
  const netWorthEnd = ledger.netWorthEnd;
  const netWorthChange = financial?.netWorthChange ?? subtractAmount(netWorthEnd, netWorthStart);
  const cashDelta = financial?.cashChange ?? unknown();
  const monthStartDay = (pending.month - 1) * 28 + 1;
  const monthEndDay = pending.month * 28;
  const startAmount = amount(netWorthStart), changeAmount = amount(netWorthChange);
  const growthPercent = startAmount.kind === 'known' && changeAmount.kind === 'known' && startAmount.value > 0 ? Math.round(changeAmount.value / startAmount.value * 1000) / 10 : null;
  const incomeRows = Object.entries(financial?.income.categories ?? {}).filter(([, amount]) => amount > 0).slice(0, 5);
  const expenseRows = Object.entries(financial?.consumption.categories ?? {}).filter(([, amount]) => amount > 0).slice(0, 6);
  const allocationCategoryOrder = ['investment_transfer', 'property_transfer', 'business_transfer', 'collectible_transfer'] as const;
  const allocationCategories = financial?.assetAllocation.categories ?? {};
  const allocationRows = financial
    ? allocationCategoryOrder.map((category) => [category, allocationCategories[category] ?? 0] as [string, number])
    : Object.entries(allocationCategories).filter(([, amount]) => amount !== 0).slice(0, 7);
  const realizedGain = financial?.income.categories.realized_gain ?? 0;
  const realizedLoss = financial?.consumption.categories.realized_loss ?? 0;
  const liquidation = financial?.totalAssetLiquidation ?? 0;
  const allocationScale = Math.max(1, ...allocationRows.map(([, amount]) => Math.abs(amount)));
  const highlightCount = Math.min(pending.highlights.length, 5);
  const highlightPlaceholders = ['工作与机会', '关系变化', '能力与资格', '住房与资产', '投资与机会'];
  const leadingCategory = (rows: ReadonlyArray<readonly [string, number]>) => rows.reduce<readonly [string, number] | undefined>((leading, row) => !leading || row[1] > leading[1] ? row : leading, undefined)?.[0];
  const incomeNote = leadingCategory(incomeRows) ? `本月收入主要来自${displayMappedLabel(leadingCategory(incomeRows), financialLabels)}。` : '本月没有收入记录。';
  const expenseNote = leadingCategory(expenseRows) ? `本月最大支出类别是${displayMappedLabel(leadingCategory(expenseRows), financialLabels)}。` : '本月没有消费支出。';
  const allocationNote = leadingCategory(allocationRows.filter(([, amount]) => amount > 0)) ? `本月资产配置主要用于${displayMappedLabel(leadingCategory(allocationRows.filter(([, amount]) => amount > 0)), financialLabels)}。` : '本月没有资产配置流动。';
  const attributes: Array<[string, number]> = [
    ['专业', game.attributes?.professional ?? game.ability], ['知识', game.attributes?.knowledge ?? game.ability],
    ['沟通', game.attributes?.communication ?? game.ability], ['体能', game.attributes?.fitness ?? 50],
    ['形象', game.attributes?.appearance ?? 50], ['人脉', game.attributes?.network ?? 0],
  ];
  const resumeText = pending.resumeMode === 'running' ? '时间继续自动流转' : pending.resumeMode === 'paused' ? '回到暂停中的计划' : '等待你安排新一周';
  return <div className="modal-backdrop settlement-mode"><section className="monthly-summary fullframe pixel-corners" role="dialog" aria-modal="true" aria-labelledby="monthly-title">
    <header className="settle-head">
      <div className="settle-meta left">
        <span>本月时间</span>
        <b>第 {monthStartDay} – 第 {monthEndDay} 天</b>
        <small>本月天数：28 天</small>
      </div>
      <div className="settle-title-wrap">
        <PixelIcon name="spark" size={16} className="settle-title-spark settle-title-spark-left" />
        <h2 id="monthly-title">第 {pending.month} 月结算</h2>
        <PixelIcon name="spark" size={16} className="settle-title-spark settle-title-spark-mid" />
        <p>时间在流逝，你的选择创造了结果</p>
        <PixelIcon name="spark" size={16} className="settle-title-spark settle-title-spark-right" />
      </div>
      <div className="settle-meta right">
        <span>结算日期</span>
        <b>第 {monthEndDay + 1} 天</b>
        <small>{resumeText}</small>
      </div>
    </header>
    <div className="settle-grid" role="group" aria-label="月度财务仪表盘">
      <section className={`settle-panel${incomeRows.length ? '' : ' is-empty'}`} aria-label="收入">
        <h3>收入（总计）</h3>
        <div className="settle-panel-art"><PixelIllustration name="settlement-income" size={88} /></div>
        <strong className={'metric-box positive'}>+{money(financial?.totalIncome ?? ledger.wageIncome + ledger.sideJobIncome)}</strong>
        <ul className="settle-rows">{incomeRows.length ? incomeRows.map(([category, amount]) => <li key={category}><PixelIcon name={incomeCategoryIcon[category] ?? 'cash'} size={16} /><span>{displayMappedLabel(category, financialLabels)}</span><b>+{money(amount)}</b></li>) : <li className="settle-empty-row"><span className="settle-empty-copy" role="status" aria-label="本月没有收入记录。">本月没有收入记录。</span></li>}</ul>
        <div className="settle-panel-note" aria-label="收入摘要"><span>{incomeNote}</span></div>
      </section>
      <section className={`settle-panel${expenseRows.length ? '' : ' is-empty'}`} aria-label="支出">
        <h3>支出（总计）</h3>
        <div className="settle-panel-art"><PixelIllustration name="settlement-expense" size={88} /></div>
        <strong className={'metric-box negative'}>-{money(financial?.totalConsumption ?? ledger.livingExpense + ledger.rentExpense)}</strong>
        <ul className="settle-rows">{expenseRows.length ? expenseRows.map(([category, amount]) => <li key={category}><PixelIcon name={expenseCategoryIcon[category] ?? 'shop'} size={16} /><span>{displayMappedLabel(category, financialLabels)}</span><b>-{money(amount)}</b></li>) : <li className="settle-empty-row"><span className="settle-empty-copy" role="status" aria-label="本月没有消费支出。">本月没有消费支出。</span></li>}</ul>
        <div className="settle-panel-note" aria-label="支出摘要"><span>{expenseNote}</span></div>
      </section>
      <section className={`settle-panel settle-allocation${allocationRows.length ? '' : ' is-empty'}`} aria-label="资产配置">
        <h3>资产配置（变化）</h3>
        <div className="settle-panel-art"><PixelIllustration name="settlement-allocation" size={68} /></div>
        <ul className="settle-rows alloc">{allocationRows.length ? allocationRows.map(([category, amount]) => { const label = displayMappedLabel(category, financialLabels); return <li className={amount === 0 ? 'is-zero' : undefined} key={category}><span>{label}{amount === 0 && <em>无变化</em>}</span><SegmentMeter value={Math.abs(amount)} max={allocationScale} segments={10} label={`${label} ${amount === 0 ? '本月无配置流动' : money(amount)}`} /><b>{amount === 0 ? '±0' : money(Math.abs(amount))}</b></li>; }) : <li className="settle-empty-row"><span className="settle-empty-copy" role="status" aria-label="本月没有资产配置流动。">本月没有资产配置流动。</span></li>}</ul>
        <div className="ledger-detail"><span>现金变化</span><small>{signedMoney(cashDelta)}</small></div>
        <div className="settle-panel-note" aria-label="资产配置摘要"><span>{allocationNote}</span></div>
      </section>
      <div className="settle-result-column" aria-label="净资产结果与变现结果">
        <section className="settle-result settle-result-inverse pixel-corners" aria-label="净资产结果">
          <h3 className="settle-result-title">净资产变化</h3>
          <span className="settle-ribbon">本月净资产{amountDirection(netWorthChange)}</span>
          <strong className={`settle-big ${amountClass(netWorthChange)}`}>{signedMoney(netWorthChange)}</strong>
          <p className="settle-range">净资产从 {money(netWorthStart)} 变化为 {money(netWorthEnd)}（估值变化不等于现金收入）</p>
          {growthPercent !== null && <em className="settle-badge"><span>增幅</span><strong>{changeAmount.kind === 'known' && changeAmount.value >= 0 ? '+' : ''}{growthPercent}%</strong></em>}
          <div className="settle-result-motif" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => <i className={`settle-ray settle-ray-${index + 1}`} key={`ray-${index}`} />)}
            {Array.from({ length: 14 }, (_, index) => <i className={`settle-spark settle-spark-${index + 1}`} key={`spark-${index}`} />)}
          </div>
          <PixelIllustration name="settlement" size={108} className="settle-result-art" />
        </section>
        <div className="settle-half-row">
          <div className="settle-half"><h4>已实现收益</h4><strong>{realizedGain - realizedLoss >= 0 ? '+' : '-'}{money(Math.abs(realizedGain - realizedLoss))}</strong><small>卖出落袋才计入现金</small></div>
          <div className="settle-half"><h4>资产变现</h4><strong>{money(liquidation)}</strong><small>持有物转回现金的金额</small></div>
        </div>
      </div>
    </div>
    <div className="settle-highlights">
      <header className="settle-highlights-head"><PixelIcon name="spark" size={14} /><span>本月重要收获</span><i className="dotted-line" aria-hidden="true" /></header>
      <div className={`highlight-row highlight-row-${highlightCount}`}>
        {Array.from({ length: 5 }, (_, index) => pending.highlights[index] ? <article className="highlight-card" key={pending.highlights[index].id}>
          <i className="new-ribbon" aria-hidden="true">NEW</i>
          <PixelIllustration name={highlightIllustrationFor(pending.highlights[index])} size={36} className="highlight-art" />
          <h3>{highlightTitleFor(pending.highlights[index])}</h3>
          <p className="highlight-description">{displaySettlementHighlightLabel(pending.highlights[index].label)}</p>
          <small>第 {pending.highlights[index].day} 天 · 记录 {index + 1}</small>
        </article> : <article className="highlight-card placeholder" key={`placeholder-${index}`} aria-label={`${highlightPlaceholders[index]}尚未记录`}>
          <PixelIllustration name={highlightPlaceholderIllustrations[index]} size={36} className="highlight-art" />
          <h3>{highlightPlaceholders[index]}</h3>
          <small>发生真实变化后显示</small>
        </article>)}
        <article className="highlight-card reflection" aria-label="本月回顾">
          <PixelIcon name="chart" size={26} />
          <h3>本月回顾</h3>
          <strong className={`reflection-metric ${amountClass(netWorthChange)}`}>{signedMoney(netWorthChange)}</strong>
          <small className="reflection-range">{money(netWorthStart)} → {money(netWorthEnd)}</small>
          <p>{pending.highlights.length ? `写下了 ${pending.highlights.length} 条值得记住的变化。` : '这个月平稳地过去了，没有标记的重大变化。'}</p>
        </article>
      </div>
    </div>
    <footer className="settle-footer">
      <div className="settle-avatar"><PixelIllustration name="mascot" size={56} /></div>
      <div className="settle-foot-text">这些数字都来自真实账本，本月变化已经记录。</div>
      <dl className="settle-attrs">{attributes.map(([label, value]) => <div key={label}><dt><PixelIcon name={settlementAttributeIcons[label] ?? 'users'} size={14} data-attribute-icon={label} />{label}</dt><dd><SegmentMeter value={value} segments={6} label={`${label} ${value}`} /></dd><b>{Math.round(value)}</b></div>)}</dl>
      <button className="primary-button settle-continue" onClick={() => dispatch({ type: 'acknowledge_monthly_summary' })}>进入下个月<PixelIcon name="arrow-right" size={14} aria-hidden="true" /></button>
      <small className="settle-continue-note">时间不会停止，机会稍纵即逝</small>
    </footer>
  </section></div>;
}

function EventModal({ event, onChoose }: { event: (typeof contentRegistry.events)[number]; onChoose: (choiceId: string) => void }) { return <div className="modal-backdrop event-paused"><section className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title"><span className="eyebrow">世界已暂停 · 发生了一件事</span><h2 id="event-title">{event.title}</h2><p>{event.body}</p><div className="event-choices">{event.choices.map((choice) => <button key={choice.id} className="choice-button" onClick={() => onChoose(choice.id)}>{choice.text}<span>选择</span></button>)}</div></section></div>; }

function EffectRail({ effects }: { effects: ReturnType<typeof gameStore.getState>['effects'] }) { const visible = effects.filter((effect) => effect.type !== 'time' && effect.type !== 'activity'); if (!visible.length) return null; return <div className="effect-rail" aria-live="polite">{visible.slice(-4).map((effect, index) => <div className="effect-item" key={`${effect.type}-${index}`}>{effect.type === 'cash' ? `${effect.amount >= 0 ? '+' : ''}${money(effect.amount)}` : effect.type === 'stat' ? `${effect.stat === 'ability' ? '能力' : effect.stat === 'reputation' ? '声誉' : '生活水平'} ${effect.amount >= 0 ? '+' : ''}${effect.amount}` : effect.type === 'month' ? `第 ${effect.summary.month} 月结算` : effect.type === 'settlement' ? `第 ${effect.day} 天结算` : effect.type === 'unlock' ? `解锁：${humanizeContentId(effect.id)}` : effect.type === 'purchase' ? `已购买 ${effect.quantity} 件` : effect.type === 'message' ? effect.text : '进展更新'}</div>)}</div>; }

function SettingsPanel({ game, saveError, onClose, onReset }: { game: GameState; saveError?: string; onClose: () => void; onReset: () => void }) {
  return <div className="modal-backdrop" role="presentation" onClick={onClose}><section className="confirm-modal" role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => event.stopPropagation()}>
    <h2>设置</h2>
    <p>《余量》会自动保存到浏览器本地存储。这里可以确认存档状态，或重新开始一段人生。</p>
    <dl className="detail-facts">
      <span>存档版本</span><strong>v{game.version}</strong>
      <span>内容版本</span><strong>v{game.contentVersion}</strong>
      <span>当前进度</span><strong>第 {game.calendar.week} 周 · 第 {game.time.day} 天</strong>
      <span>自动保存</span><strong className={saveError ? 'requirement-missing' : 'requirement-ok'}>{saveError ? '保存失败' : '正常'}</strong>
    </dl>
    {saveError && <p className="requirement-missing">{saveError}</p>}
    <div className="button-pair">
      <button className="secondary-button" onClick={onClose}>关闭</button>
      <button className="text-button" onClick={onReset}>重新开始</button>
    </div>
  </section></div>;
}

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
