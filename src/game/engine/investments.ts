import type { ContentRegistry, GameState, InvestmentDefinition, InvestmentHolding } from '../content/contracts';

function hash(seed: number, investmentId: string, day: number): number {
  let value = (seed ^ day * 374761393) >>> 0;
  for (const char of investmentId) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

export function investmentUnitValue(definition: InvestmentDefinition, seed: number, day: number): number {
  const noise = hash(seed, definition.id, day) * 2 - 1;
  const change = definition.dailyDrift + noise * definition.dailyVolatility;
  return Math.max(definition.baseValue * 0.55, Math.round(definition.baseValue * (1 + change * Math.min(day, 365) / 30) * 100) / 100);
}

export function investmentValuation(definition: InvestmentDefinition, holding: InvestmentHolding, seed: number, day: number): number {
  return Math.round(investmentUnitValue(definition, seed, day) * holding.units);
}

export function updateInvestmentValuations(state: GameState, content: ContentRegistry, day = state.time.day): number {
  let dividend = 0;
  for (const [investmentId, holding] of Object.entries(state.investments ?? {})) {
    const definition = content.investments?.find((entry) => entry.id === investmentId);
    if (!definition) continue;
    if (definition.kind === 'private_equity' && day < holding.lastValuationDay + 28) continue;
    holding.currentValuation = investmentValuation(definition, holding, state.rng.seed, day);
    holding.lastValuationDay = day;
    dividend += Math.round(holding.currentValuation * (definition.dividendRate ?? 0));
  }
  return dividend;
}
