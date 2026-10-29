# 可直接抄的代码段

全部为原生 JS / CSS，无构建、无依赖。父页与 iframe 的职责边界：

- **父页**：持有文字 JSON、写 `srcdoc`、算高度、管全屏、渲染详解卡内容、处理下载。
- **iframe（Archify 原生页）**：负责 SVG 渲染、缩放、平移、聚焦与导出。

---

## 1. 把原生 HTML 塞进父页

```js
const assets = JSON.parse(document.getElementById('graph-assets').textContent);
// assets[id] = { html: base64, nodeIds: [...], edges: [{id,from,to}], groups: [...] }

function decodeBase64(s){
  return new TextDecoder().decode(Uint8Array.from(atob(s), c => c.charCodeAt(0)));
}
```

```html
<script id="report-content" type="application/json">{...}</script>
<script id="graph-assets" type="application/json">{...}</script>
```

> 写入时把 `<` 转成 `\u003c`，否则 `</script>` 会截断页面。

---

## 2. 文本补丁：一次性替换所有出现的位置

```js
function patchNative(d){
  const a = assets[d.id];
  const doc = new DOMParser().parseFromString(decodeBase64(a.html), 'text/html');
  const map = new Map();

  // 1) 收集旧值 → 新值
  for (const id of a.nodeIds){
    const n = doc.querySelector(`g[data-node-id="${id}"]`);
    const v = d.nodes[id];
    set(map, n.getAttribute('data-node-label'), v.label);
    set(map, n.getAttribute('data-node-sublabel'), v.sublabel);
    set(map, n.getAttribute('data-node-tag'), v.tag);
  }
  for (const e of a.edges){
    set(map, doc.querySelector(`[data-edge-id="${e.id}"]`)?.getAttribute('data-edge-label'),
        d.edges[e.id].label);
  }

  // 2) 全文与属性一起替换（长串优先，避免子串互相覆盖）
  const keys = [...map.keys()].sort((x, y) => y.length - x.length);
  const rex = new RegExp(keys.map(escapeRe).join('|'), 'g');
  const change = s => s.replace(rex, m => map.get(m));
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode()))
    if (!n.parentElement.closest('script,style')) n.nodeValue = change(n.nodeValue);
  for (const el of doc.querySelectorAll('*'))
    for (const attr of [...el.attributes])
      if (/^(aria-label|title|data-node-|data-edge-label|data-composition-frame-label)/.test(attr.name))
        el.setAttribute(attr.name, change(attr.value));

  // 3) 标题与描述直接覆盖
  doc.title = d.title;
  doc.querySelectorAll('h1,#archify-diagram-title').forEach(x => x.textContent = d.title);

  return '<!doctype html>' + doc.documentElement.outerHTML;
}
```

---

## 3. 注入的样式（父页不可控部分的补救）

在 iframe 的 `<head>` 里追加：

```css
body{padding:0!important;overflow-x:hidden!important}
.container{max-width:none!important;width:var(--rv-w,auto)!important;
  margin:0 var(--rv-pad,0) 0 var(--rv-left,0)!important}
.diagram-container{margin:0!important;border-radius:4px!important}
h1{font-size:15px!important;line-height:1.3!important}
#focus-chip,.reader-rail,.rail-reveal,#rail-reveal,.rail-control{display:none!important}
.rail-reveal{pointer-events:none!important}
svg[data-node-ui]{max-width:100%!important;height:auto!important}
```

---

## 4. 定高（父页）

