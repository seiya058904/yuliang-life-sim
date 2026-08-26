import type { GameTime } from '../engine/time';

export type ContentStatus = 'seed' | 'official';
export type ContentId = string;
export type ContentTag = string;
export type CapabilityId = string;
export type RewardTier = 'small' | 'normal' | 'large' | 'milestone';
export type StatName = 'ability' | 'reputation' | 'lifestyle';
export type AttributeId = 'professional' | 'knowledge' | 'communication' | 'fitness' | 'appearance' | 'network' | 'mood';
export type AttributeValues = Record<AttributeId, number>;
export type CareerExperienceId = 'office' | 'operations' | 'customer_service' | 'retail' | 'logistics' | 'data' | 'project' | 'management' | 'media' | 'finance';
export type CareerExperienceStage = '暂无' | '基础' | '熟悉' | '扎实' | '丰富';
export type PlayerStage = 'start' | 'growing' | 'stable' | 'wealthy';
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type PlanSlot = 'day' | 'evening';
export type ActivityDuration = 60 | 120 | 180 | 240 | 2880;
export type PlannedActivity =
  | { kind: 'study'; durationMinutes: ActivityDuration }
  | { kind: 'side_job'; jobId: ContentId; durationMinutes: ActivityDuration }
  | { kind: 'activity'; activityId: ContentId; optionId: string }
  | { kind: 'free'; durationMinutes?: ActivityDuration };

export interface WeeklyPlanDay {
  day: PlannedActivity;
  evening: PlannedActivity;
}

export interface WeeklyPlan {
  days: Record<Weekday, WeeklyPlanDay>;
  autoRepeat: boolean;
}

export interface ContentMeta {
  id: ContentId;
  contentStatus: ContentStatus;
  name: string;
  description: string;
  tags?: readonly ContentTag[];
}

export type ConditionDefinition =
  | { type: 'all'; conditions: readonly ConditionDefinition[] }
  | { type: 'any'; conditions: readonly ConditionDefinition[] }
  | { type: 'not'; condition: ConditionDefinition }
  | { type: 'day_at_least'; day: number }
  | { type: 'day_at_most'; day: number }
  | { type: 'time_between'; startHour: number; endHour: number }
  | { type: 'player_stage'; stage: PlayerStage }
  | { type: 'cash_at_least'; amount: number }
  | { type: 'ability_at_least'; amount: number }
  | { type: 'attribute_at_least'; attribute: AttributeId; amount: number }
  | { type: 'reputation_at_least'; amount: number }
  | { type: 'lifestyle_at_least'; amount: number }
  | { type: 'current_job'; jobId: ContentId }
  | { type: 'job_experience_at_least'; jobId: ContentId; amount: number }
  | { type: 'owns_item'; itemId: ContentId; quantity?: number }
  | { type: 'has_capability'; capability: CapabilityId }
  | { type: 'housing_is'; housingId: ContentId; mode?: 'rent' | 'owned' }
  | { type: 'owns_business'; businessId: ContentId }
  | { type: 'owns_asset'; assetId: ContentId }
  | { type: 'relationship_at_least'; characterId: ContentId; amount: number }
  | { type: 'relationship_stage_at_least'; characterId: ContentId; stage: number }
  | { type: 'completed_event'; eventId: ContentId }
  | { type: 'completed_milestone'; milestoneId: ContentId }
  | { type: 'chain_stage_at_least'; chainId: ContentId; stage: number }
  | { type: 'flag'; flag: string };

export interface PermanentModifierDefinition {
  target: 'work_pay' | 'work_hours' | 'study_gain' | 'business_profit' | 'housing_rent' | 'shop_price' | 'event_reward';
  mode: 'add' | 'multiply';
  value: number;
  tags?: readonly ContentTag[];
}

