import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';
import App from './App';
import { appStore } from './App';

describe('余量 app flow', () => {
  beforeEach(() => { localStorage.clear(); appStore.getState().reset(1); localStorage.clear(); });

  it('shows the living clock and lets the player plan, start, and pause a week', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: '余量' })).toBeInTheDocument();
    expect(screen.getByText('第 1 周')).toBeInTheDocument();
    expect(screen.getByText('便利店店员')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /周一晚间计划/ }));
    expect(screen.getByText(/学习 4 小时/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始本周' }));
    expect(screen.getByText('运行中')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停' }));
    expect(screen.getByText('已暂停')).toBeInTheDocument();
  });

  it('submits a public-market application without reopening the legacy recruitment dialog', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: '申请职位' })[0]);
    await user.click(screen.getByRole('button', { name: '我的申请' }));
    expect(screen.getByText(/当前竞争力：/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('browses the official shop without time passing and checks out multiple items once', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '商店' }));
    await user.click(screen.getByRole('button', { name: '加入购物袋：现磨咖啡' }));
    await user.click(screen.getByRole('button', { name: '加入购物袋：实用手机' }));
    expect(screen.getByText('购物袋（2）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '一次购买' }));
    expect(screen.getByTestId('date-value')).toHaveTextContent('08:00');
    expect(screen.getByTestId('cash-value')).toHaveTextContent('¥62');
  });
});
