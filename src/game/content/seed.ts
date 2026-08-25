import type { ContentRegistry } from './contracts';
import { vocabulary } from './vocabulary';

const seedJobs: ContentRegistry['jobs'] = [
  { id: 'job.seed-shop-clerk', contentStatus: 'seed', name: '便利店店员', description: '熟悉收银和货架工作。', tags: ['work', 'starter'], kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 90, careerXp: 1, isLongTerm: true },
  { id: 'job.seed-warehouse', contentStatus: 'seed', name: '仓库助理', description: '整理货物，按时完成订单。', tags: ['work'], kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 120, abilityRequired: 10, careerXp: 2, isLongTerm: true },
  { id: 'job.seed-office', contentStatus: 'seed', name: '办公室助理', description: '处理表格和日常沟通。', tags: ['work', 'office'], kind: 'regular', employmentKind: 'full_time', hours: 8, basePay: 165, abilityRequired: 13, reputationRequired: 2, careerXp: 3, isLongTerm: true, requiredCapabilities: ['home_workspace'], recruitment: { dialogueId: 'dialogue.seed-office-recruitment', intro: [{ speakerId: 'character.seed-lin', text: '最近工作室正好缺一位能把事情理顺的人。' }], interview: [{ speakerId: 'character.seed-lin', text: '你之前做过哪些类似的事情？' }], offerText: '先从办公室助理开始，排班和薪资都写在邀请里。' } },
  { id: 'job.seed-remote', contentStatus: 'seed', name: '远程校对', description: '在家完成短时线上任务。', tags: ['work', 'remote'], kind: 'freelance', employmentKind: 'repeatable_side_job', hours: 4, basePay: 105, careerXp: 2, isLongTerm: false, requiredCapabilities: ['remote_work'] },
];

const seedItems: ContentRegistry['items'] = [
  { id: 'item.seed-coffee', contentStatus: 'seed', name: '咖啡', description: '一杯简单的提神饮品。', tags: ['starter', 'life'], category: 'consumable', price: 25, consumable: true, sellable: false, resaleRatio: 0, lifestyleDelta: 1 },
  { id: 'item.seed-phone', contentStatus: 'seed', name: '手机', description: '保持联系，也能处理简单事务。', tags: ['technology'], category: 'technology', price: 300, consumable: false, sellable: true, resaleRatio: 0.5, lifestyleDelta: 2 },
  { id: 'item.seed-laptop', contentStatus: 'seed', name: '笔记本电脑', description: '解锁远程工作和线上学习。', tags: ['technology', 'remote'], category: 'technology', price: 700, consumable: false, sellable: true, resaleRatio: 0.55, lifestyleDelta: 3, capabilities: ['remote_work', 'home_workspace'] },
  { id: 'item.seed-desk', contentStatus: 'seed', name: '书桌', description: '一个可以专心工作的角落。', tags: ['furniture', 'office'], category: 'furniture', price: 200, consumable: false, sellable: true, resaleRatio: 0.5, lifestyleDelta: 1, capabilities: ['home_workspace'] },
  { id: 'item.seed-shirt', contentStatus: 'seed', name: '合身的衣服', description: '适合日常工作的简单衣服。', tags: ['clothing'], category: 'clothing', price: 150, consumable: false, sellable: true, resaleRatio: 0.35, lifestyleDelta: 2 },
  { id: 'item.seed-watch', contentStatus: 'seed', name: '旧手表', description: '一件有点年代感的配饰。', tags: ['luxury', 'collectible'], category: 'luxury', price: 600, consumable: false, sellable: true, resaleRatio: 0.7, lifestyleDelta: 3 },
  { id: 'item.seed-record', contentStatus: 'seed', name: '收藏唱片', description: '不急着出售，只是喜欢。', tags: ['collectible'], category: 'collectible', price: 450, consumable: false, sellable: true, resaleRatio: 0.65, lifestyleDelta: 4 },
];

