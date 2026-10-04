import { describe, expect, it } from 'vitest';
import { mergeBalanceConfig } from '../balance/config';
import type { GameAction, GameState } from '../content/contracts';
import { contentRegistry as content } from '../content/registry';
import { dispatchGameAction } from './actions';
import { calendarForDay } from './calendar';
import { employmentWorkWindow } from './effects';
import { createInitialState } from './initialState';
import { activityAtTime, defaultJobSchedule } from './schedule';
import { absoluteMinute } from './time';

const balance = mergeBalanceConfig({ eventDailyLimit: 0, eventAmbientChance: 0 });
const act = (state: GameState, action: GameAction) => dispatchGameAction(state, action, content, balance);

/** Use the authored reward, rather than inserting an unexplained hours modifier. */
function shorterHoursWorker(): GameState {
  const state = createInitialState(content, balance, 20);
  const job = content.jobs.find((entry) => entry.id === 'job.seed-warehouse')!;
  state.currentJobId = job.id;
  state.employment = { jobId: job.id, schedule: defaultJobSchedule(job), effectiveWeek: 1, startedDay: 1, basePay: job.basePay, salaryAdjustment: 0, negotiationStage: 0 };
  state.pendingEventId = 'event.salary-review';
  state.simulationMode = 'event';
  const chosen = act(state, { type: 'choose_event', eventId: 'event.salary-review', choiceId: 'hours' });
  expect(chosen.error).toBeUndefined();
  const claimed = act(chosen.state, { type: 'claim_reward', resume: false });
  expect(claimed.error).toBeUndefined();
  expect(employmentWorkWindow(claimed.state, claimed.state.employment!.schedule).endMinute).toBe(1001);
  return claimed.state;
}

function at(state: GameState, hour: number, minute: number): GameState {
  state.time = { day: 3, hour, minute };
  state.calendar = calendarForDay(3);
  state.currentActivity = activityAtTime(state.time, state.weeklyPlan, state.employment, content, state);
  return state;
}

/** Phone -> authored referral -> application: the same dispatcher path as the UI. */
function deliveryOffer(hour: number, minute: number) {
  let state = at(shorterHoursWorker(), hour, minute);
  for (const action of [
    { type: 'purchase_items', items: { 'item.seed-phone': 1 } },
    { type: 'start_storyline', storylineId: 'storyline.remote-connection' },
    { type: 'choose_storyline_branch', storylineId: 'storyline.remote-connection', branchId: 'meet' },
  ] as GameAction[]) {
    const result = act(state, action);
    expect(result.error).toBeUndefined();
    state = result.state;
  }
  state.rng.seed = 1;
  const opportunity = state.opportunities!.find((entry) => entry.jobId === 'job.delivery-shift')!;
  const submitted = act(state, { type: 'submit_application', opportunityId: opportunity.id });
  expect(submitted.error).toBeUndefined();
  const offer = submitted.state.applications!.find((entry) => entry.jobId === 'job.delivery-shift' && entry.status === 'offer')!;
  expect(offer).toBeDefined();
  return { state: submitted.state, applicationId: offer.applicationId };
}

describe('atomic purchase requirements', () => {
  it('rejects a mixed cart with two unique books without changing any game state', () => {
    const state = createInitialState(content, balance, 1);
    state.wishlist = ['item.book-set'];
    const before = structuredClone(state);
    const result = act(state, { type: 'purchase_items', items: { 'item.seed-coffee': 2, 'item.book-set': 2 } });
    expect(result.error).toBe('实用书籍暂时无法购买');
    expect(result.state).toBe(state);
    expect(result.state).toEqual(before);
    expect(result.effects).toEqual([]);
  });

  it('allows one unique book and refuses a later purchase atomically', () => {
    const state = createInitialState(content, balance, 1);
    const bought = act(state, { type: 'purchase_items', items: { 'item.book-set': 1 } });
    expect(bought.error).toBeUndefined();
    expect(bought.state.inventory['item.book-set']).toBe(1);
    expect(bought.state.cash).toBe(state.cash - 120);
    const before = structuredClone(bought.state);
    const repeated = act(bought.state, { type: 'purchase_items', items: { 'item.seed-coffee': 1, 'item.book-set': 1 } });
    expect(repeated.error).toBe('实用书籍暂时无法购买');
    expect(repeated.state).toBe(bought.state);
    expect(repeated.state).toEqual(before);
    expect(repeated.effects).toEqual([]);
  });

  it('preserves multiple consumables and items without an ownership restriction', () => {
    const state = createInitialState(content, balance, 1);
    state.cash = 2000;
    const result = act(state, { type: 'purchase_items', items: { 'item.seed-coffee': 2, 'item.seed-phone': 2 } });
    expect(result.error).toBeUndefined();
    expect(result.state.inventory['item.seed-coffee']).toBe(2);
    expect(result.state.inventory['item.seed-phone']).toBe(2);
    expect(result.state.cash).toBe(state.cash - 36 - 840);
  });
});

