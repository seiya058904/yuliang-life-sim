import type { BalanceConfig } from '../balance/config';
import type { AttributeId, ContentId, ContentRegistry, EffectDefinition, GameAction, GameEffect, GameResult, GameState, ItemDefinition, JobDefinition, LifeRecordEntry, PlannedActivity } from '../content/contracts';
import { evaluateCondition } from './conditions';
import { calculateNetWorth } from './economy';
import { applyContentEffects, cloneGameState, itemCost, refreshUnlocks } from './effects';
import { advanceSimulation } from './simulation';
import { activityAtTime, defaultJobSchedule, validateWeeklyPlan } from './schedule';
import { groupForCategory, recordStateFinancialEntry, syncLegacyMonthlyLedger } from './financialLedger';
import { investmentUnitValue } from './investments';
import { applyAttributeDelta } from './attributes';
import { deterministicApplicationDecision, employmentKind, evaluateApplicationCompetitiveness } from './careers';
import { appendLifeRecord } from './lifeHistory';
import { advanceStorylineStage, getStoryline, getStorylineStage } from './storylines';
import { careerRequirementsSatisfied } from './careerProgression';
import { applyCareerExperience } from './careerProgression';
import { housingMortgageTerms, housingPrice, housingRentPerDay, recordLocationVisit } from './locations';
import { absoluteMinute } from './time';

const fail = (state: GameState, error: string): GameResult => ({ state, effects: [], error });
const find = <T extends { id: string }>(entries: readonly T[], id: string): T | undefined => entries.find((entry) => entry.id === id);

function hasRequirements(state: GameState, condition: Parameters<typeof evaluateCondition>[0] | undefined, content: ContentRegistry, balance: BalanceConfig): boolean {
  return !condition || evaluateCondition(condition, state, content, balance);
}

function canAcceptJob(state: GameState, job: JobDefinition, content: ContentRegistry, balance: BalanceConfig): string | undefined {
  if (!state.unlockedJobIds.includes(job.id)) return '这份工作还没有对你开放';
  if (job.abilityRequired !== undefined && state.ability < job.abilityRequired) return `需要能力 ${job.abilityRequired}`;
  if (job.reputationRequired !== undefined && state.reputation < job.reputationRequired) return `需要声誉 ${job.reputationRequired}`;
  if (!hasRequirements(state, job.requirements, content, balance)) return '当前条件还不满足';
  if (!careerRequirementsSatisfied(job, state)) return '岗位经验或资格还不满足';
  if (job.requiredItems?.some((itemId) => (state.inventory[itemId] ?? 0) < 1)) return '缺少必要商品';
  if (job.requiredCapabilities?.some((capability) => !state.unlockedCapabilities.includes(capability))) return '缺少必要能力';
  return undefined;
}

function recruiterForJob(job: JobDefinition, content: ContentRegistry): ContentId | undefined {
  const explicit = job.recruiterCharacterId ?? job.relatedCharacters?.[0];
  if (explicit && content.characters.some((character) => character.id === explicit)) return explicit;
  const tagged = job.tags?.includes('remote') || job.tags?.includes('technology') ? 'character.xuke' : job.tags?.includes('career') || job.tags?.includes('office') ? 'character.chenyu' : 'character.seed-lin';
  return content.characters.some((character) => character.id === tagged) ? tagged : content.characters[0]?.id;
}

function reserveRequired(state: GameState, content: ContentRegistry): number {
  const home = find(content.housing, state.housing.housingId);
  return state.housing.mode === 'rent' && home ? housingRentPerDay(state, home) : 0;
}

function addLifeRecord(state: GameState, record: Omit<LifeRecordEntry, 'id' | 'day'> & { id?: string; day?: number }): void {
  const source = (record.sourceId ?? record.title).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || record.category;
  const nextRecord: LifeRecordEntry = {
    id: record.id ?? `life.${record.category}.${source}.${record.day ?? state.time.day}.${(state.lifeHistory ?? []).length + 1}`,
    day: record.day ?? state.time.day,
    category: record.category,
    title: record.title,
    detail: record.detail,
    sourceId: record.sourceId,
    amount: record.amount,
  };
  state.lifeHistory = appendLifeRecord(state.lifeHistory ?? [], nextRecord);
}

function advancePeriod(input: GameState, months: 1 | 3, content: ContentRegistry, balance: BalanceConfig): GameResult {
  if (!['planning', 'paused', 'week_complete'].includes(input.simulationMode)) return fail(input, '当前不能开始长期运行');
  let state = cloneGameState(input);
  state.autoRepeatPlan = true;
  state.weeklyPlan = { ...state.weeklyPlan, autoRepeat: true, days: structuredClone(state.weeklyPlan.days) };
  const effects: GameEffect[] = [];
  const targetMinutes = months * 28 * 24 * 60;
  const targetMonth = input.calendar.month + months - 1;
  let elapsed = 0;
  while (elapsed < targetMinutes) {
    if (state.simulationMode === 'planning' || state.simulationMode === 'paused' || state.simulationMode === 'week_complete') {
      const started = dispatchGameAction(state, { type: 'start_week' }, content, balance);
      if (started.error) return { state: input, effects: [], error: started.error };
      state = started.state;
      effects.push(...started.effects);
    }
    if (state.simulationMode === 'monthly_summary') {
      if ((state.pendingMonthlySummary?.month ?? 0) >= targetMonth) break;
      const acknowledged = dispatchGameAction(state, { type: 'acknowledge_monthly_summary' }, content, balance);
      if (acknowledged.error) return { state: input, effects: [], error: acknowledged.error };
      state = acknowledged.state;
      effects.push(...acknowledged.effects);
      continue;
    }
    if (state.simulationMode !== 'running') break;
    const before = absoluteMinute(state.time);
    const step = advanceSimulation(state, targetMinutes - elapsed, content, balance);
    if (step.error) return { state: input, effects: [], error: step.error };
    state = step.state;
    effects.push(...step.effects);
    const advanced = absoluteMinute(state.time) - before;
    if (advanced <= 0) break;
    elapsed += advanced;
    if (state.simulationMode === 'event' || state.simulationMode === 'reward') break;
  }
  return { state, effects };
}

