# 《余量》 · Yuliang Life Sim

**不是给人生打分，而是让每个选择都有后果。**

一个黑白像素控制台风格的人生模拟游戏：规划行动，让世界推进，再面对职业、财务、关系与日常生活的变化。

**[▶ 在线开始一局](https://seiya058904.github.io/yuliang-life-sim/)** · [玩法循环](#一周一周地生活) · [本地开发](#开发与验证) · [产品设计](PRODUCT.md)

<img width="750" alt="Yuliang Life Sim project artwork" src="https://github.com/user-attachments/assets/f4bd2de9-fc86-4538-a7d7-e1716ea171d4" />


## 一周一周地生活

> **你负责选择，世界负责演化。** 时间可以自动推进，但关键决策始终交还玩家。

玩家负责做选择，模拟系统负责结算世界。

1. **规划** — 安排日程与行动，决定时间和资源投入。
2. **推进** — 观察日、周、月的变化与模拟反馈。
3. **处理事件** — 在关键决策门停下来，选择下一步，而不是让系统自动替玩家决定。
4. **继续生活** — 在职业、消费、财富、社交与城市行为之间不断权衡。

| Domain | What matters |
| --- | --- |
| **Life** | 日常安排、时间与状态 |
| **Career** | 工作路径、机会与投入 |
| **Wealth** | 收支、资产、投资行为和损益的不同语义 |
| **Social** | 关系与互动带来的长期结果 |
| **City / Shop** | 与生活环境和消费相关的选择 |

没有预设的“正确人生路线”，也不依赖虚构数值给玩家贴道德标签。

## Visual direction

**Monochrome. Pixel geometry. Information first.**

- 黑白像素控制台：明确的布局网格、边框、状态与反馈。
- Desktop-first / 横屏优先：优先保证复杂信息在受支持宽屏布局中清晰。
- 显示必须来源于真实模拟状态，不以设计用假数值填充面板。
- 保留键盘焦点、足够对比度和减少动态效果的可访问性基础。

## 开发与验证

React + TypeScript + Vite + Zustand，使用锁文件安装依赖：

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

```bash
npm run content:validate   # 官方内容与 seed 契约
npm run content:simulate   # 确定性模拟冒烟
npm test                   # Vitest
npm run build              # 校验、TS 与 Vite 构建
npm run e2e                # Playwright 浏览器流程
```

## Architecture and data

| Location | Responsibility |
| --- | --- |
| [`src/game/engine/`](src/game/engine/) | 纯规则与状态转换，`dispatchGameAction` 为核心接口 |
| [`src/game/store/`](src/game/store/) | Zustand 适配、存档加载/迁移与持久化 |
| [`src/game/content/`](src/game/content/) | 合同约束、官方内容和种子内容 |
| [`src/game/ui/`](src/game/ui/) | Life / Career / Shop / Wealth / Social / City 等界面 |
| [`scripts/`](scripts/) | 内容验证、模拟与视觉验收工具 |
| [`e2e/`](e2e/) | 真正的浏览器端到端测试 |

**关键不变量：** 引擎不替玩家决策，财务记录区分现金流与估值，内容修改需要通过契约校验，持久化与旧存档兼容性不能被表面 UI 改动破坏。

## Design and project notes

- [`PRODUCT.md`](PRODUCT.md) — 产品定位与明确不做的方向
- [`DESIGN.md`](DESIGN.md) — 像素视觉、交互和组件规范
- [`AGENTS.md`](AGENTS.md) — 工程边界、测试与交接
- [`docs/`](docs/) — 内容、审计、验收及规划记录

历史归档 Tag `pre-rebuild-20260910` 属于独立旧历史链，不是当前开发基线；日常工作以 `main` 的当前源码为准。
