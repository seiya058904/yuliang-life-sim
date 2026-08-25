import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { vocabulary } from './vocabulary';
import { balanceConfig } from '../balance/config';

describe('content capability handoff', () => {
  it('documents every registered capability, tag, reward tier and stage threshold', () => {
    const guide = readFileSync(resolve(process.cwd(), 'docs/CONTENT-CAPABILITIES.md'), 'utf8');
    for (const value of [...vocabulary.capabilities, ...vocabulary.tags]) expect(guide).toContain(value);
    for (const tier of Object.keys(balanceConfig.rewardTiers)) expect(guide).toContain(tier);
    for (const threshold of Object.values(balanceConfig.stageThresholds)) expect(guide).toContain(threshold.toLocaleString('en-US'));
  });
});
