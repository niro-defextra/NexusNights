import { u } from '../api';

type ArtworkKind = 'poster' | 'backdrop' | 'still' | 'logo';

const TMDB_PATH = /^\/[\w-]+\.(jpg|jpeg|png|webp)$/i;

/** Must match ARTWORK_URL_VERSION in server/src/http/images.ts. */
const ARTWORK_URL_VERSION = 2;

export function tmdbArtworkUrl(kind: ArtworkKind, path: string | null | undefined): string | null {
  if (!path || !TMDB_PATH.test(path)) return null;
  return u(`/api/images/tmdb/${kind}/${encodeURIComponent(path.slice(1))}?v=${ARTWORK_URL_VERSION}`) ?? null;
}
