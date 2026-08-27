import { describe, expect, it } from 'vitest';
import { displayContentName, humanizeContentId } from './displayNames';

describe('display names', () => {
  it('prefers authored content names over canonical ids', () => {
    expect(displayContentName('job.shop-clerk', [{ id: 'job.shop-clerk', name: '便利店店员' }])).toBe('便利店店员');
  });

  it('turns an unknown legacy id into readable Chinese-facing text', () => {
    expect(humanizeContentId('qualification.people_management_basics')).toBe('People Management Basics');
    expect(displayContentName('company.river-logistics', [])).toBe('River Logistics');
  });
});
