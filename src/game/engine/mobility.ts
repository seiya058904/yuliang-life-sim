import type { CareerExperienceId, ContentRegistry, GameState, JobDefinition } from '../content/contracts';
import { careerExperienceLabel, requirementForJob } from './careerProgression';

export interface MobilityEntry {
  job: JobDefinition;
  /** Experience / qualification gaps, each already an actionable hint. */
  experienceGaps: ReturnType<typeof requirementForJob>;
  /** Hard numeric or item gaps outside the career system. */
  statGaps: string[];
  /** Owned experience in other industries that transfers as a factual base. */
  transferableStrengths: string[];
}

const allExperienceIds: readonly CareerExperienceId[] = ['office', 'operations', 'customer_service', 'retail', 'logistics', 'data', 'project', 'management', 'media', 'finance'];

/**
 * Cross-industry mobility view: nothing here hard-blocks a player. It surfaces the real,
 * factual distance to roles in other industries plus what they already bring along.
 */
export function buildMobilityEntries(content: Pick<ContentRegistry, 'jobs'>, state: GameState, limit = 6): MobilityEntry[] {
  const owned = Object.entries(state.careerExperience ?? {}).filter(([, value]) => value > 0) as [CareerExperienceId, number][];
  const entries: MobilityEntry[] = [];
  for (const job of content.jobs) {
    if (job.kind !== 'regular' || job.id === state.currentJobId) continue;
    const experienceGaps = requirementForJob(job, state);
    const statGaps: string[] = [];
    if (job.abilityRequired !== undefined && state.ability < job.abilityRequired) statGaps.push(`能力 ${job.abilityRequired}`);
    if (job.reputationRequired !== undefined && state.reputation < job.reputationRequired) statGaps.push(`声誉 ${job.reputationRequired}`);
    for (const capabilityId of job.requiredCapabilities ?? []) {
      if (!state.unlockedCapabilities.includes(capabilityId)) statGaps.push(`能力资格 ${capabilityId}`);
    }
    for (const itemId of job.requiredItems ?? []) {
      if ((state.inventory[itemId] ?? 0) < 1) statGaps.push(`缺少必要商品`);
      break;
    }
    const requiredIds = new Set(Object.keys(job.experienceRequired ?? {}));
    const transferableStrengths = owned
      .filter(([id]) => !requiredIds.has(id))
      .slice(0, 4)
      .map(([id]) => `${careerExperienceLabel(id)}经验`);
    if (experienceGaps.length === 0 && statGaps.length === 0) continue; // already reachable through the normal market
    entries.push({ job, experienceGaps, statGaps, transferableStrengths });
    void allExperienceIds;
  }
  // Fewest remaining steps first; on ties the higher-tier role leads so the panel shows a real direction of movement.
  return entries
    .sort((a, b) => (a.experienceGaps.length + a.statGaps.length) - (b.experienceGaps.length + b.statGaps.length) || b.job.basePay - a.job.basePay)
    .slice(0, limit);
}
