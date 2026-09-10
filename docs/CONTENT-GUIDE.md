# 《余量》内容填写指南

内容只修改 `src/game/content/official/` 下对应类别文件，不修改引擎、dispatcher 或 React 组件。每个正式内容使用稳定的 ASCII ID；中文 `name`、`description`、事件正文和选项文案可以随时修改，不能用中文文案作为引用。

## 文件与渐进替换

- `src/game/content/contracts.ts`：所有 Definition、Condition、Effect、Modifier 类型。
- `src/game/content/official/jobs.ts`：正式工作；当前为空时使用 Seed 工作。
- `src/game/content/official/items.ts`：正式商品；当前为空时使用 Seed 商品。
- `src/game/content/official/housing.ts`：正式住房。
- `src/game/content/official/businesses.ts`：正式企业。
- `src/game/content/official/assets.ts`：正式资产。
- `src/game/content/official/characters.ts`：正式人物。
- `src/game/content/official/events.ts`：正式事件。
- `src/game/content/official/eventChains.ts`：正式事件链。
- `src/game/content/official/milestones.ts`：正式里程碑。
- `src/game/content/vocabulary.ts`：Capability 与 Tag 注册表。
- `src/game/balance/config.ts`：集中平衡参数，不在内容文件复制公式。

每类 Official 数组中的条目会按 ID 覆盖对应 Seed 条目，未覆盖的 Seed 条目继续保留；因此可以先替换一个工作或一个事件而不破坏其他内容。每次替换后运行 `npm run content:validate`、`npm run content:simulate` 和 `npm run e2e`。
替换已有 Seed 条目时保留原 ID；如果确实要新增条目，才分配新的稳定 ID。这样其他类别的引用和旧存档都不需要迁移。

## 写法规则

- ID 使用稳定的小写 ASCII，例如 `job.office-assistant`；不要从中文名称生成 ID。
- 数值只填写该内容的基础值；工资、净资产、企业利润、奖励 tier 缩放和事件抽取由引擎计算。
- `conditions` 可用 `all`、`any`、`not` 组合；引用其他内容时必须使用稳定 ID。
- `effects` 是声明式数组，不能填写函数。可使用现金、属性、关系、商品、解锁、折扣、永久 modifier、时间和事件链推进。
- 事件每个选项都必须有整体正向价值。允许现金/时间成本换能力、关系、永久 modifier、解锁或机会；禁止无补偿纯负面结果。
- Modifier 只能使用能力清单中的目标、操作和 Tag 选择器。
- 事件链只声明阶段、事件 ID、等待天数和条件；不要创建新的剧情执行逻辑。
- 商品、住房、企业和资产的解锁通过 `unlock_*` effect 或通用条件完成，不在 dispatcher 中写具体 ID。

## 必填字段速查

- 所有内容：`id`、`contentStatus: "official"`、`name`、`description`。
- 工作：`kind`、`hours`、`basePay`、`careerXp`、`isLongTerm`。
- 商品：`category`、`price`、`consumable`、`sellable`、`resaleRatio`、`lifestyleDelta`。
- 住房：`mode`、`rentPerDay`、`valuation`、`lifestyleDelta`、`furnitureCapacity`。
- 企业：`price`、收入/成本基础值及三个档位数组。
- 资产：`kind`、`price`、`valuation`、`dailyIncome`、`volatility`。
- 人物：`identity`、`initialRelationship`、`stages`。
- 事件：`title`、`body`、`category`、`weight`、`cooldownDays`、至少两个 `choices`。
- 事件链：按升序填写 `stages`，每个阶段引用一个已存在事件。

## 验证与交接

`validateContent` 会检查重复 ID、未知引用、无效数值、未知 vocabulary、断裂事件链、不可达事件、事件选项数量和没有整体正向价值的选项。未知或被移除的存档 ID 会在迁移时安全清理并补偿，不会让存档崩溃。

Seed 内容位于 `src/game/content/seed.ts`，只用于框架试玩，不代表正式文案或最终经济平衡。

## 第三阶段扩展接口

第三阶段新增能力均为可选 Registry 集合。内容作者只新增声明式数据，不修改 `GameState`、`dispatchGameAction`、Simulation 或 React。旧工作、商品、住房和事件仍可继续使用旧字段；新内容优先使用通用 `ConditionDefinition` 与细分属性。

### 细分属性与兼容 ability

合法属性为：`professional` 专业、`knowledge` 知识、`communication` 沟通、`fitness` 体能、`appearance` 形象、`network` 人脉、`mood` 心情。

新岗位条件示例：

