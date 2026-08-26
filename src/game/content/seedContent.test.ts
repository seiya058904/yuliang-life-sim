import { describe, expect, it } from 'vitest';
import { contentRegistry } from './registry';
import { validateContent } from './validateContent';
import { composeContentRegistry } from './registry';

describe('seed content registry', () => {
  it('is valid and can run as the default content pack', () => {
    expect(validateContent(contentRegistry)).toEqual({ valid: true, errors: [] });
  });

  it('exposes official lifestyle activities from the content registry', () => {
    expect(contentRegistry.activities?.filter((activity) => activity.contentStatus === 'official').map((activity) => activity.id)).toEqual([
      'activity.casual-meal',
      'activity.cinema',
      'activity.cafe-break',
    ]);
  });

  it('supports replacing one category while keeping the remaining Seed categories', () => {
    const result = composeContentRegistry({ jobs: [{ ...contentRegistry.jobs[0], id: 'job.seed-shop-clerk', contentStatus: 'official', name: '正式示例工作' }] });
    expect(result.jobs[0].id).toBe('job.seed-shop-clerk');
    expect(result.items[0].contentStatus).toBe('seed');
    expect(validateContent(result).valid).toBe(true);
  });
});
