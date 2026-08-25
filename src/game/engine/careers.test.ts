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

    const hints = requirementHints(job, state, contentRegistry);

    expect(hints).toEqual([
      expect.objectContaining({ requirementId: 'reputation', destinationView: 'work', currentValue: 3, requiredValue: 9 }),
      expect.objectContaining({ requirementId: 'capability:remote_work', destinationView: 'shop', targetId: 'item.seed-laptop' }),
      expect.objectContaining({ requirementId: 'cash:800', destinationView: 'wealth', currentValue: 400, requiredValue: 800 }),
      expect.objectContaining({ requirementId: 'relationship:character.seed-lin', destinationView: 'relations', currentValue: 12, requiredValue: 30 }),
    ]);
    expect(hints.some((hint) => hint.requirementId === 'ability')).toBe(false);
    expect(hints.filter((hint) => hint.requirementId === 'item:item.seed-phone')).toHaveLength(0);
    expect(hints.filter((hint) => hint.requirementId === 'capability:remote_work')).toHaveLength(1);
  });
});