export type EffectDefinition =
  | { type: 'cash'; amount: number; rewardTier?: RewardTier }
  | { type: 'stat'; stat: StatName; amount: number }
  | { type: 'attribute'; attribute: AttributeId; amount: number }
  | { type: 'relation'; characterId: ContentId; amount: number }
  | { type: 'item'; itemId: ContentId; quantity: number }
  | { type: 'unlock_capability'; capability: CapabilityId }
  | { type: 'unlock_job'; jobId: ContentId }
  | { type: 'unlock_event'; eventId: ContentId }
  | { type: 'unlock_housing'; housingId: ContentId }
  | { type: 'unlock_business'; businessId: ContentId }
  | { type: 'unlock_asset'; assetId: ContentId }
  | { type: 'discount'; percent: number; tags?: readonly ContentTag[] }
  | { type: 'modifier'; modifier: PermanentModifierDefinition }
  | { type: 'advance_time'; hours: number }
  | { type: 'set_flag'; flag: string }
  | { type: 'advance_chain'; chainId: ContentId; stage: number };

export interface JobDefinition extends ContentMeta {
  kind: 'regular' | 'temporary' | 'freelance';
  hours: number;
  basePay: number;
  abilityRequired?: number;
  reputationRequired?: number;
  requirements?: ConditionDefinition;
  requiredItems?: readonly ContentId[];
  requiredCapabilities?: readonly CapabilityId[];
  careerXp: number;
  rewards?: readonly EffectDefinition[];
  relatedCharacters?: readonly ContentId[];
  schedule?: { workDays: readonly Weekday[]; startMinute: number; endMinute: number };
  recruiterCharacterId?: ContentId;
  companyId?: ContentId;
  category?: 'basic' | 'office' | 'technical' | 'sales' | 'management' | 'freelance';
  recruitment?: RecruitmentDefinition;
  resignation?: ResignationDefinition;
  isLongTerm: boolean;
  /** Phase 4 content must set this explicitly; legacy kind is read only for migration. */
  employmentKind: EmploymentKind;
  experienceTags?: readonly CareerExperienceId[];
  experienceRequired?: Partial<Record<CareerExperienceId, number>>;
  qualificationRequired?: readonly ContentId[];
}

export type EmploymentKind = 'full_time' | 'repeatable_side_job' | 'gig';
export type ApplicationRoute = 'market' | 'referral' | 'story' | 'internal' | 'headhunter';

export interface VacancyTemplate extends ContentMeta {
  jobId: ContentId;
  companyId: ContentId;
  route: ApplicationRoute;
  salaryMultiplierRange: readonly [number, number];
  durationDays?: number;
  marketWeight?: number;
}

export interface VacancyState {
  vacancyId: string;
  jobId: ContentId;
  companyId: ContentId;
  salaryRange: readonly [number, number];
  route: ApplicationRoute;
  publishedDay: number;
  expiresDay: number;
}

export type ApplicationStatus = 'submitted' | 'screening' | 'interview' | 'waiting' | 'rejected' | 'offer' | 'accepted' | 'withdrawn' | 'expired';
export interface JobApplicationState {
  applicationId: string;
  vacancyId?: string;
  opportunityId?: ContentId;
  jobId: ContentId;
  companyId: ContentId;
  salaryRange: readonly [number, number];
  route: ApplicationRoute;
  submittedDay: number;
  resultDay: number;
  offerExpiresDay?: number;
  status: ApplicationStatus;
  competitivenessTier: 'minimum' | 'competitive' | 'strong' | 'exceptional';
  probabilityBand: number;
  willReceiveOffer: boolean;
  feedback: readonly string[];
  nextEligibleDay?: number;
}

export interface JobOpportunityState {
  id: ContentId;
  jobId: ContentId;
  companyId: ContentId;
  route: Exclude<ApplicationRoute, 'market'>;
  source: string;
  expiresDay: number;
  salaryRange: readonly [number, number];
}

export type ViewId = 'life' | 'work' | 'shop' | 'wealth' | 'relations' | 'profile' | 'city';

export interface AcquisitionHint {
  requirementId: string;
  label: string;
  actionLabel: string;
  destinationView: ViewId;
  targetId?: ContentId;
  currentValue?: number;
  requiredValue?: number;
}

/** @deprecated Use AcquisitionHint. */
export type RequirementHint = AcquisitionHint;

