/**
 * TMDB → IMDb id resolver.
 * TheIntroDB and OpenSubtitles both key on IMDb ids; TMDB exposes them through
 * the external_ids endpoint, so the lookup is cached in memory to keep both
 * providers to a single request per title.
 */

const CACHE = new Map<string, { id: string | null; expiresAt: number }>();
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

export async function resolveImdbId(tmdbId: number, kind: 'movie' | 'series'): Promise<string | null> {
  if (!Number.isFinite(tmdbId) || tmdbId <= 0) return null;

  const key = `${kind}:${tmdbId}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.id;

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const endpoint = kind === 'series' ? 'tv' : 'movie';
  const bearer = apiKey.startsWith('eyJ');
  const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/external_ids${bearer ? '' : `?api_key=${apiKey}`}`;

  try {
    const res = await fetch(url, {
      headers: bearer
        ? { accept: 'application/json', authorization: `Bearer ${apiKey}` }
        : { accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      if (res.status === 404) CACHE.set(key, { id: null, expiresAt: Date.now() + MISS_TTL_MS });
      return null;
    }

    const data = (await res.json()) as { imdb_id?: string | null };
    const id = data.imdb_id && /^tt\d{5,}$/.test(data.imdb_id) ? data.imdb_id : null;
    CACHE.set(key, { id, expiresAt: Date.now() + (id ? HIT_TTL_MS : MISS_TTL_MS) });
    return id;
  } catch (err) {
    console.warn('[ImdbId] Failed to resolve TMDB id:', tmdbId, err instanceof Error ? err.message : err);
    return null;
  }
}
