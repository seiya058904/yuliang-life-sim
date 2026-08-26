import type { BalanceConfig } from '../balance/config';
import type { AcquisitionHint, ApplicationRoute, ConditionDefinition, ContentId, ContentRegistry, GameState, JobDefinition, VacancyState, VacancyTemplate, ViewId } from '../content/contracts';
import { getAttribute } from './attributes';
import { currentMonthlySalary, evaluateCondition, getPlayerStage } from './conditions';
import { requirementForJob } from './careerProgression';

export interface CompetitivenessResult {
  tier: 'minimum' | 'competitive' | 'strong' | 'exceptional';
  probabilityBand: number;
  factors: string[];
  strengths: string[];
  weaknesses: string[];
}

export function employmentKind(job: JobDefinition): 'full_time' | 'repeatable_side_job' | 'gig' {
  if (job.employmentKind) return job.employmentKind;
  if (job.kind === 'temporary') return 'gig';
  return job.kind === 'freelance' ? 'repeatable_side_job' : 'full_time';
}

export function generateVacancies(state: GameState, content: ContentRegistry, balance: BalanceConfig): VacancyState[] {
  const templates = content.vacancyTemplates?.length ? content.vacancyTemplates : fallbackTemplates(content);
  const [minimum, maximum] = balance.vacancyCountRange;
  const count = minimum + stableNumber(state.rng.seed, state.calendar.month, maximum - minimum + 1);
  const selected = templates
    .map((template, index) => ({ template, score: stableNumber(state.rng.seed + index * 37, state.calendar.month, 10_000) }))
    .sort((left, right) => left.score - right.score)
    .slice(0, Math.min(count, templates.length))
    .map(({ template }) => vacancyFromTemplate(template, state.calendar.month, content, balance));

  const officeTemplates = templates.filter((template) => template.jobId === 'job.seed-office').slice(0, 2);
  for (const template of officeTemplates) {
    const vacancy = vacancyFromTemplate(template, state.calendar.month, content, balance);
    if (!selected.some((entry) => entry.vacancyId === vacancy.vacancyId)) selected.unshift(vacancy);
  }
  const starterTemplate = templates.find((template) => template.jobId === 'job.seed-warehouse')
    ?? templates.find((template) => content.jobs.find((job) => job.id === template.jobId)?.tags?.includes('starter'));
  if (starterTemplate) {
    const vacancy = vacancyFromTemplate(starterTemplate, state.calendar.month, content, balance);
    if (!selected.some((entry) => entry.vacancyId === vacancy.vacancyId)) selected.unshift(vacancy);
  }
  const guaranteedRoutes = [
    'job.regional-operations-manager',
    'job.category-operations-expert',
    'job.huanliu-warehouse-assistant',
    'job.huanliu-dispatch-coordinator',
    'job.course-operations-assistant',
    'job.course-teaching-assistant',
  ];
  const protectedJobIds = new Set([starterTemplate?.jobId, ...officeTemplates.map((template) => template.jobId)]);
  for (const jobId of guaranteedRoutes) {
    const template = templates.find((entry) => entry.jobId === jobId);
    if (!template) continue;
    if (!selected.some((entry) => entry.jobId === jobId)) {
      const vacancy = vacancyFromTemplate(template, state.calendar.month, content, balance);
      const replacementIndex = selected.findIndex((entry) => !protectedJobIds.has(entry.jobId));
      if (replacementIndex >= 0) selected[replacementIndex] = vacancy;
      else if (selected.length < maximum) selected.push(vacancy);
    }
    protectedJobIds.add(jobId);
  }
  const prioritized = [
    ...officeTemplates.map((template) => selected.find((entry) => entry.vacancyId === `vacancy.${template.id}.${state.calendar.month}`)),
    selected.find((entry) => entry.jobId === starterTemplate?.jobId),
    ...guaranteedRoutes.map((jobId) => selected.find((entry) => entry.jobId === jobId)),
  ].filter((entry): entry is VacancyState => Boolean(entry));
  const prioritizedIds = new Set(prioritized.map((entry) => entry.vacancyId));
  const remainder = selected.filter((entry) => !prioritizedIds.has(entry.vacancyId));
  return [...prioritized, ...remainder].slice(0, Math.min(maximum, templates.length));
}

