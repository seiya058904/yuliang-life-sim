/**
 * 5-Year Balance Harness.
 *
 * 目标不是"找出最佳人生"，而是：
 *  - 用固定 Seed 让每条策略可复现；
 *  - 采集财务 / 职业 / 生活 / 社交 / 世界 / 决策密度六类指标；
 *  - 找出 Bug、异常值与"数学上直接玩错"的死路线。
 *
 * 自我约束：
 *  - 策略只能读取玩家在 UI 上看得见的状态，不能预知未来事件；
 *  - 不改动引擎语义，只调用 `dispatchGameAction`；
 *  - 所有随机性都来自 `createInitialState(seed)`，因此同 Seed 必然同结果。
 *
 * 用法：
 *   tsx scripts/simulate.ts [--days=1825] [--seeds=1,2] [--strategies=a,b]
 *                          [--json=path] [--report=path] [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { balanceConfig } from '../src/game/balance/config';
import { contentRegistry } from '../src/game/content/registry';
import { dispatchGameAction } from '../src/game/engine/actions';
import { createInitialState } from '../src/game/engine/initialState';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from '../src/game/engine/schedule';
import { evaluateCondition } from '../src/game/engine/conditions';
import { activityCashCost, activityCooldownRemaining } from '../src/game/engine/activities';
import { investmentUnitValue } from '../src/game/engine/investments';
import { courseAvailability } from '../src/game/engine/planning';
import { fixedMonthBudget, jobAvailable } from '../src/game/engine/settlementMath';
import { businessValuation, calculateDailyBusinessProfit, calculateNetWorth } from '../src/game/engine/economy';
import { housingRentPerDay } from '../src/game/engine/locations';
import { applicationCooldownRemaining } from '../src/game/engine/lifecycle';
import { housingPrice } from '../src/game/engine/housingValue';
import type { ContentRegistry, GameAction, GameState, Weekday, ConditionDefinition } from '../src/game/content/contracts';
import type { BalanceConfig } from '../src/game/balance/config';

const DAYS_PER_YEAR = 365;
const MINUTES_PER_WEEK = 7 * 24 * 60;
const DEFAULT_DAYS = 5 * DAYS_PER_YEAR;
/** 每个决策点最多执行的自主动作数。 */
const MAX_ELECTIVE_ACTIONS = 24;

type StrategyId =
  | 'conservative-worker'
  | 'social-explorer'
  | 'career-climber'
  | 'investor'
  | 'entrepreneur'
  | 'balanced-life'
  | 'career'
  | 'consumer'
  | 'relationship'
  | 'expert'
  | 'manager'
  | 'property'
  | 'business'
  | 'high-wealth'
  | 'high-wealth-normal-life';

type ScenarioId = 'expert' | 'manager' | 'property' | 'business' | 'high-wealth' | 'high-wealth-normal-life';

interface StrategySpec {
  id: StrategyId;
  label: string;
  /** 预设场景探针：用于回归，不作为"有机长期平衡"的结论。 */
  scenario?: ScenarioId;
  /** 偏好活动类别，按顺序尝试。 */
  activityCategories?: readonly string[];
  /** 每个月最多主动社交次数。 */
  socialPerMonth?: number;
  /** 每个月最多投递申请数。 */
  applicationsPerMonth?: number;
  /** 消费占可用现金比例上限。 */
  spendRatio?: number;
  /** 追求职业升级：资格 / 升职 / 谈薪。 */
  climb?: boolean;
  /** 配置投资。 */
  invest?: boolean;
  /** 经营企业。 */
  enterprise?: boolean;
  /** 情绪化消费。 */
  consumer?: boolean;
  /** 生意立住后主动离职（验证离职流程与失业期）。 */
  quit?: boolean;
}

const STRATEGIES: readonly StrategySpec[] = [
  { id: 'conservative-worker', label: '稳定打工（低消费 / 不投资）', activityCategories: [], socialPerMonth: 0, applicationsPerMonth: 0, spendRatio: 0.15 },
  { id: 'social-explorer', label: '社交体验（大量社交与活动）', activityCategories: ['food', 'film', 'culture', 'social', 'nightlife'], socialPerMonth: 4, applicationsPerMonth: 0, spendRatio: 0.35 },
  { id: 'career-climber', label: '职业攀升（资格 / 升职 / 谈薪）', activityCategories: ['culture'], socialPerMonth: 1, applicationsPerMonth: 2, spendRatio: 0.2, climb: true },
  { id: 'investor', label: '长期配置（先攒钱再投资）', activityCategories: [], socialPerMonth: 0, applicationsPerMonth: 0, spendRatio: 0.1, invest: true },
  { id: 'entrepreneur', label: '创业者（挣钱 / 买企业 / 再投入）', activityCategories: [], socialPerMonth: 1, applicationsPerMonth: 1, spendRatio: 0.2, enterprise: true, quit: true },
  { id: 'balanced-life', label: '平衡生活（工作 + 生活 + 社交）', activityCategories: ['food', 'culture', 'fitness', 'social'], socialPerMonth: 2, applicationsPerMonth: 1, spendRatio: 0.25, invest: true },
  { id: 'career', label: '基线：默认计划 + 不主动决策', activityCategories: [], socialPerMonth: 0, applicationsPerMonth: 0, spendRatio: 0 },
  { id: 'consumer', label: '消费主义（有钱就买）', activityCategories: ['food', 'film', 'nightlife'], socialPerMonth: 1, applicationsPerMonth: 0, spendRatio: 0.7, consumer: true },
  { id: 'relationship', label: '关系优先（主动互动 + 送礼）', activityCategories: ['film', 'culture'], socialPerMonth: 6, applicationsPerMonth: 0, spendRatio: 0.3 },
  { id: 'expert', label: '探针：运营专家（预置）', scenario: 'expert', spendRatio: 0.2 },
  { id: 'manager', label: '探针：区域运营经理（预置）', scenario: 'manager', spendRatio: 0.2 },
  { id: 'property', label: '探针：已有房产与 REIT（预置）', scenario: 'property', spendRatio: 0.2 },
  { id: 'business', label: '探针：已有小企业（预置）', scenario: 'business', spendRatio: 0.2 },
  { id: 'high-wealth', label: '探针：千万现金（预置）', scenario: 'high-wealth', spendRatio: 0.2 },
  { id: 'high-wealth-normal-life', label: '探针：千万现金 + 便利店店员（预置）', scenario: 'high-wealth-normal-life', spendRatio: 0.2 },
];

const DEFAULT_SEEDS = [20260825, 1991, 7021, 314159];

/* -------------------------------------------------------------- 场景探针 */

function configureScenario(state: GameState, content: ContentRegistry, scenario: ScenarioId): void {
  if (scenario === 'expert' || scenario === 'manager') {
    const jobId = scenario === 'expert' ? 'job.category-operations-expert' : 'job.regional-operations-manager';
    const job = content.jobs.find((entry) => entry.id === jobId)!;
    state.ability = 100;
    state.reputation = 100;
    state.currentJobId = job.id;
    state.unlockedJobIds = [...new Set([...state.unlockedJobIds, job.id])];
    state.careerExperience = { operations: scenario === 'expert' ? 121 : 61, management: scenario === 'manager' ? 1 : 0 };
    state.qualifications = scenario === 'manager' ? ['people_management_basics'] : [];
    state.employment = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week, basePay: job.basePay, salaryAdjustment: 0, negotiationStage: 0 };
    state.weeklyPlan = createDefaultWeeklyPlan();
    state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
    state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, content, state);
    // 探针也要有启动资金：月薪很高但现金为 0 会让固定生活成本先扣成负数，
    // 那是探针设置问题，不是引擎的"贫困陷阱"。
    state.cash = Math.max(state.cash, job.basePay * 20 * 3);
  }
  if (scenario === 'property') {
    state.cash = 2_000_000;
    state.housingHoldings = { 'housing.sunny-apartment': { housingId: 'housing.sunny-apartment', purchasePrice: 24_000, currentValuation: 24_000, occupancy: 'rented' } };
    state.investments = { 'investment.commercial-reit': { investmentId: 'investment.commercial-reit', units: 100, averageCost: 100, currentValuation: 10_000, lastValuationDay: state.time.day } };
  }
  if (scenario === 'business') {
    const business = content.businesses.find((entry) => entry.id === 'business.seed-kiosk')!;
    state.cash = 100_000;
    state.unlockedCapabilities = [...new Set([...state.unlockedCapabilities, 'business_license'])];
    state.unlockedBusinessIds = [...new Set([...state.unlockedBusinessIds, business.id])];
    state.businesses = { [business.id]: { businessId: business.id, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: business.price, capitalInvested: business.price, equityPercent: 100 } };
  }
  if (scenario === 'high-wealth' || scenario === 'high-wealth-normal-life') state.cash = 10_000_000;
  if (scenario === 'high-wealth-normal-life') {
    const job = content.jobs.find((entry) => entry.id === 'job.seed-shop-clerk')!;
    state.currentJobId = job.id;
    state.unlockedJobIds = [...new Set([...state.unlockedJobIds, job.id])];
    state.employment = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week, basePay: job.basePay, salaryAdjustment: 0, negotiationStage: 0 };
    state.weeklyPlan = createDefaultWeeklyPlan();
    state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
    state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, content, state);
  }
}

/* ------------------------------------------------------------------ 工具 */

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function round(value: number): number {
  return Math.round(value);
}

function monthlySalaryOf(state: GameState): number {
  if (!state.employment) return 0;
  return payPerWorkday(state) * 20;
}

/**
 * 日薪口径。`basePay` / 岗位 `salaryRange` 都是"每个工作日"的金额
 * （见 `shiftPay`），月薪只是乘 20 个工作日得到的展示值。
 * 求职与 Offer 判定必须用同一口径，否则会永远算出"没有岗位比现在好"。
 */
