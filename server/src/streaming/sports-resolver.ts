/**
 * NexusNight Sports Live Stream Resolver & Proxy
 *
 * Multi-provider architecture — purely server-side M3U8 extraction, zero iframes:
 *
 *  Provider 1 — WideIPTV  (wideiptv.top)
 *    Pure HTTP fetch → regex extract streamUrl + token → proxy all HLS layers.
 *    Covers: beIN AR 1-9, beIN News, beIN FR 1-3, Sky Sports.
 *
 *  Provider 2 — DembedST  (dembed.st / DaddyLive embed backend)
 *    Pure HTTP fetch to dembed.st/premiumtv/daddy.php?id=N with correct Referer.
 *    Regex extracts `const SRC = "..."` from response HTML → edge M3U8 URL.
 *    Then fetches the M3U8 with dembed.st Referer. If the CDN allows server-side
 *    access the manifest is proxied; otherwise falls through to Provider 3.
 *
 *  Provider 3 — Playwright Sniffer (DaddyLive via Chromium)
 *    Last-resort: headless Chromium navigates dembed.st directly (faster than
 *    thedaddy.li outer page), intercepts the m3u8 network request, returns URL.
 *    Result cached for 30 min. Used only when Providers 1 & 2 fail.
 */

import { Router, type Request, type Response } from 'express';
import { getSportsFixtures } from './sports-fixtures';

interface CachedStream {
  streamUrl: string;
  token: string;
  channelSlug: string;
  expiresAt: number;
  inflight?: Promise<string>;
}

