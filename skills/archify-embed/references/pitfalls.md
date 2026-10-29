# 集成坑点清单

本轮把一个 Archify 架构图集做成"可转发单页"时踩到的全部问题。每条给：现象 → 成因 → 做法 → 验收。
代码片段见 [embed-recipes.md](embed-recipes.md)。

---

## 1. 画布内部大面积留白

**现象**：图能看，但节点之间空得厉害，一页放不下两张图。

**成因**：Archify 的自动布局优先保证标签不打架，层间距与分区内边距都给得保守。

**做法**：改候选 JSON 本身——重排 `components[].pos/size`、收紧 `boundaries[].pad`，
而不是在页面上把图缩小。压缩后对比 viewBox 面积，通常能降到原来的 55%–75%。
压缩完必须重新 `finalize` 让路由与标签重新计算。

**验收**：`finalize --json` 通过；目视节点文字不重叠、连线不压标签。

---

## 2. 嵌入后图被裁切（下半截看不到）

**现象**：iframe 里只露出图的上半部分，下面要滚。

**成因**：阅读器按宽度渲染，SVG 高度 = 宽度 × 高宽比，iframe 只有 660px 就必然裁。

**做法**：高度 = 宽度 × 高宽比 + chrome，其中 **chrome 必须实测**：

```js
const chrome = doc.documentElement.scrollHeight - svg.getBoundingClientRect().height;
const height = Math.round(frameWidth * (vbH / vbW) + chrome);
```

chrome 是标题栏 + 底部导航 + 内边距之和，会随阅读器版本、注入样式、卡片是否让位而变化。
早期把 `118` 当常数用，换一版样式后实测已到 145，直接导致底部被裁 80–190px。

**验收**：`frame.contentDocument.documentElement.scrollHeight <= frame.clientHeight + 2`。

---

## 3. 越调越高：反馈循环

**现象**：用"量一下 docH，不够就加高"的循环，面板一次比一次高，最后上千像素还裁。

**成因**：阅读器有 `intrinsic-height` 适配，iframe 变高它会放大 SVG，`scrollHeight`
随之变大，循环永不收敛。

**做法**：不要循环。用第 2 条的公式算一次。内容真的溢出时**不要收窄容器**——那会让标题栏
被压成两栏、标题竖排，图也变小；改用第 5 条的"一屏内滚动"。

**验收**：连续触发 3 次 resize，iframe 高度不再变化。

---

## 4. 手机端图被横向切开

**现象**：390px 宽的手机上，图只显示左半边。

**成因**：窄屏时阅读器按固有宽度（约 720px）渲染，预期用户横向平移。

**做法**：二选一——接受平移并明确提示，或用缩放按钮把图缩到容器宽度内再定高。
若要自动适配，点两次"缩小"后重新量 SVG 宽度，直到 `<= frame.clientWidth`。

**验收**：手机档 `documentElement.scrollWidth <= innerWidth + 1`。

---

## 5. 一个视窗超过一屏

**现象**：每张图的面板比浏览器窗口还高，看完整张图要滚两屏。

**成因**：面板高度跟着图的高宽比走，方形图在 1280 版心里就是 1400px。

**做法**：面板高度封顶 96vh，但**宽度保持满宽**，让字保持原大；比面板高的部分在图内滚动，
滚动条隐藏、支持拖动：

```js
doc.body.style.height = cap + 'px';
doc.body.style.overflowY = 'auto';
root.classList.add('rv-scroll');       // html.rv-scroll 隐藏滚动条
```

只有"必须整图一屏、且能接受字变小"的场合（截图、投屏），才用阅读器自带的 25% 缩放档位
把整图缩进一屏。**不要**用收窄容器宽度去换高度，那会同时压小字号并压垮标题栏。

**验收**：`iframe.clientHeight <= innerHeight`；若内容溢出，`body.scrollbarWidth === 'none'`
且可拖动滚动。

---

## 6. 全屏后反而更小 / 有滚动条

