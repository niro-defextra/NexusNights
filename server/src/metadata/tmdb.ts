import path from 'node:path';
import type { Config } from '../config';
import { readJson, shortId, writeJsonAtomic } from '../util/fsx';

export interface TmdbSearchHit {
  id: number;
  name?: string;
  original_name?: string;
  title?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  popularity?: number;
}
export interface TmdbGenre { id: number; name: string }
export interface TmdbLogo {
  aspect_ratio: number;
  height: number;
  width: number;
  file_path: string;
  iso_639_1: string | null;
  vote_average?: number;
  vote_count?: number;
}
export interface TmdbImagesResponse {
  id: number;
  backdrops?: Array<{ file_path: string }>;
  posters?: Array<{ file_path: string }>;
  logos?: TmdbLogo[];
}
export interface TmdbTv {
  id: number; name: string; original_name?: string; original_language?: string; overview?: string; tagline?: string; genres?: TmdbGenre[];
  poster_path?: string | null; backdrop_path?: string | null; first_air_date?: string;
  vote_average?: number; status?: string;
}
export interface TmdbMovie {
  id: number; title: string; original_title?: string; original_language?: string; overview?: string; tagline?: string; genres?: TmdbGenre[];
  poster_path?: string | null; backdrop_path?: string | null; release_date?: string;
  runtime?: number; vote_average?: number; status?: string;
}
export interface TmdbEpisode {
  episode_number: number; 
  season_number?: number;
  name?: string; 
  overview?: string; 
  air_date?: string;
  runtime?: number | null; 
  still_path?: string | null; 
  vote_average?: number;
}
export interface TmdbSeason { 
  season_number: number; 
  name?: string; 
  overview?: string;
  poster_path?: string | null;
  air_date?: string | null;
  episode_count?: number;
  episodes?: TmdbEpisode[];
}

export interface TmdbTvDetail extends TmdbTv {
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TmdbSeason[];
  episode_run_time?: number[];
}

export interface TmdbPagedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface TmdbVideo {
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
  key: string;
  site: string;
  size: number;
  type: string;
  official: boolean;
  published_at: string;
  id: string;
}

type Params = Record<string, string | number | undefined>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Minimal TMDB v3 client with:
 *  - v3 API key OR v4 bearer token (auto-detected)
 *  - on-disk cache (data/cache/tmdb) with TTL, negative caching for 404s
 *  - stale-if-error: if TMDB is down we keep serving the expired cache
 *  - retry/backoff on 429 / 5xx and a hard timeout per request
 */
export class TmdbClient {
  private memCache = new Map<string, { fetchedAt: number; data: any }>();

  constructor(private cfg: Config) {}

  get enabled(): boolean {
    return !!this.cfg.tmdb.apiKey;
  }

  private async request<T>(endpoint: string, params: Params = {}): Promise<T | null> {
    const entries = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const cacheKey = endpoint + ':' + JSON.stringify(entries);
    const ttl = this.cfg.tmdb.cacheDays * 86_400_000;

    // L1: In-memory cache (< 1ms lookup)
    const mem = this.memCache.get(cacheKey);
    if (mem && Date.now() - mem.fetchedAt < ttl) {
      return mem.data as T;
    }

    // L2: On-disk cache
    const file = path.join(this.cfg.cacheDir, 'tmdb', `${shortId(cacheKey, 24)}.json`);
    const cached = await readJson<{ fetchedAt: number; data: T | null }>(file);
    if (cached && Date.now() - cached.fetchedAt < ttl) {
      this.memCache.set(cacheKey, { fetchedAt: cached.fetchedAt, data: cached.data });
      return cached.data;
    }

    try {
      const data = await this.fetchJson<T>(endpoint, entries);
      this.memCache.set(cacheKey, { fetchedAt: Date.now(), data });
      await writeJsonAtomic(file, { fetchedAt: Date.now(), data });
      return data;
    } catch (e) {
      if (cached) {
        this.memCache.set(cacheKey, { fetchedAt: cached.fetchedAt, data: cached.data });
        return cached.data; // stale-if-error
      }
      throw e;
    }
  }

