import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameEffect, GameResult, GameState, JobDefinition, MonthlySummary } from '../content/contracts';
import { calculateDailyPassiveIncome, calculateLifestyle, calculateNetWorth } from './economy';
import { calendarForDay } from './calendar';
import { closeMonth } from './monthlySettlement';
import { applyCareerExperience, careerRequirementsSatisfied } from './careerProgression';
import { commuteCostMultiplier } from './locations';
import { applyContentEffects, chooseAmbientEvent, chooseWeightedEvent, cloneGameState, modifierValue } from './effects';
import { activityAtTime, defaultJobSchedule } from './schedule';
import { advanceMinutes, absoluteMinute } from './time';
import { evaluateCondition } from './conditions';
import { applyAttributeDelta } from './attributes';
import { recordStateFinancialEntry, syncLegacyMonthlyLedger } from './financialLedger';
import { updateInvestmentValuations } from './investments';
import { getActivityDefinition, getActivityOption } from './activities';
import { advanceCareerLifecycle, generateVacancies } from './careers';
import { appendLifeRecord } from './lifeHistory';

const fail = (state: GameState, error: string): GameResult => ({ state, effects: [], error });

export function advanceSimulation(input: GameState, minutes: number, content: ContentRegistry, balance: BalanceConfig): GameResult {
  if (input.pendingEventId) return fail(input, '请先处理当前事件');
  if (input.simulationMode !== 'running') return fail(input, '请先开始本周运行');
  if (!Number.isInteger(minutes) || minutes <= 0) return fail(input, '模拟时间必须是正整数分钟');

  const state = cloneGameState(input);
  if (!state.financialLedger) state.financialLedger = { month: state.calendar.month, nextSequence: 1, entries: [], cashStart: state.cash, netWorthStart: calculateNetWorth(state, content, balance) };
  const effects: GameEffect[] = [];
  const start = state.time;
  let remaining = minutes;

  while (remaining > 0 && state.simulationMode === 'running') {
    const beforeTime = state.time;
    const beforeActivity = activityAtTime(beforeTime, state.weeklyPlan, state.employment, content);
    const next = advanceMinutes(beforeTime, 1).time;
    state.time = next;
    state.calendar = calendarForDay(next.day);
    state.currentActivity = activityAtTime(next, state.weeklyPlan, state.employment, content);

    if (absoluteMinute(next) >= absoluteMinute(beforeActivity.end)) settleActivity(state, beforeActivity, content, balance, effects);

    if (next.day !== beforeTime.day) {
      if (state.eventDay !== next.day) {
        state.eventDay = next.day;
        state.eventsToday = 0;
      }
      for (let day = state.lastSettledDay + 1; day < next.day; day += 1) settleDay(state, day, content, balance, effects);
      state.lastSettledDay = next.day - 1;
      if (next.day % 28 === 1) {
        const resumeMode = state.autoRepeatPlan ? 'running' : 'planning';
        const summary = closeMonth(state, calendarForDay(next.day - 1).month, content, balance, effects);
        state.vacancies = generateVacancies(state, content, balance);
        state.pendingMonthlySummary = { month: summary.month, summary, financial: state.lastFinancialSummary, resumeMode, highlights: [...(state.monthlyHighlights ?? [])] };
        state.monthlyHighlights = [];
        state.simulationMode = 'monthly_summary';
        remaining = 0;
      }
      if (next.day % 28 === 1) state.majorEventsThisMonth = 0;
      if (balance.eventDailyLimit > 0 && balance.eventAmbientChance > 0 && state.rng.cursor % Math.max(1, Math.round(1 / balance.eventAmbientChance)) === 0) {
        const ambientId = chooseAmbientEvent(state, content, balance);
        const ambient = ambientId && content.events.find((event) => event.id === ambientId);
        if (ambient) {
          state.eventCooldowns[ambient.id] = state.time.day;
          state.ambientLog = [...(state.ambientLog ?? []), { day: state.time.day, text: ambient.body }].slice(-20);
          effects.push({ type: 'message', text: ambient.body });
        }
      }
      if (next.day % 7 === 1) {
        if (state.employment?.pendingJobId) {
          const nextJob = content.jobs.find((entry) => entry.id === state.employment?.pendingJobId);
          if (nextJob) {
            const previousEmployment = state.employment;
            state.employmentHistory = [...(state.employmentHistory ?? []), {
              jobId: previousEmployment.jobId,
              companyId: previousEmployment.companyId,
              endedDay: state.time.day - 1,
              finalPay: (previousEmployment.basePay ?? 0) + (previousEmployment.salaryAdjustment ?? 0),
              reason: '换岗',
            }];
            state.currentJobId = nextJob.id;
            state.employment = {
              jobId: nextJob.id,
              companyId: previousEmployment.pendingCompanyId,
              basePay: previousEmployment.pendingBasePay ?? nextJob.basePay,
              salaryAdjustment: 0,
              negotiationStage: 0 as const,
              schedule: defaultJobSchedule(nextJob),
              effectiveWeek: state.calendar.week,
            };
            effects.push({ type: 'message', text: `${nextJob.name}已于本周入职` });
          }
        }
        state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
        if (state.autoRepeatPlan || state.weeklyPlan.autoRepeat) {
          state.weeklyPlan = { ...state.weeklyPlan, days: structuredClone(state.weeklyPlan.days) };
        } else {
          state.simulationMode = 'planning';
          effects.push({ type: 'message', text: `第 ${state.calendar.week - 1} 周结束，可以安排下一周了` });
        }
        state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, content);
      }
    }

    state.eventMeter += balance.eventBaseMeterPerHour / 60;
    if (state.simulationMode === 'running' && !state.pendingEventId && state.eventsToday < balance.eventDailyLimit && state.eventMeter >= balance.eventMeterThreshold) {
      const eventId = chooseWeightedEvent(state, content, balance);
      state.eventMeter -= balance.eventMeterThreshold;
      if (eventId) {
        state.pendingEventId = eventId;
        state.eventsToday += 1;
        state.lastMajorEventDay = state.time.day;
        state.majorEventsThisMonth = (state.majorEventsThisMonth ?? 0) + 1;
        state.simulationMode = 'event';
        effects.push({ type: 'event', eventId });
      }
    }
    remaining -= 1;
  }

  effects.unshift({ type: 'time', from: start, to: state.time, hours: (absoluteMinute(state.time) - absoluteMinute(start)) / 60 });
  effects.push({ type: 'activity', activity: state.currentActivity! });
  return { state, effects };
}

