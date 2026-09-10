# 《余量》 · Yuliang Life Sim

React + TypeScript + Vite + Zustand 的**人生模拟游戏**（desktop-first，横屏优先，黑白像素控制台风格）。

玩家负责规划人生，模拟系统负责让世界持续运行：安排一周、观察世界自动推进，并在职业、消费、财富、关系与城市生活之间做出可逆的选择。界面像一台可信赖的黑白像素人生控制台——信息紧凑但不拥挤，反馈直接但不评判，不给任何人生路线打分。

## 技术栈与命令

```text
npm install                     # 安装依赖
npm run dev -- --host 127.0.0.1 --port 4173   # 开发服务器
npm run content:validate        # 校验官方/种子内容的契约完整性
npm run content:simulate        # 确定性模拟冒烟脚本
npm test                        # Vitest 单元/组件测试
npm run build                   # 内容校验 + TypeScript 构建 + Vite 构建
npm run e2e                     # Playwright 桌面与移动端项目
```

## 目录结构

```text
src/
  App.tsx                       # 应用外壳与页面组合
  game/engine/                  # 游戏规则与纯状态转换（dispatchGameAction 为入口）
  game/store/gameStore.ts       # Zustand 适配层：加载/迁移/保存浏览器存档
  game/content/contracts.ts     # 内容/状态契约定义
  game/content/official/        # 官方权威内容（保持契约同步）
  game/content/seed.ts          # 兜底/合成内容与注册表
  game/ui/                      # 页面组件（Life / Career / Shop / Wealth / Social / City / Profile）
  game/ui/pixel/                # 共享像素 UI 原语、图标、插画、常驻状态栏
  main.tsx / styles.css         # 入口与全局样式
scripts/
  validate-content.ts           # 内容完整性校验
  simulate.ts                   # 确定性模拟
  ui-capture*.mjs / ui-diff-grid.py / ui-probe*.mjs 等  # 视觉收敛与参考图对照工具链
  reference/                    # 视觉对照的 canonical 参考图基线
e2e/
  smoke.spec.ts                 # Playwright 端到端（真实浏览器流程）
docs/                           # 设计、内容指南、审计与规划文档
```

## 核心架构约定

- **纯规则引擎**：`src/game/engine/` 负责规则与状态转换，中央入口 `dispatchGameAction(state, action, content, balance)` 返回 `GameResult`。
- **时间推进**：`simulation.ts` 自动结算活动/天/月，并在事件、月度汇总等决策门处停下；**绝不替玩家做选择**。
- **状态持久化**：`gameStore.ts` 适配引擎到 Zustand，负责浏览器存档的加载/迁移/保存；`GameEffect` 只是表现反馈，不是未来状态。
- **内容契约**：`src/game/content/contracts.ts` 定义契约；官方内容在 `official/`；内容变更必须通过 `npm run content:validate`。
- **财务语义分离**：收入、消费、投资划转、资产变现、已实现损益、股息、净资产估值变化是不同记录，不得混用。

## 设计方向

- 黑白像素控制台：方形几何、强边框、语义化选中/禁用态、可读中文。
- 桌面与横屏为受支持界面；移动端（如有）复用桌面布局逻辑，竖屏不是官方场景。
- 界面必须呈现真实状态与真实约束，不做显示层 mock 值。
- 以 WCAG 2.1 AA 对比度为目标，保留键盘焦点、语义标签与 `prefers-reduced-motion` 降级。

## 分支与历史

- `main`：唯一日常开发分支（重建后的 4 个提交链，当前源码权威版本）。
- tag `pre-rebuild-20260910`：2026-09-10 Git 对象库事故**之前**的完整旧历史归档锚点（独立历史链，约 400 个提交），仅作历史参考，不用于开发。需要时：`git fetch origin tag pre-rebuild-20260910`，或网页端 Tags 页查看。

## 文档索引

- `AGENTS.md`：仓库工作约定（作用域、架构、命令、Git 纪律）。
- `PRODUCT.md`：产品定位、品牌个性与反参考。
- `DESIGN.md`：设计系统与视觉规范。
- `docs/`：内容指南、能力矩阵、审计与规划记录。
