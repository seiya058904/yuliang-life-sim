import { useMemo, useState } from 'react';
import { PixelIcon } from './pixel/PixelIcon';

import type { GameAction, GameState, JobDefinition, ViewId, Weekday } from '../content/contracts';
import { employmentKind, requirementHints } from '../engine/careers';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { evaluateCondition } from '../engine/conditions';
import { careerExperienceLabel, careerExperienceStage, careerRequirementsSatisfied } from '../engine/careerProgression';
import { buildMobilityEntries } from '../engine/mobility';
import { PixelIllustration, type PixelIllustrationName } from './pixel/PixelIllustration';
import { SegmentMeter } from './pixel/PixelUI';
import { displayContentName, displayMappedLabel, humanizeContentId } from './pixel/displayNames';

const categories = ['全部', '基础岗位', '办公室', '技术', '销售', '服务', '管理', '兼职'] as const;
const states = ['全部', '符合条件', '接近条件', '已申请', '冷却中'] as const;
const sorts = ['匹配度', '薪资最高', '截止最早', '最新发布'] as const;
type CareerTab = 'current' | 'market' | 'opportunities' | 'applications' | 'side-jobs' | 'history' | 'mobility';
const categoryMap: Record<string, string> = { 基础岗位: 'basic', 办公室: 'office', 技术: 'technical', 销售: 'sales', 服务: 'service', 管理: 'management' };

