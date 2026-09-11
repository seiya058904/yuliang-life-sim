import type { BalanceConfig } from '../balance/config';
import type { AssetDefinition, BusinessDefinition, BusinessHolding, ContentRegistry, GameState, ItemDefinition } from '../content/contracts';
import { modifierValue } from './effects';

export interface BusinessProfitBreakdown {
  revenue: number;
  goodsCost: number;
  wage: number;
  rent: number;
  profit: number;
}

export type WealthTierId = 'start' | 'savings' | 'stable' | 'abundant' | 'high_net_worth' | 'entrepreneur' | 'billionaire' | 'super_wealth' | 'world' | 'global';

export interface WealthTier {
  id: WealthTierId;
  name: string;
  description: string;
}

const wealthTiers: readonly { threshold: number; tier: WealthTier }[] = [
  { threshold: 1_000_000_000_000, tier: { id: 'global', name: '全球顶级', description: '你拥有的选择已经接近现实世界最顶级个人财富。' } },
  { threshold: 100_000_000_000, tier: { id: 'world', name: '世界级财富', description: '你的财富变化已经开始影响公司、行业甚至整个城市和世界。' } },
  { threshold: 10_000_000_000, tier: { id: 'super_wealth', name: '超级财富', description: '资本与企业组合已经拥有行业级影响力。' } },
  { threshold: 1_000_000_000, tier: { id: 'billionaire', name: '亿万级', description: '多家公司、资本与并购成为财富增长的主要来源。' } },
  { threshold: 100_000_000, tier: { id: 'entrepreneur', name: '企业家', description: '企业价值开始主导财富，工资不再是主要变量。' } },
  { threshold: 10_000_000, tier: { id: 'high_net_worth', name: '高净值', description: '工资逐渐失去主导地位，资产配置变得更重要。' } },
  { threshold: 1_000_000, tier: { id: 'abundant', name: '富足', description: '房产、企业和股权开始成为财富的主角。' } },
  { threshold: 100_000, tier: { id: 'stable', name: '稳定', description: '你可以承担投资和更大的生活决定。' } },
  { threshold: 10_000, tier: { id: 'savings', name: '有积蓄', description: '你开始拥有更多选择。' } },
  { threshold: 0, tier: { id: 'start', name: '起步', description: '钱几乎决定每个选择。' } },
];