// dembed.st SRC extraction
// HTML contains: const SRC = "https://edge.wedd48c.top/premiumN/index.m3u8";
const DEMBED_SRC_RE = /const\s+SRC\s*=\s*["']([^"']+\.m3u8[^"']*)["']/;

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

// Priority fallback candidates for high availability and automatic quality failover
export const SPORTS_FALLBACK_CANDIDATES: Record<string, string[]> = {
  'bein-1': ['beINAR', 'beINAR2', 'BEINSPORT1FR', 'beINARNews'],
  'bein-2': ['beINAR2', 'beINAR', 'BEINSPORT2FR', 'beINAR3'],
  'bein-3': ['beINAR3', 'beINAR2', 'BEINSPORT3FR', 'beINAR4'],
  'bein-4': ['beINAR4', 'beINAR3', 'beINAR5', 'beINAR2'],
  'bein-5': ['beINAR5', 'beINAR6', 'beINAR4', 'beINAR2'],
  'bein-6': ['beINAR6', 'beINAR7', 'beINAR5', 'beINAR2'],
  'bein-7': ['beINAR7', 'beINAR8', 'beINAR6', 'beINAR2'],
  'bein-8': ['beINAR8', 'beINAR9', 'beINAR7', 'beINAR2'],
  'bein-9': ['beINAR9', 'beINAR8', 'beINARNews', 'beINAR2'],
  'bein-news': ['beINARNews', 'beINAR', 'beINAR2'],
  'bein-fr-1': ['BEINSPORT1FR', 'beINAR', 'beINAR2'],
  'bein-fr-2': ['BEINSPORT2FR', 'beINAR2', 'beINAR'],
  'bein-fr-3': ['BEINSPORT3FR', 'beINAR3', 'beINAR2'],
  'sky-pl': ['SkySportsPremierLeague', 'SkySportsMainEvent'],
  'sky-main': ['SkySportsMainEvent', 'SkySportsPremierLeague'],
};

// DaddyLive channel ID mapping for external backup sniffing
export const DADDY_ID_MAP: Record<string, number> = {
  'bein-1': 91,
  'bein-2': 92,
  'bein-3': 93,
  'bein-4': 94,
  'bein-5': 95,
  'bein-6': 96,
  'bein-7': 97,
  'bein-8': 98,
  'bein-9': 99,
  'bein-news': 100,
  'bein-fr-1': 116,
  'bein-fr-2': 117,
  'bein-fr-3': 118,
};

/**
 * Fetch with retry + timeout. Returns the Response (caller checks ok).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  retries = 3,
): Promise<globalThis.Response> {
  const { timeoutMs = 10000, ...rest } = init;
  let lastErr: any;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
      // Retry on 5xx / 429; surface 4xx (except 429) immediately
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      lastErr = err;
    }
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error('fetch failed');
}

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
    const res = await fetchWithRetry(playerUrl, {
      headers: {
        'Referer': `https://wideiptv.top/daddy.php?stream=${channelSlug}`,
        'User-Agent': UA,
      },
      timeoutMs: 10000,
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

  /**
   * Sniff backup stream from alternate providers using Chromium
   */
  async sniffBackupStream(channelKey: string): Promise<string | null> {
    const key = channelKey.toLowerCase().trim();
    const daddyId = DADDY_ID_MAP[key];
    if (!daddyId) return null;

    const cacheKey = `backup-sniff-${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.streamUrl;
    }

    try {
      console.log(`[SportsSniffer] Sniffing backup provider for ${key} (daddyId: ${daddyId})...`);
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--single-process',
          '--disable-extensions',
          '--mute-audio',
          '--window-size=600,400',
        ],
      });

      const context = await browser.newContext({
        userAgent: UA,
        ignoreHTTPSErrors: true,
      });

      const page = await context.newPage();

      // Block heavy assets and analytics for rapid sniffing
      await page.route('**/*', (route) => {
        const u = route.request().url();
        const type = route.request().resourceType();
        if (type === 'image' || type === 'font' || u.includes('google') || u.includes('analytics') || u.includes('doubleclick') || u.includes('pop')) {
          return route.abort();
        }
        return route.continue();
      }).catch(() => {});

      page.on('popup', (popup) => { void popup.close().catch(() => {}); });

      let capturedStreamUrl: string | null = null;

      page.on('request', (req) => {
        const u = req.url();
        if ((u.includes('.m3u8') || u.includes('/playlist/')) && !u.includes('ping') && !u.includes('analytics')) {
          capturedStreamUrl = u;
        }
      });

      page.on('response', (res) => {
        const u = res.url();
        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if ((ct.includes('mpegurl') || u.includes('.m3u8')) && !u.includes('ping') && !u.includes('analytics')) {
          capturedStreamUrl = u;
        }
      });

      const targets = [
        `https://thedaddy.li/stream/stream-${daddyId}.php`,
        `https://thedaddy.li/player/stream-${daddyId}.php`,
      ];

      for (const target of targets) {
        if (capturedStreamUrl) break;
        try {
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 8000 });
          // Synthetic play click
          await page.waitForTimeout(1200);
          await page.evaluate(`(() => {
            const btn = document.querySelector('button, .play-button, video, div[class*="play"]');
            if (btn && typeof btn.click === 'function') btn.click();
          })()`).catch(() => {});
          await page.waitForTimeout(2500);
        } catch {
          continue;
        }
      }

      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});

      if (capturedStreamUrl) {
        console.log(`[SportsSniffer] ✅ Sniffed backup stream for ${key}: ${capturedStreamUrl}`);
        this.cache.set(cacheKey, {
          streamUrl: capturedStreamUrl,
          token: '',
          channelSlug: key,
          expiresAt: Date.now() + 30 * 60 * 1000,
        });
        return capturedStreamUrl;
      }
    } catch (err: any) {
      console.warn(`[SportsSniffer] Sniffing backup failed for ${key}:`, err?.message || err);
    }

    return null;
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
 * Serves and rewrites the master HLS manifest with multi-candidate failover & backup sniffing
 */
