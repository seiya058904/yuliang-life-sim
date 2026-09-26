/**
 * 真实浏览器长跑（Iteration Candidate 验收用）。
 *
 * 和 `scripts/simulate.ts`（纯引擎 harness，直接调 dispatch）不同，这里跑的是
 * 真正的浏览器：真实 DOM、真实 IndexedDB compare-and-commit 存档、真实的
 * 事件/招聘/月结弹窗，以及真实的"运行 3 个月"入口。目的是回答引擎 harness
 * 回答不了的问题：
 *
 *  - 长跑 3–5 年后界面是否还活着（无崩溃、无控制台报错、DOM 没有失控增长）；
 *  - 每个月的**决策密度**（必须由玩家确认的门槛次数）与门槛来源分布；
 *  - 长跑后的存档是否还能读回（刷新后 天/月/现金 一致）与存档体积；
 *  - 每月推进的真实耗时。
 *
 * 时间推进用界面上的「运行 3 个月」（引擎内的 advance_period：一次推进到下一个
 * 门槛，不是实时播放），因此 3–5 年可以在几分钟内跑完，同时仍然是一段真正的
 * 浏览器会话（每隔一段截图、结束时刷新校验存档）。
 *
 * 用法：
 *   node scripts/ui-longrun.mjs --base=http://127.0.0.1:4199/yuliang-life-sim/ \
 *     --strategy=conservative --months=36 --out=artifacts/longrun-conservative.json
 *
 * 注意：脚本使用全新浏览器上下文（独立 profile），不会碰到玩家自己的存档。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const args = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const [key, ...rest] = entry.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));

const BASE = args.base ?? 'http://127.0.0.1:4199/yuliang-life-sim/';
const STRATEGY = args.strategy ?? 'conservative';
const MONTHS = Number(args.months ?? 36);
const OUT = resolve(ROOT, args.out ?? `artifacts/longrun-${STRATEGY}.json`);
const SHOTS = resolve(ROOT, args.shots ?? `output/longrun/${STRATEGY}`);
const MAX_STEPS = Number(args.maxSteps ?? 6000);
const IDLE_LIMIT = Number(args.idleLimit ?? 40);

/** 策略：只读对话框按钮文案里"玩家可见的意图"，不看内部状态，也不预知未来。 */
const POLICIES = {
  conservative: {
    label: '保守生存者（不冒险：不辞职、不借贷、不主动大额消费）',
    want: [/收下并暂停/, /暂不/, /不接受/, /先不/, /保持不变/, /维持/, /保留/, /跳过/, /算了/, /拒绝/, /了解/, /看看/, /考虑/],
    avoid: [/继续运行/, /接受工作/, /买入/, /购买/, /加入合伙/, /全资/, /入股/, /投资/, /贷款/, /辞职/, /离开/],
  },
  career: {
    label: '职业攀爬者（抓住机会：接受工作、谈薪、进修）',
    want: [/收下并暂停/, /接受工作/, /同意/, /继续了解/, /进入工作邀请/, /争取/, /谈判/, /谈薪/, /应聘/, /申请/, /报名/, /学习/, /进修/, /提升/],
    avoid: [/继续运行/, /拒绝/, /不接受/, /辞职/, /离开/, /算了/],
  },
  balanced: {
    label: '平衡生活者（工作与生活都要，不做高风险决定）',
    want: [/收下并暂停/, /接受工作/, /继续了解/, /进入工作邀请/, /加入/, /安排/, /休息/, /散步/, /读书/, /锻炼/, /体检/],
    avoid: [/继续运行/, /辞职/, /离开/, /全资/, /贷款/],
  },
};

const policy = POLICIES[STRATEGY] ?? POLICIES.conservative;

function score(text, policy) {
  let value = 0;
  for (const pattern of policy.want) if (pattern.test(text)) value += 3;
  for (const pattern of policy.avoid) if (pattern.test(text)) value -= 4;
  return value;
}

async function launch() {
  for (const opts of [{ channel: 'chrome' }, {}, { channel: 'msedge' }]) {
    try { return await chromium.launch({ headless: true, ...opts }); } catch (error) {
      console.warn('launch failed', JSON.stringify(opts), String(error).slice(0, 120));
    }
  }
  throw new Error('no browser available');
}