function payPerWorkday(state: GameState): number {
  if (!state.employment) return 0;
  return (state.employment.basePay ?? 0) + (state.employment.salaryAdjustment ?? 0);
}

/**
 * 失业天数：只依据引擎真实记录的 `employmentHistory`（每段工作的
 * `startedDay` / `endedDay`）计算，不由模拟器猜。
 */
function unemployedDays(state: GameState): number {
  const history = (state.employmentHistory ?? [])
    .map((entry) => ({ startedDay: entry.startedDay ?? 1, endedDay: entry.endedDay ?? entry.startedDay ?? 1 }))
    .sort((left, right) => left.startedDay - right.startedDay);
  const end = state.time.day;
  if (!history.length) return state.employment ? 0 : end;
  let cursor = 1;
  let unemployed = 0;
  for (const entry of history) {
    if (entry.startedDay > cursor) unemployed += entry.startedDay - cursor;
    cursor = Math.max(cursor, entry.endedDay + 1);
  }
  if (!state.employment && cursor <= end) unemployed += end - cursor + 1;
  return Math.max(0, unemployed);
}

function requirementMet(condition: ConditionDefinition | undefined, state: GameState, content: ContentRegistry, balance: BalanceConfig): boolean {
  return !condition || evaluateCondition(condition, state, content, balance);
}

/**
 * 可自由支配的现金：引擎在购物 / 投资时要求先预留下一次住房费用
 * （`reserveRequired` = 当前租住住房的日租金），所以模拟器用同一条规则。
 */
function spendableCash(state: GameState, content: ContentRegistry): number {
  if (state.housing.mode !== 'rent') return Math.max(0, state.cash);
  const home = content.housing.find((entry) => entry.id === state.housing.housingId);
  const reserve = home ? housingRentPerDay(state, home) : 0;
  return Math.max(0, state.cash - reserve);
}

/**
 * 选择一项当前真的做得了的活动：条件满足、现金足够、冷却已过、同行人存在。
 * `rotation` 让同一条策略在不同月份落到不同的活动上，避免"永远喝同一杯咖啡"。
 */
function pickActivity(
  state: GameState,
  content: ContentRegistry,
  balance: BalanceConfig,
  categories: readonly string[],
  cashBudget: number,
  rotation = 0,
): { activityId: string; optionId: string; cost: number } | undefined {
  const candidates: { activityId: string; optionId: string; cost: number }[] = [];
  for (const category of categories) {
    for (const definition of content.activities ?? []) {
      if (definition.category !== category) continue;
      for (const option of definition.options) {
        if (!requirementMet(option.requirements, state, content, balance)) continue;
        if (option.requiredCharacterId && !content.characters.some((character) => character.id === option.requiredCharacterId)) continue;
        if (activityCooldownRemaining(state, definition, option) > 0) continue;
        const cost = activityCashCost(state, definition, option, content);
        if (cost > cashBudget) continue;
        candidates.push({ activityId: definition.id, optionId: option.id, cost });
      }
    }
  }
  if (!candidates.length) return undefined;
  return candidates[rotation % candidates.length];
}

function pickCourse(state: GameState, content: ContentRegistry, balance: BalanceConfig, cashBudget: number) {
  for (const course of content.courses ?? []) {
    // 直接复用引擎自己的可用性判定，避免模拟器与规划器对"还能不能上"产生分歧。
    const availability = courseAvailability(state, course, content, balance);
    if (availability.reason) continue;
    if (course.cashCost > cashBudget) continue;
    return course;
  }
  return undefined;
}

/** 市场里当前可投递、且比现职更好的岗位。只使用玩家可见信息。 */
function pickVacancy(state: GameState, content: ContentRegistry, balance: BalanceConfig) {
  // 与 `vacancy.salaryRange` 同一口径：日薪。
  const current = payPerWorkday(state);
  const candidates = (state.vacancies ?? []).filter((vacancy) => {
    const job = content.jobs.find((entry) => entry.id === vacancy.jobId);
    if (!job) return false;
    if (job.employmentKind !== 'full_time') return false;
    if (job.id === state.currentJobId) return false;
    // 直接复用引擎自己的岗位可用性判定，模拟器不自造一套门槛。
    if (!jobAvailable(state, job, content, balance)) return false;
    // `accept_application_offer` 还会检查 `unlockedJobIds`：这里先过一遍，
    // 否则会出现"投递成功但无法接受"的假阻塞。
    if (!state.unlockedJobIds.includes(job.id)) return false;
    // 同一家公司在处理中的申请不能再投，否则引擎会直接拒绝，浪费配额。
    if ((state.applications ?? []).some((entry) => entry.companyId === vacancy.companyId
      && !['rejected', 'withdrawn', 'expired'].includes(entry.status))) return false;
    // 冷却也是玩家可见的拒绝理由（"还需等待 N 天"）。这里先过一遍，
    // 报告里的"错误"才只反映真正的异常，而不是模拟器自己不读规则。
    if (applicationCooldownRemaining(state, job.id, vacancy.companyId) > 0) return false;
    return vacancy.expiresDay >= state.time.day;
  });
  const better = candidates.filter((vacancy) => vacancy.salaryRange[1] > current * 1.05);
  if (!better.length) return undefined;
  better.sort((left, right) => {
    const leftJob = content.jobs.find((entry) => entry.id === left.jobId)!;
    const rightJob = content.jobs.find((entry) => entry.id === right.jobId)!;
    const leftScore = left.salaryRange[1] + leftJob.careerXp * 20;
    const rightScore = right.salaryRange[1] + rightJob.careerXp * 20;
    return rightScore - leftScore || left.vacancyId.localeCompare(right.vacancyId);
  });
  return better[0];
}

function pickInteraction(state: GameState, content: ContentRegistry, cashBudget: number) {
  const results: { interactionId: string; optionId: string; cost: number; relationship: number }[] = [];
  for (const interaction of content.relationshipInteractions ?? []) {
    for (const option of interaction.options) {
      const relationship = state.relationships[interaction.characterId] ?? 0;
      if (relationship <= 0) continue;
      if (option.cashCost > cashBudget) continue;
      results.push({ interactionId: interaction.id, optionId: option.id, cost: option.cashCost, relationship });
    }
  }
  if (!results.length) return undefined;
  results.sort((left, right) => left.relationship - right.relationship || left.interactionId.localeCompare(right.interactionId));
  return results[0];
}

/* -------------------------------------------------------------- 策略决策 */

function effectScore(choice: { effects: readonly { type: string; amount?: number; stat?: string }[]; opportunity?: unknown }): number {
  let value = 0;
  for (const effect of choice.effects) {
    const amount = effect.amount ?? 0;
    if (effect.type === 'cash') value += amount * 0.001;
    else if (effect.type === 'stat') value += amount * (effect.stat === 'ability' ? 2 : 1);
    else if (effect.type === 'attribute') value += amount;
    else if (effect.type === 'unlock_capability' || effect.type === 'unlock_job' || effect.type === 'unlock_business') value += 12;
    else if (effect.type === 'unlock_housing' || effect.type === 'unlock_asset') value += 6;
    else if (effect.type === 'relation') value += amount;
  }
  if (choice.opportunity) value += 20;
  return value;
}

/** 事件选择：求进型策略优先选择能力 / 声望 / 机会分支，其余策略取第一项。 */
function chooseEventChoice(state: GameState, content: ContentRegistry, spec: StrategySpec, eventId: string): string {
  const event = content.events.find((entry) => entry.id === eventId);
  if (!event || !event.choices.length) return '';
  const affordable = event.choices.filter((choice) => {
    const cash = choice.effects.reduce((sum, effect) => sum + (effect.type === 'cash' ? effect.amount : 0), 0);
    return cash >= 0 || state.cash + cash >= 0;
  });
  const pool = affordable.length ? affordable : event.choices;
  if (!spec.climb && !spec.enterprise) return pool[0].id;
  const scored = [...pool].sort((left, right) => effectScore(right) - effectScore(left) || left.id.localeCompare(right.id));
  return scored[0].id;
}

/**
 * 队列里排在后面的动作，可能已经被前面的消费花掉了预算；发出去之前用当前
 * 现金再确认一次，避免把"模拟器的排程失误"记成引擎的阻塞。
 */
function isAffordableNow(state: GameState, content: ContentRegistry, action: GameAction): boolean {
  const spendable = spendableCash(state, content);
  if (action.type === 'interact_character') {
    const interaction = content.relationshipInteractions?.find((entry) => entry.id === action.interactionId);
    const option = interaction?.options.find((entry) => entry.id === action.optionId);
    return Boolean(option) && option!.cashCost <= spendable;
  }
  if (action.type === 'purchase_items') {
    const total = Object.entries(action.items).reduce((sum, [itemId, quantity]) => {
      const item = content.items.find((entry) => entry.id === itemId);
      return sum + (item ? item.price * quantity : Number.MAX_SAFE_INTEGER);
    }, 0);
    return total <= spendable;
  }
  if (action.type === 'gift_item') return (state.inventory[action.itemId] ?? 0) > 0;
  return true;
}

/**
 * 每周决策点（周一）的自主动作队列。
 *
 * 关键设计：所有需要花钱的决定都在**真实的当前状态**上重新计算，而不是
 * 在月初一次性排好再执行 —— 否则模拟器会拿着一个月的旧现金余额去点互动。
 * 重决策（求职 / 课程 / 活动 / 投资 / 企业 / 住房）只在月首那一周做一次。
 */
