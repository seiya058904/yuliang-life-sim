import { mortgagePayment, subscriptionFee } from './settlementMath';
import { amount, known, unknown, addAmount } from './knownAmount';
import type { BalanceConfig } from '../balance/config';
import type { AnnualSummary, ContentRegistry, GameEffect, GameState, MonthlyLedger, MonthlySummary, WorldSnapshot } from '../content/contracts';
import { businessValuation, calculateNetWorth, effectiveBusinessLocationId, ownershipTierForEquity, wealthTierForNetWorth } from './economy';
import { characterCareerAt, companyStageAt, makeWorldBranchEvaluator } from './worldEvolution';
import { emptyFinancialLedger, projectLegacyMonthlyLedger, recordStateFinancialEntry, summarizeFinancialLedger } from './financialLedger';
import { appendLifeRecord } from './lifeHistory';
import { housingPrice, housingRentPerDay } from './locations';
import { applyContentEffects } from './effects';

export function emptyMonthlyLedger(netWorthStart: import('../content/contracts').KnownAmount | number): MonthlyLedger {
  return { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: amount(netWorthStart), netWorthEnd: amount(netWorthStart) };
}

/** Billing period length in game days (a month is 28 days). */
export const SUBSCRIPTION_CYCLE_DAYS = 28;

/**
 * Safety bound for a single billing: an anchor that is many periods behind (a
 * save that was not played for months) is advanced period by period, never in an
 * unbounded loop and never into an unpayable one-off charge.
 */
const MAX_SUBSCRIPTION_PERIODS_PER_BILLING = 12;

/**
 * Day the next subscription period falls due. A subscription buys a period of
 * `SUBSCRIPTION_CYCLE_DAYS` days from the day it was (re)activated, and 月结 is
 * the only place that bills, so the anchor is read **as recorded**: the first
 * close on or after it bills exactly one period and
 * `subscriptionRenewalDay` moves it on by one period per period elapsed, which
 * is what keeps the billed periods contiguous. Clamping the anchor up to the
 * current day here (the earlier behaviour) made the anchor unable to ever be
 * behind the clock, so renewal could not see that a period had run out.
 *
 * A legacy record without an anchor holds an unpaid open period, so the close
 * that reads it starts and bills the first period.
 */
export function subscriptionDueDay(holding: { billedUntilDay?: number }, day: number): number {
  return Number.isInteger(holding.billedUntilDay) ? Number(holding.billedUntilDay) : day;
}

/** Whether `day` still falls inside the period a subscription already paid for. */
export function subscriptionPeriodCovers(holding: { billedUntilDay?: number } | undefined, day: number): boolean {
  if (!holding || !Number.isInteger(holding.billedUntilDay)) return false;
  return day <= Number(holding.billedUntilDay);
}

/**
 * The end of the period a charge on `day` buys: the next `SUBSCRIPTION_CYCLE_DAYS`
 * days from the day the money is actually taken. Every charge therefore starts a
 * fresh, fully prepaid period, and no charge can cover a stretch that was already
 * paid for.
 */
export function subscriptionPeriodEnd(day: number): number {
  return day + SUBSCRIPTION_CYCLE_DAYS;
}

/**
 * Day the next subscription period falls due for billing at `day`.
 *
 * A period that has run out is billed by the next 月结 (the only place that
 * bills), and that charge buys the cycle starting on the billing day. If several
 * periods elapsed — a save that was not played for months, or a legacy record
 * many periods behind — they are settled one period at a time under a bound, so
 * a stale anchor can never produce a single unpayable lump sum.
 *
 * What happens to the stretch between the end of a paid period and the close
 * that bills the next one is stated rather than implied: it is a **lapse**. No
 * service benefit is granted for it (benefits are only applied when a period is
 * charged), it is never billed retroactively, and it accrues no debt — the game
 * has no arrears or credit concept, and this round did not add one.
 */
export function subscriptionRenewalDay(holding: { billedUntilDay?: number }, day: number): number {
  let due = subscriptionDueDay(holding, day);
  let periods = 0;
  while (due <= day && periods < MAX_SUBSCRIPTION_PERIODS_PER_BILLING) {
    periods += 1;
    due = day + periods * SUBSCRIPTION_CYCLE_DAYS;
  }
  return due;
}

