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
  }
] satisfies readonly JobDefinition[];
