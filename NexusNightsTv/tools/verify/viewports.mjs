// tools/verify/viewports.mjs
// Gate 6: no document-level overflow and #main-content / #nav-tabs stay inside the
// viewport at 720p, 1080p and 4K, for each tab page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const PAGES = ['home', 'movies', 'series', 'sports', 'search', 'settings'];
const VIEWPORTS = [[1280, 720], [1920, 1080], [3840, 2160]];
const SLACK = 4;
const MARKER = 'VIEWPORTS OK';
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

const MEASURE = (slack) => {
  const de = document.documentElement;
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const mc = rectOf(document.getElementById('main-content'));
  const nt = rectOf(document.getElementById('nav-tabs'));
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const inside = (r) => !!r && r.left >= -slack && r.top >= -slack && r.right <= vw + slack && r.bottom <= vh + slack;
  return {
    scrollWidth: de.scrollWidth, scrollHeight: de.scrollHeight, vw, vh,
    mainInside: inside(mc), navInside: inside(nt), hasMain: !!mc, hasNav: !!nt,
    main: mc, nav: nt,
  };
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
  await page.waitForTimeout(1200);

  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    for (const name of PAGES) {
      const tag = name + '@' + w + 'x' + h;
      const how = await activate(page, name);
      if (how === 'none') { failures.push(tag + ': not activatable'); continue; }
      await page.waitForTimeout(800);
      const m = await page.evaluate(MEASURE, SLACK);
      if (m.scrollWidth > m.vw + SLACK) {
        failures.push(tag + ': document horizontal overflow scrollWidth=' + m.scrollWidth + ' > ' + m.vw + '+' + SLACK);
      }
      if (m.scrollHeight > m.vh + SLACK) {
        failures.push(tag + ': document vertical overflow scrollHeight=' + m.scrollHeight + ' > ' + m.vh + '+' + SLACK);
      }
      if (!m.hasMain) failures.push(tag + ': #main-content not found');
      else if (!m.mainInside) failures.push(tag + ': #main-content outside viewport rect=' + JSON.stringify(m.main) + ' vw/vh=' + m.vw + 'x' + m.vh);
      if (!m.hasNav) failures.push(tag + ': #nav-tabs not found');
      else if (!m.navInside) failures.push(tag + ': #nav-tabs outside viewport rect=' + JSON.stringify(m.nav) + ' vw/vh=' + m.vw + 'x' + m.vh);
    }
  }
} catch (err) {
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}

if (failures.length) {
  console.log('viewports.mjs FAILED (' + failures.length + ' problem(s)):');
  for (const f of failures.slice(0, 40)) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
