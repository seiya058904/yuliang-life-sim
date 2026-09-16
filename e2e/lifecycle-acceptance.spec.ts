import { expect, test, type Page } from '@playwright/test';
import { bootWithBridge, navigate, openCareerPage, readPersistedState } from './harness';

/**
 * R04–R06 acceptance through the **real UI** of the production build.
 *
 * Every decisive step is a user action on a real control: 开通订阅 / 取消订阅 /
 * 执行一次 / 接受 Offer / 开始本周. Qualification, cash and the boundary clock are
 * pre-seeded (the task allows that); the outcome is then read back from the
 * canonical save and from rendered text. No completion action is invoked
 * directly and no completed state is hand-written.
 *
 * These run against the same server as the rest of the suite and are part of the
 * release check: `YULIANG_E2E_SERVER=preview` runs them against `vite preview`
 * of the built `dist` (see playwright.config.ts and deploy-pages.yml).
 */

const SAVE_KEY = 'yuliang-save-v1';
const MUSIC = 'subscription.music';

/**
 * Seed a save shape, then let the app boot from it. The seed is a plain object
 * merged onto the app's own live state, so it can only carry data — never
 * closures — and a missing `currentJobId` cannot silently reappear: an empty
 * string is the explicit "no job" marker the migration accepts.
 */
async function bootWithState(page: Page, seed: Record<string, unknown>): Promise<void> {
  await bootWithBridge(page);
  await page.evaluate(({ key, patch }) => {
    const state = Object.assign(JSON.parse(JSON.stringify(window.__yuliang.store.getState().game)), patch);
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: SAVE_KEY, patch: seed });
  // Await the reload before anyone touches the store again, otherwise the next
  // read can still come from the previous document.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function');
}

/** The shared "unemployed, paused, low cash" base for a seeded case. */
function unemployedBase(day: number, hour: number, minute: number, cash = 500): Record<string, unknown> {
  return {
    cash,
    simulationMode: 'paused',
    currentJobId: '',
    employment: undefined,
    employmentHistory: [],
    majorEventsThisMonth: 3,
    time: { day, hour, minute },
    calendar: calendarOf(day),
  };
}

/** Calendar fields for a day number. */
function calendarOf(day: number): { week: number; weekday: number; month: number; weekOfMonth: number } {
  const week = Math.floor((day - 1) / 7) + 1;
  return { week, weekday: ((day - 1) % 7) + 1, month: Math.floor((week - 1) / 4) + 1, weekOfMonth: ((week - 1) % 4) + 1 };
}

/** Set the clock from a day, keeping the calendar consistent. */
function setClock(state: any, day: number, hour: number, minute: number): void {
  state.time = { day, hour, minute };
  state.calendar = calendarOf(day);
}

const readState = (page: Page) => readPersistedState(page) as Promise<Record<string, any>>;
const readGame = (page: Page) => page.evaluate(() => window.__yuliang.store.getState().game);

/** Start the week through the UI and wait until the world is really running. */
async function startWorldViaUi(page: Page): Promise<void> {
  await navigate(page, '生活');
  const start = page.getByRole('button', { name: '开始本周' });
  const resume = page.getByRole('button', { name: '继续运行' });
  if (await start.count()) await start.click();
  else await resume.click();
  await expect.poll(() => page.evaluate(() => window.__yuliang.store.getState().game.simulationMode), { timeout: 10_000 }).toBe('running');
}

/** Pause through the UI so later assertions read a settled clock. */
async function pauseWorldViaUi(page: Page): Promise<void> {
  const pause = page.getByRole('button', { name: '暂停' });
  if (await pause.count()) await pause.click();
  await expect.poll(() => page.evaluate(() => window.__yuliang.store.getState().game.simulationMode), { timeout: 10_000 }).toBe('paused');
}

async function openShopServices(page: Page): Promise<void> {
  await navigate(page, '商店');
  await page.getByRole('tab', { name: '服务', exact: true }).click();
}

function cardFor(page: Page, heading: string) {
  return page.getByRole('heading', { name: heading }).locator('..').locator('..');
}

/** Absolute minutes of the persisted clock. */
function minuteOf(time: { day: number; hour: number; minute: number }): number {
  return (time.day - 1) * 1440 + time.hour * 60 + time.minute;
}

