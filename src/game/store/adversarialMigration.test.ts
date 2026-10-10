import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { balanceConfig as balance } from '../balance/config';
import type { GameState, InvestmentHolding } from '../content/contracts';
import { contentRegistry as content } from '../content/registry';
import { createInitialState } from '../engine/initialState';
import { PRIVATE_EQUITY_LOCK_DAYS } from '../engine/investments';
import { createGameStore, migrateGameState, SAVE_KEY, saveGameState } from './gameStore';
import { canonicalSaveRaw } from './canonicalSaveTestDouble';

const investmentId = content.investments![0].id;
const assetId = content.assets[0].id;
const investment = { investmentId, units: 3, averageCost: 100.25, currentValuation: 301, lastValuationDay: 1 };
const asset = { assetId, purchasePrice: 100.25, purchaseDay: 1, currentValuation: 0 };

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe.each(['canonical', 'legacy'] as const)('damaged known financial holdings (%s)', source => {
  it.each([
    ['null investment', 'investments', investmentId, null],
    ['incomplete investment', 'investments', investmentId, {}],
    ['string valuation', 'investments', investmentId, { ...investment, currentValuation: '301' }],
    ['negative units', 'investments', investmentId, { ...investment, units: -1 }],
    ['mismatched investment ID', 'investments', investmentId, { ...investment, investmentId: 'investment.other' }],
    ['invalid investment date', 'investments', investmentId, { ...investment, lastValuationDay: 0 }],
    ['null asset', 'assets', assetId, null],
    ['incomplete asset', 'assets', assetId, {}],
    ['string asset price', 'assets', assetId, { ...asset, purchasePrice: '100' }],
    ['negative asset valuation', 'assets', assetId, { ...asset, currentValuation: -1 }],
    ['mismatched asset ID', 'assets', assetId, { ...asset, assetId: 'asset.other' }],
    ['invalid asset date', 'assets', assetId, { ...asset, purchaseDay: 0 }],
  ] as const)('protects the original payload for %s', async (_label, table, id, holding) => {
    const state = createInitialState(content, balance, 1);
    const damaged = { ...state, [table]: { [id]: holding } } as unknown as GameState;
    const raw = JSON.stringify(damaged);
    if (source === 'canonical') expect((await saveGameState(damaged)).ok).toBe(true);
    else localStorage.setItem(SAVE_KEY, raw);

    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toMatchObject({ kind: 'unreadable', raw, writeProtected: true });
    expect(store.getState().game.investments).toEqual({});
    expect(store.getState().game.assets).toEqual({});
    // Protected exploration must not silently overwrite the malformed holding.
    expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 })).toBe(true);
    await store.getState().flushSaveAsync();
    expect(canonicalSaveRaw()).toBe(source === 'canonical' ? raw : null);
    if (source === 'legacy') expect(localStorage.getItem(SAVE_KEY)).toBe(raw);
  });
});

describe.each(['canonical', 'legacy'] as const)('damaged cash records (%s)', source => {
  it.each([null, '100', 'invalid', false])('protects a supplied invalid cash balance %j before any economic action', async cash => {
    const initial = createInitialState(content, balance, 1);
    const damaged = { ...initial, cash } as unknown as GameState;
    const raw = JSON.stringify(damaged);
    if (source === 'canonical') expect((await saveGameState(damaged)).ok).toBe(true);
    else localStorage.setItem(SAVE_KEY, raw);

    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toMatchObject({ kind: 'unreadable', raw, writeProtected: true });
    expect(store.getState().game.cash).toBe(initial.cash);
    expect(store.getState().dispatch({ type: 'purchase_items', items: { 'item.breakfast-voucher': 1 } })).toBe(true);
    expect(store.getState().game.inventory['item.breakfast-voucher']).toBe(1);
    expect(Number.isFinite(store.getState().game.cash)).toBe(true);
    await store.getState().flushSaveAsync();
    expect(canonicalSaveRaw()).toBe(source === 'canonical' ? raw : null);
    if (source === 'legacy') expect(localStorage.getItem(SAVE_KEY)).toBe(raw);
  });
});

