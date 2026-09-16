import { beforeEach, describe, expect, it } from 'vitest';
import { balanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { dispatchGameAction } from '../engine/actions';
import { calendarForDay } from '../engine/calendar';
import { businessValuation, businessValuationBasis } from '../engine/economy';
import { businessValuationBasisNeedsReview, createGameStore, SAVE_KEY } from './gameStore';
import { canonicalSaveRaw } from './canonicalSaveTestDouble';
import type { GameState } from '../content/contracts';

/**
 * R07 legacy migration.
 *
 * Every fixture below is **verbatim output of the frozen baseline
 * `5e41586bc77ad653b2449fb7130b5b6bbf638ead`**, produced by running that
 * commit's own code. Nothing here is a hand-written "expected legacy shape":
 *
 * - `BASELINE_PARTNERSHIPS` came from calling the baseline's real actions
 *   (`join_business_partnership`, `increase_business_stake`,
 *   `sell_business_stake`, `inject_business_capital`, `raise_business_funding`,
 *   `buy_business_stake`) with the baseline's own content and balance config.
 * - `BASELINE_GIGS` came from calling the baseline's real
 *   `advanceCareerLifecycle()` (the daily market offer) and its real
 *   `accept_application_offer` path.
 *
 * The generator that produced them lives in the baseline worktree at
 * `scripts/review-fixtures.ts` and is reproduced in the review package; it is
 * review tooling, not part of this repository. The point of the freeze is that
 * the migration is tested against records the *old code* really wrote, not
 * against this commit's idea of what those records look like.
 */

const ONLINE_STORE = 'business.online-store';
const CONSULTING = 'business.consulting-studio';
const KIOSK = 'business.seed-kiosk';

/** Verbatim baseline output: `join_business_partnership` then nothing. */
const BASELINE_PARTNERSHIPS = {
  onlineStoreUntouched: {
    businessId: ONLINE_STORE, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 4200, capitalInvested: 0, equityPercent: 50, publicFloatPercent: 0,
    fundingRaised: 0, fundingRound: 0, partnerCharacterId: 'character.seed-zhou',
    playerCostBasis: { kind: 'known', value: 4200 },
  },
  /** `increase_business_stake` 20%: the share moves, the entry price does not. */
  onlineStoreIncreased: {
    businessId: ONLINE_STORE, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 4200, capitalInvested: 0, equityPercent: 70, publicFloatPercent: 0,
    fundingRaised: 0, fundingRound: 0, partnerCharacterId: 'character.seed-zhou',
    playerCostBasis: { kind: 'known', value: 4828 },
  },
  consultingUntouched: {
    businessId: CONSULTING, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 12000, capitalInvested: 0, equityPercent: 60, publicFloatPercent: 0,
    fundingRaised: 0, fundingRound: 0, partnerCharacterId: 'character.guqing',
    playerCostBasis: { kind: 'known', value: 12000 },
  },
  /** `sell_business_stake` 10%: still the same initial entry price on record. */
  consultingDecreased: {
    businessId: CONSULTING, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 12000, capitalInvested: 0, equityPercent: 50, publicFloatPercent: 0,
    fundingRaised: 0, fundingRound: 0, partnerCharacterId: 'character.guqing',
    playerCostBasis: { kind: 'known', value: 10000 },
  },
  /** `increase_business_stake` + `inject_business_capital` 5000. */
  consultingCapitalAndIncrease: {
    businessId: CONSULTING, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 12000, capitalInvested: 5000, equityPercent: 70, publicFloatPercent: 0,
    fundingRaised: 0, fundingRound: 0, partnerCharacterId: 'character.guqing',
    playerCostBasis: { kind: 'known', value: 17897 },
  },
  /** `raise_business_funding`: dilution plus money raised. */
  consultingDilutedByFunding: {
    businessId: CONSULTING, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
    purchasePrice: 12000, capitalInvested: 0, equityPercent: 40, publicFloatPercent: 20,
    fundingRaised: 18000, fundingRound: 1, partnerCharacterId: 'character.guqing',
    playerCostBasis: { kind: 'known', value: 12000 },
  },
} as const;

/** Verbatim baseline output of `buy_business_stake` 30% of the seed kiosk. */
const BASELINE_MINORITY_STAKE = {
  businessId: KIOSK, priceLevel: 1, wageLevel: 1, inventoryLevel: 1,
  purchasePrice: 3200, capitalInvested: 0, equityPercent: 30, publicFloatPercent: 0,
  fundingRaised: 0, fundingRound: 0,
  playerCostBasis: { kind: 'known', value: 960 },
} as const;

/**
 * Verbatim baseline gig records. The market offers were written with
 * minute-of-day values (`18 * 60`) by the baseline's own daily lifecycle, and the
 * accepted offers with the acceptance-time clock (`14 * 60`, and `23 * 60` for
 * the shift that runs over midnight and therefore ends at `1620`).
 */
const BASELINE_GIGS = {
  marketDay1: {
    id: 'gig.offer.job.delivery-shift.1', jobId: 'job.delivery-shift',
    validFromDay: 1, expiresDay: 7, executableDay: 1,
    startMinute: 1080, endMinute: 1320, pay: 76, source: '工作市场',
  },
  marketDay40: {
    id: 'gig.offer.job.delivery-shift.40', jobId: 'job.delivery-shift',
    validFromDay: 40, expiresDay: 46, executableDay: 40,
    startMinute: 1080, endMinute: 1320, pay: 76, source: '工作市场',
  },
  acceptedDay40: {
    id: 'gig.app.gig.fixture', jobId: 'job.delivery-shift',
    validFromDay: 40, expiresDay: 46, executableDay: 40,
    startMinute: 840, endMinute: 1080, pay: 76, source: 'company.fixture-market',
  },
  /** `accept_application_offer` at 23:00: 第 40 天 23:00–第 41 天 03:00. */
  acceptedCrossMidnightDay40: {
    id: 'gig.app.gig.fixture-late', jobId: 'job.delivery-shift',
    validFromDay: 40, expiresDay: 46, executableDay: 40,
    startMinute: 1380, endMinute: 1620, pay: 76, source: 'company.fixture-market',
  },
} as const;

/** A baseline save: current schema version, no `companyValuationBasis` anywhere. */
interface LegacySaveOverrides { time?: GameState['time']; calendar?: GameState['calendar']; cash?: number; gigs?: unknown[]; businesses?: Record<string, unknown> }

function legacySave(extra: LegacySaveOverrides = {}): string {
  return JSON.stringify({
    // Baseline `5e41586` wrote saves at the then-current schema version while its
    // business actions never wrote the basis field, so a real legacy save is
    // exactly: current version, missing basis.
    version: balanceConfig.saveVersion,
    contentVersion: balanceConfig.contentVersion,
    time: { day: 40, hour: 10, minute: 0 },
    calendar: calendarForDay(40),
    cash: 100_000,
    ...extra,
  });
}

function loadLegacy(extra: LegacySaveOverrides) {
  localStorage.setItem(SAVE_KEY, legacySave(extra));
  return createGameStore(contentRegistry, balanceConfig).getState().game;
}

beforeEach(() => {
  localStorage.clear();
});

describe('the frozen baseline content is what this migration is keyed to', () => {
  it('still declares the partnership prices the fixtures were written against', () => {
    const expected = {
      [ONLINE_STORE]: { price: 7800, entryPrice: 4200, equityPercent: 50, partnerCharacterId: 'character.seed-zhou' },
      [CONSULTING]: { price: 24000, entryPrice: 12000, equityPercent: 60, partnerCharacterId: 'character.guqing' },
    };
    for (const [businessId, values] of Object.entries(expected)) {
      const business = contentRegistry.businesses.find((entry) => entry.id === businessId)!;
      expect(business.price, businessId).toBe(values.price);
      expect(business.partnership).toMatchObject({
        entryPrice: values.entryPrice,
        playerEquityPercent: values.equityPercent,
        characterId: values.partnerCharacterId,
      });
    }
  });
});

describe('a baseline partnership migration restores the whole-company value', () => {
  it.each([
    { label: 'untouched', holding: BASELINE_PARTNERSHIPS.onlineStoreUntouched, businessId: ONLINE_STORE, basis: 7800, equity: 50 },
    { label: 'after 增持 to 70%', holding: BASELINE_PARTNERSHIPS.onlineStoreIncreased, businessId: ONLINE_STORE, basis: 7800, equity: 70 },
    { label: 'untouched', holding: BASELINE_PARTNERSHIPS.consultingUntouched, businessId: CONSULTING, basis: 24000, equity: 60 },
    { label: 'after 减持 to 50%', holding: BASELINE_PARTNERSHIPS.consultingDecreased, businessId: CONSULTING, basis: 24000, equity: 50 },
  ])('recovers $businessId $label', ({ holding, businessId, basis, equity }) => {
    const game = loadLegacy({ businesses: { [businessId]: structuredClone(holding) } });
    const migrated = game.businesses[businessId];

    expect(migrated.companyValuationBasis).toBe(basis);
    expect(migrated.companyValuationBasisSource).toBe('official-partnership');
    expect(businessValuationBasis(migrated)).toBe(basis);
    // Never the entry price scaled by the share a second time: the old basis was
    // `purchasePrice`, which produced exactly this wrong figure.
    const oldBasis = Number(holding.purchasePrice);
    expect(migrated.companyValuationBasis).not.toBe(oldBasis);
    expect(businessValuationBasis(migrated)).toBeGreaterThan(businessValuationBasis({ ...migrated, companyValuationBasis: oldBasis }));
    expect(migrated.equityPercent).toBe(equity);
    expect(businessValuationBasisNeedsReview(migrated as unknown as Record<string, unknown>, businessId, contentRegistry)).toBe(false);
  });

  it('keeps capital and funding each counted exactly once', () => {
    const withCapital = loadLegacy({ businesses: { [CONSULTING]: structuredClone(BASELINE_PARTNERSHIPS.consultingCapitalAndIncrease) } }).businesses[CONSULTING];
    expect(withCapital.companyValuationBasis).toBe(24000);
    expect(businessValuationBasis(withCapital)).toBe(24000 + 5000);

    const withFunding = loadLegacy({ businesses: { [CONSULTING]: structuredClone(BASELINE_PARTNERSHIPS.consultingDilutedByFunding) } }).businesses[CONSULTING];
    expect(withFunding.companyValuationBasis).toBe(24000);
    expect(withFunding.fundingRaised).toBe(18000);
    expect(businessValuationBasis(withFunding)).toBe(24000 + 18000);
  });

  it('never rewrites the cost side of the old trade', () => {
    const holding = structuredClone(BASELINE_PARTNERSHIPS.onlineStoreIncreased);
    const game = loadLegacy({ businesses: { [ONLINE_STORE]: holding } });
    const migrated = game.businesses[ONLINE_STORE];

    // Cash, purchase price, cost basis, equity and the partner identity are
    // preserved verbatim: the migration adds no charge and refunds nothing.
    expect(game.cash).toBe(100_000);
    expect(migrated.purchasePrice).toBe(4200);
    expect(migrated.playerCostBasis).toEqual({ kind: 'known', value: 4828 });
    expect(migrated.equityPercent).toBe(70);
    expect(migrated.partnerCharacterId).toBe('character.seed-zhou');
    expect(migrated.capitalInvested).toBe(0);
  });

  it('keeps a minority stake exactly as the baseline recorded it', () => {
    // The negative control: a 30% stake's `purchasePrice` already *is* the
    // whole-company price, so it must be kept — proof that the partnership rule
    // is keyed to the authored partnership, not to "anything with a share".
    const game = loadLegacy({ businesses: { [KIOSK]: structuredClone(BASELINE_MINORITY_STAKE) } });
    const migrated = game.businesses[KIOSK];
    expect(migrated.companyValuationBasis).toBe(3200);
    expect(migrated.playerCostBasis).toEqual({ kind: 'known', value: 960 });
    expect(migrated.equityPercent).toBe(30);
    expect(businessValuationBasisNeedsReview(migrated as unknown as Record<string, unknown>, KIOSK, contentRegistry)).toBe(false);
  });

  it('is idempotent across a reload, a re-save and a re-migration', () => {
    const businesses = {
      [ONLINE_STORE]: structuredClone(BASELINE_PARTNERSHIPS.onlineStoreUntouched),
      [CONSULTING]: structuredClone(BASELINE_PARTNERSHIPS.consultingUntouched),
    };
    const first = loadLegacy({ businesses });
    const second = loadLegacy({ businesses: first.businesses as unknown as Record<string, unknown> });
    const third = loadLegacy({ businesses: second.businesses as unknown as Record<string, unknown> });

    expect(second.businesses[ONLINE_STORE]).toEqual(first.businesses[ONLINE_STORE]);
    expect(third.businesses[ONLINE_STORE]).toEqual(first.businesses[ONLINE_STORE]);
    expect(second.businesses[ONLINE_STORE].companyValuationBasis).toBe(7800);
    expect(second.businesses[CONSULTING].companyValuationBasis).toBe(24000);
  });

  it('survives the canonical save path without the test writing the save itself', async () => {
    // The migration must reach storage through the real writer: this test only
    // waits for that write, it never repairs the save by hand. The payload is
    // read back from the canonical record, which the window itself committed.
    localStorage.setItem(SAVE_KEY, legacySave({ businesses: { [ONLINE_STORE]: structuredClone(BASELINE_PARTNERSHIPS.onlineStoreUntouched) } }));
    const store = createGameStore(contentRegistry, balanceConfig);
    expect(store.getState().game.businesses[ONLINE_STORE].companyValuationBasis).toBe(7800);

    // A real action persists the migrated state through the canonical writer.
    expect(store.getState().dispatch({ type: 'set_simulation_speed', speed: 1 })).toBe(true);
    await store.getState().flushSaveAsync();

    const persisted = JSON.parse(canonicalSaveRaw()!) as { businesses: Record<string, { companyValuationBasis?: number; companyValuationBasisSource?: string; purchasePrice?: number; equityPercent?: number }> };
    expect(persisted.businesses[ONLINE_STORE].companyValuationBasis).toBe(7800);
    expect(persisted.businesses[ONLINE_STORE].companyValuationBasisSource).toBe('official-partnership');

    const reloaded = createGameStore(contentRegistry, balanceConfig).getState().game;
    expect(reloaded.businesses[ONLINE_STORE].companyValuationBasis).toBe(7800);
    expect(reloaded.businesses[ONLINE_STORE].purchasePrice).toBe(4200);
    expect(reloaded.businesses[ONLINE_STORE].equityPercent).toBe(50);
  });
});

describe('a partnership the content cannot prove stays flagged after migration', () => {
  const unprovable = [
    { label: 'a different partner', holding: { ...structuredClone(BASELINE_PARTNERSHIPS.onlineStoreUntouched), partnerCharacterId: 'character.someone-else' } },
    { label: 'an entry price the content does not declare', holding: { ...structuredClone(BASELINE_PARTNERSHIPS.onlineStoreUntouched), purchasePrice: 4999 } },
    { label: 'a stake with no share', holding: { ...structuredClone(BASELINE_PARTNERSHIPS.onlineStoreUntouched), equityPercent: 0 } },
  ];

  it.each(unprovable)('flags $label before the migration', ({ holding }) => {
    expect(businessValuationBasisNeedsReview(structuredClone(holding) as unknown as Record<string, unknown>, ONLINE_STORE, contentRegistry)).toBe(true);
  });

  it.each(unprovable)('keeps $label flagged *after* the migration and a reload', ({ holding }) => {
    // The defect: the migration wrote a finite `companyValuationBasis`, and the
    // next read treated any finite number as a trustworthy basis, so the "needs
    // review" state vanished on first load. The provenance is persisted, so the
    // flag survives the migration, the save and a re-migration.
    const first = loadLegacy({ businesses: { [ONLINE_STORE]: structuredClone(holding) as never } });
    const migrated = first.businesses[ONLINE_STORE];
    expect(migrated.purchasePrice).toBe(holding.purchasePrice);
    expect(migrated.companyValuationBasis).toBe(holding.purchasePrice);
    expect(migrated.companyValuationBasisSource).toBe('unverified');
    expect(businessValuationBasisNeedsReview(migrated as unknown as Record<string, unknown>, ONLINE_STORE, contentRegistry)).toBe(true);

    const afterReload = loadLegacy({ businesses: first.businesses as unknown as Record<string, unknown> });
    expect(afterReload.businesses[ONLINE_STORE].companyValuationBasisSource).toBe('unverified');
    expect(businessValuationBasisNeedsReview(afterReload.businesses[ONLINE_STORE] as unknown as Record<string, unknown>, ONLINE_STORE, contentRegistry)).toBe(true);

    // …and a re-run of the migration over its own output does not clear it either.
    const afterSecondMigration = loadLegacy({ businesses: afterReload.businesses as unknown as Record<string, unknown> });
    expect(businessValuationBasisNeedsReview(afterSecondMigration.businesses[ONLINE_STORE] as unknown as Record<string, unknown>, ONLINE_STORE, contentRegistry)).toBe(true);
  });
});

describe('baseline gig records are migrated into the absolute-minute window', () => {
  it('converts a minute-of-day market offer onto the day it belongs to', () => {
    // The baseline wrote `startMinute: 1080` for a gig offered on day 40, which
    // means 18:00 *on day 40*. Read as absolute minutes that is day 1, so the new
    // reader saw an already-expired shift and the player lost a gig they had
    // legitimately taken.
    const game = loadLegacy({ gigs: [structuredClone(BASELINE_GIGS.marketDay40)] as never });
    const [gig] = game.gigs ?? [];
    expect(gig.startMinute).toBe((40 - 1) * 1440 + 18 * 60);
    expect(gig.endMinute).toBe((40 - 1) * 1440 + 22 * 60);
    expect(gig.executableDay).toBe(40);
    expect(gig.workedMinutes).toBe(0);
  });

  it('converts an accepted offer onto its acceptance day', () => {
    const game = loadLegacy({ gigs: [structuredClone(BASELINE_GIGS.acceptedDay40)] as never });
    const [gig] = game.gigs ?? [];
    expect(gig.startMinute).toBe((40 - 1) * 1440 + 14 * 60);
    expect(gig.endMinute).toBe((40 - 1) * 1440 + 18 * 60);
  });

  it('converts a baseline window that crosses midnight instead of reading its end as absolute minutes', () => {
    // The baseline accepted this shift at 23:00 and wrote the minute of the day
    // plus the hours: `1380 / 1620`. An end minute past 1440 therefore proves
    // nothing — a cross-midnight window is still minute-of-day. Read as absolute
    // minutes it was an instant on day 1, so the shift the player had taken was
    // cleared as already past and paid nothing.
    const record = structuredClone(BASELINE_GIGS.acceptedCrossMidnightDay40);
    const game = loadLegacy({ time: { day: 40, hour: 23, minute: 0 }, calendar: calendarForDay(40), gigs: [record] as never });
    const [gig] = game.gigs ?? [];
    expect(gig.startMinute).toBe((40 - 1) * 1440 + 23 * 60);
    expect(gig.endMinute).toBe((40 - 1) * 1440 + 27 * 60); // 第 41 天 03:00
    expect(gig.executableDay).toBe(40);
    expect(gig.workedMinutes).toBe(0);

    // …and the converted window is a real, workable shift rather than a record the
    // engine reads as already over: the player works it in full.
    const workable = {
      ...game,
      simulationMode: 'running' as const,
      currentJobId: undefined,
      employment: undefined,
      eventsToday: balanceConfig.eventDailyLimit,
    };
    const worked = dispatchGameAction(workable, { type: 'execute_gig', gigId: gig.id }, contentRegistry, balanceConfig);
    expect(worked.error).toBeUndefined();
    expect(worked.state.gigs).toEqual([]);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 76, detail: '零工按实际工时结算 4 小时' }));
  });

  it('leaves a cross-midnight window alone when it is converted a second time', () => {
    // The conversion is driven by evidence in the record, so re-running the
    // migration over its own output — which now carries absolute minutes — must
    // not shift the window again.
    const first = loadLegacy({ gigs: [structuredClone(BASELINE_GIGS.acceptedCrossMidnightDay40)] as never });
    const [converted] = first.gigs ?? [];
    expect(converted.startMinute).toBe((40 - 1) * 1440 + 23 * 60);

    const second = loadLegacy({ gigs: [structuredClone(converted)] as never });
    expect(second.gigs?.[0]?.startMinute).toBe((40 - 1) * 1440 + 23 * 60);
    expect(second.gigs?.[0]?.endMinute).toBe((40 - 1) * 1440 + 27 * 60);
    expect(second.gigs?.[0]?.workedMinutes).toBe(0);
  });

  it('keeps a shift that was started before the save was written', () => {
    // 开工 is state, not a transient observation: a save written mid-shift must be
    // read back as the same shift in progress, otherwise the reload would leave the
    // hours unworkable and the fee unearned.
    const startedMinute = (40 - 1) * 1440 + 18 * 60;
    const inProgress = {
      ...structuredClone(BASELINE_GIGS.marketDay40),
      startMinute: (40 - 1) * 1440 + 18 * 60,
      endMinute: (40 - 1) * 1440 + 22 * 60,
      workedMinutes: 60,
      startedMinute,
    };
    const game = loadLegacy({ gigs: [inProgress] as never });
    expect(game.gigs?.[0]).toMatchObject({ startMinute: startedMinute, workedMinutes: 60, startedMinute });
  });

  it('does not hand a converted legacy record a started shift it never had', () => {
    // The baseline had no 开工 state, so a record that had to be converted is an
    // offered window: the clock must not work it until the player takes it on.
    const game = loadLegacy({ gigs: [structuredClone(BASELINE_GIGS.acceptedCrossMidnightDay40)] as never });
    expect(game.gigs?.[0]?.startedMinute).toBeUndefined();
  });

  it('converts a day-1 window instead of assuming it is already canonical', () => {
    // A day-1 window reads the same either way, but it is still a legacy record:
    // the conversion is driven by the record's shape, not by the day it happens
    // to sit on, so a converted save can never be converted twice.
    const game = loadLegacy({ time: { day: 1, hour: 9, minute: 0 }, calendar: calendarForDay(1), gigs: [structuredClone(BASELINE_GIGS.marketDay1)] as never });
    const [gig] = game.gigs ?? [];
    expect(gig.startMinute).toBe(1080);
    expect(gig.endMinute).toBe(1320);
    expect(gig.workedMinutes).toBe(0);
  });

  it('does not convert an already-canonical record a second time', () => {
    // Current code stamps `workedMinutes`, so a window that was once converted
    // (or written by the new code) is never shifted again.
    const canonical = { ...structuredClone(BASELINE_GIGS.marketDay40), workedMinutes: 0 };
    const migrated = loadLegacy({ gigs: [canonical] as never });
    // Still a minute-of-day legacy shape but already stamped: it is taken at face
    // value, which is what a converted record must be.
    expect(migrated.gigs?.[0]?.startMinute).toBe(1080);

    const alreadyAbsolute = { ...structuredClone(BASELINE_GIGS.marketDay40), startMinute: (40 - 1) * 1440 + 18 * 60, endMinute: (40 - 1) * 1440 + 22 * 60, workedMinutes: 120 };
    const roundTripped = loadLegacy({ gigs: [alreadyAbsolute] as never });
    expect(roundTripped.gigs?.[0]?.startMinute).toBe((40 - 1) * 1440 + 18 * 60);
    // The hours stay out of `workedMinutes`: this record has no start behind them,
    // and an earlier build credited them passively. Keeping them traceable is fine,
    // paying them — now or after a later 开工 — is not.
    expect(roundTripped.gigs?.[0]?.workedMinutes).toBe(0);
    expect(roundTripped.gigs?.[0]?.unverifiedWorkedMinutes).toBe(120);
  });

  it('keeps passively credited hours out of pay when the player starts the shift afterwards', () => {
    // The rule the reviewer fixed for round 6: hours with no start record never
    // become wages, and 开工 must not drag them into the settlement.
    const alreadyAbsolute = {
      ...structuredClone(BASELINE_GIGS.marketDay40),
      startMinute: (40 - 1) * 1440 + 18 * 60,
      endMinute: (40 - 1) * 1440 + 22 * 60,
      workedMinutes: 120,
    };
    const game = loadLegacy({ time: { day: 40, hour: 20, minute: 0 }, calendar: calendarForDay(40), gigs: [alreadyAbsolute] as never });
    const [gig] = game.gigs ?? [];
    expect(gig.workedMinutes).toBe(0);
    expect(gig.unverifiedWorkedMinutes).toBe(120);

    // Start the shift at 20:00 and work the remaining two hours: two hours are
    // paid, not the four the record's stale counter suggested.
    const workable = {
      ...game,
      simulationMode: 'running' as const,
      currentJobId: undefined,
      employment: undefined,
      eventsToday: balanceConfig.eventDailyLimit,
    };
    const worked = dispatchGameAction(workable, { type: 'execute_gig', gigId: gig.id }, contentRegistry, balanceConfig);
    expect(worked.error).toBeUndefined();
    expect(worked.state.gigs).toEqual([]);
    expect(worked.state.lifeHistory).toContainEqual(expect.objectContaining({ title: '完成同城配送', amount: 38, detail: '零工按实际工时结算 2 小时' }));
  });

  it('pays nothing for passively credited hours when the window closes unstarted', () => {
    const alreadyAbsolute = {
      ...structuredClone(BASELINE_GIGS.marketDay40),
      startMinute: (40 - 1) * 1440 + 18 * 60,
      endMinute: (40 - 1) * 1440 + 22 * 60,
      workedMinutes: 120,
    };
    const game = loadLegacy({ time: { day: 40, hour: 22, minute: 10 }, calendar: calendarForDay(40), gigs: [alreadyAbsolute] as never });
    const workable = {
      ...game,
      simulationMode: 'running' as const,
      currentJobId: undefined,
      employment: undefined,
      eventsToday: balanceConfig.eventDailyLimit,
    };
    const [gig] = workable.gigs ?? [];
    const settled = dispatchGameAction(workable, { type: 'execute_gig', gigId: gig.id }, contentRegistry, balanceConfig);
    // Committed cleanup, not an error: the window is simply over.
    expect(settled.error).toBeUndefined();
    expect(settled.state.gigs).toEqual([]);
    expect(settled.state.cash).toBe(workable.cash);
    expect(settled.state.lifeHistory).toContainEqual(expect.objectContaining({ id: `life.gig.missed.${gig.id}`, title: '错过同城配送' }));
  });

  it('drops records whose job no longer exists and those that already expired', () => {
    const game = loadLegacy({
      gigs: [
        structuredClone(BASELINE_GIGS.marketDay40),
        { ...structuredClone(BASELINE_GIGS.marketDay40), id: 'gig.unknown', jobId: 'job.that-does-not-exist' },
        { ...structuredClone(BASELINE_GIGS.marketDay1), id: 'gig.expired', expiresDay: 7 },
      ] as never,
    });
    expect((game.gigs ?? []).map((gig) => gig.id)).toEqual(['gig.offer.job.delivery-shift.40']);
  });
});
