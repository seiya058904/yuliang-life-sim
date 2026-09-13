import { useMemo, useState } from 'react';
import { PixelIcon, type PixelIconName } from './pixel/PixelIcon';

import type { GameAction, GameState, JobApplicationState, JobDefinition, ViewId } from '../content/contracts';
import { employmentKind, isJobEligible, requirementHints } from '../engine/careers';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { careerExperienceLabel, careerExperienceStage } from '../engine/careerProgression';
import { buildMobilityEntries } from '../engine/mobility';
import { CANONICAL_DURATIONS, NO_SLOT_REASON, findNextSchedulableSlot } from '../engine/planning';
import { activeApplications, applicationCooldownRemaining, terminalApplications } from '../engine/lifecycle';
import { useWeekScheduler } from './weekScheduler';
import { PixelIllustration, type PixelIllustrationName } from './pixel/PixelIllustration';
import { PixelAction, SegmentMeter } from './pixel/PixelUI';
import { displayContentName, displayMappedLabel, humanizeContentId } from './pixel/displayNames';

const categories = ['全部', '基础岗位', '办公室', '技术', '销售', '服务', '管理', '兼职'] as const;
const states = ['全部', '符合条件', '接近条件', '已申请', '冷却中'] as const;
const sorts = ['匹配度', '薪资最高', '截止最早', '最新发布'] as const;
const categoryIcons: Record<(typeof categories)[number], PixelIconName> = { 全部: 'target', 基础岗位: 'career', 办公室: 'profile', 技术: 'chart', 销售: 'tag', 服务: 'cup', 管理: 'users', 兼职: 'clock' };
const stateIcons: Record<(typeof states)[number], PixelIconName> = { 全部: 'target', 符合条件: 'spark', 接近条件: 'clock', 已申请: 'mail', 冷却中: 'calendar' };
const regionOptions = [
  { value: 'all', label: '全部地区' },
  { value: 'location.central', label: '中央区' },
  { value: 'location.riverside', label: '临江区' },
  { value: 'location.industrial', label: '北部产业区' },
  { value: 'location.old-town', label: '旧城文化区' },
  { value: 'location.south-residential', label: '南岸居住区' },
  { value: 'location.tech-park', label: '澄川科技园' },
] as const;
const salaryOptions = [
  { value: 'all', label: '全部薪资' },
  { value: 'entry', label: '¥0–¥200' },
  { value: 'mid', label: '¥201–¥500' },
  { value: 'high', label: '¥501+' },
] as const;
const durationOptions = [
  { value: 'all', label: '全部时长' },
  { value: 'full_time', label: '正式岗位' },
  { value: 'repeatable_side_job', label: '长期兼职' },
  { value: 'gig', label: 'Gig' },
] as const;
type CareerTab = 'current' | 'market' | 'opportunities' | 'applications' | 'side-jobs' | 'history' | 'mobility';
const categoryMap: Record<string, string> = { 基础岗位: 'basic', 办公室: 'office', 技术: 'technical', 销售: 'sales', 服务: 'service', 管理: 'management' };

const money = (amount: number) => '¥' + Math.round(amount).toLocaleString('zh-CN');
const companyName = (id: string) => displayContentName(id, contentRegistry.companies ?? [], '招聘公司');
const jobArtByCategory: Record<string, PixelIllustrationName> = {
  basic: 'job-shop', office: 'job-office', technical: 'job-office', sales: 'job-manager', service: 'job-shop', management: 'job-manager',
};
const jobArtById: Record<string, PixelIllustrationName> = {
  'job.seed-shop-clerk': 'job-shop',
  'job.seed-warehouse': 'job-warehouse',
  'job.order-operations-assistant': 'job-office',
  'job.huanliu-warehouse-assistant': 'job-logistics',
  'job.huanliu-dispatch-coordinator': 'job-manager',
  'job.customer-experience-assistant': 'job-shop',
  'job.cafe-assistant': 'job-shop',
  'job.delivery-shift': 'job-logistics',
  'job.seed-office': 'job-office',
  'job.customer-service': 'job-shop',
  'job.data-entry': 'job-office',
  'job.seed-remote': 'job-office',
  'job.photography-assistant-gig': 'camera',
  'job.travel-product-assistant': 'mountain',
  'job.research-assistant': 'chart',
  'job.course-operations-assistant': 'book',
  'job.learning-consultant': 'users',
};
export const jobArtFor = (job: JobDefinition): PixelIllustrationName => {
  const directArt = jobArtById[job.id];
  if (directArt) return directArt;
  const tags = new Set([...(job.tags ?? []), ...(job.experienceTags ?? [])]);
  if (tags.has('management')) return 'job-manager';
  if (tags.has('logistics')) return 'job-logistics';
  if (tags.has('remote') || tags.has('office')) return 'job-office';
  if (tags.has('customer_service') || job.name.includes('店员')) return 'job-shop';
  if (employmentKind(job) === 'gig' || job.kind === 'temporary') return 'bag';
  return jobArtByCategory[job.category ?? job.kind] ?? 'career-market';
};
const applicationStatusLabels: Record<string, string> = { submitted: '已提交', screening: '筛选中', interview: '面试中', waiting: '等待结果', rejected: '未通过', offer: 'Offer 待回复', accepted: '已接受', withdrawn: '已撤回', expired: '已过期' };

