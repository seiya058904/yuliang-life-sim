import { describe, expect, it } from 'vitest';
import type { GameState } from '../content/contracts';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';
import { absoluteMinute } from './time';
import { migrateGameState, saveGameState } from '../store/gameStore';
import { canonicalSaveRaw } from '../store/canonicalSaveTestDouble';

const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
const content = contentRegistry;
const PE = 'investment.citylife-private-equity';

function run(state: GameState, action: Parameters<typeof dispatchGameAction>[1]): GameState {
  const result = dispatchGameAction(state, action, content, balance);
  expect(result.error, result.error ?? 'action failed').toBeUndefined();
  return result.state;
}

/** Real engine time advancement: start weeks, settle days, close months. */
function advanceDays(input: GameState, days: number): GameState {
  let state = input;
  const targetDay = state.time.day + days;
  for (let guard = 0; guard < 400; guard += 1) {
    const remainingMinutes = (targetDay - 1) * 1440 - absoluteMinute(state.time);
    if (remainingMinutes <= 0) break;
    if (state.simulationMode === 'monthly_summary') { state = run(state, { type: 'acknowledge_monthly_summary' }); continue; }
    if (state.simulationMode === 'planning' || state.simulationMode === 'week_complete' || state.simulationMode === 'paused') { state = run(state, { type: 'start_week' }); continue; }
    state = run(state, { type: 'advance_simulation', minutes: Math.min(6000, remainingMinutes) });
  }
  expect(state.time.day).toBe(targetDay);
  return state;
}

function buyer(seed = 7): GameState {
  const state = createInitialState(content, balance, seed);
  state.cash = 1_000_000;
  state.flags = { ...state.flags, private_equity_access: true };
  return state;
}

function sellError(state: GameState): string | undefined {
  const holding = state.investments?.[PE];
  return dispatchGameAction(state, { type: 'sell_investment', investmentId: PE, units: holding?.units ?? 1 }, content, balance).error;
}

describe('private equity lock (lockUntilDay)', () => {
  it('creates the holding via a real buy and locks it for 90 days from the purchase day', async () => {
    let state = buyer();
    state = run(state, { type: 'buy_investment', investmentId: PE, units: 1 });
    const holding = state.investments?.[PE];
    expect(holding).toBeTruthy();
    expect(holding!.lockUntilDay).toBe(state.time.day + 90);
  });

  it('keeps the sell blocked before lockUntilDay and allows it on the day itself', async () => {
    let state = buyer();
    state = run(state, { type: 'buy_investment', investmentId: PE, units: 1 });
    const lockUntilDay = state.investments![PE].lockUntilDay!;
    state = advanceDays(state, lockUntilDay - state.time.day - 1);
    expect(state.investments![PE].lockUntilDay).toBe(lockUntilDay);
    expect(sellError(state)).toContain('锁定期');
    state = advanceDays(state, 1);
    expect(state.time.day).toBe(lockUntilDay);
    const sold = dispatchGameAction(state, { type: 'sell_investment', investmentId: PE, units: state.investments![PE].units }, content, balance);
    expect(sold.error).toBeUndefined();
    expect(sold.state.investments?.[PE]).toBeUndefined();
  });

  it('does not extend the lock when daily valuation refreshes rewrite lastValuationDay', async () => {
    let state = buyer();
    state = run(state, { type: 'buy_investment', investmentId: PE, units: 1 });
    const lockUntilDay = state.investments![PE].lockUntilDay!;
    state = advanceDays(state, 55);
    expect(state.investments![PE].lastValuationDay).toBeGreaterThan(state.time.day - 28);
    expect(state.investments![PE].lockUntilDay).toBe(lockUntilDay);
  });

  it('extends the holding-level lock when more units are bought during or after the lock', async () => {
    let state = buyer();
    state = run(state, { type: 'buy_investment', investmentId: PE, units: 1 });
    state = advanceDays(state, 29);
    state = run(state, { type: 'buy_investment', investmentId: PE, units: 1 });
    expect(state.investments![PE].units).toBe(2);
    expect(state.investments![PE].lockUntilDay).toBe(state.time.day + 90);
    const extended = state.investments![PE].lockUntilDay!;
    state = advanceDays(state, extended - state.time.day - 1);
    expect(sellError(state)).toContain('锁定期');
    state = advanceDays(state, 1);
    expect(sellError(state)).toBeUndefined();
  });

  it('leaves non private-equity investments unlocked', async () => {
    let state = buyer();
    state = run(state, { type: 'buy_investment', investmentId: 'investment.seed-index', units: 2 });
    expect(state.investments!['investment.seed-index'].lockUntilDay).toBeUndefined();
    state = run(state, { type: 'sell_investment', investmentId: 'investment.seed-index', units: 2 });
    expect(state.investments?.['investment.seed-index']).toBeUndefined();
  });
});

