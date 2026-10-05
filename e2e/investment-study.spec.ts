import { expect, test } from '@playwright/test';
import { balanceConfig } from '../src/game/balance/config';
import { contentRegistry as content } from '../src/game/content/registry';
import { createInitialState } from '../src/game/engine/initialState';
import { dispatchGameAction, reserveRequired } from '../src/game/engine/actions';
import { investmentUnitValue } from '../src/game/engine/investments';
import { awaitAppReady, bootWithBridge, openWealthPage, readPersistedState, writeCanonicalState, navigate, findCatalogEntry } from './harness';

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 851, height: 393 } : { width: 1440, height: 1080 });
});

for (const id of ['investment.stable-money-market', 'investment.city-bond-fund', 'investment.fixed-deposit-3m', 'investment.flexible-savings']) {
  test(`${id}: real minimum buy, repeated holding buy, sell-one and canonical reload`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await bootWithBridge(page);
    const investment = content.investments!.find(entry => entry.id === id)!;
    if (id !== 'investment.stable-money-market') {
      const state = createInitialState(content, balanceConfig, 7);
      state.cash = 5000;
      await writeCanonicalState(page, state);
      await page.reload(); await awaitAppReady(page);
    }
    const before = await page.evaluate(() => structuredClone(window.__yuliang!.store.getState().game));
    const price = Math.round(investmentUnitValue(investment, before.rng.seed, before.time.day));
    const expected = dispatchGameAction(before, { type: 'buy_investment', investmentId: id, units: investment.minimumUnits }, content, balanceConfig);
    expect(expected.error).toBeUndefined();
    await openWealthPage(page, '市场');
    const card = page.locator('article.asset-card').filter({ has: page.getByRole('heading', { name: investment.name, exact: true }) });
    await expect(card.getByRole('button', { name: `买入 ${investment.minimumUnits} 份`, exact: true })).toBeEnabled();
    await expect(card.locator('.investment-value')).toContainText(`¥${price.toLocaleString('zh-CN')}`);
    await card.getByRole('button', { name: `买入 ${investment.minimumUnits} 份`, exact: true }).click();
    await openWealthPage(page, '持有');
    await expect(card).toContainText(`持有 ${investment.minimumUnits} 份`);
    let saved = await readPersistedState(page);
    expect(saved.investments![id]).toEqual(expected.state.investments![id]);
    expect(saved.cash).toBe(expected.state.cash);
    await card.getByRole('button', { name: `买入 ${investment.minimumUnits} 份`, exact: true }).click();
    saved = await readPersistedState(page);
    expect(saved.investments![id].units).toBe(investment.minimumUnits * 2);
    await expect(card.locator('.investment-value')).toContainText(`¥${price.toLocaleString('zh-CN')}`);
    await expect(card).toContainText('当前价值');
    await card.getByRole('button', { name: '卖出 1 份', exact: true }).click();
    saved = await readPersistedState(page);
    expect(saved.investments![id].units).toBe(investment.minimumUnits * 2 - 1);
    await page.reload(); await awaitAppReady(page); await openWealthPage(page, '持有');
    await expect(card).toContainText(`持有 ${saved.investments![id].units} 份`);
    expect(await page.evaluate(id => window.__yuliang!.store.getState().game.investments![id], id)).toEqual(saved.investments![id]);
    expect(errors).toEqual([]);
  });
}

test('purchase disabled boundary matches actual engine quantity and housing reserve', async ({ page }) => {
  await bootWithBridge(page);
  const investment = content.investments!.find(entry => entry.id === 'investment.city-bond-fund')!;
  const state = createInitialState(content, balanceConfig, 7);
  const price = Math.round(investmentUnitValue(investment, state.rng.seed, state.time.day));
  for (const offset of [-1, 0]) {
    state.cash = price * investment.minimumUnits + reserveRequired(state, content) + offset;
    await writeCanonicalState(page, state); await page.reload(); await awaitAppReady(page);
    await openWealthPage(page, '市场');
    const card = page.locator('article.asset-card').filter({ hasText: investment.name });
    const buy = card.getByRole('button', { name: '买入 5 份', exact: true });
    const result = dispatchGameAction(state, { type: 'buy_investment', investmentId: investment.id, units: 5 }, content, balanceConfig);
    expect(result.error === undefined).toBe(offset === 0);
    if (offset === -1) await expect(buy).toBeDisabled();
    else { await expect(buy).toBeEnabled(); await buy.click(); expect((await readPersistedState(page)).cash).toBe(reserveRequired(state, content)); }
  }
});

test('equipment bought through the shop survives canonical reload without becoming permanent reward modifiers', async ({ page }) => {
  await bootWithBridge(page);
  const state = createInitialState(content, balanceConfig, 7);
  state.cash = 10000;
  state.studyGainRemainder = 0.8;
  await writeCanonicalState(page, state); await page.reload(); await awaitAppReady(page);
  await navigate(page, '商店');
  for (const name of ['高性能笔记本电脑', '简洁书桌', '人体工学椅']) {
    await findCatalogEntry(page, name);
    await page.getByRole('button', { name: `加入购物袋：${name}`, exact: true }).click();
  }
  await page.getByRole('button', { name: '一次购买', exact: true }).click();
  const saved = await readPersistedState(page);
  expect(saved.inventory).toMatchObject({ 'item.pro-laptop': 1, 'item.seed-desk': 1, 'item.office-chair': 1 });
  expect(saved.modifiers).toEqual(state.modifiers);
  await page.reload(); await awaitAppReady(page);
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.inventory)).toEqual(saved.inventory);
  expect(await page.evaluate(() => window.__yuliang!.store.getState().game.studyGainRemainder)).toBe(0.8);
});