const money = (amount: number) => '¥' + Math.round(amount).toLocaleString('zh-CN');
const companyName = (id: string) => displayContentName(id, contentRegistry.companies ?? [], '招聘公司');
const jobArtByCategory: Record<string, PixelIllustrationName> = {
  basic: 'career-market', office: 'phone', technical: 'chart', sales: 'bag', service: 'coffee', management: 'users',
};
const jobArtFor = (job: JobDefinition): PixelIllustrationName => {
  const tags = new Set([...(job.tags ?? []), ...(job.experienceTags ?? [])]);
  if (tags.has('management')) return 'users';
  if (tags.has('logistics')) return 'city';
  if (tags.has('remote')) return 'chart';
  if (tags.has('office')) return 'phone';
  if (tags.has('customer_service') || job.name.includes('店员')) return 'coffee';
  if (employmentKind(job) === 'gig' || job.kind === 'temporary') return 'bag';
  return jobArtByCategory[job.category ?? job.kind] ?? 'career-market';
};
const applicationStatusLabels: Record<string, string> = { submitted: '已提交', screening: '筛选中', interview: '面试中', waiting: '等待结果', rejected: '未通过', offer: 'Offer 待回复', accepted: '已接受', withdrawn: '已撤回', expired: '已过期' };
const isJobEligible = (job: JobDefinition, game: GameState) => (job.abilityRequired ?? 0) <= game.ability
  && (job.reputationRequired ?? 0) <= game.reputation
  && careerRequirementsSatisfied(job, game)
  && (!job.requirements || evaluateCondition(job.requirements, game, contentRegistry, balanceConfig))
  && !(job.requiredItems ?? []).some((itemId) => (game.inventory[itemId] ?? 0) < 1)
  && !(job.requiredCapabilities ?? []).some((capability) => !game.unlockedCapabilities.includes(capability));

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
  const [selectedId, setSelectedId] = useState<string | undefined>(game.vacancies?.[0]?.vacancyId);
  const [page, setPage] = useState(0);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const pageSize = 6;
  const rows = useMemo(() => (game.vacancies ?? []).map((vacancy) => ({ vacancy, job: jobs.find((job) => job.id === vacancy.jobId) })).filter((row) => row.job).filter((row) => {
    const job = row.job!;
    const application = game.applications?.find((entry) => entry.vacancyId === row.vacancy.vacancyId);
    const eligible = isJobEligible(job, game);
    const close = !eligible && (job.abilityRequired ?? 0) - game.ability <= 5 && (job.reputationRequired ?? 0) - game.reputation <= 5;
    const cooldown = game.applications?.some((entry) => entry.jobId === job.id && entry.companyId === row.vacancy.companyId && (entry.nextEligibleDay ?? 0) > game.time.day);
    const categoryMatches = category === '全部' || (category === '兼职' ? employmentKind(job) !== 'full_time' : job.category === categoryMap[category]);
    const stateMatches = state === '全部' || (state === '符合条件' && eligible) || (state === '接近条件' && close) || (state === '已申请' && Boolean(application)) || (state === '冷却中' && Boolean(cooldown));
    return categoryMatches && stateMatches && (job.name + companyName(row.vacancy.companyId)).toLowerCase().includes(query.toLowerCase());
  }).sort((left, right) => sort === '薪资最高' ? right.vacancy.salaryRange[1] - left.vacancy.salaryRange[1] : sort === '截止最早' ? left.vacancy.expiresDay - right.vacancy.expiresDay : left.job!.name.localeCompare(right.job!.name, 'zh-CN')), [category, game, jobs, query, sort, state]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const selected = rows.find((row) => row.vacancy.vacancyId === selectedId) ?? rows[0];
  const goPage = (next: number) => setPage(Math.max(0, Math.min(pageCount - 1, next)));
  const openCareerPage = (next: CareerTab) => {
    setPageMenuOpen(false);
    onOpenTab(next);
  };
  return <div className="career-market-shell" role="region" aria-label="招聘市场布局">
    <aside className="career-filters"><div className="career-market-identity"><span className="eyebrow">职业</span><h1>招聘市场</h1><p>发现你的下一份机会</p></div><label>搜索岗位 / 公司<input aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" /></label><strong>岗位类型</strong>{categories.map((entry) => <button key={entry} className={category === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setCategory(entry)}>{entry}</button>)}<strong>申请状态</strong>{states.map((entry) => <button key={entry} className={state === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setState(entry)}>{entry}</button>)}</aside>
    <div className="career-results"><div className="career-toolbar"><div className="career-toolbar-leading"><button type="button" className="career-page-menu-trigger" aria-expanded={pageMenuOpen} aria-controls="career-page-menu" onClick={() => setPageMenuOpen((open) => !open)}>职业页面</button><strong>公开机会 {rows.length}</strong></div><div className="career-toolbar-actions">{onOpenTools && <button type="button" className="career-tools-trigger" onClick={onOpenTools}>安排本周与课程</button>}{sorts.map((entry) => <button key={entry} className={sort === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setSort(entry)}>{entry}</button>)}</div>{pageMenuOpen && <nav id="career-page-menu" className="career-page-menu" aria-label="职业页面导航">{Object.entries(labels).map(([id, label]) => <button key={id} type="button" className={id === 'market' ? 'filter-button selected' : 'filter-button'} onClick={() => openCareerPage(id as CareerTab)}>{label}</button>)}</nav>}</div><div className="job-grid">{pagedRows.map(({ vacancy, job }) => <VacancyCard key={vacancy.vacancyId} game={game} vacancy={vacancy} job={job!} dispatch={dispatch} selected={vacancy.vacancyId === selected?.vacancy.vacancyId} onSelect={() => setSelectedId(vacancy.vacancyId)} />)}</div>
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
  const eligible = isJobEligible(job, game);
  const hints = requirementHints(job, game, contentRegistry, balanceConfig);
  return <article className={selected ? 'job-card selected' : 'job-card'} data-catalog-card><button className="card-select" onClick={onSelect} aria-label={`查看岗位详情：${job.name}`}><div className="career-card-art"><PixelIllustration name={jobArtFor(job)} size={76} /></div><div className="job-card-head"><span className="job-kind">{job.category ?? '岗位'}</span><span className="muted">{companyName(vacancy.companyId)}</span></div><h2>{job.name}</h2><p>{job.description}</p></button><div className="job-facts"><span>{money(vacancy.salaryRange[0])}–{money(vacancy.salaryRange[1])} / 班</span><span>第 {vacancy.expiresDay} 天截止</span></div>{hints.length > 0 && <div className="requirement-box"><strong>还需准备</strong>{hints.map((hint) => <span key={hint.requirementId}>{hint.actionLabel} · {hint.label}{hint.currentValue !== undefined ? ` ${hint.currentValue}/${hint.requiredValue}` : ''}</span>)}</div>}<div className="requirement-box"><strong>{eligible ? '符合条件' : '仍需准备'}</strong><span>{acquired ? '已获得' : application ? displayMappedLabel(application.status, applicationStatusLabels) : '可申请'}</span></div>{acquired ? <button className="secondary-button" disabled>安排到本周</button> : <button className="primary-button" disabled={!eligible || Boolean(application)} onClick={() => dispatch({ type: 'submit_application', vacancyId: vacancy.vacancyId })}>{application ? '已申请' : '申请职位'}</button>}</article>;
}

