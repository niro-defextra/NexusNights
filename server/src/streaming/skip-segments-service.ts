/**
 * Skip segments (recap / intro / credits / preview).
 *
 * TheIntroDB supplies community timestamps for movies and TV episodes.
 * AniSkip stays the source of truth for anime, so its intro/outro win when
 * both providers know a segment; IntroDB fills in recap and preview.
 */

import { resolveImdbId } from '../metadata/imdb-id';
import { aniSkipService, type AniSkipResult } from './aniskip-service';

export interface SkipSegment {
  startTime: number;
  endTime: number;
}

export interface SkipSegmentsResult {
  found: boolean;
  recap?: SkipSegment;
  intro?: SkipSegment;
  outro?: SkipSegment;
  preview?: SkipSegment;
}

interface IntroDbQuery {
  tmdbId: number;
  kind: 'movie' | 'series';
  season?: number;
  episode?: number;
}

interface IntroDbSegment {
  start_sec?: number | null;
  end_sec?: number | null;
}

interface IntroDbResponse {
  recap?: IntroDbSegment | null;
  intro?: IntroDbSegment | null;
  outro?: IntroDbSegment | null;
  preview?: IntroDbSegment | null;
}

const INTRODB_BASE = 'https://api.introdb.app/segments';
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
const SEGMENT_KEYS = ['recap', 'intro', 'outro', 'preview'] as const;

/** Merge two results: `primary` wins per segment, `secondary` fills the gaps. */
export function mergeSkipSegments(
  primary: SkipSegmentsResult | AniSkipResult | null,
  secondary: SkipSegmentsResult | null,
): SkipSegmentsResult {
  const merged: SkipSegmentsResult = { found: false };
  for (const key of SEGMENT_KEYS) {
    const segment = (primary as SkipSegmentsResult | null)?.[key] ?? secondary?.[key];
    if (segment) {
      merged[key] = segment;
      merged.found = true;
    }
  }
  return merged;
}

function normalizeSegment(segment: IntroDbSegment | null | undefined): SkipSegment | undefined {
  const start = Number(segment?.start_sec);
  const end = Number(segment?.end_sec);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
  if (start < 0 || end <= start) return undefined;
  return {
    startTime: Math.round(start * 10) / 10,
    endTime: Math.round(end * 10) / 10,
  };
}

class SkipSegmentsService {
  private cache = new Map<string, { data: SkipSegmentsResult; expiresAt: number }>();

  /** IntroDB only — no AniSkip, so callers can merge their own anime result. */
  async getIntroDbSegments(query: IntroDbQuery): Promise<SkipSegmentsResult> {
    const { tmdbId, kind, season, episode } = query;
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) return { found: false };
    if (kind === 'series' && (season == null || episode == null)) return { found: false };

    const key = `${kind}:${tmdbId}:${season ?? 0}:${episode ?? 0}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() < hit.expiresAt) return hit.data;

    const imdbId = await resolveImdbId(tmdbId, kind);
    if (!imdbId) return { found: false };

    const url = new URL(INTRODB_BASE);
    url.searchParams.set('imdb_id', imdbId);
    if (kind === 'movie') {
      url.searchParams.set('is_movie', 'true');
    } else {
      url.searchParams.set('season', String(season));
      url.searchParams.set('episode', String(episode));
    }

    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'NexusNights/1.0' },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        if (res.status === 404) {
          const empty: SkipSegmentsResult = { found: false };
          this.cache.set(key, { data: empty, expiresAt: Date.now() + MISS_TTL_MS });
          return empty;
        }
        return { found: false };
      }

      const json = (await res.json()) as IntroDbResponse;
      const result: SkipSegmentsResult = { found: false };

      for (const segmentKey of SEGMENT_KEYS) {
        const segment = normalizeSegment(json[segmentKey]);
        if (segment) {
          result[segmentKey] = segment;
          result.found = true;
        }
      }

      this.cache.set(key, {
        data: result,
        expiresAt: Date.now() + (result.found ? HIT_TTL_MS : MISS_TTL_MS),
      });
      return result;
    } catch (err) {
      console.warn('[SkipSegments] IntroDB request failed:', err instanceof Error ? err.message : err);
      return { found: false };
    }
  }

  /** Full result for a title: IntroDB, with AniSkip taking precedence for anime. */
  async getSegments(query: IntroDbQuery & { malId?: number }): Promise<SkipSegmentsResult> {
    const introDb = await this.getIntroDbSegments(query);
    if (!query.malId || query.kind !== 'series') return introDb;

    const aniSkip = await aniSkipService.getSkipTimes(query.malId, query.episode ?? 1);
    if (!aniSkip.found) return introDb;
    return mergeSkipSegments(aniSkip, introDb);
  }
}

export const skipSegmentsService = new SkipSegmentsService();
