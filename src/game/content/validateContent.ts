import type {
  ConditionDefinition,
  ContentId,
  ContentRegistry,
  EffectDefinition,
  EventChoiceDefinition,
  PermanentModifierDefinition,
} from './contracts';

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

type ContentCollection = readonly { id: ContentId; name: string; description: string; tags?: readonly string[] }[];

const idPattern = /^[a-z][a-z0-9._-]+$/;

export function validateContent(registry: ContentRegistry): ContentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Map<string, string>();
  const collections: Array<[string, ContentCollection]> = [
    ['工作', registry.jobs], ['商品', registry.items], ['住房', registry.housing],
    ['企业', registry.businesses], ['资产', registry.assets], ['人物', registry.characters],
    ['事件', registry.events], ['事件链', registry.eventChains], ['里程碑', registry.milestones],
    ...(registry.activities ?? []).length ? [['活动', registry.activities ?? []] as [string, ContentCollection]] : [],
    ...(registry.investments ?? []).length ? [['投资', registry.investments ?? []] as [string, ContentCollection]] : [],
    ...(registry.companies ?? []).length ? [['公司', registry.companies ?? []] as [string, ContentCollection]] : [],
    ...(registry.venues ?? []).length ? [['场所', registry.venues ?? []] as [string, ContentCollection]] : [],
    ...(registry.dialogues ?? []).length ? [['对白', registry.dialogues ?? []] as [string, ContentCollection]] : [],
    ...(registry.services ?? []).length ? [['服务', registry.services ?? []] as [string, ContentCollection]] : [],
    ...(registry.subscriptions ?? []).length ? [['订阅', registry.subscriptions ?? []] as [string, ContentCollection]] : [],
    ...(registry.storylines ?? []).length ? [['剧情', registry.storylines ?? []] as [string, ContentCollection]] : [],
  ];
  const known = {
    jobs: new Set(registry.jobs.map((entry) => entry.id)),
    items: new Set(registry.items.map((entry) => entry.id)),
    housing: new Set(registry.housing.map((entry) => entry.id)),
    businesses: new Set(registry.businesses.map((entry) => entry.id)),
    assets: new Set(registry.assets.map((entry) => entry.id)),
    characters: new Set(registry.characters.map((entry) => entry.id)),
    events: new Set(registry.events.map((entry) => entry.id)),
    eventChains: new Set(registry.eventChains.map((entry) => entry.id)),
    milestones: new Set(registry.milestones.map((entry) => entry.id)),
    activities: new Set((registry.activities ?? []).map((entry) => entry.id)),
    investments: new Set((registry.investments ?? []).map((entry) => entry.id)),
    companies: new Set((registry.companies ?? []).map((entry) => entry.id)),
    dialogues: new Set((registry.dialogues ?? []).map((entry) => entry.id)),
    locations: new Set((registry.locations ?? []).map((entry) => entry.id)),
    venueActivities: new Set((registry.activities ?? []).map((entry) => entry.id)),
  };
  const checkLocation = (locationId: ContentId | undefined, owner: string): void => {
    if (locationId && !known.locations.has(locationId)) errors.push(`${owner} 引用了未知地点: ${locationId}`);
  };

  for (const [category, collection] of collections) {
    for (const entry of collection) {
      if (!idPattern.test(entry.id)) errors.push(`${category} ID 无效: ${entry.id}`);
      if (!entry.name.trim()) errors.push(`${category} ${entry.id} 缺少中文名称`);
      if (!entry.description.trim()) errors.push(`${category} ${entry.id} 缺少简介`);
      if (ids.has(entry.id)) errors.push(`重复 ID: ${entry.id}（${ids.get(entry.id)} 与 ${category}）`);
      ids.set(entry.id, category);
      for (const tag of entry.tags ?? []) {
        if (!registry.vocabulary.tags.includes(tag)) errors.push(`${category} ${entry.id} 引用了未知 Tag: ${tag}`);
      }
    }
  }

  for (const capability of registry.vocabulary.capabilities) {
    if (!idPattern.test(capability)) errors.push(`Capability ID 无效: ${capability}`);
  }

  const checkCondition = (condition: ConditionDefinition | undefined, owner: string): void => {
    if (!condition) return;
    switch (condition.type) {
      case 'all':
      case 'any':
        if (condition.conditions.length === 0) errors.push(`${owner} 的 ${condition.type} 条件不能为空`);
        condition.conditions.forEach((child) => checkCondition(child, owner));
        break;
      case 'not': checkCondition(condition.condition, owner); break;
      case 'current_job':
      case 'job_experience_at_least':
        if (!known.jobs.has(condition.jobId)) errors.push(`${owner} 引用了未知工作: ${condition.jobId}`);
        break;
      case 'interest_familiarity_at_least':
        if (!condition.tag.trim() || !Number.isInteger(condition.amount) || condition.amount < 0 || condition.amount > 3) errors.push(`${owner} 的兴趣熟练度条件无效`);
        break;
      case 'owns_item':
        if (!known.items.has(condition.itemId)) errors.push(`${owner} 引用了未知商品: ${condition.itemId}`);
        break;
      case 'has_capability':
        if (!registry.vocabulary.capabilities.includes(condition.capability)) errors.push(`${owner} 引用了未知 Capability: ${condition.capability}`);
        break;
      case 'attribute_at_least':
        if (!(registry.vocabulary.attributes ?? []).includes(condition.attribute)) warnings.push(`${owner} 使用了未在 Vocabulary 明确列出的属性: ${condition.attribute}`);
        if (condition.amount < 0) errors.push(`${owner} 的属性门槛不能为负数`);
        break;
      case 'housing_is':
        if (!known.housing.has(condition.housingId)) errors.push(`${owner} 引用了未知住房: ${condition.housingId}`);
        break;
      case 'owns_business':
        if (!known.businesses.has(condition.businessId)) errors.push(`${owner} 引用了未知企业: ${condition.businessId}`);
        break;
      case 'owns_asset':
        if (!known.assets.has(condition.assetId)) errors.push(`${owner} 引用了未知资产: ${condition.assetId}`);
        break;
      case 'relationship_at_least':
      case 'relationship_stage_at_least':
        if (!known.characters.has(condition.characterId)) errors.push(`${owner} 引用了未知人物: ${condition.characterId}`);
        break;
      case 'completed_event':
        if (!known.events.has(condition.eventId)) errors.push(`${owner} 引用了未知事件: ${condition.eventId}`);
        break;
      case 'completed_milestone':
        if (!known.milestones.has(condition.milestoneId)) errors.push(`${owner} 引用了未知里程碑: ${condition.milestoneId}`);
        break;
      case 'chain_stage_at_least':
        if (!known.eventChains.has(condition.chainId)) errors.push(`${owner} 引用了未知事件链: ${condition.chainId}`);
        break;
      case 'time_between':
        if (condition.startHour < 0 || condition.startHour > 23 || condition.endHour < 0 || condition.endHour > 23) {
          errors.push(`${owner} 的时间范围无效`);
        }
        break;
      default: break;
    }
  };

  const impossibleCondition = (condition: ConditionDefinition | undefined): boolean => {
    if (!condition) return false;
    if (condition.type === 'all') {
      if (condition.conditions.some(impossibleCondition)) return true;
      const dayMins = condition.conditions.filter((child): child is Extract<ConditionDefinition, { type: 'day_at_least' }> => child.type === 'day_at_least').map((child) => child.day);
      const dayMaxes = condition.conditions.filter((child): child is Extract<ConditionDefinition, { type: 'day_at_most' }> => child.type === 'day_at_most').map((child) => child.day);
      return dayMins.length > 0 && dayMaxes.length > 0 && Math.max(...dayMins) > Math.min(...dayMaxes);
    }
    if (condition.type === 'any') return condition.conditions.length > 0 && condition.conditions.every(impossibleCondition);
    return false;
  };

  const checkModifier = (modifier: PermanentModifierDefinition, owner: string): void => {
    if (!Number.isFinite(modifier.value)) errors.push(`${owner} 的 modifier 数值无效`);
    if (modifier.mode === 'multiply' && modifier.value <= 0) errors.push(`${owner} 的乘法 modifier 必须大于 0`);
    for (const tag of modifier.tags ?? []) {
      if (!registry.vocabulary.tags.includes(tag)) errors.push(`${owner} 的 modifier 引用了未知 Tag: ${tag}`);
    }
  };

  const effectIsPositive = (effect: EffectDefinition): boolean => {
    if (effect.type === 'cash') return effect.amount > 0;
    if (effect.type === 'stat' || effect.type === 'attribute' || effect.type === 'relation') return effect.amount > 0;
    if (effect.type === 'location_development') return effect.amount > 0;
    if (effect.type === 'item') return effect.quantity > 0;
    if (effect.type === 'discount') return effect.percent > 0;
    if (effect.type === 'unlock_capability' || effect.type.startsWith('unlock_') || effect.type === 'advance_chain') return true;
    if (effect.type === 'modifier') {
      return effect.modifier.mode === 'add' ? effect.modifier.value > 0 :
        (effect.modifier.target === 'work_hours' || effect.modifier.target === 'housing_rent' || effect.modifier.target === 'shop_price')
          ? effect.modifier.value < 1 : effect.modifier.value > 1;
    }
    return false;
  };

  const checkEffect = (effect: EffectDefinition, owner: string): void => {
    if (effect.type === 'item' && !known.items.has(effect.itemId)) errors.push(`${owner} 引用了未知商品: ${effect.itemId}`);
    if (effect.type === 'relation' && !known.characters.has(effect.characterId)) errors.push(`${owner} 引用了未知人物: ${effect.characterId}`);
    if (effect.type === 'unlock_job' && !known.jobs.has(effect.jobId)) errors.push(`${owner} 引用了未知工作: ${effect.jobId}`);
    if (effect.type === 'unlock_event' && !known.events.has(effect.eventId)) errors.push(`${owner} 引用了未知事件: ${effect.eventId}`);
    if (effect.type === 'unlock_housing' && !known.housing.has(effect.housingId)) errors.push(`${owner} 引用了未知住房: ${effect.housingId}`);
    if (effect.type === 'unlock_business' && !known.businesses.has(effect.businessId)) errors.push(`${owner} 引用了未知企业: ${effect.businessId}`);
    if (effect.type === 'location_development' && !known.locations.has(effect.locationId)) errors.push(`${owner} 引用了未知地点: ${effect.locationId}`);
    if (effect.type === 'location_development' && (!Number.isFinite(effect.amount) || effect.amount === 0)) errors.push(`${owner} 的地点发展效果数值无效`);
    if (effect.type === 'unlock_asset' && !known.assets.has(effect.assetId)) errors.push(`${owner} 引用了未知资产: ${effect.assetId}`);
    if (effect.type === 'unlock_capability' && !registry.vocabulary.capabilities.includes(effect.capability)) errors.push(`${owner} 引用了未知 Capability: ${effect.capability}`);
    if (effect.type === 'advance_chain' && !known.eventChains.has(effect.chainId)) errors.push(`${owner} 引用了未知事件链: ${effect.chainId}`);
    if (effect.type === 'attribute' && registry.vocabulary.attributes && !registry.vocabulary.attributes.includes(effect.attribute)) errors.push(`${owner} 引用了未知属性: ${effect.attribute}`);
    if (effect.type === 'modifier') checkModifier(effect.modifier, owner);
    if (!Number.isFinite('amount' in effect ? effect.amount : 0) && effect.type !== 'modifier') errors.push(`${owner} 的 effect 数值无效`);
  };

  const checkEffects = (effects: readonly EffectDefinition[] | undefined, owner: string, requirePositive = false): void => {
    if (!effects) return;
    effects.forEach((effect) => checkEffect(effect, owner));
    if (requirePositive && !effects.some(effectIsPositive)) errors.push(`${owner} 必须包含至少一种整体正向价值`);
  };

  registry.jobs.forEach((job) => {
    if (!['full_time', 'repeatable_side_job', 'gig'].includes(job.employmentKind)) errors.push('工作 ' + job.id + ' 缺少有效 employmentKind');
    if (job.hours <= 0 || job.basePay < 0 || job.careerXp < 0) errors.push(`工作 ${job.id} 的数值无效`);
    if (job.schedule) {
      const validDays = job.schedule.workDays.length > 0 && job.schedule.workDays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7);
      const validRange = Number.isInteger(job.schedule.startMinute) && Number.isInteger(job.schedule.endMinute)
        && job.schedule.startMinute >= 0 && job.schedule.endMinute > job.schedule.startMinute && job.schedule.endMinute <= 24 * 60;
      if (!validDays || !validRange) errors.push(`工作 ${job.id} 的排班无效`);
    }
    if (job.recruiterCharacterId && !known.characters.has(job.recruiterCharacterId)) errors.push(`工作 ${job.id} 引用了未知招聘人物: ${job.recruiterCharacterId}`);
    if (job.recruitment?.dialogueId && !known.dialogues.has(job.recruitment.dialogueId)) errors.push(`工作 ${job.id} 引用了未知招聘对白: ${job.recruitment.dialogueId}`);
    if (job.recruitment?.recruiterCharacterId && !known.characters.has(job.recruitment.recruiterCharacterId)) errors.push(`工作 ${job.id} 引用了未知招聘人物: ${job.recruitment.recruiterCharacterId}`);
    checkCondition(job.requirements, `工作 ${job.id}`);
    job.requiredItems?.forEach((id) => { if (!known.items.has(id)) errors.push(`工作 ${job.id} 引用了未知商品: ${id}`); });
    job.requiredCapabilities?.forEach((id) => { if (!registry.vocabulary.capabilities.includes(id)) errors.push(`工作 ${job.id} 引用了未知 Capability: ${id}`); });
    checkEffects(job.rewards, `工作 ${job.id}`);
    job.relatedCharacters?.forEach((id) => { if (!known.characters.has(id)) errors.push(`工作 ${job.id} 引用了未知人物: ${id}`); });
  });
  (registry.services ?? []).forEach((service) => {
    if (service.price < 0 || (service.cooldownDays !== undefined && (!Number.isInteger(service.cooldownDays) || service.cooldownDays < 0))) errors.push(`服务 ${service.id} 的价格或冷却天数无效`);
    checkCondition(service.requirements, `服务 ${service.id}`);
    checkEffects(service.effects, `服务 ${service.id}`);
  });
  registry.items.forEach((item) => {
    if (item.price < 0 || item.resaleRatio < 0 || item.resaleRatio > 1) errors.push(`商品 ${item.id} 的价格或出售比例无效`);
    checkCondition(item.requirements, `商品 ${item.id}`); checkEffects(item.effects, `商品 ${item.id}`);
    item.capabilities?.forEach((id) => { if (!registry.vocabulary.capabilities.includes(id)) errors.push(`商品 ${item.id} 引用了未知 Capability: ${id}`); });
  });
  registry.housing.forEach((home) => { if (home.rentPerDay < 0 || home.valuation < 0 || home.furnitureCapacity < 0) errors.push(`住房 ${home.id} 的数值无效`); checkLocation(home.locationId, `住房 ${home.id}`); checkCondition(home.requirements, `住房 ${home.id}`); checkEffects(home.effects, `住房 ${home.id}`); });
  registry.businesses.forEach((business) => { if (business.price < 0 || business.priceLevels.length === 0 || business.wageLevels.length === 0 || business.inventoryLevels.length === 0) errors.push(`企业 ${business.id} 的配置无效`); checkLocation(business.locationId, `企业 ${business.id}`); checkCondition(business.requirements, `企业 ${business.id}`); checkEffects(business.effects, `企业 ${business.id}`); if (business.partnership) { if (!known.characters.has(business.partnership.characterId) || !Number.isInteger(business.partnership.playerEquityPercent) || business.partnership.playerEquityPercent <= 0 || business.partnership.playerEquityPercent >= 100 || business.partnership.entryPrice <= 0) errors.push(`企业 ${business.id} 的合伙配置无效`); checkCondition(business.partnership.requirements, `企业 ${business.id} 的合伙条件`); } });
  registry.companies?.forEach((company) => {
    let previousYear = 0;
    for (const entry of company.history ?? []) {
      if (!Number.isInteger(entry.startYear) || entry.startYear < 1 || entry.startYear <= previousYear || !entry.title.trim()) {
        errors.push(`公司 ${company.id} 的历史阶段无效`);
      }
      previousYear = entry.startYear;
    }
    const dynamicFlags = new Set<string>();
    for (const dynamicState of company.dynamicStates ?? []) {
      if (!dynamicState.flag.trim() || !dynamicState.title.trim() || dynamicFlags.has(dynamicState.flag)) errors.push(`公司 ${company.id} 的动态状态无效`);
      dynamicFlags.add(dynamicState.flag);
    }
  });
  registry.assets.forEach((asset) => { if (asset.price < 0 || asset.valuation < 0 || asset.volatility < 0) errors.push(`资产 ${asset.id} 的数值无效`); checkCondition(asset.requirements, `资产 ${asset.id}`); checkEffects(asset.effects, `资产 ${asset.id}`); });
  registry.characters.forEach((character) => { if (character.initialRelationship < 0 || character.initialRelationship > 100) errors.push(`人物 ${character.id} 的初始关系无效`); });
  registry.events.forEach((event) => {
    if (event.weight < 0 || event.cooldownDays < 0 || event.choices.length < 2) errors.push(`事件 ${event.id} 至少需要两个选项`);
    checkCondition(event.conditions, `事件 ${event.id}`);
    if (impossibleCondition(event.conditions)) warnings.push(`事件 ${event.id} 静态上可能无法触发：条件互相矛盾`);
    if (event.chain) {
      const chain = registry.eventChains.find((entry) => entry.id === event.chain?.chainId);
      if (!chain) errors.push(`事件 ${event.id} 引用了未知事件链: ${event.chain.chainId}`);
      else {
        const stage = chain.stages.find((entry) => entry.stage === event.chain?.stage);
        if (!stage) errors.push(`事件 ${event.id} 引用了事件链 ${chain.id} 中不存在的阶段`);
        else if (stage.eventId !== event.id) errors.push(`事件 ${event.id} 与事件链 ${chain.id} 的阶段映射不一致`);
      }
    }
    event.choices.forEach((choice: EventChoiceDefinition) => {
      const owner = `事件 ${event.id} 的选项 ${choice.id}`;
      checkEffects(choice.effects, owner, true);
      if (choice.nextEventId && !known.events.has(choice.nextEventId)) errors.push(`事件 ${event.id} 引用了未知后续事件: ${choice.nextEventId}`);
      if (choice.opportunity) {
        if (!known.jobs.has(choice.opportunity.jobId)) errors.push(`${owner} 引用了未知机会工作: ${choice.opportunity.jobId}`);
        if (!known.companies.has(choice.opportunity.companyId)) errors.push(`${owner} 引用了未知机会公司: ${choice.opportunity.companyId}`);
        if (choice.opportunity.expiresInDays <= 0 || choice.opportunity.salaryRange[0] < 0 || choice.opportunity.salaryRange[1] < choice.opportunity.salaryRange[0]) errors.push(`${owner} 的机会数值无效`);
      }
    });
  });
  registry.eventChains.forEach((chain) => {
    if (chain.stages.length === 0) errors.push(`事件链 ${chain.id} 不能为空`);
    chain.stages.forEach((stage) => { if (!known.events.has(stage.eventId)) errors.push(`事件链 ${chain.id} 引用了未知事件: ${stage.eventId}`); checkCondition(stage.conditions, `事件链 ${chain.id} 阶段 ${stage.stage}`); });
  });
  registry.milestones.forEach((milestone) => { checkCondition(milestone.condition, `里程碑 ${milestone.id}`); checkEffects(milestone.effects, `里程碑 ${milestone.id}`); });
  for (const activity of registry.activities ?? []) {
    checkLocation(activity.locationId, `活动 ${activity.id}`);
    if (!activity.options.length) errors.push(`活动 ${activity.id} 必须至少有一个 Option`);
    for (const option of activity.options) {
      if (!Number.isInteger(option.durationMinutes) || option.durationMinutes <= 0 || option.cashCost < 0) errors.push(`活动 ${activity.id} 的 Option ${option.id} 数值无效`);
      checkCondition(option.requirements, `活动 ${activity.id} 的 Option ${option.id}`);
      checkEffects(option.effects, `活动 ${activity.id} 的 Option ${option.id}`);
      if (option.requiredCharacterId && !known.characters.has(option.requiredCharacterId)) errors.push(`活动 ${activity.id} 引用了未知人物: ${option.requiredCharacterId}`);
    }
  }
  for (const venue of registry.venues ?? []) {
    if (!known.locations.has(venue.locationId)) errors.push(`场所 ${venue.id} 引用了未知地点: ${venue.locationId}`);
    if (venue.activityIds.length === 0) errors.push(`场所 ${venue.id} 必须至少绑定一个活动`);
    venue.activityIds.forEach((id) => { if (!known.venueActivities.has(id)) errors.push(`场所 ${venue.id} 引用了未知活动: ${id}`); });
    venue.characterIds?.forEach((id) => { if (!known.characters.has(id)) errors.push(`场所 ${venue.id} 引用了未知人物: ${id}`); });
  }
  for (const service of registry.services ?? []) {
    if (service.price < 0) errors.push(`服务 ${service.id} 的价格无效`);
    checkCondition(service.requirements, `服务 ${service.id}`);
    checkEffects(service.effects, `服务 ${service.id}`);
  }
  for (const subscription of registry.subscriptions ?? []) {
    if (subscription.monthlyFee <= 0) errors.push(`订阅 ${subscription.id} 的月费无效`);
    checkCondition(subscription.requirements, `订阅 ${subscription.id}`);
    checkEffects(subscription.effects, `订阅 ${subscription.id}`);
  }
  for (const interaction of registry.relationshipInteractions ?? []) {
    if (!known.characters.has(interaction.characterId)) errors.push(`互动 ${interaction.id} 引用了未知人物: ${interaction.characterId}`);
    interaction.options.forEach((option) => { checkCondition(option.requirements, `互动 ${interaction.id} 的 Option ${option.id}`); checkEffects(option.effects, `互动 ${interaction.id} 的 Option ${option.id}`); });
  }
  for (const investment of registry.investments ?? []) {
    if (investment.baseValue <= 0 || investment.minimumUnits <= 0 || investment.dailyVolatility < 0) errors.push(`投资 ${investment.id} 的估值或波动配置无效`);
    checkCondition(investment.requirements, `投资 ${investment.id}`);
    if (investment.companyId && !known.companies.has(investment.companyId)) errors.push(`投资 ${investment.id} 引用了未知公司: ${investment.companyId}`);
  }
  for (const company of registry.companies ?? []) {
    checkLocation(company.locationId, `公司 ${company.id}`);
    company.jobIds?.forEach((id) => { if (!known.jobs.has(id)) errors.push(`公司 ${company.id} 引用了未知工作: ${id}`); });
    company.characterIds?.forEach((id) => { if (!known.characters.has(id)) errors.push(`公司 ${company.id} 引用了未知人物: ${id}`); });
    company.investmentIds?.forEach((id) => { if (!known.investments.has(id)) errors.push(`公司 ${company.id} 引用了未知投资: ${id}`); });
  }
  for (const character of registry.characters) checkLocation(character.locationId, `人物 ${character.id}`);
  for (const template of registry.vacancyTemplates ?? []) {
    if (!known.jobs.has(template.jobId)) errors.push('VacancyTemplate ' + template.id + ' 引用了未知工作: ' + template.jobId);
    if (!known.companies.has(template.companyId)) errors.push('VacancyTemplate ' + template.id + ' 引用了未知公司: ' + template.companyId);
    if (template.salaryMultiplierRange[0] <= 0 || template.salaryMultiplierRange[1] < template.salaryMultiplierRange[0]) errors.push('VacancyTemplate ' + template.id + ' 的薪资范围无效');
    if (template.durationDays !== undefined && template.durationDays <= 0) errors.push('VacancyTemplate ' + template.id + ' 的有效期无效');
  }
  for (const dialogue of registry.dialogues ?? []) {
    const lineIds = new Set(dialogue.lines.flatMap((line) => line.id ? [line.id] : []));
    dialogue.choices?.forEach((choice) => { if (choice.nextId && lineIds.size > 0 && !lineIds.has(choice.nextId)) errors.push(`对白 ${dialogue.id} 的选择 ${choice.id} 指向不存在的下一段: ${choice.nextId}`); checkCondition(choice.condition, `对白 ${dialogue.id} 的选择 ${choice.id}`); checkEffects(choice.effects, `对白 ${dialogue.id} 的选择 ${choice.id}`); });
    dialogue.choices?.forEach((choice) => {
      if (!choice.nextId && !choice.outcome) errors.push('对白 ' + dialogue.id + ' 的终止选择 ' + choice.id + ' 缺少 outcome');
      if (choice.outcome && !choice.outcome.narrative.trim()) errors.push('对白 ' + dialogue.id + ' 的选择 ' + choice.id + ' 缺少 outcome 叙事');
    });
    dialogue.lines.forEach((line) => { if (!line.text.trim()) errors.push(`对白 ${dialogue.id} 存在空台词`); if (line.speakerId && !known.characters.has(line.speakerId)) errors.push(`对白 ${dialogue.id} 引用了未知人物: ${line.speakerId}`); });
  }
  for (const storyline of registry.storylines ?? []) {
    const stageIds = new Set(storyline.stages.map((stage) => stage.id));
    if (!stageIds.has(storyline.initialStageId)) errors.push(`剧情 ${storyline.id} 的初始阶段不存在: ${storyline.initialStageId}`);
    storyline.stages.forEach((stage) => {
      if (stage.eventId && !known.events.has(stage.eventId)) errors.push(`剧情 ${storyline.id} 阶段 ${stage.id} 引用了未知事件: ${stage.eventId}`);
      if (stage.dialogueId && !known.dialogues.has(stage.dialogueId)) errors.push(`剧情 ${storyline.id} 阶段 ${stage.id} 引用了未知对白: ${stage.dialogueId}`);
      if (stage.nextStageId && !stageIds.has(stage.nextStageId)) errors.push(`剧情 ${storyline.id} 阶段 ${stage.id} 的下一阶段不存在`);
      stage.branches?.forEach((branch) => { if (branch.nextStageId && !stageIds.has(branch.nextStageId)) errors.push(`剧情 ${storyline.id} 分支 ${branch.id} 的下一阶段不存在`); checkCondition(branch.condition, `剧情 ${storyline.id} 分支 ${branch.id}`); checkEffects(branch.effects, `剧情 ${storyline.id} 分支 ${branch.id}`); });
    });
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const walk = (stageId: string): void => {
      if (visiting.has(stageId)) { warnings.push(`剧情 ${storyline.id} 存在阶段循环，请确认是否有等待或完成出口: ${stageId}`); return; }
      if (visited.has(stageId)) return;
      const stage = storyline.stages.find((entry) => entry.id === stageId);
      if (!stage) return;
      visiting.add(stageId);
      if (stage.nextStageId) walk(stage.nextStageId);
      stage.branches?.forEach((branch) => { if (branch.nextStageId) walk(branch.nextStageId); });
      visiting.delete(stageId);
      visited.add(stageId);
    };
    walk(storyline.initialStageId);
    storyline.stages.forEach((stage) => { if (!visited.has(stage.id)) warnings.push(`剧情 ${storyline.id} 的阶段 ${stage.id} 从初始阶段静态不可达`); });
  }

  return warnings.length ? { valid: errors.length === 0, errors, warnings } : { valid: errors.length === 0, errors };
}
