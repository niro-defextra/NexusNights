/**
 * OpenSubtitles.com API Client
 * https://api.opensubtitles.com/api/v1
 */

import type {
  SubtitleSearchOptions,
  SubtitleResult,
  SubtitleDownloadResponse,
  OpenSubtitlesSearchResponse,
  OpenSubtitlesDownloadResponse,
} from './types';
import { subtitleCache } from './subtitle-cache';

const BASE_URL = 'https://api.opensubtitles.com/api/v1';
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  tr: 'Turkish',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  hi: 'Hindi',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  cs: 'Czech',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  ro: 'Romanian',
  hu: 'Hungarian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  lt: 'Lithuanian',
  lv: 'Latvian',
  et: 'Estonian',
  fa: 'Persian',
  ur: 'Urdu',
  bn: 'Bengali',
  ta: 'Tamil',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  mr: 'Marathi',
};

export class OpenSubtitlesAPI {
  private apiKey: string | null;
  private userAgent: string;
  private quotaResetTime = 0;
  private downloadCache = new Map<string, { data: SubtitleDownloadResponse; timestamp: number }>();
  private readonly DOWNLOAD_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours cache for links

  constructor() {
    this.apiKey = process.env.OPENSUBTITLES_API_KEY || null;
    this.userAgent = process.env.OPENSUBTITLES_USER_AGENT || 'NexusNight v1.0';
  }

  /**
   * Check if the daily download quota has been exceeded
   */
  isQuotaExceeded(): boolean {
    return Date.now() < this.quotaResetTime;
  }

  /**
   * Get common headers for API requests
   */
  private getHeaders(): Record<string, string> {
    const apiKey = process.env.OPENSUBTITLES_API_KEY || this.apiKey;
    const userAgent = process.env.OPENSUBTITLES_USER_AGENT || this.userAgent || 'NexusNight v1.0';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': userAgent,
    };

    if (apiKey) {
      headers['Api-Key'] = apiKey;
    }

