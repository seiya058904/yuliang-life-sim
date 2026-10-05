import { describe, expect, it } from 'vitest';
import { balanceConfig, mergeBalanceConfig } from '../balance/config';
import { contentRegistry } from '../content/registry';
import type { GameEffect } from '../content/contracts';
import { createInitialState } from './initialState';
import { closeMonth } from './monthlySettlement';
import { fixedMonthBudget, mortgagePayment } from './settlementMath';
import { forecastWeeklyPlan } from './forecast';
import { calendarForDay } from './calendar';

describe('annual world snapshots', () => {
  it('records the first achieved wealth tier at month close and keeps it in life history', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 12_000;
    state.time = { day: 28, hour: 8, minute: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.wealthMilestones).toEqual([{ id: 'savings', day: 28, netWorth: 12_000 }]);
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ category: 'event', title: '财富阶段：有积蓄', sourceId: 'savings', amount: 12_000 }));
    expect(effects).toContainEqual({ type: 'message', text: '财富阶段达到：有积蓄' });
  });

  it('charges a mortgage installment, reduces principal, and records the housing cost', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 10_000;
    state.time = { day: 28, hour: 8, minute: 0 };
    state.housing = { housingId: 'housing.seed-room', mode: 'owned' };
    state.mortgage = { housingId: 'housing.seed-room', remainingPrincipal: 4_350, monthlyPayment: 199, totalMonths: 24, paidMonths: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.cash).toBe(9_801);
    expect(state.mortgage).toMatchObject({ remainingPrincipal: 4168, paidMonths: 1 });
    expect(state.lastFinancialSummary?.consumption.categories).toMatchObject({ housing: 199 });
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '住房分期还款', category: 'housing', amount: -199 }));
  });

  it.each([183, 1_000])('settles the final installment for cash %i using the actual amount everywhere', (cash) => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    state.cash = cash;
    state.time = { day: 28, hour: 8, minute: 0 };
    state.calendar = calendarForDay(28);
    state.housing = { housingId: 'housing.seed-room', mode: 'owned' };
    state.mortgage = { housingId: 'housing.seed-room', remainingPrincipal: 182, monthlyPayment: 199, totalMonths: 24, paidMonths: 23 };
    const before = structuredClone(state);
    const withoutMortgage = structuredClone(state);
    delete withoutMortgage.mortgage;

    expect(mortgagePayment(state)).toBe(183);
    expect(fixedMonthBudget(state, contentRegistry, balanceConfig).mortgage).toBe(183);
    expect(forecastWeeklyPlan(state, state.weeklyPlan, contentRegistry, balanceConfig).expense
      - forecastWeeklyPlan(withoutMortgage, withoutMortgage.weeklyPlan, contentRegistry, balanceConfig).expense).toBe(183);
    expect(state).toEqual(before);

    closeMonth(state, 1, contentRegistry, balanceConfig, []);

    expect(state.cash).toBe(cash - 183);
    expect(state.mortgage).toBeUndefined();
    expect(state.lastFinancialSummary?.consumption.categories.housing).toBe(183);
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '住房分期还款', amount: -183, detail: '偿还本金 ¥182 · 利息 ¥1' }));
    expect(fixedMonthBudget(state, contentRegistry, balanceConfig).mortgage).toBe(0);

    closeMonth(state, 2, contentRegistry, balanceConfig, []);
    expect(state.cash).toBe(cash - 183);
    expect(state.lifeHistory?.filter((entry) => entry.title === '住房分期还款')).toHaveLength(1);
    expect(state.lastFinancialSummary?.consumption.categories.housing ?? 0).toBe(0);
  });

  it('does not charge a final installment when cash is one below the amount due', () => {
    const state = createInitialState(contentRegistry, balanceConfig, 7);
    state.cash = 182;
    state.housing = { housingId: 'housing.seed-room', mode: 'owned' };
    state.mortgage = { housingId: 'housing.seed-room', remainingPrincipal: 182, monthlyPayment: 199, totalMonths: 24, paidMonths: 23 };
    const mortgage = structuredClone(state.mortgage);
    const effects: GameEffect[] = [];

    expect(mortgagePayment(state)).toBe(0);
    expect(fixedMonthBudget(state, contentRegistry, balanceConfig).mortgage).toBe(183);
    closeMonth(state, 1, contentRegistry, balanceConfig, effects);
    expect(state.cash).toBe(182);
    expect(state.mortgage).toEqual(mortgage);
    expect(state.lifeHistory?.some((entry) => entry.title === '住房分期还款')).toBe(false);
    expect(state.lastFinancialSummary?.consumption.categories.housing ?? 0).toBe(0);
    expect(effects).toContainEqual({ type: 'message', text: '现金不足，本月住房分期未扣款' });
  });

  it('settles rent and maintenance for a rented housing holding', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.cash = 20_000;
    state.housingHoldings = { 'housing.seed-room': { housingId: 'housing.seed-room', purchasePrice: 5_800, currentValuation: 5_800, occupancy: 'rented' } };
    state.time = { day: 28, hour: 8, minute: 0 };
    const effects: GameEffect[] = [];

    closeMonth(state, 1, contentRegistry, balanceConfig, effects);

    expect(state.cash).toBe(21_035);
    expect(state.lastFinancialSummary?.income.categories).toMatchObject({ property_income: 1_176 });
    expect(state.lastFinancialSummary?.consumption.categories).toMatchObject({ maintenance: 141 });
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '收到独立单间租金', amount: 1_176 }));
    expect(state.lifeHistory).toContainEqual(expect.objectContaining({ title: '独立单间维护', amount: -141 }));
  });

  it('evolves location development from real business and visit state at year close', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 337, hour: 8, minute: 0 };
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 65, publicFloatPercent: 35, listed: true };
    state.locationVisits = { 'location.central': 3, 'location.riverside': 1 };
    state.relationships['character.seed-zhou'] = 42;
    const effects: GameEffect[] = [];

    closeMonth(state, 12, contentRegistry, balanceConfig, effects);

    expect(state.locationDevelopment).toMatchObject({ 'location.central': 2, 'location.riverside': 0 });
    expect(state.worldHistory?.[0]).toMatchObject({ year: 1, businessCount: 1, listedBusinessCount: 1, publicFloatPercent: 35, visitedLocationCount: 2, locationDevelopment: { 'location.central': 2, 'location.riverside': 0 }, relationshipValues: { 'character.seed-zhou': 42 }, characterCareerStates: { 'character.seed-lin': '远望零售 · 门店员工' }, companyStates: { 'company.yuanwang': '门店与社区零售' } });
  });

  it('credits a relocated business to the city it actually operates in', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 337, hour: 8, minute: 0 };
    // The authored location of the kiosk is 中心区; the player paid to move it.
    const authored = contentRegistry.businesses.find((business) => business.id === 'business.seed-kiosk')!;
    expect(authored.locationId).toBe('location.central');
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 100, relocatedLocationId: 'location.riverside' };
    state.locationVisits = {};
    const effects: GameEffect[] = [];

    closeMonth(state, 12, contentRegistry, balanceConfig, effects);

    expect(state.locationDevelopment).toMatchObject({ 'location.riverside': 1, 'location.central': 0 });
    expect(state.worldHistory?.[0]?.locationDevelopment).toMatchObject({ 'location.riverside': 1, 'location.central': 0 });
  });

  it('archives separately held public business equity in the annual world snapshot', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 337, hour: 8, minute: 0 };
    state.businesses['business.seed-kiosk'] = { businessId: 'business.seed-kiosk', priceLevel: 1, wageLevel: 1, inventoryLevel: 1, purchasePrice: 3200, equityPercent: 65, publicFloatPercent: 35, listed: true, listedDay: 1 };
    state.publicBusinessEquities = { 'business.seed-kiosk': { businessId: 'business.seed-kiosk', percent: 10, investedAmount: 208, purchaseDay: 29 } };
    const effects: GameEffect[] = [];

    closeMonth(state, 12, contentRegistry, balanceConfig, effects);

    expect(state.worldHistory?.[0]?.publicBusinessEquities).toEqual({ 'business.seed-kiosk': { businessId: 'business.seed-kiosk', percent: 10, investedAmount: 208, currentValue: 208 } });
  });

  it('archives a player-triggered company state in the annual world snapshot', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 337, hour: 8, minute: 0 };
    state.flags.xinghe_service_line_launched = true;
    const effects: GameEffect[] = [];

    closeMonth(state, 12, contentRegistry, balanceConfig, effects);

    expect(state.worldHistory?.[0]?.companyStates?.['company.xinghe']).toBe('企业服务线提前启动（玩家参与）');
  });

  it('archives world-coupled branch stages for companies and characters when conditions pass', () => {
    const state = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    state.time = { day: 1344, hour: 8, minute: 0 };
    state.completedEvents = ['event.industrial-hub-upgrade', 'event.city-transit-upgrade'];
    state.flags.xinghe_service_line_launched = true;
    const effects: GameEffect[] = [];

    closeMonth(state, 48, contentRegistry, balanceConfig, effects);

    expect(state.worldHistory?.[0]?.year).toBe(4);
    expect(state.worldHistory?.[0]?.companyStates?.['company.greenfield-education']).toBe('北部转岗培训中心');
    expect(state.worldHistory?.[0]?.characterCareerStates?.['character.seed-lin']).toBe('临江内容工作室 · 联合创始人');

    const plainState = createInitialState(contentRegistry, mergeBalanceConfig({ eventDailyLimit: 0 }), 7);
    plainState.time = { day: 1344, hour: 8, minute: 0 };
    closeMonth(plainState, 48, contentRegistry, balanceConfig, effects);
    expect(plainState.worldHistory?.[0]?.companyStates?.['company.greenfield-education']).toBe('职业培训线扩展');
    expect(plainState.worldHistory?.[0]?.characterCareerStates?.['character.seed-lin']).toBe('星桥电商 · 电商运营助理');
  });
});
