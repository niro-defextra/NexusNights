import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { LibraryService } from '../library/service';
import { thumbPath, spritePath } from '../library/thumbs';
import { embeddedToVtt, externalToVtt } from '../library/subtitles';
import { ID_RE, exists, safeJoin } from '../util/fsx';
import { AvatarCache, ImageCache, tmdbArtworkUrl } from './images';
import type { SessionManager } from '../auth/session';
import type { ProgressStore } from '../realtime/progress';
import path from 'node:path';
import { Presenter, resolveLang, langToTmdb } from './present';
import { playbackOrchestrator } from '../streaming/playback-orchestrator';
import { providerRegistry } from '../streaming/provider-registry';
import { providerHealth } from '../streaming/provider-health';
import type { PlaybackConfig, ProviderSource } from '../streaming/types';
import type { PlaybackConfigPublic, PlaybackSourcePublic, GlobalHomeResponse, GlobalHomeSection } from './api-types';
import { DiscoveryPresenter } from '../tmdb/discovery-presenter';
import { selectBestLogo } from '../metadata/tmdb';
import { streamResolver } from '../streaming/stream-resolver';
import { streamProxyRouter } from '../streaming/stream-proxy';
import { providerStreamProxyRouter, registerProviderStream } from '../streaming/provider-stream-proxy';
import { sportsRouter } from '../streaming/sports-resolver';
import { analyticsTracker } from '../analytics/tracker';
import { openSubtitlesAPI } from '../subtitles/opensubtitles-api';
import { unifiedSubtitles } from '../subtitles/unified-subtitles';
import { subdlAPI } from '../subtitles/subdl-api';
import { hianimeResolver } from '../streaming/hianime-resolver';
import { aniSkipService } from '../streaming/aniskip-service';
import { skipSegmentsService, mergeSkipSegments } from '../streaming/skip-segments-service';
import { trailerSniffer } from '../streaming/trailer-sniffer';
import { isSafePublicUrl } from '../util/ssrf';

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(next);
};

/** Best-effort extras must never hold playback hostage. */
const withDeadline = <T>(promise: Promise<T>, fallback: T, ms: number): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });

/**
 * Register provider sources that need proxying (HLS with headers) and rewrite URLs
 */
function prepareProviderSources(config: PlaybackConfig): void {
  // Register and rewrite main source
  if (config.source && config.source.type === 'hls' && config.source.headers && config.source.id) {
    const originalUrl = config.source.url;
    
    // Convert PlaybackSource back to ProviderSource for registration
    const providerSource: ProviderSource = {
      id: config.source.id,
      url: config.source.url,
      type: config.source.type,
      quality: config.source.quality,
      providerId: config.source.id.split('-')[0], // Extract from id (e.g., "dizibal-series-123")
      providerName: config.source.provider,
      isEmbed: config.source.isEmbed,
      priority: 0, // Not used for registered streams
      headers: config.source.headers,
      subtitles: config.source.subtitles,
    };
    
    registerProviderStream(providerSource);
    config.source.url = `/api/provider-stream-proxy/master/${config.source.id}.m3u8`;
    
    console.log(`[PrepareProviderSources] Registered ${config.source.provider}: ${originalUrl.substring(0, 80)}... -> ${config.source.url}`);
    
    // Also include provider subtitles in global subtitles
    if (config.source.subtitles) {
      config.subtitles = [...config.subtitles, ...config.source.subtitles];
    }
  }
  
  // Register and rewrite alternatives
  for (const alt of config.alternatives) {
    if (alt.type === 'hls' && alt.headers && alt.id) {
      const originalUrl = alt.url;
      
      const providerSource: ProviderSource = {
        id: alt.id,
        url: alt.url,
        type: alt.type,
        quality: alt.quality,
        providerId: alt.id.split('-')[0],
        providerName: alt.provider,
        isEmbed: alt.isEmbed,
        priority: 0,
        headers: alt.headers,
        subtitles: alt.subtitles,
      };
      
      registerProviderStream(providerSource);
      alt.url = `/api/provider-stream-proxy/master/${alt.id}.m3u8`;
      
      console.log(`[PrepareProviderSources] Registered alt ${alt.provider}: ${originalUrl.substring(0, 80)}... -> ${alt.url}`);
    }
  }
}

/**
 * Ensures all playback sources returned to clients are native HLS streams (zero embeds/iframes)
 */
function convertToNativeSources(sources: PlaybackSourcePublic[]): PlaybackSourcePublic[] {
  return sources.map((s) => {
    if (s.type === 'embed') {
      const origUrl = s.embedUrl || s.url;
      return {
        ...s,
        url: `/api/streaming/resolve-native`,
        type: 'hls' as const,
        embedUrl: origUrl,
        provider: `${s.provider} (Native Sniffer)`,
      };
    }
    return s;
  });
}

const notFound = (res: Response) => res.status(404).json({ error: 'not_found' });
const FILE_OPTS = { maxAge: '7d', immutable: true, dotfiles: 'allow' as const };