function settleActivity(state: GameState, activity: ReturnType<typeof activityAtTime>, content: ContentRegistry, balance: BalanceConfig, output: GameEffect[]): void {
  if (activity.kind === 'activity') {
    const definition = activity.activityId ? getActivityDefinition(content, activity.activityId) : undefined;
    const option = definition && activity.optionId ? getActivityOption(definition, activity.optionId) : undefined;
    if (!definition || !option || state.cash < option.cashCost) {
      output.push({ type: 'message', text: option ? `现金不足，未能完成${definition?.name ?? '活动'}` : '活动选项已失效' });
      return;
    }
    state.cash -= option.cashCost;
    recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: definition.financialCategory ?? 'entertainment', amount: option.cashCost, label: `${definition.name} · ${option.label}`, sourceType: 'activity', sourceId: definition.id });
    applyContentEffects(state, option.effects ?? [], content, balance, output);
    state.lifeHistory = appendLifeRecord(state.lifeHistory ?? [], { id: `life.activity.${definition.id}.${option.id}.${state.time.day}`, day: state.time.day, category: 'activity', title: `${definition.name} · ${option.label}`, detail: '活动已完成', sourceId: definition.id, amount: -option.cashCost });
    return;
  }
  if (activity.kind === 'study') {
    const amount = Math.max(1, Math.floor((absoluteMinute(activity.end) - absoluteMinute(activity.start)) / 120));
    applyAttributeDelta(state, 'knowledge', amount);
    applyAttributeDelta(state, 'professional', Math.max(0, Math.floor(amount / 2)));
    output.push({ type: 'stat', stat: 'ability', amount });
    return;
  }
  if (activity.kind !== 'work' && activity.kind !== 'side_job') return;
  const job = content.jobs.find((entry) => entry.id === activity.jobId);
  if (!job || !jobAvailable(state, job, content, balance)) return;
  const contractedPay = activity.kind === 'work' && state.employment?.jobId === job.id
    ? (state.employment.basePay ?? job.basePay) + (state.employment.salaryAdjustment ?? 0)
    : job.basePay;
  const pay = Math.round(modifierValue(state, 'work_pay', contractedPay, job.tags));
  state.cash += pay;
  state.jobExperience[job.id] = (state.jobExperience[job.id] ?? 0) + job.careerXp;
  applyCareerExperience(state, job.experienceTags ?? [], job.careerXp);
  recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: activity.kind === 'side_job' ? 'side_job' : 'wage', amount: pay, label: `${job.name}工资`, sourceType: 'job', sourceId: job.id });
  output.push({ type: 'cash', amount: pay, reason: `${job.name}工资结算` });
  applyContentEffects(state, job.rewards ?? [], content, balance, output);
}

