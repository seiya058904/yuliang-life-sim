import { describe, expect, it } from 'vitest';
import type { GameAction, GameState } from '../content/contracts';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from './initialState';
import { dispatchGameAction } from './actions';
import { advanceCareerLifecycle } from './careers';
import { advanceSimulation } from './simulation';
import { activityAtTime, createDefaultWeeklyPlan } from './schedule';
import { businessValuation } from './economy';
import { getAttribute, applyAttributeDelta } from './attributes';
import { calendarForDay } from './calendar';
import { closeMonth } from './monthlySettlement';

const content = contentRegistry;
const balance = balanceConfig;
const quiet = mergeBalanceConfig({ eventDailyLimit: 0 });

const MUSIC = 'subscription.music';

function stateAt(day: number, hour: number, minute: number, seed = 1): GameState {
  const state = createInitialState(content, quiet, seed);
  state.time = { day, hour, minute };
  state.calendar = calendarForDay(day);
  return state;
}

/** An offer record for a job, with no other career state in the way. */
function offerFor(state: GameState, jobId: string): GameState {
  const job = content.jobs.find((entry) => entry.id === jobId)!;
  const next = structuredClone(state);
  next.applications = [{
    applicationId: 'application.audit',
    vacancyId: 'vacancy.audit',
    jobId: job.id,
    companyId: 'company.yuanwang',
    salaryRange: [job.basePay, job.basePay],
    route: 'market',
    submittedDay: next.time.day,
    resultDay: next.time.day,
    offerExpiresDay: next.time.day + 7,
    status: 'offer',
    competitivenessTier: 'minimum',
    probabilityBand: 0.7,
    willReceiveOffer: true,
    feedback: [],
  }];
  return next;
}

/** Formal shifts only leave a ledger record: the wage, its day and its amount. */
function wageEntries(state: GameState) {
  return (state.financialLedger?.entries ?? []).filter((entry) => entry.category === 'wage');
}

