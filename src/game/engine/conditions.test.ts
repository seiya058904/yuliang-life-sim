import { describe, expect, it } from 'vitest';
import { evaluateCondition } from './conditions';
import type { ContentRegistry, GameState } from '../content/contracts';
import { balanceConfig } from '../balance/config';

const state: GameState = {
  version: 1, contentVersion: 1, time: { day: 3, hour: 10, minute: 0 }, calendar: { week: 1, weekday: 3, month: 1, weekOfMonth: 1 }, cash: 1000, ability: 12, reputation: 4, lifestyle: 10,
  weeklyPlan: { days: {} as never, autoRepeat: true }, autoRepeatPlan: true, simulationMode: 'planning', simulationSpeed: 1, monthlyLedger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: 0, netWorthEnd: 0 },
  jobExperience: { 'job.seed': 2 }, inventory: { 'item.seed': 1 }, itemPurchasePrices: {}, unlockedCapabilities: ['remote_work'], unlockedJobIds: ['job.seed'], unlockedHousingIds: [], unlockedBusinessIds: [], unlockedAssetIds: [], discounts: [],
  housing: { housingId: 'housing.seed', mode: 'rent' }, relationships: { 'character.seed': 30 }, businesses: {}, assets: {}, completedEvents: ['event.seed'], completedMilestones: [], eventCooldowns: {}, chainStages: { 'chain.seed': 1 }, flags: { ready: true }, modifiers: [], marketJobIds: ['job.seed'], eventMeter: 0, eventDay: 3, eventsToday: 0, lastSettledDay: 2, rentReliefAvailableDay: 0, housingReliefUntilDay: 0, rng: { seed: 1, cursor: 0 },
};

const content = { jobs: [], items: [], housing: [], businesses: [], assets: [], characters: [], events: [], eventChains: [], milestones: [], vocabulary: { capabilities: ['remote_work'], tags: [] } } as unknown as ContentRegistry;

describe('condition evaluator', () => {
  it('evaluates nested state conditions', () => {
    expect(evaluateCondition({ type: 'all', conditions: [
      { type: 'day_at_least', day: 3 }, { type: 'ability_at_least', amount: 10 }, { type: 'has_capability', capability: 'remote_work' },
      { type: 'owns_item', itemId: 'item.seed' }, { type: 'relationship_at_least', characterId: 'character.seed', amount: 25 },
    ] }, state, content, balanceConfig)).toBe(true);
  });

  it('supports any and not conditions', () => {
    expect(evaluateCondition({ type: 'any', conditions: [{ type: 'cash_at_least', amount: 2000 }, { type: 'not', condition: { type: 'current_job', jobId: 'job.other' } }] }, state, content, balanceConfig)).toBe(true);
  });
});
