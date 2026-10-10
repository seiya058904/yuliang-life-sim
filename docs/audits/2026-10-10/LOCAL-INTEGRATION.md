# 云端审计成果本地集成与最终验收报告

日期：2026-10-10。执行环境：Windows / Node v24.15.0 / npm 11.12.1，原 lockfile（react 19.2.8、zustand 5.0.15、typescript 7.0.2、vite 8.2.2、vitest 4.1.11、tsx 4.23.12、@playwright/test 1.62.1，与云端审计环境记录完全一致）。

## 1. 基线关系

| 项 | 值 |
| --- | --- |
| 集成前本地 HEAD | `8ff4e4fa97536212467f1236946c3755e2180403`（main） |
| 集成前 origin/main | `8ff4e4f`（与本地相同，ahead 0 / behind 0） |
| 云端参考基线 | `8ff4e4f`（相同） |
| 工作树 | 干净，无未提交修改、无未跟踪文件 |

输入 ZIP `Yuliang-Life-Sim-Audited-20261010.zip`：SHA-256 `f352ed20b70f23889f2cd3bebaee5b7c3ec78dc8b9e75ea6b16cf51036980e96`（与预期一致）；解包 425 个文件，`MANIFEST-SHA256.txt` 逐文件校验 **424/424 全部匹配**（清单自身为第 425 个文件）。本地仓库与云端基线完全同源，不存在需要语义合并的本地更新。

## 2. 12 项修复的集成结论

全部 12 项**已集成**（通过 `docs/audits/2026-10-10/source-and-tests.patch`，`git apply --check` 干净通过，应用后逐文件与 ZIP 交付源码比对，差异仅为 CRLF 换行，内容逐字节一致）。没有发现"原本已存在"或需要拒绝的项；也没有发现需要推翻云端结论的新 Bug。

| ID | 级别 | 结论 | 本地独立复核 |
| --- | --- | --- | --- |
| PERSIST-ERROR | P2 | 已集成 | `canonicalSave.ts`：`onerror` 只收集请求层原因（含配额分类），解析推迟到 `onabort`；成功仍仅由 `complete` + `writtenHead` 决定；`finish` 为 once-guard |
| PERSIST-RESET | P2 | 已集成 | `resetIntent`/`committedResetIntent` 计数器：仅真正提交且携带意图的写入才确认轮代，较早的在途完成不能清除更新的 reset |
| PERSIST-MIGRATION | P2 | 已集成 | 现金必须为有限数值；已知资产/投资校验结构、ID 一致性、金额、整数数量与有效日期，失败进入既有 `unreadable`/`writeProtected` 保护，不静默丢弃 |
| PERSIST-HISTORY | P2 | 已集成 | 两处 `Math.max(...spread)` 改为 `reduce`，150,000 条历史可完整加载且首尾、序号、私募锚点保留 |
| PERSIST-HELPER | P3 | 已集成 | `commitAttempt` 仅对 `committed` 附加成功，`conflict` 不再被报告为成功 |
| SIM-01 | P2 | 已集成 | `copy_previous_plan` 恢复所有已开始/已过去格，未来格继续复制；与单格编辑共用 `slotWithin` 边界 |
| ECO-BASIS | P2 | 已集成 | 加权均价不再二次取整；部分退出按整数总成本分配、余数留给剩余持仓，最后一次出售耗尽剩余成本 |
| ECO-PREPAID | P2 | 已集成 | 预测按真实关闭日 `day+1` 检查 `subscriptionDueDay`，已预付期间不再重复计费（`<=` 语义经 4 组到期锚点的"预测 vs 实际月结"可执行对照验证） |
| ECO-DEPRECIATION | P2 | 已集成 | `asset_liquidation` 汇总排除 `valuation_change`，非现金折旧保留在原始台账 |
| ECO-ZERO-VALUATION | P3 | 已集成 | 两处 `\|\|` 改为 `??`，显式零估值不再回退作者价 |
| UI-SAVE-STATUS | P2 | 已集成 | 设置页优先显示"已停止保存"/"恢复待确认"，否则中性"有存档提示"，无提示时为"正常"；完整详情与全局 alert 保留 |
| UI-PLAN-FONT | P3 | 已集成 | 周计划格 `strong`/`small` 行高改为 1.35；原失败断言 `smoke.spec.ts:1087` 未修改即通过 |

改动范围：产品源码 8 个文件、新增 5 个单元测试文件、新增 2 个 E2E 文件、适配 1 个既有 E2E 文件的两处精确文案断言。**未修改** `package.json`、lockfile、作者内容、存档版本、贷款参数与经济配置；未删除任何既有测试或放宽断言。

## 3. 门禁实际结果（本地 Node 24）

