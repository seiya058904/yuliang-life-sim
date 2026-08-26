import { describe, expect, it } from 'vitest';
import { contentRegistry } from '../content/registry';
import { balanceConfig } from '../balance/config';
import { createInitialState } from './initialState';
import { applyCareerExperience, careerExperienceStage, requirementForJob } from './careerProgression';

describe('career progression', () => {
  it('advances tagged experience and unlocks a qualification exactly once', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    const first = applyCareerExperience(state, ['office'], 21);
    expect(first.experience.office).toBe(21);
    expect(first.qualificationIds).toContain('office_basics');
    expect(first.newQualificationIds).toEqual(['office_basics']);
    const second = applyCareerExperience(state, ['office'], 1);
    expect(second.newQualificationIds).toEqual([]);
    expect(careerExperienceStage(21)).toBe('熟悉');
  });

  it('uses tagged experience and qualification requirements in job hints', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    const job = contentRegistry.jobs.find((entry) => entry.id === 'job.operations-specialist')!;
    const unmet = requirementForJob(job, state);
    expect(unmet.some((hint) => hint.requirementId === 'experience:operations')).toBe(true);
    applyCareerExperience(state, ['operations', 'office'], 25);
    expect(requirementForJob(job, state)).toEqual([]);
  });
});
