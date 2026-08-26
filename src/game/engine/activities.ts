import type { ActivityDefinition, ActivityOption, ContentId, ContentRegistry, GameState } from '../content/contracts';

export function getActivityDefinition(content: ContentRegistry, activityId: ContentId): ActivityDefinition | undefined {
  return (content.activities ?? []).find((activity) => activity.id === activityId);
}

export function getActivityOption(activity: ActivityDefinition, optionId: string): ActivityOption | undefined {
  return activity.options.find((option) => option.id === optionId);
}

export function activityCashCost(state: GameState, definition: ActivityDefinition, option: ActivityOption, content: ContentRegistry): number {
  const ownsVehicle = definition.category === 'travel'
    && (content.assets ?? []).some((asset) => asset.kind === 'vehicle' && Boolean(state.assets[asset.id]));
  return ownsVehicle ? Math.round(option.cashCost * 0.8) : option.cashCost;
}
