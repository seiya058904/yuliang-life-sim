import { expect, test, type Page } from '@playwright/test';
import { balanceConfig, mergeBalanceConfig } from '../src/game/balance/config';
import { contentRegistry as content } from '../src/game/content/registry';
import type { GameAction, GameState } from '../src/game/content/contracts';
import { dispatchGameAction } from '../src/game/engine/actions';
import { calendarForDay } from '../src/game/engine/calendar';
import { createInitialState } from '../src/game/engine/initialState';
import { awaitAppReady, awaitCanonicalSynced, bootWithBridge, navigate, writeCanonicalState } from './harness';

const fixtureBalance = mergeBalanceConfig({ eventDailyLimit: 0 });

function act(state: GameState, action: GameAction): GameState {
  const result = dispatchGameAction(state, action, content, fixtureBalance);
  expect(result.error, action.type).toBeUndefined();
  return result.state;
}

async function seed(page: Page, state: GameState) {
  await bootWithBridge(page);
  await writeCanonicalState(page, state);
  await page.reload();
  await awaitAppReady(page);
  await expect(page.locator('.life-planning-section')).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === 'mobile'
    ? { width: 932, height: 430 }
    : { width: 1448, height: 1086 });
});

test('copying last week through the planner preserves the elapsed slot and copies future plans', async ({ page }) => {
  let state = createInitialState(content, fixtureBalance, 1);
  state = act(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'free' } });
  state = act(state, { type: 'set_plan', weekday: 2, slot: 'evening', activity: { kind: 'free' } });
  state = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 779 });
  state = act(state, { type: 'pause_simulation' });
  expect(state.time).toEqual({ day: 1, hour: 20, minute: 59 });
  await seed(page, state);

  const current = page.getByRole('button', { name: '周一晚间计划（进行中）', exact: true });
  const future = page.getByRole('button', { name: '周二晚间计划', exact: true });
  await expect(current).toBeDisabled();
  await expect(current).toContainText('自由活动');
  await expect(future).toContainText('自由活动');
  const before = await page.evaluate(() => structuredClone(window.__yuliang!.store.getState().game));
  await page.getByRole('button', { name: '使用上周计划', exact: true }).click();
  await expect(future).toContainText('学习 2 小时');
  const copied = await page.evaluate(() => structuredClone(window.__yuliang!.store.getState().game));

  // The copy is real UI input. Advance exactly one simulation minute through
  // the existing debug seam so a browser RAF cannot overshoot the boundary.
  const advanced = await page.evaluate(() => {
    const store = window.__yuliang!.store;
    const actions = [
      store.getState().dispatch({ type: 'resume_simulation' }),
      store.getState().dispatch({ type: 'advance_simulation', minutes: 1 }),
      store.getState().dispatch({ type: 'pause_simulation' }),
    ];
    return { actions, game: structuredClone(store.getState().game) };
  });
  expect(advanced.actions).toEqual([true, true, true]);
  expect(advanced.game.time).toEqual({ day: 1, hour: 21, minute: 0 });
  expect(advanced.game.attributes.knowledge, 'copying history must not pay a full study reward for one minute').toBe(before.attributes.knowledge);
  expect(copied.weeklyPlan.days[1].evening).toEqual(before.weeklyPlan.days[1].evening);
  expect(copied.weeklyPlan.days[2].evening).toEqual(before.previousWeeklyPlan!.days[2].evening);
  await expect(current).toContainText('自由活动');
  await awaitCanonicalSynced(page);
});

test('copying at the exact start still permits a complete legal study slot', async ({ page }) => {
  let state = createInitialState(content, fixtureBalance, 1);
  state = act(state, { type: 'set_plan', weekday: 1, slot: 'evening', activity: { kind: 'free' } });
  state = act(act(state, { type: 'start_week' }), { type: 'advance_simulation', minutes: 660 });
  state = act(state, { type: 'pause_simulation' });
  expect(state.time).toEqual({ day: 1, hour: 19, minute: 0 });
  await seed(page, state);
  const cell = page.getByRole('button', { name: '周一晚间计划', exact: true });
  await expect(cell).toBeEnabled();
  await page.getByRole('button', { name: '使用上周计划', exact: true }).click();
  await expect(cell).toContainText('学习 2 小时');
  const result = await page.evaluate(() => {
    const store = window.__yuliang!.store;
    const knowledge = store.getState().game.attributes.knowledge;
    store.getState().dispatch({ type: 'resume_simulation' });
    store.getState().dispatch({ type: 'advance_simulation', minutes: 120 });
    store.getState().dispatch({ type: 'pause_simulation' });
    return { knowledge, game: structuredClone(store.getState().game) };
  });
  expect(result.game.time).toEqual({ day: 1, hour: 21, minute: 0 });
  expect(result.game.attributes.knowledge).toBe(result.knowledge + 1);
});

