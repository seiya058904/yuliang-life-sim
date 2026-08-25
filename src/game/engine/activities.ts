import type { ActivityDefinition, ActivityOption, ContentId, ContentRegistry } from '../content/contracts';

export function getActivityDefinition(content: ContentRegistry, activityId: ContentId): ActivityDefinition | undefined {
  return (content.activities ?? []).find((activity) => activity.id === activityId);
}

export function getActivityOption(activity: ActivityDefinition, optionId: string): ActivityOption | undefined {
  return activity.options.find((option) => option.id === optionId);
}