function buildWeeklyActions(
  state: GameState,
  content: ContentRegistry,
  balance: BalanceConfig,
  spec: StrategySpec,
  monthIndex: number,
  isMonthStart: boolean,
): GameAction[] {
  const actions: GameAction[] = [];
  const spendRatio = spec.spendRatio ?? 0.2;
  // 可支配收入 = 月收入 − 引擎算出的固定月支出（房租 / 生活 / 交通 / 通讯）。
  // 用引擎自己的口径，模拟器才不会算出一个玩家在 UI 上看不到的数字。
  const fixed = fixedMonthBudget(state, content, balance);
  const disposable = Math.max(0, monthlySalaryOf(state) - fixed.total);
  const spendable = spendableCash(state, content);
  /**
   * `spendRatio` 是"一个月最多花掉多少可支配收入"的**总量**上限，不是每一笔
   * 的上限。之前每个活动 / 互动各自用 `spendable * 0.4`，一个月累起来能花掉
   * 全部收入，"低消费策略"名不副实，也把"贫困陷阱"读成了模拟器的排程失误。
   */
  const monthlyElective = Math.max(0, Math.min(round(disposable * spendRatio), round(spendable * 0.6)));
  const budget = monthlyElective;

  if (isMonthStart) {
    // 1) 谈薪：引擎的谈薪入口是"离职沟通 → 选择留任"，不是 `start_recruitment`
    //    （后者对现职必然失败："你已经在这份工作中"）。所以这里走真实路径。
    //    只在确有下一次涨幅空间时才发起，避免把一次性挽留奖励当谈薪用掉。
    if (spec.climb && state.employment && !state.activeResignation && !state.activeRecruitment) {
      const job = content.jobs.find((entry) => entry.id === state.employment!.jobId);
      const experience = state.jobExperience?.[state.employment.jobId] ?? 0;
      const stage = state.employment.negotiationStage ?? 0;
      const nextThreshold = stage === 0 ? 20 : stage === 1 ? 60 : Infinity;
      const sinceLast = state.time.day - (state.employment.lastNegotiationDay ?? 0);
      const tenure = state.time.day - (state.employment.startedDay ?? 0);
      if (job && experience >= nextThreshold && tenure >= 56 && sinceLast >= 180) {
        actions.push({ type: 'start_resignation' });
      }
    }

    // 2) 投递申请（只看市场里当前真实存在的岗位）
    const applicationQuota = spec.applicationsPerMonth ?? 0;
    if (applicationQuota > 0) {
      const activeCount = (state.applications ?? []).filter((entry) => ['submitted', 'screening', 'interview', 'waiting'].includes(entry.status)).length;
      if (activeCount < balance.applicationMaxActiveFullTime) {
        const vacancy = pickVacancy(state, content, balance);
        if (vacancy) actions.push({ type: 'submit_application', vacancyId: vacancy.vacancyId });
      }
    }

    // 3) 课程 / 资格
    if (spec.climb) {
      const course = pickCourse(state, content, balance, Math.max(budget, 200));
      if (course) actions.push({ type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'course', courseId: course.id } });
      actions.push({ type: 'set_plan', weekday: 4, slot: 'evening', activity: { kind: 'study', durationMinutes: 180 } });
    }

    // 4) 活动安排（写进周计划，由引擎在时间运行中结算）
    const categories = spec.activityCategories ?? [];
    if (categories.length) {
      // 活动占本月可支配预算的 60%，另外 40% 留给每周社交。
      const activityBudget = Math.min(Math.max(Math.floor(monthlyElective * 0.6), 60), Math.max(40, Math.floor(spendable * 0.3)));
      const first = pickActivity(state, content, balance, categories, activityBudget, monthIndex);
      if (first) actions.push({ type: 'set_plan', weekday: 6, slot: 'day', activity: { kind: 'activity', activityId: first.activityId, optionId: first.optionId } });
      const second = pickActivity(state, content, balance, categories, activityBudget, monthIndex + 3);
      if (second && second.activityId !== first?.activityId) {
        actions.push({ type: 'set_plan', weekday: 7, slot: 'day', activity: { kind: 'activity', activityId: second.activityId, optionId: second.optionId } });
      }
    }

    // 5) 消费与礼物
    if (spec.consumer) {
      for (const item of content.items) {
        if (item.price > Math.min(budget, spendable)) continue;
        if ((state.inventory[item.id] ?? 0) > 0) continue;
        actions.push({ type: 'purchase_items', items: { [item.id]: 1 } });
        break;
      }
    }
    const gift = content.items.find((item) => item.giftable && (state.inventory[item.id] ?? 0) > 0);
    if (gift && (spec.socialPerMonth ?? 0) > 0) {
      const target = Object.entries(state.relationships).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
      if (target) actions.push({ type: 'gift_item', characterId: target[0], itemId: gift.id });
    }

    // 6) 投资 / 资产配置（只用玩家看得见的当前单位估值来算预算）
    if (spec.invest) {
      const reserve = monthlySalaryOf(state) * 2;
      const investable = Math.max(0, spendable - reserve);
      const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
      const investment = (content.investments ?? [])
        .filter((entry) => requirementMet(entry.requirements, state, content, balance))
        .filter((entry) => investmentUnitValue(entry, state.rng.seed, state.time.day) * entry.minimumUnits <= investable * 0.5)
        .sort((left, right) => (riskOrder[left.risk] ?? 9) - (riskOrder[right.risk] ?? 9) || left.id.localeCompare(right.id))[0];
      if (investment) {
        const unitValue = investmentUnitValue(investment, state.rng.seed, state.time.day);
        const units = Math.max(investment.minimumUnits, Math.floor((investable * 0.5) / unitValue));
        if (units > 0 && unitValue * units <= investable) actions.push({ type: 'buy_investment', investmentId: investment.id, units });
      }
    }

    // 7) 企业：只买引擎已经解锁、且现金真的够的生意。
    if (spec.enterprise) {
      const target = content.businesses
        .filter((business) => !state.businesses[business.id])
        .filter((business) => state.unlockedBusinessIds.includes(business.id))
        .filter((business) => business.price <= spendable * 0.6)
        .filter((business) => requirementMet(business.requirements, state, content, balance))
        .sort((left, right) => right.price - left.price || left.id.localeCompare(right.id))[0];
      if (target) actions.push({ type: 'buy_business', businessId: target.id });
      else {
        const owned = Object.values(state.businesses)[0];
        const business = owned ? content.businesses.find((entry) => entry.id === owned.businessId) : undefined;
        // 档位上限由内容自己给的长度决定，不能写死 5，否则引擎会以"经营参数超出范围"整条拒绝。
        if (business && owned && owned.equityPercent === 100
          && owned.priceLevel + 1 < business.priceLevels.length
          && owned.inventoryLevel + 1 < business.inventoryLevels.length
          && spendable > business.price * 0.4) {
          actions.push({
            type: 'update_business',
            businessId: owned.businessId,
            priceLevel: owned.priceLevel + 1,
            wageLevel: Math.min(owned.wageLevel, business.wageLevels.length - 1),
            inventoryLevel: owned.inventoryLevel + 1,
          });
        }
      }
    }

    // 8) 住房升级：租金不超过月收入 40% 且能预留两个月租金时才考虑。
    const currentHome = content.housing.find((entry) => entry.id === state.housing.housingId);
    const upgrade = spendRatio >= 0.2 ? content.housing
      .filter((entry) => state.unlockedHousingIds.includes(entry.id))
      .filter((entry) => requirementMet(entry.requirements, state, content, balance))
      .filter((entry) => !currentHome || (entry.lifestyleDelta ?? 0) > (currentHome.lifestyleDelta ?? 0))
      .filter((entry) => housingRentPerDay(state, entry) * 28 <= monthlySalaryOf(state) * 0.4)
      .sort((left, right) => (right.lifestyleDelta ?? 0) - (left.lifestyleDelta ?? 0) || left.id.localeCompare(right.id))[0] : undefined;
    if (upgrade && state.time.day > 60 && !state.mortgage && state.cash > (housingRentPerDay(state, upgrade) || 0) * 56) {
      actions.push({ type: 'move_housing', housingId: upgrade.id, mode: 'rent' });
    }

    // 8b) 创业者：生意已经立住（有企业 + 半年固定支出缓冲）后离职，把时间交给生意。
    //     这是真的走到引擎的离职流程，而不是模拟器自己把 employment 清掉。
    if (spec.quit && state.employment && !state.activeResignation && !state.activeRecruitment
      && Object.keys(state.businesses).length > 0 && state.cash > fixed.total * 6) {
      actions.push({ type: 'start_resignation' });
    }

    // 9) 清理已结束的申请
    if ((state.applications ?? []).filter((entry) => ['rejected', 'accepted', 'withdrawn', 'expired'].includes(entry.status)).length > 8) {
      actions.push({ type: 'clear_terminal_applications' });
    }
  }

  // 10) 社交互动：每周做一点，而不是月初一次性点完，现金判断才不会被旧余额骗到。
  const perWeek = Math.round((spec.socialPerMonth ?? 0) / 4);
  // 社交预算 = 本月可支配预算的 40% 摊到四周，而不是每周都能用到 `spendable * 0.4`。
  const socialWeekBudget = Math.max(0, Math.floor((monthlyElective * 0.4) / 4));
  for (let index = 0; index < perWeek; index += 1) {
    const interaction = pickInteraction(state, content, Math.min(socialWeekBudget, Math.floor(spendable * 0.4)));
    if (!interaction) break;
    actions.push({ type: 'interact_character', interactionId: interaction.interactionId, optionId: interaction.optionId });
  }

  return actions.slice(0, MAX_ELECTIVE_ACTIONS);
}

/* ------------------------------------------------------------------ 运行 */

interface MonthlyFinanceRow {
  month: number;
  totalIncome: number;
  totalConsumption: number;
  totalAllocation: number;
  totalLiquidation: number;
  cashStart: number;
  cashEnd: number;
  netWorthStart: number;
  netWorthEnd: number;
  income: Record<string, number>;
  consumption: Record<string, number>;
  assetAllocation: Record<string, number>;
  assetLiquidation: Record<string, number>;
}

