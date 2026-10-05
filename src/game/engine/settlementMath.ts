import { employmentKind } from './careers';
import { careerRequirementsSatisfied } from './careerProgression';
import { evaluateCondition } from './conditions';
import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState, JobDefinition } from '../content/contracts';
import { calculateLifestyle } from './economy';
import { modifierValue, studyGain } from './effects';
import { commuteCostMultiplier, housingRentPerDay } from './locations';

export function shiftPay(state: GameState, job: JobDefinition, formal: boolean): number {
  const base = formal && state.employment?.jobId === job.id ? (state.employment.basePay ?? job.basePay) + (state.employment.salaryAdjustment ?? 0) : job.basePay;
  return Math.round(modifierValue(state, 'work_pay', base, job.tags));
}

export function studySettlement(state: GameState, minutes: number, content?: ContentRegistry): { knowledge: number; professional: number; remainder: number } {
  const gain = studyGain(state, Math.max(1, Math.floor(minutes / 120)), content) + (state.studyGainRemainder ?? 0);
  const knowledge = Math.floor(gain + 1e-9);
  const remainder = Math.round((gain - knowledge) * 1e9) / 1e9;
  return { knowledge, professional: Math.max(0, Math.floor(knowledge / 2)), remainder: Math.max(0, remainder) };
}

export function studyRewards(state: GameState, minutes: number, content?: ContentRegistry): { knowledge: number; professional: number } {
  const { knowledge, professional } = studySettlement(state, minutes, content);
  return { knowledge, professional };
}

export function dailyCosts(state: GameState, content: ContentRegistry, balance: BalanceConfig, day: number) {
  const home = content.housing.find(h => h.id === state.housing.housingId);
  const factor = Math.min(balance.lifestyleCostFactorCap, Math.max(0, calculateLifestyle(state, content) * balance.lifestyleCostFactor));
  const rent = state.housing.mode === 'rent' && home ? housingRentPerDay(state, home) : 0;
  const living = Math.round(balance.dailyLivingCost * (1 + factor));
  const transport = Math.round(balance.dailyTransportCost * (1 + factor / 2) * commuteCostMultiplier(state, content));
  const homeFixed = Math.round((home?.fixedMonthlyCost ?? 0) / 28);
  const communication = day % 28 === 1 ? balance.monthlyCommunicationCost : 0;
  const vehicle = Object.keys(state.assets).reduce((sum, id) => {
    const asset = content.assets.find(a => a.id === id);
    return sum + (asset?.kind === 'vehicle' ? Math.round((asset.monthlyCost ?? 0) / 28) : 0);
  }, 0);
  return { rent, living, transport, homeFixed, communication, vehicle, total: rent + living + transport + homeFixed + communication + vehicle };
}

/** Quote one installment before checking cash, including a smaller final payment. */
export function mortgageInstallment(state: GameState): { payment: number; principalPaid: number; interest: number } {
  const mortgage = state.mortgage;
  if (!mortgage) return { payment: 0, principalPaid: 0, interest: 0 };
  const interest = Math.round(mortgage.remainingPrincipal * 0.004);
  const payment = Math.min(mortgage.monthlyPayment, mortgage.remainingPrincipal + interest);
  const principalPaid = Math.min(mortgage.remainingPrincipal, Math.max(0, payment - interest));
  return { payment, principalPaid, interest };
}

export function mortgagePayment(state: GameState): number {
  const { payment } = mortgageInstallment(state);
  return state.cash >= payment ? payment : 0;
}

export function subscriptionFee(content: ContentRegistry, id: string): number {
  return content.subscriptions?.find(subscription => subscription.id === id)?.monthlyFee ?? 0;
}

export function subscriptionBudget(state: GameState, content: ContentRegistry): number {
  return Object.keys(state.activeSubscriptions ?? {}).reduce((total, id) => total + subscriptionFee(content, id), 0);
}

export function fixedMonthBudget(state: GameState, content: ContentRegistry, balance: BalanceConfig) {
  const day = dailyCosts(state, content, balance, 1);
  const mortgage = mortgageInstallment(state).payment;
  const subscriptions = subscriptionBudget(state, content);
  return { subscriptions, rent: day.rent * 28, livingTransport: (day.living + day.transport) * 28, maintenance: (day.homeFixed + day.vehicle) * 28, communication: day.communication, mortgage, total: (day.total - day.communication) * 28 + day.communication + mortgage + subscriptions };
}

export function jobAvailable(state: GameState, job: JobDefinition, content: ContentRegistry, balance: BalanceConfig): boolean {
  if (employmentKind(job) === 'repeatable_side_job' && !state.acquiredSideJobs?.[job.id]) return false;
  if (job.abilityRequired !== undefined && state.ability < job.abilityRequired) return false;
  if (job.reputationRequired !== undefined && state.reputation < job.reputationRequired) return false;
  if (job.requirements && !evaluateCondition(job.requirements, state, content, balance)) return false;
  if (!careerRequirementsSatisfied(job, state)) return false;
  if (job.requiredItems?.some((itemId) => (state.inventory[itemId] ?? 0) < 1)) return false;
  if (job.requiredCapabilities?.some((capability) => !state.unlockedCapabilities.includes(capability))) return false;
  return true;
}
