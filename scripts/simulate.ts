import { balanceConfig } from '../src/game/balance/config';
import { contentRegistry } from '../src/game/content/registry';
import { dispatchGameAction } from '../src/game/engine/actions';
import { createInitialState } from '../src/game/engine/initialState';
import { calculateNetWorth } from '../src/game/engine/economy';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from '../src/game/engine/schedule';
import type { GameAction, GameState } from '../src/game/content/contracts';

type Strategy = 'career' | 'consumer' | 'relationship' | 'investor' | 'expert' | 'manager' | 'property' | 'business' | 'high-wealth';

function configureScenario(state: GameState, strategy: Strategy): void {
  if (strategy === 'expert' || strategy === 'manager') {
    const jobId = strategy === 'expert' ? 'job.category-operations-expert' : 'job.regional-operations-manager';
    const job = contentRegistry.jobs.find((entry) => entry.id === jobId)!;
    state.ability = 100;
    state.reputation = 100;
    state.currentJobId = job.id;
    state.unlockedJobIds = [...new Set([...state.unlockedJobIds, job.id])];
    state.careerExperience = { operations: strategy === 'expert' ? 121 : 61, management: strategy === 'manager' ? 1 : 0 };
    state.qualifications = strategy === 'manager' ? ['people_management_basics'] : [];
    state.employment = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: state.calendar.week, basePay: job.basePay, salaryAdjustment: 0, negotiationStage: 0 };
    state.weeklyPlan = createDefaultWeeklyPlan();
    state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
    state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, contentRegistry);
  }

  if (strategy === 'property') {
    state.cash = 2_000_000;
    state.housingHoldings = { 'housing.sunny-apartment': { housingId: 'housing.sunny-apartment', purchasePrice: 24_000, currentValuation: 24_000, occupancy: 'rented' } };
    state.investments = { 'investment.commercial-reit': { investmentId: 'investment.commercial-reit', units: 100, averageCost: 100, currentValuation: 10_000, lastValuationDay: state.time.day } };
  }

  if (strategy === 'business') {
    const business = contentRegistry.businesses.find((entry) => entry.id === 'business.seed-kiosk')!;
    state.cash = 100_000;
    state.unlockedCapabilities = [...new Set([...state.unlockedCapabilities, 'business_license'])];
    state.unlockedBusinessIds = [...new Set([...state.unlockedBusinessIds, business.id])];
    state.businesses = { [business.id]: { businessId: business.id, priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: business.price, capitalInvested: business.price, equityPercent: 100 } };
  }

  if (strategy === 'high-wealth') state.cash = 10_000_000;
}

function chooseAction(state: GameState, strategy: Strategy): GameAction {
  if (state.pendingReward) return { type: 'claim_reward' };
  if (state.pendingEventId) return { type: 'choose_event', eventId: state.pendingEventId, choiceId: contentRegistry.events.find((event) => event.id === state.pendingEventId)?.choices[0]?.id ?? '' };
  if (state.simulationMode === 'monthly_summary') return { type: 'acknowledge_monthly_summary' };
  if (state.simulationMode === 'event') return { type: 'continue_after_event' };
  if (state.simulationMode === 'planning') return { type: 'start_week' };
  if (strategy === 'consumer' && state.simulationMode === 'paused' && state.cash > 450 && !(state.inventory['item.seed-phone'] ?? 0)) return { type: 'purchase_items', items: { 'item.seed-phone': 1 } };
  if (strategy === 'consumer' && state.simulationMode === 'paused' && state.cash > 1000 && !(state.inventory['item.seed-laptop'] ?? 0)) return { type: 'purchase_items', items: { 'item.seed-laptop': 1 } };
  if (strategy === 'investor' && state.simulationMode === 'paused' && state.cash > 700 && !(state.investments?.['investment.seed-index'])) return { type: 'buy_investment', investmentId: 'investment.seed-index', units: 2 };
  if (state.simulationMode === 'paused') return { type: 'continue_after_event' };
  return { type: 'advance_simulation', minutes: 60 };
}

function run(strategy: Strategy): { strategy: Strategy; day: number; cash: number; netWorth: number; errors: number; annualRecords: number; majorEventCount: number; firstMajorEventDays: number[]; lastMajorEventDays: number[]; eventIntervalRange: [number, number] | null; monthlyMajorEventRange: [number, number] | null } {
  let state = createInitialState(contentRegistry, balanceConfig, 20260825);
  configureScenario(state, strategy);
  let errors = 0;
  const majorEventDays: number[] = [];
  let guard = 0;
  while (state.time.day <= 1681 && guard < 250000) {
    const action = chooseAction(state, strategy);
    const result = dispatchGameAction(state, action, contentRegistry, balanceConfig);
    if (result.error) {
      errors += 1;
      if (state.simulationMode === 'running') state = dispatchGameAction(state, { type: 'pause_simulation' }, contentRegistry, balanceConfig).state;
      else break;
    } else {
      state = result.state;
      const lastMajor = state.lastMajorEventDay;
      if (lastMajor !== undefined && majorEventDays.at(-1) !== lastMajor) majorEventDays.push(lastMajor);
    }
    guard += 1;
  }
  const eventIntervals = majorEventDays.slice(1).map((day, index) => day - majorEventDays[index]);
  const monthlyMajorEvents = Array.from({ length: Math.ceil(state.time.day / 28) }, (_, index) => majorEventDays.filter((day) => Math.floor((day - 1) / 28) === index).length);
  return {
    strategy,
    day: state.time.day,
    cash: state.cash,
    netWorth: calculateNetWorth(state, contentRegistry, balanceConfig),
    errors,
    annualRecords: state.annualHistory?.length ?? 0,
    majorEventCount: majorEventDays.length,
    firstMajorEventDays: majorEventDays.slice(0, 3),
    lastMajorEventDays: majorEventDays.slice(-3),
    eventIntervalRange: eventIntervals.length ? [Math.min(...eventIntervals), Math.max(...eventIntervals)] : null,
    monthlyMajorEventRange: monthlyMajorEvents.length ? [Math.min(...monthlyMajorEvents), Math.max(...monthlyMajorEvents)] : null,
  };
}

for (const strategy of ['career', 'consumer', 'relationship', 'investor', 'expert', 'manager', 'property', 'business', 'high-wealth'] as const) console.log(JSON.stringify(run(strategy)));
