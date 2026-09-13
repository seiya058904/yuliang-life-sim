import { expect, type Locator, type Page } from '@playwright/test';
import { e2eAppPath } from '../playwright.config';

export const MAIN_CONTENT = 'main.main-content';
export const PERSISTENT_STATUS = '.persistent-status';

export const navigate = (page: Page, name: string) =>
  page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click();

/** Navigate to the configured app base and assert the page really landed there. */
export async function gotoAppRoot(page: Page) {
  await page.goto('./');
  expect(new URL(page.url()).pathname, '应用必须落在配置的 base 路径上').toBe(e2eAppPath);
}

export async function openApp(page: Page) {
  await gotoAppRoot(page);
  await page.waitForFunction(() => Boolean(window.__yuliang));
}

export interface MainMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
  overflowY: string;
}

export async function readMainMetrics(page: Page): Promise<MainMetrics> {
  return page.evaluate((selector) => {
    const main = document.querySelector<HTMLElement>(selector)!;
    return {
      scrollTop: main.scrollTop,
      scrollHeight: main.scrollHeight,
      clientHeight: main.clientHeight,
      scrollWidth: main.scrollWidth,
      clientWidth: main.clientWidth,
      overflowY: getComputedStyle(main).overflowY,
    };
  }, MAIN_CONTENT);
}

const atBottom = (metrics: MainMetrics) => metrics.scrollTop >= metrics.scrollHeight - metrics.clientHeight - 2;

export interface TargetVisibility {
  fullyVisible: boolean;
  rect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  navBottom: number;
  footerTop: number;
}

/** Visibility measured against the real shell bands: below the nav, above the status bar. */
export async function targetVisibility(page: Page, target: Locator): Promise<TargetVisibility> {
  return target.evaluate((element) => {
    const nav = document.querySelector<HTMLElement>('.main-nav')!;
    const footer = document.querySelector<HTMLElement>('.persistent-status')!;
    const main = document.querySelector<HTMLElement>('main.main-content')!;
    const rect = element.getBoundingClientRect();
    const navBottom = nav.getBoundingClientRect().bottom;
    const footerTop = footer.getBoundingClientRect().top;
    const mainRect = main.getBoundingClientRect();
    return {
      fullyVisible:
        rect.top >= navBottom - 1 &&
        rect.bottom <= footerTop + 1 &&
        rect.left >= mainRect.left - 1 &&
        rect.right <= mainRect.right + 1,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      navBottom,
      footerTop,
    };
  });
}

/**
 * Hover point inside main-content whose hit chain reaches main without passing
 * through an already-scrollable container, so wheel deltas reach the page-level
 * scroll owner instead of being consumed by an inner scroller.
 */
async function pickWheelHoverPoint(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate((selector) => {
    const main = document.querySelector<HTMLElement>(selector)!;
    const mainRect = main.getBoundingClientRect();
    const centerX = mainRect.left + mainRect.width / 2;
    const candidates = [
      { x: centerX, y: mainRect.top + 24 },
      { x: centerX, y: mainRect.top + mainRect.height / 2 },
      { x: mainRect.left + Math.min(140, mainRect.width / 4), y: mainRect.top + 32 },
    ];
    for (const point of candidates) {
      const hit = document.elementFromPoint(point.x, point.y);
      if (!hit) continue;
      let current: Element | null = hit;
      let blocked = false;
      while (current && current !== main) {
        const style = getComputedStyle(current);
        const element = current as HTMLElement;
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) {
          blocked = true;
          break;
        }
        current = current.parentElement;
      }
      if (!blocked && current === main) return point;
    }
    return candidates[0];
  }, MAIN_CONTENT);
}

interface WheelOptions {
  maxSteps?: number;
  wheelDelta?: number;
}

const WHEEL_SETTLE_MS = 80;

async function wheelStep(page: Page, deltaY: number): Promise<{ before: MainMetrics; after: MainMetrics }> {
  const before = await readMainMetrics(page);
  await page.mouse.wheel(0, deltaY);
  await page.waitForTimeout(WHEEL_SETTLE_MS); // mouse.wheel does not guarantee the scroll has settled on return.
  const after = await readMainMetrics(page);
  return { before, after };
}

