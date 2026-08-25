import type { AttributeId, AttributeValues, GameState } from '../content/contracts';

export const ATTRIBUTE_IDS: readonly AttributeId[] = ['professional', 'knowledge', 'communication', 'fitness', 'appearance', 'network', 'mood'];

export function createInitialAttributes(ability: number, lifestyle: number): AttributeValues {
  return {
    professional: ability,
    knowledge: ability,
    communication: ability,
    fitness: ability,
    appearance: Math.max(0, lifestyle),
    network: 0,
    mood: 50,
  };
}

export function calculateLegacyAbility(attributes: AttributeValues): number {
  return Math.round((attributes.professional + attributes.knowledge + attributes.communication + attributes.fitness) / 4);
}

export function migrateAttributes(raw: Partial<AttributeValues> | undefined, legacyAbility: number, lifestyle: number, relationships: Record<string, number>): AttributeValues {
  const base = createInitialAttributes(legacyAbility, lifestyle);
  const next = { ...base, ...(raw ?? {}) };
  if (!raw) {
    const relationValues = Object.values(relationships);
    next.network = relationValues.length ? Math.round(relationValues.reduce((sum, value) => sum + value, 0) / relationValues.length) : 0;
  }
  return Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, Math.max(0, Math.round(next[id] ?? base[id]))])) as AttributeValues;
}

export function syncLegacyAbility(state: GameState): void {
  if (!state.attributes) state.attributes = createInitialAttributes(state.ability, state.lifestyle);
  state.ability = calculateLegacyAbility(state.attributes);
}

export function applyAttributeDelta(state: GameState, attribute: AttributeId, amount: number): void {
  if (!state.attributes) state.attributes = createInitialAttributes(state.ability, state.lifestyle);
  state.attributes[attribute] = Math.max(0, state.attributes[attribute] + amount);
  syncLegacyAbility(state);
}

export function getAttribute(state: GameState, attribute: AttributeId): number {
  if (state.attributes?.[attribute] !== undefined) return state.attributes[attribute];
  if (attribute === 'professional' || attribute === 'knowledge' || attribute === 'communication' || attribute === 'fitness') return state.ability;
  return attribute === 'appearance' ? state.lifestyle : attribute === 'mood' ? 50 : 0;
}
