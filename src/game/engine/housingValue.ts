import type { GameState, HousingDefinition } from '../content/contracts';

/**
 * 住房估值的单一真源：无任何引擎模块依赖的纯函数。
 * economy（净资产）、locations（租金/分期）、actions（买卖）都必须走这里，
 * 避免同一套房在净资产、财富页与出售价之间出现多套口径。
 */
export function developmentLevel(state: GameState, locationId?: string): number {
  return locationId ? Math.min(5, Math.max(0, state.locationDevelopment?.[locationId] ?? 0)) : 0;
}

/** 当前市场价：基准价 × 地点发展加成；没有市场价的住房返回 undefined。 */
export function housingPrice(state: GameState, home: HousingDefinition): number | undefined {
  return home.price === undefined ? undefined : Math.round(home.price * (1 + developmentLevel(state, home.locationId) * 0.03));
}
