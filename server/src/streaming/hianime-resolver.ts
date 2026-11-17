/**
 * HiAnime Direct Stream Resolver
 * Scrapes hianime.at, bypasses embed encryption (XOR otaku-embed-v1),
 * and extracts direct master .m3u8 playlists for 100% native HLS playback.
 */

import { streamResolver } from './stream-resolver';

const BASE_URL = 'https://hianime.at';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const OBFUSCATION_KEY = Buffer.from('otaku-embed-v1', 'utf8');
const SERVER_NAME = 'ZokoAnime';

export interface HiAnimeResolvedStream {
  streamId: string;
  masterUrl: string;
  referer: string;
  malId: number | null;
  subtitles: Array<{ url: string; language: string; label: string }>;
  resolution?: string;
  showTitle: string;
}

function deobfuscateBlob(blob: string): string {
  const buf = Buffer.from(blob, 'base64');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.length];
  }
  return out.toString('utf8');
}

function getAttr(str: string, attr: string): string | null {
  const m = str.match(new RegExp(`${attr}=["']([^"']+)["']`));
  return m ? m[1] : null;
}

function unwrapApiHtml(body: string): string {
  try {
    const json = JSON.parse(body);
    return json.html || '';
  } catch {
    return body;
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'");
}

export class HiAnimeResolver {
  private cache = new Map<string, { data: HiAnimeResolvedStream; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

  private getCacheKey(tmdbId: number, season: number = 1, episode: number = 1): string {
    return `hianime-${tmdbId}-s${season}e${episode}`;
  }

  /**
   * Search for show on HiAnime
   */
  async searchShow(query: string): Promise<Array<{ id: string; title: string; jname: string | null }>> {
    const q = encodeURIComponent(query).replace(/%20/g, '+');
    const res = await fetch(`${BASE_URL}/search?keyword=${q}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HiAnime search failed: HTTP ${res.status}`);
    const html = await res.text();
    const main = html.split('id="main-sidebar"')[0];
    const results: Array<{ id: string; title: string; jname: string | null }> = [];
    const re = /<h3 class="film-name">([\s\S]*?)<\/h3>/g;
    let m;

    while ((m = re.exec(main))) {
      const anchor = m[1].match(/<a\s+([^>]*)>/);
      if (!anchor) continue;
      const href = getAttr(anchor[1], 'href');
      const title = getAttr(anchor[1], 'title');
      if (!href || !title) continue;
      const id = href.split('?')[0].replace(/\/+$/, '').split('/').pop();
      if (!id) continue;
      const jname = getAttr(anchor[1], 'data-jname');
      results.push({
        id,
        title: decodeEntities(title),
        jname: jname ? decodeEntities(jname) : null,
      });
    }

    return results;
  }

  /**
   * Get episodes for a show id
   */
  async getEpisodes(showId: string): Promise<Array<{ epId: string; number: string }>> {
    const numericId = showId.slice(showId.lastIndexOf('-') + 1);
    if (!/^\d+$/.test(numericId)) throw new Error('Invalid show id format');

    const res = await fetch(`${BASE_URL}/api/theme/episode/list/${numericId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${BASE_URL}/`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HiAnime episodes failed: HTTP ${res.status}`);
    const body = await res.text();
    const html = unwrapApiHtml(body);
    const episodes: Array<{ epId: string; number: string }> = [];

    for (const chunk of html.split('ep-item').slice(1)) {
      const number = getAttr(chunk, 'data-number');
      const epId = getAttr(chunk, 'data-id');
      if (!number || !epId || !/^\d+$/.test(epId)) continue;
      if (!chunk.includes(`/watch/${showId}?ep=`)) continue;
      episodes.push({ epId, number });
    }

    return episodes;
  }

  /**
   * Extract stream for a specific episode
   */
  async extractStream(epId: string, mode: 'sub' | 'dub' = 'sub'): Promise<{
    masterUrl: string;
    referer: string;
    malId: number | null;
    subtitles: Array<{ url: string; language: string; label: string }>;
  }> {
    const res = await fetch(`${BASE_URL}/api/theme/episode/servers?episodeId=${epId}`, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${BASE_URL}/`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HiAnime servers failed: HTTP ${res.status}`);
    const body = await res.text();
    const html = unwrapApiHtml(body);

    let hash: string | null = null;
    for (const chunk of html.split('server-item').slice(1)) {
      if (
        getAttr(chunk, 'data-type') === mode &&
        getAttr(chunk, 'data-server-name') === SERVER_NAME
      ) {
        hash = getAttr(chunk, 'data-hash');
        if (hash) break;
      }
    }

    // Fallback to any server if ZokoAnime is missing
    if (!hash) {
      for (const chunk of html.split('server-item').slice(1)) {
        if (getAttr(chunk, 'data-type') === mode) {
          hash = getAttr(chunk, 'data-hash');
          if (hash) break;
        }
      }
    }

    if (!hash) throw new Error(`No available streaming server for ${mode}`);

    const embedUrl = Buffer.from(hash, 'base64').toString('utf8').trim();
    if (!/^https?:\/\//i.test(embedUrl)) throw new Error('Invalid embed url from server hash');

    const referer = embedUrl.replace(/^(https?:\/\/[^/]*).*$/, '$1/');
    const malMatch = embedUrl.match(/\/mal\/(\d+)\//);
    const malId = malMatch ? parseInt(malMatch[1], 10) : null;

    const embedRes = await fetch(embedUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': `${BASE_URL}/`,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!embedRes.ok) throw new Error(`Failed to fetch embed: HTTP ${embedRes.status}`);
    const embedHtml = await embedRes.text();
    const blobMatch = embedHtml.match(/window\.__P="([^"]*)"/);
    if (!blobMatch) throw new Error('Embed config blob not found in stream player');

    const jsonText = deobfuscateBlob(blobMatch[1]);
    let masterUrl: string | null = null;
    const subtitles: Array<{ url: string; language: string; label: string }> = [];

    try {
      const cfg = JSON.parse(jsonText);
      masterUrl = cfg.src || (cfg.sources && cfg.sources[0]?.file) || null;
      if (Array.isArray(cfg.subtitles)) {
        for (const s of cfg.subtitles) {
          if (s && s.src) {
            subtitles.push({
              url: s.src,
              language: s.lang || 'en',
              label: s.label || s.lang || 'Subtitles',
            });
          }
        }
      }
    } catch {
      const m = jsonText.match(/"src":"([^"]*\.m3u8[^"]*)"/);
      masterUrl = m ? m[1] : null;
    }

    if (!masterUrl) throw new Error('Failed to parse .m3u8 master URL from decrypted stream');

    return {
      masterUrl: masterUrl.replace(/\\\//g, '/'),
      referer,
      malId,
      subtitles,
    };
  }

  /**
   * Main resolve method by title & episode
   */
  async resolve(params: {
    title: string;
    tmdbId: number;
    kind: 'movie' | 'series';
    season?: number;
    episode?: number;
  }): Promise<HiAnimeResolvedStream> {
    const s = params.season ?? 1;
    const e = params.episode ?? 1;
    const cacheKey = this.getCacheKey(params.tmdbId, s, e);

    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      return hit.data;
    }

    // Enhanced anime search: for season > 1, try adding season number to search
    let searchQuery = params.title;
    if (s > 1) {
      // Try variations: "Title Season 2", "Title 2nd Season", "Title S2"
      searchQuery = `${params.title} Season ${s}`;
    }

    console.log(`[HiAnimeResolver] Searching anime for "${searchQuery}" (TMDB: ${params.tmdbId}, S${s}E${e})...`);
    let shows = await this.searchShow(searchQuery);
    
    // If season-specific search fails, fall back to base title
    if (shows.length === 0 && s > 1) {
      console.log(`[HiAnimeResolver] Season-specific search failed, trying base title: "${params.title}"`);
      shows = await this.searchShow(params.title);
    }

    if (shows.length === 0) {
      throw new Error(`No anime results found on HiAnime for "${params.title}"`);
    }

    // Smart season matching: prefer results with season indicators in title
    let show = shows[0];
    if (s > 1 && shows.length > 1) {
      // Season number patterns to look for
      const seasonPatterns = [
        new RegExp(`season\\s*${s}`, 'i'),
        new RegExp(`\\bs${s}\\b`, 'i'),
        new RegExp(`${s}nd\\s+season`, 'i'),
        new RegExp(`${s}rd\\s+season`, 'i'),
        new RegExp(`${s}th\\s+season`, 'i'),
        new RegExp(`part\\s*${s}`, 'i'),
        new RegExp(`cour\\s*${s}`, 'i'),
      ];

      // Try to find a show matching the season pattern
      const seasonMatch = shows.find((sh) => 
        seasonPatterns.some((pattern) => 
          pattern.test(sh.title) || (sh.jname && pattern.test(sh.jname))
        )
      );

      if (seasonMatch) {
        show = seasonMatch;
        console.log(`[HiAnimeResolver] Found season-specific match: ${show.title}`);
      } else {
        console.log(`[HiAnimeResolver] No season-specific match found, using first result: ${show.title}`);
      }
    }

    console.log(`[HiAnimeResolver] Selected anime: ${show.title} (${show.id})`);

    const episodes = await this.getEpisodes(show.id);
    if (episodes.length === 0) {
      throw new Error(`No episodes found for anime "${show.title}"`);
    }

    console.log(`[HiAnimeResolver] Found ${episodes.length} episodes for "${show.title}"`);

    // For movies, pick first episode. For series, match episode number
    const targetNumber = params.kind === 'movie' ? '1' : String(e);
    const episode = episodes.find((ep) => ep.number === targetNumber) || episodes[0];
    if (!episode) {
      throw new Error(`Episode ${targetNumber} not found for "${show.title}"`);
    }

    console.log(`[HiAnimeResolver] Resolving stream for episode ${episode.number} (epId: ${episode.epId})...`);
    const stream = await this.extractStream(episode.epId, 'sub');

    const streamId = `hianime-${Buffer.from(cacheKey).toString('hex').slice(0, 16)}`;
    const result: HiAnimeResolvedStream = {
      streamId,
      masterUrl: stream.masterUrl,
      referer: stream.referer,
      malId: stream.malId,
      subtitles: stream.subtitles,
      showTitle: show.title,
    };

    // Register with StreamResolver so the existing /api/stream-proxy/master/:id.m3u8 handles it!
    streamResolver.registerDirectStream({
      id: streamId,
      tmdbId: params.tmdbId,
      kind: params.kind,
      season: s,
      episode: e,
      playlistUrl: stream.masterUrl,
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': stream.referer,
        'Origin': stream.referer.replace(/\/+$/, ''),
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + this.CACHE_TTL_MS,
      provider: 'HiAnime (Direct HLS)',
    });

    this.cache.set(cacheKey, { data: result, expiresAt: Date.now() + this.CACHE_TTL_MS });
    console.log(`[HiAnimeResolver] ✅ Successfully resolved direct anime HLS stream: ${streamId}`);
    return result;
  }
}

export const hianimeResolver = new HiAnimeResolver();
