import type { EventDefinition } from '../contracts';

export const officialEvents = [
  {
    "id": "event.seed-bonus",
    "contentStatus": "official",
    "name": "临时订单",
    "description": "普通工作中出现的一笔额外收入。",
    "title": "临时订单",
    "body": "临近下班，主管问你能不能顺手处理一份额外订单。",
    "category": "work",
    "weight": 1.2,
    "cooldownDays": 2,
    "choices": [
      {
        "id": "take",
        "text": "接下来",
        "effects": [
          {
            "type": "cash",
            "amount": 60,
            "rewardTier": "normal"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 1
          }
        ]
      },
      {
        "id": "share",
        "text": "和林晨分着做",
        "effects": [
          {
            "type": "cash",
            "amount": 35,
            "rewardTier": "small"
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 8
          }
        ]
      }
    ],
    "tags": [
      "work",
      "luck"
    ],
    "conditions": {
      "type": "current_job",
      "jobId": "job.seed-shop-clerk"
    }
  },
  {
    "id": "event.seed-shopping",
    "contentStatus": "official",
    "name": "会员日折扣",
    "description": "买过手机后出现的一次轻量购物机会。",
    "title": "会员日",
    "body": "店里今天做小范围会员活动，徐可顺手给你留了一张折扣券。",
    "category": "shopping",
    "weight": 0.9,
    "cooldownDays": 4,
    "choices": [
      {
        "id": "coupon",
        "text": "留着买设备",
        "effects": [
          {
            "type": "discount",
            "percent": 12,
            "tags": [
              "technology"
            ]
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 6
          }
        ]
      },
      {
        "id": "chat",
        "text": "聊一会儿再走",
        "effects": [
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 9
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 1
          }
        ]
      }
    ],
    "tags": [
      "shopping",
      "technology",
      "relationship"
    ],
    "conditions": {
      "type": "owns_item",
      "itemId": "item.seed-phone"
    }
  },
  {
    "id": "event.salary-review",
    "contentStatus": "official",
    "name": "工资调整",
    "description": "稳定工作后出现的永久职业改善。",
    "title": "工资调整",
    "body": "最近几次工作都很顺，主管愿意听听你对安排的想法。",
    "category": "career",
    "weight": 0.6,
    "cooldownDays": 12,
    "choices": [
      {
        "id": "raise",
        "text": "希望工资高一点",
        "effects": [
          {
            "type": "modifier",
            "modifier": {
              "target": "work_pay",
              "mode": "multiply",
              "value": 1.04,
              "tags": [
                "work"
              ]
            }
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 1
          }
        ]
      },
      {
        "id": "hours",
        "text": "希望时间更灵活",
        "effects": [
          {
            "type": "modifier",
            "modifier": {
              "target": "work_hours",
              "mode": "multiply",
              "value": 0.96,
              "tags": [
                "work"
              ]
            }
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 1
          }
        ]
      }
    ],
    "tags": [
      "career",
      "work"
    ],
    "conditions": {
      "type": "any",
      "conditions": [
        {
          "type": "current_job",
          "jobId": "job.seed-warehouse"
        },
        {
          "type": "current_job",
          "jobId": "job.cafe-assistant"
        },
        {
          "type": "current_job",
          "jobId": "job.seed-office"
        },
        {
          "type": "current_job",
          "jobId": "job.customer-service"
        },
        {
          "type": "current_job",
          "jobId": "job.operations-specialist"
        }
      ]
    }
  },
  {
    "id": "event.extra-shift",
    "contentStatus": "official",
    "name": "临时加班",
    "description": "早期工作中出现的短期奖励。",
    "title": "有人请假",
    "body": "今天临时少了一个人，值班表上空出了一段时间。",
    "category": "work",
    "weight": 0.9,
    "cooldownDays": 4,
    "choices": [
      {
        "id": "cover",
        "text": "帮忙顶一班",
        "effects": [
          {
            "type": "cash",
            "amount": 55,
            "rewardTier": "normal"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          }
        ]
      },
      {
        "id": "organize",
        "text": "帮忙重新排班",
        "effects": [
          {
            "type": "cash",
            "amount": 30,
            "rewardTier": "small"
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 2
          }
        ]
      }
    ],
    "tags": [
      "work",
      "career"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "day_at_least",
          "day": 2
        },
        {
          "type": "any",
          "conditions": [
            {
              "type": "current_job",
              "jobId": "job.seed-shop-clerk"
            },
            {
              "type": "current_job",
              "jobId": "job.seed-warehouse"
            },
            {
              "type": "current_job",
              "jobId": "job.cafe-assistant"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "event.training-seat",
    "contentStatus": "official",
    "name": "内部培训",
    "description": "用一次机会换取能力或职业声誉。",
    "title": "空出一个名额",
    "body": "公司内部培训临时多出一个位置，你可以直接去。",
    "category": "career",
    "weight": 0.65,
    "cooldownDays": 10,
    "choices": [
      {
        "id": "learn",
        "text": "认真把课听完",
        "effects": [
          {
            "type": "stat",
            "stat": "ability",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 8
          }
        ]
      },
      {
        "id": "network",
        "text": "多认识几个人",
        "effects": [
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 3
          },
          {
            "type": "relation",
            "characterId": "character.chenyu",
            "amount": 8
          }
        ]
      }
    ],
    "tags": [
      "career",
      "relationship"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "day_at_least",
          "day": 3
        },
        {
          "type": "any",
          "conditions": [
            {
              "type": "current_job",
              "jobId": "job.seed-warehouse"
            },
            {
              "type": "current_job",
              "jobId": "job.seed-office"
            },
            {
              "type": "current_job",
              "jobId": "job.customer-service"
            }
          ]
        }
      ]
    }
  },
  {
    "id": "event.temp-gig",
    "contentStatus": "official",
    "name": "临时兼职",
    "description": "给玩家增加一次短工或现金奖励。",
    "title": "今晚有一班空缺",
    "body": "附近的配送点缺一个人，四小时就能结算。",
    "category": "career",
    "weight": 0.8,
    "cooldownDays": 5,
    "choices": [
      {
        "id": "unlock",
        "text": "把这个兼职记下来",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.delivery-shift"
          },
          {
            "type": "cash",
            "amount": 25,
            "rewardTier": "small"
          }
        ]
      },
      {
        "id": "referral",
        "text": "先问问更长期的机会",
        "effects": [
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.chenyu",
            "amount": 7
          }
        ]
      }
    ],
    "tags": [
      "career",
      "work"
    ],
    "conditions": {
      "type": "day_at_least",
      "day": 2
    }
  },
  {
    "id": "event.store-clearance",
    "contentStatus": "official",
    "name": "样机清仓",
    "description": "让科技消费有一个阶段性好机会。",
    "title": "样机清仓",
    "body": "徐可说店里准备清掉几台展示机，价格会比平时好看。",
    "category": "shopping",
    "weight": 0.55,
    "cooldownDays": 9,
    "choices": [
      {
        "id": "tech",
        "text": "留一张设备折扣",
        "effects": [
          {
            "type": "discount",
            "percent": 15,
            "tags": [
              "technology"
            ]
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 5
          }
        ]
      },
      {
        "id": "small",
        "text": "先拿一副耳机",
        "effects": [
          {
            "type": "item",
            "itemId": "item.headphones",
            "quantity": 1
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 3
          }
        ]
      }
    ],
    "tags": [
      "shopping",
      "technology"
    ],
    "conditions": {
      "type": "cash_at_least",
      "amount": 350
    }
  },
  {
    "id": "event.wardrobe-deal",
    "contentStatus": "official",
    "name": "换季折扣",
    "description": "轻量消费事件，不要求玩家追求最优收益。",
    "title": "换季折扣",
    "body": "常去的服装店正在换季，几件日常款都做了折扣。",
    "category": "shopping",
    "weight": 0.55,
    "cooldownDays": 8,
    "choices": [
      {
        "id": "coupon",
        "text": "拿一张服装券",
        "effects": [
          {
            "type": "discount",
            "percent": 18,
            "tags": [
              "clothing"
            ]
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 1
          }
        ]
      },
      {
        "id": "reputation",
        "text": "挑一套更正式的搭配",
        "effects": [
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 2
          }
        ]
      }
    ],
    "tags": [
      "shopping",
      "clothing"
    ],
    "conditions": {
      "type": "cash_at_least",
      "amount": 250
    }
  },
  {
    "id": "event.laptop-rebate",
    "contentStatus": "official",
    "name": "电脑补贴",
    "description": "让首台电脑更容易成为明确目标。",
    "title": "设备补贴",
    "body": "一项短期设备补贴今天开放，正好覆盖笔记本电脑。",
    "category": "shopping",
    "weight": 0.5,
    "cooldownDays": 14,
    "choices": [
      {
        "id": "coupon",
        "text": "申请设备折扣",
        "effects": [
          {
            "type": "discount",
            "percent": 14,
            "tags": [
              "technology"
            ]
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 1
          }
        ]
      },
      {
        "id": "cash",
        "text": "领取通用补贴",
        "effects": [
          {
            "type": "cash",
            "amount": 70,
            "rewardTier": "normal"
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 1
          }
        ]
      }
    ],
    "tags": [
      "shopping",
      "career"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "cash_at_least",
          "amount": 650
        },
        {
          "type": "not",
          "condition": {
            "type": "owns_item",
            "itemId": "item.seed-laptop"
          }
        }
      ]
    }
  },
  {
    "id": "event.rent-offer",
    "contentStatus": "official",
    "name": "续租优惠",
    "description": "入住独立单间后出现的住房改善。",
    "title": "续租优惠",
    "body": "房东愿意把下一阶段的租金条件再谈得好一点。",
    "category": "housing",
    "weight": 0.55,
    "cooldownDays": 16,
    "choices": [
      {
        "id": "rent",
        "text": "把租金谈低一点",
        "effects": [
          {
            "type": "modifier",
            "modifier": {
              "target": "housing_rent",
              "mode": "multiply",
              "value": 0.95,
              "tags": [
                "housing"
              ]
            }
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 5
          }
        ]
      },
      {
        "id": "comfort",
        "text": "请他帮忙改善房间",
        "effects": [
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 3
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 7
          }
        ]
      }
    ],
    "tags": [
      "housing",
      "relationship"
    ],
    "conditions": {
      "type": "housing_is",
      "housingId": "housing.seed-room",
      "mode": "rent"
    }
  },
  {
    "id": "event.furniture-bundle",
    "contentStatus": "official",
    "name": "家居套装",
    "description": "搬出合租房后出现的家居奖励。",
    "title": "一套刚好的组合",
    "body": "附近家居店把几件基础家具打包做了活动。",
    "category": "housing",
    "weight": 0.6,
    "cooldownDays": 10,
    "choices": [
      {
        "id": "discount",
        "text": "拿下家居折扣",
        "effects": [
          {
            "type": "discount",
            "percent": 16,
            "tags": [
              "furniture"
            ]
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 1
          }
        ]
      },
      {
        "id": "desk",
        "text": "先把工作区补起来",
        "effects": [
          {
            "type": "item",
            "itemId": "item.seed-desk",
            "quantity": 1
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 1
          }
        ]
      }
    ],
    "tags": [
      "housing",
      "shopping"
    ],
    "conditions": {
      "type": "not",
      "condition": {
        "type": "housing_is",
        "housingId": "housing.shared-room"
      }
    }
  },
  {
    "id": "event.client-tip",
    "contentStatus": "official",
    "name": "客户加单",
    "description": "远程工作后出现的职业机会。",
    "title": "客户又发来一份任务",
    "body": "上一份线上工作交付得不错，对方愿意直接把下一单给你。",
    "category": "work",
    "weight": 0.75,
    "cooldownDays": 5,
    "choices": [
      {
        "id": "cash",
        "text": "接下这单",
        "effects": [
          {
            "type": "cash",
            "amount": 85,
            "rewardTier": "normal"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          }
        ]
      },
      {
        "id": "long",
        "text": "谈一个长期合作",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.remote-operator"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 3
          }
        ]
      }
    ],
    "tags": [
      "work",
      "remote",
      "career"
    ],
    "conditions": {
      "type": "has_capability",
      "capability": "remote_work"
    }
  },
  {
    "id": "event.investment-note",
    "contentStatus": "official",
    "name": "理财入门",
    "description": "为金融资产系统提供自然入口。",
    "title": "一份很简单的理财说明",
    "body": "陈宇把自己整理的一页笔记发给你，内容不复杂，正好够入门。",
    "category": "investment",
    "weight": 0.45,
    "cooldownDays": 20,
    "choices": [
      {
        "id": "learn",
        "text": "花点时间看懂它",
        "effects": [
          {
            "type": "unlock_capability",
            "capability": "market_insight"
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 1
          },
          {
            "type": "relation",
            "characterId": "character.chenyu",
            "amount": 6
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.index-fund"
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.gold-holding"
          }
        ]
      },
      {
        "id": "fund",
        "text": "先关注稳一点的选择",
        "effects": [
          {
            "type": "unlock_capability",
            "capability": "market_insight"
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.index-fund"
          },
          {
            "type": "cash",
            "amount": 35,
            "rewardTier": "small"
          },
          {
            "type": "relation",
            "characterId": "character.chenyu",
            "amount": 4
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.gold-holding"
          }
        ]
      }
    ],
    "tags": [
      "asset",
      "career"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "day_at_least",
          "day": 6
        },
        {
          "type": "ability_at_least",
          "amount": 14
        }
      ]
    }
  },
  {
    "id": "event.collectible-find",
    "contentStatus": "official",
    "name": "小收藏",
    "description": "给有余钱的玩家一个非最优但有趣的消费方向。",
    "title": "柜台里有件挺喜欢的东西",
    "body": "价格不算便宜，但也没有贵到完全不值得考虑。",
    "category": "asset",
    "weight": 0.45,
    "cooldownDays": 12,
    "choices": [
      {
        "id": "record",
        "text": "带走那张唱片",
        "effects": [
          {
            "type": "item",
            "itemId": "item.seed-record",
            "quantity": 1
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 1
          }
        ]
      },
      {
        "id": "coupon",
        "text": "留一张收藏品折扣",
        "effects": [
          {
            "type": "discount",
            "percent": 12,
            "tags": [
              "collectible"
            ]
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 2
          }
        ]
      }
    ],
    "tags": [
      "collectible",
      "life"
    ],
    "conditions": {
      "type": "cash_at_least",
      "amount": 1200
    }
  },
  {
    "id": "event.refund",
    "contentStatus": "official",
    "name": "一笔返还",
    "description": "纯粹的轻松奖励事件。",
    "title": "到账提醒",
    "body": "之前的一笔费用今天退了回来，金额不大，但来得正好。",
    "category": "luck",
    "weight": 0.55,
    "cooldownDays": 14,
    "choices": [
      {
        "id": "save",
        "text": "直接收下",
        "effects": [
          {
            "type": "cash",
            "amount": 90,
            "rewardTier": "large"
          }
        ]
      },
      {
        "id": "life",
        "text": "拿一部分改善生活",
        "effects": [
          {
            "type": "cash",
            "amount": 55,
            "rewardTier": "normal"
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 3
          }
        ]
      }
    ],
    "tags": [
      "luck",
      "life"
    ],
    "conditions": {
      "type": "day_at_least",
      "day": 5
    }
  },
  {
    "id": "event.weekend-market",
    "contentStatus": "official",
    "name": "周末客流",
    "description": "第一份生意拥有后的经营奖励。",
    "title": "今天人比平时多",
    "body": "附近有活动，客流明显比平时旺了一截。",
    "category": "business",
    "weight": 0.7,
    "cooldownDays": 6,
    "choices": [
      {
        "id": "profit",
        "text": "把今天的机会吃满",
        "effects": [
          {
            "type": "cash",
            "amount": 120,
            "rewardTier": "normal"
          },
          {
            "type": "modifier",
            "modifier": {
              "target": "business_profit",
              "mode": "multiply",
              "value": 1.03,
              "tags": [
                "business"
              ]
            }
          }
        ]
      },
      {
        "id": "expand",
        "text": "顺便观察线上需求",
        "effects": [
          {
            "type": "unlock_business",
            "businessId": "business.online-store"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 3
          }
        ]
      }
    ],
    "tags": [
      "business",
      "luck"
    ],
    "conditions": {
      "type": "owns_business",
      "businessId": "business.seed-kiosk"
    }
  },
  {
    "id": "event.seed-mentor",
    "contentStatus": "official",
    "name": "工作建议",
    "description": "林晨和周妍给出一次早期职业方向选择。",
    "title": "下班后的几句话",
    "body": "林晨和周妍聊起最近的工作，你也顺便听了一会儿。",
    "category": "career",
    "weight": 0.8,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "learn",
        "text": "多听听实际经验",
        "effects": [
          {
            "type": "stat",
            "stat": "ability",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 10
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 8
          }
        ]
      },
      {
        "id": "people",
        "text": "问问有没有更好的机会",
        "effects": [
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 17
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 20
          }
        ]
      }
    ],
    "tags": [
      "career",
      "relationship"
    ],
    "conditions": {
      "type": "day_at_least",
      "day": 2
    },
    "chain": {
      "chainId": "chain.seed-friends",
      "stage": 1
    }
  },
  {
    "id": "event.seed-referral",
    "contentStatus": "official",
    "name": "岗位介绍",
    "description": "林晨关系达到一定程度后介绍一份更好的工作。",
    "title": "一份岗位消息",
    "body": "林晨看到行政组在补人，条件比你现在的工作好一些。",
    "category": "career",
    "weight": 0.5,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "office",
        "text": "去了解行政助理",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.seed-office"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 5
          }
        ]
      },
      {
        "id": "flex",
        "text": "先留意灵活兼职",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.data-entry"
          },
          {
            "type": "cash",
            "amount": 45,
            "rewardTier": "small"
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 5
          }
        ]
      }
    ],
    "tags": [
      "career",
      "relationship"
    ],
    "conditions": {
      "type": "relationship_at_least",
      "characterId": "character.seed-lin",
      "amount": 25
    },
    "chain": {
      "chainId": "chain.seed-friends",
      "stage": 2
    }
  },
  {
    "id": "event.friend-side-project",
    "contentStatus": "official",
    "name": "一起接个小项目",
    "description": "关系更深后出现的长期职业机会。",
    "title": "一起做一单",
    "body": "林晨手上有个不大的线上项目，想问你要不要一起接下来。",
    "category": "career",
    "weight": 0.45,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "project",
        "text": "一起把项目做完",
        "effects": [
          {
            "type": "cash",
            "amount": 120,
            "rewardTier": "large"
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 10
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          }
        ]
      },
      {
        "id": "longterm",
        "text": "把合作做成长期",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.remote-operator"
          },
          {
            "type": "unlock_capability",
            "capability": "market_insight"
          },
          {
            "type": "relation",
            "characterId": "character.seed-lin",
            "amount": 8
          }
        ]
      }
    ],
    "tags": [
      "career",
      "relationship",
      "remote"
    ],
    "conditions": {
      "type": "relationship_at_least",
      "characterId": "character.seed-lin",
      "amount": 50
    },
    "chain": {
      "chainId": "chain.seed-friends",
      "stage": 3
    }
  },
  {
    "id": "event.tech-chat",
    "contentStatus": "official",
    "name": "数码店闲聊",
    "description": "认识徐可并建立科技消费与远程工作的联系。",
    "title": "聊到工作设备",
    "body": "徐可问你平时是不是也会在家处理一些工作。",
    "category": "relationship",
    "weight": 0.65,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "devices",
        "text": "聊聊设备怎么选",
        "effects": [
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 9
          },
          {
            "type": "discount",
            "percent": 8,
            "tags": [
              "technology"
            ]
          }
        ]
      },
      {
        "id": "work",
        "text": "问问远程工作",
        "effects": [
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 8
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 1
          }
        ]
      }
    ],
    "tags": [
      "relationship",
      "technology"
    ],
    "conditions": {
      "type": "owns_item",
      "itemId": "item.seed-phone"
    },
    "chain": {
      "chainId": "chain.tech-contact",
      "stage": 1
    }
  },
  {
    "id": "event.tech-bundle",
    "contentStatus": "official",
    "name": "设备组合优惠",
    "description": "徐可关系提高后给出更有价值的科技消费奖励。",
    "title": "店里刚到一批货",
    "body": "徐可愿意把几件常用设备按熟客价给你。",
    "category": "shopping",
    "weight": 0.45,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "discount",
        "text": "留一张大额设备券",
        "effects": [
          {
            "type": "discount",
            "percent": 18,
            "tags": [
              "technology"
            ]
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 8
          }
        ]
      },
      {
        "id": "headphones",
        "text": "先拿一副降噪耳机",
        "effects": [
          {
            "type": "item",
            "itemId": "item.headphones",
            "quantity": 1
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 10
          }
        ]
      }
    ],
    "tags": [
      "shopping",
      "technology",
      "relationship"
    ],
    "conditions": {
      "type": "relationship_at_least",
      "characterId": "character.xuke",
      "amount": 8
    },
    "chain": {
      "chainId": "chain.tech-contact",
      "stage": 2
    }
  },
  {
    "id": "event.tech-contract",
    "contentStatus": "official",
    "name": "线上合同",
    "description": "科技关系链最终转化成工作与市场机会。",
    "title": "一份线上合同",
    "body": "徐可认识的小团队需要长期有人处理线上事务，你的设备和经验都够用了。",
    "category": "career",
    "weight": 0.4,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "job",
        "text": "接下长期工作",
        "effects": [
          {
            "type": "unlock_job",
            "jobId": "job.remote-operator"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 3
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 8
          }
        ]
      },
      {
        "id": "market",
        "text": "先学会自己找项目",
        "effects": [
          {
            "type": "unlock_capability",
            "capability": "market_insight"
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 2
          },
          {
            "type": "relation",
            "characterId": "character.xuke",
            "amount": 8
          }
        ]
      }
    ],
    "tags": [
      "career",
      "remote",
      "relationship"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "relationship_at_least",
          "characterId": "character.xuke",
          "amount": 15
        },
        {
          "type": "has_capability",
          "capability": "remote_work"
        }
      ]
    },
    "chain": {
      "chainId": "chain.tech-contact",
      "stage": 3
    }
  },
  {
    "id": "event.new-neighbor",
    "contentStatus": "official",
    "name": "新住处的熟人",
    "description": "搬出合租房后认识房产经纪何彦。",
    "title": "楼下碰到的人",
    "body": "搬进来没多久，你在楼下碰到了负责附近房源的何彦。",
    "category": "relationship",
    "weight": 0.65,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "hello",
        "text": "聊聊附近的生活",
        "effects": [
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 9
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 1
          }
        ]
      },
      {
        "id": "housing",
        "text": "问问最近的房源",
        "effects": [
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 8
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          }
        ]
      }
    ],
    "tags": [
      "relationship",
      "housing"
    ],
    "conditions": {
      "type": "not",
      "condition": {
        "type": "housing_is",
        "housingId": "housing.shared-room"
      }
    },
    "chain": {
      "chainId": "chain.housing-path",
      "stage": 1
    }
  },
  {
    "id": "event.home-upgrade-tip",
    "contentStatus": "official",
    "name": "住房升级建议",
    "description": "何彦提供更好的住房或家具机会。",
    "title": "有两条消息",
    "body": "何彦手里正好有一套采光不错的房，也认识一家做家居活动的店。",
    "category": "housing",
    "weight": 0.45,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "home",
        "text": "先看看更好的房子",
        "effects": [
          {
            "type": "unlock_housing",
            "housingId": "housing.sunny-apartment"
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 9
          }
        ]
      },
      {
        "id": "furniture",
        "text": "先把现在的房子住舒服",
        "effects": [
          {
            "type": "discount",
            "percent": 18,
            "tags": [
              "furniture"
            ]
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 9
          }
        ]
      }
    ],
    "tags": [
      "housing",
      "relationship"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "relationship_at_least",
          "characterId": "character.heyan",
          "amount": 8
        },
        {
          "type": "not",
          "condition": {
            "type": "housing_is",
            "housingId": "housing.shared-room"
          }
        }
      ]
    },
    "chain": {
      "chainId": "chain.housing-path",
      "stage": 2
    }
  },
  {
    "id": "event.property-lead",
    "contentStatus": "official",
    "name": "一套小房源",
    "description": "住房关系链最终转化为买房或出租资产机会。",
    "title": "有套房准备出手",
    "body": "何彦发来一套总价不算太高的小房源，既能自住，也可以考虑出租。",
    "category": "asset",
    "weight": 0.35,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "rental",
        "text": "先研究出租回报",
        "effects": [
          {
            "type": "unlock_asset",
            "assetId": "asset.seed-rental"
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 8
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 2
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.apartment-rental"
          }
        ]
      },
      {
        "id": "home",
        "text": "先看更好的自住房",
        "effects": [
          {
            "type": "unlock_housing",
            "housingId": "housing.modern-apartment"
          },
          {
            "type": "relation",
            "characterId": "character.heyan",
            "amount": 8
          },
          {
            "type": "stat",
            "stat": "lifestyle",
            "amount": 2
          }
        ]
      }
    ],
    "tags": [
      "asset",
      "housing",
      "relationship"
    ],
    "conditions": {
      "type": "all",
      "conditions": [
        {
          "type": "relationship_at_least",
          "characterId": "character.heyan",
          "amount": 15
        },
        {
          "type": "cash_at_least",
          "amount": 2500
        }
      ]
    },
    "chain": {
      "chainId": "chain.housing-path",
      "stage": 3
    }
  },
  {
    "id": "event.seed-business",
    "contentStatus": "official",
    "name": "小生意的消息",
    "description": "周妍带来第一份正式经营机会。",
    "title": "有人准备转让摊位",
    "body": "周妍认识的人准备转让一个早餐和咖啡摊，设备和手续都比较简单。",
    "category": "business",
    "weight": 0.45,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "business",
        "text": "认真了解这门生意",
        "effects": [
          {
            "type": "unlock_business",
            "businessId": "business.seed-kiosk"
          },
          {
            "type": "unlock_capability",
            "capability": "business_license"
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 7
          }
        ]
      },
      {
        "id": "finance",
        "text": "先把账算清楚",
        "effects": [
          {
            "type": "unlock_capability",
            "capability": "market_insight"
          },
          {
            "type": "unlock_asset",
            "assetId": "asset.index-fund"
          },
          {
            "type": "cash",
            "amount": 60,
            "rewardTier": "small"
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 5
          }
        ]
      }
    ],
    "tags": [
      "business",
      "relationship"
    ],
    "conditions": {
      "type": "relationship_at_least",
      "characterId": "character.seed-zhou",
      "amount": 13
    },
    "chain": {
      "chainId": "chain.business-path",
      "stage": 1
    }
  },
  {
    "id": "event.business-license-help",
    "contentStatus": "official",
    "name": "手续办好了",
    "description": "周妍帮助把经营资格和基础流程理顺。",
    "title": "手续比想象中简单",
    "body": "周妍把需要准备的资料列成一张清单，很快就能办完。",
    "category": "business",
    "weight": 0.4,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "license",
        "text": "把经营资格办下来",
        "effects": [
          {
            "type": "unlock_capability",
            "capability": "business_license"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 3
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 6
          }
        ]
      },
      {
        "id": "profit",
        "text": "顺便把成本结构理清楚",
        "effects": [
          {
            "type": "modifier",
            "modifier": {
              "target": "business_profit",
              "mode": "multiply",
              "value": 1.04,
              "tags": [
                "business"
              ]
            }
          },
          {
            "type": "stat",
            "stat": "ability",
            "amount": 1
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 6
          }
        ]
      }
    ],
    "tags": [
      "business",
      "career"
    ],
    "conditions": {
      "type": "relationship_at_least",
      "characterId": "character.seed-zhou",
      "amount": 20
    },
    "chain": {
      "chainId": "chain.business-path",
      "stage": 2
    }
  },
  {
    "id": "event.business-partnership",
    "contentStatus": "official",
    "name": "下一步经营",
    "description": "有了第一份经营经验后解锁更大空间。",
    "title": "生意已经跑顺了",
    "body": "周妍觉得你已经不用只盯着一个摊位，可以开始看更灵活的经营方式。",
    "category": "business",
    "weight": 0.35,
    "cooldownDays": 99,
    "choices": [
      {
        "id": "online",
        "text": "试试线上小店",
        "effects": [
          {
            "type": "unlock_business",
            "businessId": "business.online-store"
          },
          {
            "type": "stat",
            "stat": "reputation",
            "amount": 4
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 8
          }
        ]
      },
      {
        "id": "steady",
        "text": "先把现有生意做扎实",
        "effects": [
          {
            "type": "modifier",
            "modifier": {
              "target": "business_profit",
              "mode": "multiply",
              "value": 1.06,
              "tags": [
                "business"
              ]
            }
          },
          {
            "type": "relation",
            "characterId": "character.seed-zhou",
            "amount": 8
          }
        ]
      }
    ],
    "tags": [
      "business",
      "relationship"
    ],
    "conditions": {
      "type": "owns_business",
      "businessId": "business.seed-kiosk"
    },
    "chain": {
      "chainId": "chain.business-path",
      "stage": 3
    }
  }
] satisfies readonly EventDefinition[];