export interface AcquiredSideJobState { jobId: ContentId; acquiredDay: number; sourceApplicationId?: string; }
export interface GigOpportunityState { id: ContentId; jobId: ContentId; validFromDay: number; expiresDay: number; executableDay: number; startMinute: number; endMinute: number; pay: number; source: string; }
export interface EmploymentHistoryEntry { jobId: ContentId; companyId?: ContentId; startedDay?: number; endedDay?: number; finalPay: number; reason?: string; migrated?: boolean; }
export interface MonthlyHighlight { id: string; kind: 'new_job' | 'new_contact' | 'side_job_acquired' | 'gig_completed' | 'major_purchase' | 'new_asset' | 'attribute_milestone' | 'storyline_completed'; day: number; label: string; sourceId?: ContentId; }

export type LifeRecordCategory = 'career' | 'purchase' | 'housing' | 'relationship' | 'event' | 'business' | 'asset' | 'investment';

export interface LifeRecordEntry {
  id: string;
  day: number;
  category: LifeRecordCategory;
  title: string;
  detail?: string;
  sourceId?: ContentId;
  amount?: number;
}

export type ItemCategory = 'consumable' | 'technology' | 'clothing' | 'furniture' | 'leisure_item' | 'entertainment' | 'luxury' | 'collectible';

export interface ItemDefinition extends ContentMeta {
  category: ItemCategory;
  price: number;
  consumable: boolean;
  sellable: boolean;
  resaleRatio: number;
  lifestyleDelta: number;
  capabilities?: readonly CapabilityId[];
  statEffects?: Partial<Record<StatName, number>>;
  attributeEffects?: Partial<Record<AttributeId, number>>;
  financialCategory?: FinancialCategory;
  requirements?: ConditionDefinition;
  housingTags?: readonly ContentTag[];
  effects?: readonly EffectDefinition[];
}

export interface HousingDefinition extends ContentMeta {
  mode: 'rent' | 'buy' | 'both';
  rentPerDay: number;
  price?: number;
  valuation: number;
  lifestyleDelta: number;
  furnitureCapacity: number;
  fixedMonthlyCost?: number;
  requirements?: ConditionDefinition;
  effects?: readonly EffectDefinition[];
  locationId?: ContentId;
}

export interface BusinessDefinition extends ContentMeta {
  price: number;
  baseRevenue: number;
  baseGoodsCost: number;
  baseWage: number;
  baseRent: number;
  priceLevels: readonly number[];
  wageLevels: readonly number[];
  inventoryLevels: readonly number[];
  requirements?: ConditionDefinition;
  effects?: readonly EffectDefinition[];
}

export interface AssetDefinition extends ContentMeta {
  kind: 'investment' | 'rental' | 'collectible';
  price: number;
  valuation: number;
  dailyIncome: number;
  volatility: number;
  requirements?: ConditionDefinition;
  effects?: readonly EffectDefinition[];
}

export interface ActivityOption {
  id: string;
  label: string;
  durationMinutes: ActivityDuration;
  cashCost: number;
  requirements?: ConditionDefinition;
  effects?: readonly EffectDefinition[];
  cooldownDays?: number;
  requiredCharacterId?: ContentId;
  tags?: readonly ContentTag[];
}

export interface ActivityDefinition extends ContentMeta {
  category: 'food' | 'film' | 'game' | 'fitness' | 'social' | 'culture' | 'travel' | 'hobby' | 'nightlife' | 'premium';
  options: readonly ActivityOption[];
  financialCategory?: FinancialCategory;
  locationId?: ContentId;
}

export interface RelationshipInteractionDefinition extends ContentMeta {
  characterId: ContentId;
  category: 'meal' | 'work' | 'outing' | 'travel' | 'gift' | 'business';
  options: readonly ActivityOption[];
}

export interface InvestmentDefinition extends ContentMeta {
  kind: 'savings' | 'fund' | 'gold' | 'stock' | 'reit' | 'company_equity' | 'property_fund';
  risk: 'low' | 'medium' | 'high';
  baseValue: number;
  minimumUnits: number;
  dailyDrift: number;
  dailyVolatility: number;
  dividendRate?: number;
  companyId?: ContentId;
  requirements?: ConditionDefinition;
  financialCategory?: 'investment_transfer';
}

