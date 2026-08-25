import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('uses the public market, plans a week, pauses for shopping, and restores the save', async ({ page }) => {
  await expect(page.getByRole('heading', { name: '余量' })).toBeVisible();
  await expect(page.getByText('第 1 周', { exact: true })).toBeVisible();

  await expect(page.getByRole('heading', { name: '招聘市场' })).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('远望');
  await expect(page.getByText('远望零售').first()).toBeVisible();
  await page.getByLabel('搜索岗位或公司').fill('');
  await page.getByRole('button', { name: '申请职位' }).first().click();
  await page.getByRole('button', { name: '我的申请' }).click();
  await expect(page.getByText(/当前竞争力：/)).toBeVisible();
  await page.getByRole('button', { name: '工作机会' }).click();
  await expect(page.getByText(/人物推荐、内部转岗、猎头和剧情机会/)).toBeVisible();

  await page.getByRole('button', { name: '开始本周' }).click();
  await expect(page.getByText('运行中')).toBeVisible();
  await page.getByRole('button', { name: '×4' }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await page.getByRole('dialog').getByRole('button').first().click();
  await expect(page.getByRole('button', { name: '收下并暂停' })).toBeVisible();
  await expect(page.getByRole('button', { name: '收下并继续运行' })).toBeVisible();
  await page.getByRole('button', { name: '收下并继续运行' }).click();
  await expect(page.getByText('运行中')).toBeVisible();
  await page.getByRole('button', { name: '暂停' }).click();

  const pausedClock = await page.getByTestId('clock-value').innerText();
  await page.getByRole('button', { name: '商店' }).click();
  await page.getByRole('button', { name: '加入购物袋：现磨咖啡' }).click();
  await page.getByRole('button', { name: '加入购物袋：实用手机' }).click();
  await page.getByRole('button', { name: '一次购买' }).click();
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);

  const persistedCash = await page.getByTestId('cash-value').innerText();
  await page.reload();
  await expect(page.getByTestId('cash-value')).toHaveText(persistedCash);
  await expect(page.getByTestId('clock-value')).toHaveText(pausedClock);
});