**现象**：点"全屏"，图没变大，还多出滚动条；看起来像被固定宽度卡住。

**成因**：`height:100vh` 会让阅读器"按高取宽"，方形图在宽屏里只剩 800px 宽；
而若直接按宽度铺满，图又比窗口高，出现滚动条。

**做法**：拆成两态，默认"铺满"：
- 铺满：容器宽 = 可用宽，`body` 允许纵向滚动但隐藏滚动条，支持滚轮与拖动；
- 适配：容器宽 = `(窗口高 - 118) / ratio`，居中，不滚动。
提供一个按钮在两态间切换。

**验收**：铺满态 `container.width ≈ frame.clientWidth - 卡片宽`；适配态
`body.scrollHeight <= body.clientHeight + 1` 且 SVG 右下角在窗口内。

---

## 7. "要点与索引"按钮点一下就崩

**现象**：点图上的"要点与索引"，画布被挤窄、缩放失灵，侧栏内容却是空的。

**成因**：该按钮 `.rail-reveal` 在 `.reader-rail` **之外**，只隐藏父容器管不住它；
它按视口宽度与 `localStorage` 里的偏好条件出现，点开会在布局里插入一栏。

**做法**：硬隐藏并禁用：

```css
.rail-reveal,#rail-reveal,.rail-control,#rail-collapse,#rail-placement{
  display:none!important;pointer-events:none!important;visibility:hidden!important
}
#reader-rail,.reader-rail{display:none!important}
```

**验收**：脚本里把该按钮 `hidden=false` 再 `click()`，断言 SVG 宽高、滚动高度不变，
缩放仍能从 100% 到 125%。

---

## 8. Esc 退不出全屏

**现象**：全屏后按 Esc 没反应，只能点按钮。

**成因**：焦点在 iframe 里，键盘事件不冒泡到父文档。

**做法**：在每个 frame 的 `document` 上挂 `keydown`，并调用父页的 `closeFullscreen()`；
每次 iframe 重载/重连后重新挂。

**验收**：在 iframe 内按 Esc，`document.querySelector('.is-fs') === null`。

---

## 9. 改了 JSON，图里文字没变

**现象**：节点名改了，画布上还是旧字。

**成因**：图内文字是原生 SVG，不在父页 DOM 里；只更新父页变量没用。

**做法**：改字要做完整替换——SVG `<text>`、`data-node-label/-sublabel/-tag`、
`data-edge-label`、分区 label、`aria-label`、`<title>`，以及阅读器的节点查找索引。
最稳的做法是**在 iframe 里现场改 DOM**，不要重新生成 srcdoc。

**验收**：改一个节点名后，画布文本、`aria-label`、节点查找结果三处一致。

---

## 10. 长标签溢出节点框

**现象**：中文标签改长后压到边框外。

**成因**：SVG 文本不会自动换行。

**做法**：按可用宽度回缩字号，设下限（如 5–6px）：估算字宽（中文按 1、其余按 0.58），
超过就用 `width / 估算宽度` 压字号。

**验收**：随机改长 1.5 倍的标签，文字仍在框内。

---

## 11. JSON 里的尖括号把页面弄坏

**现象**：正文写了 `</script>` 之类，页面直接白屏。

**成因**：JSON 内联在 `<script>` 里，遇到 `</script>` 提前闭合。

**做法**：序列化时 `JSON.stringify(v).replace(/</g,'\\u003c')`；渲染一律 `textContent`，
不要 `innerHTML`。

**验收**：正文里塞 `</script><img src=x onerror=alert(1)>`，页面正常且不执行。

---

## 12. 下载后重新打开，修改丢了

**现象**：改完下载新文件，打开还是旧文案。

**成因**：只导出了当前 DOM，没把 JSON 写回内联数据。

**做法**：克隆文档 → 把当前 JSON 写进 `#report-content` → 清空渲染容器与编辑器 →
再 `Blob` 下载。

