import { describe, expect, it } from 'vitest';
import type { LifeRecordEntry } from '../content/contracts';
import { appendLifeRecord } from './lifeHistory';

describe('life history helper', () => {
  it('appends a canonical record once per stable id without mutating the input list', () => {
    const existing: LifeRecordEntry[] = [{ id: 'career.1', day: 1, category: 'career', title: '接受便利店店员 Offer' }];

    const appended = appendLifeRecord(existing, { id: 'purchase.1', day: 2, category: 'purchase', title: '购买现磨咖啡', amount: -18 });
    const duplicate = appendLifeRecord(appended, { id: 'purchase.1', day: 2, category: 'purchase', title: '购买现磨咖啡', amount: -18 });

    expect(existing).toHaveLength(1);
    expect(appended).toHaveLength(2);
    expect(duplicate).toEqual(appended);
  });
});
