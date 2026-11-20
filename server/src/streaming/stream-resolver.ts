/**
 * Ultra-Fast Stealth Stream Resolver
 * Resolves direct HLS (.m3u8) streams from multiple providers using stealth Chromium,
 * fast concurrent racing, aggressive ad/tracker blocking, and in-memory caching.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'fs';

export interface ResolvedStream {
  id: string;
  tmdbId: number;
  kind: 'movie' | 'series';
  season?: number;
  episode?: number;
  playlistUrl: string;
  headers: Record<string, string>;
  createdAt: number;
  expiresAt: number;
  provider: string;
}

// Comprehensive ad, tracker, and bloatware host filters to make sniffing lightning-fast (<1s)
const BLOCKED_DOMAINS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google',
  'cloudflareinsights.com',
  'adsco.re',
  'mc.yandex',
  'yandex.ru',
  'bvtpk.com',
  'rtmark.net',
  'acscdn.com',
  'usrpubtrk.com',
  'adexchangeclear.com',
  'imasdk.googleapis.com',
  'jwpltx.com',
  'popcash.net',
  'popads.net',
  'adsterra.com',
  'histats.com',
  'connatix.com',
];

export class StreamResolver {
  private cache = new Map<string, ResolvedStream>();
  private pending = new Map<string, Promise<ResolvedStream>>();
  private activeBrowsers = 0;
  private readonly MAX_CONCURRENT_BROWSERS = 3;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes max for fresh tokens

  private getBrowserPath(): string | undefined {
    const paths = [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    ];
    return paths.find((p) => fs.existsSync(p));
  }

  private getCacheKey(req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number; provider?: string; targetUrl?: string }): string {
    const base = req.kind === 'series'
      ? `series-${req.tmdbId}-s${req.season ?? 1}e${req.episode ?? 1}`
      : `movie-${req.tmdbId}`;
    if (req.targetUrl) {
      const hash = Buffer.from(req.targetUrl).toString('hex').slice(0, 12);
      return `${base}-t-${hash}`;
    }
    return req.provider ? `${base}-p-${req.provider.toLowerCase().replace(/[^a-z0-9]/g, '')}` : base;
  }

  /**
   * Register a stream resolved directly (e.g. from HiAnime or Dizibal)
   */
  registerDirectStream(stream: ResolvedStream): void {
    const key = this.getCacheKey({
      tmdbId: stream.tmdbId,
      kind: stream.kind,
      season: stream.season,
      episode: stream.episode,
    });
    this.cache.set(key, stream);
    this.cache.set(`id:${stream.id}`, stream);
  }

  /**
   * Evict an expired or invalid stream from cache immediately.
   */
  evict(streamId: string): void {
    for (const [key, item] of this.cache.entries()) {
      if (item.id === streamId) {
        this.cache.delete(key);
      }
    }
    this.cache.delete(`id:${streamId}`);
  }

  /**
   * Resolves a media item to its direct HLS stream URL.
   */
  async resolve(req: {
    tmdbId: number;
    kind: 'movie' | 'series';
    season?: number;
    episode?: number;
    provider?: string;
    targetUrl?: string;
  }): Promise<ResolvedStream> {
    const snifferEnabled = process.env.ENABLE_STREAM_SNIFFER !== 'false' && process.env.DISABLE_SNIFFER !== 'true';
    if (!snifferEnabled) {
      throw new Error('Stream sniffer is temporarily disabled via ENABLE_STREAM_SNIFFER=false');
    }

    const key = this.getCacheKey(req);

    // 1. Check in-memory cache
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      console.log(`[StreamResolver] Cache hit for ${key}`);
      return cached;
    }

    // 2. Check if already being resolved
    const inflight = this.pending.get(key);
    if (inflight) {
      console.log(`[StreamResolver] Waiting for in-flight resolution for ${key}`);
      return inflight;
    }

    // 3. Check concurrent browser session limit
    if (this.activeBrowsers >= this.MAX_CONCURRENT_BROWSERS) {
      throw new Error(`Too many concurrent stream resolutions (max ${this.MAX_CONCURRENT_BROWSERS}). Try again in a moment.`);
    }

    // 4. Start resolution
    const promise = this.sniffFromProvider(req, key);
    this.pending.set(key, promise);

    try {
      const result = await promise;
      this.cache.set(key, result);
      this.cache.set(`id:${result.id}`, result);
      return result;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Retrieves a stream by its unique stream session ID.
   */
  getById(streamId: string): ResolvedStream | undefined {
    const direct = this.cache.get(`id:${streamId}`);
    if (direct) return direct;
    for (const item of this.cache.values()) {
      if (item.id === streamId) return item;
    }
    return undefined;
  }

  /**
   * Force re-resolve a stream by its cached stream ID (used by proxy on expiry).
   */
  async reResolveById(streamId: string): Promise<ResolvedStream | undefined> {
    for (const [key, item] of this.cache.entries()) {
      if (item.id === streamId) {
        this.cache.delete(key);
        this.cache.delete(`id:${streamId}`);
        return this.resolve({
          tmdbId: item.tmdbId,
          kind: item.kind,
          season: item.season,
          episode: item.episode,
        });
      }
    }
    return undefined;
  }

  getActiveBrowserCount(): number {
    return this.activeBrowsers;
  }

  getCached(req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number }): ResolvedStream | undefined {
    const key = this.getCacheKey(req);
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached;
    }
    return undefined;
  }

  private async sniffFromProvider(
    req: { tmdbId: number; kind: 'movie' | 'series'; season?: number; episode?: number; provider?: string; targetUrl?: string },
    cacheKey: string
  ): Promise<ResolvedStream> {
    const startTime = Date.now();
    const timeoutMs = parseInt(process.env.STREAM_RESOLVER_TIMEOUT || '25000', 10);
    const browserPath = this.getBrowserPath();

    const s = req.season ?? 1;
    const e = req.episode ?? 1;
    const isSeries = req.kind === 'series';

    let providerTargets: Array<{ name: string; url: string; referer: string }> = [];

    // If an explicit target embedUrl was passed (e.g. ArabMedia servers or third-party embed), sniff it directly:
    if (req.targetUrl) {
      const u = req.targetUrl;
      let referer = 'https://movizland.online/';
      if (u.includes('liiivideo') || u.includes('vidspeed') || u.includes('abyssplayer') || u.includes('vidmoly')) {
        referer = 'https://movizland.online/';
      } else {
        try { referer = new URL(u).origin + '/'; } catch {}
      }
      providerTargets.push({
        name: req.provider || 'Target',
        url: req.targetUrl,
        referer: referer,
      });
    } else {
      const isArab = req.provider && /arab|moviz|seed|liiivideo|vidspeed|abyssplayer|vidmoly/i.test(req.provider);
      if (isArab) {
        throw new Error(`Cannot sniff Arabic provider without a targetUrl`);
      }

      // General M3U8 streaming providers in strict priority order: Vidrift -> Aether -> VixSrc
      providerTargets = [
        {
          name: 'Vidrift',
          url: isSeries
            ? `https://embed.vidrift.net/embed/tv/${req.tmdbId}/${s}/${e}?title=true&hide=next,episodes,cast`
            : `https://embed.vidrift.net/embed/movie/${req.tmdbId}?title=true&hide=next,episodes,cast`,
          referer: 'https://embed.vidrift.net/',
        },
        {
          name: 'Aether',
          url: isSeries
            ? `https://aether.ist/media/tmdb-tv-${req.tmdbId}/${s}/${e}`
            : `https://aether.ist/media/tmdb-movie-${req.tmdbId}`,
          referer: 'https://aether.ist/',
        },
        {
          name: 'VixSrc',
          url: isSeries
            ? `https://vixsrc.to/tv/${req.tmdbId}/${s}/${e}`
            : `https://vixsrc.to/movie/${req.tmdbId}`,
          referer: 'https://vixsrc.to/',
        },
      ];

      if (req.provider) {
        const pClean = req.provider.toLowerCase();
        const match = providerTargets.find(
          (t) => t.name.toLowerCase().includes(pClean) || pClean.includes(t.name.toLowerCase())
        );
        if (match) {
          providerTargets = [match, ...providerTargets.filter((t) => t !== match)];
        }
      }
    }

    console.log(`[StreamResolver] Starting fast multi-target sniff for ${cacheKey} (${providerTargets.length} targets)`);
    this.activeBrowsers++;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    try {
      const launchOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--autoplay-policy=no-user-gesture-required',
          '--mute-audio',
          '--disable-web-security',
          '--disable-blink-features=AutomationControlled',
          '--window-size=800,600',
        ],
      };

      if (browserPath) {
        launchOptions.executablePath = browserPath;
      }

      browser = await chromium.launch(launchOptions);
      context = await browser.newContext({
        viewport: { width: 800, height: 600 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreHTTPSErrors: true,
      });

      let resolvedResult: { url: string; headers: Record<string, string>; provider: string } | null = null;

      // Group targets into pairs of 2 for fast concurrent racing
      for (let i = 0; i < providerTargets.length; i += 2) {
        if (resolvedResult) break;
        const remainingTime = timeoutMs - (Date.now() - startTime);
        if (remainingTime < 2500) break;

        const batch = providerTargets.slice(i, i + 2);
        console.log(`[StreamResolver] Racing batch: ${batch.map((b) => b.name).join(' vs ')}`);

        const racePromises = batch.map(async (target) => {
          if (!context) return null;
          let page: Page | null = null;
          try {
            page = await context.newPage();

            // Aggressive resource & ad blocking for ultra-fast load
            await page.route('**/*', (route) => {
              const reqObj = route.request();
              const type = reqObj.resourceType();
              const url = reqObj.url();

              // Abort heavy non-video assets
              if (type === 'image' || type === 'font') {
                return route.abort();
              }

              // Abort ads and analytics
              if (BLOCKED_DOMAINS.some((domain) => url.includes(domain))) {
                return route.abort();
              }

              return route.continue();
            }).catch(() => {});

            // Auto-close any intrusive popups
            page.on('popup', (popup) => { void popup.close().catch(() => {}); });

            let capturedUrl: string | undefined;
            let capturedHeaders: Record<string, string> | undefined;

            const streamPromise = new Promise<{ url: string; headers: Record<string, string> }>((resolve) => {
              if (!page) return;

              page.on('request', (request) => {
                const u = request.url();
                const resType = request.resourceType();
                const isThumb = u.includes('.vtt') || u.includes('.jpg') || u.includes('.png');
                const isAdPing = u.includes('ping') || u.includes('doubleclick') || u.includes('analytics');

                const isM3u8 = (u.includes('.m3u8') || u.includes('/playlist/') || u.includes('.urlset')) && !isThumb && !isAdPing;
                const isMedia = (resType === 'media' || u.includes('.mp4') || u.includes('.m3u8')) && (u.includes('.mp4') || u.includes('.m3u8')) && !isThumb && !isAdPing;

                if ((isM3u8 || isMedia) && !capturedUrl) {
                  capturedUrl = u;
                  capturedHeaders = request.headers();
                  resolve({ url: u, headers: capturedHeaders });
                }
              });

              page.on('response', (res) => {
                if (res.status() >= 400) return;
                const u = res.url();
                const cType = (res.headers()['content-type'] || '').toLowerCase();
                const isMpeg = cType.includes('mpegurl') || cType.includes('application/x-mpegurl');

                if (isMpeg && !capturedUrl) {
                  capturedUrl = u;
                  capturedHeaders = res.request().headers();
                  resolve({ url: u, headers: capturedHeaders });
                }
              });
            });

            // Fast navigation with timeout
            const pageTimeout = Math.min(12000, Math.max(5000, remainingTime - 500));
            await page.goto(target.url, {
              waitUntil: 'domcontentloaded',
              timeout: pageTimeout,
              referer: target.referer,
            });

            // Immediately trigger play on player button/overlay if present
            await page.evaluate(() => {
              const doc = (globalThis as any).document;
              if (doc) {
                const btn = doc.querySelector('button[aria-label*="Play"], .play-button, .vjs-big-play-button, video, div[class*="play"]');
                if (btn && typeof btn.click === 'function') btn.click();
              }
            }).catch(() => {});

            // Secondary synthetic play trigger after 800ms if stream not yet emitted
            const deferredClick = setTimeout(async () => {
              if (page && !page.isClosed() && !capturedUrl) {
                try {
                  await page.evaluate(() => {
                    const doc = (globalThis as any).document;
                    if (doc) {
                      const btn = doc.querySelector('button[aria-label*="Play"], .play-button, .vjs-big-play-button, video, div[class*="play"]');
                      if (btn && typeof btn.click === 'function') btn.click();
                    }
                  }).catch(() => {});
                } catch {}
              }
            }, 800);

            // Wait for stream capture or batch timeout
            const res = await Promise.race([
              streamPromise,
              new Promise<null>((r) => setTimeout(() => r(null), pageTimeout)),
            ]);

            clearTimeout(deferredClick);

            if (res) {
              return { ...res, provider: target.name };
            }
            return null;
          } catch (pageErr: any) {
            console.warn(`[StreamResolver] Sniff target ${target.name} failed:`, pageErr.message);
            return null;
          } finally {
            if (page && !page.isClosed()) {
              await page.close().catch(() => {});
            }
          }
        });

        const batchResults = await Promise.all(racePromises);
        const winner = batchResults.find((r): r is { url: string; headers: Record<string, string>; provider: string } => r !== null);
        if (winner) {
          console.log(`[StreamResolver] ✅ Winner captured: ${winner.provider} in ${Date.now() - startTime}ms`);
          resolvedResult = winner;
          break;
        }
      }

      if (!resolvedResult) {
        throw new Error(`All providers failed for tmdbId=${req.tmdbId} kind=${req.kind}`);
      }

      let ttl = this.CACHE_TTL_MS;
      const expiresMatch = resolvedResult.url.match(/expires=(\d+)/);
      if (expiresMatch) {
        const expSec = parseInt(expiresMatch[1], 10);
        if (!isNaN(expSec)) {
          const expMs = expSec > 2000000000 ? expSec : expSec * 1000;
          const diff = expMs - Date.now();
          if (diff > 0 && diff < ttl) {
            ttl = Math.max(30000, diff - 60000);
          }
        }
      }

      const streamId = `stream-${Buffer.from(cacheKey).toString('hex').slice(0, 16)}`;
      const resolved: ResolvedStream = {
        id: streamId,
        tmdbId: req.tmdbId,
        kind: req.kind,
        season: req.season,
        episode: req.episode,
        playlistUrl: resolvedResult.url,
        headers: resolvedResult.headers,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttl,
        provider: resolvedResult.provider,
      };

      console.log(`[StreamResolver] Successfully resolved ${cacheKey} via ${resolvedResult.provider} in ${Date.now() - startTime}ms`);
      return resolved;
    } finally {
      this.activeBrowsers--;
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}

export const streamResolver = new StreamResolver();
