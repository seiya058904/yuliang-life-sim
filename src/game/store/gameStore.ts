import { amount, unknown } from '../engine/knownAmount';
import { factsFromHistory, retentionKey } from '../engine/businessFacts';
import { create } from 'zustand';
import type { BalanceConfig } from '../balance/config';
import type { ActivityDuration, ApplicationCooldownState, ContentRegistry, FinancialEntry, GameAction, GameEffect, GameState, GigOpportunityState, JobApplicationState, JobSchedule, LifeRecordEntry, PlannedActivity, ViewId, WorldSnapshot } from '../content/contracts';
import { calendarForDay } from '../engine/calendar';
import { dispatchGameAction } from '../engine/actions';
import { PRIVATE_EQUITY_LOCK_DAYS } from '../engine/investments';
import { createInitialState } from '../engine/initialState';
import { activityAtTime, createDefaultWeeklyPlan, defaultJobSchedule } from '../engine/schedule';
import { reconcileStateWithEmployment, CANONICAL_DURATIONS } from '../engine/planning';
import { applicationCooldownKey, pruneExpiredState, recordApplicationCooldown } from '../engine/lifecycle';
import { dedupeModifiers } from '../engine/effects';
import { migrateAttributes, syncLegacyAbility } from '../engine/attributes';
import { emptyFinancialLedger } from '../engine/financialLedger';
import { employmentKind, generateVacancies } from '../engine/careers';
import { absoluteMinute } from '../engine/time';
import { describeError } from './describeError';
import {
  CANONICAL_STORAGE_UNAVAILABLE,
  getCanonicalSaveBackend,
  isThenable,
  newGeneration,
  type CanonicalHead,
  type CanonicalRead,
  type CanonicalSnapshot,
  type CommitOutcome,
  type CommitRequest,
  type MaybePromise,
} from './canonicalSave';

export { CANONICAL_STORAGE_UNAVAILABLE };

/**
 * Continue a maybe-async pipeline. The browser backend always answers with a
 * promise; the synchronous test double answers with a plain value, and both go
 * through the same code here instead of two copies of the protocol.
 */
function then<T, R>(value: MaybePromise<T>, next: (input: T) => MaybePromise<R>): MaybePromise<R> {
  return isThenable(value) ? value.then(next) : next(value);
}

/**
 * Legacy save key. Current code never writes it: the canonical save is the
 * `main` record in IndexedDB (see `canonicalSave.ts`). It is read once, at boot,
 * and only when no canonical record exists yet, so a player upgrading from the
 * `localStorage` era keeps their game. After that first migration it is left
 * untouched as a downgrade copy and is **never** re-imported while a canonical
 * record exists — an older window writing it cannot resurrect old progress.
 */
export const SAVE_KEY = 'yuliang-save-v1';
export const SAVE_BACKUP_KEY = 'yuliang-save-v1-last-good';
/** Per-session emergency candidates written by the unload path (see flushSave). */
export const EMERGENCY_SAVE_PREFIX = 'yuliang-pending-';

/**
 * Identity of a serialized payload. The commit protocol stores
 * `JSON.stringify(state)` verbatim, so equal identities carry the same world —
 * and only the identity is kept, because payloads run to hundreds of kilobytes
 * while this evidence travels through `localStorage` at unload. Two independent
 * 32-bit hashes plus the length make an accidental match negligible in this
 * local-save setting; a match can go either way — it can keep a candidate that
 * should have been dropped, or mark one as "already saved" and drop it — which
 * is why this is evidence used against a version and a generation, never alone.
 */
export function payloadIdentity(payload: string): string {
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let index = 0; index < payload.length; index += 1) {
    const code = payload.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) ^ code) >>> 0;
  }
  return `${fnv.toString(16)}.${djb.toString(16)}.${payload.length}`;
}

/**
 * The unload record written for one window. It is deliberately not a save: the
 * pagehide path cannot wait for a transaction, so it may neither replace the
 * canonical record nor claim that the progress landed. The extra fields are the
 * lineage evidence the next boot needs to decide whether the record has moved
 * past this candidate (see `isSuperseded`).
 *
 * The evidence is deliberately **only what was still unsettled at the snapshot**.
 * A payload this window wrote earlier and already settled proves nothing about
 * the record: the same world can be written again after the snapshot (the player
 * can change a reversible field back), which is why a history of past payloads
 * would keep a candidate the window has already replaced.
 */
export interface EmergencySaveRecord {
  /** Generation the candidate descends from; `undefined` when that window had no record yet. */
  baseGeneration?: string;
  /** Revision this window had confirmed when the candidate was written. */
  baseRevision: number;
  /** The unsaved world itself; boot migrates it exactly like a stored payload. */
  save: unknown;
  /** Marks this lineage format; a record without it predates the evidence. */
  lineageVersion: 1;
  /** Identity of the payload this candidate would write. */
  payloadId?: string;
  /** Identity of the same world with the quota-trimmed history: what a compressed retry stores. */
  trimmedId?: string;
  /** Identities of the commits that were still unsettled when the candidate was written. */
  inFlight: string[];
  /**
   * The generation the unsettled creating commit (a reset, or the first record)
   * had already allocated for itself. It is the proof that a stored generation is
   * this window's own: payload bytes can be repeated by another window, a
   * pre-allocated generation token cannot.
   */
  creatingGeneration?: string;
}

/** How much the candidate's lineage evidence can be trusted. */
export type EmergencySaveLineage =
  /** `current`: the evidence was written by this build and parses. */
  | 'current'
  /** `legacy`: written before the evidence existed, so only versions can be compared. */
  | 'legacy'
  /** `damaged`: claimed to be current but its evidence cannot be read. */
  | 'damaged';

export interface EmergencySaveCandidate {
  key: string;
  baseGeneration?: string;
  baseRevision: number;
  state: unknown;
  lineage: EmergencySaveLineage;
  payloadId?: string;
  trimmedId?: string;
  inFlight: string[];
  creatingGeneration?: string;
}

/**
 * Whether the stored record has demonstrably moved past one candidate.
 *
 * `baseRevision` alone cannot answer this. A window that hides while its own
 * commit is still in flight writes the version it had *confirmed* — the write it
 * was waiting for is not in it yet — and `flushSave` records the *current*
 * memory, which already contains the action that write belongs to. If that write
 * lands after the page is gone, the record ends up one revision ahead of the
 * candidate without any other window having won anything, and pruning on
 * `revision > baseRevision` throws the later action away.
 *
 * The comparison is therefore about lineage, and the only lineage evidence that
 * survives every counterexample is "a commit this window had *unsettled* when it
 * wrote the candidate":
 *
 * - no record at all: nothing can supersede the candidate;
 * - the record is still at (or behind) the candidate's base version: keep it;
 * - the record holds exactly the candidate's world, trimmed or not: the progress
 *   is already stored, so the candidate is redundant;
 * - same generation, record exactly one revision ahead, payload among those
 *   unsettled commits: the record is that write landing, so the candidate — which
 *   carries the actions queued behind it — is still ahead: keep it;
 * - a different generation whose first revision is exactly the generation this
 *   window had allocated for an unsettled creating commit, carrying one of those
 *   unsettled payloads (a reset, or the very first record): keep it for the same
 *   reason — only a pre-allocated generation token proves the new generation is
 *   this window's own, because another window can write the same payload bytes;
 * - anything else: the record moved on without this candidate. Another window
 *   won, the generation was rotated, or this window saved again after the
 *   snapshot — even if the new payload repeats a world this window wrote earlier
 *   — so the candidate is superseded and must not be offered as recovery.
 *
 * A candidate written before the evidence existed carries none, and one whose
 * evidence cannot be read must not be treated as if it were old: the first falls
 * back to the version arithmetic, the second is kept.
 */
function isSuperseded(record: { head: CanonicalHead; payload: string } | undefined, candidate: EmergencySaveCandidate): boolean {
  if (!record) return false;
  if (candidate.lineage === 'legacy') return record.head.generation !== candidate.baseGeneration || record.head.revision > candidate.baseRevision;
  if (candidate.lineage === 'damaged') return false;
  const sameGeneration = record.head.generation === candidate.baseGeneration;
  if (sameGeneration && record.head.revision <= candidate.baseRevision) return false;
  const identity = payloadIdentity(record.payload);
  if (identity === candidate.payloadId || identity === candidate.trimmedId) return true;
  if (sameGeneration) return !(record.head.revision === candidate.baseRevision + 1 && candidate.inFlight.includes(identity));
  return !(record.head.revision === 1
    && candidate.creatingGeneration !== undefined
    && record.head.generation === candidate.creatingGeneration
    && candidate.inFlight.includes(identity));
}

/**
 * Collect unload emergency candidates for boot, dropping the ones the stored
 * record supersedes (see `isSuperseded`). Pruning is decided from the record's
 * payload as well as its version, so the caller passes the snapshot it booted
 * from; a boot without a readable record supersedes nothing.
 */