export function CareerView({ game, dispatch, jobs, onNavigate, onOpenTools }: { game: GameState; dispatch: (action: GameAction) => void; jobs: readonly JobDefinition[]; onNavigate?: (view: ViewId) => void; onOpenTools?: () => void }) {
  const [tab, setTab] = useState<CareerTab>('market');
  const labels: Record<CareerTab, string> = { current: '当前工作', market: '招聘市场', opportunities: '工作机会', applications: '我的申请', 'side-jobs': '我的兼职', history: '职业履历', mobility: '跨行业' };
  return <section className={tab === 'market' ? 'career-section market-mode' : 'career-section'}>
    <div className="section-heading compact"><div><span className="eyebrow">职业</span><h1>{labels[tab]}</h1></div><p>公开招聘和特殊机会分开；所有申请、Offer 与兼职资格都有明确状态。</p></div>
    {tab !== 'market' && <div className="filter-row" aria-label="职业导航">{Object.entries(labels).map(([id, label]) => <button key={id} className={tab === id ? 'filter-button selected' : 'filter-button'} onClick={() => setTab(id as CareerTab)}>{label}</button>)}</div>}
    {tab === 'current' && <><CareerProgress game={game} /><CurrentEmployment game={game} jobs={jobs} dispatch={dispatch} /></>}
    {tab === 'market' && <><VacancyMarket game={game} jobs={jobs} dispatch={dispatch} labels={labels} onOpenTab={(next) => setTab(next)} onOpenTools={onOpenTools} /><CareerBottomPanels game={game} jobs={jobs} onOpenTab={(next) => setTab(next)} /></>}
    {tab === 'opportunities' && <OpportunityList game={game} jobs={jobs} dispatch={dispatch} />}
    {tab === 'applications' && <ApplicationList game={game} jobs={jobs} dispatch={dispatch} onNavigate={onNavigate} />}
    {tab === 'side-jobs' && <SideJobList game={game} jobs={jobs} dispatch={dispatch} />}
    {tab === 'history' && <HistoryList game={game} jobs={jobs} />}
    {tab === 'mobility' && <MobilityPanel game={game} jobs={jobs} onNavigate={onNavigate} />}
  </section>;
}

function MobilityPanel({ game, jobs, onNavigate }: { game: GameState; jobs: readonly JobDefinition[]; onNavigate?: (view: ViewId) => void }) {
  const entries = buildMobilityEntries({ jobs }, game, 6);
  return <section className="detail-panel" aria-label="跨行业流动"><div className="section-heading compact"><div><span className="eyebrow">跨行业流动 · 不设硬性壁垒</span><h2>换行业的距离</h2></div><p>这里如实列出你与若干其他行业岗位之间的差距，以及你已经带走的经验；不同行业的经历不会清零，积累会一直有效。</p></div>{entries.length === 0 ? <p className="muted">当前条件已经覆盖大多数公开岗位。</p> : <div className="item-list">{entries.map(({ job, experienceGaps, statGaps, transferableStrengths }) => <div className="item-row" key={job.id}><div><h3>{job.name}</h3>{transferableStrengths.length > 0 && <p className="muted">可迁移基础：{transferableStrengths.join('、')}</p>}<div className="requirement-box">{[...experienceGaps.map((hint) => hint.label + (hint.currentValue !== undefined && hint.requiredValue !== undefined ? `（${hint.currentValue}/${hint.requiredValue}）` : '')), ...statGaps].map((label) => <strong key={label}>还差 · {label}</strong>)}</div></div><div className="button-pair"><button className="text-button" onClick={() => onNavigate?.('work')}>去工作积累</button></div></div>)}</div>}</section>;
}