async function clickNav(page, label) {
  const nav = page.getByLabel('主导航').getByRole('button', { name: label, exact: true });
  const target = (await nav.count()) ? nav.first() : page.getByRole('button', { name: label, exact: true }).first();
  await target.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(80);
}

/** 页面内可观测的快照：状态来自应用自己的 store 桥，界面数字来自真实 DOM。 */
async function snapshot(page) {
  return page.evaluate(() => {
    const store = window.__yuliang?.store;
    const game = store?.getState?.()?.game ?? {};
    const status = (document.querySelector('.status-line') ?? document.body).textContent ?? '';
    const money = (pattern) => {
      const match = status.replace(/,/g, '').match(pattern);
      return match ? Number(match[1]) : null;
    };
    const day = game.time?.day ?? null;
    return {
      day,
      week: game.calendar?.week ?? null,
      month: game.calendar?.month ?? null,
      year: day ? Math.floor((day - 1) / 365) + 1 : null,
      cash: game.cash ?? null,
      headerCash: money(/现金\s*¥(-?\d+)/),
      headerNetWorth: money(/净资产\s*¥(-?\d+)/),
      simulationMode: game.simulationMode ?? null,
      speed: game.simulationSpeed ?? null,
      job: game.currentJobId ?? null,
      applications: (game.applications ?? []).length,
      relationships: Object.values(game.relationships ?? {}).filter((value) => Number(value) > 0).length,
      relationshipTotal: Object.values(game.relationships ?? {}).reduce((total, value) => total + Number(value ?? 0), 0),
      interestFamiliarity: Object.keys(game.interestFamiliarity ?? {}).length,
      unlockedJobs: (game.unlockedJobIds ?? []).length,
      businesses: Object.keys(game.businesses ?? {}).length,
      investments: Object.keys(game.investments ?? {}).length,
      assets: Object.keys(game.assets ?? {}).length,
      housing: game.housing?.housingId ?? null,
      messages: (game.messages ?? []).length,
      worldHistory: (game.worldHistory ?? []).length,
      financialHistory: (game.financialHistory ?? []).length,
      lifeRecords: (game.lifeRecords ?? []).length,
      wealthMilestones: (game.wealthMilestones ?? []).length,
      worldMessageLog: Object.keys(game.worldMessageLog ?? {}).length,
      domNodes: document.querySelectorAll('*').length,
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  });
}

/** 门槛类型：区分"结算确认"和"真正的玩家决策"，决策密度只数后者。
 *  全部信息一次 evaluate 取回，避免逐个 locator 的默认 30s 等待把循环拖死。
 *  注意：modal 的类名（event-modal / reward-modal…）就在 role=dialog 这个元素上，
 *  要用 classList 判断，querySelector 找不到"自己"。 */
async function dialogInfo(page) {
  return page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
    if (!dialog) return null;
    const buttons = [...dialog.querySelectorAll('button')].filter((button) => button.offsetParent !== null || button.getBoundingClientRect().width > 0);
    const kind = dialog.querySelector('.settle-continue') ? 'monthly_summary'
      : dialog.classList.contains('recruitment-modal') ? 'recruitment'
        : dialog.classList.contains('reward-modal') ? 'reward'
          : dialog.classList.contains('event-modal') ? 'event'
            : dialog.classList.contains('monthly-summary') ? 'monthly_summary' : 'other';
    return {
      kind,
      title: (dialog.querySelector('h1, h2')?.textContent ?? '').trim(),
      entries: buttons.map((button, index) => ({
        index,
        text: (button.textContent ?? '').trim(),
        enabled: !button.disabled,
        className: button.className,
      })),
    };
  });
}

/** 轻量日历读取：用来按"真实的月边界"记账（advance_period 会在内部替玩家
 *  确认中间月份，所以月结弹窗不能作为月份推进的依据）。 */