test.describe('R04 · subscription billing through the shop UI', () => {
  test('first period charges and grants once, cancel+resume in the period is free', async ({ page }) => {
    await bootWithState(page, { cash: 1_000, simulationMode: 'paused' });
    const moodBefore = (await readGame(page)).attributes.mood;

    await openShopServices(page);
    const card = cardFor(page, '音乐会员');
    await card.getByRole('button', { name: '开通订阅' }).click();
    await expect(card.getByRole('button', { name: '取消订阅' })).toBeVisible();

    let state = await readState(page);
    expect(state.cash).toBe(1_000 - 18);
    // The first period is paid for the moment it starts, and the coverage is
    // written to the save so a reload cannot turn it into a free trial.
    const billing = state.activeSubscriptions[MUSIC];
    expect(billing.billedUntilDay).toBe(state.time.day + 28);
    const charge = (state.financialLedger?.entries ?? []).filter((entry: any) => entry.label === '音乐会员首期订阅');
    expect(charge).toHaveLength(1);
    expect(charge[0]).toMatchObject({ category: 'service', amount: 18, cashDelta: -18 });
    const afterFirst = (await readGame(page)).attributes.mood;
    expect(afterFirst).toBeGreaterThan(moodBefore);

    // Cancel, then resume inside the same paid period: no second charge, no
    // second round of the benefit.
    await card.getByRole('button', { name: '取消订阅' }).click();
    await expect(card.getByRole('button', { name: '开通订阅' })).toBeVisible();
    await card.getByRole('button', { name: '开通订阅' }).click();
    await expect(card.getByRole('button', { name: '取消订阅' })).toBeVisible();

    state = await readState(page);
    expect(state.cash).toBe(1_000 - 18);
    expect(state.activeSubscriptions[MUSIC].billedUntilDay).toBe((await readState(page)).activeSubscriptions[MUSIC].billedUntilDay);
    expect((state.financialLedger?.entries ?? []).filter((entry: any) => entry.label.includes('订阅'))).toHaveLength(1);
    expect((await readGame(page)).attributes.mood).toBe(afterFirst);

    // The whole sequence survives a reload with the same numbers.
    await page.reload();
    await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function');
    const reloaded = await readState(page);
    expect(reloaded.cash).toBe(1_000 - 18);
    expect(reloaded.activeSubscriptions[MUSIC].billedUntilDay).toBe(state.activeSubscriptions[MUSIC].billedUntilDay);
    expect((await readGame(page)).attributes.mood).toBe(afterFirst);
  });

  test('an expired period bills again when the player re-activates', async ({ page }) => {
    await bootWithState(page, {
      cash: 1_000,
      simulationMode: 'paused',
      // Left over from a cancelled period that has already run out: day 60 is
      // well past `billedUntilDay` 29.
      time: { day: 60, hour: 9, minute: 0 },
      calendar: calendarOf(60),
      activeSubscriptions: {},
      previousSubscriptions: { [MUSIC]: { subscriptionId: MUSIC, startedDay: 1, billedUntilDay: 29 } },
    });

    await openShopServices(page);
    await cardFor(page, '音乐会员').getByRole('button', { name: '开通订阅' }).click();
    await expect(cardFor(page, '音乐会员').getByRole('button', { name: '取消订阅' })).toBeVisible();

    const state = await readState(page);
    expect(state.cash).toBe(1_000 - 18);
    // A fresh period is bought and paid for, not a free carry-over.
    expect(state.activeSubscriptions[MUSIC].billedUntilDay).toBe(60 + 28);
    expect((state.financialLedger?.entries ?? []).filter((entry: any) => entry.label === '音乐会员首期订阅')).toHaveLength(1);
  });

  test('insufficient cash refuses the activation instead of granting the benefit', async ({ page }) => {
    await bootWithState(page, { cash: 5, simulationMode: 'paused' });
    const moodBefore = (await readGame(page)).attributes.mood;

    await openShopServices(page);
    await cardFor(page, '音乐会员').getByRole('button', { name: '开通订阅' }).click();

    await expect(page.getByRole('alert')).toContainText('现金不足');
    await expect(cardFor(page, '音乐会员').getByRole('button', { name: '开通订阅' })).toBeVisible();
    const state = await readState(page);
    expect(state.cash).toBe(5);
    expect(state.activeSubscriptions?.[MUSIC]).toBeUndefined();
    expect((await readGame(page)).attributes.mood).toBe(moodBefore);
  });
});