export function closeMonth(state: GameState, month: number, content: ContentRegistry, balance: BalanceConfig, output: GameEffect[]): MonthlySummary {
  for (const [subscriptionId, holding] of Object.entries(state.activeSubscriptions ?? {})) {
    const subscription = content.subscriptions?.find((entry) => entry.id === subscriptionId);
    if (!subscription) {
      delete state.activeSubscriptions![subscriptionId];
      continue;
    }
    // Period billing: a subscription is charged (and grants its effects) once
    // per 28-day period, billed by the first 月结 on or after the period's due
    // day. Reactivating inside a paid period resumes that period instead of
    // buying a second one, so toggling can never farm attributes, and because a
    // new period always starts at the due day of the old one there is no stretch
    // of active-but-unpaid subscription either.
    const due = subscriptionDueDay(holding, state.time.day);
    if (state.time.day < due) continue;
    const fee = subscriptionFee(content, subscription.id);
    if (state.cash < fee) {
      delete state.activeSubscriptions![subscriptionId];
      state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.service.subscription-paused.${subscription.id}.${month}`, day: state.time.day, category: 'service', title: `订阅暂停${subscription.name}`, detail: '本月现金不足，已停止自动续费', sourceId: subscription.id });
      output.push({ type: 'message', text: `${subscription.name}因现金不足暂停` });
      continue;
    }
    state.cash -= fee;
    holding.billedUntilDay = subscriptionRenewalDay(holding, state.time.day);
    recordSubscriptionFee(state, subscription.id, subscription.name, fee);
    if (subscription.effects?.length) applyContentEffects(state, subscription.effects, content, balance, output);
    state.lifeHistory = appendLifeRecord(state.lifeHistory, { id: `life.service.subscription-fee.${subscription.id}.${month}`, day: state.time.day, category: 'service', title: `${subscription.name}月度扣费`, sourceId: subscription.id, amount: -fee });
  }
  const mortgage = state.mortgage;
  if (mortgage) {
    state.financialLedger ??= emptyFinancialLedger(month, state.cash, state.monthlyLedger.netWorthStart);
    if (mortgagePayment(state) > 0) {
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
  const financialSummary = summarizeFinancialLedger(financialLedger, financialLedger.cashStart, state.cash, financialLedger.netWorthStart, netWorthEnd);
  const ledger = { ...projectLegacyMonthlyLedger(financialSummary), netWorthEnd: known(netWorthEnd) };
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
      cashStart: yearMonths.length === 12 ? amount(yearMonths[0].cashStart) : unknown('年度月份不完整'),
      cashEnd: known(state.cash),
      netWorthStart: yearMonths.length === 12 ? amount(yearMonths[0].netWorthStart) : unknown('年度月份不完整'),
      netWorthEnd: known(netWorthEnd),
      totalIncome: yearMonths.length === 12 ? yearMonths.reduce((sum, entry) => addAmount(sum, entry.totalIncome), known(0)) : unknown('年度月份不完整'),
      totalConsumption: yearMonths.length === 12 ? yearMonths.reduce((sum, entry) => addAmount(sum, entry.totalConsumption), known(0)) : unknown('年度月份不完整'),
      months: yearMonths.length,
    };
    state.annualHistory = [...(state.annualHistory ?? []).filter((entry) => entry.year !== annual.year), annual].slice(-10);
    const development = { ...(state.locationDevelopment ?? {}) };
    // Businesses count toward the city they actually operate in: a paid
    // relocation must move the growth, not leave it on the former address.
    const businessesByLocation = new Map<string, number>();
    for (const holding of Object.values(state.businesses)) {
      const definition = content.businesses.find((business) => business.id === holding.businessId);
      if (!definition) continue;
      const locationId = effectiveBusinessLocationId(holding, definition);
      if (!locationId) continue;
      businessesByLocation.set(locationId, (businessesByLocation.get(locationId) ?? 0) + 1);
    }
    for (const location of content.locations ?? []) {
      const visits = state.locationVisits?.[location.id] ?? 0;
      const businesses = businessesByLocation.get(location.id) ?? 0;
      const growth = (businesses > 0 ? 1 : 0) + (visits >= 3 ? 1 : 0);
      if (!growth) continue;
      development[location.id] = Math.min(5, Math.max(0, development[location.id] ?? 0) + growth);
    }
    state.locationDevelopment = development;
    const worldBranches = makeWorldBranchEvaluator(state, content, balance);
    const snapshot: WorldSnapshot = {
      year: annual.year,
      day: state.time.day,
      netWorth: netWorthEnd,
      businessCount: Object.keys(state.businesses).length,
      relationshipCount: Object.values(state.relationships).filter((value) => value > 0).length,
      relationshipValues: Object.fromEntries((content.characters ?? []).map((character) => [character.id, Math.min(100, Math.max(0, Math.round(state.relationships[character.id] ?? 0)))])),
      characterCareerStates: Object.fromEntries((content.characters ?? []).flatMap((character) => {
        const entry = characterCareerAt(character, annual.year, worldBranches);
        if (!entry) return [];
        const company = entry.companyId ? content.companies?.find((candidate) => candidate.id === entry.companyId)?.name : undefined;
        return [[character.id, company ? `${company} · ${entry.title}` : entry.title]];
      })),
      companyStates: Object.fromEntries((content.companies ?? []).flatMap((company) => {
        const stage = companyStageAt(company, annual.year, worldBranches);
        const dynamicState = (company.dynamicStates ?? []).find((candidate) => state.flags[candidate.flag]);
        return stage || dynamicState ? [[company.id, dynamicState?.title ?? stage!.title]] : [];
      })),
      visitedLocationCount: Object.values(state.locationVisits ?? {}).filter((value) => value > 0).length,
      locationDevelopment: { ...development },
      listedBusinessCount: Object.values(state.businesses).filter((holding) => holding.listed).length,
      controlledBusinessCount: Object.values(state.businesses).filter((holding) => ['controlling', 'wholly_owned'].includes(ownershipTierForEquity(holding.equityPercent ?? 100).tier)).length,
      publicFloatPercent: Object.values(state.businesses).reduce((total, holding) => total + (holding.publicFloatPercent ?? (100 - (holding.equityPercent ?? 100))), 0),
      publicBusinessEquities: Object.fromEntries(Object.entries(state.publicBusinessEquities ?? {}).flatMap(([businessId, publicHolding]) => {
        const business = state.businesses[businessId];
        if (!business?.listed) return [];
        return [[businessId, { businessId, percent: publicHolding.percent, investedAmount: publicHolding.investedAmount, currentValue: Math.round(businessValuation(business, balance) * publicHolding.percent / 100) }]];
      })),
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