export interface CompanyDefinition extends ContentMeta {
  industry: string;
  jobIds?: readonly ContentId[];
  characterIds?: readonly ContentId[];
  investmentIds?: readonly ContentId[];
  businessIds?: readonly ContentId[];
  eventIds?: readonly ContentId[];
  locationId?: ContentId;
}

export interface LocationDefinition extends ContentMeta {
  region: string;
  transportCostMultiplier: number;
}

export interface DialogueLine {
  id?: string;
  speakerId?: ContentId;
  speakerName?: string;
  text: string;
}

export interface DialogueChoice {
  id: string;
  text: string;
  condition?: ConditionDefinition;
  effects?: readonly EffectDefinition[];
  nextId?: string;
  outcome?: DialogueOutcome;
}

export interface DialogueOutcome {
  kind: 'narrative' | 'recruitment' | 'interview' | 'offer' | 'negotiation' | 'resignation' | 'purchase' | 'investment' | 'schedule' | 'reward';
  narrative: string;
  action?: string;
}

export interface DialogueDefinition extends ContentMeta {
  lines: readonly DialogueLine[];
  choices?: readonly DialogueChoice[];
}

export interface RecruitmentDefinition {
  dialogueId?: ContentId;
  recruiterCharacterId?: ContentId;
  intro?: readonly DialogueLine[];
  interview?: readonly DialogueLine[];
  offerText?: string;
}

export interface ResignationDefinition {
  dialogueId?: ContentId;
  dialogue?: readonly DialogueLine[];
  retentionBonus?: number;
}

export interface RelationshipStageDefinition {
  threshold: number;
  label: string;
  effects?: readonly EffectDefinition[];
  unlockEventIds?: readonly ContentId[];
}

export interface CharacterDefinition extends ContentMeta {
  identity: string;
  initialRelationship: number;
  stages: readonly RelationshipStageDefinition[];
  locationId?: ContentId;
}

export interface EventChoiceDefinition {
  id: string;
  text: string;
  effects: readonly EffectDefinition[];
  nextEventId?: ContentId;
  nextChainStage?: { chainId: ContentId; stage: number };
}

export interface EventDefinition extends ContentMeta {
  title: string;
  body: string;
  category: 'work' | 'career' | 'shopping' | 'housing' | 'relationship' | 'business' | 'investment' | 'asset' | 'life' | 'luck';
  weight: number;
  cooldownDays: number;
  conditions?: ConditionDefinition;
  timeRange?: { startHour: number; endHour: number };
  playerStages?: readonly PlayerStage[];
  choices: readonly EventChoiceDefinition[];
  chain?: { chainId: ContentId; stage: number };
  interruptsSimulation?: boolean;
  ambient?: boolean;
  pressure?: number;
}

export interface EventChainStageDefinition {
  stage: number;
  eventId: ContentId;
  waitDays?: number;
  conditions?: ConditionDefinition;
}

export interface EventChainDefinition extends ContentMeta {
  stages: readonly EventChainStageDefinition[];
}

export interface StorylineBranch {
  id: string;
  text?: string;
  condition?: ConditionDefinition;
  nextStageId?: string;
  effects?: readonly EffectDefinition[];
}

export interface StorylineStageDefinition {
  id: string;
  dialogueId?: ContentId;
  eventId?: ContentId;
  waitDays?: number;
  conditions?: ConditionDefinition;
  branches?: readonly StorylineBranch[];
  nextStageId?: string;
}

export interface StorylineDefinition extends ContentMeta {
  stages: readonly StorylineStageDefinition[];
  initialStageId: string;
}

export interface MilestoneDefinition extends ContentMeta {
  condition: ConditionDefinition;
  effects?: readonly EffectDefinition[];
}

export interface VocabularyDefinition {
  capabilities: readonly CapabilityId[];
  tags: readonly ContentTag[];
  attributes?: readonly AttributeId[];
  financialCategories?: readonly FinancialCategory[];
}

