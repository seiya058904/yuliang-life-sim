import type { BusinessDefinition } from '../contracts';

export const officialBusinesses = [
  {
    "id": "business.seed-kiosk",
    "contentStatus": "official",
    "name": "早餐与咖啡档",
    "description": "第一份真正不完全依赖自己工时的经营收入。",
    "tags": [
      "business",
      "starter"
    ],
    "locationId": "location.central",
    "price": 3200,
    "baseRevenue": 420,
    "baseGoodsCost": 140,
    "baseWage": 70,
    "baseRent": 60,
    "priceLevels": [
      0.92,
      1,
      1.12
    ],
    "wageLevels": [
      0.9,
      1,
      1.12
    ],
    "inventoryLevels": [
      0.85,
      1,
      1.2
    ],
    "requirements": {
      "type": "has_capability",
      "capability": "business_license"
    }
  },
  {
    "id": "business.online-store",
    "contentStatus": "official",
    "name": "线上小店",
    "description": "依赖设备和选品判断，固定成本较低，适合中期经营。",
    "tags": [
      "business",
      "remote",
      "technology"
    ],
    "locationId": "location.industrial",
    "price": 7800,
    "baseRevenue": 840,
    "baseGoodsCost": 350,
    "baseWage": 120,
    "baseRent": 40,
    "priceLevels": [
      0.92,
      1,
      1.1
    ],
    "wageLevels": [
      0.9,
      1,
      1.12
    ],
    "inventoryLevels": [
      0.82,
      1,
      1.18
    ],
    "requirements": {
      "type": "all",
      "conditions": [
        {
          "type": "has_capability",
          "capability": "business_license"
        },
        {
          "type": "has_capability",
          "capability": "remote_work"
        },
        {
          "type": "ability_at_least",
          "amount": 18
        }
      ]
    },
    "partnership": {
      "characterId": "character.seed-zhou",
      "playerEquityPercent": 50,
      "entryPrice": 4200,
      "requirements": {
        "type": "relationship_at_least",
        "characterId": "character.seed-zhou",
        "amount": 20
      }
    }
  },
  {
    "id": "business.service-studio",
    "contentStatus": "official",
    "name": "社区服务工作室",
    "description": "规模更大一些，需要稳定声誉和更成熟的经营判断。",
    "tags": [
      "business",
      "career"
    ],
    "locationId": "location.riverside",
    "price": 14500,
    "baseRevenue": 1320,
    "baseGoodsCost": 320,
    "baseWage": 420,
    "baseRent": 160,
    "priceLevels": [
      0.93,
      1,
      1.09
    ],
    "wageLevels": [
      0.9,
      1,
      1.12
    ],
    "inventoryLevels": [
      0.85,
      1,
      1.15
    ],
    "requirements": {
      "type": "all",
      "conditions": [
        {
          "type": "has_capability",
          "capability": "business_license"
        },
        {
          "type": "ability_at_least",
          "amount": 22
        },
        {
          "type": "reputation_at_least",
          "amount": 15
        }
      ]
    }
  },
  {
    "id": "business.consulting-studio",
    "contentStatus": "official",
    "name": "咨询工作室",
    "description": "把研究、分析和客户项目变成可持续经营的专业服务企业。",
    "tags": [
      "business",
      "career"
    ],
    "locationId": "location.central",
    "price": 24000,
    "baseRevenue": 2100,
    "baseGoodsCost": 180,
    "baseWage": 620,
    "baseRent": 220,
    "priceLevels": [
      0.94,
      1,
      1.1
    ],
    "wageLevels": [
      0.9,
      1,
      1.12
    ],
    "inventoryLevels": [
      0.9,
      1,
      1.1
    ],
    "requirements": {
      "type": "all",
      "conditions": [
        {
          "type": "has_capability",
          "capability": "business_license"
        },
        {
          "type": "ability_at_least",
          "amount": 28
        },
        {
          "type": "reputation_at_least",
          "amount": 20
        }
      ]
    },
    "partnership": {
      "characterId": "character.guqing",
      "playerEquityPercent": 60,
      "entryPrice": 12000,
      "requirements": {
        "type": "all",
        "conditions": [
          {
            "type": "relationship_at_least",
            "characterId": "character.guqing",
            "amount": 40
          },
          {
            "type": "flag",
            "flag": "consulting_project_completed"
          }
        ]
      }
    }
  }
] satisfies readonly BusinessDefinition[];
