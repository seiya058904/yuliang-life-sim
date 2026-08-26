import type { ServiceDefinition, SubscriptionDefinition } from '../contracts';

export const officialServices = [
  { id: 'service.haircut-basic', contentStatus: 'official', name: '基础理发', description: '头发没有发生什么戏剧性的变化，只是看起来终于又整齐了一些。', tags: ['life'], price: 68, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'appearance', amount: 1 }] },
  { id: 'service.haircut-premium', contentStatus: 'official', name: '品质理发', description: '离开的时候又看了一眼镜子，今天不用再想着什么时候该去剪头发了。', tags: ['life', 'luxury'], price: 188, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'appearance', amount: 2 }, { type: 'attribute', attribute: 'mood', amount: 2 }] },
  { id: 'service.laundry', contentStatus: 'official', name: '洗衣服务', description: '一袋衣服出去，第二天整整齐齐地回来。', tags: ['life'], price: 45, financialCategory: 'service', effects: [] },
] satisfies readonly ServiceDefinition[];

export const officialSubscriptions = [
  { id: 'subscription.mobile-basic', contentStatus: 'official', name: '基础通信套餐', description: '满足日常通信，不为流量和功能额外操心。', tags: ['life'], monthlyFee: 39 },
  { id: 'subscription.internet-basic', contentStatus: 'official', name: '基础宽带', description: '适合普通上网、学习和基础线上工作。', tags: ['life', 'technology'], monthlyFee: 80 },
  { id: 'subscription.music', contentStatus: 'official', name: '音乐会员', description: '为通勤和家里的休息时间留一点背景音乐。', tags: ['life', 'leisure'], monthlyFee: 18, effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] },
] satisfies readonly SubscriptionDefinition[];
