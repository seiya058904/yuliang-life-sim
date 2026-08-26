import type { JobDefinition } from '../contracts';

export const officialJobs = [
  {
    "id": "job.seed-shop-clerk",
    "contentStatus": "official",
    "name": "便利店店员",
    "description": "稳定的入门工作，收入普通，但几乎没有门槛。",
    "tags": [
      "work",
      "starter"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 8,
    "basePay": 96,
    "careerXp": 1,
    "experienceTags": ["retail", "customer_service"],
    "isLongTerm": true
  },
  {
    "id": "job.seed-warehouse",
    "contentStatus": "official",
    "name": "仓库理货员",
    "description": "按清单整理货物，收入比基础服务岗更高。",
    "tags": [
      "work",
      "starter"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 8,
    "basePay": 128,
    "abilityRequired": 10,
    "careerXp": 2,
    "experienceTags": ["logistics"],
    "isLongTerm": true
  },
  {
    "id": "job.delivery-shift",
    "contentStatus": "official",
    "name": "同城配送",
    "description": "四小时一班的临时配送，适合补一笔当天收入。",
    "tags": [
      "work",
      "starter"
    ],
    "kind": "temporary",
    "employmentKind": "gig",
    "hours": 4,
    "basePay": 76,
    "abilityRequired": 10,
    "careerXp": 1,
    "isLongTerm": false
  },
  {
    "id": "job.cafe-assistant",
    "contentStatus": "official",
    "name": "咖啡店店员",
    "description": "工时较短，收入稳定，也更容易积累声誉。",
    "tags": [
      "work",
      "starter"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 6,
    "basePay": 108,
    "abilityRequired": 11,
    "reputationRequired": 1,
    "careerXp": 2,
    "experienceTags": ["customer_service"],
    "rewards": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 1
      }
    ],
    "isLongTerm": true
  },
  {
    "id": "job.seed-office",
    "contentStatus": "official",
    "name": "行政助理",
    "description": "处理日程、表格和日常沟通，是进入办公室工作的第一步。",
    "tags": [
      "work",
      "office",
      "career"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 168,
    "abilityRequired": 14,
    "reputationRequired": 3,
    "careerXp": 3,
    "experienceTags": ["office", "operations"],
    "isLongTerm": true
  },
  {
    "id": "job.customer-service",
    "contentStatus": "official",
    "name": "客户服务专员",
    "description": "处理咨询和售后，稳定积累职业经验与声誉。",
    "tags": [
      "work",
      "office",
      "career"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 196,
    "abilityRequired": 16,
    "reputationRequired": 6,
    "careerXp": 3,
    "experienceTags": ["customer_service"],
    "rewards": [
      {
        "type": "stat",
        "stat": "reputation",
        "amount": 1
      }
    ],
    "isLongTerm": true
  },
  {
    "id": "job.data-entry",
    "contentStatus": "official",
    "name": "数据整理兼职",
    "description": "在电脑上整理资料，时间灵活，适合与主业搭配。",
    "tags": [
      "work",
      "remote"
    ],
    "kind": "freelance",
    "employmentKind": "repeatable_side_job",
    "hours": 4,
    "basePay": 132,
    "abilityRequired": 15,
    "careerXp": 2,
    "requiredItems": [
      "item.seed-laptop"
    ],
    "requiredCapabilities": [
      "home_workspace"
    ],
    "isLongTerm": false
  },
  {
    "id": "job.seed-remote",
    "contentStatus": "official",
    "name": "远程校对",
    "description": "按要求检查文字与格式，四小时即可完成一轮。",
    "tags": [
      "work",
      "remote"
    ],
    "kind": "freelance",
    "employmentKind": "repeatable_side_job",
    "hours": 4,
    "basePay": 148,
    "abilityRequired": 16,
    "careerXp": 2,
    "requiredCapabilities": [
      "remote_work"
    ],
    "isLongTerm": false
  },
  {
    "id": "job.operations-specialist",
    "contentStatus": "official",
    "name": "运营专员",
    "description": "负责日常运营与数据跟进，收入进入稳定上升阶段。",
    "tags": [
      "work",
      "office",
      "career"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 248,
    "abilityRequired": 20,
    "reputationRequired": 10,
    "careerXp": 4,
    "experienceTags": ["operations", "office"],
    "experienceRequired": { "operations": 21 },
    "qualificationRequired": ["operations_foundation"],
    "isLongTerm": true
  },
  {
    "id": "job.remote-operator",
    "contentStatus": "official",
    "name": "远程运营助理",
    "description": "在家处理线上业务，工时更短，单位时间收入更高。",
    "tags": [
      "work",
      "remote",
      "career"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 6,
    "basePay": 252,
    "abilityRequired": 22,
    "reputationRequired": 12,
    "careerXp": 4,
    "requiredCapabilities": [
      "remote_work",
      "home_workspace"
    ],
    "isLongTerm": true
  },
  {
    "id": "job.project-coordinator",
    "contentStatus": "official",
    "name": "项目协调员",
    "description": "协调进度和沟通，要求更高，但回报也明显提升。",
    "tags": [
      "work",
      "office",
      "career"
    ],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 318,
    "abilityRequired": 27,
    "reputationRequired": 18,
    "careerXp": 5,
    "isLongTerm": true
  },
  {
    "id": "job.independent-consultant",
    "contentStatus": "official",
    "name": "独立项目顾问",
    "description": "以短项目计费的高阶自由职业，需要能力、声誉和市场判断。",
    "tags": [
      "work",
      "remote",
      "career"
    ],
    "kind": "freelance",
    "employmentKind": "repeatable_side_job",
    "hours": 4,
    "basePay": 268,
    "abilityRequired": 30,
    "reputationRequired": 25,
    "careerXp": 5,
    "requiredCapabilities": [
      "remote_work",
      "market_insight"
    ],
    "isLongTerm": false
  },
  {
    "id": "job.regional-operations-manager",
    "contentStatus": "official",
    "name": "区域运营经理",
    "description": "负责多个门店的经营节奏和团队协作，把运营经验带到更大的范围。",
    "tags": ["work", "management", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 8,
    "basePay": 620,
    "abilityRequired": 52,
    "reputationRequired": 35,
    "careerXp": 7,
    "experienceTags": ["operations", "management"],
    "experienceRequired": { "operations": 61, "management": 1 },
    "qualificationRequired": ["people_management_basics"],
    "category": "management",
    "isLongTerm": true
  },
  {
    "id": "job.category-operations-expert",
    "contentStatus": "official",
    "name": "品类运营专家",
    "description": "不带团队也能走得很远，用专业判断推动商品和运营策略。",
    "tags": ["work", "office", "career", "expert"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 720,
    "abilityRequired": 60,
    "reputationRequired": 28,
    "careerXp": 7,
    "experienceTags": ["operations", "data"],
    "experienceRequired": { "operations": 121 },
    "category": "technical",
    "isLongTerm": true
  },
  {
    "id": "job.photography-assistant-gig",
    "contentStatus": "official",
    "name": "摄影协助 Gig",
    "description": "为一次小型拍摄做现场协助，先把兴趣变成一笔可验证的经验。",
    "tags": ["work", "photography", "gig"],
    "kind": "temporary",
    "employmentKind": "gig",
    "hours": 4,
    "basePay": 168,
    "abilityRequired": 18,
    "reputationRequired": 4,
    "careerXp": 2,
    "experienceTags": ["media"],
    "requiredItems": ["item.vintage-camera"],
    "requirements": { "type": "interest_familiarity_at_least", "tag": "photography", "amount": 2 },
    "isLongTerm": false
  },
  {
    "id": "job.huanliu-warehouse-assistant",
    "contentStatus": "official",
    "name": "环流仓库助理",
    "description": "从收货、分拣和盘点开始，稳定积累物流现场经验。",
    "tags": ["work", "logistics", "starter"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 8,
    "basePay": 136,
    "abilityRequired": 10,
    "reputationRequired": 2,
    "careerXp": 2,
    "experienceTags": ["logistics"],
    "isLongTerm": true
  },
  {
    "id": "job.huanliu-dispatch-coordinator",
    "contentStatus": "official",
    "name": "环流物流协调员",
    "description": "连接仓库、车辆与客户的日常调度，把一线经验变成运营判断。",
    "tags": ["work", "logistics", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 286,
    "abilityRequired": 24,
    "reputationRequired": 12,
    "careerXp": 5,
    "experienceTags": ["logistics", "operations"],
    "experienceRequired": { "logistics": 22 },
    "isLongTerm": true
  },
  {
    "id": "job.course-operations-assistant",
    "contentStatus": "official",
    "name": "课程运营助理",
    "description": "协助课程排期、学员反馈和资料整理，从办公室岗位进入在线教育运营。",
    "tags": ["work", "office", "career", "education"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 238,
    "careerXp": 3,
    "experienceTags": ["office", "operations"],
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 15 },
      { "type": "attribute_at_least", "attribute": "communication", "amount": 12 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.learning-consultant",
    "contentStatus": "official",
    "name": "学习顾问",
    "description": "理解学习需求并陪伴学员完成选择，连接沟通、知识与长期关系。",
    "tags": ["work", "office", "career", "education"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 286,
    "careerXp": 4,
    "experienceTags": ["customer_service", "operations"],
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "communication", "amount": 25 },
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 20 },
      { "type": "attribute_at_least", "attribute": "appearance", "amount": 12 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.course-operations-specialist",
    "contentStatus": "official",
    "name": "课程运营专员",
    "description": "负责课程运营节奏、数据复盘和跨团队协作，把专业判断带进教育产品。",
    "tags": ["work", "office", "career", "education"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 330,
    "careerXp": 5,
    "experienceTags": ["operations", "data", "project"],
    "experienceRequired": { "operations": 21 },
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "professional", "amount": 28 },
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 28 },
      { "type": "attribute_at_least", "attribute": "communication", "amount": 22 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.course-teaching-assistant",
    "contentStatus": "official",
    "name": "线上课程助教",
    "description": "协助学员答疑、整理作业与维护课程秩序，把课程资格转成稳定的长期兼职。",
    "tags": ["work", "remote", "education"],
    "kind": "freelance",
    "employmentKind": "repeatable_side_job",
    "hours": 4,
    "basePay": 168,
    "abilityRequired": 14,
    "reputationRequired": 3,
    "careerXp": 2,
    "experienceTags": ["office", "customer_service"],
    "qualificationRequired": ["qualification.workplace-basics"],
    "isLongTerm": false
  },
  {
    "id": "job.research-assistant",
    "contentStatus": "official",
    "name": "研究助理",
    "description": "整理行业资料、核对访谈记录，为客户研究提供可靠的基础。",
    "tags": ["work", "office", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 275,
    "abilityRequired": 20,
    "reputationRequired": 8,
    "careerXp": 4,
    "experienceTags": ["office", "data"],
    "requiredItems": ["item.seed-laptop"],
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 26 },
      { "type": "attribute_at_least", "attribute": "professional", "amount": 20 },
      { "type": "attribute_at_least", "attribute": "communication", "amount": 15 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.business-analysis-assistant",
    "contentStatus": "official",
    "name": "商业分析助理",
    "description": "把客户问题拆成可验证的数据与假设，开始承担完整分析环节。",
    "tags": ["work", "office", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 338,
    "abilityRequired": 30,
    "reputationRequired": 12,
    "careerXp": 5,
    "experienceTags": ["office", "data", "project"],
    "experienceRequired": { "office": 40 },
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "professional", "amount": 30 },
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 32 },
      { "type": "attribute_at_least", "attribute": "communication", "amount": 20 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.business-analyst",
    "contentStatus": "official",
    "name": "商业分析师",
    "description": "独立完成研究与分析交付，在客户会议中解释判断和建议。",
    "tags": ["work", "office", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 438,
    "abilityRequired": 42,
    "reputationRequired": 20,
    "careerXp": 6,
    "experienceTags": ["office", "data", "project"],
    "experienceRequired": { "operations": 60 },
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "professional", "amount": 42 },
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 42 },
      { "type": "attribute_at_least", "attribute": "communication", "amount": 30 }
    ] },
    "isLongTerm": true
  },
  {
    "id": "job.travel-product-assistant",
    "contentStatus": "official",
    "name": "旅行产品助理",
    "description": "整理旅行线路、核对活动细节，让一次出发少一些临时决定。",
    "tags": ["work", "office", "career"],
    "kind": "regular",
    "employmentKind": "full_time",
    "hours": 7,
    "basePay": 260,
    "abilityRequired": 18,
    "reputationRequired": 5,
    "careerXp": 4,
    "experienceTags": ["office", "customer_service"],
    "requirements": { "type": "all", "conditions": [
      { "type": "attribute_at_least", "attribute": "communication", "amount": 18 },
      { "type": "attribute_at_least", "attribute": "knowledge", "amount": 15 }
    ] },
    "isLongTerm": true
  }
] satisfies readonly JobDefinition[];
