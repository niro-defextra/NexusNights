/**
 * NexusNight Ultra-Clean Sports Live Stream Resolver & Proxy
 * 
 * Provides direct, 100% ad-free, popup-free HLS streaming for beIN Sports MENA
 * channels. Resolves high-bitrate tokenized streams and proxies manifests and
 * video segments with required upstream Referer/Origin headers to completely
 * eliminate CORS errors and third-party ad injection.
 */

import { Router, type Request, type Response } from 'express';

interface CachedStream {
  streamUrl: string;
  token: string;
  channelSlug: string;
  expiresAt: number;
  inflight?: Promise<string>;
}

const STREAM_URL_RE = /streamUrl:\s*"((?:\\\/|[^"])+)"/;
const TOKEN_RE = /currentToken:\s*"([^"]+)"/;
const EXPIRES_IN_RE = /tokenExpiresIn:\s*(\d+)/;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Canonical channel slug dictionary
export const SPORTS_CHANNEL_MAP: Record<string, string> = {
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
  'bein-fr-1': 'BEINSPORT1FR',
  'bein-fr-2': 'BEINSPORT2FR',
  'bein-fr-3': 'BEINSPORT3FR',
  'bein-afc-1': 'beINAR',
  'bein-afc-2': 'beINAR2',
  'bein-xtra-1': 'beINARNews',
  'bein-max-1': 'beINAR',
  'bein-en-1': 'beINAR',
  'sky-pl': 'SkySportsPremierLeague',
  'sky-main': 'SkySportsMainEvent',
  // Direct slugs fallback
  'beinar': 'beINAR',
  'beinar2': 'beINAR2',
  'beinar3': 'beINAR3',
  'beinar4': 'beINAR4',
  'beinar5': 'beINAR5',
  'beinar6': 'beINAR6',
  'beinar7': 'beINAR7',
  'beinar8': 'beINAR8',
  'beinar9': 'beINAR9',
  'beinarnews': 'beINARNews',
};

class SportsResolver {
  private cache = new Map<string, CachedStream>();

  /**
   * Resolves canonical slug for a given channel key
   */
  getChannelSlug(channelKey: string): string | null {
    const key = channelKey.toLowerCase().trim();
    if (SPORTS_CHANNEL_MAP[key]) return SPORTS_CHANNEL_MAP[key];
    // Check by daddy ID mapping
    const idMap: Record<string, string> = {
      '91': 'beINAR',
      '92': 'beINAR2',
      '93': 'beINAR3',
      '94': 'beINAR4',
      '95': 'beINAR5',
      '96': 'beINAR6',
      '97': 'beINAR7',
      '98': 'beINAR8',
      '99': 'beINAR9',
      '100': 'beINARNews',
      '116': 'BEINSPORT1FR',
      '117': 'BEINSPORT2FR',
      '118': 'BEINSPORT3FR',
      '597': 'beINAR',
      '61': 'beINAR',
    };
    return idMap[key] || null;
  }

  /**
   * Resolves tokenized direct HLS stream URL for a given channel
   */
  async resolveStream(channelSlug: string, forceFresh = false): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(channelSlug);

    if (!forceFresh && cached && now < cached.expiresAt - 20000) {
      return cached.streamUrl;
    }

    if (cached?.inflight) {
      return cached.inflight;
    }

    const fetchPromise = this.doResolve(channelSlug);
    if (cached) cached.inflight = fetchPromise;

