import type { MilestoneDefinition } from '../contracts';

export const officialMilestones = [
  {
    "id": "milestone.seed-job",
    "contentStatus": "official",
    "name": "第一份稳定收入",
    "description": "完成第一轮正式工作，开始有了自己的现金流。",
    "tags": [
      "work"
    ],
    "condition": {
      "type": "job_experience_at_least",
      "jobId": "job.seed-shop-clerk",
      "amount": 1
    },
    "effects": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 1
      }
    ]
  },
  {
    "id": "milestone.first-laptop",
    "contentStatus": "official",
    "name": "工作方式改变了",
    "description": "拥有第一台真正能用于工作的笔记本电脑。",
    "tags": [
      "technology",
      "career"
    ],
    "condition": {
      "type": "owns_item",
      "itemId": "item.seed-laptop"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "ability",
        "amount": 1
      }
    ]
  },
  {
    "id": "milestone.better-home",
    "contentStatus": "official",
    "name": "自己的房间",
    "description": "第一次从合租房搬到独立空间。",
    "tags": [
      "housing",
      "life"
    ],
    "condition": {
      "type": "housing_is",
      "housingId": "housing.seed-room"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "lifestyle",
        "amount": 2
      }
    ]
  },
  {
    "id": "milestone.remote-work",
    "contentStatus": "official",
    "name": "新的工作方式",
    "description": "正式拥有远程工作的能力。",
    "tags": [
      "remote",
      "career"
    ],
    "condition": {
      "type": "has_capability",
      "capability": "remote_work"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 1
      }
    ]
  },
  {
    "id": "milestone.seed-asset",
    "contentStatus": "official",
    "name": "第一份生意",
    "description": "第一次拥有能够每天产生经营结果的生意。",
    "tags": [
      "business",
      "asset"
    ],
    "condition": {
      "type": "owns_business",
      "businessId": "business.seed-kiosk"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "lifestyle",
        "amount": 2
      }
    ]
  },
  {
    "id": "milestone.first-rental",
    "contentStatus": "official",
    "name": "第一份租金收入",
    "description": "第一次拥有能够带来租金的资产。",
    "tags": [
      "asset",
      "housing"
    ],
    "condition": {
      "type": "owns_asset",
      "assetId": "asset.seed-rental"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 2
      }
    ]
  },
  {
    "id": "milestone.reputation-25",
    "contentStatus": "official",
    "name": "开始有人认识你",
    "description": "声誉达到 25，更多机会会自然出现。",
    "tags": [
      "career",
      "relationship"
    ],
    "condition": {
      "type": "reputation_at_least",
      "amount": 25
    },
    "effects": [
      {
        "type": "stat",
        "stat": "lifestyle",
        "amount": 2
      },
      {
        "type": "unlock_business",
        "businessId": "business.service-studio"
      },
      {
        "type": "unlock_business",
        "businessId": "business.consulting-studio"
      },
      {
        "type": "unlock_housing",
        "housingId": "housing.city-condo"
      }
    ]
  },
  {
    "id": "milestone.cash-10000",
    "contentStatus": "official",
    "name": "第一万现金",
    "description": "手上的现金第一次达到五位数。",
    "tags": [
      "asset",
      "life"
    ],
    "condition": {
      "type": "cash_at_least",
      "amount": 10000
    },
    "effects": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 3
      }
    ]
  },
  {
    "id": "milestone.first-investment-dividend",
    "contentStatus": "official",
    "name": "第一笔投资分红",
    "description": "第一次看到投资产生了真正进入现金流的收入。",
    "tags": [
      "investment",
      "life"
    ],
    "condition": {
      "type": "flag",
      "flag": "investment_dividend_received"
    },
    "effects": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 1
      }
    ]
  }
] satisfies readonly MilestoneDefinition[];
