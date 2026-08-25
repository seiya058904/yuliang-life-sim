import { describe, expect, it } from 'vitest';
import { calendarForDay, weekdayLabel } from './calendar';

describe('calendar', () => {
  it('maps every seven days into a week and every four weeks into a month', () => {
    expect(calendarForDay(1)).toEqual({ week: 1, weekday: 1, month: 1, weekOfMonth: 1 });
    expect(calendarForDay(7)).toEqual({ week: 1, weekday: 7, month: 1, weekOfMonth: 1 });
    expect(calendarForDay(8)).toEqual({ week: 2, weekday: 1, month: 1, weekOfMonth: 2 });
    expect(calendarForDay(29)).toEqual({ week: 5, weekday: 1, month: 2, weekOfMonth: 1 });
  });

  it('labels weekdays for the planning grid', () => {
    expect(weekdayLabel(1)).toBe('一');
    expect(weekdayLabel(7)).toBe('日');
  });
});
