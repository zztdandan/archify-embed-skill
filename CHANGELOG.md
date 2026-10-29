# 变更记录

## 1.0.0 — 2026-10-29

首个版本。

- 新增 `archify-embed` 技能：把 Archify 原生 HTML 嵌进单页汇报，保留缩放、点击与详解。
- 运行时：`embed-runtime.js`（文本补丁、定高、视窗内详解、全屏铺满/适配、键盘、拖动）。
- 样式：`embed.css`（版心 1280、一屏一图、详解卡、打印）。
- 验收：`verify-embed.cjs`（三档视口、卡片、全屏、rail 回归、外部请求）。
- 文档：`pitfalls.md` 记录 14 条集成坑点，`embed-recipes.md` 给可直接抄的代码，`data-model.md` 定义外置 JSON。