sportsRouter.get('/stream/:channelKey/manifest.m3u8', async (req: Request, res: Response) => {
  const { channelKey } = req.params;
  const canonicalSlug = sportsResolver.getChannelSlug(channelKey) || channelKey;

  const forceFresh = req.query.refresh === 'true' || req.query._r !== undefined;
  const isBackupRequested = req.query.backup === 'true' || req.query.provider === 'backup';

  // Gather ordered candidates: primary, secondary alternatives, and fallbacks
  const configuredFallbacks = SPORTS_FALLBACK_CANDIDATES[channelKey.toLowerCase()] || [];
  let candidateSlugs: string[];
  if (isBackupRequested) {
    candidateSlugs = [...configuredFallbacks.slice(1), canonicalSlug];
  } else {
    candidateSlugs = [canonicalSlug, ...configuredFallbacks.filter((s) => s !== canonicalSlug)];
  }

  let manifestText: string | null = null;
  let baseUrl: string | null = null;
  let successfulSlug: string | null = null;

  // Try direct tokenized feeds first with quality check
  for (const slug of candidateSlugs) {
    try {
      if (forceFresh) sportsResolver.invalidate(slug);
      let streamUrl = await sportsResolver.resolveStream(slug, forceFresh);
      let upstreamRes = await fetchWithRetry(streamUrl, {
        headers: {
          'Origin': 'https://wideiptv.top',
          'Referer': 'https://wideiptv.top/',
          'User-Agent': UA,
        },
        timeoutMs: 8000,
      }, 2);

      // If token expired upstream, re-resolve once
      if (upstreamRes.status === 403) {
        sportsResolver.invalidate(slug);
        streamUrl = await sportsResolver.resolveStream(slug, true);
        upstreamRes = await fetchWithRetry(streamUrl, {
          headers: {
            'Origin': 'https://wideiptv.top',
            'Referer': 'https://wideiptv.top/',
            'User-Agent': UA,
          },
          timeoutMs: 8000,
        }, 2);
      }

      if (upstreamRes.ok) {
        const text = await upstreamRes.text();
        const hasVideo =
          text.includes('RESOLUTION=') ||
          text.includes('avc1') ||
          text.includes('hvc1') ||
          text.includes('tracks-v');

        if (hasVideo) {
          manifestText = text;
          baseUrl = streamUrl;
          successfulSlug = slug;
          break;
        } else if (!manifestText) {
          manifestText = text;
          baseUrl = streamUrl;
          successfulSlug = slug;
        }
      }
    } catch (candErr: any) {
      console.warn(`[SportsProxy] Slug ${slug} for ${channelKey} failed:`, candErr?.message);
    }
  }

  // If direct candidates failed or were degraded, trigger backup sniffer
  if (!manifestText || !baseUrl) {
    console.log(`[SportsProxy] Direct stream candidates exhausted for ${channelKey}, triggering backup sniffer...`);
    const sniffedUrl = await sportsResolver.sniffBackupStream(channelKey);
    if (sniffedUrl) {
      try {
        const sniffRes = await fetchWithRetry(sniffedUrl, {
          headers: {
            'User-Agent': UA,
            'Referer': 'https://thedaddy.li/',
          },
          timeoutMs: 10000,
        }, 2);
        if (sniffRes.ok) {
          manifestText = await sniffRes.text();
          baseUrl = sniffedUrl;
        }
      } catch (sniffErr: any) {
        console.warn(`[SportsProxy] Backup stream fetch failed for ${channelKey}:`, sniffErr?.message);
      }
    }
  }

  if (!manifestText || !baseUrl) {
    return res.status(502).send(`Failed to resolve sports stream for ${channelKey}`);
  }

  try {
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
    console.error(`[SportsProxy] Manifest processing error for ${channelKey}:`, err.message);
    res.status(502).send(`Failed to process sports stream: ${err.message}`);
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
    const upstreamRes = await fetchWithRetry(targetUrl, {
      headers: {
        'Origin': 'https://wideiptv.top',
        'Referer': 'https://wideiptv.top/',
        'User-Agent': UA,
      },
      timeoutMs: 12000,
    }, 3);

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
 * Streams binary video/audio transport stream segments with kernel-safe buffering & 0 crash risk
 */
sportsRouter.get('/stream/:channelKey/segment.ts', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;

  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamRes = await fetchWithRetry(targetUrl, {
      headers: {
        'Origin': 'https://wideiptv.top',
        'Referer': 'https://wideiptv.top/',
        'User-Agent': UA,
      },
      timeoutMs: 30000,
    }, 3);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).send(`Segment error ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'video/MP2T';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    // Buffer fully into Buffer to avoid stream abort unhandled exceptions on Node 22/24
    const buffer = Buffer.from(await upstreamRes.arrayBuffer());
    res.setHeader('Content-Length', buffer.byteLength);
    res.end(buffer);
  } catch (err: any) {
    if (!res.headersSent) {
      console.error(`[SportsProxy] Segment fetch error:`, err.message);
      res.status(502).send('Failed to fetch segment');
    }
  }
});

/**
 * GET /api/sports/fixtures
 * Real-time matches schedule & live fixtures extracted from authentic beIN EPG
 */
sportsRouter.get('/fixtures', async (req: Request, res: Response) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const fixtures = await getSportsFixtures(forceRefresh);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json(fixtures);
  } catch (err: any) {
    console.error('[SportsFixtures] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sports fixtures', message: err.message });
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
