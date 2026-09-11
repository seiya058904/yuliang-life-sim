/**
 * State Lifecycle — one place that decides what is actionable, what is
 * finished, what is merely recent history, and what is permanent canonical
 * history. Messages and job applications both use it so "handled" never means
 * "permanently pinned to the main screen", and clearing a record can never
 * bypass a business rule such as a re-application cooldown.
 */
import type {
  ContentId, GameState, JobApplicationState, MessageState,
} from '../content/contracts';
import { isActiveApplicationStatus, isTerminalApplicationStatus } from '../content/contracts';

/** Ephemeral queue bound: the inbox keeps the most recent messages only. */
export const MESSAGE_HISTORY_LIMIT = 30;
/** Bounded history: finished applications kept for review before being cleared. */
export const APPLICATION_HISTORY_LIMIT = 60;

export function applicationCooldownKey(jobId: ContentId, companyId: ContentId): string {
  return `${jobId}@${companyId}`;
}

/** Monotonic ids: array length must never be the source of a unique id. */
export function nextSequence(state: GameState, field: 'nextMessageSequence' | 'nextApplicationSequence'): number {
  const current = Number.isInteger(state[field]) ? (state[field] as number) : 0;
  const next = Math.max(1, current + 1);
  state[field] = next;
  return next;
}

export function createApplicationId(state: GameState): string {
  const existing = new Set((state.applications ?? []).map((entry) => entry.applicationId));
  let candidate = `application.${state.time.day}.${nextSequence(state, 'nextApplicationSequence')}`;
  while (existing.has(candidate)) candidate = `application.${state.time.day}.${nextSequence(state, 'nextApplicationSequence')}`;
  return candidate;
}

export interface MessageInput {
  title: string;
  body: string;
  characterId?: ContentId;
  sourceId?: ContentId;
  day?: number;
}

/**
 * Append one inbox message. Ids come from a durable sequence, so capping the
 * queue can never produce a duplicate id.
 */
export function appendMessage(state: GameState, input: MessageInput): MessageState {
  const message: MessageState = {
    id: `message.${state.time.day}.${nextSequence(state, 'nextMessageSequence')}`,
    day: input.day ?? state.time.day,
    title: input.title,
    body: input.body,
    ...(input.characterId ? { characterId: input.characterId } : {}),
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    read: false,
  };
  state.messages = [...(state.messages ?? []), message].slice(-MESSAGE_HISTORY_LIMIT);
  return message;
}

/** Main inbox: everything the player has not cleared yet. */
export function visibleMessages(messages: readonly MessageState[] | undefined): MessageState[] {
  return (messages ?? []).filter((message) => !message.dismissed);
}

/** Badge count: unhandled messages only, never the lifetime total. */
export function unreadMessageCount(messages: readonly MessageState[] | undefined): number {
  return visibleMessages(messages).filter((message) => !message.read).length;
}

export function markMessageRead(state: GameState, messageId: string): boolean {
  const message = (state.messages ?? []).find((entry) => entry.id === messageId);
  if (!message) return false;
  message.read = true;
  return true;
}

export function markAllMessagesRead(state: GameState): number {
  let changed = 0;
  for (const message of state.messages ?? []) {
    if (message.read || message.dismissed) continue;
    message.read = true;
    changed += 1;
  }
  return changed;
}

/** "清除已读": read messages leave the main inbox but stay in the save. */
export function dismissMessage(state: GameState, messageId: string): boolean {
  const message = (state.messages ?? []).find((entry) => entry.id === messageId);
  if (!message || message.dismissed) return false;
  message.dismissed = true;
  return true;
}

export function clearReadMessages(state: GameState): number {
  let changed = 0;
  for (const message of state.messages ?? []) {
    if (!message.read || message.dismissed) continue;
    message.dismissed = true;
    changed += 1;
  }
  return changed;
}

export function activeApplications(state: GameState): JobApplicationState[] {
  return (state.applications ?? []).filter((application) => isActiveApplicationStatus(application.status));
}

export function terminalApplications(state: GameState): JobApplicationState[] {
  return (state.applications ?? []).filter((application) => isTerminalApplicationStatus(application.status));
}

export function activeApplicationCount(state: GameState): number {
  return activeApplications(state).length;
}

