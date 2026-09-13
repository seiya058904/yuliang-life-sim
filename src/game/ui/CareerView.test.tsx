import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameState } from '../content/contracts';
import { dispatchGameAction } from '../engine/actions';
import { createInitialState } from '../engine/initialState';
import { CareerView } from './CareerView';

const initialState = (): GameState => createInitialState(contentRegistry, balanceConfig, 5);

describe('职业市场岗位卡片状态', () => {
  it('当前职位显示“现任职于此”且按钮禁用，engine 兜底仍拒绝重复申请', () => {
    const state = initialState();
    const dispatch = vi.fn();
    render(<CareerView game={state} dispatch={dispatch} jobs={contentRegistry.jobs} />);
    const card = screen.getByRole('button', { name: '查看岗位详情：便利店店员' }).closest('article')!;
    expect(within(card).getByText('这是你当前的工作')).toBeTruthy();
    const applyButton = within(card).getByRole('button', { name: '现任职于此：便利店店员' }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);

    // engine 的最终保护保留：即使绕过 UI 提交，也会被拒绝。
    const vacancy = state.vacancies!.find((entry) => entry.jobId === state.currentJobId)!;
    const result = dispatchGameAction(state, { type: 'submit_application', vacancyId: vacancy.vacancyId }, contentRegistry, balanceConfig);
    expect(result.error).toBe('你已经在这份工作中');
  });

  it('岗位详情的门槛读数使用比较语义而不是“58/10”', async () => {
    const user = userEvent.setup();
    render(<CareerView game={initialState()} dispatch={vi.fn()} jobs={contentRegistry.jobs} />);
    await user.click(screen.getByRole('button', { name: '查看岗位详情：仓库理货员' }));
    // 初始能力 10，仓库理货员要求 10：已满足时读数应明确表达比较结果。
    expect(screen.getByText('10 ≥ 10 · 已满足')).toBeTruthy();
    expect(screen.queryByText(/^10\/10$/)).toBeNull();
  });
});
