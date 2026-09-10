---
name: 余量
description: 黑白像素人生模拟控制台
colors:
  void: "#050505"
  panel: "#090909"
  raised: "#171717"
  ink: "#F5F5F1"
  soft-ink: "#D5D5CF"
  muted: "#AAA9A4"
  divider: "#575753"
  inverse: "#080808"
typography:
  display:
    fontFamily: "Microsoft YaHei UI, PingFang SC, Noto Sans CJK SC, ui-monospace, monospace"
    fontSize: "56px"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Microsoft YaHei UI, PingFang SC, Noto Sans CJK SC, ui-monospace, monospace"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "Microsoft YaHei UI, PingFang SC, Noto Sans CJK SC, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Microsoft YaHei UI, PingFang SC, Noto Sans CJK SC, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.04em"
rounded:
  square: "0px"
  compact: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.inverse}"
    rounded: "{rounded.square}"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "9px 14px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "16px"
---

# Design System: 余量

## 1. Overview

**Creative North Star: “黑白人生控制台”**

界面把 1-bit 像素游戏的明确反馈与现代产品界面的可读性结合起来。稳定外壳承载日期、时间、现金、净资产、导航与角色状态；页面内部用强边框、反色状态、紧凑网格和像素图标组织真实游戏数据。

系统拒绝 SaaS 卡片墙、玻璃拟态、柔和阴影、霓虹赛博装饰和以评分判断人生的反馈。所有装饰都应强化游戏状态或分区，而不是遮盖信息。

**Key Characteristics:**

- 纯黑、白与中性灰
- 方形几何和 1px/2px 清晰边框
- 高密度、强层级、真实数据
- 反色选中态和分段式仪表
- 桌面优先，移动端结构性折叠

## 2. Colors

纯中性黑白灰构成 1-bit 游戏界面；不使用彩色色义或装饰性色相。

### Primary

- **高亮信号白** (`#F5F5F1`)：主文字、选中背景、主要按钮和关键边框。
- **深空黑** (`#050505`)：页面与稳定外壳背景。

### Neutral

- **面板黑** (`#090909`)：卡片、侧栏与弹层。
- **抬升黑** (`#171717`)：悬停、禁用和次级状态。
- **柔和白** (`#D5D5CF`)：次要正文。
- **状态灰** (`#AAA9A4`)：标签和辅助信息。
- **结构灰** (`#575753`)：分隔线、点线和非激活边框。

### Named Rules

**反色即状态。** 选中和主要操作使用白底黑字；默认内容使用黑底白字。

## 3. Typography

**Display Font:** Microsoft YaHei UI 与系统 CJK fallback
**Body Font:** Microsoft YaHei UI 与系统 CJK fallback
**Label/Mono Font:** 同一字体栈，以等宽数字特性辅助金额和时间

**Character:** 中文优先清晰，像素感由字重、紧凑字距、边框、图标和几何共同承担，不依赖难读的点阵字体。

### Hierarchy

- **Display** (900, 56px, 0.95)：品牌、当前时间和月结算标题。
- **Headline** (800, 32px, 1.1)：当前活动与页面主状态。
- **Title** (700, 18–24px, 1.2)：面板和卡片标题。
- **Body** (400, 14px, 1.5)：说明与数据正文，长段落限制在约 70ch。
- **Label** (700, 12px, 0.04em)：导航、字段名、过滤器和状态。

### Named Rules

**数字稳定规则。** 时间、金额和持续变化的指标使用 tabular numerals，避免跳动。

## 4. Elevation

系统默认完全扁平。层次来自反色、双层边框、点状分隔和相邻面的明度差，不使用柔和投影；只有模态弹层允许小幅硬像素偏移阴影表达阻断层级。

### Shadow Vocabulary

- **模态硬投影** (`7px 7px 0 #575753`)：只用于阻断式事件与结算弹层。

### Named Rules

**边框优先。** 普通卡片和按钮不得用模糊阴影制造悬浮感。

## 5. Components

### Buttons

- **Shape:** 完全方形 (`0px`)，高度紧凑且点击区不小于约 36px。
- **Primary:** 信号白背景、深空黑文字、1px 白边。
- **Hover / Focus:** 悬停反转为抬升黑；键盘焦点使用 2px 实线外框。
- **Secondary / Ghost:** 面板黑背景、结构灰边框；选中时反色。

### Chips

- **Style:** 方形细边框标签，不使用药丸造型。
- **State:** 未选中为黑底灰边；选中为白底黑字。

### Cards / Containers

- **Corner Style:** `0px`，必要时最多 `2px`。
- **Background:** 面板黑或信号白的强反差面。
- **Shadow Strategy:** 默认无阴影。
- **Border:** 1px 结构灰；焦点区域使用白边或内嵌双线。
- **Internal Padding:** 12–20px，按信息密度统一。

### Inputs / Fields

- **Style:** 黑底白字、1px 结构灰边框、0px 圆角。
- **Focus:** 白色 2px 清晰焦点环。
- **Error / Disabled:** 通过文字、明度和边框组合表达，不只依赖颜色。

### Navigation

顶栏与主导航跨页面保持稳定。默认标签为黑底浅字，当前页面使用白底黑字；窄屏允许横向滚动，但不得造成页面级溢出。

### Persistent Status Bar

桌面固定在底部，用分段仪表显示角色状态；移动端回到普通文档流并压缩成单列或双列。

## 6. Do's and Don'ts

### Do:

- **Do** 使用真实游戏状态驱动日期、活动、金额、条件与结果。
- **Do** 按结构、比例、对齐、间距、字体、颜色、图标和微细节的顺序修正。
- **Do** 使用 Grid、Flexbox、设计令牌和共享像素组件自然贴近参考图。
- **Do** 保持清晰焦点、AA 对比度、可读中文与 reduced-motion 支持。

### Don't:

- **Don't** 做成 SaaS 管理后台、柔和圆角卡片墙、霓虹赛博终端或玻璃拟态。
- **Don't** 使用 Emoji 作为功能图标、渐变文字、柔和大阴影或圆角药丸堆叠。
- **Don't** 使用截图背景、截图切片或大面积绝对定位伪造页面。
- **Don't** 通过玩家等级、人生评分、月度等级、主线任务或强制进度判断“正确人生”。
- **Don't** 为匹配示例画面硬编码金额、日期、岗位、商品或属性。
