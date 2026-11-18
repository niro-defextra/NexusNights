/**
 * Playback Orchestrator
 * Custom multi-provider playback engine with source validation, health ranking, and automatic failover.
 */

import { providerRegistry, ProviderRegistry } from './provider-registry';
import { providerHealth, ProviderHealthTracker } from './provider-health';
import type {
  ProviderMediaRequest,
  ProviderSource,
  PlaybackConfig,
  PlaybackSource,
  PlaybackDiagnostic,
} from './types';

export class PlaybackOrchestrator {
  constructor(
    private registry: ProviderRegistry = providerRegistry,
    private health: ProviderHealthTracker = providerHealth
  ) {}

  /**
   * Resolve playback configuration for a movie across all supported providers
   */
  async resolveMovie(
    tmdbId: number,
    imdbId?: string,
    _localTitleId?: string
  ): Promise<PlaybackConfig> {
    if ((!tmdbId || tmdbId <= 0) && !imdbId) {
      return this.emptyConfig('Invalid media identifier');
    }

    const req: ProviderMediaRequest = {
      tmdbId,
      imdbId,
      kind: 'movie',
    };

    return this.orchestrate(req);
  }

  /**
   * Resolve playback configuration for a TV episode across all supported providers
   */
  async resolveTV(
    tmdbId: number,
    season: number,
    episode: number,
    imdbId?: string,
    _localTitleId?: string
  ): Promise<PlaybackConfig> {
    if ((!tmdbId || tmdbId <= 0) && !imdbId) {
      return this.emptyConfig('Invalid media identifier');
    }

    const req: ProviderMediaRequest = {
      tmdbId,
      imdbId,
      kind: 'series',
      season,
      episode,
    };

    return this.orchestrate(req);
  }

  private classificationCache = new Map<string, { data: { isTurkish: boolean; isAnime: boolean }; exp: number }>();

  /**
   * Classify content language and genre via TMDB (cached)
   */
  private async classifyContent(tmdbId: number, kind: 'movie' | 'series'): Promise<{ isTurkish: boolean; isAnime: boolean }> {
    const cacheKey = `${kind}-${tmdbId}`;
    const cached = this.classificationCache.get(cacheKey);
    if (cached && Date.now() < cached.exp) {
      return cached.data;
    }

    const fallback = { isTurkish: false, isAnime: false };
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) {
      return fallback;
    }

