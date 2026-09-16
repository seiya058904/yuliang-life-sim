import { describe, expect, it } from 'vitest';
import { installLockDouble, installNeverGrantingLocks, settleLocks } from './lockTestDouble';

/**
 * The double is only useful if it behaves like the primitive it replaces, so its
 * own contract is asserted here. These assertions describe the *double*, not the
 * browser: the production behaviour under the real `navigator.locks` is covered
 * by `e2e/save-concurrency.spec.ts`.
 */
describe('lock test double follows the Web Locks completion contract', () => {
  it('keeps the request pending until the callback has finished', async () => {
    const double = installLockDouble();
    try {
      let finished = false;
      const request = navigator.locks.request('probe', { mode: 'exclusive' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        finished = true;
        return 'done';
      });

      // The callback has not had a chance to run yet: the request must still be
      // pending, which is what makes "queued" distinguishable from "saved".
      let settled = false;
      void request.then(() => { settled = true; });
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(settled).toBe(false);
      expect(finished).toBe(false);

      await settleLocks(double);
      await expect(request).resolves.toBe('done');
      expect(finished).toBe(true);
    } finally {
      double.restore();
    }
  });

  it('resolves with the callback return value and rejects with its error', async () => {
    const double = installLockDouble();
    try {
      await expect(navigator.locks.request('probe', { mode: 'exclusive' }, () => 42)).resolves.toBe(42);
      await expect(navigator.locks.request('probe', { mode: 'exclusive' }, () => { throw new Error('boom'); })).rejects.toThrow('boom');
    } finally {
      double.restore();
    }
  });

  it('serializes same-name exclusive requests instead of interleaving them', async () => {
    const double = installLockDouble();
    try {
      const order: string[] = [];
      const first = navigator.locks.request('probe', { mode: 'exclusive' }, async () => {
        order.push('first:enter');
        await new Promise((resolve) => setTimeout(resolve, 0));
        order.push('first:exit');
      });
      const second = navigator.locks.request('probe', { mode: 'exclusive' }, () => {
        order.push('second:enter');
        order.push('second:exit');
      });

      // The second callback must not start before the first one finished.
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
      expect(order).toEqual(['first:enter']);

      await settleLocks(double);
      await Promise.all([first, second]);
      expect(order).toEqual(['first:enter', 'first:exit', 'second:enter', 'second:exit']);
      expect(double.calls).toEqual([
        { name: 'probe', mode: 'exclusive' },
        { name: 'probe', mode: 'exclusive' },
      ]);
    } finally {
      double.restore();
    }
  });

  it('holds every request while paused and grants them on resume', async () => {
    const double = installLockDouble();
    double.pause();
    try {
      let ran = false;
      const request = navigator.locks.request('probe', { mode: 'exclusive' }, () => { ran = true; return 'held'; });
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(ran).toBe(false);
      expect(double.pendingCount()).toBe(1);

      double.resume();
      await settleLocks(double);
      await expect(request).resolves.toBe('held');
      expect(double.pendingCount()).toBe(0);
    } finally {
      double.restore();
    }
  });

  it('can model a manager that never grants anything', async () => {
    const release = installNeverGrantingLocks();
    try {
      let settled = false;
      void navigator.locks.request('probe', { mode: 'exclusive' }, () => 'never').then(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      // Settling the microtask queue must not resolve it either.
      for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      release();
    }
  });
});