/** Scroll the main content to its bottom using real wheel input only. */
export async function wheelMainToBottom(page: Page, { maxSteps = 60, wheelDelta = 480 }: WheelOptions = {}): Promise<MainMetrics> {
  const hover = await pickWheelHoverPoint(page);
  await page.mouse.move(hover.x, hover.y);
  let stalled = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const before = await readMainMetrics(page);
    if (atBottom(before)) return before;
    const { after } = await wheelStep(page, wheelDelta);
    if (atBottom(after)) return after;
    if (after.scrollTop <= before.scrollTop) {
      stalled += 1;
      if (stalled >= 3) {
        throw new Error(`真实滚轮无法继续向下滚动（疑似用户不可滚动）：${JSON.stringify(after)}`);
      }
    } else {
      stalled = 0;
    }
  }
  const final = await readMainMetrics(page);
  throw new Error(`滚轮 ${maxSteps} 步后仍未到达主区底部：${JSON.stringify(final)}`);
}

/**
 * Wheel until the target sits fully inside the visible main band, above the
 * status bar. Wheels down first and wheels back up when the down phase
 * scrolled the target past the top (content can continue below the target, so
 * "scroll to bottom" and "scroll to target" are different goals). Both
 * directions are real user input; no locator auto-scroll is involved.
 */
export async function wheelMainUntilVisible(page: Page, target: Locator, { maxSteps = 90, wheelDelta = 120 }: WheelOptions = {}): Promise<TargetVisibility> {
  const hover = await pickWheelHoverPoint(page);
  await page.mouse.move(hover.x, hover.y);
  let stalled = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const visibility = await targetVisibility(page, target);
    if (visibility.fullyVisible) return visibility;
    const direction = visibility.rect.bottom <= visibility.navBottom + 1 ? -1 : 1;
    const { before, after } = await wheelStep(page, wheelDelta * direction);
    if (after.scrollTop === before.scrollTop) {
      stalled += 1;
      if (stalled >= 3) {
        throw new Error(`真实滚轮无法把目标滚入主区可视范围（该方向已不可滚动）：${JSON.stringify({ main: after, target: visibility.rect })}`);
      }
    } else {
      stalled = 0;
    }
  }
  const final = await targetVisibility(page, target);
  throw new Error(`滚轮 ${maxSteps} 步后目标仍在主区可视范围之外：${JSON.stringify(final.rect)}`);
}

/**
 * Prove reachability with real wheel input, then click at verified coordinates.
 * Locator auto-scroll, scrollIntoView, force clicks and programmatic scrollTop
 * are never allowed to be the delivery mechanism.
 */
export async function wheelToAndClick(page: Page, target: Locator): Promise<void> {
  const initial = await readMainMetrics(page);
  const visibility = await targetVisibility(page, target);
  if (!visibility.fullyVisible) {
    expect(
      initial.scrollHeight,
      '目标最初不可见时，页面必须真的有溢出内容，滚轮验收才有意义',
    ).toBeGreaterThan(initial.clientHeight);
    await wheelMainUntilVisible(page, target);
    const after = await readMainMetrics(page);
    expect(after.scrollTop, '真实滚轮必须产生实际位移').toBeGreaterThan(initial.scrollTop);
  }
  const confirmed = await targetVisibility(page, target);
  expect(confirmed.fullyVisible, `点击前目标必须在主区可视范围内且不被状态栏遮挡：${JSON.stringify(confirmed)}`).toBe(true);
  const box = await target.boundingBox();
  expect(box, '目标必须具有可点击的几何区域').not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  const element = await target.evaluateHandle((node) => node);
  const hitIsTarget = await page.evaluate(({ pointX, pointY, node }: { pointX: number; pointY: number; node: Element }) => {
    const hit = document.elementFromPoint(pointX, pointY);
    return hit !== null && (hit === node || node.contains(hit));
  }, { pointX: x, pointY: y, node: element as unknown as Element });
  expect(hitIsTarget, `点击坐标必须命中目标本身（elementFromPoint 校验）`).toBe(true);
  await page.mouse.click(x, y);
}
