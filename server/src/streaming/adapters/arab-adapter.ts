/**
 * ArabMedia Provider Adapter (عرب ميديا)
 * High-performance dual-engine streaming adapter specialized in Arabic cinema,
 * Egyptian movies, Gulf/Levantine/Ramadan TV series, and North African productions.
 *
 * Engines:
 * 1. Movizland (FaselHD engine) - High-speed multi-server embeds for Arabic cinema
 * 2. Arabseed (MySeed engine)   - Comprehensive catalog for Arabic series & movies
 */

import type { ProviderAdapter, ProviderMediaRequest, ProviderResult, ProviderSource } from '../types';

interface SearchCard {
  title: string;
  url: string;
  poster?: string;
  episodeNum?: number;
  year?: number;
  genre?: string;
  sourceEngine: 'movizland' | 'arabseed';
}

export class ArabAdapter implements ProviderAdapter {
  readonly id = 'arab-media';
  readonly name = 'ArabMedia (عرب ميديا)';
  readonly isSupported = true;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 220; // High priority for authentic Arabic content

  private readonly MOVIZLAND_URL = 'https://movizlands.com';
  private readonly ARABSEED_URL = 'https://m.myseed.tv';
  private readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  /**
   * Fetch Arabic metadata and title from TMDB
   */
  private async fetchTmdbDetails(tmdbId: number, kind: 'movie' | 'series'): Promise<{
    arabicTitle: string;
    originalTitle: string;
    year: number;
  } | null> {
    const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
    if (!TMDB_API_KEY) return null;

    try {
      const endpoint = kind === 'movie' ? 'movie' : 'tv';
      const isBearer = TMDB_API_KEY.startsWith('eyJ');
      const headers: Record<string, string> = isBearer ? { Authorization: `Bearer ${TMDB_API_KEY}` } : {};
      const authQuery = isBearer ? '' : `api_key=${TMDB_API_KEY}&`;
      const url = `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?${authQuery}language=ar`;

      const res = await fetch(url, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) return null;
      const data = await res.json() as {
        title?: string;
        name?: string;
        original_title?: string;
        original_name?: string;
        release_date?: string;
        first_air_date?: string;
      };

      const arabicTitle = (data.title || data.name || '').trim();
      const originalTitle = (data.original_title || data.original_name || '').trim();
      const dateStr = data.release_date || data.first_air_date || '';
      const year = parseInt(dateStr.slice(0, 4), 10) || 0;

      return {
        arabicTitle: arabicTitle || originalTitle,
        originalTitle,
        year,
      };
    } catch {
      return null;
    }
  }

