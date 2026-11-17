/**
 * Unified Subtitles Orchestrator
 * Integrates Wyzie Subs, SubDL, and OpenSubtitles in parallel with automatic fallback,
 * ensuring high availability and prioritized Arabic/English community translations.
 */

import { wyzieAPI } from './wyzie-api';
import { subdlAPI } from './subdl-api';
import { openSubtitlesAPI } from './opensubtitles-api';
import { stremioOpenSubs } from './stremio-opensubs';
import type { SubtitleSearchOptions, SubtitleResult, SubtitleDownloadResponse } from './types';

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'العربية (Arabic)',
  en: 'English',
  tr: 'Türkçe',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

export class UnifiedSubtitlesService {
  async searchSubtitles(options: SubtitleSearchOptions): Promise<SubtitleResult[]> {
    const { tmdbId, type, season, episode, languages } = options;
    const langList = (languages || 'ar,en,tr').toLowerCase().split(',').map((s) => s.trim());
    const kind = type === 'tv' ? 'series' : 'movie';

    console.log(`[UnifiedSubtitles] Searching across providers for TMDB ${tmdbId} (${type}) [${langList.join(',')}]`);

    // Run Stremio (keyless, unlimited), Wyzie, SubDL, and OpenSubtitles in parallel
    const [stremioRes, wyzieRes, subdlRes, openSubsRes] = await Promise.allSettled([
      // 1. Stremio OpenSubtitles v3 (direct, unlimited, high reliability)
      stremioOpenSubs.search({ tmdbId, kind, season, episode, languages: langList }),

      // 2. Wyzie search (fast)
      Promise.all(
        langList.map((l) => wyzieAPI.search({ tmdbId, kind, season, episode, languages: l }))
      ).then((arr) => arr.flat()),

      // 3. SubDL search (Arabic & multi-language)
      subdlAPI.search({ tmdbId, kind, season, episode, languages: langList.join(',') }),

      // 4. OpenSubtitles search
      openSubtitlesAPI.searchSubtitles(options).catch(() => []),
    ]);

    const results: SubtitleResult[] = [];

    // Add Stremio direct results first (no quota limits!)
    if (stremioRes.status === 'fulfilled' && stremioRes.value.length > 0) {
      results.push(...stremioRes.value);
    }

    // Add Wyzie results
    if (wyzieRes.status === 'fulfilled' && wyzieRes.value.length > 0) {
      for (const item of wyzieRes.value) {
        const langCode = item.lang.toLowerCase();
        results.push({
          id: `wyzie:${encodeURIComponent(item.url)}`,
          language: langCode,
          languageName: `${LANGUAGE_NAMES[langCode] || langCode.toUpperCase()} • Wyzie`,
          fileName: item.name,
          downloadCount: 1000,
          rating: 9.5,
          hearingImpaired: item.isHearingImpaired,
          movieHashMatch: true,
        });
      }
    }

    // Add SubDL results
    if (subdlRes.status === 'fulfilled' && subdlRes.value.length > 0) {
      for (const item of subdlRes.value) {
        const langCode = item.lang.toLowerCase();
        results.push({
          id: `subdl:${encodeURIComponent(item.downloadUrl)}`,
          language: langCode,
          languageName: `${LANGUAGE_NAMES[langCode] || langCode.toUpperCase()} • SubDL`,
          fileName: item.name,
          downloadCount: 2000,
          rating: 9.8,
          hearingImpaired: false,
          movieHashMatch: true,
        });
      }
    }

    // Add OpenSubtitles results ONLY if Stremio didn't already supply subtitles and quota isn't exceeded
    // Stremio OpenSubs v3 is a direct, unlimited mirror of OpenSubtitles, preventing the 5-download/day limit.
    const hasDirectSubs = results.length > 0;
    if (!hasDirectSubs && !openSubtitlesAPI.isQuotaExceeded() && openSubsRes.status === 'fulfilled' && openSubsRes.value.length > 0) {
      for (const item of openSubsRes.value) {
        results.push({
          ...item,
          id: `opensubs:${item.id}`,
          languageName: `${item.languageName} • OpenSubtitles`,
        });
      }
    }

    // Deduplicate and prioritize Arabic first, then English, then others
    const seen = new Set<string>();
    const deduplicated = results.filter((r) => {
      const key = `${r.language}-${r.fileName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduplicated.sort((a, b) => {
      // Prioritize Arabic (ar)
      if (a.language === 'ar' && b.language !== 'ar') return -1;
      if (b.language === 'ar' && a.language !== 'ar') return 1;
      // Then English (en)
      if (a.language === 'en' && b.language !== 'en') return -1;
      if (b.language === 'en' && a.language !== 'en') return 1;
      return b.rating - a.rating;
    });

    console.log(`[UnifiedSubtitles] Found ${deduplicated.length} subtitles across all providers`);
    return deduplicated;
  }

  async getDownloadLink(fileId: string): Promise<SubtitleDownloadResponse> {
    if (fileId.startsWith('stremio:')) {
      const directUrl = decodeURIComponent(fileId.slice(8));
      return {
        link: directUrl,
        fileName: 'stremio-subtitles.srt',
        remaining: 99999,
        resetTime: 'N/A',
      };
    }

    if (fileId.startsWith('wyzie:')) {
      const directUrl = decodeURIComponent(fileId.slice(6));
      return {
        link: directUrl,
        fileName: 'wyzie-subtitles.srt',
        remaining: 9999,
        resetTime: 'N/A',
      };
    }

    if (fileId.startsWith('subdl:')) {
      const subdlUrl = decodeURIComponent(fileId.slice(6));
      return {
        link: `/api/subtitles/subdl-stream?url=${encodeURIComponent(subdlUrl)}`,
        fileName: 'subdl-subtitles.srt',
        remaining: 9999,
        resetTime: 'N/A',
      };
    }

    if (fileId.startsWith('opensubs:')) {
      const realId = fileId.slice(9);
      try {
        return await openSubtitlesAPI.getDownloadLink(realId);
      } catch (err: any) {
        console.warn(`[UnifiedSubtitles] OpenSubtitles download failed for ${realId}:`, err.message);
        throw err;
      }
    }

    // Fallback to OpenSubtitles
    return openSubtitlesAPI.getDownloadLink(fileId);
  }
}

export const unifiedSubtitles = new UnifiedSubtitlesService();
