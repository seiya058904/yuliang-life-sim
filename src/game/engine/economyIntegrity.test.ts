import { describe, expect, it } from 'vitest';
import type { GameAction, GameState } from '../content/contracts';
import { contentRegistry as content } from '../content/registry';
import { mergeBalanceConfig } from '../balance/config';
import { dispatchGameAction } from './actions';
import { calendarForDay } from './calendar';
import { calculateNetWorth } from './economy';
import { summarizeFinancialLedger } from './financialLedger';
import { forecastWeeklyPlan } from './forecast';
import { createInitialState } from './initialState';
import { investmentUnitValue } from './investments';
import { fixedMonthBudget } from './settlementMath';

const balance = mergeBalanceConfig({ eventDailyLimit: 0, eventAmbientChance: 0 });
const investmentId = 'investment.technology-growth';
const subscriptionId = 'subscription.music';

function fresh(day = 1): GameState {
  const state = createInitialState(content, balance, 1);
  state.cash = 1_000_000;
  state.time = { day, hour: 8, minute: 0 };
  state.calendar = calendarForDay(day);
  state.lastSettledDay = day - 1;
  state.currentJobId = undefined;
  state.employment = undefined;
  state.autoRepeatPlan = state.weeklyPlan.autoRepeat = true;
  for (const slots of Object.values(state.weeklyPlan.days)) {
    slots.day = { kind: 'free' };
    slots.evening = { kind: 'free' };
  }
  return state;
}

function act(state: GameState, action: GameAction): GameState {
  const result = dispatchGameAction(state, action, content, balance);
  expect(result.error).toBeUndefined();
  return result.state;
}

/** Two real authored quotes, with the clock following the normal simulation. */
function buyMixedPriceLots(firstUnits: number, secondUnits: number): GameState {
  let state = fresh();
  const definition = content.investments!.find((entry) => entry.id === investmentId)!;
  expect(Math.round(investmentUnitValue(definition, state.rng.seed, 1))).toBe(132);
  const initialCash = state.cash;
  state = act(state, { type: 'buy_investment', investmentId, units: firstUnits });
  expect(state.cash).toBe(initialCash - 132 * firstUnits);
  state = act(state, { type: 'start_week' });
  state = act(state, { type: 'advance_simulation', minutes: 24 * 1440 });
  state = act(state, { type: 'pause_simulation' });
  expect(state.time.day).toBe(25);
  expect(Math.round(investmentUnitValue(definition, state.rng.seed, 25))).toBe(131);
  const beforeSecondBuy = state.cash;
  state = act(state, { type: 'buy_investment', investmentId, units: secondUnits });
  expect(state.cash).toBe(beforeSecondBuy - 131 * secondUnits);
  return state;
}

function tradingTotals(state: GameState) {
  const entries = state.financialLedger!.entries.filter((entry) => entry.sourceType === 'investment' && entry.sourceId === investmentId);
  const total = (category: string) => entries.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount, 0);
  const liquidationEntries = entries.filter((entry) => entry.category === 'asset_liquidation');
  const soldBasis = liquidationEntries.reduce((sum, entry) => {
    expect(entry.costBasis?.kind).toBe('known');
    return sum + (entry.costBasis?.kind === 'known' ? entry.costBasis.value : 0);
  }, 0);
  return {
    spent: total('investment_transfer'),
    recovered: total('asset_liquidation'),
    realized: total('realized_gain') - total('realized_loss'),
    soldBasis,
  };
}

function expectConservedBasis(state: GameState): void {
  const totals = tradingTotals(state);
  const holding = state.investments?.[investmentId];
  const remainingBasis = holding ? holding.averageCost * holding.units : 0;
  expect(totals.soldBasis + remainingBasis).toBeCloseTo(totals.spent, 8);
  expect(totals.realized).toBe(totals.recovered - totals.soldBasis);
}

describe('investment cost basis conservation', () => {
  it('keeps actual paid capital after a second lot has a different whole-yuan quote', () => {
    const state = buyMixedPriceLots(1_000, 1_000);
    expect(state.investments![investmentId].averageCost).toBe(131.5);
    expectConservedBasis(state);
  });

  it('reports the actual complete-trade loss without changing transaction cash', () => {
    let state = buyMixedPriceLots(1_000, 1_000);
    const beforeSale = state.cash;
    state = act(state, { type: 'sell_investment', investmentId, units: 2_000 });
    expect(state.cash - beforeSale).toBe(262_000);
    expect(state.investments?.[investmentId]).toBeUndefined();
    expect(tradingTotals(state)).toEqual({ spent: 263_000, recovered: 262_000, soldBasis: 263_000, realized: -1_000 });
  });

  it.each([[1, 1], [3, 2], [2, 5]])('conserves %i + %i mixed-price units across serialized one-unit exits', (first, second) => {
    let state = buyMixedPriceLots(first, second);
    for (let units = first + second; units > 0; units -= 1) {
      state = JSON.parse(JSON.stringify(state)) as GameState;
      state = act(state, { type: 'sell_investment', investmentId, units: 1 });
      expectConservedBasis(state);
    }
    const totals = tradingTotals(state);
    expect(totals.soldBasis).toBe(totals.spent);
    expect(totals.realized).toBe(-first);
    expect(state.investments?.[investmentId]).toBeUndefined();
  });

  it('retains the residual basis through a partial exit, re-buy and final exit', () => {
    let state = buyMixedPriceLots(1, 3);
    state = act(state, { type: 'sell_investment', investmentId, units: 1 });
    state = JSON.parse(JSON.stringify(state)) as GameState;
    state = act(state, { type: 'buy_investment', investmentId, units: 2 });
    expectConservedBasis(state);
    state = act(state, { type: 'sell_investment', investmentId, units: 5 });
    expect(tradingTotals(state)).toEqual({ spent: 787, recovered: 786, soldBasis: 787, realized: -1 });
  });

  it('preserves a legacy recorded basis without inventing historical purchase totals', () => {
    const state = fresh(25);
    state.investments = { [investmentId]: { investmentId, units: 2, averageCost: 132, currentValuation: 262, lastValuationDay: 25 } };
    const sold = act(state, { type: 'sell_investment', investmentId, units: 2 });
    expect(tradingTotals(sold)).toEqual({ spent: 0, recovered: 262, soldBasis: 264, realized: -2 });
  });
});

