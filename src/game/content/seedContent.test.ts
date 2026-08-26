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

  it('exposes official character-specific interactions from the content registry', () => {
    expect(contentRegistry.relationshipInteractions?.filter((interaction) => interaction.contentStatus === 'official').map((interaction) => interaction.id)).toEqual([
      'interaction.coffee-with-recruiter',
      'interaction.tech-coffee',
      'interaction.dinner-with-agent',
    ]);
  });

  it('exposes official investment products from the content registry', () => {
    expect(contentRegistry.investments?.filter((investment) => investment.contentStatus === 'official').map((investment) => investment.id)).toEqual([
      'investment.flexible-savings',
      'investment.broad-market-index',
      'investment.technology-growth',
      'investment.commercial-reit',
    ]);
  });

  it('supports replacing one category while keeping the remaining Seed categories', () => {
    const result = composeContentRegistry({ jobs: [{ ...contentRegistry.jobs[0], id: 'job.seed-shop-clerk', contentStatus: 'official', name: '正式示例工作' }] });
    expect(result.jobs[0].id).toBe('job.seed-shop-clerk');
    expect(result.items[0].contentStatus).toBe('seed');
    expect(validateContent(result).valid).toBe(true);
  });
});
