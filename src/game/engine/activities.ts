import type { ActivityDefinition, ActivityOption, ContentId, ContentRegistry, GameState } from '../content/contracts';

export function getActivityDefinition(content: ContentRegistry, activityId: ContentId): ActivityDefinition | undefined {
  return (content.activities ?? []).find((activity) => activity.id === activityId);
}

export function getActivityOption(activity: ActivityDefinition, optionId: string): ActivityOption | undefined {
  return activity.options.find((option) => option.id === optionId);
}

export function activityCashCost(state: GameState, definition: ActivityDefinition, option: ActivityOption, content: ContentRegistry): number {
  const locationLevel = Math.min(5, Math.max(0, state.locationDevelopment?.[definition.locationId ?? ''] ?? 0));
  const developmentFactor = 1 - locationLevel * 0.01;
  const ownsVehicle = definition.category === 'travel'
    && (content.assets ?? []).some((asset) => asset.kind === 'vehicle' && Boolean(state.assets[asset.id]));
  return Math.round(option.cashCost * developmentFactor * (ownsVehicle ? 0.8 : 1));
}

export function activityDiscountLabel(state: GameState, definition: ActivityDefinition, content: ContentRegistry): '自驾优惠' | '地点发展优惠' | undefined {
  const locationLevel = Math.min(5, Math.max(0, state.locationDevelopment?.[definition.locationId ?? ''] ?? 0));
  const ownsVehicle = definition.category === 'travel'
    && (content.assets ?? []).some((asset) => asset.kind === 'vehicle' && Boolean(state.assets[asset.id]));
  if (ownsVehicle) return '自驾优惠';
  return locationLevel > 0 ? '地点发展优惠' : undefined;
}