**验收**：改标题与一个节点名 → 下载 → 重开：两处都是新值，三张图仍可交互。

---

## 13. 节点详解挤在外面，读图要来回看

**现象**：说明栏在图的右侧页面里，视线在图与文字之间横跳。

**成因**：把详解当成页面内容，而不是视窗的一部分。

**做法**：详解卡放进 iframe 内部（`position:fixed`），图通过 `--rv-pad` 让出宽度，
卡不遮节点；卡片开合只改预留宽度，不改图的几何。

**验收**：点节点后卡片出现、节点不被遮挡；关卡片后图宽恢复。

---

## 14. 拖动误触节点

**现象**：想平移画布，结果选中了节点。

**成因**：pointerdown 直接触发点击。

**做法**：位移超过 3px 才判定为拖拽；拖拽期间吞掉 click。

**验收**：拖动 60px 后松开，卡片不切换；原地点击正常切换。

---

## 15. 两条 `.container` 宽度规则互相打架

**现象**：图突然缩成一条窄带、标题竖排，或者右侧出现大片空白；换一张图又正常。

**成因**：注入样式中同时存在两条都带 `!important` 的容器宽度规则——一条 `width:100%`、
一条 `width:var(--rv-w)`。谁生效取决于注入顺序，而不同路径（初次渲染 / 打开说明卡 /
重新应用 JSON）注入顺序并不一致。

**做法**：容器宽度只留**一条**规则，统一走 CSS 变量；不要在多处重复声明同一属性。
排查时直接搜注入的 style 文本里 `.container{` 出现几次。

```css
.container{width:var(--rv-w,auto)!important;max-width:100%!important;
  margin:0 var(--rv-pad,0px) 0 var(--rv-left,0px)!important}
```

**验收**：在 1885×927 与 1600×1000 两档下，三张图的容器宽度都等于 `frameWidth - 卡片宽`
（卡片打开时），没有一张明显偏窄。

---

## 16. 容器一窄，标题被挤成一列

**现象**：图上方标题变成"集/团/主/湖"一列竖排，右侧工具条占了大半行。

**成因**：阅读器标题栏是标题 + 工具条的一行布局；容器窄到某个阈值后标题被压到几十像素，
中文逐字换行。

**做法**：两条一起做——标题永不折行（`white-space:nowrap` + 省略号），并在容器窄于约 620px 时
直接隐藏图内标题栏，标题交给页面标题与图注承担。

```css
h1{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
.rv-tight .header{display:none!important}
```

**验收**：任意宽度下 `h1` 高度不超过一行（约 26px），且不存在逐字竖排。

---

## 17. 全屏时说明卡压住右侧节点

**现象**：全屏铺满后，右侧节点被说明卡盖住，读不全。

**成因**：铺满态让容器占满整宽（为了字大），说明卡是浮层，自然就压在图上。

**做法**：进入全屏先把说明卡收起，退出时按进入前的状态恢复；需要看详解时再点"详解"打开。
这样默认视图既满宽又不遮挡。

**验收**：进全屏后 `card.hidden === true`，画布宽度等于窗口宽；退出后卡片回到进入前的状态。

---

## 18. 隐藏了滚动条，却忘了给拖动

**现象**：图内溢出但看不到滚动条，滚轮又不一定生效（焦点在别处），用户以为内容没了。

**成因**：只做了 `scrollbar-width:none`，没补拖动。

**做法**：溢出时给容器加拖动滚动（`pointerdown/move/up`，位移超过 3px 才算拖动），
普通态与全屏态都要。阈值同样是为了不误触节点点击。

**验收**：图内溢出时，按住空白处拖动 60px，`body.scrollTop` 随之变化。

---

## 收尾检查

- 三档视口（1600×1000 / 1366×768 / 390×844）都过一遍，截图目视。
- 页面零外部请求：`page.on('request')` 里不允许出现 `http(s)://`。
- 交付目录只留一个 HTML；旧版与过程文件进 `.archived/` 并写清单。