export function evaluateApplicationCompetitiveness(job: JobDefinition, state: GameState, _content: ContentRegistry, balance: BalanceConfig, route: ApplicationRoute): CompetitivenessResult {
  const factors: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const abilityRequired = job.abilityRequired ?? 0;
  const reputationRequired = job.reputationRequired ?? 0;
  const abilitySurplus = Math.max(0, state.ability - abilityRequired);
  const reputationSurplus = Math.max(0, state.reputation - reputationRequired);
  const communication = state.attributes?.communication ?? 0;
  const experience = state.jobExperience[job.id] ?? 0;
  const taggedRequirements = requirementForJob(job, state);
  let score = balance.competitiveness.minimum;

  if (abilitySurplus > 0 || reputationSurplus > 0) {
    factors.push('条件超出门槛');
    score += Math.min(0.12, abilitySurplus / Math.max(abilityRequired, 1) * 0.12 + reputationSurplus / Math.max(reputationRequired || 1, 1) * 0.06);
  }
  if (experience >= 20) {
    factors.push('相关工作经验');
    strengths.push('相关经验充足');
    score += 0.08;
  } else if (experience === 0 && job.category && job.category !== 'basic') {
    weaknesses.push('行业经验不足');
  }
  if (taggedRequirements.length === 0 && (job.experienceRequired || job.qualificationRequired?.length)) {
    factors.push('经验与资格匹配');
    strengths.push('已具备岗位经验与资格');
    score += 0.08;
  } else if (taggedRequirements.length) weaknesses.push('岗位经验或资格仍需积累');
  if (communication >= 25) {
    factors.push('沟通表现');
    strengths.push('沟通表现突出');
    score += 0.05;
  } else if (job.category === 'office' || job.category === 'sales') {
    weaknesses.push('沟通仍可提升');
  }
  if (route === 'referral' || route === 'headhunter') {
    factors.push('人物推荐');
    strengths.push('获得可信推荐');
    score += balance.competitiveness.referralBonus;
  }
  if (route === 'internal') {
    factors.push('内部转岗');
    score += balance.competitiveness.internalBonus;
  }
  if (route === 'story') {
    factors.push('剧情机会');
    score += balance.competitiveness.storyBonus;
  }

  const tier = score >= balance.competitiveness.exceptional ? 'exceptional'
    : score >= balance.competitiveness.strong ? 'strong'
      : score > balance.competitiveness.minimum ? 'competitive' : 'minimum';
  return { tier, probabilityBand: Math.min(balance.competitiveness.exceptional, score), factors, strengths, weaknesses };
}