interface RunResult {
  strategy: StrategyId;
  label: string;
  seed: number;
  scenario: boolean;
  day: number;
  completed: boolean;
  aborted?: string;
  cash: number;
  netWorth: number;
  netWorthSeries: number[];
  cashSeries: number[];
  liquidCashMin: number;
  liquidCashMinDay: number;
  worthlessDays: number;
  errors: number;
  blocked: Record<string, number>;
  errorSamples: string[];
  messageTitles: Record<string, number>;
  finance: {
    totalIncome: number;
    totalConsumption: number;
    totalAllocation: number;
    totalLiquidation: number;
    incomeByCategory: Record<string, number>;
    consumptionByCategory: Record<string, number>;
    allocationByCategory: Record<string, number>;
    liquidationByCategory: Record<string, number>;
    rentShare: number;
    transportShare: number;
    lifestyleShare: number;
    months: MonthlyFinanceRow[];
    monthsWithoutIncome: number;
  };
  career: {
    firstEmploymentDay: number | null;
    applications: number;
    offers: number;
    rejections: number;
    jobChanges: number;
    finalMonthlySalary: number;
    salaryByMonth: number[];
    careerExperience: Record<string, number>;
    qualifications: number;
    negotiations: number;
    negotiationStage: number;
    salaryAdjustment: number;
    resignations: number;
    unemploymentDays: number;
    endJobId: string | null;
    endJobName: string | null;
  };
  life: {
    activities: number;
    distinctActivities: number;
    travel: number;
    courses: number;
    purchases: number;
    itemSpend: number;
    housingChanges: number;
    vehicleAcquisitions: number;
  };
  social: {
    interactions: number;
    activeContacts: number;
    relationshipTotal: number;
    relationshipStages: Record<string, number>;
    gifts: number;
    companions: number;
    messages: number;
  };
  world: {
    majorEvents: number;
    ambientEvents: number;
    storylineAdvance: number;
    companyStateChanges: number;
    npcCareerChanges: number;
    locationDevelopmentTotal: number;
    locationsTouched: number;
    worldHistoryYears: number;
  };
  wealth: {
    investmentHoldings: number;
    investmentInvested: number;
    investmentValue: number;
    investmentUnrealized: number;
    businessCount: number;
    businessValuation: number;
    rentalHoldings: number;
    rentalMonthlyIncome: number;
    ownHousingValue: number;
    mortgageRemaining: number;
    vehicleValue: number;
    assetCount: number;
  };
  decision: {
    forcedPauses: number;
    eventChoices: number;
    offers: number;
    rewards: number;
    monthlySummaries: number;
    planCycles: number;
    perMonthPauses: number;
  };
}

