import type { BalanceConfig } from '../balance/config';
import type { AnnualSummary, ContentRegistry, GameEffect, GameState, MonthlyLedger, MonthlySummary, WorldSnapshot } from '../content/contracts';
import { calculateNetWorth } from './economy';
import { emptyFinancialLedger, projectLegacyMonthlyLedger, summarizeFinancialLedger } from './financialLedger';
import { appendLifeRecord } from './lifeHistory';

export function emptyMonthlyLedger(netWorthStart: number): MonthlyLedger {
  return { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart, netWorthEnd: netWorthStart };
}

export function closeMonth(state: GameState, month: number, content: ContentRegistry, balance: BalanceConfig, output: GameEffect[]): MonthlySummary {
  for (const [subscriptionId, holding] of Object.entries(state.activeSubscriptions ?? {})) {
    const subscription = content.subscriptions?.find((entry) => entry.id === subscriptionId);
    if (!subscription) {
      delete state.activeSubscriptions![subscriptionId];
      continue;
    }
    if (state.cash < subscription.monthlyFee) {
      delete state.activeSubscriptions![subscriptionId];
      state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.service.subscription-paused.${subscription.id}.${month}`, day: state.time.day, category: 'service', title: `订阅暂停${subscription.name}`, detail: '本月现金不足，已停止自动续费', sourceId: subscription.id });
      output.push({ type: 'message', text: `${subscription.name}因现金不足暂停` });
      continue;
    }
    state.cash -= subscription.monthlyFee;
    recordSubscriptionFee(state, subscription.id, subscription.name, subscription.monthlyFee);
    state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.service.subscription-fee.${subscription.id}.${month}`, day: state.time.day, category: 'service', title: `${subscription.name}月度扣费`, sourceId: subscription.id, amount: -subscription.monthlyFee });
  }
  const financialLedger = state.financialLedger ?? emptyFinancialLedger(month, state.monthlyLedger.netWorthStart, state.monthlyLedger.netWorthStart);
  const netWorthEnd = calculateNetWorth(state, content, balance);
  const financialSummary = summarizeFinancialLedger(financialLedger, financialLedger.cashStart ?? state.monthlyLedger.netWorthStart, state.cash, financialLedger.netWorthStart ?? state.monthlyLedger.netWorthStart, netWorthEnd);
  const ledger = { ...projectLegacyMonthlyLedger(financialSummary), netWorthEnd };
  const summary = { month, ledger };
  state.lastMonthlySummary = summary;
  state.lastFinancialSummary = financialSummary;
  state.financialHistory = [...(state.financialHistory ?? []), financialSummary].slice(-12);
  if (month % 12 === 0) {
    const yearMonths = (state.financialHistory ?? []).filter((entry) => entry.month >= month - 11 && entry.month <= month);
    const annual: AnnualSummary = {
      year: Math.ceil(month / 12),
      cashStart: yearMonths[0]?.cashStart ?? state.cash,
      cashEnd: state.cash,
      netWorthStart: yearMonths[0]?.netWorthStart ?? netWorthEnd,
      netWorthEnd,
      totalIncome: yearMonths.reduce((sum, entry) => sum + entry.totalIncome, 0),
      totalConsumption: yearMonths.reduce((sum, entry) => sum + entry.totalConsumption, 0),
      months: yearMonths.length,
    };
    state.annualHistory = [...(state.annualHistory ?? []).filter((entry) => entry.year !== annual.year), annual].slice(-10);
    const snapshot: WorldSnapshot = {
      year: annual.year,
      day: state.time.day,
      netWorth: netWorthEnd,
      businessCount: Object.keys(state.businesses).length,
      relationshipCount: Object.values(state.relationships).filter((value) => value > 0).length,
      visitedLocationCount: Object.values(state.locationVisits ?? {}).filter((value) => value > 0).length,
      currentJobId: state.currentJobId,
    };
    state.worldHistory = [...(state.worldHistory ?? []).filter((entry) => entry.year !== snapshot.year), snapshot].slice(-10);
  }
  state.financialLedger = emptyFinancialLedger(state.calendar.month, state.cash, netWorthEnd);
  state.monthlyLedger = emptyMonthlyLedger(ledger.netWorthEnd);
  output.push({ type: 'month', summary });
  return summary;
}

function recordSubscriptionFee(state: GameState, subscriptionId: string, name: string, amount: number): void {
  const ledger = state.financialLedger;
  if (!ledger) return;
  const sequence = ledger.nextSequence++;
  ledger.entries.push({ id: `ledger.${ledger.month}.${sequence}`, day: state.time.day, direction: 'expense', group: 'consumption', category: 'service', amount, cashDelta: -amount, sourceType: 'subscription', sourceId: subscriptionId, label: `${name}月度订阅` });
}