describe('cash migration compatibility', () => {
  it.each([-100, 0, 1_000_000_000_000, 1e308])('preserves the finite balance %j without clamping or repricing', async cash => {
    const state = { ...createInitialState(content, balance, 1), cash };
    expect((await saveGameState(state)).ok).toBe(true);
    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toBeUndefined();
    expect(store.getState().game.cash).toBe(cash);
  });

  it('retains the existing initial default when a legacy cash field is absent', () => {
    const initial = createInitialState(content, balance, 1);
    const raw = { ...initial } as Partial<GameState>;
    delete raw.cash;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    const store = createGameStore(content, balance);
    expect(store.getState().recovery).toBeUndefined();
    expect(store.getState().game.cash).toBe(initial.cash);
  });
});

describe('financial migration compatibility', () => {
  it('preserves legal fractional cost bases and zero valuations without repricing', () => {
    const state = createInitialState(content, balance, 1);
    state.investments = { [investmentId]: investment };
    state.assets = { [assetId]: asset };
    const restored = migrateGameState(JSON.parse(JSON.stringify(state)), content, balance);
    expect(restored.investments).toEqual(state.investments);
    expect(restored.assets).toEqual(state.assets);
  });

  it('keeps absent legacy holding maps and optional private-equity lock fields compatible', () => {
    const state = createInitialState(content, balance, 1) as unknown as Record<string, unknown>;
    delete state.investments;
    delete state.assets;
    const empty = migrateGameState(state, content, balance);
    expect(empty.investments).toEqual({});
    expect(empty.assets).toEqual({});
    const privateEquity = content.investments!.find(entry => entry.kind === 'private_equity')!;
    const holding: InvestmentHolding = { ...investment, investmentId: privateEquity.id };
    const restored = migrateGameState({ ...state, investments: { [privateEquity.id]: holding } }, content, balance);
    expect(restored.investments?.[privateEquity.id]).toMatchObject({ ...holding, lockUntilDay: restored.time.day });
  });

  it('retains the established removal behavior for unknown content IDs', () => {
    const state = createInitialState(content, balance, 1);
    const restored = migrateGameState({ ...state, investments: { 'investment.removed': null }, assets: { 'asset.removed': null } }, content, balance);
    expect(restored.investments).toEqual({});
    expect(restored.assets).toEqual({});
  });
});

it('reloads an unbounded valid history without losing records, ID sequence or private-equity purchase lock', () => {
  const state = createInitialState(content, balance, 1);
  const privateEquity = content.investments!.find(entry => entry.kind === 'private_equity')!;
  const count = 150_000;
  state.time.day = 7;
  state.nextLifeRecordSequence = 4;
  state.lifeHistory = Array.from({ length: count }, (_, index) => ({
    id: `life.investment.${privateEquity.id}.1.${500_000 + index}`,
    day: index % 7 + 1,
    category: 'investment' as const,
    sourceId: privateEquity.id,
    title: '买入历史记录',
  }));
  state.investments = { [privateEquity.id]: { ...investment, investmentId: privateEquity.id } };
  const restored = migrateGameState(JSON.parse(JSON.stringify(state)), content, balance);
  expect(restored.lifeHistory).toHaveLength(count);
  expect(restored.lifeHistory.at(0)).toEqual(state.lifeHistory.at(0));
  expect(restored.lifeHistory.at(-1)).toEqual(state.lifeHistory.at(-1));
  expect(restored.nextLifeRecordSequence).toBe(500_000 + count - 1);
  expect(restored.investments?.[privateEquity.id]?.lockUntilDay).toBe(7 + PRIVATE_EQUITY_LOCK_DAYS);
});
