import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentRegistry } from '../../content/registry';
import type { GameEffect } from '../../content/contracts';
import { ActionFeedback, describeEffects } from './ActionFeedback';

afterEach(() => vi.useRealTimers());

describe('action feedback', () => {
  it('names the actual attribute, contact and purchased item', () => {
    const lines = describeEffects([
      { type: 'stat', stat: 'mood', amount: 2 },
      { type: 'stat', stat: 'mood', amount: -1 },
      { type: 'relation', characterId: 'character.seed-lin', amount: 3 },
      { type: 'cash', amount: -160, reason: '吃饭' },
      { type: 'purchase', itemId: 'item.seed-coffee', quantity: 2, total: 24 },
      { type: 'unlock', kind: '能力', id: 'business_license' },
    ], contentRegistry).map(line => line.text);
    expect(lines).toContain('心情 +1');
    expect(lines).toContain('解锁能力 · 经营资格');
    expect(lines).toContain('与林晨的关系 +3');
    expect(lines).toContain('吃饭 −¥160');
    expect(lines).not.toContain('生活水平 +1');
    expect(lines.some(line => line.startsWith('已购买') && line.endsWith('×2'))).toBe(true);
  });

  it('keeps a purchase readable across ticks and expires it independently of newer feedback', () => {
    vi.useFakeTimers();
    const purchase: GameEffect[] = [{ type: 'purchase', itemId: 'item.seed-coffee', quantity: 1, total: 12 }];
    const { rerender } = render(<StrictMode><ActionFeedback effects={purchase} content={contentRegistry} /></StrictMode>);
    const rail = screen.getByRole('status', { name: '即时变化' });
    expect(rail.querySelectorAll('.action-receipt')).toHaveLength(1);
    act(() => vi.advanceTimersByTime(500));
    rerender(<StrictMode><ActionFeedback effects={[]} content={contentRegistry} /></StrictMode>);
    expect(rail).toHaveTextContent('已购买');
    act(() => vi.advanceTimersByTime(3000));
    rerender(<StrictMode><ActionFeedback effects={[{ type: 'message', text: '新的关系进展' }]} content={contentRegistry} /></StrictMode>);
    act(() => vi.advanceTimersByTime(701));
    expect(rail).not.toHaveTextContent('已购买');
    expect(rail).toHaveTextContent('新的关系进展');
    act(() => vi.advanceTimersByTime(3500));
    expect(rail).toBeEmptyDOMElement();
  });
});