    try {
      const endpoint = kind === 'movie' ? 'movie' : 'tv';
      const isBearer = TMDB_API_KEY.startsWith('eyJ');
      const headers: Record<string, string> = isBearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {};
      const apiParam = isBearer ? '' : `?api_key=${TMDB_API_KEY}`;
      
      const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}${apiParam}`;
      const response = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) return fallback;
      
      const data = await response.json() as {
        original_language?: string;
        origin_country?: string[];
        production_countries?: Array<{ iso_3166_1?: string }>;
        genres?: Array<{ id: number; name: string }>;
      };

      const lang = (data.original_language || '').toLowerCase();
      const originCountries = [
        ...(Array.isArray(data.origin_country) ? data.origin_country : []),
        ...(Array.isArray(data.production_countries) ? data.production_countries.map((c) => c.iso_3166_1 || '') : []),
      ].map((c) => c.toUpperCase());

      const genres = Array.isArray(data.genres) ? data.genres.map((g) => g.id) : [];

      const isTurkish = lang === 'tr' || originCountries.includes('TR');
      const isAnime = lang === 'ja' || (genres.includes(16) && (originCountries.includes('JP') || lang === 'ja'));

      const result = { isTurkish, isAnime };
      this.classificationCache.set(cacheKey, { data: result, exp: Date.now() + 2 * 3600 * 1000 });
      return result;
    } catch {
      return fallback;
    }
  }

  /**
   * Query supported providers, validate and rank sources
   */
  private async orchestrate(req: ProviderMediaRequest): Promise<PlaybackConfig> {
    let activeProviders = this.registry.getActive().filter((p) =>
      p.supportedTypes.includes(req.kind)
    );

    const diagnostics: PlaybackDiagnostic[] = [];

    // Intelligent content classification: route Turkish to Dizibal, Anime to HiAnime
    const { isTurkish, isAnime } = await this.classifyContent(req.tmdbId, req.kind);

    if (isTurkish) {
      diagnostics.push({
        code: 'TURKISH_CONTENT_DETECTED',
        message: 'Turkish content detected - prioritizing Dizibal provider',
        severity: 'info',
      });
      // Move Dizibal to index 0, filter out anime-specific providers
      activeProviders = activeProviders.filter((p) => p.id !== 'hianime');
      const dizibal = activeProviders.find((p) => p.id === 'dizibal');
      if (dizibal) {
        activeProviders = [dizibal, ...activeProviders.filter((p) => p.id !== 'dizibal')];
      }
    } else if (isAnime) {
      diagnostics.push({
        code: 'ANIME_CONTENT_DETECTED',
        message: 'Anime detected - prioritizing HiAnime provider for direct native HLS & soft subtitles',
        severity: 'info',
      });
      // Move HiAnime to index 0, filter out Turkish-specific Dizibal
      activeProviders = activeProviders.filter((p) => p.id !== 'dizibal');
      const hianime = activeProviders.find((p) => p.id === 'hianime');
      if (hianime) {
        activeProviders = [hianime, ...activeProviders.filter((p) => p.id !== 'hianime')];
      }
    } else {
      // General Hollywood / International content: filter out language-specific scrapers
      activeProviders = activeProviders.filter((p) => p.id !== 'dizibal' && p.id !== 'hianime');
    }

    // Note disabled providers in diagnostics
    const disabled = this.registry.getSupported().filter((p) => !this.registry.isEnabled(p.id));
    for (const d of disabled) {
      diagnostics.push({
        code: 'PROVIDER_DISABLED',
        message: `[${d.name}] Provider is currently disabled by user`,
        severity: 'info',
      });
    }

    if (activeProviders.length === 0) {
      return {
        source: null,
        alternatives: [],
        subtitles: [],
        canAutoSwitch: false,
        diagnostics: [
          ...diagnostics,
          {
            code: 'NO_ACTIVE_PROVIDERS',
            message: 'All supported streaming providers are currently disabled or unavailable',
            severity: 'warning',
          },
        ],
      };
    }

    const allSources: ProviderSource[] = [];

    // Query all active provider adapters in parallel with timeout safety
    const adapterTimeout = parseInt(process.env.PROVIDER_RESOLVE_TIMEOUT || '12000', 10);
    const results = await Promise.allSettled(
      activeProviders.map((p) =>
        Promise.race([
          p.resolve(req),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Provider resolution timeout')), adapterTimeout)
          ),
        ])
      )
    );

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const provider = activeProviders[i];

      if (res.status === 'fulfilled') {
        const val = res.value;
        if (val.sources && val.sources.length > 0) {
          allSources.push(...val.sources);
        }
        if (val.diagnostics && val.diagnostics.length > 0) {
          val.diagnostics.forEach((d) =>
            diagnostics.push({
              code: 'PROVIDER_DIAGNOSTIC',
              message: `[${provider.name}] ${d}`,
              severity: 'info',
            })
          );
        }
      } else {
        diagnostics.push({
          code: 'PROVIDER_RESOLUTION_FAILED',
          message: `[${provider.name}] Failed to resolve: ${(res.reason as Error)?.message || 'unknown error'}`,
          severity: 'warning',
        });
      }
    }

    // Also include unsupported providers in diagnostics if any were queried
    const unsupported = this.registry.getAll().filter((p) => !p.isSupported);
    for (const u of unsupported) {
      diagnostics.push({
        code: 'PROVIDER_UNSUPPORTED',
        message: `[${u.name}] Unsupported provider: no authorized open playback API or embed`,
        severity: 'info',
      });
    }

    if (allSources.length === 0) {
      return {
        source: null,
        alternatives: [],
        subtitles: [],
        canAutoSwitch: false,
        diagnostics,
      };
    }

    // Rank sources using health tracking & provider diversity
    const ranked = this.rankSources(allSources);
    const best = ranked[0] || null;
    const alternatives = ranked.slice(1, 6);

    const normalizedBest = best ? this.normalizeSource(best) : null;
    const normalizedAlts = alternatives.map((s) => this.normalizeSource(s));

    return {
      source: normalizedBest,
      alternatives: normalizedAlts,
      subtitles: normalizedBest?.subtitles || [],
      canAutoSwitch: alternatives.length > 0,
      diagnostics,
    };
  }

  /**
   * Rank sources by base priority, live provider health score, cooldown status, and provider diversity
   */
  private rankSources(sources: ProviderSource[]): ProviderSource[] {
    const scored = sources.map((source) => {
      const pId = source.providerId.toLowerCase();
      let score = source.priority;

      // Direct stream boost: local player (HLS / MP4) provides synchronized playback in Discord
      if (!source.isEmbed || source.type === 'hls' || source.type === 'mp4') {
        score += 80;
      }

      // Quality scoring
      if (source.quality.includes('1080')) score += 10;
      else if (source.quality.includes('720')) score += 5;

      // Health score multiplier
      const healthScore = this.health.getProviderScore(pId);
      const inCooldown = this.health.isProviderInCooldown(pId);
      const sourceFailed = this.health.isSourceFailed(source.url);

      if (inCooldown) score *= 0.1;
      if (sourceFailed) score *= 0.2;
      score *= 0.5 + healthScore * 0.5;

      return { source, score };
    });

    // Initial sort
    scored.sort((a, b) => b.score - a.score);

    // Apply provider diversity penalty so alternatives prioritize different providers for resilience
    const providerCounts = new Map<string, number>();
    const diverseScored = scored.map((item) => {
      const pId = item.source.providerId.toLowerCase();
      const count = providerCounts.get(pId) || 0;
      providerCounts.set(pId, count + 1);
      return {
        source: item.source,
        score: item.score - count * 25,
      };
    });

    diverseScored.sort((a, b) => b.score - a.score);

    console.log('[PlaybackOrchestrator] Source ranking:');
    diverseScored.slice(0, 5).forEach((item, idx) => {
      console.log(
        `  ${idx + 1}. ${item.source.providerName} (${item.source.type}) - Score: ${item.score.toFixed(1)}`
      );
    });

    return diverseScored.map((s) => s.source);
  }

  private normalizeSource(source: ProviderSource): PlaybackSource {
    return {
      url: source.url,
      type: source.type,
      embedUrl: source.embedUrl, // Preserve embed URL for server-side streaming
      quality: source.quality,
      provider: source.providerName,
      isEmbed: source.isEmbed,
      audioTracks: source.audioTracks,
      id: source.id, // Keep for proxy registration
      headers: source.headers, // Keep for proxy
      subtitles: source.subtitles, // Keep provider subtitles
    };
  }

  private emptyConfig(errorMessage: string): PlaybackConfig {
    return {
      source: null,
      alternatives: [],
      subtitles: [],
      canAutoSwitch: false,
      diagnostics: [
        {
          code: 'NO_SOURCES',
          message: errorMessage,
          severity: 'error',
        },
      ],
    };
  }
}

// Global orchestrator singleton instance
export const playbackOrchestrator = new PlaybackOrchestrator();
