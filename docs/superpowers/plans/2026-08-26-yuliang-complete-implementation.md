# 《余量》完整实现执行计划

**Spec:** `docs/NEXT-UPDATE-FOUNDATION.md`

**Goal:** 在现有架构上把设计稿转化为可发现、可查看、可执行、正确结算、可持久化并进入账本/历史/摘要的完整自由人生模拟。

## Global Constraints

- `docs/NEXT-UPDATE-FOUNDATION.md` 是唯一产品与内容设计基线；仓库代码是技术架构、接口、行为和兼容性事实来源。
- 仅 schema、数据、占位 UI 或不可达实现不算完成。
- 每个阶段按最小 vertical slice 实施并立即验证。
- 不新增主线、玩家等级或强制人生阶段。
- 不改变财务语义，不让 UI 动画成为状态来源，不破坏旧存档。
- 不过度模拟房产、车辆、企业或投资；不部署、不发布、不推送。

## Task 1: Phase 0 — audit and coverage matrix

固定测试、构建、E2E、内容与存档基线，建立 `docs/IMPLEMENTATION-COVERAGE-MATRIX.md`。

## Task 2: Phase 1 — shared foundations

完成 AcquisitionHint、职业经验/资格、统一历史、地点引用和版本化迁移闭环。

## Task 3: Phase 2 — career world

完成公开招聘、兼职、Gig、谈薪离职、专家/管理、跨行业和猎头职业闭环。

## Task 4: Phase 3 — consumption and activities

完成商品、服务、订阅、活动、娱乐、旅行、愿望清单与消费历史闭环。

## Task 5: Phase 4 — relationships and events

完成人物、关系、偏好、消息、Ambient、Major Event、Storyline 与摘要闭环。

## Task 6: Phase 5 — wealth and assets

完成投资、住房、房产、车辆和高价值资产闭环，保持严格财务语义。

## Task 7: Phase 6 — growth and qualifications

完成属性提升路径、课程、资格、兴趣熟练度和防刷成长闭环。

## Task 8: Phase 7 — enterprises and equity

完成个人业务、企业、合伙、融资、股权、上市、并购和控股闭环。

## Task 9: Phase 8 — city and long-term world

完成澄川市区域、地点、Venue、轻量通勤和长期世界演化闭环。

## Task 10: Phase 9 — final verification and audit

完成多年月度/年度模拟、桌面与移动浏览器 QA、覆盖矩阵审计和实际内容数量报告。

## Verification

每个 vertical slice 运行对应单测、内容校验、固定种子模拟、迁移/刷新测试、生产构建及 Playwright 桌面和移动流程。最终运行全量验证并逐项更新覆盖矩阵。
