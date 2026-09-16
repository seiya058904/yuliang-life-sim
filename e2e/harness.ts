import { expect, type Locator, type Page } from '@playwright/test';
import { e2eAppPath } from '../playwright.config';

export const MAIN_CONTENT = 'main.main-content';
export const PERSISTENT_STATUS = '.persistent-status';

/** Canonical save location, mirrored from `src/game/store/canonicalSave.ts`. */
export const CANONICAL_DB = 'yuliang-save';
export const CANONICAL_STORE = 'saves';
export const CANONICAL_SLOT = 'main';
/** The legacy `localStorage` key: a migration source, never written by the app. */
export const LEGACY_SAVE_KEY = 'yuliang-save-v1';

export const navigate = (page: Page, name: string) =>
  page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name, exact: true }).click();

/** Navigate to the configured app base and assert the page really landed there. */
export async function gotoAppRoot(page: Page) {
  await page.goto('./');
  expect(new URL(page.url()).pathname, '应用必须落在配置的 base 路径上').toBe(e2eAppPath);
}

/**
 * Wait for the canonical save to have been read. The shell renders a loading
 * state until then, because acting on the placeholder would be refused.
 */
export async function awaitAppReady(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(() => {
    const bridge = (window as unknown as { __yuliang?: { store?: { getState?: () => { canonical?: { status?: string } } } } }).__yuliang;
    const status = bridge?.store?.getState?.().canonical?.status;
    return status === 'ready' || status === 'unavailable';
  }, undefined, { timeout });
}

export async function openApp(page: Page) {
  await gotoAppRoot(page);
  await page.waitForFunction(() => Boolean(window.__yuliang));
  await awaitAppReady(page);
}

/**
 * Boot the app with the debug bridge enabled and a clean save. Every
 * persistence test uses this so it starts from a known, isolated origin state:
 * both the canonical IndexedDB record and the legacy `localStorage` payload are
 * removed, because the app reads the record first and would otherwise ignore a
 * fixture written to the legacy key.
 *
 * The reload is awaited: without that, a caller can read `window.__yuliang`
 * from the *previous* document and seed or drive the wrong instance.
 */
export async function bootWithBridge(page: Page): Promise<void> {
  await gotoAppRoot(page);
  await wipeSave(page);
  await page.evaluate(() => localStorage.setItem('yuliang-e2e-hook', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => typeof (window as unknown as { __yuliang?: { store?: { getState?: unknown } } }).__yuliang?.store?.getState === 'function');
  await awaitAppReady(page);
}

export interface CanonicalRecordSnapshot { generation: string; revision: number; payload: string }

/**
 * Everything passed to `page.evaluate` runs in the browser, where module-scope
 * constants are not visible: each evaluated function repeats the schema
 * literals on purpose (`e2e/` is not typechecked by `tsc -b`).
 */
const readRecordInPage = (slot: string) => new Promise<CanonicalRecordSnapshot | null>((resolve) => {
  const request = indexedDB.open('yuliang-save', 1);
  request.onerror = () => resolve(null);
  request.onsuccess = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('saves')) { db.close(); resolve(null); return; }
    const transaction = db.transaction('saves', 'readonly');
    const read = transaction.objectStore('saves').get(slot);
    read.onsuccess = () => {
      const stored = read.result as CanonicalRecordSnapshot | undefined;
      resolve(stored ? { generation: stored.generation, revision: stored.revision, payload: stored.payload } : null);
    };
    read.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onabort = () => { db.close(); resolve(null); };
  };
});

/**
 * Read the canonical record straight out of IndexedDB — the same record the
 * app's boot reads, observed from outside the application.
 */
export async function readCanonicalRecord(page: Page): Promise<CanonicalRecordSnapshot | null> {
  return page.evaluate(readRecordInPage, CANONICAL_SLOT) as Promise<CanonicalRecordSnapshot | null>;
}