describe('subscription forecast uses the actual upcoming billing date', () => {
  it('does not predict another charge for a subscription just prepaid near month end', () => {
    let state = act(fresh(28), { type: 'manage_subscription', subscriptionId, enabled: true });
    const before = structuredClone(state);
    const forecast = forecastWeeklyPlan(state, state.weeklyPlan, content, balance);
    expect(state).toEqual(before);
    expect(state.activeSubscriptions![subscriptionId].billedUntilDay).toBe(56);
    // The recurring budget is a different question from this week's next charge.
    expect(fixedMonthBudget(state, content, balance).subscriptions).toBe(18);
    state = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 16 * 60 });
    expect(state.time.day).toBe(29);
    expect(state.cash - before.cash).toBe(-24);
    expect(forecast.netCash).toBe(state.cash - before.cash);
  });

  it.each([
    { due: 28, expected: 18 },
    { due: 29, expected: 18 },
    { due: 30, expected: 0 },
    { due: undefined, expected: 18 },
  ])('matches actual renewal for due anchor $due', ({ due, expected }) => {
    const state = fresh(28);
    state.activeSubscriptions = { [subscriptionId]: { subscriptionId, startedDay: 1, ...(due === undefined ? {} : { billedUntilDay: due }) } };
    const without = structuredClone(state);
    without.activeSubscriptions = {};
    const forecast = forecastWeeklyPlan(state, state.weeklyPlan, content, balance);
    const baselineForecast = forecastWeeklyPlan(without, without.weeklyPlan, content, balance);
    const settled = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 16 * 60 });
    const baselineSettled = act(act(without, { type: 'start_week' }), { type: 'advance_simulation', minutes: 16 * 60 });
    expect(baselineSettled.cash - settled.cash).toBe(expected);
    expect(forecast.expense - baselineForecast.expense).toBe(expected);
    expect(forecast.netCash).toBe(settled.cash - state.cash);
  });
});

describe('valuation changes stay separate from liquidation proceeds', () => {
  it('does not report cash liquidation after a month of owning a depreciating car', () => {
    let state = act(fresh(), { type: 'buy_asset', assetId: 'asset.used-compact' });
    state = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 28 * 1440 });
    expect(state.simulationMode).toBe('monthly_summary');
    expect(state.assets['asset.used-compact'].currentValuation).toBe(34_860);
    expect(state.lifeHistory.some((entry) => entry.category === 'asset' && entry.title.startsWith('出售'))).toBe(false);
    expect(state.lastFinancialSummary!.totalAssetLiquidation).toBe(0);
    expect(state.lastFinancialSummary!.assetLiquidation.categories).toEqual({});
  });

  it('retains the raw noncash entry and counts only real proceeds when the car is later sold', () => {
    let state = act(fresh(), { type: 'buy_asset', assetId: 'asset.used-compact' });
    state = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 1440 });
    state = act(state, { type: 'pause_simulation' });
    const depreciation = state.financialLedger!.entries.find((entry) => entry.category === 'valuation_change')!;
    expect(depreciation).toMatchObject({ amount: 5, cashDelta: 0 });
    const saleValue = state.assets['asset.used-compact'].currentValuation;
    const beforeSale = state.cash;
    state = act(state, { type: 'sell_asset', assetId: 'asset.used-compact' });
    expect(state.cash - beforeSale).toBe(saleValue);
    const ledger = state.financialLedger!;
    const beforeSummary = structuredClone(ledger);
    const summary = summarizeFinancialLedger(ledger, ledger.cashStart, state.cash, ledger.netWorthStart, calculateNetWorth(state, content, balance));
    expect(ledger).toEqual(beforeSummary);
    expect(ledger.entries).toContainEqual(depreciation);
    expect(summary.totalAssetLiquidation).toBe(saleValue);
    expect(summary.assetLiquidation.categories).toEqual({ asset_liquidation: saleValue });
  });
});