```ts
requirements: {
  type: 'all',
  conditions: [
    { type: 'attribute_at_least', attribute: 'professional', amount: 24 },
    { type: 'owns_item', itemId: 'item.seed-laptop' },
  ],
}
```

旧 `abilityRequired`、`ability_at_least`、`stat: ability` 永久保留为兼容输入。引擎以专业、知识、沟通、体能四项平均值同步计算 `ability`；不要在内容中同时维护两套互相矛盾的成长数值。

申请条件应由 `explainCondition(condition, state, registry, balance)` 解释，UI 会把缺口翻译成中文；不要写 `job_tag_technical` 之类的内部标签给玩家看。

### 活动 Option

活动由 `ActivityDefinition` 注册，时长、费用和效果必须放在每个 `ActivityOption`，不要在 Activity 级别共享：

```ts
{
  id: 'activity.seed-movie', contentStatus: 'seed', name: '看电影',
  description: '给自己留一点时间。', category: 'film',
  options: [
    { id: 'standard', label: '普通影厅', durationMinutes: 180, cashCost: 68,
      effects: [{ type: 'attribute', attribute: 'mood', amount: 4 }] },
    { id: 'premium', label: '特别放映', durationMinutes: 240, cashCost: 128,
      effects: [{ type: 'attribute', attribute: 'mood', amount: 7 }] },
  ],
  financialCategory: 'entertainment',
}
```

活动分类从数据读取：`food`、`film`、`game`、`fitness`、`social`、`culture`、`travel`、`hobby`、`nightlife`、`premium`。住房与租赁属于“生活”，投资房产和资产属于“财富”；商品旧分类 `entertainment` 在 UI 中显示为“休闲用品”，避免与活动混淆。

### 投资与公司

投资使用 `InvestmentDefinition`，估值由固定种子和引擎波动模型计算：

```ts
{
  id: 'investment.example-index', contentStatus: 'official', name: '稳健指数基金',
  description: '分散持有的长期资产。', kind: 'fund', risk: 'low',
  baseValue: 102, minimumUnits: 1, dailyDrift: 0.0003,
  dailyVolatility: 0.002, dividendRate: 0.00005,
}
```

购买投资使用 `investment_transfer`，属于现金转资产，不计入消费；分红使用 `investment_dividend`。公司用 `CompanyDefinition` 关联岗位、人物、投资、企业和事件，引用必须使用稳定 ID。

### 招聘、离职与对白

岗位可以声明 `recruitment.intro`、`recruitment.interview`、`recruitment.offerText`，也可以引用 `dialogueId`。基础岗位可以只有 intro/offer，中高级岗位再提供 interview。离职使用 `resignation.dialogue` 与可选 `retentionBonus`。对白 line/choice 的 `nextId` 必须指向同一 Dialogue 内存在的稳定字符串 ID；只展示对白时不需要伪造选择。

### 关系互动与剧情

`RelationshipInteractionDefinition` 通过 `options` 表达费用、时长、关系和属性效果；每个 Option 可有自己的条件和人物。较长人生故事使用 `StorylineDefinition`：阶段 ID 是稳定字符串，例如 `meet`、`consider`、`join`，用 `nextStageId` 或 `branches[].nextStageId` 连接，不把易漂移的数字阶段作为长期存档引用。

### 月度财务

所有现金事实由引擎记录到 `FinancialLedgerState`。内容只选择合法的 `FinancialCategory`：收入包括 `wage`、`side_job`、`bonus`、`business_income`、`property_income`、`investment_dividend`、`event_income`；消费包括 `housing`、`living`、`food`、`transport`、`communication`、`shopping`、`entertainment`、`social`、`education`、`travel`、`service`、`maintenance`、`business_cost`；资产配置包括 `investment_transfer`、`property_transfer`、`business_transfer`、`collectible_transfer`。

每月详细流水只保留当前月，历史保留聚合 `MonthlyFinancialSummary`（最近 12 个月）。月结同时显示现金变化、消费支出、资产配置和净资产变化；动画不会改变规则，刷新也不会重复扣费。

### Content Pack 与校验

内容可以按 `ContentPack` 渐进接入：

```ts
{ packId: 'official-shopping-02', version: 1, contentStatus: 'official', content: { items: [...] } }
```

通过 `composeContentPacks()` 合并，稳定 ID 的后续包覆盖同 ID 条目，新增 ID 直接追加。`validateContent` 的结构性错误会使 `valid === false` 并阻止校验脚本通过；静态不可达、条件可能矛盾等启发式问题只进入 `warnings`，不会阻止构建。新增内容后依次运行：

```text
npm run content:validate
npm run content:simulate
npm run e2e
```
