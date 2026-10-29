#!/usr/bin/env node
/* 验收脚本：对已生成的单页做可判定检查。
 *
 *   node verify-embed.cjs <file.html> [--shots <dir>]
 *
 * 检查项：三档视口无横向溢出、iframe 不裁切、无外部请求、
 * 点节点更新视窗内卡片、全屏铺满且滚动条隐藏、退出恢复、要点与索引按钮失效。
 * 需要 puppeteer 与本机 Chromium/Edge；不安装任何依赖。
 */
const fs = require('fs');
const path = require('path');

function loadPuppeteer() {
  const candidates = [
    'puppeteer',
    path.join(process.env.HOME || '', '.local/lib/node_modules/puppeteer')
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) { /* try next */ }
  }
  throw new Error('找不到 puppeteer：请先 npm i -g puppeteer 或设置 NODE_PATH');
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

function chromePath() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  throw new Error('找不到浏览器：设置 CHROME_PATH 指向 Chrome/Edge/Chromium');
}

(async () => {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) { console.error('用法：node verify-embed.cjs <file.html> [--shots dir]'); process.exit(2); }
  const shotsIdx = args.indexOf('--shots');
  const shots = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
  if (shots) fs.mkdirSync(shots, { recursive: true });

  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const report = { file: path.resolve(file), checks: [], errors: [] };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => report.errors.push(String(e)));
    const external = [];
    page.on('request', (r) => { if (/^https?:/i.test(r.url())) external.push(r.url()); });

    const url = 'file://' + path.resolve(file);
    const ready = () => page.waitForFunction(
      () => Array.from(document.querySelectorAll('iframe')).length > 0 &&
        Array.from(document.querySelectorAll('iframe')).every((f) => f.dataset.ready === 'true'),
      { timeout: 30000 });

    for (const vp of [{ width: 1600, height: 1000 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewport(vp);
      await page.goto(url, { waitUntil: 'load' });
      await ready();
      await new Promise((r) => setTimeout(r, 400));
      const m = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        pageH: document.documentElement.scrollHeight,
        frames: Array.from(document.querySelectorAll('iframe')).map((f) => {
          const d = f.contentDocument;
          return {
            id: f.id, h: f.clientHeight,
            crop: d.documentElement.scrollHeight > f.clientHeight + 3,
            innerOverflow: d.documentElement.scrollWidth > f.clientWidth + 3
          };
        })
      }));
      if (m.overflowX) throw new Error(vp.width + '：页面横向溢出');
      for (const fr of m.frames) {
        if (fr.crop) throw new Error(vp.width + '：' + fr.id + ' 内容被裁切');
      }
      report.checks.push({ viewport: vp, ...m });
      if (shots) await page.screenshot({ path: path.join(shots, 'vp-' + vp.width + '.png') });
    }

    // 交互与全屏
    await page.setViewport({ width: 1600, height: 1000 });
    await page.goto(url, { waitUntil: 'load' });
    await ready();
    const first = await page.$('iframe');
    const frame = await first.contentFrame();
    const firstId = await first.evaluate((f) => f.id);
    const nodeId = await page.evaluate((id) => {
      const d = document.getElementById(id).contentDocument;
      const n = d.querySelector('g[data-node-id]');
      return n && n.getAttribute('data-node-id');
    }, firstId);
    await frame.evaluate((nid) => {
      const t = document.querySelector('g[data-node-id="' + nid + '"]');
      t.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window }));
    }, nodeId);
    const card = await page.evaluate((id) => {
      const d = document.getElementById(id).contentDocument;
      const c = d.querySelector('.rv-card');
      return c ? { hidden: c.hidden, title: (c.querySelector('h3') || {}).textContent } : null;
    }, firstId);
    if (!card || card.hidden || !card.title) throw new Error('点节点后详解卡未出现');
    report.checks.push({ detailCard: card });

    await frame.evaluate(() => document.querySelectorAll('.rv-tools button')[1].click());
    await new Promise((r) => setTimeout(r, 450));
    const fsState = await page.evaluate((id) => {
      const shell = document.querySelector('.graph-shell.is-fs');
      if (!shell) return null;
      const ifr = shell.querySelector('iframe');
      const d = ifr.contentDocument;
      const svg = d.querySelector('svg[data-node-ui]').getBoundingClientRect();
      return {
        full: Math.round(shell.getBoundingClientRect().width) === window.innerWidth &&
              Math.round(shell.getBoundingClientRect().height) === window.innerHeight,
        scrollable: d.body.scrollHeight > d.body.clientHeight + 5,
        barHidden: getComputedStyle(d.documentElement).scrollbarWidth === 'none' || d.documentElement.offsetWidth >= d.documentElement.clientWidth,
        visibleTop: Math.round(svg.top) >= 0
      };
    }, firstId);
    if (!fsState || !fsState.full) throw new Error('全屏未铺满窗口');
    if (!fsState.scrollable) throw new Error('全屏未按宽度放大（内容未溢出，可能被压扁）');
    report.checks.push({ fullscreen: fsState });

    // 要点与索引必须失效
    const guard = await frame.evaluate(() => {
      const d = document;
      const b = d.querySelector('.rail-reveal');
      const before = d.querySelector('svg[data-node-ui]').getBoundingClientRect().width;
      if (b) { b.hidden = false; b.click(); }
      const after = d.querySelector('svg[data-node-ui]').getBoundingClientRect().width;
      return { before: Math.round(before), after: Math.round(after) };
    });
    if (guard.before !== guard.after) throw new Error('要点与索引按钮仍会改变布局');
    report.checks.push({ railRevealInert: guard });

    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
    if (await page.evaluate(() => !!document.querySelector('.graph-shell.is-fs'))) throw new Error('Esc 未退出全屏');
    report.checks.push({ escapeExits: true });

    report.externalRequests = external;
    if (external.length) throw new Error('页面存在外部请求：' + external.slice(0, 3).join(', '));
    if (report.errors.length) throw new Error('页面报错：' + report.errors[0]);
    report.status = 'pass';
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
