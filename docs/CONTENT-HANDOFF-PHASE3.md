# 《余量》第三阶段内容扩展交接包

这份文档交给下一位内容设计 AI。目标是让内容可以分批增加，不要求修改引擎或一次性迁移现有正式内容。

## 当前边界

- 工程层：`src/game/content/contracts.ts`、`src/game/content/registry.ts`、`src/game/engine/`、`src/game/store/`。
- 内容层：`src/game/content/official/` 与 `src/game/content/seed.ts`。
- 稳定接口：`GameState`、`ContentRegistry`、`dispatchGameAction`、`Simulation`、`Schedule`、Save Migration。
- 禁止内容作者修改 React、dispatcher 分支、RNG、时间推进和存档迁移。
- 稳定 ID 与中文名称分离；改名不改 ID。

## 当前内容清单

当前 Content Validator 通过的正式内容规模为：12 个工作、28 个商品、6 个住房、5 个人物、29 个事件、4 条事件链、3 个企业、4 个资产、2 个里程碑。第三阶段 Seed 另外提供少量接口覆盖示例：1 个活动（2 个 Option）、2 个投资、1 个公司、1 个招聘对白、1 条 Storyline、1 个关系互动和 1 个 ambient 生活动态。

正式内容目前继续集中在 `official/jobs.ts`、`items.ts`、`housing.ts`、`characters.ts`、`events.ts`、`eventChains.ts`、`businesses.ts`、`assets.ts`、`milestones.ts`。第三阶段的新类别已可通过 Registry 的可选集合渐进加入，不要求立刻建立大量正式数据文件。

## 能力覆盖矩阵

| 接口 | 已有可运行 Seed | 后续内容应重点覆盖 |
| --- | --- | --- |
| `ConditionDefinition.attribute_at_least` | 办公住房/细分属性条件 | 技术、销售、管理、教育职业路线 |
| `ActivityDefinition` + `ActivityOption` | 普通/特别放映，不同时长与费用 | 餐饮、运动、旅行、文化、兴趣、夜生活 |
| `InvestmentDefinition` | 稳健基金、成长基金 | 储蓄、黄金、股票、REIT、企业股权、房产基金 |
| `CompanyDefinition` | 白线工作室关联工作与人物 | 公司职业线、员工持股、商业机会 |
| `DialogueDefinition` | 招聘短对白 | 面试、离职、房东、投资人、合作伙伴 |
| `RelationshipInteractionDefinition` | 与小林吃饭 | 每个人物的专属活动、关系阶段奖励 |
| `StorylineDefinition` | `meet -> consider -> join` | 职业、人物、投资和长期生活故事 |
| `FinancialCategory` | 工资、生活、购物、投资转账 | 交通、通讯、课程、旅行、维修、企业成本 |

Seed 只证明接口和关键分支可运行，不代表正式文案或最终经济尺度。

## 内容模板

### 商品

```ts
{
  id: 'item.example-laptop', contentStatus: 'official', name: '轻薄笔记本',
  description: '让学习和远程工作更顺手。', tags: ['technology'],
  category: 'technology', price: 3999, consumable: false,
  sellable: true, resaleRatio: 0.55, lifestyleDelta: 3,
  capabilities: ['remote_work'],
  attributeEffects: { knowledge: 2 },
  requirements: { type: 'cash_at_least', amount: 3999 },
}
```

商品效果优先回答“为什么值得买”：属性提升、能力解锁、招聘准入、生活品质、收藏价值或可出售性。不要把同一效果复制到 React。

### 工作与招聘

```ts
{
  id: 'job.example-operations', contentStatus: 'official', name: '数据运营专员',
  description: '整理数据并跟进日常项目。', kind: 'regular', hours: 8,
  basePay: 280, careerXp: 4, isLongTerm: true,
  category: 'office', requirements: {
    type: 'all', conditions: [
      { type: 'attribute_at_least', attribute: 'knowledge', amount: 24 },
      { type: 'owns_item', itemId: 'item.example-laptop' },
    ],
  },
  recruitment: {
    intro: [{ speakerName: '招聘负责人', text: '我们想找一位做事细致的人。' }],
    interview: [{ speakerName: '招聘负责人', text: '你愿意从项目记录开始吗？' }],
    offerText: '这是正式岗位，排班和薪资会写入邀请。',
  },
}
```

