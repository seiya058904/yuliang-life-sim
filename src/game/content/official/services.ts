import type { ServiceDefinition, SubscriptionDefinition } from '../contracts';

export const officialServices = [
  { id: 'service.haircut-basic', contentStatus: 'official', name: '基础理发', description: '头发没有发生什么戏剧性的变化，只是看起来终于又整齐了一些。', tags: ['life'], price: 68, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'appearance', amount: 1 }] },
  { id: 'service.haircut-premium', contentStatus: 'official', name: '品质理发', description: '离开的时候又看了一眼镜子，今天不用再想着什么时候该去剪头发了。', tags: ['life', 'luxury'], price: 188, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'appearance', amount: 2 }, { type: 'attribute', attribute: 'mood', amount: 2 }] },
  { id: 'service.laundry', contentStatus: 'official', name: '洗衣服务', description: '一袋衣服出去，第二天整整齐齐地回来。', tags: ['life'], price: 45, financialCategory: 'service', effects: [] },
  { id: 'service.personal-styling', contentStatus: 'official', name: '专业形象咨询', description: '把衣柜和工作场合重新整理一遍，减少临出门时的犹豫。', tags: ['life', 'luxury'], price: 380, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'appearance', amount: 2 }, { type: 'attribute', attribute: 'communication', amount: 1 }] },
  { id: 'service.home-cleaning-basic', contentStatus: 'official', name: '基础家政清洁', description: '让住处恢复到可以好好休息的状态，不把生活变成维护清单。', tags: ['life'], price: 120, financialCategory: 'service', effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] },
  { id: 'service.vehicle-annual', contentStatus: 'official', name: '车辆年度保养', description: '不是每天都要操心的维护，只是在车辆陪你走过一段时间后，安排一次基础检查。', tags: ['life', 'maintenance'], price: 600, financialCategory: 'maintenance', requirements: { type: 'any', conditions: [{ type: 'owns_asset', assetId: 'asset.used-compact' }, { type: 'owns_asset', assetId: 'asset.city-sedan' }, { type: 'owns_asset', assetId: 'asset.city-ev' }, { type: 'owns_asset', assetId: 'asset.quality-sedan' }, { type: 'owns_asset', assetId: 'asset.city-suv' }, { type: 'owns_asset', assetId: 'asset.executive-sedan' }] }, effects: [] },
] satisfies readonly ServiceDefinition[];

export const officialSubscriptions = [
  { id: 'subscription.mobile-basic', contentStatus: 'official', name: '基础通信套餐', description: '满足日常通信，不为流量和功能额外操心。', tags: ['life'], monthlyFee: 39 },
  { id: 'subscription.internet-basic', contentStatus: 'official', name: '基础宽带', description: '适合普通上网、学习和基础线上工作。', tags: ['life', 'technology'], monthlyFee: 80 },
  { id: 'subscription.music', contentStatus: 'official', name: '音乐会员', description: '为通勤和家里的休息时间留一点背景音乐。', tags: ['life', 'leisure'], monthlyFee: 18, effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] },
  { id: 'subscription.video', contentStatus: 'official', name: '视频会员', description: '给晚上的休息留一点轻松的选择，不需要每次重新购买。', tags: ['life', 'leisure'], monthlyFee: 28, effects: [{ type: 'attribute', attribute: 'mood', amount: 1 }] },
  { id: 'subscription.cloud-storage', contentStatus: 'official', name: '云存储空间', description: '给照片、工作资料和生活记录留一份稳定的空间。', tags: ['life', 'technology'], monthlyFee: 36 },
] satisfies readonly SubscriptionDefinition[];
