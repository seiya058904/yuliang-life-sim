import { amount, unknown } from '../engine/knownAmount';
import { factsFromHistory, retentionKey } from '../engine/businessFacts';
import { create } from 'zustand';
import type { BalanceConfig } from '../balance/config';
import type { ActivityDuration, ApplicationCooldownState, ContentRegistry, FinancialEntry, GameAction, GameEffect, GameState, JobApplicationState, JobSchedule, LifeRecordEntry, PlannedActivity, ViewId, WorldSnapshot } from '../content/contracts';
import { calendarForDay } from '../engine/calendar';
import { dispatchGameAction } from '../engine/actions';
import { createInitialState } from '../engine/initialState';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from '../engine/schedule';
import { reconcileStateWithEmployment, CANONICAL_DURATIONS } from '../engine/planning';
import { applicationCooldownKey, pruneExpiredState, recordApplicationCooldown } from '../engine/lifecycle';
import { dedupeModifiers } from '../engine/effects';
import { migrateAttributes, syncLegacyAbility } from '../engine/attributes';
import { emptyFinancialLedger } from '../engine/financialLedger';
import { employmentKind, generateVacancies } from '../engine/careers';
import { absoluteMinute } from '../engine/time';

export const SAVE_KEY = 'yuliang-save-v1';
export const SAVE_BACKUP_KEY = 'yuliang-save-v1-last-good';

export type SaveOutcome = { status: 'full' | 'compressed'; ok: true; error?: string } | { status: 'failed'; ok: false; error: string };
export interface RecoverySession { raw: string; reason: string; writeProtected: true; noticeVisible: boolean; kind: 'unreadable' | 'compatibility' }

export interface GameStore {
  game: GameState;
  effects: GameEffect[];
  activeView: ViewId;
  lastError?: string;
  /** Set when persistence failed; the in-memory state is still valid. */
  saveError?: string;
  /** Set when the stored save could not be read, with the raw payload kept. */
  loadProblem?: { reason: string; raw: string };
  recovery?: RecoverySession;
  showRecovery: () => void;
  acceptRecovery: () => void;
  dispatch: (action: GameAction) => boolean;
  /** Persists a throttled simulation-tick save right away (page hide, tests). */
  flushSave: () => void;
  consumeEffects: () => void;
  setView: (view: ViewId) => void;
  reset: (seed?: number) => void;
  dismissLoadProblem: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const wealthTierIds = new Set(['savings', 'stable', 'abundant', 'high_net_worth', 'entrepreneur', 'billionaire', 'super_wealth', 'world', 'global']);
const financialDirections = new Set(['income', 'expense', 'transfer']);
const financialGroups = new Set(['income', 'consumption', 'asset_allocation', 'asset_liquidation']);
const financialCategories = new Set(['wage', 'side_job', 'bonus', 'business_income', 'property_income', 'investment_dividend', 'event_income', 'other_income', 'housing', 'living', 'food', 'transport', 'communication', 'shopping', 'entertainment', 'social', 'education', 'travel', 'service', 'maintenance', 'business_cost', 'other_expense', 'investment_transfer', 'property_transfer', 'business_transfer', 'collectible_transfer', 'asset_liquidation', 'realized_gain', 'realized_loss', 'valuation_change']);

function knownIds(content: ContentRegistry, category: keyof Pick<ContentRegistry, 'jobs' | 'items' | 'housing' | 'businesses' | 'assets' | 'characters' | 'events' | 'eventChains' | 'milestones'>): Set<string> {
  return new Set(content[category].map((entry) => entry.id));
}

function isWeeklyPlan(value: unknown): value is GameState['weeklyPlan'] {
  if (!isRecord(value) || !isRecord(value.days)) return false;
  const days = value.days as Record<string, unknown>;
  return [1, 2, 3, 4, 5, 6, 7].every((weekday) => {
    const day = days[String(weekday)];
    return isRecord(day) && isRecord(day.day) && isRecord(day.evening)
      && ['study', 'side_job', 'free', 'course', 'activity'].includes(String(day.day.kind))
      && ['study', 'side_job', 'free', 'course', 'activity'].includes(String(day.evening.kind));
  });
}

function normalizePlannedActivity(value: unknown, content: ContentRegistry): PlannedActivity {
  if (!isRecord(value)) return { kind: 'free' };
  switch (value.kind) {
    case 'study':
    case 'side_job': {
      const duration = value.durationMinutes;
      if (!CANONICAL_DURATIONS.includes(Number(duration) as ActivityDuration)) return { kind: 'free' };
      if (value.kind === 'side_job') {
        const job = content.jobs.find((entry) => entry.id === value.jobId);
        if (!job || job.kind === 'regular') return { kind: 'free' };
        return { kind: 'side_job', jobId: job.id, durationMinutes: Number(duration) as ActivityDuration };
      }
      return { kind: 'study', durationMinutes: Number(duration) as ActivityDuration };
    }
    case 'course':
      return content.courses?.some((course) => course.id === value.courseId)
        ? { kind: 'course', courseId: String(value.courseId) }
        : { kind: 'free' };
    case 'activity': {
      const activity = content.activities?.find((entry) => entry.id === value.activityId);
      const option = activity?.options.find((entry) => entry.id === value.optionId);
      return activity && option
        ? { kind: 'activity', activityId: activity.id, optionId: option.id }
        : { kind: 'free' };
    }
    case 'free':
    default:
      return { kind: 'free' };
  }
}

function normalizeWeeklyPlan(value: unknown, content: ContentRegistry): GameState['weeklyPlan'] {
  if (!isWeeklyPlan(value)) return createDefaultWeeklyPlan();
  const days = {} as GameState['weeklyPlan']['days'];
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    const source = value.days[weekday];
    days[weekday] = {
      day: normalizePlannedActivity(source.day, content),
      evening: normalizePlannedActivity(source.evening, content),
    };
  }
  return { days, autoRepeat: Boolean(value.autoRepeat ?? true) };
}

function isLifeRecordEntry(value: unknown): value is LifeRecordEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.day)
    && ['career', 'purchase', 'service', 'activity', 'housing', 'relationship', 'event', 'business', 'asset', 'investment'].includes(String(value.category))
    && typeof value.title === 'string';
}

