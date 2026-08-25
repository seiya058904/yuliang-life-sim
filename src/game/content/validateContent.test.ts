import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from './contracts';
import { validateContent } from './validateContent';

const validRegistry: ContentRegistry = {
  jobs: [{
    id: 'job.seed', contentStatus: 'seed', name: '测试工作', description: '用于测试。', tags: ['work'],
    kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 100, careerXp: 1, isLongTerm: true,
  }],
  items: [{
    id: 'item.seed', contentStatus: 'seed', name: '测试商品', description: '用于测试。', tags: ['basic'],
    category: 'technology', price: 100, consumable: false, sellable: true, resaleRatio: 0.5, lifestyleDelta: 1,
  }],
  housing: [{
    id: 'housing.seed', contentStatus: 'seed', name: '测试住房', description: '用于测试。', tags: ['starter'],
    mode: 'both', rentPerDay: 10, price: 500, valuation: 500, lifestyleDelta: 1, furnitureCapacity: 2,
  }],
  businesses: [], assets: [], characters: [], events: [], eventChains: [], milestones: [],
  vocabulary: { capabilities: ['remote_work'], tags: ['work', 'basic', 'starter'] },
};

describe('content validator', () => {
  it('accepts a coherent registry', () => {
    expect(validateContent(validRegistry)).toEqual({ valid: true, errors: [] });
  });

  it('rejects duplicate IDs and unknown references', () => {
    const invalid: ContentRegistry = {
      ...validRegistry,
      jobs: [validRegistry.jobs[0], { ...validRegistry.jobs[0], name: '重复工作' }],
      items: [{ ...validRegistry.items[0], requiredItems: undefined, effects: [{ type: 'unlock_job', jobId: 'job.missing' }] } as never],
    };
    const result = validateContent(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/重复 ID|job\.missing/);
  });

  it('rejects an event option with only uncompensated loss', () => {
    const invalid: ContentRegistry = {
      ...validRegistry,
      events: [{
        id: 'event.loss', contentStatus: 'seed', name: '负面测试', description: '测试', tags: ['life'],
        title: '测试', body: '测试', category: 'life', weight: 1, cooldownDays: 1,
        choices: [{ id: 'loss', text: '损失', effects: [{ type: 'cash', amount: -50 }] }],
      }],
    };
    const result = validateContent(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/正向价值/);
  });

  it('does not treat a reward tier as compensation for negative cash', () => {
    const invalid: ContentRegistry = {
      ...validRegistry,
      events: [{
        id: 'event.tier-loss', contentStatus: 'seed', name: '负面测试', description: '测试', tags: ['life'],
        title: '测试', body: '测试', category: 'life', weight: 1, cooldownDays: 1,
        choices: [{ id: 'loss', text: '损失', effects: [{ type: 'cash', amount: -50, rewardTier: 'large' }] }],
      }],
    };
    expect(validateContent(invalid).valid).toBe(false);
  });

  it('rejects impossible event conditions and unknown capabilities', () => {
    const invalid: ContentRegistry = {
      ...validRegistry,
      events: [{
        id: 'event.impossible', contentStatus: 'seed', name: '不可达测试', description: '测试', tags: ['life'],
        title: '测试', body: '测试', category: 'life', weight: 1, cooldownDays: 1,
        conditions: { type: 'all', conditions: [{ type: 'day_at_least', day: 10 }, { type: 'day_at_most', day: 5 }, { type: 'has_capability', capability: 'missing_capability' }] },
        choices: [{ id: 'ok', text: '继续', effects: [{ type: 'stat', stat: 'ability', amount: 1 }] }],
      }],
    };
    const result = validateContent(invalid);
    expect(result.valid).toBe(false);
    expect(result.warnings?.join('\n')).toMatch(/可能无法触发/);
    expect(result.errors.join('\n')).toMatch(/未知 Capability/);
  });

  it('rejects invalid job schedules and unknown recruiter characters', () => {
    const invalid: ContentRegistry = {
      ...validRegistry,
      jobs: [{
        ...validRegistry.jobs[0],
        schedule: { workDays: [0] as never, startMinute: 900, endMinute: 800 },
        recruiterCharacterId: 'character.missing',
      }],
    };
    const result = validateContent(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/排班|招聘人物/);
  });
});