export function deterministicApplicationDecision(seed: number, applicationId: string, probability: number): boolean {
  let hash = seed >>> 0;
  for (const character of applicationId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 0xffffffff < probability;
}

const attributeNames: Record<string, string> = { professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情' };
const interestNames: Record<string, string> = { film: '电影', photography: '摄影', music: '音乐', cooking: '烹饪', cycling: '骑行', game: '游戏', travel: '旅行' };
const capabilityNames: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };

export function requirementHints(job: JobDefinition, state: GameState, content?: ContentRegistry, balance?: BalanceConfig): AcquisitionHint[] {
  const hints: AcquisitionHint[] = [];
  hints.push(...requirementForJob(job, state));
  if ((job.abilityRequired ?? 0) > state.ability) hints.push(numericHint('ability', '提升职业能力', '安排学习或基础工作', 'work', state.ability, job.abilityRequired!));
  if ((job.reputationRequired ?? 0) > state.reputation) hints.push(numericHint('reputation', '积累声誉与相关经验', '查看入门岗位', 'work', state.reputation, job.reputationRequired!));
  for (const itemId of job.requiredItems ?? []) {
    if ((state.inventory[itemId] ?? 0) < 1) hints.push(itemHint(itemId, state, content));
  }
  for (const capability of job.requiredCapabilities ?? []) {
    if (!state.unlockedCapabilities.includes(capability)) hints.push(capabilityHint(capability, content));
  }
  if (job.requirements) hints.push(...conditionHints(job.requirements, state, content, balance));
  return dedupeHints(hints);
}

function conditionHints(condition: ConditionDefinition, state: GameState, content?: ContentRegistry, balance?: BalanceConfig): AcquisitionHint[] {
  switch (condition.type) {
    case 'all':
      return condition.conditions.flatMap((child) => conditionHints(child, state, content, balance));
    case 'any':
      return condition.conditions.some((child) => conditionSatisfied(child, state, content, balance)) ? [] : condition.conditions.flatMap((child) => conditionHints(child, state, content, balance));
    case 'not':
      return conditionSatisfied(condition, state, content, balance) ? [] : [identityHint(`not:${conditionKey(condition.condition)}`, '避开不符合前置的状态', '查看个人状态', 'profile', conditionTarget(condition.condition))];
    case 'day_at_least':
      return state.time.day >= condition.day ? [] : [numericHint('day_at_least', `等到第 ${condition.day} 天`, '去生活页查看时间', 'life', state.time.day, condition.day)];
    case 'day_at_most':
      return state.time.day <= condition.day ? [] : [numericHint('day_at_most', `需要在第 ${condition.day} 天前完成`, '去生活页查看时间', 'life', state.time.day, condition.day)];
    case 'time_between':
      return conditionSatisfied(condition, state, content, balance) ? [] : [numericHint(`time_between:${condition.startHour}-${condition.endHour}`, `在 ${condition.startHour}:00-${condition.endHour}:00 之间`, '去生活页查看时间', 'life', state.time.hour, condition.startHour)];
    case 'player_stage':
      return conditionSatisfied(condition, state, content, balance) ? [] : [identityHint(`player_stage:${condition.stage}`, `达到${stageLabel(condition.stage)}阶段`, '去财富页查看余量', 'wealth', condition.stage)];
    case 'cash_at_least':
      return state.cash >= condition.amount ? [] : [numericHint('cash', '准备更多现金余量', '去财富页查看资产', 'wealth', state.cash, condition.amount)];
    case 'ability_at_least':
      return state.ability >= condition.amount ? [] : [numericHint('ability', '提升职业能力', '安排学习或基础工作', 'work', state.ability, condition.amount)];
    case 'attribute_at_least': {
      const current = getAttribute(state, condition.attribute);
      return current >= condition.amount ? [] : [numericHint(`attribute:${condition.attribute}`, `提升${attributeNames[condition.attribute] ?? condition.attribute}`, '安排学习或活动', 'work', current, condition.amount)];
    }
    case 'reputation_at_least':
      return state.reputation >= condition.amount ? [] : [numericHint('reputation', '积累声誉与相关经验', '查看入门岗位', 'work', state.reputation, condition.amount)];
    case 'current_salary_at_least': {
      const current = currentMonthlySalary(state);
      return current >= condition.amount ? [] : [numericHint('current_salary_at_least', '提升当前月薪', '去职业页查看工作', 'work', current, condition.amount)];
    }
    case 'lifestyle_at_least':
      return state.lifestyle >= condition.amount ? [] : [numericHint('lifestyle', '提升生活品质', '去商店改善生活', 'shop', state.lifestyle, condition.amount)];
    case 'job_experience_at_least': {
      const current = state.jobExperience[condition.jobId] ?? 0;
      return current >= condition.amount ? [] : [numericHint(`experience:${condition.jobId}`, '积累相关工作经验', '查看职业安排', 'work', current, condition.amount, condition.jobId)];
    }
    case 'interest_familiarity_at_least': {
      const current = state.interestFamiliarity?.[condition.tag] ?? 0;
      return current >= condition.amount ? [] : [numericHint(`interest:${condition.tag}`, `提升${interestNames[condition.tag] ?? condition.tag}兴趣熟练度`, '安排相关活动', 'shop', current, condition.amount)];
    }
    case 'owns_item':
      return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1) ? [] : [itemHint(condition.itemId, state, content, condition.quantity ?? 1)];
    case 'has_capability':
      return state.unlockedCapabilities.includes(condition.capability) ? [] : [capabilityHint(condition.capability, content)];
    case 'current_job':
      return state.currentJobId === condition.jobId ? [] : [identityHint(`current_job:${condition.jobId}`, `进入${jobName(condition.jobId, content)}`, '去职业页查看岗位', 'work', condition.jobId)];
    case 'housing_is':
      return state.housing.housingId === condition.housingId && (!condition.mode || state.housing.mode === condition.mode) ? [] : [{
        requirementId: `housing:${condition.housingId}`,
        label: `搬到${content?.housing.find((entry) => entry.id === condition.housingId)?.name ?? condition.housingId}`,
        actionLabel: '去生活页查看住房',
        destinationView: 'life',
        targetId: condition.housingId,
      }];
    case 'relationship_at_least': {
      const current = state.relationships[condition.characterId] ?? 0;
      return current >= condition.amount ? [] : [numericHint(`relationship:${condition.characterId}`, `提升与${characterName(condition.characterId, content)}的关系`, '去社交页互动', 'relations', current, condition.amount, condition.characterId)];
    }
    case 'relationship_stage_at_least': {
      const required = condition.stage;
      const current = stageForRelationship(state.relationships[condition.characterId] ?? 0, balance);
      return current >= required ? [] : [numericHint(`relationship_stage:${condition.characterId}`, `推进与${characterName(condition.characterId, content)}的关系阶段`, '去社交页互动', 'relations', current, required, condition.characterId)];
    }
    case 'owns_asset':
      return state.assets[condition.assetId] ? [] : [{ requirementId: `asset:${condition.assetId}`, label: '配置指定资产', actionLabel: '去财富页查看资产', destinationView: 'wealth', targetId: condition.assetId }];
    case 'owns_business':
      return state.businesses[condition.businessId] ? [] : [{ requirementId: `business:${condition.businessId}`, label: '拥有指定企业', actionLabel: '去财富页查看企业', destinationView: 'wealth', targetId: condition.businessId }];
    case 'owns_investment':
      return state.investments?.[condition.investmentId] ? [] : [{ requirementId: `investment:${condition.investmentId}`, label: '持有指定投资', actionLabel: '去财富页查看投资', destinationView: 'wealth', targetId: condition.investmentId }];
    case 'completed_event':
      return state.completedEvents.includes(condition.eventId) ? [] : [identityHint(`completed_event:${condition.eventId}`, `完成${eventName(condition.eventId, content)}`, '查看个人状态', 'profile', condition.eventId)];
    case 'completed_milestone':
      return state.completedMilestones.includes(condition.milestoneId) ? [] : [identityHint(`completed_milestone:${condition.milestoneId}`, `达成${milestoneName(condition.milestoneId, content)}`, '查看个人状态', 'profile', condition.milestoneId)];
    case 'chain_stage_at_least': {
      const current = state.chainStages[condition.chainId] ?? 0;
      return current >= condition.stage ? [] : [numericHint(`chain_stage:${condition.chainId}`, '推进故事进度', '查看个人状态', 'profile', current, condition.stage, condition.chainId)];
    }
    case 'flag':
      return state.flags[condition.flag] ? [] : [identityHint(`flag:${condition.flag}`, '完成指定前置进展', '查看个人状态', 'profile', condition.flag)];
  }
}

