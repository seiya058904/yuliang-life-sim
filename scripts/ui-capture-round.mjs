import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4199';
const OUT = fileURLToPath(new URL('../output/round-current/', import.meta.url));
const prefix = process.argv[2] ?? 'round';
const sizes = (process.env.SIZES ?? '1440x1080,1280x720').split(',').map((entry) => {
  const [w, h] = entry.split('x').map(Number);
  return { w, h, tag: `${w}x${h}` };
});

mkdirSync(OUT, { recursive: true });

async function launch() {
  for (const opts of [{ channel: 'chrome' }, {}, { channel: 'msedge' }]) {
    try {
      return await chromium.launch({ headless: true, ...opts });
    } catch (error) {
      console.warn('launch failed', JSON.stringify(opts), String(error).slice(0, 120));
    }
  }
  throw new Error('no browser available');
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
}

async function clickNav(page, label) {
  const nav = page.getByLabel('主导航').getByRole('button', { name: label, exact: true });
  if (await nav.count()) {
    await nav.first().click();
  } else {
    await page.getByRole('button', { name: label, exact: true }).first().click();
  }
  await settle(page);
}

const browser = await launch();
try {
  const results = [];
  for (const { w, h, tag } of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(BASE);
    await settle(page);

    await clickNav(page, '生活');
    await page.screenshot({ path: `${OUT}${prefix}-life-${tag}.png` });
    const lifeMetrics = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    }));
    results.push({ page: 'life', tag, ...lifeMetrics });

    await clickNav(page, '职业');
    await page.screenshot({ path: `${OUT}${prefix}-career-${tag}.png` });

    await clickNav(page, '商店');
    await settle(page);
    await page.screenshot({ path: `${OUT}${prefix}-shop-goods-${tag}.png` });
    const ent = page.getByRole('tab', { name: '娱乐', exact: true });
    if (await ent.count()) {
      await ent.first().click();
      await settle(page);
      await page.screenshot({ path: `${OUT}${prefix}-shop-ent-${tag}.png` });
    }

    // settlement via real run
    await clickNav(page, '生活');
    const openDetails = page.getByRole('button', { name: '查看生活详情' });
    if (await openDetails.count()) {
      await openDetails.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(400);
    }
    const runMonth = page.getByRole('button', { name: '运行 1 个月' });
    if (await runMonth.count()) {
      // drive the real simulation: resolve gates, pause/advance until monthly settlement frame appears
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const reached = await page.locator('.monthly-summary.fullframe').count();
        if (reached) break;
        const dialog = page.locator('[role="dialog"][aria-modal="true"]');
        if (await dialog.count()) {
          const choice = dialog.locator('button').filter({ hasText: /选择/ }).first();
          const anyBtn = dialog.locator('button.primary-button, button.secondary-button').last();
          if (await choice.count()) await choice.click({ force: true }).catch(() => {});
          else if (await anyBtn.count()) await anyBtn.click({ force: true }).catch(() => {});
          else await dialog.locator('button').last().click({ force: true }).catch(() => {});
          await page.waitForTimeout(160);
          continue;
        }
        if (await runMonth.first().isEnabled().catch(() => false)) {
          await runMonth.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(160);
          continue;
        }
        const pause = page.getByRole('button', { name: '暂停', exact: true });
        if (await pause.count() && await pause.first().isEnabled().catch(() => false)) {
          await pause.first().click({ force: true }).catch(() => {});
          await page.waitForTimeout(160);
          continue;
        }
        await page.waitForTimeout(200);
      }
      await page.waitForSelector('.monthly-summary.fullframe', { timeout: 8000 }).catch(() => {});
      await settle(page);
      const dialog = await page.locator('.monthly-summary.fullframe').count();
      if (dialog) {
        await page.screenshot({ path: `${OUT}${prefix}-settlement-${tag}.png` });
        const settleMetrics = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
          const hero = document.querySelector('.settle-result, .settle-result-panel, .settle-hero');
          const footer = document.querySelector('.settle-footer, .settlement-footer');
          return {
            docW: document.documentElement.scrollWidth,
            docH: document.documentElement.scrollHeight,
            modal: modal ? modal.getBoundingClientRect().toJSON() : null,
            hero: hero ? { ...hero.getBoundingClientRect().toJSON(), bg: getComputedStyle(hero).backgroundColor } : null,
            footer: footer ? footer.getBoundingClientRect().toJSON() : null,
            headerOpacity: getComputedStyle(document.querySelector('.app-header') ?? document.body).opacity,
          };
        });
        results.push({ page: 'settlement', tag, ...settleMetrics });
      }
    }

    results.push({ page: 'errors', tag, errors: errors.slice(0, 10) });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
