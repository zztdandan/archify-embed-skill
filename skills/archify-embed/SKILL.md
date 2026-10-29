---
name: archify-embed
description: "把 Archify 生成的原生架构图嵌进一个可转发的单页汇报，并保持可交互：点节点看视窗内详解、页底 JSON 统一改字、一屏一图、网页内真全屏。只要任务里出现「把几张架构图做成给领导看的单页/汇报页」「图在网页里还要能缩放、点开看说明」「图里的文字要能自己改」「嵌 iframe 后图被裁切、有滚动条、全屏变小或点按钮就崩」这类诉求，就用本技能，哪怕用户没点名 Archify。它是 archify 的配套技能：出图仍交给 archify，本技能负责嵌入、排版、验收与交付形态。"
license: MIT
compatibility: "Node 18+ 用于校验与截图验收（scripts/verify-embed.cjs）；生成的页面本身零依赖，可离线打开。"
metadata:
  version: 1.1.0
  tags: [架构图, 嵌入单页, 交互图, 汇报页, 可编辑文字]
  related_skills: [archify]
---

# archify-embed — 把 Archify 图变成可交付的单页汇报

`archify` 负责出图（candidate JSON → 自包含的交互 HTML），本技能负责把 2–5 张图收进**一个**
可转发、可离线打开的文件，并处理嵌入后必然出现的那批问题：裁切、滚动条、全屏失效、
侧栏按钮点崩、改字不生效。

先判断处境，再跳到对应步骤：

- 还没出图 → 先用 `archify` 的 `finalize` 拿到原生 HTML，再回来。
- 已有原生 HTML，要合成一页 → 从「四步流程」开始。
- 已经嵌好但出问题（裁切、全屏、改字）→ 直接按现象查
  [references/pitfalls.md](references/pitfalls.md)。

## 四步流程

1. **出图并压紧画布。** 用 `archify` 生成；节点之间空得厉害时，改候选 JSON 的
   `components[].pos/size` 与 `boundaries[].pad` 再重新 `finalize`。压缩画布要用布局解决，
   靠页面缩放只是把留白连同文字一起缩小。
2. **打包成数据。** 每份原生 HTML 转 base64 放进父页 `#graph-assets`；正文、图内标签、
   逐节点文案放进 `#report-content`，结构见 [references/data-model.md](references/data-model.md)。
   文字只留一份 JSON，是因为用户经常要自己改措辞，散在 DOM 里既改不动也带不走。
3. **接运行时。** 引入 `scripts/embed.css` 与 `scripts/embed-runtime.js`，页面留一个
   `<div id="report-root">` 即可渲染：文字补丁、定高、视窗内详解、全屏、JSON 应用与下载
   都在里面。
4. **验收后再交。** 跑 `scripts/verify-embed.cjs` 做三档视口与交互断言，再人工看截图。
   机器过闸不等于好看，尤其要确认图没有被压到看不清字。

```bash
node skills/archify-embed/scripts/verify-embed.cjs ./交付物/汇报单页.html --shots ./验收截图
```

## 为什么这几处必须这样写

每条都对应一个真实故障，换个写法就会复发。

**高度按宽度算，不要用 `100vh` 定高。** 阅读器按宽度撑满渲染：SVG 宽 = 容器宽，
高 = 宽 × viewBox 高宽比，另有标题栏与底部导航。给 iframe 一个 `100vh` 会让它「按高取宽」，
方形图被挤窄，看起来像有个莫名其妙的宽度上限。先量一次 chrome
（`documentElement.scrollHeight - svg.height`）再按比例算高度；chrome 随版本和内联样式变化，
不要写死数字。

**不要写「量高度不够就加高」的循环。** 阅读器会随面板变高放大图，量出来的高度又变大，
循环不收敛，最后仍然被裁。

**一屏一图要靠阅读器自己的缩放。** 面板超过 96vh 时，用 CSS 改容器宽度去压会再次触发
「按高取宽」的反馈；改用其自带的 25% 缩放档位：按几何算目标档位、点对应次数，
再用 `data-view-scale` 读回实际值。缩放带动画，循环里读不到新尺寸，所以点完要按实际底边补档。

**全屏要显式给宽度，并把滚动挂到 body。** 阅读器把 `html` 锁成 `overflow:hidden`，
纵向滚动只能由 `body` 承担；铺满态把容器宽度设成可用宽度、隐藏滚动条、允许滚轮与拖动，
适配态按 `(窗口高 - chrome) / ratio` 收窄居中。进全屏前先把一屏适配留下的缩放复位，
否则全屏会沿用缩小后的比例。

**隐藏「要点与索引」。** `.rail-reveal` 在 `.reader-rail` 之外，只藏父容器管不住；它按视口
和 localStorage 条件出现，点开会在布局里插一栏，画布被挤窄、缩放失灵。要连
`#rail-collapse` / `#rail-placement` 一起 `display:none` 加 `pointer-events:none`，
并留一条「取消 hidden 再点击，尺寸不变」的回归断言。

**键盘与拖动挂在 iframe 的 document 上。** 焦点在图里时按键不冒泡到父页，Esc 会失效；
拖动设 3px 阈值，否则平移会误触节点。

## 交付形态

- 一个 HTML 交付；旧版与过程文件进 `.archived/` 并写迁移清单，别让收件人挑版本。
- 页面零外部请求、断网可开，这点在验收脚本里直接断言。
- 文字链路要闭合「改 → 应用 → 下载 → 重开仍是新值」，否则改字只活在内存里。

## 参考文件

- 按现象查故障（裁切、全屏、侧栏、改字、下载丢失等 14 类）→
  [references/pitfalls.md](references/pitfalls.md)：每条给现象、成因、做法、验收。
- 想抄现成代码（文字补丁、定高、全屏、拖动、标签回缩）→
  [references/embed-recipes.md](references/embed-recipes.md)。
- 设计或校验外置 JSON 的字段 → [references/data-model.md](references/data-model.md)。
- 直接开页 → `scripts/template.html`、`scripts/embed.css`、`scripts/embed-runtime.js`。
- 验收与回归 → `scripts/verify-embed.cjs`。

## 写评测用例时

`evals/evals.json` 放的是真实用户会说的话（「把这三张图做成给领导看的单页，图还能点开看说明」），
而不是「测试嵌入功能」。它用来检验两件事：描述能不能被正确触发，以及成品是否真的没有裁切、
滚动条和失效的全屏。
