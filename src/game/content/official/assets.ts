import type { AssetDefinition } from '../contracts';

export const officialAssets = [
  {
    "id": "asset.seed-rental",
    "contentStatus": "official",
    "name": "单间出租资产",
    "description": "金额不算夸张的第一套出租资产，收益稳定。",
    "tags": [
      "asset",
      "housing"
    ],
    "kind": "rental",
    "price": 7200,
    "valuation": 7200,
    "dailyIncome": 105,
    "volatility": 0.008
  },
  {
    "id": "asset.index-fund",
    "contentStatus": "official",
    "name": "指数基金组合",
    "description": "波动不大，收益不高，但很适合作为第一笔金融资产。",
    "tags": [
      "asset"
    ],
    "kind": "investment",
    "price": 2600,
    "valuation": 2600,
    "dailyIncome": 16,
    "volatility": 0.018,
    "requirements": {
      "type": "has_capability",
      "capability": "market_insight"
    }
  },
  {
    "id": "asset.gold-holding",
    "contentStatus": "official",
    "name": "黄金小份额",
    "description": "偏保值的资产，现金流很少，价值会缓慢波动。",
    "tags": [
      "asset",
      "collectible"
    ],
    "kind": "investment",
    "price": 4200,
    "valuation": 4200,
    "dailyIncome": 8,
    "volatility": 0.025,
    "requirements": {
      "type": "has_capability",
      "capability": "market_insight"
    }
  },
  {
    "id": "asset.apartment-rental",
    "contentStatus": "official",
    "name": "小户型出租房",
    "description": "真正有存在感的中期资产，带来稳定租金。",
    "tags": [
      "asset",
      "housing"
    ],
    "kind": "rental",
    "price": 22000,
    "valuation": 22000,
    "dailyIncome": 320,
    "volatility": 0.006
  },
  {
    "id": "asset.vintage-watch",
    "contentStatus": "official",
    "name": "限量机械腕表",
    "description": "一件可以长期佩戴的收藏级资产，价值会随市场轻微波动，不保证升值。",
    "tags": [
      "asset",
      "collectible",
      "luxury"
    ],
    "kind": "collectible",
    "price": 18000,
    "valuation": 18000,
    "dailyIncome": 0,
    "volatility": 0.035,
    "requirements": {
      "type": "has_capability",
      "capability": "market_insight"
    }
  },
  {
    "id": "asset.fine-jewelry",
    "contentStatus": "official",
    "name": "精品珠宝",
    "description": "一件可以长期佩戴的收藏资产，估值会缓慢波动，不保证升值。",
    "tags": [
      "asset",
      "collectible",
      "luxury"
    ],
    "kind": "collectible",
    "price": 28000,
    "valuation": 28000,
    "dailyIncome": 0,
    "volatility": 0.028,
    "requirements": {
      "type": "has_capability",
      "capability": "market_insight"
    }
  }
] satisfies readonly AssetDefinition[];
