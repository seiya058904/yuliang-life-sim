/**
 * Canonical save storage: one record in IndexedDB, committed by
 * compare-and-commit inside a single `readwrite` transaction.
 *
 * The record is `{ slot, generation, revision, payload }`. Every save reads the
 * record, compares the version this window last confirmed, and replaces the
 * payload with `revision + 1` — read, compare and write all inside the *same*
 * transaction. IndexedDB applies a transaction as a whole or not at all, so a
 * writer whose expected version is stale cannot pass the comparison and still
 * land: the transaction that would have written it is the one that saw the
 * newer record.
 *
 * Why `localStorage` + Web Locks is not the basis any more
 * -------------------------------------------------------
 * The previous protocol took an exclusive Web Lock, read `localStorage`,
 * compared it with the payload the tab believed was stored, and only then
 * wrote the payload and the revision. Two measured facts break it:
 *
 * - The lock does order callbacks, but `localStorage` is not a transactional
 *   store: one document's reads are not required to observe another document's
 *   writes (HTML leaves the interaction between agent clusters unspecified and
 *   warns authors not to assume locking). With two independently created
 *   same-origin documents and a fast handover (0.1-0.4 ms) the second writer's
 *   in-lock read returned the pre-write snapshot, so it passed the check and
 *   wrote the canonical payload *and* the revision a second time. Reproduced in
 *   3/6 probe rounds, 5/6 rounds of the release gate, and 0/6 when both
 *   documents lived in one process — a lock cannot make a non-transactional
 *   store atomic.
 * - A Web Lock only serializes the writer while it holds it. The unload path
 *   cannot take the lock synchronously, so it had to be pushed out to a
 *   separate candidate key anyway: the lock was never what protected the
 *   canonical record from an unload write.
 *
 * What this module guarantees
 * ---------------------------
 * - `commit` resolves `committed` **only** after `IDBTransaction` fires
 *   `complete`. A successful `put` request is not a successful save, so the
 *   callback that reports success is never wired to the request.
 * - A version mismatch issues no write at all and reports `conflict` with the
 *   record that is actually stored.
 * - Nothing inside the transaction awaits a timer, an event or any other
 *   promise: an idle IndexedDB transaction auto-commits between tasks, so the
 *   only work done while it is live is the read, the comparison and the write.
 * - When IndexedDB is unavailable the read reports `unavailable` and every
 *   commit fails with a reported error. There is **no** fallback to a
 *   multi-window `localStorage` canonical write: the earlier protocol is what
 *   this module exists to replace.
 */
import { describeError } from './describeError';

export const CANONICAL_SAVE_DB = 'yuliang-save';
export const CANONICAL_SAVE_DB_VERSION = 1;
export const CANONICAL_SAVE_STORE = 'saves';
/** Only one canonical slot exists; the key keeps the store ready for more. */
export const CANONICAL_SAVE_SLOT = 'main';

/** Reported instead of pretending the progress was written. */
export const CANONICAL_STORAGE_UNAVAILABLE = '浏览器存档存储不可用，本次进度不会被保存。';
/** Reported when the transaction was rolled back, so nothing was replaced. */
export const CANONICAL_COMMIT_ABORTED = '存档事务已中止，正式存档未被替换。';

/** The version pair every commit is checked against. */
export interface CanonicalHead { generation: string; revision: number }
export interface CanonicalRecord extends CanonicalHead { slot: string; payload: string }
export interface CanonicalSnapshot { head: CanonicalHead; payload: string }

export interface CommitRequest {
  /**
   * The version this window last confirmed — from the record it loaded or from
   * its own last successful commit. `undefined` means "no record exists yet",
   * which is what a first write or a first migration must prove again inside
   * the transaction. Never re-read a newer record and adopt it as the
   * expectation: that would overwrite the update it just observed.
   */
  expected: CanonicalHead | undefined;
  payload: string;
  /** Reset: start a fresh generation so older versions can never be replayed. */
  rotate?: boolean;
  /**
   * The generation this write will create when it creates one (a reset, or the
   * first record). The caller allocates it *before* the transaction opens, so
   * the window already knows the generation it is creating — the only way a
   * later boot can prove that a stored generation came from that write and not
   * from another window that happened to write the same payload.
   *
   * Optional so a fixture write can still let the store pick one; a caller that
   * needs the proof must supply it.
   */
  nextGeneration?: string;
  /**
   * Test-only abort seam. Called synchronously from inside the live
   * transaction after the payload write request succeeded and before the
   * transaction commits; `'abort'` rolls the whole transaction back.
   */
  onPutSucceeded?: () => 'abort' | undefined;
}