export function createRoutes(svc: LibraryService, deps: { sessions: SessionManager; progress: ProgressStore }): { router: express.Router; adminToken: string } {
  const { cfg, store } = svc;
  const present = new Presenter(svc);
  const discovery = new DiscoveryPresenter(store);
  const images = new ImageCache(cfg);
  const avatars = new AvatarCache(cfg);
  const router = express.Router();
  
  // Initialize Custom Multi-Provider Streaming
  const streamingEnabled = cfg.streaming.enabled;
  if (streamingEnabled) {
    providerRegistry.initPersistence(path.join(cfg.dataDir, 'providers-state.json'));
    console.log('[Playback] Custom Multi-Provider Streaming enabled');
    providerRegistry.checkHealth().then(health => {
      const active = Object.entries(health).filter(([, ok]) => ok).map(([id]) => id).join(', ');
      console.log(`[Playback] Active streaming providers: ${active || 'none'}`);
    });
  } else {
    console.log('[Playback] Streaming integration disabled');
  }

  // If no ADMIN_TOKEN is configured, generate one per run (printed at startup) so the rescan
  // endpoint can never be hit anonymously — even through a public tunnel.
  const adminToken = cfg.adminToken ?? randomBytes(16).toString('hex');
  const requireAdmin: RequestHandler = (req, res, next) => {
    const header = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.get('x-admin-token') ?? '';
    const a = Buffer.from(header);
    const b = Buffer.from(adminToken);
    if (a.length === b.length && timingSafeEqual(a, b)) return next();
    res.status(401).json({ error: 'unauthorized' });
  };

  const assetLimiter = rateLimit({ windowMs: 60_000, limit: 2000, standardHeaders: true, legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
  const tokenLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
  const adminLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false });

  // ── static-ish assets (cached hard, generous limit) ─────────────────────────
  router.get('/images/:kind(poster|backdrop|still)/:id', assetLimiter, wrap(async (req, res) => {
    const { kind, id } = req.params as { kind: 'poster' | 'backdrop' | 'still'; id: string };
    if (!ID_RE.test(id)) return notFound(res);

    let tmdbPath: string | undefined;
    let localFile: string | undefined;
    if (kind === 'still') {
      const m = store.media.get(id);
      if (!m) return notFound(res);
      localFile = m.meta?.stillFile;
      tmdbPath = m.meta?.stillPath;
      if (!localFile && !tmdbPath) {
        const t = thumbPath(cfg, id);
        return m.assets.thumb && (await exists(t)) ? res.sendFile(t, FILE_OPTS) : notFound(res);
      }
    } else {
      const meta = store.titles.get(id)?.meta;
      if (!meta) return notFound(res);
      localFile = kind === 'poster' ? meta.posterFile : meta.backdropFile;
      tmdbPath = kind === 'poster' ? meta.posterPath : meta.backdropPath;
    }

    if (localFile) {
      const abs = safeJoin(cfg.overridesDir, localFile);
      return (await exists(abs)) ? res.sendFile(abs, FILE_OPTS) : notFound(res);
    }
    const file = tmdbPath ? await images.get(kind, tmdbPath) : null;
    return file ? res.sendFile(file, FILE_OPTS) : notFound(res);
  }));

  router.get('/images/tmdb/:kind(poster|backdrop|still|logo)/:file', assetLimiter, wrap(async (req, res) => {
    const { kind, file } = req.params as { kind: 'poster' | 'backdrop' | 'still' | 'logo'; file: string };
    const cached = await images.get(kind, `/${file}`);
    return cached ? res.sendFile(cached, FILE_OPTS) : notFound(res);
  }));

  router.get('/thumbs/:file', assetLimiter, wrap(async (req, res) => {
    const m = /^([a-f0-9]{12})\.jpg$/.exec(req.params.file);
    if (!m || !store.media.get(m[1])?.assets.thumb) return notFound(res);
    const p = thumbPath(cfg, m[1]);
    return (await exists(p)) ? res.sendFile(p, FILE_OPTS) : notFound(res);
  }));

  router.get('/sprites/:file', assetLimiter, wrap(async (req, res) => {
    const m = /^([a-f0-9]{12})\.jpg$/.exec(req.params.file);
    if (!m || !store.media.get(m[1])?.assets.sprite) return notFound(res);
    const p = spritePath(cfg, m[1]);
    return (await exists(p)) ? res.sendFile(p, FILE_OPTS) : notFound(res);
  }));

  /**
   * GET /api/subtitles/search
   * Search for external subtitles via Unified Subtitles (Wyzie, SubDL, OpenSubtitles)
   */
  router.get('/subtitles/search', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.query.tmdbId as string, 10);
    const type = req.query.type as string;
    const season = req.query.season ? parseInt(req.query.season as string, 10) : undefined;
    const episode = req.query.episode ? parseInt(req.query.episode as string, 10) : undefined;
    const languages = req.query.languages as string | undefined;

    if (!tmdbId || isNaN(tmdbId) || !type || !['movie', 'tv'].includes(type)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    try {
      const subtitles = await unifiedSubtitles.searchSubtitles({
        tmdbId,
        type: type as 'movie' | 'tv',
        season,
        episode,
        languages,
      });

      res.json({ subtitles });
    } catch (error: any) {
      console.error('[Subtitles] Search error:', error);
      res.status(502).json({ error: error.message || 'Failed to search subtitles' });
    }
  }));

  /**
   * GET /api/subtitles/download/:fileId
   * Get download link for a subtitle file
   */
  router.get('/subtitles/download/:fileId', apiLimiter, wrap(async (req, res) => {
    const fileId = req.params.fileId;

    if (!fileId) {
      return res.status(400).json({ error: 'Missing file ID' });
    }

    try {
      const downloadInfo = await unifiedSubtitles.getDownloadLink(fileId);
      res.json(downloadInfo);
    } catch (error: any) {
      console.error('[Subtitles] Download error:', error.message || error);
      const isQuota = /حد التحميل|allowed 5 subtitles|VIP/i.test(error.message || '');
      res.status(isQuota ? 429 : 502).json({ error: error.message || 'Failed to get download link' });
    }
  }));

  /**
   * GET /api/subtitles/subdl-stream
   * Streams extracted subtitle file directly from SubDL ZIP
   */
  router.get('/subtitles/subdl-stream', assetLimiter, wrap(async (req, res) => {
    const url = req.query.url as string;
    if (!url) return res.status(400).send('Missing url');

    const data = await subdlAPI.downloadAndExtract(url);
    if (!data) return res.status(404).send('Failed to extract subtitle from SubDL archive');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(data);
  }));

  /**
   * GET /api/subtitles/proxy
   * Universal CORS proxy & SRT->VTT converter for subtitles
   */
  router.get('/subtitles/proxy', assetLimiter, wrap(async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || !isSafePublicUrl(targetUrl)) {
      return res.status(400).send('Invalid or forbidden url parameter');
    }

    try {
      let referer = '';
      try {
        referer = new URL(targetUrl).origin;
      } catch {
        // invalid URL
      }

      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          ...(referer ? { Referer: referer } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(response.status).send(`Failed to fetch upstream subtitle: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      let text = '';
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        // Fallback for Arabic Windows-1256 encoding
        text = new TextDecoder('windows-1256').decode(buffer);
      }

      // Convert SRT to VTT if needed
      const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
      let vtt = clean;
      if (!clean.startsWith('WEBVTT')) {
        const body = clean
          .split('\n')
          .map((line) => (line.includes('-->') ? line.replace(/,/g, '.') : line))
          .join('\n');
        vtt = `WEBVTT\n\n${body}\n`;
      }

      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(vtt);
    } catch (err: any) {
      console.error('[SubtitlesProxy] Fetch error:', err.message);
      res.status(502).send(`Proxy error: ${err.message}`);
    }
  }));

  /**
   * GET /api/streaming/skip-segments/:kind/:tmdbId
   * IntroDB timestamps for recap / intro / credits / preview.
   * kind: movie | tv; TV requires season + episode.
   */
  router.get('/streaming/skip-segments/:kind/:tmdbId', apiLimiter, wrap(async (req, res) => {
    const kindParam = req.params.kind;
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if ((kindParam !== 'movie' && kindParam !== 'tv') || isNaN(tmdbId) || tmdbId <= 0) {
      return res.status(400).json({ error: 'invalid_parameters' });
    }

    const kind = kindParam === 'movie' ? 'movie' : 'series';
    const season = req.query.season != null ? parseInt(String(req.query.season), 10) : undefined;
    const episode = req.query.episode != null ? parseInt(String(req.query.episode), 10) : undefined;

    if (kind === 'series' && (
      season == null || episode == null ||
      isNaN(season) || isNaN(episode) || season < 0 || episode < 1
    )) {
      return res.status(400).json({ error: 'invalid_parameters' });
    }

    const segments = await skipSegmentsService.getSegments({ tmdbId, kind, season, episode });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(segments);
  }));

  /**
   * GET /api/streaming/aniskip/:malId/:episode
   * Opening and ending timestamps from AniSkip.
   */
  router.get('/streaming/aniskip/:malId/:episode', apiLimiter, wrap(async (req, res) => {
    const malId = parseInt(req.params.malId, 10);
    const episode = parseInt(req.params.episode, 10);
    if (isNaN(malId) || isNaN(episode)) {
      return res.status(400).json({ error: 'Invalid malId or episode' });
    }
    const timings = await aniSkipService.getSkipTimes(malId, episode);
    res.json(timings);
  }));

  router.get('/subtitles/:id/:track', assetLimiter, wrap(async (req, res, next) => {
    const { id, track } = req.params;
    const tm = /^(ext|emb)-(\d{1,3})\.vtt$/.exec(track);
    const item = ID_RE.test(id) ? store.media.get(id) : undefined;
    if (!tm || !item) return next ? next() : notFound(res);
    const n = Number(tm[2]);
    let vtt: string;
    try {
      if (tm[1] === 'ext') {
        const f = item.subtitleFiles[n];
        if (!f) return notFound(res);
        vtt = await externalToVtt(cfg, svc.ffmpegLimiter, f);
      } else {
        const s = item.probe?.subs.find((x) => x.ord === n && x.textBased);
        if (!s) return notFound(res);
        vtt = await embeddedToVtt(cfg, svc.ffmpegLimiter, item, n);
      }
    } catch {
      return res.status(502).json({ error: 'subtitle_unavailable' });
    }
    res.set('Cache-Control', 'public, max-age=3600').type('text/vtt; charset=utf-8').send(vtt);
  }));

  // ── playback ────────────────────────────────────────────────────────────────
  // Direct play: the raw file, with HTTP Range support (seeking) — only for browser-safe files.
  router.get('/stream/:id', assetLimiter, (req, res) => {
    const item = ID_RE.test(req.params.id) ? store.media.get(req.params.id) : undefined;
    if (!item) return notFound(res);
    if (item.playback?.mode !== 'direct') return res.status(409).json({ error: 'use_hls' });
    res.sendFile(safeJoin(cfg.mediaDir, item.relPath), { acceptRanges: true, dotfiles: 'allow', maxAge: '1h' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'not_found' });
    });
  });

  // HLS: the first status call starts the ffmpeg job; poll until canStart, then load master.m3u8.
  router.get('/hls/:id/status', apiLimiter, wrap(async (req, res) => {
    const item = ID_RE.test(req.params.id) ? store.media.get(req.params.id) : undefined;
    if (!item) return notFound(res);
    if (item.playback?.mode !== 'hls') return res.status(409).json({ error: 'use_direct' });
    res.set('Cache-Control', 'no-store').json(await svc.hls.status(item));
  }));

  router.get('/hls/:id/:file', assetLimiter, wrap(async (req, res) => {
    const item = ID_RE.test(req.params.id) ? store.media.get(req.params.id) : undefined;
    const fm = /^([A-Za-z0-9_-]{1,40})\.(m3u8|ts)$/.exec(req.params.file);
    if (!item || !fm) return notFound(res);
    const found = await svc.hls.lookup(item);
    if (!found) return notFound(res);
    const abs = path.join(found.dir, req.params.file);
    if (!(await exists(abs))) return notFound(res);
    const isPlaylist = fm[2] === 'm3u8';
    res.sendFile(abs, {
      dotfiles: 'deny',
      headers: {
        'Content-Type': isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
        'Cache-Control': isPlaylist && !found.finished ? 'no-store' : 'public, max-age=86400, immutable',
      },
    });
  }));

  // Batch lookup (Continue Watching). Supports both local media and external streaming titles.
  router.get('/media', apiLimiter, wrap(async (req, res) => {
    const rawIds = String(req.query.ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
    const lang = resolveLang(req.query.lang);
    const items = [];

    for (const id of rawIds) {
      if (ID_RE.test(id)) {
        const m = store.media.get(id);
        if (m) items.push(present.episode(m, lang));
      } else if (
        id.startsWith('streaming-movie-') ||
        id.startsWith('streaming-tv-') ||
        id.startsWith('movie-') ||
        id.startsWith('tv-')
      ) {
        const summary = await present.streamingEpisodeSummary(id, lang);
        if (summary) items.push(summary);
      }
    }

    res.json({ items });
  }));

  // ── Playback API (Multi-Provider Streaming System) ─────────────────────────

  /**
   * GET /api/playback/movie/:tmdbId
   * Resolve streaming sources for a movie
   */
  router.get('/playback/movie/:tmdbId', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const lang = resolveLang(req.query.lang);
    
    if (isNaN(tmdbId) || tmdbId <= 0) {
      return res.status(400).json({ error: 'invalid_tmdb_id' });
    }

    // Helper to get localized field
    const getField = <T extends object, K extends keyof T>(
      loc: Record<string, T> | undefined,
      key: K
    ): T[K] | undefined => {
      if (!loc) return undefined;
      for (const l of [lang, 'en', '*', ...Object.keys(loc)]) {
        const v = loc[l]?.[key];
        if (v !== undefined && v !== null && (typeof v !== 'string' || v !== '')) return v;
      }
      return undefined;
    };

    // Check if we have local version
    const localTitle = Array.from(store.titles.values()).find(
      t => t.kind === 'movie' && t.meta?.tmdbId === tmdbId
    );
    
    const localItems = localTitle ? svc.store.itemsOf(localTitle.id) : [];
    const localMediaId = localItems[0]?.id || null;

    if (!streamingEnabled) {
      // Streaming disabled - only show local if available
      if (localMediaId) {
        const localSummary = present.summary(localTitle!, lang);
        return res.json({
          playback: {
            source: null,
            alternatives: [],
            subtitles: [],
            canAutoSwitch: false,
            hasLocal: true,
            localMediaId,
            diagnosticsCount: 0,
          },
          title: localSummary.title,
          overview: localSummary.overview,
          posterUrl: localSummary.posterUrl,
          backdropUrl: localSummary.backdropUrl,
          releaseYear: localSummary.year,
        });
      }
      
      return res.status(503).json({ error: 'streaming_unavailable' });
    }

    try {
      // Resolve streaming sources from Custom Multi-Provider System
      const config = await playbackOrchestrator.resolveMovie(tmdbId, undefined, localTitle?.id);
      
      // Track streaming activity
      const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       (req.headers['x-real-ip'] as string) || 
                       req.socket.remoteAddress || 
                       'unknown';
      analyticsTracker.trackRequest(clientIP, true);
      
      // Register provider streams and rewrite URLs for proxying
      prepareProviderSources(config);
      
      // Build response
      const playbackConfig: PlaybackConfigPublic = {
        source: config.source,
        alternatives: config.alternatives,
        subtitles: config.subtitles,
        canAutoSwitch: config.canAutoSwitch,
        hasLocal: !!localMediaId,
        localMediaId,
        diagnosticsCount: config.diagnostics.length,
      };

      // Fetch title metadata early for optimal routing and anime detection
      let title = '';
      let overview = '';
      let posterUrl: string | null = null;
      let backdropUrl: string | null = null;
      let releaseYear: number | null = null;
      let tmdbMovieData: any = null;

      if (localTitle) {
        const localSummary = present.summary(localTitle, lang);
        title = localSummary.title;
        overview = localSummary.overview;
        posterUrl = localSummary.posterUrl;
        backdropUrl = localSummary.backdropUrl;
        releaseYear = localSummary.year;
      } else if (svc.tmdb.enabled) {
        try {
          tmdbMovieData = await svc.tmdb.getMovie(tmdbId);
          if (tmdbMovieData) {
            title = tmdbMovieData.title || '';
            overview = tmdbMovieData.overview || '';
            releaseYear = tmdbMovieData.release_date ? new Date(tmdbMovieData.release_date).getFullYear() : null;
          }
        } catch {}
      }

      // Check if title is Anime
      const isAnime = tmdbMovieData && (
        tmdbMovieData.original_language === 'ja' ||
        (Array.isArray(tmdbMovieData.genres) && tmdbMovieData.genres.some((g: any) => g.id === 16))
      );

      // Community skip markers, resolved while the stream is being prepared.
      const introDbSegmentsPromise = skipSegmentsService.getIntroDbSegments({ tmdbId, kind: 'movie' });

      let skipTimings: any = null;

      // Automatic on-demand native HLS stream resolution (Direct Player Priority)
      const hasDirectSource = config.source && !config.source.isEmbed;
      const snifferEnabled = process.env.ENABLE_STREAM_SNIFFER !== 'false' && process.env.DISABLE_SNIFFER !== 'true';
      let nativeStream = snifferEnabled ? streamResolver.getCached({ tmdbId, kind: 'movie' }) : undefined;

      // Tier 1: If Anime, try HiAnime direct scraper (<2s, zero browser overhead, direct HLS + MAL ID)
      if (isAnime && !nativeStream && !localMediaId && snifferEnabled && !hasDirectSource) {
        try {
          const animeSearchTitle = tmdbMovieData.original_title || tmdbMovieData.title || title;
          console.log(`[Playback] Anime movie detected: "${animeSearchTitle}". Resolving via HiAnime...`);
          const hiStream = await hianimeResolver.resolve({
            title: animeSearchTitle,
            tmdbId,
            kind: 'movie',
          });
          if (hiStream) {
            nativeStream = {
              id: hiStream.streamId,
              tmdbId,
              kind: 'movie',
              playlistUrl: hiStream.masterUrl,
              headers: { referer: hiStream.referer },
              createdAt: Date.now(),
              expiresAt: Date.now() + 4 * 3600 * 1000,
              provider: 'HiAnime (Direct HLS)',
            };
            if (hiStream.subtitles && hiStream.subtitles.length > 0) {
              playbackConfig.subtitles = [...playbackConfig.subtitles, ...hiStream.subtitles];
            }
            if (hiStream.malId) {
              skipTimings = await aniSkipService.getSkipTimes(hiStream.malId, 1);
            }
          }
        } catch (animeErr: any) {
          console.log(`[Playback] HiAnime direct resolve fallback:`, animeErr.message);
        }
      }

      // Tier 2: Multi-target concurrent stealth sniffer (Aether, VixSrc, Vidrift, ArabMedia embeds)
      if (!nativeStream && !localMediaId && snifferEnabled && !hasDirectSource) {
        try {
          const topEmbedUrl = (playbackConfig.source?.type === 'embed') ? (playbackConfig.source.embedUrl || playbackConfig.source.url) : undefined;
          const topProvider = playbackConfig.source?.provider;

          console.log(`[Playback] Auto-resolving native direct stream for movie ${tmdbId}...`);
          nativeStream = await streamResolver.resolve({
            tmdbId,
            kind: 'movie',
            provider: topProvider,
            targetUrl: topEmbedUrl,
          });
        } catch (sniffErr: any) {
          console.warn(`[Playback] Native auto-resolve fallback to embed for movie ${tmdbId}:`, sniffErr.message);
        }
      }

      if (hasDirectSource) {
        console.log(`[Playback] Using direct ${config.source!.type.toUpperCase()} source from ${config.source!.provider}, skipping sniffer`);
      }

      if (nativeStream) {
        const nativeSource: PlaybackSourcePublic = {
          url: `/api/stream-proxy/master/${nativeStream.id}.m3u8`,
          type: 'hls',
          quality: '1080p',
          provider: `${nativeStream.provider} (Direct HLS)`,
        };
        if (playbackConfig.source) {
          playbackConfig.alternatives = [playbackConfig.source, ...playbackConfig.alternatives];
        }
        playbackConfig.source = nativeSource;
      }

      // Guarantee 100% native player playback (eliminate third-party embeds)
      if (playbackConfig.source && playbackConfig.source.type === 'embed') {
        const origUrl = playbackConfig.source.embedUrl || playbackConfig.source.url;
        playbackConfig.source = {
          ...playbackConfig.source,
          url: `/api/streaming/resolve-native`,
          type: 'hls',
          embedUrl: origUrl,
          provider: `${playbackConfig.source.provider} (Native Sniffer)`,
        };
      }
      playbackConfig.alternatives = convertToNativeSources(playbackConfig.alternatives);

      const introDbSegments = await withDeadline(introDbSegmentsPromise, { found: false }, 1500);
      skipTimings = mergeSkipSegments(skipTimings, introDbSegments);
      if (!skipTimings.found) skipTimings = null;

      res.json({
        playback: playbackConfig,
        skipTimings,
        title,
        overview,
        posterUrl,
        backdropUrl,
        releaseYear,
      });
    } catch (error) {
      console.error(`[Playback] Movie ${tmdbId} error:`, error);
      res.status(502).json({ error: 'playback_resolution_failed' });
    }
  }));

  /**
   * GET /api/playback/tv/:tmdbId/seasons/:season/episodes/:episode
   * Resolve streaming sources for a TV episode
   */
  router.get('/playback/tv/:tmdbId/seasons/:season/episodes/:episode', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const season = parseInt(req.params.season, 10);
    const episode = parseInt(req.params.episode, 10);
    const lang = resolveLang(req.query.lang);

    if (isNaN(tmdbId) || tmdbId <= 0 || isNaN(season) || season < 0 || isNaN(episode) || episode < 1) {
      return res.status(400).json({ error: 'invalid_parameters' });
    }

    // Check if we have local version
    const localTitle = Array.from(store.titles.values()).find(
      t => t.kind === 'series' && t.meta?.tmdbId === tmdbId
    );
    
    const localMedia = localTitle ? Array.from(store.media.values()).find(
      m => m.titleId === localTitle.id && m.season === season && m.episode === episode
    ) : undefined;
    
    const localMediaId = localMedia?.id || null;

    if (!streamingEnabled) {
      // Streaming disabled - only show local if available
      if (localMediaId && localMedia && localTitle) {
        const episodeSummary = present.episode(localMedia, lang);
        const titleSummary = present.summary(localTitle, lang);
        
        return res.json({
          playback: {
            source: null,
            alternatives: [],
            subtitles: [],
            canAutoSwitch: false,
            hasLocal: true,
            localMediaId,
            diagnosticsCount: 0,
          },
          title: episodeSummary.title,
          overview: episodeSummary.overview,
          posterUrl: titleSummary.posterUrl,
          backdropUrl: episodeSummary.stillUrl,
          releaseYear: titleSummary.year,
        });
      }
      
      return res.status(503).json({ error: 'streaming_unavailable' });
    }

    try {
      // Resolve streaming sources from Custom Multi-Provider System
      const config = await playbackOrchestrator.resolveTV(tmdbId, season, episode, undefined, localTitle?.id);
      
      // Track streaming activity
      const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                       (req.headers['x-real-ip'] as string) || 
                       req.socket.remoteAddress || 
                       'unknown';
      analyticsTracker.trackRequest(clientIP, true);
      
      // Register provider streams and rewrite URLs for proxying
      prepareProviderSources(config);
      
      // Build response
      const playbackConfig: PlaybackConfigPublic = {
        source: config.source,
        alternatives: config.alternatives,
        subtitles: config.subtitles,
        canAutoSwitch: config.canAutoSwitch,
        hasLocal: !!localMediaId,
        localMediaId,
        diagnosticsCount: config.diagnostics.length,
      };

      // Fetch metadata early for anime detection and rich episode details
      let title = '';
      let overview = '';
      let posterUrl: string | null = null;
      let backdropUrl: string | null = null;
      let releaseYear: number | null = null;
      let tmdbTvData: any = null;

      if (localMedia && localTitle) {
        const episodeSummary = present.episode(localMedia, lang);
        const titleSummary = present.summary(localTitle, lang);
        title = episodeSummary.title;
        overview = episodeSummary.overview;
        posterUrl = titleSummary.posterUrl;
        backdropUrl = episodeSummary.stillUrl;
        releaseYear = titleSummary.year;
      } else if (svc.tmdb.enabled) {
        try {
          tmdbTvData = await svc.tmdb.getTv(tmdbId);
          if (tmdbTvData) {
            const seriesName = tmdbTvData.name || '';
            title = `${seriesName} S${season}E${episode}`;
            releaseYear = tmdbTvData.first_air_date ? new Date(tmdbTvData.first_air_date).getFullYear() : null;
          }
        } catch {
          title = `S${season}E${episode}`;
        }
      } else {
        title = `S${season}E${episode}`;
      }

      // Check if series is Anime
      const isAnime = tmdbTvData && (
        tmdbTvData.original_language === 'ja' ||
        (Array.isArray(tmdbTvData.genres) && tmdbTvData.genres.some((g: any) => g.id === 16))
      );

      // Community skip markers, resolved while the stream is being prepared.
      const introDbSegmentsPromise = skipSegmentsService.getIntroDbSegments({ tmdbId, kind: 'series', season, episode });

      let skipTimings: any = null;

      // Automatic on-demand native HLS stream resolution (Direct Player Priority)
      const hasDirectSource = config.source && !config.source.isEmbed;
      const snifferEnabled = process.env.ENABLE_STREAM_SNIFFER !== 'false' && process.env.DISABLE_SNIFFER !== 'true';
      let nativeStream = snifferEnabled ? streamResolver.getCached({ tmdbId, kind: 'series', season, episode }) : undefined;

      // Tier 1: If Anime, try HiAnime direct scraper (<2s, direct HLS + MAL ID + skip timings)
      if (isAnime && !nativeStream && !localMediaId && snifferEnabled && !hasDirectSource) {
        try {
          const animeSearchTitle = tmdbTvData.original_name || tmdbTvData.name || title;
          console.log(`[Playback] Anime series detected: "${animeSearchTitle}" S${season}E${episode}. Resolving via HiAnime...`);
          const hiStream = await hianimeResolver.resolve({
            title: animeSearchTitle,
            tmdbId,
            kind: 'series',
            season,
            episode,
          });
          if (hiStream) {
            nativeStream = {
              id: hiStream.streamId,
              tmdbId,
              kind: 'series',
              season,
              episode,
              playlistUrl: hiStream.masterUrl,
              headers: { referer: hiStream.referer },
              createdAt: Date.now(),
              expiresAt: Date.now() + 4 * 3600 * 1000,
              provider: 'HiAnime (Direct HLS)',
            };
            if (hiStream.subtitles && hiStream.subtitles.length > 0) {
              playbackConfig.subtitles = [...playbackConfig.subtitles, ...hiStream.subtitles];
            }
            if (hiStream.malId) {
              skipTimings = await aniSkipService.getSkipTimes(hiStream.malId, episode);
            }
          }
        } catch (animeErr: any) {
          console.log(`[Playback] HiAnime direct resolve fallback:`, animeErr.message);
        }
      }

      // Tier 2: Multi-target concurrent stealth sniffer (Aether, VixSrc, Vidrift, ArabMedia embeds)
      if (!nativeStream && !localMediaId && snifferEnabled && !hasDirectSource) {
        try {
          const topEmbedUrl = (playbackConfig.source?.type === 'embed') ? (playbackConfig.source.embedUrl || playbackConfig.source.url) : undefined;
          const topProvider = playbackConfig.source?.provider;

          console.log(`[Playback] Auto-resolving native direct stream for TV ${tmdbId} S${season}E${episode}...`);
          nativeStream = await streamResolver.resolve({
            tmdbId,
            kind: 'series',
            season,
            episode,
            provider: topProvider,
            targetUrl: topEmbedUrl,
          });
        } catch (sniffErr: any) {
          console.warn(`[Playback] Native auto-resolve fallback to embed for TV ${tmdbId} S${season}E${episode}:`, sniffErr.message);
        }
      }

      if (hasDirectSource) {
        console.log(`[Playback] Using direct ${config.source!.type.toUpperCase()} source from ${config.source!.provider}, skipping sniffer`);
      }

      if (nativeStream) {
        const nativeSource: PlaybackSourcePublic = {
          url: `/api/stream-proxy/master/${nativeStream.id}.m3u8`,
          type: 'hls',
          quality: '1080p',
          provider: `${nativeStream.provider} (Direct HLS)`,
        };
        if (playbackConfig.source) {
          playbackConfig.alternatives = [playbackConfig.source, ...playbackConfig.alternatives];
        }
        playbackConfig.source = nativeSource;
      }

      // Guarantee 100% native player playback (eliminate third-party embeds)
      if (playbackConfig.source && playbackConfig.source.type === 'embed') {
        const origUrl = playbackConfig.source.embedUrl || playbackConfig.source.url;
        playbackConfig.source = {
          ...playbackConfig.source,
          url: `/api/streaming/resolve-native`,
          type: 'hls',
          embedUrl: origUrl,
          provider: `${playbackConfig.source.provider} (Native Sniffer)`,
        };
      }
      playbackConfig.alternatives = convertToNativeSources(playbackConfig.alternatives);

      const introDbSegments = await withDeadline(introDbSegmentsPromise, { found: false }, 1500);
      skipTimings = mergeSkipSegments(skipTimings, introDbSegments);
      if (!skipTimings.found) skipTimings = null;

      res.json({
        playback: playbackConfig,
        skipTimings,
        title,
        overview,
        posterUrl,
        backdropUrl,
        releaseYear,
      });
    } catch (error) {
      console.error(`[Playback] TV ${tmdbId} S${season}E${episode} error:`, error);
      res.status(502).json({ error: 'playback_resolution_failed' });
    }
  }));

  // ── Discord ─────────────────────────────────────────────────────────────────
  // Public, non-secret bootstrap info for the Activity client.
  router.get('/config', apiLimiter, (_req, res) =>
    res.json({ discordClientId: cfg.discord.clientId ?? null, guestAllowed: cfg.allowGuest, roleScope: cfg.controlRoleIds.length > 0 }));

  // OAuth2 code → access token. The client secret never leaves the server.
  // The Discord Embedded App SDK requires a valid access_token to call
  // `discordSdk.commands.authenticate()`. Without this step the Activity
  // cannot identify users or access voice/guild info.
  router.post('/token', tokenLimiter, wrap(async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if (!/^[\w.~-]{8,512}$/.test(code)) return res.status(400).json({ error: 'bad_code' });
    const { clientId, clientSecret, apiBase } = cfg.discord;
    if (!clientId || !clientSecret) return res.status(503).json({ error: 'discord_not_configured' });
    try {
      // Build form body — include redirect_uri if configured (Discord requires
      // it to match the one used in the authorize step).
      const params: Record<string, string> = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      };
      if (cfg.discord.redirectUri) {
        params.redirect_uri = cfg.discord.redirectUri;
      }

      const r = await fetch(`${apiBase}/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(10_000),
      });

      const data = (await r.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
      if (!r.ok || !data?.access_token) {
        console.error('[Discord Token] Exchange failed:', r.status, data?.error, data?.error_description);
        return res.status(502).json({ error: 'token_exchange_failed', detail: data?.error_description || data?.error });
      }

      res.set('Cache-Control', 'no-store').json({ access_token: data.access_token });
    } catch (err) {
      console.error('[Discord Token] Exchange error:', err);
      res.status(502).json({ error: 'token_exchange_failed' });
    }
  }));

  // Per-user "continue watching" (Discord access token → user id, verified by Discord).
  const progressLimiter = rateLimit({ windowMs: 60_000, limit: 240, standardHeaders: true, legacyHeaders: false });
  const withUser = (handler: (req: Request, res: Response, userId: string) => unknown): RequestHandler => wrap(async (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const u = deps.sessions.verifyToken(token);
      return handler(req, res, u.userId);
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  });

  const isValidProgressMediaId = (id: string): boolean => {
    if (ID_RE.test(id)) return store.media.has(id);
    if (id.startsWith('streaming-movie-') && /^\d+$/.test(id.replace('streaming-movie-', ''))) return true;
    if (id.startsWith('streaming-tv-') && /^streaming-tv-\d+-\d+-\d+$/.test(id)) return true;
    if (id.startsWith('movie-') && /^\d+$/.test(id.replace('movie-', ''))) return true;
    if (/^tv-\d+-s\d+e\d+$/.test(id)) return true;
    return false;
  };

  router.get('/progress', progressLimiter, withUser((_req, res, uid) => {
    res.set('Cache-Control', 'no-store').json({ progress: deps.progress.get(uid) });
  }));

  router.put('/progress/:id', progressLimiter, withUser((req, res, uid) => {
    const id = req.params.id;
    if (!isValidProgressMediaId(id)) return notFound(res);

    const { t, d, provider, tmdbId, kind, season, episode, completed } = (req.body ?? {}) as any;
    if (
      typeof t !== 'number' ||
      typeof d !== 'number' ||
      !Number.isFinite(t) ||
      !Number.isFinite(d) ||
      d <= 0 ||
      d > 1e6 ||
      t < 0 ||
      t > d + 60
    ) {
      return res.status(400).json({ error: 'invalid' });
    }

    // If local media, link metadata
    const local = ID_RE.test(id) ? store.media.get(id) : undefined;
    const localTitle = local ? store.titles.get(local.titleId) : undefined;

    deps.progress.put(uid, id, t, d, {
      provider: typeof provider === 'string' ? provider : (local ? 'local' : undefined),
      tmdbId: typeof tmdbId === 'number' ? tmdbId : (localTitle?.meta?.tmdbId ?? undefined),
      kind: kind === 'movie' || kind === 'tv' ? kind : (localTitle?.kind === 'movie' ? 'movie' : (localTitle?.kind === 'series' ? 'tv' : undefined)),
      season: typeof season === 'number' ? season : (local?.season ?? undefined),
      episode: typeof episode === 'number' ? episode : (local?.episode ?? undefined),
      completed: typeof completed === 'boolean' ? completed : undefined,
      localMediaId: local ? local.id : undefined,
    });
    res.json({ ok: true });
  }));

  router.delete('/progress/:id', progressLimiter, withUser((req, res, uid) => {
    const id = req.params.id;
    deps.progress.remove(uid, id);
    res.json({ ok: true });
  }));

  router.post('/progress/:id/complete', progressLimiter, withUser((req, res, uid) => {
    const id = req.params.id;
    deps.progress.markCompleted(uid, id);
    res.json({ ok: true });
  }));

  router.get('/progress/continue-watching', progressLimiter, withUser(async (req, res, uid) => {
    const ids = deps.progress.getContinueWatchingIds(uid);
    const lang = resolveLang(req.query.lang);
    const items = [];
    for (const id of ids) {
      if (ID_RE.test(id) && store.media.has(id)) {
        items.push(present.episode(store.media.get(id)!, lang));
      } else {
        const s = await present.streamingEpisodeSummary(id, lang);
        if (s) items.push(s);
      }
    }
    res.json({ items });
  }));

  router.get('/avatar/:id/:hash', assetLimiter, wrap(async (req, res) => {
    const { id, hash } = req.params;
    if (!/^\d{15,25}$/.test(id) || !/^(?:a_)?[a-f0-9]{32}$/.test(hash)) return notFound(res);
    const file = await avatars.get(id, hash);
    return file ? res.sendFile(file, { maxAge: '7d', immutable: true, dotfiles: 'allow' }) : notFound(res);
  }));

  // ── JSON API ────────────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => res.json({ ok: true, ...present.status() }));
  router.get('/library/status', apiLimiter, (_req, res) => res.json(present.status()));

  router.get('/home', apiLimiter, (req, res) => res.json(present.home(resolveLang(req.query.lang))));

  // ── Global Discovery Homepage (Stage 5) ─────────────────────────────────────
  router.get('/discovery/home', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    
    if (!svc.tmdb.enabled) {
      // TMDB disabled - return local-only home
      return res.json(present.home(lang));
    }

    const sections: GlobalHomeSection[] = [];

    // Fetch all TMDB sections in parallel
    const [
      trendingMoviesDay,
      trendingTvDay,
      trendingMoviesWeek,
      popularMovies,
      popularTv,
      topRatedMovies,
      topRatedTv,
      nowPlaying,
      upcoming,
      onTheAir,
      airingToday,
    ] = await Promise.all([
      svc.tmdb.getTrendingMovies('day', 1, tmdbLang).catch(() => null),
      svc.tmdb.getTrendingTv('day', 1, tmdbLang).catch(() => null),
      svc.tmdb.getTrendingMovies('week', 1, tmdbLang).catch(() => null),
      svc.tmdb.getPopularMovies(1, tmdbLang).catch(() => null),
      svc.tmdb.getPopularTv(1, tmdbLang).catch(() => null),
      svc.tmdb.getTopRatedMovies(1, tmdbLang).catch(() => null),
      svc.tmdb.getTopRatedTv(1, tmdbLang).catch(() => null),
      svc.tmdb.getNowPlayingMovies(1, tmdbLang).catch(() => null),
      svc.tmdb.getUpcomingMovies(1, tmdbLang).catch(() => null),
      svc.tmdb.getOnTheAirTv(1, tmdbLang).catch(() => null),
      svc.tmdb.getAiringTodayTv(1, tmdbLang).catch(() => null),
    ]);

    // Select hero from trending movies or local library
    let hero = null;
    if (trendingMoviesDay?.results?.length) {
      const topHit = trendingMoviesDay.results[0];
      let logoInfo: { filePath: string; aspectRatio: number } | null = null;
      try {
        const imagesData = await svc.tmdb.getImages('movie', topHit.id);
        logoInfo = selectBestLogo(imagesData?.logos, lang, (topHit as any).original_language);
      } catch {
        // Fallback without logo
      }
      hero = discovery.searchHitToCard(topHit, 'movie', logoInfo);
    } else {
      const localHome = present.home(lang);
      if (localHome.hero) {
        // Convert local hero to GlobalTitleCard format
        hero = {
          id: localHome.hero.id,
          tmdbId: 0,
          kind: localHome.hero.kind,
          title: localHome.hero.title,
          originalTitle: localHome.hero.title,
          overview: localHome.hero.overview,
          posterUrl: localHome.hero.posterUrl,
          backdropUrl: localHome.hero.backdropUrl,
          releaseDate: null,
          rating: localHome.hero.rating,
          year: localHome.hero.year,
          availability: 'local' as const,
          localId: localHome.hero.id,
        };
      }
    }

    // Build sections
    if (trendingMoviesDay?.results?.length) {
      sections.push({
        key: 'trending-movies-today',
        title: lang === 'ar' ? 'الأفلام الرائجة اليوم' : 'Trending Movies Today',
        items: trendingMoviesDay.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (trendingTvDay?.results?.length) {
      sections.push({
        key: 'trending-tv-today',
        title: lang === 'ar' ? 'المسلسلات الرائجة اليوم' : 'Trending TV Shows Today',
        items: trendingTvDay.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'series')),
      });
    }

    if (trendingMoviesWeek?.results?.length) {
      sections.push({
        key: 'trending-week',
        title: lang === 'ar' ? 'الأكثر رواجًا هذا الأسبوع' : 'Trending This Week',
        items: trendingMoviesWeek.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (nowPlaying?.results?.length) {
      sections.push({
        key: 'now-playing',
        title: lang === 'ar' ? 'يُعرض الآن' : 'Now Playing',
        items: nowPlaying.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (airingToday?.results?.length) {
      sections.push({
        key: 'airing-today',
        title: lang === 'ar' ? 'يُبث اليوم' : 'Airing Today',
        items: airingToday.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'series')),
      });
    }

    if (popularMovies?.results?.length) {
      sections.push({
        key: 'popular-movies',
        title: lang === 'ar' ? 'الأفلام الشائعة' : 'Popular Movies',
        items: popularMovies.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (popularTv?.results?.length) {
      sections.push({
        key: 'popular-tv',
        title: lang === 'ar' ? 'المسلسلات الشائعة' : 'Popular TV Shows',
        items: popularTv.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'series')),
      });
    }

    if (topRatedMovies?.results?.length) {
      sections.push({
        key: 'top-rated-movies',
        title: lang === 'ar' ? 'الأفلام الأعلى تقييمًا' : 'Top Rated Movies',
        items: topRatedMovies.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (topRatedTv?.results?.length) {
      sections.push({
        key: 'top-rated-tv',
        title: lang === 'ar' ? 'المسلسلات الأعلى تقييمًا' : 'Top Rated TV Shows',
        items: topRatedTv.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'series')),
      });
    }

    if (upcoming?.results?.length) {
      sections.push({
        key: 'upcoming',
        title: lang === 'ar' ? 'قريبًا' : 'Upcoming Releases',
        items: upcoming.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'movie')),
      });
    }

    if (onTheAir?.results?.length) {
      sections.push({
        key: 'on-the-air',
        title: lang === 'ar' ? 'على الهواء' : 'On The Air',
        items: onTheAir.results.slice(0, 20).map(hit => discovery.searchHitToCard(hit, 'series')),
      });
    }

    // Add local library section
    const localTitles = [...store.titles.values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, 20)
      .map((t) => {
        const summary = present.summary(t, lang);
        return {
          id: summary.id,
          tmdbId: t.meta?.tmdbId || 0,
          kind: summary.kind,
          title: summary.title,
          originalTitle: summary.title,
          overview: summary.overview,
          posterUrl: summary.posterUrl,
          backdropUrl: summary.backdropUrl,
          releaseDate: null,
          rating: summary.rating,
          year: summary.year,
          availability: 'local' as const,
          localId: summary.id,
        };
      });

    if (localTitles.length > 0) {
      sections.push({
        key: 'local-library',
        title: lang === 'ar' ? 'مكتبتك المحلية' : 'Your Local Library',
        items: localTitles,
      });
    }

    const response: GlobalHomeResponse = { hero, sections };
    res.json(response);
  }));

  // Global Title Details
  router.get('/discovery/movie/:tmdbId', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if (isNaN(tmdbId)) {
      return res.status(400).json({ error: 'invalid_tmdb_id' });
    }

    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const [movie, imagesData] = await Promise.all([
      svc.tmdb.getMovieDetail(tmdbId, tmdbLang),
      svc.tmdb.getImages('movie', tmdbId).catch(() => null),
    ]);
    if (!movie) return notFound(res);

    // Fallback overview to English if localized is empty
    if (!movie.overview) {
      const enMovie = await svc.tmdb.getMovieDetail(tmdbId, 'en-US').catch(() => null);
      if (enMovie?.overview) movie.overview = enMovie.overview;
    }

    const logoInfo = selectBestLogo(imagesData?.logos, lang, movie.original_language);
    const detail = discovery.movieDetailToGlobal(movie, logoInfo);
    res.json(detail);
  }));

  router.get('/discovery/tv/:tmdbId', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if (isNaN(tmdbId)) {
      return res.status(400).json({ error: 'invalid_tmdb_id' });
    }

    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const [tv, imagesData] = await Promise.all([
      svc.tmdb.getTvDetail(tmdbId, tmdbLang),
      svc.tmdb.getImages('tv', tmdbId).catch(() => null),
    ]);
    if (!tv) return notFound(res);

    // Fallback overview to English if localized is empty
    if (!tv.overview) {
      const enTv = await svc.tmdb.getTvDetail(tmdbId, 'en-US').catch(() => null);
      if (enTv?.overview) tv.overview = enTv.overview;
    }

    const logoInfo = selectBestLogo(imagesData?.logos, lang, tv.original_language);
    const detail = discovery.tvDetailToGlobal(tv, logoInfo);
    res.json(detail);
  }));

  router.get('/discovery/tv/:tmdbId/season/:seasonNumber', apiLimiter, wrap(async (req, res) => {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const seasonNumber = parseInt(req.params.seasonNumber, 10);
    if (isNaN(tmdbId) || isNaN(seasonNumber)) {
      return res.status(400).json({ error: 'invalid_parameters' });
    }

    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const season = await svc.tmdb.getSeasonDetail(tmdbId, seasonNumber, tmdbLang);
    if (!season) return notFound(res);

    const seasonDetail = discovery.seasonToGlobal(season, tmdbId);
    res.json(seasonDetail);
  }));

  // ── TMDB Browse Endpoints (for TV app) ──────────────────────────────────────

  // Popular Movies
  router.get('/discovery/movies/popular', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    const data = await svc.tmdb.getPopularMovies(page, tmdbLang);
    res.json(data);
  }));

  // Top Rated Movies
  router.get('/discovery/movies/top-rated', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    const data = await svc.tmdb.getTopRatedMovies(page, tmdbLang);
    res.json(data);
  }));

  // Now Playing Movies
  router.get('/discovery/movies/now-playing', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    const data = await svc.tmdb.getNowPlayingMovies(page, tmdbLang);
    res.json(data);
  }));

  // Popular TV Series
  router.get('/discovery/series/popular', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    const data = await svc.tmdb.getPopularTv(page, tmdbLang);
    res.json(data);
  }));

  // Top Rated TV Series
  router.get('/discovery/series/top-rated', apiLimiter, wrap(async (req, res) => {
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    const data = await svc.tmdb.getTopRatedTv(page, tmdbLang);
    res.json(data);
  }));

  // Trending
  router.get('/discovery/trending/:kind/:timeWindow', apiLimiter, wrap(async (req, res) => {
    const kind = req.params.kind as 'movie' | 'tv' | 'all';
    const timeWindow = req.params.timeWindow as 'day' | 'week';
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);
    
    if (!svc.tmdb.enabled) {
      return res.status(503).json({ error: 'tmdb_disabled' });
    }

    let data;
    if (kind === 'movie') {
      data = await svc.tmdb.getTrendingMovies(timeWindow, page, tmdbLang);
    } else if (kind === 'tv') {
      data = await svc.tmdb.getTrendingTv(timeWindow, page, tmdbLang);
    } else {
      // For 'all', return movies for now
      data = await svc.tmdb.getTrendingMovies(timeWindow, page, tmdbLang);
    }
    
    res.json(data);
  }));

  // ────────────────────────────────────────────────────────────────────────────

  // Universal Search
  router.get('/search', apiLimiter, wrap(async (req, res) => {
    const query = (req.query.q as string)?.trim();
    const lang = resolveLang(req.query.lang);
    const tmdbLang = langToTmdb(lang);
    const page = Math.max(1, Number(req.query.page) || 1);

    if (!query || query.length < 2) {
      return res.json({ query: query || '', local: [], global: [], totalResults: 0 });
    }

    // Search local titles
    const localResults = [...store.titles.values()]
      .filter((t) => {
        const name = present.titleName(t, lang).toLowerCase();
        const q = query.toLowerCase();
        return name.includes(q);
      })
      .slice(0, 10)
      .map((t) => {
        const summary = present.summary(t, lang);
        return {
          id: summary.id,
          tmdbId: t.meta?.tmdbId || 0,
          kind: summary.kind,
          title: summary.title,
          originalTitle: summary.title,
          overview: summary.overview,
          posterUrl: summary.posterUrl,
          backdropUrl: summary.backdropUrl,
          releaseDate: null,
          rating: summary.rating,
          year: summary.year,
          availability: 'local' as const,
          localId: summary.id,
        };
      });

    // Search TMDB if enabled
    let globalResults: any[] = [];
    if (svc.tmdb.enabled) {
      const tmdbResults = await svc.tmdb.searchMulti(query, page, tmdbLang);
      if (tmdbResults?.results) {
        globalResults = tmdbResults.results
          .filter((hit: any) => hit.media_type === 'movie' || hit.media_type === 'tv')
          .slice(0, 20)
          .map((hit: any) => discovery.searchHitToCard(hit));
      }
    }

    // Deduplicate: remove global results that match local TMDB IDs
    const localTmdbIds = new Set(localResults.map(r => r.tmdbId).filter(id => id > 0));
    const dedupedGlobal = globalResults.filter((r: any) => !localTmdbIds.has(r.tmdbId));

    res.json({
      query,
      local: localResults,
      global: dedupedGlobal,
      totalResults: localResults.length + dedupedGlobal.length,
    });
  }));

  // ── TMDB Global Discovery ───────────────────────────────────────────────────
  
  // Trending
  router.get('/tmdb/trending/movies/:timeWindow', apiLimiter, wrap(async (req, res) => {
    const { timeWindow } = req.params as { timeWindow: 'day' | 'week' };
    const page = Math.max(1, Number(req.query.page) || 1);
    if (timeWindow !== 'day' && timeWindow !== 'week') {
      return res.status(400).json({ error: 'invalid_time_window' });
    }
    const data = await svc.tmdb.getTrendingMovies(timeWindow, page);
    res.json(data);
  }));

  router.get('/tmdb/trending/tv/:timeWindow', apiLimiter, wrap(async (req, res) => {
    const { timeWindow } = req.params as { timeWindow: 'day' | 'week' };
    const page = Math.max(1, Number(req.query.page) || 1);
    if (timeWindow !== 'day' && timeWindow !== 'week') {
      return res.status(400).json({ error: 'invalid_time_window' });
    }
    const data = await svc.tmdb.getTrendingTv(timeWindow, page);
    res.json(data);
  }));

  // Popular
  router.get('/tmdb/popular/movies', apiLimiter, wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const data = await svc.tmdb.getPopularMovies(page);
    res.json(data);
  }));

  router.get('/tmdb/popular/tv', apiLimiter, wrap(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const data = await svc.tmdb.getPopularTv(page);
    res.json(data);
  }));

  // TMDB Details (for TMDB-only title pages)
  router.get('/tmdb/movie/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    const data = await svc.tmdb.getMovie(id);
    res.json(data);
  }));

  router.get('/tmdb/tv/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    const data = await svc.tmdb.getTv(id);
    res.json(data);
  }));

  // Resolve transparent title logo
  router.get('/tmdb/logo/:kind(movie|tv)/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.params.kind as 'movie' | 'tv';
    if (isNaN(id)) {
      return res.status(400).json({ error: 'invalid_id' });
    }
    const lang = resolveLang(req.query.lang);
    try {
      const imagesData = await svc.tmdb.getImages(kind, id);
      const logo = selectBestLogo(imagesData?.logos, lang);
      if (logo) {
        return res.json({
          logoUrl: tmdbArtworkUrl('logo', logo.filePath),
          logoRatio: logo.aspectRatio,
        });
      }
      return res.json({ logoUrl: null, logoRatio: null });
    } catch {
      return res.json({ logoUrl: null, logoRatio: null });
    }
  }));

  // TMDB Search
  router.get('/tmdb/search/movie', apiLimiter, wrap(async (req, res) => {
    const query = req.query.query as string;
    const page = Math.max(1, Number(req.query.page) || 1);
    if (!query || query.trim().length < 2) {
      return res.json({ results: [], total_results: 0, page: 1, total_pages: 0 });
    }
    const results = await svc.tmdb.search('movie', query);
    res.json({ results, total_results: results.length, page: 1, total_pages: 1 });
  }));

  router.get('/tmdb/search/tv', apiLimiter, wrap(async (req, res) => {
    const query = req.query.query as string;
    const page = Math.max(1, Number(req.query.page) || 1);
    if (!query || query.trim().length < 2) {
      return res.json({ results: [], total_results: 0, page: 1, total_pages: 0 });
    }
    const results = await svc.tmdb.search('tv', query);
    res.json({ results, total_results: results.length, page: 1, total_pages: 1 });
  }));

  // TMDB Videos (trailers)
  router.get('/tmdb/videos/:kind(movie|tv)/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.params.kind as 'movie' | 'tv';
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const data = await svc.tmdb.getVideos(kind, id);
    const videos = (data?.results || [])
      .filter((v: any) => v.site === 'YouTube')
      .sort((a: any, b: any) => {
        // Prioritize: Trailer > Teaser > everything else; official first
        const typeScore = (t: string) => t === 'Trailer' ? 3 : t === 'Teaser' ? 2 : 1;
        const diff = typeScore(b.type) - typeScore(a.type);
        if (diff !== 0) return diff;
        return (b.official ? 1 : 0) - (a.official ? 1 : 0);
      });
    res.json({ results: videos });
  }));

  // Native Trailer Sniffer (direct HLS stream without YouTube player/UI)
  router.get('/trailer/stream/:key', apiLimiter, wrap(async (req, res) => {
    const key = req.params.key;
    if (!key || !/^[\w-]{6,15}$/.test(key)) {
      return res.status(400).json({ error: 'invalid_key' });
    }
    const streamUrl = await trailerSniffer.sniffTrailer(key);
    if (!streamUrl) {
      return res.status(404).json({ error: 'trailer_stream_unavailable' });
    }
    res.json({ ok: true, streamUrl });
  }));

  // TMDB Recommendations
  router.get('/tmdb/recommendations/:kind(movie|tv)/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.params.kind as 'movie' | 'tv';
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const data = await svc.tmdb.getRecommendations(kind, id);
    res.json(data || { results: [], page: 1, total_pages: 0, total_results: 0 });
  }));

  // TMDB Similar
  router.get('/tmdb/similar/:kind(movie|tv)/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.params.kind as 'movie' | 'tv';
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const data = await svc.tmdb.getSimilar(kind, id);
    res.json(data || { results: [], page: 1, total_pages: 0, total_results: 0 });
  }));

  // TMDB Credits (cast & crew)
  router.get('/tmdb/credits/:kind(movie|tv)/:id', apiLimiter, wrap(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const kind = req.params.kind as 'movie' | 'tv';
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const data = await svc.tmdb.getCredits(kind, id);
    res.json(data || { id, cast: [], crew: [] });
  }));

  router.get('/library', apiLimiter, (req, res) => {
    const lang = resolveLang(req.query.lang);
    const list = [...store.titles.values()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .map((t) => present.summary(t, lang));
    res.json({ titles: list });
  });

  router.get('/titles/:id', apiLimiter, (req, res) => {
    const t = ID_RE.test(req.params.id) ? store.titles.get(req.params.id) : undefined;
    if (!t) return notFound(res);
    res.json(present.titleDetail(t, resolveLang(req.query.lang)));
  });

  router.get('/media/:id', apiLimiter, wrap(async (req, res) => {
    const id = req.params.id;
    const lang = resolveLang(req.query.lang);

    // Check if this is a synthetic streaming ID or canonical key
    if (
      id.startsWith('streaming-movie-') ||
      id.startsWith('streaming-tv-') ||
      id.startsWith('movie-') ||
      id.startsWith('tv-')
    ) {
      const summary = await present.streamingEpisodeSummary(id, lang);
      if (!summary) return notFound(res);

      let prevId: string | null = null;
      let nextId: string | null = null;

      if (summary.season !== null && summary.episode !== null) {
        const tvId = summary.titleId.replace(/^tv-/, '');
        if (summary.episode > 1) {
          prevId = `streaming-tv-${tvId}-${summary.season}-${summary.episode - 1}`;
        }
        nextId = `streaming-tv-${tvId}-${summary.season}-${summary.episode + 1}`;
      }

      return res.json({
        ...summary,
        width: null,
        height: null,
        playback: null, // Will trigger streaming fetch
        audioTracks: [],
        subtitles: [],
        sprite: null,
        prevId,
        nextId,
        tmdbId: parseInt(summary.titleId.replace(/^(?:movie|tv)-/, ''), 10) || undefined,
        tmdbType: summary.kind === 'movie' ? ('movie' as const) : ('tv' as const),
      });
    }

    // Regular local media lookup
    const m = ID_RE.test(id) ? store.media.get(id) : undefined;
    if (!m) return notFound(res);
    res.json(present.detail(m, lang));
  }));

  // ── admin ───────────────────────────────────────────────────────────────────
  router.post('/library/rescan', adminLimiter, requireAdmin, (_req, res) => {
    void svc.scan();
    res.status(202).json({ started: true });
  });
  router.get('/admin/library', adminLimiter, requireAdmin, (_req, res) => {
    res.json({ ...present.status(), warnings: svc.status.warnings });
  });

  /**
   * POST /api/admin/verify
   * Verify an admin token without exposing the actual token value.
   * Returns 200 { ok: true } on success, 401 on failure.
   */
  router.post('/admin/verify', adminLimiter, express.json(), requireAdmin, (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * GET /api/admin/stats
   * Dashboard statistics — library counts, active rooms, recent sessions.
   */
  router.get('/admin/stats', adminLimiter, requireAdmin, (req, res) => {
    // Get analytics data
    const analytics = analyticsTracker.getStats();
    
    // Get provider health stats
    const providerStats = providerRegistry.getAll().map((p) => ({
      id: p.id,
      name: p.name,
      enabled: providerRegistry.isEnabled(p.id),
      healthScore: providerHealth.getProviderScore(p.id),
      successRate: providerHealth.getSuccessRate(p.id),
      inCooldown: providerHealth.isProviderInCooldown(p.id),
      totalAttempts: providerHealth.getAttempts(p.id),
    }));
    
    // ── Library Stats ────────────────────────────────────────────────────────
    const allMedia = Array.from(store.media.values());
    const titles = Array.from(store.titles.values());
    const movies = titles.filter((t) => t.kind === 'movie');
    const episodes = allMedia.filter((m) => store.titles.get(m.titleId)?.kind === 'series');

    // Build "most watched" from progress store if available
    const progressData = deps.progress.getAll();
    const watchCounts: Record<string, { title: string; kind: string; watchCount: number; totalWatchTime: number; posterUrl?: string }> = {};
    for (const [_userId, entries] of Object.entries(progressData)) {
      for (const [mediaId, entry] of Object.entries(entries as Record<string, { t: number; d?: number }>)) {
        const m = store.media.get(mediaId);
        if (!m) continue;
        const title = store.titles.get(m.titleId);
        if (!watchCounts[mediaId]) {
          watchCounts[mediaId] = {
            title: title ? present.titleName(title, 'en') : (m.titleHint ?? mediaId),
            kind: title?.kind === 'movie' ? 'movie' : 'series',
            watchCount: 0,
            totalWatchTime: 0,
            posterUrl: (title && present.posterUrl(title)) ?? undefined,
          };
        }
        watchCounts[mediaId].watchCount += 1;
        watchCounts[mediaId].totalWatchTime += (entry as any).t ?? 0;
      }
    }
    const mostWatched = Object.entries(watchCounts)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 20);

    // Merge with streaming analytics
    const topStreaming = analytics.topStreaming.map((s) => ({
      id: s.kind === 'movie' ? `streaming-movie-${s.tmdbId}` : `streaming-tv-${s.tmdbId}-${s.season}-${s.episode}`,
      title: s.season && s.episode ? `${s.title} S${s.season}E${s.episode}` : s.title,
      kind: s.kind,
      watchCount: s.watchCount,
      totalWatchTime: 0,
      posterUrl: undefined,
    }));

    // Total watch time across all users & media
    const totalWatchTime = Object.values(watchCounts).reduce((sum, v) => sum + v.totalWatchTime, 0);

    // Count unique users from progress + analytics
    const progressUsers = Object.keys(progressData).length;
    const totalUsers = Math.max(progressUsers, analytics.totalUsers);

    // ── Room Stats (from realtime hub) ───────────────────────────────────────
    const roomStats = (deps as any).getRoomStats?.() ?? { activeRooms: 0, totalRooms: 0 };

    // ── Recent Activity ──────────────────────────────────────────────────────
    const recentRaw = deps.progress.getRecentActivity(20);
    const recentActivity = recentRaw.map((e) => {
      const m = store.media.get(e.mediaId);
      const titleObj = m ? store.titles.get(m.titleId) : undefined;
      const label = titleObj ? present.titleName(titleObj, 'en') : e.mediaId;
      const pct = Math.round(e.progress * 100);
      return {
        userId: e.userId.slice(0, 8),
        userName: `User ${e.userId.slice(0, 4)}`,
        action: `watched "${label}" — ${pct}% (via ${e.provider})`,
        timestamp: e.at,
      };
    });

    res.json({
      totalUsers,
      activeSessions: analytics.activeSessions,
      totalWatchTime,
      mostWatchedContent: [...topStreaming, ...mostWatched].slice(0, 20),
      trafficSources: analytics.trafficSources,
      recentActivity,
      activeRooms: roomStats.activeRooms,
      totalRooms: roomStats.totalRooms,
      library: {
        movies: movies.length,
        episodes: episodes.length,
        total: allMedia.length,
      },
      streaming: {
        activeBrowserSessions: streamResolver.getActiveBrowserCount(),
        maxBrowserSessions: 3,
      },
      providers: providerStats,
    });
  });

  // ── Provider Health Reporting ──────────────────────────────────────────────
  /**
   * POST /api/playback/report-failure
   * Report a playback failure for provider health tracking
   */
  router.post('/playback/report-failure', express.json(), (req, res) => {
    const { provider, sourceUrl, failureType, responseStatus, errorDetails } = req.body;
    
    if (!provider || !sourceUrl || !failureType) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const { providerHealth } = require('../streaming/provider-health');
    
    providerHealth.recordFailure({
      provider,
      sourceUrl: sourceUrl.substring(0, 200), // Truncate long URLs
      failureType,
      timestamp: Date.now(),
      responseStatus,
      errorDetails: errorDetails?.substring(0, 500), // Limit error details
    });

    res.json({ recorded: true });
  });

  /**
   * POST /api/playback/report-success
   * Report successful playback for provider health tracking
   */
  router.post('/playback/report-success', express.json(), (req, res) => {
    const { provider, sourceUrl } = req.body;
    
    if (!provider || !sourceUrl) {
      return res.status(400).json({ error: 'missing_required_fields' });
    }

    const { providerHealth } = require('../streaming/provider-health');
    
    providerHealth.recordSuccess(provider, sourceUrl.substring(0, 200));

    res.json({ recorded: true });
  });

  /**
   * GET /api/playback/provider-health
   * Get provider health statistics (admin/debugging)
   */
  router.get('/playback/provider-health', (req, res) => {
    const { providerHealth } = require('../streaming/provider-health');
    
    const stats = Array.from(providerHealth.getAllStats().values()).map((stat: any) => ({
      provider: stat.provider,
      totalAttempts: stat.totalAttempts,
      successfulAttempts: stat.successfulAttempts,
      successRate: stat.totalAttempts > 0 
        ? (stat.successfulAttempts / stat.totalAttempts * 100).toFixed(1) + '%'
        : 'N/A',
      failures: Object.fromEntries(stat.failures),
      lastSuccess: stat.lastSuccess ? new Date(stat.lastSuccess).toISOString() : null,
      lastFailure: stat.lastFailure ? new Date(stat.lastFailure).toISOString() : null,
      inCooldown: providerHealth.isProviderInCooldown(stat.provider),
      healthScore: providerHealth.getProviderScore(stat.provider).toFixed(2),
    }));

    res.json({ providers: stats });
  });

  /**
   * ── Public Multi-Provider Management Endpoints ──────────────────────
   * Anyone can access these to inspect, toggle, test, and reset providers.
   */

  /**
   * GET /api/streaming/providers
   * Get all streaming providers, their active/enabled status, and health scores
   */
  router.get('/streaming/providers', apiLimiter, (_req, res) => {
    res.json({
      providers: providerRegistry.getStatuses(),
      streamingEnabled,
    });
  });

  /**
   * POST /api/streaming/providers/:id/toggle
   * Enable or disable a streaming provider (state is persisted, requires admin)
   */
  router.post('/streaming/providers/:id/toggle', apiLimiter, requireAdmin, express.json(), (req, res) => {
    const { id } = req.params;
    const adapter = providerRegistry.get(id);
    if (!adapter) {
      return res.status(404).json({ error: 'provider_not_found', message: `Provider '${id}' not found` });
    }

    const currentEnabled = providerRegistry.isEnabled(id);
    const targetEnabled = typeof req.body?.enabled === 'boolean' ? req.body.enabled : !currentEnabled;
    const newStatus = providerRegistry.setEnabled(id, targetEnabled);

    res.json({
      success: true,
      id: adapter.id,
      name: adapter.name,
      isEnabled: newStatus,
      status: providerRegistry.getStatuses().find((p) => p.id === adapter.id),
    });
  });

  /**
   * POST /api/streaming/providers/:id/test
   * Run a live resolution test for a provider (requires admin)
   */
  router.post('/streaming/providers/:id/test', apiLimiter, requireAdmin, express.json(), wrap(async (req, res) => {
    const { id } = req.params;
    const adapter = providerRegistry.get(id);
    if (!adapter) {
      return res.status(404).json({ error: 'provider_not_found' });
    }

    const tmdbId = parseInt(req.body?.tmdbId, 10) || 1368337;
    const kind = req.body?.kind === 'series' ? 'series' : 'movie';
    const season = req.body?.season ? parseInt(req.body.season, 10) : undefined;
    const episode = req.body?.episode ? parseInt(req.body.episode, 10) : undefined;

    const result = await providerRegistry.testProvider(id, {
      tmdbId,
      kind,
      season,
      episode,
    });

    res.json(result);
  }));

  /**
   * POST /api/streaming/providers/reset-cooldowns
   * Reset all provider cooldowns and failure history (requires admin)
   */
  router.post('/streaming/providers/reset-cooldowns', apiLimiter, requireAdmin, (_req, res) => {
    const { providerHealth } = require('../streaming/provider-health');
    providerHealth.resetAllCooldowns();
    res.json({
      success: true,
      message: 'All cooldowns and failure metrics have been reset',
      providers: providerRegistry.getStatuses(),
    });
  });

  /**
   * POST /api/streaming/resolve-native
   * Resolves a direct HLS stream for native player playback
   */
  router.post('/streaming/resolve-native', apiLimiter, express.json(), wrap(async (req, res) => {
    const tmdbId = parseInt(req.body?.tmdbId, 10);
    if (!tmdbId || isNaN(tmdbId)) {
      return res.status(400).json({ error: 'invalid_tmdb_id' });
    }
    const kind = req.body?.kind === 'series' ? 'series' : 'movie';
    const season = req.body?.season ? parseInt(req.body.season, 10) : undefined;
    const episode = req.body?.episode ? parseInt(req.body.episode, 10) : undefined;
    const provider = req.body?.provider ? String(req.body.provider).replace(/\s*\([^)]*\)/g, '').trim() : undefined;
    let targetUrl = (req.body?.targetUrl || req.body?.embedUrl) ? String(req.body.targetUrl || req.body.embedUrl) : undefined;

    // Guard against SSRF / protocol smuggling in targetUrl
    if (targetUrl && !isSafePublicUrl(targetUrl)) {
      return res.status(400).json({ error: 'invalid_target_url', message: 'Target URL is not an allowed public HTTP(S) address' });
    }

    // Fallback: If targetUrl is missing but provider is Arabic, resolve targetUrl via ArabAdapter
    if (!targetUrl && provider && /arab|moviz|seed/i.test(provider)) {
      const arabAdapter = providerRegistry.get('arab-media');
      if (arabAdapter) {
        try {
          const arabResult = await arabAdapter.resolve({ tmdbId, kind, season, episode });
          if (arabResult.sources && arabResult.sources.length > 0) {
            targetUrl = arabResult.sources[0].embedUrl || arabResult.sources[0].url;
          }
        } catch {}
      }
    }

    try {
      const resolved = await streamResolver.resolve({ tmdbId, kind, season, episode, provider, targetUrl });
      const isMp4 = resolved.playlistUrl.includes('.mp4') && !resolved.playlistUrl.includes('.m3u8');
      res.json({
        ok: true,
        streamId: resolved.id,
        streamUrl: isMp4 ? resolved.playlistUrl : `/api/stream-proxy/master/${resolved.id}.m3u8`,
        provider: resolved.provider,
        type: isMp4 ? 'mp4' : 'hls',
      });
    } catch (err: any) {
      console.error('[Streaming] resolve-native failed:', err.message);
      res.status(502).json({
        ok: false,
        error: 'resolution_failed',
        message: err.message,
      });
    }
  }));

  /**
   * POST /api/streaming/prewarm
   * Pre-warms/caches stream in background (e.g. for next episode)
   */
  router.post('/streaming/prewarm', apiLimiter, express.json(), (req, res) => {
    const tmdbId = parseInt(req.body?.tmdbId, 10);
    if (!tmdbId || isNaN(tmdbId)) {
      return res.status(400).json({ error: 'invalid_tmdb_id' });
    }
    const kind = req.body?.kind === 'series' ? 'series' : 'movie';
    const season = req.body?.season ? parseInt(req.body.season, 10) : undefined;
    const episode = req.body?.episode ? parseInt(req.body.episode, 10) : undefined;

    void streamResolver.resolve({ tmdbId, kind, season, episode }).catch(() => {});
    res.json({ ok: true, prewarming: true });
  });

  // Mount HLS Stream Proxy
  router.use('/stream-proxy', streamProxyRouter);
  
  // Mount Provider Stream Proxy (for Dizibal, etc.)
  router.use('/provider-stream-proxy', providerStreamProxyRouter);

  // Mount Sports Live Stream Proxy (for beIN Sports HD 100% ad-free native HLS)
  router.use('/sports', sportsRouter);

  router.use((_req, res) => notFound(res));
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api]', err.message);
    res.status(500).json({ error: 'internal_error' });
  });

  return { router, adminToken };
}
