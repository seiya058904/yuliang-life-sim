export interface GameTime {
  day: number;
  hour: number;
  minute: number;
}

export interface TimeAdvanceResult {
  time: GameTime;
  daysElapsed: number;
}

export function advanceTime(time: GameTime, hours: number): TimeAdvanceResult {
  if (!Number.isInteger(hours) || hours < 0) {
    throw new Error('时间推进必须是非负整数小时');
  }
  const advanced = advanceMinutes(time, hours * 60);
  return {
    time: advanced.time,
    daysElapsed: advanced.daysElapsed,
  };
}

export function advanceMinutes(time: GameTime, minutes: number): TimeAdvanceResult {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new Error('时间推进必须是非负整数分钟');
  }
  const absoluteMinute = (time.day - 1) * 24 * 60 + time.hour * 60 + time.minute + minutes;
  const day = Math.floor(absoluteMinute / (24 * 60)) + 1;
  const minuteOfDay = absoluteMinute % (24 * 60);
  return {
    time: { day, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 },
    daysElapsed: day - time.day,
  };
}

export function absoluteMinute(time: GameTime): number {
  return (time.day - 1) * 24 * 60 + time.hour * 60 + time.minute;
}

export function formatClock(hour: number, minute = 0): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('时钟小时必须在 0 到 23 之间');
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error('时钟分钟必须在 0 到 59 之间');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatDate(time: GameTime): string {
  return `第 ${time.day} 天 · ${formatClock(time.hour, time.minute)}`;
}
