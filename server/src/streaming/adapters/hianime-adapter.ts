/**
 * HiAnime Provider Adapter
 * Dedicated anime provider offering direct HLS streams, native subtitles,
 * and high quality 1080p playback for Japanese animation.
 */

import type { ProviderAdapter, ProviderMediaRequest, ProviderResult, ProviderSource } from '../types';
import { hianimeResolver } from '../hianime-resolver';

export class HiAnimeAdapter implements ProviderAdapter {
  readonly id = 'hianime';
  readonly name = 'HiAnime (Direct HLS)';
  readonly isSupported = true;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 250; // Top priority for anime

  private async fetchTitleFromTmdb(tmdbId: number, kind: 'movie' | 'series'): Promise<string> {
    const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
    if (!TMDB_API_KEY) return '';

    try {
      const endpoint = kind === 'movie' ? 'movie' : 'tv';
      const isBearer = TMDB_API_KEY.startsWith('eyJ');
      const headers: Record<string, string> = isBearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {};
      const apiParam = isBearer ? '' : `?api_key=${TMDB_API_KEY}`;
      const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}${apiParam}`;
      
      const res = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) return '';
      const data = await res.json() as { original_title?: string; original_name?: string; title?: string; name?: string };
      // Prefer original title for anime search (e.g. Shingeki no Kyojin or standard title)
      return data.original_title || data.original_name || data.title || data.name || '';
    } catch {
      return '';
    }
  }

  async resolve(req: ProviderMediaRequest): Promise<ProviderResult> {
    const diagnostics: string[] = [];

    try {
      const title = await this.fetchTitleFromTmdb(req.tmdbId, req.kind);
      if (!title) {
        diagnostics.push('Could not determine title from TMDB for HiAnime search');
        return {
          providerId: this.id,
          providerName: this.name,
          isSupported: this.isSupported,
          sources: [],
          diagnostics,
        };
      }

      console.log(`[HiAnimeAdapter] Resolving anime stream for "${title}" (TMDB: ${req.tmdbId}, S${req.season || 1}E${req.episode || 1})`);

      const hiStream = await hianimeResolver.resolve({
        title,
        tmdbId: req.tmdbId,
        kind: req.kind,
        season: req.season,
        episode: req.episode,
      });

      if (!hiStream || !hiStream.masterUrl) {
        diagnostics.push('HiAnime did not return a valid master HLS URL');
        return {
          providerId: this.id,
          providerName: this.name,
          isSupported: this.isSupported,
          sources: [],
          diagnostics,
        };
      }

      const source: ProviderSource = {
        id: hiStream.streamId,
        url: `/api/stream-proxy/master/${hiStream.streamId}.m3u8`,
        type: 'hls',
        quality: hiStream.resolution || '1080p',
        providerId: this.id,
        providerName: this.name,
        isEmbed: false,
        priority: this.basePriority,
        subtitles: hiStream.subtitles,
        headers: {
          referer: hiStream.referer,
        },
      };

      diagnostics.push(`Resolved direct anime HLS stream: ${hiStream.streamId}`);

      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [source],
        diagnostics,
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      diagnostics.push(`HiAnime resolve failed: ${msg}`);
      console.log(`[HiAnimeAdapter] Resolve fallback: ${msg}`);
      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [],
        diagnostics,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch('https://hianime.at', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