function VacancyDetail({ game, vacancy, job, dispatch }: { game: GameState; vacancy: any; job: JobDefinition; dispatch: (action: GameAction) => void }) {
  const hints = requirementHints(job, game, contentRegistry, balanceConfig);
  const application = game.applications?.find((entry) => entry.vacancyId === vacancy.vacancyId);
  const eligible = isJobEligible(job, game);
  const recruiterId = job.recruiterCharacterId ?? job.recruitment?.recruiterCharacterId;
  const recruiter = recruiterId ? contentRegistry.characters.find((character) => character.id === recruiterId) : undefined;
  const abilityTarget = job.abilityRequired ?? 0;
  const reputationTarget = job.reputationRequired ?? 0;
  const abilityMatch = abilityTarget === 0 ? 100 : Math.min(100, Math.round((game.ability / abilityTarget) * 100));
  const reputationMatch = reputationTarget === 0 ? 100 : Math.min(100, Math.round((game.reputation / reputationTarget) * 100));
  const matchPercent = Math.max(0, Math.min(100, Math.round((abilityMatch + reputationMatch) / 2)));
  const routeLabel = vacancy.route === 'referral' ? '人物推荐' : vacancy.route === 'internal' ? '内部转岗' : vacancy.route === 'headhunter' ? '猎头机会' : vacancy.route === 'story' ? '剧情机会' : '公开投递';
  return <><span className="job-kind">岗位详情</span><div className="career-detail-visual" aria-hidden="true"><PixelIllustration name={jobArtFor(job)} size={72} /><span>{job.category ?? '岗位'} · 岗位画像</span></div><div className="career-detail-title">{job.name}</div><p>{companyName(vacancy.companyId)}</p><div className="detail-facts"><span>薪资</span><strong>{money(vacancy.salaryRange[0])}–{money(vacancy.salaryRange[1])}</strong><span>类型</span><strong>{employmentKind(job) === 'full_time' ? '正式岗位' : employmentKind(job) === 'gig' ? 'Gig' : '长期兼职'}</strong><span>截止</span><strong>第 {vacancy.expiresDay} 天</strong></div><section><h3>任职要求</h3>{hints.length ? hints.map((hint) => <div className="requirement-line" key={hint.requirementId}><span>{hint.label}</span><strong>{hint.currentValue !== undefined ? `${hint.currentValue}/${hint.requiredValue}` : '未满足'}</strong></div>) : <p className="requirement-ok">当前条件已满足</p>}</section><section><h3>当前条件</h3><div className="requirement-line"><span>能力</span><strong>{game.ability}/{job.abilityRequired ?? 0}</strong></div><div className="requirement-line"><span>声誉</span><strong>{game.reputation}/{job.reputationRequired ?? 0}</strong></div><div className="requirement-line"><span>招聘路径</span><strong>{routeLabel}</strong></div></section><div className="career-detail-match"><div><span>匹配度</span><strong>{matchPercent}%</strong></div><div className="meter"><i style={{ width: `${matchPercent}%` }} /></div><p>{eligible ? '基本符合，建议投递并进入招聘流程。' : '还有准备空间；先完成上方提示，匹配度会继续提高。'}</p></div><section className="career-detail-recruitment"><div className="career-recruiter"><div className="career-recruiter-art"><PixelIllustration name="career-market" size={44} /></div><div><span className="job-kind">招聘人</span><strong>{recruiter?.name ?? '招聘团队'}</strong><small>{recruiter?.identity ?? '用人方'} · 负责这份机会</small></div></div><div className="career-flow"><h3>招聘流程</h3><div className="career-flow-track"><span>投递</span><i>→</i><span>筛选</span><i>→</i><span>面试</span><i>→</i><span>Offer</span></div><small>{job.recruitment?.offerText ?? '符合条件后，会进入真实的申请与反馈流程。'}</small></div></section><button className="primary-button full" disabled={!eligible || Boolean(application)} onClick={() => dispatch({ type: 'submit_application', vacancyId: vacancy.vacancyId })}>{application ? `申请状态：${application.status}` : '申请岗位'}</button></>;
}

