import type { ProviderAdapter, ProviderMediaRequest, ProviderResult } from '../types';

export class VidriftAdapter implements ProviderAdapter {
  readonly id = 'vidrift';
  readonly name = 'Vidrift';
  readonly isSupported = true;
  readonly supportedTypes = ['movie', 'series'] as const;
  readonly basePriority = 100; // Third general provider (Vidrift #3)

  private readonly BASE_URL = 'https://embed.vidrift.net';

  async resolve(req: ProviderMediaRequest): Promise<ProviderResult> {
    if (!req.tmdbId || req.tmdbId <= 0) {
      return {
        providerId: this.id,
        providerName: this.name,
        isSupported: this.isSupported,
        sources: [],
        diagnostics: ['Invalid TMDB ID'],
      };
    }

    const params = 'title=true&hide=next,episodes,cast&brandColor=6366f1&sub=ar';
    let url: string;
    if (req.kind === 'movie') {
      url = `${this.BASE_URL}/embed/movie/${req.tmdbId}?${params}`;
    } else {
      const season = req.season ?? 1;
      const episode = req.episode ?? 1;
      url = `${this.BASE_URL}/embed/tv/${req.tmdbId}/${season}/${episode}?${params}`;
    }

    return {
      providerId: this.id,
      providerName: this.name,
      isSupported: this.isSupported,
      sources: [
        {
          id: `${this.id}-${req.kind}-${req.tmdbId}${req.season ? `-s${req.season}e${req.episode}` : ''}`,
          url,
          type: 'embed',
          embedUrl: url,
          quality: '1080p',
          providerId: this.id,
          providerName: this.name,
          isEmbed: true,
          priority: this.basePriority,
        },
      ],
      diagnostics: [],
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.BASE_URL}/`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(5000),
      });
      return res.status > 0 && res.status < 500;
    } catch {
      return false;
    }
  }
}
