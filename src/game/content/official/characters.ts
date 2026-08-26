import type { CharacterDefinition } from '../contracts';

export const officialCharacters = [
  {
    "id": "character.seed-lin",
    "contentStatus": "official",
    "name": "林晨",
    "description": "最早认识的同事之一，消息灵通，也愿意分享机会。",
    "tags": [
      "relationship",
      "career"
    ],
    "identity": "同事",
    "initialRelationship": 8,
    "locationId": "location.central",
    "stages": [
      {
        "threshold": 0,
        "label": "认识"
      },
      {
        "threshold": 25,
        "label": "熟悉",
        "unlockEventIds": [
          "event.seed-referral"
        ]
      },
      {
        "threshold": 50,
        "label": "信任",
        "unlockEventIds": [
          "event.friend-side-project"
        ]
      },
      {
        "threshold": 75,
        "label": "老朋友"
      }
    ]
  },
  {
    "id": "character.seed-zhou",
    "contentStatus": "official",
    "name": "周妍",
    "description": "住得不远，做事很稳，知道不少实际的生活和经营信息。",
    "tags": [
      "relationship",
      "business"
    ],
    "identity": "邻居",
    "initialRelationship": 5,
    "locationId": "location.riverside",
    "stages": [
      {
        "threshold": 0,
        "label": "认识"
      },
      {
        "threshold": 25,
        "label": "熟悉",
        "unlockEventIds": [
          "event.seed-business"
        ]
      },
      {
        "threshold": 50,
        "label": "可靠的朋友",
        "unlockEventIds": [
          "event.business-license-help"
        ]
      },
      {
        "threshold": 75,
        "label": "长期伙伴"
      }
    ]
  },
  {
    "id": "character.chenyu",
    "contentStatus": "official",
    "name": "陈宇",
    "description": "做招聘和职业对接，擅长把人放到更合适的位置。",
    "tags": [
      "relationship",
      "career"
    ],
    "identity": "招聘顾问",
    "initialRelationship": 0,
    "locationId": "location.central",
    "stages": [
      {
        "threshold": 0,
        "label": "认识"
      },
      {
        "threshold": 25,
        "label": "熟悉"
      },
      {
        "threshold": 50,
        "label": "信任"
      },
      {
        "threshold": 75,
        "label": "长期联系人"
      }
    ]
  },
  {
    "id": "character.xuke",
    "contentStatus": "official",
    "name": "徐可",
    "description": "数码店店主，也接一些线上项目，对设备和远程工作很熟。",
    "tags": [
      "relationship",
      "technology"
    ],
    "identity": "数码店店主",
    "initialRelationship": 0,
    "locationId": "location.central",
    "stages": [
      {
        "threshold": 0,
        "label": "认识",
        "unlockEventIds": [
          "event.tech-chat"
        ]
      },
      {
        "threshold": 25,
        "label": "熟悉",
        "unlockEventIds": [
          "event.tech-contract"
        ]
      },
      {
        "threshold": 50,
        "label": "信任"
      },
      {
        "threshold": 75,
        "label": "合作伙伴"
      }
    ]
  },
  {
    "id": "character.heyan",
    "contentStatus": "official",
    "name": "何彦",
    "description": "负责附近几套房源的经纪人，消息多，讲话也直接。",
    "tags": [
      "relationship",
      "housing"
    ],
    "identity": "房产经纪",
    "initialRelationship": 0,
    "locationId": "location.riverside",
    "stages": [
      {
        "threshold": 0,
        "label": "认识"
      },
      {
        "threshold": 25,
        "label": "熟悉",
        "unlockEventIds": [
          "event.property-lead"
        ]
      },
      {
        "threshold": 50,
        "label": "信任"
      },
      {
        "threshold": 75,
        "label": "长期联系人"
      }
    ]
  }
] satisfies readonly CharacterDefinition[];