export type FinancialDirection = 'income' | 'expense' | 'transfer';
export type FinancialGroup = 'income' | 'consumption' | 'asset_allocation' | 'asset_liquidation';
export type FinancialCategory =
  | 'wage' | 'side_job' | 'bonus' | 'business_income' | 'property_income' | 'investment_dividend' | 'event_income' | 'other_income'
  | 'housing' | 'living' | 'food' | 'transport' | 'communication' | 'shopping' | 'entertainment' | 'social' | 'education' | 'travel' | 'service' | 'maintenance' | 'business_cost' | 'other_expense'
  | 'investment_transfer' | 'property_transfer' | 'business_transfer' | 'collectible_transfer'
  | 'asset_liquidation' | 'realized_gain' | 'realized_loss' | 'valuation_change';

export interface FinancialEntry {
  id: string;
  day: number;
  direction: FinancialDirection;
  group: FinancialGroup;
  category: FinancialCategory;
  amount: number;
  cashDelta: number;
  costBasis?: number;
  sourceType?: string;
  sourceId?: ContentId;
  label: string;
}

export interface FinancialLedgerState {
  month: number;
  nextSequence: number;
  entries: FinancialEntry[];
  cashStart?: number;
  netWorthStart?: number;
}

export interface FinancialGroupSummary {
  group: FinancialGroup;
  amount: number;
  categories: Record<string, number>;
}

export interface MonthlyFinancialSummary {
  month: number;
  income: FinancialGroupSummary;
  consumption: FinancialGroupSummary;
  assetAllocation: FinancialGroupSummary;
  assetLiquidation: FinancialGroupSummary;
  totalIncome: number;
  totalConsumption: number;
  totalAssetAllocation: number;
  totalAssetLiquidation: number;
  cashStart: number;
  cashEnd: number;
  cashChange: number;
  netWorthStart: number;
  netWorthEnd: number;
  netWorthChange: number;
}

export interface ContentPack {
  packId: string;
  version: number;
  contentStatus: ContentStatus;
  content: Partial<ContentRegistry>;
}

export interface ContentRegistry {
  jobs: readonly JobDefinition[];
  items: readonly ItemDefinition[];
  housing: readonly HousingDefinition[];
  businesses: readonly BusinessDefinition[];
  assets: readonly AssetDefinition[];
  characters: readonly CharacterDefinition[];
  events: readonly EventDefinition[];
  eventChains: readonly EventChainDefinition[];
  milestones: readonly MilestoneDefinition[];
  vocabulary: VocabularyDefinition;
  activities?: readonly ActivityDefinition[];
  investments?: readonly InvestmentDefinition[];
  companies?: readonly CompanyDefinition[];
  dialogues?: readonly DialogueDefinition[];
  relationshipInteractions?: readonly RelationshipInteractionDefinition[];
  storylines?: readonly StorylineDefinition[];
  locations?: readonly LocationDefinition[];
  vacancyTemplates?: readonly VacancyTemplate[];
  packs?: readonly { packId: string; version: number; contentStatus: ContentStatus }[];
}

export interface BusinessHolding {
  businessId: ContentId;
  priceLevel: number;
  wageLevel: number;
  inventoryLevel: number;
  purchasePrice: number;
}

export interface AssetHolding {
  assetId: ContentId;
  purchasePrice: number;
  purchaseDay: number;
  currentValuation: number;
}

export interface InvestmentHolding {
  investmentId: ContentId;
  units: number;
  averageCost: number;
  currentValuation: number;
  lastValuationDay: number;
}

export interface HousingState {
  housingId: ContentId;
  mode: 'rent' | 'owned';
}

export interface CalendarState {
  week: number;
  weekday: Weekday;
  month: number;
  weekOfMonth: 1 | 2 | 3 | 4;
}

export interface JobSchedule {
  workDays: readonly Weekday[];
  startMinute: number;
  endMinute: number;
}

