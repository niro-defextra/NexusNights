/**
 * HLS Stream Proxy
 * Proxies HLS manifests (.m3u8) and video segments (.ts / .m4s / .key)
 * with the required Referer and Origin headers to bypass CORS and hotlinking blocks.
 *
 * Auto re-resolve: when the upstream playlist returns 403/410 (token expired),
 * the proxy evicts the cache entry and kicks off a new browser resolution.
 */

import express, { type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import { streamResolver, type ResolvedStream } from './stream-resolver';
import { trailerSniffer } from './trailer-sniffer';
import { getSegment, setSegment, SEGMENT_CACHE_MAX_ITEM_BYTES } from './segment-cache';

export const streamProxyRouter = express.Router();

export function isDiscordRequest(req: Request): boolean {
  if (req.query.discord === '1') return true;
  const referer = req.get('referer') || '';
  const origin = req.get('origin') || '';
  const xForwardedHost = req.get('x-forwarded-host') || '';
  const xForwardedUri = (req.headers['x-forwarded-uri'] as string) || '';
  const originalUrl = req.originalUrl || req.url || '';

  return (
    originalUrl.startsWith('/.proxy/') ||
    xForwardedUri.startsWith('/.proxy/') ||
    referer.includes('discordsays.com') ||
    origin.includes('discordsays.com') ||
    xForwardedHost.includes('discordsays.com')
  );
}

function rewriteManifest(manifestText: string, baseUrl: string, streamId: string, serverOrigin = '', isDiscord = false): string {
  const lines = manifestText.split('\n');
  const rewrittenLines: string[] = [];
  const prefix = isDiscord
    ? '/.proxy/api/stream-proxy/segment'
    : (serverOrigin ? `${serverOrigin}/api/stream-proxy/segment` : '/api/stream-proxy/segment');
  const discordQuery = isDiscord ? '&discord=1' : '';

  for (let line of lines) {
    const trimmed = line.trim();

    // Handle URI attributes in tags like #EXT-X-KEY or #EXT-X-MEDIA
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
        try {
          const absoluteUrl = new URL(uri, baseUrl).href;
          const proxiedUrl = `${prefix}?id=${streamId}&url=${encodeURIComponent(absoluteUrl)}${discordQuery}`;
          return `URI="${proxiedUrl}"`;
        } catch {
          return `URI="${uri}"`;
        }
      });
      rewrittenLines.push(rewrittenTag);
      continue;
    }

    // Ignore comments or empty lines
    if (trimmed.startsWith('#') || trimmed.length === 0) {
      rewrittenLines.push(line);
      continue;
    }

    // Rewrite media segment or sub-playlist URL
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).href;
      const proxiedUrl = `${prefix}?id=${streamId}&url=${encodeURIComponent(absoluteUrl)}${discordQuery}`;
      rewrittenLines.push(proxiedUrl);
    } catch {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

/** Returns headers needed to pass hotlink / CORS protection */
function proxyHeaders(stream: ResolvedStream): Record<string, string> {
  const safeHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(stream.headers || {})) {
    const lk = k.toLowerCase();
    if (!['host', 'connection', 'content-length', 'accept-encoding'].includes(lk)) {
      safeHeaders[k] = v;
    }
  }

  let referer = stream.headers['referer'];
  if (!referer && stream.playlistUrl) {
    try {
      referer = new URL(stream.playlistUrl).origin + '/';
    } catch {}
  }
  referer = referer || 'https://vixsrc.to/';

  let origin = stream.headers['origin'];
  if (!origin && referer) {
    try {
      origin = new URL(referer).origin;
    } catch {}
  }
  origin = origin || 'https://vixsrc.to';

  return {
    ...safeHeaders,
    'User-Agent': stream.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': referer,
    'Origin': origin,
  };
}

/** True when the upstream status indicates an expired / revoked token */
function isTokenExpired(status: number): boolean {
  return status === 403 || status === 401 || status === 410 || status === 400;
}

// Micro-cache for master playlists (3 seconds) to handle concurrent watchers in Discord watch parties
const masterPlaylistCache = new Map<string, { text: string; expiresAt: number }>();

export function clearStreamProxyCache(): void {
  masterPlaylistCache.clear();
}

/**
 * GET /api/stream-proxy/master/:id.m3u8
 * Fetches and rewrites the master playlist.
 * On token expiry (403/401/410), kicks off a background re-resolution and
 * returns a 302 redirect to the new master playlist once it's ready.
 */
