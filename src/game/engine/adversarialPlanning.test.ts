import { describe, expect, it } from 'vitest';
import type { GameAction, GameState } from '../content/contracts';
import { contentRegistry } from '../content/registry';
import { mergeBalanceConfig } from '../balance/config';
import { dispatchGameAction } from './actions';
import { createInitialState } from './initialState';

const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
function act(state: GameState, action: GameAction): GameState {
  const result = dispatchGameAction(state, action, contentRegistry, balance);
  expect(result.error, action.type).toBeUndefined();
  return result.state;
}
function pauseAt(state: GameState, minutes: number): GameState {
  state = act(state, { type: 'start_week' });
  state = act(state, { type: 'advance_simulation', minutes });
  return act(state, { type: 'pause_simulation' });
}

describe('copying a previous plan respects elapsed time', () => {
  it('cannot acquire a full study reward by copying into the final minute of a past slot', () => {
    let state = createInitialState(contentRegistry, balance, 1);
    state = act(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'free' } });
    state = act(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'free' } });
    state = pauseAt(state, 779);
    expect(state.time).toEqual({ day: 1, hour: 20, minute: 59 });
    const copied = act(state, { type: 'copy_previous_plan' });
    expect(copied.weeklyPlan.days[1].evening).toEqual({ kind: 'free' });
    expect(copied.weeklyPlan.days[2].evening).toEqual({ kind: 'study', durationMinutes: 120 });
    const next = act(act(copied, { type: 'resume_simulation' }), { type: 'advance_simulation', minutes: 1 });
    expect(next.attributes!.knowledge).toBe(state.attributes!.knowledge);
    expect(next.time).toEqual({ day: 1, hour: 21, minute: 0 });
  });

  it('preserves work already spent on an in-progress study slot when the old week had free time', () => {
    let state = createInitialState(contentRegistry, balance, 1);
    state.previousWeeklyPlan!.days[1].evening = { kind: 'free' };
    state = pauseAt(state, 779);
    const copied = act(state, { type: 'copy_previous_plan' });
    expect(copied.weeklyPlan.days[1].evening).toEqual(state.weeklyPlan.days[1].evening);
    const next = act(act(copied, { type: 'resume_simulation' }), { type: 'advance_simulation', minutes: 1 });
    expect(next.attributes!.knowledge).toBe(state.attributes!.knowledge + 1);
  });

  it('preserves completed weekdays while continuing to copy the remaining future slots', () => {
    let state = createInitialState(contentRegistry, balance, 1);
    state = act(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'free' } });
    state = act(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'free' } });
    state = pauseAt(state, 1440);
    const copied = act(state, { type: 'copy_previous_plan' });
    expect(copied.weeklyPlan.days[1]).toEqual(state.weeklyPlan.days[1]);
    expect(copied.weeklyPlan.days[2].evening).toEqual(state.previousWeeklyPlan!.days[2].evening);
  });

  it('uses the same exact-start cutoff as ordinary edits', () => {
    let state = createInitialState(contentRegistry, balance, 1);
    state = act(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'free' } });
    state = pauseAt(state, 660);
    expect(state.time).toEqual({ day: 1, hour: 19, minute: 0 });
    const copied = act(state, { type: 'copy_previous_plan' });
    expect(copied.weeklyPlan.days[1].evening).toEqual(state.previousWeeklyPlan!.days[1].evening);
    const next = act(act(copied, { type: 'resume_simulation' }), { type: 'advance_simulation', minutes: 120 });
    expect(next.attributes!.knowledge).toBe(state.attributes!.knowledge + 1);
  });

  it('keeps the source cell and exactly-once settlement of an already-started long activity', () => {
    let state = createInitialState(contentRegistry, balance, 1);
    state.cash = 5000;
    state = act(state, {
      type: 'set_plan', weekday: 6, slot: 'day',
      activity: { kind: 'activity', activityId: 'activity.premium-weekend', optionId: 'premium-stay' },
    });
    state = pauseAt(state, 5 * 1440 + 120);
    expect(state.longActivity).toBeDefined();
    const copied = act(state, { type: 'copy_previous_plan' });
    expect(copied.weeklyPlan.days[6].day).toEqual(state.weeklyPlan.days[6].day);
    expect(copied.longActivity).toEqual(state.longActivity);
    const next = act(act(copied, { type: 'resume_simulation' }), { type: 'advance_simulation', minutes: 47 * 60 });
    expect(next.longActivity).toBeUndefined();
    expect(next.financialLedger!.entries.filter(entry => entry.sourceId === 'activity.premium-weekend')).toHaveLength(1);
    expect(next.lifeHistory.filter(entry => entry.sourceId === 'activity.premium-weekend')).toHaveLength(1);
  });
});
