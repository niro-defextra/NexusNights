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
  'onclickperformance.com',
  'adnxs.com',
  'scorecardresearch.com',
  'disqus.com',
  'exoclick.com',
  'trafficjunky.net',
  'tsyndicate.com',
  'propellerads.com',
  'admaven.com',
  'clickadu.com',
  'adcash.com',
  'juicyads.com',
  'exosrv.com',
  'popmyads.com',
  'hilltopads.com',
  'monetag.com',
  'richpush.co',
];

export class StreamResolver {
  private cache = new Map<string, ResolvedStream>();
  private pending = new Map<string, Promise<ResolvedStream>>();
  private activeBrowsers = 0;
  private readonly MAX_CONCURRENT_BROWSERS = 3;
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes max for fresh tokens
  private sharedBrowser: Browser | null = null;
  private sharedBrowserPromise: Promise<Browser> | null = null;

  private async getOrCreateBrowser(): Promise<Browser> {
    if (this.sharedBrowser && this.sharedBrowser.isConnected()) {
      return this.sharedBrowser;
    }
    if (this.sharedBrowserPromise) {
      return this.sharedBrowserPromise;
    }

    this.sharedBrowserPromise = (async () => {
      try {
        const browserPath = this.getBrowserPath();
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

        const b = await chromium.launch(launchOptions);
        b.on('disconnected', () => {
          this.sharedBrowser = null;
        });
        this.sharedBrowser = b;
        return b;
      } finally {
        this.sharedBrowserPromise = null;
      }
    })();

    return this.sharedBrowserPromise;
  }

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
    let context: BrowserContext | null = null;

