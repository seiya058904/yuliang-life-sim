import { expect, test } from '@playwright/test';

// Housing-flow guard: while the player owns a residence outright, the housing
// market must not offer move/buy actions that would silently destroy the old
// home. All state-changing steps go through real UI clicks.
test.describe('move_housing ownership guard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Eligibility fixture only (cash/ability/unlocks); every housing change
    // below is a real button click.
    await page.evaluate(() => localStorage.setItem('yuliang-e2e-hook', '1'));
    await page.reload();
    await page.waitForFunction(() => typeof (window as unknown as { __yuliang?: { store?: { getState?: unknown } } }).__yuliang?.store?.getState === 'function');
    await page.evaluate(() => {
      const store = (window as unknown as { __yuliang?: { store: { setState: (patch: unknown) => void; getState: () => { game: { cash: number; ability: number; reputation: number; unlockedHousingIds: string[] } } } } }).__yuliang!.store;
      const game = store.getState().game;
      store.setState({ game: { ...game, cash: 5_000_000, ability: 80, reputation: 80, unlockedHousingIds: ['housing.shared-room', 'housing.seed-room', 'housing.seed-apartment'] } });
    });
  });

  async function openLifeDetails(page: import('@playwright/test').Page) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '生活', exact: true }).click();
    const details = page.getByRole('button', { name: '查看生活详情' });
    if (await details.isVisible()) await details.click();
  }

  test('buying a second home or renting while owning is blocked until an explicit sale', async ({ page }) => {
    await openLifeDetails(page);
    const homeRow = (name: string) => page.locator('.item-row', { has: page.getByRole('heading', { name, exact: true }) });

    // Rent → own through the market: the supported first acquisition.
    await homeRow('独立单间').getByRole('button', { name: '买下', exact: true }).click();
    await expect(homeRow('独立单间')).toContainText('当前住处');
    const cashAfterA = await page.evaluate(() => (window as unknown as { __yuliang?: { store: { getState: () => { game: { cash: number } } } } }).__yuliang!.store.getState().game.cash);
    expect(cashAfterA).toBeLessThan(5_000_000);

    // Owning now blocks every move/buy action on other homes, with the reason
    // visible in the row.
    const apartment = homeRow('一居室公寓');
    await expect(apartment.getByRole('button', { name: '买下', exact: true })).toBeDisabled();
    await expect(apartment.getByRole('button', { name: '租住', exact: true })).toBeDisabled();
    await expect(apartment).toContainText('请先出售当前自住房');
    const sharedRoom = homeRow('合租房间');
    await expect(sharedRoom.getByRole('button', { name: '租住', exact: true })).toBeDisabled();

    // Nothing may have changed: same home, same cash, old home intact.
    const guarded = await page.evaluate(() => {
      const game = (window as unknown as { __yuliang?: { store: { getState: () => { game: { cash: number; housing: { housingId: string; mode: string }; housingHoldings: Record<string, unknown> } } } } }).__yuliang!.store.getState().game;
      return { cash: game.cash, housing: game.housing, holdings: Object.keys(game.housingHoldings ?? {}) };
    });
    expect(guarded.cash).toBe(cashAfterA);
    expect(guarded.housing).toEqual({ housingId: 'housing.seed-room', mode: 'owned' });
    expect(guarded.holdings).toEqual([]);

    // The documented path: sell the current home first, then buy the next one.
    await homeRow('独立单间').getByRole('button', { name: '出售', exact: true }).click();
    await expect(homeRow('独立单间')).not.toContainText('当前住处');
    await apartment.getByRole('button', { name: '买下', exact: true }).click();
    await expect(apartment).toContainText('当前住处');
    const final = await page.evaluate(() => (window as unknown as { __yuliang?: { store: { getState: () => { game: { housing: { housingId: string; mode: string } } } } } }).__yuliang!.store.getState().game.housing);
    expect(final).toEqual({ housingId: 'housing.seed-apartment', mode: 'owned' });
  });

  test('renting another home while a mortgage is open keeps refusing', async ({ page }) => {
    await openLifeDetails(page);
    const homeRow = (name: string) => page.locator('.item-row', { has: page.getByRole('heading', { name, exact: true }) });

    // The player starts out renting 合租房间; finance the non-current home
    // through the UI, which moves in with an open mortgage.
    await homeRow('独立单间').getByRole('button', { name: '分期购买', exact: true }).click();
    await expect(homeRow('独立单间')).toContainText('分期中');

    // The mortgage path keeps its original refusal on other homes.
    await expect(homeRow('一居室公寓').getByRole('button', { name: '租住', exact: true })).toBeDisabled();
  });
});