function runOne(spec: StrategySpec, seed: number, days: number): RunResult {
  const content = contentRegistry;
  const balance = balanceConfig;
  let state = createInitialState(content, balance, seed);
  if (spec.scenario) configureScenario(state, content, spec.scenario);

  // 关闭自动重复：让每个周一都成为一次真实的计划决策点（玩家正常玩法）。
  const started = dispatchGameAction(state, { type: 'set_auto_repeat_plan', enabled: false }, content, balance);
  if (!started.error) state = started.state;

  const blocked: Record<string, number> = {};
  const errorSamples: string[] = [];
  const messageTitles: Record<string, number> = {};
  const netWorthSeries: number[] = [];
  const cashSeries: number[] = [];
  const months: MonthlyFinanceRow[] = [];
  const salaryByMonth: number[] = [];
  const seenMessages = new Set<string>();
  const npcCareerStates = new Map<string, string>();
  const companyStates = new Map<string, string>();
  const relationshipStages: Record<string, number> = {};
  let npcCareerChanges = 0;
  let companyStateChanges = 0;
  let messages = 0;
  let liquidCashMin = state.cash;
  let liquidCashMinDay = state.time.day;
  let worthlessDays = 0;
  let errors = 0;
  let forcedPauses = 0;
  let eventChoices = 0;
  let offersSeen = 0;
  let rewardsSeen = 0;
  let monthlySummaries = 0;
  let planCycles = 0;
  let negotiations = 0;
  let resignations = 0;
  let aborted: string | undefined;

  const recordError = (message: string) => {
    errors += 1;
    const key = message.replace(/第 \d+ 天/g, '第 N 天').slice(0, 48);
    blocked[key] = (blocked[key] ?? 0) + 1;
    if (errorSamples.length < 12 && !errorSamples.includes(message)) errorSamples.push(message);
  };

  const ingestState = (next: GameState) => {
    for (const message of next.messages ?? []) {
      if (seenMessages.has(message.id)) continue;
      seenMessages.add(message.id);
      messages += 1;
      messageTitles[message.title] = (messageTitles[message.title] ?? 0) + 1;
    }
    // 引擎会在决策点停下，停下的那天不一定是整周，所以按"跨过第 N 周"补齐采样，
    // 否则净值曲线会因为门禁时机而随机缺样。
    while (next.time.day >= nextSampleDay) {
      netWorthSeries.push(round(calculateNetWorth(next, content, balance)));
      cashSeries.push(round(next.cash));
      nextSampleDay += 7;
    }
  };

  const captureWorld = (next: GameState) => {
    const snapshot = (next.worldHistory ?? []).at(-1);
    if (!snapshot) return;
    for (const [id, title] of Object.entries(snapshot.characterCareerStates ?? {})) {
      const previous = npcCareerStates.get(id);
      if (previous !== undefined && previous !== title) npcCareerChanges += 1;
      npcCareerStates.set(id, title);
    }
    for (const [id, title] of Object.entries(snapshot.companyStates ?? {})) {
      const previous = companyStates.get(id);
      if (previous !== undefined && previous !== title) companyStateChanges += 1;
      companyStates.set(id, title);
    }
  };

  let queue: GameAction[] = [];
  let lastSetupWeek = -1;
  let guard = 0;
  let lastDay = state.time.day;
  let stalled = 0;
  let nextSampleDay = 7;
  let monthIndex = 0;

  while (state.time.day <= days && guard < 400000) {
    guard += 1;
    if (state.time.day === lastDay) {
      stalled += 1;
      if (stalled > 1200) { aborted = `第 ${state.time.day} 天连续 ${stalled} 次操作没有推进时间`; break; }
    } else {
      lastDay = state.time.day;
      stalled = 0;
    }

    // ---- 决策门禁：必须先处理。月结优先于其他门禁，因为它会拒绝除
    // `acknowledge_monthly_summary` 以外的一切动作。
    if (state.pendingMonthlySummary || state.simulationMode === 'monthly_summary') {
      const pending = state.pendingMonthlySummary;
      if (pending?.financial) {
        const finance = pending.financial;
        months.push({
          month: finance.month,
          totalIncome: finance.totalIncome.kind === 'known' ? finance.totalIncome.value : 0,
          totalConsumption: finance.totalConsumption.kind === 'known' ? finance.totalConsumption.value : 0,
          totalAllocation: finance.totalAssetAllocation,
          totalLiquidation: finance.totalAssetLiquidation,
          cashStart: finance.cashStart.kind === 'known' ? finance.cashStart.value : 0,
          cashEnd: finance.cashEnd.kind === 'known' ? finance.cashEnd.value : state.cash,
          netWorthStart: finance.netWorthStart.kind === 'known' ? finance.netWorthStart.value : 0,
          netWorthEnd: finance.netWorthEnd.kind === 'known' ? finance.netWorthEnd.value : 0,
          income: { ...finance.income.categories },
          consumption: { ...finance.consumption.categories },
          assetAllocation: { ...finance.assetAllocation.categories },
          assetLiquidation: { ...finance.assetLiquidation.categories },
        });
        salaryByMonth.push(monthlySalaryOf(state));
      }
      monthlySummaries += 1;
      forcedPauses += 1;
      const result = dispatchGameAction(state, { type: 'acknowledge_monthly_summary' }, content, balance);
      if (result.error) { recordError(result.error); continue; }
      state = result.state;
      continue;
    }
    if (state.pendingReward) {
      rewardsSeen += 1;
      forcedPauses += 1;
      const result = dispatchGameAction(state, { type: 'claim_reward' }, content, balance);
      if (result.error) { recordError(result.error); continue; }
      state = result.state;
      continue;
    }
    if (state.pendingEventId) {
      const choiceId = chooseEventChoice(state, content, spec, state.pendingEventId);
      const result = dispatchGameAction(state, { type: 'choose_event', eventId: state.pendingEventId, choiceId }, content, balance);
      if (result.error) { recordError(result.error); continue; }
      eventChoices += 1;
      state = result.state;
      continue;
    }
    if (state.simulationMode === 'event') {
      const result = dispatchGameAction(state, { type: 'continue_after_event' }, content, balance);
      if (result.error) { recordError(result.error); continue; }
      state = result.state;
      continue;
    }
    // ---- 离职 / 谈薪对话框：必须走完，否则会留下一个悬空的对话状态。
    if (state.activeResignation) {
      if (state.activeResignation.stage === 'dialogue') {
        const result = dispatchGameAction(state, { type: 'advance_resignation' }, content, balance);
        if (result.error) { recordError(result.error); aborted = `离职对话无法推进：${result.error}`; break; }
        state = result.state;
        continue;
      }
      // `quit` 策略目标是离开岗位；其余策略在离职沟通里选择留任以争取薪资复核。
      const choice = spec.quit ? 'leave' : 'stay';
      const result = dispatchGameAction(state, { type: 'choose_resignation', choice }, content, balance);
      if (result.error) { recordError(result.error); aborted = `离职结果无法确认：${result.error}`; break; }
      if (choice === 'stay') negotiations += 1;
      else resignations += 1;
      state = result.state;
      continue;
    }
    if (state.activeRecruitment) {
      const jobId = state.activeRecruitment.jobId;
      if (state.activeRecruitment.stage !== 'offer') {
        const result = dispatchGameAction(state, { type: 'advance_recruitment', jobId }, content, balance);
        if (result.error) {
          // 流程走不下去就明确退出对话，避免把模拟器卡在一个悬空的招聘流程里。
          const abort = dispatchGameAction(state, { type: 'decline_job_offer', jobId }, content, balance);
          if (abort.error) { recordError(result.error); aborted = `招聘对话无法推进：${result.error}`; break; }
          blocked['recruitment:aborted'] = (blocked['recruitment:aborted'] ?? 0) + 1;
          state = abort.state;
          continue;
        }
        state = result.state;
        continue;
      }
      const job = content.jobs.find((entry) => entry.id === jobId);
      const worthTaking = Boolean(job) && job!.employmentKind === 'full_time'
        && job!.basePay > payPerWorkday(state) * 1.05;
      const result = dispatchGameAction(state, worthTaking
        ? { type: 'accept_job_offer', jobId }
        : { type: 'decline_job_offer', jobId }, content, balance);
      if (result.error) { recordError(result.error); aborted = `招聘结果无法确认：${result.error}`; break; }
      state = result.state;
      continue;
    }

    if (state.pendingOfferApplicationId) {
      offersSeen += 1;
      forcedPauses += 1;
      const application = (state.applications ?? []).find((entry) => entry.applicationId === state.pendingOfferApplicationId);
      const job = application ? content.jobs.find((entry) => entry.id === application.jobId) : undefined;
      let resolved = state;
      if (application && job && application.status === 'offer') {
        // `salaryRange` 是日薪，必须和 `payPerWorkday` 比较，不能和月薪比。
        const worthTaking = (spec.applicationsPerMonth ?? 0) > 0
          && (job.employmentKind !== 'full_time' || application.salaryRange[1] > payPerWorkday(state) * 1.05);
        const result = dispatchGameAction(resolved, worthTaking
          ? { type: 'accept_application_offer', applicationId: application.applicationId }
          : { type: 'decline_application_offer', applicationId: application.applicationId }, content, balance);
        if (result.error) {
          const declined = dispatchGameAction(resolved, { type: 'decline_application_offer', applicationId: application.applicationId }, content, balance);
          if (declined.error) {
            // 既不能接受也不能拒绝：这是引擎侧的真实阻塞，记进归因而不是死循环。
            const key = `offer:${result.error.slice(0, 32)}`;
            blocked[key] = (blocked[key] ?? 0) + 1;
          } else resolved = declined.state;
        } else resolved = result.state;
      } else {
        // 申请已经被接受 / 拒绝 / 撤回 / 自动过期，门禁只是一个陈旧的 id。
        // 引擎在 `enterRunning` 里对同一情形做自愈，模拟器必须走同一步。
        blocked['offer:stale-gate'] = (blocked['offer:stale-gate'] ?? 0) + 1;
      }
      if (resolved.pendingOfferApplicationId) {
        const dismissed = dispatchGameAction(resolved, { type: 'dismiss_offer_notice' }, content, balance);
        if (dismissed.error) { recordError(dismissed.error); continue; }
        resolved = dismissed.state;
      }
      state = resolved;
      continue;
    }

    // ---- 计划 / 决策点
    if (state.simulationMode === 'planning' || state.simulationMode === 'week_complete' || state.simulationMode === 'paused') {
      if (!queue.length) {
        planCycles += 1;
        // 自主决策每周只排一次：门禁暂停（奖励 / Offer）之后回到同一周，
        // 不能因此把当周的社交与消费再重复执行一遍。
        const week = state.calendar.week;
        if (week !== lastSetupWeek) {
          lastSetupWeek = week;
          const isMonthStart = (state.time.day - 1) % 28 === 0;
          if (isMonthStart) monthIndex += 1;
          queue.push(...buildWeeklyActions(state, content, balance, spec, monthIndex, isMonthStart));
        }
        queue.push({ type: 'start_week' });
      }
      const action = queue.shift()!;
      if (!isAffordableNow(state, content, action)) continue;
      const result = dispatchGameAction(state, action, content, balance);
      if (result.error) {
        if (action.type === 'set_plan') {
          const key = `plan:${result.error.slice(0, 36)}`;
          blocked[key] = (blocked[key] ?? 0) + 1;
          continue;
        }
        if (action.type === 'start_week') {
          // 兜底：把尚未过去的单元格清空后重试一次，避免整轮卡死。
          // 清空会损失当周安排，因此被计入 blocked 供审计。
          let cleared = state;
          for (const weekday of WEEKDAYS) {
            for (const slot of ['day', 'evening'] as const) {
              const result = dispatchGameAction(cleared, { type: 'set_plan', weekday, slot, activity: { kind: 'free' } }, content, balance);
              if (!result.error) cleared = result.state;
            }
          }
          const retry = dispatchGameAction(cleared, { type: 'start_week' }, content, balance);
          if (retry.error) { aborted = `无法开始新一周：${retry.error}`; break; }
          const key = `start_week:${result.error.slice(0, 36)}`;
          blocked[key] = (blocked[key] ?? 0) + 1;
          state = retry.state;
          continue;
        }
        recordError(result.error);
        continue;
      }
      state = result.state;
      continue;
    }

    if (state.simulationMode === 'running') {
      const result = dispatchGameAction(state, { type: 'advance_simulation', minutes: MINUTES_PER_WEEK }, content, balance);
      if (result.error) { recordError(result.error); aborted = `运行时失败：${result.error}`; break; }
      state = result.state;
      ingestState(state);
      captureWorld(state);
      if (state.cash < liquidCashMin) { liquidCashMin = round(state.cash); liquidCashMinDay = state.time.day; }
      if (state.cash <= 0) worthlessDays += 1;
      let pauseDelta = 0;
      for (const effect of result.effects) if (effect.type === 'event') pauseDelta += 1;
      forcedPauses += pauseDelta;
      continue;
    }

    aborted = `未知的模拟状态：${state.simulationMode}`;
    break;
  }

  // ---- 汇总
  const lifeHistory = state.lifeHistory ?? [];
  const activityRecords = lifeHistory.filter((entry) => entry.category === 'activity');
  const activityDefinitions = new Set(activityRecords.map((entry) => entry.sourceId).filter(Boolean));
  const travelIds = new Set((content.activities ?? []).filter((entry) => entry.category === 'travel').map((entry) => entry.id));
  const courseIds = new Set((content.courses ?? []).map((entry) => entry.id));
  const purchaseRecords = lifeHistory.filter((entry) => entry.category === 'purchase');
  const housingRecords = lifeHistory.filter((entry) => entry.category === 'housing' && /搬|入住|买下|租住|出售自住/.test(entry.title));
  const giftRecords = lifeHistory.filter((entry) => entry.category === 'relationship' && entry.title.startsWith('送给'));

  const incomeByCategory: Record<string, number> = {};
  const consumptionByCategory: Record<string, number> = {};
  const allocationByCategory: Record<string, number> = {};
  const liquidationByCategory: Record<string, number> = {};
  let totalIncome = 0;
  let totalConsumption = 0;
  let totalAllocation = 0;
  let totalLiquidation = 0;
  let monthsWithoutIncome = 0;
  for (const row of months) {
    totalIncome += row.totalIncome;
    totalConsumption += row.totalConsumption;
    totalAllocation += row.totalAllocation;
    totalLiquidation += row.totalLiquidation;
    if (row.totalIncome <= 0) monthsWithoutIncome += 1;
    for (const [category, value] of Object.entries(row.income)) incomeByCategory[category] = (incomeByCategory[category] ?? 0) + value;
    for (const [category, value] of Object.entries(row.consumption)) consumptionByCategory[category] = (consumptionByCategory[category] ?? 0) + value;
    for (const [category, value] of Object.entries(row.assetAllocation)) allocationByCategory[category] = (allocationByCategory[category] ?? 0) + value;
    for (const [category, value] of Object.entries(row.assetLiquidation)) liquidationByCategory[category] = (liquidationByCategory[category] ?? 0) + value;
  }
  const share = (category: string) => (totalConsumption > 0 ? (consumptionByCategory[category] ?? 0) / totalConsumption : 0);

  const relationshipValues = Object.values(state.relationships);
  const thresholds = balance.relationshipStageThresholds;
  for (const [characterId, value] of Object.entries(state.relationships)) {
    let stage = 0;
    thresholds.forEach((threshold, index) => { if (value >= threshold) stage = index; });
    relationshipStages[characterId] = stage;
  }

  const worldSnapshots = state.worldHistory ?? [];
  const locationDevelopment = state.locationDevelopment ?? {};

  return {
    strategy: spec.id,
    label: spec.label,
    seed,
    scenario: Boolean(spec.scenario),
    day: state.time.day,
    completed: state.time.day > days,
    ...(aborted ? { aborted } : {}),
    cash: round(state.cash),
    netWorth: round(calculateNetWorth(state, content, balance)),
    netWorthSeries,
    cashSeries,
    liquidCashMin,
    liquidCashMinDay,
    worthlessDays,
    errors,
    blocked,
    errorSamples,
    messageTitles,
    finance: {
      totalIncome,
      totalConsumption,
      totalAllocation,
      totalLiquidation,
      incomeByCategory,
      consumptionByCategory,
      allocationByCategory,
      liquidationByCategory,
      rentShare: share('housing'),
      transportShare: share('transport'),
      lifestyleShare: share('living') + share('food') + share('entertainment'),
      months,
      monthsWithoutIncome,
    },
    career: {
      // 第一份工作：取所有已知雇佣段的**最早**开始日，而不是"当前这份工作"的
      // 开始日（换过工作之后当前值会变成换工作那天，指标会骗人）。
      firstEmploymentDay: (() => {
        const starts = (state.employmentHistory ?? [])
          .map((entry) => entry.startedDay)
          .filter((day): day is number => Number.isInteger(day));
        if (Number.isInteger(state.employment?.startedDay)) starts.push(state.employment!.startedDay!);
        if (!starts.length) return state.currentJobId ? state.time.day : null;
        return Math.min(...starts);
      })(),
      applications: Math.max(0, (state.nextApplicationSequence ?? 0) - 1),
      offers: messageTitles['收到新的 Offer'] ?? 0,
      rejections: messageTitles['申请未通过'] ?? 0,
      jobChanges: (state.employmentHistory ?? []).length,
      finalMonthlySalary: monthlySalaryOf(state),
      salaryByMonth,
      careerExperience: { ...(state.careerExperience ?? {}) } as Record<string, number>,
      qualifications: state.qualifications?.length ?? 0,
      negotiations,
      negotiationStage: state.employment?.negotiationStage ?? 0,
      salaryAdjustment: state.employment?.salaryAdjustment ?? 0,
      resignations,
      unemploymentDays: unemployedDays(state),
      endJobId: state.currentJobId ?? null,
      endJobName: content.jobs.find((job) => job.id === state.currentJobId)?.name ?? null,
    },
    life: {
      activities: activityRecords.length,
      distinctActivities: activityDefinitions.size,
      travel: activityRecords.filter((entry) => travelIds.has(entry.sourceId ?? '')).length,
      courses: activityRecords.filter((entry) => courseIds.has(entry.sourceId ?? '')).length,
      purchases: purchaseRecords.length,
      itemSpend: purchaseRecords.reduce((sum, entry) => sum + Math.abs(entry.amount ?? 0), 0),
      housingChanges: housingRecords.length,
      vehicleAcquisitions: Object.values(state.assets).filter((holding) => content.assets.find((asset) => asset.id === holding.assetId)?.kind === 'vehicle').length,
    },
    social: {
      interactions: lifeHistory.filter((entry) => entry.category === 'relationship').length,
      activeContacts: relationshipValues.filter((value) => value > 0).length,
      relationshipTotal: round(relationshipValues.reduce((sum, value) => sum + value, 0)),
      relationshipStages,
      gifts: giftRecords.length,
      companions: Object.values(state.relationships).filter((value) => value >= 25).length,
      messages,
    },
    world: {
      majorEvents: (state.completedEvents ?? []).length,
      ambientEvents: (state.ambientLog ?? []).length,
      storylineAdvance: Object.keys(state.storylineStages ?? {}).length + Object.keys(state.chainStages ?? {}).length,
      companyStateChanges,
      npcCareerChanges,
      locationDevelopmentTotal: Object.values(locationDevelopment).reduce((sum, value) => sum + value, 0),
      locationsTouched: Object.values(locationDevelopment).filter((value) => value > 0).length,
      worldHistoryYears: worldSnapshots.length,
    },
    wealth: (() => {
      const holdings = Object.values(state.investments ?? {});
      const invested = holdings.reduce((sum, holding) => sum + holding.averageCost * holding.units, 0);
      const value = holdings.reduce((sum, holding) => sum + holding.currentValuation, 0);
      const rentalHomes = Object.values(state.housingHoldings ?? {}).filter((holding) => holding.occupancy === 'rented');
      const rentalMonthlyIncome = rentalHomes.reduce((sum, holding) => {
        const home = content.housing.find((entry) => entry.id === holding.housingId);
        return sum + (home ? housingRentPerDay(state, home) * 28 * 0.88 : 0);
      }, 0);
      const ownHome = content.housing.find((entry) => entry.id === state.housing.housingId);
      const ownHousingValue = state.housing.mode === 'owned' && ownHome ? (housingPrice(state, ownHome) ?? 0) : 0;
      return {
        investmentHoldings: holdings.length,
        investmentInvested: round(invested),
        investmentValue: round(value),
        investmentUnrealized: round(value - invested),
        businessCount: Object.keys(state.businesses).length,
        businessValuation: Object.values(state.businesses).reduce((sum, holding) => sum + businessValuation(holding, balance), 0),
        rentalHoldings: Object.keys(state.housingHoldings ?? {}).length,
        rentalMonthlyIncome: round(rentalMonthlyIncome),
        ownHousingValue: round(ownHousingValue),
        mortgageRemaining: round(state.mortgage?.remainingPrincipal ?? 0),
        vehicleValue: Object.values(state.assets).reduce((sum, holding) => sum + holding.currentValuation, 0),
        assetCount: Object.keys(state.assets).length,
      };
    })(),
    decision: {
      forcedPauses,
      eventChoices,
      offers: offersSeen,
      rewards: rewardsSeen,
      monthlySummaries,
      planCycles,
      perMonthPauses: months.length ? Math.round((forcedPauses / months.length) * 10) / 10 : 0,
    },
  };
}

