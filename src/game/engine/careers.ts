import type { BalanceConfig } from '../balance/config';
import type { AcquisitionHint, ApplicationRoute, ConditionDefinition, ContentId, ContentRegistry, GameState, JobDefinition, VacancyState, VacancyTemplate, ViewId } from '../content/contracts';
import { getAttribute } from './attributes';
import { getPlayerStage } from './conditions';

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
  return selected.slice(0, Math.min(maximum, templates.length));
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
const capabilityNames: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };

export function requirementHints(job: JobDefinition, state: GameState, content?: ContentRegistry, balance?: BalanceConfig): AcquisitionHint[] {
  const hints: AcquisitionHint[] = [];
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
      return conditionSatisfied(condition, state, content, balance) ? [] : [{ requirementId: 'condition:not', label: '调整当前状态', actionLabel: '查看个人状态', destinationView: 'profile' }];
    case 'cash_at_least':
      return state.cash >= condition.amount ? [] : [numericHint(`cash:${condition.amount}`, '准备更多现金余量', '去财富页查看资产', 'wealth', state.cash, condition.amount)];
    case 'ability_at_least':
      return state.ability >= condition.amount ? [] : [numericHint('ability', '提升职业能力', '安排学习或基础工作', 'work', state.ability, condition.amount)];
    case 'attribute_at_least': {
      const current = getAttribute(state, condition.attribute);
      return current >= condition.amount ? [] : [numericHint(`attribute:${condition.attribute}`, `提升${attributeNames[condition.attribute] ?? condition.attribute}`, '安排学习或活动', 'work', current, condition.amount)];
    }
    case 'reputation_at_least':
      return state.reputation >= condition.amount ? [] : [numericHint('reputation', '积累声誉与相关经验', '查看入门岗位', 'work', state.reputation, condition.amount)];
    case 'lifestyle_at_least':
      return state.lifestyle >= condition.amount ? [] : [numericHint(`lifestyle:${condition.amount}`, '提升生活品质', '去商店改善生活', 'shop', state.lifestyle, condition.amount)];
    case 'job_experience_at_least': {
      const current = state.jobExperience[condition.jobId] ?? 0;
      return current >= condition.amount ? [] : [numericHint(`experience:${condition.jobId}`, '积累相关工作经验', '查看职业安排', 'work', current, condition.amount, condition.jobId)];
    }
    case 'owns_item':
      return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1) ? [] : [itemHint(condition.itemId, state, content, condition.quantity ?? 1)];
    case 'has_capability':
      return state.unlockedCapabilities.includes(condition.capability) ? [] : [capabilityHint(condition.capability, content)];
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
    default:
      return conditionSatisfied(condition, state, content, balance) ? [] : [{ requirementId: `condition:${condition.type}`, label: '继续推进前置条件', actionLabel: '查看个人状态', destinationView: 'profile' }];
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
    case 'job_experience_at_least': return (state.jobExperience[condition.jobId] ?? 0) >= condition.amount;
    case 'owns_item': return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1);
    case 'has_capability': return state.unlockedCapabilities.includes(condition.capability);
    case 'housing_is': return state.housing.housingId === condition.housingId && (!condition.mode || state.housing.mode === condition.mode);
    case 'owns_business': return Boolean(state.businesses[condition.businessId]);
    case 'owns_asset': return Boolean(state.assets[condition.assetId]);
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
    if (!existing || (hint.requiredValue ?? 0) > (existing.requiredValue ?? 0)) byRequirement.set(hint.requirementId, hint);
  }
  return [...byRequirement.values()];
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
