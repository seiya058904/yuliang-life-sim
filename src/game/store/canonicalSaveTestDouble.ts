/**
 * Synchronous stand-in for the IndexedDB canonical record, for unit tests only.
 *
 * The real commit path is asynchronous: the result of a save is only known when
 * `IDBTransaction.complete` fires, and everything a window knows about the
 * canonical version arrives after a read. Unit tests are built around reading
 * `store.getState()` on the line after creating the store, and around seeding a
 * fixture and reading the saved payload back synchronously, so the store is
 * written against a backend that is allowed to answer with a plain value (see
 * `MaybePromise`). This double is that synchronous backend.
 *
 * It models the same commit contract as `canonicalSave.ts` — compare the
 * expected `{generation, revision}` against the stored record, replace the
 * payload and advance the revision in one indivisible step, and honour the
 * `onPutSucceeded` abort seam — so the store's protocol logic (conflict
 * detection, refusal, supersession, recovery, migration) is what these tests
 * exercise. It does **not** prove anything about IndexedDB itself: the real
 * transaction path is verified in a browser against the production build, in
 * `e2e/save-concurrency.spec.ts`.
 *
 * The record is kept in `localStorage` on purpose: existing tests already reset
 * the world with `localStorage.clear()`, and that must keep clearing the save
 * exactly as it did when `localStorage` held the canonical record. Nothing in
 * the shipped application reads or writes this key.
 */
import { CANONICAL_SAVE_SLOT, newGeneration, setCanonicalSaveBackend, type CanonicalHead, type CanonicalRead, type CanonicalSaveBackend, type CommitOutcome, type CommitRequest, type MaybePromise } from './canonicalSave';
import { describeError } from './describeError';

/** Test-only key. The application never touches it. */
export const CANONICAL_DOUBLE_KEY = 'yuliang-canonical-double';

interface StoredDoubleRecord extends CanonicalHead {
  slot: string;
  payload: string;
  /** Number of commits that replaced the record, for write-count assertions. */
  commits: number;
}

function parseStored(raw: string | null): StoredDoubleRecord | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Partial<StoredDoubleRecord>;
    if (record.slot !== CANONICAL_SAVE_SLOT) return undefined;
    if (typeof record.generation !== 'string' || !record.generation) return undefined;
    if (!Number.isInteger(record.revision) || Number(record.revision) <= 0) return undefined;
    if (typeof record.payload !== 'string') return undefined;
    return { slot: CANONICAL_SAVE_SLOT, generation: record.generation, revision: Number(record.revision), payload: record.payload, commits: Number(record.commits ?? 0) };
  } catch {
    return undefined;
  }
}

export class SynchronousCanonicalSaveDouble implements CanonicalSaveBackend {
  /** Injected failure for the next commit, for storage-failure coverage. */
  private failure: { message: string; quotaExceeded: boolean } | undefined;
  /** Commits waiting for `release()` while the double is holding. */
  private held: Array<() => void> = [];
  private holding = false;

  /**
   * The store may commit and know the result without ever returning a promise —
   * unless the test holds commits, which is how "queued is not success" is
   * exercised against the same contract the browser backend follows.
   */
  get synchronous(): boolean {
    return !this.holding;
  }

  /** Answer commits only after `release()`. */
  hold(): void {
    this.holding = true;
  }

  /**
   * Release every held commit in issue order. Each one is decided at release
   * time, so the second sees the first one's write exactly as a serialized
   * IndexedDB transaction would.
   */
  release(): void {
    const waiters = this.held;
    this.held = [];
    this.holding = false;
    for (const waiter of waiters) waiter();
  }

  /** Drop held commits without running them: the page died with a write in flight. */
  abandon(): void {
    this.held = [];
    this.holding = false;
  }

  /**
   * Let the first `count` held commits run and keep holding the rest: the page
   * had time to land the write it already had open, and died before the write
   * queued behind it. Each one is still decided at settle time, in issue order.
   */
  settleFirst(count = 1): void {
    for (const waiter of this.held.splice(0, count)) waiter();
  }

  private readStored(): StoredDoubleRecord | undefined {
    try {
      return parseStored(localStorage.getItem(CANONICAL_DOUBLE_KEY));
    } catch {
      return undefined;
    }
  }

  private writeStored(record: StoredDoubleRecord): void {
    localStorage.setItem(CANONICAL_DOUBLE_KEY, JSON.stringify(record));
  }

  /** Fail the next commit with `message` (a stand-in for a storage failure). */
  failNextCommitWith(message: string, quotaExceeded = false): void {
    this.failure = { message, quotaExceeded };
  }

