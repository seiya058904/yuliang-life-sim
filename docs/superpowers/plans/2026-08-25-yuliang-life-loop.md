# 余量自动人生循环 Implementation Plan

**Goal:** 将《余量》从手动推进动作重构为可存档、可确定性复现的周计划自动人生模拟。

**Architecture:** 用分钟级纯函数模拟器消费 `GameState + WeeklyPlan + EmploymentState`，由 Zustand 只负责运行时调度、保存和 UI 订阅。正式工作由排班自动占用，WeeklyPlan 只表达学习、兼职和自由时间；事件和月结通过 `GameEffect` 输出，不由动画决定规则。

**Tech Stack:** React + Vite + TypeScript + Zustand + Vitest + Playwright。

## Global Constraints

- 保留正式内容包稳定 ID、中文名称、内容定位和经济尺度。
- 正式工作由 `EmploymentState.schedule` 自动占用，不进入玩家可编辑计划。
- `WeeklyPlan` 支持学习时长、兼职时长和自由活动，时长只使用 1h / 2h / 4h 预设。
- `ActivityState.progress` 不作为权威存档字段，进度由当前时间与活动起止时间推导。
- 页面关闭或刷新时暂停，不产生离线时间暴涨。
- 动画只消费只读模拟输出，并支持 `prefers-reduced-motion`。

## Tasks

1. 先写失败测试，扩展时间、日历、WeeklyPlan、Schedule、模拟推进、招聘、事件暂停、月结和迁移行为。
2. 实现分钟级时间、周计划编译器、活动推导和确定性模拟器。
3. 扩展 reducer/store，加入运行控制、存档迁移、正式工作自动工资、事件暂停和月度账本。
4. 机械接入 `yuliang-official-content-v1.zip` 的正式内容文件并扩展 validator。
5. 重做主界面、周计划、招聘、事件和月结 UI，加入黑白时间终端动效。
6. 运行类型检查、全部单测、Content Validator、固定种子模拟、Production Build、Playwright，并完成桌面/移动真实试玩。
