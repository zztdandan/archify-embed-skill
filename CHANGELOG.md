# 变更记录

## 1.2.0 — 2026-10-29

修正两条被实践推翻的建议，并补入本轮新坑：

- 定高不再写死 chrome=118：改为实测（实测已到 145，写死会裁掉 80–190px）。
- 一屏一图不再建议"收窄容器换高度"：改为满宽 + 图内滚动（滚动条隐藏 + 拖动），
  只有必须整图一屏时才用阅读器缩放档位。
- 新增坑点 15–18：容器宽度规则重复、窄容器标题竖排、全屏卡片遮挡、隐藏滚动条却没补拖动。
- 运行时同步：单一 `.container` 规则、`rv-scroll` / `rv-tight`、进全屏收起卡片、拖动滚动。
- 验收清单增加"容器宽度一致性"与"验收对象是交付物本身"。

## 1.1.0 — 2026-10-29

按 skill-creator 规范重写元数据与正文：

- frontmatter 只保留 name / description / license / compatibility / metadata；版本移入
  `metadata.version`，去掉规范外的 platforms、prerequisites 顶层字段。
- description 改为覆盖真实触发语（单页汇报、可交互、改字、嵌 iframe 出问题），不再只描述能力。
- 正文改为「处境判断 → 四步流程 → 为什么这样写 → 交付形态 → 参考导航」，按需指向 references。
- 新增 `evals/evals.json`：三条真实用户口径的评测用例。
- 仓库校验脚本支持 `metadata.version`，并对 frontmatter 顶层字段做白名单检查。

## 1.0.1 — 2026-10-29

- 定高改为启动时实测 chrome，去掉硬编码 118。
- 一屏一图改用阅读器自带的 25% 缩放档位，避免与按高取宽互相反馈。
- 全屏铺满时把纵向滚动挂到 body（阅读器锁住了 html 的 overflow），并复位缩放。
- 详解卡下移，避开阅读器工具条；父页与 iframe 双处监听 Esc。

## 1.0.0 — 2026-10-29

首个版本。

- 新增 `archify-embed` 技能：把 Archify 原生 HTML 嵌进单页汇报，保留缩放、点击与详解。
- 运行时：`embed-runtime.js`（文本补丁、定高、视窗内详解、全屏铺满/适配、键盘、拖动）。
- 样式：`embed.css`（版心 1280、一屏一图、详解卡、打印）。
- 验收：`verify-embed.cjs`（三档视口、卡片、全屏、rail 回归、外部请求）。
- 文档：`pitfalls.md` 记录 14 条集成坑点，`embed-recipes.md` 给可直接抄的代码，`data-model.md` 定义外置 JSON。