  read(): CanonicalRead {
    let raw: string | null;
    try {
      raw = localStorage.getItem(CANONICAL_DOUBLE_KEY);
    } catch {
      // The double's store *is* `localStorage`. A test that denies storage reads
      // is simulating a world with no save at all, so the canonical record is
      // reported as absent rather than unreadable: the legacy-payload path is
      // what such a test is about.
      return { status: 'ok' };
    }
    if (raw === null) return { status: 'ok' };
    const stored = parseStored(raw);
    if (!stored) return { status: 'unavailable', error: '正式存档记录无法识别' };
    return { status: 'ok', snapshot: { head: { generation: stored.generation, revision: stored.revision }, payload: stored.payload } };
  }

  commit(request: CommitRequest): MaybePromise<CommitOutcome> {
    if (!this.holding) return this.commitNow(request);
    return new Promise<CommitOutcome>((resolve) => { this.held.push(() => resolve(this.commitNow(request))); });
  }

  private commitNow(request: CommitRequest): CommitOutcome {
    if (this.failure) {
      const { message, quotaExceeded } = this.failure;
      this.failure = undefined;
      return { status: 'failed', error: message, quotaExceeded };
    }
    const current = this.readStored();
    const currentHead: CanonicalHead | undefined = current ? { generation: current.generation, revision: current.revision } : undefined;
    const expected = request.expected;
    const matches = currentHead === undefined
      ? expected === undefined
      : expected !== undefined && expected.generation === currentHead.generation && expected.revision === currentHead.revision;
    if (!matches) return { status: 'conflict', ...(currentHead ? { current: currentHead } : {}) };
    const head: CanonicalHead = request.rotate || currentHead === undefined
      ? { generation: request.nextGeneration ?? newGeneration(), revision: 1 }
      : { generation: currentHead.generation, revision: currentHead.revision + 1 };
    // The write is only stored once the seam has had its say, so an aborted
    // commit really leaves the record untouched.
    if (request.onPutSucceeded?.() === 'abort') return { status: 'failed', error: '存档事务已中止，正式存档未被替换。' };
    try {
      this.writeStored({ slot: CANONICAL_SAVE_SLOT, ...head, payload: request.payload, commits: (current?.commits ?? 0) + 1 });
    } catch (error) {
      // A denied storage write is a failed commit, never a silent success.
      return { status: 'failed', error: describeError(error) };
    }
    return { status: 'committed', head };
  }

  /** The payload currently stored, or `null` when no record exists. */
  payload(): string | null {
    return this.readStored()?.payload ?? null;
  }

  /** The version currently stored. */
  head(): CanonicalHead | undefined {
    const stored = this.readStored();
    return stored ? { generation: stored.generation, revision: stored.revision } : undefined;
  }

  /** Commits that replaced the record since the last `localStorage.clear()`. */
  commits(): number {
    return this.readStored()?.commits ?? 0;
  }
}

let installed: SynchronousCanonicalSaveDouble | undefined;

/** Install a synchronous backend for the current test file. */
export function installCanonicalSaveDouble(): SynchronousCanonicalSaveDouble {
  installed = new SynchronousCanonicalSaveDouble();
  setCanonicalSaveBackend(installed);
  return installed;
}

export function canonicalSaveDouble(): SynchronousCanonicalSaveDouble {
  if (!installed) throw new Error('测试未安装同步存档替身：请先调用 installCanonicalSaveDouble()');
  return installed;
}

/** The stored canonical payload, or `null` when no record exists. */
export function canonicalSaveRaw(): string | null {
  return canonicalSaveDouble().payload();
}

/** The stored canonical version. */
export function canonicalSaveHead(): CanonicalHead | undefined {
  return canonicalSaveDouble().head();
}

/** The stored record as boot sees it, for the unload-candidate lineage check. */
export function canonicalSaveStored(): { head: CanonicalHead; payload: string } | undefined {
  const head = canonicalSaveDouble().head();
  const payload = canonicalSaveDouble().payload();
  return head && payload !== null ? { head, payload } : undefined;
}

/** How many commits replaced the canonical record. */
export function canonicalCommitCount(): number {
  return canonicalSaveDouble().commits();
}

/** Fail the next commit; used by storage-failure tests. */
export function failNextCanonicalCommit(message: string, quotaExceeded = false): void {
  canonicalSaveDouble().failNextCommitWith(message, quotaExceeded);
}

/** Release held commits and let the store settle its completion callbacks. */
export async function settleCanonicalSave(): Promise<void> {
  canonicalSaveDouble().release();
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

/**
 * Let every commit the store has already scheduled reach the backend, without
 * settling anything. A scheduled commit is issued a few microtasks later, so a
 * test that needs a write to be *in flight* waits here before scheduling the
 * next one — otherwise the newer state supersedes it before it is ever issued.
 */
export async function yieldToCommitQueue(turns = 5): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve();
}

/**
 * Land only the oldest held commit and keep the rest pending: "the write that
 * was already open committed, the one queued behind it did not". Used to
 * reproduce a page that hides with a write in flight.
 */
export async function settleFirstCanonicalCommit(count = 1): Promise<void> {
  await yieldToCommitQueue();
  canonicalSaveDouble().settleFirst(count);
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}