export interface EmploymentState {
  jobId: ContentId;
  schedule: JobSchedule;
  effectiveWeek: number;
  pendingJobId?: ContentId;
  pendingCompanyId?: ContentId;
  pendingBasePay?: number;
  companyId?: ContentId;
  basePay?: number;
  salaryAdjustment?: number;
  negotiationStage?: 0 | 1 | 2;
  lastNegotiationDay?: number;
}

export type ActivityKind = 'sleep' | 'life' | 'work' | 'study' | 'side_job' | 'activity' | 'free';

export interface ActivityState {
  kind: ActivityKind;
  start: GameTime;
  end: GameTime;
  jobId?: ContentId;
  activityId?: ContentId;
  optionId?: string;
}

export type SimulationMode = 'planning' | 'running' | 'paused' | 'event' | 'reward' | 'week_complete' | 'monthly_summary';
export type SimulationSpeed = 1 | 2 | 4;

export interface MonthlyLedger {
  wageIncome: number;
  sideJobIncome: number;
  businessIncome: number;
  assetIncome: number;
  rentExpense: number;
  purchaseExpense: number;
  livingExpense: number;
  netWorthStart: number;
  netWorthEnd: number;
}

export interface MonthlySummary {
  month: number;
  ledger: MonthlyLedger;
}
export interface PendingMonthlySummary { month: number; summary: MonthlySummary; financial?: MonthlyFinancialSummary; resumeMode: 'running' | 'planning' | 'paused'; highlights: MonthlyHighlight[]; }

export interface RecruitmentState {
  jobId: ContentId;
  stage: 'dialogue' | 'interview' | 'offer';
  recruiterCharacterId?: ContentId;
  dialogueId?: ContentId;
}

export interface ResignationState {
  jobId: ContentId;
  stage: 'dialogue' | 'outcome';
}

export interface RewardSettlement {
  eventId: ContentId;
  lines: readonly string[];
}

export interface RngState {
  seed: number;
  cursor: number;
}

export interface GameState {
  version: number;
  contentVersion: number;
  time: GameTime;
  calendar: CalendarState;
  cash: number;
  ability: number;
  reputation: number;
  lifestyle: number;
  attributes?: AttributeValues;
  currentJobId?: ContentId;
  employment?: EmploymentState;
  weeklyPlan: WeeklyPlan;
  previousWeeklyPlan?: WeeklyPlan;
  autoRepeatPlan: boolean;
  currentActivity?: ActivityState;
  simulationMode: SimulationMode;
  simulationSpeed: SimulationSpeed;
  activeRecruitment?: RecruitmentState;
  activeResignation?: ResignationState;
  pendingReward?: RewardSettlement;
  monthlyLedger: MonthlyLedger;
  lastMonthlySummary?: MonthlySummary;
  financialLedger?: FinancialLedgerState;
  financialHistory?: MonthlyFinancialSummary[];
  lastFinancialSummary?: MonthlyFinancialSummary;
  pendingMonthlySummary?: PendingMonthlySummary;
  jobExperience: Record<ContentId, number>;
  careerExperience?: Partial<Record<CareerExperienceId, number>>;
  qualifications?: ContentId[];
  inventory: Record<ContentId, number>;
  itemPurchasePrices: Record<ContentId, number>;
  unlockedCapabilities: CapabilityId[];
  unlockedJobIds: ContentId[];
  unlockedHousingIds: ContentId[];
  unlockedBusinessIds: ContentId[];
  unlockedAssetIds: ContentId[];
  housing: HousingState;
  relationships: Record<ContentId, number>;
  businesses: Record<ContentId, BusinessHolding>;
  assets: Record<ContentId, AssetHolding>;
  investments?: Record<ContentId, InvestmentHolding>;
  completedEvents: ContentId[];
  completedMilestones: ContentId[];
  eventCooldowns: Record<ContentId, number>;
  chainStages: Record<ContentId, number>;
  flags: Record<string, boolean>;
  modifiers: PermanentModifierDefinition[];
  discounts: Array<{ percent: number; tags: string[]; expiresDay?: number }>;
  marketJobIds: ContentId[];
  pendingEventId?: ContentId;
  eventMeter: number;
  eventDay: number;
  eventsToday: number;
  lastSettledDay: number;
  rentReliefAvailableDay: number;
  housingReliefUntilDay: number;
  rng: RngState;
  lastMajorEventDay?: number;
  majorEventsThisMonth?: number;
  ambientLog?: Array<{ day: number; text: string }>;
  storylineStages?: Record<ContentId, string>;
  vacancies?: VacancyState[];
  applications?: JobApplicationState[];
  opportunities?: JobOpportunityState[];
  acquiredSideJobs?: Record<ContentId, AcquiredSideJobState>;
  gigs?: GigOpportunityState[];
  employmentHistory?: EmploymentHistoryEntry[];
  monthlyHighlights?: MonthlyHighlight[];
  lifeHistory: LifeRecordEntry[];
}