    try {
      const browser = await this.getOrCreateBrowser();
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        ignoreHTTPSErrors: true,
      });

      // Advanced stealth init script to bypass bot-checks and anti-scraping
      await context.addInitScript(() => {
        try {
          const win = globalThis as any;
          Object.defineProperty(win.navigator || {}, 'webdriver', { get: () => undefined });
          delete win.cdc_adoQpoasnfa76pfcZLmcfl_Array;
          delete win.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
          delete win.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
          delete win.$chrome_asyncScriptInfo;
          delete win.$cdc_asdjflasutopfhvcZLmcfl_;
          if (win.navigator) {
            Object.defineProperty(win.navigator, 'plugins', {
              get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
              ],
            });
            Object.defineProperty(win.navigator, 'languages', {
              get: () => ['en-US', 'en'],
            });
          }
        } catch {}
      });

      let resolvedResult: { url: string; headers: Record<string, string>; provider: string } | null = null;

      // Group targets into pairs of 2 for fast concurrent racing
      for (let i = 0; i < providerTargets.length; i += 2) {
        if (resolvedResult) break;
        const remainingTime = timeoutMs - (Date.now() - startTime);
        if (remainingTime < 2500) break;

        const batch = providerTargets.slice(i, i + 2);
        console.log(`[StreamResolver] Racing batch: ${batch.map((b) => b.name).join(' vs ')}`);

        const abortController = new AbortController();

        const racePromises = batch.map(async (target) => {
          if (!context) return null;
          let page: Page | null = null;
          try {
            if (abortController.signal.aborted) return null;
            page = await context.newPage();

            // Auto-close page on abort
            const abortHandler = () => {
              if (page && !page.isClosed()) {
                page.close().catch(() => {});
              }
            };
            abortController.signal.addEventListener('abort', abortHandler, { once: true });

            // Resource & ad blocking: block heavy images/fonts/ads, but ALLOW stylesheets so players mount correctly
            await page.route('**/*', (route) => {
              if (abortController.signal.aborted) {
                return route.abort().catch(() => {});
              }
              const reqObj = route.request();
              const type = reqObj.resourceType();
              const url = reqObj.url();

              // Abort heavy non-video assets (keep stylesheets so custom players don't crash)
              if (type === 'image' || type === 'font') {
                return route.abort();
              }

              // Abort ads and analytics
              if (BLOCKED_DOMAINS.some((domain) => url.includes(domain))) {
                return route.abort();
              }

              // Abort obvious ad trackers / beacons
              if (/[\b/._-](ads?|doubleclick|popads|vast|vpaid|beacon|analytics)[\b/._-]/i.test(url) && !url.includes('.m3u8')) {
                return route.abort();
              }

              return route.continue();
            }).catch(() => {});

            // Auto-close any intrusive popups
            page.on('popup', (popup) => { void popup.close().catch(() => {}); });

            let capturedUrl: string | undefined;
            let capturedHeaders: Record<string, string> | undefined;

            const isAdStream = (u: string) => {
              return /[\b/._-](ads?|preroll|midroll|popads|vast|vpaid|beacon|track|syndication|telemetry)[\b/._-]/i.test(u);
            };

            const streamPromise = new Promise<{ url: string; headers: Record<string, string> }>((resolve) => {
              if (!page) return;

              page.on('request', (request) => {
                if (abortController.signal.aborted || capturedUrl) return;
                const u = request.url();
                const resType = request.resourceType();
                const isThumb = u.includes('.vtt') || u.includes('.jpg') || u.includes('.png');
                const isAdPing = isAdStream(u) || u.includes('ping') || u.includes('analytics');

                const isM3u8 = (u.includes('.m3u8') || u.includes('/playlist/') || u.includes('.urlset')) && !isThumb && !isAdPing;
                const isMedia = (resType === 'media' || u.includes('.mp4') || u.includes('.m3u8')) && (u.includes('.mp4') || u.includes('.m3u8')) && !isThumb && !isAdPing;

                if ((isM3u8 || isMedia) && !capturedUrl) {
                  capturedUrl = u;
                  capturedHeaders = request.headers();
                  resolve({ url: u, headers: capturedHeaders });
                }
              });

              page.on('response', (res) => {
                if (abortController.signal.aborted || capturedUrl || res.status() >= 400) return;
                const u = res.url();
                const cType = (res.headers()['content-type'] || '').toLowerCase();
                const isMpeg = cType.includes('mpegurl') || cType.includes('application/x-mpegurl');

                if (isMpeg && !isAdStream(u) && !capturedUrl) {
                  capturedUrl = u;
                  capturedHeaders = res.request().headers();
                  resolve({ url: u, headers: capturedHeaders });
                }
              });
            });

            // Fast navigation with timeout
            const pageTimeout = Math.min(10000, Math.max(4000, remainingTime - 500));
            await page.goto(target.url, {
              waitUntil: 'domcontentloaded',
              timeout: pageTimeout,
              referer: target.referer,
            });

            // Trigger play across all nested frames (players often render in an iframe)
            const triggerPlayInFrames = async () => {
              if (!page || page.isClosed() || capturedUrl || abortController.signal.aborted) return;
              for (const frame of page.frames()) {
                await frame.evaluate(() => {
                  try {
                    const doc = (globalThis as any).document;
                    if (!doc) return;
                    const btn = doc.querySelector('button[aria-label*="Play"], .play-button, .vjs-big-play-button, video, div[class*="play"], #play, .play, .jw-display-icon-container, [data-plyr="play"]');
                    if (btn && typeof btn.click === 'function') btn.click();
                    const v = doc.querySelector('video');
                    if (v) {
                      v.muted = true;
                      v.play().catch(() => {});
                    }
                  } catch {}
                }).catch(() => {});
              }
            };

            await triggerPlayInFrames();

            // Secondary synthetic play triggers after 500ms and 1200ms
            const timer1 = setTimeout(triggerPlayInFrames, 500);
            const timer2 = setTimeout(triggerPlayInFrames, 1200);

            // Wait for stream capture or batch timeout or abort
            const res = await Promise.race([
              streamPromise,
              new Promise<null>((r) => setTimeout(() => r(null), pageTimeout)),
              new Promise<null>((r) => {
                if (abortController.signal.aborted) r(null);
                else abortController.signal.addEventListener('abort', () => r(null), { once: true });
              }),
            ]);

            clearTimeout(timer1);
            clearTimeout(timer2);

            if (res && !abortController.signal.aborted) {
              return { ...res, provider: target.name };
            }
            return null;
          } catch {
            return null;
          } finally {
            if (page && !page.isClosed()) {
              await page.close().catch(() => {});
            }
          }
        });

        // Fast Winner Selection: First target to find a stream instantly wins and aborts the others
        const winner = await new Promise<{ url: string; headers: Record<string, string>; provider: string } | null>((resolveWinner) => {
          let pending = racePromises.length;
          for (const p of racePromises) {
            p.then((result) => {
              if (result && !abortController.signal.aborted) {
                abortController.abort();
                resolveWinner(result);
              } else {
                pending--;
                if (pending === 0 && !abortController.signal.aborted) {
                  resolveWinner(null);
                }
              }
            }).catch(() => {
              pending--;
              if (pending === 0 && !abortController.signal.aborted) {
                resolveWinner(null);
              }
            });
          }
        });

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
    }
  }

  /**
   * Gracefully close the shared browser instance to prevent zombie processes.
   */
  public async close(): Promise<void> {
    if (this.sharedBrowser) {
      try {
        await this.sharedBrowser.close();
      } catch {
        // ignore
      }
      this.sharedBrowser = null;
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getStats() {
    return {
      activeBrowsers: this.activeBrowsers,
      maxBrowsers: this.MAX_CONCURRENT_BROWSERS,
      cachedStreams: this.cache.size,
      pendingResolutions: this.pending.size,
    };
  }
}

export const streamResolver = new StreamResolver();

// Graceful cleanup of browser instance on server shutdown to avoid orphaned Chromium processes
process.once('SIGINT', () => void streamResolver.close());
process.once('SIGTERM', () => void streamResolver.close());
process.once('beforeExit', () => void streamResolver.close());
