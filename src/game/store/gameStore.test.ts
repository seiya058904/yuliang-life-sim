import { describe, expect, it, beforeEach } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import { createGameStore, loadGameState, saveGameState } from './gameStore';

describe('game store persistence', () => {
  beforeEach(() => localStorage.clear());

  it('persists the exact minute and restores the current schedule activity', () => {
    const balance = mergeBalanceConfig({ eventDailyLimit: 0 });
    const first = createGameStore(contentRegistry, balance, 1);
    first.getState().dispatch({ type: 'start_week' });
    first.getState().dispatch({ type: 'advance_simulation', minutes: 386 });
    const persisted = loadGameState(contentRegistry, balance);

    expect(persisted.time).toEqual({ day: 1, hour: 14, minute: 26 });
    expect(persisted.currentActivity?.kind).toBe('work');
    expect(persisted.simulationMode).toBe('paused');
  });

  it('migrates an old hour-only save without losing the world state', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 0, time: { day: 3, hour: 14 }, weeklyPlan: undefined, simulationMode: undefined }));
    const restored = loadGameState(contentRegistry, balanceConfig);
    expect(restored.time).toEqual({ day: 3, hour: 14, minute: 0 });
    expect(restored.calendar.week).toBe(1);
    expect(restored.weeklyPlan.days[3]).toBeDefined();
  });

  it('migrates an old save without life history to the current version while preserving time and pausing', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    const oldSave = { ...state, version: 1, time: { day: 9, hour: 17, minute: 42 }, simulationMode: 'running' };
    delete (oldSave as Partial<typeof oldSave>).lifeHistory;
    localStorage.setItem('yuliang-save-v1', JSON.stringify(oldSave));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.version).toBe(balanceConfig.saveVersion);
    expect(restored.time).toEqual({ day: 9, hour: 17, minute: 42 });
    expect(restored.simulationMode).toBe('paused');
    expect(restored.lifeHistory).toEqual([]);
  });

  it('migrates tagged career progress and removes unknown progression ids', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 1, time: { day: 11, hour: 9, minute: 17 }, simulationMode: 'running', careerExperience: { office: 21, hacked: 999 }, qualifications: ['office_basics', 'unknown'] }));
    const restored = loadGameState(contentRegistry, balanceConfig);
    expect(restored.time).toEqual({ day: 11, hour: 9, minute: 17 });
    expect(restored.simulationMode).toBe('paused');
    expect(restored.careerExperience).toEqual({ office: 21 });
    expect(restored.qualifications).toEqual(['office_basics']);
  });

  it('preserves qualifications issued by official courses while removing unknown ids', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({
      ...state,
      version: 1,
      qualifications: ['qualification.workplace-basics', 'qualification.unknown'],
    }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.qualifications).toEqual(['qualification.workplace-basics']);
  });

  it('migrates subscription records and removes subscriptions from unknown content', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 3, activeSubscriptions: {
      'subscription.mobile-basic': { subscriptionId: 'subscription.mobile-basic', startedDay: 6 },
      'subscription.unknown': { subscriptionId: 'subscription.unknown', startedDay: 6 },
    } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.version).toBe(balanceConfig.saveVersion);
    expect(restored.activeSubscriptions).toEqual({ 'subscription.mobile-basic': { subscriptionId: 'subscription.mobile-basic', startedDay: 6 } });
  });

  it('migrates wishlist ids and removes goals for unknown items', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 3, wishlist: ['item.seed-phone', 'item.unknown'] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.wishlist).toEqual(['item.seed-phone']);
  });

  it('adds newly official vehicles to the discoverable asset list when loading an old save', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 1, unlockedAssetIds: ['asset.unknown'] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.unlockedAssetIds).toEqual([
      'asset.used-compact',
      'asset.city-sedan',
      'asset.city-ev',
      'asset.quality-sedan',
      'asset.city-suv',
      'asset.executive-sedan',
    ]);
  });

  it('migrates old business holdings with independent capital and equity defaults', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 4, businesses: {
      'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200 },
    } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.businesses['business.seed-kiosk']).toMatchObject({ capitalInvested: 0, equityPercent: 100, publicFloatPercent: 0, fundingRaised: 0, fundingRound: 0 });

    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 4, businesses: {
      'business.seed-kiosk': { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 65, listed: true, listedDay: 8 },
    } }));
    expect(loadGameState(contentRegistry, balanceConfig).businesses['business.seed-kiosk']).toMatchObject({ equityPercent: 65, publicFloatPercent: 35, listed: true, listedDay: 8 });
  });

  it('filters completed business projects against current activity content', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, completedBusinessProjects: ['activity.brand-film-project.contract', 'activity.unknown.contract'] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.completedBusinessProjects).toEqual(['activity.brand-film-project.contract']);
  });

  it('keeps valid annual records while dropping malformed entries during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, annualHistory: [
      { year: 1, cashStart: 1000, cashEnd: 1200, netWorthStart: 1000, netWorthEnd: 1400, totalIncome: 500, totalConsumption: 300, months: 12 },
      { year: 2, cashStart: 'invalid' },
    ] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.annualHistory).toEqual([{ year: 1, cashStart: 1000, cashEnd: 1200, netWorthStart: 1000, netWorthEnd: 1400, totalIncome: 500, totalConsumption: 300, months: 12 }]);
  });

  it('keeps valid wealth milestones and removes malformed or unknown tiers during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 4, wealthMilestones: [
      { id: 'savings', day: 28, netWorth: 12000 },
      { id: 'unknown', day: 30, netWorth: 20000 },
      { id: 'stable', day: 0, netWorth: 100000 },
      { id: 'abundant', day: 337, netWorth: 'invalid' },
    ] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.wealthMilestones).toEqual([{ id: 'savings', day: 28, netWorth: 12000 }]);
  });

  it('keeps a valid mortgage only for the owned current home and removes stale debt', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    const validMortgage = { housingId: 'housing.seed-room', remainingPrincipal: 4350, monthlyPayment: 199, totalMonths: 24, paidMonths: 2 };
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, housing: { housingId: 'housing.seed-room', mode: 'owned' }, mortgage: validMortgage }));
    expect(loadGameState(contentRegistry, balanceConfig).mortgage).toEqual(validMortgage);

    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, mortgage: { ...validMortgage, housingId: 'housing.unknown' } }));
    expect(loadGameState(contentRegistry, balanceConfig).mortgage).toBeUndefined();
  });

  it('migrates known housing holdings and drops current or unknown properties', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 6, housingHoldings: {
      'housing.seed-room': { housingId: 'housing.seed-room', purchasePrice: 5800, currentValuation: 5900, occupancy: 'rented' },
      'housing.shared-room': { housingId: 'housing.shared-room', purchasePrice: 2000, currentValuation: 2000, occupancy: 'vacant' },
      'housing.unknown': { housingId: 'housing.unknown', purchasePrice: 100, currentValuation: 100, occupancy: 'rented' },
    } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.housingHoldings).toEqual({ 'housing.seed-room': { housingId: 'housing.seed-room', purchasePrice: 5800, currentValuation: 5900, occupancy: 'rented' } });
  });

  it('keeps valid world snapshots and removes malformed or unknown-job entries during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, worldHistory: [
      { year: 1, day: 337, netWorth: 12000, businessCount: 1, listedBusinessCount: 1, publicFloatPercent: 35, relationshipCount: 2, visitedLocationCount: 3, relationshipValues: { 'character.seed-zhou': 42, 'character.unknown': 9, 'character.seed-lin': -1 }, characterCareerStates: { 'character.seed-lin': '远望零售 · 门店员工', 'character.unknown': '不应保留' }, companyStates: { 'company.yuanwang': '持续经营', 'company.unknown': '不应保留' }, locationDevelopment: { 'location.central': 2, 'location.unknown': 4, 'location.riverside': 9 }, currentJobId: 'job.seed-shop-clerk' },
      { year: 2, day: 0, netWorth: 'invalid', businessCount: 1, relationshipCount: 1, visitedLocationCount: 1 },
      { year: 3, day: 1000, netWorth: 20000, businessCount: 2, relationshipCount: 1, visitedLocationCount: 2, currentJobId: 'job.unknown' },
    ] }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.worldHistory).toEqual([{ year: 1, day: 337, netWorth: 12000, businessCount: 1, listedBusinessCount: 1, publicFloatPercent: 35, relationshipCount: 2, visitedLocationCount: 3, relationshipValues: { 'character.seed-zhou': 42 }, characterCareerStates: { 'character.seed-lin': '远望零售 · 门店员工' }, companyStates: { 'company.yuanwang': '持续经营' }, locationDevelopment: { 'location.central': 2 }, currentJobId: 'job.seed-shop-clerk' }]);
  });

  it('keeps known location visits and removes unknown location ids during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, locationVisits: { 'location.central': 2, 'location.unknown': 4, 'location.riverside': 0 }, locationDevelopment: { 'location.central': 3, 'location.unknown': 7, 'location.riverside': -1 } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.locationVisits).toEqual({ 'location.central': 2 });
    expect(restored.locationDevelopment).toEqual({ 'location.central': 3 });
  });

  it('keeps bounded interest familiarity during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, interestFamiliarity: { film: 2, photography: 4, '': -1 } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.interestFamiliarity).toEqual({ film: 2 });
  });

  it('keeps valid storyline stages and removes unknown storyline state during migration', () => {
    const state = createGameStore(contentRegistry, balanceConfig, 1).getState().game;
    localStorage.setItem('yuliang-save-v1', JSON.stringify({ ...state, version: 5, storylineStages: {
      'storyline.seed-career': 'consider',
      'storyline.remote-connection': 'follow-up',
      'storyline.unknown': 'anything',
      'storyline.remote-connection-bad': 'follow-up',
    } }));

    const restored = loadGameState(contentRegistry, balanceConfig);

    expect(restored.storylineStages).toEqual({ 'storyline.seed-career': 'consider', 'storyline.remote-connection': 'follow-up' });
  });

  it('does not persist animation-only effect data as authoritative state', () => {
    const store = createGameStore(contentRegistry, balanceConfig, 1);
    const state = store.getState().game;
    saveGameState(state);
    expect(localStorage.getItem('yuliang-save-v1')).not.toContain('progress');
  });
});
