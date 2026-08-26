import { create } from 'zustand';
import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameAction, GameEffect, GameState, JobSchedule, LifeRecordEntry, ViewId } from '../content/contracts';
import { calendarForDay } from '../engine/calendar';
import { dispatchGameAction } from '../engine/actions';
import { createInitialState } from '../engine/initialState';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from '../engine/schedule';
import { migrateAttributes, syncLegacyAbility } from '../engine/attributes';
import { emptyFinancialLedger } from '../engine/financialLedger';
import { employmentKind, generateVacancies } from '../engine/careers';

export const SAVE_KEY = 'yuliang-save-v1';

export interface GameStore {
  game: GameState;
  effects: GameEffect[];
  activeView: ViewId;
  lastError?: string;
  dispatch: (action: GameAction) => void;
  consumeEffects: () => void;
  setView: (view: ViewId) => void;
  reset: (seed?: number) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function knownIds(content: ContentRegistry, category: keyof Pick<ContentRegistry, 'jobs' | 'items' | 'housing' | 'businesses' | 'assets' | 'characters' | 'events' | 'eventChains' | 'milestones'>): Set<string> {
  return new Set(content[category].map((entry) => entry.id));
}

function isWeeklyPlan(value: unknown): value is GameState['weeklyPlan'] {
  if (!isRecord(value) || !isRecord(value.days)) return false;
  const days = value.days as Record<string, unknown>;
  return [1, 2, 3, 4, 5, 6, 7].every((weekday) => {
    const day = days[String(weekday)];
    return isRecord(day) && isRecord(day.day) && isRecord(day.evening)
      && ['study', 'side_job', 'free'].includes(String(day.day.kind))
      && ['study', 'side_job', 'free'].includes(String(day.evening.kind));
  });
}

function isLifeRecordEntry(value: unknown): value is LifeRecordEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.day)
    && ['career', 'purchase', 'service', 'activity', 'housing', 'relationship', 'event', 'business', 'asset', 'investment'].includes(String(value.category))
    && typeof value.title === 'string';
}

export function saveGameState(state: GameState): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

