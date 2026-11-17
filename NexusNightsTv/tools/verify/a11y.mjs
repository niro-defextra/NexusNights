// tools/verify/a11y.mjs
// Gate 5: accessible names on interactive elements + WCAG 2.1 text contrast per tab.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const PAGES = ['home', 'movies', 'series', 'sports', 'search', 'settings'];
const MARKER = 'A11Y OK';
const MAX_REPORT = 25;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let pathname = '/';
      try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { /* noop */ }
      if (pathname === '/') pathname = '/index.html';
      const filePath = path.join(ROOT, pathname);
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: 'http://127.0.0.1:' + server.address().port }));
  });
}

function closeServer(handle) {
  return new Promise((resolve) => {
    if (!handle) return resolve();
    try { if (handle.server.closeAllConnections) handle.server.closeAllConnections(); } catch { /* noop */ }
    handle.server.close(() => resolve());
    setTimeout(resolve, 1500);
  });
}

async function loadChromium() {
  try { const m = await import(PW); const c = m.chromium || (m.default && m.default.chromium); if (c) return c; } catch { /* noop */ }
  try { const m = await import('file:///' + PW + '/index.mjs'); if (m.chromium) return m.chromium; } catch { /* noop */ }
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)(PW).chromium;
}

async function activate(page, name) {
  return page.evaluate((nm) => {
    const scope = document.querySelector('#nav-tabs') || document;
    const el = scope.querySelector('[data-page="' + nm + '"]') || document.querySelector('[data-page="' + nm + '"]');
    if (el) { el.click(); return 'click'; }
    if (window.Navigator && typeof Navigator.navigateTo === 'function') { Navigator.navigateTo(nm); return 'nav'; }
    return 'none';
  }, name);
}

const AUDIT = () => {
  const parseColor = (str) => {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (fg, bg) => {
    const a = lum(fg);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  const effectiveBg = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) return c;
      node = node.parentElement;
    }
    return { r: 11, g: 11, b: 13, a: 1 };
  };
  const hasName = (el) => {
    if ((el.getAttribute('aria-label') || '').trim()) return true;
    if ((el.getAttribute('title') || '').trim()) return true;
    if (/[A-Za-z\u0600-\u06FF]/.test((el.innerText || '').trim())) return true;
    const img = el.querySelector('img[alt]');
    if (img && (img.getAttribute('alt') || '').trim()) return true;
    const t = el.querySelector('svg title');
    if (t && (t.textContent || '').trim()) return true;
    return false;
  };
  const nameFailures = [];
  document.querySelectorAll('.focusable, button, a[href], [role="button"]').forEach((el) => {
    if (!hasName(el)) {
      nameFailures.push(el.tagName.toLowerCase() + ' :: ' + el.outerHTML.replace(/\s+/g, ' ').slice(0, 120));
    }
  });
  const contrastFailures = [];
  document.querySelectorAll('h1,h2,h3,p,span,a,button,li').forEach((el) => {
    let hasText = false;
    for (const n of el.childNodes) { if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) { hasText = true; break; } }
    if (!hasText) return;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    const cs = getComputedStyle(el);
    const fg = parseColor(cs.color);
    if (!fg) return;
    const bg = effectiveBg(el);
    const fs = parseFloat(cs.fontSize) || 16;
    const r = ratio(fg, bg);
    const threshold = fs >= 24 ? 3.0 : 4.5;
    if (r < threshold) {
      contrastFailures.push({
        el: el.tagName.toLowerCase(),
        text: (el.innerText || '').trim().slice(0, 40),
        fs: Math.round(fs),
        fg: 'rgb(' + fg.r + ',' + fg.g + ',' + fg.b + ')',
        bg: 'rgb(' + bg.r + ',' + bg.g + ',' + bg.b + ')',
        ratio: Math.round(r * 100) / 100,
      });
    }
  });
  return { nameFailures, contrastFailures };
};

const failures = [];
let srv = null;
let browser = null;
try {
  srv = await startServer();
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await page.goto(srv.origin + '/index.html', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const report = [];
  for (const name of PAGES) {
    const how = await activate(page, name);
    if (how === 'none') { failures.push('page "' + name + '": not activatable'); continue; }
    await page.waitForTimeout(800);
    const res = await page.evaluate(AUDIT);
    for (const n of (res.nameFailures || [])) {
      if (report.length < MAX_REPORT) report.push('[' + name + '] missing accessible name: ' + n);
    }
    for (const c of (res.contrastFailures || [])) {
      if (report.length < MAX_REPORT) {
        report.push('[' + name + '] low contrast <' + c.el + '> "' + c.text + '" fs=' + c.fs + 'px ' + c.fg + ' on ' + c.bg + ' ratio=' + c.ratio);
      }
    }
  }
  if (report.length) failures.push('accessibility findings:\n    - ' + report.join('\n    - '));
} catch (err) {
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}

if (failures.length) {
  console.log('a11y.mjs FAILED (' + failures.length + ' problem group(s)):');
  for (const f of failures) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
