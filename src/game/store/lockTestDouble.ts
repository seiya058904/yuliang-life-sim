/**
 * Reference stand-in for `navigator.locks` in unit tests.
 *
 * It follows the real Web Locks completion contract, because a double that
 * resolves early would silently hide exactly the bugs the store cares about:
 *
 * - `request()` stays **pending** until the granted callback has actually
 *   finished, so a queued write is observably "still in flight".
 * - It resolves with the callback's return value and rejects when the callback
 *   throws, matching the spec instead of discarding the result.
 * - Same-name `exclusive` requests are serialized: the next callback starts
 *   only after the previous one (including its returned promise) settles.
 *
 * This is a test double. Its behaviour is deliberately *derived from* the
 * native contract — it is never evidence about what the browser does; only a
 * real browser run is (see `e2e/save-concurrency.spec.ts`).
 */
export interface LockRequestCall {
  name: string;
  mode: 'exclusive';
}

export interface LockDouble {
  /** Restores the previous `navigator.locks` value (or removes it). */
  restore: () => void;
  /** Callbacks queued by name that have not been granted yet. */
  pendingCount: (name?: string) => number;
  /** True while a granted callback has not settled yet. */
  isBusy: () => boolean;
  /** Stops granting new requests; queued callbacks wait until `releaseAll`. */
  pause: () => void;
  /** Grants queued requests again. */
  resume: () => void;
  /** Calls observed in order, for asserting serialization. */
  calls: LockRequestCall[];
  /** When true, `request()` rejects without running the callback. */
  failRequests: (reason?: unknown) => void;
  /** Lets held requests proceed again. */
  allowRequests: () => void;
}

interface QueueEntry {
  callback: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export function installLockDouble(target: { locks?: unknown } = navigator as unknown as { locks?: unknown }): LockDouble {
  const previous = target.locks;
  const queues = new Map<string, QueueEntry[]>();
  const running = new Set<string>();
  const calls: LockRequestCall[] = [];
  let paused = false;
  let failure: { failed: true; reason: unknown } | undefined;

  const pump = (name: string): void => {
    if (paused || running.has(name)) return;
    const queue = queues.get(name);
    const next = queue?.shift();
    if (!next) return;
    running.add(name);
    // `Promise.resolve().then(...)` mirrors the spec: the callback runs in a
    // microtask after the lock is granted, and the lock is held until the
    // callback's own promise settles.
    void Promise.resolve()
      .then(() => next.callback())
      .then(
        (value) => { running.delete(name); next.resolve(value); pump(name); },
        (error) => { running.delete(name); next.reject(error); pump(name); },
      );
  };

  target.locks = {
    request: (name: unknown, options: { mode: 'exclusive' }, callback: () => unknown) => {
      calls.push({ name: String(name), mode: options.mode });
      if (failure) return Promise.reject(failure.reason);
      return new Promise<unknown>((resolve, reject) => {
        const queue = queues.get(String(name)) ?? [];
        queue.push({ callback, resolve, reject });
        queues.set(String(name), queue);
        pump(String(name));
      });
    },
  };

  return {
    restore: () => {
      if (previous === undefined) delete target.locks;
      else target.locks = previous;
    },
    pendingCount: (name?: string) => {
      const names = name ? [name] : [...queues.keys()];
      return names.reduce((total, key) => total + (queues.get(key)?.length ?? 0), 0);
    },
    isBusy: () => running.size > 0,
    pause: () => { paused = true; },
    resume: () => {
      if (!paused) return;
      paused = false;
      for (const name of queues.keys()) pump(name);
    },
    calls,
    failRequests: (reason = new Error('locks denied')) => { failure = { failed: true, reason }; },
    allowRequests: () => { failure = undefined; },
  };
}

/** Drains queued microtasks and pending timers until the lock manager is idle. */
export async function settleLocks(double: LockDouble): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
    if (double.pendingCount() === 0 && !double.isBusy()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * A lock manager that never grants anything: every request stays pending
 * forever. Used to prove that "queued" is never reported as "saved".
 */
export function installNeverGrantingLocks(target: { locks?: unknown } = navigator as unknown as { locks?: unknown }): () => void {
  const previous = target.locks;
  target.locks = {
    request: () => new Promise<never>(() => { /* stays pending on purpose */ }),
  };
  return () => {
    if (previous === undefined) delete target.locks;
    else target.locks = previous;
  };
}
