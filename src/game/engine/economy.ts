import type { BalanceConfig } from '../balance/config';
import type { AssetDefinition, BusinessDefinition, BusinessHolding, ContentRegistry, GameState, ItemDefinition } from '../content/contracts';

export interface BusinessProfitBreakdown {
  revenue: number;
  goodsCost: number;
  wage: number;
  rent: number;
  profit: number;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

export function calculateDailyBusinessProfit(holding: BusinessHolding, definition: BusinessDefinition): BusinessProfitBreakdown {
  const priceMultiplier = definition.priceLevels[holding.priceLevel] ?? 1;
  const wageMultiplier = definition.wageLevels[holding.wageLevel] ?? 1;
  const inventoryMultiplier = definition.inventoryLevels[holding.inventoryLevel] ?? 1;
  const revenue = roundMoney(definition.baseRevenue * priceMultiplier * inventoryMultiplier);
  const goodsCost = roundMoney(definition.baseGoodsCost * inventoryMultiplier);
  const wage = roundMoney(definition.baseWage * wageMultiplier);
  const rent = roundMoney(definition.baseRent);
  return { revenue, goodsCost, wage, rent, profit: revenue - goodsCost - wage - rent };
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
  const businessValue = Object.values(state.businesses).reduce((total, holding) => total + (holding.purchasePrice + (holding.capitalInvested ?? 0) + (holding.fundingRaised ?? 0)) * balance.businessValuationRatio * ((holding.equityPercent ?? 100) / 100), 0);
  const assetValue = Object.entries(state.assets).reduce((total, [assetId, holding]) => {
    const definition = content.assets.find((asset) => asset.id === assetId) as AssetDefinition | undefined;
    return total + (holding.currentValuation || definition?.valuation || 0);
  }, 0);
  const investmentValue = Object.values(state.investments ?? {}).reduce((total, holding) => total + holding.currentValuation, 0);
  return roundMoney(cash + housingValue + itemValue + businessValue + assetValue + investmentValue);
}

export function calculateDailyPassiveIncome(state: GameState, content: ContentRegistry): BusinessProfitBreakdown & { assetIncome: number } {
  const business = Object.values(state.businesses).reduce((total, holding) => {
    const definition = content.businesses.find((entry) => entry.id === holding.businessId);
    if (!definition) return total;
    const breakdown = calculateDailyBusinessProfit(holding, definition);
    return {
      revenue: total.revenue + breakdown.revenue,
      goodsCost: total.goodsCost + breakdown.goodsCost,
      wage: total.wage + breakdown.wage,
      rent: total.rent + breakdown.rent,
      profit: total.profit + breakdown.profit,
    };
  }, { revenue: 0, goodsCost: 0, wage: 0, rent: 0, profit: 0 });
  const assetIncome = Object.entries(state.assets).reduce((total, [assetId]) => total + (content.assets.find((asset) => asset.id === assetId)?.dailyIncome ?? 0), 0);
  return { ...business, assetIncome };
}