export function collectEmergencyCandidates(record?: { head: CanonicalHead; payload: string }): EmergencySaveCandidate[] {
  const candidates: EmergencySaveCandidate[] = [];
  try {
    // Snapshot the key list before touching storage: `removeItem` shifts every
    // later index down, so walking `localStorage` by index while pruning would
    // skip the entry right after each removal.
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(EMERGENCY_SAVE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isRecord(parsed) || !isRecord(parsed.save) || !Number.isInteger(parsed.baseRevision) || Number(parsed.baseRevision) < 0
          || (parsed.baseGeneration !== undefined && typeof parsed.baseGeneration !== 'string')) {
          localStorage.removeItem(key);
          continue;
        }
        const baseGeneration = typeof parsed.baseGeneration === 'string' ? parsed.baseGeneration : undefined;
        // A record that claims the current lineage format but cannot be read must
        // not be mistaken for an old one: 'legacy' is only what has no version
        // marker at all, everything else unreadable is 'damaged' and kept.
        const candidate: EmergencySaveCandidate = {
          key,
          baseGeneration,
          baseRevision: Number(parsed.baseRevision),
          state: parsed.save,
          inFlight: [],
          lineage: 'legacy',
        };
        if (parsed.lineageVersion !== undefined) {
          const inFlight = parsed.inFlight;
          const readable = parsed.lineageVersion === 1
            && Array.isArray(inFlight) && inFlight.every((entry) => typeof entry === 'string')
            && (parsed.payloadId === undefined || typeof parsed.payloadId === 'string')
            && (parsed.trimmedId === undefined || typeof parsed.trimmedId === 'string')
            && (parsed.creatingGeneration === undefined || typeof parsed.creatingGeneration === 'string');
          if (!readable) {
            candidate.lineage = 'damaged';
          } else {
            candidate.lineage = 'current';
            candidate.inFlight = inFlight as string[];
            if (typeof parsed.payloadId === 'string') candidate.payloadId = parsed.payloadId;
            if (typeof parsed.trimmedId === 'string') candidate.trimmedId = parsed.trimmedId;
            if (typeof parsed.creatingGeneration === 'string') candidate.creatingGeneration = parsed.creatingGeneration;
          }
        }
        if (isSuperseded(record, candidate)) {
          localStorage.removeItem(key);
          continue;
        }
        candidates.push(candidate);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {
    return [];
  }
  return candidates.sort((a, b) => a.baseRevision - b.baseRevision || (a.key < b.key ? -1 : 1));
}

export type SaveOutcome = { status: 'full' | 'compressed'; ok: true; payload: string; error?: string } | { status: 'failed'; ok: false; error: string };
/**
 * Result of a canonical write attempt. `scheduled` means the write is queued
 * behind this window's own earlier commits and its outcome is only known once
 * `completion` settles — never treat it as success.
 */
export type PersistResult =
  | { status: 'persisted'; outcome: Extract<SaveOutcome, { ok: true }> }
  | { status: 'failed'; error: string }
  | { status: 'refused' }
  | { status: 'superseded' }
  | { status: 'scheduled'; completion: Promise<PersistResult> };
export interface RecoverySession { raw: string; reason: string; writeProtected: true; noticeVisible: boolean; kind: 'unreadable' | 'compatibility' }

/** What this window knows about the canonical save. */
export interface CanonicalSaveState {
  /** `loading` until the record has been read; `unavailable` when it cannot be. */
  status: 'loading' | 'ready' | 'unavailable';
  /** Version this window has confirmed, once one has been read or committed. */
  head?: CanonicalHead;
  /** Commits this window completed. */
  commits: number;
}

/** Shown when another tab won the save race and this tab became read-only. */
export const EXTERNAL_SAVE_CONFLICT_MESSAGE = '另一个游戏窗口已经更新了存档。为避免覆盖最新进度，本窗口已停止保存。';

export interface GameStore {
  game: GameState;
  effects: GameEffect[];
  activeView: ViewId;
  lastError?: string;
  /** A committed state change the player must be told about (not a failure). */
  lastNotice?: string;
  /** Set when persistence failed; the in-memory state is still valid. */
  saveError?: string;
  /** Set when the stored save could not be read, with the raw payload kept. */
  loadProblem?: { reason: string; raw: string };
  recovery?: RecoverySession;
  /** True once another tab overwrote the save; this tab is read-only until reloaded. */
  externalSaveConflict: boolean;
  /** Canonical save progress; the UI stays on the boot screen until it is `ready`. */
  canonical: CanonicalSaveState;
  /** Settles when the canonical save has been read, so callers can wait for boot. */
  ready: Promise<void>;
  showRecovery: () => void;
  acceptRecovery: () => void;
  dispatch: (action: GameAction) => boolean;
  /** Persists a throttled simulation-tick save right away (page hide, tests). */
  flushSave: () => void;
  /** Flushes the throttled save through the canonical writer, resolving when it settles. */
  flushSaveAsync: () => Promise<void>;
  consumeEffects: () => void;
  setView: (view: ViewId) => void;
  reset: (seed?: number) => void;
  dismissLoadProblem: () => void;
}

/**
 * Legacy gig records.
 *
 * Current code stores a gig window in **absolute** minutes
 * (`(day - 1) * 1440 + minute of day`) so a shift can cross midnight, and
 * `executableDay` is the day the window starts. Saves written before that change
 * stored the window as minute-of-day (`18 * 60` / `hour * 60`), which the new
 * reader would treat as an instant on day 1 — an accepted, still-valid gig would
 * look like it had already passed.
 *
 * The two shapes are told apart by evidence already in the record, never by
 * guessing while reading, and `endMinute > 1440` is **not** evidence: the old
 * writer added the hours to the minute of the day it accepted the shift, so a
 * shift accepted at 23:00 was stored as `1380 / 1620` — past the end of the day
 * and still minute-of-day. What does hold:
 *
 * - `workedMinutes` is only ever written by current code, so a record carrying it
 *   is already absolute (this is also why a converted record can never be
 *   converted twice);
 * - an absolute window always opens inside the day its own record names, so a
 *   window below `(day - 1) * 1440` on day >= 2 is minute-of-day. On day 1 the two
 *   formats mean the same instant, so keeping it is never wrong.
 *
 * Hours in such a record are the second legacy shape: an earlier build credited
 * gig minutes passively, so `workedMinutes > 0` can exist with no `startedMinute`.
 * Those minutes are not wages and never become wages — see `migrateGigRecord`.
 */
function migrateGigRecord(entry: unknown, content: ContentRegistry): GigOpportunityState | undefined {
  if (!isRecord(entry)) return undefined;
  const jobId = typeof entry.jobId === 'string' ? entry.jobId : '';
  if (!content.jobs.some((job) => job.id === jobId)) return undefined;
  const validFromDay = Number.isInteger(entry.validFromDay) ? Number(entry.validFromDay) : 1;
  const expiresDay = Number.isInteger(entry.expiresDay) ? Number(entry.expiresDay) : validFromDay + 6;
  const pay = Number.isFinite(entry.pay) ? Math.max(0, Number(entry.pay)) : 0;
  const id = typeof entry.id === 'string' ? entry.id : `gig.${jobId}.${validFromDay}`;
  const source = typeof entry.source === 'string' ? entry.source : '工作市场';
  const start = Number.isInteger(entry.startMinute) ? Number(entry.startMinute) : 0;
  const end = Number.isInteger(entry.endMinute) ? Number(entry.endMinute) : start;
  const day = Number.isInteger(entry.executableDay) ? Math.max(1, Number(entry.executableDay)) : Math.max(1, validFromDay);
  const writtenInAbsoluteMinutes = gigWindowIsAbsolute(entry, day);
  const startMinute = writtenInAbsoluteMinutes ? Math.max(0, start) : (day - 1) * 1440 + Math.max(0, Math.min(1439, start));
  const endMinute = writtenInAbsoluteMinutes ? Math.max(startMinute + 1, end) : startMinute + Math.max(1, end - Math.max(0, Math.min(1439, start)));
  // A shift the player actually started survives a reload as the same shift. A
  // record that had to be converted cannot carry one: the baseline had no such
  // state, and hours worked under the old passive credit are not a start.
  const preservedStart = writtenInAbsoluteMinutes && Number.isInteger(entry.startedMinute) ? Math.max(0, Number(entry.startedMinute)) : undefined;
  // Hours are payable only behind a start record. The baseline banked hours
  // passively, so a record without one keeps its minutes **out** of `workedMinutes`
  // — the only field the accrual and the settlement read — and in the
  // `unverifiedWorkedMinutes` backup, which pays nothing. Otherwise clicking 开工 on
  // an old record would turn those hours into wages.
  const storedMinutes = Number.isInteger(entry.workedMinutes) ? Math.max(0, Number(entry.workedMinutes)) : 0;
  const backedUpMinutes = Number.isInteger(entry.unverifiedWorkedMinutes) ? Math.max(0, Number(entry.unverifiedWorkedMinutes)) : 0;
  const unverifiedMinutes = backedUpMinutes + (preservedStart === undefined ? storedMinutes : 0);
  return {
    id,
    jobId,
    validFromDay,
    expiresDay,
    executableDay: day,
    startMinute,
    endMinute,
    pay,
    source,
    workedMinutes: preservedStart === undefined ? 0 : storedMinutes,
    ...(unverifiedMinutes > 0 ? { unverifiedWorkedMinutes: unverifiedMinutes } : {}),
    ...(preservedStart !== undefined ? { startedMinute: preservedStart } : {}),
  };
}

/** Whether a gig record's window is already in absolute minutes (see above). */
function gigWindowIsAbsolute(entry: Record<string, unknown>, day: number): boolean {
  if (Number.isInteger(entry.workedMinutes)) return true;
  if (!Number.isInteger(entry.startMinute)) return false;
  const start = Number(entry.startMinute);
  return start >= (day - 1) * 1440 && start < day * 1440;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whole-company value a migrated holding is valued against.
 *
 * `companyValuationBasis` is the single field every entry path writes, but
 * saves written before it existed carry only `purchasePrice`, which the two
 * partial-entry paths meant differently:
 *
 * - an **official partnership** recorded the partnership entry price for the
 *   player's share. The whole company is the authored `business.price`, which is
 *   exactly what a new partnership entry records today, so the basis is taken
 *   from the authoritative content definition — never derived from the current
 *   `equityPercent`, because later 增持 / 减持 / 融资 change that share while
 *   `purchasePrice` and `partnerCharacterId` stay at their initial values.
 * - a **minority stake** already recorded the whole-company price, so the value
 *   is kept verbatim and never re-derived.
 *
 * The definition is matched on the *authored pair* `partnerCharacterId` +
 * `entryPrice`: a holding that names a different partner or paid something else
 * is not provably the official partnership entry, so it is reported for review
 * instead of being rewritten from content that may not describe it.
 */
interface LegacyValuationInput {
  value: Record<string, unknown>;
  businessId: string;
  purchasePrice: number;
  equityPercent: number;
  content: ContentRegistry;
}

/**
 * Why a holding has the valuation basis it has. Without it a migration that
 * could not prove the whole-company value would still write a finite number,
 * and the next read would have no way to tell that number apart from a basis
 * recovered from official content — the "needs review" state would be lost on
 * the first save. Persisting the provenance keeps that fact durable.
 */
export const COMPANY_VALUATION_BASIS_SOURCE = {
  officialPartnership: 'official-partnership',
  recordedPrice: 'recorded-price',
  unverified: 'unverified',
} as const;

type CompanyValuationBasisSource = typeof COMPANY_VALUATION_BASIS_SOURCE[keyof typeof COMPANY_VALUATION_BASIS_SOURCE];

function isBasisSource(value: unknown): value is CompanyValuationBasisSource {
  return value === COMPANY_VALUATION_BASIS_SOURCE.officialPartnership
    || value === COMPANY_VALUATION_BASIS_SOURCE.recordedPrice
    || value === COMPANY_VALUATION_BASIS_SOURCE.unverified;
}

function migrateCompanyValuationBasis({ value, businessId, purchasePrice, equityPercent, content }: LegacyValuationInput): { basis: number; source: CompanyValuationBasisSource } {
  // Already written by a current-code path: re-running migration must not
  // reinterpret it, and the recorded provenance decides whether it is still
  // flagged for review.
  if (Number.isFinite(value.companyValuationBasis)) {
    const basis = Math.max(0, Number(value.companyValuationBasis));
    const recorded = value.companyValuationBasisSource;
    return { basis, source: isBasisSource(recorded) ? recorded : COMPANY_VALUATION_BASIS_SOURCE.unverified };
  }

  const partnerCharacterId = typeof value.partnerCharacterId === 'string' && value.partnerCharacterId.length > 0 ? value.partnerCharacterId : undefined;
  if (!partnerCharacterId) return { basis: purchasePrice, source: COMPANY_VALUATION_BASIS_SOURCE.recordedPrice };

  // A holding that cannot describe any company (no share, or no payment) is not
  // recoverable even with the official definition in hand.
  if (equityPercent <= 0 || purchasePrice <= 0) return { basis: purchasePrice, source: COMPANY_VALUATION_BASIS_SOURCE.unverified };

  const definition = content.businesses.find((business) => business.id === businessId);
  const partnership = definition?.partnership;
  const isOfficialPartnership = definition !== undefined
    && partnership !== undefined
    && partnership.characterId === partnerCharacterId
    && Math.round(partnership.entryPrice) === Math.round(purchasePrice);
  if (!isOfficialPartnership || definition?.price === undefined) return { basis: purchasePrice, source: COMPANY_VALUATION_BASIS_SOURCE.unverified };

  return { basis: Math.max(0, definition.price), source: COMPANY_VALUATION_BASIS_SOURCE.officialPartnership };
}

/**
 * Whether a holding's whole-company basis could not be recovered from the save
 * plus the official definitions. `purchasePrice` and a non-zero share are not
 * sufficient evidence: the holding may have come from content that no longer
 * exists, so the migration keeps the recorded price and records that it is not a
 * trustworthy whole-company value. The provenance is persisted, so the flag
 * survives the first migration, the save and any later re-migration.
 */
export function businessValuationBasisNeedsReview(
  value: Record<string, unknown>,
  businessId: string,
  content: ContentRegistry,
): boolean {
  const purchasePrice = Number.isFinite(value.purchasePrice) ? Math.max(0, Number(value.purchasePrice)) : 0;
  const equity = Number.isFinite(value.equityPercent) ? Math.min(100, Math.max(0, Number(value.equityPercent))) : 100;
  return migrateCompanyValuationBasis({ value, businessId, purchasePrice, equityPercent: equity, content }).source === COMPANY_VALUATION_BASIS_SOURCE.unverified;
}

/**
 * Synchronous dispatch feedback. A scheduled or refused write reports nothing
 * here: the conflict flag and the dirty marker already describe those states.
 */
function saveOutcomeOf(result: PersistResult): SaveOutcome | undefined {
  if (result.status === 'persisted') return result.outcome;
  if (result.status === 'failed') return { status: 'failed', ok: false, error: result.error };
  return undefined;
}

/**
 * Resolves whether the canonical save actually landed. A write that is still
 * holding the writer lock resolves to `false` until it settles, so callers can
 * keep their protection instead of releasing it on a promise.
 */
function persistedSettled(result: PersistResult): Promise<boolean> {
  if (result.status === 'persisted') return Promise.resolve(true);
  if (result.status === 'scheduled') return result.completion.then((settled) => settled.status === 'persisted', () => false);
  return Promise.resolve(false);
}

const wealthTierIds = new Set(['savings', 'stable', 'abundant', 'high_net_worth', 'entrepreneur', 'billionaire', 'super_wealth', 'world', 'global']);
const financialDirections = new Set(['income', 'expense', 'transfer']);
const financialGroups = new Set(['income', 'consumption', 'asset_allocation', 'asset_liquidation']);
const financialCategories = new Set(['wage', 'side_job', 'bonus', 'business_income', 'property_income', 'investment_dividend', 'event_income', 'other_income', 'housing', 'living', 'food', 'transport', 'communication', 'shopping', 'entertainment', 'social', 'education', 'travel', 'service', 'maintenance', 'business_cost', 'other_expense', 'investment_transfer', 'property_transfer', 'business_transfer', 'collectible_transfer', 'asset_liquidation', 'realized_gain', 'realized_loss', 'valuation_change']);

function knownIds(content: ContentRegistry, category: keyof Pick<ContentRegistry, 'jobs' | 'items' | 'housing' | 'businesses' | 'assets' | 'characters' | 'events' | 'eventChains' | 'milestones'>): Set<string> {
  return new Set(content[category].map((entry) => entry.id));
}

function isWeeklyPlan(value: unknown): value is GameState['weeklyPlan'] {
  if (!isRecord(value) || !isRecord(value.days)) return false;
  const days = value.days as Record<string, unknown>;
  return [1, 2, 3, 4, 5, 6, 7].every((weekday) => {
    const day = days[String(weekday)];
    return isRecord(day) && isRecord(day.day) && isRecord(day.evening)
      && ['study', 'side_job', 'free', 'course', 'activity'].includes(String(day.day.kind))
      && ['study', 'side_job', 'free', 'course', 'activity'].includes(String(day.evening.kind));
  });
}

function normalizePlannedActivity(value: unknown, content: ContentRegistry): PlannedActivity {
  if (!isRecord(value)) return { kind: 'free' };
  switch (value.kind) {
    case 'study':
    case 'side_job': {
      const duration = value.durationMinutes;
      if (!CANONICAL_DURATIONS.includes(Number(duration) as ActivityDuration)) return { kind: 'free' };
      if (value.kind === 'side_job') {
        const job = content.jobs.find((entry) => entry.id === value.jobId);
        if (!job || job.kind === 'regular') return { kind: 'free' };
        return { kind: 'side_job', jobId: job.id, durationMinutes: Number(duration) as ActivityDuration };
      }
      return { kind: 'study', durationMinutes: Number(duration) as ActivityDuration };
    }
    case 'course':
      return content.courses?.some((course) => course.id === value.courseId)
        ? { kind: 'course', courseId: String(value.courseId) }
        : { kind: 'free' };
    case 'activity': {
      const activity = content.activities?.find((entry) => entry.id === value.activityId);
      const option = activity?.options.find((entry) => entry.id === value.optionId);
      return activity && option
        ? { kind: 'activity', activityId: activity.id, optionId: option.id }
        : { kind: 'free' };
    }
    case 'free':
    default:
      return { kind: 'free' };
  }
}

function normalizeWeeklyPlan(value: unknown, content: ContentRegistry): GameState['weeklyPlan'] {
  if (!isWeeklyPlan(value)) return createDefaultWeeklyPlan();
  const days = {} as GameState['weeklyPlan']['days'];
  for (const weekday of [1, 2, 3, 4, 5, 6, 7] as const) {
    const source = value.days[weekday];
    days[weekday] = {
      day: normalizePlannedActivity(source.day, content),
      evening: normalizePlannedActivity(source.evening, content),
    };
  }
  return { days, autoRepeat: Boolean(value.autoRepeat ?? true) };
}

function isLifeRecordEntry(value: unknown): value is LifeRecordEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.day)
    && ['career', 'purchase', 'service', 'activity', 'housing', 'relationship', 'event', 'business', 'asset', 'investment'].includes(String(value.category))
    && typeof value.title === 'string';
}

