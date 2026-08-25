import { balanceConfig } from '../src/game/balance/config';
import { contentRegistry } from '../src/game/content/registry';
import { dispatchGameAction } from '../src/game/engine/actions';
import { createInitialState } from '../src/game/engine/initialState';
import { calculateNetWorth } from '../src/game/engine/economy';
import type { GameAction, GameState } from '../src/game/content/contracts';

type Strategy = 'career' | 'consumer' | 'relationship' | 'investor';

function chooseAction(state: GameState, strategy: Strategy): GameAction {
  if (state.pendingReward) return { type: 'claim_reward' };
  if (state.pendingEventId) return { type: 'choose_event', eventId: state.pendingEventId, choiceId: contentRegistry.events.find((event) => event.id === state.pendingEventId)?.choices[0]?.id ?? '' };
  if (state.simulationMode === 'event') return { type: 'continue_after_event' };
  if (state.simulationMode === 'planning') return { type: 'start_week' };
  if (strategy === 'consumer' && state.simulationMode === 'paused' && state.cash > 450 && !(state.inventory['item.seed-phone'] ?? 0)) return { type: 'purchase_items', items: { 'item.seed-phone': 1 } };
  if (strategy === 'consumer' && state.simulationMode === 'paused' && state.cash > 1000 && !(state.inventory['item.seed-laptop'] ?? 0)) return { type: 'purchase_items', items: { 'item.seed-laptop': 1 } };
  if (strategy === 'investor' && state.simulationMode === 'paused' && state.cash > 700 && !(state.investments?.['investment.seed-index'])) return { type: 'buy_investment', investmentId: 'investment.seed-index', units: 2 };
  if (state.simulationMode === 'paused') return { type: 'continue_after_event' };
  return { type: 'advance_simulation', minutes: 60 };
}

function run(strategy: Strategy): { strategy: Strategy; day: number; cash: number; netWorth: number; errors: number; majorEventDays: number[]; eventIntervals: number[]; monthlyMajorEvents: number[] } {
  let state = createInitialState(contentRegistry, balanceConfig, 20260825);
  let errors = 0;
  const majorEventDays: number[] = [];
  let guard = 0;
  while (state.time.day <= 60 && guard < 5000) {
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
  return { strategy, day: state.time.day, cash: state.cash, netWorth: calculateNetWorth(state, contentRegistry, balanceConfig), errors, majorEventDays, eventIntervals, monthlyMajorEvents };
}

for (const strategy of ['career', 'consumer', 'relationship', 'investor'] as const) console.log(JSON.stringify(run(strategy)));
