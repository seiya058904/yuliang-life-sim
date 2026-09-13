import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameState } from '../content/contracts';
import { dispatchGameAction } from './actions';
import { calculateNetWorth, wealthAllocationBreakdown } from './economy';
import { housingPrice } from './housingValue';
import { createInitialState } from './initialState';

/**
 * 财富口径一致性：地点发展 > 0 后，净资产、财富页分项与实际买卖
 * 必须共用 housingPrice 当前市场价，分项合计必须能对回净资产。
 */
function wealthyState(): GameState {
  const state = createInitialState(contentRegistry, balanceConfig, 3);
  state.time = { day: 85, hour: 9, minute: 0 };
  state.cash = 500_000;
  state.ability = 30;
  state.reputation = 12;
  state.locationDevelopment = { 'location.central': 3, 'location.riverside': 2 };
  state.unlockedHousingIds = ['housing.modern-apartment', 'housing.sunny-apartment'];
  state.housing = { housingId: 'housing.modern-apartment', mode: 'owned' };
  state.mortgage = { housingId: 'housing.modern-apartment', remainingPrincipal: 20_000, monthlyPayment: 2_000, totalMonths: 24, paidMonths: 2 };
  state.housingHoldings = { 'housing.seed-room': { housingId: 'housing.seed-room', purchasePrice: 5_800, currentValuation: 6_000, occupancy: 'rented' } };
  state.businesses = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3_200, capitalInvested: 1_000, equityPercent: 60, publicFloatPercent: 40, fundingRaised: 0, fundingRound: 0, playerCostBasis: { kind: 'known', value: 4_200 } } };
  state.publicBusinessEquities = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', percent: 10, investedAmount: 500, purchaseDay: 80 } };
  state.investments = { 'investment.seed-index': { investmentId: 'investment.seed-index', units: 100, averageCost: 102, currentValuation: 10_500, lastValuationDay: 85 } };
  state.assets = { 'asset.city-ev': { assetId: 'asset.city-ev', purchasePrice: 148_000, purchaseDay: 60, currentValuation: 142_000 } };
  state.inventory = { 'item.pro-laptop': 1 };
  state.itemPurchasePrices = { 'item.pro-laptop': 2_800 };
  return state;
}

describe('住房估值单一口径', () => {
  it('地点发展 > 0 时净资产、出售价都使用 housingPrice 当前市场价', () => {
    const state = wealthyState();
    const home = contentRegistry.housing.find((entry) => entry.id === 'housing.modern-apartment')!;
    const marketPrice = housingPrice(state, home)!;
    // 发展加成真实生效（价格高于静态基准），否则本测试没有意义。
    expect(marketPrice).toBeGreaterThan(home.price!);

    delete state.mortgage; // 出售价 = 市场价 − 未结清本金；按揭勾稽不在本测试范围。
    const before = state.cash;
    const result = dispatchGameAction(state, { type: 'sell_housing' }, contentRegistry, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(result.state.cash - before).toBe(marketPrice);
  });

  it('净资产中的自住房部分等于同一市场价', () => {
    const state = wealthyState();
    const home = contentRegistry.housing.find((entry) => entry.id === 'housing.modern-apartment')!;
    const marketPrice = housingPrice(state, home)!;
    const withHome = calculateNetWorth(state, contentRegistry, balanceConfig);
    const withoutHome = structuredClone(state);
    withoutHome.housing = { housingId: 'housing.seed-room', mode: 'rent' };
    expect(withHome - calculateNetWorth(withoutHome, contentRegistry, balanceConfig)).toBe(marketPrice);
  });

  it('投资房买入后的初始估值等于支付的市场价', () => {
    const state = wealthyState();
    state.housingHoldings = {};
    const sunny = contentRegistry.housing.find((entry) => entry.id === 'housing.sunny-apartment')!;
    const price = housingPrice(state, sunny)!;
    const before = state.cash;
    const result = dispatchGameAction(state, { type: 'buy_rental_housing', housingId: 'housing.sunny-apartment' }, contentRegistry, balanceConfig);
    expect(result.error).toBeUndefined();
    expect(before - result.state.cash).toBe(price);
    expect(result.state.housingHoldings?.['housing.sunny-apartment']?.currentValuation).toBe(price);
  });
});

describe('财富配置与净资产勾稽', () => {
  it('全部分项（含公开股权、物品余值、贷款负项）合计等于净资产', () => {
    const state = wealthyState();
    const breakdown = wealthAllocationBreakdown(state, contentRegistry, balanceConfig);
    const sum = breakdown.reduce((total, entry) => total + entry.value, 0);
    const netWorth = calculateNetWorth(state, contentRegistry, balanceConfig);
    expect(breakdown.map((entry) => entry.key)).toContain('public_business_equity');
    expect(breakdown.map((entry) => entry.key)).toContain('inventory_items');
    expect(breakdown.map((entry) => entry.key)).toContain('mortgage');
    // 分项均为按类别取整前的同一口径值，与净资产的差异只允许来自末次取整。
    expect(Math.abs(sum - netWorth)).toBeLessThanOrEqual(1);
  });

  it('资不抵债（贷款高于自住房价值）时同样勾稽通过', () => {
    const state = wealthyState();
    state.mortgage = { housingId: 'housing.modern-apartment', remainingPrincipal: 96_000, monthlyPayment: 4_600, totalMonths: 24, paidMonths: 6 };
    const breakdown = wealthAllocationBreakdown(state, contentRegistry, balanceConfig);
    const sum = breakdown.reduce((total, entry) => total + entry.value, 0);
    expect(Math.abs(sum - calculateNetWorth(state, contentRegistry, balanceConfig))).toBeLessThanOrEqual(1);
  });

  it('普通无资产存档同样勾稽通过', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 11);
    const breakdown = wealthAllocationBreakdown(state, contentRegistry, balanceConfig);
    const sum = breakdown.reduce((total, entry) => total + entry.value, 0);
    expect(Math.abs(sum - calculateNetWorth(state, contentRegistry, balanceConfig))).toBeLessThanOrEqual(1);
  });
});
