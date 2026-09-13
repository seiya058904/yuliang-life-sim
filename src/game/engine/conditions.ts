import type { BalanceConfig } from '../balance/config';
import type { ConditionDefinition, ContentRegistry, GameState, PlayerStage } from '../content/contracts';
import { calculateNetWorth } from './economy';
import { getAttribute } from './attributes';

export function getPlayerStage(state: GameState, content: ContentRegistry, balance: BalanceConfig): PlayerStage {
  const netWorth = calculateNetWorth(state, content, balance);
  if (netWorth >= balance.stageThresholds.wealthy) return 'wealthy';
  if (netWorth >= balance.stageThresholds.stable) return 'stable';
  if (netWorth >= balance.stageThresholds.growing) return 'growing';
  return 'start';
}

export function currentMonthlySalary(state: GameState): number {
  if (!state.employment) return 0;
  return ((state.employment.basePay ?? 0) + (state.employment.salaryAdjustment ?? 0)) * 20;
}

export function evaluateCondition(condition: ConditionDefinition, state: GameState, content: ContentRegistry, balance: BalanceConfig): boolean {
  switch (condition.type) {
    case 'all': return condition.conditions.every((child) => evaluateCondition(child, state, content, balance));
    case 'any': return condition.conditions.some((child) => evaluateCondition(child, state, content, balance));
    case 'not': return !evaluateCondition(condition.condition, state, content, balance);
    case 'day_at_least': return state.time.day >= condition.day;
    case 'day_at_most': return state.time.day <= condition.day;
    case 'time_between': return condition.startHour <= condition.endHour
      ? state.time.hour >= condition.startHour && state.time.hour <= condition.endHour
      : state.time.hour >= condition.startHour || state.time.hour <= condition.endHour;
    case 'player_stage': return getPlayerStage(state, content, balance) === condition.stage ||
      (condition.stage === 'start' && getPlayerStage(state, content, balance) === 'start');
    case 'cash_at_least': return state.cash >= condition.amount;
    case 'ability_at_least': return state.ability >= condition.amount;
    case 'attribute_at_least': return getAttribute(state, condition.attribute) >= condition.amount;
    case 'reputation_at_least': return state.reputation >= condition.amount;
    case 'lifestyle_at_least': return state.lifestyle >= condition.amount;
    case 'current_job': return state.currentJobId === condition.jobId;
    case 'current_salary_at_least': return currentMonthlySalary(state) >= condition.amount;
    case 'job_experience_at_least': return (state.jobExperience[condition.jobId] ?? 0) >= condition.amount;
    case 'interest_familiarity_at_least': return (state.interestFamiliarity?.[condition.tag] ?? 0) >= condition.amount;
    case 'owns_item': return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1);
    case 'has_capability': return state.unlockedCapabilities.includes(condition.capability);
    case 'housing_is': return state.housing.housingId === condition.housingId && (!condition.mode || state.housing.mode === condition.mode);
    case 'owns_business': return Boolean(state.businesses[condition.businessId]);
    case 'owns_asset': return Boolean(state.assets[condition.assetId]);
    case 'owns_investment': return Boolean(state.investments?.[condition.investmentId]);
    case 'relationship_at_least': return (state.relationships[condition.characterId] ?? 0) >= condition.amount;
    case 'relationship_stage_at_least': return (state.relationships[condition.characterId] ?? 0) >= (balance.relationshipStageThresholds[condition.stage] ?? Number.MAX_SAFE_INTEGER);
    case 'completed_event': return state.completedEvents.includes(condition.eventId);
    case 'completed_milestone': return state.completedMilestones.includes(condition.milestoneId);
    case 'chain_stage_at_least': return (state.chainStages[condition.chainId] ?? 0) >= condition.stage;
    case 'flag': return state.flags[condition.flag] === true;
    default: return false;
  }
}

const attributeLabels: Record<string, string> = {
  professional: '专业', knowledge: '知识', communication: '沟通', fitness: '体能', appearance: '形象', network: '人脉', mood: '心情',
};
const interestLabels: Record<string, string> = { film: '电影', photography: '摄影', music: '音乐', cooking: '烹饪', cycling: '骑行', game: '游戏', travel: '旅行' };
const capabilityLabels: Record<string, string> = { remote_work: '远程工作', home_workspace: '居家办公', business_license: '经营资格', market_insight: '市场洞察' };

