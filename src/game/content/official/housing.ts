import type { HousingDefinition } from '../contracts';

export const officialHousing = [
  {
    "id": "housing.shared-room",
    "contentStatus": "official",
    "name": "合租房间",
    "description": "便宜、够住，是刚开始积累现金时最合适的选择。",
    "tags": [
      "housing",
      "starter"
    ],
    "mode": "rent",
    "rentPerDay": 18,
    "valuation": 0,
    "lifestyleDelta": 0,
    "furnitureCapacity": 1
  },
  {
    "id": "housing.seed-room",
    "contentStatus": "official",
    "name": "独立单间",
    "description": "有自己的门，也终于能把几件东西好好放下。",
    "tags": [
      "housing"
    ],
    "mode": "both",
    "rentPerDay": 42,
    "price": 5800,
    "valuation": 5800,
    "lifestyleDelta": 5,
    "furnitureCapacity": 3
  },
  {
    "id": "housing.seed-apartment",
    "contentStatus": "official",
    "name": "一居室公寓",
    "description": "空间完整，生活开始有明显的稳定感。",
    "tags": [
      "housing"
    ],
    "mode": "both",
    "rentPerDay": 78,
    "price": 12800,
    "valuation": 12800,
    "lifestyleDelta": 11,
    "furnitureCapacity": 6,
    "requirements": {
      "type": "ability_at_least",
      "amount": 13
    }
  },
  {
    "id": "housing.sunny-apartment",
    "contentStatus": "official",
    "name": "采光公寓",
    "description": "更好的采光和空间，让住房从“够用”变成“喜欢”。",
    "tags": [
      "housing",
      "life"
    ],
    "mode": "both",
    "rentPerDay": 118,
    "price": 24000,
    "valuation": 24000,
    "lifestyleDelta": 17,
    "furnitureCapacity": 8,
    "requirements": {
      "type": "all",
      "conditions": [
        {
          "type": "ability_at_least",
          "amount": 17
        },
        {
          "type": "reputation_at_least",
          "amount": 6
        }
      ]
    }
  },
  {
    "id": "housing.modern-apartment",
    "contentStatus": "official",
    "name": "现代两居室",
    "description": "有独立工作区和更完整的生活空间。",
    "tags": [
      "housing",
      "luxury"
    ],
    "mode": "both",
    "rentPerDay": 185,
    "price": 42000,
    "valuation": 42000,
    "lifestyleDelta": 26,
    "furnitureCapacity": 11,
    "requirements": {
      "type": "reputation_at_least",
      "amount": 15
    },
    "effects": [
      {
        "type": "unlock_capability",
        "capability": "home_workspace"
      }
    ]
  },
  {
    "id": "housing.city-condo",
    "contentStatus": "official",
    "name": "市中心公寓",
    "description": "位置、空间和生活便利都到了另一个阶段。",
    "tags": [
      "housing",
      "luxury"
    ],
    "mode": "both",
    "rentPerDay": 290,
    "price": 78000,
    "valuation": 78000,
    "lifestyleDelta": 38,
    "furnitureCapacity": 15,
    "requirements": {
      "type": "reputation_at_least",
      "amount": 25
    },
    "effects": [
      {
        "type": "unlock_capability",
        "capability": "home_workspace"
      }
    ]
  }
] satisfies readonly HousingDefinition[];

