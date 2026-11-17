// tools/verify/load.mjs
// Gate 1: static app loads with zero local-asset errors and no js/ux.js request.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PW = 'c:/Users/CursedChip/Desktop/NexusNight/node_modules/playwright';
const MARKER = 'LOAD OK: 0 console errors, 0 failed requests';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
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

const failures = [];
let srv = null;
let browser = null;
try {
  srv = await startServer();
  const chromium = await loadChromium();
  browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedLocal = [];
  const badStatus = [];
  let uxRequested = false;

  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(String(msg.text()).replace(/\s+/g, ' ').slice(0, 240)); });
  page.on('pageerror', (err) => pageErrors.push(String((err && err.message) || err).slice(0, 240)));
  page.on('requestfailed', (req) => {
    if (req.url().startsWith(srv.origin)) {
      const f = req.failure();
      failedLocal.push(req.url() + ' :: ' + (f ? f.errorText : 'unknown'));
    }
  });
  page.on('response', (res) => {
    if (res.url().startsWith(srv.origin) && res.status() >= 400) badStatus.push(res.status() + ' ' + res.url());
  });
  page.on('request', (req) => { if (req.url().split('?')[0].endsWith('js/ux.js')) uxRequested = true; });

  await page.goto(srv.origin + '/index.html', { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);

  if (consoleErrors.length) failures.push(consoleErrors.length + ' console error(s):\n    - ' + consoleErrors.slice(0, 10).join('\n    - '));
  if (pageErrors.length) failures.push(pageErrors.length + ' page error(s):\n    - ' + pageErrors.slice(0, 10).join('\n    - '));
  if (failedLocal.length) failures.push(failedLocal.length + ' failed same-origin request(s):\n    - ' + failedLocal.slice(0, 10).join('\n    - '));
  if (badStatus.length) failures.push(badStatus.length + ' same-origin 4xx/5xx response(s):\n    - ' + badStatus.slice(0, 10).join('\n    - '));
  if (uxRequested) failures.push('forbidden asset requested: js/ux.js (this file must not exist / must not be referenced)');
} catch (err) {
  failures.push('EXCEPTION: ' + (err && err.stack ? err.stack : err));
} finally {
  if (browser) await browser.close().catch(() => {});
  await closeServer(srv);
}

if (failures.length) {
  console.log('load.mjs FAILED (' + failures.length + ' problem group(s)):');
  for (const f of failures) console.log('  * ' + f);
  process.exit(1);
}
console.log(MARKER);
process.exit(0);
