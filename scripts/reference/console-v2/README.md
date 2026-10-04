# Console v2：人工复核后的视觉基线

2026-10-04，64283bc 整体升级的最终验收修复版。历史四张原始参考图、README.txt 和 QA-METRICS.txt 保留。本目录是新一代界面的实际浏览器参考，不替换历史来源。

接受依据是 [逐项验收报告](../../../docs/visual-acceptance-64283bc.md)、PRODUCT.md / DESIGN.md、可读性与真实交互。不能仅因当前截图存在就接受它。

## 环境与身份

- Windows / Chrome 154.0.8037.95，zh-CN，Asia/Shanghai，prefers-reduced-motion: reduce。
- 实际中文标题字体由 CDP 采集为 Microsoft YaHei UI；逐场景字体信息见 manifest.json。
- 1440×1080、1280×720，DPR1；Pixel 7 横屏 emulation 为 863×360，DPR2.625。最后一种不是实体触摸设备。
- 生产 Pages 子路径 /yuliang-life-sim/；实际构建、全部被采集源文件/资产/字体的 SHA-256 见 manifest.json。
- manifest 的 sourceHead 是验收基点 64283bc；该采集含本轮修复。请用 sourceHashes 识别实际被验证内容，不要把基点 SHA 当成未经修复的通过提交。
- fixtures.json 保存完整初始状态和显式场景。固定 seed 为 20260825；通过新的隔离上下文及 canonical IndexedDB readwrite 事务注入，事务完成后刷新。不会使用或覆盖正常玩家存档。

## 36 个已复核场景

| 范围 | 场景 |
|---|---|
| 三种视口各 8 张 | Life、Career、Shop、Wealth、Social、City、Profile，另含 Shop 娱乐分类 |
| 两种桌面各 6 张 | 库存咖啡/手机及未拥有的笔记本愿望；四条真实来信；空职业支持区；Offer/履历三行；官方 IMAX 长活动名；实际推进到首月结 |

正常页保持主区滚动起点；库存/来信/支持区用真实滚轮到末尾；月结通过运行按钮和事件选择自然到达。截图是完整视口，未裁剪、隐藏元素、关闭焦点、替换文字或更改游戏数值。瞬时变化反馈等待正常过期，字体等待加载完成。

career fixture 明确预置 Offer 与履历以覆盖其呈现，不声称该记录由自然新手进程产生。愿望使用未拥有的笔记本；已拥有的手机会被规则判为目标完成，不能假装它仍是购买目标。月结、活动标题和来信均使用当前内容契约。

## 复采与高 DPR 绘制差异

repeatability.json 保存最终两次采集的整图 SHA-256；没有截图阈值、遮罩或像素容差。DPR1 的 28 张完全一致，整套 32/36 张完全一致。另四张高 DPR 横屏图只在同一组共享 HUD 边框处有 775 个灰阶边缘像素差异。

变化只在时钟虚线框与底栏方框的分数像素边缘；正文/字体/几何/游戏时间/焦点均未变。较早三次采集已有相同噪声，两个补充采集各有 35/36 张与首次完全一致；另以三个独立社交上下文各采五次，15 张整图全部与当时首次一致。这归为高 DPR 栅格绘制噪声，具体合成路径是依据现象的推断。四张最终异常原图、两张较早异常原图及各自源版本/精确数据保存在 raster-diagnostics/，没有删掉噪声证据或宣称跨平台像素稳定。

最后的身份区对比度修复只改变两张 Profile 桌面图，均重新目视审核；其余 34 张与较早基线逐字节一致。较早采集版本的 manifest 另存于 raster-diagnostics/earlier-manifest.json；它的截图与当前基线用途已明确区分。

此目录用于人工视觉审核。E2E 对实际几何、包含关系、对比度、语义、选择状态、真实滚轮/键盘/分页与保存结果做可移植断言。不要把 Windows 字体的 PNG 直接用于 Linux 逐像素断言；更换系统、字体或浏览器后需要重新验证环境与实际布局。

## 复现

先构建并在一个终端运行生产 preview：

    npm run build
    npm run preview -- --host 127.0.0.1 --port 4187

再在另一个终端生成新的待审输出：

    npx tsx scripts/ui-acceptance-baseline.mjs --base=http://127.0.0.1:4187/yuliang-life-sim/ --out=output/visual-review

脚本只采集场景和证据，不自动接受或覆盖本目录。审核必须解释实际差异、检查真实状态与操作，保留失败证据，再按明确结论建立下一版参考。