describe('subscription rewards bind to paid periods', () => {
  /**
   * The day 月结 actually runs. The simulator does not close a month on an
   * arbitrary day: it stops the run when the clock enters day `28n + 1` and
   * settles the month that just ended (`simulation.ts`). Driving that real gate
   * is the only way a billing-rule test can prove the integrated behaviour, so
   * every test below advances the clock to those days instead of calling
   * `closeMonth` on a date of its own choosing.
   */
  const MONTH_CLOSE_DAYS = [29, 57, 85, 113];

  /** Runs the world from `state` until the clock has entered `day`. */
  function runToDay(state: GameState, day: number, beforeFinalHour?: (state: GameState) => GameState): GameState {
    let current: GameState = { ...state, simulationMode: 'running' };
    while (current.time.day < day) {
      if (current.time.day === day - 1 && beforeFinalHour) current = beforeFinalHour(current);
      const advanced = dispatchGameAction(current, { type: 'advance_simulation', minutes: 60 }, content, balance);
      expect(advanced.error).toBeUndefined();
      current = advanced.state;
      // A month gate, an event or an Offer pauses the run; the test resumes it so
      // the clock keeps moving, exactly as a player answering the gate would.
      if (current.simulationMode !== 'running') current = { ...current, simulationMode: 'running' as const, pendingEventId: undefined, pendingOfferApplicationId: undefined, pendingMonthlySummary: undefined };
    }
    return current;
  }

  /**
   * Paid periods, read from the life history: every charge (whether from the
   * first 开通 or a 月结 renewal) writes exactly one negative-amount record for
   * the subscription. Read from the record rather than from the balance, because
   * a running world also earns wages and a cash delta cannot attribute a charge.
   */
  function paidPeriods(state: GameState): number {
    return (state.lifeHistory ?? []).filter((entry) => entry.category === 'service' && entry.sourceId === MUSIC && (entry.amount ?? 0) < 0).length;
  }

  it('does not let repeated enable/cancel cycles farm attributes', () => {
    let state = stateAt(1, 8, 0);
    state.cash = 500;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    const actions: GameAction[] = [];
    for (let index = 0; index < 50; index += 1) {
      actions.push({ type: 'manage_subscription', subscriptionId: MUSIC, enabled: true });
      actions.push({ type: 'manage_subscription', subscriptionId: MUSIC, enabled: false });
    }
    for (const action of actions) {
      const result = dispatchGameAction(state, action, content, balance);
      expect(result.error).toBeUndefined();
      state = result.state;
    }

    // One mood point for one paid period — never one per click.
    expect(getAttribute(state, 'mood')).toBe(51);
    expect(state.cash).toBe(500 - 18);
    expect(state.activeSubscriptions?.[MUSIC]).toBeUndefined();
  });

  it('resumes an already paid period instead of billing and rewarding it twice', () => {
    let state = stateAt(1, 8, 0);
    state.cash = 500;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    const moodAfterFirst = getAttribute(state, 'mood');
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: false }, content, balance).state;
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;

    expect(state.cash).toBe(500 - 18);
    expect(getAttribute(state, 'mood')).toBe(moodAfterFirst);
    expect(state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(29);
  });

  it('bills the next period at the real month close once the paid one has run out', () => {
    let state = stateAt(1, 8, 0);
    state.cash = 500;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    expect(state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(29);
    expect(paidPeriods(state)).toBe(1);

    // Day 29 is the first day the simulator closes a month; the paid period
    // ended that same day, so this close is the one that renews it.
    const afterClose = runToDay(state, 29);
    expect(afterClose.time.day).toBe(29);
    expect(paidPeriods(afterClose)).toBe(2);
    expect(getAttribute(afterClose, 'mood')).toBe(52);
    expect(afterClose.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(57);
  });

  it('never leaves an active period unpaid, including when the anchor has already run out', () => {
    // Activated on day 14, so the paid period runs to day 42 and the next billing
    // opportunity is the 月结 of day 57. That close must bill the subscription —
    // the anchor is what the period is keyed to, not the close — and every charge
    // covers the next 28 days from the day it is taken, so the cycle neither
    // drifts backwards nor bills a stretch that was already paid for. The gap
    // between the end of one period and the next charge is a lapse with no
    // service benefits: it is never retroactively billed and never accrues debt.
    const activationDay = 14;
    let state = stateAt(activationDay, 8, 0);
    state.cash = 1_000;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    const moodAtStart = getAttribute(state, 'mood');
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    expect(state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(42);
    expect(paidPeriods(state)).toBe(1);

    // The 月结 of day 29 comes before the period is due: nothing is billed.
    const beforeDue = runToDay(state, 29);
    expect(paidPeriods(beforeDue)).toBe(1);
    expect(beforeDue.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(42);

    // The 月结 of day 57 bills the period that had run out, and the charge covers
    // the 28 days from that close.
    const afterDueClose = runToDay(beforeDue, 57);
    expect(afterDueClose.time.day).toBe(57);
    expect(paidPeriods(afterDueClose)).toBe(2);
    expect(afterDueClose.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(85);
    expect(getAttribute(afterDueClose, 'mood')).toBe(moodAtStart + 2);

    // Charging again at each later close keeps one period per close, with no
    // double charge for coverage already bought.
    const afterNextClose = runToDay(afterDueClose, 85);
    expect(paidPeriods(afterNextClose)).toBe(3);
    expect(afterNextClose.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(113);
    expect(getAttribute(afterNextClose, 'mood')).toBe(moodAtStart + 3);
  });

  it('cancelling before the next close means the lapsed period is never billed', () => {
    // The branch the review asked about: activate on day 14 (paid to day 42),
    // cancel on day 50 — after the coverage ended but before the next 月结 — then
    // let the world reach the day-57 close. Cancelling must stop the charge that
    // would have covered the next period, must not bill the lapse in arrears, and
    // must not hand out the benefits of a period nobody paid for.
    let state = stateAt(14, 8, 0);
    state.cash = 1_000;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    const moodAtStart = getAttribute(state, 'mood');
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    expect(paidPeriods(state)).toBe(1);
    expect(getAttribute(state, 'mood')).toBe(moodAtStart + 1);

    const atDay50 = runToDay(state, 50);
    const cancelled = dispatchGameAction({ ...atDay50, simulationMode: 'running' as const }, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: false }, content, balance);
    expect(cancelled.error).toBeUndefined();
    expect(cancelled.state.activeSubscriptions?.[MUSIC]).toBeUndefined();
    expect(paidPeriods(cancelled.state)).toBe(1);

    // The world reaches the close that would have renewed it.
    const afterClose = runToDay(cancelled.state, 57);
    expect(afterClose.time.day).toBe(57);
    // No new charge, no new benefit: cancelling really stops the renewal.
    expect(paidPeriods(afterClose)).toBe(1);
    expect(getAttribute(afterClose, 'mood')).toBe(moodAtStart + 1);
    expect(afterClose.activeSubscriptions?.[MUSIC]).toBeUndefined();
    // Nothing was billed for the lapse in arrears either: the only subscription
    // money in the record is the first period the player really bought.
    const subscriptionMoney = (afterClose.lifeHistory ?? []).filter((entry) => entry.sourceId === MUSIC && (entry.amount ?? 0) < 0);
    expect(subscriptionMoney).toHaveLength(1);

    // Re-activating after the lapse buys a fresh period from that day, and only
    // then does the benefit resume.
    const reactivated = dispatchGameAction({ ...afterClose, simulationMode: 'paused' as const }, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance);
    expect(reactivated.error).toBeUndefined();
    expect(paidPeriods(reactivated.state)).toBe(2);
    expect(reactivated.state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe((reactivated.state.time.day) + 28);
    expect(getAttribute(reactivated.state, 'mood')).toBe(moodAtStart + 2);
  });

  it.each([
    { label: 'month start', day: 1 },
    { label: 'mid month', day: 14 },
    { label: 'day before the close', day: 27 },
    { label: 'the close day itself', day: 28 },
  ])('bills exactly one period per real month close when activated on $label (day $day)', ({ day }) => {
    let state = stateAt(day, 8, 0);
    state.cash = 1_000;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    const moodAtStart = getAttribute(state, 'mood');
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    expect(state.cash).toBe(982);
    expect(state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(day + 28);
    expect(paidPeriods(state)).toBe(1);

    // Walking the real month gates: every close that follows an elapsed period
    // charges once, and no close charges twice for the same period.
    let cursor = state;
    for (const closeAt of MONTH_CLOSE_DAYS) {
      cursor = runToDay(cursor, closeAt);
      const anchor = cursor.activeSubscriptions?.[MUSIC]?.billedUntilDay;
      // An active period is never left behind the day it is being played on.
      if (anchor !== undefined) expect(anchor).toBeGreaterThanOrEqual(cursor.time.day);
    }
    const expectedCharges = MONTH_CLOSE_DAYS.filter((closeAt) => closeAt >= day + 28).length + 1;
    expect(paidPeriods(cursor)).toBe(expectedCharges);
    // One paid period, one reward: the mood gain follows the charges exactly.
    expect(getAttribute(cursor, 'mood')).toBe(moodAtStart + expectedCharges);
  });

  it('does not hand out unpaid benefits when the renewal charge fails', () => {
    let state = stateAt(1, 8, 0);
    state.cash = 500;
    applyAttributeDelta(state, 'mood', 50 - getAttribute(state, 'mood'));
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    const moodAfterFirstPeriod = getAttribute(state, 'mood');
    expect(state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(29);

    // No cash left for the renewal when the month closes: the running world also
    // pays wages, so the balance is emptied on the day before the close rather
    // than trying to out-spend the income.
    const afterClose = runToDay(state, 29, (day28) => ({ ...day28, cash: 0 }));
    expect(paidPeriods(afterClose)).toBe(1);
    expect(afterClose.activeSubscriptions?.[MUSIC]).toBeUndefined();
    expect(getAttribute(afterClose, 'mood')).toBe(moodAfterFirstPeriod);
    expect(afterClose.lifeHistory).toContainEqual(expect.objectContaining({ title: '订阅暂停音乐会员' }));
  });

  it('charges again after a cancelled period has expired', () => {
    let state = stateAt(1, 8, 0);
    state.cash = 1_000;
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance).state;
    state = dispatchGameAction(state, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: false }, content, balance).state;
    expect(state.cash).toBe(982);

    // Reactivating two cycles later buys a fresh period.
    const later = structuredClone(state);
    later.time = { day: 60, hour: 8, minute: 0 };
    later.calendar = calendarForDay(60);
    const reactivated = dispatchGameAction(later, { type: 'manage_subscription', subscriptionId: MUSIC, enabled: true }, content, balance);
    expect(reactivated.error).toBeUndefined();
    expect(reactivated.state.cash).toBe(982 - 18);
    expect(reactivated.state.activeSubscriptions?.[MUSIC]?.billedUntilDay).toBe(88);
    expect(reactivated.state.lifeHistory.at(-1)).toMatchObject({ title: '开通音乐会员' });
  });
});

describe('gigs consume real working time', () => {
  /**
   * A world with no formal job, no plan clash and a reserved window on `windowDay`.
   * The window is written in the same absolute minutes the engine uses
   * (`(day - 1) * 1440 + minute of day`), so when it opens and the clock the test
   * starts at are never derived from two different formulas.
   */
  function gigWorld(clock: { day: number; hour: number; minute?: number }, windowDay: number, windowHour: number, hours = 4) {
    const state = stateAt(clock.day, clock.hour, clock.minute ?? 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    // A runnable plan, so a week boundary inside a long shift does not stop the
    // clock for a planning gate that is irrelevant to this rule.
    state.weeklyPlan = createDefaultWeeklyPlan();
    state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
    state.autoRepeatPlan = true;
    const startMinute = (windowDay - 1) * 1440 + windowHour * 60;
    state.gigs = [{
      id: 'gig.work',
      jobId: 'job.delivery-shift',
      validFromDay: windowDay,
      expiresDay: windowDay + 6,
      executableDay: windowDay,
      startMinute,
      endMinute: startMinute + hours * 60,
      pay: 76,
      source: '测试市场',
      workedMinutes: 0,
    }];
    return state;
  }

  it('keeps the hours done before an event pause and pays the whole shift after it', () => {
    // The P1 case: work the shift, get interrupted by an event, answer it, then
    // finish the shift. The hours worked before the interruption must stay on the
    // record, and the finished shift must settle once, in full — before the fix
    // the work done before the pause was not on the record at all.
    const state = gigWorld({ day: 1, hour: 8 }, 1, 8);
    state.eventMeter = 10_000;

    const interrupted = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(interrupted.error).toBeUndefined();
    expect(interrupted.state.simulationMode).toBe('event');
    const doneBeforePause = interrupted.state.gigs?.[0]?.workedMinutes ?? 0;
    expect(doneBeforePause).toBeGreaterThan(0);
    expect(doneBeforePause).toBeLessThan(240);
    expect(interrupted.state.cash).toBe(state.cash);

    // The player keeps answering the event and resuming until the shift is done.
    let cursor = interrupted.state;
    let paid = 0;
    for (let attempt = 0; attempt < 4 && (cursor.gigs ?? []).length; attempt += 1) {
      const resumed = { ...cursor, simulationMode: 'running' as const, pendingEventId: undefined };
      const next = dispatchGameAction(resumed, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
      expect(next.error).toBeUndefined();
      cursor = next.state;
      paid = cursor.cash - state.cash;
      // Every minute spent inside the window is banked, never dropped by a pause.
      if ((cursor.gigs ?? []).length) expect(cursor.gigs![0].workedMinutes).toBeGreaterThanOrEqual(doneBeforePause);
    }

    expect(cursor.gigs).toEqual([]);
    // All four promised hours were worked, so the fee is the full amount.
    expect(paid).toBe(76);
    expect(cursor.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76, detail: '零工按实际工时结算 4 小时' }));
  });

  it('settles a shift whose remaining hours are already on the record', () => {
    // The interruption left 3h59 on the record and the window has minutes left:
    // the last minute is worked, the shift completes, and the fee lands once. The
    // hours sit behind a real 开工, which is what makes them payable.
    const state = gigWorld({ day: 1, hour: 11, minute: 59 }, 1, 8);
    state.gigs![0].workedMinutes = 239;
    state.gigs![0].startedMinute = (1 - 1) * 1440 + 8 * 60;
    const finished = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(finished.error).toBeUndefined();
    expect(finished.state.gigs).toEqual([]);
    expect(finished.state.cash).toBe(state.cash + 76);
    expect(finished.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', detail: '零工按实际工时结算 4 小时' }));
  });

  it('pays the hours already worked when a pause cuts the shift short of the window', () => {
    // The other half of the same defect: the player is interrupted, the window
    // runs out with hours still unworked, and the record is settled. The hours on
    // it are paid proportionally instead of vanishing from the total, and a shift
    // with no work on it pays nothing at all. The banked hours belong to a shift
    // the player started — hours without a start are settled by their own rule.
    const state = gigWorld({ day: 1, hour: 8 }, 1, 8);
    state.gigs![0].workedMinutes = 120;
    state.gigs![0].startedMinute = (1 - 1) * 1440 + 8 * 60;
    const interrupt = { ...structuredClone(state), time: { day: 1, hour: 13, minute: 0 }, calendar: calendarForDay(1) };
    const partial = dispatchGameAction(interrupt, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(partial.error).toBeUndefined();
    expect(partial.state.gigs).toEqual([]);
    expect(partial.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 38, detail: '零工按实际工时结算 2 小时' }));
    expect(partial.state.cash).toBe(state.cash + 38);

    const untouched = gigWorld({ day: 1, hour: 8 }, 1, 8);
    const missed = { ...structuredClone(untouched), time: { day: 1, hour: 13, minute: 0 }, calendar: calendarForDay(1) };
    const missedResult = dispatchGameAction(missed, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(missedResult.state.gigs).toEqual([]);
    expect(missedResult.state.cash).toBe(untouched.cash);
    expect(missedResult.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
  });

  it('never counts a paused clock as hours worked on a gig', () => {
    // A window that is never started cannot be banked: only the clock actually
    // running inside the window credits minutes, so an idle world accrues none
    // and the shift is closed unpaid once its window is gone.
    const state = gigWorld({ day: 1, hour: 8 }, 1, 8);
    state.simulationMode = 'paused';
    const pastExpiry = { ...structuredClone(state), time: { day: 8, hour: 9, minute: 0 }, calendar: calendarForDay(8) };
    const settled = dispatchGameAction(pastExpiry, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(settled.state.cash).toBe(state.cash);
    expect(settled.state.gigs).toEqual([]);
    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
  });

  it('pays the hours accumulated through a 月结 that closes on the shift window', () => {
    // The clock runs straight from day 28 23:00 into day 29 and the month gate
    // pauses the run mid-shift. The two hours spent inside the window are on the
    // record, so answering 月结 and finishing the shift pays all four hours —
    // previously the gate erased the work and the record was deleted as unpaid.
    // The clock runs into day 29 and the month gate pauses the run before the
    // shift's reserved window even opens. Answering 月结 and working the shift
    // must pay all four hours — previously the gate could leave a gig record that
    // was then deleted as expired, losing the whole shift.
    const state = gigWorld({ day: 28, hour: 23 }, 29, 0);
    const before = dispatchGameAction(state, { type: 'advance_simulation', minutes: 60 }, content, balance);
    expect(before.error).toBeUndefined();
    // The gate paused the run for the month that just ended.
    expect(before.state.simulationMode).toBe('monthly_summary');
    expect(before.state.time).toMatchObject({ day: 29, hour: 0, minute: 0 });
    expect(before.state.gigs?.[0]?.workedMinutes).toBe(0);

    const resumed = { ...before.state, simulationMode: 'running' as const, pendingMonthlySummary: undefined };
    const finished = dispatchGameAction(resumed, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(finished.error).toBeUndefined();
    expect(finished.state.gigs).toEqual([]);
    expect(finished.state.cash).toBe(before.state.cash + 76);
    expect(finished.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76, detail: '零工按实际工时结算 4 小时' }));
  });

  it('keeps the hours worked before a 月结 that lands mid-shift and pays them with the shift', () => {
    // Shift 23:00–03:00 across the month boundary. The player starts it, the gate
    // pauses the run one hour in, and that hour stays on the record — the defect
    // was that the gate discarded work that had really happened. The shift is not
    // dropped or settled early, and once resumed it can be finished: three more
    // hours of the window remain, so the promised four hours are completed and the
    // shift pays its full fee exactly once.
    const state = gigWorld({ day: 28, hour: 23 }, 28, 23);
    const before = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(before.error).toBeUndefined();
    expect(before.state.simulationMode).toBe('monthly_summary');
    expect(before.state.time).toMatchObject({ day: 29, hour: 0, minute: 0 });
    expect(before.state.gigs?.[0]?.workedMinutes).toBe(60);
    // The hour is banked, not paid: the day boundary's own costs may have run, but
    // no 同城配送 settlement exists yet.
    expect((before.state.financialLedger?.entries ?? []).filter((entry) => entry.label === '同城配送结算')).toEqual([]);
    expect(before.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
    expect(before.state.lifeHistory?.some((entry) => entry.title === '错过同城配送')).not.toBe(true);

    const resumed = { ...before.state, simulationMode: 'running' as const, pendingMonthlySummary: undefined };
    const finished = dispatchGameAction(resumed, { type: 'execute_gig', gigId: 'gig.work' }, content, balance);
    expect(finished.error).toBeUndefined();
    expect(finished.state.gigs).toEqual([]);
    expect(finished.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76, detail: '零工按实际工时结算 4 小时' }));
    expect(finished.state.cash).toBe(before.state.cash + 76);
  });

  it('offers the daily market gig in the same absolute-minute window the player reads', () => {
    // The daily market offer is a second writer of gig windows. It used to write
    // minute-of-day values (`18 * 60`) while execution and the card copy read
    // absolute minutes, so every market gig looked like it had already expired —
    // the same defect as the legacy-save migration, on the live path.
    const state = stateAt(40, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.gigs = [];
    advanceCareerLifecycle(state, 40, content, balance);

    const [gig] = state.gigs ?? [];
    expect(gig).toBeDefined();
    expect(gig.startMinute).toBe((40 - 1) * 1440 + 18 * 60);
    expect(gig.endMinute).toBe((40 - 1) * 1440 + 18 * 60 + 240);
    expect(gig.executableDay).toBe(40);
    expect(gig.workedMinutes).toBe(0);

    // …and it is workable at its own start time, against a real clock.
    const runnable = { ...structuredClone(state), time: { day: 40, hour: 18, minute: 0 }, calendar: calendarForDay(40), simulationMode: 'running' as const };
    const worked = dispatchGameAction(runnable, { type: 'execute_gig', gigId: gig.id }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.gigs).toEqual([]);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76 }));
  });

  it('reserves a window that ends job.hours after acceptance', () => {
    const state = stateAt(1, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, 'job.delivery-shift'), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.error).toBeUndefined();
    const [gig] = accepted.state.gigs ?? [];
    expect(gig).toMatchObject({ startMinute: 8 * 60, endMinute: 12 * 60, executableDay: 1, pay: 76 });
  });

  it('pays no cash until the reserved hours have actually been worked', () => {
    const state = stateAt(1, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    const accepted = dispatchGameAction(offerFor(state, 'job.delivery-shift'), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    const [gig] = accepted.state.gigs ?? [];
    expect(gig).toMatchObject({ startMinute: 8 * 60, endMinute: 12 * 60, executableDay: 1 });

    // Clicking 执行 once at the reserved start is a four-hour commitment: the
    // pay lands with the clock at the end of the window, not instantly.
    const worked = dispatchGameAction(accepted.state, { type: 'execute_gig', gigId: gig.id }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.time).toMatchObject({ day: 1, hour: 12, minute: 0 });
    expect(worked.state.cash).toBe(state.cash + 76);
    expect(worked.state.gigs).toEqual([]);
  });

  it('scales the fee down when the player arrives late and can only work part of the window', () => {
    // Window 08:00–12:00; arriving at 10:00 leaves two of the four promised
    // hours, so two hours of work pay half the fee — never the full amount. The
    // hours are paid for the time the clock actually ran on the gig, not for the
    // window the player reserved.
    const state = stateAt(1, 10, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.gigs = [{ id: 'gig.partial', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 8 * 60, endMinute: 12 * 60, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const worked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.partial' }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.time).toMatchObject({ day: 1, hour: 12, minute: 0 });
    expect(worked.state.cash).toBe(state.cash + 38);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', detail: '零工按实际工时结算 2 小时' }));
  });

  it('does not turn a one-minute window remainder into the full four-hour fee', () => {
    // The audit case: accept at 08:00, click at 11:59. Only one minute of the
    // promised shift was actually worked inside the window.
    const state = stateAt(1, 11, 59);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.gigs = [{ id: 'gig.late', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 8 * 60, endMinute: 12 * 60, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const worked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.late' }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.time).toMatchObject({ day: 1, hour: 12, minute: 0 });
    const earned = worked.state.cash - state.cash;
    expect(earned).toBeGreaterThan(0);
    expect(earned).toBeLessThan(10);
  });

  it('refuses a gig whose window overlaps a formal shift', () => {
    const state = stateAt(1, 9, 0);
    state.simulationMode = 'running';
    const employment = state.employment!;
    expect(employment.schedule.workDays).toContain(state.calendar.weekday);
    state.gigs = [{ id: 'gig.overlap', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 9 * 60, endMinute: 13 * 60, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const blocked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.overlap' }, content, balance);
    expect(blocked.error).toContain('班次');
    expect(blocked.state.cash).toBe(state.cash);
    expect(blocked.state.time).toMatchObject({ day: 1, hour: 9, minute: 0 });
  });

  it('refuses to work a gig that overlaps the weekly plan instead of settling that activity too', () => {
    const state = stateAt(1, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.acquiredSideJobs = { 'job.delivery-shift': { jobId: 'job.delivery-shift', acquiredDay: 1 } };
    // A runnable 4-hour side job sits exactly over the gig window.
    state.weeklyPlan.days[state.calendar.weekday].day = { kind: 'side_job', jobId: 'job.delivery-shift', durationMinutes: 240 };
    // Accepting only checks the formal shift, so the gig is reserved…
    const accepted = dispatchGameAction(offerFor(state, 'job.delivery-shift'), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.error).toBeUndefined();
    // …and starting the work is refused until the plan is cleared.
    const [gig] = accepted.state.gigs ?? [];
    const blocked = dispatchGameAction(accepted.state, { type: 'execute_gig', gigId: gig.id }, content, balance);
    expect(blocked.error).toContain('计划');
    expect(blocked.state.cash).toBe(accepted.state.cash);
    expect(blocked.state.time).toEqual(accepted.state.time);

    // Clearing the clash makes the same gig workable.
    const cleared = structuredClone(accepted.state);
    cleared.weeklyPlan.days[cleared.calendar.weekday].day = { kind: 'free' };
    const worked = dispatchGameAction(cleared, { type: 'execute_gig', gigId: gig.id }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.cash).toBe(cleared.cash + 76);
  });

  it('runs the promised hours as one committed block and cannot be paid twice', () => {
    const state = stateAt(1, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.gigs = [{ id: 'gig.repeat', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 8 * 60, endMinute: 12 * 60, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const first = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.repeat' }, content, balance);
    expect(first.error).toBeUndefined();
    expect(first.state.cash).toBe(state.cash + 76);
    const again = dispatchGameAction(first.state, { type: 'execute_gig', gigId: 'gig.repeat' }, content, balance);
    expect(again.error).toBeDefined();
    expect(again.state.cash).toBe(first.state.cash);
  });

  it('uses absolute minutes for a window that crosses midnight', () => {
    // 23:00 + a 4-hour gig ends at 03:00 the next day: the window must be one
    // continuous absolute range, not a minute-of-day that wraps backwards.
    const state = stateAt(1, 23, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.gigs = [{ id: 'gig.midnight', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 23 * 60, endMinute: 23 * 60 + 240, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const worked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.midnight' }, content, balance);
    expect(worked.error).toBeUndefined();
    expect(worked.state.time).toMatchObject({ day: 2, hour: 3, minute: 0 });
    // The shift was worked in full, so the full fee is recorded on the day the
    // work ended, independently of the day-boundary living costs.
    const gigEntry = (worked.state.financialLedger?.entries ?? []).find((entry) => entry.label === '同城配送结算');
    expect(gigEntry).toMatchObject({ day: 2, amount: 76, category: 'side_job' });
    expect(worked.state.gigs).toEqual([]);
  });

  it('pays nothing for hours an old passive credit banked without a start', () => {
    // An earlier build credited gig minutes passively, so a save can carry hours
    // with no `startedMinute` behind them. The window closing unstarted must pay
    // nothing: those hours were never worked by the clock.
    const state = stateAt(1, 18, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.gigs = [{ id: 'gig.passive', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 18 * 60, endMinute: 22 * 60, pay: 76, source: '旧存档', workedMinutes: 120 }];
    const before = state.cash;
    const run = dispatchGameAction(state, { type: 'advance_simulation', minutes: 250 }, content, quiet);
    expect(run.error).toBeUndefined();
    expect(run.state.time).toMatchObject({ day: 1, hour: 22, minute: 10 });
    expect(run.state.cash, '旧被动工时分文不付').toBe(before);
    expect(run.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
    expect(run.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
  });

  it('keeps old passive hours out of the pay of a shift started later', () => {
    // The rule the reviewer fixed for round 6: it is not enough to require a
    // `startedMinute` at payout time, because the player's own 开工 adds one. The
    // old minutes must leave the record when the shift is taken on, so the start
    // accrues only what is really worked: 20:00–22:00 is two hours, ¥38 — not the
    // four the stale counter suggested.
    const state = stateAt(1, 20, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    // The default plan has an evening study over 19:00–21:00; clearing the day is
    // what this rule is not about.
    state.weeklyPlan.days[state.calendar.weekday] = { day: { kind: 'free' }, evening: { kind: 'free' } };
    state.gigs = [{ id: 'gig.passive', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 18 * 60, endMinute: 22 * 60, pay: 76, source: '旧存档', workedMinutes: 120 }];
    const before = state.cash;
    const worked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.passive' }, content, quiet);
    expect(worked.error).toBeUndefined();
    expect(worked.state.cash - before).toBe(38);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 38, detail: '零工按实际工时结算 2 小时' }));
    expect(worked.state.gigs).toEqual([]);
  });

  it('pays the same two hours when the record never carried passive hours', () => {
    // Control for the rule above: without old minutes the late arrival already paid
    // for exactly the minutes it worked.
    const state = stateAt(1, 20, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.simulationMode = 'running';
    state.weeklyPlan.days[state.calendar.weekday] = { day: { kind: 'free' }, evening: { kind: 'free' } };
    state.gigs = [{ id: 'gig.clean', jobId: 'job.delivery-shift', validFromDay: 1, expiresDay: 7, executableDay: 1, startMinute: 18 * 60, endMinute: 22 * 60, pay: 76, source: '测试市场', workedMinutes: 0 }];
    const before = state.cash;
    const worked = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.clean' }, content, quiet);
    expect(worked.error).toBeUndefined();
    expect(worked.state.cash - before).toBe(38);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', detail: '零工按实际工时结算 2 小时' }));
  });

  it('never works a shift the player did not start, however long the world runs', () => {
    // The card on the career page is an opportunity, not a job taken. Before this
    // rule the world's own minutes were credited to every window they passed
    // through, so a shift nobody had taken paid its full fee — and a plan running
    // in those same minutes was settled as well, paying one hour twice.
    const state = gigWorld({ day: 1, hour: 18 }, 1, 18);
    const knowledgeBefore = state.attributes!.knowledge;
    const run = dispatchGameAction(state, { type: 'advance_simulation', minutes: 240 }, content, quiet);
    expect(run.error).toBeUndefined();
    expect(run.state.time).toMatchObject({ day: 1, hour: 22, minute: 0 });

    expect(run.state.cash).toBe(state.cash);
    expect(run.state.gigs).toEqual([]);
    expect(run.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
    expect(run.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
    // The 19:00–21:00 study in the same window did run: those minutes belong to
    // the plan, not to a shift nobody started.
    expect(run.state.attributes!.knowledge).toBeGreaterThan(knowledgeBefore);
  });

  it('refuses a start that clashes with the plan, and the refused shift earns nothing', () => {
    // The refusal has to hold on the world's own path, not only at the button:
    // this click was refused, and the world then ran through the same four hours.
    const state = gigWorld({ day: 1, hour: 18 }, 1, 18);
    const knowledgeBefore = state.attributes!.knowledge;
    const refused = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, quiet);
    expect(refused.error).toBe('本周计划与零工时间冲突，请先空出这段时间');
    expect(refused.state.gigs?.[0]?.startedMinute).toBeUndefined();
    expect(refused.state.gigs?.[0]?.workedMinutes).toBe(0);

    const run = dispatchGameAction(refused.state, { type: 'advance_simulation', minutes: 240 }, content, quiet);
    expect(run.state.cash).toBe(state.cash);
    expect(run.state.gigs).toEqual([]);
    expect(run.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
    expect(run.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送', amount: undefined }));
    expect(run.state.attributes!.knowledge).toBeGreaterThan(knowledgeBefore);
  });

  it('takes a shift on from a paused world and works it once its window is open', () => {
    // Starting a shift spends no time by itself, so a paused world can take one on
    // — and the hours are then worked by the clock, not by the click. This is the
    // path the career card drives.
    const state = gigWorld({ day: 3, hour: 12 }, 3, 18);
    state.simulationMode = 'paused';
    const started = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, quiet);
    expect(started.error).toBeUndefined();
    expect(started.notice).toContain('已开始');
    expect(started.state.gigs?.[0]).toMatchObject({ startedMinute: (3 - 1) * 1440 + 12 * 60, workedMinutes: 0 });
    expect(started.state.time).toMatchObject({ day: 3, hour: 12, minute: 0 });
    expect(started.state.cash).toBe(state.cash);

    // A world standing still banks nothing, and the window is then worked without
    // a second click: the clock does the work, the click only took the shift on.
    const idle = dispatchGameAction({ ...started.state, simulationMode: 'running' as const }, { type: 'advance_simulation', minutes: 1 }, content, quiet);
    expect(idle.state.time).toMatchObject({ day: 3, hour: 12, minute: 1 });
    expect(idle.state.gigs?.[0]?.workedMinutes).toBe(0);

    const run = dispatchGameAction({ ...started.state, simulationMode: 'running' as const }, { type: 'advance_simulation', minutes: 600 }, content, quiet);
    expect(run.state.gigs).toEqual([]);
    expect(run.state.cash).toBe(state.cash + 76);
    expect(run.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76, detail: '零工按实际工时结算 4 小时' }));
  });

  it('refuses a second shift over minutes another shift is already working', () => {
    // Two overlapping cards cannot both be worked: one shift occupies the time, so
    // the second one is refused instead of being paid for the same minutes.
    const state = gigWorld({ day: 3, hour: 18 }, 3, 18);
    state.simulationMode = 'paused';
    state.gigs = [...(state.gigs ?? []), { ...state.gigs![0], id: 'gig.other' }];
    const first = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, quiet);
    expect(first.error).toBeUndefined();
    expect(first.state.cash).toBe(state.cash);

    const second = dispatchGameAction(first.state, { type: 'execute_gig', gigId: 'gig.other' }, content, quiet);
    expect(second.error).toBe('这段时间已经在做另一份零工，请先完成它');
    expect(second.state.gigs?.find((gig) => gig.id === 'gig.other')?.startedMinute).toBeUndefined();
    expect(second.state.cash).toBe(state.cash);
  });

  it('never pays the same minutes to a started shift and to a plan that takes them', () => {
    // A start is checked against the plan as it stands; a plan that takes those
    // minutes afterwards must not be paid for *and* leave the shift its hours.
    const state = gigWorld({ day: 3, hour: 18 }, 3, 18);
    state.simulationMode = 'paused';
    const started = dispatchGameAction(state, { type: 'execute_gig', gigId: 'gig.work' }, content, quiet);
    expect(started.error).toBeUndefined();

    const planned = structuredClone(started.state);
    planned.weeklyPlan.days[3].evening = { kind: 'study', durationMinutes: 120 };
    planned.simulationMode = 'running';
    const run = dispatchGameAction(planned, { type: 'advance_simulation', minutes: 240 }, content, quiet);
    // The plan kept 19:00–21:00, so only the two hours around it were worked.
    expect(run.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 38, detail: '零工按实际工时结算 2 小时' }));
    expect(run.state.cash).toBe(state.cash + 38);
  });

  it('publishes the daily market shift for the day the world entered, not the one it settled', () => {
    // The daily lifecycle step is driven with the day the clock just *left*, so a
    // window anchored to it opened hours before the player ever saw the card: a
    // 第 39 天 18:00–22:00 shift was published at 第 40 天 00:00 and pruned a minute
    // later as 错过.
    const state = gigWorld({ day: 39, hour: 23, minute: 59 }, 40, 18);
    state.gigs = [];
    const crossed = dispatchGameAction(state, { type: 'advance_simulation', minutes: 2 }, content, quiet);
    expect(crossed.error).toBeUndefined();
    expect(crossed.state.time).toMatchObject({ day: 40, hour: 0, minute: 1 });

    const [gig] = crossed.state.gigs ?? [];
    expect(gig).toMatchObject({ jobId: 'job.delivery-shift', executableDay: 40, validFromDay: 40 });
    expect(gig.startMinute).toBe((40 - 1) * 1440 + 18 * 60);
    expect(gig.endMinute).toBe((40 - 1) * 1440 + 22 * 60);

    // It is not a window that has already ended: the next minute keeps it, and the
    // player is not told they missed a shift they never had the chance to take.
    const later = dispatchGameAction(crossed.state, { type: 'advance_simulation', minutes: 1 }, content, quiet);
    expect((later.state.gigs ?? []).map((entry) => entry.id)).toEqual([gig.id]);
    expect(later.state.lifeHistory?.some((entry) => entry.title === '错过同城配送')).not.toBe(true);

    // …and the opportunity can actually be worked when its window opens.
    const ready = { ...later.state, time: { day: 40, hour: 18, minute: 0 }, calendar: calendarForDay(40), simulationMode: 'running' as const };
    const worked = dispatchGameAction(ready, { type: 'execute_gig', gigId: gig.id }, content, quiet);
    expect(worked.error).toBeUndefined();
    expect(worked.state.cash).toBe(later.state.cash + 76);
    expect(worked.state.gigs).toEqual([]);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76 }));
  });

  /** A world whose weekly plan runs the two-day 品质周末旅行 starting on `startDay`. */
  function travellingWorld(startDay: number, startHour: number, days = 2) {
    const trip = content.activities!.find((entry) => entry.id === 'activity.premium-weekend')!;
    const option = trip.options[0];
    const state = stateAt(startDay, startHour, 0, 7);
    state.currentJobId = undefined;
    state.employment = undefined;
    state.cash = 50_000;
    state.simulationMode = 'running';
    // A week cleared for the trip: a multi-day activity may not overlap any other
    // plan entry, so the control has to be a plan that really can run.
    const plan = createDefaultWeeklyPlan();
    for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) plan.days[weekday] = { day: { kind: 'free' }, evening: { kind: 'free' } };
    plan.days[calendarForDay(startDay).weekday].day = { kind: 'activity', activityId: trip.id, optionId: option.id };
    state.weeklyPlan = plan;
    state.previousWeeklyPlan = structuredClone(plan);
    state.autoRepeatPlan = true;
    return { state, trip, option, days };
  }

  it('keeps a shift out of a multi-day activity that is still running on a later day', () => {
    // The review case: 品质周末旅行 starts on 第 6 天 09:00 and runs to 第 8 天 09:00.
    // On 第 7 天 the weekly plan grid for that weekday says nothing — the plan is per
    // weekday — so only the running 长活动 knows the player is still away. Before
    // this rule the shift was accepted and paid in full while the trip continued.
    const { state, trip } = travellingWorld(6, 9);
    const started = advanceSimulation(state, 1, content, quiet);
    expect(started.state.longActivity?.activity).toMatchObject({ activityId: trip.id, start: { day: 6, hour: 9, minute: 0 }, end: { day: 8, hour: 9, minute: 0 } });

    // Run the world into the trip's second day and put a market shift in its evening.
    const away = advanceSimulation({ ...started.state, simulationMode: 'running' }, 24 * 60 + 8 * 60 + 49, content, quiet);
    expect(away.state.time).toMatchObject({ day: 7, hour: 17, minute: 50 });
    expect(away.state.longActivity?.activity).toMatchObject({ activityId: trip.id });
    // The player is genuinely away: the activity the world is running is the trip.
    expect(activityAtTime(away.state.time, away.state.weeklyPlan, away.state.employment, content, away.state).activityId).toBe(trip.id);

    const gig = {
      id: 'gig.trip', jobId: 'job.delivery-shift', validFromDay: 7, expiresDay: 13, executableDay: 7,
      startMinute: (7 - 1) * 1440 + 18 * 60, endMinute: (7 - 1) * 1440 + 22 * 60, pay: 76, source: '测试市场', workedMinutes: 0,
    };
    const withGig = { ...away.state, gigs: [gig], simulationMode: 'running' as const };
    const refused = dispatchGameAction(withGig, { type: 'execute_gig', gigId: gig.id }, content, quiet);
    expect(refused.error).toBe('这段时间还在品质周末旅行中，请先结束它再开工');
    expect(refused.state.gigs?.[0]?.startedMinute).toBeUndefined();

    // …and the world passing over the window pays nothing, because the trip still owns it.
    const ran = advanceSimulation(withGig, 4 * 60 + 10, content, quiet);
    expect((ran.state.financialLedger?.entries ?? []).filter((entry) => entry.category === 'side_job')).toEqual([]);
    expect(ran.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
    expect(ran.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '错过同城配送' }));
    expect(ran.state.longActivity?.activity).toMatchObject({ activityId: trip.id });

    // Control: the trip itself completes afterwards, so the block came from the trip
    // and not from the record having gone missing.
    const finished = advanceSimulation({ ...ran.state, simulationMode: 'running' }, 11 * 60, content, quiet);
    expect(finished.state.longActivity).toBeUndefined();
    expect(finished.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '品质周末旅行 · 安排品质周末', amount: -2200 }));
  });

  it('keeps the trip occupied across a week boundary as well', () => {
    // A trip starting on 第 7 天 runs over the week boundary (第 8 天 starts week 2),
    // where the plan is re-validated: the running activity must survive that and keep
    // owning its minutes on the other side.
    const { state, trip } = travellingWorld(7, 9);
    const started = advanceSimulation(state, 1, content, quiet);
    expect(started.state.longActivity?.activity).toMatchObject({ activityId: trip.id });

    const nextWeek = advanceSimulation({ ...started.state, simulationMode: 'running' }, 24 * 60 + 8 * 60 + 49, content, quiet);
    expect(nextWeek.state.time).toMatchObject({ day: 8, hour: 17, minute: 50 });
    expect(nextWeek.state.longActivity?.activity).toMatchObject({ activityId: trip.id });

    const gig = {
      id: 'gig.week', jobId: 'job.delivery-shift', validFromDay: 8, expiresDay: 14, executableDay: 8,
      startMinute: (8 - 1) * 1440 + 18 * 60, endMinute: (8 - 1) * 1440 + 22 * 60, pay: 76, source: '测试市场', workedMinutes: 0,
    };
    const withGig = { ...nextWeek.state, gigs: [gig], simulationMode: 'running' as const };
    const refused = dispatchGameAction(withGig, { type: 'execute_gig', gigId: gig.id }, content, quiet);
    expect(refused.error).toBe('这段时间还在品质周末旅行中，请先结束它再开工');

    const ran = advanceSimulation(withGig, 4 * 60, content, quiet);
    expect((ran.state.financialLedger?.entries ?? []).filter((entry) => entry.category === 'side_job')).toEqual([]);
    expect(ran.state.lifeHistory?.some((entry) => entry.title === '完成同城配送')).not.toBe(true);
  });
});

describe('a mid-shift hire never collects the shift it did not work', () => {
  const CLERK = 'job.seed-shop-clerk';

  it('defers employment to the next full shift when the offer is accepted one minute before it ends', () => {
    const state = stateAt(1, 16, 59);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.error).toBeUndefined();
    expect(accepted.state.employment).toMatchObject({ startedDay: 2, activeFromMinute: 1440 + 9 * 60 });
    const cashAfterHiring = accepted.state.cash;

    const rolled = advanceSimulation({ ...accepted.state, simulationMode: 'running' }, 1, content, quiet);
    expect(rolled.state.time).toMatchObject({ day: 1, hour: 17, minute: 0 });
    expect(rolled.state.cash).toBe(cashAfterHiring);
    expect(wageEntries(rolled.state)).toEqual([]);

    // The next day's full shift pays normally, exactly once.
    const nextDay = advanceSimulation({ ...rolled.state, simulationMode: 'running' }, 24 * 60, content, quiet);
    const wages = wageEntries(nextDay.state);
    expect(wages).toHaveLength(1);
    expect(wages[0]).toMatchObject({ day: 2, amount: 96, label: '便利店店员工资' });
  });

  it('keeps a shift that starts after the hire time payable in full', () => {
    const state = stateAt(1, 8, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.state.employment).toMatchObject({ startedDay: 1, activeFromMinute: 9 * 60 });
    const rolled = advanceSimulation({ ...accepted.state, simulationMode: 'running' }, 9 * 60, content, quiet);
    expect(rolled.state.time).toMatchObject({ day: 1, hour: 17, minute: 0 });
    expect(rolled.state.cash).toBeGreaterThan(accepted.state.cash);
    expect(wageEntries(rolled.state)).toHaveLength(1);
  });

  it('never pays a shift that had already started before the hire', () => {
    const state = stateAt(1, 12, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.state.employment?.startedDay).toBe(2);
    const rolled = advanceSimulation({ ...accepted.state, simulationMode: 'running' }, 5 * 60, content, quiet);
    expect(rolled.state.time).toMatchObject({ day: 1, hour: 17, minute: 0 });
    expect(rolled.state.cash).toBe(accepted.state.cash);
    expect(wageEntries(rolled.state)).toEqual([]);
  });

  it('treats the exact shift start as inside the shift and defers to the next working day', () => {
    const state = stateAt(1, 9, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.state.employment).toMatchObject({ startedDay: 2, activeFromMinute: 1440 + 9 * 60 });
  });

  it('keeps the contract live after the shift already ended, with the first wage on the next shift', () => {
    const state = stateAt(1, 18, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    // The contract starts today, but today's shift is over: no wage for it.
    expect(accepted.state.employment).toMatchObject({ startedDay: 1, activeFromMinute: 9 * 60 });
    expect(wageEntries(accepted.state)).toEqual([]);
    const rolled = advanceSimulation({ ...accepted.state, simulationMode: 'running' }, 24 * 60, content, quiet);
    const wages = wageEntries(rolled.state);
    expect(wages.map((entry) => entry.day)).toEqual([2]);
  });

  it('skips the weekend so the first paid shift is a real working day', () => {
    // Day 5 (Friday) 12:00: accepting mid-shift must not land on Saturday.
    const state = stateAt(5, 12, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.state.employment).toMatchObject({ startedDay: 8, activeFromMinute: 7 * 1440 + 9 * 60 });
    const rolled = advanceSimulation({ ...accepted.state, simulationMode: 'running' }, 4 * 24 * 60, content, quiet);
    // Days 6 and 7 are rest days: no shift may be paid before day 8.
    const wages = wageEntries(rolled.state);
    expect(wages.filter((entry) => entry.day < 8)).toEqual([]);
    expect(wages[0]).toMatchObject({ day: 8, amount: 96 });
  });

  it('treats a rest-day acceptance as a normal hire for the next working day', () => {
    // Day 6 (Saturday) 10:00 — a rest day, so there is no shift to miss.
    const state = stateAt(6, 10, 0);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    expect(accepted.state.employment).toMatchObject({ startedDay: 8, activeFromMinute: 7 * 1440 + 9 * 60 });
  });

  it('keeps plan, projection and settlement consistent for a deferred hire', () => {
    const state = stateAt(1, 16, 59);
    state.currentJobId = undefined;
    state.employment = undefined;
    const accepted = dispatchGameAction(offerFor(state, CLERK), { type: 'accept_application_offer', applicationId: 'application.audit' }, content, balance);
    const employment = accepted.state.employment!;
    // The projected activity for the deferred day is the shift exactly once.
    const beforeStart = activityAtTime({ day: 1, hour: 10, minute: 0 }, accepted.state.weeklyPlan, employment, content, accepted.state);
    expect(beforeStart.kind).not.toBe('work');
    const onStart = activityAtTime({ day: 2, hour: 10, minute: 0 }, accepted.state.weeklyPlan, employment, content, accepted.state);
    expect(onStart).toMatchObject({ kind: 'work', jobId: CLERK });
    expect(onStart.start).toMatchObject({ day: 2, hour: 9, minute: 0 });
    expect(onStart.end).toMatchObject({ day: 2, hour: 17, minute: 0 });
  });
});

describe('business valuation uses one whole-company basis', () => {
  it('values a partnership entry the same way a minority stake is valued', () => {
    const partnershipEntry = (() => {
      const state = stateAt(1, 8, 0);
      state.cash = 20_000;
      state.ability = 18;
      state.relationships['character.seed-zhou'] = 20;
      state.unlockedCapabilities.push('business_license', 'remote_work');
      state.unlockedBusinessIds.push('business.online-store');
      return dispatchGameAction(state, { type: 'join_business_partnership', businessId: 'business.online-store' }, content, balance);
    })();

    expect(partnershipEntry.error).toBeUndefined();
    const holding = partnershipEntry.state.businesses['business.online-store'];
    // The whole-company basis is the authored company price, exactly as the
    // outright purchase and the minority-stake entry record it; the cash the
    // player actually paid stays their cost basis.
    expect(holding.companyValuationBasis).toBe(7800);
    expect(holding.purchasePrice).toBe(4200);
    expect(businessValuation(holding, balance)).toBe(5070);

    const staked = (() => {
      const state = stateAt(1, 8, 0);
      state.cash = 20_000;
      state.unlockedCapabilities.push('business_license', 'remote_work');
      state.unlockedBusinessIds.push('business.online-store');
      state.ability = 18;
      state.relationships['character.seed-zhou'] = 20;
      state.flags.consulting_project_completed = true;
      return state;
    })();
    // A 30% stake in the same company pays 30% of the same whole-company price.
    const stake = dispatchGameAction({ ...staked, ability: 40, reputation: 40 }, { type: 'buy_business_stake', businessId: 'business.online-store', percent: 30 }, content, balance);
    expect(stake.error).toBeUndefined();
    expect(stake.state.businesses['business.online-store']).toMatchObject({ equityPercent: 30, purchasePrice: 2340, companyValuationBasis: 7800 });
  });

  it('scales a later top-up by the real implied company value', () => {
    const state = stateAt(1, 8, 0);
    state.cash = 20_000;
    state.ability = 18;
    state.relationships['character.seed-zhou'] = 20;
    state.unlockedCapabilities.push('business_license', 'remote_work');
    state.unlockedBusinessIds.push('business.online-store');
    const entered = dispatchGameAction(state, { type: 'join_business_partnership', businessId: 'business.online-store' }, content, balance);
    const raised = dispatchGameAction(entered.state, { type: 'increase_business_stake', businessId: 'business.online-store', percent: 10 }, content, balance);
    expect(raised.error).toBeUndefined();
    // 7800 * 0.65 * 10% * 1.15 = 583 on the shared basis, not the 314 the
    // entry-price basis produced.
    expect(raised.state.businesses['business.online-store']).toMatchObject({ equityPercent: 60, playerCostBasis: { kind: 'known', value: 4200 + 583 } });
  });
});
