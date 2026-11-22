/**
 * Provider Stream Proxy
 * Proxies HLS streams from providers (e.g., Dizibal) with required headers to bypass CORS.
 */

import express, { type Request, type Response } from 'express';
import { Readable } from 'node:stream';
import type { ProviderSource } from './types';
import { getSegment, setSegment, SEGMENT_CACHE_MAX_ITEM_BYTES } from './segment-cache';

export const providerStreamProxyRouter = express.Router();

interface StoredProviderStream {
  source: ProviderSource;
  timestamp: number;
}

// Simple in-memory registry for provider streams (keyed by source.id)
const providerStreams = new Map<string, StoredProviderStream>();

// Cleanup old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  for (const [id, stored] of providerStreams.entries()) {
    if (now - stored.timestamp > maxAge) {
      providerStreams.delete(id);
    }
  }
}, 30 * 60 * 1000);

/**
 * Register a provider source for proxying
 */
export function registerProviderStream(source: ProviderSource): void {
  if (source.type === 'hls' && source.headers) {
    providerStreams.set(source.id, {
      source,
      timestamp: Date.now(),
    });
  }
}

/**
 * Get provider source by ID
 */
export function getProviderStream(id: string): ProviderSource | null {
  const stored = providerStreams.get(id);
  return stored ? stored.source : null;
}

/**
 * Check if a URL is likely an HLS playlist (not a binary segment).
 */
function isPlaylistUrl(url: string): boolean {
  return url.includes('.m3u8') || /stream\.php\b/.test(url);
}

/**
 * Rewrite HLS manifest:
 * - Playlists and keys → always proxy (they need server-side CORS + rewriting)
 * - Video/audio segments → always proxy as well. The Dizibal CDN sends
 *   Access-Control-Allow-Origin: * but rejects requests carrying our page Origin
 *   with 403, so a browser-side direct fetch never works. The proxy sets the
 *   provider's own Referer/Origin and makes 720p playback reliable.
 */
