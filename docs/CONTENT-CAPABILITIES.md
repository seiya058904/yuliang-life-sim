# 《余量》内容能力清单

这是给内容设计 AI 的速查表。详细字段以 `src/game/content/contracts.ts` 为准；不需要阅读核心引擎即可按下列能力填写内容。

## Condition

`all`、`any`、`not`；`day_at_least`、`day_at_most`、`time_between`；`player_stage`；`cash_at_least`、`ability_at_least`、`reputation_at_least`、`lifestyle_at_least`；`current_job`、`current_salary_at_least`、`job_experience_at_least`；`owns_item`、`has_capability`；`housing_is`；`owns_business`、`owns_asset`；`relationship_at_least`、`relationship_stage_at_least`；`completed_event`、`completed_milestone`；`chain_stage_at_least`；`flag`。

## Effect

`cash`（可选 `rewardTier`）、`stat`（`ability` / `reputation` / `lifestyle`）、`relation`、`item`、`unlock_capability`、`unlock_job`、`unlock_event`、`unlock_housing`、`unlock_business`、`unlock_asset`、`discount`、`modifier`、`advance_time`、`location_development`、`set_flag`、`advance_chain`。

## Modifier

目标：`work_pay`、`work_hours`、`study_gain`、`business_profit`、`housing_rent`、`shop_price`、`event_reward`。

操作：`add` 或 `multiply`。可选 `tags` 作为适用范围。乘法值必须大于 0；工作时间、租金和商店价格低于 1 的乘数代表正向改善。

## Capability

- `remote_work`：解锁远程工作。
- `home_workspace`：满足办公室类工作或在家工作的条件。
- `business_license`：满足基础企业机会的经营条件。
- `market_insight`：供正式内容扩展投资或市场事件使用。

新增 Capability 必须先加入 `src/game/content/vocabulary.ts`，再在内容中引用。

## Tag

当前 Tag：`work`、`office`、`remote`、`starter`、`technology`、`clothing`、`furniture`、`luxury`、`collectible`、`housing`、`business`、`project`、`asset`、`relationship`、`life`、`city`、`luck`、`career`、`shopping`、`social`、`leisure`、`travel`、`investment`、`low-risk`、`growth`、`hobby`、`photography`、`gig`、`management`、`expert`、`education`、`headhunter`、`logistics`。

Tag 用于内容筛选、折扣和 modifier 适用范围。新增 Tag 必须注册后使用。

## Reward Tier

- `small`：`0.55×`
- `normal`：`1×`
- `large`：`1.8×`
- `milestone`：`3×`

倍率属于引擎 Balance 配置；内容只选择 tier，不复制公式。

## 关键阶段阈值

- 玩家阶段：`start` ¥0、`growing` ¥2,500、`stable` ¥10,000、`wealthy` ¥50,000 净资产。
- 关系阶段：0、25、50、75。
- 初始状态：现金 ¥500、能力 10、声誉 0、生活水平 10、第 1 天 08:00。
- 事件默认目标：平均每天 1–2 个，单日上限 2 个。
- 住房周转保护冷却：14 天；仅作为现金不足的兜底保护。

如果正式内容需要调整阈值，应修改 Balance 配置并重新运行 validator、60 天策略模拟和浏览器试玩。

## 第三阶段扩展

### Attribute

细分属性：`professional`（专业）、`knowledge`（知识）、`communication`（沟通）、`fitness`（体能）、`appearance`（形象）、`network`（人脉）、`mood`（心情）。新内容使用 `attribute_at_least` 与 `attribute`；旧 `ability_at_least` 和 `stat: ability` 继续有效。旧能力由专业、知识、沟通、体能四项平均值同步得出，不维护两套会漂移的成长规则。

### Financial Ledger

所有现金事实进入 `FinancialLedgerState`：`income` 是收入，`consumption` 是被消耗的支出，`asset_allocation` 是现金换成投资/房产/企业/收藏资产，`asset_liquidation` 是资产变现。内容只声明 `FinancialCategory`，不修改账本逻辑。当前月保留明细，最近 12 个月保存聚合 `MonthlyFinancialSummary`。

### Content Definition

当前 Registry 还可承载：`ActivityDefinition`（每个 `ActivityOption` 独立声明时长、费用和效果）、`InvestmentDefinition`、`CompanyDefinition`、`DialogueDefinition`、`RelationshipInteractionDefinition`、`StorylineDefinition`。活动分类由数据生成，住房/租赁归入“生活”，投资房产与资产归入“财富”。

`ContentPack` 使用稳定 `packId`、`version`、`contentStatus`；当前 Seed/Official 文件不需要迁移到单一巨文件。未来可通过 `composeContentPacks` 渐进合并新类别。稳定 ID 永远不以中文名称替代。

### Recruitment / Dialogue / Storyline

工作准入优先使用通用 `ConditionDefinition`；`abilityRequired`、`reputationRequired`、`requiredItems` 与 `requiredCapabilities` 是旧内容兼容输入。UI 通过 `explainCondition()` 展示可读的缺口。招聘可声明 intro/interview/offer，离职可声明对话与留任加薪。剧情阶段使用稳定字符串 ID、显式 `nextStageId` 和分支，不把数字 stage 当作长期存档引用。

### Seed 覆盖示例

当前 Seed 用例覆盖：旧 ability 岗位、细分属性条件接口、商品属性效果、每个 Option 独立价格的电影活动、社交互动、低/中风险基金、重大事件奖励结算、生活动态、招聘/离职接口、投资资产配置和月度账单。正式第二批内容可按能力覆盖矩阵逐类新增，不需要修改 React 或核心 dispatcher。

### 合法词汇补充

新增 Tag 包括：`social`、`leisure`、`investment`、`project`、`low-risk`、`growth`、`logistics`。金融分类包括：`wage`、`side_job`、`bonus`、`business_income`、`property_income`、`investment_dividend`、`event_income`、`housing`、`living`、`food`、`transport`、`communication`、`shopping`、`entertainment`、`social`、`education`、`travel`、`service`、`maintenance`、`business_cost`、`investment_transfer`、`property_transfer`、`business_transfer`、`collectible_transfer`、`asset_liquidation`。
