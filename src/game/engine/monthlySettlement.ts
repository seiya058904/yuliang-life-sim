import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameEffect, GameState, MonthlyLedger, MonthlySummary } from '../content/contracts';
import { calculateNetWorth } from './economy';
import { emptyFinancialLedger, projectLegacyMonthlyLedger, summarizeFinancialLedger } from './financialLedger';

export function emptyMonthlyLedger(netWorthStart: number): MonthlyLedger {
  return { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart, netWorthEnd: netWorthStart };
}

export function closeMonth(state: GameState, month: number, content: ContentRegistry, balance: BalanceConfig, output: GameEffect[]): MonthlySummary {
  const financialLedger = state.financialLedger ?? emptyFinancialLedger(month, state.monthlyLedger.netWorthStart, state.monthlyLedger.netWorthStart);
  const netWorthEnd = calculateNetWorth(state, content, balance);
  const financialSummary = summarizeFinancialLedger(financialLedger, financialLedger.cashStart ?? state.monthlyLedger.netWorthStart, state.cash, financialLedger.netWorthStart ?? state.monthlyLedger.netWorthStart, netWorthEnd);
  const ledger = { ...projectLegacyMonthlyLedger(financialSummary), netWorthEnd };
  const summary = { month, ledger };
  state.lastMonthlySummary = summary;
  state.lastFinancialSummary = financialSummary;
  state.financialHistory = [...(state.financialHistory ?? []), financialSummary].slice(-12);
  state.financialLedger = emptyFinancialLedger(state.calendar.month, state.cash, netWorthEnd);
  state.monthlyLedger = emptyMonthlyLedger(ledger.netWorthEnd);
  output.push({ type: 'month', summary });
  return summary;
}
