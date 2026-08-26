import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { advanceCareerLifecycle, evaluateApplicationCompetitiveness, generateVacancies, requirementHints } from './careers';
import { dispatchGameAction } from './actions';
import { migrateGameState } from '../store/gameStore';

describe('career market', () => {
  it('generates a stable configured vacancy range and allows one job at multiple companies', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const balance = mergeBalanceConfig({ vacancyCountRange: [8, 12] });

    const first = generateVacancies(state, contentRegistry, balance);
    const repeated = generateVacancies(state, contentRegistry, balance);

    expect(first).toEqual(repeated);
    expect(first.length).toBeGreaterThanOrEqual(8);
    expect(first.length).toBeLessThanOrEqual(12);
    expect(first.some((vacancy) => vacancy.jobId === 'job.seed-office' && vacancy.companyId === 'company.xinghe')).toBe(true);
    expect(first.some((vacancy) => vacancy.jobId === 'job.seed-office' && vacancy.companyId === 'company.yuanwang')).toBe(true);
  });

  it('rates a referred, experienced candidate above a minimally qualified candidate without exposing a raw chance', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!;
    const minimum = evaluateApplicationCompetitiveness(job, { ...state, ability: 14, reputation: 3 }, contentRegistry, balanceConfig, 'market');
    const strong = evaluateApplicationCompetitiveness(job, {
      ...state,
      ability: 30,
      reputation: 20,
      attributes: { ...state.attributes!, communication: 35 },
      jobExperience: { ...state.jobExperience, 'job.seed-office': 24 },
    }, contentRegistry, balanceConfig, 'referral');

    expect(minimum.tier).toBe('minimum');
    expect(strong.tier).toBe('exceptional');
    expect(strong.factors).toContain('人物推荐');
    expect(strong.probabilityBand).toBeGreaterThan(minimum.probabilityBand);
  });

  it('surfaces the interest path required by the photography gig', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.photography-assistant-gig')!;

    expect(requirementHints(job, state, contentRegistry, balanceConfig).some((hint) => hint.requirementId === 'interest:photography')).toBe(true);
    state.interestFamiliarity = { photography: 2 };
    expect(requirementHints(job, state, contentRegistry, balanceConfig).some((hint) => hint.requirementId === 'interest:photography')).toBe(false);
  });

  it('creates the photography gig only after its item and familiarity requirements are met', () => {
    const content = { ...contentRegistry, jobs: contentRegistry.jobs.filter((entry) => entry.id !== 'job.delivery-shift') };
    const state = createInitialState(content, balanceConfig, 31);
    state.ability = 18;
    state.reputation = 4;
    state.inventory['item.vintage-camera'] = 1;
    state.interestFamiliarity = { photography: 2 };

    advanceCareerLifecycle(state, 1, content, balanceConfig);

    expect(state.gigs?.some((gig) => gig.jobId === 'job.photography-assistant-gig')).toBe(true);
  });

  it('keeps a submitted application snapshot after its vacancy expires', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 19);
    const vacancy = state.vacancies!.find((entry) => entry.jobId === 'job.seed-warehouse')!;
    const submitted = dispatchGameAction(state, { type: 'submit_application', vacancyId: vacancy.vacancyId } as never, contentRegistry, balanceConfig);

    expect(submitted.error).toBeUndefined();
    expect(submitted.state.applications).toHaveLength(1);
    expect(submitted.state.applications![0]).toMatchObject({ vacancyId: vacancy.vacancyId, jobId: 'job.seed-warehouse', companyId: vacancy.companyId });
  });

  it('migrates legacy freelance unlocks into permanent side-job qualifications', () => {
    const legacy = createInitialState(contentRegistry, balanceConfig, 1);
    legacy.unlockedJobIds.push('job.seed-remote');
    delete legacy.acquiredSideJobs;
    delete legacy.vacancies;
    const migrated = migrateGameState(legacy, contentRegistry, balanceConfig);

    expect(migrated.acquiredSideJobs?.['job.seed-remote']).toMatchObject({ jobId: 'job.seed-remote' });
    expect(migrated.vacancies?.length).toBeGreaterThanOrEqual(8);
  });

  it('resolves a submitted application from its own snapshot after the public vacancy has expired', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.vacancies = [];
    state.applications = [{
      applicationId: 'application.snapshot', vacancyId: 'vacancy.gone', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 3, status: 'waiting',
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];

    advanceCareerLifecycle(state, 3, contentRegistry, balanceConfig);

    expect(state.applications[0]).toMatchObject({ status: 'offer', offerExpiresDay: 10, companyId: 'company.xinghe' });
  });

  it('uses finite negotiation stages so the first salary review creates a non-compounding adjustment', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.jobExperience[state.currentJobId!] = 20;
    const started = dispatchGameAction(state, { type: 'start_resignation' }, contentRegistry, balanceConfig);
    const outcome = dispatchGameAction(started.state, { type: 'advance_resignation' }, contentRegistry, balanceConfig);
    const kept = dispatchGameAction(outcome.state, { type: 'choose_resignation', choice: 'stay' }, contentRegistry, balanceConfig);

    expect(kept.state.employment).toMatchObject({ negotiationStage: 1, salaryAdjustment: 5 });
  });

  it('explains recursive unmet requirements with concrete destinations and no satisfied duplicates', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.ability = 10;
    state.reputation = 3;
    state.cash = 400;
    state.relationships['character.seed-lin'] = 12;
    state.inventory['item.seed-phone'] = 1;
    state.unlockedCapabilities = [];
    const baseJob = contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!;
    const job = {
      ...baseJob,
      abilityRequired: 8,
      reputationRequired: 9,
      requiredItems: ['item.seed-phone'],
      requiredCapabilities: ['remote_work'],
      requirements: {
        type: 'all',
        conditions: [
          { type: 'cash_at_least', amount: 800 },
          { type: 'relationship_at_least', characterId: 'character.seed-lin', amount: 30 },
          { type: 'has_capability', capability: 'remote_work' },
        ],
      },
    } as const;

    const hints = requirementHints(job, state, contentRegistry, balanceConfig);

    expect(hints).toEqual([
      expect.objectContaining({ requirementId: 'reputation', destinationView: 'work', currentValue: 3, requiredValue: 9 }),
      expect.objectContaining({ requirementId: 'capability:remote_work', destinationView: 'shop', targetId: 'item.seed-laptop' }),
      expect.objectContaining({ requirementId: 'cash', destinationView: 'wealth', currentValue: 400, requiredValue: 800 }),
      expect.objectContaining({ requirementId: 'relationship:character.seed-lin', destinationView: 'relations', currentValue: 12, requiredValue: 30 }),
    ]);
    expect(hints.some((hint) => hint.requirementId === 'ability')).toBe(false);
    expect(hints.filter((hint) => hint.requirementId === 'item:item.seed-phone')).toHaveLength(0);
    expect(hints.filter((hint) => hint.requirementId === 'capability:remote_work')).toHaveLength(1);
  });

  it('preserves identity for unmet non-numeric condition variants instead of collapsing to a generic fallback', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.time = { day: 8, hour: 8, minute: 0 };
    state.currentJobId = 'job.seed-shop-clerk';
    state.completedEvents = [];
    state.completedMilestones = [];
    state.chainStages = {};
    state.flags = {};
    const job = {
      ...contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!,
      abilityRequired: undefined,
      reputationRequired: undefined,
      requiredItems: [],
      requiredCapabilities: [],
      requirements: {
        type: 'all',
        conditions: [
          { type: 'current_job', jobId: 'job.seed-office' },
          { type: 'completed_event', eventId: 'event.seed-bonus' },
          { type: 'completed_milestone', milestoneId: 'milestone.seed-first-week' },
          { type: 'chain_stage_at_least', chainId: 'chain.seed-career', stage: 2 },
          { type: 'flag', flag: 'met.office.manager' },
          { type: 'day_at_least', day: 12 },
          { type: 'day_at_most', day: 4 },
          { type: 'time_between', startHour: 10, endHour: 12 },
          { type: 'player_stage', stage: 'stable' },
        ],
      },
    } as const;

    const hints = requirementHints(job, state, contentRegistry, balanceConfig);

    expect(hints.map((hint) => hint.requirementId)).toEqual([
      'current_job:job.seed-office',
      'completed_event:event.seed-bonus',
      'completed_milestone:milestone.seed-first-week',
      'chain_stage:chain.seed-career',
      'flag:met.office.manager',
      'day_at_least',
      'day_at_most',
      'time_between:10-12',
      'player_stage:stable',
    ]);
    expect(hints).toEqual([
      expect.objectContaining({ destinationView: 'work', targetId: 'job.seed-office' }),
      expect.objectContaining({ destinationView: 'profile', targetId: 'event.seed-bonus' }),
      expect.objectContaining({ destinationView: 'profile', targetId: 'milestone.seed-first-week' }),
      expect.objectContaining({ destinationView: 'profile', targetId: 'chain.seed-career', currentValue: 0, requiredValue: 2 }),
      expect.objectContaining({ destinationView: 'profile', targetId: 'met.office.manager' }),
      expect.objectContaining({ destinationView: 'life', currentValue: 8, requiredValue: 12 }),
      expect.objectContaining({ destinationView: 'life', currentValue: 8, requiredValue: 4 }),
      expect.objectContaining({ destinationView: 'life', currentValue: 8, requiredValue: 10 }),
      expect.objectContaining({ destinationView: 'wealth', targetId: 'stable' }),
    ]);
  });

  it('keeps only the strongest unmet threshold for equivalent acquisition paths', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.cash = 400;
    state.reputation = 3;
    state.lifestyle = 10;
    state.attributes = { ...state.attributes!, professional: 12 };
    state.jobExperience['job.seed-office'] = 4;
    const job = {
      ...contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!,
      abilityRequired: undefined,
      reputationRequired: 6,
      requirements: {
        type: 'all',
        conditions: [
          { type: 'cash_at_least', amount: 800 },
          { type: 'cash_at_least', amount: 1200 },
          { type: 'reputation_at_least', amount: 9 },
          { type: 'lifestyle_at_least', amount: 14 },
          { type: 'lifestyle_at_least', amount: 18 },
          { type: 'attribute_at_least', attribute: 'professional', amount: 20 },
          { type: 'attribute_at_least', attribute: 'professional', amount: 30 },
          { type: 'job_experience_at_least', jobId: 'job.seed-office', amount: 8 },
          { type: 'job_experience_at_least', jobId: 'job.seed-office', amount: 12 },
        ],
      },
    } as const;

    const hints = requirementHints(job, state, contentRegistry, balanceConfig);

    expect(hints.filter((hint) => hint.requirementId === 'cash')).toEqual([expect.objectContaining({ currentValue: 400, requiredValue: 1200 })]);
    expect(hints.filter((hint) => hint.requirementId === 'reputation')).toEqual([expect.objectContaining({ currentValue: 3, requiredValue: 9 })]);
    expect(hints.filter((hint) => hint.requirementId === 'lifestyle')).toEqual([expect.objectContaining({ currentValue: 10, requiredValue: 18 })]);
    expect(hints.filter((hint) => hint.requirementId === 'attribute:professional')).toEqual([expect.objectContaining({ currentValue: 12, requiredValue: 30 })]);
    expect(hints.filter((hint) => hint.requirementId === 'experience:job.seed-office')).toEqual([expect.objectContaining({ currentValue: 4, requiredValue: 12 })]);
  });

  it('keeps the earliest unmet deadline for equivalent day-at-most requirements', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.time = { day: 12, hour: 8, minute: 0 };
    const job = {
      ...contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!,
      abilityRequired: undefined,
      reputationRequired: undefined,
      requirements: {
        type: 'all',
        conditions: [
          { type: 'day_at_most', day: 10 },
          { type: 'day_at_most', day: 6 },
        ],
      },
    } as const;

    const hints = requirementHints(job, state, contentRegistry, balanceConfig);

    expect(hints.filter((hint) => hint.requirementId === 'day_at_most')).toEqual([
      expect.objectContaining({ currentValue: 12, requiredValue: 6 }),
    ]);
  });

  it('routes an unmet recursive item requirement to the exact shop item', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.inventory = {};
    const job = {
      ...contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!,
      abilityRequired: undefined,
      reputationRequired: undefined,
      requiredItems: [],
      requiredCapabilities: [],
      requirements: { type: 'owns_item', itemId: 'item.seed-laptop' },
    } as const;

    const hints = requirementHints(job, state, contentRegistry, balanceConfig);

    expect(hints).toEqual([
      expect.objectContaining({
        requirementId: 'item:item.seed-laptop',
        destinationView: 'shop',
        targetId: 'item.seed-laptop',
        currentValue: 0,
        requiredValue: 1,
      }),
    ]);
  });
});
