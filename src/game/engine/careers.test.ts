import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { advanceCareerLifecycle, evaluateApplicationCompetitiveness, generateVacancies, isJobEligible, requirementHints } from './careers';
import { dispatchGameAction } from './actions';
import { migrateGameState } from '../store/gameStore';

describe('career market', () => {
  it('generates a stable configured vacancy range and allows one job at multiple companies', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const balance = mergeBalanceConfig({ vacancyCountRange: [8, 12] });

    const first = generateVacancies(state, contentRegistry, balance);
    const repeated = generateVacancies(state, contentRegistry, balance);

    expect(first).toEqual(repeated);
    expect(first.length).toBeGreaterThanOrEqual(10);
    // Ladder anchors may exceed the nominal maximum by a couple of slots.
    expect(first.length).toBeLessThanOrEqual(18);
    expect(first.some((vacancy) => vacancy.jobId === 'job.seed-office' && vacancy.companyId === 'company.xinghe')).toBe(true);
    expect(first.some((vacancy) => vacancy.jobId === 'job.seed-office' && vacancy.companyId === 'company.yuanwang')).toBe(true);
  });

  it('keeps the first expert and management routes discoverable in the public market', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const vacancies = generateVacancies(state, contentRegistry, balanceConfig);

    expect(vacancies.some((vacancy) => vacancy.jobId === 'job.regional-operations-manager')).toBe(true);
    expect(vacancies.some((vacancy) => vacancy.jobId === 'job.category-operations-expert')).toBe(true);
  });

  it('keeps both official logistics route steps discoverable in the public market', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const vacancies = generateVacancies(state, contentRegistry, balanceConfig);

    expect(vacancies.some((vacancy) => vacancy.jobId === 'job.huanliu-warehouse-assistant')).toBe(true);
    expect(vacancies.some((vacancy) => vacancy.jobId === 'job.huanliu-dispatch-coordinator')).toBe(true);
  });

  it('keeps the entry course-operations route discoverable and exposes actionable attribute hints', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const vacancies = generateVacancies(state, contentRegistry, balanceConfig);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.course-operations-assistant')!;

    expect(vacancies.some((vacancy) => vacancy.jobId === job.id && vacancy.companyId === 'company.greenfield-education')).toBe(true);
    expect(requirementHints(job, state, contentRegistry, balanceConfig).map((hint) => hint.label)).toEqual(expect.arrayContaining(['提升知识', '提升沟通']));
  });

  it('blocks a public application for the job the player currently holds', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    const vacancy = state.vacancies!.find((entry) => entry.jobId === state.currentJobId)!;

    const result = dispatchGameAction(state, { type: 'submit_application', vacancyId: vacancy.vacancyId } as never, contentRegistry, balanceConfig);

    expect(result.error).toBe('你已经在这份工作中');
    expect(result.state.applications).toEqual([]);
  });

  it('connects the education course qualification to the long-term teaching assistant route', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 24);
    state.calendar = { ...state.calendar, month: 2 };
    state.time = { ...state.time, day: 40 };
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.course-teaching-assistant')!;
    const before = requirementHints(job, state, contentRegistry, balanceConfig);
    const after = requirementHints(job, { ...state, ability: 14, reputation: 3, qualifications: ['qualification.workplace-basics'] }, contentRegistry, balanceConfig);

    expect(generateVacancies(state, contentRegistry, balanceConfig).some((vacancy) => vacancy.jobId === job.id)).toBe(true);
    expect(before.map((hint) => hint.label)).toContain('获得qualification.workplace-basics资格');
    expect(after).toEqual([]);
  });

  it('surfaces the consulting route requirements and treats the laptop as a real gate', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.research-assistant')!;
    const prepared = { ...state, ability: 26, reputation: 8, attributes: { ...state.attributes!, professional: 26, knowledge: 26, communication: 26 } };

    expect(requirementHints(job, prepared, contentRegistry, balanceConfig).map((hint) => hint.requirementId)).toContain('item:item.seed-laptop');
    expect(requirementHints(job, { ...prepared, inventory: { ...state.inventory, 'item.seed-laptop': 1 } }, contentRegistry, balanceConfig)).toEqual([]);
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

  it('surfaces a concrete current-salary acquisition hint', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 31);
    const job = {
      ...contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!,
      requirements: { type: 'current_salary_at_least' as const, amount: 9000 },
    };
    state.employment = { ...state.employment!, basePay: 400, salaryAdjustment: 0 };
    expect(requirementHints(job, state, contentRegistry, balanceConfig)).toEqual(expect.arrayContaining([
      expect.objectContaining({ requirementId: 'current_salary_at_least', currentValue: 8000, requiredValue: 9000, destinationView: 'work' }),
    ]));
    state.employment.basePay = 500;
    expect(requirementHints(job, state, contentRegistry, balanceConfig).some((hint) => hint.requirementId === 'current_salary_at_least')).toBe(false);
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

  it('turns a fresh Offer into a decision gate and files an inbox message', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.applications = [{
      applicationId: 'application.gate', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 3, status: 'waiting',
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];

    advanceCareerLifecycle(state, 3, contentRegistry, balanceConfig);

    expect(state.applications![0]).toMatchObject({ status: 'offer', offerExpiresDay: 10 });
    expect(state.pendingOfferApplicationId).toBe('application.gate');
    expect(state.messages?.some((message) => message.title === '收到新的 Offer')).toBe(true);
  });

  it('blocks time passing until the Offer notice is dismissed', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.simulationMode = 'paused';
    state.applications = [{
      applicationId: 'application.gate', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 2, status: 'waiting',
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];

    advanceCareerLifecycle(state, 2, contentRegistry, balanceConfig);
    expect(state.pendingOfferApplicationId).toBe('application.gate');

    const tick = dispatchGameAction(state, { type: 'advance_simulation', minutes: 30 }, contentRegistry, balanceConfig);
    expect(tick.error).toBe('请先处理新的 Offer 通知');
    const resumed = dispatchGameAction(state, { type: 'resume_simulation' }, contentRegistry, balanceConfig);
    expect(resumed.error).toBe('请先处理新的 Offer 通知');

    const dismissed = dispatchGameAction(state, { type: 'dismiss_offer_notice' }, contentRegistry, balanceConfig);
    expect(dismissed.state.pendingOfferApplicationId).toBeUndefined();
    const running = dispatchGameAction(dismissed.state, { type: 'resume_simulation' }, contentRegistry, balanceConfig);
    expect(running.error).toBeUndefined();
    expect(running.state.simulationMode).toBe('running');
  });

  it('stops a long advance_period the moment a fresh Offer lands', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.simulationMode = 'paused';
    // 押后随机事件，保证测试场景先走到 Offer 结算
    state.eventMeter = -100000;
    state.applications = [{
      applicationId: 'application.gate', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 2, status: 'waiting',
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];

    const result = dispatchGameAction(state, { type: 'advance_period', months: 1 }, contentRegistry, balanceConfig);

    expect(result.error).toBeUndefined();
    expect(result.state.pendingOfferApplicationId).toBe('application.gate');
    expect(result.state.simulationMode).toBe('paused');
    expect(result.state.applications![0]).toMatchObject({ status: 'offer', offerExpiresDay: 9 });
    expect(result.state.time.day).toBeLessThan(result.state.applications![0].offerExpiresDay!);
  });

  it('records an inbox message when an unanswered Offer lapses', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.applications = [{
      applicationId: 'application.gate', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 1, status: 'offer', offerExpiresDay: 5,
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];

    advanceCareerLifecycle(state, 6, contentRegistry, balanceConfig);

    expect(state.applications![0]).toMatchObject({ status: 'expired', nextEligibleDay: 6 + balanceConfig.applicationCooldownDays });
    expect(state.messages?.some((message) => message.title === 'Offer 已过期')).toBe(true);
    expect(state.pendingOfferApplicationId).toBeUndefined();
  });

  it('leaves no ghost Offer gate after the player resolves the application', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.simulationMode = 'paused';
    state.currentJobId = undefined;
    state.employment = undefined;
    state.applications = [{
      applicationId: 'application.gate', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 2, status: 'offer', offerExpiresDay: 9,
      competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
    }];
    state.pendingOfferApplicationId = 'application.gate';

    // 玩家没走"稍后再说"，而是直接接受了 Offer：resume 必须自愈放行
    const accepted = dispatchGameAction(state, { type: 'accept_application_offer', applicationId: 'application.gate' }, contentRegistry, balanceConfig);
    expect(accepted.error).toBeUndefined();
    expect(accepted.state.applications![0].status).toBe('accepted');
    expect(accepted.state.pendingOfferApplicationId).toBe('application.gate');

    const resumed = dispatchGameAction(accepted.state, { type: 'resume_simulation' }, contentRegistry, balanceConfig);
    expect(resumed.error).toBeUndefined();
    expect(resumed.state.simulationMode).toBe('running');
    expect(resumed.state.pendingOfferApplicationId).toBeUndefined();
  });

  it('announces every Offer landing the same day and keeps them all open', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.eventMeter = -100000;
    state.applications = [
      {
        applicationId: 'application.first', jobId: 'job.seed-office', companyId: 'company.xinghe',
        salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 2, status: 'waiting',
        competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
      },
      {
        applicationId: 'application.second', jobId: 'job.seed-warehouse', companyId: 'company.yuanwang',
        salaryRange: [120, 140], route: 'market', submittedDay: 1, resultDay: 2, status: 'waiting',
        competitivenessTier: 'competitive', probabilityBand: 0.8, willReceiveOffer: true, feedback: [],
      },
    ];

    advanceCareerLifecycle(state, 2, contentRegistry, balanceConfig);

    // 两个申请同时转 Offer：各自都有收件箱消息，pending 不会吞掉另一个的通知
    expect(state.applications.map((entry) => entry.status)).toEqual(['offer', 'offer']);
    expect(state.messages?.filter((message) => message.title === '收到新的 Offer')).toHaveLength(2);
    expect(state.pendingOfferApplicationId).toBeDefined();

    // 关闭通知只是解除时间门，两个 Offer 都保持可回复，不因单值字段被丢弃
    const dismissed = dispatchGameAction(state, { type: 'dismiss_offer_notice' }, contentRegistry, balanceConfig);
    expect(dismissed.error).toBeUndefined();
    expect(dismissed.state.pendingOfferApplicationId).toBeUndefined();
    expect((dismissed.state.applications ?? []).every((entry) => entry.status === 'offer')).toBe(true);
  });

  it('messages the player when a delayed application is rejected', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 3);
    state.applications = [{
      applicationId: 'application.reject', jobId: 'job.seed-office', companyId: 'company.xinghe',
      salaryRange: [160, 180], route: 'market', submittedDay: 1, resultDay: 3, status: 'waiting',
      competitivenessTier: 'minimum', probabilityBand: 0.2, willReceiveOffer: false, feedback: [],
    }];

    advanceCareerLifecycle(state, 3, contentRegistry, balanceConfig);

    expect(state.applications![0].status).toBe('rejected');
    expect(state.messages?.some((message) => message.title === '申请未通过')).toBe(true);
    expect(state.pendingOfferApplicationId).toBeUndefined();
  });

  it('shares one eligibility predicate for market cards and dashboard counts', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 5);
    state.ability = 99;
    state.reputation = 99;
    const baseJob = contentRegistry.jobs.find((entry) => entry.id === 'job.seed-office')!;
    const job = { ...baseJob, requiredItems: ['item.seed-laptop'] };

    // 缺少必需物品时，生活页计数与招聘市场必须同时判为不符合
    expect(isJobEligible(job, state, contentRegistry, balanceConfig)).toBe(false);
    state.inventory['item.seed-laptop'] = 1;
    expect(isJobEligible(job, state, contentRegistry, balanceConfig)).toBe(true);

    const capabilityJob = { ...baseJob, requiredCapabilities: ['capability.logistics-license'] };
    expect(isJobEligible(capabilityJob, state, contentRegistry, balanceConfig)).toBe(false);
    state.unlockedCapabilities = ['capability.logistics-license'];
    expect(isJobEligible(capabilityJob, state, contentRegistry, balanceConfig)).toBe(true);
  });
});
