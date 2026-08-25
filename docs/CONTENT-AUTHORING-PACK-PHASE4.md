# 《余量》Content Authoring Pack · Phase 4

此包以当前运行时代码为准，供 Content Designer AI 批量扩充内容。内容只能通过稳定 ID、声明式 Contract 和 Validator 进入游戏；不得修改 React 或 Simulation。

## 内容集合

ContentRegistry 支持 Companies、Jobs、Vacancy Templates、Items、Activities、Investments、Characters、Relationship Interactions、Events、Storylines，以及 Recruitment / Interview / Offer / Negotiation / Resignation Dialogues。

稳定 ID 为小写 a-z0-9._-，例如 company.northstar、job.data-operator、vacancy-template.northstar-data-operator。引用必须指向同一 Content Pack 或已存在官方内容。

## 职业 Contract

每个新 Job 都必须显式声明 employmentKind：

~~~ts
{
  id: 'job.data-operator',
  contentStatus: 'official',
  name: '数据运营专员',
  description: '负责数据清洗与运营复盘。',
  tags: ['work', 'office'],
  kind: 'regular',
  employmentKind: 'full_time',
  hours: 8,
  basePay: 290,
  careerXp: 4,
  isLongTerm: true,
  category: 'office',
}
~~~

合法工作类型为 full_time、repeatable_side_job、gig。freelance 到 repeatable_side_job 与 temporary 到 gig 仅在旧存档迁移时保留。新 Content Pack 缺少 employmentKind 会被 Validator 拒绝。

## 公司与公开 Vacancy

VacancyTemplate 是公开招聘蓝图，不是玩家状态。运行时用 GameState、seed、month 和 VacancyTemplate 数组生成 8–12 条稳定 VacancyState；相同月相同 seed 结果一致。

~~~ts
{
  id: 'vacancy-template.northstar-data',
  contentStatus: 'official',
  name: '北辰数据运营',
  description: '北辰咨询公开招聘。',
  tags: ['work', 'office'],
  jobId: 'job.data-operator',
  companyId: 'company.northstar',
  route: 'market',
  salaryMultiplierRange: [0.95, 1.10],
  durationDays: 21,
  marketWeight: 2,
}
~~~

同一个 jobId 可存在任意多家公司的模板，薪资、路线和有效期分别声明。当前官方内容已示范同一行政助理出现在星河科技和远望零售。

## 工作机会、申请和快照

公开 Vacancy 与 JobOpportunityState 完全分开。人物推荐、内部转岗、猎头、剧情、特殊兼职和限时机会只写入 Opportunity。

提交时引擎保存 JobApplicationState：vacancyId、opportunityId、jobId、companyId、salaryRange、route、submittedDay、resultDay、offerExpiresDay、竞争力、确定性结果、反馈和冷却日。Vacancy 或 Opportunity 过期只禁止新申请，绝不能删除已有 Application。

生命周期为 submitted、screening、interview、waiting、rejected、offer、accepted、withdrawn、expired。Offer 默认 7–14 天后失效；同 Vacancy 不可重复投递，同 Job/Company 在活动申请或冷却期不可重复，正式职位并行上限由 Balance 配置。

## RequirementHint

招聘 UI 的缺失条件使用下面的稳定提示结构，未来可直接升级为通用 AcquisitionHint：

~~~ts
type RequirementHint = {
  requirementId: string;
  label: string;
  source: 'activity' | 'starter_job' | 'item' | 'capability' | 'relationship' | 'goal';
  targetId?: string;
  actionLabel: string;
};
~~~

每个要求至少提供一个可执行去向，例如学习/活动、入门岗位、商品或 Capability、人物关系，或设置为职业目标。

## Dialogue Outcome

终止型 DialogueChoice 必须显式 outcome，并给出人类可读的 narrative。承诺型选择还应标注对应领域动作。

~~~ts
{
  id: 'accept-offer',
  text: '接受这份 Offer',
  outcome: {
    kind: 'offer',
    narrative: '你确认接受，入职安排将在下周生效。',
    action: 'accept_application_offer',
  },
}
~~~

Validator 会拒绝无 nextId 且无 outcome 的 silent no-op。

## 兼职与 Gig

长期兼职使用 repeatable_side_job；成功接受后引擎写入 AcquiredSideJobState，周计划只读取该状态。

一次性 Gig 使用 gig，并生成：

~~~ts
{
  id: 'gig.trade-show-assistant',
  jobId: 'job.trade-show-assistant',
  validFromDay: 6,
  expiresDay: 7,
  executableDay: 6,
  startMinute: 600,
  endMinute: 960,
  pay: 480,
  source: '活动主办方',
}
~~~

Gig 必须有可执行时间窗、报酬和来源；完成后写入 gig_completed Highlight，过期后关闭。

## 账本与月结

金额必须使用 FinancialCategory：income（工资、兼职、奖金、分红、realized_gain）、expense、asset_allocation、asset_liquidation、realized_loss、valuation_change。

出售投资须同时记录：

1. asset_liquidation：全部现金回收，并保存 costBasis。
2. realized_gain 或 realized_loss：仅售价减成本，cashDelta 为 0。

本金不是收入。月结总收入只累计收入组，资产变现规模单列。

当月重要收获由 MonthlyHighlight 实时追加：new_job、new_contact、side_job_acquired、gig_completed、major_purchase、new_asset、attribute_milestone、storyline_completed。同一来源/里程碑应使用稳定 id 去重。

## 校验与测试

~~~powershell
npm run content:validate
npm test
npm run build
npm run e2e
~~~

固定 seed 的职业与月结覆盖位于 src/game/engine/careers.test.ts、simulation.test.ts、forecast.test.ts 和 phase3.test.ts。新增内容前先运行 Validator；新增 Contract 字段时同步更新本文件。

## 当前官方职业内容

12 个 Jobs、3 个 Phase 4 Companies、13 个 Vacancy Templates。当前公司：星河科技、远望零售、启明服务。模板覆盖基础岗位、办公室岗位、长期兼职和 Gig，包含同职位不同公司的公开招聘示例。