export function migrateGameState(raw: unknown, content: ContentRegistry, balance: BalanceConfig): GameState {
  const initial = createInitialState(content, balance, 1);
  if (!isRecord(raw)) return initial;
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
  candidate.weeklyPlan = isWeeklyPlan(candidate.weeklyPlan) ? candidate.weeklyPlan : createDefaultWeeklyPlan();
  candidate.weeklyPlan.autoRepeat = Boolean(candidate.weeklyPlan.autoRepeat ?? true);
  candidate.previousWeeklyPlan = isWeeklyPlan(candidate.previousWeeklyPlan) ? candidate.previousWeeklyPlan : structuredClone(candidate.weeklyPlan);
  candidate.autoRepeatPlan = Boolean(candidate.autoRepeatPlan ?? candidate.weeklyPlan.autoRepeat);
  candidate.simulationSpeed = candidate.simulationSpeed === 2 || candidate.simulationSpeed === 4 ? candidate.simulationSpeed : 1;
  candidate.simulationMode = candidate.pendingEventId ? 'event' : candidate.simulationMode === 'planning' ? 'planning' : 'paused';

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
    return [id, {
      businessId: id,
      priceLevel: Number.isInteger(value.priceLevel) ? Math.max(0, Number(value.priceLevel)) : 1,
      wageLevel: Number.isInteger(value.wageLevel) ? Math.max(0, Number(value.wageLevel)) : 1,
      inventoryLevel: Number.isInteger(value.inventoryLevel) ? Math.max(0, Number(value.inventoryLevel)) : 1,
      purchasePrice: Number.isFinite(value.purchasePrice) ? Math.max(0, Number(value.purchasePrice)) : 0,
      capitalInvested: Number.isFinite(value.capitalInvested) ? Math.max(0, Number(value.capitalInvested)) : 0,
      equityPercent: Number.isFinite(value.equityPercent) ? Math.min(100, Math.max(0, Number(value.equityPercent))) : 100,
      fundingRaised: Number.isFinite(value.fundingRaised) ? Math.max(0, Number(value.fundingRaised)) : 0,
      fundingRound: Number.isInteger(value.fundingRound) ? Math.max(0, Number(value.fundingRound)) : 0,
      listed: value.listed === true,
      listedDay: Number.isInteger(value.listedDay) && Number(value.listedDay) > 0 ? Number(value.listedDay) : undefined,
    }];
  }));
  const businessProjectIds = new Set((content.activities ?? []).flatMap((activity) => activity.options.filter((option) => option.businessProject).map((option) => `${activity.id}.${option.id}`)));
  candidate.completedBusinessProjects = [...new Set((candidate.completedBusinessProjects ?? []).filter((id) => businessProjectIds.has(id)))];
  candidate.assets = Object.fromEntries(Object.entries(candidate.assets ?? {}).filter(([id]) => knownIds(content, 'assets').has(id)));
  const locationIds = new Set((content.locations ?? []).map((entry) => entry.id));
  candidate.locationVisits = Object.fromEntries(Object.entries(candidate.locationVisits ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) > 0).map(([id, value]) => [id, Number(value)]));
  candidate.locationDevelopment = Object.fromEntries(Object.entries(candidate.locationDevelopment ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5).map(([id, value]) => [id, Number(value)]));
  const investmentIds = new Set((content.investments ?? []).map((entry) => entry.id));
  candidate.investments = Object.fromEntries(Object.entries(candidate.investments ?? {}).filter(([id]) => investmentIds.has(id)));
  const subscriptionIds = new Set((content.subscriptions ?? []).map((entry) => entry.id));
  candidate.activeSubscriptions = Object.fromEntries(Object.entries(candidate.activeSubscriptions ?? {}).filter(([id, holding]) => subscriptionIds.has(id) && isRecord(holding) && holding.subscriptionId === id && Number.isInteger(holding.startedDay) && holding.startedDay > 0).map(([id, holding]) => [id, { subscriptionId: id, startedDay: Number((holding as Record<string, unknown>).startedDay) }]));
  candidate.jobExperience = candidate.jobExperience ?? {};
  candidate.courseProgress = Object.fromEntries(Object.entries(candidate.courseProgress ?? {}).filter(([id, value]) => (content.courses ?? []).some((course) => course.id === id) && Number.isInteger(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  candidate.careerExperience = Object.fromEntries(Object.entries(candidate.careerExperience ?? {}).filter(([id, value]) => ['office', 'operations', 'customer_service', 'retail', 'logistics', 'data', 'project', 'management', 'media', 'finance'].includes(id) && Number.isFinite(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  candidate.qualifications = [...new Set((candidate.qualifications ?? []).filter((id) => typeof id === 'string' && ['office_basics', 'operations_foundation', 'client_service_experience', 'retail_operations_experience', 'logistics_experience', 'data_analysis_foundation', 'project_coordination', 'people_management_basics', 'media_production_experience', 'investment_basics'].includes(id)))];
  candidate.relationships = candidate.relationships ?? {};
  const characterIds = new Set(content.characters.map((entry) => entry.id));
  candidate.messages = Array.isArray(candidate.messages)
    ? candidate.messages.filter((entry) => isRecord(entry) && typeof entry.id === 'string' && Number.isInteger(entry.day) && typeof entry.title === 'string' && typeof entry.body === 'string' && typeof entry.read === 'boolean' && (entry.characterId === undefined || characterIds.has(entry.characterId as string))).slice(-30) as GameState['messages']
    : [];
  candidate.attributes = migrateAttributes(candidate.attributes, candidate.ability, candidate.lifestyle, candidate.relationships);
  syncLegacyAbility(candidate);
  candidate.eventCooldowns = candidate.eventCooldowns ?? {};
  candidate.chainStages = candidate.chainStages ?? {};
  candidate.flags = candidate.flags ?? {};
  candidate.modifiers = candidate.modifiers ?? [];
  candidate.discounts = candidate.discounts ?? [];
  candidate.rng = candidate.rng ?? initial.rng;
  candidate.marketJobIds = candidate.marketJobIds?.filter((id) => jobIds.has(id)) ?? initial.marketJobIds;
  candidate.lastSettledDay = Number.isInteger(candidate.lastSettledDay) ? candidate.lastSettledDay : initial.lastSettledDay;
  candidate.eventDay = Number.isInteger(candidate.eventDay) ? candidate.eventDay : candidate.time.day;
  candidate.eventsToday = Number.isInteger(candidate.eventsToday) ? candidate.eventsToday : 0;
  candidate.rentReliefAvailableDay = candidate.rentReliefAvailableDay ?? 0;
  candidate.housingReliefUntilDay = candidate.housingReliefUntilDay ?? 0;
  candidate.monthlyLedger = candidate.monthlyLedger ?? initial.monthlyLedger;
  candidate.financialLedger = candidate.financialLedger && Array.isArray(candidate.financialLedger.entries)
    ? { month: candidate.calendar.month, nextSequence: Math.max(1, Number(candidate.financialLedger.nextSequence) || candidate.financialLedger.entries.length + 1), entries: candidate.financialLedger.entries }
    : emptyFinancialLedger(candidate.calendar.month, candidate.cash, candidate.monthlyLedger.netWorthStart);
  candidate.financialHistory = Array.isArray(candidate.financialHistory) ? candidate.financialHistory.slice(-12) : [];
  candidate.annualHistory = Array.isArray(candidate.annualHistory) ? candidate.annualHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number.isFinite(entry.cashStart) && Number.isFinite(entry.cashEnd) && Number.isFinite(entry.netWorthStart) && Number.isFinite(entry.netWorthEnd) && Number.isFinite(entry.totalIncome) && Number.isFinite(entry.totalConsumption) && Number.isInteger(entry.months)).slice(-10) as GameState['annualHistory'] : [];
  candidate.worldHistory = Array.isArray(candidate.worldHistory) ? candidate.worldHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number(entry.year) > 0 && Number.isInteger(entry.day) && Number(entry.day) > 0 && Number.isFinite(entry.netWorth) && Number.isInteger(entry.businessCount) && Number(entry.businessCount) >= 0 && Number.isInteger(entry.relationshipCount) && Number(entry.relationshipCount) >= 0 && Number.isInteger(entry.visitedLocationCount) && Number(entry.visitedLocationCount) >= 0 && (entry.currentJobId === undefined || jobIds.has(String(entry.currentJobId)))).slice(-10) as GameState['worldHistory'] : [];
  candidate.lifeHistory = Array.isArray(candidate.lifeHistory) ? candidate.lifeHistory.filter(isLifeRecordEntry) : [];
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
  candidate.applications = Array.isArray(candidate.applications) ? candidate.applications.filter((entry) => jobIds.has(entry.jobId)) : [];
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
        schedule,
        effectiveWeek: Number.isInteger(rawEmployment.effectiveWeek) ? Number(rawEmployment.effectiveWeek) : candidate.calendar.week,
        pendingJobId: typeof rawEmployment.pendingJobId === 'string' && jobIds.has(rawEmployment.pendingJobId) ? rawEmployment.pendingJobId : undefined,
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
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content);
  return candidate;
}

export function loadGameState(content: ContentRegistry, balance: BalanceConfig): GameState {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) return createInitialState(content, balance);
  try { return migrateGameState(JSON.parse(saved), content, balance); } catch { return createInitialState(content, balance); }
}

export function createGameStore(content: ContentRegistry, balance: BalanceConfig, seed?: number) {
  const initial = seed === undefined ? loadGameState(content, balance) : createInitialState(content, balance, seed);
  return create<GameStore>((set, get) => ({
    game: initial,
    effects: [],
    activeView: 'work',
    dispatch: (action) => {
      const result = dispatchGameAction(get().game, action, content, balance);
      if (result.error) { set({ lastError: result.error, effects: [] }); return; }
      saveGameState(result.state);
      set({ game: result.state, effects: result.effects, lastError: undefined });
    },
    consumeEffects: () => set({ effects: [] }),
    setView: (activeView) => set({ activeView }),
    reset: (nextSeed = Date.now()) => {
      const game = createInitialState(content, balance, nextSeed);
      saveGameState(game);
      set({ game, effects: [], lastError: undefined });
    },
  }));
}
