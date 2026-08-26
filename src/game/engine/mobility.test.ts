import { describe, expect, it } from 'vitest';
import { buildMobilityEntries } from './mobility';
import type { GameState, ContentRegistry, JobDefinition } from '../content/contracts';

const baseState = {
  version: 1, contentVersion: 1, time: { day: 1, hour: 8, minute: 0 }, calendar: { week: 1, weekday: 1, month: 1, weekOfMonth: 1 }, cash: 1000, ability: 20, reputation: 5, lifestyle: 10,
  weeklyPlan: { days: {} as never, autoRepeat: true }, autoRepeatPlan: true, simulationMode: 'planning', simulationSpeed: 1, monthlyLedger: {} as never,
  jobExperience: {}, inventory: {}, itemPurchasePrices: {}, unlockedCapabilities: [], unlockedJobIds: [], unlockedHousingIds: [], unlockedBusinessIds: [], unlockedAssetIds: [], discounts: [],
  housing: { housingId: 'housing.room', mode: 'rent' as const }, relationships: {}, businesses: {}, assets: {}, completedEvents: [], completedMilestones: [], eventCooldowns: {}, chainStages: {}, flags: {}, modifiers: [], marketJobIds: [], eventMeter: 0, eventDay: 1, eventsToday: 0, lastSettledDay: 0, housingReliefUntilDay: 0, rentReliefAvailableDay: 0, rng: { seed: 1, cursor: 0 },
  careerExperience: { retail: 40, customer_service: 25 },
  qualifications: [],
  lifeHistory: [],
} as unknown as GameState;

const job = (over: Partial<JobDefinition>): JobDefinition => ({
  id: 'job.demo', contentStatus: 'official', name: '目标岗位', description: '', tags: ['work'], kind: 'regular', employmentKind: 'full_time', isLongTerm: true, hours: 8, basePay: 400, careerXp: 6, experienceTags: ['data'],
  ...over,
}) as JobDefinition;

const content = { jobs: [
  job({ id: 'job.auto-trainer', name: '区域培训专家', experienceRequired: { customer_service: 110, office: 50 }, abilityRequired: 41 }),
  job({ id: 'job.director', name: '增长总监', experienceRequired: { operations: 180, management: 45 }, reputationRequired: 40 }),
  job({ id: 'job.reachable', experienceRequired: { retail: 30 } }),
] } as unknown as ContentRegistry;

describe('cross-industry mobility', () => {
  it('lists unreachable jobs with factual gaps while excluding reachable ones and current job', () => {
    const state = { ...baseState, currentJobId: 'job.reachable' } as GameState;
    const entries = buildMobilityEntries(content, state);
    expect(entries.map((entry) => entry.job.id)).toEqual(['job.auto-trainer', 'job.director']);
    const trainer = entries[0];
    expect(trainer.experienceGaps.some((hint) => hint.label.includes('办公室')) || trainer.experienceGaps.length >= 1).toBe(true);
    expect(trainer.statGaps).toContain('能力 41');
    expect(trainer.transferableStrengths.join(',')).toContain('零售经验');
    expect(trainer.transferableStrengths.join(',')).not.toContain('客服经验'); // 客服 is required here → not a strength
  });

  it('caps transferable strengths at four entries', () => {
    const richState = { ...baseState, careerExperience: { retail: 9, office: 3, logistics: 2, data: 1, media: 7, finance: 5 } } as unknown as GameState;
    const entries = buildMobilityEntries({ jobs: [job({ experienceRequired: { operations: 500 } })] } as unknown as ContentRegistry, richState);
    expect(entries[0].transferableStrengths.length).toBe(4);
  });
});
