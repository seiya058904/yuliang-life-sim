import { useMemo, useState } from 'react';
import type { GameAction, GameState, JobDefinition, ViewId, Weekday } from '../content/contracts';
import { employmentKind, requirementHints } from '../engine/careers';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { evaluateCondition } from '../engine/conditions';
import { careerExperienceLabel, careerExperienceStage, careerRequirementsSatisfied } from '../engine/careerProgression';

const categories = ['全部', '基础岗位', '办公室', '技术', '销售', '服务', '管理', '兼职'] as const;
const states = ['全部', '符合条件', '接近条件', '已申请', '冷却中'] as const;
const sorts = ['匹配度', '薪资最高', '截止最早', '最新发布'] as const;
const categoryMap: Record<string, string> = { 基础岗位: 'basic', 办公室: 'office', 技术: 'technical', 销售: 'sales', 服务: 'service', 管理: 'management' };

const money = (amount: number) => '¥' + Math.round(amount).toLocaleString('zh-CN');
const companyName = (id: string) => contentRegistry.companies?.find((company) => company.id === id)?.name ?? id.replace('company.', '').replaceAll('.', ' · ');
const isJobEligible = (job: JobDefinition, game: GameState) => (job.abilityRequired ?? 0) <= game.ability
  && (job.reputationRequired ?? 0) <= game.reputation
  && careerRequirementsSatisfied(job, game)
  && (!job.requirements || evaluateCondition(job.requirements, game, contentRegistry, balanceConfig))
  && !(job.requiredItems ?? []).some((itemId) => (game.inventory[itemId] ?? 0) < 1)
  && !(job.requiredCapabilities ?? []).some((capability) => !game.unlockedCapabilities.includes(capability));

export function CareerView({ game, dispatch, jobs, onNavigate }: { game: GameState; dispatch: (action: GameAction) => void; jobs: readonly JobDefinition[]; onNavigate?: (view: ViewId) => void }) {
  const [tab, setTab] = useState<'current' | 'market' | 'opportunities' | 'applications' | 'side-jobs' | 'history'>('market');
  const labels = { current: '当前工作', market: '招聘市场', opportunities: '工作机会', applications: '我的申请', 'side-jobs': '我的兼职', history: '职业履历' } as const;
  return <section className="career-section">
    <div className="section-heading compact"><div><span className="eyebrow">职业</span><h1>{labels[tab]}</h1></div><p>公开招聘和特殊机会分开；所有申请、Offer 与兼职资格都有明确状态。</p></div>
    <div className="filter-row" aria-label="职业导航">{Object.entries(labels).map(([id, label]) => <button key={id} className={tab === id ? 'filter-button selected' : 'filter-button'} onClick={() => setTab(id as typeof tab)}>{label}</button>)}</div>
    {tab === 'current' && <><CareerProgress game={game} /><CurrentEmployment game={game} jobs={jobs} dispatch={dispatch} /></>}
    {tab === 'market' && <VacancyMarket game={game} jobs={jobs} dispatch={dispatch} />}
    {tab === 'opportunities' && <OpportunityList game={game} jobs={jobs} dispatch={dispatch} />}
    {tab === 'applications' && <ApplicationList game={game} jobs={jobs} dispatch={dispatch} onNavigate={onNavigate} />}
    {tab === 'side-jobs' && <SideJobList game={game} jobs={jobs} dispatch={dispatch} />}
    {tab === 'history' && <HistoryList game={game} jobs={jobs} />}
  </section>;
}

