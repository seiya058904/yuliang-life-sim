import type { BalanceConfig } from '../balance/config';
import type { ApplicationRoute, ContentRegistry, GameState, JobDefinition, RequirementHint, VacancyState, VacancyTemplate } from '../content/contracts';

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

export function requirementHints(job: JobDefinition, state: GameState): RequirementHint[] {
  const hints: RequirementHint[] = [];
  if ((job.abilityRequired ?? 0) > state.ability) hints.push({
    requirementId: 'ability', label: '提升职业能力', source: 'activity', actionLabel: '查看学习与活动',
  });
  if ((job.reputationRequired ?? 0) > state.reputation) hints.push({
    requirementId: 'reputation', label: '积累声誉与相关经验', source: 'starter_job', actionLabel: '查看入门岗位',
  });
  if (job.requiredCapabilities?.length) hints.push({
    requirementId: 'capability', label: '获得所需能力或工具', source: 'capability', targetId: job.requiredCapabilities[0], actionLabel: '查看能力来源',
  });
  if (hints.length === 0) hints.push({
    requirementId: 'goal', label: '继续积累相关经验', source: 'goal', actionLabel: '设置为职业目标',
  });
  return hints;
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