| 命令 | 结果 | 退出码 |
| --- | --- | --- |
| `npm ci` | 123 个包安装成功（见 §5 环境例外） | 0 |
| `npm run test:ci` | **50 文件 / 721 通过 / 0 失败 / 0 跳过**，213.39s | 0 |
| `npm test`（并行） | **50 文件 / 721 通过 / 0 失败**，87.50s —— 云端并行入口的 2 项超时在本机未复现 | 0 |
| `npm run content:validate` | 通过：48 工作 / 34 商品 / 9 服务 / 5 订阅 / 6 住房 / 11 人物 / 44 事件 / 4 事件链 / 4 企业 / 13 资产 / 36 活动 / 10 场所 / 4 课程 / 24 投资 / 29 世界消息 | 0 |
| `npm run content:simulate` | 15 策略 / 48 次 / 48 complete / errors 0，实际终点第 1828 天 | 0 |
| `npm run build` | content:validate + `tsc -b` + `vite build` 全部通过；既有 829.87 kB 大 chunk 提示非新问题 | 0 |
| `YULIANG_E2E_SERVER=preview npm run e2e -- --workers=1` | **666 项：524 通过 / 142 原条件跳过 / 0 失败 / 0 重试**，30.9m，生产 `/yuliang-life-sim/` 子路径，桌面 + 既有横屏双项目，真实 Chrome | 0 |

**这是对最终源码（含收尾 UI 补丁）的完整 E2E 全量重跑**，补上了云端"最终修改后未重跑 666 项"的缺口。云端全量阶段的唯一失败 `smoke.spec.ts:1087`（中文字体裁边）在本轮通过；142 项跳过全部来自横屏项目的桌面限定条件，与云端记录一致，未新增 skip。

关键受影响路径逐项通过：`save-concurrency` 42/42、新增 `save-request-errors` 4/4（原生 IndexedDB 请求失败、回滚后报因、配额分类注入后的压缩重试与设置页文案）、新增 `adversarial-ui` 12/12（计划复制边界、预付订阅预测、暂停浏览、冲突/保护恢复的设置页汇总）、`boot-failure` 4/4、`lifecycle-acceptance` 32/32、`investment-study` 12/12、`save-conflict` 10/10、`ui-architecture` 36/36，以及 `smoke` 1087/2579/2604/2696 四条桌面布局边界。

## 4. 长周期模拟对照（本地独立执行）

在同一 lockfile 与正式内容下，用 `git worktree` 于 `8ff4e4f` 建立独立基线副本，两边各运行默认 harness（目标 1825 天，seeds `20260825/1991/7021/314159`）：

- 两边 **15 种策略、48 次运行全部 complete、errors 0**，终点均为第 1828 天；
- **40 次运行完整结果逐字段一致**；其余 **8 次仅 `wealth.investmentInvested` 与 `wealth.investmentUnrealized` 两个叶字段不同（共 16 个叶值）**，数值与云端 `simulation-wealth-differences.json` 记录逐项相同（如 investor/20260825：64476→64990、−519→−1033）；
- 全部 48 组的现金、净值、`cashSeries`、`netWorthSeries` 与其他字段一致；无 NaN/Infinity。

结论：差异严格限定在已确认的投资成本修正，不涉及经济再平衡或玩法变化。

## 5. 环境例外（如实记录，不影响结论有效性）

1. **`npm ci` 需跳过生命周期脚本**：本机环境对 Node 的同步子进程调用统一返回 `EBUSY`（与沙箱开关无关，`node -e spawnSync` 探针复现），导致 esbuild 的 `postinstall` 校验（`spawnSync esbuild --version`）失败。使用 `npm ci --ignore-scripts` 完成 123 包安装；esbuild 平台二进制 `@esbuild/win32-x64` 由 lockfile 正常安装，运行期异步调用已验证可用（esbuild transform、tsx、vite、vitest、Playwright 全部实际执行成功）。除该 `postinstall` 外无其他包使用安装脚本。
2. **E2E 运行器收尾挂起**：全部 666 项执行完毕、所有浏览器实例退出后，运行器在关闭 `vite preview` 时挂起约 13 分钟；手动终止预览服务器进程后运行器立即打印汇总并以 **退出码 0** 正常结束。与云端记录的"运行器长时间停滞"同类，属运行器/服务器关停问题，不涉及任何测试失败。
3. 与云端不同，本机存在真实 Chrome 且 `tsx` CLI 可用，因此 `content:validate`/`content:simulate`/`build` 均以**原 npm 脚本命令**执行并取得退出码 0（云端只能用等价加载器入口替代）。

## 6. 剩余风险与未覆盖范围

- 真实磁盘写满、操作系统断电、浏览器进程强杀后的物理落盘，以及 Firefox/Safari 未验证（与云端一致）；配额分支的证据仍是"真实 duplicate-key 失败 + 注入 QuotaExceededError 分类"。
- 历史存档中已经舍入丢失的旧投资成本与已物化旧月报无可靠依据重建，继续按原样保留；补丁不回写旧记录。
- `findings.json` 中的 5 项 deferred observations（当班工时、缺失 `lastSettledDay`、估值与报价差异、已拥有资产重放、宽订阅性能）维持"未升级为确认问题"，本次未扩大修复范围。
- 完整审计证据（逐角色报告、RED/GREEN 日志、截图与 trace）保留在外部交接 ZIP `Yuliang-Life-Sim-Audited-20261010.zip` 中，未整体提交到仓库，以免引入大量可重建的临时日志与二进制。

## 7. Git 状态

- 提交：见仓库当前 main 最新提交（16 个源码/测试文件 + 本报告）。
- 工作树：干净；`git diff --check`（`core.whitespace=cr-at-eol`）通过。
- 与 origin/main：本地领先 1 个提交，behind 0。**未推送**——推送需仓库所有者明确授权。
