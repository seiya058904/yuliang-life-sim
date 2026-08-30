import { describe, expect, it } from 'vitest';
import { displayContentName, displaySettlementHighlightLabel, humanizeContentId } from './displayNames';

describe('display names', () => {
  it('prefers authored content names over canonical ids', () => {
    expect(displayContentName('job.shop-clerk', [{ id: 'job.shop-clerk', name: '便利店店员' }])).toBe('便利店店员');
  });

  it('turns an unknown legacy id into readable Chinese-facing text', () => {
    expect(humanizeContentId('qualification.people_management_basics')).toBe('People Management Basics');
    expect(displayContentName('company.river-logistics', [])).toBe('River Logistics');
  });

  it('translates canonical experience ids inside settlement highlight copy', () => {
    expect(displaySettlementHighlightLabel('获得 retail_operations_experience')).toBe('获得 零售运营经验');
    expect(displaySettlementHighlightLabel('累计 client_service_experience 20')).toBe('累计 客户服务经验 20');
  });

  it('humanizes unknown legacy tokens instead of exposing snake_case', () => {
    expect(displaySettlementHighlightLabel('获得 legacy_skill_track')).toBe('获得 Legacy Skill Track');
  });
});
