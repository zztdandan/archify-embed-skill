/* archify-embed runtime — 把 Archify 原生图变成可交付的单页汇报
 *
 * 用法：
 *   <div id="report-root"></div>
 *   <script id="report-content" type="application/json">{...}</script>
 *   <script id="graph-assets" type="application/json">{...}</script>
 *   <script src="embed-runtime.js"></script>
 *
 * 页面结构与数据格式见 SKILL.md 与 references/data-model.md。
 * 无依赖、可离线运行；所有文字走 textContent，不接受 HTML。
 */
(function (global) {
  'use strict';

  var CHROME = 118;      // 阅读器标题栏 + 底部导航 + 内边距
  var CARD_W = 322;      // 视窗内详解卡预留宽度

  var state = { content: null, assets: null, frames: new Map(), views: new Map(), fs: new Set() };

  function el(tag, cls, text, doc) {
    doc = doc || document;
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function decode(b64) {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }));
  }

  function safeJSON(v) {
    return JSON.stringify(v, null, 2).replace(/</g, '\\u003c');
  }

  function estimate(text) {
    return Array.prototype.reduce.call(text, function (n, c) {
      return n + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.58);
    }, 0);
  }

  function fitLabel(node, width, min) {
    if (!node) return;
    min = min || 5;
    var font = Number(node.getAttribute('font-size')) || 10;
    var units = estimate(node.textContent);
    if (units * font > width) node.setAttribute('font-size', String(Math.max(min, width / Math.max(1, units))));
  }

  /* ---------- 文本补丁：把 JSON 文字写进原生 SVG ---------- */
  function patchNative(d) {
    var a = state.assets[d.id];
    var doc = new DOMParser().parseFromString(decode(a.html), 'text/html');
    var map = new Map();
    function put(oldV, newV) {
      if (oldV && oldV !== newV && !map.has(oldV)) map.set(oldV, newV);
    }

    put(doc.querySelector('h1') && doc.querySelector('h1').textContent, d.title);
    a.nodeIds.forEach(function (id) {
      var n = doc.querySelector('g[data-node-id="' + id + '"]');
      if (!n) throw new Error('节点基线缺失：' + id);
      var v = d.nodes[id];
      put(n.getAttribute('data-node-label'), v.label);
      put(n.getAttribute('data-node-sublabel'), v.sublabel);
      put(n.getAttribute('data-node-tag'), v.tag);
    });
    a.edges.forEach(function (e) {
      var g = doc.querySelector('[data-edge-id="' + e.id + '"]');
      if (g) put(g.getAttribute('data-edge-label'), d.edges[e.id].label);
    });
    a.groups.forEach(function (g, i) {
      var f = doc.querySelector('[data-composition-frame-id="' + i + '"][data-composition-frame-label]');
      if (f) put(f.getAttribute('data-composition-frame-label'), d.groups[g.id].label);
    });

    if (map.size) {
      var keys = Array.from(map.keys()).sort(function (x, y) { return y.length - x.length; });
      var rex = new RegExp(keys.map(function (s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }).join('|'), 'g');
      var change = function (s) { return s.replace(rex, function (m) { return map.get(m); }); };
      var w = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT), t;
      while ((t = w.nextNode())) {
        if (!t.parentElement || !t.parentElement.closest('script,style')) t.nodeValue = change(t.nodeValue);
      }
      Array.prototype.forEach.call(doc.querySelectorAll('*'), function (node) {
        Array.prototype.forEach.call(Array.from(node.attributes), function (attr) {
          if (/^(aria-label|title|data-node-|data-edge-label|data-composition-frame-label)/.test(attr.name)) {
            node.setAttribute(attr.name, change(attr.value));
          }
        });
      });
    }

    doc.title = d.title;
    Array.prototype.forEach.call(doc.querySelectorAll('h1,#archify-diagram-title'), function (x) {
      x.textContent = d.title;
    });

    // 精确改写节点文字与字号，保证长标签不出框
    a.nodeIds.forEach(function (id) {
      var n = doc.querySelector('g[data-node-id="' + id + '"]'), v = d.nodes[id];
      var rect = n.querySelector('rect');
      var width = Number(rect && rect.getAttribute('width')) || 260;
      n.setAttribute('data-node-label', v.label);
      n.setAttribute('data-node-sublabel', v.sublabel);
      n.setAttribute('data-node-tag', v.tag);
      n.setAttribute('aria-label', v.label + '，' + v.sublabel);
      var label = n.querySelector('text[data-node-label]');
      if (label) { label.textContent = v.label; fitLabel(label, width - 28); }
      var sub = n.querySelector('text[data-detail="context"]');
      if (sub) { sub.textContent = v.sublabel; fitLabel(sub, width - 24); }
      var tag = n.querySelector('text[data-detail="fine"]');
      if (tag) { tag.textContent = v.tag; fitLabel(tag, width - 24); }
    });
    a.edges.forEach(function (e) {
      var value = d.edges[e.id].label;
      Array.prototype.forEach.call(doc.querySelectorAll('[data-edge-id="' + e.id + '"]'), function (g) {
        g.setAttribute('data-edge-label', value);
        var tx = g.querySelector('text');
        if (tx) {
          var mask = g.querySelector('rect');
          var boxW = Number(mask ? mask.getAttribute('width') : 100) || 100;
          tx.textContent = value;
          fitLabel(tx, Math.max(30, boxW - 8));
        }
      });
      Array.prototype.forEach.call(doc.querySelectorAll('[data-relationship-id="' + e.id + '"]'), function (g) {
        g.setAttribute('aria-label', d.nodes[e.from].label + ' → ' + d.nodes[e.to].label + '：' + value);
      });
    });
    a.groups.forEach(function (g, i) {
      Array.prototype.forEach.call(doc.querySelectorAll('[data-composition-frame-id="' + i + '"] [data-boundary-label]'), function (tx) {
        tx.textContent = d.groups[g.id].label;
      });
    });

    var style = doc.createElement('style');
    style.textContent =
      'html,body{margin:0!important;padding:0!important;overflow-x:hidden!important}' +
      '.archify-toast{display:none!important}' +
      '.container{max-width:none!important;width:var(--rv-w,auto)!important;' +
      'margin:0 var(--rv-pad,0) 0 var(--rv-left,0)!important;transition:none}' +
      '.diagram-container{margin:0!important;border-radius:4px!important}' +
      'h1{font-size:15px!important;line-height:1.3!important}' +
      '#focus-chip,.reader-rail,.rail-reveal,#rail-reveal,.rail-control,#rail-collapse,#rail-placement{display:none!important;pointer-events:none!important}' +
      'svg[data-node-ui]{max-width:100%!important;height:auto!important}' +
      'html.rv-fs{scrollbar-width:none}' +
      'html.rv-fs body{scrollbar-width:none}' +
      'html.rv-fs::-webkit-scrollbar,html.rv-fs body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}' +
      'html.rv-fit,html.rv-fit body{overflow:hidden!important}' +
      'html.rv-scaled,html.rv-scaled body{overflow:hidden!important}' +
      /* 视窗内的工具条与详解卡：必须在 iframe 里也生效，父页样式进不来 */
      '.rv-tools{position:fixed;left:10px;bottom:12px;z-index:30;display:flex;gap:6px;font:13px/1.4 system-ui,"Noto Sans SC",sans-serif}' +
      '.rv-tools button{padding:6px 11px;border:1px solid #cfdbe6;border-radius:6px;background:#fffffff2;color:#134a6c;font:inherit;cursor:pointer;box-shadow:0 3px 12px #0d2b4414}' +
      '.rv-tools button[aria-pressed="true"]{background:#0f6ea8;border-color:#0f6ea8;color:#fff}' +
      '.rv-card{position:fixed;right:10px;top:84px;bottom:12px;width:302px;max-width:calc(100% - 20px);z-index:29;display:flex;flex-direction:column;background:#fff;color:#16344b;border:1px solid #d3e0ea;border-radius:9px;box-shadow:0 12px 34px #0b294417;font:13px/1.6 system-ui,"Noto Sans SC",sans-serif}' +
      '.rv-card[hidden]{display:none}' +
      '.rv-head{display:flex;align-items:center;gap:8px;padding:9px 11px;border-bottom:1px solid #e4ecf2;background:#f5f9fc;border-radius:9px 9px 0 0}' +
      '.rv-head strong{flex:1;font-size:12px;color:#3c6684}' +
      '.rv-close{border:0;background:none;color:#5c7a8f;font-size:17px;line-height:1;cursor:pointer}' +
      '.rv-body{flex:1;overflow:auto;padding:11px 13px 15px}' +
      '.rv-body h3{margin:0 0 6px;font-size:17px;line-height:1.35;color:#0b3b5c}' +
      '.rv-body h4{margin:12px 0 5px;font-size:12px;color:#31556e}' +
      '.rv-tag{margin:0 0 9px;padding-left:7px;font-size:12px;color:#0f7488;border-left:3px solid #2bb4bb}' +
      '.rv-rel{margin:4px 0 8px;padding:0;list-style:none}' +
      '.rv-rel li{padding:4px 0;border-bottom:1px solid #eef2f6}' +
      '.rv-link{border:0;background:none;padding:0;color:#0a67a3;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}' +
      '.rv-note{display:block;margin-top:1px;font-size:11.5px;color:#67808f}' +
      '@media (max-width:820px){.rv-card{top:52px;right:8px;left:8px;width:auto;max-height:64%}.rv-tools{left:8px;bottom:8px}}';
    doc.head.appendChild(style);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }

  /* ---------- 尺寸 ---------- */
  function resizeFrame(id) {
    var frame = state.frames.get(id);
    if (!frame || !frame.contentDocument || !frame.isConnected) return;
    var view = state.views.get(id);
    var doc = frame.contentDocument;
    var svg = doc.querySelector('svg[data-node-ui]');
    if (!svg) return;
    var vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length !== 4 || !vb[2] || !vb[3]) return;

    var shell = frame.closest('.graph-shell');
    var root = doc.documentElement;
    var narrow = global.innerWidth <= 850;
    var pad = (view && !view.card.hidden && !narrow) ? CARD_W : 0;
    var ratio = vb[3] / vb[2];
    // 实测 chrome：图以外的标题栏、底部导航与内边距。不同 Archify 版本会有差异，
    // 用一次量测代替硬编码，后面收窄容器时按它反算宽度。
    var svgBox = svg.getBoundingClientRect();
    var chrome = Math.max(60, Math.round(doc.documentElement.scrollHeight - svgBox.height));

    if (shell.classList.contains('is-fs')) {
      shell.style.height = '';            // 普通态写过的内联高度要让位给 fixed 全屏
      // 全屏按 100% 显示；普通态为塞进一屏做过的缩放在这里复位。
      if ((Number(svg.getAttribute('data-view-scale')) || 1) !== 1) {
        var rz = doc.querySelector('.diagram-nav button[aria-label*="重置"]');
        if (rz) rz.click();
      }
      var winH = Math.max(320, global.innerHeight);
      frame.style.height = winH + 'px';
      root.classList.add('rv-fs');
      root.classList.remove('rv-scaled');
      // 阅读器把 html 锁成 overflow:hidden，纵向滚动只能由 body 承担。
      doc.body.style.height = winH + 'px';
      doc.body.style.overflowY = 'auto';
   // 普通态的裁切规则会挡住全屏滚动
      root.classList.toggle('rv-fit', Boolean(view && view.fsFit));
      var avail = Math.max(280, frame.clientWidth - pad);
      var fitW = Math.max(280, Math.min(avail, (winH - chrome) / ratio));
      var w = view && view.fsFit ? fitW : avail;
      root.style.setProperty('--rv-w', Math.round(w) + 'px');
      root.style.setProperty('--rv-left', Math.max(0, Math.round((avail - w) / 2)) + 'px');
      return;
    }

    root.classList.remove('rv-fs', 'rv-fit');
    doc.body.style.height = '';
    doc.body.style.overflowY = '';
    if (narrow) {
      var mh = Math.min(680, Math.max(320, doc.documentElement.scrollHeight));
      root.style.removeProperty('--rv-w'); root.style.removeProperty('--rv-left');
      frame.style.height = mh + 'px';
      return;
    }
    var width = frame.clientWidth - pad;
    var natural = Math.round(width * ratio + chrome);
    var cap = Math.max(420, Math.round(global.innerHeight * 0.96));
    var shellEl = frame.closest('.graph-shell');
    root.style.removeProperty('--rv-w');
    root.style.removeProperty('--rv-left');
    root.classList.remove('rv-scaled', 'rv-fit');

    // 一屏一图：先按自然高度排版，超过上限就用阅读器自带的缩放步进缩小，
    // 直到整张图落进一屏。走它的缩放接口，不要自己改 svg 的 transform。
    frame.style.height = natural + 'px';
    var zoomOut = function () {
      var b = doc.querySelector('button[aria-label="缩小"]');
      if (!b) return false;
      b.click();
      return true;
    };
    var reset = function () {
      var b = doc.querySelector('.diagram-nav button[aria-label*="重置"]');
      if (b) b.click();
    };
    // 目标缩放只由几何决定：可用高度 ÷ 图在 100% 时的高度。
    var box0 = svg.getBoundingClientRect();
    var top0 = box0.top || 0;
    var naturalSvgH = Math.max(1, width * ratio);
    var avail = Math.max(120, cap - top0 - 6);
    var target = natural > cap ? Math.max(0.25, Math.min(1, avail / naturalSvgH)) : 1;
    var stepsWanted = Math.round((1 - target) / 0.25);
    var scaleNow = Number(svg.getAttribute('data-view-scale')) || 1;
    var wantScale = Math.max(0.25, 1 - stepsWanted * 0.25);
    var guard = 0;
    while (scaleNow > wantScale + 0.001 && guard < 6) {
      if (!zoomOut()) break;
      scaleNow = Number(svg.getAttribute('data-view-scale')) || scaleNow - 0.25;
      guard++;
    }
    guard = 0;
    while (scaleNow < wantScale - 0.001 && guard < 6) {
      var zin = doc.querySelector('button[aria-label="放大"]');
      if (!zin) break;
      zin.click();
      scaleNow = Number(svg.getAttribute('data-view-scale')) || scaleNow + 0.25;
      guard++;
    }
    root.classList.toggle('rv-scaled', wantScale < 0.999);
    var fitted = Math.min(cap, Math.max(320, doc.documentElement.scrollHeight));
    frame.style.height = fitted + 'px';
    if (shellEl) shellEl.style.height = fitted + 'px';
  }

  /* ---------- 详解卡 ---------- */
  function showDetail(id, sel) {
    var view = state.views.get(id);
    if (!view) return;
    var d = state.content.diagrams.filter(function (x) { return x.id === id; })[0];
    var a = state.assets[id];
    var doc = view.doc, card = view.card, body = view.body;
    view.selection = sel;
    body.replaceChildren();
    card.hidden = false;
    if (view.toggle) view.toggle.setAttribute('aria-pressed', 'true');
    if (view.head) view.head.textContent = sel.kind === 'edge' ? '连接说明' : sel.kind === 'node' ? '节点详解' : '架构说明';

    if (sel.kind === 'node' && d.nodes[sel.id]) {
      var n = d.nodes[sel.id];
      body.appendChild(el('h3', '', n.label, doc));
      if (n.tag) body.appendChild(el('p', 'rv-tag', n.tag, doc));
      if (n.summary) body.appendChild(el('p', '', n.summary, doc));
      if (n.points && n.points.length) body.appendChild(list(doc, n.points));
      var groups = a.groups.filter(function (g) { return g.wraps.indexOf(sel.id) >= 0; });
      if (groups.length) {
        body.appendChild(el('h4', '', '所属系统与领域', doc));
        body.appendChild(list(doc, groups.map(function (g) { return d.groups[g.id].label; })));
      }
      [['up', '接收的协作'], ['down', '提供的协作']].forEach(function (pair) {
        var rows = a.edges.filter(function (e) { return pair[0] === 'up' ? e.to === sel.id : e.from === sel.id; });
        if (!rows.length) return;
        body.appendChild(el('h4', '', pair[1], doc));
        var ul = el('ul', 'rv-rel', '', doc);
        rows.forEach(function (e) {
          var li = el('li', '', '', doc);
          var other = pair[0] === 'up' ? e.from : e.to;
          var btn = el('button', 'rv-link', d.nodes[other].label, doc);
          btn.type = 'button';
          btn.onclick = function () { showDetail(id, { kind: 'node', id: other }); };
          li.appendChild(btn);
          li.appendChild(el('span', 'rv-note', d.edges[e.id].label, doc));
          ul.appendChild(li);
        });
        body.appendChild(ul);
      });
    } else if (sel.kind === 'edge' && d.edges[sel.id]) {
      var edge = a.edges.filter(function (e) { return e.id === sel.id; })[0];
      var info = d.edges[sel.id];
      body.appendChild(el('h3', '', info.label || '数据协作', doc));
      if (info.description) body.appendChild(el('p', '', info.description, doc));
      [['提供方', edge.from], ['接收方', edge.to]].forEach(function (pair) {
        body.appendChild(el('h4', '', pair[0], doc));
        var b = el('button', 'rv-link', d.nodes[pair[1]].label, doc);
        b.type = 'button';
        b.onclick = function () { showDetail(id, { kind: 'node', id: pair[1] }); };
        body.appendChild(b);
      });
    } else {
      body.appendChild(el('h3', '', d.title, doc));
      if (d.summary) body.appendChild(el('p', '', d.summary, doc));
      body.appendChild(list(doc, d.points || []));
    }
    body.scrollTop = 0;
    applySpace(id);
  }

  function list(doc, items) {
    var ul = el('ul', '', '', doc);
    items.forEach(function (t) { ul.appendChild(el('li', '', t, doc)); });
    return ul;
  }

  function applySpace(id) {
    var view = state.views.get(id);
    if (!view) return;
    var pad = (!view.card.hidden && global.innerWidth > 820) ? CARD_W : 0;
    view.doc.documentElement.style.setProperty('--rv-pad', pad + 'px');
    resizeFrame(id);
  }

  function toggleCard(id, force) {
    var view = state.views.get(id);
    if (!view) return;
    var open = force === undefined ? view.card.hidden : force;
    view.card.hidden = !open;
    if (view.toggle) view.toggle.setAttribute('aria-pressed', String(open));
    applySpace(id);
  }

  /* ---------- 全屏 ---------- */
  function toggleFullscreen(id) {
    var view = state.views.get(id);
    if (!view) return;
    var shell = view.frame.closest('.graph-shell');
    var on = !state.fs.has(id);
    if (on) { state.fs.add(id); shell.classList.add('is-fs'); document.body.classList.add('has-fs'); }
    else { state.fs.delete(id); shell.classList.remove('is-fs'); if (!state.fs.size) document.body.classList.remove('has-fs'); }
    view.fsButton.textContent = on ? '退出全屏' : '全屏';
    view.fitButton.hidden = !on;
    view.fitButton.textContent = view.fsFit ? '铺满窗口' : '适配整图';
    resizeFrame(id);
    setTimeout(function () { resizeFrame(id); }, 120);
  }

  function closeFullscreen() {
    Array.from(state.fs).forEach(function (id) {
      var view = state.views.get(id);
      if (!view) return;
      state.fs.delete(id);
      view.frame.closest('.graph-shell').classList.remove('is-fs');
      view.fsButton.textContent = '全屏';
      view.fitButton.hidden = true;
      resizeFrame(id);
    });
    document.body.classList.remove('has-fs');
  }

  /* ---------- iframe 内交互 ---------- */
  function connect(id, frame) {
    var doc = frame.contentDocument;
    if (!doc) return;
    state.frames.set(id, frame);

    var tools = el('div', 'rv-tools', '', doc);
    var toggle = el('button', '', '详解', doc);
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'true');
    toggle.onclick = function () { toggleCard(id); };

    var fsButton = el('button', '', '全屏', doc);
    fsButton.type = 'button';
    fsButton.onclick = function () { toggleFullscreen(id); };

    var fitButton = el('button', '', '适配整图', doc);
    fitButton.type = 'button';
    fitButton.hidden = true;
    fitButton.onclick = function () {
      var v = state.views.get(id);
      v.fsFit = !v.fsFit;
      fitButton.textContent = v.fsFit ? '铺满窗口' : '适配整图';
      resizeFrame(id);
    };

    tools.appendChild(toggle);
    tools.appendChild(fsButton);
    tools.appendChild(fitButton);
    doc.body.appendChild(tools);

    var card = el('section', 'rv-card', '', doc);
    card.hidden = true;
    var head = el('div', 'rv-head', '', doc);
    var headText = el('strong', '', '节点详解', doc);
    var close = el('button', 'rv-close', '×', doc);
    close.type = 'button';
    close.setAttribute('aria-label', '关闭详解');
    close.onclick = function () { toggleCard(id, false); };
    head.appendChild(headText);
    head.appendChild(close);
    var body = el('div', 'rv-body', '', doc);
    card.appendChild(head);
    card.appendChild(body);
    doc.body.appendChild(card);

    state.views.set(id, {
      doc: doc, detail: body, body: body, card: card, toggle: toggle,
      fsButton: fsButton, fitButton: fitButton, frame: frame, head: headText, fsFit: false
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.fs.size) closeFullscreen();
    });
    doc.addEventListener('click', function (e) {
      if (e.target.closest('.rv-card,.rv-tools')) return;
      var t = e.target.closest ? e.target.closest('g[data-node-id],g[data-relationship-id]') : null;
      if (!t) return;
      var node = t.getAttribute('data-node-id');
      showDetail(id, node ? { kind: 'node', id: node } : { kind: 'edge', id: t.getAttribute('data-relationship-id') });
    }, true);

    var selection = { kind: 'node', id: current(id).initialNode };
    showDetail(id, selection);
    frame.dataset.ready = 'true';
    resizeFrame(id);
  }

  function current(id) {
    return state.content.diagrams.filter(function (d) { return d.id === id; })[0];
  }

  /* ---------- 渲染 ---------- */
  function render() {
    state.frames.clear(); state.views.clear(); state.fs.clear();
    document.body.classList.remove('has-fs');
    var c = state.content;
    document.title = c.report.title;

    var root = document.getElementById('report-root');
    root.replaceChildren();

    var head = el('header', 'report-header');
    head.appendChild(el('p', 'category', c.report.category));
    head.appendChild(el('h1', '', c.report.title));
    root.appendChild(head);

    var nav = el('nav', 'report-nav');
    nav.id = 'report-nav';
    root.appendChild(nav);

    var main = el('main');
    main.id = 'report-body';
    root.appendChild(main);

    main.appendChild(el('p', 'lead', c.report.lead));
    var hl = el('ul', 'highlights');
    c.report.highlights.forEach(function (t) { hl.appendChild(el('li', '', t)); });
    main.appendChild(hl);

    c.report.sections.forEach(function (s) {
      var sec = el('section', 'report-section');
      sec.id = s.id;
      sec.appendChild(el('h2', '', s.title));
      var link = el('a', '', s.title);
      link.href = '#' + s.id;
      nav.appendChild(link);

      s.blocks.forEach(function (b) {
        if (b.type === 'paragraph') { sec.appendChild(el('p', '', b.text)); return; }
        if (b.type === 'diagram') { sec.appendChild(graph(current(b.diagramId))); return; }
        var wrap = el('div', 'table-wrap'), table = el('table');
        var thead = el('thead'), tr = el('tr');
        b.headers.forEach(function (h) { tr.appendChild(el('th', '', h)); });
        thead.appendChild(tr);
        table.appendChild(thead);
        var tbody = el('tbody');
        b.rows.forEach(function (cells) {
          var r = el('tr');
          cells.forEach(function (cell) { r.appendChild(el('td', '', cell)); });
          tbody.appendChild(r);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        sec.appendChild(wrap);
      });
      main.appendChild(sec);
    });
  }

  function graph(d) {
    var shell = el('div', 'graph-shell');
    shell.dataset.diagramId = d.id;
    var frame = el('iframe', 'native-graph');
    frame.id = 'graph-' + d.id;
    frame.title = d.title;
    frame.loading = 'eager';
    frame.onload = function () { connect(d.id, frame); };
    shell.appendChild(frame);
    if (d.caption) shell.appendChild(el('p', 'graph-caption', d.caption));
    frame.srcdoc = patchNative(d);
    return shell;
  }

  /* ---------- 对外 ---------- */
  function mount(content, assets) {
    state.content = content;
    state.assets = assets;
    render();
    // 焦点可能在父页，也可能在 iframe：两处都要能按 Esc 退出
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.fs.size) closeFullscreen();
    });
    global.addEventListener('resize', function () {
      setTimeout(function () { Array.from(state.frames.keys()).forEach(resizeFrame); }, 160);
    });
  }

  global.ArchifyEmbed = {
    mount: mount,
    resize: resizeFrame,
    showDetail: showDetail,
    toggleFullscreen: toggleFullscreen,
    closeFullscreen: closeFullscreen,
    state: state
  };

  var boot = function () {
    var c = document.getElementById('report-content');
    var a = document.getElementById('graph-assets');
    if (!c || !a) return;
    mount(JSON.parse(c.textContent), JSON.parse(a.textContent));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
