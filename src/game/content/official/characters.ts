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
    "preferredGiftTags": ["dessert", "flower"],
    "initialRelationship": 8,
    "careerHistory": [
      { "startYear": 1, "title": "门店员工", "companyId": "company.yuanwang" },
      { "startYear": 3, "title": "电商运营助理", "companyId": "company.starbridge" },
      { "startYear": 6, "title": "高级运营", "companyId": "company.starbridge" },
      { "startYear": 10, "title": "区域运营主管" }
    ],
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
    "preferredGiftTags": ["flower", "dessert"],
    "preferredActivityTags": ["film", "culture"],
    "initialRelationship": 5,
    "careerHistory": [
      { "startYear": 1, "title": "社区运营专员", "companyId": "company.yuanwang" },
      { "startYear": 4, "title": "城市生活项目负责人", "companyId": "company.yuanwang" },
      { "startYear": 8, "title": "独立生活顾问" }
    ],
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
    "preferredInteractionCategories": ["meal"],
    "preferredGiftTags": ["coffee"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "招聘助理", "companyId": "company.clearview-consulting" },
      { "startYear": 5, "title": "招聘顾问", "companyId": "company.clearview-consulting" },
      { "startYear": 9, "title": "独立职业顾问" }
    ],
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
    "preferredInteractionCategories": ["work"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "技术支持", "companyId": "company.xinghe" },
      { "startYear": 4, "title": "数码店主" },
      { "startYear": 8, "title": "远程项目合伙人" }
    ],
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
    "preferredInteractionCategories": ["meal"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "房产顾问", "companyId": "company.yuanwang" },
      { "startYear": 5, "title": "独立房产经纪" }
    ],
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
  },
  {
    "id": "character.xuheng",
    "contentStatus": "official",
    "name": "许衡",
    "description": "资深招聘顾问，专门为企业寻找合适的中高级人才。",
    "tags": [
      "relationship",
      "career",
      "headhunter"
    ],
    "identity": "资深招聘顾问 / 猎头",
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "招聘顾问", "companyId": "company.clearview-consulting" },
      { "startYear": 7, "title": "资深猎头" }
    ],
    "locationId": "location.central",
    "stages": [
      {
        "threshold": 0,
        "label": "职业联系"
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
        "label": "长期合作"
      }
    ]
  },
  {
    "id": "character.guqing",
    "contentStatus": "official",
    "name": "顾清",
    "description": "澄明商业咨询的项目负责人，愿意把研究工作带到真正的客户现场。",
    "tags": ["relationship", "career"],
    "identity": "咨询项目负责人",
    "preferredInteractionCategories": ["work"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "研究顾问", "companyId": "company.clearview-consulting" },
      { "startYear": 4, "title": "项目负责人", "companyId": "company.clearview-consulting" },
      { "startYear": 9, "title": "清简咨询合伙人" }
    ],
    "locationId": "location.central",
    "stages": [
      { "threshold": 0, "label": "项目联系" },
      { "threshold": 25, "label": "熟悉" },
      { "threshold": 50, "label": "信任" },
      { "threshold": 75, "label": "长期合作" }
    ]
  }
] satisfies readonly CharacterDefinition[];