streamProxyRouter.get('/master/:id.m3u8', async (req: Request, res: Response) => {
  const { id } = req.params;
  const isDiscord = isDiscordRequest(req);
  const cacheKey = `${id}:${isDiscord ? 'discord' : 'normal'}`;

  // Check micro-cache first
  const cached = masterPlaylistCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(cached.text);
    return;
  }
  const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'nexusunights.tech';
  const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
  const serverOrigin = `${protoHeader}://${hostHeader}`;
  let stream = streamResolver.getById(id);

  if (!stream && id.startsWith('trailer-')) {
    const key = id.replace('trailer-', '');
    await trailerSniffer.sniffTrailer(key);
    stream = streamResolver.getById(id);
  }

  if (!stream) {
    // Stream ID unknown — maybe server restarted; nothing we can do
    res.status(404).send('Stream session expired or not found. Reload the page.');
    return;
  }

  try {
    const upstream = await fetch(stream.playlistUrl, {
      headers: proxyHeaders(stream),
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      if (isTokenExpired(upstream.status)) {
        console.log(`[StreamProxy] Token expired (${upstream.status}) for stream ${id}. Re-resolving…`);
        try {
          const freshStream = await streamResolver.reResolveById(id);
          if (freshStream && freshStream.id !== id) {
            // Redirect to the new stream master
            const redirectUrl = isDiscord 
              ? `/.proxy/api/stream-proxy/master/${freshStream.id}.m3u8?discord=1`
              : `/api/stream-proxy/master/${freshStream.id}.m3u8`;
            res.redirect(302, redirectUrl);
          } else if (freshStream) {
            // Same ID but refreshed — serve immediately
            const freshUpstream = await fetch(freshStream.playlistUrl, {
              headers: proxyHeaders(freshStream),
              signal: AbortSignal.timeout(10000),
            });
            if (!freshUpstream.ok) {
              res.status(502).send(`Re-resolve upstream error: ${freshUpstream.statusText}`);
              return;
            }
            const manifestText = await freshUpstream.text();
            const rewritten = rewriteManifest(manifestText, freshStream.playlistUrl, freshStream.id, serverOrigin, isDiscord);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(rewritten);
          } else {
            res.status(502).send('Stream token expired and re-resolution failed.');
          }
        } catch (reErr: any) {
          console.error(`[StreamProxy] Re-resolve failed: ${reErr.message}`);
          res.status(502).send(`Stream token expired and re-resolution failed: ${reErr.message}`);
        }
        return;
      }
      res.status(upstream.status).send(`Upstream playlist error: ${upstream.statusText}`);
      return;
    }

    const manifestText = await upstream.text();
    if (!manifestText.includes('#EXTM3U')) {
      console.warn(`[StreamProxy] Upstream response for stream ${id} is not an M3U8 manifest. Content preview: ${manifestText.slice(0, 150)}`);
      try {
        const freshStream = await streamResolver.reResolveById(id);
        if (freshStream) {
          const freshUpstream = await fetch(freshStream.playlistUrl, {
            headers: proxyHeaders(freshStream),
            signal: AbortSignal.timeout(10000),
          });
          const freshText = await freshUpstream.text();
          if (freshText.includes('#EXTM3U')) {
            const rewritten = rewriteManifest(freshText, freshStream.playlistUrl, freshStream.id, serverOrigin, isDiscord);
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(rewritten);
            return;
          }
        }
      } catch (reErr: any) {
        console.error(`[StreamProxy] Re-resolve failed: ${reErr.message}`);
      }
      res.status(502).send('Upstream playlist returned invalid content or error page.');
      return;
    }
    const rewritten = rewriteManifest(manifestText, stream.playlistUrl, stream.id, serverOrigin, isDiscord);
    masterPlaylistCache.set(cacheKey, { text: rewritten, expiresAt: Date.now() + 3000 });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewritten);
  } catch (err: any) {
    console.error(`[StreamProxy] Error serving master playlist ${id}:`, err.message);
    res.status(502).send(`Gateway Error: ${err.message}`);
  }
});

/**
 * GET /api/stream-proxy/segment
 * Proxies sub-playlists, video segments (.ts/.m4s), and encryption keys.
 * On token expiry, returns 410 so HLS.js triggers a manifest reload from the master.
 */
