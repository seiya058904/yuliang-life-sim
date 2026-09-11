import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState, PlannedActivity, Weekday, WeeklyPlan } from '../content/contracts';
import { calculateLifestyle } from './economy';
import { employmentWorkWindow, modifierValue } from './effects';
import { employmentKind } from './careers';
import { activityCashCost } from './activities';
import { housingRentPerDay } from './locations';
import { collectPlanIssues, weekdayLabel } from './planning';

export interface WeeklyPlanForecast {
  income: number;
  expense: number;
  netCash: number;
  hours: { work: number; sideJob: number; study: number; leisure: number };
  attributes: Record<string, number>;
  relationships: Record<string, number>;
  notes: string[];
  /** Plan slots the engine would refuse to run, keyed by weekday. */
  warnings: string[];
  blockedWeekdays: Weekday[];
}

/** The forecast window covers the days the next run settles, including the monthly boundary. */
function includesMonthlyCommunication(state: GameState): boolean {
  for (let offset = 0; offset <= 6; offset += 1) {
    if ((state.time.day + offset - 1) % 28 === 0) return true;
  }
  return false;
}

/**
 * The forecast reads the planning domain, so it never counts income or effects
 * from a slot the simulation would actually skip, and it tells the player which
 * cells are the reason.
 */
export function forecastWeeklyPlan(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): WeeklyPlanForecast {
  const result: WeeklyPlanForecast = {
    income: 0, expense: fixedWeeklyExpense(state, content, balance), netCash: 0,
    hours: { work: 0, sideJob: 0, study: 0, leisure: 0 }, attributes: {}, relationships: {},
    notes: ['不包含随机事件、市场价格变化、未确定招聘结果'],
    warnings: [], blockedWeekdays: [],
  };
  const issues = collectPlanIssues(plan, state, { content, balance, employment: state.employment });
  const blocked = new Set<Weekday>(issues.map((issue) => issue.weekday));
  result.blockedWeekdays = [...blocked].sort((left, right) => left - right);
  result.warnings = issues.map((issue) => `周${weekdayLabel(issue.weekday)}：${issue.message}`);
  if (issues.length) result.notes.push(`有 ${issues.length} 处计划当前无法执行，未计入预测`);
  const currentJob = state.employment ? content.jobs.find((job) => job.id === state.employment?.jobId) : undefined;
  if (currentJob && state.employment) {
    const shifts = state.employment.schedule.workDays.length;
    const pay = (state.employment.basePay ?? currentJob.basePay) + (state.employment.salaryAdjustment ?? 0);
    const perShift = modifierValue(state, 'work_pay', pay, currentJob.tags);
    result.income += Math.round(perShift * shifts);
    result.hours.work += employmentWorkWindow(state, state.employment.schedule).durationMinutes / 60 * shifts;
  }
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    if (blocked.has(weekday)) continue;
    applyPlanned(plan.days[weekday].day, state, content, result);
    applyPlanned(plan.days[weekday].evening, state, content, result);
  }
  result.netCash = result.income - result.expense;
  return result;
}

function fixedWeeklyExpense(state: GameState, content: ContentRegistry, balance: BalanceConfig): number {
  const home = content.housing.find((entry) => entry.id === state.housing.housingId);
  const score = calculateLifestyle(state, content);
  const factor = Math.min(balance.lifestyleCostFactorCap, Math.max(0, score * balance.lifestyleCostFactor));
  const daily = (state.housing.mode === 'rent' && home ? housingRentPerDay(state, home) : 0)
    + Math.round(balance.dailyLivingCost * (1 + factor))
    + Math.round(balance.dailyTransportCost * (1 + factor / 2))
    + Math.round((home?.fixedMonthlyCost ?? 0) / 28);
  // The weekly forecast must match the settlement exactly, including the monthly
  // communication charge when the coming seven days cross the month boundary.
  return daily * 7 + (includesMonthlyCommunication(state) ? balance.monthlyCommunicationCost : 0);
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
  result.expense += definition ? activityCashCost(state, definition, option, content) : option.cashCost;
  for (const effect of option.effects ?? []) {
    if (effect.type === 'attribute') result.attributes[effect.attribute] = (result.attributes[effect.attribute] ?? 0) + effect.amount;
    if (effect.type === 'relation') result.relationships[effect.characterId] = (result.relationships[effect.characterId] ?? 0) + effect.amount;
  }
}
