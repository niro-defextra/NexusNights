// tools/verify/states.mjs
// Gate 3: every tab renders visible content and no raw placeholder literals leak.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const PAGES = ['home', 'movies', 'series', 'sports', 'search', 'settings'];
const MARKER = 'STATES OK';
const VIEW_SELECTORS = ['.empty-state', '.error-message', '.content-row', '.content-section', '.hero-section',
  '.search-page', '.settings-page', '.details-page', '.live-band', '.sports-page', '.page-container', '.loading-screen'];
const BAD_LITERALS = ['undefined', 'NaN', '[object Object]', 'null'];
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

  for (const name of PAGES) {
    const how = await activate(page, name);
    if (how === 'none') { failures.push('page "' + name + '": not activatable (no [data-page], no Navigator.navigateTo)'); continue; }
    await page.waitForTimeout(1200);
    const r = await page.evaluate((sels) => {
      const mc = document.getElementById('main-content');
      if (!mc) return { missing: true };
      const innerText = (mc.innerText || '').trim();
      let matched = null;
      for (const s of sels) { if (mc.querySelector(s)) { matched = s; break; } }
      const bodyText = document.body ? document.body.innerText : '';
      const bad = [];
      for (const lit of ['undefined', 'NaN', '[object Object]', 'null']) {
        if (bodyText.indexOf(lit) !== -1) bad.push(lit);
      }
      return { missing: false, len: innerText.length, matched, bad };
    }, VIEW_SELECTORS);

    if (r.missing) { failures.push('page "' + name + '": #main-content not found'); continue; }
    if (r.len <= 0) failures.push('page "' + name + '": #main-content has no visible innerText (via ' + how + ')');
    if (!r.matched) failures.push('page "' + name + '": no recognized state/section element (' + VIEW_SELECTORS.join(', ') + ')');
    if (r.bad.length) failures.push('page "' + name + '": body innerText contains placeholder literal(s): ' + r.bad.map((b) => '"' + b + '"').join(', '));
  }
} catch (err) {
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}

if (failures.length) {
  console.log('states.mjs FAILED (' + failures.length + ' problem(s)):');
  for (const f of failures) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