async function calendarNow(page) {
  return page.evaluate(() => {
    const game = window.__yuliang?.store?.getState?.()?.game ?? {};
    const status = (document.querySelector('.status-line') ?? document.body).textContent ?? '';
    const netWorth = Number((status.replace(/,/g, '').match(/净资产\s*¥(-?\d+)/) ?? [])[1] ?? null);
    return { day: game.time?.day ?? 0, cash: game.cash ?? null, netWorth, domNodes: document.querySelectorAll('*').length, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  });
}

async function resolveDialog(page, info, stats) {
  const { kind, title, entries } = info;
  stats.byGate[kind] = (stats.byGate[kind] ?? 0) + 1;

  if (kind === 'monthly_summary') {
    stats.byTitle['月结确认'] = (stats.byTitle['月结确认'] ?? 0) + 1;
    await page.evaluate(() => {
      const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
      dialog?.querySelector('.settle-continue')?.click();
    });
    await page.waitForTimeout(80);
    return 'monthly_summary';
  }

  const usable = entries.filter((entry) => entry.enabled && entry.text.length > 0 && !/^(关闭|返回|×)$/.test(entry.text));
  const pool = usable.length ? usable : entries;
  let best = pool[0];
  let bestScore = score(best.text, policy);
  for (const entry of pool.slice(1)) {
    const value = score(entry.text, policy);
    if (value > bestScore) { best = entry; bestScore = value; }
  }
  stats.decisions += 1;
  stats.byChoice[best.text] = (stats.byChoice[best.text] ?? 0) + 1;
  const key = `${kind}｜${title || '（无标题）'}`;
  stats.byTitle[key] = (stats.byTitle[key] ?? 0) + 1;
  const target = best.index;
  await page.evaluate((index) => {
    const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
    const buttons = [...dialog.querySelectorAll('button')].filter((button) => button.offsetParent !== null || button.getBoundingClientRect().width > 0);
    buttons[index]?.click();
  }, target);
  await page.waitForTimeout(80);
  return kind;
}

  const log = (message) => console.error(`[longrun:${STRATEGY}] ${message}`);
  log('launching browser');
  const browser = await launch();
const report = { strategy: STRATEGY, label: policy.label, base: BASE, monthsTarget: MONTHS, startedAt: new Date().toISOString() };
try {
  mkdirSync(SHOTS, { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (error) => consoleErrors.push(String(error).slice(0, 200)));

  const startedAt = Date.now();
  log('goto');
  await page.goto(BASE, { waitUntil: 'load', timeout: 30_000 });
  await page.evaluate(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  log('reload for debug bridge');
  await page.reload({ waitUntil: 'load', timeout: 30_000 });
  await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function', undefined, { timeout: 20_000 });
  log(`bridge ready (+${Date.now() - startedAt}ms)`);
  await page.waitForTimeout(500);

  const stats = { months: 0, decisions: 0, byChoice: {}, byGate: {}, byTitle: {}, perMonth: [] };
  // 被外部终止时也要留下中间报告（Node 默认不跑 finally）。
  const flush = (extra = {}) => { try { writeFileSync(OUT, `${JSON.stringify({ ...report, stats, ...extra }, null, 2)}\n`, 'utf8'); } catch { /* ignore */ } };
  process.on('SIGTERM', () => { flush({ interrupted: true }); process.exit(143); });
  process.on('SIGINT', () => { flush({ interrupted: true }); process.exit(130); });
  const deadline = Date.now() + Number(args.deadlineMs ?? 15 * 60_000);
  const boot = await snapshot(page);
  report.boot = boot;
  report.bootMs = Date.now() - startedAt;

  // 打开「生活详情」抽屉：高级时间控制（运行 1 / 3 个月）在里面。
  const details = page.getByRole('button', { name: '查看生活详情' });
  if (await details.count()) { await details.first().click({ force: true }); await page.waitForTimeout(150); }

  const runQuarter = page.getByRole('button', { name: '运行 3 个月' });
  const startWeek = page.getByRole('button', { name: '开始本周' });
  const heroPause = page.locator('.hero-start');

  let step = 0;
  let idle = 0;
  let monthStart = Date.now();
  let monthIndex = Math.floor(((boot.day ?? 1) - 1) / 28);
  let lastProgress = { months: 0, day: boot.day ?? 0, step: 0 };
  // 月边界记账：日历每跨过一个月，就记录一次当月的真实耗时与关键读数。
  const trackMonths = async () => {
    const now = await calendarNow(page);
    while (Math.floor(((now.day || 1) - 1) / 28) > monthIndex) {
      monthIndex += 1;
      stats.months = monthIndex;
      stats.perMonth.push({ month: monthIndex, wallMs: Date.now() - monthStart, day: now.day, cash: now.cash, netWorth: now.netWorth, domNodes: now.domNodes, heap: now.heap });
      monthStart = Date.now();
      if (monthIndex % 12 === 0) await page.screenshot({ path: `${SHOTS}/year-${Math.round(monthIndex / 12)}.png` }).catch(() => {});
    }
  };
  while (stats.months < MONTHS && step < MAX_STEPS && Date.now() < deadline) {
    step += 1;
    if (step - lastProgress.step > 400) {
      // 400 步没有任何新月份 / 新日期：记录诊断后停止，避免空转。
      const now = await snapshot(page);
      if (now.day === lastProgress.day && now.month === lastProgress.month) {
        log(`no progress for 400 steps: day=${now.day} month=${now.month} mode=${now.simulationMode} gates=${JSON.stringify(stats.byGate)} choices=${JSON.stringify(stats.byChoice)}`);
        report.stalled = true;
        break;
      }
      lastProgress = { months: stats.months, day: now.day, step };
    }
    if (step % 50 === 0) {
      const now = await snapshot(page);
      log(`step=${step} months=${stats.months} day=${now.day} month=${now.month} mode=${now.simulationMode} cash=${now.cash} gates=${JSON.stringify(stats.byGate)}`);
    }
    const info = await dialogInfo(page);
    if (info) {
      idle = 0;
      await resolveDialog(page, info, stats);
      await trackMonths();
      continue;
    }

    const state = await snapshot(page);
    // 实时运行是"慢速播放"，长跑不需要：先暂停，再用一次到位的时间控制。
    if (state.simulationMode === 'running') {
      await heroPause.first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(120);
      continue;
    }
    if (await runQuarter.count() && await runQuarter.first().isEnabled().catch(() => false)) {
      idle = 0;
      await runQuarter.first().click({ force: true });
      await page.waitForTimeout(120);
      await trackMonths();
      continue;
    }
    if (await startWeek.count() && await startWeek.first().isEnabled().catch(() => false)) {
      idle = 0;
      await startWeek.first().click({ force: true });
      await page.waitForTimeout(120);
      await trackMonths();
      continue;
    }
    idle += 1;
    if (idle > IDLE_LIMIT) break;
    await page.waitForTimeout(200);
  }
  report.harnessMs = Date.now() - startedAt;

  const after = await snapshot(page);
  report.end = after;
  report.stats = stats;
  report.decisionDensity = stats.months ? Number((stats.decisions / stats.months).toFixed(2)) : null;
  // 奖励"收下"确认是纯 acknowledge（没有选择内容），单独拆出来：
  // 真正的决策密度 = 事件/招聘等需要取舍的门槛 ÷ 月。
  report.ackGates = stats.byGate.reward ?? 0;
  report.choiceGates = Math.max(0, stats.decisions - report.ackGates);
  report.choiceDensity = stats.months ? Number((report.choiceGates / stats.months).toFixed(2)) : null;
  report.ackDensity = stats.months ? Number((report.ackGates / stats.months).toFixed(2)) : null;
  report.gateDensity = stats.months ? Number(((stats.decisions + stats.months) / stats.months).toFixed(2)) : null;
  report.avgMonthWallMs = stats.perMonth.length
    ? Math.round(stats.perMonth.reduce((total, entry) => total + entry.wallMs, 0) / stats.perMonth.length)
    : null;
  // 先把主结果落盘：后面的界面巡检 / 刷新校验是附加证据，不应拖垮整个报告。
  flush();

  // 长跑后回到界面：确认页面还活着、所有主界面都能打开且没有横向溢出。
  await page.evaluate(() => {
    const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].at(-1);
    (dialog?.querySelector('.settle-continue') ?? dialog?.querySelector('button.primary-button'))?.click();
  }).catch(() => {});
  await page.waitForTimeout(200);
  const views = [];
  for (const label of ['生活', '职业', '商店', '财富', '社交', '城市', '我的']) {
    try {
      await clickNav(page, label);
      const metrics = await page.evaluate(() => ({
        nodes: document.querySelectorAll('*').length,
        docW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }));
      views.push({ label, ok: true, overflowX: metrics.docW > metrics.innerW, ...metrics });
    } catch (error) { views.push({ label, ok: false, error: String(error).slice(0, 120) }); }
  }
  report.viewsAfterLongRun = views;
  await clickNav(page, '我的');
  await page.screenshot({ path: `${SHOTS}/final-profile.png` });
  await clickNav(page, '财富');
  await page.screenshot({ path: `${SHOTS}/final-wealth.png` });
  await clickNav(page, '生活');
  await page.screenshot({ path: `${SHOTS}/final-life.png` });

  // 存档压力与持久性：读真实 IndexedDB 记录，再刷新页面逐个字段核对。
  const record = await page.evaluate(() => new Promise((done) => {
    const request = indexedDB.open('yuliang-save', 1);
    request.onerror = () => done(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('saves')) { db.close(); done(null); return; }
      const read = db.transaction('saves', 'readonly').objectStore('saves').get('main');
      read.onsuccess = () => {
        db.close();
        const stored = read.result;
        done(stored ? { generation: stored.generation, revision: stored.revision, bytes: stored.payload.length } : null);
      };
      read.onerror = () => { db.close(); done(null); };
    };
  }));
  const reloadStart = Date.now();
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function', undefined, { timeout: 20_000 });
  await page.waitForTimeout(700);
  const reloaded = await snapshot(page);
  report.persistence = {
    record,
    reloadMs: Date.now() - reloadStart,
    before: { day: after.day, month: after.month, cash: after.cash, netWorth: after.headerNetWorth, relationships: after.relationships, worldHistory: after.worldHistory },
    after: { day: reloaded.day, month: reloaded.month, cash: reloaded.cash, netWorth: reloaded.headerNetWorth, relationships: reloaded.relationships, worldHistory: reloaded.worldHistory },
    match: after.day === reloaded.day && after.month === reloaded.month && after.cash === reloaded.cash && after.headerNetWorth === reloaded.headerNetWorth,
  };
  // 存档体积随年份增长（长期存档压力）。每 12 个月记录一次记录大小。
  report.recordBytes = record?.bytes ?? null;
  report.bytesPerMonth = record && stats.months ? Math.round((record.bytes / stats.months) * 100) / 100 : null;
  report.consoleErrors = consoleErrors.slice(0, 20);
  report.finishedAt = new Date().toISOString();
  report.ok = stats.months >= MONTHS && report.persistence.match && consoleErrors.length === 0;

  await ctx.close();
} catch (error) {
  report.error = String(error).slice(0, 600);
  report.ok = false;
} finally {
  await browser.close();
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: report.ok,
    strategy: STRATEGY,
    bootMs: report.bootMs,
    harnessMs: report.harnessMs,
    months: report.stats?.months ?? 0,
    decisions: report.stats?.decisions ?? 0,
    choiceGates: report.choiceGates,
    choiceDensity: report.choiceDensity,
    ackDensity: report.ackDensity,
    gateDensity: report.gateDensity,
    byGate: report.stats?.byGate ?? {},
    avgMonthWallMs: report.avgMonthWallMs,
    end: report.end ? {
      day: report.end.day, month: report.end.month, year: report.end.year,
      cash: report.end.cash, netWorth: report.end.headerNetWorth, job: report.end.job,
      relationships: report.end.relationships, businesses: report.end.businesses,
      messages: report.end.messages, worldHistory: report.end.worldHistory,
      domNodes: report.end.domNodes, heap: report.end.heap,
    } : null,
    persistence: report.persistence ?? null,
    recordBytes: report.recordBytes ?? null,
    views: (report.viewsAfterLongRun ?? []).map((view) => `${view.label}:${view.ok ? 'ok' : 'fail'}${view.overflowX ? '(溢出)' : ''}`),
    errors: report.consoleErrors ?? [],
    error: report.error ?? null,
    out: OUT,
  }, null, 2));
}
