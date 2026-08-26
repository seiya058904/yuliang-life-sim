import type { ItemDefinition } from '../contracts';

export const officialItems = [
  {
    "id": "item.seed-coffee",
    "contentStatus": "official",
    "name": "现磨咖啡",
    "description": "一杯不贵的咖啡，让普通的一天稍微舒服一点。",
    "tags": [
      "life"
    ],
    "category": "consumable",
    "price": 18,
    "consumable": true,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 1
  },
  {
    "id": "item.breakfast-voucher",
    "contentStatus": "official",
    "name": "早餐券",
    "description": "给自己买一顿像样的早餐。",
    "tags": [
      "life"
    ],
    "category": "consumable",
    "price": 24,
    "consumable": true,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 1
  },
  {
    "id": "item.good-meal",
    "contentStatus": "official",
    "name": "一顿好饭",
    "description": "偶尔不算账，认真吃一顿。",
    "tags": [
      "life"
    ],
    "category": "consumable",
    "price": 58,
    "consumable": true,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 2
  },
  {
    "id": "item.movie-ticket",
    "contentStatus": "official",
    "name": "电影票",
    "description": "两个小时不用想工作和收入。",
    "tags": [
      "life"
    ],
    "category": "entertainment",
    "price": 68,
    "consumable": true,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 2
  },
  {
    "id": "item.book-set",
    "contentStatus": "official",
    "name": "实用书籍",
    "description": "几本真正会翻开的书，带来一点长期积累。",
    "tags": [
      "life",
      "career"
    ],
    "category": "entertainment",
    "price": 120,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.25,
    "lifestyleDelta": 2,
    "statEffects": {
      "ability": 1
    },
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.book-set"
      }
    }
  },
  {
    "id": "item.seed-phone",
    "contentStatus": "official",
    "name": "实用手机",
    "description": "性能普通，但足够处理工作消息和日常事务。",
    "tags": [
      "technology"
    ],
    "category": "technology",
    "price": 420,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.45,
    "lifestyleDelta": 2
  },
  {
    "id": "item.smartphone",
    "contentStatus": "official",
    "name": "新款手机",
    "description": "更顺手的日常设备，也让生活显得没那么将就。",
    "tags": [
      "technology",
      "luxury"
    ],
    "category": "technology",
    "price": 1180,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.5,
    "lifestyleDelta": 4,
    "statEffects": {
      "reputation": 1
    },
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.smartphone"
      }
    }
  },
  {
    "id": "item.seed-laptop",
    "contentStatus": "official",
    "name": "轻薄笔记本电脑",
    "description": "真正改变赚钱方式的一件东西：远程工作和居家办公从这里开始。",
    "tags": [
      "technology",
      "remote"
    ],
    "category": "technology",
    "price": 980,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.55,
    "lifestyleDelta": 4,
    "capabilities": [
      "remote_work",
      "home_workspace"
    ],
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.seed-laptop"
      }
    }
  },
  {
    "id": "item.pro-laptop",
    "contentStatus": "official",
    "name": "高性能笔记本电脑",
    "description": "更好的设备不只是消费，也是对工作方式的一次升级。",
    "tags": [
      "technology",
      "remote",
      "luxury"
    ],
    "category": "technology",
    "price": 2800,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.58,
    "lifestyleDelta": 7,
    "capabilities": [
      "remote_work",
      "home_workspace"
    ],
    "effects": [
      {
        "type": "modifier",
        "modifier": {
          "target": "study_gain",
          "mode": "multiply",
          "value": 1.08
        }
      }
    ],
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.pro-laptop"
      }
    }
  },
  {
    "id": "item.headphones",
    "contentStatus": "official",
    "name": "降噪耳机",
    "description": "让通勤和独处都更安静一点。",
    "tags": [
      "technology",
      "life"
    ],
    "category": "technology",
    "price": 480,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.45,
    "lifestyleDelta": 3
  },
  {
    "id": "item.tablet",
    "contentStatus": "official",
    "name": "平板电脑",
    "description": "介于娱乐和效率之间的一件设备。",
    "tags": [
      "technology",
      "life"
    ],
    "category": "technology",
    "price": 1350,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.5,
    "lifestyleDelta": 4
  },
  {
    "id": "item.seed-shirt",
    "contentStatus": "official",
    "name": "合身衬衫",
    "description": "简单、干净，去上班或见人都够用。",
    "tags": [
      "clothing"
    ],
    "category": "clothing",
    "price": 180,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.35,
    "lifestyleDelta": 2
  },
  {
    "id": "item.sneakers",
    "contentStatus": "official",
    "name": "舒适运动鞋",
    "description": "不是为了炫耀，只是每天穿着更舒服。",
    "tags": [
      "clothing",
      "life"
    ],
    "category": "clothing",
    "price": 360,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.4,
    "lifestyleDelta": 3
  },
  {
    "id": "item.jacket",
    "contentStatus": "official",
    "name": "简洁外套",
    "description": "质感更好的日常外套，耐看也耐穿。",
    "tags": [
      "clothing"
    ],
    "category": "clothing",
    "price": 620,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.42,
    "lifestyleDelta": 4
  },
  {
    "id": "item.suit",
    "contentStatus": "official",
    "name": "通勤西装",
    "description": "需要正式一点的时候，不再临时找衣服。",
    "tags": [
      "clothing",
      "career"
    ],
    "category": "clothing",
    "price": 980,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.4,
    "lifestyleDelta": 5,
    "statEffects": {
      "reputation": 1
    },
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.suit"
      }
    }
  },
  {
    "id": "item.seed-desk",
    "contentStatus": "official",
    "name": "简洁书桌",
    "description": "给学习和工作留出一个固定的位置。",
    "tags": [
      "furniture",
      "office"
    ],
    "category": "furniture",
    "price": 260,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.5,
    "lifestyleDelta": 2,
    "capabilities": [
      "home_workspace"
    ],
    "effects": [
      {
        "type": "modifier",
        "modifier": {
          "target": "study_gain",
          "mode": "multiply",
          "value": 1.05
        }
      }
    ],
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.seed-desk"
      }
    }
  },
  {
    "id": "item.good-bed",
    "contentStatus": "official",
    "name": "舒适床垫",
    "description": "看起来不起眼，但每天都能感受到差别。",
    "tags": [
      "furniture",
      "life"
    ],
    "category": "furniture",
    "price": 620,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.45,
    "lifestyleDelta": 4
  },
  {
    "id": "item.office-chair",
    "contentStatus": "official",
    "name": "人体工学椅",
    "description": "久坐时终于不用一直调整姿势。",
    "tags": [
      "furniture",
      "office"
    ],
    "category": "furniture",
    "price": 560,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.5,
    "lifestyleDelta": 3,
    "effects": [
      {
        "type": "modifier",
        "modifier": {
          "target": "study_gain",
          "mode": "multiply",
          "value": 1.04
        }
      }
    ],
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.office-chair"
      }
    }
  },
  {
    "id": "item.kitchen-set",
    "contentStatus": "official",
    "name": "小厨房升级",
    "description": "锅具、餐具和几件真正顺手的小电器。",
    "tags": [
      "furniture",
      "life"
    ],
    "category": "furniture",
    "price": 860,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.42,
    "lifestyleDelta": 5
  },
  {
    "id": "item.sofa",
    "contentStatus": "official",
    "name": "双人沙发",
    "description": "房间开始有了真正可以放松的地方。",
    "tags": [
      "furniture",
      "life"
    ],
    "category": "furniture",
    "price": 1100,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.45,
    "lifestyleDelta": 5
  },
  {
    "id": "item.monitor",
    "contentStatus": "official",
    "name": "桌面显示器",
    "description": "让学习、远程工作和娱乐都更从容。",
    "tags": [
      "technology",
      "office"
    ],
    "category": "technology",
    "price": 760,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.5,
    "lifestyleDelta": 3,
    "capabilities": [
      "home_workspace"
    ],
    "requirements": {
      "type": "not",
      "condition": {
        "type": "owns_item",
        "itemId": "item.monitor"
      }
    }
  },
  {
    "id": "item.seed-watch",
    "contentStatus": "official",
    "name": "机械腕表",
    "description": "第一件明显超出生活必需的消费品。",
    "tags": [
      "luxury",
      "collectible"
    ],
    "category": "luxury",
    "price": 1680,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.72,
    "lifestyleDelta": 6
  },
  {
    "id": "item.seed-record",
    "contentStatus": "official",
    "name": "收藏唱片",
    "description": "不一定升值，但放在架子上会让人开心。",
    "tags": [
      "collectible",
      "life"
    ],
    "category": "collectible",
    "price": 520,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.65,
    "lifestyleDelta": 4
  },
  {
    "id": "item.gold-bracelet",
    "contentStatus": "official",
    "name": "金手链",
    "description": "既是装饰，也保留了一部分可出售价值。",
    "tags": [
      "luxury",
      "collectible"
    ],
    "category": "luxury",
    "price": 2800,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.78,
    "lifestyleDelta": 7
  },
  {
    "id": "item.vintage-camera",
    "contentStatus": "official",
    "name": "复古相机",
    "description": "有点浪漫，也有一点收藏属性。",
    "tags": [
      "collectible",
      "luxury"
    ],
    "category": "collectible",
    "price": 2200,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.68,
    "lifestyleDelta": 6
  },
  {
    "id": "item.fountain-pen",
    "contentStatus": "official",
    "name": "钢笔",
    "description": "一件小而明确的精致消费。",
    "tags": [
      "luxury"
    ],
    "category": "luxury",
    "price": 680,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.55,
    "lifestyleDelta": 3
  },
  {
    "id": "item.designer-bag",
    "contentStatus": "official",
    "name": "设计师手提包",
    "description": "昂贵，但也确实让生活方式更进一步。",
    "tags": [
      "luxury",
      "clothing"
    ],
    "category": "luxury",
    "price": 3200,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.55,
    "lifestyleDelta": 8
  },
  {
    "id": "item.art-print",
    "contentStatus": "official",
    "name": "限量版画",
    "description": "不是为了赚钱而买的资产，更像是给生活留下一件喜欢的东西。",
    "tags": [
      "collectible",
      "luxury"
    ],
    "category": "collectible",
    "price": 4500,
    "consumable": false,
    "sellable": true,
    "resaleRatio": 0.75,
    "lifestyleDelta": 9
  },
  {
    "id": "gift.flowers",
    "contentStatus": "official",
    "name": "一束花",
    "description": "不必等到特殊日子，也可以带一点轻松的心意。",
    "tags": ["gift", "life"],
    "category": "leisure_item",
    "price": 120,
    "consumable": false,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 0,
    "giftable": true,
    "giftTags": ["flower"]
  },
  {
    "id": "gift.dessert-box",
    "contentStatus": "official",
    "name": "精品甜点礼盒",
    "description": "适合拜访朋友或同事时带上的小礼物。",
    "tags": ["gift", "life"],
    "category": "leisure_item",
    "price": 98,
    "consumable": false,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 0,
    "giftable": true,
    "giftTags": ["dessert"]
  },
  {
    "id": "gift.coffee-set",
    "contentStatus": "official",
    "name": "咖啡豆礼盒",
    "description": "一份不夸张、但能让熟悉的人会心一笑的礼物。",
    "tags": ["gift", "life"],
    "category": "leisure_item",
    "price": 188,
    "consumable": false,
    "sellable": false,
    "resaleRatio": 0,
    "lifestyleDelta": 0,
    "giftable": true,
    "giftTags": ["coffee"]
  }
] satisfies readonly ItemDefinition[];
