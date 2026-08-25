import type { LifeRecordEntry } from '../content/contracts';

export function appendLifeRecord(entries: readonly LifeRecordEntry[], record: LifeRecordEntry): LifeRecordEntry[] {
  if (entries.some((entry) => entry.id === record.id)) return [...entries];
  return [...entries, record];
}
