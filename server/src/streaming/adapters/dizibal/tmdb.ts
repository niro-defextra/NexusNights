/**
 * TMDB API Integration for Dizibal Provider
 */

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// In-memory cache for TMDB results (2 hour TTL)
const tmdbCache = new Map<string, { data: TmdbInfo; exp: number }>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function getTmdbApiKey(): string {
  return process.env.TMDB_API_KEY || '';
}

export interface TmdbInfo {
  title: string;
  originalTitle: string;
  turkishTitle: string;
  originalLanguage: string;
  year: string;
  posterPath: string | null;
}

interface TmdbResponse {
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
}

/**
 * Get TMDB info including Turkish title
 */
export async function getTmdbInfo(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<TmdbInfo> {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = tmdbCache.get(cacheKey);
  if (cached && Date.now() < cached.exp) {
    return cached.data;
  }

  const fallback: TmdbInfo = {
    title: '',
    originalTitle: '',
    turkishTitle: '',
    originalLanguage: '',
    year: '',
    posterPath: null,
  };

  const TMDB_API_KEY = getTmdbApiKey();
  if (!TMDB_API_KEY) {
    console.warn('[Dizibal] TMDB_API_KEY not configured, using fallback');
    return fallback;
  }

  const endpoint = mediaType === 'movie' ? 'movie' : 'tv';
  
  // Check if key is Bearer token (v4) or API key (v3)
  const isBearer = TMDB_API_KEY.startsWith('eyJ');
  const headers: Record<string, string> = isBearer
    ? { Authorization: `Bearer ${TMDB_API_KEY}` }
    : {};
  const apiParam = isBearer ? '' : `?api_key=${TMDB_API_KEY}&`;
  
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}${apiParam}${isBearer ? '?' : ''}language=en-US`;

  try {
    const response = await fetch(url, {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      console.warn(`[Dizibal] TMDB API HTTP ${response.status} for ${mediaType}/${tmdbId}`);
      return fallback;
    }

    const data = (await response.json()) as TmdbResponse;

    // Get Turkish title
    const urlTr = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}${apiParam}${isBearer ? '?' : ''}language=tr-TR`;
    let turkishTitle = '';

    try {
      const responseTr = await fetch(urlTr, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        signal: AbortSignal.timeout(4000),
      });
      if (responseTr.ok) {
        const dataTr = (await responseTr.json()) as TmdbResponse;
        turkishTitle = dataTr.title || dataTr.name || '';
      }
    } catch {
      // Turkish title is optional
    }

    const title = data.title || data.name || '';
    const originalTitle = data.original_title || data.original_name || '';
    const originalLanguage = data.original_language || 'en';
    const releaseDate = data.release_date || data.first_air_date || '';
    const year = releaseDate ? releaseDate.split('-')[0] : '';
    const posterPath = data.poster_path || null;

    const result: TmdbInfo = {
      title,
      originalTitle,
      turkishTitle,
      originalLanguage,
      year,
      posterPath,
    };

    tmdbCache.set(cacheKey, { data: result, exp: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (error: any) {
    console.warn('[Dizibal] TMDB fetch error:', error?.message || error);
    return fallback;
  }
}