function CurrentEmployment({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const job = jobs.find((entry) => entry.id === game.employment?.jobId);
  if (!job) return <div className="detail-panel"><h2>暂无正式工作</h2><p>你可以在招聘市场申请公开职位。</p></div>;
  const pay = game.employment?.basePay ?? job.basePay;
  return <div className="detail-panel"><h2>{job.name}</h2><p>{job.description}</p><div className="finance-columns"><div><span>基础工资</span><strong>{money(pay)} / 班</strong></div><div><span>个人调整</span><strong>+{money(game.employment?.salaryAdjustment ?? 0)}</strong></div><div><span>谈薪阶段</span><strong>{game.employment?.negotiationStage ?? 0} / 2</strong></div></div><button className="secondary-button" onClick={() => dispatch({ type: 'start_resignation' })}>离开当前工作</button></div>;
}

function CareerProgress({ game }: { game: GameState }) {
  const entries = Object.entries(game.careerExperience ?? {});
  return <section className="detail-panel" aria-label="职业经验与资格"><h2>职业经验与资格</h2>{entries.length ? <div className="item-list">{entries.map(([id, value]) => <div className="item-row" key={id}><div><strong>{careerExperienceLabel(id as Parameters<typeof careerExperienceLabel>[0])}</strong><p>{value} 天 · {careerExperienceStage(value)}</p></div></div>)}</div> : <p className="muted">完成实际工作后，会在这里积累可迁移的职业经验。</p>}<p className="muted">已获得资格：{game.qualifications?.length ? game.qualifications.join('、') : '暂无'}</p></section>;
}

function VacancyMarket({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('全部');
  const [state, setState] = useState<(typeof states)[number]>('全部');
  const [sort, setSort] = useState<(typeof sorts)[number]>('匹配度');
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
  return <><div className="filter-row"><input aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位、公司或标签" />{categories.map((entry) => <button key={entry} className={category === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setCategory(entry)}>{entry}</button>)}</div><div className="filter-row">{states.map((entry) => <button key={entry} className={state === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setState(entry)}>{entry}</button>)}{sorts.map((entry) => <button key={entry} className={sort === entry ? 'filter-button selected' : 'filter-button'} onClick={() => setSort(entry)}>{entry}</button>)}</div><div className="job-grid">{rows.map(({ vacancy, job }) => <VacancyCard key={vacancy.vacancyId} game={game} vacancy={vacancy} job={job!} dispatch={dispatch} />)}</div></>;
}

function VacancyCard({ game, vacancy, job, dispatch }: { game: GameState; vacancy: any; job: any; dispatch: (action: GameAction) => void }) {
  const application = game.applications?.find((entry) => entry.vacancyId === vacancy.vacancyId);
  const acquired = game.acquiredSideJobs?.[job.id];
  const eligible = isJobEligible(job, game);
  const hints = requirementHints(job, game, contentRegistry, balanceConfig);
  return <article className="job-card"><div className="job-card-head"><span className="job-kind">{job.category ?? '岗位'}</span><span className="muted">{companyName(vacancy.companyId)}</span></div><h2>{job.name}</h2><p>{job.description}</p><div className="job-facts"><span>{money(vacancy.salaryRange[0])}–{money(vacancy.salaryRange[1])} / 班</span><span>第 {vacancy.expiresDay} 天截止</span></div>{hints.length > 0 && <div className="requirement-box"><strong>还需准备</strong>{hints.map((hint) => <span key={hint.requirementId}>{hint.label}{hint.currentValue !== undefined ? ` ${hint.currentValue}/${hint.requiredValue}` : ''}</span>)}</div>}<div className="requirement-box"><strong>{eligible ? '符合条件' : '接近条件或仍需准备'}</strong><span>{acquired ? '✓ 已获得' : application?.status ?? '可申请'}</span></div>{acquired ? <button className="secondary-button" disabled>安排到本周</button> : <button className="primary-button" disabled={!eligible || Boolean(application)} onClick={() => dispatch({ type: 'submit_application', vacancyId: vacancy.vacancyId })}>{application ? '已申请' : '申请职位'}</button>}</article>;
}

function OpportunityList({ game, jobs, dispatch }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void }) {
  const opportunities = game.opportunities ?? [];
  const gigs = game.gigs ?? [];
  if (!opportunities.length && !gigs.length) return <p className="muted">目前没有特殊工作机会。人物推荐、内部转岗、猎头和剧情机会会在这里出现。</p>;
  return <div className="job-grid">{gigs.map((gig) => { const job = jobs.find((entry) => entry.id === gig.jobId); return <article className="job-card" key={gig.id}><span className="job-kind">一次性 Gig · {gig.source}</span><h2>{job?.name ?? gig.jobId}</h2><p>执行期限：第 {gig.validFromDay}–{gig.expiresDay} 天 · 结算 {money(gig.pay)}</p><button className="primary-button" onClick={() => dispatch({ type: 'execute_gig', gigId: gig.id })}>执行一次</button></article>; })}{opportunities.map((opportunity) => { const job = jobs.find((entry) => entry.id === opportunity.jobId); return <article className="job-card" key={opportunity.id}><span className="job-kind">{opportunity.source}</span><h2>{job?.name ?? opportunity.jobId}</h2><p>限时至第 {opportunity.expiresDay} 天</p><button className="primary-button" onClick={() => dispatch({ type: 'submit_application', opportunityId: opportunity.id })}>申请机会</button></article>; })}</div>;
}

function ApplicationList({ game, jobs, dispatch, onNavigate }: { game: GameState; jobs: readonly any[]; dispatch: (action: GameAction) => void; onNavigate?: (view: ViewId) => void }) {
  if (!(game.applications ?? []).length) return <p className="muted">还没有已提交的申请。</p>;
  return <div className="item-list">{game.applications!.map((application) => {
    const job = jobs.find((entry) => entry.id === application.jobId);
    return <div className="item-row" key={application.applicationId}><div><h2>{job?.name ?? application.jobId}</h2><p>当前竞争力：{application.competitivenessTier} · {application.feedback.join('；') || '等待反馈'}</p><span className="muted">状态：{application.status}{application.nextEligibleDay ? ' · 第 ' + application.nextEligibleDay + ' 天后可重投' : ''}</span>{application.status === 'rejected' && job && <div className="requirement-box"><strong>下一步</strong>{requirementHints(job, game, contentRegistry, balanceConfig).map((hint) => <button className="text-button" key={hint.requirementId} onClick={() => onNavigate?.(hint.destinationView)}>{hint.actionLabel} · {hint.label}{hint.currentValue !== undefined && hint.requiredValue !== undefined ? `（${hint.currentValue}/${hint.requiredValue}）` : ''}</button>)}</div>}</div><div className="button-pair">{application.status === 'offer' && <><button className="primary-button" onClick={() => dispatch({ type: 'accept_application_offer', applicationId: application.applicationId })}>接受 Offer</button><button className="secondary-button" onClick={() => dispatch({ type: 'decline_application_offer', applicationId: application.applicationId })}>拒绝</button></>}{['submitted', 'screening', 'interview', 'waiting'].includes(application.status) && <button className="secondary-button" onClick={() => dispatch({ type: 'withdraw_application', applicationId: application.applicationId })}>撤回</button>}</div></div>;
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
  return (game.employmentHistory ?? []).length ? <div className="item-list">{game.employmentHistory!.map((entry) => <div className="item-row" key={entry.jobId + (entry.endedDay ?? 0)}><div><h2>{jobs.find((job) => job.id === entry.jobId)?.name ?? entry.jobId}</h2><p>{entry.migrated ? '旧存档开始前已任职' : `${entry.startedDay === undefined ? '游戏开始前' : `第 ${entry.startedDay} 天`}至第 ${entry.endedDay ?? game.time.day} 天`}{entry.reason ? ` · ${entry.reason}` : ''}</p></div><strong>{money(entry.finalPay)} / 班</strong></div>)}</div> : <p className="muted">职业履历会在换岗或离职后出现。</p>;
}