function isFinancialEntry(value: unknown): value is FinancialEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.day)
    && financialDirections.has(String(value.direction))
    && financialGroups.has(String(value.group))
    && financialCategories.has(String(value.category))
    && Number.isFinite(value.amount) && Number(value.amount) >= 0
    && Number.isFinite(value.cashDelta)
    && typeof value.label === 'string';
}

function migrateWorldPublicBusinessEquities(value: unknown, businessIds: Set<string>): WorldSnapshot['publicBusinessEquities'] {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter(([id, holding]) => {
    if (!businessIds.has(id) || !isRecord(holding)) return false;
    return holding.businessId === id
      && Number.isInteger(holding.percent) && Number(holding.percent) > 0 && Number(holding.percent) <= 100
      && Number.isFinite(holding.investedAmount) && Number(holding.investedAmount) >= 0
      && Number.isFinite(holding.currentValue) && Number(holding.currentValue) >= 0;
  }).map(([id, holding]) => {
    const entry = holding as Record<string, unknown>;
    return [id, { businessId: id, percent: Number(entry.percent), investedAmount: Number(entry.investedAmount), currentValue: Number(entry.currentValue) }];
  }));
}

/**
 * Persist the save. A quota or serialization failure must never break dispatch
 * and must never destroy the last good save, so the previous payload stays in
 * place and the failure is reported to the caller.
 */
export function saveGameState(state: GameState): SaveOutcome {
  let payload: string;
  try {
    payload = JSON.stringify(state);
  } catch (error) {
    return { status: 'failed', ok: false, error: `存档序列化失败：${describeError(error)}` };
  }
  try {
    localStorage.setItem(SAVE_KEY, payload);
    return { status: 'full', ok: true };
  } catch (error) {
    // Keep the last valid save: try a smaller history-trimmed write, and only
    // then give up with the original payload untouched.
    const trimmed = trimForStorage(state);
    if (trimmed) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(trimmed));
        return { status: 'compressed', ok: true, error: `存储空间不足，已压缩历史后保存：${describeError(error)}` };
      } catch {
        /* fall through to the reported failure */
      }
    }
    return { status: 'failed', ok: false, error: `保存失败，最后一次有效存档仍然保留：${describeError(error)}` };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function trimForStorage(state: GameState): GameState | undefined {
  const trimmed = structuredClone(state);
  const history = trimmed.lifeHistory ?? [];
  trimmed.businessFacts ??= factsFromHistory(history, trimmed.time.day);
  if (history.length <= 200 && (trimmed.messages?.length ?? 0) <= 10) return undefined;
  trimmed.lifeHistory = history.slice(-200);
  trimmed.messages = (trimmed.messages ?? []).slice(-10);
  return trimmed;
}

export interface LoadOutcome {
  state: GameState;
  problem?: { reason: string; raw: string };
  recovery?: RecoverySession;
}

/** Detect legacy projections only to warn, never to manufacture a start fact. */
function hasUntrustedLongActivity(raw: Record<string, unknown>, state: GameState, content: ContentRegistry): boolean {
  const now = absoluteMinute(state.time);
  const prior = raw.currentActivity as GameState['currentActivity'];
  if (prior?.kind === 'activity' && prior.start && prior.end && absoluteMinute(prior.start) <= now && now < absoluteMinute(prior.end) && absoluteMinute(prior.end) - absoluteMinute(prior.start) >= 2880) return true;
  for (const week of [state.calendar.week - 1, state.calendar.week]) {
    if (week < 1) continue;
    for (const [weekday, slots] of Object.entries(state.weeklyPlan.days)) {
      if (slots.day.kind !== 'activity') continue;
      const planned = slots.day;
      const option = content.activities?.find(a => a.id === planned.activityId)?.options.find(o => o.id === planned.optionId);
      if (!option || option.durationMinutes < 2880) continue;
      const start = absoluteMinute({ day: (week - 1) * 7 + Number(weekday), hour: 9, minute: 0 });
      if (start < now && now < start + option.durationMinutes) return true;
    }
  }
  return false;
}

/**
 * Read the save. A parse/migration failure keeps the raw payload and reports it
 * instead of silently pretending the player started a new game.
 */
export function loadGameStateWithReport(content: ContentRegistry, balance: BalanceConfig): LoadOutcome {
  let saved: string | null;
  try {
    saved = localStorage.getItem(SAVE_KEY);
  } catch (error) {
    console.error('[yuliang] 存档读取失败', error);
    return { state: createInitialState(content, balance), problem: { reason: '存档读取失败', raw: '' } };
  }
  if (!saved) return { state: createInitialState(content, balance) };
  let parsed: unknown;
  try {
    parsed = JSON.parse(saved);
  } catch (error) {
    // 玩家界面只给稳定的中文结论；原始解析器异常进控制台供调试。
    console.error('[yuliang] 存档 JSON 解析失败', error);
    return { state: createInitialState(content, balance), problem: { reason: '存档文件已损坏', raw: saved } };
  }
  try {
    const state = migrateGameState(parsed, content, balance);
    const reasons: string[] = [];
    if (state.pendingEventId && !content.events.some(event => event.id === state.pendingEventId)) reasons.push('待处理事件已下架，确认后跳过失效事件');
    if (isRecord(parsed) && Number(parsed.version) < 10) {
      if (hasUntrustedLongActivity(parsed, state, content)) reasons.push('旧版长活动缺少可靠开始记录，确认后跳过');
      if (state.employment?.pendingJobId && !(parsed.employment as GameState['employment'])?.pendingEffectiveDay) reasons.push('旧待换岗合同将在下一周周一生效');
    }
    return { state, recovery: reasons.length ? { raw: saved, reason: reasons.join('；'), writeProtected: true, noticeVisible: true, kind: 'compatibility' } : undefined };
  } catch (error) {
    console.error('[yuliang] 存档迁移失败', error);
    return { state: createInitialState(content, balance), problem: { reason: '存档内容无法识别', raw: saved } };
  }
}