function OpportunityList({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const opportunities = game.opportunities ?? [];
  const gigs = game.gigs ?? [];
  if (!opportunities.length && !gigs.length) return <p className="muted">目前没有特殊工作机会。人物推荐、内部转岗、猎头和剧情机会会在这里出现。</p>;
  return <div className="job-grid">{gigs.map((gig) => { const job = jobs.find((entry) => entry.id === gig.jobId); return <article className="job-card" key={gig.id}><span className="job-kind">一次性 Gig · {gig.source}</span><h2>{job?.name ?? humanizeContentId(gig.jobId)}</h2><p>执行期限：第 {gig.validFromDay}–{gig.expiresDay} 天 · 结算 {money(gig.pay)}</p><button className="primary-button" onClick={() => dispatch({ type: 'execute_gig', gigId: gig.id })}>执行一次</button></article>; })}{opportunities.map((opportunity) => { const job = jobs.find((entry) => entry.id === opportunity.jobId); return <article className="job-card" key={opportunity.id}><span className="job-kind">{opportunity.source}</span><h2>{job?.name ?? humanizeContentId(opportunity.jobId)}</h2><p>限时至第 {opportunity.expiresDay} 天</p><button className="primary-button" onClick={() => dispatch({ type: 'submit_application', opportunityId: opportunity.id })}>申请机会</button></article>; })}</div>;
}

function ApplicationList({ game, jobs, dispatch, onNavigate }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void; onNavigate?: (view: ViewId) => void }) {
  if (!(game.applications ?? []).length) return <p className="muted">还没有已提交的申请。</p>;
  return <div className="item-list">{game.applications!.map((application) => {
    const job = jobs.find((entry) => entry.id === application.jobId);
    return <div className="item-row" key={application.applicationId}><div><h2>{job?.name ?? humanizeContentId(application.jobId)}</h2><p>当前竞争力：{application.competitivenessTier} · {application.feedback.join('；') || '等待反馈'}</p><span className="muted">状态：{displayMappedLabel(application.status, applicationStatusLabels)}{application.nextEligibleDay ? ' · 第 ' + application.nextEligibleDay + ' 天后可重投' : ''}</span>{application.status === 'rejected' && job && <div className="requirement-box"><strong>下一步</strong>{requirementHints(job, game, contentRegistry, balanceConfig).map((hint) => <button className="text-button" key={hint.requirementId} onClick={() => onNavigate?.(hint.destinationView)}>{hint.actionLabel} · {hint.label}{hint.currentValue !== undefined && hint.requiredValue !== undefined ? `（${hint.currentValue}/${hint.requiredValue}）` : ''}</button>)}</div>}</div><div className="button-pair">{application.status === 'offer' && <><button className="primary-button" onClick={() => dispatch({ type: 'accept_application_offer', applicationId: application.applicationId })}>接受 Offer</button><button className="secondary-button" onClick={() => dispatch({ type: 'decline_application_offer', applicationId: application.applicationId })}>拒绝</button></>}{['submitted', 'screening', 'interview', 'waiting'].includes(application.status) && <button className="secondary-button" onClick={() => dispatch({ type: 'withdraw_application', applicationId: application.applicationId })}>撤回</button>}</div></div>;
  })}</div>;
}

