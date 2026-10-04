import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createInitialState } from '../engine/initialState';
import { useWeekScheduler } from './weekScheduler';

describe('week scheduling feedback', () => {
  it('does not announce success when the store rejects a plan', () => {
    const game = createInitialState(contentRegistry, balanceConfig, 1);
    const dispatch = vi.fn(() => false);
    const { result } = renderHook(() => useWeekScheduler(game, dispatch));
    act(() => { expect(result.current.schedule({ kind: 'study', durationMinutes: 120 }).placed).toBe(false); });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'set_plan' }));
    expect(result.current.notice).toContain('未生效');
    expect(result.current.notice).not.toContain('已安排');
  });
});