test('the remaining-week forecast excludes a subscription period already paid through the shop', async ({ page }) => {
  const state = createInitialState(content, balanceConfig, 7);
  state.time = { day: 28, hour: 8, minute: 0 };
  state.calendar = calendarForDay(28);
  state.lastSettledDay = 27;
  state.cash = 10_000;
  state.employment = undefined;
  state.currentJobId = undefined;
  state.currentActivity = undefined;
  state.simulationMode = 'paused';
  for (const day of Object.values(state.weeklyPlan.days)) {
    day.day = { kind: 'free' };
    day.evening = { kind: 'free' };
  }
  state.previousWeeklyPlan = structuredClone(state.weeklyPlan);
  await seed(page, state);
  const forecastExpense = page.locator('.forecast-row').filter({ hasText: '预计支出' }).locator('strong');
  const beforeExpense = await forecastExpense.innerText();

  await navigate(page, '商店');
  await page.getByRole('tab', { name: '服务', exact: true }).click();
  const subscription = page.locator('.item-row').filter({ has: page.getByRole('heading', { name: '音乐会员', exact: true }) });
  await subscription.getByRole('button', { name: '开通订阅', exact: true }).click();
  await expect(subscription.getByRole('button', { name: '取消订阅', exact: true })).toBeVisible();
  const paid = await page.evaluate(() => structuredClone(window.__yuliang!.store.getState().game));
  expect(paid.cash).toBe(9_982);
  expect(paid.activeSubscriptions?.['subscription.music']?.billedUntilDay).toBe(56);

  await navigate(page, '生活');
  await expect(forecastExpense, 'this week ends before the paid period expires; it must not quote another fee').toHaveText(beforeExpense);
  expect(await page.evaluate(() => structuredClone(window.__yuliang!.store.getState().game))).toEqual(paid);
});

test('paused page browsing and keyboard navigation preserve the complete game state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = createInitialState(content, balanceConfig, 7);
  state.simulationMode = 'paused';
  await seed(page, state);
  const before = await page.evaluate(() => JSON.stringify(window.__yuliang!.store.getState().game));
  const nav = page.getByRole('navigation', { name: '主导航', exact: true });
  await nav.getByRole('button', { name: '生活', exact: true }).focus();
  for (const name of ['职业', '商店', '财富', '社交', '城市', '我的', '生活']) {
    await page.keyboard.press('ArrowRight');
    const selected = nav.getByRole('button', { name, exact: true });
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.main-content')).toBeVisible();
    expect(await page.evaluate(() => JSON.stringify(window.__yuliang!.store.getState().game))).toBe(before);
  }
  await page.keyboard.press('End');
  await expect(nav.getByRole('button', { name: '我的', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(nav.getByRole('button', { name: '生活', exact: true })).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(window.__yuliang!.store.getState().game))).toBe(before);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('settings reports stopped autosave after a real canonical version conflict', async ({ page }) => {
  const state = createInitialState(content, balanceConfig, 7);
  state.simulationMode = 'paused';
  await seed(page, state);
  // A competing canonical generation changes the record while this window
  // retains its own head; the next visible action must hit compare-and-commit.
  const remote = structuredClone(state);
  remote.cash += 123;
  await writeCanonicalState(page, remote);
  await page.getByRole('button', { name: '×2', exact: true }).click();
  await expect(page.getByRole('button', { name: '加载最新存档', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__yuliang!.store.getState().externalSaveConflict)).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.detail-facts')).toContainText('已停止保存');
  await expect(dialog).toContainText('另一个游戏窗口已经更新了存档');
  await expect(dialog.getByText('正常', { exact: true })).toHaveCount(0);
});

test('settings reports protected recovery until the user explicitly accepts the new save', async ({ page }) => {
  await bootWithBridge(page);
  await writeCanonicalState(page, null);
  await page.reload();
  await awaitAppReady(page);
  await expect(page.getByRole('alert')).toContainText('自动保存已暂停');
  expect(await page.evaluate(() => window.__yuliang!.store.getState().recovery?.writeProtected)).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '设置', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.detail-facts')).toContainText('恢复待确认');
  await expect(dialog.getByText('正常', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '继续使用当前临时存档', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await awaitCanonicalSynced(page);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(dialog.locator('.detail-facts')).toContainText('正常');
});