function conditionSatisfied(condition: ConditionDefinition, state: GameState, content?: ContentRegistry, balance?: BalanceConfig): boolean {
  switch (condition.type) {
    case 'all': return condition.conditions.every((child) => conditionSatisfied(child, state, content, balance));
    case 'any': return condition.conditions.some((child) => conditionSatisfied(child, state, content, balance));
    case 'not': return !conditionSatisfied(condition.condition, state, content, balance);
    case 'cash_at_least': return state.cash >= condition.amount;
    case 'ability_at_least': return state.ability >= condition.amount;
    case 'attribute_at_least': return getAttribute(state, condition.attribute) >= condition.amount;
    case 'reputation_at_least': return state.reputation >= condition.amount;
    case 'lifestyle_at_least': return state.lifestyle >= condition.amount;
    case 'current_job': return state.currentJobId === condition.jobId;
    case 'current_salary_at_least': return currentMonthlySalary(state) >= condition.amount;
    case 'job_experience_at_least': return (state.jobExperience[condition.jobId] ?? 0) >= condition.amount;
    case 'interest_familiarity_at_least': return (state.interestFamiliarity?.[condition.tag] ?? 0) >= condition.amount;
    case 'owns_item': return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1);
    case 'has_capability': return state.unlockedCapabilities.includes(condition.capability);
    case 'housing_is': return state.housing.housingId === condition.housingId && (!condition.mode || state.housing.mode === condition.mode);
    case 'owns_business': return Boolean(state.businesses[condition.businessId]);
    case 'owns_asset': return Boolean(state.assets[condition.assetId]);
    case 'owns_investment': return Boolean(state.investments?.[condition.investmentId]);
    case 'relationship_at_least': return (state.relationships[condition.characterId] ?? 0) >= condition.amount;
    case 'relationship_stage_at_least': return stageForRelationship(state.relationships[condition.characterId] ?? 0, balance) >= condition.stage;
    case 'completed_event': return state.completedEvents.includes(condition.eventId);
    case 'completed_milestone': return state.completedMilestones.includes(condition.milestoneId);
    case 'chain_stage_at_least': return (state.chainStages[condition.chainId] ?? 0) >= condition.stage;
    case 'flag': return state.flags[condition.flag] === true;
    case 'day_at_least': return state.time.day >= condition.day;
    case 'day_at_most': return state.time.day <= condition.day;
    case 'time_between': return condition.startHour <= condition.endHour ? state.time.hour >= condition.startHour && state.time.hour <= condition.endHour : state.time.hour >= condition.startHour || state.time.hour <= condition.endHour;
    case 'player_stage': return content && balance ? getPlayerStage(state, content, balance) === condition.stage : false;
  }
}

