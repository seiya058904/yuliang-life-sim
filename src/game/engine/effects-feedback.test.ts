import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameEffect } from '../content/contracts';
import { createInitialState } from './initialState';
import { applyContentEffects } from './effects';

describe('truthful content effect deltas', () => {
  it('reports the applied delta when a stat or attribute reaches its lower bound', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.reputation = 1;
    state.attributes!.mood = 2;
    const effects: GameEffect[] = [];
    applyContentEffects(state, [{ type: 'stat', stat: 'reputation', amount: -7 }, { type: 'attribute', attribute: 'mood', amount: -10 }], contentRegistry, balanceConfig, effects);
    expect(state.reputation).toBe(0);
    expect(state.attributes!.mood).toBe(0);
    expect(effects).toEqual([{ type: 'stat', stat: 'reputation', amount: -1 }, { type: 'stat', stat: 'mood', amount: -2 }]);
  });

  it('reports the resulting legacy ability delta without changing attribute rules', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 1);
    state.attributes = { professional: 0, knowledge: 4, communication: 8, fitness: 8, appearance: 5, network: 0, mood: 50 };
    state.ability = 5;
    const effects: GameEffect[] = [];
    applyContentEffects(state, [{ type: 'stat', stat: 'ability', amount: -10 }], contentRegistry, balanceConfig, effects);
    expect(state.ability).toBe(0);
    expect(state.attributes).toMatchObject({ professional: 0, knowledge: 0, communication: 0, fitness: 0 });
    expect(effects).toEqual([{ type: 'stat', stat: 'ability', amount: -5 }]);
  });
});
