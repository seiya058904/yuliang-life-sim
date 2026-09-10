import { describe, expect, it } from 'vitest';
import { advanceTime, formatClock } from './time';

describe('time engine', () => {
  it('advances hours across midnight and returns elapsed days', () => {
    expect(advanceTime({ day: 1, hour: 22, minute: 0 }, 5)).toEqual({
      time: { day: 2, hour: 3, minute: 0 },
      daysElapsed: 1,
    });
  });

  it('formats clock values as two-digit Chinese UI time', () => {
    expect(formatClock(8)).toBe('08:00');
    expect(formatClock(23, 26)).toBe('23:26');
  });
});