export function dispatchGameAction(input: GameState, action: GameAction, content: ContentRegistry, balance: BalanceConfig): GameResult {
  if (input.pendingEventId && action.type !== 'choose_event' && !(action.type === 'claim_reward' && input.pendingReward)) return fail(input, '请先处理当前事件');
  if (input.pendingReward && action.type !== 'claim_reward') return fail(input, '请先收下本次奖励');
  if (input.simulationMode === 'monthly_summary' && action.type !== 'acknowledge_monthly_summary') return fail(input, '请先进入下个月');
  if (action.type === 'advance_simulation') return advanceSimulation(input, action.minutes, content, balance);
  if (action.type === 'advance_period') return advancePeriod(input, action.months, content, balance);

  const state = cloneGameState(input);
  const effects: GameEffect[] = [];
  if (!state.financialLedger) state.financialLedger = { month: state.calendar.month, nextSequence: 1, entries: [], cashStart: state.cash, netWorthStart: calculateNetWorth(state, content, balance) };

  switch (action.type) {
    case 'acknowledge_monthly_summary':
      if (!state.pendingMonthlySummary) return fail(input, '当前没有待确认的月结');
      state.simulationMode = state.pendingMonthlySummary.resumeMode === 'running' && state.autoRepeatPlan ? 'running' : state.pendingMonthlySummary.resumeMode === 'paused' ? 'paused' : 'planning';
      state.pendingMonthlySummary = undefined;
      break;
    case 'start_week': {
      if (!['planning', 'paused', 'week_complete'].includes(state.simulationMode)) return fail(input, '当前不能开始新一周');
      const errors = validateWeeklyPlan(state.weeklyPlan, state.employment, content);
      if (errors.length) return fail(input, errors[0]);
      if (state.employment?.pendingJobId) {
        const nextJob = find(content.jobs, state.employment.pendingJobId);
        if (nextJob) {
          state.employmentHistory = [...(state.employmentHistory ?? []), { jobId: state.employment.jobId, companyId: state.employment.companyId, startedDay: undefined, endedDay: state.time.day - 1, finalPay: (state.employment.basePay ?? 0) + (state.employment.salaryAdjustment ?? 0), reason: '换岗' }];
          state.currentJobId = nextJob.id;
          state.employment = { jobId: nextJob.id, companyId: state.employment.pendingCompanyId, basePay: state.employment.pendingBasePay ?? nextJob.basePay, salaryAdjustment: 0, negotiationStage: 0, schedule: defaultJobSchedule(nextJob), effectiveWeek: state.calendar.week };
        }
      }
      state.simulationMode = 'running';
      state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, content);
      effects.push({ type: 'message', text: `第 ${state.calendar.week} 周开始运行` });
      break;
    }
    case 'pause_simulation':
      if (state.simulationMode === 'running') state.simulationMode = 'paused';
      break;
    case 'resume_simulation':
      if (state.pendingEventId) return fail(input, '请先处理当前事件');
      if (state.simulationMode === 'paused') state.simulationMode = 'running';
      break;
    case 'continue_after_event':
      if (state.pendingEventId) return fail(input, '请先选择事件结果');
      if (state.pendingReward) return fail(input, '请先收下本次奖励');
      if (state.simulationMode === 'paused') state.simulationMode = 'running';
      break;
    case 'claim_reward':
      if (!state.pendingReward) return fail(input, '当前没有待领取奖励');
      state.pendingReward = undefined;
      state.simulationMode = state.pendingEventId ? 'event' : action.resume ? 'running' : 'paused';
      break;
    case 'set_simulation_speed':
      state.simulationSpeed = action.speed;
      break;
    case 'set_plan': {
      if (state.simulationMode === 'running' || state.simulationMode === 'event') return fail(input, '运行中不能修改计划');
      const weeklyPlan = cloneGameState(state).weeklyPlan;
      weeklyPlan.days[action.weekday][action.slot] = action.activity;
      const errors = validateWeeklyPlan(weeklyPlan, state.employment, content);
      if (errors.length) return fail(input, errors[0]);
      state.weeklyPlan = weeklyPlan;
      break;
    }
    case 'copy_previous_plan': {
      if (state.simulationMode === 'running' || state.simulationMode === 'event') return fail(input, '运行中不能修改计划');
      if (!state.previousWeeklyPlan) return fail(input, '暂时没有可沿用的上周计划');
      const weeklyPlan = structuredClone(state.previousWeeklyPlan);
      weeklyPlan.autoRepeat = state.autoRepeatPlan;
      const errors = validateWeeklyPlan(weeklyPlan, state.employment, content);
      if (errors.length) return fail(input, errors[0]);
      state.weeklyPlan = weeklyPlan;
      effects.push({ type: 'message', text: '已沿用上周计划' });
      break;
    }
    case 'set_auto_repeat_plan':
      state.autoRepeatPlan = action.enabled;
      state.weeklyPlan.autoRepeat = action.enabled;
      break;
    case 'submit_application': {
      const vacancy = state.vacancies?.find((entry) => entry.vacancyId === action.vacancyId);
      const opportunity = state.opportunities?.find((entry) => entry.id === action.opportunityId);
      if (!vacancy && !opportunity) return fail(input, '这项招聘已经结束');
      const source = vacancy ?? opportunity!;
      const job = find(content.jobs, source.jobId);
      if (!job) return fail(input, '岗位内容已失效');
      if (job.abilityRequired !== undefined && state.ability < job.abilityRequired) return fail(input, '需要能力 ' + job.abilityRequired);
      if (job.reputationRequired !== undefined && state.reputation < job.reputationRequired) return fail(input, '需要声誉 ' + job.reputationRequired);
      if (!hasRequirements(state, job.requirements, content, balance)) return fail(input, '当前条件还不满足');
      if (!careerRequirementsSatisfied(job, state)) return fail(input, '岗位经验或资格还不满足');
      if (job.requiredItems?.some((itemId) => (state.inventory[itemId] ?? 0) < 1) || job.requiredCapabilities?.some((capability) => !state.unlockedCapabilities.includes(capability))) return fail(input, '缺少岗位需要的物品或能力');
      if ((vacancy && state.time.day > vacancy.expiresDay) || (opportunity && state.time.day > opportunity.expiresDay)) return fail(input, '这项机会已经过期');
      const applications = state.applications ?? [];
      if (vacancy && applications.some((entry) => entry.vacancyId === vacancy.vacancyId)) return fail(input, '已经申请过这个职位');
      if (applications.some((entry) => entry.jobId === job.id && entry.companyId === source.companyId && !['rejected', 'withdrawn', 'expired'].includes(entry.status))) return fail(input, '该公司正在处理你的申请');
      const cooldown = applications.find((entry) => entry.jobId === job.id && entry.companyId === source.companyId && (entry.nextEligibleDay ?? 0) > state.time.day);
      if (cooldown) return fail(input, `可在第 ${cooldown.nextEligibleDay} 天后再次申请`);
      if (employmentKind(job) === 'full_time') {
        const active = applications.filter((entry) => entry.status === 'submitted' || entry.status === 'screening' || entry.status === 'interview' || entry.status === 'waiting').filter((entry) => employmentKind(find(content.jobs, entry.jobId)!) === 'full_time');
        if (active.length >= balance.applicationMaxActiveFullTime) return fail(input, '同时进行的正式岗位申请已达到上限');
        if (active.filter((entry) => entry.jobId === job.id).length >= balance.applicationMaxSameJob) return fail(input, '同一岗位的并行申请已达到上限');
      }
      const route = source.route;
      const competitiveness = evaluateApplicationCompetitiveness(job, state, content, balance, route);
      const applicationId = `application.${state.time.day}.${applications.length + 1}`;
      const immediate = employmentKind(job) !== 'full_time' || job.category === 'basic';
      const resultDay = state.time.day + (immediate ? 0 : 2 + ((state.rng.seed + applications.length) % 4));
      const willReceiveOffer = deterministicApplicationDecision(state.rng.seed, applicationId, competitiveness.probabilityBand);
      state.applications = [...applications, {
        applicationId, vacancyId: vacancy?.vacancyId, opportunityId: opportunity?.id, jobId: job.id, companyId: source.companyId,
        salaryRange: source.salaryRange, route, submittedDay: state.time.day, resultDay, status: immediate ? (willReceiveOffer ? 'offer' : 'rejected') : 'submitted',
        competitivenessTier: competitiveness.tier, probabilityBand: competitiveness.probabilityBand, willReceiveOffer,
        feedback: competitiveness.weaknesses.length ? competitiveness.weaknesses : ['条件符合岗位期待'],
        ...(immediate && willReceiveOffer ? { offerExpiresDay: resultDay + balance.applicationOfferDurationRange[0] } : {}),
        ...(!willReceiveOffer && immediate ? { nextEligibleDay: resultDay + balance.applicationCooldownDays } : {}),
      }];
      effects.push({ type: 'message', text: immediate ? (willReceiveOffer ? '你收到了工作 Offer' : '本次申请未通过') : '申请已提交，等待招聘方反馈' });
      break;
    }
    case 'withdraw_application': {
      const application = state.applications?.find((entry) => entry.applicationId === action.applicationId);
      if (!application || ['accepted', 'rejected', 'withdrawn', 'expired'].includes(application.status)) return fail(input, '这份申请不能撤回');
      application.status = 'withdrawn';
      break;
    }
    case 'decline_application_offer': {
      const application = state.applications?.find((entry) => entry.applicationId === action.applicationId);
      if (!application || application.status !== 'offer') return fail(input, '当前没有可拒绝的 Offer');
      application.status = 'withdrawn';
      break;
    }
    case 'accept_application_offer': {
      const application = state.applications?.find((entry) => entry.applicationId === action.applicationId);
      if (!application || application.status !== 'offer') return fail(input, '当前没有可接受的 Offer');
      if ((application.offerExpiresDay ?? Number.MAX_SAFE_INTEGER) < state.time.day) { application.status = 'expired'; return fail(input, '这份 Offer 已过期'); }
      const job = find(content.jobs, application.jobId);
      if (!job) return fail(input, '岗位内容已失效');
      if (employmentKind(job) === 'repeatable_side_job') {
        state.acquiredSideJobs ??= {};
        if (state.acquiredSideJobs[job.id]) return fail(input, '你已经获得这项兼职资格');
        state.acquiredSideJobs[job.id] = { jobId: job.id, acquiredDay: state.time.day, sourceApplicationId: application.applicationId };
        state.monthlyHighlights = [...(state.monthlyHighlights ?? []), { id: `side-job.${job.id}`, kind: 'side_job_acquired', day: state.time.day, label: job.name, sourceId: job.id }];
        application.status = 'accepted';
        addLifeRecord(state, { category: 'career', title: `获得${job.name}资格`, detail: '长期兼职资格已加入我的兼职', sourceId: job.id, amount: application.salaryRange[0] });
        break;
      }
      if (employmentKind(job) === 'gig') {
        state.gigs ??= [];
        if (state.gigs.some((gig) => gig.jobId === job.id && gig.expiresDay >= state.time.day)) return fail(input, '这项零工已经在你的安排中');
        state.gigs.push({ id: `gig.${application.applicationId}`, jobId: job.id, validFromDay: state.time.day, expiresDay: state.time.day + 6, executableDay: state.time.day, startMinute: state.time.hour * 60, endMinute: state.time.hour * 60 + job.hours * 60, pay: application.salaryRange[0], source: application.companyId });
        application.status = 'accepted';
        addLifeRecord(state, { category: 'career', title: `接下${job.name}`, detail: '一次性零工已加入工作机会', sourceId: job.id });
        break;
      }
      if (state.employment?.pendingJobId && !action.replacePending) return fail(input, '你已经准备加入另一份工作，请明确选择是否替换');
      if (state.employment?.pendingJobId && action.replacePending) {
        state.applications?.filter((entry) => entry.status === 'accepted').forEach((entry) => { entry.status = 'withdrawn'; });
      }
      application.status = 'accepted';
      if (state.employment) {
        state.employment.pendingJobId = job.id;
        state.employment.pendingCompanyId = application.companyId;
        state.employment.pendingBasePay = application.salaryRange[0];
      }
      else {
        state.currentJobId = job.id;
        state.employment = { jobId: job.id, companyId: application.companyId, basePay: application.salaryRange[0], salaryAdjustment: 0, negotiationStage: 0, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week };
      }
      state.monthlyHighlights = [...(state.monthlyHighlights ?? []), { id: `job.${application.applicationId}`, kind: 'new_job', day: state.time.day, label: job.name, sourceId: job.id }];
      addLifeRecord(state, { category: 'career', title: `接受${job.name} Offer`, detail: `${application.companyId} · ${application.route}`, sourceId: job.id, amount: application.salaryRange[0] });
      break;
    }
    case 'start_recruitment': {
      const job = find(content.jobs, action.jobId);
      if (!job) return fail(input, '找不到这份工作');
      const error = canAcceptJob(state, job, content, balance);
      if (error) return fail(input, error);
      state.activeRecruitment = { jobId: job.id, stage: 'dialogue', recruiterCharacterId: job.recruitment?.recruiterCharacterId ?? recruiterForJob(job, content), dialogueId: job.recruitment?.dialogueId };
      if (state.simulationMode === 'running') state.simulationMode = 'paused';
      break;
    }
    case 'advance_recruitment':
      if (!state.activeRecruitment || state.activeRecruitment.jobId !== action.jobId) return fail(input, '招聘流程已经变化');
      if (state.activeRecruitment.stage === 'dialogue') {
        const job = find(content.jobs, action.jobId);
        state.activeRecruitment.stage = job?.recruitment?.interview?.length ? 'interview' : 'offer';
      } else if (state.activeRecruitment.stage === 'interview') state.activeRecruitment.stage = 'offer';
      else return fail(input, '当前已经是工作邀请');
      break;
    case 'accept_job_offer': {
      if (!state.activeRecruitment || state.activeRecruitment.jobId !== action.jobId || state.activeRecruitment.stage !== 'offer') return fail(input, '请先查看完整工作邀请');
      const job = find(content.jobs, action.jobId);
      if (!job) return fail(input, '找不到这份工作');
      const error = canAcceptJob(state, job, content, balance);
      if (error) return fail(input, error);
      if (job.kind === 'regular') {
        if (state.simulationMode !== 'planning' && state.simulationMode !== 'week_complete') {
          state.employment = state.employment
            ? { ...state.employment, pendingJobId: job.id }
            : { jobId: state.currentJobId ?? job.id, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week, pendingJobId: job.id };
        } else {
          state.currentJobId = job.id;
          state.employment = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week };
        }
      }
      if (!state.unlockedJobIds.includes(job.id)) state.unlockedJobIds.push(job.id);
      state.activeRecruitment = undefined;
      addLifeRecord(state, { category: 'career', title: `接受${job.name}工作邀请`, sourceId: job.id, amount: job.basePay });
      effects.push({ type: 'message', text: state.employment?.pendingJobId ? '工作邀请已接受，下周生效' : '工作邀请已接受' });
      break;
    }
    case 'decline_job_offer':
      if (!state.activeRecruitment || state.activeRecruitment.jobId !== action.jobId) return fail(input, '招聘流程已经变化');
      state.activeRecruitment = undefined;
      break;
    case 'start_resignation': {
      if (!state.currentJobId || !state.employment) return fail(input, '当前没有可离开的工作');
      state.activeResignation = { jobId: state.currentJobId, stage: 'dialogue' };
      if (state.simulationMode === 'running') state.simulationMode = 'paused';
      break;
    }
    case 'advance_resignation':
      if (!state.activeResignation || state.activeResignation.stage !== 'dialogue') return fail(input, '离职流程已经变化');
      state.activeResignation.stage = 'outcome';
      break;
    case 'choose_resignation': {
      if (!state.activeResignation || state.activeResignation.stage !== 'outcome') return fail(input, '请先完成离职沟通');
      const job = find(content.jobs, state.activeResignation.jobId);
      if (action.choice === 'stay') {
        const employment = state.employment;
        const experience = job ? state.jobExperience[job.id] ?? 0 : 0;
        const stage = employment?.negotiationStage ?? 0;
        const basePay = employment?.basePay ?? job?.basePay ?? 0;
        if (employment && stage === 0 && experience >= 20) {
          employment.salaryAdjustment = Math.round(basePay * 0.05);
          employment.negotiationStage = 1;
          employment.lastNegotiationDay = state.time.day;
          effects.push({ type: 'message', text: '第一次薪资复核通过：基础工资上调 5%' });
        } else if (employment && stage === 1 && experience >= 60) {
          employment.salaryAdjustment = Math.round(basePay * 0.15);
          employment.negotiationStage = 2;
          employment.lastNegotiationDay = state.time.day;
          effects.push({ type: 'message', text: '第二次薪资复核通过：工资调整已达到普通上限' });
        } else {
          const bonus = job?.resignation?.retentionBonus ?? 0;
          if (bonus) {
          state.monthlyLedger.wageIncome += bonus;
          state.cash += bonus;
          recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'bonus', amount: bonus, label: '留任加薪', sourceType: 'job', sourceId: job?.id });
          effects.push({ type: 'cash', amount: bonus, reason: '留任加薪' });
          } else {
            state.reputation += 1;
            effects.push({ type: 'message', text: '公司明确表示暂时无法调整薪资；你的沟通留下了好印象，声誉 +1' });
          }
        }
      } else {
        state.currentJobId = undefined;
        state.employment = undefined;
        state.activeResignation = undefined;
        state.simulationMode = 'planning';
        effects.push({ type: 'message', text: '已完成离职，下一周可以重新安排生活' });
        break;
      }
      state.activeResignation = undefined;
      break;
    }
    case 'choose_event': {
      if (state.pendingEventId !== action.eventId) return fail(input, '当前事件已经变化');
      const event = find(content.events, action.eventId);
      const choice = event?.choices.find((entry) => entry.id === action.choiceId);
      if (!event || !choice) return fail(input, '找不到这个事件选项');
      state.pendingEventId = undefined;
      state.completedEvents = [...new Set([...state.completedEvents, event.id])];
      state.eventCooldowns[event.id] = state.time.day;
      if (event.chain) state.chainStages[event.chain.chainId] = Math.max(state.chainStages[event.chain.chainId] ?? 0, event.chain.stage);
      if (choice.nextEventId) state.pendingEventId = choice.nextEventId;
      if (choice.nextChainStage) state.chainStages[choice.nextChainStage.chainId] = choice.nextChainStage.stage;
      applyContentEffects(state, choice.effects, content, balance, effects);
      if (choice.opportunity) {
        const opportunityId = `opportunity.${event.id}.${choice.id}.${state.time.day}`;
        const { expiresInDays, ...opportunity } = choice.opportunity;
        state.opportunities = [...(state.opportunities ?? []).filter((entry) => entry.id !== opportunityId), { id: opportunityId, ...opportunity, expiresDay: state.time.day + Math.max(1, expiresInDays) }].slice(-20);
      }
      addLifeRecord(state, { category: 'event', title: event.title, detail: choice.text, sourceId: event.id });
      state.pendingReward = {
        eventId: event.id,
        lines: choice.effects.map((effect) => describeRewardEffect(effect, content)),
      };
      state.simulationMode = state.pendingEventId ? 'event' : 'reward';
      break;
    }
    case 'purchase_items': {
      const entries = Object.entries(action.items).filter(([, quantity]) => quantity > 0);
      if (!entries.length) return fail(input, '购物清单为空');
      let total = 0;
      for (const [itemId, quantity] of entries) {
        const item = find(content.items, itemId);
        if (!item) return fail(input, '购物清单中有未知商品');
        if (!Number.isInteger(quantity)) return fail(input, '商品数量必须是整数');
        if (!hasRequirements(state, item.requirements, content, balance)) return fail(input, `${item.name}暂时无法购买`);
        total += itemCost(state, item) * quantity;
      }
      if (state.cash - total < reserveRequired(state, content)) return fail(input, '请先预留下一次住房费用');
      for (const [itemId, quantity] of entries) {
        const item = find(content.items, itemId)!;
        const price = itemCost(state, item);
        state.inventory[itemId] = (state.inventory[itemId] ?? 0) + quantity;
        state.itemPurchasePrices[itemId] = price;
        item.capabilities?.forEach((capability) => { if (!state.unlockedCapabilities.includes(capability)) state.unlockedCapabilities.push(capability); });
        for (const [stat, amount] of Object.entries(item.statEffects ?? {})) {
          if (stat === 'ability') {
            applyAttributeDelta(state, 'professional', amount * quantity);
            applyAttributeDelta(state, 'knowledge', amount * quantity);
            applyAttributeDelta(state, 'communication', amount * quantity);
            applyAttributeDelta(state, 'fitness', amount * quantity);
          } else {
            state[stat as 'reputation' | 'lifestyle'] += amount * quantity;
            if (stat === 'lifestyle') applyAttributeDelta(state, 'appearance', amount * quantity);
          }
        }
        for (const [attribute, amount] of Object.entries(item.attributeEffects ?? {})) applyAttributeDelta(state, attribute as AttributeId, amount * quantity);
        effects.push({ type: 'purchase', itemId, quantity, total: price * quantity });
      }
      refreshUnlocks(state, content);
      state.cash -= total;
      for (const [itemId, quantity] of entries) {
        const item = find(content.items, itemId)!;
        const category = item.financialCategory ?? (item.category === 'collectible' ? 'collectible_transfer' : 'shopping');
        const group = groupForCategory(category);
        recordStateFinancialEntry(state, { day: state.time.day, direction: group === 'income' ? 'income' : group === 'consumption' ? 'expense' : 'transfer', category, amount: itemCost(state, item) * quantity, label: group === 'asset_allocation' ? `资产配置 · ${item.name}` : `${item.name} · 购物消费`, sourceType: 'item', sourceId: item.id });
        addLifeRecord(state, { category: 'purchase', title: `购买${item.name}`, detail: quantity > 1 ? `数量 ${quantity}` : undefined, sourceId: item.id, amount: -itemCost(state, item) * quantity });
        if (state.wishlist?.includes(item.id)) {
          state.wishlist = state.wishlist.filter((wishlistId) => wishlistId !== item.id);
          addLifeRecord(state, { category: 'purchase', title: `愿望清单完成：${item.name}`, detail: '已按计划购入', sourceId: item.id });
        }
      }
      effects.push({ type: 'cash', amount: -total, reason: '购物结算' });
      break;
    }
    case 'use_item': {
      const item = find(content.items, action.itemId);
      const quantity = action.quantity ?? 1;
      if (!item || !item.consumable) return fail(input, '这件商品不能直接使用');
      if (!Number.isInteger(quantity) || quantity <= 0 || (state.inventory[item.id] ?? 0) < quantity) return fail(input, '可使用数量不足');
      state.inventory[item.id] -= quantity;
      if (item.lifestyleDelta) state.lifestyle += item.lifestyleDelta * quantity;
      for (const [stat, amount] of Object.entries(item.statEffects ?? {})) {
        if (stat === 'lifestyle') state.lifestyle += amount * quantity;
        if (stat === 'reputation') state.reputation += amount * quantity;
        if (stat === 'ability') applyAttributeDelta(state, 'knowledge', amount * quantity);
      }
      for (const [attribute, amount] of Object.entries(item.attributeEffects ?? {})) applyAttributeDelta(state, attribute as AttributeId, amount * quantity);
      applyContentEffects(state, item.effects ?? [], content, balance, effects);
      addLifeRecord(state, { category: 'purchase', title: `使用${item.name}`, detail: quantity > 1 ? `数量 ${quantity}` : '已从库存消耗', sourceId: item.id });
      effects.push({ type: 'message', text: `已使用${item.name}` });
      break;
    }
    case 'sell_item': {
      const item = find(content.items, action.itemId);
      if (!item || !item.sellable) return fail(input, '这件商品不能出售');
      if (!Number.isInteger(action.quantity) || action.quantity <= 0 || (state.inventory[action.itemId] ?? 0) < action.quantity) return fail(input, '出售数量无效');
      const total = Math.round((state.itemPurchasePrices[action.itemId] ?? item.price) * item.resaleRatio * action.quantity);
      state.inventory[action.itemId] -= action.quantity;
      state.cash += total;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'asset_liquidation', amount: total, label: `出售${item.name}`, sourceType: 'item', sourceId: item.id });
      addLifeRecord(state, { category: 'purchase', title: `出售${item.name}`, detail: action.quantity > 1 ? `数量 ${action.quantity}` : '已从库存出售', sourceId: item.id, amount: total });
      effects.push({ type: 'cash', amount: total, reason: '出售商品' });
      break;
    }
    case 'manage_wishlist': {
      const item = find(content.items, action.itemId);
      if (!item) return fail(input, '找不到这件商品');
      state.wishlist ??= [];
      if (action.enabled) {
        if (state.inventory[item.id]) return fail(input, '已经拥有这件商品');
        if (!state.wishlist.includes(item.id)) state.wishlist.push(item.id);
        effects.push({ type: 'message', text: `已加入愿望清单：${item.name}` });
      } else {
        state.wishlist = state.wishlist.filter((wishlistId) => wishlistId !== item.id);
        effects.push({ type: 'message', text: `已移出愿望清单：${item.name}` });
      }
      break;
    }
    case 'use_service': {
      const service = content.services?.find((entry) => entry.id === action.serviceId);
      if (!service) return fail(input, '找不到这项服务');
      if (!hasRequirements(state, service.requirements, content, balance)) return fail(input, '当前条件还不满足');
      if (state.cash < service.price) return fail(input, '现金不足以使用这项服务');
      state.cash -= service.price;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: service.financialCategory ?? 'service', amount: service.price, label: service.name, sourceType: 'service', sourceId: service.id });
      applyContentEffects(state, service.effects ?? [], content, balance, effects);
      addLifeRecord(state, { category: 'service', title: service.name, detail: '服务已完成', sourceId: service.id, amount: -service.price });
      effects.push({ type: 'cash', amount: -service.price, reason: `${service.name}结算` });
      break;
    }
    case 'manage_subscription': {
      const subscription = content.subscriptions?.find((entry) => entry.id === action.subscriptionId);
      if (!subscription) return fail(input, '找不到这项订阅');
      state.activeSubscriptions ??= {};
      if (action.enabled) {
        if (state.activeSubscriptions[subscription.id]) return fail(input, '这项订阅已经开通');
        if (!hasRequirements(state, subscription.requirements, content, balance)) return fail(input, '当前条件还不满足');
        state.activeSubscriptions[subscription.id] = { subscriptionId: subscription.id, startedDay: state.time.day };
        applyContentEffects(state, subscription.effects ?? [], content, balance, effects);
        addLifeRecord(state, { category: 'service', title: `开通${subscription.name}`, detail: `每月 ¥${subscription.monthlyFee}`, sourceId: subscription.id });
        effects.push({ type: 'message', text: `已开通${subscription.name}` });
      } else {
        if (!state.activeSubscriptions[subscription.id]) return fail(input, '这项订阅尚未开通');
        delete state.activeSubscriptions[subscription.id];
        addLifeRecord(state, { category: 'service', title: `取消${subscription.name}`, sourceId: subscription.id });
        effects.push({ type: 'message', text: `已取消${subscription.name}` });
      }
      break;
    }
    case 'move_housing': {
      const home = find(content.housing, action.housingId);
      if (!home) return fail(input, '找不到这套住房');
      if (state.mortgage) return fail(input, '当前有未结清的住房分期');
      if (home.mode !== 'both' && home.mode !== action.mode) return fail(input, '这套住房不支持该方式');
      if (!state.unlockedHousingIds.includes(home.id) && home.id !== state.housing.housingId) return fail(input, '这套住房还没有解锁');
      if (!hasRequirements(state, home.requirements, content, balance)) return fail(input, '当前条件还不满足');
      const price = action.mode === 'owned' ? (housingPrice(state, home) ?? Number.MAX_SAFE_INTEGER) : 0;
      if (state.cash - price < reserveRequired(state, content)) return fail(input, '现金不足以负担住房变更');
      state.cash -= price;
      state.housing = { housingId: home.id, mode: action.mode };
      if (!state.unlockedHousingIds.includes(home.id)) state.unlockedHousingIds.push(home.id);
      if (price) effects.push({ type: 'cash', amount: -price, reason: '住房购买' });
      if (price) recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'property_transfer', amount: price, label: `购买${home.name}`, sourceType: 'housing', sourceId: home.id });
      addLifeRecord(state, { category: 'housing', title: action.mode === 'owned' ? `买下${home.name}` : `搬到${home.name}`, detail: action.mode === 'owned' ? '自有住房' : '租住', sourceId: home.id, amount: price ? -price : undefined });
      break;
    }
    case 'finance_housing': {
      const home = find(content.housing, action.housingId);
      if (!home || home.mode !== 'both' || !home.price) return fail(input, '这套住房不支持分期购买');
      if (!state.unlockedHousingIds.includes(home.id) && home.id !== state.housing.housingId) return fail(input, '这套住房还没有解锁');
      if (!hasRequirements(state, home.requirements, content, balance)) return fail(input, '当前条件还不满足');
      if (state.housing.mode === 'owned' || state.mortgage) return fail(input, '当前已有自有住房或未结清分期');
      const terms = housingMortgageTerms(state, home)!;
      if (state.cash - terms.downPayment < reserveRequired(state, content)) return fail(input, '现金不足以支付首付并保留生活余量');
      state.cash -= terms.downPayment;
      state.housing = { housingId: home.id, mode: 'owned' };
      state.mortgage = { housingId: home.id, remainingPrincipal: terms.principal, monthlyPayment: terms.monthlyPayment, totalMonths: terms.totalMonths, paidMonths: 0 };
      if (!state.unlockedHousingIds.includes(home.id)) state.unlockedHousingIds.push(home.id);
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'property_transfer', amount: terms.downPayment, label: `支付${home.name}首付`, sourceType: 'housing', sourceId: home.id });
      addLifeRecord(state, { category: 'housing', title: `分期买下${home.name}`, detail: `首付 ¥${terms.downPayment.toLocaleString('zh-CN')} · 剩余本金 ¥${terms.principal.toLocaleString('zh-CN')} · 每月约 ¥${terms.monthlyPayment.toLocaleString('zh-CN')}`, sourceId: home.id, amount: -terms.downPayment });
      effects.push({ type: 'cash', amount: -terms.downPayment, reason: '住房首付' });
      break;
    }
    case 'sell_housing': {
      const currentHome = find(content.housing, state.housing.housingId);
      if (!currentHome || state.housing.mode !== 'owned' || !currentHome.price) return fail(input, '当前没有可出售的自有住房');
      const saleValue = currentHome.valuation || currentHome.price;
      const fallback = content.housing.find((home) => home.id === balance.startingHousingId && (home.mode === 'rent' || home.mode === 'both')) ?? content.housing.find((home) => home.mode === 'rent' || home.mode === 'both');
      if (!fallback) return fail(input, '出售后找不到可租住的住房');
      const mortgageBalance = state.mortgage?.housingId === currentHome.id ? state.mortgage.remainingPrincipal : 0;
      const netSaleValue = Math.max(0, saleValue - mortgageBalance);
      state.cash += netSaleValue;
      state.housing = { housingId: fallback.id, mode: 'rent' };
      delete state.mortgage;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'asset_liquidation', amount: netSaleValue, label: `出售${currentHome.name}`, sourceType: 'housing', sourceId: currentHome.id, costBasis: currentHome.price });
      addLifeRecord(state, { category: 'housing', title: `出售${currentHome.name}`, detail: `偿还剩余本金 ¥${mortgageBalance.toLocaleString('zh-CN')} · 搬回${fallback.name}租住`, sourceId: currentHome.id, amount: netSaleValue });
      effects.push({ type: 'cash', amount: netSaleValue, reason: '出售住房' });
      break;
    }
    case 'buy_business': {
      const business = find(content.businesses, action.businessId);
      if (!business || !state.unlockedBusinessIds.includes(action.businessId)) return fail(input, '这项生意还没有解锁');
      if (!hasRequirements(state, business.requirements, content, balance)) return fail(input, '经营条件还不满足');
      if (state.cash - business.price < reserveRequired(state, content)) return fail(input, '现金不足以购买这项生意');
      state.cash -= business.price;
      state.businesses[action.businessId] = { businessId: action.businessId, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: business.price, capitalInvested: 0, equityPercent: 100, fundingRaised: 0, fundingRound: 0 };
      if (business.locationId) recordLocationVisit(state, business.locationId, content);
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'business_transfer', amount: business.price, label: `购买${business.name}`, sourceType: 'business', sourceId: business.id });
      addLifeRecord(state, { category: 'business', title: `买入${business.name}`, sourceId: business.id, amount: -business.price });
      effects.push({ type: 'cash', amount: -business.price, reason: '购买生意' });
      break;
    }
    case 'acquire_business': {
      const business = find(content.businesses, action.businessId);
      const parentBusinessId = Object.keys(state.businesses)[0];
      const acquisitionPrice = business ? Math.round(business.price * 1.1) : 0;
      if (!business || !state.unlockedBusinessIds.includes(action.businessId)) return fail(input, '这项生意还没有解锁');
      if (!parentBusinessId) return fail(input, '需要先拥有一家企业才能发起并购');
      if (state.businesses[action.businessId]) return fail(input, '这项企业已经在你的企业组合中');
      if (!hasRequirements(state, business.requirements, content, balance)) return fail(input, '并购条件还不满足');
      if (state.cash - acquisitionPrice < reserveRequired(state, content)) return fail(input, '现金不足以完成并购');
      state.cash -= acquisitionPrice;
      state.businesses[action.businessId] = { businessId: action.businessId, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: acquisitionPrice, capitalInvested: 0, equityPercent: 100, fundingRaised: 0, fundingRound: 0, acquiredDay: state.time.day, acquiredFromBusinessId: parentBusinessId };
      if (business.locationId) recordLocationVisit(state, business.locationId, content);
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'business_transfer', amount: acquisitionPrice, label: `并购${business.name}`, sourceType: 'business', sourceId: business.id, cashDelta: -acquisitionPrice });
      addLifeRecord(state, { category: 'business', title: `并购${business.name}`, detail: `纳入${content.businesses.find((entry) => entry.id === parentBusinessId)?.name ?? parentBusinessId}企业组合`, sourceId: business.id, amount: -acquisitionPrice });
      effects.push({ type: 'cash', amount: -acquisitionPrice, reason: '企业并购' });
      break;
    }
    case 'update_business': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      if (!holding || !business) return fail(input, '还没有这项生意');
      if (![action.priceLevel, action.wageLevel, action.inventoryLevel].every(Number.isInteger)) return fail(input, '经营参数无效');
      if (action.priceLevel < 0 || action.priceLevel >= business.priceLevels.length || action.wageLevel < 0 || action.wageLevel >= business.wageLevels.length || action.inventoryLevel < 0 || action.inventoryLevel >= business.inventoryLevels.length) return fail(input, '经营参数超出范围');
      holding.priceLevel = action.priceLevel;
      holding.wageLevel = action.wageLevel;
      holding.inventoryLevel = action.inventoryLevel;
      addLifeRecord(state, { category: 'business', title: `调整${business.name}经营`, detail: `定价 ${action.priceLevel + 1} · 人员 ${action.wageLevel + 1} · 备货 ${action.inventoryLevel + 1}`, sourceId: business.id });
      effects.push({ type: 'message', text: `${business.name}经营方案已更新` });
      break;
    }
    case 'inject_business_capital': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      const amount = Math.round(action.amount);
      if (!holding || !business) return fail(input, '还没有这项生意');
      if (!Number.isFinite(amount) || amount <= 0) return fail(input, '投入资本必须为正数');
      if (state.cash - amount < reserveRequired(state, content)) return fail(input, '现金不足以投入企业资本');
      state.cash -= amount;
      holding.capitalInvested = (holding.capitalInvested ?? 0) + amount;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'business_transfer', amount, label: `投入${business.name}资本`, sourceType: 'business', sourceId: business.id, cashDelta: -amount });
      addLifeRecord(state, { category: 'business', title: `投入${business.name}资本`, detail: '企业资本投入，不计入日常经营费用', sourceId: business.id, amount: -amount });
      effects.push({ type: 'cash', amount: -amount, reason: '企业资本投入' });
      break;
    }
    case 'raise_business_funding': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      if (!holding || !business) return fail(input, '还没有这项生意');
      const fundingRound = holding.fundingRound ?? 0;
      if (fundingRound >= 3) return fail(input, '这项企业已达到融资轮次上限');
      const amount = Math.max(1000, Math.round(business.price * [0.75, 1, 1.5][fundingRound]));
      const previousEquity = holding.equityPercent ?? 100;
      const dilution = [20, 15, 15][fundingRound];
      holding.fundingRaised = (holding.fundingRaised ?? 0) + amount;
      holding.fundingRound = fundingRound + 1;
      holding.equityPercent = Math.max(0, previousEquity - dilution);
      state.cash += amount;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'business_transfer', amount, label: `${business.name}完成融资`, sourceType: 'business', sourceId: business.id, cashDelta: amount });
      addLifeRecord(state, { category: 'business', title: `${business.name}完成融资`, detail: `获得 ${amount}，持股 ${holding.equityPercent}%（稀释 ${dilution}%）`, sourceId: business.id, amount });
      effects.push({ type: 'cash', amount, reason: '企业融资到账' });
      break;
    }
    case 'list_business': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      if (!holding || !business) return fail(input, '还没有这项生意');
      if (holding.listed) return fail(input, '这项企业已经上市');
      if ((holding.fundingRound ?? 0) < 2) return fail(input, '企业至少完成两轮融资后才能上市');
      holding.listed = true;
      holding.listedDay = state.time.day;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'business_transfer', amount: 0, label: `${business.name}完成上市`, sourceType: 'business', sourceId: business.id, cashDelta: 0 });
      addLifeRecord(state, { category: 'business', title: `${business.name}完成上市`, detail: '企业股权进入公开交易状态', sourceId: business.id });
      effects.push({ type: 'message', text: `${business.name}已完成上市，公开股权可以分批变现` });
      break;
    }
    case 'sell_business_equity': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      const percent = Math.round(action.percent);
      if (!holding || !business) return fail(input, '还没有这项生意');
      if (!holding.listed) return fail(input, '企业尚未上市');
      if (holding.listedDay && state.time.day < holding.listedDay + 28) return fail(input, '上市股权仍在锁定期内');
      if (!Number.isInteger(action.percent) || percent <= 0 || percent >= (holding.equityPercent ?? 100)) return fail(input, '出售股权比例无效');
      const valuation = (holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balance.businessValuationRatio;
      const saleValue = Math.max(0, Math.round(valuation * percent / 100));
      holding.equityPercent = Math.max(0, (holding.equityPercent ?? 100) - percent);
      state.cash += saleValue;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', group: 'asset_liquidation', category: 'business_transfer', amount: saleValue, label: `出售${business.name} ${percent}%股权`, sourceType: 'business', sourceId: business.id, cashDelta: saleValue });
      addLifeRecord(state, { category: 'business', title: `出售${business.name} ${percent}% 股权`, detail: `上市后部分变现，剩余持股 ${holding.equityPercent}%`, sourceId: business.id, amount: saleValue });
      effects.push({ type: 'cash', amount: saleValue, reason: '出售公开股权' });
      break;
    }
    case 'buy_business_equity': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      const percent = Math.round(action.percent);
      const currentEquity = holding?.equityPercent ?? 100;
      if (!holding || !business) return fail(input, '还没有这项生意');
      if (!holding.listed) return fail(input, '企业尚未上市');
      if (holding.listedDay && state.time.day < holding.listedDay + 28) return fail(input, '上市股权仍在锁定期内');
      if (!Number.isInteger(action.percent) || percent <= 0 || percent > 100 - currentEquity) return fail(input, '可回购的流通股不足');
      const valuation = (holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balance.businessValuationRatio;
      const purchaseValue = Math.max(0, Math.round(valuation * percent / 100));
      if (state.cash - purchaseValue < reserveRequired(state, content)) return fail(input, '现金不足以回购企业股权');
      holding.equityPercent = Math.min(100, currentEquity + percent);
      state.cash -= purchaseValue;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', group: 'asset_allocation', category: 'business_transfer', amount: purchaseValue, label: `回购${business.name} ${percent}%股权`, sourceType: 'business', sourceId: business.id, cashDelta: -purchaseValue });
      addLifeRecord(state, { category: 'business', title: `回购${business.name} ${percent}% 股权`, detail: `公开市场回购，当前持股 ${holding.equityPercent}%`, sourceId: business.id, amount: -purchaseValue });
      effects.push({ type: 'cash', amount: -purchaseValue, reason: '回购公开股权' });
      break;
    }
    case 'sell_business': {
      const holding = state.businesses[action.businessId];
      const business = find(content.businesses, action.businessId);
      if (!holding || !business) return fail(input, '还没有这项生意');
      const equity = Math.min(100, Math.max(0, holding.equityPercent ?? 100)) / 100;
      const saleValue = Math.max(0, Math.round((holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balance.businessValuationRatio * equity));
      delete state.businesses[action.businessId];
      state.cash += saleValue;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', group: 'asset_liquidation', category: 'business_transfer', amount: saleValue, label: `退出${business.name}`, sourceType: 'business', sourceId: business.id, cashDelta: saleValue });
      addLifeRecord(state, { category: 'business', title: `退出${business.name}`, detail: `按持股 ${Math.round(equity * 100)}% 变现`, sourceId: business.id, amount: saleValue });
      effects.push({ type: 'cash', amount: saleValue, reason: '企业退出变现' });
      break;
    }
    case 'buy_asset': {
      const asset = find(content.assets, action.assetId);
      if (!asset || !state.unlockedAssetIds.includes(action.assetId)) return fail(input, '这项资产还没有解锁');
      if (!hasRequirements(state, asset.requirements, content, balance) || state.cash - asset.price < reserveRequired(state, content)) return fail(input, '当前条件或现金不足');
      state.cash -= asset.price;
      state.assets[action.assetId] = { assetId: asset.id, purchasePrice: asset.price, purchaseDay: state.time.day, currentValuation: asset.valuation };
      const assetCategory = asset.kind === 'rental' ? 'property_transfer' : asset.kind === 'collectible' ? 'collectible_transfer' : 'investment_transfer';
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: assetCategory, amount: asset.price, label: `购买${asset.name}`, sourceType: 'asset', sourceId: asset.id });
      addLifeRecord(state, { category: 'asset', title: `买入${asset.name}`, sourceId: asset.id, amount: -asset.price });
      effects.push({ type: 'cash', amount: -asset.price, reason: '购买资产' });
      break;
    }
    case 'sell_asset': {
      const holding = state.assets[action.assetId];
      if (!holding) return fail(input, '还没有这项资产');
      const asset = content.assets.find((entry) => entry.id === action.assetId);
      state.cash += holding.currentValuation;
      delete state.assets[action.assetId];
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'asset_liquidation', amount: holding.currentValuation, label: `出售资产`, sourceType: 'asset', sourceId: action.assetId });
      const realized = holding.currentValuation - holding.purchasePrice;
      if (realized > 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'realized_gain', amount: realized, cashDelta: 0, label: `已实现收益 · ${asset?.name ?? '资产'}`, sourceType: 'asset', sourceId: action.assetId, costBasis: holding.purchasePrice });
      if (realized < 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'realized_loss', amount: -realized, cashDelta: 0, label: `已实现亏损 · ${asset?.name ?? '资产'}`, sourceType: 'asset', sourceId: action.assetId, costBasis: holding.purchasePrice });
      addLifeRecord(state, { category: 'asset', title: `出售${asset?.name ?? '资产'}`, sourceId: action.assetId, amount: holding.currentValuation });
      effects.push({ type: 'cash', amount: holding.currentValuation, reason: '出售资产' });
      break;
    }
    case 'buy_investment': {
      const investment = content.investments?.find((entry) => entry.id === action.investmentId);
      if (!investment || !Number.isInteger(action.units) || action.units < investment.minimumUnits) return fail(input, '投资数量无效');
      if (!hasRequirements(state, investment.requirements, content, balance)) return fail(input, '当前条件还不满足');
      const unitValue = Math.round(investmentUnitValue(investment, state.rng.seed, state.time.day));
      const total = unitValue * action.units;
      if (state.cash - total < reserveRequired(state, content)) return fail(input, '现金不足以完成这项投资');
      state.cash -= total;
      const previous = state.investments?.[investment.id];
      const previousUnits = previous?.units ?? 0;
      state.investments ??= {};
      state.investments[investment.id] = {
        investmentId: investment.id,
        units: previousUnits + action.units,
        averageCost: previous ? Math.round((previous.averageCost * previousUnits + unitValue * action.units) / (previousUnits + action.units)) : unitValue,
        currentValuation: unitValue * (previousUnits + action.units),
        lastValuationDay: state.time.day,
      };
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'investment_transfer', amount: total, label: `买入${investment.name}`, sourceType: 'investment', sourceId: investment.id });
      addLifeRecord(state, { category: 'investment', title: `买入${investment.name}`, detail: `${action.units} 份`, sourceId: investment.id, amount: -total });
      effects.push({ type: 'cash', amount: -total, reason: '投资配置' });
      break;
    }
    case 'interact_character': {
      const interaction = content.relationshipInteractions?.find((entry) => entry.id === action.interactionId);
      const option = interaction?.options.find((entry) => entry.id === action.optionId);
      if (!interaction || !option || interaction.characterId === undefined) return fail(input, '找不到这项互动');
      if (!hasRequirements(state, option.requirements, content, balance)) return fail(input, '当前关系或条件还不满足');
      if (state.cash < option.cashCost) return fail(input, '现金不足以完成这次互动');
      const character = content.characters.find((entry) => entry.id === interaction.characterId);
      const preferred = character?.preferredInteractionCategories?.includes(interaction.category) ?? false;
      const recentRepeats = (state.lifeHistory ?? []).filter((entry) => entry.category === 'relationship' && entry.sourceId === interaction.id && entry.day >= state.time.day - 30).length;
      const relationshipMultiplier = Math.max(0.25, 1 - recentRepeats * 0.25);
      state.cash -= option.cashCost;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'social', amount: option.cashCost, label: `${interaction.name} · ${option.label}`, sourceType: 'relationship', sourceId: interaction.id });
      const interactionEffects = (preferred ? (option.effects ?? []).map((effect) => effect.type === 'relation' ? { ...effect, amount: effect.amount + 2 } : effect) : option.effects ?? []).map((effect) => effect.type === 'relation' ? { ...effect, amount: Math.max(1, Math.round(effect.amount * relationshipMultiplier)) } : effect);
      applyContentEffects(state, interactionEffects, content, balance, effects);
      addLifeRecord(state, { category: 'relationship', title: `${interaction.name} · ${option.label}`, detail: `${preferred ? '符合对方偏好，关系进展更顺利' : '关系留下了新的进展'}${recentRepeats > 0 ? '；近期重复互动收益递减' : ''}`, sourceId: interaction.id, amount: option.cashCost ? -option.cashCost : undefined });
      state.messages = [...(state.messages ?? []), { id: `message.${interaction.id}.${state.time.day}.${(state.messages ?? []).length + 1}`, day: state.time.day, characterId: interaction.characterId, title: `${character?.name ?? '联系人'}发来新消息`, body: `${option.label}之后，对方想继续和你保持联系。`, sourceId: interaction.id, read: false }].slice(-30);
      effects.push({ type: 'message', text: `${interaction.name}完成，${preferred ? '符合对方偏好，' : ''}关系留下了新的进展` });
      break;
    }
    case 'read_message': {
      const message = state.messages?.find((entry) => entry.id === action.messageId);
      if (!message) return fail(input, '找不到这条消息');
      if (!message.read) {
        message.read = true;
        addLifeRecord(state, { category: 'relationship', title: `查看消息：${message.title}`, detail: message.body, sourceId: message.sourceId ?? message.characterId });
      }
      break;
    }
    case 'start_storyline': {
      const storyline = getStoryline(content, action.storylineId);
      if (!storyline) return fail(input, '找不到这段故事');
      const current = state.storylineStages?.[storyline.id];
      if (current) return fail(input, '这段故事已经开始');
      state.storylineStages ??= {};
      state.storylineStages[storyline.id] = storyline.initialStageId;
      addLifeRecord(state, { category: 'relationship', title: `开始故事：${storyline.name}`, sourceId: storyline.id });
      effects.push({ type: 'message', text: `${storyline.name}已进入你的生活` });
      break;
    }
    case 'choose_storyline_branch': {
      const storyline = getStoryline(content, action.storylineId);
      const stage = getStorylineStage(content, state, action.storylineId);
      const branch = stage?.branches?.find((entry) => entry.id === action.branchId);
      if (!storyline || !stage || !branch?.nextStageId) return fail(input, '当前没有这项故事选择');
      if (branch.condition && !hasRequirements(state, branch.condition, content, balance)) return fail(input, '当前条件还不满足');
      if (!advanceStorylineStage(state, content, storyline.id, branch.nextStageId)) return fail(input, '故事阶段已失效');
      applyContentEffects(state, branch.effects ?? [], content, balance, effects);
      if (branch.opportunity) {
        const opportunityId = `opportunity.${storyline.id}.${branch.id}.${state.time.day}`;
        const { expiresInDays, ...opportunity } = branch.opportunity;
        state.opportunities = [...(state.opportunities ?? []).filter((entry) => entry.id !== opportunityId), { id: opportunityId, ...opportunity, expiresDay: state.time.day + Math.max(1, expiresInDays) }].slice(-20);
      }
      addLifeRecord(state, { category: 'relationship', title: `${storyline.name}：${branch.text ?? '作出选择'}`, detail: `进入阶段 ${branch.nextStageId}`, sourceId: storyline.id });
      effects.push({ type: 'message', text: `${storyline.name}进入下一段` });
      break;
    }
    case 'sell_investment': {
      const investment = content.investments?.find((entry) => entry.id === action.investmentId);
      const holding = state.investments?.[action.investmentId];
      if (!investment || !holding || !Number.isInteger(action.units) || action.units <= 0 || action.units > holding.units) return fail(input, '出售数量无效');
      const unitValue = Math.round(investmentUnitValue(investment, state.rng.seed, state.time.day));
      const total = unitValue * action.units;
      const costBasis = holding.averageCost * action.units;
      const realized = total - costBasis;
      holding.units -= action.units;
      holding.currentValuation = unitValue * holding.units;
      holding.lastValuationDay = state.time.day;
      if (holding.units === 0) delete state.investments![action.investmentId];
      state.cash += total;
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'transfer', category: 'asset_liquidation', amount: total, costBasis, label: `资产变现 · ${investment.name}`, sourceType: 'investment', sourceId: investment.id });
      if (realized > 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'realized_gain', amount: realized, cashDelta: 0, label: `已实现收益 · ${investment.name}`, sourceType: 'investment', sourceId: investment.id });
      if (realized < 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'realized_loss', amount: -realized, cashDelta: 0, label: `已实现亏损 · ${investment.name}`, sourceType: 'investment', sourceId: investment.id });
      addLifeRecord(state, { category: 'investment', title: `卖出${investment.name}`, detail: `${action.units} 份`, sourceId: investment.id, amount: total });
      effects.push({ type: 'cash', amount: total, reason: '投资退出' });
      break;
    }
    case 'execute_gig': {
      const gig = state.gigs?.find((entry) => entry.id === action.gigId);
      const job = gig ? find(content.jobs, gig.jobId) : undefined;
      if (!gig || !job || state.time.day < gig.validFromDay || state.time.day > gig.expiresDay) return fail(input, '这项零工已过期');
      state.cash += gig.pay;
      applyCareerExperience(state, job.experienceTags ?? [], job.careerXp);
      recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'side_job', amount: gig.pay, label: `${job.name}结算`, sourceType: 'job', sourceId: job.id });
      addLifeRecord(state, { category: 'career', title: `完成${job.name}`, detail: '一次性零工已结算', sourceId: job.id, amount: gig.pay });
      state.monthlyHighlights = [...(state.monthlyHighlights ?? []), { id: `gig.completed.${gig.id}`, kind: 'gig_completed', day: state.time.day, label: `完成零工 · ${job.name}`, sourceId: job.id }];
      state.gigs = (state.gigs ?? []).filter((entry) => entry.id !== gig.id);
      effects.push({ type: 'cash', amount: gig.pay, reason: `${job.name}结算` });
      break;
    }
    case 'work':
    case 'study':
    case 'rest':
      return fail(input, '请通过周计划自动运行');
    case 'set_flag':
      state.flags[action.flag] = action.value;
      break;
    default:
      return fail(input, '无法识别的行动');
  }
  syncLegacyMonthlyLedger(state, content, balance);
  return { state, effects };
}