const seedHousing: ContentRegistry['housing'] = [
  { id: 'housing.shared-room', contentStatus: 'seed', name: '合租房间', description: '足够开始生活的空间。', tags: ['housing', 'starter'], mode: 'rent', rentPerDay: 15, valuation: 0, lifestyleDelta: 0, furnitureCapacity: 1 },
  { id: 'housing.seed-room', contentStatus: 'seed', name: '单间', description: '安静一些，也能放下几件家具。', tags: ['housing'], mode: 'both', rentPerDay: 35, price: 1200, valuation: 1200, lifestyleDelta: 4, furnitureCapacity: 3 },
  { id: 'housing.seed-apartment', contentStatus: 'seed', name: '普通公寓', description: '有独立空间的稳定住处。', tags: ['housing'], mode: 'both', rentPerDay: 70, price: 4000, valuation: 4000, lifestyleDelta: 10, furnitureCapacity: 6, requirements: { type: 'ability_at_least', amount: 12 } },
];

const seedCharacters: ContentRegistry['characters'] = [
  { id: 'character.seed-lin', contentStatus: 'seed', name: '小林', description: '一起工作的同事。', tags: ['relationship'], identity: '同事', initialRelationship: 8, stages: [{ threshold: 0, label: '认识' }, { threshold: 25, label: '熟悉', unlockEventIds: ['event.seed-referral'] }, { threshold: 50, label: '信任' }] },
  { id: 'character.seed-zhou', contentStatus: 'seed', name: '周姐', description: '偶尔提供实用建议的人。', tags: ['relationship'], identity: '邻居', initialRelationship: 5, stages: [{ threshold: 0, label: '认识' }, { threshold: 25, label: '熟悉', unlockEventIds: ['event.seed-business'] }, { threshold: 50, label: '可靠的朋友' }] },
];

const seedBusinesses: ContentRegistry['businesses'] = [
  { id: 'business.seed-kiosk', contentStatus: 'seed', name: '街角小店', description: '一项简单、容易理解的小生意。', tags: ['business'], price: 2000, baseRevenue: 220, baseGoodsCost: 60, baseWage: 25, baseRent: 35, priceLevels: [0.9, 1, 1.12], wageLevels: [0.9, 1, 1.12], inventoryLevels: [0.8, 1, 1.2], requirements: { type: 'has_capability', capability: 'business_license' } },
];

const seedAssets: ContentRegistry['assets'] = [
  { id: 'asset.seed-rental', contentStatus: 'seed', name: '小套出租房', description: '带来稳定租金的入门资产。', tags: ['asset', 'housing'], kind: 'rental', price: 5000, valuation: 5000, dailyIncome: 80, volatility: 0.01 },
];

