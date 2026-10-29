# archify-embed-skill

> 一个 [Agent Skills](https://agentskills.io) 仓库，给 [`archify`](https://github.com/tt-a1i/archify) 配一个**嵌入与交付**技能：
> 把生成好的原生架构图收进**一个可转发的 HTML**，保持缩放/点击/详解，正文与图内文字外置成 JSON，
> 并提供"一屏一图 + 网页内真全屏"。附带把这类集成反复踩过的坑逐条写清。

```bash
npx skills add zztdandan/archify-embed-skill    # 装到当前项目
npx skills add zztdandan/archify-embed-skill -g # 或装到用户级
```

[![许可证](https://img.shields.io/github/license/zztdandan/archify-embed-skill)](./LICENSE)
[![技能规范](https://img.shields.io/badge/agent%20skill-SKILL.md-6f42c1.svg)](./skills/archify-embed/SKILL.md)
[![校验](https://github.com/zztdandan/archify-embed-skill/actions/workflows/validate.yml/badge.svg)](https://github.com/zztdandan/archify-embed-skill/actions/workflows/validate.yml)

[技能清单](#技能清单) · [安装](#安装) · [怎么用](#怎么用) · [坑点清单](#坑点清单) · [变更记录](./CHANGELOG.md)

---

## 技能清单

| 技能 | 干什么 | 依赖 |
|------|--------|------|
| [`archify-embed`](./skills/archify-embed/SKILL.md) | 把 Archify 原生 HTML 嵌进单页汇报：视窗内详解、页底 JSON 改字、实测 chrome 定高、一屏一图、网页内全屏（铺满/适配双态）、下载回写 | `node`（仅验收与校验用；页面本身零依赖） |

出图仍由 `archify` 负责：先用它 `finalize` 拿到原生 HTML，再用本技能嵌入。

## 安装

### 方式一：`npx skills`（推荐）

```bash
npx skills add zztdandan/archify-embed-skill          # 当前项目
npx skills add zztdandan/archify-embed-skill -g       # 用户级
npx skills add zztdandan/archify-embed-skill --list   # 只看不装
```

### 方式二：手动放到宿主的 skills 目录

```bash
git clone https://github.com/zztdandan/archify-embed-skill.git
cd archify-embed-skill
cp -R skills/archify-embed ~/.agents/skills/          # 通用 Agent Skills 宿主
```

| 你的 Agent | skills 根目录（示例） |
|---|---|
| 通用 Agent Skills 宿主 | `~/.agents/skills/` |
| Claude Code | `<project>/.claude/skills/` 或 `~/.claude/skills/` |
| GitHub Copilot | `<project>/.github/skills/` |

最终形状：

```text
<skills-root>/
└── archify-embed/
    ├── SKILL.md
    ├── references/{pitfalls,embed-recipes,data-model}.md
    └── scripts/{embed-runtime.js,embed.css,verify-embed.cjs,template.html}
```

## 怎么用

1. **出图**：`archify finalize architecture candidate.json page.html --quality showcase --json`。
2. **打包**：把每份原生 HTML 转 base64，写进父页 `#graph-assets`；正文与节点文案写进 `#report-content`。
3. **接运行时**：`embed.css` + `embed-runtime.js`，页面 `<div id="report-root">` 即可渲染。
4. **验收**：`node skills/archify-embed/scripts/verify-embed.cjs ./交付物/汇报单页.html --shots ./验收截图`。

结构说明见 [`references/data-model.md`](./skills/archify-embed/references/data-model.md)，
可直接抄的代码见 [`references/embed-recipes.md`](./skills/archify-embed/references/embed-recipes.md)。

## 评测用例

`skills/archify-embed/evals/evals.json` 放了三条真实用户口径的用例（做单页、嵌入后裁切/全屏异常、侧栏按钮点崩），
用来检查描述的触发面与成品质量；按 skill-creator 的约定，断言在跑用例时补。

## 坑点清单

完整版（现象 / 成因 / 做法 / 验收）在 [`references/pitfalls.md`](./skills/archify-embed/references/pitfalls.md)。

| # | 坑 | 一句话对策 |
|---|---|---|
| 1 | 画布内部大片留白 | 改候选 JSON 的位置/尺寸与 boundary pad，别只做视觉缩放 |
| 2 | 嵌入后图被裁切 | `height = 宽 × 高宽比 + 118`，一次算定 |
| 3 | 越调越高 | 别用"量 scrollHeight 再加高"的循环，会与 intrinsic-height 互相放大 |
| 4 | 手机端图被横向切开 | 接受平移，或缩放后重新定高 |
| 5 | 一个视窗超过一屏 | 面板限 96vh，**宽度保持满宽**，图内滚动（条隐藏、可拖动） |
| 6 | 全屏反而更小 / 有滚动条 | `100vh` 会"按高取宽"；拆成铺满/适配两态 |
| 15 | 有的图正常、有的被压成窄条 | 容器宽度只留一条 `!important` 规则 |
| 16 | 容器一窄，标题竖成一列 | 标题不折行 + 窄于 620px 隐藏图内标题栏 |
| 17 | 全屏时说明卡压住节点 | 进全屏先收起卡片，退出再恢复 |
| 18 | 隐藏了滚动条却没补拖动 | 溢出时用 pointer 事件拖动滚动 |
| 7 | "要点与索引"点一下就崩 | `.rail-reveal` 在 `.reader-rail` 之外，必须硬隐藏 + 禁指针 |
| 8 | Esc 退不出全屏 | 键盘事件挂在每个 iframe 的 document 上 |
| 9 | 改了 JSON，图里文字没变 | 同步 SVG text、data-*、aria-label、title 与查找索引 |
| 10 | 长标签溢出节点框 | 按可用宽度回缩字号并设下限 |
| 11 | JSON 里的尖括号弄坏页面 | 序列化时 `<` → `\u003c`，渲染只用 textContent |
| 12 | 下载后修改丢失 | 把当前 JSON 写回 `#report-content` 再导出 |
| 13 | 详解在外面，读图来回跳 | 卡片放进 iframe，图用 `--rv-pad` 让位 |
| 14 | 拖动误触节点 | 位移超过 3px 才判定拖拽 |

## 仓库结构

```text
archify-embed-skill/
├── skills/archify-embed/     # 技能本体（唯一技能）
├── scripts/validate_skills.py
├── .github/workflows/validate.yml
├── VERSION                   # 与 SKILL.md frontmatter 的 version 一致
├── CHANGELOG.md
└── LICENSE
```

## 许可证

[MIT](./LICENSE)。`LICENSE` 保留 MIT 英文原文（法律文本惯例），中文说明以此处为准。