  private async fetchJson<T>(endpoint: string, entries: [string, string | number | undefined][]): Promise<T | null> {
    const key = this.cfg.tmdb.apiKey!;
    const url = new URL(this.cfg.tmdb.baseUrl + endpoint);
    for (const [k, v] of entries) url.searchParams.set(k, String(v));
    const bearer = key.length > 60 && key.includes('.');
    if (!bearer) url.searchParams.set('api_key', key);

    let lastErr: Error = new Error('TMDB request failed');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { accept: 'application/json', ...(bearer ? { authorization: `Bearer ${key}` } : {}) },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 404) return null;
        if (res.status === 429) {
          const wait = Math.min(10, Number(res.headers.get('retry-after')) || 2);
          lastErr = new Error('TMDB rate limited');
          await sleep(wait * 1000);
          continue;
        }
        if (res.status === 401) throw Object.assign(new Error('TMDB rejected the API key (401)'), { fatal: true });
        if (!res.ok) throw new Error(`TMDB HTTP ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e as Error;
        if ((e as { fatal?: boolean }).fatal) throw e;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  async search(kind: 'tv' | 'movie', query: string, year?: number): Promise<TmdbSearchHit[]> {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    const r = await this.request<{ results: TmdbSearchHit[] }>(`/search/${kind}`, {
      query,
      language: lang,
      include_adult: 'false',
      ...(year ? (kind === 'tv' ? { first_air_date_year: year } : { year }) : {}),
    });
    return r?.results ?? [];
  }

  tv(id: number, language: string) {
    return this.request<TmdbTv>(`/tv/${id}`, { language });
  }
  movie(id: number, language: string) {
    return this.request<TmdbMovie>(`/movie/${id}`, { language });
  }
  season(id: number, season: number, language: string) {
    return this.request<TmdbSeason>(`/tv/${id}/season/${season}`, { language });
  }

  // ── Global Discovery Methods ───────────────────────────────────────────────

  async getTrendingMovies(timeWindow: 'day' | 'week' = 'day', page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>(`/trending/movie/${timeWindow}`, { page, language: lang });
  }

  async getTrendingTv(timeWindow: 'day' | 'week' = 'day', page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>(`/trending/tv/${timeWindow}`, { page, language: lang });
  }

  async getPopularMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>('/movie/popular', { page, language: lang });
  }

  async getPopularTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{ results: TmdbSearchHit[] }>('/tv/popular', { page, language: lang });
  }

  async getMovie(id: number) {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbMovie>(`/movie/${id}`, { language: lang });
  }

  async getTv(id: number) {
    const lang = this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbTv>(`/tv/${id}`, { language: lang });
  }

  // ── Extended Discovery Methods (Stage 5) ───────────────────────────────────

  async getTopRatedMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/top_rated', { page, language: lang });
  }

  async getTopRatedTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/top_rated', { page, language: lang });
  }

  async getNowPlayingMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/now_playing', { page, language: lang });
  }

  async getUpcomingMovies(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/movie/upcoming', { page, language: lang });
  }

  async getOnTheAirTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/on_the_air', { page, language: lang });
  }

  async getAiringTodayTv(page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>('/tv/airing_today', { page, language: lang });
  }

  async searchMulti(query: string, page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit & { media_type?: 'movie' | 'tv' }>>('/search/multi', {
      query,
      page,
      language: lang,
      include_adult: 'false'
    });
  }

  async getTvDetail(id: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbTvDetail>(`/tv/${id}`, { language: lang });
  }

  async getMovieDetail(id: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbMovie>(`/movie/${id}`, { language: lang });
  }

  async getSeasonDetail(tvId: number, seasonNumber: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbSeason>(`/tv/${tvId}/season/${seasonNumber}`, { language: lang });
  }

  async getImageConfig() {
    return this.request<{
      images: {
        secure_base_url: string;
        backdrop_sizes: string[];
        poster_sizes: string[];
        still_sizes: string[];
      }
    }>('/configuration');
  }

  async getImages(kind: 'movie' | 'tv', id: number): Promise<TmdbImagesResponse | null> {
    return this.request<TmdbImagesResponse>(`/${kind}/${id}/images`);
  }

  async getVideos(kind: 'movie' | 'tv', id: number, language?: string) {
    if (language) {
      const localized = await this.request<{ id: number; results: TmdbVideo[] }>(`/${kind}/${id}/videos`, { language });
      if (localized?.results && localized.results.length > 0) return localized;
    }
    // Query without language filter to get all available trailers
    const all = await this.request<{ id: number; results: TmdbVideo[] }>(`/${kind}/${id}/videos`, {});
    if (all?.results && all.results.length > 0) return all;

    return this.request<{ id: number; results: TmdbVideo[] }>(`/${kind}/${id}/videos`, { language: 'en-US' });
  }

  async getCredits(kind: 'movie' | 'tv', id: number, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<{
      id: number;
      cast: Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
        known_for_department: string;
      }>;
      crew: Array<{
        id: number;
        name: string;
        job: string;
        department: string;
        profile_path: string | null;
      }>;
    }>(`/${kind}/${id}/credits`, { language: lang });
  }

  async getRecommendations(kind: 'movie' | 'tv', id: number, page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>(`/${kind}/${id}/recommendations`, { page, language: lang });
  }

  async getSimilar(kind: 'movie' | 'tv', id: number, page = 1, language?: string) {
    const lang = language ?? this.cfg.tmdb.languages[0] ?? 'en-US';
    return this.request<TmdbPagedResponse<TmdbSearchHit>>(`/${kind}/${id}/similar`, { page, language: lang });
  }
}

/**
 * Select the highest quality title logo according to the website's chosen language:
 * - If site is in Arabic ('ar'): prioritize Arabic ('ar') -> English ('en') -> Original language -> Best fallback.
 * - If site is in English ('en'): prioritize English ('en') -> Original language -> Arabic ('ar') -> Best fallback.
 * - Otherwise: prioritize preferredLang -> originalLanguage -> English -> Best fallback.
 */
export function selectBestLogo(
  logos: TmdbLogo[] | undefined,
  preferredLang: string = 'en',
  originalLanguage?: string
): { filePath: string; aspectRatio: number } | null {
  if (!logos || logos.length === 0) return null;

  const targetLang = (preferredLang || 'en').toLowerCase().split('-')[0];
  const origLang = originalLanguage ? originalLanguage.toLowerCase().split('-')[0] : undefined;

  // 1. Direct match with current website language (e.g. 'en' or 'ar')
  const directMatch = logos.find((l) => l.iso_639_1?.toLowerCase() === targetLang && l.file_path);
  if (directMatch) return { filePath: directMatch.file_path, aspectRatio: directMatch.aspect_ratio || 1 };

  if (targetLang === 'ar') {
    // When Arabic is selected but no Arabic logo exists, prefer English, then original language
    const en = logos.find((l) => l.iso_639_1?.toLowerCase() === 'en' && l.file_path);
    if (en) return { filePath: en.file_path, aspectRatio: en.aspect_ratio || 1 };

    if (origLang && origLang !== 'ar' && origLang !== 'en') {
      const orig = logos.find((l) => l.iso_639_1?.toLowerCase() === origLang && l.file_path);
      if (orig) return { filePath: orig.file_path, aspectRatio: orig.aspect_ratio || 1 };
    }
  } else {
    // When English (or other lang) is selected:
    // 2. Try original language
    if (origLang && origLang !== 'en') {
      const orig = logos.find((l) => l.iso_639_1?.toLowerCase() === origLang && l.file_path);
      if (orig) return { filePath: orig.file_path, aspectRatio: orig.aspect_ratio || 1 };
    }

    // 3. Try English if not already checked
    if (targetLang !== 'en') {
      const en = logos.find((l) => l.iso_639_1?.toLowerCase() === 'en' && l.file_path);
      if (en) return { filePath: en.file_path, aspectRatio: en.aspect_ratio || 1 };
    }
  }

  // 4. Any other language sorted by vote count / score
  const sorted = [...logos]
    .filter((l) => Boolean(l.file_path))
    .sort((a, b) => (b.vote_average ?? 0) * (b.vote_count ?? 1) - (a.vote_average ?? 0) * (a.vote_count ?? 1));

  if (sorted[0]) {
    return { filePath: sorted[0].file_path, aspectRatio: sorted[0].aspect_ratio || 1 };
  }

  return null;
}
