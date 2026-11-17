/**
 * Wyzie Subtitles API Client
 * High-speed, lightweight subtitle provider with direct VTT/SRT link generation.
 */

export interface WyzieSubtitleItem {
  id: string;
  name: string;
  lang: string;
  release: string;
  source: string;
  url: string;
  isHearingImpaired: boolean;
  isAiTranslated: boolean;
}

export class WyzieAPI {
  private apiKey: string | null = process.env.WYZIE_API_KEY || null;

  setApiKey(key: string) {
    this.apiKey = key;
  }

  hasApiKey(): boolean {
    return Boolean(this.apiKey);
  }

  async search(params: {
    tmdbId: number;
    kind: 'movie' | 'series';
    season?: number;
    episode?: number;
    languages?: string; // e.g. "ar" or "en"
  }): Promise<WyzieSubtitleItem[]> {
    try {
      const query = new URLSearchParams({
        id: String(params.tmdbId),
        format: 'srt',
      });

      if (params.languages) {
        query.set('language', params.languages.toLowerCase());
      }

      if (params.kind === 'series') {
        if (params.season != null) query.set('season', String(params.season));
        if (params.episode != null) query.set('episode', String(params.episode));
      }

      if (this.apiKey) {
        query.set('key', this.apiKey);
      }

      const baseUrl = this.apiKey ? 'https://sub.wyzie.io/search' : 'https://subs.wyzie.ru/search';
      const res = await fetch(`${baseUrl}?${query.toString()}`, {
        headers: { 'User-Agent': 'NexusNight/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return [];
      }

      const data = await res.json() as Array<{
        url?: string;
        display_name?: string;
        release_name?: string;
        name?: string;
        title?: string;
        language?: string;
        isHearingImpaired?: boolean;
        isAiTranslated?: boolean;
        source?: string;
      }>;

      if (!Array.isArray(data)) return [];

      return data
        .filter((item) => Boolean(item.url))
        .map((item, idx) => {
          const rawUrl = item.url || '';
          const fullUrl = rawUrl.startsWith('http')
            ? rawUrl
            : `https://subs.wyzie.ru${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;

          const name = item.display_name || item.release_name || item.name || item.title || `Subtitle #${idx + 1}`;
          const lang = (item.language || params.languages || 'ar').toLowerCase();

          return {
            id: `wyzie_${params.tmdbId}_${idx}`,
            name,
            lang,
            release: item.release_name || name,
            source: item.source || 'Wyzie',
            url: fullUrl,
            isHearingImpaired: !!item.isHearingImpaired,
            isAiTranslated: !!item.isAiTranslated,
          };
        });
    } catch {
      return [];
    }
  }

  async downloadText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NexusNight/1.0' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
}

export const wyzieAPI = new WyzieAPI();