describe('gig conflicts use the actual employment window', () => {
  it.each([[16, 41], [17, 0]])('accepts and starts a referred gig at %i:%i after the authored shorter shift', (hour, minute) => {
    const offer = deliveryOffer(hour, minute);
    expect(offer.state.currentActivity?.kind).toBe(hour === 17 ? 'life' : 'free');
    const accepted = act(offer.state, { type: 'accept_application_offer', applicationId: offer.applicationId });
    expect(accepted.error).toBeUndefined();
    const gig = accepted.state.gigs![0];
    const started = act(accepted.state, { type: 'execute_gig', gigId: gig.id });
    expect(started.error).toBeUndefined();
    expect(started.state.gigs![0].startedMinute).toBe(absoluteMinute(offer.state.time));
    expect(started.state.time).toEqual(offer.state.time);
  });

  it('still refuses the final occupied minute at 16:40 without consuming the Offer', () => {
    const offer = deliveryOffer(16, 40);
    expect(offer.state.currentActivity?.kind).toBe('work');
    const before = structuredClone(offer.state);
    const result = act(offer.state, { type: 'accept_application_offer', applicationId: offer.applicationId });
    expect(result.error).toContain('班次与零工时间冲突');
    expect(result.state).toEqual(before);
    expect(result.effects).toEqual([]);
  });

  it('rechecks a gig accepted before the shift was extended at start time', () => {
    const offer = deliveryOffer(17, 0);
    const accepted = act(offer.state, { type: 'accept_application_offer', applicationId: offer.applicationId });
    expect(accepted.error).toBeUndefined();
    accepted.state.modifiers = [{ target: 'work_hours', mode: 'add', value: 30, tags: ['work'] }];
    const started = act(accepted.state, { type: 'execute_gig', gigId: accepted.state.gigs![0].id });
    expect(started.error).toContain('班次与零工时间冲突');
    expect(started.state).toBe(accepted.state);
    expect(started.state.gigs![0].startedMinute).toBeUndefined();
  });

  it('credits clock minutes immediately after the shorter shift ends', () => {
    const state = at(shorterHoursWorker(), 16, 40);
    const from = absoluteMinute(state.time);
    // An already started gig is rechecked each minute even when employment changes.
    state.gigs = [{ id: 'gig.boundary', jobId: 'job.delivery-shift', validFromDay: 3, expiresDay: 9, executableDay: 3, startMinute: from, endMinute: from + 240, pay: 120, source: 'fixture', startedMinute: from, workedMinutes: 0 }];
    state.simulationMode = 'running';
    const result = act(state, { type: 'advance_simulation', minutes: 2 });
    expect(result.error).toBeUndefined();
    expect(result.state.time).toEqual({ day: 3, hour: 16, minute: 42 });
    expect(result.state.gigs![0].workedMinutes).toBe(1);
  });

  it('does not credit minutes inside an extended shift after the original 17:00 end', () => {
    const state = at(shorterHoursWorker(), 17, 0);
    state.modifiers = [{ target: 'work_hours', mode: 'add', value: 30, tags: ['work'] }];
    const from = absoluteMinute(state.time);
    state.gigs = [{ id: 'gig.boundary', jobId: 'job.delivery-shift', validFromDay: 3, expiresDay: 9, executableDay: 3, startMinute: from, endMinute: from + 240, pay: 120, source: 'fixture', startedMinute: from, workedMinutes: 0 }];
    state.simulationMode = 'running';
    const result = act(state, { type: 'advance_simulation', minutes: 2 });
    expect(result.error).toBeUndefined();
    expect(result.state.gigs![0].workedMinutes).toBe(0);
  });
});