export type CommitOutcome =
  | { status: 'committed'; head: CanonicalHead }
  | { status: 'conflict'; current?: CanonicalHead }
  /** `quotaExceeded` lets the caller retry with a smaller payload, never to force a write. */
  | { status: 'failed'; error: string; quotaExceeded?: boolean };

export type CanonicalRead = { status: 'ok'; snapshot?: CanonicalSnapshot } | { status: 'unavailable'; error: string };

/** A backend may answer synchronously, which the in-memory test double does. */
export type MaybePromise<T> = T | Promise<T>;

export interface CanonicalSaveBackend {
  /**
   * True when `read`/`commit` answer with plain values instead of promises. Only
   * the synchronous test double declares this; the browser backend never does,
   * so production always takes the queued path.
   */
  readonly synchronous?: boolean;
  read(): MaybePromise<CanonicalRead>;
  commit(request: CommitRequest): MaybePromise<CommitOutcome>;
}

export function isThenable<T>(value: MaybePromise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}

export function newGeneration(): string {
  return `gen-${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 10)}`;
}

function headOf(record: CanonicalRecord): CanonicalHead {
  return { generation: record.generation, revision: record.revision };
}

function isUsableRecord(value: unknown): value is CanonicalRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<CanonicalRecord>;
  return record.slot === CANONICAL_SAVE_SLOT
    && typeof record.generation === 'string' && record.generation.length > 0
    && Number.isInteger(record.revision) && Number(record.revision) > 0
    && typeof record.payload === 'string';
}

const UNREADABLE_RECORD = '正式存档记录无法识别';

/** A full storage quota is the one failure the caller can answer with a smaller payload. */
function isQuotaError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'QuotaExceededError') return true;
  return /quota/i.test(describeError(error));
}

let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(CANONICAL_SAVE_DB, CANONICAL_SAVE_DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CANONICAL_SAVE_STORE)) db.createObjectStore(CANONICAL_SAVE_STORE, { keyPath: 'slot' });
      };
      request.onsuccess = () => {
        const db = request.result;
        // A version change from another window must not leave this handle
        // blocking; the next access reopens the database.
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('无法打开存档数据库'));
      request.onblocked = () => reject(new Error('存档数据库被其他窗口占用'));
    });
    database.catch(() => { database = undefined; });
  }
  return database;
}

function readWithIdb(): Promise<CanonicalRead> {
  return openDatabase().then((db) => new Promise<CanonicalRead>((resolve) => {
    let settled = false;
    const finish = (value: CanonicalRead) => { if (!settled) { settled = true; resolve(value); } };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(CANONICAL_SAVE_STORE, 'readonly');
    } catch (error) {
      finish({ status: 'unavailable', error: describeError(error) });
      return;
    }
    const request = transaction.objectStore(CANONICAL_SAVE_STORE).get(CANONICAL_SAVE_SLOT);
    request.onsuccess = () => {
      const stored: unknown = request.result;
      if (stored === undefined || stored === null) { finish({ status: 'ok' }); return; }
      if (!isUsableRecord(stored)) { finish({ status: 'unavailable', error: UNREADABLE_RECORD }); return; }
      finish({ status: 'ok', snapshot: { head: headOf(stored), payload: stored.payload } });
    };
    request.onerror = () => finish({ status: 'unavailable', error: describeError(request.error) });
    transaction.onabort = () => finish({ status: 'unavailable', error: describeError(transaction.error) });
  }), (error: unknown) => ({ status: 'unavailable' as const, error: describeError(error) }));
}

