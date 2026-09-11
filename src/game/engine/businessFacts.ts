import type { BusinessFacts, GameState, LifeRecordEntry } from '../content/contracts';

export function retentionKey(jobId: string, companyId?: string): string {
  return JSON.stringify([jobId, companyId ?? '']);
}

export function factsFromHistory(records: readonly LifeRecordEntry[], day: number): BusinessFacts {
  const facts: BusinessFacts = { history: 'partial', lastCompleted: {}, interactions: {}, retentionClaims: {} };
  for (const record of records) recordFact(facts, record, day);
  return facts;
}

export function recordFact(facts: BusinessFacts, record: LifeRecordEntry, day: number): void {
  if (!record.sourceId) return;
  if (record.category === 'activity' || record.category === 'service') {
    const key = `${record.category}:${record.sourceId}`;
    facts.lastCompleted[key] = Math.max(facts.lastCompleted[key] ?? -Infinity, record.day);
  }
  if (record.category === 'relationship' && record.day >= day - 30) {
    const days = facts.interactions[record.sourceId] ??= {};
    days[record.day] = (days[record.day] ?? 0) + 1;
    if (record.detail) {
      const details = (facts.relationshipDetails ??= {})[record.sourceId] ??= {};
      const detailDays = details[record.detail] ??= {};
      detailDays[record.day] = (detailDays[record.day] ?? 0) + 1;
    }
  }
}

export function recordBusinessFact(state: GameState, record: LifeRecordEntry): void {
  state.businessFacts ??= factsFromHistory(state.lifeHistory ?? [], state.time.day);
  recordFact(state.businessFacts, record, state.time.day);
  for (const days of Object.values(state.businessFacts.interactions)) {
    for (const day of Object.keys(days)) if (Number(day) < state.time.day - 30) delete days[day];
  }
  for (const details of Object.values(state.businessFacts.relationshipDetails ?? {})) {
    for (const [detail, days] of Object.entries(details)) {
      for (const day of Object.keys(days)) if (Number(day) < state.time.day - 30) delete days[day];
      if (!Object.keys(days).length) delete details[detail];
    }
  }
}

export function lastCompletedDay(state: GameState, category: 'activity' | 'service', id: string): number | undefined {
  // Legacy/in-memory fixtures may not yet have durable facts. Existing evidence
  // is also useful during transition; neither source is inferred from absence.
  const days = (state.lifeHistory ?? []).filter(r => r.category === category && r.sourceId === id).map(r => r.day);
  const durable = state.businessFacts?.lastCompleted[`${category}:${id}`];
  if (durable !== undefined) days.push(durable);
  return days.length ? Math.max(...days) : undefined;
}

export function recentInteractionCount(state: GameState, id: string): number {
  const days = state.businessFacts?.interactions[id];
  if (days) return Object.entries(days).reduce((sum, [day, count]) => Number(day) >= state.time.day - 30 ? sum + count : sum, 0);
  return (state.lifeHistory ?? []).filter(r => r.category === 'relationship' && r.sourceId === id && r.day >= state.time.day - 30).length;
}

export function recentGiftCount(state: GameState, itemId: string, characterName: string): number {
  const details = state.businessFacts?.relationshipDetails?.[itemId];
  if (details) return Object.entries(details).reduce((sum, [detail, days]) => !detail.includes(characterName) ? sum : sum + Object.entries(days).reduce((count, [day, n]) => Number(day) >= state.time.day - 30 ? count + n : count, 0), 0);
  return (state.lifeHistory ?? []).filter(entry => entry.category === 'relationship' && entry.sourceId === itemId && entry.detail?.includes(characterName) && entry.day >= state.time.day - 30).length;
}