function SideJobList({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const entries = Object.values(game.acquiredSideJobs ?? {});
  const scheduleSideJob = (job: any) => {
    const durationMinutes = Math.min(240, Math.max(60, job.hours * 60)) as 60 | 120 | 240;
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
      if (weekday < game.calendar.weekday) continue;
      if (!game.employment?.schedule.workDays.includes(weekday) && game.weeklyPlan.days[weekday].day.kind === 'free') {
        dispatch({ type: 'set_plan', weekday, slot: 'day', activity: { kind: 'side_job', jobId: job.id, durationMinutes } });
        return;
      }
      if (game.weeklyPlan.days[weekday].evening.kind === 'free') {
        dispatch({ type: 'set_plan', weekday, slot: 'evening', activity: { kind: 'side_job', jobId: job.id, durationMinutes } });
        return;
      }
    }
  };
  return entries.length ? <div className="item-list">{entries.map((entry) => { const job = jobs.find((candidate) => candidate.id === entry.jobId); if (!job) return null; return <div className="item-row" key={entry.jobId}><div><h2>{job.name}</h2><p>已获得长期兼职资格；安排后会在周计划自动执行，并计入兼职收入、经验和职业记录。</p></div><div className="button-pair"><span className="current-label">已获得</span><button className="secondary-button" disabled={game.simulationMode === 'running' || game.simulationMode === 'event' || game.simulationMode === 'reward'} onClick={() => scheduleSideJob(job)}>安排到本周</button></div></div>; })}</div> : <p className="muted">通过招聘市场获得的长期兼职会在这里出现。</p>;
}

function HistoryList({ game, jobs }: { game: GameState; jobs: readonly any[] }) {
  return (game.employmentHistory ?? []).length ? <div className="item-list">{game.employmentHistory!.map((entry) => <div className="item-row" key={entry.jobId + (entry.endedDay ?? 0)}><div><h2>{displayContentName(entry.jobId, jobs, '职业')}</h2><p>{entry.migrated ? '旧存档开始前已任职' : `${entry.startedDay === undefined ? '游戏开始前' : `第 ${entry.startedDay} 天`}至第 ${entry.endedDay ?? game.time.day} 天`}{entry.reason ? ` · ${entry.reason}` : ''}</p></div><strong>{money(entry.finalPay)} / 班</strong></div>)}</div> : <p className="muted">职业履历会在换岗或离职后出现。</p>;
}

const offerStatusLabels: Record<string, string> = { submitted: '已提交', screening: '筛选中', interview: '面试中', waiting: '等待结果', rejected: '未通过', offer: 'Offer 待回复', accepted: '已接受', withdrawn: '已撤回', expired: '已过期' };

