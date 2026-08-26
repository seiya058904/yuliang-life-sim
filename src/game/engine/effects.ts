import type { BalanceConfig } from '../balance/config';
import type { ContentId, ContentRegistry, EffectDefinition, GameEffect, GameState, ItemDefinition, PermanentModifierDefinition } from '../content/contracts';
import { evaluateCondition, getPlayerStage } from './conditions';
import { nextRandom, weightedPick } from './rng';
import { applyAttributeDelta } from './attributes';
import { recordStateFinancialEntry } from './financialLedger';

export const cloneGameState = (state: GameState): GameState => structuredClone(state);

export function modifierValue(state: GameState, target: PermanentModifierDefinition['target'], base: number, tags: readonly string[] = []): number {
  let value = base;
  for (const modifier of state.modifiers) {
    if (modifier.target !== target || (modifier.tags?.length && !modifier.tags.some((tag) => tags.includes(tag)))) continue;
    value = modifier.mode === 'add' ? value + modifier.value : value * modifier.value;
  }
  return value;
}

export function getDiscount(state: GameState, item: ItemDefinition): number {
  return state.discounts.filter((discount) => !discount.expiresDay || discount.expiresDay >= state.time.day)
    .filter((discount) => !discount.tags.length || discount.tags.some((tag) => item.tags?.includes(tag)))
    .reduce((total, discount) => Math.max(total, discount.percent), 0);
}

export function itemCost(state: GameState, item: ItemDefinition): number {
  return Math.max(0, Math.round(item.price * (1 - getDiscount(state, item) / 100)));
}

export function refreshUnlocks(state: GameState, content: ContentRegistry): void {
  for (const job of content.jobs) {
    if (job.requiredCapabilities?.every((capability) => state.unlockedCapabilities.includes(capability))) {
      if (!state.unlockedJobIds.includes(job.id)) state.unlockedJobIds.push(job.id);
    }
  }
}

export function applyContentEffects(
  state: GameState,
  effects: readonly EffectDefinition[],
  content: ContentRegistry,
  balance: BalanceConfig,
  output: GameEffect[],
  onAdvanceHours?: (hours: number) => void,
): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'cash': {
        const amount = Math.round(effect.amount * (effect.rewardTier ? balance.rewardTiers[effect.rewardTier] : 1));
        state.cash += amount;
        if (amount > 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'income', category: 'bonus', amount, label: '内容奖励', sourceType: 'effect' });
        if (amount < 0) recordStateFinancialEntry(state, { day: state.time.day, direction: 'expense', category: 'other_expense', amount: -amount, label: '内容支出', sourceType: 'effect' });
        output.push({ type: 'cash', amount, reason: '事件或内容奖励' });
        break;
      }
      case 'stat':
        if (effect.stat === 'ability') {
          applyAttributeDelta(state, 'professional', effect.amount);
          applyAttributeDelta(state, 'knowledge', effect.amount);
          applyAttributeDelta(state, 'communication', effect.amount);
          applyAttributeDelta(state, 'fitness', effect.amount);
        } else {
          state[effect.stat] = Math.max(0, state[effect.stat] + effect.amount);
          if (effect.stat === 'lifestyle') applyAttributeDelta(state, 'appearance', effect.amount);
        }
        output.push({ type: 'stat', stat: effect.stat, amount: effect.amount });
        break;
      case 'attribute':
        applyAttributeDelta(state, effect.attribute, effect.amount);
        output.push({ type: 'stat', stat: effect.attribute, amount: effect.amount });
        break;
      case 'relation': {
        const before = state.relationships[effect.characterId] ?? 0;
        const after = Math.max(0, Math.min(100, before + effect.amount));
        state.relationships[effect.characterId] = after;
        output.push({ type: 'relation', characterId: effect.characterId, amount: after - before });
        break;
      }
      case 'item':
        state.inventory[effect.itemId] = (state.inventory[effect.itemId] ?? 0) + effect.quantity;
        break;
      case 'unlock_capability':
        if (!state.unlockedCapabilities.includes(effect.capability)) state.unlockedCapabilities.push(effect.capability);
        output.push({ type: 'unlock', kind: '能力', id: effect.capability });
        refreshUnlocks(state, content);
        break;
      case 'unlock_job':
        if (!state.unlockedJobIds.includes(effect.jobId)) state.unlockedJobIds.push(effect.jobId);
        output.push({ type: 'unlock', kind: '工作', id: effect.jobId });
        break;
      case 'unlock_event': output.push({ type: 'unlock', kind: '事件', id: effect.eventId }); break;
      case 'unlock_housing':
        if (!state.unlockedHousingIds.includes(effect.housingId)) state.unlockedHousingIds.push(effect.housingId);
        output.push({ type: 'unlock', kind: '住房', id: effect.housingId });
        break;
      case 'unlock_business':
        if (!state.unlockedBusinessIds.includes(effect.businessId)) state.unlockedBusinessIds.push(effect.businessId);
        output.push({ type: 'unlock', kind: '企业', id: effect.businessId });
        break;
      case 'unlock_asset':
        if (!state.unlockedAssetIds.includes(effect.assetId)) state.unlockedAssetIds.push(effect.assetId);
        output.push({ type: 'unlock', kind: '资产', id: effect.assetId });
        break;
      case 'discount': state.discounts.push({ percent: effect.percent, tags: [...(effect.tags ?? [])], expiresDay: state.time.day + 7 }); break;
      case 'modifier': state.modifiers.push(effect.modifier); break;
      case 'advance_time': onAdvanceHours?.(effect.hours); break;
      case 'location_development': {
        if (!content.locations?.some((location) => location.id === effect.locationId)) break;
        const before = Math.min(5, Math.max(0, state.locationDevelopment?.[effect.locationId] ?? 0));
        const after = Math.min(5, Math.max(0, before + Math.round(effect.amount)));
        state.locationDevelopment ??= {};
        state.locationDevelopment[effect.locationId] = after;
        output.push({ type: 'message', text: `${content.locations.find((location) => location.id === effect.locationId)?.name ?? effect.locationId}发展 ${after - before >= 0 ? '+' : ''}${after - before}` });
        break;
      }
      case 'set_flag': state.flags[effect.flag] = true; break;
      case 'advance_chain': state.chainStages[effect.chainId] = Math.max(state.chainStages[effect.chainId] ?? 0, effect.stage); break;
    }
  }
}