const seedEvents: ContentRegistry['events'] = [
  { id: 'event.seed-ambient-coffee', contentStatus: 'seed', name: '午后咖啡', description: '生活里偶尔出现的轻量记录。', tags: ['life'], title: '午后咖啡', body: '林晨请大家喝了咖啡，下午的工作轻松了一点。', category: 'life', weight: 1, cooldownDays: 5, ambient: true, interruptsSimulation: false, choices: [{ id: 'notice', text: '记在日记里', effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] }, { id: 'ignore', text: '继续手头的事', effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] }] },
  { id: 'event.seed-bonus', contentStatus: 'seed', name: '临时订单', description: '工作后遇到一份额外订单。', tags: ['work', 'luck'], title: '临时订单', body: '主管问你是否愿意顺手处理一份额外订单。', category: 'work', weight: 1, cooldownDays: 2, conditions: { type: 'current_job', jobId: 'job.seed-shop-clerk' }, choices: [{ id: 'take', text: '接下来', effects: [{ type: 'cash', amount: 60 }, { type: 'stat', stat: 'reputation', amount: 1 }] }, { id: 'learn', text: '请同事一起做', effects: [{ type: 'cash', amount: 35 }, { type: 'relation', characterId: 'character.seed-lin', amount: 8 }] }] },
  { id: 'event.seed-mentor', contentStatus: 'seed', name: '工作建议', description: '有人愿意分享一点经验。', tags: ['relationship', 'career'], title: '工作建议', body: '周姐看过你最近的安排，给了一个很实际的建议。', category: 'career', weight: 1, cooldownDays: 99, chain: { chainId: 'chain.seed-friends', stage: 1 }, choices: [{ id: 'listen', text: '认真听听', effects: [{ type: 'stat', stat: 'ability', amount: 1 }, { type: 'relation', characterId: 'character.seed-zhou', amount: 8 }, { type: 'relation', characterId: 'character.seed-lin', amount: 8 }] }, { id: 'ask', text: '请她介绍机会', effects: [{ type: 'stat', stat: 'reputation', amount: 2 }, { type: 'relation', characterId: 'character.seed-zhou', amount: 20 }, { type: 'relation', characterId: 'character.seed-lin', amount: 20 }, { type: 'unlock_capability', capability: 'business_license' }] }] },
  { id: 'event.seed-shopping', contentStatus: 'seed', name: '熟悉的店员', description: '购物时遇到熟人。', tags: ['shopping', 'life'], title: '熟悉的店员', body: '店员认出了你，告诉你今天有一项小折扣。', category: 'shopping', weight: 1, cooldownDays: 3, conditions: { type: 'owns_item', itemId: 'item.seed-phone' }, choices: [{ id: 'buy', text: '买下需要的东西', effects: [{ type: 'discount', percent: 10, tags: ['technology'] }, { type: 'stat', stat: 'lifestyle', amount: 1 }] }, { id: 'chat', text: '聊几句再走', effects: [{ type: 'relation', characterId: 'character.seed-lin', amount: 6 }, { type: 'stat', stat: 'reputation', amount: 1 }] }] },
  { id: 'event.seed-referral', contentStatus: 'seed', name: '新的介绍', description: '小林想到一个适合你的岗位。', tags: ['career', 'relationship'], title: '新的介绍', body: '小林提到办公室正在找人，也许值得去试试。', category: 'career', weight: 0.5, cooldownDays: 99, chain: { chainId: 'chain.seed-friends', stage: 2 }, conditions: { type: 'relationship_at_least', characterId: 'character.seed-lin', amount: 25 }, choices: [{ id: 'try', text: '去了解一下', effects: [{ type: 'unlock_job', jobId: 'job.seed-office' }, { type: 'stat', stat: 'reputation', amount: 2 }] }, { id: 'keep', text: '先把手头工作做好', effects: [{ type: 'stat', stat: 'ability', amount: 1 }, { type: 'cash', amount: 50 }] }] },
  { id: 'event.seed-business', contentStatus: 'seed', name: '小生意的消息', description: '周姐提到一个可以尝试的方向。', tags: ['business', 'relationship'], title: '小生意的消息', body: '周姐认识的人准备转让一个小摊位，手续并不复杂。', category: 'business', weight: 0.4, cooldownDays: 99, conditions: { type: 'relationship_at_least', characterId: 'character.seed-zhou', amount: 25 }, choices: [{ id: 'learn', text: '先去看看', effects: [{ type: 'unlock_business', businessId: 'business.seed-kiosk' }, { type: 'unlock_asset', assetId: 'asset.seed-rental' }, { type: 'unlock_capability', capability: 'business_license' }] }, { id: 'save', text: '再多准备一点现金', effects: [{ type: 'cash', amount: 120 }, { type: 'relation', characterId: 'character.seed-zhou', amount: 5 }, { type: 'unlock_asset', assetId: 'asset.seed-rental' }] }] },
];

const seedEventChains: ContentRegistry['eventChains'] = [{
  id: 'chain.seed-friends', contentStatus: 'seed', name: '慢慢熟悉', description: '一段短小的关系链。', tags: ['relationship'],
  stages: [{ stage: 1, eventId: 'event.seed-mentor' }, { stage: 2, eventId: 'event.seed-referral', waitDays: 2, conditions: { type: 'relationship_at_least', characterId: 'character.seed-lin', amount: 25 } }],
}];

const seedMilestones: ContentRegistry['milestones'] = [
  { id: 'milestone.seed-job', contentStatus: 'seed', name: '第一次换岗', description: '找到新的工作方向。', tags: ['work'], condition: { type: 'job_experience_at_least', jobId: 'job.seed-shop-clerk', amount: 1 }, effects: [{ type: 'stat', stat: 'reputation', amount: 1 }] },
  { id: 'milestone.seed-asset', contentStatus: 'seed', name: '第一项资产', description: '开始拥有不只现金的东西。', tags: ['asset'], condition: { type: 'owns_business', businessId: 'business.seed-kiosk' }, effects: [{ type: 'stat', stat: 'lifestyle', amount: 1 }] },
];