新岗位使用 `requirements`。旧 `abilityRequired`、`reputationRequired`、`requiredItems`、`requiredCapabilities` 保留兼容，但新内容不要再新增这些平行门槛字段。玩家看到的缺口由 `explainCondition()` 生成。

### 投资

```ts
{
  id: 'investment.example-gold', contentStatus: 'official', name: '黄金储备',
  description: '波动较低的保值资产。', kind: 'gold', risk: 'low',
  baseValue: 480, minimumUnits: 1, dailyDrift: 0.0002,
  dailyVolatility: 0.002, dividendRate: 0,
}
```

默认投资波动应克制。`investment_transfer` 是资产配置，不是消费；出售使用 `asset_liquidation`，分红使用 `investment_dividend`。

### 活动与关系互动

```ts
{
  id: 'activity.example-gym', contentStatus: 'official', name: '健身房',
  description: '改善体能，也给自己一点规律。', category: 'fitness',
  options: [{ id: 'visit', label: '单次训练', durationMinutes: 120,
    cashCost: 60, effects: [
      { type: 'attribute', attribute: 'fitness', amount: 1 },
      { type: 'attribute', attribute: 'mood', amount: 2 },
    ] }],
  financialCategory: 'service',
}
```

人物专属互动用 `RelationshipInteractionDefinition`，把人物 ID 放在 definition 上，把每种花费/时长/效果放在 Option 上。不要为每个人物写一套 dispatcher。

### Storyline

```ts
{
  id: 'storyline.example-growth', contentStatus: 'official',
  name: '一起成长', description: '一段职业与关系故事。',
  initialStageId: 'meet',
  stages: [
    { id: 'meet', dialogueId: 'dialogue.example-intro', nextStageId: 'offer' },
    { id: 'offer', eventId: 'event.example-offer', branches: [
      { id: 'accept', nextStageId: 'join', text: '接受机会' },
      { id: 'wait', nextStageId: 'consider', text: '再想想' },
    ] },
    { id: 'consider', waitDays: 7, nextStageId: 'join' },
    { id: 'join', dialogueId: 'dialogue.example-join' },
  ],
}
```

阶段 ID 是长期存档引用。后续如果改排序，保留已有 ID；不要把数组索引或数字阶段号当作存档键。

## 财务规则

所有现金变动必须由引擎动作立即记录，动画只读账本。使用以下分类：

- 收入：`wage`、`side_job`、`bonus`、`business_income`、`property_income`、`investment_dividend`、`event_income`。
- 消费：`housing`、`living`、`food`、`transport`、`communication`、`shopping`、`entertainment`、`social`、`education`、`travel`、`service`、`maintenance`、`business_cost`。
- 资产配置：`investment_transfer`、`property_transfer`、`business_transfer`、`collectible_transfer`。

月结同时解释收入、真实消费、资产配置、现金结余和净资产变化。不要把买基金、买房或买收藏品伪装成消费。

## 验证交接流程

每次内容包独立加入后运行：

```text
npm run content:validate
npm run content:simulate
npm test
npm run build
npm run e2e
```

Validator 的 ERROR 是结构性错误，会让校验失败；WARNING 是静态不可达/可能矛盾等启发式提示，先人工评估，不会阻止构建。固定种子模拟报告会输出重大事件日期、事件间隔分布和每月事件数量，用来防止重大事件恢复成每日打断。

## 推荐扩充顺序

1. 数码、服饰、家居、收藏和珠宝商品。
2. 餐饮、电影、运动、聚会、旅行和兴趣活动。
3. 基金、黄金、股票、公司股权和房产投资。
4. 更多职业路线、招聘对白、面试和离职对白。
5. 人物专属互动、关系阶段和长期故事。
6. 职业、人物、商业、投资和生活连续剧情。

每一批只新增数据，先过 Validator 与固定种子模拟，再进行浏览器试玩；不需要等待其他类别全部完成。