/* ------------------------------------------------------------------ 汇总 */

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

interface StrategySummary {
  strategy: StrategyId;
  label: string;
  scenario: boolean;
  runs: number;
  survivalRate: number;
  dayMedian: number;
  monthsMedian: number;
  cash: { median: number; min: number; max: number };
  netWorth: { median: number; min: number; max: number; year1: number; year3: number; year5: number };
  income: { median: number; byCategory: Record<string, number> };
  consumption: { median: number; byCategory: Record<string, number>; rentShare: number; transportShare: number; lifestyleShare: number };
  career: {
    firstEmploymentDayMedian: number;
    applicationsMedian: number;
    offersMedian: number;
    rejectionsMedian: number;
    salaryMedian: number;
    salaryGrowth: number;
    qualificationsMedian: number;
    jobChangesMedian: number;
    negotiationsMedian: number;
    negotiationStageMedian: number;
    salaryAdjustmentMedian: number;
    resignationsMedian: number;
    unemploymentDaysMedian: number;
  };
  life: { activitiesMedian: number; distinctMedian: number; travelMedian: number; coursesMedian: number; purchasesMedian: number };
  social: { interactionsMedian: number; activeContactsMedian: number; relationshipTotalMedian: number; giftsMedian: number; messagesMedian: number };
  world: { majorEventsMedian: number; locationDevelopmentMedian: number; npcCareerChangesMedian: number; companyStateChangesMedian: number; storylineMedian: number };
  wealth: {
    investmentHoldingsMedian: number;
    investmentValueMedian: number;
    investmentUnrealizedMedian: number;
    businessCountMedian: number;
    businessValuationMedian: number;
    rentalHoldingsMedian: number;
    ownHousingValueMedian: number;
    vehicleValueMedian: number;
  };
  decision: { pausesPerMonthMedian: number; errorsMedian: number; liquidCashMinMedian: number; worthlessDaysMedian: number; eventChoicesMedian: number };
  blockedTop: [string, number][];
  errors: number;
  aborted: number;
}

function summarize(spec: StrategySpec, runs: RunResult[]): StrategySummary {
  const values = <T>(fn: (run: RunResult) => T): T[] => runs.map(fn);
  const seriesAtYear = (year: number) => median(runs.map((run) => run.netWorthSeries[Math.min(run.netWorthSeries.length - 1, year * 52)] ?? 0));

  const aggregate = (selector: (run: RunResult) => Record<string, number>): Record<string, number> => {
    const totals: Record<string, number> = {};
    for (const run of runs) for (const [category, value] of Object.entries(selector(run))) totals[category] = (totals[category] ?? 0) + value / runs.length;
    return Object.fromEntries(Object.entries(totals).map(([category, value]) => [category, round(value)]));
  };

  const salarySeries: number[] = [];
  for (let index = 0; index < 24; index += 1) {
    const monthValues = values((run) => run.career.salaryByMonth[index] ?? 0).filter((value) => value > 0);
    salarySeries.push(median(monthValues));
  }
  const firstSalary = salarySeries.find((value) => value > 0) ?? 0;
  const lastSalary = [...salarySeries].reverse().find((value) => value > 0) ?? 0;

  const blockedTotals: Record<string, number> = {};
  for (const run of runs) for (const [key, value] of Object.entries(run.blocked)) blockedTotals[key] = (blockedTotals[key] ?? 0) + value;

  return {
    strategy: spec.id,
    label: spec.label,
    scenario: Boolean(spec.scenario),
    runs: runs.length,
    survivalRate: runs.filter((run) => run.completed).length / runs.length,
    dayMedian: median(values((run) => run.day)),
    monthsMedian: median(values((run) => run.finance.months.length)),
    cash: { median: median(values((run) => run.cash)), min: Math.min(...values((run) => run.cash)), max: Math.max(...values((run) => run.cash)) },
    netWorth: {
      median: median(values((run) => run.netWorth)),
      min: Math.min(...values((run) => run.netWorth)),
      max: Math.max(...values((run) => run.netWorth)),
      year1: seriesAtYear(1),
      year3: seriesAtYear(3),
      year5: seriesAtYear(5),
    },
    income: { median: median(values((run) => run.finance.totalIncome)), byCategory: aggregate((run) => run.finance.incomeByCategory) },
    consumption: {
      median: median(values((run) => run.finance.totalConsumption)),
      byCategory: aggregate((run) => run.finance.consumptionByCategory),
      rentShare: median(values((run) => run.finance.rentShare)),
      transportShare: median(values((run) => run.finance.transportShare)),
      lifestyleShare: median(values((run) => run.finance.lifestyleShare)),
    },
    career: {
      firstEmploymentDayMedian: median(values((run) => run.career.firstEmploymentDay ?? 0)),
      applicationsMedian: median(values((run) => run.career.applications)),
      offersMedian: median(values((run) => run.career.offers)),
      rejectionsMedian: median(values((run) => run.career.rejections)),
      salaryMedian: median(values((run) => run.career.finalMonthlySalary)),
      salaryGrowth: firstSalary > 0 ? round(((lastSalary - firstSalary) / firstSalary) * 100) / 100 : 0,
      qualificationsMedian: median(values((run) => run.career.qualifications)),
      jobChangesMedian: median(values((run) => run.career.jobChanges)),
      negotiationsMedian: median(values((run) => run.career.negotiations)),
      negotiationStageMedian: median(values((run) => run.career.negotiationStage)),
      salaryAdjustmentMedian: median(values((run) => run.career.salaryAdjustment)),
      resignationsMedian: median(values((run) => run.career.resignations)),
      unemploymentDaysMedian: median(values((run) => run.career.unemploymentDays)),
    },
    life: {
      activitiesMedian: median(values((run) => run.life.activities)),
      distinctMedian: median(values((run) => run.life.distinctActivities)),
      travelMedian: median(values((run) => run.life.travel)),
      coursesMedian: median(values((run) => run.life.courses)),
      purchasesMedian: median(values((run) => run.life.purchases)),
    },
    social: {
      interactionsMedian: median(values((run) => run.social.interactions)),
      activeContactsMedian: median(values((run) => run.social.activeContacts)),
      relationshipTotalMedian: median(values((run) => run.social.relationshipTotal)),
      giftsMedian: median(values((run) => run.social.gifts)),
      messagesMedian: median(values((run) => run.social.messages)),
    },
    world: {
      majorEventsMedian: median(values((run) => run.world.majorEvents)),
      locationDevelopmentMedian: median(values((run) => run.world.locationDevelopmentTotal)),
      npcCareerChangesMedian: median(values((run) => run.world.npcCareerChanges)),
      companyStateChangesMedian: median(values((run) => run.world.companyStateChanges)),
      storylineMedian: median(values((run) => run.world.storylineAdvance)),
    },
    decision: {
      pausesPerMonthMedian: median(values((run) => run.decision.perMonthPauses)),
      errorsMedian: median(values((run) => run.errors)),
      liquidCashMinMedian: median(values((run) => run.liquidCashMin)),
      worthlessDaysMedian: median(values((run) => run.worthlessDays)),
      eventChoicesMedian: median(values((run) => run.decision.eventChoices)),
    },
    wealth: {
      investmentHoldingsMedian: median(values((run) => run.wealth.investmentHoldings)),
      investmentValueMedian: median(values((run) => run.wealth.investmentValue)),
      investmentUnrealizedMedian: median(values((run) => run.wealth.investmentUnrealized)),
      businessCountMedian: median(values((run) => run.wealth.businessCount)),
      businessValuationMedian: median(values((run) => run.wealth.businessValuation)),
      rentalHoldingsMedian: median(values((run) => run.wealth.rentalHoldings)),
      ownHousingValueMedian: median(values((run) => run.wealth.ownHousingValue)),
      vehicleValueMedian: median(values((run) => run.wealth.vehicleValue)),
    },
    blockedTop: Object.entries(blockedTotals).sort((left, right) => right[1] - left[1]).slice(0, 4),
    errors: runs.reduce((sum, run) => sum + run.errors, 0),
    aborted: runs.filter((run) => run.aborted).length,
  };
}

