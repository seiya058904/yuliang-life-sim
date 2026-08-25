import type { RngState } from '../content/contracts';

export interface RandomResult {
  value: number;
  rng: RngState;
}

function hashSeed(seed: number, cursor: number): number {
  let value = (seed + cursor * 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return (value ^ (value >>> 14)) >>> 0;
}

export function nextRandom(rng: RngState): RandomResult {
  const value = hashSeed(rng.seed, rng.cursor) / 0x100000000;
  return { value, rng: { ...rng, cursor: rng.cursor + 1 } };
}

export function randomInt(rng: RngState, min: number, max: number): RandomResult {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new Error('随机整数范围无效');
  }
  const result = nextRandom(rng);
  return { value: Math.floor(result.value * (max - min + 1)) + min, rng: result.rng };
}

export function randomPick<T>(rng: RngState, values: readonly T[]): { value: T | undefined; rng: RngState } {
  if (values.length === 0) return { value: undefined, rng };
  const result = randomInt(rng, 0, values.length - 1);
  return { value: values[result.value], rng: result.rng };
}

export function weightedPick<T>(rng: RngState, values: readonly T[], getWeight: (value: T) => number): { value: T | undefined; rng: RngState } {
  const candidates = values.filter((value) => getWeight(value) > 0);
  const total = candidates.reduce((sum, value) => sum + getWeight(value), 0);
  if (candidates.length === 0 || total <= 0) return { value: undefined, rng };
  const random = nextRandom(rng);
  let cursor = random.value * total;
  for (const candidate of candidates) {
    cursor -= getWeight(candidate);
    if (cursor < 0) return { value: candidate, rng: random.rng };
  }
  return { value: candidates[candidates.length - 1], rng: random.rng };
}

export function createRng(seed: number): RngState {
  return { seed: Math.trunc(seed), cursor: 0 };
}