function describeRewardEffect(effect: EffectDefinition, content: ContentRegistry): string {
  const signed = (amount: number) => `${amount >= 0 ? '+' : ''}${amount}`;
  const attributeNames: Record<string, string> = { professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情' };
  if (effect.type === 'cash') return `${signed(Math.round(effect.amount))}¥ 现金`;
  if (effect.type === 'stat') return `${effect.stat === 'ability' ? '能力' : effect.stat === 'reputation' ? '声誉' : '生活水平'} ${signed(effect.amount)}`;
  if (effect.type === 'attribute') return `${attributeNames[effect.attribute] ?? effect.attribute} ${signed(effect.amount)}`;
  if (effect.type === 'relation') {
    const character = content.characters.find((entry) => entry.id === effect.characterId);
    return `${character?.name ?? '关系'} ${signed(effect.amount)}`;
  }
  if (effect.type === 'item') {
    const item = content.items.find((entry) => entry.id === effect.itemId);
    return `获得 ${item?.name ?? effect.itemId} ×${effect.quantity}`;
  }
  if (effect.type === 'unlock_job') return `解锁职位：${content.jobs.find((entry) => entry.id === effect.jobId)?.name ?? effect.jobId}`;
  if (effect.type === 'unlock_event') return '解锁新的生活机会';
  if (effect.type === 'unlock_housing') return `解锁住房：${content.housing.find((entry) => entry.id === effect.housingId)?.name ?? effect.housingId}`;
  if (effect.type === 'unlock_business') return `解锁企业：${content.businesses.find((entry) => entry.id === effect.businessId)?.name ?? effect.businessId}`;
  if (effect.type === 'unlock_asset') return `解锁资产：${content.assets.find((entry) => entry.id === effect.assetId)?.name ?? effect.assetId}`;
  if (effect.type === 'unlock_capability') return '获得新的能力与机会';
  if (effect.type === 'discount') return `获得 ${effect.percent}% 商品折扣`;
  if (effect.type === 'modifier') return '获得永久成长加成';
  if (effect.type === 'advance_chain') return '故事进入下一阶段';
  if (effect.type === 'advance_time') return `安排提前 ${effect.hours} 小时完成`;
  if (effect.type === 'location_development') return `${content.locations?.find((location) => location.id === effect.locationId)?.name ?? effect.locationId}发展 ${effect.amount >= 0 ? '+' : ''}${effect.amount}`;
  if (effect.type === 'set_flag') return '留下了一项长期进展';
  return '生活有了新的进展';
}

export function getNetWorth(state: GameState, content: ContentRegistry, balance: BalanceConfig): number {
  return calculateNetWorth(state, content, balance);
}

export function getItemCost(state: GameState, item: ItemDefinition): number {
  return itemCost(state, item);
}

export type { PlannedActivity };
