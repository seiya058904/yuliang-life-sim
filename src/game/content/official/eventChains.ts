import type { EventChainDefinition } from '../contracts';

export const officialEventChains = [
  {
    "id": "chain.seed-friends",
    "contentStatus": "official",
    "name": "从同事到合作",
    "description": "从工作闲聊开始，逐渐变成稳定的职业互助。",
    "tags": [
      "relationship",
      "career"
    ],
    "stages": [
      {
        "stage": 1,
        "eventId": "event.seed-mentor"
      },
      {
        "stage": 2,
        "eventId": "event.seed-referral",
        "waitDays": 2,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.seed-lin",
          "amount": 25
        }
      },
      {
        "stage": 3,
        "eventId": "event.friend-side-project",
        "waitDays": 3,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.seed-lin",
          "amount": 50
        }
      }
    ]
  },
  {
    "id": "chain.tech-contact",
    "contentStatus": "official",
    "name": "设备与远程工作",
    "description": "从一次数码店闲聊，逐渐连接到设备优惠和线上工作。",
    "tags": [
      "relationship",
      "technology",
      "career"
    ],
    "stages": [
      {
        "stage": 1,
        "eventId": "event.tech-chat"
      },
      {
        "stage": 2,
        "eventId": "event.tech-bundle",
        "waitDays": 2,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.xuke",
          "amount": 8
        }
      },
      {
        "stage": 3,
        "eventId": "event.tech-contract",
        "waitDays": 3,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.xuke",
          "amount": 15
        }
      }
    ]
  },
  {
    "id": "chain.housing-path",
    "contentStatus": "official",
    "name": "住得更好",
    "description": "从换房后的新联系人，慢慢走到更好的住房和房产机会。",
    "tags": [
      "relationship",
      "housing"
    ],
    "stages": [
      {
        "stage": 1,
        "eventId": "event.new-neighbor"
      },
      {
        "stage": 2,
        "eventId": "event.home-upgrade-tip",
        "waitDays": 2,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.heyan",
          "amount": 8
        }
      },
      {
        "stage": 3,
        "eventId": "event.property-lead",
        "waitDays": 3,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.heyan",
          "amount": 15
        }
      }
    ]
  },
  {
    "id": "chain.business-path",
    "contentStatus": "official",
    "name": "第一份生意",
    "description": "从一条小生意消息开始，逐渐进入稳定经营。",
    "tags": [
      "business",
      "relationship"
    ],
    "stages": [
      {
        "stage": 1,
        "eventId": "event.seed-business",
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.seed-zhou",
          "amount": 13
        }
      },
      {
        "stage": 2,
        "eventId": "event.business-license-help",
        "waitDays": 2,
        "conditions": {
          "type": "relationship_at_least",
          "characterId": "character.seed-zhou",
          "amount": 20
        }
      },
      {
        "stage": 3,
        "eventId": "event.business-partnership",
        "waitDays": 3,
        "conditions": {
          "type": "owns_business",
          "businessId": "business.seed-kiosk"
        }
      }
    ]
  }
] satisfies readonly EventChainDefinition[];