function CurrentEmployment({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const job = jobs.find((entry) => entry.id === game.employment?.jobId);
  if (!job) return <div className="detail-panel"><h2>暂无正式工作</h2><p>你可以在招聘市场申请公开职位。</p></div>;
  const pay = game.employment?.basePay ?? job.basePay;
  return <div className="detail-panel"><h2>{job.name}</h2><p>{job.description}</p><div className="finance-columns"><div><span>基础工资</span><strong>{money(pay)} / 班</strong></div><div><span>个人调整</span><strong>+{money(game.employment?.salaryAdjustment ?? 0)}</strong></div><div><span>谈薪阶段</span><strong>{game.employment?.negotiationStage ?? 0} / 2</strong></div></div><button className="secondary-button" onClick={() => dispatch({ type: 'start_resignation' })}>离开当前工作</button></div>;
}

function CareerProgress({ game }: { game: GameState }) {
  const entries = Object.entries(game.careerExperience ?? {});
  return <section className="detail-panel" aria-label="职业经验与资格"><h2>职业经验与资格</h2>{entries.length ? <div className="item-list">{entries.map(([id, value]) => <div className="item-row" key={id}><div><strong>{careerExperienceLabel(id as Parameters<typeof careerExperienceLabel>[0])}</strong><p>{value} 天 · {careerExperienceStage(value)}</p></div></div>)}</div> : <p className="muted">完成实际工作后，会在这里积累可迁移的职业经验。</p>}<p className="muted">已获得资格：{game.qualifications?.length ? game.qualifications.map((id) => humanizeContentId(id)).join('、') : '暂无'}</p></section>;
}

function VacancyMarket({ game, jobs, dispatch, labels, onOpenTab, onOpenTools }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void; labels: Record<CareerTab, string>; onOpenTab: (tab: CareerTab) => void; onOpenTools?: () => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [state, setState] = useState<(typeof states)[number]>('全部');
  const [sort, setSort] = useState<(typeof sorts)[number]>('匹配度');
  const [region, setRegion] = useState<(typeof regionOptions)[number]['value']>('all');
  const [salaryBand, setSalaryBand] = useState<(typeof salaryOptions)[number]['value']>('all');
  const [duration, setDuration] = useState<(typeof durationOptions)[number]['value']>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(game.vacancies?.[0]?.vacancyId);
  const [page, setPage] = useState(0);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageSize = 6;
  const vacancyRows = useMemo(() => (game.vacancies ?? []).map((vacancy) => ({ vacancy, job: jobs.find((job) => job.id === vacancy.jobId) })).filter((row) => row.job), [game.vacancies, jobs]);
  const filterCounts = useMemo(() => {
    const category: Record<string, number> = Object.fromEntries(categories.map((entry) => [entry, 0]));
    const state: Record<string, number> = Object.fromEntries(states.map((entry) => [entry, 0]));
    for (const { vacancy, job } of vacancyRows) {
      const application = game.applications?.find((entry) => entry.vacancyId === vacancy.vacancyId);
      const eligible = isJobEligible(job!, game, contentRegistry, balanceConfig);
      const close = !eligible && (job!.abilityRequired ?? 0) - game.ability <= 5 && (job!.reputationRequired ?? 0) - game.reputation <= 5;
      const cooldown = applicationCooldownRemaining(game, job!.id, vacancy.companyId) > 0;
      const categoryMatches = (entry: (typeof categories)[number]) => entry === '全部' || (entry === '兼职' ? employmentKind(job!) !== 'full_time' : job!.category === categoryMap[entry]);
      if (categoryMatches('全部')) category['全部'] += 1;
      for (const entry of categories.slice(1)) if (categoryMatches(entry)) category[entry] += 1;
      state['全部'] += 1;
      if (eligible) state['符合条件'] += 1;
      if (close) state['接近条件'] += 1;
      if (application) state['已申请'] += 1;
      if (cooldown) state['冷却中'] += 1;
    }
    return { category, state };
  }, [game, vacancyRows]);
  const rows = useMemo(() => vacancyRows.filter((row) => {
    const job = row.job!;
    const application = game.applications?.find((entry) => entry.vacancyId === row.vacancy.vacancyId);
    const eligible = isJobEligible(job, game, contentRegistry, balanceConfig);
    const close = !eligible && (job.abilityRequired ?? 0) - game.ability <= 5 && (job.reputationRequired ?? 0) - game.reputation <= 5;
    const cooldown = applicationCooldownRemaining(game, job.id, row.vacancy.companyId) > 0;
    const categoryMatches = category === '全部' || (category === '兼职' ? employmentKind(job) !== 'full_time' : job.category === categoryMap[category]);
    const stateMatches = state === '全部' || (state === '符合条件' && eligible) || (state === '接近条件' && close) || (state === '已申请' && Boolean(application)) || (state === '冷却中' && Boolean(cooldown));
    const company = contentRegistry.companies?.find((entry) => entry.id === row.vacancy.companyId);
    const regionMatches = region === 'all' || company?.locationId === region;
    const maxSalary = row.vacancy.salaryRange[1];
    const minSalary = row.vacancy.salaryRange[0];
    const salaryMatches = salaryBand === 'all'
      || (salaryBand === 'entry' && maxSalary <= 200)
      || (salaryBand === 'mid' && maxSalary > 200 && minSalary <= 500)
      || (salaryBand === 'high' && minSalary > 500);
    const durationMatches = duration === 'all' || employmentKind(job) === duration;
    return categoryMatches && stateMatches && regionMatches && salaryMatches && durationMatches && (job.name + companyName(row.vacancy.companyId)).toLowerCase().includes(query.toLowerCase());
  }).sort((left, right) => sort === '薪资最高' ? right.vacancy.salaryRange[1] - left.vacancy.salaryRange[1] : sort === '截止最早' ? left.vacancy.expiresDay - right.vacancy.expiresDay : left.job!.name.localeCompare(right.job!.name, 'zh-CN')), [category, duration, game, query, region, salaryBand, sort, state, vacancyRows]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selected = pagedRows.find((row) => row.vacancy.vacancyId === selectedId) ?? pagedRows[0] ?? rows[0];
  const goPage = (next: number) => setPage(Math.max(0, Math.min(pageCount - 1, next)));
  const openCareerPage = (next: CareerTab) => {
    setPageMenuOpen(false);
    onOpenTab(next);
  };
  return <div className="career-market-shell" role="region" aria-label="招聘市场布局">
     <aside className="career-filters"><div className="career-market-identity"><div className="career-market-identity-main"><PixelIllustration name="career-market" size={32} className="career-market-identity-mark" aria-hidden="true" /><div className="career-market-identity-copy"><span className="eyebrow">职业</span><h1>招聘市场</h1><p>发现你的下一份机会</p></div></div>{onOpenTools && <button type="button" className="career-tools-heading-trigger" onClick={onOpenTools}>安排本周与课程</button>}<div className="career-market-navigation"><button type="button" className="career-page-menu-trigger" aria-expanded={pageMenuOpen} aria-controls="career-page-menu" onClick={() => setPageMenuOpen((open) => !open)}>职业页面</button>{pageMenuOpen && <nav id="career-page-menu" className="career-page-menu" aria-label="职业页面导航">{Object.entries(labels).map(([id, label]) => <button key={id} type="button" className={id === 'market' ? 'filter-button selected' : 'filter-button'} onClick={() => openCareerPage(id as CareerTab)}>{label}</button>)}</nav>}</div></div><label className="career-search-field"><span>搜索岗位 / 公司</span><span className="career-search-control"><input aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位 / 公司 / 关键词" /><PixelIcon name="search" size={14} aria-hidden="true" /></span></label><strong>岗位类型</strong>{categories.map((entry) => <button type="button" key={entry} data-filter-group="category" className={category === entry ? 'filter-button career-filter-option selected' : 'filter-button career-filter-option'} onClick={() => setCategory(entry)}><PixelIcon name={categoryIcons[entry]} size={14} /><span>{entry}</span><b className="career-filter-count">{filterCounts.category[entry]}</b></button>)}<strong>申请状态</strong>{states.map((entry) => <button type="button" key={entry} data-filter-group="state" className={state === entry ? 'filter-button career-filter-option selected' : 'filter-button career-filter-option'} onClick={() => setState(entry)}><PixelIcon name={stateIcons[entry]} size={14} /><span>{entry}</span><b className="career-filter-count">{filterCounts.state[entry]}</b></button>)}</aside>
     <div className="career-results"><div className="career-toolbar"><div className="career-market-filters" aria-label="招聘筛选">{[ ['地区', region, regionOptions, setRegion], ['薪资范围', salaryBand, salaryOptions, setSalaryBand], ['时长', duration, durationOptions, setDuration] ].map(([label, value, options, setValue]) => <label className="career-toolbar-select" key={label as string}><span>{label as string}</span><select aria-label={label as string} value={value as string} onChange={(event) => { (setValue as (next: string) => void)(event.target.value); setPage(0); }}>{(options as readonly { value: string; label: string }[]).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}</div><div className="career-toolbar-actions">
       <details className="career-toolbar-popover career-sort-popover">
         <summary aria-label={`招聘排序：${sort}`}><PixelAction label="排序" /></summary>
         <div className="career-toolbar-menu" role="menu" aria-label="招聘排序选项">
           {sorts.map((entry) => <button type="button" role="menuitem" key={entry} aria-label={entry} className={entry === sort ? 'selected' : undefined} onClick={(event) => { setSort(entry); setPage(0); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{entry}{entry === sort && <span aria-hidden="true">✓</span>}</button>)}
         </div>
       </details>
       <details className="career-toolbar-popover career-filter-popover">
         <summary aria-label="打开招聘筛选">筛选 <PixelIcon name="target" size={12} aria-hidden="true" /></summary>
         <div className="career-toolbar-menu career-filter-menu" aria-label="招聘快捷筛选">
           <span className="career-menu-label">岗位类型</span>
           <div className="career-quick-filter-group" role="group" aria-label="岗位类型快捷筛选">
             {categories.map((entry) => <button type="button" key={entry} aria-label={entry} className={category === entry ? 'selected' : undefined} onClick={(event) => { setCategory(entry); setPage(0); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{entry}<b>{filterCounts.category[entry]}</b></button>)}
           </div>
           <span className="career-menu-label">申请状态</span>
           <div className="career-quick-filter-group" role="group" aria-label="申请状态快捷筛选">
             {states.map((entry) => <button type="button" key={entry} aria-label={entry} className={state === entry ? 'selected' : undefined} onClick={(event) => { setState(entry); setPage(0); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{entry}<b>{filterCounts.state[entry]}</b></button>)}
           </div>
         </div>
       </details>
     </div><strong className="career-toolbar-count">共 {rows.length} 个机会</strong></div><div className="job-grid">{pagedRows.map(({ vacancy, job }) => <VacancyCard key={vacancy.vacancyId} game={game} vacancy={vacancy} job={job!} dispatch={dispatch} selected={vacancy.vacancyId === selected?.vacancy.vacancyId} onSelect={() => setSelectedId(vacancy.vacancyId)} />)}</div>
      {pageCount > 1 && <div className="pager-row" role="navigation" aria-label="岗位列表分页">
        <span className="pager-fill" aria-hidden="true" />
        <button type="button" className="pager-arrow" disabled={safePage === 0} onClick={() => goPage(safePage - 1)} aria-label="上一页">‹</button>
        {Array.from({ length: pageCount }, (_, i) => <button type="button" key={i} className={i === safePage ? 'pager-num selected' : 'pager-num'} onClick={() => goPage(i)}>{i + 1}</button>)}
        <button type="button" className="pager-arrow" disabled={safePage >= pageCount - 1} onClick={() => goPage(safePage + 1)} aria-label="下一页">›</button>
        <span className="pager-fill right" aria-hidden="true" />
      </div>}
    </div>
    <aside className="career-detail inverse pixel-corners" aria-label="岗位详情">{selected ? <VacancyDetail game={game} vacancy={selected.vacancy} job={selected.job!} dispatch={dispatch} /> : <p className="muted">当前筛选下没有岗位。</p>}</aside>
  </div>;
}

function VacancyCard({ game, vacancy, job, dispatch, selected, onSelect }: { game: GameState; vacancy: any; job: any; dispatch: (action: GameAction) => void; selected?: boolean; onSelect?: () => void }) {
  const application = game.applications?.find((entry) => entry.vacancyId === vacancy.vacancyId);
  const acquired = game.acquiredSideJobs?.[job.id];
  const eligible = isJobEligible(job, game, contentRegistry, balanceConfig);
  const { schedule, notice } = useWeekScheduler(game, dispatch);
  const durationMinutes = sideJobDurationMinutes(job);
  const schedulable = Boolean(acquired)
    && game.simulationMode !== 'running'
    && game.simulationMode !== 'event'
    && game.simulationMode !== 'reward'
    && findNextSchedulableSlot({ weekday: game.calendar.weekday, slot: 'evening', activity: { kind: 'side_job', jobId: job.id, durationMinutes } }, game, contentRegistry, balanceConfig, { from: 'current' }).found;
  const company = contentRegistry.companies?.find((entry) => entry.id === vacancy.companyId);
  const location = company?.locationId ? displayContentName(company.locationId, contentRegistry.locations ?? [], '工作地点') : '地点未注明';
  const employmentLabel = employmentKind(job) === 'full_time' ? '正式岗位' : employmentKind(job) === 'gig' ? 'Gig' : '长期兼职';
  // 当前/待入职岗位在市场里提前表达为非交互状态；engine 的 currentJobConflict 保护仍保留。
  const currentJobHere = job.id === game.currentJobId || job.id === game.employment?.jobId;
  const pendingJobHere = !currentJobHere && job.id === game.employment?.pendingJobId;
  const missingRequirementSummary = !eligible ? requirementHints(job, game, contentRegistry, balanceConfig).map((hint) => hint.label).join(' · ') : '';
  const statusLabel = currentJobHere ? '现任职于此' : pendingJobHere ? '已接受待入职' : acquired ? '已获得' : application ? displayMappedLabel(application.status, applicationStatusLabels) : eligible ? '符合条件' : '还需准备';
  const statusNote = currentJobHere ? '这是你当前的工作' : pendingJobHere ? '等待入职生效' : acquired ? '可安排到本周' : application ? '申请已进入流程' : eligible ? '可以申请这份工作' : '查看详情了解准备项';
  return <article className={selected ? 'job-card selected' : 'job-card'} data-catalog-card><button className="card-select" onClick={onSelect} aria-label={`查看岗位详情：${job.name}`}><div className="career-card-art"><PixelIllustration name={jobArtFor(job)} size={76} /></div><div className="job-card-identity"><div className="job-card-head"><span className="job-kind">{job.category ?? '岗位'}</span></div><h2>{job.name}</h2><span className="job-company">{companyName(vacancy.companyId)}</span></div></button><div className="job-facts" aria-label="岗位关键信息"><span className="job-fact" data-fact="salary"><PixelIcon name="cash" size={13} /><span>{money(vacancy.salaryRange[0])}–{money(vacancy.salaryRange[1])} / 班</span></span><span className="job-fact" data-fact="type"><PixelIcon name="career" size={13} /><span>{employmentLabel}</span></span><span className="job-fact" data-fact="location"><PixelIcon name="city" size={13} /><span>{location}</span></span></div><p className="job-card-description">{job.description}</p>{notice && <p className="planner-notice" role="status">{notice}</p>}<div className="job-actions"><span className="job-card-status" aria-label="岗位状态"><strong className={currentJobHere || pendingJobHere || eligible || acquired ? 'requirement-ok' : 'requirement-missing'}>{statusLabel}</strong><small>{statusNote}</small></span>{currentJobHere || pendingJobHere ? <button className="primary-button" disabled aria-label={currentJobHere ? `现任职于此：${job.name}` : `已接受待入职：${job.name}`}>{currentJobHere ? '现任职于此' : '已接受待入职'}</button> : acquired ? <button className="secondary-button" disabled={!schedulable} onClick={() => schedule({ kind: 'side_job', jobId: job.id, durationMinutes }, { label: job.name })}>安排到本周</button> : <button className="primary-button" disabled={!eligible || Boolean(application)} onClick={() => dispatch({ type: 'submit_application', vacancyId: vacancy.vacancyId })}>{application ? '已申请' : '申请职位'}</button>}</div>{missingRequirementSummary && <span className="sr-only" aria-label="岗位准备项">{missingRequirementSummary}</span>}</article>;
}

function VacancyDetail({ game, vacancy, job, dispatch }: { game: GameState; vacancy: any; job: JobDefinition; dispatch: (action: GameAction) => void }) {
  const hints = requirementHints(job, game, contentRegistry, balanceConfig);
  const application = game.applications?.find((entry) => entry.vacancyId === vacancy.vacancyId);
  const eligible = isJobEligible(job, game, contentRegistry, balanceConfig);
  const recruiterId = job.recruiterCharacterId ?? job.recruitment?.recruiterCharacterId;
  const recruiter = recruiterId ? contentRegistry.characters.find((character) => character.id === recruiterId) : undefined;
  const abilityTarget = job.abilityRequired;
  const reputationTarget = job.reputationRequired;
  const abilityMatch = abilityTarget === undefined || abilityTarget === 0 ? 100 : Math.min(100, Math.round((game.ability / abilityTarget) * 100));
  const reputationMatch = reputationTarget === undefined || reputationTarget === 0 ? 100 : Math.min(100, Math.round((game.reputation / reputationTarget) * 100));
  const matchPercent = Math.max(0, Math.min(100, Math.round((abilityMatch + reputationMatch) / 2)));
  const routeLabel = vacancy.route === 'referral' ? '人物推荐' : vacancy.route === 'internal' ? '内部转岗' : vacancy.route === 'headhunter' ? '猎头机会' : vacancy.route === 'story' ? '剧情机会' : '公开投递';
  // 门槛读数用明确的比较语义："58 ≥ 10 · 已满足"，避免 "58/10" 被误读成"满分 10"。
  const conditionReading = (current: number, target: number | undefined) => target === undefined || target === 0
    ? '无要求'
    : current >= target ? `${current} ≥ ${target} · 已满足` : `${current} / ${target}（还差 ${target - current}）`;
  const currentJobHere = job.id === game.currentJobId || job.id === game.employment?.jobId;
  const pendingJobHere = !currentJobHere && job.id === game.employment?.pendingJobId;
  return <><span className="job-kind">岗位详情</span><div className="career-detail-visual" aria-hidden="true"><PixelIllustration name={jobArtFor(job)} size={72} /><span>{job.category ?? '岗位'} · 岗位画像</span></div><div className="career-detail-title">{job.name}</div><p>{companyName(vacancy.companyId)}</p><div className="detail-facts"><span>薪资</span><strong>{money(vacancy.salaryRange[0])}–{money(vacancy.salaryRange[1])}</strong><span>类型</span><strong>{employmentKind(job) === 'full_time' ? '正式岗位' : employmentKind(job) === 'gig' ? 'Gig' : '长期兼职'}</strong><span>截止</span><strong>第 {vacancy.expiresDay} 天</strong></div><section><h3>任职要求</h3>{hints.length ? hints.map((hint) => <div className="requirement-line" key={hint.requirementId}><span>{hint.label}</span><strong>{hint.currentValue !== undefined ? `${hint.currentValue}/${hint.requiredValue}` : '未满足'}</strong></div>) : <p className="requirement-ok">当前条件已满足</p>}</section><section><h3>当前条件</h3><div className="career-condition-meter"><span>能力</span><SegmentMeter value={Math.min(game.ability, abilityTarget ?? 1)} max={abilityTarget ?? 1} segments={8} label="能力当前条件" /><strong>{conditionReading(game.ability, abilityTarget)}</strong></div><div className="career-condition-meter"><span>声誉</span><SegmentMeter value={Math.min(game.reputation, reputationTarget ?? 1)} max={reputationTarget ?? 1} segments={8} label="声誉当前条件" /><strong>{conditionReading(game.reputation, reputationTarget)}</strong></div><div className="requirement-line"><span>招聘路径</span><strong>{routeLabel}</strong></div></section><section className="career-detail-recruitment"><div className="career-recruiter"><div className="career-recruiter-art"><PixelIllustration name="career-market" size={44} /></div><div><span className="job-kind">招聘人</span><strong>{recruiter?.name ?? '招聘团队'}</strong><small>{recruiter?.identity ?? '用人方'} · 负责这份机会</small></div></div><div className="career-flow"><h3>招聘流程</h3><div className="career-flow-track"><span>投递</span><i><PixelIcon name="arrow-right" size={10} /></i><span>筛选</span><i><PixelIcon name="arrow-right" size={10} /></i><span>面试</span><i><PixelIcon name="arrow-right" size={10} /></i><span>Offer</span></div><small>{job.recruitment?.offerText ?? '符合条件后，会进入真实的申请与反馈流程。'}</small></div></section><div className="career-detail-apply-bar"><div className="career-detail-match"><div><span>匹配度</span><strong>{matchPercent}%</strong><div className="meter"><i style={{ width: `${matchPercent}%` }} /></div></div><p>{currentJobHere ? '这就是你当前的工作，无需再次申请。' : pendingJobHere ? '这份岗位已接受，等待入职生效。' : application ? `当前状态：${displayMappedLabel(application.status, offerStatusLabels)}` : eligible ? '基本符合，建议投递并进入招聘流程。' : '还有准备空间；先完成上方提示，匹配度会继续提高。'}</p></div><button className="primary-button full" disabled={!eligible || Boolean(application) || currentJobHere || pendingJobHere} onClick={() => dispatch({ type: 'submit_application', vacancyId: vacancy.vacancyId })}>{currentJobHere ? '现任职于此' : pendingJobHere ? '已接受待入职' : application ? `申请状态：${displayMappedLabel(application.status, offerStatusLabels)}` : '申请岗位'}</button></div></>;
}

function OpportunityList({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const opportunities = game.opportunities ?? [];
  const gigs = game.gigs ?? [];
  if (!opportunities.length && !gigs.length) return <p className="muted">目前没有特殊工作机会。人物推荐、内部转岗、猎头和剧情机会会在这里出现。</p>;
  return <div className="job-grid">{gigs.map((gig) => { const job = jobs.find((entry) => entry.id === gig.jobId); return <article className="job-card" key={gig.id}><span className="job-kind">一次性 Gig · {gig.source}</span><h2>{job?.name ?? humanizeContentId(gig.jobId)}</h2><p>执行期限：第 {gig.validFromDay}–{gig.expiresDay} 天 · 结算 {money(gig.pay)}</p><button className="primary-button" onClick={() => dispatch({ type: 'execute_gig', gigId: gig.id })}>执行一次</button></article>; })}{opportunities.map((opportunity) => { const job = jobs.find((entry) => entry.id === opportunity.jobId); return <article className="job-card" key={opportunity.id}><span className="job-kind">{opportunity.source}</span><h2>{job?.name ?? humanizeContentId(opportunity.jobId)}</h2><p>限时至第 {opportunity.expiresDay} 天</p><button className="primary-button" onClick={() => dispatch({ type: 'submit_application', opportunityId: opportunity.id })}>申请机会</button></article>; })}</div>;
}

/**
 * "我的申请" shows actionable applications first; finished ones move into a
 * separate history block that can be cleared. Clearing is display-only — the
 * re-application cooldown lives in `applicationCooldowns`, not in these rows.
 */
function ApplicationList({ game, jobs, dispatch, onNavigate }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void; onNavigate?: (view: ViewId) => void }) {
  const [historyOpen, setHistoryOpen] = useState(true);
  const active = activeApplications(game);
  const terminal = [...terminalApplications(game)].reverse();
  return <><div className="item-list">{active.length ? active.map((application) => {
    const job = jobs.find((entry) => entry.id === application.jobId);
    const offerExpires = application.status === 'offer' && application.offerExpiresDay !== undefined ? ` · 有效至第 ${application.offerExpiresDay} 天（含当天）` : '';
    return <div className="item-row" key={application.applicationId}><div><h2>{job?.name ?? humanizeContentId(application.jobId)}</h2><p>当前竞争力：{application.competitivenessTier} · {application.feedback.join('；') || '等待反馈'}</p><span className="muted">状态：{displayMappedLabel(application.status, applicationStatusLabels)}{offerExpires}</span>{application.status === 'rejected' && job && <div className="requirement-box"><strong>下一步</strong>{requirementHints(job, game, contentRegistry, balanceConfig).map((hint) => <button className="text-button" key={hint.requirementId} onClick={() => onNavigate?.(hint.destinationView)}>{hint.actionLabel} · {hint.label}{hint.currentValue !== undefined && hint.requiredValue !== undefined ? `（${hint.currentValue}/${hint.requiredValue}）` : ''}</button>)}</div>}</div><div className="button-pair">{application.status === 'offer' && <><button className="primary-button" onClick={() => dispatch({ type: 'accept_application_offer', applicationId: application.applicationId })}>接受 Offer</button><button className="secondary-button" onClick={() => dispatch({ type: 'decline_application_offer', applicationId: application.applicationId })}>拒绝</button></>}{['submitted', 'screening', 'interview', 'waiting'].includes(application.status) && <button className="secondary-button" onClick={() => dispatch({ type: 'withdraw_application', applicationId: application.applicationId })}>撤回</button>}</div></div>;
  }) : <p className="muted">当前没有进行中的申请。</p>}</div>
    {terminal.length > 0 && <section className="detail-panel" aria-label="已结束申请">
      <div className="section-heading compact"><div><span className="eyebrow">历史记录</span><h3>已结束申请（{terminal.length}）</h3></div><div className="button-pair"><button className="text-button" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? '收起' : '展开'}</button><button className="text-button" onClick={() => dispatch({ type: 'clear_terminal_applications' })}>清除全部结束申请</button></div></div>
      {historyOpen && <div className="item-list">{terminal.map((application) => <TerminalApplicationRow key={application.applicationId} game={game} application={application} jobs={jobs} dispatch={dispatch} onNavigate={onNavigate} />)}</div>}
      <p className="muted">清除历史不会影响再次申请的等待时间。</p>
    </section>}
  </>;
}

function TerminalApplicationRow({ game, application, jobs, dispatch, onNavigate }: { game: GameState; application: JobApplicationState; jobs: readonly any[]; dispatch: (action: GameAction) => void; onNavigate?: (view: ViewId) => void }) {
  const job = jobs.find((entry) => entry.id === application.jobId);
  // A rejection keeps its "what to fix next" hints even after it moves to history.
  const hints = application.status === 'rejected' && job ? requirementHints(job, game, contentRegistry, balanceConfig) : [];
  return <div className="item-row"><div><h2>{job?.name ?? humanizeContentId(application.jobId)}</h2><span className="muted">状态：{displayMappedLabel(application.status, applicationStatusLabels)} · 第 {application.submittedDay} 天提交</span>{hints.length > 0 && <div className="requirement-box"><strong>下一步</strong>{hints.map((hint) => <button className="text-button" key={hint.requirementId} onClick={() => onNavigate?.(hint.destinationView)}>{hint.actionLabel} · {hint.label}{hint.currentValue !== undefined && hint.requiredValue !== undefined ? `（${hint.currentValue}/${hint.requiredValue}）` : ''}</button>)}</div>}</div><button className="text-button" onClick={() => dispatch({ type: 'dismiss_terminal_application', applicationId: application.applicationId })}>清除记录</button></div>;
}

function SideJobList({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const entries = Object.values(game.acquiredSideJobs ?? {});
  const { schedule, notice } = useWeekScheduler(game, dispatch);
  const busy = game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward';
  return entries.length ? <>{notice && <p className="planner-notice" role="status">{notice}</p>}<div className="item-list">{entries.map((entry) => { const job = jobs.find((candidate) => candidate.id === entry.jobId); if (!job) return null; const durationMinutes = sideJobDurationMinutes(job); const schedulable = !busy && findNextSchedulableSlot({ weekday: game.calendar.weekday, slot: 'evening', activity: { kind: 'side_job', jobId: job.id, durationMinutes } }, game, contentRegistry, balanceConfig, { from: 'current' }).found; return <div className="item-row" key={entry.jobId}><div><h2>{job.name}</h2><p>已获得长期兼职资格；安排后会在周计划自动执行，并计入兼职收入、经验和职业记录。</p></div><div className="button-pair"><span className="current-label">已获得</span><button className="secondary-button" disabled={!schedulable} onClick={() => schedule({ kind: 'side_job', jobId: job.id, durationMinutes }, { label: job.name })}>安排到本周</button></div></div>; })}</div></> : <p className="muted">通过招聘市场获得的长期兼职会在这里出现。</p>;
}

/** Long-term side jobs use the same duration normalisation as the planner. */
function sideJobDurationMinutes(job: { hours?: number }): 60 | 120 | 180 | 240 {
  const minutes = Math.max(60, (job.hours ?? 2) * 60);
  return (CANONICAL_DURATIONS.filter((duration) => duration <= 240 && duration >= minutes)[0] ?? 240) as 60 | 120 | 180 | 240;
}

function HistoryList({ game, jobs }: { game: GameState; jobs: readonly any[] }) {
  return (game.employmentHistory ?? []).length ? <div className="item-list">{game.employmentHistory!.map((entry) => <div className="item-row" key={entry.jobId + (entry.endedDay ?? 0)}><div><h2>{displayContentName(entry.jobId, jobs, '职业')}</h2><p>{entry.migrated ? '旧存档开始前已任职' : `${entry.startedDay === undefined ? '游戏开始前' : `第 ${entry.startedDay} 天`}至第 ${entry.endedDay ?? game.time.day} 天`}{entry.reason ? ` · ${entry.reason}` : ''}</p></div><strong>{money(entry.finalPay)} / 班</strong></div>)}</div> : <p className="muted">职业履历会在换岗或离职后出现。</p>;
}

const offerStatusLabels: Record<string, string> = { submitted: '已提交', screening: '筛选中', interview: '面试中', waiting: '等待结果', rejected: '未通过', offer: 'Offer 待回复', accepted: '已接受', withdrawn: '已撤回', expired: '已过期' };

function CareerBottomPanels({ game, jobs, onOpenTab }: { game: GameState; jobs: readonly any[]; onOpenTab: (tab: 'applications' | 'history' | 'mobility') => void }) {
  const moneyFmt = (amount: number) => '¥' + Math.round(amount).toLocaleString('zh-CN');
  const applications = activeApplications(game).slice(-3).reverse();
  const offers = activeApplications(game).filter((application) => application.status === 'offer').slice(0, 3);
  const history = [...(game.employmentHistory ?? [])].reverse().slice(0, 2);
  const vacancies = game.vacancies ?? [];
  // Market insight reads the live vacancy board: which industries are hiring,
  // where the pay is, and how many postings are actually new. Every number is
  // derived from the open vacancies and their companies — nothing is authored.
  const industryBuckets = new Map<string, { count: number; salaryTotal: number }>();
  for (const vacancy of vacancies) {
    const industry = contentRegistry.companies?.find((entry) => entry.id === vacancy.companyId)?.industry ?? '其他';
    const bucket = industryBuckets.get(industry) ?? { count: 0, salaryTotal: 0 };
    bucket.count += 1;
    bucket.salaryTotal += vacancy.salaryRange[0];
    industryBuckets.set(industry, bucket);
  }
  const industryStats = [...industryBuckets.entries()].map(([industry, bucket]) => ({
    industry,
    // Compound industries read as "汽车销售 / 汽车服务"; the chip keeps the
    // primary name and leaves the full wording to the accessible title.
    short: industry.split(' / ')[0],
    count: bucket.count,
    average: Math.round(bucket.salaryTotal / bucket.count),
  }));
  const hotIndustries = [...industryStats]
    .sort((left, right) => right.count - left.count || left.industry.localeCompare(right.industry, 'zh-CN'))
    // The reference lane fits about eleven CJK characters of tags; keep adding
    // the busiest industries while they still fit instead of clipping one.
    .reduce<typeof industryStats>((kept, entry) => {
      const used = kept.reduce((total, item) => total + item.short.length, 0);
      return used + entry.short.length <= 11 ? [...kept, entry] : kept;
    }, []);
  const highestPayingIndustries = [...industryStats].sort((left, right) => right.average - left.average || right.count - left.count).slice(0, 3);
  const newThisWeek = vacancies.filter((vacancy) => vacancy.publishedDay > game.time.day - 7).length;
  const panels = [
    {
      key: 'applications', icon: 'mail' as const, title: '我的申请', count: activeApplications(game).length,
      rows: applications.map((application) => ({ label: jobs.find((job) => job.id === application.jobId)?.name ?? humanizeContentId(application.jobId), value: displayMappedLabel(application.status, offerStatusLabels) })),
      empty: '还没有提交任何申请。',
      emptyIllustration: 'mail' as const,
      emptyHint: '去招聘市场申请岗位后，状态会在这里更新。',
      action: '全部申请', target: () => onOpenTab('applications'),
    },
    {
      key: 'offers', icon: 'star' as const, title: 'Offer', count: offers.length,
      rows: offers.map((offer) => ({ label: jobs.find((job) => job.id === offer.jobId)?.name ?? humanizeContentId(offer.jobId), value: offer.offerExpiresDay ? `有效至第 ${offer.offerExpiresDay} 天（含当天）` : '等待处理' })),
      empty: '暂无等待回复的 Offer。',
      emptyIllustration: 'tag' as const,
      emptyHint: '申请流程产生 Offer 后，会在这里处理。',
      action: '查看 Offer', target: () => onOpenTab('applications'),
    },
    {
      key: 'history', icon: 'career' as const, title: '职业履历', count: (game.employmentHistory ?? []).length,
      rows: history.map((entry) => ({ label: jobs.find((job) => job.id === entry.jobId)?.name ?? humanizeContentId(entry.jobId), value: `${moneyFmt(entry.finalPay)} / 班` })).slice(0, 3),
      empty: '职业履历会在换岗或离职后出现。',
      emptyIllustration: 'career-market' as const,
      emptyHint: '完成正式工作或离职后，经历会在这里留下记录。',
      action: '完整履历', target: () => onOpenTab('history'),
    },
    {
      key: 'insight', icon: 'chart' as const, title: '市场洞察', count: vacancies.length,
      rows: [
        { label: '热门行业', value: hotIndustries.map((entry) => entry.short).join(' / ') },
        { label: '高薪趋势', value: highestPayingIndustries.map((entry) => entry.short).join(' > ') },
        { label: '机会趋势', value: `本周新增 ${newThisWeek} 个岗位` },
      ],
      empty: '',
      emptyIllustration: 'chart' as const,
      emptyHint: '',
      action: '跨行业距离', target: () => onOpenTab('mobility'),
    },
  ];
  return <div className="career-bottom-panels" aria-label="求职支持面板">
    {panels.map((panel) => <article className={`pixel-panel secondary career-bottom-panel career-bottom-${panel.key}`} key={panel.key}>
      <header className="inbox-head"><PixelIcon name={panel.icon} size={18} data-panel-icon={panel.icon} /><h2>{panel.title}</h2>{panel.count > 0 && <b className="inbox-count">{panel.count}</b>}</header>
      {panel.key === 'insight' ? vacancies.length ? <div className="career-insight-body" aria-label="市场机会概览">
        <div className="career-insight-row">
          <span>热门行业</span>
          <div className="career-insight-chips">{hotIndustries.map((entry) => <b key={entry.industry} title={entry.industry}>{entry.short}</b>)}</div>
        </div>
        <div className="career-insight-row">
          <span>高薪趋势</span>
          <div className="career-insight-chain">{highestPayingIndustries.flatMap((entry, index) => index === 0
            ? [<b key={entry.industry} title={entry.industry}>{entry.short}</b>]
            : [<i key={`${entry.industry}-sep`}>&gt;</i>, <b key={entry.industry} title={entry.industry}>{entry.short}</b>])}</div>
        </div>
        <div className="career-insight-row">
          <span>机会趋势</span>
          <div className="career-insight-trend">
            <p>本周新增 <strong>{newThisWeek}</strong> 个岗位</p>
            <PixelIllustration name="chart" size={22} aria-hidden="true" />
          </div>
        </div>
       </div> : <div className="career-insight-empty" role="img" aria-label="市场洞察空态"><PixelIllustration name="chart" size={42} aria-hidden="true" /><strong>本期暂无公开机会</strong><small>市场刷新后，这里会显示机会数量与起薪走势。</small></div> : panel.rows.length ? <ul className="rail-rows compact">{panel.rows.map((row, index) => <li key={`${row.label}-${index}`}><PixelIcon name={panel.icon} size={14} aria-hidden="true" data-support-row-icon={panel.key} /><span>{row.label}</span><small>{row.value}</small></li>)}</ul> : <div className="career-bottom-empty" role="status"><PixelIllustration name={panel.emptyIllustration} size={34} aria-hidden="true" /><strong>{panel.empty}</strong><small>{panel.emptyHint}</small></div>}
      <footer className="inbox-foot"><button onClick={() => panel.target()}><PixelAction label={panel.action} /></button></footer>
    </article>)}
  </div>;
}
