import { describe, expect, it } from 'vitest';
import { mergeBalanceConfig } from '../balance/config';
import { contentRegistry as content } from '../content/registry';
import type { GameAction, GameState } from '../content/contracts';
import { dispatchGameAction } from './actions';
import { createInitialState } from './initialState';
import { studyRewards } from './settlementMath';
import { migrateGameState } from '../store/gameStore';
import { forecastWeeklyPlan } from './forecast';
import { inventoryModifiers } from './effects';
import { calendarForDay } from './calendar';

const balance = mergeBalanceConfig({ eventDailyLimit: 0, eventAmbientChance: 0 });
const equipment = ['item.pro-laptop', 'item.seed-desk', 'item.office-chair'];
const act = (state: GameState, action: GameAction) => {
  const result = dispatchGameAction(state, action, content, balance);
  expect(result.error).toBeUndefined();
  return result.state;
};
function buyer() {
  const state = createInitialState(content, balance, 7);
  state.cash = 100_000;
  return state;
}

describe('inventory-derived durable study effects', () => {
  it.each(equipment)('%s applies its authored multiplier while owned, including legacy inventory', (itemId) => {
    const initial = buyer();
    const purchased = act(initial, { type: 'purchase_items', items: { [itemId]: 1 } });
    const modifier = content.items.find(item => item.id === itemId)!.effects!.find(effect => effect.type === 'modifier')!;
    if (modifier.type !== 'modifier') throw new Error('Expected official modifier');
    expect(studyRewards(purchased, 3600, content).knowledge).toBe(Math.floor(30 * modifier.modifier.value));
    expect(purchased.modifiers).toEqual(initial.modifiers);
    expect(inventoryModifiers(purchased, content)).toEqual([{ itemId, modifier: modifier.modifier }]);
    const duplicateInventory = { ...purchased, inventory: { ...purchased.inventory, [itemId]: 3 } };
    expect(inventoryModifiers(duplicateInventory, content)).toEqual(inventoryModifiers(purchased, content));
    const legacy = migrateGameState(JSON.parse(JSON.stringify(purchased)), content, balance);
    expect(studyRewards(legacy, 3600, content)).toEqual(studyRewards(purchased, 3600, content));
    const sold = act(purchased, { type: 'sell_item', itemId, quantity: 1 });
    expect(studyRewards(sold, 3600, content).knowledge).toBe(30);
    const repurchased = act(sold, { type: 'purchase_items', items: { [itemId]: 1 } });
    expect(studyRewards(repurchased, 3600, content)).toEqual(studyRewards(purchased, 3600, content));
  });

  it('settles legal study sessions through the production engine and carries fractional equipment gains', () => {
    let state = buyer();
    state.time = { day: 6, hour: 9, minute: 0 };
    state.calendar = calendarForDay(6);
    state.employment = undefined;
    state.currentJobId = undefined;
    state.weeklyPlan.days[6].day = { kind: 'study', durationMinutes: 240 };
    const bare = act(state, { type: 'start_week' });
    const bareResult = act(bare, { type: 'advance_simulation', minutes: 240 });
    state = act(state, { type: 'purchase_items', items: Object.fromEntries(equipment.map(id => [id, 1])) });
    state.studyGainRemainder = 0.8;
    const rewards = studyRewards(state, 240, content);
    expect(rewards.knowledge).toBe(3);
    const running = act(state, { type: 'start_week' });
    const result = act(running, { type: 'advance_simulation', minutes: 240 });
    expect(result.time).toEqual({ day: 6, hour: 13, minute: 0 });
    expect(result.attributes!.knowledge - state.attributes!.knowledge).toBe(3);
    expect(result.studyGainRemainder).toBeCloseTo(0.15872);
    expect(bareResult.attributes!.knowledge - bare.attributes!.knowledge).toBe(2);
  });

  it.each(equipment)('%s changes actual legal weekly study gains without changing consumables', (itemId) => {
    let state = buyer();
    state.time = { day: 1, hour: 9, minute: 0 };
    state.employment = undefined;
    state.currentJobId = undefined;
    state.autoRepeatPlan = false;
    state.weeklyPlan.autoRepeat = false;
    for (const day of Object.values(state.weeklyPlan.days)) {
      day.day = { kind: 'study', durationMinutes: 240 };
      day.evening = { kind: 'study', durationMinutes: 240 };
    }
    const initialKnowledge = state.attributes!.knowledge;
    state = act(state, { type: 'purchase_items', items: { [itemId]: 1, 'item.seed-coffee': 2 } });
    const before = structuredClone(state);
    const predicted = forecastWeeklyPlan(state, state.weeklyPlan, content, balance);
    expect(state).toEqual(before);
    const result = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 7 * 1440 });
    expect(result.attributes!.knowledge - initialKnowledge).toBe(predicted.attributes!.knowledge);
    expect(result.attributes!.knowledge - initialKnowledge).toBeGreaterThan(28);
    expect(result.inventory['item.seed-coffee']).toBe(2);
    expect(inventoryModifiers(result, content).map(source => source.itemId)).toEqual([itemId]);
    const restored = migrateGameState(JSON.parse(JSON.stringify(result)), content, balance);
    expect(restored.studyGainRemainder).toBe(result.studyGainRemainder);
    const used = act(restored, { type: 'use_item', itemId: 'item.seed-coffee', quantity: 1 });
    expect(used.inventory['item.seed-coffee']).toBe(1);
    expect(used.studyGainRemainder).toBe(result.studyGainRemainder);
  });

  it('normalizes missing or invalid legacy carry without changing permanent modifiers', () => {
    for (const remainder of [undefined, -1, 1, NaN, '0.5']) {
      const state = buyer();
      state.modifiers = [{ target: 'study_gain', mode: 'multiply', value: 1.15 }];
      const restored = migrateGameState({ ...state, studyGainRemainder: remainder }, content, balance);
      expect(restored.studyGainRemainder).toBe(0);
      expect(restored.modifiers).toEqual(state.modifiers);
    }
  });
});