test.describe('R05 · gig shift through the career UI', () => {
  async function openGigCard(page: Page) {
    await navigate(page, '职业');
    await openCareerPage(page, '工作机会');
    return page.getByRole('heading', { name: '同城配送' }).locator('xpath=ancestor::article[1]');
  }

  /** A reserved 18:00–22:00 shift on day 10, with the world paused before it. */
  const shiftWindow = {
    day: 10,
    startMinute: (10 - 1) * 1440 + 18 * 60,
    endMinute: (10 - 1) * 1440 + 22 * 60,
  };

  const shiftSeed = (extra: Record<string, unknown> = {}) => ({
    ...unemployedBase(10, 17, 50, 5_000),
    majorEventsThisMonth: 3,
    gigs: [{
      id: 'gig.ui-shift',
      jobId: 'job.delivery-shift',
      validFromDay: 10,
      expiresDay: 16,
      executableDay: 10,
      startMinute: shiftWindow.startMinute,
      endMinute: shiftWindow.endMinute,
      pay: 76,
      source: '公开市场',
      workedMinutes: 0,
    }],
    ...extra,
  });

  /** A week whose only runnable entry is the evening slot of one weekday. */
  function plannedEvening(weekday: number): Record<string, unknown> {
    const days = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((day) => [
      day,
      { day: { kind: 'free' }, evening: day === weekday ? { kind: 'study', durationMinutes: 120 } : { kind: 'free' } },
    ]));
    const plan = { days, autoRepeat: true };
    return { weeklyPlan: plan, previousWeeklyPlan: plan, autoRepeatPlan: true };
  }

  test('takes the reserved window on from the card while the world is paused, spending no time', async ({ page }) => {
    await bootWithState(page, shiftSeed());

    const gig = await openGigCard(page);
    await expect(gig).toContainText('第 10 天 18:00–22:00');
    await expect(gig).toContainText('满勤结算 ¥76');
    await expect(gig).toContainText('已工作 0 / 4 小时');
    await expect(gig).toContainText('未开工');

    // Starting a shift is a committed state change that spends no time by itself,
    // so the card works while the world is paused: the shift becomes the player's,
    // and only then can the clock work it. Nothing is paid and the clock stands.
    await gig.getByRole('button', { name: '开始这段零工' }).click();
    await expect(page.getByRole('status', { name: '操作结果' })).toContainText('已开始同城配送');
    const taken = await readGame(page);
    const [record] = taken.gigs ?? [];
    expect(record.startedMinute).toBe((10 - 1) * 1440 + 17 * 60 + 50);
    expect(record.workedMinutes).toBe(0);
    expect(taken.cash).toBe(5_000);
    expect(taken.time).toMatchObject({ day: 10, hour: 17, minute: 50 });
    expect((taken.financialLedger?.entries ?? []).filter((entry: any) => entry.label === '同城配送结算')).toEqual([]);
    await expect(gig).toContainText('已开工');
    await expect(gig.getByRole('button', { name: '继续这段零工' })).toBeVisible();

    // 开工 is state, so it is saved: the reloaded world reads the same shift back in
    // progress instead of losing the hours the player has taken on.
    await page.reload();
    await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function');
    const reloaded = await readGame(page);
    expect(reloaded.gigs?.[0]).toMatchObject({ startedMinute: (10 - 1) * 1440 + 17 * 60 + 50, workedMinutes: 0 });
    const reopened = await openGigCard(page);
    await expect(reopened).toContainText('已开工');
    await expect(reopened.getByRole('button', { name: '继续这段零工' })).toBeVisible();
  });

  test('works the whole shift from the card, pays once, and keeps it after a reload', async ({ page }) => {
    // This is the real entry point the audit found unusable: the player takes the
    // shift on from its own button and the running clock spends the reserved hours.
    // Nothing here closes the shift by hand or writes a completed state.
    await bootWithState(page, shiftSeed());

    const gig = await openGigCard(page);
    await gig.getByRole('button', { name: '开始这段零工' }).click();
    // The click must really have started the shift: a refused click would leave the
    // clock nothing to work, and the poll below would time out instead of passing.
    await expect(gig.getByRole('button', { name: '继续这段零工' })).toBeVisible();
    expect((await readGame(page)).gigs?.[0]?.startedMinute).toBeDefined();

    await startWorldViaUi(page);

    // The shift is over: the settlement is in the save (the transient on-screen
    // message is not asserted, because the fast clock consumes it immediately).
    await expect.poll(async () => (await readState(page)).lifeHistory?.filter((entry: any) => entry.title === '完成同城配送').length ?? 0, { timeout: 30_000 }).toBe(1);
    await pauseWorldViaUi(page);
    await navigate(page, '职业');
    await openCareerPage(page, '工作机会');

    const settled = await readState(page);
    const completions = (settled.lifeHistory ?? []).filter((entry: any) => entry.title === '完成同城配送');
    expect(completions).toHaveLength(1);
    expect(completions[0].amount).toBe(76);
    expect(completions[0].detail).toContain('按实际工时结算 4 小时');
    expect((settled.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'side_job').reduce((sum: number, entry: any) => sum + entry.amount, 0)).toBe(76);
    // The worked shift is gone. A *new* market opportunity for the day the world has
    // moved into may well be on the board, which is the point of the daily
    // lifecycle; the assertion is on the settled record, not on the heading.
    expect((settled.gigs ?? []).map((entry: any) => entry.id)).not.toContain('gig.ui-shift');
    // The fee is recorded exactly once, so the wage history cannot double it.
    expect((settled.lifeHistory ?? []).filter((entry: any) => entry.title === '完成同城配送').length).toBe(1);
    expect(settled.time.day).toBeGreaterThanOrEqual(10);

    // What the player saw is what was saved.
    await page.reload();
    await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function');
    const reloaded = await readState(page);
    expect((reloaded.gigs ?? []).map((entry: any) => entry.id)).not.toContain('gig.ui-shift');
    expect((reloaded.lifeHistory ?? []).filter((entry: any) => entry.title === '完成同城配送')).toHaveLength(1);
  });

  test('pays nothing for a shift the player never took on, however long the world runs', async ({ page }) => {
    // The reverse of the case above, and the defect it was hiding: the same card,
    // never started. The world passing over the window is not work, so the shift
    // closes unworked and no fee is recorded.
    await bootWithState(page, shiftSeed());
    const gig = await openGigCard(page);
    await expect(gig).toContainText('未开工');

    await startWorldViaUi(page);
    await expect.poll(async () => (await readState(page)).lifeHistory?.filter((entry: any) => entry.title === '错过同城配送').length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    await pauseWorldViaUi(page);

    const settled = await readState(page);
    expect((settled.lifeHistory ?? []).filter((entry: any) => entry.title === '完成同城配送')).toEqual([]);
    expect((settled.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'side_job')).toEqual([]);
  });

  test('refuses a shift the week already owns, and pays nothing for it either', async ({ page }) => {
    // 每周三晚间计划 19:00–21:00 sits inside this window, so the shift cannot be
    // started: the refusal is actionable, and the world running over the window
    // still pays nothing for the shift that was never taken on.
    await bootWithState(page, { ...shiftSeed(), ...plannedEvening(3) });

    const gig = await openGigCard(page);
    await gig.getByRole('button', { name: '开始这段零工' }).click();
    await expect(page.getByRole('alert')).toContainText('本周计划与零工时间冲突');
    const refused = await readGame(page);
    expect(refused.gigs?.[0]?.startedMinute).toBeUndefined();
    expect(refused.gigs?.[0]?.workedMinutes).toBe(0);
    expect(refused.cash).toBe(5_000);

    await startWorldViaUi(page);
    await expect.poll(async () => (await readState(page)).lifeHistory?.filter((entry: any) => entry.title === '错过同城配送').length ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
    await pauseWorldViaUi(page);

    const settled = await readState(page);
    expect((settled.lifeHistory ?? []).filter((entry: any) => entry.title === '完成同城配送')).toEqual([]);
    expect((settled.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'side_job')).toEqual([]);
  });

  test('closes a window that ran out unworked, tells the player, and saves the removal', async ({ page }) => {
    // The shift was never started and its window is now behind the clock. The
    // card must not stay on screen claiming the player can still apply for it,
    // and the cleanup has to reach the save rather than being dropped because the
    // action also had a message.
    await bootWithState(page, shiftSeed({ gigs: [{
      id: 'gig.ui-expired',
      jobId: 'job.delivery-shift',
      validFromDay: 10,
      expiresDay: 16,
      executableDay: 10,
      startMinute: (10 - 1) * 1440 + 8 * 60,
      endMinute: (10 - 1) * 1440 + 12 * 60,
      pay: 76,
      source: '公开市场',
      workedMinutes: 0,
    }] }));

    const gig = await openGigCard(page);
    await expect(gig).toContainText('08:00–12:00');

    // The clock is behind the window already (this save predates the shift). The
    // next action runs the lifecycle cleanup, so the card must disappear and the
    // removal must be committed — not dropped because the action also had a
    // message for the player.
    await startWorldViaUi(page);
    await pauseWorldViaUi(page);

    await navigate(page, '职业');
    await openCareerPage(page, '工作机会');
    await expect(page.getByRole('heading', { name: '同城配送' })).toHaveCount(0);
    const state = await readState(page);
    expect(state.gigs ?? []).toEqual([]);
    expect((state.lifeHistory ?? []).filter((entry: any) => entry.title === '错过同城配送')).toHaveLength(1);

    await page.reload();
    await page.waitForFunction(() => typeof window.__yuliang?.store?.getState === 'function');
    expect((await readState(page)).gigs ?? []).toEqual([]);
  });
});

test.describe('R06 · hiring at a shift boundary through the career UI', () => {
  const CLERK = 'job.seed-shop-clerk';

  /**
   * Seed an open Offer for the clerk job and accept it through the UI. The
   * patch is built from plain serializable numbers so it can run inside the
   * browser without capturing test-scope variables.
   */
  async function acceptClerkOffer(page: Page, at: { day: number; hour: number; minute: number }) {
    const { day, hour, minute } = at;
    await bootWithState(page, {
      ...unemployedBase(day, hour, minute),
      // An Offer waiting in 我的申请, exactly as the market leaves it.
      applications: [{
        applicationId: 'application.ui-hire',
        vacancyId: 'vacancy.ui-hire',
        jobId: CLERK,
        companyId: 'company.yuanwang',
        salaryRange: [96, 96],
        route: 'market',
        submittedDay: day,
        resultDay: day,
        offerExpiresDay: day + 7,
        status: 'offer',
        competitivenessTier: 'minimum',
        probabilityBand: 0.7,
        willReceiveOffer: true,
        feedback: [],
      }],
    });

    await navigate(page, '职业');
    await openCareerPage(page, '我的申请');
    await page.getByRole('button', { name: '接受 Offer' }).first().click();
    await expect.poll(async () => (await readState(page)).currentJobId, { timeout: 10_000 }).toBe(CLERK);
  }

  test('a Friday mid-shift hire starts on the next working day and is paid then', async ({ page }) => {
    // Day 5 is Friday; 12:00 is inside the 09:00–17:00 shift.
    await acceptClerkOffer(page, { day: 5, hour: 12, minute: 0 });

    const hired = await readState(page);
    expect(hired.employment.jobId).toBe(CLERK);
    // The contract starts on the next day the job actually works a shift:
    // day 8 (Monday), not day 6 (Saturday).
    expect(hired.employment.startedDay).toBe(8);
    expect(hired.employment.activeFromMinute).toBe(7 * 1440 + 9 * 60);

    // Run far enough to cover the weekend and the first full shift. No speed
    // button is involved: the world runs at its own pace and the assertion waits
    // for the first wage rather than for a fixed duration.
    await navigate(page, '生活');
    await page.getByRole('button', { name: '继续运行' }).click();
    await expect.poll(async () => {
      const state = await readState(page);
      return (state.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'wage').length;
    }, { timeout: 60_000 }).toBeGreaterThan(0);
    await pauseWorldViaUi(page);

    const settled = await readState(page);
    const wages = (settled.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'wage');
    // No wage was drawn before the first full working day, and that first shift
    // paid the job's own rate. (Later shifts may also have run by the time the
    // world is paused, so the assertion is on the start, not the count.)
    expect(wages.filter((entry: any) => entry.day < 8)).toEqual([]);
    expect(wages[0]).toMatchObject({ day: 8, amount: 96 });
    expect(settled.time.day).toBeGreaterThanOrEqual(8);
  });

  test('a hire one minute before the shift ends never draws that shift', async ({ page }) => {
    await acceptClerkOffer(page, { day: 1, hour: 16, minute: 59 });

    const hired = await readState(page);
    expect(hired.employment.startedDay).toBe(2);

    // Run past the end of today's shift and confirm no wage was drawn for it.
    await navigate(page, '生活');
    await page.getByRole('button', { name: '继续运行' }).click();
    await expect.poll(async () => minuteOf((await readState(page)).time), { timeout: 20_000 }).toBeGreaterThan(17 * 60);
    await page.getByRole('button', { name: '暂停' }).click();

    const settled = await readState(page);
    expect((settled.financialLedger?.entries ?? []).filter((entry: any) => entry.category === 'wage')).toEqual([]);
  });
});
