---
name: archify-embed
description: "把 Archify 生成的原生架构图嵌进单页汇报并保持可交互：视窗内详解、页底 JSON 改字、一屏一图、网页内真全屏。附带本轮集成踩过的全部坑与可直接复用的运行时脚本。Archify 的配套技能，不替代它出图。"
version: 1.0.1
license: MIT
platforms: [linux, macos, windows]
prerequisites:
  commands: ["node"]
  note: "只用 Node 做校验与截图验收；页面本身零依赖、可离线打开。"
metadata:
  hermes:
    tags:
      - archify
      - embed
      - iframe
      - interactive-diagram
      - single-page-report
      - svg
    related_skills: [archify]
    category: document
---

# archify-embed — 把 Archify 图变成可交付的单页汇报

配合 `archify` 使用：`archify` 负责出图（candidate JSON → 原生 HTML），本技能负责
**把若干张原生图嵌进一个可转发的 HTML**，并解决嵌入后必然遇到的一批问题。

> 下文 `scripts/...` 均相对本技能目录（`SKILL.md` 所在处）。

## 什么时候用

- 要把 2–5 张 Archify 图收进一个单文件 HTML 给领导/客户看；
- 要求图能缩放、点节点看详解，而不是截图；
- 正文、图内标签、详解需要**外置成 JSON**，方便用户自己改字；
- 需要"网页内全屏"（不用浏览器 Fullscreen API）把某张图放大。

只出一张图、不需要外置文字时，直接用 `archify` 的 `finalize`，不必引入本技能。

## 三条硬规则

1. **别和阅读器的尺寸反馈对抗。** 参考实现按**宽度**撑满渲染：SVG 宽 = 容器宽，
   高 = 宽 × viewBox 高宽比，另加约 118px 的阅读器 chrome。iframe 高度必须一次算定：
   `height = (frameWidth - 右侧说明栏宽度) × (vbH / vbW) + 118`。
   反复"量 scrollHeight 再加高"会与 `intrinsic-height` 互相放大，面板越调越高。
2. **隐藏阅读器自带侧栏，并加回归测试。** `.rail-reveal`（"要点与索引"）在
   `.reader-rail` 之外，只藏父容器无效；它按视口和 localStorage 条件出现，点开后会挤掉画布、
   让缩放失灵。必须 `display:none!important; pointer-events:none`，并把
   `#rail-collapse` / `#rail-placement` 一起处理。
3. **iframe 里的键盘事件不会冒泡到父页。** Esc 退出全屏这类快捷键必须挂到每个
   frame 的 `document` 上，且每次重连后重挂。

## 快速开始

1. 先用 `archify` 出图，拿到若干份原生 HTML（自包含，含 viewer）。
2. 把每份 HTML 用 base64 塞进父页的 `<script type="application/json" id="graph-assets">`，
   正文与逐节点文案放进 `#report-content`（结构见
   [references/data-model.md](references/data-model.md)）。
3. 用 [scripts/embed-runtime.js](scripts/embed-runtime.js) 作为父页运行时：
   写 `srcdoc`、注入文字补丁、按公式定高、视窗内详解、全屏铺满/适配、JSON 编辑与下载。
4. 跑 [scripts/verify-embed.cjs](scripts/verify-embed.cjs) 做三档视口验收，再人工看图。

```bash
node skills/archify-embed/scripts/verify-embed.cjs ./交付物/汇报单页.html
```

## 定高

高度不要硬编码 `118`。阅读器的 chrome（标题栏 + 底部导航 + 内边距）随版本和内联样式变化，
启动时量一次最稳：

```js
const svg = doc.querySelector('svg[data-node-ui]');
const [, , vbW, vbH] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
const chrome = doc.documentElement.scrollHeight - svg.getBoundingClientRect().height;
const height = Math.round(frame.clientWidth * (vbH / vbW) + chrome);
```

一屏一图（面板不超过 96vh）不要靠改容器宽度硬压——阅读器会按高取宽、把 chrome 一起放大，
形成反馈。改用**它自带的缩放步进**：目标缩放 = 可用高度 ÷ 图在 100% 时的高度，
按 25% 一档向目标对齐，再用 `data-view-scale` 读回实际值。

```js
const avail  = cap - svgBox.top - 6;
const target = Math.min(1, avail / (width * (vbH / vbW)));
const steps  = Math.round((1 - target) / 0.25);   // 点几次"缩小"
```

缩放带动画，循环里读不到新尺寸，所以先按几何算档位、点完再按实际底边补 0–2 档。

## 网页内全屏的两种状态

| 状态 | 容器宽度 | 纵向 | 适用 |
|---|---|---|---|
| 铺满（默认） | 可用宽度全宽 | 图比窗口高，滚动条隐藏，可滚轮/拖动 | 看图细节，字最大 |
| 适配整图 | `(窗口高 - chrome) / ratio`，居中 | 不滚动，整图可见 | 汇报演示、截图 |

只用 `height:100vh` 会触发"按高取宽"，方形图被挤窄、看起来像有固定宽度上限——这正是
"点了全屏反而更小"的成因。三个必做项：

1. 全屏壳 `position:fixed; inset:0`，并清掉普通态写过的内联 `height`；
2. 进全屏前把阅读器缩放到 100%（点"重置"），否则沿用一屏适配的缩放；
3. 阅读器把 `html` 锁成 `overflow:hidden`，纵向滚动只能挂在 `body` 上：
   `body.style.height = window.innerHeight + 'px'; body.style.overflowY = 'auto';`
   滚动条用 `scrollbar-width:none` 与 `::-webkit-scrollbar{display:none}` 隐藏。

## 文字外置与回写

- 所有可改文字（标题、正文、节点 label/sublabel/tag、连线标签、分区名、逐节点详解）
  只存 JSON，页面渲染时再套用；**保留固定 id**，校验 id 集合不变才允许应用。
- 打补丁要同时改：SVG `<text>`、`data-node-*` / `data-edge-label` 属性、`aria-label`、
  `<title>`、以及阅读器自己的节点查找索引。长标签按可用宽度回缩字号。
- 序列化进 `<script>` 时把 `<` 转成 `\u003c`，渲染一律 `textContent`，否则
  `</script>` 会截断页面。
- "下载修改后的完整网页"要把当前 JSON 写回 `#report-content` 并清空渲染 DOM，
  否则重新打开看到的是旧文案。

## 验收清单

- [ ] 1600×1000、1366×768、390×844 三档：无横向溢出，图不被裁切。
- [ ] 点击节点/连线，视窗内说明卡更新；卡片开启时图收窄而不被遮挡。
- [ ] 全屏进入后窗口铺满、无可见滚动条；退出后恢复原面板高度。
- [ ] 强制显示并点击 `.rail-reveal`：尺寸不变、缩放仍可用（回归）。
- [ ] 改 JSON → 应用 → 下载 → 重开：文案与图内标签都保留。
- [ ] 页面零外部请求，断网可打开。

## 参考

- [references/pitfalls.md](references/pitfalls.md) — 本轮踩过的 14 个坑，逐条给现象、成因、做法、验收。
- [references/embed-recipes.md](references/embed-recipes.md) — 可直接抄的代码段。
- [references/data-model.md](references/data-model.md) — 外置 JSON 的结构与校验规则。
- [scripts/embed-runtime.js](scripts/embed-runtime.js) — 父页运行时（定高、详解、全屏、JSON、下载）。
- [scripts/verify-embed.cjs](scripts/verify-embed.cjs) — Puppeteer 验收脚本。