/* ------------------------------------------------------------------ 输出 */

function money(value: number): string {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
}

/** 把某类收入占总收入的比例取出来；没有收入时返回 0。 */
function incomeShare(summary: StrategySummary, categories: readonly string[]): number {
  const total = summary.income.median;
  if (!total) return 0;
  const sum = categories.reduce((acc, category) => acc + (summary.income.byCategory[category] ?? 0), 0);
  return sum / total;
}

/**
 * 长期经济 Outlier 报告。
 *
 * 判据全部写成"可复算的算术 + 阈值"，不写主观评价：读的人可以拿同一份 JSON
 * 自己重算一遍，也可以对阈值提出异议。所有阈值都写在这里，便于调整。
 */
function outlierSection(summaries: StrategySummary[]): string[] {
  const thresholds = {
    /** 净资产 ≥ 这么多个"年收入"就算收入已经变成资产。 */
    wealthMultiple: 5,
    /** 净资产 ≤ 这么多个年收入就算没有积累。 */
    wealthStagnation: 0.5,
    /** 消费 / 收入 达到这个比例就算花光。 */
    burnOut: 0.95,
    /** 单一收入来源占比达到这个比例就算"被它支配"。 */
    dominance: 0.35,
    /** 年收入 ≥ 这么多倍"非探针路线年收入中位"就算收入爆炸。 */
    incomeExplosion: 3,
    /** 净资产 ≥ 这么多倍"非探针路线净资产中位"就算财富爆炸。 */
    wealthExplosionVsPeers: 10,
    /** 资本回收周期（天）达到这个长度以下就算"买价被日利润碾压"。 */
    businessPaybackDays: 90,
    /** 经营收入 / 企业估值 达到这个倍数就算回报与估值脱节（仅作参考，跨期累计会天然放大）。 */
    businessPaybackMultiple: 5,
  };
  /** 只有非探针路线参与"相对其他路线"的比较，探针是预设状态不是玩法结论。 */
  const real = summaries.filter((summary) => !summary.scenario);
  const medianIncome = median(real.map((summary) => summary.income.median));
  const medianNetWorth = median(real.map((summary) => summary.netWorth.year5));
  const annualIncome = (summary: StrategySummary) => {
    const years = Math.max(1, summary.dayMedian / DAYS_PER_YEAR);
    return summary.income.median / years;
  };

  const lines: string[] = ['## 长期经济 Outlier', ''];
  const found: string[] = [];
  for (const summary of summaries) {
    const income = summary.income.median;
    const annual = annualIncome(summary);
    const multiple = annual > 0 ? summary.netWorth.year5 / annual : 0;
    const burn = income > 0 ? summary.consumption.median / income : 0;
    const businessShare = incomeShare(summary, ['business_income']);
    const investmentShare = incomeShare(summary, ['investment_dividend', 'realized_gain', 'property_income']);
    const wageShare = incomeShare(summary, ['wage', 'bonus']);
    const label = `\`${summary.strategy}\`${summary.scenario ? '（探针）' : ''}`;

    if (income >= medianIncome * thresholds.incomeExplosion && medianIncome > 0) {
      found.push(`- **收入爆炸** ${label}：5 年总收入 ${money(income)} = 非探针路线中位（${money(medianIncome)}）的 ${(income / medianIncome).toFixed(1)} 倍；年化 ${money(annual)}。`);
    }
    if (summary.netWorth.year5 >= medianNetWorth * thresholds.wealthExplosionVsPeers && medianNetWorth > 0) {
      found.push(`- **财富爆炸** ${label}：5 年净资产 ${money(summary.netWorth.year5)} = 非探针路线中位（${money(medianNetWorth)}）的 ${(summary.netWorth.year5 / medianNetWorth).toFixed(1)} 倍。`);
    }
    if (multiple >= thresholds.wealthMultiple) {
      found.push(`- **收入已变成资产** ${label}：净资产 ${money(summary.netWorth.year5)} = ${multiple.toFixed(1)} 倍年收入（${money(annual)}），积累效率高。`);
    }
    if (income > 0 && multiple > 0 && multiple <= thresholds.wealthStagnation && !summary.scenario) {
      found.push(`- **贫困陷阱 / 无积累** ${label}：净资产 ${money(summary.netWorth.year5)} = ${multiple.toFixed(2)} 倍年收入；最低现金 ${money(summary.decision.liquidCashMinMedian)}，零现金 ${summary.decision.worthlessDaysMedian} 天。`);
    }
    if (burn >= thresholds.burnOut && income > 0) {
      found.push(`- **无意义消费** ${label}：消费 ${money(summary.consumption.median)} / 收入 ${money(income)} = ${(burn * 100).toFixed(0)}%，5 年净资产仅 ${money(summary.netWorth.year5)}。`);
    }
    if (businessShare >= thresholds.dominance) {
      const valuation = summary.wealth.businessValuationMedian;
      const generated = summary.income.byCategory.business_income ?? 0;
      const ratio = valuation > 0 ? (generated / valuation).toFixed(1) : '∞';
      found.push(`- **Business 支配** ${label}：经营收入占 ${(businessShare * 100).toFixed(0)}%；企业估值 ${money(valuation)}，累计经营收入 ${money(generated)}（跨期累计 / 当期估值 = ${ratio}，仅作参考）。`);
    }
    if (investmentShare >= thresholds.dominance) {
      found.push(`- **投资支配** ${label}：投资类收入占 ${(investmentShare * 100).toFixed(0)}%（${Object.entries(summary.income.byCategory).filter(([category]) => ['investment_dividend', 'realized_gain', 'property_income'].includes(category)).map(([category, value]) => `${category} ${money(value)}`).join(' · ')}）。`);
    }
    if (wageShare >= 0.9 && multiple < 1 && income > 0) {
      found.push(`- **工资支配** ${label}：工资占收入 ${(wageShare * 100).toFixed(0)}%，净资产 ${money(summary.netWorth.year5)} 仍不足一年收入（${money(annual)}），缺少第二条积累路径。`);
    }
    if (summary.world.npcCareerChangesMedian === 0 && summary.world.companyStateChangesMedian === 0) {
      found.push(`- **世界静止** ${label}：${summary.dayMedian} 天内 NPC 职业变化 0、公司状态变化 0。`);
    }
  }
  if (!found.length) {
    lines.push('未命中任何阈值。');
  } else {
    lines.push(...found);
  }
  lines.push(
    '',
    `判据：收入爆炸 ≥ ${thresholds.incomeExplosion}× 非探针收入中位；财富爆炸 ≥ ${thresholds.wealthExplosionVsPeers}× 非探针净资产中位；无积累 ≤ ${thresholds.wealthStagnation}× 年收入；无意义消费 ≥ ${thresholds.burnOut * 100}% 收入；支配类 ≥ ${thresholds.dominance * 100}% 收入；经营收入 / 企业估值 ≥ ${thresholds.businessPaybackMultiple} 视为回报与估值脱节。`,
    `非探针参照：5 年总收入中位 ${money(medianIncome)} · 5 年净资产中位 ${money(medianNetWorth)}。`,
    '口径说明：`travel` 计数只统计活动类别为 `travel` 的活动；账本里的 `travel` 支出还包含 `activity.old-town-culture`（类别为 `culture`、财务类别为 `travel`），因此两者不必相等。',
    '口径说明：年收入 = 5 年总收入 ÷ 实际模拟年数（各策略都跑到 1828 天，因此可直接横向比较）。',
    '口径说明：「累计经营收入 / 当期企业估值」在同一行里比较了一年以上的流量与某一时点的存量，窗口越长倍数越高，因此只能作参考；企业是否被"数学上买错"要用下面的资本回收周期判断。',
  );
  lines.push('', '## 企业经济体检（默认经营参数）', '');
  lines.push('| 企业 | 买价 | 日营收 | 日成本 | 日净利 | 净利率 | 资本回收周期 | 判定 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const business of contentRegistry.businesses) {
    const holding = { businessId: business.id, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: business.price };
    const breakdown = calculateDailyBusinessProfit(holding, business);
    const cost = breakdown.goodsCost + breakdown.wage + breakdown.rent;
    const payback = breakdown.profit > 0 ? business.price / breakdown.profit : Number.POSITIVE_INFINITY;
    const verdict = !Number.isFinite(payback)
      ? '亏损'
      : payback <= thresholds.businessPaybackDays
        ? `⚠ 回本 ≤ ${thresholds.businessPaybackDays} 天`
        : '正常';
    lines.push(`| ${business.name} | ${money(business.price)} | ${money(breakdown.revenue)} | ${money(cost)} | ${money(breakdown.profit)} | ${breakdown.revenue > 0 ? ((breakdown.profit / breakdown.revenue) * 100).toFixed(0) : '0'}% | ${Number.isFinite(payback) ? `${payback.toFixed(0)} 天` : '不可回收'} | ${verdict} |`);
  }
  return lines;
}

