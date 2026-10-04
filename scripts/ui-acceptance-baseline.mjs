/**
 * Reproduce reviewed console reference scenes, without accepting any image.
 * Run with `npx tsx scripts/ui-acceptance-baseline.mjs --base=... --out=...`.
 * Uses fresh contexts and canonical fixture writes; never touches player saves.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync, version as esbuildVersion } from 'esbuild';
import { chromium, devices, expect } from '@playwright/test';
import { balanceConfig } from '../src/game/balance/config.ts';
import { contentRegistry } from '../src/game/content/registry.ts';
import { createInitialState } from '../src/game/engine/initialState.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));
const base = args.base ?? 'http://127.0.0.1:4187/yuliang-life-sim/';
const out = resolve(root, args.out ?? 'output/visual-acceptance');
mkdirSync(out, { recursive: true });
// tsx adds __name helpers inside serialized browser callbacks. Compile the
// existing harness with Vite's esbuild so callbacks stay self-contained.
const harnessDirectory = resolve(root, 'output');
mkdirSync(harnessDirectory, { recursive: true });
const harnessPath = resolve(harnessDirectory, `visual-harness-${process.pid}.mjs`);
const harnessSource = transformSync(readFileSync(resolve(root, 'e2e/harness.ts'), 'utf8'), {
  loader: 'ts', format: 'esm', target: 'es2023', keepNames: false,
}).code.replace(/(['"])\.\.\/playwright\.config\1/, JSON.stringify(pathToFileURL(resolve(root, 'playwright.config.ts')).href));
writeFileSync(harnessPath, harnessSource);
const { awaitAppReady, installSaveBridge, navigate, wheelMainToBottom, wheelMainUntilVisible } = await import(pathToFileURL(harnessPath).href);
unlinkSync(harnessPath); // Only this process's identified temporary module.
const hash = data => createHash('sha256').update(data).digest('hex');
const seed = 20260825;
const initial = createInitialState(contentRegistry, balanceConfig, seed);
const longActivity = structuredClone(initial);
longActivity.time = { day: 6, hour: 10, minute: 0 };
longActivity.currentActivity = undefined;
longActivity.weeklyPlan.days[6].day = { kind: 'activity', activityId: 'activity.premium-cinema', optionId: 'imax' };
const messages = Array.from({ length: 4 }, (_, i) => ({
  id: `message.visual-low-${i + 1}`, day: 1, characterId: 'character.seed-lin',
  title: `林晨发来消息 ${i + 1}`, body: '最近过得怎么样？有空一起去书店坐坐。',
  sourceId: 'interaction.seed-lin-meal', read: false,
}));
const fixtures = {
  initial,
  populated: { ...initial, inventory: { 'item.seed-coffee': 1, 'item.seed-phone': 1 }, wishlist: ['item.seed-laptop'], messages },
  career: { ...initial, applications: [{
    applicationId: 'application.visual-career', vacancyId: 'vacancy.visual-career',
    jobId: 'job.seed-remote', companyId: 'company.xinghe', salaryRange: [80, 100],
    route: 'market', submittedDay: 1, resultDay: 1, status: 'offer',
    competitivenessTier: 'competitive', probabilityBand: 0.7, willReceiveOffer: true,
    feedback: ['条件符合岗位期待'], offerExpiresDay: 8,
  }], employmentHistory: [{ jobId: 'job.seed-warehouse', companyId: 'company.yuanwang', startedDay: 1, endedDay: 1, finalPay: 130 }] },
  longActivity,
};
writeFileSync(resolve(out, 'fixtures.json'), `${JSON.stringify(fixtures, null, 2)}\n`);

const sourceFiles = [];
function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collect(name);
    else if (/\.(tsx?|css|woff2?)$/.test(name)) sourceFiles.push(name);
  }
}
collect('src');
const assets = readdirSync(resolve(root, 'dist/assets')).filter(name => /\.(css|js|woff2?)$/.test(name)).map(name => `dist/assets/${name}`);
const manifest = {
  sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries([...sourceFiles, ...assets, 'dist/index.html', 'scripts/ui-acceptance-baseline.mjs', 'e2e/harness.ts', 'playwright.config.ts'].map(name => [name, hash(readFileSync(resolve(root, name)))])),
  fixtureHash: hash(JSON.stringify(fixtures)), seed, platform: process.platform, harnessTranspiler: `esbuild ${esbuildVersion}`,
  base, locale: 'zh-CN', timezone: 'Asia/Shanghai', reducedMotion: 'reduce',
  generatedAt: new Date().toISOString(), records: [], errors: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
manifest.browser = browser.version();
try {
  for (const surface of [
    { id: '1440', viewport: { width: 1440, height: 1080 } },
    { id: '1280', viewport: { width: 1280, height: 720 } },
    { id: 'landscape', ...devices['Pixel 7 landscape'] },
  ]) {
    const { id, ...options } = surface;
    const context = await browser.newContext({ ...options, locale: manifest.locale, timezoneId: manifest.timezone, reducedMotion: manifest.reducedMotion });
    await context.addInitScript(() => localStorage.setItem('yuliang-e2e-hook', '1'));
    const page = await context.newPage();
    page.on('pageerror', error => manifest.errors.push({ surface: id, message: error.message }));
    page.on('console', message => { if (message.type() === 'error') manifest.errors.push({ surface: id, message: message.text() }); });
    await installSaveBridge(page);
    await page.goto(base);
    await awaitAppReady(page);
    async function loadFixture(name) {
      await page.evaluate(state => window.__e2eSave.write(state), fixtures[name]);
      await page.reload({ waitUntil: 'load' });
      await awaitAppReady(page);
    }
    async function capture(name, fixture, bottom = false, modal = false) {
      if (bottom) await wheelMainToBottom(page);
      else if (!modal) await page.locator('main').evaluate(element => { element.scrollTop = 0; });
      // Let actual transient receipts expire; do not mask or hide UI.
      await expect(page.locator('.action-receipt')).toHaveCount(0, { timeout: 10_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const metrics = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        overflowX: document.documentElement.scrollWidth > innerWidth,
        mainScrollTop: document.querySelector('main').scrollTop,
        time: window.__yuliang.store.getState().game.time,
        dialog: document.querySelector('[role="dialog"][aria-modal="true"]')?.getAttribute('aria-label') ?? null,
        h1: [...document.querySelectorAll('main h1')].map(element => element.textContent),
      }));
      const session = await context.newCDPSession(page);
      await session.send('DOM.enable');
      await session.send('CSS.enable');
      const { root: documentNode } = await session.send('DOM.getDocument');
      const fonts = [];
      for (const selector of ['main h1', '.brand-subtitle', '.status-cash']) {
        const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
        if (nodeId) fonts.push({ selector, ...(await session.send('CSS.getPlatformFontsForNode', { nodeId })) });
      }
      await session.detach();
      expect(metrics.overflowX, `${name}-${id} must fit horizontally`).toBe(false);
      const filename = `${name}-${id}.png`;
      const png = await page.screenshot({ path: resolve(out, filename), caret: 'hide' });
      manifest.records.push({ scene: name, surface: id, fixture, file: filename, sha256: hash(png), metrics, fonts });
    }
    await loadFixture('initial');
    for (const [scene, label] of [['life', '生活'], ['career', '职业'], ['shop', '商店'], ['wealth', '财富'], ['social', '社交'], ['city', '城市'], ['profile', '我的']]) {
      await navigate(page, label);
      await capture(scene, 'initial');
    }
    await navigate(page, '商店');
    await page.getByRole('tab', { name: '娱乐', exact: true }).click();
    await capture('shop-activities', 'initial');
    if (id !== 'landscape') {
      await loadFixture('populated');
      await navigate(page, '商店');
      await expect(page.locator('.inventory-item')).toHaveCount(2);
      await expect(page.locator('.rail-wishlist .item-row')).toContainText('轻薄笔记本电脑');
      await capture('shop-populated', 'populated', true);
      await navigate(page, '生活');
      await capture('life-four-messages', 'populated', true);
      await loadFixture('initial');
      await navigate(page, '职业');
      await capture('career-support', 'initial', true);
      await loadFixture('career');
      await navigate(page, '职业');
      await expect(page.locator('.career-bottom-panels .rail-rows li')).toHaveCount(3);
      await capture('career-populated', 'career', true);
      await loadFixture('longActivity');
      await expect(page.locator('.hero-activity h2')).toHaveText('IMAX 高规格电影');
      await capture('life-long-activity', 'longActivity');
      await loadFixture('initial');
      const details = page.getByRole('button', { name: '查看生活详情', exact: true });
      if (await details.isVisible()) await details.click();
      // Reach the first real month summary through UI decisions, not a fake modal.
      for (let gate = 0; gate < 100; gate += 1) {
        const dialog = page.getByRole('dialog');
        if (await dialog.count()) {
          if (await page.locator('.monthly-summary').count()) break;
          const buttons = dialog.getByRole('button');
          const names = await buttons.allTextContents();
          const preferred = names.findIndex(name => /收下并暂停|暂不|保持|拒绝|算了|了解/.test(name));
          await buttons.nth(preferred >= 0 ? preferred : 0).click();
        } else {
          const run = page.getByRole('button', { name: '运行 1 个月', exact: true });
          await wheelMainUntilVisible(page, run);
          await run.click();
        }
        await page.waitForTimeout(120);
      }
      await expect(page.locator('.monthly-summary')).toBeVisible();
      await capture('monthly-summary', 'initial + real UI advance/decisions', false, true);
    }
    await context.close();
  }
  expect(manifest.errors).toEqual([]);
} finally {
  await browser.close();
  writeFileSync(resolve(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
console.log(JSON.stringify({ captures: manifest.records.length, browser: manifest.browser, errors: manifest.errors, out: relative(root, out) }));
