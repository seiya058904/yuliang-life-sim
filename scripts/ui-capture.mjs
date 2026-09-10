import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4199';
const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const prefix = process.argv[2] ?? 'baseline';

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
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
}

const browser = await launch();
try {
  // ---- desktop 1448x1086 ----
  const ctx = await browser.newContext({ viewport: { width: 1448, height: 1086 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await settle(page);
  const views = [
    ['生活', 'life'],
    ['职业', 'career'],
    ['商店', 'shop'],
    ['财富', 'wealth'],
    ['社交', 'relations'],
    ['城市', 'city'],
    ['我的', 'profile'],
  ];
  for (const [label, id] of views) {
    const nav = page.getByLabel('主导航').getByRole('button', { name: label, exact: true });
    await nav.click().catch(async () => page.getByRole('button', { name: label, exact: true }).click());
    await settle(page);
    await page.screenshot({ path: `${OUT}${prefix}-${id}-desktop-1448x1086.png` });
    console.log(`saved ${prefix}-${id}-desktop`);
  }
  // settlement modal state
  await page.getByRole('button', { name: '生活', exact: true }).click();
  const run = page.getByRole('button', { name: '运行 1 个月' });
  if (await run.count()) {
    await run.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {});
    await settle(page);
    await page.screenshot({ path: `${OUT}${prefix}-settlement-desktop-1448x1086.png` });
    console.log(`saved ${prefix}-settlement-desktop`);
  }
  await ctx.close();

  // ---- mobile 390x844 fullpage ----
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE);
  await settle(mpage);
  for (const [label, id] of views.slice(0, 4)) {
    const nav = mpage.getByLabel('主导航').getByRole('button', { name: label, exact: true });
    await nav.click().catch(() => {});
    await settle(mpage);
    await mpage.screenshot({ path: `${OUT}${prefix}-${id}-mobile-fullpage.png`, fullPage: true });
    console.log(`saved ${prefix}-${id}-mobile`);
  }
  await mctx.close();
} finally {
  await browser.close();
}