export type GameAction =
  | { type: 'start_week' }
  | { type: 'pause_simulation' }
  | { type: 'resume_simulation' }
  | { type: 'set_simulation_speed'; speed: SimulationSpeed }
  | { type: 'advance_simulation'; minutes: number }
  | { type: 'set_plan'; weekday: Weekday; slot: PlanSlot; activity: PlannedActivity }
  | { type: 'copy_previous_plan' }
  | { type: 'set_auto_repeat_plan'; enabled: boolean }
  | { type: 'acknowledge_monthly_summary' }
  | { type: 'submit_application'; vacancyId?: string; opportunityId?: ContentId }
  | { type: 'withdraw_application'; applicationId: string }
  | { type: 'accept_application_offer'; applicationId: string; replacePending?: boolean }
  | { type: 'decline_application_offer'; applicationId: string }
  | { type: 'start_recruitment'; jobId: ContentId }
  | { type: 'advance_recruitment'; jobId: ContentId }
  | { type: 'accept_job_offer'; jobId: ContentId }
  | { type: 'decline_job_offer'; jobId: ContentId }
  | { type: 'start_resignation' }
  | { type: 'advance_resignation' }
  | { type: 'choose_resignation'; choice: 'leave' | 'stay' }
  | { type: 'interact_character'; interactionId: ContentId; optionId: string }
  | { type: 'continue_after_event' }
  | { type: 'claim_reward'; resume?: boolean }
  | { type: 'work'; jobId: ContentId }
  | { type: 'study' }
  | { type: 'rest' }
  | { type: 'accept_job'; jobId: ContentId }
  | { type: 'purchase_items'; items: Record<ContentId, number> }
  | { type: 'sell_item'; itemId: ContentId; quantity: number }
  | { type: 'move_housing'; housingId: ContentId; mode: 'rent' | 'owned' }
  | { type: 'buy_business'; businessId: ContentId }
  | { type: 'update_business'; businessId: ContentId; priceLevel: number; wageLevel: number; inventoryLevel: number }
  | { type: 'buy_asset'; assetId: ContentId }
  | { type: 'sell_asset'; assetId: ContentId }
  | { type: 'buy_investment'; investmentId: ContentId; units: number }
  | { type: 'sell_investment'; investmentId: ContentId; units: number }
  | { type: 'choose_event'; eventId: ContentId; choiceId: string }
  | { type: 'set_flag'; flag: string; value: boolean };

export type GameEffect =
  | { type: 'time'; from: GameTime; to: GameTime; hours: number }
  | { type: 'activity'; activity: ActivityState }
  | { type: 'cash'; amount: number; reason: string }
  | { type: 'stat'; stat: StatName | AttributeId; amount: number }
  | { type: 'relation'; characterId: ContentId; amount: number }
  | { type: 'unlock'; kind: string; id: string }
  | { type: 'purchase'; itemId: ContentId; quantity: number; total: number }
  | { type: 'settlement'; day: number; cashDelta: number; details: readonly SettlementDetail[] }
  | { type: 'month'; summary: MonthlySummary }
  | { type: 'event'; eventId: ContentId }
  | { type: 'milestone'; milestoneId: ContentId }
  | { type: 'message'; text: string };

export interface SettlementDetail {
  label: string;
  amount: number;
}

export interface GameResult {
  state: GameState;
  effects: GameEffect[];
  error?: string;
}
