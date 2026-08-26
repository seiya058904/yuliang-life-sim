import type { CapabilityId, GameState, PlayerStage, RewardTier } from '../content/contracts';

export interface BalanceConfig {
  saveVersion: number;
  contentVersion: number;
  initialCash: number;
  initialAbility: number;
  initialReputation: number;
  initialLifestyle: number;
  initialDay: number;
  initialHour: number;
  startingHousingId: string;
  startingHousingMode: 'rent' | 'owned';
  startingCapabilities: readonly CapabilityId[];
  eventBaseMeterPerHour: number;
  eventMeterThreshold: number;
  eventDailyLimit: number;
  eventMajorCooldownDays: number;
  eventMajorMonthlyCap: number;
  eventSoftPityDays: number;
  eventPressurePerDay: number;
  eventAmbientChance: number;
  rentReserveDays: number;
  dailyLivingCost: number;
  dailyTransportCost: number;
  monthlyCommunicationCost: number;
  lifestyleCostFactor: number;
  lifestyleCostFactorCap: number;
  rentReliefCooldownDays: number;
  saleRatioFallback: number;
  businessValuationRatio: number;
  rewardTiers: Record<RewardTier, number>;
  relationshipStageThresholds: readonly number[];
  stageThresholds: Record<PlayerStage, number>;
  vacancyCountRange: readonly [number, number];
  vacancyDurationDays: number;
  applicationCooldownDays: number;
  applicationOfferDurationRange: readonly [number, number];
  applicationMaxActiveFullTime: number;
  applicationMaxSameJob: number;
  competitiveness: { minimum: number; strong: number; exceptional: number; referralBonus: number; internalBonus: number; storyBonus: number };
}

export const balanceConfig: BalanceConfig = {
  saveVersion: 7,
  contentVersion: 1,
  initialCash: 500,
  initialAbility: 10,
  initialReputation: 0,
  initialLifestyle: 10,
  initialDay: 1,
  initialHour: 8,
  startingHousingId: 'housing.shared-room',
  startingHousingMode: 'rent',
  startingCapabilities: [],
  eventBaseMeterPerHour: 0.07,
  eventMeterThreshold: 1,
  eventDailyLimit: 2,
  eventMajorCooldownDays: 7,
  eventMajorMonthlyCap: 3,
  eventSoftPityDays: 10,
  eventPressurePerDay: 0.04,
  eventAmbientChance: 0.005,
  rentReserveDays: 1,
  dailyLivingCost: 4,
  dailyTransportCost: 2,
  monthlyCommunicationCost: 99,
  lifestyleCostFactor: 0.005,
  lifestyleCostFactorCap: 0.5,
  rentReliefCooldownDays: 14,
  saleRatioFallback: 0.5,
  businessValuationRatio: 0.65,
  rewardTiers: { small: 0.55, normal: 1, large: 1.8, milestone: 3 },
  relationshipStageThresholds: [0, 25, 50, 75],
  stageThresholds: { start: 0, growing: 2500, stable: 10000, wealthy: 50000 },
  vacancyCountRange: [8, 12],
  vacancyDurationDays: 28,
  applicationCooldownDays: 28,
  applicationOfferDurationRange: [7, 14],
  applicationMaxActiveFullTime: 3,
  applicationMaxSameJob: 2,
  competitiveness: { minimum: 0.7, strong: 0.9, exceptional: 0.98, referralBonus: 0.1, internalBonus: 0.2, storyBonus: 0.2 },
};

export function mergeBalanceConfig(overrides: Partial<BalanceConfig> = {}): BalanceConfig {
  return { ...balanceConfig, ...overrides, rewardTiers: { ...balanceConfig.rewardTiers, ...overrides.rewardTiers }, stageThresholds: { ...balanceConfig.stageThresholds, ...overrides.stageThresholds }, competitiveness: { ...balanceConfig.competitiveness, ...overrides.competitiveness } };
}
