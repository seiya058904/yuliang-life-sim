import type { BalanceConfig } from '../balance/config';
import type { AnnualSummary, ContentRegistry, GameEffect, GameState, MonthlyLedger, MonthlySummary, WorldSnapshot } from '../content/contracts';
import { calculateNetWorth, wealthTierForNetWorth } from './economy';
import { emptyFinancialLedger, projectLegacyMonthlyLedger, recordStateFinancialEntry, summarizeFinancialLedger } from './financialLedger';
import { appendLifeRecord } from './lifeHistory';
import { housingPrice, housingRentPerDay } from './locations';

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
  const mortgage = state.mortgage;
  if (mortgage) {
    state.financialLedger ??= emptyFinancialLedger(month, state.cash, state.monthlyLedger.netWorthStart);
    if (state.cash >= mortgage.monthlyPayment) {
      const interest = Math.round(mortgage.remainingPrincipal * 0.004);
      const principalPaid = Math.min(mortgage.remainingPrincipal, Math.max(0, mortgage.monthlyPayment - interest));
      state.cash -= mortgage.monthlyPayment;
      mortgage.remainingPrincipal -= principalPaid;
      mortgage.paidMonths += 1;
      recordMortgagePayment(state, mortgage.monthlyPayment, mortgage.housingId);
      state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.housing.mortgage.${mortgage.housingId}.${mortgage.paidMonths}`, day: state.time.day, category: 'housing', title: '住房分期还款', detail: `偿还本金 ¥${principalPaid.toLocaleString('zh-CN')} · 利息 ¥${interest.toLocaleString('zh-CN')}`, sourceId: mortgage.housingId, amount: -mortgage.monthlyPayment });
      if (mortgage.remainingPrincipal <= 0 || mortgage.paidMonths >= mortgage.totalMonths) delete state.mortgage;
    } else {
      output.push({ type: 'message', text: '现金不足，本月住房分期未扣款' });
    }
  }
  for (const holding of Object.values(state.housingHoldings ?? {})) {
    const home = content.housing.find((entry) => entry.id === holding.housingId);
    if (!home) continue;
    holding.currentValuation = housingPrice(state, home) ?? holding.currentValuation;
    if (holding.occupancy !== 'rented') continue;
    const rent = housingRentPerDay(state, home) * 28;
    const maintenance = Math.round(rent * 0.12);
    state.cash += rent - maintenance;
    recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'property_income', amount: rent, label: `${home.name}租金`, sourceType: 'housing', sourceId: home.id });
    recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'maintenance', amount: maintenance, label: `${home.name}维护`, sourceType: 'housing', sourceId: home.id });
    state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.housing.rent.${home.id}.${month}`, day: state.time.day, category: 'housing', title: `收到${home.name}租金`, detail: '投资房月度自动结算', sourceId: home.id, amount: rent });
    state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.housing.maintenance.${home.id}.${month}`, day: state.time.day, category: 'housing', title: `${home.name}维护`, detail: '按租金的一定比例自动扣除', sourceId: home.id, amount: -maintenance });
  }
  const financialLedger = state.financialLedger ?? emptyFinancialLedger(month, state.monthlyLedger.netWorthStart, state.monthlyLedger.netWorthStart);
  const netWorthEnd = calculateNetWorth(state, content, balance);
  const financialSummary = summarizeFinancialLedger(financialLedger, financialLedger.cashStart ?? state.monthlyLedger.netWorthStart, state.cash, financialLedger.netWorthStart ?? state.monthlyLedger.netWorthStart, netWorthEnd);
  const ledger = { ...projectLegacyMonthlyLedger(financialSummary), netWorthEnd };
  const summary = { month, ledger };
  state.lastMonthlySummary = summary;
  state.lastFinancialSummary = financialSummary;
  state.financialHistory = [...(state.financialHistory ?? []), financialSummary].slice(-12);
  const wealthTier = wealthTierForNetWorth(netWorthEnd);
  if (wealthTier.id !== 'start' && !(state.wealthMilestones ?? []).some((entry) => entry.id === wealthTier.id)) {
    const milestone = { id: wealthTier.id, day: state.time.day, netWorth: netWorthEnd };
    state.wealthMilestones = [...(state.wealthMilestones ?? []), milestone];
    state.lifeHistory = appendLifeRecord(state.lifeHistory, {
      id: `life.wealth-milestone.${wealthTier.id}`,
      day: state.time.day,
      category: 'event',
      title: `财富阶段：${wealthTier.name}`,
      detail: wealthTier.description,
      sourceId: wealthTier.id,
      amount: netWorthEnd,
    });
    output.push({ type: 'message', text: `财富阶段达到：${wealthTier.name}` });
  }
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
    const development = { ...(state.locationDevelopment ?? {}) };
    for (const location of content.locations ?? []) {
      const visits = state.locationVisits?.[location.id] ?? 0;
      const businesses = Object.values(state.businesses).filter((holding) => content.businesses.find((business) => business.id === holding.businessId)?.locationId === location.id).length;
      const growth = (businesses > 0 ? 1 : 0) + (visits >= 3 ? 1 : 0);
      development[location.id] = Math.min(5, Math.max(0, development[location.id] ?? 0) + growth);
    }
    state.locationDevelopment = development;
    const snapshot: WorldSnapshot = {
      year: annual.year,
      day: state.time.day,
      netWorth: netWorthEnd,
      businessCount: Object.keys(state.businesses).length,
      relationshipCount: Object.values(state.relationships).filter((value) => value > 0).length,
      relationshipValues: Object.fromEntries((content.characters ?? []).map((character) => [character.id, Math.min(100, Math.max(0, Math.round(state.relationships[character.id] ?? 0)))])),
      visitedLocationCount: Object.values(state.locationVisits ?? {}).filter((value) => value > 0).length,
      locationDevelopment: { ...development },
      listedBusinessCount: Object.values(state.businesses).filter((holding) => holding.listed).length,
      publicFloatPercent: Object.values(state.businesses).reduce((total, holding) => total + (holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100))), 0),
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

function recordMortgagePayment(state: GameState, amount: number, housingId: string): void {
  recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'housing', amount, sourceType: 'housing', sourceId: housingId, label: '住房分期还款' });
}