function rewriteManifest(manifestText: string, baseUrl: string, sourceId: string, serverOrigin = ''): string {
  const lines = manifestText.split('\n');
  const rewrittenLines: string[] = [];
  const prefix = serverOrigin ? `${serverOrigin}/api/provider-stream-proxy/segment` : '/api/provider-stream-proxy/segment';

  for (let line of lines) {
    const trimmed = line.trim();

    // Handle URI attributes in tags like #EXT-X-KEY, #EXT-X-MEDIA
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
        try {
          const absoluteUrl = new URL(uri, baseUrl).href;
          // URI in tags are always playlists or keys → always proxy
          const proxiedUrl = `${prefix}?id=${sourceId}&url=${encodeURIComponent(absoluteUrl)}`;
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

    // Non-comment lines: sub-playlists or media segments
    try {
      const absoluteUrl = new URL(trimmed, baseUrl).href;
      const proxiedUrl = `${prefix}?id=${sourceId}&url=${encodeURIComponent(absoluteUrl)}`;
      rewrittenLines.push(proxiedUrl);
    } catch {
      rewrittenLines.push(line);
    }
  }

  return rewrittenLines.join('\n');
}

/**
 * GET /api/provider-stream-proxy/master/:id.m3u8
 * Fetches and rewrites the master/media playlist
 */
providerStreamProxyRouter.get('/master/:id.m3u8', async (req: Request, res: Response) => {
  const { id } = req.params;
  const source = getProviderStream(id);

  if (!source) {
    console.warn(`[ProviderStreamProxy] Stream ${id} not found or expired`);
    res.status(404).send('Provider stream not found or expired');
    return;
  }

  console.log(`[ProviderStreamProxy] Fetching master playlist from: ${source.url.substring(0, 100)}...`);

  try {
    const upstream = await fetch(source.url, {
      headers: source.headers || {},
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      console.error(`[ProviderStreamProxy] Upstream error ${upstream.status} for ${source.url.substring(0, 100)}`);
      res.status(502).send(`Upstream server returned ${upstream.status}`);
      return;
    }

    const manifestText = await upstream.text();
    if (!manifestText.includes('#EXTM3U')) {
      console.error(`[ProviderStreamProxy] Upstream did not return M3U8 for ${id}. Preview: ${manifestText.slice(0, 150)}`);
      res.status(502).send('Upstream server returned invalid playlist');
      return;
    }
    console.log(`[ProviderStreamProxy] Master playlist fetched: ${manifestText.length} bytes`);
    
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'nexusunights.tech';
    const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;
    const baseUrl = source.url;
    const rewritten = rewriteManifest(manifestText, baseUrl, id, serverOrigin);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(rewritten);
    
    console.log(`[ProviderStreamProxy] Master playlist sent successfully`);
  } catch (error: any) {
    console.error('[ProviderStreamProxy] Master fetch error:', error.message);
    res.status(502).send('Failed to fetch upstream playlist');
  }
});

/**
 * GET /api/provider-stream-proxy/segment?id=...&url=...
 * Proxies video segments, sub-playlists, and encryption keys
 */
providerStreamProxyRouter.get('/segment', async (req: Request, res: Response) => {
  const { id, url } = req.query as { id?: string; url?: string };

  if (!id || !url) {
    res.status(400).send('Missing id or url');
    return;
  }

  const source = getProviderStream(id);
  if (!source) {
    console.warn(`[ProviderStreamProxy] Stream ${id} not found or expired`);
    res.status(404).send('Provider stream not found');
    return;
  }

  const cacheKey = `${id}:${url}`;
  try {
    const cachedSegment = req.headers.range ? undefined : getSegment(cacheKey);
    if (cachedSegment) {
      res.setHeader('Content-Type', cachedSegment.contentType || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
      res.setHeader('Content-Length', String(cachedSegment.body.length));
      res.send(cachedSegment.body);
      return;
    }

    const upstream = await fetch(url, {
      headers: source.headers || {},
      signal: AbortSignal.timeout(30000),
    });

    if (!upstream.ok) {
      console.error(`[ProviderStreamProxy] Segment error ${upstream.status} for ${url.substring(0, 100)}`);
      res.status(upstream.status).send(`Upstream error ${upstream.status}`);
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';

    // Detect sub-playlists: check content-type, extension, AND stream.php pattern (Dizibal)
    const isSegment =
      url.includes('.ts') ||
      url.includes('.m4s') ||
      url.includes('file=seg.ts') ||
      contentType.includes('video/') ||
      contentType.includes('audio/mp4');

    const looksLikePlaylist =
      !isSegment &&
      (contentType.includes('mpegurl') ||
        url.includes('.m3u8') ||
        isPlaylistUrl(url));

    if (looksLikePlaylist) {
      const manifestText = await upstream.text();

      // Verify it's actually an HLS playlist (stream.php may return different content types)
      if (manifestText.includes('#EXTM3U')) {
        const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'nexusunights.tech';
        const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
        const serverOrigin = `${protoHeader}://${hostHeader}`;
        const baseUrl = url;
        const rewritten = rewriteManifest(manifestText, baseUrl, id, serverOrigin);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(rewritten);
        return;
      }

      // Not a playlist after all — send as-is
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(manifestText);
      return;
    }

    // Forward content headers immediately for low Time-To-First-Byte (TTFB)
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600, immutable');

    const contentLength = upstream.headers.get('content-length');
    const length = contentLength ? Number(contentLength) : 0;
    if (contentLength) res.setHeader('Content-Length', contentLength);

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
          setSegment(cacheKey, body, contentType || 'application/octet-stream');
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
  } catch (error: any) {
    if (!res.headersSent) {
      console.error(`[ProviderStreamProxy] Segment fetch error for ${url.substring(0, 100)}:`, error.message);
      res.status(502).send('Failed to fetch segment');
    }
  }
});
