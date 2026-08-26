import type { AssetDefinition } from '../contracts';

export const officialVehicles = [
  { id: 'asset.used-compact', contentStatus: 'official', name: '实用二手小车', description: '它没有什么值得炫耀的配置，但你第一次可以在想走的时候直接拿起钥匙。', tags: ['asset', 'life'], kind: 'vehicle', price: 35000, valuation: 35000, dailyIncome: 0, volatility: 0, monthlyCost: 300, depreciationRate: 0.004 },
  { id: 'asset.city-sedan', contentStatus: 'official', name: '城市紧凑型轿车', description: '一辆可靠的日常用车，让城市里的距离变得更容易安排。', tags: ['asset', 'life'], kind: 'vehicle', price: 68000, valuation: 68000, dailyIncome: 0, volatility: 0, monthlyCost: 520, depreciationRate: 0.006 },
  { id: 'asset.city-ev', contentStatus: 'official', name: '城市纯电轿车', description: '安静、轻快，适合在城市里通勤，也是一种生活方式的升级。', tags: ['asset', 'technology', 'life'], kind: 'vehicle', price: 148000, valuation: 148000, dailyIncome: 0, volatility: 0, monthlyCost: 420, depreciationRate: 0.005 },
] satisfies readonly AssetDefinition[];