function numericHint(requirementId: string, label: string, actionLabel: string, destinationView: ViewId, currentValue: number, requiredValue: number, targetId?: ContentId): AcquisitionHint {
  return { requirementId, label, actionLabel, destinationView, currentValue, requiredValue, targetId };
}

function identityHint(requirementId: string, label: string, actionLabel: string, destinationView: ViewId, targetId?: ContentId): AcquisitionHint {
  return { requirementId, label, actionLabel, destinationView, targetId };
}

function itemHint(itemId: ContentId, state: GameState, content?: ContentRegistry, quantity = 1): AcquisitionHint {
  const item = content?.items.find((entry) => entry.id === itemId);
  return {
    requirementId: `item:${itemId}`,
    label: `获得${item?.name ?? itemId}`,
    actionLabel: '去商店购买',
    destinationView: 'shop',
    targetId: itemId,
    currentValue: state.inventory[itemId] ?? 0,
    requiredValue: quantity,
  };
}

function capabilityHint(capability: string, content?: ContentRegistry): AcquisitionHint {
  const provider = content?.items.find((item) => item.capabilities?.includes(capability));
  return {
    requirementId: `capability:${capability}`,
    label: `获得${capabilityNames[capability] ?? capability}`,
    actionLabel: provider ? '去商店购买' : '查看能力来源',
    destinationView: provider ? 'shop' : 'profile',
    targetId: provider?.id ?? capability,
  };
}

function characterName(characterId: ContentId, content?: ContentRegistry): string {
  return content?.characters.find((entry) => entry.id === characterId)?.name ?? characterId;
}

function jobName(jobId: ContentId, content?: ContentRegistry): string {
  return content?.jobs.find((entry) => entry.id === jobId)?.name ?? jobId;
}

function eventName(eventId: ContentId, content?: ContentRegistry): string {
  return content?.events.find((entry) => entry.id === eventId)?.name ?? eventId;
}

function milestoneName(milestoneId: ContentId, content?: ContentRegistry): string {
  return content?.milestones.find((entry) => entry.id === milestoneId)?.name ?? milestoneId;
}

function stageLabel(stage: string): string {
  return stage === 'start' ? '起步' : stage === 'growing' ? '成长' : stage === 'stable' ? '稳定' : '富裕';
}

