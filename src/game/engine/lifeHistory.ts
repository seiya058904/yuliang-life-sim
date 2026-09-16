import type { GameState, LifeRecordEntry } from '../content/contracts';
import { recordBusinessFact } from './businessFacts';

export function appendLifeRecord(entries: readonly LifeRecordEntry[], record: LifeRecordEntry): LifeRecordEntry[] {
  if (entries.some((entry) => entry.id === record.id)) return [...entries];
  return [...entries, record];
}

/**
 * Appends a life record to the state, assigning the stable id (and day) when the
 * caller does not pin them, and keeping the derived business facts in step.
 * Shared by the action dispatcher and by the gig lifecycle.
 */
export function addLifeRecord(state: GameState, record: Omit<LifeRecordEntry, 'id' | 'day'> & { id?: string; day?: number }): void {
  const source = (record.sourceId ?? record.title).replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || record.category;
  state.nextLifeRecordSequence = (state.nextLifeRecordSequence ?? state.lifeHistory?.length ?? 0) + 1;
  const nextRecord: LifeRecordEntry = {
    id: record.id ?? `life.${record.category}.${source}.${record.day ?? state.time.day}.${state.nextLifeRecordSequence}`,
    day: record.day ?? state.time.day,
    category: record.category,
    title: record.title,
    detail: record.detail,
    sourceId: record.sourceId,
    amount: record.amount,
  };
  if (!(state.lifeHistory ?? []).some(entry => entry.id === nextRecord.id)) recordBusinessFact(state, nextRecord);
  state.lifeHistory = appendLifeRecord(state.lifeHistory ?? [], nextRecord);
}
