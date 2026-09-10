import type { GameState, ServiceDefinition } from '../content/contracts';

/** Returns the number of whole days before a recently completed service can be used again. */
export function serviceCooldownRemaining(state: GameState, service: ServiceDefinition): number {
  if (!service.cooldownDays || service.cooldownDays <= 0) return 0;
  const lastUse = [...(state.lifeHistory ?? [])].reverse().find((record) => record.category === 'service' && record.sourceId === service.id);
  if (!lastUse) return 0;
  return Math.max(0, service.cooldownDays - (state.time.day - lastUse.day));
}