const seedActivities: NonNullable<ContentRegistry['activities']> = [
  {
    id: 'activity.seed-movie', contentStatus: 'seed', name: '看电影', description: '给自己留一点不为赚钱服务的时间。', tags: ['leisure'], category: 'film',
    options: [
      { id: 'standard', label: '普通影厅', durationMinutes: 180, cashCost: 68, effects: [{ type: 'attribute', attribute: 'mood', amount: 4 }] },
      { id: 'premium', label: '特别放映', durationMinutes: 240, cashCost: 128, effects: [{ type: 'attribute', attribute: 'mood', amount: 7 }, { type: 'stat', stat: 'lifestyle', amount: 1 }] },
    ],
    financialCategory: 'entertainment',
  },
];

const seedInvestments: NonNullable<ContentRegistry['investments']> = [
  { id: 'investment.seed-index', contentStatus: 'seed', name: '稳健指数基金', description: '分散持有的低风险长期资产。', tags: ['investment', 'low-risk'], kind: 'fund', risk: 'low', baseValue: 102, minimumUnits: 1, dailyDrift: 0.0003, dailyVolatility: 0.002, dividendRate: 0.00005 },
  { id: 'investment.seed-tech', contentStatus: 'seed', name: '科技成长基金', description: '波动更高，也更贴近成长机会。', tags: ['investment', 'growth'], kind: 'fund', risk: 'medium', baseValue: 128, minimumUnits: 1, dailyDrift: 0.0006, dailyVolatility: 0.006, dividendRate: 0.00002 },
];

const seedRelationshipInteractions: NonNullable<ContentRegistry['relationshipInteractions']> = [
  { id: 'interaction.seed-lin-meal', contentStatus: 'seed', name: '和小林吃饭', description: '聊聊最近的工作和生活。', tags: ['relationship', 'social'], characterId: 'character.seed-lin', category: 'meal', options: [{ id: 'meal', label: '一起吃饭', durationMinutes: 180, cashCost: 160, effects: [{ type: 'relation', characterId: 'character.seed-lin', amount: 5 }, { type: 'attribute', attribute: 'network', amount: 1 }] }] },
];

const seedCompanies: NonNullable<ContentRegistry['companies']> = [
  { id: 'company.seed-studio', contentStatus: 'seed', name: '白线工作室', description: '一个愿意给新人机会的小团队。', tags: ['work', 'career'], industry: '内容服务', jobIds: ['job.seed-office', 'job.seed-remote'], characterIds: ['character.seed-lin'] },
];

const seedDialogues: NonNullable<ContentRegistry['dialogues']> = [
  { id: 'dialogue.seed-office-recruitment', contentStatus: 'seed', name: '办公室助理招聘对白', description: '一段短招聘沟通。', tags: ['career'], lines: [{ id: 'intro', speakerId: 'character.seed-lin', text: '最近工作室正好缺一位能把事情理顺的人。' }, { id: 'offer', speakerId: 'character.seed-lin', text: '如果你愿意学习，我们可以先从助理做起。' }], choices: [{ id: 'continue', text: '继续了解', nextId: 'offer' }] },
];

const seedStorylines: NonNullable<ContentRegistry['storylines']> = [
  { id: 'storyline.seed-career', contentStatus: 'seed', name: '第一次职业选择', description: '用稳定字符串阶段承载未来的职业故事。', tags: ['career'], initialStageId: 'meet', stages: [{ id: 'meet', dialogueId: 'dialogue.seed-office-recruitment', nextStageId: 'consider' }, { id: 'consider', branches: [{ id: 'accept', text: '接受机会', nextStageId: 'join' }, { id: 'wait', text: '再想想', nextStageId: 'join' }] }, { id: 'join', nextStageId: undefined }] },
];

export const seedContent: ContentRegistry = { jobs: seedJobs, items: seedItems, housing: seedHousing, businesses: seedBusinesses, assets: seedAssets, characters: seedCharacters, events: seedEvents, eventChains: seedEventChains, milestones: seedMilestones, vocabulary, activities: seedActivities, investments: seedInvestments, relationshipInteractions: seedRelationshipInteractions, companies: seedCompanies, dialogues: seedDialogues, storylines: seedStorylines };
