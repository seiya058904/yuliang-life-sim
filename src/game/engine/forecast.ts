import { dailyCosts, shiftPay, studyRewards, mortgagePayment, jobAvailable, subscriptionBudget } from './settlementMath';
import { getDailyActivities } from './schedule';
import { absoluteMinute } from './time';
import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState, PlannedActivity, Weekday, WeeklyPlan } from '../content/contracts';
import { employmentKind } from './careers';
import { activityCashCost } from './activities';
import { planEditIssues, weekdayLabel } from './planning';

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

/**
 * The forecast reads the planning domain, so it never counts income or effects
 * from a slot the simulation would actually skip, and it tells the player which
 * cells are the reason.
 */
export function forecastWeeklyPlan(state: GameState, plan: WeeklyPlan, content: ContentRegistry, balance: BalanceConfig): WeeklyPlanForecast {
  const result: WeeklyPlanForecast = {
    income: 0, expense: fixedWeeklyExpense(state, content, balance), netCash: 0,
    hours: { work: 0, sideJob: 0, study: 0, leisure: 0 }, attributes: {}, relationships: {},
    notes: ['不包含随机事件、市场价格变化、未确定招聘结果', '余额不足时订阅或房贷扣款可能变化'],
    warnings: [], blockedWeekdays: [],
  };
  const issues = planEditIssues(state, plan, content, balance);
  const blocked = new Set<Weekday>(issues.map((issue) => issue.weekday));
  result.blockedWeekdays = [...blocked].sort((left, right) => left - right);
  result.warnings = issues.map((issue) => `周${weekdayLabel(issue.weekday)}：${issue.message}`);
  if (issues.length) result.notes.push(`有 ${issues.length} 处计划当前无法执行，未计入预测`);
  const endDay = state.time.day + 7 - state.calendar.weekday;
  const seen = new Set<string>();
  for (let day = state.time.day; day <= endDay; day++) {
    for (const activity of getDailyActivities(day, plan, state.employment, content, state)) {
      const end = absoluteMinute(activity.end);
      if (end <= absoluteMinute(state.time) || end > endDay * 1440) continue;
      const key = `${activity.kind}:${absoluteMinute(activity.start)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const weekday = ((activity.start.day - 1) % 7 + 1) as Weekday;
      const minutes = end - absoluteMinute(activity.start);
      if (activity.kind === 'work') {
        const job = content.jobs.find(job => job.id === activity.jobId);
        if (job && jobAvailable(state, job, content, balance)) { result.income += shiftPay(state, job, true); result.hours.work += minutes / 60; }
      } else if (!blocked.has(weekday)) {
        if (activity.kind === 'study') applyPlanned({ kind: 'study', durationMinutes: minutes as 120 }, state, content, balance, result);
        if (activity.kind === 'side_job') applyPlanned({ kind: 'side_job', jobId: activity.jobId!, durationMinutes: minutes as 120 }, state, content, balance, result);
        if (activity.kind === 'course') applyPlanned({ kind: 'course', courseId: activity.courseId! }, state, content, balance, result);
        if (activity.kind === 'activity') applyPlanned({ kind: 'activity', activityId: activity.activityId!, optionId: activity.optionId! }, state, content, balance, result);
      }
    }
  }
  result.netCash = result.income - result.expense;
  return result;
}

function fixedWeeklyExpense(state: GameState, content: ContentRegistry, balance: BalanceConfig): number {
  const endDay = state.time.day + 7 - state.calendar.weekday;
  let total = 0;
  for (let day = Math.max(state.time.day, state.lastSettledDay + 1); day <= endDay; day++) {
    total += dailyCosts(state, content, balance, day).total;
    if (day % 28 === 0) total += mortgagePayment(state) + subscriptionBudget(state, content);
  }
  return total;
}

function applyPlanned(activity: PlannedActivity, state: GameState, content: ContentRegistry, balance: BalanceConfig, result: WeeklyPlanForecast): void {
  if (activity.kind === 'free') return;
  if (activity.kind === 'study') {
    result.hours.study += activity.durationMinutes / 60;
    const rewards = studyRewards(state, activity.durationMinutes);
    result.attributes.knowledge = (result.attributes.knowledge ?? 0) + rewards.knowledge;
    result.attributes.professional = (result.attributes.professional ?? 0) + rewards.professional;
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
    if (!job || !jobAvailable(state, job, content, balance) || employmentKind(job) === 'gig' || !state.acquiredSideJobs?.[job.id]) return;
    result.hours.sideJob += activity.durationMinutes / 60;
    result.income += shiftPay(state, job, false);
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