function isFinancialEntry(value: unknown): value is FinancialEntry {
  return isRecord(value)
    && typeof value.id === 'string'
    && Number.isInteger(value.day)
    && financialDirections.has(String(value.direction))
    && financialGroups.has(String(value.group))
    && financialCategories.has(String(value.category))
    && Number.isFinite(value.amount) && Number(value.amount) >= 0
    && Number.isFinite(value.cashDelta)
    && typeof value.label === 'string';
}

function migrateWorldPublicBusinessEquities(value: unknown, businessIds: Set<string>): WorldSnapshot['publicBusinessEquities'] {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).filter(([id, holding]) => {
    if (!businessIds.has(id) || !isRecord(holding)) return false;
    return holding.businessId === id
      && Number.isInteger(holding.percent) && Number(holding.percent) > 0 && Number(holding.percent) <= 100
      && Number.isFinite(holding.investedAmount) && Number(holding.investedAmount) >= 0
      && Number.isFinite(holding.currentValue) && Number(holding.currentValue) >= 0;
  }).map(([id, holding]) => {
    const entry = holding as Record<string, unknown>;
    return [id, { businessId: id, percent: Number(entry.percent), investedAmount: Number(entry.investedAmount), currentValue: Number(entry.currentValue) }];
  }));
}

/**
 * Persist the save. A quota or serialization failure must never break dispatch
 * and must never destroy the last good save, so the previous record stays in
 * place and the failure is reported to the caller.
 *
 * Nothing is written here: the payload is produced, and the canonical write
 * goes through `commitState` (store) or `saveGameState` (fixtures), both of
 * which compare the version and replace the payload inside one transaction.
 */
function serializeSave(state: GameState): { payload: string } | { error: string } {
  try {
    return { payload: JSON.stringify(state) };
  } catch (error) {
    return { error: `存档序列化失败：${describeError(error)}` };
  }
}

/**
 * Player-facing text for a failed write. The storage error itself is appended:
 * the player is told the previous save is still in place, and the diagnostic
 * stays available without being dressed up as a success.
 */
function saveFailureMessage(error: string): string {
  return `保存失败，最后一次有效存档仍然保留：${error}`;
}

/**
 * A storage failure may mean the payload no longer fits. The retry keeps the
 * last valid save in place until the smaller payload actually commits, and the
 * caller still reports what happened.
 */
function quotaFallback(state: GameState, outcome: CommitOutcome): { payload: string; warning: string } | undefined {
  if (outcome.status !== 'failed' || !outcome.quotaExceeded) return undefined;
  const trimmed = trimForStorage(state);
  if (!trimmed) return undefined;
  const smaller = serializeSave(trimmed);
  if ('error' in smaller) return undefined;
  return { payload: smaller.payload, warning: `存储空间不足，已压缩历史后保存：${outcome.error}` };
}

/** One write attempt: the commit result plus the payload it tried to store. */
interface WriteAttempt { outcome: CommitOutcome; save?: Extract<SaveOutcome, { ok: true }> }

/**
 * Commit one serialized payload, retrying once with a trimmed history when the
 * storage reports that it is full. Serialization stays outside the transaction,
 * so the transaction only ever runs the comparison and the replacement.
 */
function commitAttempt(state: GameState, payload: string, request: (payload: string) => CommitRequest): MaybePromise<WriteAttempt> {
  const backend = getCanonicalSaveBackend();
  return then(backend.commit(request(payload)), (outcome) => {
    const fallback = quotaFallback(state, outcome);
    if (fallback) {
      return then(backend.commit(request(fallback.payload)), (retry) => retry.status === 'failed'
        ? { outcome: retry }
        : { outcome: retry, save: { status: 'compressed', ok: true, payload: fallback.payload, error: fallback.warning } });
    }
    return outcome.status === 'failed' ? { outcome } : { outcome, save: { status: 'full', ok: true, payload } };
  });
}

/**
 * Write a save with no expectation: the current version is read and then
 * committed, so the record it replaces is the one it just saw. Fixtures and
 * tests use this to seed a save; `createGameStore` never does — the store
 * commits with the version it confirmed, which is what makes two windows
 * racing from the same version impossible.
 */
export async function saveGameState(state: GameState): Promise<SaveOutcome> {
  const serialized = serializeSave(state);
  if ('error' in serialized) return { status: 'failed', ok: false, error: serialized.error };
  const read = await getCanonicalSaveBackend().read();
  if (read.status === 'unavailable') return { status: 'failed', ok: false, error: saveFailureMessage(CANONICAL_STORAGE_UNAVAILABLE) };
  const expected = read.snapshot?.head;
  const attempt = await commitAttempt(state, serialized.payload, (payload) => ({ expected, payload }));
  if (attempt.save) return attempt.save;
  return { status: 'failed', ok: false, error: attempt.outcome.status === 'failed' ? saveFailureMessage(attempt.outcome.error) : '存档版本冲突，写入未完成' };
}

/** Whether trimming would shrink the payload; checked before paying for the clone. */
function needsTrimForStorage(state: GameState): boolean {
  return (state.lifeHistory?.length ?? 0) > 200 || (state.messages?.length ?? 0) > 10;
}

function trimForStorage(state: GameState): GameState | undefined {
  if (!needsTrimForStorage(state)) return undefined;
  const trimmed = structuredClone(state);
  const history = trimmed.lifeHistory ?? [];
  trimmed.businessFacts ??= factsFromHistory(history, trimmed.time.day);
  trimmed.lifeHistory = history.slice(-200);
  trimmed.messages = (trimmed.messages ?? []).slice(-10);
  return trimmed;
}

export interface LoadOutcome {
  state: GameState;
  problem?: { reason: string; raw: string };
  recovery?: RecoverySession;
}

/** Detect legacy projections only to warn, never to manufacture a start fact. */
function hasUntrustedLongActivity(raw: Record<string, unknown>, state: GameState, content: ContentRegistry): boolean {
  const now = absoluteMinute(state.time);
  const prior = raw.currentActivity as GameState['currentActivity'];
  if (prior?.kind === 'activity' && prior.start && prior.end && absoluteMinute(prior.start) <= now && now < absoluteMinute(prior.end) && absoluteMinute(prior.end) - absoluteMinute(prior.start) >= 2880) return true;
  for (const week of [state.calendar.week - 1, state.calendar.week]) {
    if (week < 1) continue;
    for (const [weekday, slots] of Object.entries(state.weeklyPlan.days)) {
      if (slots.day.kind !== 'activity') continue;
      const planned = slots.day;
      const option = content.activities?.find(a => a.id === planned.activityId)?.options.find(o => o.id === planned.optionId);
      if (!option || option.durationMinutes < 2880) continue;
      const start = absoluteMinute({ day: (week - 1) * 7 + Number(weekday), hour: 9, minute: 0 });
      if (start < now && now < start + option.durationMinutes) return true;
    }
  }
  return false;
}

/**
 * Read one stored payload: parse it, migrate it, and report what the player has
 * to confirm. A parse or migration failure keeps the raw payload and reports it
 * instead of silently pretending the player started a new game.
 */
function reviveSave(raw: string, content: ContentRegistry, balance: BalanceConfig): { state: GameState; recovery?: RecoverySession } | { problem: { reason: string; raw: string } } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // 玩家界面只给稳定的中文结论；原始解析器异常进控制台供调试。
    console.error('[yuliang] 存档 JSON 解析失败', error);
    return { problem: { reason: '存档文件已损坏', raw } };
  }
  try {
    const state = migrateGameState(parsed, content, balance);
    const reasons: string[] = [];
    if (state.pendingEventId && !content.events.some(event => event.id === state.pendingEventId)) reasons.push('待处理事件已下架，确认后跳过失效事件');
    if (isRecord(parsed) && Number(parsed.version) < 10) {
      if (hasUntrustedLongActivity(parsed, state, content)) reasons.push('旧版长活动缺少可靠开始记录，确认后跳过');
      if (state.employment?.pendingJobId && !(parsed.employment as GameState['employment'])?.pendingEffectiveDay) reasons.push('旧待换岗合同将在下一周周一生效');
    }
    return { state, recovery: reasons.length ? { raw, reason: reasons.join('；'), writeProtected: true, noticeVisible: true, kind: 'compatibility' } : undefined };
  } catch (error) {
    console.error('[yuliang] 存档迁移失败', error);
    return { problem: { reason: '存档内容无法识别', raw } };
  }
}

/** The legacy `localStorage` payload, or the fact that it cannot be read at all. */
type LegacyEvidence = { raw: string | null } | { unreadable: string };

function readLegacySave(): LegacyEvidence {
  try {
    return { raw: localStorage.getItem(SAVE_KEY) };
  } catch (error) {
    console.error('[yuliang] 旧存档读取失败', error);
    return { unreadable: describeError(error) };
  }
}

/** Everything the boot decision is made from; the planner itself does no I/O. */
interface BootEvidence { canonical: CanonicalRead; legacy: LegacyEvidence; seed?: number }

interface BootPlan {
  state: GameState;
  /** Version of the canonical record this window confirmed (absent when there is none). */
  head?: CanonicalHead;
  /**
   * The record the plan was decided from, when its payload was usable. Boot
   * compares unload candidates against it, so a record whose payload could not
   * be revived is deliberately not passed down: it is not evidence of anything.
   */
  stored?: CanonicalSnapshot;
  problem?: { reason: string; raw: string };
  recovery?: RecoverySession;
  /** The canonical store reported itself unusable: the game runs, nothing is saved. */
  unavailable?: string;
}