export function wealthTierForNetWorth(netWorth: number): WealthTier {
  return wealthTiers.find((entry) => netWorth >= entry.threshold)?.tier ?? wealthTiers.at(-1)!.tier;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

export type BusinessOwnershipTier = 'minority' | 'strategic' | 'controlling' | 'wholly_owned';

export interface OwnershipTierInfo {
  tier: BusinessOwnershipTier;
  name: string;
  description: string;
}

const ownershipTiers: readonly { minPercent: number; info: OwnershipTierInfo }[] = [
  { minPercent: 100, info: { tier: 'wholly_owned', name: '全资企业', description: '这家企业完全属于你，所有经营与董事会决策都由你决定。' } },
  { minPercent: 50, info: { tier: 'controlling', name: '控股企业', description: '你掌握经营决策权，可以推进董事会层面的调整。' } },
  { minPercent: 20, info: { tier: 'strategic', name: '战略持股', description: '你有重要话语权并按持股分享利润，重大经营调整仍需要控股。' } },
  { minPercent: 0, info: { tier: 'minority', name: '少数股权投资', description: '按持股比例分享利润；可以继续增持，也可以减持变现。' } },
];

export function ownershipTierForEquity(percent: number): OwnershipTierInfo {
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (ownershipTiers.find((entry) => clamped >= entry.minPercent) ?? ownershipTiers.at(-1)!).info;
}

export function ownershipTierForHolding(holding: Pick<BusinessHolding, 'equityPercent'>): OwnershipTierInfo {
  return ownershipTierForEquity(holding.equityPercent ?? 100);
}

/** Controlling (>=50%) or wholly owned holdings may direct operations and board decisions. */
export function canDirectBusinessOperations(holding: Pick<BusinessHolding, 'equityPercent'> | undefined): boolean {
  if (!holding) return false;
  const tier = ownershipTierForHolding(holding).tier;
  return tier === 'controlling' || tier === 'wholly_owned';
}

/** Location that should receive visits and city context for this holding. */
export function effectiveBusinessLocationId(holding: Pick<BusinessHolding, 'relocatedLocationId'>, definition: Pick<BusinessDefinition, 'locationId'>): string | undefined {
  return holding.relocatedLocationId ?? definition.locationId;
}

export function calculateDailyBusinessProfit(holding: BusinessHolding, definition: BusinessDefinition, state?: GameState): BusinessProfitBreakdown {
  const priceMultiplier = definition.priceLevels[holding.priceLevel] ?? 1;
  const wageMultiplier = definition.wageLevels[holding.wageLevel] ?? 1;
  const inventoryMultiplier = definition.inventoryLevels[holding.inventoryLevel] ?? 1;
  // Board-level restructuring reduces recurring wage and rent costs; it never inflates revenue.
  const bonus = Math.min(25, Math.max(0, holding.operatingBonusPercent ?? 0)) / 100;
  const revenue = roundMoney(definition.baseRevenue * priceMultiplier * inventoryMultiplier);
  const goodsCost = roundMoney(definition.baseGoodsCost * inventoryMultiplier);
  const wage = roundMoney(definition.baseWage * wageMultiplier * (1 - bonus));
  const rent = roundMoney(definition.baseRent * (1 - bonus));
  // A `business_profit` permanent modifier is a real operating edge, applied to
  // profit instead of inflating gross revenue.
  const grossProfit = revenue - goodsCost - wage - rent;
  const profit = state ? roundMoney(modifierValue(state, 'business_profit', grossProfit, definition.tags ?? [])) : grossProfit;
  return { revenue, goodsCost, wage, rent, profit };
}

export function businessValuation(holding: BusinessHolding, balance: BalanceConfig): number {
  return Math.max(0, Math.round((holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balance.businessValuationRatio));
}

export function calculateDailyPublicBusinessDividend(state: GameState, content: ContentRegistry): number {
  return Object.entries(state.publicBusinessEquities ?? {}).reduce((total, [businessId, publicHolding]) => {
    const holding = state.businesses[businessId];
    const definition = content.businesses.find((entry) => entry.id === businessId);
    if (!holding?.listed || !definition) return total;
    const profit = calculateDailyBusinessProfit(holding, definition, state).profit;
    return total + (profit > 0 ? roundMoney(profit * publicHolding.percent / 100) : 0);
  }, 0);
}

function findItem(content: ContentRegistry, itemId: string): ItemDefinition | undefined {
  return content.items.find((item) => item.id === itemId);
}

export function calculateLifestyle(state: GameState, content: ContentRegistry): number {
  const home = content.housing.find((housing) => housing.id === state.housing.housingId);
  const itemLifestyle = Object.entries(state.inventory).reduce((total, [itemId, quantity]) => total + (findItem(content, itemId)?.lifestyleDelta ?? 0) * quantity, 0);
  const reliefPenalty = state.time.day <= state.housingReliefUntilDay ? 3 : 0;
  return Math.max(0, state.lifestyle + (home?.lifestyleDelta ?? 0) + itemLifestyle - reliefPenalty);
}

export function calculateNetWorth(state: GameState, content: ContentRegistry, balance: BalanceConfig): number {
  const cash = state.cash;
  const home = content.housing.find((housing) => housing.id === state.housing.housingId);
  const housingValue = state.housing.mode === 'owned' ? (home?.valuation ?? 0) : 0;
  const itemValue = Object.entries(state.inventory).reduce((total, [itemId, quantity]) => {
    const item = findItem(content, itemId);
    return total + (item?.sellable ? (state.itemPurchasePrices[itemId] ?? item.price) * item.resaleRatio * quantity : 0);
  }, 0);
  const businessValue = Object.values(state.businesses).reduce((total, holding) => total + businessValuation(holding, balance) * ((holding.equityPercent ?? 100) / 100), 0);
  const publicBusinessEquityValue = Object.entries(state.publicBusinessEquities ?? {}).reduce((total, [businessId, publicHolding]) => {
    const business = state.businesses[businessId];
    return total + (business ? businessValuation(business, balance) * publicHolding.percent / 100 : 0);
  }, 0);
  const assetValue = Object.entries(state.assets).reduce((total, [assetId, holding]) => {
    const definition = content.assets.find((asset) => asset.id === assetId) as AssetDefinition | undefined;
    return total + (holding.currentValuation || definition?.valuation || 0);
  }, 0);
  const investmentValue = Object.values(state.investments ?? {}).reduce((total, holding) => total + holding.currentValuation, 0);
  const housingHoldingValue = Object.values(state.housingHoldings ?? {}).reduce((total, holding) => total + holding.currentValuation, 0);
  const mortgageBalance = state.mortgage?.remainingPrincipal ?? 0;
  return roundMoney(cash + housingValue + housingHoldingValue + itemValue + businessValue + publicBusinessEquityValue + assetValue + investmentValue - mortgageBalance);
}

export function calculateDailyPassiveIncome(state: GameState, content: ContentRegistry): BusinessProfitBreakdown & { assetIncome: number } {
  const business = Object.values(state.businesses).reduce((total, holding) => {
    const definition = content.businesses.find((entry) => entry.id === holding.businessId);
    if (!definition) return total;
    const breakdown = calculateDailyBusinessProfit(holding, definition, state);
    const equity = Math.min(100, Math.max(0, holding.equityPercent ?? 100)) / 100;
    return {
      revenue: total.revenue + roundMoney(breakdown.revenue * equity),
      goodsCost: total.goodsCost + roundMoney(breakdown.goodsCost * equity),
      wage: total.wage + roundMoney(breakdown.wage * equity),
      rent: total.rent + roundMoney(breakdown.rent * equity),
      profit: total.profit + roundMoney(breakdown.profit * equity),
    };
  }, { revenue: 0, goodsCost: 0, wage: 0, rent: 0, profit: 0 });
  const assetIncome = Object.entries(state.assets).reduce((total, [assetId]) => total + (content.assets.find((asset) => asset.id === assetId)?.dailyIncome ?? 0), 0);
  return { ...business, assetIncome };
}