function commitWithIdb(request: CommitRequest): Promise<CommitOutcome> {
  return openDatabase().then((db) => new Promise<CommitOutcome>((resolve) => {
    let settled = false;
    /** Set once the payload write request succeeded; never before. */
    let writtenHead: CanonicalHead | undefined;
    let outcome: CommitOutcome | undefined;
    const finish = (value: CommitOutcome) => { if (!settled) { settled = true; resolve(value); } };
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(CANONICAL_SAVE_STORE, 'readwrite');
    } catch (error) {
      finish({ status: 'failed', error: describeError(error) });
      return;
    }
    const store = transaction.objectStore(CANONICAL_SAVE_STORE);
    const read = store.get(CANONICAL_SAVE_SLOT);
    read.onerror = () => {
      outcome = { status: 'failed', error: describeError(read.error), quotaExceeded: isQuotaError(read.error) };
      try { transaction.abort(); } catch { /* already failing */ }
    };
    read.onsuccess = () => {
      const stored: unknown = read.result;
      if (stored !== undefined && stored !== null && !isUsableRecord(stored)) {
        // A record this build cannot read must never be replaced: report it.
        outcome = { status: 'failed', error: UNREADABLE_RECORD };
        try { transaction.abort(); } catch { /* already failing */ }
        return;
      }
      const current = stored ? headOf(stored as CanonicalRecord) : undefined;
      const expectation = request.expected;
      const matches = current === undefined
        ? expectation === undefined
        : expectation !== undefined && current.generation === expectation.generation && current.revision === expectation.revision;
      if (!matches) {
        // No request is issued for the mismatch, so the transaction completes
        // without changing anything: a conflict is not a silent success.
        outcome = { status: 'conflict', ...(current ? { current } : {}) };
        return;
      }
      const head: CanonicalHead = request.rotate || current === undefined
        ? { generation: request.nextGeneration ?? newGeneration(), revision: 1 }
        : { generation: current.generation, revision: current.revision + 1 };
      const record: CanonicalRecord = { slot: CANONICAL_SAVE_SLOT, ...head, payload: request.payload };
      let write: IDBRequest<IDBValidKey>;
      try {
        write = store.put(record);
      } catch (error) {
        outcome = { status: 'failed', error: describeError(error) };
        try { transaction.abort(); } catch { /* already failing */ }
        return;
      }
      write.onsuccess = () => {
        writtenHead = head;
        // Synchronous by contract: awaiting here would let the idle transaction
        // auto-commit before the caller's verdict.
        if (request.onPutSucceeded?.() === 'abort') {
          outcome = { status: 'failed', error: CANONICAL_COMMIT_ABORTED };
          try { transaction.abort(); } catch { /* already failing */ }
        }
      };
      write.onerror = () => { outcome = { status: 'failed', error: describeError(write.error), quotaExceeded: isQuotaError(write.error) }; };
    };
    // Only the transaction settling decides the result. A successful `put` is
    // reported above but nothing but `complete` may be called a save.
    transaction.oncomplete = () => {
      finish(writtenHead ? { status: 'committed', head: writtenHead } : outcome ?? { status: 'failed', error: '存档事务未写入任何内容' });
    };
    transaction.onabort = () => finish(outcome?.status === 'failed' ? outcome : {
      status: 'failed',
      error: transaction.error ? describeError(transaction.error) : CANONICAL_COMMIT_ABORTED,
      ...(transaction.error ? { quotaExceeded: isQuotaError(transaction.error) } : {}),
    });
    transaction.onerror = (event) => {
      // Request errors bubble before the transaction's abort sets its error.
      // Preserve the request's cause (including quota) and wait for rollback;
      // resolving here can report `null` and skip the compressed retry.
      if (outcome?.status === 'failed') return;
      const error = event.target instanceof IDBRequest ? event.target.error : transaction.error;
      if (error) outcome = { status: 'failed', error: describeError(error), quotaExceeded: isQuotaError(error) };
    };
  }), (error: unknown) => ({ status: 'failed' as const, error: describeError(error) }));
}

/** The IndexedDB backend used in the browser. */
export function createIndexedDbBackend(): CanonicalSaveBackend {
  return { read: readWithIdb, commit: commitWithIdb };
}

let backend: CanonicalSaveBackend | undefined;

/**
 * Install the backend every store uses. Tests install the synchronous
 * in-memory double here; production never calls this and keeps the IndexedDB
 * backend. There is deliberately no automatic fallback when IndexedDB is
 * missing — that path reports itself as unavailable instead.
 */
export function setCanonicalSaveBackend(next: CanonicalSaveBackend | undefined): void {
  backend = next;
}

export function getCanonicalSaveBackend(): CanonicalSaveBackend {
  backend ??= createIndexedDbBackend();
  return backend;
}
