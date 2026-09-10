import type { BalanceConfig } from '../balance/config';
import type { CharacterCareerEntry, CharacterDefinition, CompanyDefinition, ConditionDefinition, ContentRegistry, GameState } from '../content/contracts';
import { evaluateCondition } from './conditions';

export type BranchEvaluator = (condition: ConditionDefinition) => boolean;

interface StagedEntry {
  startYear: number;
  branchCondition?: ConditionDefinition;
}

/**
 * Pick the staged entry effective at `year`:
 * - only entries that have started count;
 * - among ties at the newest start year, a branch whose condition passes wins over the base entry.
 * This keeps later authored stages authoritative while letting world state reshape any single stage
 * (NPC can take an alternate path and later return to their base trajectory).
 */
function pickStaged<T extends StagedEntry>(entries: readonly T[], year: number, evalBranch?: BranchEvaluator): T | undefined {
  const candidates = entries.filter((entry) => entry.startYear <= year);
  if (candidates.length === 0) return undefined;
  const maxStart = Math.max(...candidates.map((entry) => entry.startYear));
  const ties = candidates.filter((entry) => entry.startYear === maxStart);
  const passingBranch = evalBranch ? ties.find((entry) => entry.branchCondition && evalBranch(entry.branchCondition)) : undefined;
  return passingBranch ?? ties.find((entry) => !entry.branchCondition) ?? ties[0];
}

export function makeWorldBranchEvaluator(state: GameState, content: ContentRegistry, balance: BalanceConfig): BranchEvaluator {
  return (condition) => evaluateCondition(condition, state, content, balance);
}

export function companyStageAt(
  company: Pick<CompanyDefinition, 'history'>,
  year: number,
  evalBranch?: BranchEvaluator,
): { title: string; startYear: number; fromBranch: boolean } | undefined {
  const stage = pickStaged(company.history ?? [], year, evalBranch);
  return stage ? { title: stage.title, startYear: stage.startYear, fromBranch: Boolean(stage.branchCondition) } : undefined;
}

export function characterCareerAt(
  character: Pick<CharacterDefinition, 'careerHistory'>,
  year: number,
  evalBranch?: BranchEvaluator,
): CharacterCareerEntry | undefined {
  return pickStaged(character.careerHistory ?? [], year, evalBranch);
}