function conditionKey(condition: ConditionDefinition): string {
  switch (condition.type) {
    case 'all': return `all:${condition.conditions.map(conditionKey).join('+')}`;
    case 'any': return `any:${condition.conditions.map(conditionKey).join('+')}`;
    case 'not': return `not:${conditionKey(condition.condition)}`;
    case 'day_at_least': return `day_at_least:${condition.day}`;
    case 'day_at_most': return `day_at_most:${condition.day}`;
    case 'time_between': return `time_between:${condition.startHour}-${condition.endHour}`;
    case 'player_stage': return `player_stage:${condition.stage}`;
    case 'cash_at_least': return `cash:${condition.amount}`;
    case 'ability_at_least': return `ability:${condition.amount}`;
    case 'attribute_at_least': return `attribute:${condition.attribute}:${condition.amount}`;
    case 'reputation_at_least': return `reputation:${condition.amount}`;
    case 'current_salary_at_least': return `current_salary:${condition.amount}`;
    case 'lifestyle_at_least': return `lifestyle:${condition.amount}`;
    case 'current_job': return `current_job:${condition.jobId}`;
    case 'job_experience_at_least': return `experience:${condition.jobId}:${condition.amount}`;
    case 'interest_familiarity_at_least': return `interest:${condition.tag}:${condition.amount}`;
    case 'owns_item': return `item:${condition.itemId}:${condition.quantity ?? 1}`;
    case 'has_capability': return `capability:${condition.capability}`;
    case 'housing_is': return `housing:${condition.housingId}:${condition.mode ?? 'any'}`;
    case 'owns_business': return `business:${condition.businessId}`;
    case 'owns_asset': return `asset:${condition.assetId}`;
    case 'owns_investment': return `investment:${condition.investmentId}`;
    case 'relationship_at_least': return `relationship:${condition.characterId}:${condition.amount}`;
    case 'relationship_stage_at_least': return `relationship_stage:${condition.characterId}:${condition.stage}`;
    case 'completed_event': return `completed_event:${condition.eventId}`;
    case 'completed_milestone': return `completed_milestone:${condition.milestoneId}`;
    case 'chain_stage_at_least': return `chain_stage:${condition.chainId}:${condition.stage}`;
    case 'flag': return `flag:${condition.flag}`;
  }
}

function conditionTarget(condition: ConditionDefinition): ContentId | undefined {
  switch (condition.type) {
    case 'current_job': return condition.jobId;
    case 'job_experience_at_least': return condition.jobId;
    case 'owns_item': return condition.itemId;
    case 'housing_is': return condition.housingId;
    case 'owns_business': return condition.businessId;
    case 'owns_asset': return condition.assetId;
    case 'owns_investment': return condition.investmentId;
    case 'relationship_at_least':
    case 'relationship_stage_at_least':
      return condition.characterId;
    case 'completed_event': return condition.eventId;
    case 'completed_milestone': return condition.milestoneId;
    case 'chain_stage_at_least': return condition.chainId;
    case 'flag': return condition.flag;
    case 'has_capability': return condition.capability;
    case 'player_stage': return condition.stage;
    default: return undefined;
  }
}

function stageForRelationship(value: number, balance?: BalanceConfig): number {
  if (balance) {
    return balance.relationshipStageThresholds.reduce((stage, threshold, index) => value >= threshold ? index : stage, 0);
  }
  if (value >= 75) return 3;
  if (value >= 50) return 2;
  if (value >= 25) return 1;
  return 0;
}

function dedupeHints(hints: AcquisitionHint[]): AcquisitionHint[] {
  const byRequirement = new Map<string, AcquisitionHint>();
  for (const hint of hints) {
    const existing = byRequirement.get(hint.requirementId);
    if (!existing || strongerHint(hint, existing)) byRequirement.set(hint.requirementId, hint);
  }
  return [...byRequirement.values()];
}

function strongerHint(candidate: AcquisitionHint, existing: AcquisitionHint): boolean {
  const candidateRequired = candidate.requiredValue;
  const existingRequired = existing.requiredValue;
  if (candidateRequired === undefined || existingRequired === undefined) return false;
  return candidate.requirementId === 'day_at_most' ? candidateRequired < existingRequired : candidateRequired > existingRequired;
}