  /**
   * Normalize Arabic string for accurate search and fuzzy matching
   */
  private normalizeArabic(text: string): string {
    return text
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[^\u0621-\u064A\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ENGINE 1: MOVIZLAND
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Search Movizland catalog
   */
  private async searchMovizland(query: string): Promise<SearchCard[]> {
    try {
      const searchUrl = `${this.MOVIZLAND_URL}/?s=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': this.UA, Referer: `${this.MOVIZLAND_URL}/` },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) return [];
      const html = await res.text();
      const cards: SearchCard[] = [];
      const boxRegex = /<div class="Small--Box">([\s\S]*?)<\/div>\s*<\/div>/gi;
      let match: RegExpExecArray | null;

      while ((match = boxRegex.exec(html)) !== null) {
        const boxHtml = match[1];
        const linkMatch = boxHtml.match(/href="([^"]+)"/i);
        const titleMatch = boxHtml.match(/<h3 class="title">([^<]+)<\/h3>/i) || boxHtml.match(/title="([^"]+)"/i);
        const posterMatch = boxHtml.match(/data-src="([^"]+)"/i) || boxHtml.match(/src="([^"]+)"/i);
        const epMatch = boxHtml.match(/<em>(\d+)<\/em>/i);
        const genreMatch = boxHtml.match(/<li class="genre">([^<]+)<\/li>/i);

        if (linkMatch && titleMatch) {
          const rawTitle = titleMatch[1].trim();
          const yearMatch = rawTitle.match(/\((\d{4})\)/) || rawTitle.match(/\b(20\d\d|19\d\d)\b/);
          const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
          const episodeNum = epMatch ? parseInt(epMatch[1], 10) : undefined;

          cards.push({
            title: rawTitle,
            url: linkMatch[1],
            poster: posterMatch ? posterMatch[1] : undefined,
            episodeNum,
            year,
            genre: genreMatch ? genreMatch[1].trim() : undefined,
            sourceEngine: 'movizland',
          });
        }
      }

      return cards;
    } catch {
      return [];
    }
  }

  /**
   * Extract streaming watch sources from Movizland item URL
   */
  private async extractMovizlandWatchSources(itemUrl: string, mediaId: string): Promise<ProviderSource[]> {
    const watchUrl = itemUrl.replace(/\/$/, '').replace(/\/watch\/?$/, '') + '/watch/';
    const sources: ProviderSource[] = [];

    try {
      const res = await fetch(watchUrl, {
        headers: { 'User-Agent': this.UA, Referer: itemUrl },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];
      const html = await res.text();

      const iframeMatches = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)].map((m) => m[1]);
      const dataWatchMatches = [...html.matchAll(/data-watch="([^"]+)"/gi)].map((m) => m[1]);
      const allEmbeds = [...new Set([...iframeMatches, ...dataWatchMatches])].filter((u) =>
        u.startsWith('http') && !u.includes('google') && !u.includes('facebook')
      );

      allEmbeds.forEach((rawUrl, idx) => {
        const cleanUrl = rawUrl.replace(/&#038;/g, '&');
        const host = new URL(cleanUrl).hostname.toLowerCase();
        let serverLabel = `سيرفر ${idx + 1}`;
        let priority = this.basePriority;

        if (host.includes('liiivideo')) {
          serverLabel = 'LiiiVideo (سيرفر مباشر HD)';
          priority += 40;
        } else if (host.includes('vidspeed')) {
          serverLabel = 'VidSpeed (سريع وبدون إعلانات)';
          priority += 35;
        } else if (host.includes('abyssplayer')) {
          serverLabel = 'AbyssPlayer (مشغل سينمائي)';
          priority += 30;
        } else if (host.includes('vidmoly')) {
          serverLabel = 'VidMoly (فائق السرعة 1080p)';
          priority += 25;
        } else if (host.includes('mp4plus')) {
          serverLabel = 'MP4Plus (جودة عالية)';
          priority += 18;
        } else if (host.includes('uqload')) {
          serverLabel = 'Uqload (سيرفر احتياطي)';
          priority += 12;
        } else if (host.includes('anafast')) {
          serverLabel = 'AnaFast (سيرفر سريع)';
          priority += 10;
        } else if (host.includes('ok.ru')) {
          serverLabel = 'OK.ru (مشغل متعدد الجودات)';
          priority += 8;
        } else {
          serverLabel = `سيرفر احتياطي (${host.split('.')[0]})`;
        }

        sources.push({
          id: `${this.id}-movizland-${mediaId}-${idx + 1}`,
          url: cleanUrl,
          embedUrl: cleanUrl,
          type: 'embed',
          quality: '1080p Full HD',
          providerId: this.id,
          providerName: `${this.name} • ${serverLabel}`,
          isEmbed: true,
          priority,
        });
      });
    } catch (err: any) {
      console.warn(`[ArabAdapter] Failed Movizland watch extract from ${watchUrl}:`, err?.message);
    }

    return sources;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // ENGINE 2: ARABSEED (MYSEED)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Search Arabseed catalog (series & movies)
   */
  private async searchArabseedSeries(query: string, targetEpisode: number): Promise<string | null> {
    try {
      // 1. Search series index
      const searchUrl = `${this.ARABSEED_URL}/find/?word=${encodeURIComponent(query)}&type=series`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': this.UA, Referer: `${this.ARABSEED_URL}/` },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) return null;
      const html = await res.text();

      // Find series page link (/selary/...)
      const selaryMatches = [...html.matchAll(/href="(https:\/\/m\.myseed\.tv\/selary\/[^"]+)"/gi)].map((m) => m[1]);

      if (selaryMatches.length > 0) {
        const seriesPageUrl = selaryMatches[0];
        const seriesRes = await fetch(seriesPageUrl, {
          headers: { 'User-Agent': this.UA, Referer: searchUrl },
          signal: AbortSignal.timeout(7000),
        });

        if (seriesRes.ok) {
          const seriesHtml = await seriesRes.text();
          const epLinks = [...seriesHtml.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

          for (const ep of epLinks) {
            const href = ep[1];
            const text = ep[2].replace(/<[^>]+>/g, '').trim();
            const numMatch = text.match(/الحلقة\s*(\d+)/i) || href.match(/الحلقة-(\d+)/i) || href.match(/-eps?(\d+)/i);

            if (numMatch && parseInt(numMatch[1], 10) === targetEpisode) {
              return href.replace(/\/$/, '').replace(/\/watch\/?$/, '') + '/watch/';
            }
          }
        }
      }

      // 2. Direct episode search fallback
      const directSearchUrl = `${this.ARABSEED_URL}/?s=${encodeURIComponent(`${query} الحلقة ${targetEpisode}`)}`;
      const directRes = await fetch(directSearchUrl, {
        headers: { 'User-Agent': this.UA, Referer: `${this.ARABSEED_URL}/` },
        signal: AbortSignal.timeout(7000),
      });

      if (directRes.ok) {
        const directHtml = await directRes.text();
        const links = [...directHtml.matchAll(/href="(https:\/\/m\.myseed\.tv\/[^"]+)"/gi)].map((m) => m[1]);
        const epLink = links.find((l) =>
          l.includes(`الحلقة-${targetEpisode}-`) ||
          l.includes(`الحلقة-${targetEpisode}/`) ||
          l.includes(`-eps${targetEpisode}/`)
        );

        if (epLink) {
          return epLink.replace(/\/$/, '').replace(/\/watch\/?$/, '') + '/watch/';
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Search Arabseed for movies
   */
  private async searchArabseedMovie(query: string): Promise<string | null> {
    try {
      const searchUrl = `${this.ARABSEED_URL}/find/?word=${encodeURIComponent(query)}&type=movies`;
      const res = await fetch(searchUrl, {
        headers: { 'User-Agent': this.UA, Referer: `${this.ARABSEED_URL}/` },
        signal: AbortSignal.timeout(7000),
      });

      if (!res.ok) return null;
      const html = await res.text();
      const links = [...html.matchAll(/href="(https:\/\/m\.myseed\.tv\/(?:فيلم|%d9%81%d9%8a%d9%84%d9%85)[^"]+)"/gi)].map((m) => m[1]);

      if (links.length > 0) {
        return links[0].replace(/\/$/, '').replace(/\/watch\/?$/, '') + '/watch/';
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract watch sources from Arabseed watch page
   */
  private async extractArabseedWatchSources(watchUrl: string, mediaId: string): Promise<ProviderSource[]> {
    const sources: ProviderSource[] = [];

    try {
      const res = await fetch(watchUrl, {
        headers: { 'User-Agent': this.UA, Referer: this.ARABSEED_URL },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];
      const html = await res.text();

      // Extract base64 encoded servers from data-link and pic embed URLs
      const picMatches = [...html.matchAll(/(?:data-link="|src=")?https:\/\/m\.myseed\.pics\/vid\/\?id=([a-zA-Z0-9+=]+)/gi)];
      const decodedUrls: string[] = [];

      for (const p of picMatches) {
        try {
          const raw = Buffer.from(p[1], 'base64').toString('utf8');
          if (raw.startsWith('http')) {
            decodedUrls.push(raw);
          }
        } catch {}
      }

      const iframes = [...html.matchAll(/<iframe[^>]*src="([^"]+)"/gi)]
        .map((m) => m[1])
        .filter((u) => u.startsWith('http') && !u.includes('myseed.pics') && !u.includes('facebook'));

      const allEmbeds = [...new Set([...decodedUrls, ...iframes])];

      allEmbeds.forEach((cleanUrl, idx) => {
        const host = new URL(cleanUrl).hostname.toLowerCase();
        let serverLabel = `سيرفر ماي سيد ${idx + 1}`;
        let priority = this.basePriority;

        if (host.includes('vidmoly')) {
          serverLabel = 'VidMoly (فائق السرعة 1080p)';
          priority += 35;
        } else if (host.includes('voe')) {
          serverLabel = 'VOE Player (جودة فائقة HD)';
          priority += 30;
        } else if (host.includes('byse') || host.includes('tayico')) {
          serverLabel = 'FastStream (مشغل بديل)';
          priority += 22;
        } else if (host.includes('dood') || host.includes('ds2play')) {
          serverLabel = 'DoodStream (سيرفر مباشر)';
          priority += 18;
        } else {
          serverLabel = `مشغل عربي (${host.split('.')[0]})`;
          priority += 15;
        }

        sources.push({
          id: `${this.id}-arabseed-${mediaId}-${idx + 1}`,
          url: cleanUrl,
          embedUrl: cleanUrl,
          type: 'embed',
          quality: '1080p Full HD',
          providerId: this.id,
          providerName: `${this.name} • ${serverLabel}`,
          isEmbed: true,
          priority,
        });
      });
    } catch (err: any) {
      console.warn(`[ArabAdapter] Failed Arabseed watch extract from ${watchUrl}:`, err?.message);
    }

    return sources;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // RESOLVER PIPELINE
  // ═════════════════════════════════════════════════════════════════════════════

  async resolve(req: ProviderMediaRequest): Promise<ProviderResult> {
    const diagnostics: string[] = [];

    try {
      const details = await this.fetchTmdbDetails(req.tmdbId, req.kind);
      if (!details || !details.arabicTitle) {
        diagnostics.push('Could not determine Arabic title from TMDB');
        return {
          providerId: this.id,
          providerName: this.name,
          isSupported: this.isSupported,
          sources: [],
          diagnostics,
        };
      }

      console.log(`[ArabAdapter] Searching Arabic catalog for "${details.arabicTitle}" (${details.year || 'any year'})`);
      const mediaKey = `${req.kind}-${req.tmdbId}${req.season ? `-s${req.season}e${req.episode}` : ''}`;
      let sources: ProviderSource[] = [];

      if (req.kind === 'movie') {
        // MOVIES: Movizland is primary (11 fast embeds)
        const cards = await this.searchMovizland(details.arabicTitle);
        const normalizedQuery = this.normalizeArabic(details.arabicTitle);

        let targetCard = cards.find((c) => {
          const normCardTitle = this.normalizeArabic(c.title);
          const hasTitle = normCardTitle.includes(normalizedQuery) || normalizedQuery.includes(normCardTitle);
          const matchesYear = !details.year || !c.year || Math.abs(c.year - details.year) <= 1;
          return hasTitle && matchesYear;
        }) || cards[0];

        if (targetCard) {
          diagnostics.push(`[Movizland] Matched: "${targetCard.title}"`);
          sources = await this.extractMovizlandWatchSources(targetCard.url, mediaKey);
        }

        // If Movizland returned 0 sources, fall back to Arabseed for movie
        if (sources.length === 0) {
          const arabseedWatch = await this.searchArabseedMovie(details.arabicTitle);
          if (arabseedWatch) {
            diagnostics.push(`[Arabseed] Fallback movie watch URL found`);
            const seedSources = await this.extractArabseedWatchSources(arabseedWatch, mediaKey);
            sources.push(...seedSources);
          }
        }
      } else {
        // SERIES: Arabseed is primary (complete Ramadan & Egyptian series catalog)
        const targetEp = req.episode ?? 1;
        const arabseedWatch = await this.searchArabseedSeries(details.arabicTitle, targetEp);

        if (arabseedWatch) {
          diagnostics.push(`[Arabseed] Matched series episode ${targetEp}`);
          sources = await this.extractArabseedWatchSources(arabseedWatch, mediaKey);
        }

        // Fallback: search Movizland series
        if (sources.length === 0) {
          const cards = await this.searchMovizland(details.arabicTitle);
          const targetCard = cards.find((c) => c.episodeNum === targetEp) ||
            cards.find((c) => c.title.includes(`الحلقة ${targetEp}`) || c.title.includes(`حلقة ${targetEp}`));

          if (targetCard) {
            diagnostics.push(`[Movizland] Fallback episode match: "${targetCard.title}"`);
            const movizSources = await this.extractMovizlandWatchSources(targetCard.url, mediaKey);
            sources.push(...movizSources);
          }
        }
      }

      // Sort all gathered sources by priority descending
      sources.sort((a, b) => b.priority - a.priority);
      diagnostics.push(`Extracted ${sources.length} active Arabic streaming servers`);

      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources,
        diagnostics,
      };
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      diagnostics.push(`ArabMedia resolve failed: ${msg}`);
      console.warn(`[ArabAdapter] Error: ${msg}`);
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
      const res = await fetch(`${this.MOVIZLAND_URL}/`, {
        headers: { 'User-Agent': this.UA },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
