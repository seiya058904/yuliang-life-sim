import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { forecastWeeklyPlan } from './forecast';

describe('weekly plan forecast', () => {
  it('returns deterministic wages and fixed spending without mutating the saved plan or including random outcomes', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 9);
    const before = structuredClone(state);

    const forecast = forecastWeeklyPlan(state, state.weeklyPlan, contentRegistry, balanceConfig);

    expect(forecast.income).toBeGreaterThan(0);
    expect(forecast.expense).toBeGreaterThan(0);
    expect(forecast.notes).toContain('不包含随机事件、市场价格变化、未确定招聘结果');
    expect(state).toEqual(before);
  });
});