/** The persisted game state, or `{}` when no record exists yet. */
export async function readCanonicalState(page: Page): Promise<Record<string, unknown>> {
  const record = await readCanonicalRecord(page);
  if (!record) return {};
  try {
    return JSON.parse(record.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Replace the canonical payload in place, keeping the stored version, so a
 * fixture behaves like the save it is standing in for. Used to seed a world;
 * the app must be reloaded afterwards, because a running window keeps its own
 * state and version.
 */
/**
 * Replace the canonical payload with a seeded world. Like every fixture write it
 * starts a new generation, so a window that was still running against the
 * previous one cannot re-commit over the seed and its unload candidate is pruned
 * rather than adopted.
 */
export async function writeCanonicalState(page: Page, state: unknown): Promise<void> {
  await page.evaluate(({ slot, payload }: { slot: string; payload: string }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('yuliang-save', 1);
    request.onerror = () => reject(new Error('无法打开存档数据库'));
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'slot' });
      const transaction = db.transaction('saves', 'readwrite');
      const generation = `fixture-${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
      transaction.objectStore('saves').put({ slot, generation, revision: 1, payload });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(new Error('写入存档记录失败')); };
    };
  }), { slot: CANONICAL_SLOT, payload: JSON.stringify(state) });
}

/** The canonical record's generation and revision, or `null` when absent. */
export async function canonicalHead(page: Page): Promise<{ generation: string; revision: number } | null> {
  const record = await readCanonicalRecord(page);
  return record ? { generation: record.generation, revision: record.revision } : null;
}

/**
 * The persisted save, after giving this window's own pending commit a moment to
 * land. A save is now a database transaction, so reading immediately after a UI
 * action can observe the previous version; waiting for the record to match the
 * live state is what makes "act, then read the save" mean what it says. When
 * the window cannot write at all (frozen, or a write-protected recovery) the
 * short wait expires and the record is returned as it is.
 *
 * When no canonical record exists yet, the legacy `localStorage` payload is
 * returned instead: that is the world a seeded fixture booted from, because the
 * application never writes that key. A canonical record always wins, so this
 * cannot hide a save the app made.
 */
export async function readPersistedState(page: Page, settleMs = 2_000): Promise<Record<string, unknown>> {
  await page.waitForFunction((slot: string) => new Promise<boolean>((resolve) => {
    const request = indexedDB.open('yuliang-save', 1);
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('saves')) { db.close(); resolve(false); return; }
      const read = db.transaction('saves', 'readonly').objectStore('saves').get(slot);
      read.onsuccess = () => {
        const stored = read.result as CanonicalRecordSnapshot | undefined;
        db.close();
        const bridge = (window as unknown as { __yuliang?: { store?: { getState?: () => { game?: unknown } } } }).__yuliang;
        const live = bridge?.store?.getState?.().game;
        resolve(Boolean(stored) && Boolean(live) && stored!.payload === JSON.stringify(live));
      };
      read.onerror = () => { db.close(); resolve(false); };
    };
  }), CANONICAL_SLOT, { timeout: settleMs }).catch(() => undefined);
  const record = await readCanonicalRecord(page);
  if (record) {
    try { return JSON.parse(record.payload) as Record<string, unknown>; } catch { return {}; }
  }
  const legacy = await page.evaluate((key) => localStorage.getItem(key), LEGACY_SAVE_KEY);
  if (!legacy) return {};
  try { return JSON.parse(legacy) as Record<string, unknown>; } catch { return {}; }
}

/**
 * Install a page-side save bridge (`window.__e2eSave`) that reads and writes the
 * canonical record with raw IndexedDB, so a fixture that used to read and
 * rewrite `localStorage` keeps its shape while the save lives in the database.
 * Install it before the navigation whose document needs it.
 */
export async function installSaveBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const open = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('yuliang-save', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves', { keyPath: 'slot' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开存档数据库'));
    });
    const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> => {
      const db = await open();
      return new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction('saves', mode);
        const result = run(transaction.objectStore('saves'));
        let value: T | undefined;
        if (result) result.onsuccess = () => { value = result.result; };
        transaction.oncomplete = () => { db.close(); resolve(value); };
        transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('存档事务被中止')); };
      });
    };
    (window as unknown as { __e2eSave?: unknown }).__e2eSave = {
      /** The persisted game state, or `{}` when nothing was saved yet. */
      read: async () => {
        const stored = await withStore<{ payload: string }>('readonly', (store) => store.get('main'));
        if (!stored) return {};
        try { return JSON.parse(stored.payload); } catch { return {}; }
      },
      /** Replace the persisted payload with a fresh version, as a seed would. */
      write: async (state: unknown) => {
        // A fixture replaces the world, so it starts a new generation: a window
        // that was still running against the previous one must not be able to
        // re-commit over the fixture, and its unload candidate (which descends
        // from the old generation) is pruned at the next boot instead of
        // overriding the seeded payload.
        const generation = `fixture-${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
        await withStore('readwrite', (store) => {
          store.put({ slot: 'main', generation, revision: 1, payload: JSON.stringify(state) });
          return undefined;
        });
      },
    };
  });
}

/** Remove the canonical record and every `localStorage` save artefact. */
export async function wipeSave(page: Page): Promise<void> {
  await page.evaluate((slot: string) => new Promise<void>((resolve) => {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith('yuliang-') && key !== 'yuliang-e2e-hook');
    for (const key of keys) localStorage.removeItem(key);
    const request = indexedDB.open('yuliang-save', 1);
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('saves')) { db.close(); resolve(); return; }
      const transaction = db.transaction('saves', 'readwrite');
      transaction.objectStore('saves').delete(slot);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); resolve(); };
    };
  }), CANONICAL_SLOT);
}

/** Wait until the canonical record matches the live in-memory game state. */
export async function awaitCanonicalSynced(page: Page, timeout = 5_000): Promise<void> {
  await page.waitForFunction(async (slot: string) => {
    const record = await new Promise<{ payload?: string } | null>((resolve) => {
      const request = indexedDB.open('yuliang-save', 1);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('saves', 'readonly').objectStore('saves').get(slot);
        read.onsuccess = () => { resolve((read.result as { payload?: string } | undefined) ?? null); db.close(); };
        read.onerror = () => { db.close(); resolve(null); };
      };
    });
    const live = (window as unknown as { __yuliang: { store: { getState: () => { game: unknown } } } }).__yuliang.store.getState().game;
    return Boolean(record) && record!.payload === JSON.stringify(live);
  }, CANONICAL_SLOT, { timeout });
}

/** The canonical save's revision counter, or 0 when it was never written. */
export async function saveRevision(page: Page): Promise<number> {
  return (await canonicalHead(page))?.revision ?? 0;
}

/**
 * Open a Career sub-page by its navigation label. The career surface collapses
 * its sections behind a menu button at some viewports, so both shapes are
 * handled instead of assuming one layout.
 */
export async function openCareerPage(page: Page, label: string): Promise<void> {
  const pageMenu = page.getByRole('button', { name: /^职业页面/ });
  if (await pageMenu.count()) {
    await pageMenu.click();
    await page.getByRole('navigation', { name: '职业页面导航' }).getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await page.getByRole('button', { name: label, exact: true }).click();
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
