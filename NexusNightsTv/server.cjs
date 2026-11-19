const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const PUBLIC_DIR = __dirname;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const SPORTS_SLUG_MAP = {
    'bein-1': 'beINAR',
    'bein-2': 'beINAR2',
    'bein-3': 'beINAR3',
    'bein-4': 'beINAR4',
    'bein-5': 'beINAR5',
    'bein-6': 'beINAR6',
    'bein-7': 'beINAR7',
    'bein-8': 'beINAR8',
    'bein-9': 'beINAR9',
    'bein-news': 'beINARNews',
    'bein-max-1': 'beINAR',
    'bein-afc-1': 'beINAR',
    'bein-afc-2': 'beINAR2',
    'bein-fr-1': 'BEINSPORT1FR',
    'bein-fr-2': 'BEINSPORT2FR',
    'bein-fr-3': 'BEINSPORT3FR',
    'bein-en-1': 'beINAR',
    'sky-pl': 'SkySportsPremierLeague',
    'sky-main': 'SkySportsMainEvent'
};

const streamCache = new Map();

async function resolveStreamUrl(slug, forceFresh = false) {
    const now = Date.now();
    const cached = streamCache.get(slug);
    if (!forceFresh && cached && cached.expiresAt > now) {
        return cached.url;
    }

    const playerUrl = 'https://wideiptv.top/player/' + slug;
    const res = await fetch(playerUrl, {
        headers: {
            'Referer': 'https://wideiptv.top/daddy.php?stream=' + slug,
            'User-Agent': UA
        },
        signal: AbortSignal.timeout(9000)
    });

    if (!res.ok) throw new Error('Upstream player returned HTTP ' + res.status);
    const text = await res.text();
    const match = text.match(/streamUrl:\s*"([^"]+)"/);
    if (!match) throw new Error('No streamUrl in player response');

    const streamUrl = match[1].replace(/\\\//g, '/');
    streamCache.set(slug, {
        url: streamUrl,
        expiresAt: now + 180000
    });
    return streamUrl;
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const reqPath = decodeURI(parsedUrl.pathname);

    // 1. SPORTS MASTER MANIFEST
    const manifestMatch = reqPath.match(/^\/api\/sports\/stream\/([^\/]+)\/manifest\.m3u8$/);
    if (manifestMatch) {
        const channelKey = manifestMatch[1].toLowerCase();
        const slug = SPORTS_SLUG_MAP[channelKey] || channelKey;

        try {
            let streamUrl = await resolveStreamUrl(slug);
            let upstreamRes = await fetch(streamUrl, {
                headers: { 'Referer': 'https://wideiptv.top/', 'User-Agent': UA },
                signal: AbortSignal.timeout(10000)
            });

            if (upstreamRes.status === 403) {
                streamUrl = await resolveStreamUrl(slug, true);
                upstreamRes = await fetch(streamUrl, {
                    headers: { 'Referer': 'https://wideiptv.top/', 'User-Agent': UA },
                    signal: AbortSignal.timeout(10000)
                });
            }

            if (!upstreamRes.ok) {
                res.writeHead(upstreamRes.status, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Upstream manifest error ' + upstreamRes.status);
                return;
            }

            let manifestText = await upstreamRes.text();
            let baseUrl = streamUrl;
            const serverHost = req.headers.host || ('localhost:' + PORT);
            const serverOrigin = 'http://' + serverHost;

            // Rewrite sub-playlist URLs
            const lines = manifestText.split('\n');
            const rewritten = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) {
                    rewritten.push(line);
                    continue;
                }
                try {
                    const abs = new URL(trimmed, baseUrl).href;
                    rewritten.push(serverOrigin + '/api/sports/stream/' + encodeURIComponent(channelKey) + '/sub-playlist.m3u8?url=' + encodeURIComponent(abs));
                } catch (e) {
                    rewritten.push(line);
                }
            }

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(rewritten.join('\n'));
            return;
        } catch (err) {
            console.error('[SportsProxy] Error resolving manifest for', channelKey, err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }

    // 2. SPORTS SUB-PLAYLIST
    const subMatch = reqPath.match(/^\/api\/sports\/stream\/([^\/]+)\/sub-playlist\.m3u8$/);
    if (subMatch) {
        const channelKey = subMatch[1];
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400);
            res.end('Missing url query param');
            return;
        }

        try {
            const upstreamRes = await fetch(targetUrl, {
                headers: { 'Referer': 'https://wideiptv.top/', 'User-Agent': UA },
                signal: AbortSignal.timeout(12000)
            });

            if (!upstreamRes.ok) {
                res.writeHead(upstreamRes.status);
                res.end('Upstream sub-playlist returned ' + upstreamRes.status);
                return;
            }

            const serverHost = req.headers.host || ('localhost:' + PORT);
            const serverOrigin = 'http://' + serverHost;
            const text = await upstreamRes.text();
            const lines = text.split('\n');
            const rewritten = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) {
                    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
                        const rwTag = trimmed.replace(/URI="([^"]+)"/g, (m, u) => {
                            try {
                                const absKey = new URL(u, targetUrl).href;
                                return 'URI="' + serverOrigin + '/api/sports/stream/' + encodeURIComponent(channelKey) + '/segment.ts?url=' + encodeURIComponent(absKey) + '"';
                            } catch (e) { return 'URI="' + u + '"'; }
                        });
                        rewritten.push(rwTag);
                        continue;
                    }
                    rewritten.push(line);
                    continue;
                }

                try {
                    const absSeg = new URL(trimmed, targetUrl).href;
                    rewritten.push(serverOrigin + '/api/sports/stream/' + encodeURIComponent(channelKey) + '/segment.ts?url=' + encodeURIComponent(absSeg));
                } catch (e) {
                    rewritten.push(line);
                }
            }

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(rewritten.join('\n'));
            return;
        } catch (err) {
            console.error('[SportsProxy] Sub-playlist error:', err.message);
            res.writeHead(502);
            res.end('Sub-playlist error');
            return;
        }
    }

    // 3. SPORTS TS SEGMENT
    const segMatch = reqPath.match(/^\/api\/sports\/stream\/([^\/]+)\/segment\.ts$/);
    if (segMatch) {
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400);
            res.end('Missing url parameter');
            return;
        }

        try {
            const upstreamRes = await fetch(targetUrl, {
                headers: { 'Referer': 'https://wideiptv.top/', 'User-Agent': UA },
                signal: AbortSignal.timeout(25000)
            });

            if (!upstreamRes.ok) {
                res.writeHead(upstreamRes.status);
                res.end();
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'video/mp2t',
                'Cache-Control': 'public, max-age=86400, immutable',
                'Access-Control-Allow-Origin': '*'
            });

            const arrayBuf = await upstreamRes.arrayBuffer();
            res.end(Buffer.from(arrayBuf));
            return;
        } catch (err) {
            console.error('[SportsProxy] Segment error:', err.message);
            res.writeHead(502);
            res.end();
            return;
        }
    }

    // 4. API REVERSE PROXY (Forward /api/* to local backend on port 3001)
    if (reqPath.startsWith('/api/')) {
        const targetBackend = 'http://localhost:3001' + req.url;
        const bodyBuffers = [];
        req.on('data', chunk => bodyBuffers.push(chunk));
        req.on('end', async () => {
            const reqBody = bodyBuffers.length > 0 ? Buffer.concat(bodyBuffers) : undefined;
            try {
                const fetchHeaders = {};
                for (const [k, v] of Object.entries(req.headers)) {
                    if (k.toLowerCase() !== 'host') fetchHeaders[k] = v;
                }
                const proxyRes = await fetch(targetBackend, {
                    method: req.method,
                    headers: fetchHeaders,
                    body: (req.method !== 'GET' && req.method !== 'HEAD') ? reqBody : undefined,
                });

                const resHeaders = {};
                proxyRes.headers.forEach((val, key) => { resHeaders[key] = val; });
                res.writeHead(proxyRes.status, resHeaders);
                const buf = await proxyRes.arrayBuffer();
                res.end(Buffer.from(buf));
            } catch (e) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'backend_proxy_failed', message: e.message }));
            }
        });
        return;
    }

    // STATIC FILE SERVING
    let servePath = reqPath;
    if (servePath === '/' || servePath === '') servePath = '/index.html';

    const filePath = path.join(PUBLIC_DIR, servePath);
    const ext = path.extname(filePath).toLowerCase();

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mime,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[NexusNight TV] Live at http://localhost:${PORT}`);
});
