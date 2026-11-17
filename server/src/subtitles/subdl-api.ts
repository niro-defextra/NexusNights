/**
 * SubDL API Client
 * Premier source for professional Arabic & global community subtitles.
 * Provides free TMDB search and in-memory ZIP subtitle extraction.
 */

import zlib from 'node:zlib';
import path from 'node:path';

export interface SubDLSubtitleItem {
  id: string;
  name: string;
  lang: string;
  release: string;
  author: string;
  downloadUrl: string;
}

const SUBTITLE_EXTS = new Set(['srt', 'vtt', 'ass', 'ssa']);
const ZIP_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export function extractSubtitleFromZip(buf: Buffer): { data: Buffer; name: string } | null {
  let offset = 0;
  while (offset < buf.length - 30) {
    if (
      buf[offset] === 0x50 &&
      buf[offset + 1] === 0x4b &&
      buf[offset + 2] === 0x03 &&
      buf[offset + 3] === 0x04
    ) {
      const compression = buf.readUInt16LE(offset + 8);
      const compressedSize = buf.readUInt32LE(offset + 18);
      const fileNameLen = buf.readUInt16LE(offset + 26);
      const extraLen = buf.readUInt16LE(offset + 28);
      const rawFileName = buf
        .subarray(offset + 30, offset + 30 + fileNameLen)
        .toString('utf8');
      const dataOffset = offset + 30 + fileNameLen + extraLen;
      const fileName = path.basename(rawFileName);
      const ext = fileName.toLowerCase().split('.').pop();

      if (ext && SUBTITLE_EXTS.has(ext)) {
        const compressedData = buf.subarray(dataOffset, dataOffset + compressedSize);
        let data: Buffer;
        if (compression === 0) {
          if (compressedData.length > ZIP_MAX_OUTPUT_BYTES) {
            offset = dataOffset + compressedSize;
            continue;
          }
          data = compressedData;
        } else if (compression === 8) {
          try {
            data = zlib.inflateRawSync(compressedData, {
              maxOutputLength: ZIP_MAX_OUTPUT_BYTES,
            });
          } catch {
            offset = dataOffset + compressedSize;
            continue;
          }
        } else {
          offset = dataOffset + compressedSize;
          continue;
        }
        return { data, name: fileName };
      }
      offset = dataOffset + compressedSize;
    } else {
      offset++;
    }
  }
  return null;
}

export class SubDLAPI {
  private apiKey: string | null = process.env.SUBDL_API_KEY || null;

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
    languages?: string; // e.g. "ar,en"
  }): Promise<SubDLSubtitleItem[]> {
    if (!this.apiKey) {
      return [];
    }

    try {
      const query = new URLSearchParams({
        api_key: this.apiKey,
        tmdb_id: String(params.tmdbId),
        type: params.kind === 'series' ? 'tv' : 'movie',
        subs_per_page: '25',
      });

      if (params.kind === 'series') {
        if (params.season != null) query.set('season_number', String(params.season));
        if (params.episode != null) query.set('episode_number', String(params.episode));
      }

      if (params.languages) {
        query.set('languages', params.languages.toUpperCase());
      }

      const url = `https://api.subdl.com/api/v1/subtitles?${query.toString()}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NexusNight/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return [];
      }

      const json = await res.json() as {
        status?: boolean;
        subtitles?: Array<{
          sd_id: number;
          name: string;
          lang: string;
          release_name: string;
          author: string;
          url: string;
        }>;
      };

      if (!json.status || !Array.isArray(json.subtitles)) {
        return [];
      }

      return json.subtitles.map((s) => ({
        id: `subdl_${s.sd_id}`,
        name: s.name || s.release_name || 'Arabic Subtitle',
        lang: (s.lang || 'ar').toLowerCase(),
        release: s.release_name || s.name || 'SubDL Release',
        author: s.author || 'SubDL',
        downloadUrl: `https://dl.subdl.com${s.url}`,
      }));
    } catch {
      return [];
    }
  }

  async downloadAndExtract(downloadUrl: string): Promise<Buffer | null> {
    try {
      const res = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'NexusNight/1.0' },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      const zipBuf = Buffer.from(arrayBuf);
      const extracted = extractSubtitleFromZip(zipBuf);
      return extracted ? extracted.data : null;
    } catch {
      return null;
    }
  }
}

export const subdlAPI = new SubDLAPI();
