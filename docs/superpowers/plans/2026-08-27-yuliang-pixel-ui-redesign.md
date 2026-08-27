# 《余量》像素 UI 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变玩法、存档和财务语义的前提下，将现有应用完整重构为参考包定义的黑白 1-bit 像素游戏界面。

**Architecture:** 保留 `gameStore`、`GameAction` 与引擎作为唯一状态和行为来源。新增无业务状态的像素 UI 原语、图标和壳层组件，以 CSS Grid/Flex 重排现有视图；逐步从 `App.tsx` 提取展示组件，但不进行引擎或 Store 重写。

**Tech Stack:** React, TypeScript, Vite, Zustand, Vitest, Testing Library, Playwright, CSS Grid/Flex/SVG。

**Spec:** `docs/余量-UI-reference-pack.zip` 内 `余量-UI-IMPLEMENTATION-SPEC.md` 与四张 1448×1086 参考图；产品与技术语义以 `docs/NEXT-UPDATE-FOUNDATION.md` 和当前代码为准。

## Global Constraints

- 不修改 gameplay/domain rules、Zustand 架构、存档键与 save schema。
- 不删除、隐藏或伪造任何现有功能、内容、数值或动作。
- 不新增等级、主线、评分、S/A/B/C 评价或“正确人生”判断。
- 不使用截图背景、截图切片、Emoji、外部字体或新依赖。
- 资产变现本金不得计入收入；月结继续分离收入、消费、资产配置、资产变现、已实现损益、净资产变化。
- 桌面主校准宽度 1440px；移动端保留既有语义并防止页面横向溢出。
- 不部署、不发布、不推送远程。

---

### Task 1: 像素设计系统与 App Shell

**Files:**
- Create: `src/game/ui/pixel/PixelUI.tsx`
- Create: `src/game/ui/pixel/PixelIcon.tsx`
- Create: `src/game/ui/pixel/PersistentStatusBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- `PixelIcon({ name, size })` 只输出可访问的单色 SVG。
- `SegmentMeter({ value, max, segments })` 只根据 props 渲染段格。
- `PersistentStatusBar({ game })` 读取真实 attributes，不派发游戏动作。
- App Shell 继续通过 `setView(ViewId)` 导航，通过当前 `game` 显示时间、现金和净资产。

- [ ] 增加失败测试：主导航选中态、状态条真实数值与像素原语可访问标签可查询。
- [ ] 运行 `npm test -- src/App.test.tsx` 并确认新断言先失败。
- [ ] 实现 SVG 图标、段式计量、面板/按钮/Tab 原语和底部属性状态条。
- [ ] 重排顶部状态栏和导航，保持现有 `data-testid` 与按钮文本兼容。
- [ ] 建立 `--pixel-*` tokens、全黑背景、直角边框、反相选中和键盘焦点。
- [ ] 运行 `npm test -- src/App.test.tsx` 与 `npm run build`。

### Task 2: Life 主循环

**Files:**
- Modify: `src/App.tsx` (`TimeConsole`, `LifeView`, `WeekPlanner`)
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- 所有显示由 `activityAtTime`、`deriveActivityProgress`、`forecastWeeklyPlan` 和 `game.weeklyPlan` 驱动。
- 开始、暂停和速度继续派发既有 `GameAction`。

- [ ] 增加/保留开始、暂停、x1/x2/x4 与计划格真实状态测试。
- [ ] 把时间、当前活动、进度、下一活动和运行控件组成桌面 Hero；Forecast 为右栏。
- [ ] 把计划板重排为 7 列游戏棋盘，并增加待处理事项的真实摘要区域。
- [ ] 在 390px 下保持 CTA 可见、计划板语义横滚、页面本身无横向溢出。
- [ ] 运行 Life 相关组件测试和 Playwright smoke。

### Task 3: Career 招聘市场

**Files:**
- Modify: `src/game/ui/CareerView.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- 搜索/筛选仍从 `game.vacancies` 和 canonical job definitions 派生。
- 申请、Offer、撤回、兼职安排仍使用既有 actions；只显示定性竞争力，不构造概率。