```js
function resizeFrame(id){
  const frame = frames.get(id), doc = frame.contentDocument;
  const svg = doc.querySelector('svg[data-node-ui]');
  if (!svg) return;
  const [, , vbW, vbH] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const ratio = vbH / vbW;
  const root = doc.documentElement;
  const shell = frame.closest('.graph-shell');
  const narrow = innerWidth <= 850;
  const pad = cardOpen ? 322 : 0;

  // chrome 量一次，别写死
  const chrome = Math.max(60, Math.round(
    doc.documentElement.scrollHeight - svg.getBoundingClientRect().height));

  if (shell.classList.contains('is-fs')) {
    shell.style.height = '';
    if ((Number(svg.getAttribute('data-view-scale')) || 1) !== 1) {
      doc.querySelector('.diagram-nav button[aria-label*="重置"]')?.click();
    }
    const h = innerHeight;
    frame.style.height = h + 'px';
    root.classList.add('rv-fs');
    root.classList.remove('rv-scaled');
    root.classList.toggle('rv-fit', fsFit);
    doc.body.style.height = h + 'px';
    doc.body.style.overflowY = 'auto';
    const avail = frame.clientWidth - pad;
    const w = fsFit ? Math.min(avail, (h - chrome) / ratio) : avail;
    root.style.setProperty('--rv-w', Math.round(w) + 'px');
    root.style.setProperty('--rv-left', Math.round((avail - w) / 2) + 'px');
    return;
  }

  root.classList.remove('rv-fs', 'rv-fit');
  doc.body.style.height = ''; doc.body.style.overflowY = '';
  if (narrow) { frame.style.height = Math.min(680, doc.documentElement.scrollHeight) + 'px'; return; }

  const width = frame.clientWidth - pad;
  const natural = Math.round(width * ratio + chrome);
  const cap = Math.round(innerHeight * 0.96);
  frame.style.height = natural + 'px';
  shell.style.height = Math.min(natural, cap) + 'px';

  // 一屏一图：用阅读器自带的 25% 缩放档位，别改容器宽度（会反馈）
  const top = svg.getBoundingClientRect().top;
  const target = natural > cap ? Math.max(0.25, Math.min(1, (cap - top - 6) / (width * ratio))) : 1;
  const want = Math.max(0.25, 1 - Math.round((1 - target) / 0.25) * 0.25);
  let now = Number(svg.getAttribute('data-view-scale')) || 1;
  for (let i = 0; i < 6 && now > want + 1e-3; i++) {
    doc.querySelector('button[aria-label="缩小"]')?.click();
    now = Number(svg.getAttribute('data-view-scale')) || now - 0.25;
  }
  for (let i = 0; i < 6 && now < want - 1e-3; i++) {
    doc.querySelector('button[aria-label="放大"]')?.click();
    now = Number(svg.getAttribute('data-view-scale')) || now + 0.25;
  }
  root.classList.toggle('rv-scaled', now < 0.999);
}
```

## 5. 全屏（网页内，不用 Fullscreen API）

```js
function toggleFullscreen(id){
  const v = views.get(id);
  const shell = v.frame.closest('.graph-shell');
  const on = !shell.classList.contains('is-fs');
  shell.classList.toggle('is-fs', on);
  document.body.classList.toggle('has-fs', on);
  v.fsButton.textContent = on ? '退出全屏' : '全屏';
  v.fitButton.hidden = !on;
  resizeFrame(id);
}
```

```css
.graph-shell.is-fs{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:#fff}
.graph-shell.is-fs .graph-caption{display:none}
body.has-fs{overflow:hidden}

html.rv-fs,html.rv-fs body{scrollbar-width:none}
html.rv-fs::-webkit-scrollbar,html.rv-fs body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}
html.rv-fit,html.rv-fit body,html.rv-scaled,html.rv-scaled body{overflow:hidden!important}
```

---

## 6. 键盘与拖动（都挂在 iframe 的 document 上）

```js
doc.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isFullscreen) closeFullscreen();
});

let drag = null;
doc.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.target.closest('.rv-card,.rv-tools,.diagram-nav')) return;
  drag = { y: e.clientY, top: doc.body.scrollTop, moved: false };
});
doc.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  if (Math.abs(dy) > 3) drag.moved = true;
  doc.body.scrollTop = drag.top - dy;
});
doc.addEventListener('pointerup', () => { drag = null; });
```

---

## 7. 长标签按宽度回缩

```js
function fitLabel(text, width, min = 5){
  const font = Number(text.getAttribute('font-size')) || 10;
  const units = [...text.textContent]
    .reduce((n, c) => n + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.58), 0);
  if (units * font > width)
    text.setAttribute('font-size', String(Math.max(min, width / Math.max(1, units))));
}
```

---

## 8. 下载时把 JSON 一起写回

```js
function download(){
  const clone = document.documentElement.cloneNode(true);
  clone.querySelector('#report-body').replaceChildren();      // 渲染结果不要带
  clone.querySelector('#report-nav').replaceChildren();
  clone.querySelector('#report-content').textContent =
    JSON.stringify(content, null, 2).replace(/</g, '\\u003c');
  clone.querySelector('#json-editor').textContent = '';
  const blob = new Blob(['<!doctype html>' + clone.outerHTML], {type:'text/html;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'report.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
```

---

## 9. 校验后再应用

```js
function exactKeys(obj, keys, path){
  const actual = Object.keys(obj || {});
  if (actual.length !== keys.length || keys.some(k => !(k in obj)))
    throw new Error(path + ' 请保留现有 id');
}
```

节点、连线、分区三处的 id 集合必须与基线完全一致；正文里三张图各出现一次。
