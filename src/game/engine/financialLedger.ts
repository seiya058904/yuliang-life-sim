import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, FinancialCategory, FinancialEntry, FinancialGroup, FinancialLedgerState, GameState, MonthlyFinancialSummary } from '../content/contracts';
import { calculateNetWorth } from './economy';

export interface FinancialEntryInput {
  day: number;
  direction: FinancialEntry['direction'];
  category: FinancialCategory;
  amount: number;
  label: string;
  sourceType?: string;
  sourceId?: string;
  group?: FinancialGroup;
  cashDelta?: number;
  costBasis?: number;
}

const incomeCategories = new Set<FinancialCategory>(['wage', 'side_job', 'bonus', 'business_income', 'property_income', 'investment_dividend', 'event_income', 'other_income', 'realized_gain']);
const allocationCategories = new Set<FinancialCategory>(['investment_transfer', 'property_transfer', 'business_transfer', 'collectible_transfer']);
const liquidationCategories = new Set<FinancialCategory>(['asset_liquidation', 'valuation_change']);

export function groupForCategory(category: FinancialCategory, explicit?: FinancialGroup): FinancialGroup {
  if (explicit) return explicit;
  if (incomeCategories.has(category)) return 'income';
  if (allocationCategories.has(category)) return 'asset_allocation';
  if (liquidationCategories.has(category)) return 'asset_liquidation';
  return 'consumption';
}

export function emptyFinancialLedger(month: number, cashStart = 0, netWorthStart = cashStart): FinancialLedgerState {
  return { month, nextSequence: 1, entries: [], cashStart, netWorthStart };
}

export function recordFinancialEntry(ledger: FinancialLedgerState, input: FinancialEntryInput): FinancialLedgerState {
  const amount = Math.max(0, Math.round(input.amount));
  if (amount === 0) return ledger;
  const group = groupForCategory(input.category, input.group);
  const cashDelta = input.cashDelta ?? (input.direction === 'income' || group === 'asset_liquidation' ? amount : -amount);
  const entry: FinancialEntry = {
    id: `financial:${ledger.month}:${ledger.nextSequence}`,
    day: input.day,
    direction: input.direction,
    group,
    category: input.category,
    amount,
    cashDelta,
    costBasis: input.costBasis,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    label: input.label,
  };
  return { ...ledger, nextSequence: ledger.nextSequence + 1, entries: [...ledger.entries, entry] };
}

function groupSummary(entries: readonly FinancialEntry[], group: FinancialGroup): { group: FinancialGroup; amount: number; categories: Record<string, number> } {
  const categories: Record<string, number> = {};
  for (const entry of entries) if (entry.group === group) categories[entry.category] = (categories[entry.category] ?? 0) + entry.amount;
  return { group, amount: Object.values(categories).reduce((sum, amount) => sum + amount, 0), categories };
}

export function summarizeFinancialLedger(ledger: FinancialLedgerState, cashStart: number, cashEnd: number, netWorthStart: number, netWorthEnd: number): MonthlyFinancialSummary {
  const income = groupSummary(ledger.entries, 'income');
  const consumption = groupSummary(ledger.entries, 'consumption');
  const assetAllocation = groupSummary(ledger.entries, 'asset_allocation');
  const assetLiquidation = groupSummary(ledger.entries, 'asset_liquidation');
  return {
    month: ledger.month,
    income,
    consumption,
    assetAllocation,
    assetLiquidation,
    totalIncome: income.amount,
    totalConsumption: consumption.amount,
    totalAssetAllocation: assetAllocation.amount,
    totalAssetLiquidation: assetLiquidation.amount,
    cashStart,
    cashEnd,
    cashChange: cashEnd - cashStart,
    netWorthStart,
    netWorthEnd,
    netWorthChange: netWorthEnd - netWorthStart,
  };
}

export function projectLegacyMonthlyLedger(summary: MonthlyFinancialSummary): { wageIncome: number; sideJobIncome: number; businessIncome: number; assetIncome: number; rentExpense: number; purchaseExpense: number; livingExpense: number; netWorthStart: number; netWorthEnd: number } {
  const categories = (summary: { categories: Record<string, number> }, key: string) => summary.categories[key] ?? 0;
  return {
    wageIncome: categories(summary.income, 'wage'),
    sideJobIncome: categories(summary.income, 'side_job'),
    businessIncome: categories(summary.income, 'business_income'),
    assetIncome: categories(summary.income, 'investment_dividend') + categories(summary.income, 'property_income'),
    rentExpense: categories(summary.consumption, 'housing'),
    purchaseExpense: categories(summary.consumption, 'shopping'),
    livingExpense: categories(summary.consumption, 'living') + categories(summary.consumption, 'food') + categories(summary.consumption, 'transport') + categories(summary.consumption, 'communication'),
    netWorthStart: summary.netWorthStart,
    netWorthEnd: summary.netWorthEnd,
  };
}

export function recordStateFinancialEntry(state: GameState, input: FinancialEntryInput): void {
  const ledger = state.financialLedger ?? emptyFinancialLedger(state.calendar.month, state.cash, state.monthlyLedger.netWorthStart);
  state.financialLedger = recordFinancialEntry(ledger, input);
}

export function syncLegacyMonthlyLedger(state: GameState, content: ContentRegistry, balance: BalanceConfig): void {
  const ledger = state.financialLedger ?? emptyFinancialLedger(state.calendar.month, state.cash, state.monthlyLedger.netWorthStart);
  const summary = summarizeFinancialLedger(
    ledger,
    ledger.cashStart ?? state.monthlyLedger.netWorthStart,
    state.cash,
    ledger.netWorthStart ?? state.monthlyLedger.netWorthStart,
    calculateNetWorth(state, content, balance),
  );
  state.monthlyLedger = projectLegacyMonthlyLedger(summary);
}