export function advanceCareerLifecycle(state: GameState, day: number, _content: ContentRegistry, balance: BalanceConfig): void {
  for (const application of state.applications ?? []) {
    if (application.status === 'offer' && application.offerExpiresDay !== undefined && day > application.offerExpiresDay) {
      application.status = 'expired';
      continue;
    }
    if (['rejected', 'accepted', 'withdrawn', 'expired', 'offer'].includes(application.status)) continue;
    if (day >= application.resultDay) {
      if (application.willReceiveOffer) {
        application.status = 'offer';
        application.offerExpiresDay = day + balance.applicationOfferDurationRange[0];
      } else {
        application.status = 'rejected';
        application.nextEligibleDay = day + balance.applicationCooldownDays;
      }
    } else if (day >= application.resultDay - 1) application.status = 'interview';
    else if (day > application.submittedDay) application.status = 'screening';
  }
  state.opportunities = (state.opportunities ?? []).filter((opportunity) => opportunity.expiresDay >= day || state.applications?.some((application) => application.opportunityId === opportunity.id));
  state.gigs = (state.gigs ?? []).filter((gig) => gig.expiresDay >= day);
  if (!(state.gigs ?? []).length) {
    const gigJob = _content.jobs.find((job) => employmentKind(job) === 'gig'
      && (job.abilityRequired ?? 0) <= state.ability
      && (job.reputationRequired ?? 0) <= state.reputation
      && (!job.requirements || evaluateCondition(job.requirements, state, _content, balance))
      && (job.requiredItems ?? []).every((itemId) => (state.inventory[itemId] ?? 0) > 0)
      && (job.requiredCapabilities ?? []).every((capability) => state.unlockedCapabilities.includes(capability)));
    if (gigJob) state.gigs = [{ id: `gig.offer.${gigJob.id}.${day}`, jobId: gigJob.id, validFromDay: day, expiresDay: day + 6, executableDay: day, startMinute: 18 * 60, endMinute: 18 * 60 + gigJob.hours * 60, pay: gigJob.basePay, source: '工作市场' }];
  }
}

function vacancyFromTemplate(template: VacancyTemplate, month: number, content: ContentRegistry, balance: BalanceConfig): VacancyState {
  const jobPay = content.jobs.find((job) => job.id === template.jobId)?.basePay ?? 100;
  const [low, high] = template.salaryMultiplierRange;
  const publishedDay = (month - 1) * 28 + 1;
  return {
    vacancyId: `vacancy.${template.id}.${month}`,
    jobId: template.jobId,
    companyId: template.companyId,
    salaryRange: [Math.round(jobPay * low), Math.round(jobPay * high)],
    route: template.route,
    publishedDay,
    expiresDay: publishedDay + (template.durationDays ?? balance.vacancyDurationDays) - 1,
  };
}

function fallbackTemplates(content: ContentRegistry): VacancyTemplate[] {
  const templates: VacancyTemplate[] = [];
  for (const job of content.jobs) {
    const base = { id: `vacancy-template.${job.id}`, contentStatus: job.contentStatus, name: job.name, description: job.description, tags: [...(job.tags ?? []), `pay:${job.basePay}`] } as const;
    templates.push({ ...base, jobId: job.id, companyId: `company.market.${job.id}`, route: 'market', salaryMultiplierRange: [0.95, 1.1] });
  }
  const office = content.jobs.find((job) => job.id === 'job.seed-office');
  if (office) {
    const base = { contentStatus: office.contentStatus, name: office.name, description: office.description, tags: [...(office.tags ?? []), `pay:${office.basePay}`] } as const;
    templates.unshift(
      { ...base, id: 'vacancy-template.office-xinghe', jobId: office.id, companyId: 'company.xinghe', route: 'market', salaryMultiplierRange: [0.95, 1.1] },
      { ...base, id: 'vacancy-template.office-yuanwang', jobId: office.id, companyId: 'company.yuanwang', route: 'market', salaryMultiplierRange: [0.9, 1.02] },
    );
  }
  return templates;
}

function stableNumber(seed: number, month: number, modulo: number): number {
  const value = Math.abs(Math.imul(seed ^ month, 1103515245) + 12345);
  return value % Math.max(1, modulo);
}