function settleDay(state: GameState, day: number, content: ContentRegistry, balance: BalanceConfig, output: GameEffect[]): void {
  advanceCareerLifecycle(state, day, content, balance);
  const passive = calculateDailyPassiveIncome(state, content);
  const investmentDividend = updateInvestmentValuations(state, content, day);
  const home = content.housing.find((entry) => entry.id === state.housing.housingId);
  const rent = state.housing.mode === 'rent' ? home?.rentPerDay ?? 0 : 0;
  const lifestyleScore = calculateLifestyle(state, content);
  const lifestyleFactor = Math.min(balance.lifestyleCostFactorCap, Math.max(0, lifestyleScore * balance.lifestyleCostFactor));
  const living = Math.round(balance.dailyLivingCost * (1 + lifestyleFactor));
  const transport = Math.round(balance.dailyTransportCost * (1 + lifestyleFactor / 2) * commuteCostMultiplier(state, content));
  const homeFixed = Math.round((home?.fixedMonthlyCost ?? 0) / 28);
  const communication = day % 28 === 1 ? balance.monthlyCommunicationCost : 0;
  const propertyIncome = Object.keys(state.assets).reduce((total, assetId) => {
    const asset = content.assets.find((entry) => entry.id === assetId);
    return total + (asset?.kind === 'rental' ? asset.dailyIncome : 0);
  }, 0);
  const otherAssetIncome = passive.assetIncome - propertyIncome;
  const income = passive.profit + passive.assetIncome + investmentDividend;
  const totalExpense = rent + living + transport + communication + homeFixed;
  state.cash += income - totalExpense;
  if (passive.profit >= 0) recordStateFinancialEntry(state, { day, direction: 'income', category: 'business_income', amount: passive.profit, label: '企业利润', sourceType: 'business' });
  else recordStateFinancialEntry(state, { day, direction: 'expense', category: 'business_cost', amount: -passive.profit, label: '企业经营成本', sourceType: 'business' });
  if (propertyIncome > 0) recordStateFinancialEntry(state, { day, direction: 'income', category: 'property_income', amount: propertyIncome, label: '房产租金', sourceType: 'asset' });
  if (otherAssetIncome > 0) recordStateFinancialEntry(state, { day, direction: 'income', category: 'investment_dividend', amount: otherAssetIncome, label: '资产收益', sourceType: 'asset' });
  if (investmentDividend > 0) recordStateFinancialEntry(state, { day, direction: 'income', category: 'investment_dividend', amount: investmentDividend, label: '投资分红', sourceType: 'investment' });
  if (rent > 0) recordStateFinancialEntry(state, { day, direction: 'expense', category: 'housing', amount: rent, label: '房租', sourceType: 'housing', sourceId: state.housing.housingId });
  recordStateFinancialEntry(state, { day, direction: 'expense', category: 'living', amount: living, label: '基础生活', sourceType: 'living' });
  recordStateFinancialEntry(state, { day, direction: 'expense', category: 'transport', amount: transport, label: '交通', sourceType: 'living' });
  if (communication > 0) recordStateFinancialEntry(state, { day, direction: 'expense', category: 'communication', amount: communication, label: '通讯', sourceType: 'living' });
  if (homeFixed > 0) recordStateFinancialEntry(state, { day, direction: 'expense', category: 'housing', amount: homeFixed, label: '居住费用', sourceType: 'housing', sourceId: state.housing.housingId });
  output.push({ type: 'settlement', day, cashDelta: income - totalExpense, details: [
    { label: '营业利润', amount: passive.profit },
    { label: '资产收益', amount: passive.assetIncome },
    { label: '投资分红', amount: investmentDividend },
    { label: '租金', amount: -rent },
    { label: '生活支出', amount: -living },
    { label: '交通', amount: -transport },
    ...(communication ? [{ label: '通讯', amount: -communication }] : []),
  ] });
  syncLegacyMonthlyLedger(state, content, balance);
}

function jobAvailable(state: GameState, job: JobDefinition, content: ContentRegistry, balance: BalanceConfig): boolean {
  if (job.abilityRequired !== undefined && state.ability < job.abilityRequired) return false;
  if (job.reputationRequired !== undefined && state.reputation < job.reputationRequired) return false;
  if (job.requirements && !evaluateCondition(job.requirements, state, content, balance)) return false;
  if (!careerRequirementsSatisfied(job, state)) return false;
  if (job.requiredItems?.some((itemId) => (state.inventory[itemId] ?? 0) < 1)) return false;
  if (job.requiredCapabilities?.some((capability) => !state.unlockedCapabilities.includes(capability))) return false;
  return true;
}

export function projectMonthlySummary(state: GameState, content: ContentRegistry, balance: BalanceConfig): MonthlySummary {
  return { month: state.calendar.month, ledger: { ...state.monthlyLedger, netWorthEnd: calculateNetWorth(state, content, balance) } };
}
