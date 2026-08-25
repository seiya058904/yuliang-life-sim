import type { ContentId, ContentRegistry, GameState, StorylineDefinition, StorylineStageDefinition } from '../content/contracts';

export function getStoryline(content: ContentRegistry, storylineId: ContentId): StorylineDefinition | undefined {
  return content.storylines?.find((storyline) => storyline.id === storylineId);
}

export function getStorylineStage(content: ContentRegistry, state: GameState, storylineId: ContentId): StorylineStageDefinition | undefined {
  const storyline = getStoryline(content, storylineId);
  const stageId = state.storylineStages?.[storylineId] ?? storyline?.initialStageId;
  return storyline?.stages.find((stage) => stage.id === stageId);
}

export function advanceStorylineStage(state: GameState, content: ContentRegistry, storylineId: ContentId, nextStageId: string): boolean {
  const storyline = getStoryline(content, storylineId);
  if (!storyline?.stages.some((stage) => stage.id === nextStageId)) return false;
  state.storylineStages ??= {};
  state.storylineStages[storylineId] = nextStageId;
  return true;
}
