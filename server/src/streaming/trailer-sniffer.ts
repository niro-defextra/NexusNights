import { spawn } from 'child_process';
import { streamResolver } from './stream-resolver';

interface TrailerCacheEntry {
  streamUrl: string;
  expiresAt: number;
}

const YTDLP_PATH = process.env.YTDLP_PATH || 'C:\\Users\\CursedChip\\AppData\\Local\\Programs\\Python\\Python314\\Scripts\\yt-dlp.exe';

export class TrailerSniffer {
  private cache = new Map<string, TrailerCacheEntry>();
  private pending = new Map<string, Promise<string | null>>();

  async sniffTrailer(youtubeKey: string): Promise<string | null> {
    const cached = this.cache.get(youtubeKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.streamUrl;
    }

    if (this.pending.has(youtubeKey)) {
      return this.pending.get(youtubeKey)!;
    }

    const promise = new Promise<string | null>((resolve) => {
      try {
        const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeKey}`;
        const proc = spawn(YTDLP_PATH, [
          '--no-warnings',
          '--no-progress',
          '--js-runtimes',
          'node:node',
          '-g',
          youtubeUrl,
        ]);

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        const timer = setTimeout(() => {
          try { proc.kill(); } catch {}
          resolve(null);
        }, 12000);

        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0 && !stdout.trim()) {
            console.warn(`[TrailerSniffer] yt-dlp exited with code ${code} for ${youtubeKey}`);
            resolve(null);
            return;
          }

          const lines = stdout.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const m3u8Url = lines.find((l) => l.includes('.m3u8')) || lines[0];

          if (!m3u8Url || !m3u8Url.startsWith('http')) {
            console.warn(`[TrailerSniffer] No valid m3u8 url in output for ${youtubeKey}`);
            resolve(null);
            return;
          }

          const streamId = `trailer-${youtubeKey}`;
          streamResolver.registerDirectStream({
            id: streamId,
            tmdbId: 0,
            kind: 'movie',
            playlistUrl: m3u8Url,
            headers: {
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'origin': 'https://www.youtube.com',
              'referer': 'https://www.youtube.com/',
            },
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 3600 * 1000,
            provider: 'youtube-trailer',
          });

          const proxyStreamUrl = `/api/stream-proxy/master/${streamId}.m3u8`;
          this.cache.set(youtubeKey, {
            streamUrl: proxyStreamUrl,
            expiresAt: Date.now() + 4 * 3600 * 1000,
          });

          console.log(`[TrailerSniffer] Successfully resolved trailer stream for ${youtubeKey}`);
          resolve(proxyStreamUrl);
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          console.error(`[TrailerSniffer] Process error for ${youtubeKey}:`, err.message);
          resolve(null);
        });
      } catch (err: any) {
        console.error(`[TrailerSniffer] Spawn error for ${youtubeKey}:`, err.message);
        resolve(null);
      }
    }).finally(() => {
      this.pending.delete(youtubeKey);
    });

    this.pending.set(youtubeKey, promise);
    return promise;
  }
}

export const trailerSniffer = new TrailerSniffer();
