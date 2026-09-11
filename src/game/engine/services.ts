import { lastCompletedDay } from './businessFacts';
import type { GameState, ServiceDefinition } from '../content/contracts';

/** Returns the number of whole days before a recently completed service can be used again. */
export function serviceCooldownRemaining(state: GameState, service: ServiceDefinition): number {
  if (!service.cooldownDays || service.cooldownDays <= 0) return 0;
  const last = lastCompletedDay(state, 'service', service.id);
  return last === undefined ? 0 : Math.max(0, service.cooldownDays - (state.time.day - last));
}