    try {
      const streamUrl = await fetchPromise;
      return streamUrl;
    } finally {
      if (cached) cached.inflight = undefined;
    }
  }

  private async doResolve(channelSlug: string): Promise<string> {
    console.log(`[SportsResolver] Resolving clean stream for slug: ${channelSlug}`);
    const playerUrl = `https://wideiptv.top/player/${channelSlug}`;
    const res = await fetch(playerUrl, {
      headers: {
        'Referer': `https://wideiptv.top/daddy.php?stream=${channelSlug}`,
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Failed to load upstream player for ${channelSlug} (HTTP ${res.status})`);
    }

    const html = await res.text();
    const streamMatch = html.match(STREAM_URL_RE);
    if (!streamMatch) {
      throw new Error(`No stream URL found in upstream player for ${channelSlug}`);
    }

    const streamUrl = streamMatch[1].replace(/\\\//g, '/');
    const tokenMatch = html.match(TOKEN_RE);
    const token = tokenMatch ? tokenMatch[1] : '';
    const expiresInMatch = html.match(EXPIRES_IN_RE);
    const ttlSeconds = expiresInMatch ? parseInt(expiresInMatch[1], 10) : 300;

    const expiresAt = Date.now() + Math.max(30, ttlSeconds) * 1000;

    this.cache.set(channelSlug, {
      streamUrl,
      token,
      channelSlug,
      expiresAt,
    });

    console.log(`[SportsResolver] Successfully resolved ${channelSlug} (expires in ${ttlSeconds}s)`);
    return streamUrl;
  }

  /**
   * Invalidate cached token
   */
  invalidate(channelSlug: string) {
    this.cache.delete(channelSlug);
  }
}

export const sportsResolver = new SportsResolver();

/**
 * Sports Stream Proxy Router
 * Mounted at /api/sports
 */
export const sportsRouter = Router();

/**
 * GET /api/sports/stream/:channelKey/manifest.m3u8
 * Serves and rewrites the master HLS manifest
 */
sportsRouter.get('/stream/:channelKey/manifest.m3u8', async (req: Request, res: Response) => {
  const { channelKey } = req.params;
  const slug = sportsResolver.getChannelSlug(channelKey);

  if (!slug) {
    return res.status(404).send(`Unknown sports channel key: ${channelKey}`);
  }

  try {
    let streamUrl = await sportsResolver.resolveStream(slug);
    let upstreamRes = await fetch(streamUrl, {
      headers: {
        'Referer': 'https://wideiptv.top/',
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(10000),
    });

    // If upstream token expired, retry once with force fresh resolution
    if (upstreamRes.status === 403) {
      console.warn(`[SportsProxy] Upstream 403 for ${slug}, re-resolving fresh token...`);
      streamUrl = await sportsResolver.resolveStream(slug, true);
      upstreamRes = await fetch(streamUrl, {
        headers: {
          'Referer': 'https://wideiptv.top/',
          'User-Agent': UA,
        },
        signal: AbortSignal.timeout(10000),
      });
    }

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream manifest failed (HTTP ${upstreamRes.status})`);
    }

    let manifestText = await upstreamRes.text();
    let baseUrl = streamUrl;

    // Detect degraded audio-only stream upstream (missing video codecs or resolution)
    const hasVideo =
      manifestText.includes('RESOLUTION=') ||
      manifestText.includes('avc1') ||
      manifestText.includes('hvc1') ||
      manifestText.includes('tracks-v');

    if (!hasVideo && (slug === 'beINAR' || channelKey.toLowerCase().includes('bein-1'))) {
      console.warn(`[SportsProxy] Stream ${slug} is degraded upstream (audio-only / no video). Automatically failing over to high-definition feed (BEINSPORT1FR)...`);
      try {
        const fallbackStreamUrl = await sportsResolver.resolveStream('BEINSPORT1FR');
        const fallbackRes = await fetch(fallbackStreamUrl, {
          headers: {
            'Referer': 'https://wideiptv.top/',
            'User-Agent': UA,
          },
          signal: AbortSignal.timeout(10000),
        });
        if (fallbackRes.ok) {
          const fallbackText = await fallbackRes.text();
          if (
            fallbackText.includes('RESOLUTION=') ||
            fallbackText.includes('avc1') ||
            fallbackText.includes('tracks-v')
          ) {
            manifestText = fallbackText;
            baseUrl = fallbackStreamUrl;
          }
        }
      } catch (fbErr: any) {
        console.warn(`[SportsProxy] Fallback resolution failed for ${slug}:`, fbErr.message);
      }
    }

    // Rewrite sub-playlist URLs to fully-qualified absolute URLs for TV and AVPlay players
    const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'nexusunights.tech';
    const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;

    const lines = manifestText.split('\n');
    const rewrittenLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }

      try {
        const absoluteUrl = new URL(trimmed, baseUrl).href;
        const proxiedSubUrl = `${serverOrigin}/api/sports/stream/${encodeURIComponent(channelKey)}/sub-playlist.m3u8?url=${encodeURIComponent(absoluteUrl)}`;
        rewrittenLines.push(proxiedSubUrl);
      } catch {
        rewrittenLines.push(line);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewrittenLines.join('\n'));
  } catch (err: any) {
    console.error(`[SportsProxy] Manifest error for ${slug}:`, err.message);
    res.status(502).send(`Failed to resolve sports stream: ${err.message}`);
  }
});

/**
 * GET /api/sports/stream/:channelKey/sub-playlist.m3u8?url=...
 * Serves and rewrites sub-playlists with TS video segments
 */
sportsRouter.get('/stream/:channelKey/sub-playlist.m3u8', async (req: Request, res: Response) => {
  const { channelKey } = req.params;
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://wideiptv.top/',
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Upstream sub-playlist returned ${upstreamRes.status}`);
    }

    const hostHeader = req.get('x-forwarded-host') || req.get('host') || 'nexusunights.tech';
    const protoHeader = req.get('x-forwarded-proto') || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;

    const playlistText = await upstreamRes.text();
    const lines = playlistText.split('\n');
    const rewrittenLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        // Rewrite URI in tags if any (e.g. key)
        if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
          const rewrittenTag = trimmed.replace(/URI="([^"]+)"/g, (_match, uri) => {
            try {
              const absKeyUrl = new URL(uri, targetUrl).href;
              return `URI="${serverOrigin}/api/sports/stream/${encodeURIComponent(channelKey)}/segment.ts?url=${encodeURIComponent(absKeyUrl)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
          rewrittenLines.push(rewrittenTag);
          continue;
        }
        rewrittenLines.push(line);
        continue;
      }

      try {
        const absoluteSegUrl = new URL(trimmed, targetUrl).href;
        const proxiedSegUrl = `${serverOrigin}/api/sports/stream/${encodeURIComponent(channelKey)}/segment.ts?url=${encodeURIComponent(absoluteSegUrl)}`;
        rewrittenLines.push(proxiedSegUrl);
      } catch {
        rewrittenLines.push(line);
      }
    }

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rewrittenLines.join('\n'));
  } catch (err: any) {
    console.error(`[SportsProxy] Sub-playlist error:`, err.message);
    res.status(502).send('Failed to fetch sub-playlist');
  }
});

/**
 * GET /api/sports/stream/:channelKey/segment.ts?url=...
 * Streams binary video/audio transport stream segments directly
 */
sportsRouter.get('/stream/:channelKey/segment.ts', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Referer': 'https://wideiptv.top/',
        'User-Agent': UA,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Segment error ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'video/MP2T';
    const contentLength = upstreamRes.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (!upstreamRes.body) {
      return res.end();
    }

    // Direct stream piping without buffering
    const reader = upstreamRes.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (pipeErr) {
        res.destroy();
      }
    };
    void pump();
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).send('Failed to fetch segment');
    }
  }
});

/**
 * GET /api/sports/status
 * Channel readiness health check
 */
sportsRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    channels: Object.keys(SPORTS_CHANNEL_MAP),
    engine: 'wideiptv-hls-native',
  });
});