    return headers;
  }

  /**
   * Search for subtitles
   */
  async searchSubtitles(options: SubtitleSearchOptions): Promise<SubtitleResult[]> {
    if (this.isQuotaExceeded()) {
      console.log('[OpenSubtitles] Daily quota currently exhausted, skipping REST search');
      return [];
    }

    const { tmdbId, type, season, episode, languages = 'en,ar,tr' } = options;

    // Check cache first
    const cached = subtitleCache.get(tmdbId, type, season, episode, languages);
    if (cached) {
      console.log(`[OpenSubtitles] Cache hit for ${type} ${tmdbId}`);
      return cached;
    }

    // Build query params
    const params = new URLSearchParams({
      tmdb_id: tmdbId.toString(),
      type: type === 'tv' ? 'episode' : 'movie',
      languages: languages,
    });

    if (type === 'tv' && season !== undefined) {
      params.append('season_number', season.toString());
    }

    if (type === 'tv' && episode !== undefined) {
      params.append('episode_number', episode.toString());
    }

    const url = `${BASE_URL}/subtitles?${params.toString()}`;

    console.log(`[OpenSubtitles] Searching: ${url}`);

    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        throw new Error(`OpenSubtitles API error: ${response.status}`);
      }

      const data = (await response.json()) as OpenSubtitlesSearchResponse;

      // Transform to our format
      const results: SubtitleResult[] = [];

      for (const item of data.data || []) {
        const attrs = item.attributes;

        // Get first file (most subtitles have only one file)
        const file = attrs.files?.[0];
        if (!file) continue;

        results.push({
          id: file.file_id.toString(),
          language: attrs.language,
          languageName: LANGUAGE_NAMES[attrs.language] || attrs.language.toUpperCase(),
          fileName: file.file_name,
          downloadCount: attrs.download_count || 0,
          rating: attrs.ratings || 0,
          hearingImpaired: attrs.hearing_impaired || false,
          movieHashMatch: attrs.moviehash_match || false,
        });
      }

      // Sort by download count (popularity)
      results.sort((a, b) => b.downloadCount - a.downloadCount);

      // Cache results
      subtitleCache.set(tmdbId, type, season, episode, languages, results);

      console.log(`[OpenSubtitles] Found ${results.length} subtitles`);

      return results;
    } catch (error: any) {
      console.error('[OpenSubtitles] Search error:', error.message);
      throw error;
    }
  }

  /**
   * Get download link for a subtitle file with automatic retry and in-memory caching
   */
  async getDownloadLink(fileId: string): Promise<SubtitleDownloadResponse> {
    // Check in-memory cache first to protect the daily download quota
    const cached = this.downloadCache.get(fileId);
    if (cached && Date.now() - cached.timestamp < this.DOWNLOAD_CACHE_TTL) {
      console.log(`[OpenSubtitles] Returning cached download link for file ${fileId}`);
      return cached.data;
    }

    const url = `${BASE_URL}/download`;
    console.log(`[OpenSubtitles] Requesting download link for file ${fileId}`);

    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[OpenSubtitles] Retrying download link for ${fileId} (attempt ${attempt + 1}/${maxRetries + 1})...`);
          await new Promise((r) => setTimeout(r, attempt * 1200));
        }

        const headers = this.getHeaders();
        const body = JSON.stringify({ file_id: parseInt(fileId, 10) });
        console.log(`[OpenSubtitles] Sending download POST: headers=${JSON.stringify({ ...headers, 'Api-Key': headers['Api-Key'] ? headers['Api-Key'].slice(0, 5) + '...' : 'none' })}, body=${body}`);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(12000),
        });

        console.log(`[OpenSubtitles] Raw response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          console.error(`[OpenSubtitles] Error body:`, errText);

          if (response.status === 429 || response.status === 406 || errText.includes('allowed 5 subtitles')) {
            let resetTime = Date.now() + 11 * 3600 * 1000;
            try {
              const json = JSON.parse(errText);
              if (json.reset_time_utc) {
                resetTime = Date.parse(json.reset_time_utc) || resetTime;
              }
            } catch {}
            this.quotaResetTime = resetTime;
            throw new Error('تم بلوغ حد التحميل اليومي لـ OpenSubtitles (5 ملفات). يرجى استخدام الترجمات المباشرة من Stremio.');
          }
          if (response.status >= 500 && attempt < maxRetries) {
            console.warn(`[OpenSubtitles] Server returned ${response.status}, retrying...`);
            continue;
          }
          if (response.status === 503) {
            throw new Error('خوادم OpenSubtitles تحت ضغط مؤقت (503). يرجى تجربة ملف ترجمة آخر أو المحاولة بعد لحظات.');
          }
          throw new Error(`OpenSubtitles download error: ${response.status}`);
        }

        const data = (await response.json()) as OpenSubtitlesDownloadResponse;

        console.log(`[OpenSubtitles] Download link obtained. Remaining: ${data.remaining}`);

        const result: SubtitleDownloadResponse = {
          link: data.link,
          fileName: data.file_name,
          remaining: data.remaining,
          resetTime: data.reset_time_utc,
        };

        // Cache the successful download link
        this.downloadCache.set(fileId, { data: result, timestamp: Date.now() });

        return result;
      } catch (error: any) {
        lastError = error;
        // Retry on network errors or 503/server hiccups
        const isRetryable =
          error.message?.includes('503') ||
          error.message?.includes('502') ||
          error.name === 'TimeoutError' ||
          error.name === 'AbortError' ||
          error.code === 'ECONNRESET';
        if (isRetryable && attempt < maxRetries) {
          continue;
        }
        break;
      }
    }

    console.error('[OpenSubtitles] Download error:', lastError?.message);
    throw lastError || new Error('Failed to obtain download link');
  }

  /**
   * Check if API is configured
   */
  isConfigured(): boolean {
    return Boolean(process.env.OPENSUBTITLES_API_KEY || this.apiKey);
  }

  /**
   * Get API status info
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      apiKey: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : null,
      userAgent: this.userAgent,
      baseUrl: BASE_URL,
    };
  }
}

export const openSubtitlesAPI = new OpenSubtitlesAPI();
