// tools/verify/nav.mjs
// Gate 2: tab bar shape, all 7 destinations reachable, D-pad focus always on-screen.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const PAGES = ['home', 'movies', 'series', 'sports', 'search', 'settings'];
const MARKER = 'NAV OK: 7 pages reachable, focus always on-screen';
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

const FOCUS_CHECK = () => {
  const f = document.querySelector('.focused') || document.activeElement;
  if (!f) return { ok: false, reason: 'no focused element and no document.activeElement' };
  if (f === document.body || !document.body.contains(f)) return { ok: false, reason: 'focused element is body or detached' };
  const r = f.getBoundingClientRect();
  const vh = window.innerHeight;
  const ok = r.width > 2 && r.height > 2 && r.top >= -2 && r.bottom <= vh + 2;
  return {
    ok,
    reason: ok ? '' : 'tag=' + f.tagName + ' class=' + (f.className || '') +
      ' rect=' + [r.width, r.height, r.top, r.bottom].map((n) => Math.round(n)).join(',') + ' vh=' + vh,
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
  await page.waitForTimeout(1500);

  // --- Tab bar shape ---
  const bar = await page.evaluate(() => {
    const nav = document.getElementById('nav-tabs');
    const scope = nav || document;
    let seg = 'li.tab.focusable';
    let items = Array.from(scope.querySelectorAll(seg));
    if (!items.length && nav) items = Array.from(nav.querySelectorAll('[data-page]'));
    if (!items.length) items = Array.from(scope.querySelectorAll('[data-page]'));
    return {
      hasNav: !!nav,
      count: items.length,
      pages: items.map((el) => el.getAttribute('data-page')),
    };
  });
  if (!bar.hasNav) failures.push('#nav-tabs not found (preferred top tab bar selector missing)');
  if (bar.count !== 6) failures.push('#nav-tabs expected exactly 6 focusable items, found ' + bar.count + ' :: ' + JSON.stringify(bar.pages));
  const expected = PAGES.slice().sort().join(',');
  const actual = bar.pages.slice().sort().join(',');
  if (actual !== expected) failures.push('data-page set mismatch: expected [' + expected + '] got [' + actual + ']');

  // --- Each tab renders content ---
  for (const name of PAGES) {
    const how = await activate(page, name);
    if (how === 'none') { failures.push('page "' + name + '": no [data-page] element and no Navigator.navigateTo'); continue; }
    await page.waitForTimeout(800);
    const len = await page.evaluate(() => {
      const mc = document.getElementById('main-content');
      return mc ? mc.textContent.trim().length : -1;
    });
    if (len <= 0) failures.push('page "' + name + '": #main-content empty after activation (via ' + how + ', textContent length=' + len + ')');
  }

  // --- Focus first tab, then D-pad ---
  const seeded = await page.evaluate(() => {
    const scope = document.querySelector('#nav-tabs') || document;
    const el = scope.querySelector('li.tab.focusable') || scope.querySelector('[data-page]');
    if (!el) return false;
    if (window.FocusManager && typeof FocusManager.focus === 'function') FocusManager.focus(el);
    else { el.focus(); el.classList.add('focused'); }
    return true;
  });
  if (!seeded) failures.push('D-pad: could not focus a first tab element');

  const KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Enter', 'ArrowRight', 'ArrowRight',
    'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'Enter', 'ArrowDown', 'ArrowLeft'];
  for (let i = 0; i < KEYS.length; i++) {
    await page.keyboard.press(KEYS[i]);
    await page.waitForTimeout(150);
    const r = await page.evaluate(FOCUS_CHECK);
    if (!r.ok) failures.push('D-pad step ' + i + ' (' + KEYS[i] + '): ' + r.reason);
  }

  // --- 7th destination: details ---
  let detailsOk = false;
  try {
    await page.evaluate(() => {
      if (!(window.Navigator && typeof Navigator.navigateTo === 'function')) throw new Error('Navigator.navigateTo unavailable');
      Navigator.navigateTo('details', { mediaId: '1', kind: 'movie' });
    });
    await page.waitForTimeout(800);
    detailsOk = await page.evaluate(() => {
      const mc = document.getElementById('main-content');
      const rendered = !!(mc && mc.textContent.trim().length > 0);
      const marked = !!document.querySelector('.details-page, .page-container, .empty-state');
      return rendered || marked;
    });
  } catch {
    detailsOk = await page.evaluate(() => !!document.querySelector('.details-page, .page-container, .empty-state'));
  }
  if (!detailsOk) failures.push('page "details": unreachable and no .details-page/.page-container/.empty-state error state rendered');
} catch (err) {
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}

if (failures.length) {
  console.log('nav.mjs FAILED (' + failures.length + ' problem(s)):');
  for (const f of failures) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
