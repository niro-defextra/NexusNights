/**
 * AniSkip Service
 * Fetches opening (OP) and ending (ED) intervals for Anime episodes
 * from api.aniskip.com for seamless "Skip Intro / Skip Outro" in the player.
 */

export interface AniSkipTiming {
  startTime: number;
  endTime: number;
}

export interface AniSkipResult {
  found: boolean;
  intro?: AniSkipTiming;
  outro?: AniSkipTiming;
}

const ANISKIP_BASE = 'https://api.aniskip.com/v2';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class AniSkipService {
  private cache = new Map<string, { data: AniSkipResult; expiresAt: number }>();

  async getSkipTimes(malId: number, episodeNumber: number = 1): Promise<AniSkipResult> {
    if (!malId || malId <= 0) {
      return { found: false };
    }

    const key = `${malId}-${episodeNumber}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() < hit.expiresAt) {
      return hit.data;
    }

    try {
      const url = `${ANISKIP_BASE}/skip-times/${malId}/${episodeNumber}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&episodeLength=0`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'NexusNight/1.0',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 404) {
        const notFound: AniSkipResult = { found: false };
        this.cache.set(key, { data: notFound, expiresAt: Date.now() + CACHE_TTL_MS });
        return notFound;
      }

      if (!res.ok) {
        return { found: false };
      }

      const json = await res.json() as {
        found: boolean;
        results?: Array<{
          skipType: string;
          interval: { startTime: number; endTime: number };
        }>;
      };

      if (!json.found || !json.results || json.results.length === 0) {
        const notFound: AniSkipResult = { found: false };
        this.cache.set(key, { data: notFound, expiresAt: Date.now() + CACHE_TTL_MS });
        return notFound;
      }

      const result: AniSkipResult = { found: true };

      for (const item of json.results) {
        const { skipType, interval } = item;
        if ((skipType === 'op' || skipType === 'mixed-op') && !result.intro) {
          result.intro = {
            startTime: Math.round(interval.startTime * 10) / 10,
            endTime: Math.round(interval.endTime * 10) / 10,
          };
        } else if ((skipType === 'ed' || skipType === 'mixed-ed') && !result.outro) {
          result.outro = {
            startTime: Math.round(interval.startTime * 10) / 10,
            endTime: Math.round(interval.endTime * 10) / 10,
          };
        }
      }

      this.cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch {
      return { found: false };
    }
  }
}

export const aniSkipService = new AniSkipService();