streamProxyRouter.get('/segment', async (req: Request, res: Response) => {
  const { id, url } = req.query as { id?: string; url?: string };

  if (!id || !url) {
    res.status(400).send('Missing id or url parameter');
    return;
  }

  let stream = streamResolver.getById(id);
  if (!stream && id.startsWith('trailer-')) {
    const key = id.replace('trailer-', '');
    await trailerSniffer.sniffTrailer(key);
    stream = streamResolver.getById(id);
  }

  if (!stream) {
    res.status(404).send('Stream session expired or not found');
    return;
  }

  const cacheKey = `${id}:${url}`;

  try {
    const cached = req.headers.range ? undefined : getSegment(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Length', String(cached.body.length));
      res.send(cached.body);
      return;
    }

    const headers: Record<string, string> = {
      ...proxyHeaders(stream),
    };

    // Forward Range header if requested (e.g. for seeking or partial byte fetching)
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    const upstream = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(25000),
    });

    if (!upstream.ok && upstream.status !== 206) {
      if (isTokenExpired(upstream.status)) {
        // Evict expired stream from resolver cache so next playback or reload gets a fresh token
        console.log(`[StreamProxy] Segment token expired (${upstream.status}) for stream ${id}. Evicting from cache.`);
        masterPlaylistCache.delete(id);
        streamResolver.evict(id);
        res.status(410).send('Segment token expired');
        return;
      }
      res.status(upstream.status).send(`Upstream segment error: ${upstream.statusText}`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

    // Check if upstream returned another playlist (e.g. sub-variant playlist)
    const isSegment =
      url.includes('.ts') ||
      url.includes('.m4s') ||
      url.includes('file=seg.ts') ||
      contentType.includes('video/') ||
      contentType.includes('audio/mp4');

    const isPlaylist =
      !isSegment &&
      (contentType.includes('application/vnd.apple.mpegurl') ||
        contentType.includes('application/x-mpegurl') ||
        contentType.includes('audio/x-mpegurl') ||
        url.includes('.m3u8') ||
        url.includes('type=video') ||
        url.includes('type=audio'));

    if (isPlaylist) {
      try {
        const manifestText = await upstream.text();
        // If it has #EXTM3U, rewrite it
        if (manifestText.includes('#EXTM3U')) {
          const isDiscord = isDiscordRequest(req);
          const hostHeader = req.get('x-forwarded-host') || req.get('host');
          const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
          const serverOrigin = hostHeader ? `${protoHeader}://${hostHeader}` : '';
          const rewritten = rewriteManifest(manifestText, url, stream.id, serverOrigin, isDiscord);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache');
          res.send(rewritten);
          return;
        }
      } catch {
        // If text reading fails, fall through to binary streaming
      }
    }

    // Forward content headers immediately for low Time-To-First-Byte (TTFB)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const contentLength = upstream.headers.get('content-length');
    const length = contentLength ? Number(contentLength) : 0;
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.status(206);
      res.setHeader('Content-Range', contentRange);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    // Stream binary video segments directly to the response with backpressure.
    // Simultaneously buffer chunks to populate the in-memory LRU cache so subsequent requests/rewinds hit RAM.
    const canBuffer = !req.headers.range && (!length || length <= SEGMENT_CACHE_MAX_ITEM_BYTES);
    const nodeStream = Readable.fromWeb(upstream.body as any);
    const chunks: Buffer[] = [];
    let collectedBytes = 0;

    nodeStream.on('data', (chunk: Buffer) => {
      if (canBuffer && collectedBytes + chunk.length <= SEGMENT_CACHE_MAX_ITEM_BYTES) {
        chunks.push(chunk);
        collectedBytes += chunk.length;
      }
    });

    nodeStream.on('end', () => {
      if (canBuffer && chunks.length > 0 && collectedBytes <= SEGMENT_CACHE_MAX_ITEM_BYTES) {
        try {
          const body = Buffer.concat(chunks);
          setSegment(cacheKey, body, contentType);
        } catch {}
      }
    });

    nodeStream.on('error', () => {
      if (!res.writableEnded) res.end();
    });

    nodeStream.pipe(res);

    req.on('close', () => {
      nodeStream.destroy();
    });
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).send(`Gateway Error: ${err.message}`);
    }
  }
});