export function migrateGameState(raw: unknown, content: ContentRegistry, balance: BalanceConfig): GameState {
  const initial = createInitialState(content, balance, 1);
  if (!isRecord(raw)) throw new Error('存档必须是游戏状态对象');
  const candidate = structuredClone({ ...initial, ...raw }) as GameState;
  const rawTime = isRecord(raw.time) ? raw.time : {};
  candidate.time = {
    day: Number.isInteger(rawTime.day) && Number(rawTime.day) > 0 ? Number(rawTime.day) : initial.time.day,
    hour: Number.isInteger(rawTime.hour) && Number(rawTime.hour) >= 0 && Number(rawTime.hour) <= 23 ? Number(rawTime.hour) : initial.time.hour,
    minute: Number.isInteger(rawTime.minute) && Number(rawTime.minute) >= 0 && Number(rawTime.minute) <= 59 ? Number(rawTime.minute) : 0,
  };
  candidate.version = balance.saveVersion;
  candidate.contentVersion = balance.contentVersion;
  candidate.calendar = calendarForDay(candidate.time.day);
  candidate.weeklyPlan = normalizeWeeklyPlan(candidate.weeklyPlan, content);
  candidate.previousWeeklyPlan = isWeeklyPlan(candidate.previousWeeklyPlan)
    ? normalizeWeeklyPlan(candidate.previousWeeklyPlan, content)
    : structuredClone(candidate.weeklyPlan);
  candidate.autoRepeatPlan = Boolean(candidate.autoRepeatPlan ?? candidate.weeklyPlan.autoRepeat);
  candidate.simulationSpeed = candidate.simulationSpeed === 2 || candidate.simulationSpeed === 4 ? candidate.simulationSpeed : 1;
  if (candidate.pendingReward && (!isRecord(candidate.pendingReward) || typeof candidate.pendingReward.eventId !== 'string' || !Array.isArray(candidate.pendingReward.lines) || candidate.pendingReward.lines.some(line => typeof line !== 'string'))) throw new Error('待确认奖励记录无效');
  candidate.simulationMode = candidate.pendingEventId ? 'event' : candidate.pendingReward ? 'reward' : candidate.pendingMonthlySummary ? 'monthly_summary' : candidate.simulationMode === 'planning' ? 'planning' : 'paused';

  const itemIds = knownIds(content, 'items');
  for (const itemId of Object.keys(candidate.inventory ?? {})) {
    if (itemIds.has(itemId)) continue;
    const quantity = Math.max(0, candidate.inventory[itemId] ?? 0);
    const purchasePrice = candidate.itemPurchasePrices?.[itemId] ?? 0;
    candidate.cash += Math.round(quantity * purchasePrice * balance.saleRatioFallback);
    delete candidate.inventory[itemId];
    delete candidate.itemPurchasePrices[itemId];
  }
  candidate.wishlist = [...new Set((candidate.wishlist ?? []).filter((id) => itemIds.has(id) && (candidate.inventory[id] ?? 0) === 0))];
  const housingIds = knownIds(content, 'housing');
  if (!housingIds.has(candidate.housing?.housingId)) candidate.housing = initial.housing;
  const rawMortgage = isRecord(candidate.mortgage) ? candidate.mortgage : undefined;
  candidate.mortgage = rawMortgage
    && candidate.housing.mode === 'owned'
    && rawMortgage.housingId === candidate.housing.housingId
    && housingIds.has(String(rawMortgage.housingId))
    && Number.isFinite(rawMortgage.remainingPrincipal) && Number(rawMortgage.remainingPrincipal) > 0
    && Number.isFinite(rawMortgage.monthlyPayment) && Number(rawMortgage.monthlyPayment) > 0
    && Number.isInteger(rawMortgage.totalMonths) && Number(rawMortgage.totalMonths) > 0
    && Number.isInteger(rawMortgage.paidMonths) && Number(rawMortgage.paidMonths) >= 0 && Number(rawMortgage.paidMonths) < Number(rawMortgage.totalMonths)
    ? { housingId: String(rawMortgage.housingId), remainingPrincipal: Number(rawMortgage.remainingPrincipal), monthlyPayment: Number(rawMortgage.monthlyPayment), totalMonths: Number(rawMortgage.totalMonths), paidMonths: Number(rawMortgage.paidMonths) }
    : undefined;
  candidate.housingHoldings = Object.fromEntries(Object.entries(candidate.housingHoldings ?? {}).filter(([id, holding]) => {
    const value = isRecord(holding) ? holding : {};
    return housingIds.has(id) && id !== candidate.housing.housingId && isRecord(value)
      && value.housingId === id && Number.isFinite(value.purchasePrice) && Number(value.purchasePrice) > 0
      && Number.isFinite(value.currentValuation) && Number(value.currentValuation) >= 0
      && (value.occupancy === 'vacant' || value.occupancy === 'rented');
  }).map(([id, holding]) => {
    const value = holding as unknown as Record<string, unknown>;
    return [id, { housingId: id, purchasePrice: Number(value.purchasePrice), currentValuation: Number(value.currentValuation), occupancy: value.occupancy as 'vacant' | 'rented' }];
  }));
  const jobIds = knownIds(content, 'jobs');
  if (candidate.currentJobId && !jobIds.has(candidate.currentJobId)) candidate.currentJobId = initial.currentJobId;
  candidate.unlockedJobIds = (candidate.unlockedJobIds ?? []).filter((id) => jobIds.has(id));
  candidate.unlockedHousingIds = (candidate.unlockedHousingIds ?? []).filter((id) => housingIds.has(id));
  candidate.unlockedBusinessIds = (candidate.unlockedBusinessIds ?? []).filter((id) => knownIds(content, 'businesses').has(id));
  candidate.unlockedAssetIds = [...new Set([
    ...(candidate.unlockedAssetIds ?? []).filter((id) => knownIds(content, 'assets').has(id)),
    ...content.assets.filter((asset) => asset.kind === 'vehicle').map((asset) => asset.id),
  ])];
  candidate.completedEvents = (candidate.completedEvents ?? []).filter((id) => knownIds(content, 'events').has(id));
  candidate.completedMilestones = (candidate.completedMilestones ?? []).filter((id) => knownIds(content, 'milestones').has(id));
  candidate.businesses = Object.fromEntries(Object.entries(candidate.businesses ?? {}).filter(([id]) => knownIds(content, 'businesses').has(id)).map(([id, holding]) => {
    const value: Record<string, unknown> = isRecord(holding) ? holding : {};
    const locationIdsForBusiness = new Set((content.locations ?? []).map((entry) => entry.id));
    const migratedEquity = Number.isFinite(value.equityPercent) ? Math.min(100, Math.max(0, Number(value.equityPercent))) : 100;
    const migratedPurchasePrice = Number.isFinite(value.purchasePrice) ? Math.max(0, Number(value.purchasePrice)) : 0;
    return [id, {
      businessId: id,
      priceLevel: Number.isInteger(value.priceLevel) ? Math.max(0, Number(value.priceLevel)) : 1,
      wageLevel: Number.isInteger(value.wageLevel) ? Math.max(0, Number(value.wageLevel)) : 1,
      inventoryLevel: Number.isInteger(value.inventoryLevel) ? Math.max(0, Number(value.inventoryLevel)) : 1,
      purchasePrice: migratedPurchasePrice,
      capitalInvested: Number.isFinite(value.capitalInvested) ? Math.max(0, Number(value.capitalInvested)) : 0,
      equityPercent: migratedEquity,
      publicFloatPercent: Number.isFinite(value.publicFloatPercent) ? Math.min(100, Math.max(0, Number(value.publicFloatPercent))) : Math.max(0, 100 - (Number.isFinite(value.equityPercent) ? Number(value.equityPercent) : 100)),
      fundingRaised: Number.isFinite(value.fundingRaised) ? Math.max(0, Number(value.fundingRaised)) : 0,
      fundingRound: Number.isInteger(value.fundingRound) ? Math.max(0, Number(value.fundingRound)) : 0,
      partnerCharacterId: typeof value.partnerCharacterId === 'string' && content.characters.some((character) => character.id === value.partnerCharacterId) ? value.partnerCharacterId : undefined,
      listed: value.listed === true,
      listedDay: Number.isInteger(value.listedDay) && Number(value.listedDay) > 0 ? Number(value.listedDay) : undefined,
      acquiredDay: Number.isInteger(value.acquiredDay) && Number(value.acquiredDay) > 0 ? Number(value.acquiredDay) : undefined,
      acquiredFromBusinessId: typeof value.acquiredFromBusinessId === 'string' && knownIds(content, 'businesses').has(value.acquiredFromBusinessId) ? value.acquiredFromBusinessId : undefined,
      playerCostBasis: Number(raw.version) >= 10 ? amount(value.playerCostBasis) : unknown('旧版企业成本可能遗漏注资或处置'),
      operatingBonusPercent: Number.isFinite(value.operatingBonusPercent) ? Math.min(25, Math.max(0, Number(value.operatingBonusPercent))) : undefined,
      relocatedLocationId: typeof value.relocatedLocationId === 'string' && locationIdsForBusiness.has(value.relocatedLocationId) ? value.relocatedLocationId : undefined,
    }];
  }));
  const businessIds = knownIds(content, 'businesses');
  candidate.publicBusinessEquities = Object.fromEntries(Object.entries(candidate.publicBusinessEquities ?? {}).filter(([id, holding]) => {
    const value: Record<string, unknown> = isRecord(holding) ? holding : {};
    return businessIds.has(id) && candidate.businesses[id]?.listed === true && value.businessId === id && Number.isInteger(value.percent) && Number(value.percent) > 0 && Number(value.percent) <= 100 && Number.isFinite(value.investedAmount) && Number(value.investedAmount) > 0 && Number.isInteger(value.purchaseDay) && Number(value.purchaseDay) > 0;
  }).map(([id, holding]) => {
    const value = holding as unknown as Record<string, unknown>;
    return [id, { businessId: id, percent: Number(value.percent), investedAmount: Number(value.investedAmount), purchaseDay: Number(value.purchaseDay) }];
  }));
  const businessProjectIds = new Set((content.activities ?? []).flatMap((activity) => activity.options.filter((option) => option.businessProject).map((option) => `${activity.id}.${option.id}`)));
  candidate.completedBusinessProjects = [...new Set((candidate.completedBusinessProjects ?? []).filter((id) => businessProjectIds.has(id)))];
  candidate.assets = Object.fromEntries(Object.entries(candidate.assets ?? {}).filter(([id]) => knownIds(content, 'assets').has(id)));
  const locationIds = new Set((content.locations ?? []).map((entry) => entry.id));
  candidate.locationVisits = Object.fromEntries(Object.entries(candidate.locationVisits ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) > 0).map(([id, value]) => [id, Number(value)]));
  candidate.locationDevelopment = Object.fromEntries(Object.entries(candidate.locationDevelopment ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5).map(([id, value]) => [id, Number(value)]));
  candidate.interestFamiliarity = Object.fromEntries(Object.entries(candidate.interestFamiliarity ?? {}).filter(([id, value]) => typeof id === 'string' && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3).map(([id, value]) => [id, Number(value)]));
  const investmentIds = new Set((content.investments ?? []).map((entry) => entry.id));
  candidate.investments = Object.fromEntries(Object.entries(candidate.investments ?? {}).filter(([id]) => investmentIds.has(id)));
  const subscriptionIds = new Set((content.subscriptions ?? []).map((entry) => entry.id));
  candidate.activeSubscriptions = Object.fromEntries(Object.entries(candidate.activeSubscriptions ?? {}).filter(([id, holding]) => subscriptionIds.has(id) && isRecord(holding) && holding.subscriptionId === id && Number.isInteger(holding.startedDay) && holding.startedDay > 0).map(([id, holding]) => [id, { subscriptionId: id, startedDay: Number((holding as Record<string, unknown>).startedDay) }]));
  candidate.jobExperience = candidate.jobExperience ?? {};
  candidate.courseProgress = Object.fromEntries(Object.entries(candidate.courseProgress ?? {}).filter(([id, value]) => (content.courses ?? []).some((course) => course.id === id) && Number.isInteger(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  candidate.careerExperience = Object.fromEntries(Object.entries(candidate.careerExperience ?? {}).filter(([id, value]) => ['office', 'operations', 'customer_service', 'retail', 'logistics', 'data', 'project', 'management', 'media', 'finance'].includes(id) && Number.isFinite(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  const legacyQualificationIds = ['office_basics', 'operations_foundation', 'client_service_experience', 'retail_operations_experience', 'logistics_experience', 'data_analysis_foundation', 'project_coordination', 'people_management_basics', 'media_production_experience', 'investment_basics'];
  const knownQualificationIds = new Set([
    ...legacyQualificationIds,
    ...(content.courses ?? []).flatMap((course) => course.qualificationId ? [course.qualificationId] : []),
    ...content.jobs.flatMap((job) => job.qualificationRequired ?? []),
  ]);
  candidate.qualifications = [...new Set((candidate.qualifications ?? []).filter((id) => typeof id === 'string' && knownQualificationIds.has(id)))];
  candidate.relationships = candidate.relationships ?? {};
  const characterIds = new Set(content.characters.map((entry) => entry.id));
  // --- message lifecycle (v9) ---------------------------------------------
  // Keep the most recent window only, and derive a durable id sequence so the
  // queue cap can never produce a duplicate id.
  const storedMessages = Array.isArray(candidate.messages) ? candidate.messages : [];
  const rawMessages: NonNullable<GameState['messages']> = storedMessages
    .filter((entry) => isRecord(entry) && Number.isInteger(entry.day) && typeof entry.title === 'string' && typeof entry.body === 'string' && typeof entry.read === 'boolean' && (entry.characterId === undefined || characterIds.has(entry.characterId as string)))
    .slice(-30);
  const usedMessageIds = new Set<string>();
  let fallbackMessageSequence = 0;
  candidate.messages = rawMessages.map((message) => {
    let id = typeof message.id === 'string' && /^message\.\d+\.\d+$/.test(message.id) ? message.id : '';
    while (!id || usedMessageIds.has(id)) id = `message.${message.day}.${++fallbackMessageSequence}`;
    usedMessageIds.add(id);
    return { ...message, id, dismissed: message.dismissed === true };
  });
  const highestMessageSequence = candidate.messages.reduce((highest, message) => {
    const parsed = Number(/(\d+)$/.exec(message.id)?.[1] ?? 0);
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);
  candidate.nextMessageSequence = Math.max(
    Number.isInteger(candidate.nextMessageSequence) ? Number(candidate.nextMessageSequence) : 0,
    highestMessageSequence,
    candidate.messages.length,
  );
  // Reading a message is inbox state, not an event. Legacy saves recorded a
  // `查看消息：` row that never corresponded to a life event, so drop it here.
  candidate.attributes = migrateAttributes(candidate.attributes, candidate.ability, candidate.lifestyle, candidate.relationships);
  syncLegacyAbility(candidate);
  candidate.eventCooldowns = candidate.eventCooldowns ?? {};
  candidate.chainStages = candidate.chainStages ?? {};
  candidate.flags = candidate.flags ?? {};
  candidate.modifiers = candidate.modifiers ?? [];
  candidate.discounts = candidate.discounts ?? [];
  candidate.rng = candidate.rng ?? initial.rng;
  candidate.marketJobIds = candidate.marketJobIds?.filter((id) => jobIds.has(id)) ?? initial.marketJobIds;
  if (!candidate.currentJobId) {
    candidate.currentJobId = undefined;
    candidate.employment = undefined;
  }
  candidate.lastSettledDay = Number.isInteger(candidate.lastSettledDay) ? candidate.lastSettledDay : initial.lastSettledDay;
  candidate.eventDay = Number.isInteger(candidate.eventDay) ? candidate.eventDay : candidate.time.day;
  candidate.eventsToday = Number.isInteger(candidate.eventsToday) ? candidate.eventsToday : 0;
  candidate.rentReliefAvailableDay = candidate.rentReliefAvailableDay ?? 0;
  candidate.housingReliefUntilDay = candidate.housingReliefUntilDay ?? 0;
  candidate.monthlyLedger = candidate.monthlyLedger ?? initial.monthlyLedger;
  candidate.monthlyLedger.netWorthStart = amount(candidate.monthlyLedger.netWorthStart);
  candidate.monthlyLedger.netWorthEnd = amount(candidate.monthlyLedger.netWorthEnd);
  candidate.financialLedger = isRecord(raw.financialLedger) && candidate.financialLedger && Array.isArray(candidate.financialLedger.entries)
    ? {
      month: candidate.calendar.month,
      nextSequence: Math.max(1, Number(candidate.financialLedger.nextSequence) || candidate.financialLedger.entries.length + 1),
      entriesComplete: candidate.financialLedger.entriesComplete !== false && candidate.financialLedger.entries.every(isFinancialEntry),
      entries: candidate.financialLedger.entries.filter(isFinancialEntry),
      cashStart: amount(candidate.financialLedger.cashStart),
      netWorthStart: amount(candidate.financialLedger.netWorthStart),
    }
    : { ...emptyFinancialLedger(candidate.calendar.month, unknown(), amount(candidate.monthlyLedger.netWorthStart)), entriesComplete: false };
  candidate.financialHistory = Array.isArray(candidate.financialHistory) ? candidate.financialHistory.slice(-12) : [];
  candidate.annualHistory = Array.isArray(candidate.annualHistory) ? candidate.annualHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number.isInteger(entry.months)).slice(-10) as GameState['annualHistory'] : [];
  candidate.wealthMilestones = Array.isArray(candidate.wealthMilestones)
    ? candidate.wealthMilestones.filter((entry) => isRecord(entry) && typeof entry.id === 'string' && wealthTierIds.has(entry.id) && Number.isInteger(entry.day) && Number(entry.day) > 0 && Number.isFinite(entry.netWorth)).map((entry) => ({ id: String(entry.id), day: Number(entry.day), netWorth: Number(entry.netWorth) })).slice(-10)
    : [];
  candidate.worldHistory = Array.isArray(candidate.worldHistory) ? candidate.worldHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number(entry.year) > 0 && Number.isInteger(entry.day) && Number(entry.day) > 0 && Number.isFinite(entry.netWorth) && Number.isInteger(entry.businessCount) && Number(entry.businessCount) >= 0 && Number.isInteger(entry.relationshipCount) && Number(entry.relationshipCount) >= 0 && Number.isInteger(entry.visitedLocationCount) && Number(entry.visitedLocationCount) >= 0 && (entry.listedBusinessCount === undefined || (Number.isInteger(entry.listedBusinessCount) && Number(entry.listedBusinessCount) >= 0)) && (entry.publicFloatPercent === undefined || (Number.isFinite(entry.publicFloatPercent) && Number(entry.publicFloatPercent) >= 0)) && (entry.currentJobId === undefined || jobIds.has(String(entry.currentJobId)))).map((entry) => ({ ...entry, locationDevelopment: isRecord(entry.locationDevelopment) ? Object.fromEntries(Object.entries(entry.locationDevelopment).filter(([id, level]) => locationIds.has(id) && Number.isInteger(level) && Number(level) >= 0 && Number(level) <= 5)) : undefined, relationshipValues: isRecord(entry.relationshipValues) ? Object.fromEntries(Object.entries(entry.relationshipValues).filter(([id, value]) => characterIds.has(id) && Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 100).map(([id, value]) => [id, Math.round(Number(value))])) : undefined, characterCareerStates: isRecord(entry.characterCareerStates) ? Object.fromEntries(Object.entries(entry.characterCareerStates).filter(([id, title]) => characterIds.has(id) && typeof title === 'string' && title.trim().length > 0).map(([id, title]) => [id, String(title)])) : undefined, companyStates: isRecord(entry.companyStates) ? Object.fromEntries(Object.entries(entry.companyStates).filter(([id, title]) => (content.companies ?? []).some((company) => company.id === id) && typeof title === 'string' && title.trim().length > 0).map(([id, title]) => [id, String(title)])) : undefined, listedBusinessCount: entry.listedBusinessCount === undefined ? undefined : Number(entry.listedBusinessCount), publicFloatPercent: entry.publicFloatPercent === undefined ? undefined : Number(entry.publicFloatPercent), publicBusinessEquities: migrateWorldPublicBusinessEquities(entry.publicBusinessEquities, businessIds) })).slice(-10) as GameState['worldHistory'] : [];
  candidate.lifeHistory = (Array.isArray(candidate.lifeHistory) ? candidate.lifeHistory : [])
    .filter(isLifeRecordEntry)
    .filter((entry) => !entry.title.startsWith('查看消息：'));
  candidate.nextLifeRecordSequence = Math.max(Number.isInteger(raw.nextLifeRecordSequence) ? Number(raw.nextLifeRecordSequence) : 0, candidate.lifeHistory.length, ...candidate.lifeHistory.map(entry => Number(/(\d+)$/.exec(entry.id)?.[1] ?? 0)));
  candidate.businessFacts = Number(raw.version) >= 10 && isRecord(raw.businessFacts)
    ? structuredClone(raw.businessFacts) as unknown as GameState['businessFacts']
    : factsFromHistory(candidate.lifeHistory, candidate.time.day);
  if (!candidate.businessFacts || !isRecord(candidate.businessFacts.lastCompleted) || !isRecord(candidate.businessFacts.interactions) || !isRecord(candidate.businessFacts.retentionClaims)) throw new Error('业务事实格式无效');
  const validDay = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= candidate.time.day;
  if (Object.values(candidate.businessFacts.lastCompleted).some(value => !validDay(value))
    || Object.values(candidate.businessFacts.retentionClaims).some(value => typeof value !== 'boolean')
    || Object.values(candidate.businessFacts.interactions).some(days => !isRecord(days) || Object.entries(days).some(([day, count]) => !validDay(Number(day)) || !Number.isInteger(count) || count < 0))) throw new Error('业务事实记录无效');
  const details = candidate.businessFacts.relationshipDetails;
  if (details !== undefined && (!isRecord(details) || Object.values(details).some(entries => !isRecord(entries) || Object.values(entries).some(days => !isRecord(days) || Object.entries(days).some(([day, count]) => !validDay(Number(day)) || !Number.isInteger(count) || Number(count) < 0))))) throw new Error('送礼事实记录无效');
  if (candidate.longActivity) {
    const instance = candidate.longActivity;
    const a = instance.activity;
    const minute = (t: GameState['time']) => (t.day - 1) * 1440 + t.hour * 60 + t.minute;
    const validTime = (t: GameState['time'] | undefined) => t && Number.isInteger(t.day) && t.day > 0 && Number.isInteger(t.hour) && t.hour >= 0 && t.hour < 24 && Number.isInteger(t.minute) && t.minute >= 0 && t.minute < 60;
    if (Number(raw.version) >= 10 && (!a || !validTime(a.start) || !validTime(a.end) || a.kind !== 'activity' || typeof instance.id !== 'string' || minute(a.start) > minute(candidate.time) || minute(a.end) <= minute(candidate.time) || minute(a.end) - minute(a.start) < 2880)) throw new Error('长活动开始记录无效');
  }
  if (Number(raw.version) < 10) {
    if (candidate.employment) candidate.businessFacts.retentionClaims[retentionKey(candidate.employment.jobId, candidate.employment.companyId)] = true;
    for (const past of candidate.employmentHistory ?? []) candidate.businessFacts.retentionClaims[retentionKey(past.jobId, past.companyId)] = true;
    candidate.longActivity = undefined;
  }
  if (candidate.employment?.pendingJobId && !Number.isInteger(candidate.employment.pendingEffectiveDay)) candidate.employment.pendingEffectiveDay = candidate.time.day + 8 - candidate.calendar.weekday;
  candidate.ambientLog = Array.isArray(candidate.ambientLog) ? candidate.ambientLog.slice(-20) : [];
  const storylines = new Map((content.storylines ?? []).map((storyline) => [storyline.id, new Set(storyline.stages.map((stage) => stage.id))]));
  candidate.storylineStages = Object.fromEntries(Object.entries(candidate.storylineStages ?? {}).filter(([id, stage]) => storylines.get(id)?.has(stage as string)));
  const legacyUnlockedJobs = [...candidate.unlockedJobIds];
  candidate.acquiredSideJobs = candidate.acquiredSideJobs ?? {};
  for (const jobId of legacyUnlockedJobs) {
    const job = content.jobs.find((entry) => entry.id === jobId);
    if (job && employmentKind(job) === 'repeatable_side_job') {
      candidate.acquiredSideJobs[jobId] ??= { jobId, acquiredDay: candidate.time.day };
    }
  }
  // --- application lifecycle (v9) -----------------------------------------
  // Re-application cooldowns move out of the application records so clearing
  // finished applications can never be used to apply again early. Legacy
  // `nextEligibleDay` values are migrated into the new map.
  const rawCooldowns = isRecord(candidate.applicationCooldowns) ? candidate.applicationCooldowns : {};
  const applicationCooldowns: Record<string, ApplicationCooldownState> = {};
  for (const [key, value] of Object.entries(rawCooldowns)) {
    if (!isRecord(value)) continue;
    const jobId = typeof value.jobId === 'string' ? value.jobId : key.split('@')[0];
    const companyId = typeof value.companyId === 'string' ? value.companyId : key.split('@')[1];
    if (!jobId || !companyId || !jobIds.has(jobId) || !Number.isInteger(value.nextEligibleDay)) continue;
    applicationCooldowns[applicationCooldownKey(jobId, companyId)] = { jobId, companyId, nextEligibleDay: Number(value.nextEligibleDay) };
  }
  candidate.applicationCooldowns = applicationCooldowns;
  const usedApplicationIds = new Set<string>();
  const pendingOfferRemap = new Map<string, string>();
  let fallbackApplicationSequence = 0;
  candidate.applications = Array.isArray(candidate.applications)
    ? candidate.applications
      .filter((entry) => isRecord(entry) && jobIds.has(String(entry.jobId)))
      .map((entry) => {
        const application = entry as JobApplicationState;
        const originalId = typeof application.applicationId === 'string' ? application.applicationId : '';
        let applicationId = typeof application.applicationId === 'string' && /^application\.\d+\.\d+$/.test(application.applicationId) ? application.applicationId : '';
        while (!applicationId || usedApplicationIds.has(applicationId)) applicationId = `application.${application.submittedDay ?? candidate.time.day}.${++fallbackApplicationSequence}`;
        usedApplicationIds.add(applicationId);
        // 待确认 Offer 通知引用的是旧 id；迁移重建 id 后必须重映射，否则重载后通知静默消失。
        if (originalId && originalId !== applicationId) pendingOfferRemap.set(originalId, applicationId);
        if (Number.isInteger(application.nextEligibleDay) && application.nextEligibleDay! > candidate.time.day) {
          recordApplicationCooldown(candidate, String(application.jobId), String(application.companyId), application.nextEligibleDay!);
        }
        return { ...application, applicationId };
      })
    : [];
  if (candidate.pendingOfferApplicationId && pendingOfferRemap.has(candidate.pendingOfferApplicationId)) {
    candidate.pendingOfferApplicationId = pendingOfferRemap.get(candidate.pendingOfferApplicationId);
  }
  // A consumed special opportunity is never re-offered, even after it expired.
  candidate.consumedOpportunityIds = Array.isArray(candidate.consumedOpportunityIds)
    ? [...new Set(candidate.consumedOpportunityIds.filter((id) => typeof id === 'string'))]
    : [];
  for (const application of candidate.applications) {
    if (application.opportunityId) candidate.consumedOpportunityIds.push(application.opportunityId);
  }
  candidate.consumedOpportunityIds = [...new Set(candidate.consumedOpportunityIds)];
  const highestApplicationSequence = candidate.applications.reduce((highest, application) => {
    const parsed = Number(/(\d+)$/.exec(application.applicationId)?.[1] ?? 0);
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);
  candidate.nextApplicationSequence = Math.max(
    Number.isInteger(candidate.nextApplicationSequence) ? Number(candidate.nextApplicationSequence) : 0,
    highestApplicationSequence,
    candidate.applications.length,
  );
  const companyIds = new Set((content.companies ?? []).map((entry) => entry.id));
  candidate.opportunities = Array.isArray(candidate.opportunities)
    ? candidate.opportunities.filter((entry) => isRecord(entry)
      && typeof entry.id === 'string'
      && jobIds.has(String(entry.jobId))
      && companyIds.has(String(entry.companyId))
      && ['referral', 'headhunter', 'internal', 'storyline'].includes(String(entry.route))
      && typeof entry.source === 'string'
      && Number.isInteger(entry.expiresDay)
      && Number(entry.expiresDay) >= candidate.time.day
      && Array.isArray(entry.salaryRange)
      && entry.salaryRange.length === 2
      && entry.salaryRange.every((value) => Number.isFinite(value))).slice(-20) as GameState['opportunities']
    : [];
  candidate.gigs = Array.isArray(candidate.gigs) ? candidate.gigs.filter((entry) => jobIds.has(entry.jobId) && entry.expiresDay >= candidate.time.day) : [];
  candidate.employmentHistory = Array.isArray(candidate.employmentHistory) ? candidate.employmentHistory.filter((entry) => jobIds.has(entry.jobId)) : [];
  candidate.monthlyHighlights = Array.isArray(candidate.monthlyHighlights) ? candidate.monthlyHighlights : [];
  candidate.vacancies = generateVacancies(candidate, content, balance);
  candidate.majorEventsThisMonth = Number.isInteger(candidate.majorEventsThisMonth) ? candidate.majorEventsThisMonth : 0;
  if (candidate.currentJobId) {
    const job = content.jobs.find((entry) => entry.id === candidate.currentJobId);
    if (job?.kind === 'regular') {
      const rawEmployment: Record<string, unknown> = isRecord(candidate.employment) ? candidate.employment : {};
      const rawSchedule = isRecord(rawEmployment.schedule) ? rawEmployment.schedule : undefined;
      const schedule = rawSchedule && Array.isArray(rawSchedule.workDays)
        && Number.isInteger(rawSchedule.startMinute) && Number.isInteger(rawSchedule.endMinute)
        ? rawSchedule as unknown as JobSchedule
        : defaultJobSchedule(job);
      candidate.employment = {
        jobId: job.id,
        startedDay: Number.isInteger(rawEmployment.startedDay) ? Number(rawEmployment.startedDay) : undefined,
        schedule,
        effectiveWeek: Number.isInteger(rawEmployment.effectiveWeek) ? Number(rawEmployment.effectiveWeek) : candidate.calendar.week,
        pendingJobId: typeof rawEmployment.pendingJobId === 'string' && jobIds.has(rawEmployment.pendingJobId) ? rawEmployment.pendingJobId : undefined,
        pendingEffectiveDay: Number.isInteger(rawEmployment.pendingEffectiveDay) ? Number(rawEmployment.pendingEffectiveDay) : rawEmployment.pendingJobId ? candidate.time.day + 8 - candidate.calendar.weekday : undefined,
        pendingCompanyId: typeof rawEmployment.pendingCompanyId === 'string' ? rawEmployment.pendingCompanyId : undefined,
        pendingBasePay: Number.isFinite(rawEmployment.pendingBasePay) ? Number(rawEmployment.pendingBasePay) : undefined,
        companyId: typeof rawEmployment.companyId === 'string' ? rawEmployment.companyId : undefined,
        basePay: Number.isFinite(rawEmployment.basePay) ? Number(rawEmployment.basePay) : job.basePay,
        salaryAdjustment: Number.isFinite(rawEmployment.salaryAdjustment) ? Number(rawEmployment.salaryAdjustment) : 0,
        negotiationStage: rawEmployment.negotiationStage === 1 || rawEmployment.negotiationStage === 2 ? rawEmployment.negotiationStage : 0,
        lastNegotiationDay: Number.isInteger(rawEmployment.lastNegotiationDay) ? Number(rawEmployment.lastNegotiationDay) : undefined,
      };
    } else {
      candidate.employment = undefined;
    }
  }
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  candidate.modifiers = dedupeModifiers(candidate.modifiers);
  pruneExpiredState(candidate);
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  for (const holding of Object.values(candidate.businesses)) holding.playerCostBasis = Number(raw.version) >= 10 ? amount(holding.playerCostBasis) : unknown('旧版企业成本可能遗漏注资或处置');
  for (const summary of [...(candidate.financialHistory ?? []), ...(candidate.annualHistory ?? []), ...(candidate.lastFinancialSummary ? [candidate.lastFinancialSummary] : []), ...(candidate.pendingMonthlySummary?.financial ? [candidate.pendingMonthlySummary.financial] : [])]) {
    for (const field of ['cashStart', 'cashEnd', 'cashChange', 'netWorthStart', 'netWorthEnd', 'netWorthChange', 'totalIncome', 'totalConsumption'] as const) {
      if (field in summary) Object.assign(summary, { [field]: amount((summary as unknown as Record<string, unknown>)[field]) });
    }
  }
  // Legacy saves can already contain hidden workday conflicts, stacked
  // modifiers and expired transient entries; repair them rather than resetting
  // the player's progress.
  reconcileStateWithEmployment(candidate);
  candidate.modifiers = dedupeModifiers(candidate.modifiers);
  pruneExpiredState(candidate);
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  return candidate;
}

export function loadGameState(content: ContentRegistry, balance: BalanceConfig): GameState {
  return loadGameStateWithReport(content, balance).state;
}

export function createGameStore(content: ContentRegistry, balance: BalanceConfig, seed?: number) {
  const loaded = seed === undefined ? loadGameStateWithReport(content, balance) : { state: createInitialState(content, balance, seed) };
  const recovery: RecoverySession | undefined = loaded.recovery ?? (loaded.problem ? { ...loaded.problem, writeProtected: true, noticeVisible: true, kind: 'unreadable' } : undefined);
  // Running-week ticks arrive once per animation frame; serializing and writing
  // the full save on each one starves the frame budget. Ticks mark the store
  // dirty and a trailing timer persists them; every other action saves at once.
  const AUTOSAVE_THROTTLE_MS = 2000;
  let pendingSaveTimer: ReturnType<typeof setTimeout> | undefined;
  return create<GameStore>((set, get) => {
    const flushSave = () => {
      if (pendingSaveTimer === undefined) return;
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = undefined;
      const outcome = saveGameState(get().game);
      if (outcome.error) set({ saveError: outcome.error });
    };
    return {
    game: loaded.state, effects: [], activeView: 'life', recovery,
    loadProblem: loaded.problem,
    dispatch: (action): boolean => {
      const result = dispatchGameAction(get().game, action, content, balance);
      if (result.error) { set({ lastError: result.error, effects: [] }); return false; }
      let outcome: { error?: string } | undefined;
      if (!get().recovery?.writeProtected) {
        if (action.type === 'advance_simulation' && result.state.simulationMode === 'running') {
          if (pendingSaveTimer === undefined) pendingSaveTimer = setTimeout(flushSave, AUTOSAVE_THROTTLE_MS);
        } else {
          if (pendingSaveTimer !== undefined) { clearTimeout(pendingSaveTimer); pendingSaveTimer = undefined; }
          outcome = saveGameState(result.state);
        }
      }
      set({ game: result.state, effects: result.effects, lastError: undefined, saveError: outcome?.error });
      return true;
    },
    flushSave,
    consumeEffects: () => set({ effects: [] }),
    setView: (activeView) => set({ activeView }),
    dismissLoadProblem: () => set({ loadProblem: undefined, recovery: get().recovery ? { ...get().recovery!, noticeVisible: false } : undefined }),
    showRecovery: () => set({ recovery: get().recovery ? { ...get().recovery!, noticeVisible: true } : undefined }),
    acceptRecovery: () => {
      const game = structuredClone(get().game);
      if (get().recovery?.kind === 'compatibility') {
        if (game.pendingEventId && !content.events.some(event => event.id === game.pendingEventId)) game.pendingEventId = undefined;
        game.simulationMode = game.pendingEventId ? 'event' : game.pendingReward ? 'reward' : game.pendingMonthlySummary ? 'monthly_summary' : 'paused';
      }
      const outcome = saveGameState(game);
      set({ game, saveError: outcome.error, ...(outcome.status !== 'failed' ? { recovery: undefined, loadProblem: undefined } : {}) });
    },
    reset: (nextSeed = Date.now()) => {
      const game = createInitialState(content, balance, nextSeed);
      const outcome = saveGameState(game);
      set({ game, effects: [], lastError: undefined, saveError: outcome.error, ...(outcome.status !== 'failed' ? { recovery: undefined, loadProblem: undefined } : {}) });
    },
    };
  });
}
