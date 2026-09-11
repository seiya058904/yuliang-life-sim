import { useCallback, useState } from 'react';
import type { GameAction, GameState, PlannedActivity } from '../content/contracts';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { findNextSchedulableSlot, weekdayLabel, slotLabel } from '../engine/planning';

export interface ScheduleOutcome {
  placed: boolean;
  /** Player-facing explanation when nothing could be scheduled. */
  message?: string;
}

/**
 * The single UI entry point for "安排到本周". Every market screen (课程 / 商店活动 /
 * 长期兼职) goes through the shared planning scheduler, so no screen can write
 * its own slot-finding policy and no click can silently do nothing.
 */
export function useWeekScheduler(game: GameState, dispatch: (action: GameAction) => void) {
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const schedule = useCallback((candidate: PlannedActivity, options?: { label?: string }): ScheduleOutcome => {
    const search = findNextSchedulableSlot(
      { weekday: game.calendar.weekday, slot: 'evening', activity: candidate },
      game,
      contentRegistry,
      balanceConfig,
      { from: 'current' },
    );
    if (!search.found || !search.result) {
      const message = search.reason ?? '本周剩余时间没有可用的计划格';
      setNotice(message);
      return { placed: false, message };
    }
    dispatch({ type: 'set_plan', weekday: search.result.weekday, slot: search.result.slot, activity: candidate });
    setNotice(`已安排：周${weekdayLabel(search.result.weekday)}${slotLabel(search.result.slot)}${options?.label ? ` · ${options.label}` : ''}`);
    return { placed: true };
  }, [dispatch, game]);

  const clearNotice = useCallback(() => setNotice(undefined), []);
  return { schedule, notice, clearNotice };
}