- [ ] 为选中职位详情、筛选和已申请状态补充组件测试。
- [ ] 实现左筛选、中央职位网格、右详情面板和下方申请/Offer/履历摘要。
- [ ] 显示真实 requirement hints、当前值、缺口、公司、薪资、期限和申请状态。
- [ ] 保持其他职业二级页可达且统一像素视觉。
- [ ] 运行职业组件与桌面/移动 E2E。

### Task 4: Shop / 生活内容目录

**Files:**
- Modify: `src/App.tsx` (`ShopView`, inventory/wishlist/service/activity panels)
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`
- Test: `e2e/smoke.spec.ts`

**Interfaces:**
- 商品、购物车、库存、愿望单、服务、活动与排期继续绑定当前 store/actions。

- [ ] 增加购物车、购买、愿望单、服务与活动入口的保留测试。
- [ ] 实现矩形分类 Tab、三列目录、选中详情和右侧购物清单/本周安排/已拥有/愿望单。
- [ ] 对无真实效果的内容显示中性描述，不构造属性变化。
- [ ] 在移动端按目录→详情→工具区堆叠并保持长名称与币值不裁切。
- [ ] 运行商店组件与桌面/移动 E2E。

### Task 5: 月度结算

**Files:**
- Modify: `src/App.tsx` (`MonthlySummary`, `MonthlySummaryModal`)
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`
- Test: `src/game/engine/monthlySettlement.test.ts`

**Interfaces:**
- 数据来自 `lastFinancialSummary` 与 ledger summarizer；`continue_month` 行为保持不变。

- [ ] 增加收入/消费/配置/变现/损益/净资产和“进入下月”断言。
- [ ] 实现全屏游戏结算构图、四列财务摘要、真实亮点和中性“本月回顾”。
- [ ] 确认不存在等级/评分，资产本金不作为收入展示。
- [ ] 运行结算组件与引擎测试。

### Task 6: 其余视图统一与响应式

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/game/ui/CareerView.tsx`
- Modify: `src/game/ui/LifeHistoryList.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Wealth、住房、企业、Social、City、Profile、历史、事件和迁移 UI 保持现有 props/actions。

- [ ] 将现有通用 class 映射到统一 panel/card/badge/button/token 体系。
- [ ] 校正桌面密度、2/3/4 列网格、空状态、模态框与长内容滚动。
- [ ] 校正 800px/520px 断点，避免页面级横向溢出和 CTA 裁切。
- [ ] 运行组件测试、TypeScript 和 build。

### Task 7: 浏览器参考对照与全量回归

**Files:**
- Modify only files with observed visual or interaction defects.
- Store screenshots outside repository.

**Interfaces:**
- Browser flow: app load → Life/Career/Shop/Settlement representative real state → screenshot and interaction evidence。

- [ ] 启动真实应用并在约 1440px 桌面捕获四个主界面。
- [ ] 按结构、比例、对齐、间距、字号、对比、图标、边框、状态和微调顺序维护 mismatch ledger 并修复。
- [ ] 在 390×844 检查导航、计划、市场、目录、结算、模态和页面 overflow。
- [ ] 检查控制台错误、刷新/持久化和主要交互。
- [ ] 运行 `npm test`、`npm run content:validate`、`npm run build`、`npm run e2e`、`npm run content:simulate`。
- [ ] 检查 `git diff --check`、`git status --short` 和最终 scoped diff；不提交、不推送。

## Self-review

- Spec coverage: 共享系统、四主界面、其余页面、响应式、真实浏览器、财务语义、持久化与最终全量验证均有对应任务。
- Placeholder scan: 无 TBD/TODO/“稍后实现”占位。
- Type consistency: 全部域交互继续使用既有 `GameState`、`GameAction`、`ViewId` 和 store API；新增组件仅消费 props。
