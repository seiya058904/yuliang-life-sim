/**
 * Geometry probe for the Career market filter rail.
 *
 * Usage:  node scripts/ui-probe-career.mjs [url]
 *
 * Prints the measured boxes of the market identity block, the search control,
 * every group header and filter row, and the two real rail utilities, so a
 * reference-vs-current comparison can be made in numbers instead of by eye.
 * Pairs with scripts/ui-diff-grid.py, which localises the pixel difference.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? process.argv[2] ?? 'http://127.0.0.1:4199';

async function launch() {
  for (const opts of [{ channel: 'chrome' }, {}, { channel: 'msedge' }]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch { /* try next */ }
  }
  throw new Error('no browser available');
}

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.getByLabel('主导航').getByRole('button', { name: '职业', exact: true }).first().click();
  await page.waitForTimeout(600);

  const report = await page.evaluate(() => {
    const box = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return {
        y: Math.round(r.y), bot: Math.round(r.bottom), x: Math.round(r.x), right: Math.round(r.right),
        w: Math.round(r.width), h: Math.round(r.height), fs: c.fontSize,
        pad: c.padding, mar: c.margin, bt: c.borderTop, bb: c.borderBottom,
        disp: c.display, gap: c.gap, pos: c.position,
      };
    };
    const rows = [...document.querySelectorAll('.career-section.market-mode .career-filters > *')].map((el) => {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      const cls = (el.className || '').split(' ').filter(Boolean).slice(-1)[0] ?? '';
      return {
        tag: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
        text: (el.textContent ?? '').slice(0, 12),
        y: Math.round(r.y), bot: Math.round(r.bottom), h: Math.round(r.height),
        mt: c.marginTop, mb: c.marginBottom, fs: c.fontSize,
      };
    });
    return {
      identity: box('.career-market-identity'),
      identityMain: box('.career-market-identity-main'),
      eyebrow: box('.career-market-identity-copy .eyebrow'),
      title: box('.career-market-identity h1'),
      subtitle: box('.career-market-identity p'),
      toolsTrigger: box('.career-tools-heading-trigger'),
      pageMenu: box('.career-market-navigation'),
      pageMenuTrigger: box('.career-page-menu-trigger'),
      searchField: box('.career-search-field'),
      searchInput: box('.career-search-control input'),
      rail: box('.career-filters'),
      rows,
    };
  });

  const line = (name, b) => {
    if (!b) return console.log(`${name.padEnd(18)} (missing)`);
    const extra = b.fs ? ` fs=${b.fs}` : '';
    console.log(`${name.padEnd(18)} y=${String(b.y).padStart(4)} bot=${String(b.bot).padStart(4)} x=${String(b.x).padStart(4)} right=${String(b.right).padStart(4)} w=${String(b.w).padStart(4)} h=${String(b.h).padStart(3)}${extra}`);
  };

  console.log('--- identity ---');
  for (const key of ['identity', 'identityMain', 'eyebrow', 'title', 'subtitle', 'toolsTrigger', 'pageMenu', 'pageMenuTrigger']) {
    line(key, report[key]);
  }
  console.log('--- search ---');
  line('searchField', report.searchField);
  line('searchInput', report.searchInput);
  console.log('--- rail stack ---');
  line('rail', report.rail);
  let previous = null;
  for (const row of report.rows) {
    const pitch = previous === null ? '' : `  +${row.y - previous}`;
    previous = row.y;
    console.log(`${(row.tag + ' ' + row.text).slice(0, 26).padEnd(28)} y=${String(row.y).padStart(4)} bot=${String(row.bot).padStart(4)} h=${String(row.h).padStart(3)} mt=${row.mt.padEnd(6)} mb=${row.mb.padEnd(6)} fs=${row.fs}${pitch}`);
  }

  await ctx.close();
} finally {
  await browser.close();
}
