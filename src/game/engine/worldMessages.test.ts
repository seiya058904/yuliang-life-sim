import { describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { ContentRegistry, GameEffect, WorldMessageDefinition } from '../content/contracts';
import { createInitialState } from './initialState';
import { SPEAK_CHANCE_PERMILLE, WORLD_MESSAGE_MONTHLY_CAP, deliverWorldMessages, hashPermille } from './worldMessages';

/** 找到第一个"门禁打开"的月份，让测试不依赖某个具体的 seed 是否恰好命中。 */
function firstOpenMonth(seed: number): number {
  for (let month = 1; month < 4000; month += 1) {
    if (hashPermille(seed, month, 'world-message-gate') < SPEAK_CHANCE_PERMILLE) return month;
  }
  throw new Error('哈希门禁在 4000 个月内一次都没有打开');
}

function registryWith(messages: readonly WorldMessageDefinition[]): ContentRegistry {
  return { ...contentRegistry, worldMessages: messages };
}

const linMessage: WorldMessageDefinition = {
  id: 'world-message.test-lin',
  contentStatus: 'official',
  characterId: 'character.seed-lin',
  cooldownDays: 120,
  weight: 10,
  title: '林晨：测试消息',
  body: '这是一条测试用的世界消息。',
  condition: { type: 'relationship_at_least', characterId: 'character.seed-lin', amount: 20 },
};

describe('world messages', () => {
  it('hashPermille is stable for the same seed, month and salt', () => {
    expect(hashPermille(20260825, 7, 'world-message-gate')).toBe(hashPermille(20260825, 7, 'world-message-gate'));
    expect(hashPermille(20260825, 8, 'world-message-gate')).not.toBe(hashPermille(20260825, 9, 'world-message-gate'));
  });

  it('delivers nothing when the content has no world messages', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 11);
    const output: GameEffect[] = [];
    expect(deliverWorldMessages(state, registryWith([]), balanceConfig, output)).toBe(0);
    expect(output).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });

  it('stays silent while the condition is not met, even when the monthly gate is open', () => {
    const seed = 4242;
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    // 关系为 0：这条消息的条件不成立。
    state.relationships['character.seed-lin'] = 0;
    state.time.day = firstOpenMonth(seed) * 28;
    state.calendar = { ...state.calendar, month: firstOpenMonth(seed) };

    const output: GameEffect[] = [];
    expect(deliverWorldMessages(state, registryWith([linMessage]), balanceConfig, output)).toBe(0);
    expect(state.messages).toHaveLength(0);
  });

  it('delivers one attributed message when condition and gate both pass', () => {
    const seed = 4242;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    state.relationships['character.seed-lin'] = 40;
    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };

    const output: GameEffect[] = [];
    expect(deliverWorldMessages(state, registryWith([linMessage]), balanceConfig, output)).toBe(1);
    const delivered = state.messages![0];
    expect(delivered.title).toBe('林晨：测试消息');
    expect(delivered.characterId).toBe('character.seed-lin');
    expect(delivered.sourceId).toBe('world-message.test-lin');
    expect(delivered.day).toBe(month * 28);
    expect(state.worldMessageLog?.['world-message.test-lin']).toBe(month * 28);
  });

  it('never exceeds the monthly cap even when many messages are eligible', () => {
    const seed = 909;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    state.relationships['character.seed-lin'] = 90;
    state.relationships['character.seed-zhou'] = 90;
    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };

    const many: WorldMessageDefinition[] = [1, 2, 3, 4].map((index) => ({
      ...linMessage,
      id: `world-message.test-${index}`,
      weight: 10 - index,
    }));
    const output: GameEffect[] = [];
    expect(deliverWorldMessages(state, registryWith(many), balanceConfig, output)).toBe(WORLD_MESSAGE_MONTHLY_CAP);
    expect(state.messages).toHaveLength(WORLD_MESSAGE_MONTHLY_CAP);
  });

  it('respects cooldownDays for repeatable messages', () => {
    const seed = 606;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    state.relationships['character.seed-lin'] = 90;
    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };
    const registry = registryWith([linMessage]);

    expect(deliverWorldMessages(state, registry, balanceConfig, [])).toBe(1);

    // 冷却期内不再出现，即使门禁打开。
    const insideCooldown = { ...state.calendar, month };
    const laterDay = state.time.day + linMessage.cooldownDays - 1;
    state.time.day = laterDay;
    state.calendar = insideCooldown;
    expect(deliverWorldMessages(state, registry, balanceConfig, [])).toBe(0);

    // 冷却走完并且门禁打开时可以再次出现。
    const monthsForCooldown = Math.ceil(linMessage.cooldownDays / 28) + 1;
    let nextMonth = month + monthsForCooldown;
    for (let candidate = month + monthsForCooldown; candidate < month + 4000; candidate += 1) {
      if (hashPermille(seed, candidate, 'world-message-gate') < SPEAK_CHANCE_PERMILLE) { nextMonth = candidate; break; }
    }
    state.time.day = nextMonth * 28;
    state.calendar = { ...state.calendar, month: nextMonth };
    expect(deliverWorldMessages(state, registry, balanceConfig, [])).toBe(1);
  });

  it('never repeats a one-off message', () => {
    const seed = 1234;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    state.relationships['character.seed-lin'] = 90;
    const once = { ...linMessage, once: true, cooldownDays: 1 };
    const registry = registryWith([once]);

    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };
    expect(deliverWorldMessages(state, registry, balanceConfig, [])).toBe(1);
    expect(state.worldMessagesSeen).toContain('world-message.test-lin');

    // 冷却已经过去、门禁也打开，但一次性消息不再出现。
    let nextMonth = month;
    for (let candidate = month + 1; candidate < month + 4000; candidate += 1) {
      if (hashPermille(seed, candidate, 'world-message-gate') < SPEAK_CHANCE_PERMILLE) { nextMonth = candidate; break; }
    }
    state.time.day = nextMonth * 28;
    state.calendar = { ...state.calendar, month: nextMonth };
    expect(deliverWorldMessages(state, registry, balanceConfig, [])).toBe(0);
    expect(state.messages).toHaveLength(1);
  });

  it('does not touch the main random stream', () => {
    const seed = 777;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    state.relationships['character.seed-lin'] = 90;
    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };

    const before = JSON.stringify(state.rng);
    deliverWorldMessages(state, registryWith([linMessage]), balanceConfig, []);
    expect(JSON.stringify(state.rng)).toBe(before);
  });

  it('only speaks to characters the player actually knows', () => {
    const seed = 5150;
    const month = firstOpenMonth(seed);
    const state = createInitialState(contentRegistry, balanceConfig, seed);
    for (const character of contentRegistry.characters) state.relationships[character.id] = 0;
    state.time.day = month * 28;
    state.calendar = { ...state.calendar, month };

    // 关系为 0 时不做任何投递，即使条件里没有写关系门槛。
    const noCondition: WorldMessageDefinition = { ...linMessage, condition: undefined, weight: 99 };
    expect(deliverWorldMessages(state, registryWith([noCondition]), balanceConfig, [])).toBe(0);
  });
});
