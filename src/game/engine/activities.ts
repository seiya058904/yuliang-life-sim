import type { ActivityDefinition, ActivityOption, ContentId, ContentRegistry, GameState } from '../content/contracts';

export function getActivityDefinition(content: ContentRegistry, activityId: ContentId): ActivityDefinition | undefined {
  return (content.activities ?? []).find((activity) => activity.id === activityId);
}

export function getActivityOption(activity: ActivityDefinition, optionId: string): ActivityOption | undefined {
  return activity.options.find((option) => option.id === optionId);
}

export function activityCooldownRemaining(state: GameState, definition: ActivityDefinition, option: ActivityOption): number {
  if (!option.cooldownDays) return 0;
  const lastDay = (state.lifeHistory ?? []).filter((record) => record.category === 'activity' && record.sourceId === definition.id).reduce<number | undefined>((latest, record) => Math.max(latest ?? record.day, record.day), undefined);
  if (lastDay === undefined) return 0;
  return Math.max(0, option.cooldownDays - (state.time.day - lastDay));
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

const interestLabels: Record<string, string> = { film: '电影', photography: '摄影', music: '音乐', cooking: '烹饪', cycling: '骑行', game: '游戏', travel: '旅行' };

export function interestFamiliarityLabel(tag: string): string {
  return interestLabels[tag] ?? tag;
}

export function interestFamiliarityStage(value: number): string {
  return ['刚开始', '熟悉', '熟练', '进阶'][Math.min(3, Math.max(0, Math.floor(value)))] ?? '刚开始';
}

export function applyActivityFamiliarity(state: GameState, definition: ActivityDefinition): string[] {
  if (!definition.familiarityTags?.length) return [];
  state.interestFamiliarity ??= {};
  const improved: string[] = [];
  for (const tag of definition.familiarityTags) {
    const current = Math.min(3, Math.max(0, state.interestFamiliarity[tag] ?? 0));
    if (current >= 3) continue;
    state.interestFamiliarity[tag] = current + 1;
    improved.push(`${interestFamiliarityLabel(tag)}兴趣${interestFamiliarityStage(current + 1)}`);
  }
  return improved;
}
