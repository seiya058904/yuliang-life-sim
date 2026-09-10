import { describe, expect, it } from 'vitest';
import { characterCareerAt, companyStageAt } from './worldEvolution';

describe('world evolution staged selection', () => {
  const history = [
    { startYear: 1, title: '起步' },
    { startYear: 4, title: '常规扩张' },
    { startYear: 4, title: '并购整合', branchCondition: undefined as never },
    { startYear: 8, title: '成熟期' },
  ];
  const flagGate = () => true;
  const brokenGate = () => false;

  it('prefers a passing branch over the base stage at the same year', () => {
    const entries = [
      { startYear: 1, title: '起步' },
      { startYear: 4, title: '常规扩张' },
      { startYear: 4, title: '并购整合', branchCondition: { type: 'flag' as const, flag: 'demo_flag' } },
    ];
    expect(companyStageAt({ history: entries }, 5, flagGate)?.title).toBe('并购整合');
    expect(companyStageAt({ history: entries }, 5, brokenGate)?.title).toBe('常规扩张');
    expect(companyStageAt({ history: entries }, 5)?.title).toBe('常规扩张');
  });

  it('lets later authored stages supersede an earlier branch so trajectories return', () => {
    const career = {
      careerHistory: [
        { startYear: 1, title: '门店员工' },
        { startYear: 3, title: '电商运营助理' },
        { startYear: 3, title: '工作室联合创始人', branchCondition: { type: 'completed_event' as const, eventId: 'event.demo' } },
        { startYear: 6, title: '高级运营' },
      ],
    };
    expect(characterCareerAt(career, 4, flagGate)?.title).toBe('工作室联合创始人');
    expect(characterCareerAt(career, 6, flagGate)?.title).toBe('高级运营');
    expect(characterCareerAt(career, 2, flagGate)?.title).toBe('门店员工');
    expect(characterCareerAt(career, 0, flagGate)).toBeUndefined();
  });
});