function CareerBottomPanels({ game, jobs, onOpenTab }: { game: GameState; jobs: readonly any[]; onOpenTab: (tab: 'applications' | 'history' | 'mobility') => void }) {
  const moneyFmt = (amount: number) => '¥' + Math.round(amount).toLocaleString('zh-CN');
  const applications = [...(game.applications ?? [])].reverse().slice(0, 3);
  const offers = (game.applications ?? []).filter((application) => application.status === 'offer').slice(0, 3);
  const history = [...(game.employmentHistory ?? [])].reverse().slice(0, 2);
  const vacancies = game.vacancies ?? [];
  const eligibleCount = vacancies.filter((vacancy) => {
    const job = jobs.find((entry) => entry.id === vacancy.jobId);
    return Boolean(job) && isJobEligible(job!, game);
  }).length;
  const averageSalary = vacancies.length ? Math.round(vacancies.reduce((sum, vacancy) => sum + vacancy.salaryRange[0], 0) / vacancies.length) : 0;
  const salaryScale = vacancies.length ? Math.max(1, Math.max(...vacancies.map((vacancy) => vacancy.salaryRange[1]))) : 1;
  const insightMetrics = [
    { label: '公开机会', value: vacancies.length, max: Math.max(1, vacancies.length), caption: `${vacancies.length} 个` },
    { label: '符合条件', value: eligibleCount, max: Math.max(1, vacancies.length), caption: `${eligibleCount} 个` },
    { label: '平均起薪', value: averageSalary, max: salaryScale, caption: moneyFmt(averageSalary) },
  ];
  const panels = [
    {
      key: 'applications', icon: 'mail' as const, title: '我的申请', count: (game.applications ?? []).length,
      rows: applications.map((application) => ({ label: jobs.find((job) => job.id === application.jobId)?.name ?? humanizeContentId(application.jobId), value: displayMappedLabel(application.status, offerStatusLabels) })),
      empty: '还没有提交任何申请。',
      action: '全部申请 ▸', target: () => onOpenTab('applications'),
    },
    {
      key: 'offers', icon: 'tag' as const, title: 'Offer', count: offers.length,
      rows: offers.map((offer) => ({ label: jobs.find((job) => job.id === offer.jobId)?.name ?? humanizeContentId(offer.jobId), value: offer.offerExpiresDay ? `第 ${offer.offerExpiresDay} 天前有效` : '等待处理' })),
      empty: '暂无等待回复的 Offer。',
      action: '查看 Offer ▸', target: () => onOpenTab('applications'),
    },
    {
      key: 'history', icon: 'chart' as const, title: '职业履历', count: (game.employmentHistory ?? []).length,
      rows: history.map((entry) => ({ label: jobs.find((job) => job.id === entry.jobId)?.name ?? humanizeContentId(entry.jobId), value: `${moneyFmt(entry.finalPay)} / 班` })).slice(0, 3),
      empty: '职业履历会在换岗或离职后出现。',
      action: '完整履历 ▸', target: () => onOpenTab('history'),
    },
    {
      key: 'insight', icon: 'target' as const, title: '市场洞察', count: vacancies.length,
      rows: [
        { label: '公开机会', value: `${vacancies.length} 个` },
        { label: '符合条件', value: `${eligibleCount} 个` },
        { label: '平均起薪', value: moneyFmt(averageSalary) },
      ],
      empty: '',
      action: '跨行业距离 ▸', target: () => onOpenTab('mobility'),
    },
  ];
  return <div className="career-bottom-panels" aria-label="求职支持面板">
    {panels.map((panel) => <article className={`pixel-panel secondary career-bottom-panel career-bottom-${panel.key}`} key={panel.key}>
      <header className="inbox-head"><PixelIcon name={panel.icon} size={18} /><h2>{panel.title}</h2>{panel.count > 0 && <b className="inbox-count">{panel.count}</b>}</header>
      {panel.key === 'insight' ? vacancies.length ? <div className="career-insight-body" aria-label="市场机会概览">
        <div className="career-insight-metrics">{insightMetrics.map((metric) => <div className="career-insight-metric" key={metric.label}><span>{metric.label}</span><SegmentMeter value={metric.value} max={metric.max} segments={7} label={`${metric.label} ${metric.caption}`} /><small>{metric.caption}</small></div>)}</div>
        <PixelIllustration name="chart" size={52} aria-hidden="true" />
      </div> : <div className="career-insight-empty" role="img" aria-label="市场洞察空态"><PixelIllustration name="chart" size={42} aria-hidden="true" /><strong>本期暂无公开机会</strong><small>市场刷新后，这里会显示机会数量与起薪走势。</small></div> : panel.rows.length ? <ul className="rail-rows compact">{panel.rows.map((row, index) => <li key={`${row.label}-${index}`}><span>{row.label}</span><small>{row.value}</small></li>)}</ul> : <p className="inbox-empty">{panel.empty}</p>}
      <footer className="inbox-foot"><button onClick={() => panel.target()}>{panel.action}</button></footer>
    </article>)}
  </div>;
}