export function explainCondition(condition: ConditionDefinition, state: GameState, content: ContentRegistry, balance: BalanceConfig): string {
  switch (condition.type) {
    case 'all': return condition.conditions.map((child) => explainCondition(child, state, content, balance)).join('；');
    case 'any': return condition.conditions.map((child) => explainCondition(child, state, content, balance)).join(' 或 ');
    case 'not': {
      // `not` 的解释语义必须与 evaluateCondition(not) 的布尔结果完全一致：
      // 条件满足时输出 ✓，不满足时输出 ✕。不能反过来拼"不满足：{子条件}"，
      // 否则一次性商品在可购买时会显示成自相矛盾的"不满足：✕ 需要商品 X"。
      const inner = condition.condition;
      if (inner.type === 'owns_item') {
        const itemName = content.items.find((entry) => entry.id === inner.itemId)?.name ?? inner.itemId;
        const owned = (state.inventory[inner.itemId] ?? 0) >= (inner.quantity ?? 1);
        return owned ? `✕ 已拥有${itemName}，不能重复购买` : `✓ 尚未拥有${itemName}，可购买`;
      }
      return evaluateCondition(condition, state, content, balance) ? '✓ 已满足条件' : '✕ 当前条件未满足';
    }
    case 'attribute_at_least': {
      const current = getAttribute(state, condition.attribute);
      return current >= condition.amount ? `✓ ${attributeLabels[condition.attribute]} ≥ ${condition.amount}` : `✕ ${attributeLabels[condition.attribute]} ≥ ${condition.amount}（当前 ${current}，还需要 ${condition.amount - current}）`;
    }
    case 'ability_at_least': return state.ability >= condition.amount ? `✓ 能力 ≥ ${condition.amount}` : `✕ 能力 ≥ ${condition.amount}（当前 ${state.ability}，还需要 ${condition.amount - state.ability}）`;
    case 'reputation_at_least': return state.reputation >= condition.amount ? `✓ 声誉 ≥ ${condition.amount}` : `✕ 声誉 ≥ ${condition.amount}（当前 ${state.reputation}）`;
    case 'current_salary_at_least': { const current = currentMonthlySalary(state); return current >= condition.amount ? `✓ 当前月薪 ≥ ¥${condition.amount}` : `✕ 当前月薪 ≥ ¥${condition.amount}（当前 ¥${current}）`; }
    case 'cash_at_least': return state.cash >= condition.amount ? `✓ 现金 ≥ ¥${condition.amount}` : `✕ 现金 ≥ ¥${condition.amount}（当前 ¥${state.cash}）`;
    case 'lifestyle_at_least': return state.lifestyle >= condition.amount ? `✓ 生活品质 ≥ ${condition.amount}` : `✕ 生活品质 ≥ ${condition.amount}（当前 ${state.lifestyle}）`;
    case 'has_capability': return state.unlockedCapabilities.includes(condition.capability) ? `✓ 已拥有能力 ${capabilityLabels[condition.capability] ?? condition.capability}` : `✕ 需要能力 ${capabilityLabels[condition.capability] ?? condition.capability}`;
    case 'owns_item': { const itemName = content.items.find((entry) => entry.id === condition.itemId)?.name ?? condition.itemId; return (state.inventory[condition.itemId] ?? 0) >= (condition.quantity ?? 1) ? `✓ 已拥有${itemName}` : `✕ 需要商品 ${itemName}`; }
    case 'interest_familiarity_at_least': { const label = interestLabels[condition.tag] ?? condition.tag; const current = state.interestFamiliarity?.[condition.tag] ?? 0; return current >= condition.amount ? `✓ ${label}兴趣熟练度 ≥ ${condition.amount}` : `✕ ${label}兴趣熟练度 ≥ ${condition.amount}（当前 ${current}）`; }
    case 'relationship_at_least': { const current = state.relationships[condition.characterId] ?? 0; const character = content.characters.find((entry) => entry.id === condition.characterId); const label = character?.name ?? condition.characterId; return current >= condition.amount ? `✓ 与${label}的关系 ≥ ${condition.amount}` : `✕ 与${label}的关系 ≥ ${condition.amount}（当前 ${current}，还需要 ${condition.amount - current}）`; }
    default: return evaluateCondition(condition, state, content, balance) ? '✓ 已满足条件' : '✕ 当前条件未满足';
  }
}
