import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4199');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(600);
const sel = process.argv[2];
const props = (process.argv[3] ?? 'height,maxHeight,padding,gridTemplateRows,gridTemplateColumns,alignContent,rowGap,display,textShadow,fontFamily,fontSize,letterSpacing,boxShadow,borderBottom').split(',');
const out = await page.evaluate(({ sel, props }) => {
  const el = document.querySelector(sel);
  if (!el) return 'not found';
  const cs = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = cs[p];
  return o;
}, { sel, props });
console.log(JSON.stringify(out, null, 2));
await browser.close();
