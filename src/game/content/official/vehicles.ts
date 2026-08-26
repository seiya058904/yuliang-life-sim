import type { AssetDefinition } from '../contracts';

export const officialVehicles = [
  { id: 'asset.used-compact', contentStatus: 'official', name: '实用二手小车', description: '它没有什么值得炫耀的配置，但你第一次可以在想走的时候直接拿起钥匙。', tags: ['asset', 'life'], kind: 'vehicle', price: 35000, valuation: 35000, dailyIncome: 0, volatility: 0, monthlyCost: 300, depreciationRate: 0.004 },
  { id: 'asset.city-sedan', contentStatus: 'official', name: '城市紧凑型轿车', description: '一辆可靠的日常用车，让城市里的距离变得更容易安排。', tags: ['asset', 'life'], kind: 'vehicle', price: 68000, valuation: 68000, dailyIncome: 0, volatility: 0, monthlyCost: 520, depreciationRate: 0.006 },
  { id: 'asset.city-ev', contentStatus: 'official', name: '城市纯电轿车', description: '安静、轻快，适合在城市里通勤，也是一种生活方式的升级。', tags: ['asset', 'technology', 'life'], kind: 'vehicle', price: 148000, valuation: 148000, dailyIncome: 0, volatility: 0, monthlyCost: 420, depreciationRate: 0.005 },
  { id: 'asset.quality-sedan', contentStatus: 'official', name: '品质中型轿车', description: '更宽裕的空间和更稳定的长途表现，适合开始承担更多生活半径之后的选择。', tags: ['asset', 'life'], kind: 'vehicle', price: 236000, valuation: 236000, dailyIncome: 0, volatility: 0, monthlyCost: 980, depreciationRate: 0.005 },
  { id: 'asset.city-suv', contentStatus: 'official', name: '城市多功能 SUV', description: '装载和出行都更从容，但更大的便利也对应更高的日常持有成本。', tags: ['asset', 'life', 'travel'], kind: 'vehicle', price: 318000, valuation: 318000, dailyIncome: 0, volatility: 0, monthlyCost: 1380, depreciationRate: 0.006 },
  { id: 'asset.executive-sedan', contentStatus: 'official', name: '行政级轿车', description: '舒适、安静且体面，适合高频跨区工作与需要更稳定出行体验的阶段。', tags: ['asset', 'life', 'career'], kind: 'vehicle', price: 520000, valuation: 520000, dailyIncome: 0, volatility: 0, monthlyCost: 2200, depreciationRate: 0.007 },
] satisfies readonly AssetDefinition[];