export function openOfferApplications(state: GameState): JobApplicationState[] {
  return (state.applications ?? []).filter((application) => application.status === 'offer');
}

/** Replace a bare `nextEligibleDay` on an application with the decoupled record. */
export function recordApplicationCooldown(state: GameState, jobId: ContentId, companyId: ContentId, nextEligibleDay: number): void {
  state.applicationCooldowns ??= {};
  const key = applicationCooldownKey(jobId, companyId);
  const current = state.applicationCooldowns[key];
  state.applicationCooldowns[key] = {
    jobId,
    companyId,
    nextEligibleDay: Math.max(nextEligibleDay, current?.nextEligibleDay ?? 0),
  };
}

export function applicationCooldownRemaining(state: GameState, jobId: ContentId, companyId: ContentId): number {
  const record = state.applicationCooldowns?.[applicationCooldownKey(jobId, companyId)];
  if (!record) return 0;
  return Math.max(0, record.nextEligibleDay - state.time.day);
}

/**
 * Clearing a finished application is a pure history operation: the cooldown
 * record lives outside the application array, so this can never unlock a
 * faster re-application.
 */
export function dismissTerminalApplication(state: GameState, applicationId: string): boolean {
  const application = (state.applications ?? []).find((entry) => entry.applicationId === applicationId);
  if (!application || !isTerminalApplicationStatus(application.status)) return false;
  if (application.nextEligibleDay !== undefined) recordApplicationCooldown(state, application.jobId, application.companyId, application.nextEligibleDay);
  state.applications = (state.applications ?? []).filter((entry) => entry.applicationId !== applicationId);
  return true;
}

export function clearTerminalApplications(state: GameState): number {
  const removable = terminalApplications(state);
  for (const application of removable) {
    if (application.nextEligibleDay !== undefined) {
      recordApplicationCooldown(state, application.jobId, application.companyId, application.nextEligibleDay);
    }
  }
  const removableIds = new Set(removable.map((application) => application.applicationId));
  state.applications = (state.applications ?? []).filter((entry) => !removableIds.has(entry.applicationId));
  return removable.length;
}

/**
 * Transient runtime state is pruned, not merely ignored at read time, so a long
 * save cannot accumulate expired entries forever.
 */
export interface PruneReport { discounts: number; opportunities: number; gigs: number; cooldowns: number }

export function pruneExpiredState(state: GameState): PruneReport {
  const day = state.time.day;
  const report: PruneReport = { discounts: 0, opportunities: 0, gigs: 0, cooldowns: 0 };
  const discounts = (state.discounts ?? []).filter((discount) => !discount.expiresDay || discount.expiresDay >= day);
  report.discounts = (state.discounts?.length ?? 0) - discounts.length;
  state.discounts = discounts;

  const opportunities = (state.opportunities ?? []).filter((opportunity) => opportunity.expiresDay >= day);
  report.opportunities = (state.opportunities?.length ?? 0) - opportunities.length;
  state.opportunities = opportunities;

  const gigs = (state.gigs ?? []).filter((gig) => gig.expiresDay >= day);
  report.gigs = (state.gigs?.length ?? 0) - gigs.length;
  state.gigs = gigs;

  if (state.applicationCooldowns) {
    const entries = Object.entries(state.applicationCooldowns).filter(([, record]) => record.nextEligibleDay > day);
    report.cooldowns = Object.keys(state.applicationCooldowns).length - entries.length;
    state.applicationCooldowns = Object.fromEntries(entries);
  }

  const consumed = new Set(state.consumedOpportunityIds ?? []);
  if (consumed.size) state.consumedOpportunityIds = [...consumed].slice(-40);
  return report;
}

export function pruneApplicationHistory(state: GameState, limit = APPLICATION_HISTORY_LIMIT): number {
  const applications = state.applications ?? [];
  if (applications.length <= limit) return 0;
  const active = applications.filter((application) => isActiveApplicationStatus(application.status));
  const terminal = applications.filter((application) => isTerminalApplicationStatus(application.status));
  const keepTerminal = terminal.slice(-Math.max(0, limit - active.length));
  const kept = new Set([...active, ...keepTerminal].map((application) => application.applicationId));
  const removed = applications.length - kept.size;
  state.applications = applications.filter((application) => kept.has(application.applicationId));
  return removed;
}