/**
 * Decide what this window boots from. The canonical record wins whenever it
 * exists — that is the whole point of migrating once — and the legacy
 * `localStorage` payload is only ever considered when there is no record at
 * all.
 *
 * Boot itself writes nothing. The migrated state is stored by the first commit
 * this window makes, and that commit carries no expected version at all, so the
 * transaction proves again that no record exists before it creates one. Two
 * windows initializing at the same time therefore cannot overwrite each other:
 * the second commit finds a record it never confirmed and is refused.
 */
function planBoot(content: ContentRegistry, balance: BalanceConfig, evidence: BootEvidence): BootPlan {
  const snapshot = evidence.canonical.status === 'ok' ? evidence.canonical.snapshot : undefined;
  if (evidence.seed !== undefined) {
    // Deterministic state for tests and diagnostics: the payload is not loaded,
    // but the stored version is still adopted so a commit from this window is
    // checked against the record that really exists.
    return { state: createInitialState(content, balance, evidence.seed), ...(snapshot ? { head: snapshot.head } : {}) };
  }
  if (evidence.canonical.status === 'unavailable') {
    // No canonical store: the legacy save is the only usable evidence, and it is
    // handed over through the recovery flow because it cannot be written back.
    if ('raw' in evidence.legacy && evidence.legacy.raw) {
      const legacy = reviveSave(evidence.legacy.raw, content, balance);
      if ('state' in legacy) {
        return {
          state: legacy.state,
          recovery: { raw: evidence.legacy.raw, reason: '存档存储不可用，已载入旧版存档且无法保存', writeProtected: true, noticeVisible: true, kind: 'compatibility' },
          unavailable: `${CANONICAL_STORAGE_UNAVAILABLE}（${evidence.canonical.error}）`,
        };
      }
      return { state: createInitialState(content, balance), problem: legacy.problem, unavailable: CANONICAL_STORAGE_UNAVAILABLE };
    }
    return { state: createInitialState(content, balance), unavailable: `${CANONICAL_STORAGE_UNAVAILABLE}（${evidence.canonical.error}）` };
  }
  if (snapshot) {
    const stored = reviveSave(snapshot.payload, content, balance);
    if ('state' in stored) return { state: stored.state, head: snapshot.head, stored: snapshot, recovery: stored.recovery };
    return { state: createInitialState(content, balance), head: snapshot.head, problem: stored.problem };
  }
  if ('unreadable' in evidence.legacy) {
    return { state: createInitialState(content, balance), problem: { reason: '存档读取失败', raw: '' } };
  }
  if (!evidence.legacy.raw) return { state: createInitialState(content, balance) };
  const legacy = reviveSave(evidence.legacy.raw, content, balance);
  if ('problem' in legacy) return { state: createInitialState(content, balance), problem: legacy.problem };
  // A first-run migration: the state is used now and becomes the canonical save
  // with this window's first commit.
  return { state: legacy.state, recovery: legacy.recovery };
}

/**
 * Boot the canonical save: read the record, and fall back to the legacy
 * `localStorage` save when no record exists yet. One read is the only I/O step,
 * so the decision is written once and shared with the synchronous test backend.
 */
function resolveBoot(content: ContentRegistry, balance: BalanceConfig, seed?: number): MaybePromise<BootPlan> {
  return then(getCanonicalSaveBackend().read(), (canonical) =>
    planBoot(content, balance, { canonical, legacy: seed === undefined ? readLegacySave() : { raw: null }, seed }));
}

/**
 * Read the save. A parse/migration failure keeps the raw payload and reports it
 * instead of silently pretending the player started a new game.
 */
export async function loadGameStateWithReport(content: ContentRegistry, balance: BalanceConfig): Promise<LoadOutcome> {
  const plan = await resolveBoot(content, balance);
  return { state: plan.state, problem: plan.problem, recovery: plan.recovery };
}

