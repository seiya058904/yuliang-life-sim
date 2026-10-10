import { beforeEach, expect, it } from 'vitest';
import { balanceConfig as balance } from '../balance/config';
import { contentRegistry as content } from '../content/registry';
import { createInitialState } from '../engine/initialState';
import { createGameStore, saveGameState } from './gameStore';
import { canonicalSaveDouble, canonicalSaveHead, canonicalSaveRaw, failNextCanonicalCommit, settleCanonicalSave, settleFirstCanonicalCommit, yieldToCommitQueue } from './canonicalSaveTestDouble';

beforeEach(() => localStorage.clear());
const saved = () => JSON.parse(canonicalSaveRaw()!);
const seed = async () => { expect((await saveGameState(createInitialState(content, balance, 1))).ok).toBe(true); };

it('keeps reset generation rotation when a newer action supersedes the reset at the queue barrier', async () => {
  await seed();
  const before = canonicalSaveHead()!;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const store = createGameStore(content, balance, undefined, { beforeCommitRequest: () => gate });
  store.getState().reset(4242);
  await yieldToCommitQueue();
  store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
  release();
  await store.getState().flushSaveAsync();
  expect(canonicalSaveHead()?.generation).not.toBe(before.generation);
  expect(canonicalSaveHead()?.revision).toBe(1);
  expect(saved()).toMatchObject({ rng: { seed: 4242 }, simulationSpeed: 4 });
});

it('does not let a pre-reset in-flight completion clear the newer reset intent', async () => {
  await seed();
  const before = canonicalSaveHead()!;
  const store = createGameStore(content, balance);
  canonicalSaveDouble().hold();
  try {
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 2 });
    await yieldToCommitQueue();
    store.getState().reset(4242);
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
    await settleCanonicalSave();
    await store.getState().flushSaveAsync();
    expect(canonicalSaveHead()?.generation).not.toBe(before.generation);
    expect(canonicalSaveHead()?.revision).toBe(1);
    expect(saved()).toMatchObject({ rng: { seed: 4242 }, simulationSpeed: 4 });
  } finally { canonicalSaveDouble().release(); }
});

it('rotates for a second reset even while the first reset is still committing', async () => {
  await seed();
  const store = createGameStore(content, balance);
  canonicalSaveDouble().hold();
  try {
    store.getState().reset(4242);
    await yieldToCommitQueue();
    store.getState().reset(777);
    store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
    await settleFirstCanonicalCommit();
    const firstResetHead = canonicalSaveHead()!;
    expect(saved().rng.seed).toBe(4242);
    await settleCanonicalSave();
    await store.getState().flushSaveAsync();
    expect(canonicalSaveHead()?.generation).not.toBe(firstResetHead.generation);
    expect(canonicalSaveHead()?.revision).toBe(1);
    expect(saved()).toMatchObject({ rng: { seed: 777 }, simulationSpeed: 4 });
  } finally { canonicalSaveDouble().release(); }
});

it('retains a failed reset intent until a subsequent descendant save actually commits', async () => {
  await seed();
  const before = canonicalSaveHead()!;
  const store = createGameStore(content, balance);
  failNextCanonicalCommit('injected transaction failure');
  store.getState().reset(4242);
  expect(canonicalSaveHead()).toEqual(before);
  expect(store.getState().saveError).toBeDefined();
  store.getState().dispatch({ type: 'set_simulation_speed', speed: 4 });
  expect(canonicalSaveHead()?.generation).not.toBe(before.generation);
  expect(canonicalSaveHead()?.revision).toBe(1);
  expect(saved()).toMatchObject({ rng: { seed: 4242 }, simulationSpeed: 4 });
  expect(store.getState().saveError).toBeUndefined();
});

it('reports only the fixture helper write that actually wins a concurrent compare-and-commit', async () => {
  const state = createInitialState(content, balance, 1);
  const outcomes = await Promise.all([saveGameState({ ...state, cash: 100 }), saveGameState({ ...state, cash: 200 })]);
  expect(outcomes.filter(outcome => outcome.ok)).toHaveLength(1);
  expect(outcomes.find(outcome => !outcome.ok)).toMatchObject({ status: 'failed', error: '存档版本冲突，写入未完成' });
  expect(canonicalSaveHead()?.revision).toBe(1);
  const winner = outcomes[0].ok ? 100 : 200;
  expect(saved().cash).toBe(winner);
});
