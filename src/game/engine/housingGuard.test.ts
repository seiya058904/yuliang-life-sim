import { describe, expect, it } from 'vitest';
import type { GameState } from '../content/contracts';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';
import { calculateNetWorth } from './economy';

const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
const content = contentRegistry;
const A = 'housing.seed-room';
const B = 'housing.seed-apartment';

function richTenant(seed = 5): GameState {
  const state = createInitialState(content, balance, seed);
  state.cash = 5_000_000;
  state.ability = 80;
  state.reputation = 80;
  state.unlockedHousingIds = content.housing.map((home) => home.id);
  return state;
}

function run(state: GameState, action: Parameters<typeof dispatchGameAction>[1]) {
  return dispatchGameAction(state, action, content, balance);
}

describe('move_housing guard while owning a home', () => {
  it('refuses buying another home outright and changes nothing', () => {
    let state = richTenant();
    state = run(state, { type: 'move_housing', housingId: A, mode: 'owned' }).state;
    expect(state.housing.housingId).toBe(A);
    const cashBefore = state.cash;
    const netWorthBefore = calculateNetWorth(state, content, balance);
    const ledgerBefore = state.financialLedger?.entries.length ?? 0;
    const historyBefore = state.lifeHistory?.length ?? 0;

    const attempt = run(state, { type: 'move_housing', housingId: B, mode: 'owned' });
    expect(attempt.error).toContain('请先出售当前自住房');
    const after = attempt.state;
    expect(after.housing.housingId).toBe(A);
    expect(after.housing.mode).toBe('owned');
    expect(after.cash).toBe(cashBefore);
    expect(calculateNetWorth(after, content, balance)).toBe(netWorthBefore);
    expect((after.financialLedger?.entries.length ?? 0)).toBe(ledgerBefore);
    expect((after.lifeHistory?.length ?? 0)).toBe(historyBefore);
  });

  it('refuses moving back to a rental while owning and keeps the owned home', () => {
    let state = richTenant();
    state = run(state, { type: 'move_housing', housingId: A, mode: 'owned' }).state;
    const attempt = run(state, { type: 'move_housing', housingId: 'housing.shared-room', mode: 'rent' });
    expect(attempt.error).toContain('请先出售当前自住房');
    expect(attempt.state.housing.housingId).toBe(A);
    expect(attempt.state.housing.mode).toBe('owned');
  });

  it('allows the documented path: sell first, then buy the next home', () => {
    let state = richTenant();
    state = run(state, { type: 'move_housing', housingId: A, mode: 'owned' }).state;
    state = run(state, { type: 'sell_housing' }).state;
    expect(state.housing.mode).toBe('rent');
    const saleCash = state.cash;
    state = run(state, { type: 'move_housing', housingId: B, mode: 'owned' }).state;
    expect(state.housing.housingId).toBe(B);
    expect(state.cash).toBe(saleCash - (content.housing.find((home) => home.id === B)!.price ?? 0));
  });

  it('keeps refusing mortgage paths with the original message', () => {
    let state = richTenant();
    // Rent a mortgage-capable home, then finance it.
    state = run(state, { type: 'move_housing', housingId: A, mode: 'rent' }).state;
    state = run(state, { type: 'finance_housing', housingId: A }).state;
    expect(state.mortgage).toBeTruthy();
    const attempt = run(state, { type: 'move_housing', housingId: B, mode: 'rent' });
    expect(attempt.error).toContain('未结清的住房分期');
  });
});