export function migrateGameState(raw: unknown, content: ContentRegistry, balance: BalanceConfig): GameState {
  const initial = createInitialState(content, balance, 1);
  if (!isRecord(raw)) throw new Error('存档必须是游戏状态对象');
  const candidate = structuredClone({ ...initial, ...raw }) as GameState;
  const rawTime = isRecord(raw.time) ? raw.time : {};
  candidate.time = {
    day: Number.isInteger(rawTime.day) && Number(rawTime.day) > 0 ? Number(rawTime.day) : initial.time.day,
    hour: Number.isInteger(rawTime.hour) && Number(rawTime.hour) >= 0 && Number(rawTime.hour) <= 23 ? Number(rawTime.hour) : initial.time.hour,
    minute: Number.isInteger(rawTime.minute) && Number(rawTime.minute) >= 0 && Number(rawTime.minute) <= 59 ? Number(rawTime.minute) : 0,
  };
  candidate.version = balance.saveVersion;
  candidate.contentVersion = balance.contentVersion;
  candidate.calendar = calendarForDay(candidate.time.day);
  candidate.weeklyPlan = normalizeWeeklyPlan(candidate.weeklyPlan, content);
  candidate.previousWeeklyPlan = isWeeklyPlan(candidate.previousWeeklyPlan)
    ? normalizeWeeklyPlan(candidate.previousWeeklyPlan, content)
    : structuredClone(candidate.weeklyPlan);
  candidate.autoRepeatPlan = Boolean(candidate.autoRepeatPlan ?? candidate.weeklyPlan.autoRepeat);
  candidate.simulationSpeed = candidate.simulationSpeed === 2 || candidate.simulationSpeed === 4 ? candidate.simulationSpeed : 1;
  if (candidate.pendingReward && (!isRecord(candidate.pendingReward) || typeof candidate.pendingReward.eventId !== 'string' || !Array.isArray(candidate.pendingReward.lines) || candidate.pendingReward.lines.some(line => typeof line !== 'string'))) throw new Error('待确认奖励记录无效');
  candidate.simulationMode = candidate.pendingEventId ? 'event' : candidate.pendingReward ? 'reward' : candidate.pendingMonthlySummary ? 'monthly_summary' : candidate.simulationMode === 'planning' ? 'planning' : 'paused';

  const itemIds = knownIds(content, 'items');
  for (const itemId of Object.keys(candidate.inventory ?? {})) {
    if (itemIds.has(itemId)) continue;
    const quantity = Math.max(0, candidate.inventory[itemId] ?? 0);
    const purchasePrice = candidate.itemPurchasePrices?.[itemId] ?? 0;
    candidate.cash += Math.round(quantity * purchasePrice * balance.saleRatioFallback);
    delete candidate.inventory[itemId];
    delete candidate.itemPurchasePrices[itemId];
  }
  candidate.wishlist = [...new Set((candidate.wishlist ?? []).filter((id) => itemIds.has(id) && (candidate.inventory[id] ?? 0) === 0))];
  const housingIds = knownIds(content, 'housing');
  if (!housingIds.has(candidate.housing?.housingId)) candidate.housing = initial.housing;
  const rawMortgage = isRecord(candidate.mortgage) ? candidate.mortgage : undefined;
  candidate.mortgage = rawMortgage
    && candidate.housing.mode === 'owned'
    && rawMortgage.housingId === candidate.housing.housingId
    && housingIds.has(String(rawMortgage.housingId))
    && Number.isFinite(rawMortgage.remainingPrincipal) && Number(rawMortgage.remainingPrincipal) > 0
    && Number.isFinite(rawMortgage.monthlyPayment) && Number(rawMortgage.monthlyPayment) > 0
    && Number.isInteger(rawMortgage.totalMonths) && Number(rawMortgage.totalMonths) > 0
    && Number.isInteger(rawMortgage.paidMonths) && Number(rawMortgage.paidMonths) >= 0 && Number(rawMortgage.paidMonths) < Number(rawMortgage.totalMonths)
    ? { housingId: String(rawMortgage.housingId), remainingPrincipal: Number(rawMortgage.remainingPrincipal), monthlyPayment: Number(rawMortgage.monthlyPayment), totalMonths: Number(rawMortgage.totalMonths), paidMonths: Number(rawMortgage.paidMonths) }
    : undefined;
  candidate.housingHoldings = Object.fromEntries(Object.entries(candidate.housingHoldings ?? {}).filter(([id, holding]) => {
    const value = isRecord(holding) ? holding : {};
    return housingIds.has(id) && id !== candidate.housing.housingId && isRecord(value)
      && value.housingId === id && Number.isFinite(value.purchasePrice) && Number(value.purchasePrice) > 0
      && Number.isFinite(value.currentValuation) && Number(value.currentValuation) >= 0
      && (value.occupancy === 'vacant' || value.occupancy === 'rented');
  }).map(([id, holding]) => {
    const value = holding as unknown as Record<string, unknown>;
    return [id, { housingId: id, purchasePrice: Number(value.purchasePrice), currentValuation: Number(value.currentValuation), occupancy: value.occupancy as 'vacant' | 'rented' }];
  }));
  const jobIds = knownIds(content, 'jobs');
  if (candidate.currentJobId && !jobIds.has(candidate.currentJobId)) candidate.currentJobId = initial.currentJobId;
  candidate.unlockedJobIds = (candidate.unlockedJobIds ?? []).filter((id) => jobIds.has(id));
  candidate.unlockedHousingIds = (candidate.unlockedHousingIds ?? []).filter((id) => housingIds.has(id));
  candidate.unlockedBusinessIds = (candidate.unlockedBusinessIds ?? []).filter((id) => knownIds(content, 'businesses').has(id));
  candidate.unlockedAssetIds = [...new Set([
    ...(candidate.unlockedAssetIds ?? []).filter((id) => knownIds(content, 'assets').has(id)),
    ...content.assets.filter((asset) => asset.kind === 'vehicle').map((asset) => asset.id),
  ])];
  candidate.completedEvents = (candidate.completedEvents ?? []).filter((id) => knownIds(content, 'events').has(id));
  candidate.completedMilestones = (candidate.completedMilestones ?? []).filter((id) => knownIds(content, 'milestones').has(id));
  candidate.businesses = Object.fromEntries(Object.entries(candidate.businesses ?? {}).filter(([id]) => knownIds(content, 'businesses').has(id)).map(([id, holding]) => {
    const value: Record<string, unknown> = isRecord(holding) ? holding : {};
    const locationIdsForBusiness = new Set((content.locations ?? []).map((entry) => entry.id));
    const migratedEquity = Number.isFinite(value.equityPercent) ? Math.min(100, Math.max(0, Number(value.equityPercent))) : 100;
    const migratedPurchasePrice = Number.isFinite(value.purchasePrice) ? Math.max(0, Number(value.purchasePrice)) : 0;
    const migratedBasis = migrateCompanyValuationBasis({ value, businessId: id, purchasePrice: migratedPurchasePrice, equityPercent: migratedEquity, content });
    return [id, {
      businessId: id,
      priceLevel: Number.isInteger(value.priceLevel) ? Math.max(0, Number(value.priceLevel)) : 1,
      wageLevel: Number.isInteger(value.wageLevel) ? Math.max(0, Number(value.wageLevel)) : 1,
      inventoryLevel: Number.isInteger(value.inventoryLevel) ? Math.max(0, Number(value.inventoryLevel)) : 1,
      purchasePrice: migratedPurchasePrice,
      companyValuationBasis: migratedBasis.basis,
      companyValuationBasisSource: migratedBasis.source,
      capitalInvested: Number.isFinite(value.capitalInvested) ? Math.max(0, Number(value.capitalInvested)) : 0,
      equityPercent: migratedEquity,
      publicFloatPercent: Number.isFinite(value.publicFloatPercent) ? Math.min(100, Math.max(0, Number(value.publicFloatPercent))) : Math.max(0, 100 - (Number.isFinite(value.equityPercent) ? Number(value.equityPercent) : 100)),
      fundingRaised: Number.isFinite(value.fundingRaised) ? Math.max(0, Number(value.fundingRaised)) : 0,
      fundingRound: Number.isInteger(value.fundingRound) ? Math.max(0, Number(value.fundingRound)) : 0,
      partnerCharacterId: typeof value.partnerCharacterId === 'string' && content.characters.some((character) => character.id === value.partnerCharacterId) ? value.partnerCharacterId : undefined,
      listed: value.listed === true,
      listedDay: Number.isInteger(value.listedDay) && Number(value.listedDay) > 0 ? Number(value.listedDay) : undefined,
      acquiredDay: Number.isInteger(value.acquiredDay) && Number(value.acquiredDay) > 0 ? Number(value.acquiredDay) : undefined,
      acquiredFromBusinessId: typeof value.acquiredFromBusinessId === 'string' && knownIds(content, 'businesses').has(value.acquiredFromBusinessId) ? value.acquiredFromBusinessId : undefined,
      playerCostBasis: Number(raw.version) >= 10 ? amount(value.playerCostBasis) : unknown('旧版企业成本可能遗漏注资或处置'),
      operatingBonusPercent: Number.isFinite(value.operatingBonusPercent) ? Math.min(25, Math.max(0, Number(value.operatingBonusPercent))) : undefined,
      relocatedLocationId: typeof value.relocatedLocationId === 'string' && locationIdsForBusiness.has(value.relocatedLocationId) ? value.relocatedLocationId : undefined,
    }];
  }));
  const businessIds = knownIds(content, 'businesses');
  candidate.publicBusinessEquities = Object.fromEntries(Object.entries(candidate.publicBusinessEquities ?? {}).filter(([id, holding]) => {
    const value: Record<string, unknown> = isRecord(holding) ? holding : {};
    return businessIds.has(id) && candidate.businesses[id]?.listed === true && value.businessId === id && Number.isInteger(value.percent) && Number(value.percent) > 0 && Number(value.percent) <= 100 && Number.isFinite(value.investedAmount) && Number(value.investedAmount) > 0 && Number.isInteger(value.purchaseDay) && Number(value.purchaseDay) > 0;
  }).map(([id, holding]) => {
    const value = holding as unknown as Record<string, unknown>;
    return [id, { businessId: id, percent: Number(value.percent), investedAmount: Number(value.investedAmount), purchaseDay: Number(value.purchaseDay) }];
  }));
  const businessProjectIds = new Set((content.activities ?? []).flatMap((activity) => activity.options.filter((option) => option.businessProject).map((option) => `${activity.id}.${option.id}`)));
  candidate.completedBusinessProjects = [...new Set((candidate.completedBusinessProjects ?? []).filter((id) => businessProjectIds.has(id)))];
  candidate.assets = Object.fromEntries(Object.entries(candidate.assets ?? {}).filter(([id]) => knownIds(content, 'assets').has(id)));
  const locationIds = new Set((content.locations ?? []).map((entry) => entry.id));
  candidate.locationVisits = Object.fromEntries(Object.entries(candidate.locationVisits ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) > 0).map(([id, value]) => [id, Number(value)]));
  candidate.locationDevelopment = Object.fromEntries(Object.entries(candidate.locationDevelopment ?? {}).filter(([id, value]) => locationIds.has(id) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5).map(([id, value]) => [id, Number(value)]));
  candidate.interestFamiliarity = Object.fromEntries(Object.entries(candidate.interestFamiliarity ?? {}).filter(([id, value]) => typeof id === 'string' && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3).map(([id, value]) => [id, Number(value)]));
  const investmentIds = new Set((content.investments ?? []).map((entry) => entry.id));
  candidate.investments = Object.fromEntries(Object.entries(candidate.investments ?? {}).filter(([id]) => investmentIds.has(id)));
  const subscriptionIds = new Set((content.subscriptions ?? []).map((entry) => entry.id));
  const migrateSubscriptionRecord = (holding: unknown): { subscriptionId: string; startedDay: number; billedUntilDay?: number } | undefined => {
    if (!isRecord(holding) || !subscriptionIds.has(String(holding.subscriptionId)) || !Number.isInteger(holding.startedDay) || Number(holding.startedDay) <= 0) return undefined;
    return {
      subscriptionId: String(holding.subscriptionId),
      startedDay: Number(holding.startedDay),
      // A legacy active record has no period anchor: the next month end closes
      // its open period instead of billing it a second time.
      billedUntilDay: Number.isInteger(holding.billedUntilDay) ? Number(holding.billedUntilDay) : undefined,
    };
  };
  candidate.activeSubscriptions = Object.fromEntries(Object.entries(candidate.activeSubscriptions ?? {}).flatMap(([id, holding]) => {
    if (!subscriptionIds.has(id)) return [];
    const migrated = migrateSubscriptionRecord(holding);
    return migrated ? [[id, migrated] as const] : [];
  }));
  candidate.previousSubscriptions = Object.fromEntries(Object.entries(candidate.previousSubscriptions ?? {}).flatMap(([id, holding]) => {
    if (!subscriptionIds.has(id)) return [];
    const migrated = migrateSubscriptionRecord(holding);
    return migrated ? [[id, migrated] as const] : [];
  }));
  candidate.jobExperience = candidate.jobExperience ?? {};
  candidate.courseProgress = Object.fromEntries(Object.entries(candidate.courseProgress ?? {}).filter(([id, value]) => (content.courses ?? []).some((course) => course.id === id) && Number.isInteger(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  candidate.careerExperience = Object.fromEntries(Object.entries(candidate.careerExperience ?? {}).filter(([id, value]) => ['office', 'operations', 'customer_service', 'retail', 'logistics', 'data', 'project', 'management', 'media', 'finance'].includes(id) && Number.isFinite(value) && Number(value) >= 0).map(([id, value]) => [id, Number(value)]));
  const legacyQualificationIds = ['office_basics', 'operations_foundation', 'client_service_experience', 'retail_operations_experience', 'logistics_experience', 'data_analysis_foundation', 'project_coordination', 'people_management_basics', 'media_production_experience', 'investment_basics'];
  const knownQualificationIds = new Set([
    ...legacyQualificationIds,
    ...(content.courses ?? []).flatMap((course) => course.qualificationId ? [course.qualificationId] : []),
    ...content.jobs.flatMap((job) => job.qualificationRequired ?? []),
  ]);
  candidate.qualifications = [...new Set((candidate.qualifications ?? []).filter((id) => typeof id === 'string' && knownQualificationIds.has(id)))];
  candidate.relationships = candidate.relationships ?? {};
  const characterIds = new Set(content.characters.map((entry) => entry.id));
  // --- message lifecycle (v9) ---------------------------------------------
  // Keep the most recent window only, and derive a durable id sequence so the
  // queue cap can never produce a duplicate id.
  const storedMessages = Array.isArray(candidate.messages) ? candidate.messages : [];
  const rawMessages: NonNullable<GameState['messages']> = storedMessages
    .filter((entry) => isRecord(entry) && Number.isInteger(entry.day) && typeof entry.title === 'string' && typeof entry.body === 'string' && typeof entry.read === 'boolean' && (entry.characterId === undefined || characterIds.has(entry.characterId as string)))
    .slice(-30);
  const usedMessageIds = new Set<string>();
  let fallbackMessageSequence = 0;
  candidate.messages = rawMessages.map((message) => {
    let id = typeof message.id === 'string' && /^message\.\d+\.\d+$/.test(message.id) ? message.id : '';
    while (!id || usedMessageIds.has(id)) id = `message.${message.day}.${++fallbackMessageSequence}`;
    usedMessageIds.add(id);
    return { ...message, id, dismissed: message.dismissed === true };
  });
  const highestMessageSequence = candidate.messages.reduce((highest, message) => {
    const parsed = Number(/(\d+)$/.exec(message.id)?.[1] ?? 0);
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);
  candidate.nextMessageSequence = Math.max(
    Number.isInteger(candidate.nextMessageSequence) ? Number(candidate.nextMessageSequence) : 0,
    highestMessageSequence,
    candidate.messages.length,
  );
  // Reading a message is inbox state, not an event. Legacy saves recorded a
  // `查看消息：` row that never corresponded to a life event, so drop it here.
  candidate.attributes = migrateAttributes(candidate.attributes, candidate.ability, candidate.lifestyle, candidate.relationships);
  syncLegacyAbility(candidate);
  candidate.eventCooldowns = candidate.eventCooldowns ?? {};
  candidate.chainStages = candidate.chainStages ?? {};
  candidate.flags = candidate.flags ?? {};
  candidate.modifiers = candidate.modifiers ?? [];
  candidate.discounts = candidate.discounts ?? [];
  candidate.rng = candidate.rng ?? initial.rng;
  candidate.marketJobIds = candidate.marketJobIds?.filter((id) => jobIds.has(id)) ?? initial.marketJobIds;
  if (!candidate.currentJobId) {
    candidate.currentJobId = undefined;
    candidate.employment = undefined;
  }
  candidate.lastSettledDay = Number.isInteger(candidate.lastSettledDay) ? candidate.lastSettledDay : initial.lastSettledDay;
  candidate.eventDay = Number.isInteger(candidate.eventDay) ? candidate.eventDay : candidate.time.day;
  candidate.eventsToday = Number.isInteger(candidate.eventsToday) ? candidate.eventsToday : 0;
  candidate.rentReliefAvailableDay = candidate.rentReliefAvailableDay ?? 0;
  candidate.housingReliefUntilDay = candidate.housingReliefUntilDay ?? 0;
  candidate.monthlyLedger = candidate.monthlyLedger ?? initial.monthlyLedger;
  candidate.monthlyLedger.netWorthStart = amount(candidate.monthlyLedger.netWorthStart);
  candidate.monthlyLedger.netWorthEnd = amount(candidate.monthlyLedger.netWorthEnd);
  candidate.financialLedger = isRecord(raw.financialLedger) && candidate.financialLedger && Array.isArray(candidate.financialLedger.entries)
    ? {
      month: candidate.calendar.month,
      nextSequence: Math.max(1, Number(candidate.financialLedger.nextSequence) || candidate.financialLedger.entries.length + 1),
      entriesComplete: candidate.financialLedger.entriesComplete !== false && candidate.financialLedger.entries.every(isFinancialEntry),
      entries: candidate.financialLedger.entries.filter(isFinancialEntry),
      cashStart: amount(candidate.financialLedger.cashStart),
      netWorthStart: amount(candidate.financialLedger.netWorthStart),
    }
    : { ...emptyFinancialLedger(candidate.calendar.month, unknown(), amount(candidate.monthlyLedger.netWorthStart)), entriesComplete: false };
  candidate.financialHistory = Array.isArray(candidate.financialHistory) ? candidate.financialHistory.slice(-12) : [];
  candidate.annualHistory = Array.isArray(candidate.annualHistory) ? candidate.annualHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number.isInteger(entry.months)).slice(-10) as GameState['annualHistory'] : [];
  candidate.wealthMilestones = Array.isArray(candidate.wealthMilestones)
    ? candidate.wealthMilestones.filter((entry) => isRecord(entry) && typeof entry.id === 'string' && wealthTierIds.has(entry.id) && Number.isInteger(entry.day) && Number(entry.day) > 0 && Number.isFinite(entry.netWorth)).map((entry) => ({ id: String(entry.id), day: Number(entry.day), netWorth: Number(entry.netWorth) })).slice(-10)
    : [];
  candidate.worldHistory = Array.isArray(candidate.worldHistory) ? candidate.worldHistory.filter((entry) => isRecord(entry) && Number.isInteger(entry.year) && Number(entry.year) > 0 && Number.isInteger(entry.day) && Number(entry.day) > 0 && Number.isFinite(entry.netWorth) && Number.isInteger(entry.businessCount) && Number(entry.businessCount) >= 0 && Number.isInteger(entry.relationshipCount) && Number(entry.relationshipCount) >= 0 && Number.isInteger(entry.visitedLocationCount) && Number(entry.visitedLocationCount) >= 0 && (entry.listedBusinessCount === undefined || (Number.isInteger(entry.listedBusinessCount) && Number(entry.listedBusinessCount) >= 0)) && (entry.publicFloatPercent === undefined || (Number.isFinite(entry.publicFloatPercent) && Number(entry.publicFloatPercent) >= 0)) && (entry.currentJobId === undefined || jobIds.has(String(entry.currentJobId)))).map((entry) => ({ ...entry, locationDevelopment: isRecord(entry.locationDevelopment) ? Object.fromEntries(Object.entries(entry.locationDevelopment).filter(([id, level]) => locationIds.has(id) && Number.isInteger(level) && Number(level) >= 0 && Number(level) <= 5)) : undefined, relationshipValues: isRecord(entry.relationshipValues) ? Object.fromEntries(Object.entries(entry.relationshipValues).filter(([id, value]) => characterIds.has(id) && Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 100).map(([id, value]) => [id, Math.round(Number(value))])) : undefined, characterCareerStates: isRecord(entry.characterCareerStates) ? Object.fromEntries(Object.entries(entry.characterCareerStates).filter(([id, title]) => characterIds.has(id) && typeof title === 'string' && title.trim().length > 0).map(([id, title]) => [id, String(title)])) : undefined, companyStates: isRecord(entry.companyStates) ? Object.fromEntries(Object.entries(entry.companyStates).filter(([id, title]) => (content.companies ?? []).some((company) => company.id === id) && typeof title === 'string' && title.trim().length > 0).map(([id, title]) => [id, String(title)])) : undefined, listedBusinessCount: entry.listedBusinessCount === undefined ? undefined : Number(entry.listedBusinessCount), publicFloatPercent: entry.publicFloatPercent === undefined ? undefined : Number(entry.publicFloatPercent), publicBusinessEquities: migrateWorldPublicBusinessEquities(entry.publicBusinessEquities, businessIds) })).slice(-10) as GameState['worldHistory'] : [];
  candidate.lifeHistory = (Array.isArray(candidate.lifeHistory) ? candidate.lifeHistory : [])
    .filter(isLifeRecordEntry)
    .filter((entry) => !entry.title.startsWith('查看消息：'));
  candidate.nextLifeRecordSequence = Math.max(Number.isInteger(raw.nextLifeRecordSequence) ? Number(raw.nextLifeRecordSequence) : 0, candidate.lifeHistory.length, ...candidate.lifeHistory.map(entry => Number(/(\d+)$/.exec(entry.id)?.[1] ?? 0)));
  // Private-equity sell locks: anchor the explicit field at the latest real
  // purchase record. A holding without a reliable purchase fact is already
  // unlocked — the legacy lastValuationDay anchor was continuously refreshed
  // by daily settlement and must never re-punish long-held positions.
  for (const [investmentId, holding] of Object.entries(candidate.investments ?? {})) {
    if (!isRecord(holding)) continue;
    const definition = (content.investments ?? []).find((entry) => entry.id === investmentId);
    if (definition?.kind !== 'private_equity') continue;
    if (Number.isFinite(holding.lockUntilDay) && Number(holding.lockUntilDay) > 0) continue;
    const purchaseDays = (candidate.lifeHistory ?? [])
      .filter((entry) => entry.category === 'investment' && entry.sourceId === investmentId && entry.title.startsWith('买入'))
      .map((entry) => entry.day);
    holding.lockUntilDay = purchaseDays.length ? Math.max(...purchaseDays) + PRIVATE_EQUITY_LOCK_DAYS : candidate.time.day;
  }
  candidate.businessFacts = Number(raw.version) >= 10 && isRecord(raw.businessFacts)
    ? structuredClone(raw.businessFacts) as unknown as GameState['businessFacts']
    : factsFromHistory(candidate.lifeHistory, candidate.time.day);
  if (!candidate.businessFacts || !isRecord(candidate.businessFacts.lastCompleted) || !isRecord(candidate.businessFacts.interactions) || !isRecord(candidate.businessFacts.retentionClaims)) throw new Error('业务事实格式无效');
  const validDay = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= candidate.time.day;
  if (Object.values(candidate.businessFacts.lastCompleted).some(value => !validDay(value))
    || Object.values(candidate.businessFacts.retentionClaims).some(value => typeof value !== 'boolean')
    || Object.values(candidate.businessFacts.interactions).some(days => !isRecord(days) || Object.entries(days).some(([day, count]) => !validDay(Number(day)) || !Number.isInteger(count) || count < 0))) throw new Error('业务事实记录无效');
  const details = candidate.businessFacts.relationshipDetails;
  if (details !== undefined && (!isRecord(details) || Object.values(details).some(entries => !isRecord(entries) || Object.values(entries).some(days => !isRecord(days) || Object.entries(days).some(([day, count]) => !validDay(Number(day)) || !Number.isInteger(count) || Number(count) < 0))))) throw new Error('送礼事实记录无效');
  if (candidate.longActivity) {
    const instance = candidate.longActivity;
    const a = instance.activity;
    const minute = (t: GameState['time']) => (t.day - 1) * 1440 + t.hour * 60 + t.minute;
    const validTime = (t: GameState['time'] | undefined) => t && Number.isInteger(t.day) && t.day > 0 && Number.isInteger(t.hour) && t.hour >= 0 && t.hour < 24 && Number.isInteger(t.minute) && t.minute >= 0 && t.minute < 60;
    if (Number(raw.version) >= 10 && (!a || !validTime(a.start) || !validTime(a.end) || a.kind !== 'activity' || typeof instance.id !== 'string' || minute(a.start) > minute(candidate.time) || minute(a.end) <= minute(candidate.time) || minute(a.end) - minute(a.start) < 2880)) throw new Error('长活动开始记录无效');
  }
  if (Number(raw.version) < 10) {
    if (candidate.employment) candidate.businessFacts.retentionClaims[retentionKey(candidate.employment.jobId, candidate.employment.companyId)] = true;
    for (const past of candidate.employmentHistory ?? []) candidate.businessFacts.retentionClaims[retentionKey(past.jobId, past.companyId)] = true;
    candidate.longActivity = undefined;
  }
  if (candidate.employment?.pendingJobId && !Number.isInteger(candidate.employment.pendingEffectiveDay)) candidate.employment.pendingEffectiveDay = candidate.time.day + 8 - candidate.calendar.weekday;
  candidate.ambientLog = Array.isArray(candidate.ambientLog) ? candidate.ambientLog.slice(-20) : [];
  const storylines = new Map((content.storylines ?? []).map((storyline) => [storyline.id, new Set(storyline.stages.map((stage) => stage.id))]));
  candidate.storylineStages = Object.fromEntries(Object.entries(candidate.storylineStages ?? {}).filter(([id, stage]) => storylines.get(id)?.has(stage as string)));
  const legacyUnlockedJobs = [...candidate.unlockedJobIds];
  candidate.acquiredSideJobs = candidate.acquiredSideJobs ?? {};
  for (const jobId of legacyUnlockedJobs) {
    const job = content.jobs.find((entry) => entry.id === jobId);
    if (job && employmentKind(job) === 'repeatable_side_job') {
      candidate.acquiredSideJobs[jobId] ??= { jobId, acquiredDay: candidate.time.day };
    }
  }
  // --- application lifecycle (v9) -----------------------------------------
  // Re-application cooldowns move out of the application records so clearing
  // finished applications can never be used to apply again early. Legacy
  // `nextEligibleDay` values are migrated into the new map.
  const rawCooldowns = isRecord(candidate.applicationCooldowns) ? candidate.applicationCooldowns : {};
  const applicationCooldowns: Record<string, ApplicationCooldownState> = {};
  for (const [key, value] of Object.entries(rawCooldowns)) {
    if (!isRecord(value)) continue;
    const jobId = typeof value.jobId === 'string' ? value.jobId : key.split('@')[0];
    const companyId = typeof value.companyId === 'string' ? value.companyId : key.split('@')[1];
    if (!jobId || !companyId || !jobIds.has(jobId) || !Number.isInteger(value.nextEligibleDay)) continue;
    applicationCooldowns[applicationCooldownKey(jobId, companyId)] = { jobId, companyId, nextEligibleDay: Number(value.nextEligibleDay) };
  }
  candidate.applicationCooldowns = applicationCooldowns;
  const usedApplicationIds = new Set<string>();
  const pendingOfferRemap = new Map<string, string>();
  let fallbackApplicationSequence = 0;
  candidate.applications = Array.isArray(candidate.applications)
    ? candidate.applications
      .filter((entry) => isRecord(entry) && jobIds.has(String(entry.jobId)))
      .map((entry) => {
        const application = entry as JobApplicationState;
        const originalId = typeof application.applicationId === 'string' ? application.applicationId : '';
        let applicationId = typeof application.applicationId === 'string' && /^application\.\d+\.\d+$/.test(application.applicationId) ? application.applicationId : '';
        while (!applicationId || usedApplicationIds.has(applicationId)) applicationId = `application.${application.submittedDay ?? candidate.time.day}.${++fallbackApplicationSequence}`;
        usedApplicationIds.add(applicationId);
        // 待确认 Offer 通知引用的是旧 id；迁移重建 id 后必须重映射，否则重载后通知静默消失。
        if (originalId && originalId !== applicationId) pendingOfferRemap.set(originalId, applicationId);
        if (Number.isInteger(application.nextEligibleDay) && application.nextEligibleDay! > candidate.time.day) {
          recordApplicationCooldown(candidate, String(application.jobId), String(application.companyId), application.nextEligibleDay!);
        }
        return { ...application, applicationId };
      })
    : [];
  if (candidate.pendingOfferApplicationId && pendingOfferRemap.has(candidate.pendingOfferApplicationId)) {
    candidate.pendingOfferApplicationId = pendingOfferRemap.get(candidate.pendingOfferApplicationId);
  }
  // A consumed special opportunity is never re-offered, even after it expired.
  candidate.consumedOpportunityIds = Array.isArray(candidate.consumedOpportunityIds)
    ? [...new Set(candidate.consumedOpportunityIds.filter((id) => typeof id === 'string'))]
    : [];
  for (const application of candidate.applications) {
    if (application.opportunityId) candidate.consumedOpportunityIds.push(application.opportunityId);
  }
  candidate.consumedOpportunityIds = [...new Set(candidate.consumedOpportunityIds)];
  const highestApplicationSequence = candidate.applications.reduce((highest, application) => {
    const parsed = Number(/(\d+)$/.exec(application.applicationId)?.[1] ?? 0);
    return Number.isFinite(parsed) ? Math.max(highest, parsed) : highest;
  }, 0);
  candidate.nextApplicationSequence = Math.max(
    Number.isInteger(candidate.nextApplicationSequence) ? Number(candidate.nextApplicationSequence) : 0,
    highestApplicationSequence,
    candidate.applications.length,
  );
  const companyIds = new Set((content.companies ?? []).map((entry) => entry.id));
  candidate.opportunities = Array.isArray(candidate.opportunities)
    ? candidate.opportunities.filter((entry) => isRecord(entry)
      && typeof entry.id === 'string'
      && jobIds.has(String(entry.jobId))
      && companyIds.has(String(entry.companyId))
      && ['referral', 'headhunter', 'internal', 'storyline'].includes(String(entry.route))
      && typeof entry.source === 'string'
      && Number.isInteger(entry.expiresDay)
      && Number(entry.expiresDay) >= candidate.time.day
      && Array.isArray(entry.salaryRange)
      && entry.salaryRange.length === 2
      && entry.salaryRange.every((value) => Number.isFinite(value))).slice(-20) as GameState['opportunities']
    : [];
  candidate.gigs = Array.isArray(candidate.gigs)
    ? candidate.gigs.flatMap((entry) => {
      const migrated = migrateGigRecord(entry, content);
      return migrated && migrated.expiresDay >= candidate.time.day ? [migrated] : [];
    })
    : [];
  candidate.employmentHistory = Array.isArray(candidate.employmentHistory) ? candidate.employmentHistory.filter((entry) => jobIds.has(entry.jobId)) : [];
  candidate.monthlyHighlights = Array.isArray(candidate.monthlyHighlights) ? candidate.monthlyHighlights : [];
  candidate.vacancies = generateVacancies(candidate, content, balance);
  candidate.majorEventsThisMonth = Number.isInteger(candidate.majorEventsThisMonth) ? candidate.majorEventsThisMonth : 0;
  if (candidate.currentJobId) {
    const job = content.jobs.find((entry) => entry.id === candidate.currentJobId);
    if (job?.kind === 'regular') {
      const rawEmployment: Record<string, unknown> = isRecord(candidate.employment) ? candidate.employment : {};
      const rawSchedule = isRecord(rawEmployment.schedule) ? rawEmployment.schedule : undefined;
      const schedule = rawSchedule && Array.isArray(rawSchedule.workDays)
        && Number.isInteger(rawSchedule.startMinute) && Number.isInteger(rawSchedule.endMinute)
        ? rawSchedule as unknown as JobSchedule
        : defaultJobSchedule(job);
      candidate.employment = {
        jobId: job.id,
        startedDay: Number.isInteger(rawEmployment.startedDay) ? Number(rawEmployment.startedDay) : undefined,
        // Legacy records have no explicit activation instant; `startedDay` is
        // the only evidence of a real start, and no evidence at all means the
        // schedule has always applied.
        activeFromMinute: Number.isInteger(rawEmployment.activeFromMinute)
          ? Number(rawEmployment.activeFromMinute)
          : Number.isInteger(rawEmployment.startedDay) ? (Number(rawEmployment.startedDay) - 1) * 1440 + schedule.startMinute : undefined,
        schedule,
        effectiveWeek: Number.isInteger(rawEmployment.effectiveWeek) ? Number(rawEmployment.effectiveWeek) : candidate.calendar.week,
        pendingJobId: typeof rawEmployment.pendingJobId === 'string' && jobIds.has(rawEmployment.pendingJobId) ? rawEmployment.pendingJobId : undefined,
        pendingEffectiveDay: Number.isInteger(rawEmployment.pendingEffectiveDay) ? Number(rawEmployment.pendingEffectiveDay) : rawEmployment.pendingJobId ? candidate.time.day + 8 - candidate.calendar.weekday : undefined,
        pendingActiveFromMinute: Number.isInteger(rawEmployment.pendingActiveFromMinute) ? Number(rawEmployment.pendingActiveFromMinute) : undefined,
        pendingCompanyId: typeof rawEmployment.pendingCompanyId === 'string' ? rawEmployment.pendingCompanyId : undefined,
        pendingBasePay: Number.isFinite(rawEmployment.pendingBasePay) ? Number(rawEmployment.pendingBasePay) : undefined,
        companyId: typeof rawEmployment.companyId === 'string' ? rawEmployment.companyId : undefined,
        basePay: Number.isFinite(rawEmployment.basePay) ? Number(rawEmployment.basePay) : job.basePay,
        salaryAdjustment: Number.isFinite(rawEmployment.salaryAdjustment) ? Number(rawEmployment.salaryAdjustment) : 0,
        negotiationStage: rawEmployment.negotiationStage === 1 || rawEmployment.negotiationStage === 2 ? rawEmployment.negotiationStage : 0,
        lastNegotiationDay: Number.isInteger(rawEmployment.lastNegotiationDay) ? Number(rawEmployment.lastNegotiationDay) : undefined,
      };
    } else {
      candidate.employment = undefined;
    }
  }
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  candidate.modifiers = dedupeModifiers(candidate.modifiers);
  pruneExpiredState(candidate);
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  for (const holding of Object.values(candidate.businesses)) holding.playerCostBasis = Number(raw.version) >= 10 ? amount(holding.playerCostBasis) : unknown('旧版企业成本可能遗漏注资或处置');
  for (const summary of [...(candidate.financialHistory ?? []), ...(candidate.annualHistory ?? []), ...(candidate.lastFinancialSummary ? [candidate.lastFinancialSummary] : []), ...(candidate.pendingMonthlySummary?.financial ? [candidate.pendingMonthlySummary.financial] : [])]) {
    for (const field of ['cashStart', 'cashEnd', 'cashChange', 'netWorthStart', 'netWorthEnd', 'netWorthChange', 'totalIncome', 'totalConsumption'] as const) {
      if (field in summary) Object.assign(summary, { [field]: amount((summary as unknown as Record<string, unknown>)[field]) });
    }
  }
  // Legacy saves can already contain hidden workday conflicts, stacked
  // modifiers and expired transient entries; repair them rather than resetting
  // the player's progress.
  reconcileStateWithEmployment(candidate);
  candidate.modifiers = dedupeModifiers(candidate.modifiers);
  pruneExpiredState(candidate);
  candidate.currentActivity = activityAtTime(candidate.time, candidate.weeklyPlan, candidate.employment, content, candidate);
  return candidate;
}

export async function loadGameState(content: ContentRegistry, balance: BalanceConfig): Promise<GameState> {
  return (await loadGameStateWithReport(content, balance)).state;
}

/** Test-only seams for deterministic interleaving; production passes nothing. */
export interface PersistenceTestHooks {
  /**
   * Runs before a commit opens its transaction — never inside one: an IndexedDB
   * transaction auto-commits as soon as it has no pending request, so waiting
   * inside it would silently drop the comparison the write depends on.
   * Installing this hook routes writes through the queued path.
   */
  beforeCommitRequest?: () => Promise<void> | void;
  /**
   * Synchronous seam inside the live commit transaction: called after the
   * payload write request succeeded and before the transaction commits.
   * Returning `'abort'` rolls the transaction back, so the canonical record
   * keeps its previous payload and version and the save is reported as failed.
   */
  afterPutBeforeComplete?: () => 'abort' | undefined;
}

let emergencySessionCounter = 0;

export function createGameStore(content: ContentRegistry, balance: BalanceConfig, seed?: number, testHooks?: PersistenceTestHooks) {
  // Running-week ticks arrive once per animation frame; serializing and writing
  // the full save on each one starves the frame budget. Ticks mark the store
  // dirty and a trailing timer persists them; every other action saves at once.
  const AUTOSAVE_THROTTLE_MS = 2000;
  let pendingSaveTimer: ReturnType<typeof setTimeout> | undefined;
  // Dirty marker for the write coordinator: the newest game state whose save has
  // been scheduled but has not verifiably committed. A queued commit skips itself
  // once this marker has been superseded or cleared, and the pagehide flush
  // records it as an emergency candidate.
  let dirtyState: GameState | undefined;
  // Identity of this store instance for the unload emergency key.
  const emergencySessionId = `${Date.now().toString(36)}.${(++emergencySessionCounter).toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
  // Lineage evidence for that key: the commits this window has handed to the
  // backend whose outcome is still unknown. Only these can explain a record that
  // is *behind* the candidate — a write from before the snapshot that lands after
  // it. A payload that already settled is deliberately forgotten: the same world
  // can be written again later (a reversible field such as the simulation speed
  // can be set back), and that later write must not be mistaken for the old one.
  const inFlightPayloads = new Map<string, number>();
  /**
   * Subset of `inFlightPayloads` whose commit would create the next generation,
   * mapped to the generation it already allocated for itself. The token comes
   * from this window, so a stored generation matching it is proof that this
   * window created it — payload bytes could be repeated by anyone.
   */
  const creatingPayloads = new Map<string, string>();
  const noteHandedOver = (payload: string, nextGeneration: string | undefined): string => {
    const identity = payloadIdentity(payload);
    inFlightPayloads.set(identity, (inFlightPayloads.get(identity) ?? 0) + 1);
    if (nextGeneration !== undefined) creatingPayloads.set(identity, nextGeneration);
    return identity;
  };
  const forgetHandedOver = (identity: string): void => {
    const remaining = (inFlightPayloads.get(identity) ?? 1) - 1;
    if (remaining > 0) { inFlightPayloads.set(identity, remaining); return; }
    inFlightPayloads.delete(identity);
    creatingPayloads.delete(identity);
  };
  const handoverEvidence = (): { inFlight: string[]; creatingGeneration?: string } => {
    const creating = [...creatingPayloads.values()];
    return {
      inFlight: [...inFlightPayloads.keys()],
      ...(creating.length ? { creatingGeneration: creating[creating.length - 1] } : {}),
    };
  };
  // The store exists before the canonical record has been read: until then the
  // game is a placeholder and no write is accepted. With the synchronous test
  // backend the boot below finishes inside this call, so nothing observes the
  // placeholder.
  const placeholder = createInitialState(content, balance, seed);
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
  let start: () => void = () => {};
  const store = create<GameStore>((set, get) => {
    /** Version of the canonical record this window has confirmed. */
    let confirmedHead: CanonicalHead | undefined;
    let canonicalStatus: 'loading' | 'ready' | 'unavailable' = 'loading';
    let canonicalCommits = 0;
    let booted = false;
    let externalSaveConflict = false;
    const backend = () => getCanonicalSaveBackend();
    /**
     * Another window committed a version this one did not expect. Retrying with
     * the version just observed would overwrite the update that was observed, so
     * this window freezes instead and keeps its memory until the player reloads.
     */
    const enterExternalConflict = (): void => {
      if (externalSaveConflict) return;
      externalSaveConflict = true;
      if (pendingSaveTimer !== undefined) { clearTimeout(pendingSaveTimer); pendingSaveTimer = undefined; }
      const game = get().game;
      // A stale window must not keep simulating: every tick would be a rejected
      // dispatch, so the world pauses instead.
      set({ externalSaveConflict: true, game: game.simulationMode === 'running' ? { ...game, simulationMode: 'paused' } : game });
    };
    /**
     * Every persistence attempt is numbered, and only the newest attempt may
     * write the visible error state: an older request that settles late (a slow
     * commit, a write that fails after a newer one already landed) must never
     * overwrite the state of the request that came after it.
     */
    let saveAttempt = 0;
    const reportSaveFailure = (error: string, attempt: number): void => {
      if (attempt !== saveAttempt) return;
      if (get().saveError === error) return;
      set({ saveError: error });
    };
    /** One canonical write; `expected` is read when the commit runs, never earlier. */
    const commitState = (state: GameState, rotate: boolean): MaybePromise<WriteAttempt> => {
      const serialized = serializeSave(state);
      if ('error' in serialized) return { outcome: { status: 'failed', error: serialized.error } };
      // `expected === undefined` means this write creates the record when none
      // exists, which starts a new generation exactly like a reset does.
      const createsGeneration = rotate || confirmedHead === undefined;
      // Allocated here, before the write leaves this window: the record can later
      // be matched against it exactly, which is what proves a new generation came
      // from this write rather than from another window writing the same world.
      const nextGeneration = createsGeneration ? newGeneration() : undefined;
      const handedOver: string[] = [];
      const attempt = commitAttempt(state, serialized.payload, (payload) => {
        // Recorded exactly where the payload is handed over, so the quota retry
        // (a different payload for the same world) is evidence as well.
        handedOver.push(noteHandedOver(payload, nextGeneration));
        return {
          expected: confirmedHead,
          payload,
          ...(rotate ? { rotate: true } : {}),
          ...(nextGeneration !== undefined ? { nextGeneration } : {}),
          ...(testHooks?.afterPutBeforeComplete ? { onPutSucceeded: testHooks.afterPutBeforeComplete } : {}),
        };
      });
      // Whatever the outcome — committed, refused or failed — the commit is no
      // longer unsettled, so it stops being lineage evidence for a candidate.
      return then(attempt, (result) => {
        for (const identity of handedOver) forgetHandedOver(identity);
        return result;
      });
    };
    /**
     * Apply a commit result. The version this window confirmed only advances
     * here, after the transaction committed — never when a write request
     * succeeded — and a conflict freezes the window instead of retrying with the
     * version it just observed.
     */
    const applyCommitOutcome = (attempted: WriteAttempt, state: GameState, attempt: number): PersistResult => {
      const { outcome, save } = attempted;
      if (dirtyState === state) dirtyState = undefined;
      if (outcome.status === 'committed') {
        if (!save) {
          const error = '存档事务已完成但没有产生载荷';
          reportSaveFailure(error, attempt);
          return { status: 'failed', error };
        }
        confirmedHead = outcome.head;
        canonicalCommits += 1;
        set({
          canonical: { status: 'ready', head: outcome.head, commits: canonicalCommits },
          saveError: save.error,
          // The recovered state is the stored one now: protection is released by
          // the write that landed, not by a caller remembering to clear it.
          recovery: undefined,
          loadProblem: undefined,
        });
        return { status: 'persisted', outcome: save };
      }
      if (outcome.status === 'conflict') {
        enterExternalConflict();
        return { status: 'refused' };
      }
      const error = saveFailureMessage(outcome.error);
      reportSaveFailure(error, attempt);
      return { status: 'failed', error };
    };
    /**
     * Serialize this window's own commits. The cross-window guarantee is the
     * transaction's; the queue only keeps one window from comparing two of its
     * own saves against the same version.
     */
    let commitQueue: Promise<void> = Promise.resolve();
    const enqueueCommit = (state: GameState, rotate: boolean, attempt: number): Promise<PersistResult> => {
      const run = async (): Promise<PersistResult> => {
        if (dirtyState !== state) return { status: 'superseded' };
        if (externalSaveConflict) return { status: 'refused' };
        // Test barrier; deliberately outside the transaction it delays.
        await testHooks?.beforeCommitRequest?.();
        if (dirtyState !== state) return { status: 'superseded' };
        return applyCommitOutcome(await commitState(state, rotate), state, attempt);
      };
      const settled = commitQueue.then(run, run);
      commitQueue = settled.then(() => undefined, () => undefined);
      return settled;
    };
    /**
     * Whether this window may commit and know the result immediately. Only the
     * synchronous test backend says yes, and a test barrier (which is
     * asynchronous by nature) always pushes the write onto the queued path.
     */
    const answersSynchronously = (): boolean => backend().synchronous === true && testHooks?.beforeCommitRequest === undefined;
    /**
     * Dispatch-path persist — the canonical write coordinator. The result always
     * distinguishes "landed", "still in flight" and "refused", so a caller can
     * never mistake a queued write for a successful one.
     */
    const persistGame = (state: GameState, options?: { rotate?: boolean }): PersistResult => {
      if (externalSaveConflict) return { status: 'refused' };
      if (!booted || canonicalStatus !== 'ready') {
        return { status: 'failed', error: canonicalStatus === 'unavailable' ? CANONICAL_STORAGE_UNAVAILABLE : '存档尚未读取完成，写入未开始' };
      }
      const rotate = options?.rotate === true;
      const attempt = ++saveAttempt;
      if (answersSynchronously()) {
        const immediate = commitState(state, rotate);
        if (!isThenable(immediate)) return applyCommitOutcome(immediate, state, attempt);
        // A backend that declares itself synchronous but answers late already has
        // a commit in flight, so it is reported as queued rather than retried.
        dirtyState = state;
        return { status: 'scheduled', completion: Promise.resolve(immediate).then((settled) => applyCommitOutcome(settled, state, attempt)) };
      }
      dirtyState = state;
      return { status: 'scheduled', completion: enqueueCommit(state, rotate, attempt) };
    };
    /**
     * Unload-only emergency record. The pagehide path cannot wait for a
     * transaction to commit and must not claim the canonical save landed, so the
     * latest memory goes to a session-scoped key annotated with the version this
     * window last confirmed *and* the commits it still had unsettled at this
     * moment (see `EmergencySaveRecord`). Nothing here writes the canonical
     * record.
     */
    const writeEmergencySave = (state: GameState): void => {
      try {
        const serialized = serializeSave(state);
        const payloadId = 'payload' in serialized ? payloadIdentity(serialized.payload) : undefined;
        // The compressed form is what a quota retry would store for the same
        // world, so it is compared too: an identical record is still "saved".
        const trimmed = needsTrimForStorage(state) ? trimForStorage(state) : undefined;
        const trimmedSerialized = trimmed ? serializeSave(trimmed) : undefined;
        const trimmedId = trimmedSerialized && 'payload' in trimmedSerialized ? payloadIdentity(trimmedSerialized.payload) : undefined;
        const record: EmergencySaveRecord = {
          baseGeneration: confirmedHead?.generation,
          baseRevision: confirmedHead?.revision ?? 0,
          save: state,
          lineageVersion: 1,
          ...handoverEvidence(),
          ...(payloadId !== undefined ? { payloadId } : {}),
          ...(trimmedId !== undefined && trimmedId !== payloadId ? { trimmedId } : {}),
        };
        localStorage.setItem(EMERGENCY_SAVE_PREFIX + emergencySessionId, JSON.stringify(record));
      } catch { /* best-effort: a queued commit may still land after all */ }
    };
    /**
     * Page-lifecycle flush. The throttled autosave runs through
     * `flushSaveAsync` instead, so a running game persists through the normal
     * coordinated write rather than degrading every periodic save into an
     * anomaly the next boot has to recover from.
     */
    const flushSave = () => {
      const hadTimer = pendingSaveTimer !== undefined;
      if (hadTimer) pendingSaveTimer = undefined;
      if (!hadTimer && dirtyState === undefined) return;
      if (externalSaveConflict || canonicalStatus !== 'ready') return;
      writeEmergencySave(get().game);
    };
    /**
     * Throttled autosave flush: the same trailing-timer entry point as
     * `flushSave`, but it takes the canonical commit whenever the window can
     * still write. Only a page that is actually unloading falls back to the
     * emergency candidate.
     */
    const flushSaveAsync = (): Promise<void> => {
      const hadTimer = pendingSaveTimer !== undefined;
      if (hadTimer) pendingSaveTimer = undefined;
      if (!hadTimer && dirtyState === undefined) return Promise.resolve();
      if (externalSaveConflict) return Promise.resolve();
      const result = persistGame(get().game);
      const attempt = saveAttempt;
      // A synchronous failure (no canonical store, or a refused write) has to
      // reach the visible error state just like a queued one; otherwise the
      // autosave fails silently while the game keeps running on unsaved progress.
      if (result.status !== 'scheduled') {
        const outcome = saveOutcomeOf(result);
        if (outcome?.error) reportSaveFailure(outcome.error, attempt);
        return Promise.resolve();
      }
      return result.completion.then(
        (settled) => { if (settled.status === 'failed') reportSaveFailure(settled.error, attempt); },
        (error: unknown) => reportSaveFailure(`存档写入未能完成：${describeError(error)}`, attempt),
      );
    };
    /** Publish the boot decision: the game, what the player must confirm, and the version. */
    const applyBootPlan = (plan: BootPlan): void => {
      canonicalStatus = plan.unavailable ? 'unavailable' : 'ready';
      confirmedHead = plan.head;
      let state = plan.state;
      let problem = plan.problem;
      let recovery = plan.recovery;
      // Boot adoption of unload emergency candidates: a surviving candidate
      // carries unsaved progress from a window that could not persist before
      // hiding, and descends from a version the record has not moved past (see
      // `isSuperseded`). It is offered through the write-protected recovery flow
      // instead of silently replacing the canonical save.
      const candidates = seed === undefined ? collectEmergencyCandidates(plan.stored) : [];
      let emergencyRaw: string | undefined;
      if (candidates.length) {
        const best = candidates[candidates.length - 1];
        try {
          state = migrateGameState(best.state, content, balance);
          emergencyRaw = JSON.stringify(best.state);
        } catch (error) {
          console.error('[yuliang] 紧急存档候选不可用', error);
        }
      }
      const recoveryReason = [recovery?.reason, emergencyRaw ? '检测到上次关闭时未能写入正式存档的进度，已临时恢复' : undefined].filter(Boolean).join('；') || undefined;
      const session: RecoverySession | undefined = recovery || emergencyRaw
        ? { raw: recovery?.raw ?? emergencyRaw!, reason: recoveryReason!, writeProtected: true, noticeVisible: true, kind: 'compatibility' }
        : (problem ? { ...problem, writeProtected: true, noticeVisible: true, kind: 'unreadable' } : undefined);
      problem = session?.kind === 'compatibility' ? undefined : problem;
      booted = true;
      set({
        game: state,
        recovery: session,
        loadProblem: session?.kind === 'unreadable' ? problem : undefined,
        canonical: { status: canonicalStatus, ...(confirmedHead ? { head: confirmedHead } : {}), commits: canonicalCommits },
        ...(plan.unavailable ? { saveError: plan.unavailable } : {}),
      });
      resolveReady();
    };
    /**
     * Boot the canonical save. A synchronous backend answers inside this call —
     * which is why the placeholder is never observed in tests — and the browser
     * backend settles a few milliseconds later, with `canonical.status` staying
     * `loading` until then so nothing can be dispatched or saved onto the
     * placeholder in the meantime.
     */
    start = () => {
      let plan: MaybePromise<BootPlan>;
      try {
        plan = resolveBoot(content, balance, seed);
      } catch (error) {
        applyBootPlan({ state: placeholder, unavailable: `${CANONICAL_STORAGE_UNAVAILABLE}（${describeError(error)}）` });
        return;
      }
      if (isThenable(plan)) {
        void plan.then(applyBootPlan, (error: unknown) => {
          applyBootPlan({ state: placeholder, unavailable: `${CANONICAL_STORAGE_UNAVAILABLE}（${describeError(error)}）` });
        });
      } else {
        applyBootPlan(plan);
      }
    };
    return {
    game: placeholder, effects: [], activeView: 'life', externalSaveConflict: false,
    canonical: { status: 'loading', commits: 0 },
    ready,
    dispatch: (action): boolean => {
      if (get().externalSaveConflict) {
        // The persistent conflict banner already explains the freeze.
        return false;
      }
      // Nothing may be dispatched onto the placeholder: the real save has not
      // been read yet, so an action now would be applied to the wrong world.
      if (!booted) return false;
      const result = dispatchGameAction(get().game, action, content, balance);
      if (result.error) { set({ lastError: result.error, effects: [] }); return false; }
      let outcome: SaveOutcome | undefined;
      let conflictDuringSave = false;
      if (!get().recovery?.writeProtected) {
        if (action.type === 'advance_simulation' && result.state.simulationMode === 'running') {
          // Periodic autosave runs through the same canonical commit as every
          // other action; only the unload path may use the emergency candidate,
          // otherwise a normally running game keeps reporting "progress was not
          // written" on the next boot.
          if (pendingSaveTimer === undefined) pendingSaveTimer = setTimeout(() => { void flushSaveAsync(); }, AUTOSAVE_THROTTLE_MS);
        } else {
          if (pendingSaveTimer !== undefined) { clearTimeout(pendingSaveTimer); pendingSaveTimer = undefined; }
          const persistResult = persistGame(result.state);
          // The attempt number is read *after* the request: `persistGame` is what
          // allocates it, and an earlier attempt's late failure must never be
          // applied on top of a newer one.
          const attempt = saveAttempt;
          outcome = saveOutcomeOf(persistResult);
          // A queued write reports nothing synchronously, but its failure still
          // belongs on screen: a refused write and a storage failure inside the
          // transaction both settle later.
          if (persistResult.status === 'scheduled') {
            persistResult.completion.then(
              (settled) => { if (settled.status === 'failed') reportSaveFailure(settled.error, attempt); },
              (error: unknown) => reportSaveFailure(`存档写入未能完成：${describeError(error)}`, attempt),
            );
          }
          // The divergence can surface only at commit time; a write that was
          // refused must not land in memory either, or the stale window keeps
          // drifting while telling the player it worked.
          conflictDuringSave = outcome === undefined && get().externalSaveConflict;
        }
      }
      if (conflictDuringSave) {
        // The persistent conflict banner already explains the freeze; repeating
        // it as lastError would only duplicate the text on screen.
        set({ effects: [] });
        return false;
      }
      set({ game: result.state, effects: result.effects, lastError: undefined, lastNotice: result.notice, saveError: outcome?.error });
      return true;
    },
    flushSave,
    flushSaveAsync,
    consumeEffects: () => set({ effects: [] }),
    setView: (activeView) => set({ activeView }),
    dismissLoadProblem: () => set({ loadProblem: undefined, recovery: get().recovery ? { ...get().recovery!, noticeVisible: false } : undefined }),
    showRecovery: () => set({ recovery: get().recovery ? { ...get().recovery!, noticeVisible: true } : undefined }),
    acceptRecovery: () => {
      if (get().externalSaveConflict) return;
      const game = structuredClone(get().game);
      if (get().recovery?.kind === 'compatibility') {
        if (game.pendingEventId && !content.events.some(event => event.id === game.pendingEventId)) game.pendingEventId = undefined;
        game.simulationMode = game.pendingEventId ? 'event' : game.pendingReward ? 'reward' : game.pendingMonthlySummary ? 'monthly_summary' : 'paused';
      }
      // The explicit confirmation is a canonical write like any other: it goes
      // through the shared commit path, so it can never interleave with another
      // window's transaction. The confirmation supersedes any queued deferred
      // write via the dirty marker, and ownership is released only once the write
      // has verifiably committed — a queued write that fails afterwards (or never
      // runs) keeps the protection, so the unsaved bad payload is never silently
      // treated as replaced.
      const result = persistGame(game);
      const landedNow = result.status === 'persisted';
      const attempt = saveAttempt;
      set({
        game,
        saveError: saveOutcomeOf(result)?.error,
        lastError: undefined,
        lastNotice: undefined,
        ...(landedNow ? { recovery: undefined, loadProblem: undefined } : {}),
      });
      if (result.status === 'scheduled') {
        result.completion.then(
          (settled) => { if (settled.status === 'failed') reportSaveFailure(settled.error, attempt); },
          (error: unknown) => reportSaveFailure(`存档写入未能完成：${describeError(error)}`, attempt),
        );
      }
    },
    reset: (nextSeed = Date.now()) => {
      if (get().externalSaveConflict) return;
      const game = createInitialState(content, balance, nextSeed);
      // Same coordination as acceptRecovery: the reset commits through the shared
      // path with a rotated generation, so an older queued write can neither be
      // re-qualified nor replay the generation it was based on.
      const result = persistGame(game, { rotate: true });
      const landedNow = result.status === 'persisted';
      const attempt = saveAttempt;
      set({
        game, effects: [], lastError: undefined, lastNotice: undefined,
        saveError: saveOutcomeOf(result)?.error,
        ...(landedNow ? { recovery: undefined, loadProblem: undefined } : {}),
      });
      if (result.status === 'scheduled') {
        result.completion.then(
          (settled) => { if (settled.status === 'failed') reportSaveFailure(settled.error, attempt); },
          (error: unknown) => reportSaveFailure(`存档写入未能完成：${describeError(error)}`, attempt),
        );
      }
    },
    };
  });
  start();
  return store;
}
