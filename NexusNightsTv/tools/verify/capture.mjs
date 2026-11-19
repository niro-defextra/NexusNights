// tools/verify/capture.mjs
// NOT a gate. Produces the finish-review screenshots for the impeccable G7 review.
// Writes PNGs into ../../.impeccable/review/  (NexusNight/.impeccable/review/).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const OUT = path.resolve(ROOT, '..', '.impeccable', 'review');
const PAGES = ['home', 'movies', 'series', 'sports', 'search', 'settings'];
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

async function focusN(page, n) {
  for (let i = 0; i < n; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(140); }
}

// Wait for a page's own loading screen to be replaced by content, an empty
// state, or a designed error. Fixed delays race the streaming API and produced
// review shots of spinners.
async function waitForSettled(page, timeout) {
  const limit = timeout || 12000;
  await page.waitForFunction(() => {
    const main = document.getElementById('main-content');
    if (!main || !main.children.length) return false;
    return !main.querySelector('.loading-screen');
  }, null, { timeout: limit }).catch(() => {});
  await page.waitForTimeout(700);
}

const written = [];
async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file });
  written.push(name + '.png');
}

let srv = null, browser = null;
try {
  fs.mkdirSync(OUT, { recursive: true });
  srv = await startServer();
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true });

  // ---- ONLINE pass: 1920x1080 (the TV primary panel) ----
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(srv.origin + '/index.html', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await waitForSettled(page, 15000);

  await shot(page, 'desktop');            // home, full viewport, first-viewport contract

  for (const name of PAGES) {
    if (name === 'home') { await shot(page, 'home'); continue; }
    await activate(page, name);
    await waitForSettled(page, 12000);
    await shot(page, name);
  }

  // focused-card state on home (dim-and-lift): go home, press down into the first row
  await activate(page, 'home');
  await waitForSettled(page, 8000);
  await focusN(page, 3);
  await shot(page, 'home-focused');

  // details page (may show its own state if the backend is unavailable)
  await page.evaluate(() => {
    try { Navigator.navigateTo('details', { mediaId: '550', kind: 'movie' }); } catch (e) { /* noop */ }
  }).catch(() => {});
  await waitForSettled(page, 12000);
  await shot(page, 'details');

  // ---- panel scaling: 720p and 4K ----
  await activate(page, 'home');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1400);
  await shot(page, 'tv-720');
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.waitForTimeout(1400);
  await shot(page, 'tv-2160');
  await ctx.close();

  // ---- OFFLINE pass: block every non-local origin -> designed degraded states ----
  const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx2.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(srv.origin)) return route.continue();
    return route.abort();
  });
  const page2 = await ctx2.newPage();
  await page2.goto(srv.origin + '/index.html', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await waitForSettled(page2, 8000);
  await shot(page2, 'state-offline-home');
  for (const name of ['sports', 'search', 'settings']) {
    await activate(page2, name);
    await waitForSettled(page2, 8000);
    await shot(page2, 'state-offline-' + name);
  }
  await ctx2.close();

  console.log('CAPTURE OK: ' + written.length + ' files -> ' + OUT);
  for (const f of written) console.log('  ' + f);
} catch (err) {
  console.log('CAPTURE FAILED: ' + (err && err.stack ? err.stack : err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}
