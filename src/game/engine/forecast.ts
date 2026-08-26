import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState, PlannedActivity, WeeklyPlan } from '../content/contracts';
import { calculateLifestyle } from './economy';
import { employmentKind } from './careers';

export interface WeeklyPlanForecast {
  income: number;
  expense: number;
  netCash: number;
  hours: { work: number; sideJob: number; study: number; leisure: number };
  attributes: Record<string, number>;
  relationships: Record<string, number>;
  notes: string[];
}

export function forecastWeeklyPlan(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): WeeklyPlanForecast {
  const result: WeeklyPlanForecast = {
    income: 0, expense: fixedWeeklyExpense(state, content, balance), netCash: 0,
    hours: { work: 0, sideJob: 0, study: 0, leisure: 0 }, attributes: {}, relationships: {},
    notes: ['不包含随机事件、市场价格变化、未确定招聘结果'],
  };
  const currentJob = state.employment ? content.jobs.find((job) => job.id === state.employment?.jobId) : undefined;
  if (currentJob && state.employment) {
    const shifts = state.employment.schedule.workDays.length;
    const pay = (state.employment.basePay ?? currentJob.basePay) + (state.employment.salaryAdjustment ?? 0);
    result.income += pay * shifts;
    result.hours.work += (state.employment.schedule.endMinute - state.employment.schedule.startMinute) / 60 * shifts;
  }
  for (const day of Object.values(plan.days)) {
    applyPlanned(day.day, state, content, result);
    applyPlanned(day.evening, state, content, result);
  }
  result.netCash = result.income - result.expense;
  return result;
}

function fixedWeeklyExpense(state: GameState, content: ContentRegistry, balance: BalanceConfig): number {
  const home = content.housing.find((entry) => entry.id === state.housing.housingId);
  const score = calculateLifestyle(state, content);
  const factor = Math.min(balance.lifestyleCostFactorCap, Math.max(0, score * balance.lifestyleCostFactor));
  const daily = (state.housing.mode === 'rent' ? home?.rentPerDay ?? 0 : 0)
    + Math.round(balance.dailyLivingCost * (1 + factor))
    + Math.round(balance.dailyTransportCost * (1 + factor / 2))
    + Math.round((home?.fixedMonthlyCost ?? 0) / 28);
  return daily * 7;
}

function applyPlanned(activity: PlannedActivity, state: GameState, content: ContentRegistry, result: WeeklyPlanForecast): void {
  if (activity.kind === 'free') return;
  if (activity.kind === 'study') {
    result.hours.study += activity.durationMinutes / 60;
    result.attributes.knowledge = (result.attributes.knowledge ?? 0) + Math.max(1, Math.floor(activity.durationMinutes / 120));
    return;
  }
  if (activity.kind === 'course') {
    const course = content.courses?.find((entry) => entry.id === activity.courseId);
    if (!course) return;
    result.hours.study += course.durationMinutes / 60;
    result.expense += course.cashCost;
    const knowledgeGain = (course.effects ?? []).reduce((sum, effect) => effect.type === 'attribute' && effect.attribute === 'knowledge' ? sum + effect.amount : sum, 0);
    result.attributes.knowledge = (result.attributes.knowledge ?? 0) + knowledgeGain;
    return;
  }
  if (activity.kind === 'side_job') {
    const job = content.jobs.find((entry) => entry.id === activity.jobId);
    if (!job || employmentKind(job) === 'gig' || !state.acquiredSideJobs?.[job.id]) return;
    result.hours.sideJob += activity.durationMinutes / 60;
    result.income += job.basePay;
    return;
  }
  const definition = content.activities?.find((entry) => entry.id === activity.activityId);
  const option = definition?.options.find((entry) => entry.id === activity.optionId);
  if (!option) return;
  result.hours.leisure += option.durationMinutes / 60;
  result.expense += option.cashCost;
  for (const effect of option.effects ?? []) {
    if (effect.type === 'attribute') result.attributes[effect.attribute] = (result.attributes[effect.attribute] ?? 0) + effect.amount;
    if (effect.type === 'relation') result.relationships[effect.characterId] = (result.relationships[effect.characterId] ?? 0) + effect.amount;
  }
}
