/**
 * Tiny in-memory LRU for immutable HLS segments.
 *
 * VOD segments never change for a given stream URL, so a retry, a seek, or a
 * second viewer of the same stream can be served from memory instead of
 * re-downloading from a flaky provider CDN. The cache is deliberately small
 * (256 MB) because segments are 1–6 MB and the server is shared.
 */

const SEGMENT_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const SEGMENT_CACHE_TTL_MS = 10 * 60 * 1000;
export const SEGMENT_CACHE_MAX_ITEM_BYTES = 20 * 1024 * 1024;

export interface CachedSegment {
  body: Buffer;
  contentType: string;
  at: number;
}

const cache = new Map<string, CachedSegment>();
let cacheBytes = 0;

export function getSegment(key: string): CachedSegment | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SEGMENT_CACHE_TTL_MS) {
    cache.delete(key);
    cacheBytes -= hit.body.length;
    return undefined;
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setSegment(key: string, body: Buffer, contentType: string): void {
  if (body.length > SEGMENT_CACHE_MAX_ITEM_BYTES) return;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cacheBytes -= existing.body.length;
  }
  cache.set(key, { body, contentType, at: Date.now() });
  cacheBytes += body.length;
  while (cacheBytes > SEGMENT_CACHE_MAX_BYTES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    const old = cache.get(oldest.value);
    cache.delete(oldest.value);
    if (old) cacheBytes -= old.body.length;
  }
}

export function segmentCacheStats(): { entries: number; bytes: number; maxBytes: number } {
  return { entries: cache.size, bytes: cacheBytes, maxBytes: SEGMENT_CACHE_MAX_BYTES };
}

export function clearSegmentCache(): void {
  cache.clear();
  cacheBytes = 0;
}
