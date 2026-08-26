import type { RelationshipInteractionDefinition } from '../contracts';

export const officialRelationshipInteractions = [
  {
    id: 'interaction.coffee-with-recruiter',
    contentStatus: 'official',
    name: '和陈宇喝咖啡',
    description: '聊聊最近的工作方向，也听听招聘市场的消息。',
    tags: ['relationship', 'career', 'social'],
    characterId: 'character.chenyu',
    category: 'meal',
    options: [{ id: 'coffee', label: '一起喝咖啡', durationMinutes: 120, cashCost: 100, effects: [{ type: 'relation', characterId: 'character.chenyu', amount: 4 }, { type: 'attribute', attribute: 'mood', amount: 3 }] }],
  },
  {
    id: 'interaction.tech-coffee',
    contentStatus: 'official',
    name: '和徐可聊设备',
    description: '从一杯咖啡开始，交换一些关于远程工作的实际经验。',
    tags: ['relationship', 'technology', 'social'],
    characterId: 'character.xuke',
    category: 'work',
    options: [{ id: 'coffee', label: '聊聊远程工作', durationMinutes: 120, cashCost: 100, effects: [{ type: 'relation', characterId: 'character.xuke', amount: 4 }, { type: 'attribute', attribute: 'knowledge', amount: 1 }] }],
  },
  {
    id: 'interaction.dinner-with-agent',
    contentStatus: 'official',
    name: '和何彦吃饭',
    description: '听房产经纪人讲讲附近的房源和生活变化。',
    tags: ['relationship', 'housing', 'social'],
    characterId: 'character.heyan',
    category: 'meal',
    options: [{ id: 'dinner', label: '一起吃饭', durationMinutes: 180, cashCost: 160, effects: [{ type: 'relation', characterId: 'character.heyan', amount: 5 }, { type: 'attribute', attribute: 'mood', amount: 4 }] }],
  },
  {
    id: 'interaction.business-with-zhou',
    contentStatus: 'official',
    name: '和周妍看看小生意',
    description: '聊聊附近的经营机会，也把生活里的实际问题说清楚。',
    tags: ['relationship', 'business', 'social'],
    characterId: 'character.seed-zhou',
    category: 'business',
    options: [{ id: 'visit', label: '一起看看店', durationMinutes: 180, cashCost: 80, effects: [{ type: 'relation', characterId: 'character.seed-zhou', amount: 7 }, { type: 'attribute', attribute: 'network', amount: 1 }] }],
  },
] satisfies readonly RelationshipInteractionDefinition[];
