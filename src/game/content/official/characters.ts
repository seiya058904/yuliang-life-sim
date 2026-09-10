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
    "preferredInteractionCategories": ["outing"],
    "preferredActivityTags": ["culture", "hobby"],
    "initialRelationship": 8,
    "careerHistory": [
      { "startYear": 1, "title": "门店员工", "companyId": "company.yuanwang" },
      { "startYear": 3, "title": "电商运营助理", "companyId": "company.starbridge-ecommerce" },
      { "startYear": 3, "title": "临江内容工作室 · 联合创始人", "branchCondition": { "type": "completed_event", "eventId": "event.city-transit-upgrade" } },
      { "startYear": 6, "title": "高级运营", "companyId": "company.starbridge-ecommerce" },
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
      { "startYear": 4, "title": "临江买手店主理人", "branchCondition": { "type": "completed_event", "eventId": "event.city-transit-upgrade" } },
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
    "preferredActivityTags": ["technology", "social"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "技术支持", "companyId": "company.xinghe" },
      { "startYear": 4, "title": "数码店主" },
      { "startYear": 4, "title": "星河企业服务线 · 技术合伙人", "branchCondition": { "type": "flag", "flag": "xinghe_service_line_launched" } },
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
    "preferredActivityTags": ["meal", "social"],
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
      { "startYear": 7, "title": "资深猎头" },
      { "startYear": 7, "title": "自营高管寻访工作室", "branchCondition": { "type": "flag", "flag": "xinghe_service_line_launched" } }
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
  },
  {
    "id": "character.song-yuran",
    "contentStatus": "official",
    "name": "宋雨然",
    "description": "在旧城租了间小工作室的独立插画师，接商稿也画自己的小绘本。",
    "tags": ["relationship"],
    "identity": "独立插画师",
    "preferredInteractionCategories": ["outing"],
    "preferredGiftTags": ["flower", "book"],
    "preferredActivityTags": ["culture", "hobby"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "广告公司美术执行", "companyId": "company.frame-media" },
      { "startYear": 4, "title": "独立插画师" },
      { "startYear": 8, "title": "原创绘本签约作者", "branchCondition": { "type": "completed_event", "eventId": "event.city-transit-upgrade" } }
    ],
    "locationId": "location.old-town",
    "stages": [
      { "threshold": 0, "label": "认识" },
      { "threshold": 25, "label": "熟悉" },
      { "threshold": 50, "label": "欣赏彼此的作品" },
      { "threshold": 75, "label": "长期朋友" }
    ]
  },
  {
    "id": "character.tang-ke",
    "contentStatus": "official",
    "name": "唐柯",
    "description": "临江区健身房的私教，说话直接，习惯用训练计划的方式帮朋友解决问题。",
    "tags": ["relationship", "life"],
    "identity": "健身房私教",
    "preferredInteractionCategories": ["meal"],
    "preferredGiftTags": ["coffee"],
    "preferredActivityTags": ["fitness", "social"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "会籍顾问", "companyId": "company.qiming" },
      { "startYear": 3, "title": "私教" },
      { "startYear": 7, "title": "门店培训负责人", "branchCondition": { "type": "flag", "flag": "xinghe_service_line_launched" } }
    ],
    "locationId": "location.riverside",
    "stages": [
      { "threshold": 0, "label": "认识" },
      { "threshold": 25, "label": "熟悉" },
      { "threshold": 50, "label": "训练搭子" },
      { "threshold": 75, "label": "长期朋友" }
    ]
  },
  {
    "id": "character.luo-lan",
    "contentStatus": "official",
    "name": "罗岚",
    "description": "旧城二手书店的主理人，总能把一本冷门书推荐到人的心坎上。",
    "tags": ["relationship"],
    "identity": "二手书店主理人",
    "preferredInteractionCategories": ["work"],
    "preferredGiftTags": ["book", "dessert"],
    "preferredActivityTags": ["culture", "hobby"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "出版社编辑" },
      { "startYear": 5, "title": "二手书店主理人" },
      { "startYear": 9, "title": "社区共读空间发起人", "branchCondition": { "type": "completed_event", "eventId": "event.city-transit-upgrade" } }
    ],
    "locationId": "location.old-town",
    "stages": [
      { "threshold": 0, "label": "认识" },
      { "threshold": 25, "label": "常客" },
      { "threshold": 50, "label": "聊得来的书友" },
      { "threshold": 75, "label": "长期朋友" }
    ]
  },
  {
    "id": "character.yan-zhe",
    "contentStatus": "official",
    "name": "严哲",
    "description": "芯片方案销售，常年出差，对城市里哪家馆子开到凌晨了如指掌。",
    "tags": ["relationship", "career"],
    "identity": "芯片方案销售",
    "preferredInteractionCategories": ["meal", "work"],
    "preferredGiftTags": ["coffee"],
    "preferredActivityTags": ["social", "technology"],
    "initialRelationship": 0,
    "careerHistory": [
      { "startYear": 1, "title": "销售代表" },
      { "startYear": 5, "title": "大客户经理" },
      { "startYear": 9, "title": "区域销售总监", "branchCondition": { "type": "flag", "flag": "xinghe_service_line_launched" } }
    ],
    "locationId": "location.central",
    "stages": [
      { "threshold": 0, "label": "认识" },
      { "threshold": 25, "label": "饭友" },
      { "threshold": 50, "label": "互相信任" },
      { "threshold": 75, "label": "长期朋友" }
    ]
  }
] satisfies readonly CharacterDefinition[];