export function chooseWeightedEvent(state: GameState, content: ContentRegistry, balance: BalanceConfig): ContentId | undefined {
  const candidates = content.events.filter((event) => {
    if (event.ambient || event.interruptsSimulation === false) return false;
    if ((state.majorEventsThisMonth ?? 0) >= balance.eventMajorMonthlyCap) return false;
    if (state.lastMajorEventDay !== undefined && state.time.day - state.lastMajorEventDay < balance.eventMajorCooldownDays) return false;
    const last = state.eventCooldowns[event.id];
    const cooldownReady = last === undefined || state.time.day - last >= event.cooldownDays;
    const timeReady = !event.timeRange || evaluateCondition({ type: 'time_between', ...event.timeRange }, state, content, balance);
    const stageReady = !event.playerStages?.length || event.playerStages.includes(getPlayerStage(state, content, balance));
    let chainReady = true;
    if (event.chain) {
      const chainRef = event.chain;
      const currentStage = state.chainStages[chainRef.chainId] ?? 0;
      chainReady = currentStage === chainRef.stage - 1;
      if (chainReady && chainRef.stage > 1) {
        const chain = content.eventChains.find((entry) => entry.id === chainRef.chainId);
        const previous = chain?.stages.find((stage) => stage.stage === chainRef.stage - 1);
        const previousDay = previous ? state.eventCooldowns[previous.eventId] : undefined;
        chainReady = previousDay !== undefined && state.time.day - previousDay >= (chain?.stages.find((stage) => stage.stage === chainRef.stage)?.waitDays ?? 0);
      }
    }
    return cooldownReady && timeReady && stageReady && chainReady && (!event.conditions || evaluateCondition(event.conditions, state, content, balance));
  });
  if (!candidates.length) return undefined;
  const daysSinceMajor = state.lastMajorEventDay === undefined ? balance.eventSoftPityDays : state.time.day - state.lastMajorEventDay;
  const pressure = 1 + Math.max(0, daysSinceMajor - balance.eventSoftPityDays) * balance.eventPressurePerDay;
  const gate = nextRandom(state.rng);
  state.rng = gate.rng;
  const opportunityChance = Math.min(0.2 + Math.max(0, daysSinceMajor - balance.eventMajorCooldownDays) * 0.12, 0.92);
  if (gate.value > opportunityChance) return undefined;
  const picked = weightedPick(state.rng, candidates, (event) => event.weight * (1 + (event.pressure ?? 0) * pressure));
  state.rng = picked.rng;
  return picked.value?.id;
}

export function chooseAmbientEvent(state: GameState, content: ContentRegistry, balance: BalanceConfig): ContentId | undefined {
  const candidates = content.events.filter((event) => {
    const last = state.eventCooldowns[event.id];
    const cooldownReady = last === undefined || state.time.day - last >= event.cooldownDays;
    return event.ambient === true && cooldownReady && (!event.conditions || evaluateCondition(event.conditions, state, content, balance));
  });
  if (!candidates.length) return undefined;
  const picked = weightedPick(state.rng, candidates, (event) => event.weight);
  state.rng = picked.rng;
  return picked.value?.id;
}
