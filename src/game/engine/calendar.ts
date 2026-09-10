import type { CalendarState, Weekday } from '../content/contracts';

const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const LABELS: Record<Weekday, string> = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日' };

export function calendarForDay(day: number): CalendarState {
  if (!Number.isInteger(day) || day < 1) throw new Error('日历天数必须从 1 开始');
  const week = Math.floor((day - 1) / 7) + 1;
  const weekday = WEEKDAYS[(day - 1) % 7];
  return { week, weekday, month: Math.floor((week - 1) / 4) + 1, weekOfMonth: ((week - 1) % 4 + 1) as 1 | 2 | 3 | 4 };
}

export function weekdayLabel(weekday: Weekday): string {
  return LABELS[weekday];
}
