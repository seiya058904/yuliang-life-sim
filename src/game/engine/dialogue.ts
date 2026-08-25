import type { ContentId, ContentRegistry, DialogueDefinition, GameState } from '../content/contracts';
import { evaluateCondition } from './conditions';
import type { BalanceConfig } from '../balance/config';

export function getDialogue(content: ContentRegistry, dialogueId: ContentId): DialogueDefinition | undefined {
  return content.dialogues?.find((dialogue) => dialogue.id === dialogueId);
}

export function availableDialogueChoices(dialogue: DialogueDefinition, state: GameState, content: ContentRegistry, balance: BalanceConfig) {
  return (dialogue.choices ?? []).filter((choice) => !choice.condition || evaluateCondition(choice.condition, state, content, balance));
}
