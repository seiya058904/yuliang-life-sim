import { known } from './knownAmount';
import { describe, expect, it } from 'vitest';
import { calculateDailyBusinessProfit, calculateDailyPassiveIncome, calculateDailyPublicBusinessDividend, calculateLifestyle, calculateNetWorth, canDirectBusinessOperations, ownershipTierForEquity, wealthTierForNetWorth } from './economy';
import type { ContentRegistry, GameState } from '../content/contracts';
import { balanceConfig } from '../balance/config';

const state: GameState = {
  version: 1, contentVersion: 1, time: { day: 1, hour: 8, minute: 0 }, calendar: { week: 1, weekday: 1, month: 1, weekOfMonth: 1 }, cash: 100, ability: 10, reputation: 0, lifestyle: 12,
  weeklyPlan: { days: {} as never, autoRepeat: true }, autoRepeatPlan: true, simulationMode: 'planning', simulationSpeed: 1, monthlyLedger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: known(0), netWorthEnd: known(0) },
  jobExperience: {}, inventory: { 'item.collectible': 1 }, itemPurchasePrices: { 'item.collectible': 200 }, unlockedCapabilities: [], unlockedJobIds: [], unlockedHousingIds: [], unlockedBusinessIds: [], unlockedAssetIds: [], discounts: [],
  housing: { housingId: 'housing.room', mode: 'owned' }, relationships: {}, businesses: { 'business.kiosk': { businessId: 'business.kiosk', priceLevel: 1, wageLevel: 0, inventoryLevel: 2, purchasePrice: 1000 } }, assets: { 'asset.fund': { assetId: 'asset.fund', purchasePrice: 500, purchaseDay: 1, currentValuation: 550 } }, completedEvents: [], completedMilestones: [], eventCooldowns: {}, chainStages: {}, flags: {}, modifiers: [], marketJobIds: [], eventMeter: 0, eventDay: 1, eventsToday: 0, lastSettledDay: 0, housingReliefUntilDay: 0, rentReliefAvailableDay: 0, rng: { seed: 1, cursor: 0 },
  lifeHistory: [],
};

const content = {
  jobs: [], items: [{ id: 'item.collectible', contentStatus: 'seed', name: '收藏品', description: '测试', category: 'collectible', price: 200, consumable: false, sellable: true, resaleRatio: 0.5, lifestyleDelta: 2 }],
  housing: [{ id: 'housing.room', contentStatus: 'seed', name: '房间', description: '测试', mode: 'both', rentPerDay: 10, price: 1000, valuation: 1000, lifestyleDelta: 5, furnitureCapacity: 2 }],
  businesses: [{ id: 'business.kiosk', contentStatus: 'seed', name: '小店', description: '测试', price: 1000, baseRevenue: 200, baseGoodsCost: 50, baseWage: 20, baseRent: 30, priceLevels: [1, 1.1, 1.2], wageLevels: [1, 1.1], inventoryLevels: [0.8, 1, 1.2] }],
  assets: [{ id: 'asset.fund', contentStatus: 'seed', name: '基金', description: '测试', kind: 'investment', price: 500, valuation: 500, dailyIncome: 10, volatility: 0 }], characters: [], events: [], eventChains: [], milestones: [], vocabulary: { capabilities: [], tags: [] },
} as unknown as ContentRegistry;

describe('economy calculations', () => {
  it('maps long-term net worth to the documented wealth ladder', () => {
    expect(wealthTierForNetWorth(999_999).id).toBe('stable');
    expect(wealthTierForNetWorth(1_000_000).id).toBe('abundant');
    expect(wealthTierForNetWorth(100_000_000_000).id).toBe('world');
    expect(wealthTierForNetWorth(1_000_000_000_000).id).toBe('global');
  });

  it('explains net worth from cash, housing, business, assets and sellable items', () => {
    // 住房走 housingPrice（价格 × 发展加成，无发展 = 价格）；官方内容约定 valuation === price。
    expect(calculateNetWorth(state, content, balanceConfig)).toBe(100 + 1000 + 650 + 550 + 100);
  });

  it('adds housing and owned item lifestyle without mutating state', () => {
    expect(calculateLifestyle(state, content)).toBe(19);
    expect(state.lifestyle).toBe(12);
  });

  it('returns a transparent business profit breakdown', () => {
    expect(calculateDailyBusinessProfit(state.businesses['business.kiosk'], content.businesses[0])).toEqual({
      revenue: 200 * 1.1 * 1.2,
      goodsCost: 50 * 1.2,
      wage: 20,
      rent: 30,
      profit: 200 * 1.1 * 1.2 - 50 * 1.2 - 20 - 30,
    });
  });

  it('distributes passive business profit according to the player equity share', () => {
    const diluted = { ...state, businesses: { 'business.kiosk': { ...state.businesses['business.kiosk'], equityPercent: 50 } } };
    expect(calculateDailyPassiveIncome(diluted, content).profit).toBe(77);
  });

  it('values and pays dividends for separately held listed business shares', () => {
    const listed = {
      ...state,
      businesses: { 'business.kiosk': { ...state.businesses['business.kiosk'], listed: true, publicFloatPercent: 35, equityPercent: 65 } },
      publicBusinessEquities: { 'business.kiosk': { businessId: 'business.kiosk', percent: 10, investedAmount: 65, purchaseDay: 29 } },
    };
    expect(calculateDailyPublicBusinessDividend(listed, content)).toBe(15);
    expect(calculateNetWorth(listed, content, balanceConfig)).toBe(Math.round(100 + 1000 + 650 * 0.65 + 65 + 550 + 100));
  });
});

describe('business ownership tiers', () => {
  const holding = (equityPercent: number) => ({ businessId: 'business.kiosk', priceLevel: 1, wageLevel: 0, inventoryLevel: 2, purchasePrice: 1000, equityPercent });

  it('classifies equity stakes into minority, strategic, controlling and wholly owned levels', () => {
    expect(ownershipTierForEquity(10).tier).toBe('minority');
    expect(ownershipTierForEquity(19).tier).toBe('minority');
    expect(ownershipTierForEquity(20).name).toBe('战略持股');
    expect(ownershipTierForEquity(49).name).toBe('战略持股');
    expect(ownershipTierForEquity(50).name).toBe('控股企业');
    expect(ownershipTierForEquity(99).name).toBe('控股企业');
    expect(ownershipTierForEquity(100).name).toBe('全资企业');
    expect(ownershipTierForEquity(-5).tier).toBe('minority');
  });

  it('only lets controlling or wholly owned holdings direct operations', () => {
    expect(canDirectBusinessOperations(undefined)).toBe(false);
    expect(canDirectBusinessOperations(holding(10))).toBe(false);
    expect(canDirectBusinessOperations(holding(30))).toBe(false);
    expect(canDirectBusinessOperations(holding(50))).toBe(true);
    expect(canDirectBusinessOperations(holding(100))).toBe(true);
  });

  it('applies board restructuring as wage and rent relief instead of fake revenue', () => {
    const plain = calculateDailyBusinessProfit(state.businesses['business.kiosk'], content.businesses[0]);
    const restructured = calculateDailyBusinessProfit({ ...state.businesses['business.kiosk'], operatingBonusPercent: 10 }, content.businesses[0]);
    expect(restructured.revenue).toBe(plain.revenue);
    expect(restructured.wage).toBe(Math.round(plain.wage * 0.9));
    expect(restructured.rent).toBe(Math.round(plain.rent * 0.9));
    expect(restructured.profit).toBeGreaterThan(plain.profit);
  });
});