function buildReport(options: { days: number; seeds: number[] }, summaries: StrategySummary[], results: RunResult[]): string {
  const lines = [
    '# 5 年 Balance Harness 报告',
    '',
    `- 模拟天数：${options.days} 天（约 ${(options.days / DAYS_PER_YEAR).toFixed(1)} 年）`,
    `- 固定 Seed：${options.seeds.join(', ')}（场景探针取前 2 个）`,
    `- 策略数：${summaries.length} · 总运行：${results.length}`,
    '',
    '## 总览',
    '',
    '| 策略 | Seed | 到达天数 | 存活 | 净资产(1y) | 净资产(3y) | 净资产(5y) | 月收入 | 月消费 | 最低现金 | 零现金天 | 暂停/28天 | 错误 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const summary of summaries) {
    lines.push(`| ${summary.label} | ${summary.runs} | ${summary.dayMedian} | ${Math.round(summary.survivalRate * 100)}% | ${money(summary.netWorth.year1)} | ${money(summary.netWorth.year3)} | ${money(summary.netWorth.year5)} | ${money(summary.income.median)} | ${money(summary.consumption.median)} | ${money(summary.decision.liquidCashMinMedian)} | ${summary.decision.worthlessDaysMedian} | ${summary.decision.pausesPerMonthMedian} | ${summary.errors} |`);
  }
  lines.push('', ...outlierSection(summaries), '', '## 明细', '');
  for (const summary of summaries) {
    const topIncome = Object.entries(summary.income.byCategory).sort((left, right) => right[1] - left[1]).slice(0, 7);
    const topConsumption = Object.entries(summary.consumption.byCategory).sort((left, right) => right[1] - left[1]).slice(0, 7);
    lines.push(
      `### ${summary.label} \`${summary.strategy}\`${summary.scenario ? '（探针）' : ''}`,
      '',
      `- 到达第 ${summary.dayMedian} 天 · 记录 ${summary.monthsMedian} 个月`,
      `- 净资产：1 年 ${money(summary.netWorth.year1)} → 3 年 ${money(summary.netWorth.year3)} → 5 年 ${money(summary.netWorth.year5)}（跨 Seed 区间 ${money(summary.netWorth.min)} – ${money(summary.netWorth.max)}）`,
      `- 总收入中位 ${money(summary.income.median)}：${topIncome.map(([category, value]) => `${category} ${money(value)}`).join(' · ') || '无'}`,
      `- 总消费中位 ${money(summary.consumption.median)}：${topConsumption.map(([category, value]) => `${category} ${money(value)}`).join(' · ') || '无'}`,
      `- 消费结构：租金 ${(summary.consumption.rentShare * 100).toFixed(1)}% · 交通 ${(summary.consumption.transportShare * 100).toFixed(1)}% · 生活方式 ${(summary.consumption.lifestyleShare * 100).toFixed(1)}%`,
      `- 资产：投资 ${summary.wealth.investmentHoldingsMedian} 项 / 市值 ${money(summary.wealth.investmentValueMedian)}（未实现 ${money(summary.wealth.investmentUnrealizedMedian)}）· 企业 ${summary.wealth.businessCountMedian} 家 / 估值 ${money(summary.wealth.businessValuationMedian)} · 投资房 ${summary.wealth.rentalHoldingsMedian} 套 · 自住房 ${money(summary.wealth.ownHousingValueMedian)} · 车辆 ${money(summary.wealth.vehicleValueMedian)}`,
      `- 职业：首份工作第 ${summary.career.firstEmploymentDayMedian} 天 · 申请 ${summary.career.applicationsMedian} · Offer ${summary.career.offersMedian} · 拒信 ${summary.career.rejectionsMedian} · 换工作 ${summary.career.jobChangesMedian} · 离职 ${summary.career.resignationsMedian} · 谈薪 ${summary.career.negotiationsMedian}（阶段 ${summary.career.negotiationStageMedian} / 调薪 ${money(summary.career.salaryAdjustmentMedian)}）· 失业 ${summary.career.unemploymentDaysMedian} 天 · 月薪中位 ${money(summary.career.salaryMedian)} · 薪资涨幅 ${(summary.career.salaryGrowth * 100).toFixed(0)}% · 资格 ${summary.career.qualificationsMedian}`,
      `- 生活：活动 ${summary.life.activitiesMedian} 次（${summary.life.distinctMedian} 种）· 旅行 ${summary.life.travelMedian} · 课程 ${summary.life.coursesMedian} · 购物 ${summary.life.purchasesMedian}`,
      `- 社交：互动 ${summary.social.interactionsMedian} · 活跃联系人 ${summary.social.activeContactsMedian} · 关系总和 ${summary.social.relationshipTotalMedian} · 礼物 ${summary.social.giftsMedian} · 消息 ${summary.social.messagesMedian}`,
      `- 世界：已完成事件 ${summary.world.majorEventsMedian} · 地点发展 ${summary.world.locationDevelopmentMedian} · NPC 职业变化 ${summary.world.npcCareerChangesMedian} · 公司状态 ${summary.world.companyStateChangesMedian} · 剧情推进 ${summary.world.storylineMedian}`,
      `- 决策：每 28 天强制暂停 ${summary.decision.pausesPerMonthMedian} 次 · 事件选择 ${summary.decision.eventChoicesMedian} 次 · 最低现金 ${money(summary.decision.liquidCashMinMedian)} · 零现金天数 ${summary.decision.worthlessDaysMedian}`,
      `- 主要阻塞：${summary.blockedTop.map(([key, value]) => `${key} ×${value}`).join('；') || '无'}`,
      `- 错误 ${summary.errors} · 中断 ${summary.aborted}`,
      '',
    );
  }
  return lines.join('\n');
}

/* --------------------------------------------------------------------- CLI */

interface Options {
  days: number;
  seeds: number[];
  strategies: StrategyId[];
  json?: string;
  report?: string;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    days: DEFAULT_DAYS,
    seeds: DEFAULT_SEEDS,
    strategies: STRATEGIES.map((spec) => spec.id),
    quiet: false,
  };
  for (const argument of argv) {
    if (argument.startsWith('--days=')) options.days = Number(argument.slice('--days='.length));
    else if (argument.startsWith('--seeds=')) options.seeds = argument.slice('--seeds='.length).split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
    else if (argument.startsWith('--strategies=')) options.strategies = argument.slice('--strategies='.length).split(',').map((value) => value.trim()).filter(Boolean) as StrategyId[];
    else if (argument.startsWith('--json=')) options.json = argument.slice('--json='.length);
    else if (argument.startsWith('--report=')) options.report = argument.slice('--report='.length);
    else if (argument === '--quiet') options.quiet = true;
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const results: RunResult[] = [];
  const summaries: StrategySummary[] = [];
  for (const spec of STRATEGIES) {
    if (!options.strategies.includes(spec.id)) continue;
    const seedCount = spec.scenario ? Math.min(2, options.seeds.length) : options.seeds.length;
    const specRuns: RunResult[] = [];
    for (let index = 0; index < seedCount; index += 1) {
      const run = runOne(spec, options.seeds[index], options.days);
      specRuns.push(run);
      results.push(run);
      if (run.aborted) console.error(`[中断] ${spec.id} seed=${options.seeds[index]}：${run.aborted}`);
    }
    const summary = summarize(spec, specRuns);
    summaries.push(summary);
    console.error(`[完成] ${spec.label} · ${specRuns.length} seed · 5 年净资产中位 ${summary.netWorth.median.toLocaleString('zh-CN')} · 错误 ${summary.errors}`);
  }

  const report = buildReport({ days: options.days, seeds: options.seeds }, summaries, results);

  if (options.json) {
    fs.mkdirSync(path.dirname(path.resolve(options.json)), { recursive: true });
    fs.writeFileSync(path.resolve(options.json), JSON.stringify({ options: { days: options.days, seeds: options.seeds }, summaries, runs: results }, null, 2));
    console.error(`[写入] ${options.json}`);
  }
  if (options.report) {
    fs.mkdirSync(path.dirname(path.resolve(options.report)), { recursive: true });
    fs.writeFileSync(options.report, report);
    console.error(`[写入] ${options.report}`);
  }
  if (!options.quiet) process.stdout.write(`${report}\n`);
}

if (process.argv[1] && /simulate\.[cm]?tsx?$/.test(process.argv[1])) main();

export { main, runOne, summarize, STRATEGIES, WEEKDAYS };
export type { RunResult, StrategySummary, StrategySpec, StrategyId };
