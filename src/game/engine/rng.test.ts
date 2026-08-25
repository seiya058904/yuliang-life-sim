import { describe, expect, it } from 'vitest';
import { nextRandom, randomInt, weightedPick } from './rng';

describe('seeded rng', () => {
  it('replays the same sequence for the same seed', () => {
    const first = nextRandom({ seed: 42, cursor: 0 });
    const second = nextRandom({ seed: 42, cursor: 0 });
    expect(first).toEqual(second);
  });

  it('returns an integer inside an inclusive range and advances cursor', () => {
    const result = randomInt({ seed: 7, cursor: 0 }, 2, 4);
    expect(result.value).toBeGreaterThanOrEqual(2);
    expect(result.value).toBeLessThanOrEqual(4);
    expect(result.rng.cursor).toBe(1);
  });

  it('respects weighted zero and non-zero candidates', () => {
    expect(weightedPick({ seed: 3, cursor: 0 }, [{ id: 'blocked', weight: 0 }, { id: 'open', weight: 1 }], (entry) => entry.weight).value?.id).toBe('open');
  });
});
