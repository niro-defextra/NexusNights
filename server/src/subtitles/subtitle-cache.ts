/**
 * Subtitle Cache
 * LRU cache for OpenSubtitles API responses
 */

import type { SubtitleResult } from './types';

interface CacheEntry {
  data: SubtitleResult[];
  timestamp: number;
}

class SubtitleCache {
  private cache = new Map<string, CacheEntry>();
  private readonly MAX_SIZE = 500;
  private readonly TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Generate cache key
   */
  private getKey(tmdbId: number, type: string, season?: number, episode?: number, languages?: string): string {
    const parts = [tmdbId, type];
    if (season !== undefined) parts.push(`s${season}`);
    if (episode !== undefined) parts.push(`e${episode}`);
    if (languages) parts.push(languages);
    return parts.join('-');
  }

  /**
   * Get cached results
   */
  get(
    tmdbId: number,
    type: string,
    season?: number,
    episode?: number,
    languages?: string
  ): SubtitleResult[] | null {
    const key = this.getKey(tmdbId, type, season, episode, languages);
    const entry = this.cache.get(key);

    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Set cached results
   */
  set(
    tmdbId: number,
    type: string,
    season: number | undefined,
    episode: number | undefined,
    languages: string | undefined,
    data: SubtitleResult[]
  ): void {
    const key = this.getKey(tmdbId, type, season, episode, languages);

    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_SIZE,
      ttlMs: this.TTL_MS,
    };
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL_MS) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }
  }
}

export const subtitleCache = new SubtitleCache();

// Cleanup every 15 minutes
setInterval(() => subtitleCache.cleanup(), 15 * 60 * 1000);