describe('private equity lock migration', () => {
  const buyRecord = (day: number) => ({
    id: `life.investment.${PE}.${day}.1`,
    day,
    category: 'investment',
    title: '买入城际生活早期股权',
    detail: '1 份',
    sourceId: PE,
  });

  function rawSave(options: { day: number; lockUntilDay?: number; purchaseRecordDay?: number }) {
    const base = createInitialState(content, balance, 3);
    const holding: Record<string, unknown> = {
      investmentId: PE, units: 1, averageCost: 10_000, currentValuation: 10_500, lastValuationDay: options.day - 2,
    };
    if (options.lockUntilDay !== undefined) holding.lockUntilDay = options.lockUntilDay;
    return JSON.parse(JSON.stringify({
      ...base,
      version: balance.saveVersion,
      time: { day: options.day, hour: 8, minute: 0 },
      investments: { [PE]: holding },
      lifeHistory: options.purchaseRecordDay !== undefined ? [buyRecord(options.purchaseRecordDay)] : [],
    }));
  }

  it('derives the lock from the latest real purchase record instead of punishing old holdings', async () => {
    const migrated = migrateGameState(rawSave({ day: 200, purchaseRecordDay: 40 }), content, balance);
    expect(migrated.investments![PE].lockUntilDay).toBe(130);
    // Day 200 >= 130: the long-held position must be sellable right away.
    const result = dispatchGameAction(migrated, { type: 'sell_investment', investmentId: PE, units: 1 }, content, balance);
    expect(result.error).toBeUndefined();
  });

  it('keeps part of the original lock when the purchase is recent', async () => {
    const migrated = migrateGameState(rawSave({ day: 200, purchaseRecordDay: 150 }), content, balance);
    expect(migrated.investments![PE].lockUntilDay).toBe(240);
    const result = dispatchGameAction(migrated, { type: 'sell_investment', investmentId: PE, units: 1 }, content, balance);
    expect(result.error).toContain('锁定期');
  });

  it('defaults to unlocked when no reliable purchase fact exists', async () => {
    const migrated = migrateGameState(rawSave({ day: 200 }), content, balance);
    expect(migrated.investments![PE].lockUntilDay).toBe(200);
    const result = dispatchGameAction(migrated, { type: 'sell_investment', investmentId: PE, units: 1 }, content, balance);
    expect(result.error).toBeUndefined();
  });

  it('never rewrites an explicit lockUntilDay from the save', async () => {
    const migrated = migrateGameState(rawSave({ day: 200, lockUntilDay: 300 }), content, balance);
    expect(migrated.investments![PE].lockUntilDay).toBe(300);
  });

  it('roundtrips lockUntilDay through a real saved payload', async () => {
    const migrated = migrateGameState(rawSave({ day: 200, purchaseRecordDay: 150 }), content, balance);
    const outcome = await saveGameState(migrated);
    expect(outcome.ok).toBe(true);
    const raw = outcome.status === 'full' || outcome.status === 'compressed' ? (() => {
      // The save is stored in the canonical record; read the same payload back
      // from it, exactly as the next window's boot does.
      return canonicalSaveRaw();
    })() : null;
    expect(raw).toBeTruthy();
    const reloaded = migrateGameState(JSON.parse(raw!), content, balance);
    expect(reloaded.investments![PE].lockUntilDay).toBe(240);
  });
});
