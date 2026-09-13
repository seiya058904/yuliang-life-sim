import { known } from './knownAmount';
import { describe, expect, it } from 'vitest';
import { currentMonthlySalary, evaluateCondition, explainCondition } from './conditions';
import type { ConditionDefinition, ContentRegistry, GameState } from '../content/contracts';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';

const state: GameState = {
  version: 1, contentVersion: 1, time: { day: 3, hour: 10, minute: 0 }, calendar: { week: 1, weekday: 3, month: 1, weekOfMonth: 1 }, cash: 1000, ability: 12, reputation: 4, lifestyle: 10,
  weeklyPlan: { days: {} as never, autoRepeat: true }, autoRepeatPlan: true, simulationMode: 'planning', simulationSpeed: 1, monthlyLedger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: known(0), netWorthEnd: known(0) },
  jobExperience: { 'job.seed': 2 }, inventory: { 'item.seed': 1 }, itemPurchasePrices: {}, unlockedCapabilities: ['remote_work'], unlockedJobIds: ['job.seed'], unlockedHousingIds: [], unlockedBusinessIds: [], unlockedAssetIds: [], discounts: [],
  housing: { housingId: 'housing.seed', mode: 'rent' }, relationships: { 'character.seed': 30 }, businesses: {}, assets: {}, completedEvents: ['event.seed'], completedMilestones: [], eventCooldowns: {}, chainStages: { 'chain.seed': 1 }, flags: { ready: true }, modifiers: [], marketJobIds: ['job.seed'], eventMeter: 0, eventDay: 3, eventsToday: 0, lastSettledDay: 2, rentReliefAvailableDay: 0, housingReliefUntilDay: 0, rng: { seed: 1, cursor: 0 },
  lifeHistory: [],
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

  it('evaluates current monthly salary from the persisted employment pay', () => {
    const employed = { ...state, employment: { jobId: 'job.seed', schedule: { workDays: [1 as const], startMinute: 9 * 60, endMinute: 17 * 60 }, effectiveWeek: 1, basePay: 500, salaryAdjustment: 25 } };
    expect(currentMonthlySalary(employed)).toBe(10500);
    expect(evaluateCondition({ type: 'current_salary_at_least', amount: 9000 }, employed, content, balanceConfig)).toBe(true);
    expect(evaluateCondition({ type: 'current_salary_at_least', amount: 11000 }, employed, content, balanceConfig)).toBe(false);
    expect(explainCondition({ type: 'current_salary_at_least', amount: 11000 }, employed, content, balanceConfig)).toContain('当前月薪');
  });
});

/** 收集内容契约里真实使用的全部 not 节点（含嵌套）。 */
function collectNotConditions(value: unknown, into: ConditionDefinition[] = []): ConditionDefinition[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNotConditions(entry, into));
    return into;
  }
  if (!value || typeof value !== 'object') return into;
  const node = value as Record<string, unknown>;
  if (node.type === 'not' && node.condition) into.push(value as ConditionDefinition);
  Object.values(node).forEach((child) => {
    if (child && typeof child === 'object') collectNotConditions(child, into);
  });
  return into;
}

describe('not 条件的解释与求值语义一致', () => {
  const initialState = () => createInitialState(contentRegistry, balanceConfig, 7);
  const laptopGuard = contentRegistry.items.find((item) => item.id === 'item.seed-laptop')!.requirements!;
  const contentNotConditions = collectNotConditions(contentRegistry);

  it('not(owns_item) 未拥有：显示可购买的正向文案，而不是“不满足”', () => {
    const fresh = initialState();
    expect(evaluateCondition(laptopGuard, fresh, contentRegistry, balanceConfig)).toBe(true);
    const text = explainCondition(laptopGuard, fresh, contentRegistry, balanceConfig);
    expect(text.startsWith('✓')).toBe(true);
    expect(text).toContain('尚未拥有');
    expect(text).toContain('可购买');
    expect(text).not.toContain('不满足');
    expect(text).not.toContain('✕');
  });

  it('not(owns_item) 已拥有：明确显示不能重复购买', () => {
    const owned = initialState();
    owned.inventory['item.seed-laptop'] = 1;
    expect(evaluateCondition(laptopGuard, owned, contentRegistry, balanceConfig)).toBe(false);
    const text = explainCondition(laptopGuard, owned, contentRegistry, balanceConfig);
    expect(text.startsWith('✕')).toBe(true);
    expect(text).toContain('已拥有');
    expect(text).toContain('不能重复购买');
  });

  it('内容中全部 not 节点：解释的 ✓/✕ 与 evaluateCondition 一致', () => {
    // 官方内容真实使用的 not 内层类型；新增类型时这里会失败，提醒补一致语义。
    const innerTypes = new Set(contentNotConditions.map((node) => ((node as Extract<ConditionDefinition, { type: "not" }>).condition as ConditionDefinition).type));
    expect([...innerTypes].sort()).toEqual(['flag', 'housing_is', 'owns_item']);
    expect(contentNotConditions.length).toBeGreaterThanOrEqual(15);

    const base = initialState();
    for (const node of contentNotConditions) {
      const inner = (node as Extract<ConditionDefinition, { type: "not" }>).condition;
      const variants: GameState[] = [base, structuredClone(base)];
      if (inner.type === 'flag') variants[1].flags[inner.flag] = true;
      if (inner.type === 'owns_item') variants[1].inventory[inner.itemId] = Math.max(1, inner.quantity ?? 1);
      if (inner.type === 'housing_is') variants[1].housing = { housingId: inner.housingId, mode: inner.mode ?? 'rent' };
      for (const variant of variants) {
        const expected = evaluateCondition(node, variant, contentRegistry, balanceConfig);
        const text = explainCondition(node, variant, contentRegistry, balanceConfig);
        expect(text.startsWith('✓'), `解释“${text}”应与求值结果 ${expected} 一致`).toBe(expected);
      }
    }
  });
});
