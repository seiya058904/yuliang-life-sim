/**
 * Geometry probe for the Life home page.
 *
 * Usage:  node scripts/ui-probe-life.mjs [url]
 *         VIEWPORT=1280x720 node scripts/ui-probe-life.mjs
 *
 * Prints the measured boxes of the shell bands (header, nav, status bar), the
 * time/console hero, the weekly forecast rail, the weekly-plan section heading
 * and every plan row/cell, plus the four support panels. This lets a
 * reference-vs-current comparison be made in numbers instead of by eye, and
 * pairs with scripts/ui-diff-grid.py, which localises the pixel difference.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? process.argv[2] ?? 'http://127.0.0.1:4199';
const [viewportWidth, viewportHeight] = (process.env.VIEWPORT ?? '1440x1080').split('x').map(Number);

async function launch() {
  for (const opts of [{ channel: 'chrome' }, {}, { channel: 'msedge' }]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch { /* try next */ }
  }
  throw new Error('no browser available');
}

const browser = await launch();
try {
  const ctx = await browser.newContext({ viewport: { width: viewportWidth, height: viewportHeight }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.getByLabel('主导航').getByRole('button', { name: '生活', exact: true }).first().click();
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
        pad: c.padding, bt: c.borderTop, bb: c.borderBottom,
        disp: c.display, gtc: c.gridTemplateColumns, gap: c.gap,
      };
    };
    const rows = [...document.querySelectorAll('.life-planning-section .planner > *')].map((el) => {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      const cls = (el.className || '').split(' ').filter(Boolean).slice(-1)[0] ?? '';
      return {
        tag: el.tagName.toLowerCase() + (cls ? '.' + cls : ''),
        y: Math.round(r.y), bot: Math.round(r.bottom), h: Math.round(r.height),
        bb: c.borderBottom, btc: c.borderTopColor, fs: c.fontSize, minH: c.minHeight,
      };
    });
    const headCells = [...document.querySelectorAll('.life-planning-section .planner-head > *')].map((el) => {
      const r = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 14),
        cls: (el.className || '').trim(),
        x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width),
        h: Math.round(r.height), bc: c.backgroundColor,
      };
    });
    const bodyCells = [...document.querySelectorAll('.life-planning-section .planner-row')][0]
      ? [...document.querySelectorAll('.life-planning-section .planner-row')].map((row) => ({
        label: (row.querySelector('span')?.textContent ?? '').trim(),
        h: Math.round(row.getBoundingClientRect().height),
        cells: [...row.querySelectorAll('.plan-cell')].map((cell) => {
          const r = cell.getBoundingClientRect();
          const c = getComputedStyle(cell);
          return {
            x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height),
            bc: c.backgroundColor, br: c.borderRight, bb: c.borderBottom, bd: c.borderStyle,
          };
        }),
      }))
      : [];
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overflow: {
        docW: document.documentElement.scrollWidth,
        docH: document.documentElement.scrollHeight,
      },
      shell: {
        header: box('.topbar'),
        nav: box('.main-nav'),
        status: box('.persistent-status'),
        main: box('main'),
      },
      hero: box('.time-console'),
      rail: box('.life-hero-grid > .forecast-strip'),
      planSection: box('.life-planning-section'),
      planHeading: box('.life-planning-section .section-heading'),
      planner: box('.life-planning-section .planner'),
      dashboard: box('.life-primary-dashboard'),
      inboxGrid: box('.inbox-grid'),
      inboxPanel: box('.inbox-panel'),
      detail: {
        plannerHead: box('.life-planning-section .planner-head'),
        plannerRow1: box('.life-planning-section .planner-row'),
        planCell: box('.life-planning-section .plan-cell'),
        plannerActions: box('.life-planning-section .planner-actions'),
        plannerHeadStrong: box('.life-planning-section .planner-head > strong'),
        plannerHeadSmall: box('.life-planning-section .planner-head > strong small'),
      },
      headCells,
      bodyCells,
      rows,
    };
  });

  console.log(JSON.stringify(report, null, 2));
  const { docW, docH } = report.overflow;
  const { w, h } = report.viewport;
  if (docW > w || docH > h) {
    console.error(`OVERFLOW: doc ${docW}x${docH} > viewport ${w}x${h}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
