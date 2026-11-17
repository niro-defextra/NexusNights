/**
 * External Subtitles Types
 * Types for OpenSubtitles.com API integration
 */

export interface SubtitleSearchOptions {
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  languages?: string; // comma-separated ISO 639-2 codes (e.g., 'en,ar,tr')
}

export interface SubtitleResult {
  id: string; // file_id for download
  language: string; // ISO 639-2 code
  languageName: string; // Human-readable name
  fileName: string;
  downloadCount: number;
  rating: number;
  hearingImpaired: boolean;
  movieHashMatch: boolean;
}

export interface SubtitleDownloadResponse {
  link: string;
  fileName: string;
  remaining: number;
  resetTime: string;
}

export interface OpenSubtitlesSearchResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: {
      language: string;
      download_count: number;
      ratings: number;
      hearing_impaired: boolean;
      hd: boolean;
      fps: number;
      votes: number;
      points: number;
      from_trusted: boolean;
      foreign_parts_only: boolean;
      machine_translated: boolean;
      upload_date: string;
      ai_translated: boolean;
      nb_cd: number;
      moviehash_match: boolean;
      release: string;
      comments: string;
      legacy_subtitle_id: number;
      uploader: {
        uploader_id: number;
        name: string;
        rank: string;
      };
      feature_details: {
        feature_id: number;
        feature_type: string;
        year: number;
        title: string;
        movie_name: string;
        imdb_id: number;
        tmdb_id: number;
      };
      url: string;
      related_links: Array<{
        label: string;
        url: string;
        img_url: string;
      }>;
      files: Array<{
        file_id: number;
        cd_number: number;
        file_name: string;
      }>;
    };
  }>;
  total_pages: number;
  total_count: number;
  page: number;
}

export interface OpenSubtitlesDownloadResponse {
  link: string;
  file_name: string;
  requests: number;
  remaining: number;
  message: string;
  reset_time: string;
  reset_time_utc: string;
}
