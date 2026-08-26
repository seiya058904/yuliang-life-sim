import type { BalanceConfig } from '../balance/config';
import type { ContentRegistry, GameState } from '../content/contracts';
import { calendarForDay } from './calendar';
import { createRng } from './rng';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from './schedule';
import { createInitialAttributes } from './attributes';
import { emptyFinancialLedger } from './financialLedger';
import { generateVacancies } from './careers';

export function createInitialState(content: ContentRegistry, balance: BalanceConfig, seed = Date.now()): GameState {
  const startHousing = content.housing.find((entry) => entry.id === balance.startingHousingId) ?? content.housing[0];
  const startingCharacters = Object.fromEntries(content.characters.map((character) => [character.id, character.initialRelationship]));
  const starterJobs = content.jobs.filter((job) => (job.abilityRequired ?? 0) <= balance.initialAbility && (job.reputationRequired ?? 0) <= balance.initialReputation && !job.requiredItems?.length && !job.requiredCapabilities?.length).map((job) => job.id);
  const starterHousing = content.housing.filter((home) => !home.requirements).map((home) => home.id);
  const time = { day: balance.initialDay, hour: balance.initialHour, minute: 0 };
  const calendar = calendarForDay(time.day);
  const weeklyPlan = createDefaultWeeklyPlan();
  const currentJob = content.jobs.find((job) => job.id === starterJobs[0]);
  const employment = currentJob?.kind === 'regular' ? { jobId: currentJob.id, schedule: defaultJobSchedule(currentJob), effectiveWeek: calendar.week, basePay: currentJob.basePay, salaryAdjustment: 0, negotiationStage: 0 as const } : undefined;
  const state: GameState = {
    version: balance.saveVersion,
    contentVersion: balance.contentVersion,
    time,
    calendar,
    cash: balance.initialCash,
    ability: balance.initialAbility,
    reputation: balance.initialReputation,
    lifestyle: balance.initialLifestyle,
    attributes: createInitialAttributes(balance.initialAbility, balance.initialLifestyle),
    currentJobId: starterJobs[0],
    employment,
    weeklyPlan,
    previousWeeklyPlan: structuredClone(weeklyPlan),
    autoRepeatPlan: weeklyPlan.autoRepeat,
    currentActivity: activityAtTime(time, weeklyPlan, employment, content),
    simulationMode: 'planning',
    simulationSpeed: 1,
    monthlyLedger: { wageIncome: 0, sideJobIncome: 0, businessIncome: 0, assetIncome: 0, rentExpense: 0, purchaseExpense: 0, livingExpense: 0, netWorthStart: balance.initialCash, netWorthEnd: balance.initialCash },
    financialLedger: emptyFinancialLedger(calendar.month, balance.initialCash, balance.initialCash),
    financialHistory: [],
    annualHistory: [],
    worldHistory: [],
    locationDevelopment: Object.fromEntries((content.locations ?? []).map((location) => [location.id, 0])),
    jobExperience: {},
    courseProgress: {},
    careerExperience: {},
    qualifications: [],
    inventory: {},
    itemPurchasePrices: {},
    wishlist: [],
    unlockedCapabilities: [...balance.startingCapabilities],
    unlockedJobIds: starterJobs,
    unlockedHousingIds: starterHousing,
    unlockedBusinessIds: [],
    unlockedAssetIds: content.assets.filter((asset) => asset.kind === 'vehicle').map((asset) => asset.id),
    housing: { housingId: startHousing?.id ?? '', mode: balance.startingHousingMode },
    locationVisits: {},
    relationships: startingCharacters,
    messages: [],
    businesses: {},
    completedBusinessProjects: [],
    assets: {},
    investments: {},
    activeSubscriptions: {},
    completedEvents: [],
    completedMilestones: [],
    eventCooldowns: {},
    chainStages: {},
    flags: {},
    modifiers: [],
    discounts: [],
    marketJobIds: content.jobs.map((job) => job.id),
    eventMeter: 0,
    eventDay: balance.initialDay,
    eventsToday: 0,
    lastSettledDay: balance.initialDay - 1,
    rentReliefAvailableDay: 0,
    housingReliefUntilDay: 0,
    rng: createRng(seed),
    lastMajorEventDay: undefined,
    majorEventsThisMonth: 0,
    ambientLog: [],
    storylineStages: {},
    applications: [],
    opportunities: [],
    acquiredSideJobs: {},
    gigs: [],
    employmentHistory: [],
    monthlyHighlights: [],
    lifeHistory: [],
  };
  state.vacancies = generateVacancies(state, content, balance);
  return state;
}
