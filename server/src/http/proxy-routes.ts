/**
 * Iframe Proxy Routes
 * 
 * Proxies embed URLs to make them same-origin, allowing captureStream() to work
 */

import { Router, type Request, type Response } from 'express';
import { isSafePublicUrl } from '../util/ssrf';

export function createProxyRoutes() {
  const router = Router();

  /**
   * GET /api/proxy/sports-stream/:channelId
   * 
   * Fetches the sports stream player, completely cleanses all ad scripts,
   * popunders, CPM trackers, and injects an active Ad-Shield to provide
   * a 100% ad-free, popup-free live sports playback experience.
   */
  router.get('/sports-stream/:channelId', async (req: Request, res: Response) => {
    const channelId = req.params.channelId;
    if (!channelId || !/^\d+$/.test(channelId)) {
      return res.status(400).send('Invalid channel ID');
    }

    try {
      // 1. Try to fetch directly from dembed.st
      let targetUrl = `https://dembed.st/premiumtv/daddy.php?id=${channelId}`;
      let upstreamRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Referer': 'https://thedaddy.li/',
        },
        signal: AbortSignal.timeout(8000),
      });

      let html = '';
      let isDembed = true;

      if (upstreamRes.ok) {
        html = await upstreamRes.text();
      } else {
        // Fallback: fetch from thedaddy.li wrapper
        isDembed = false;
        targetUrl = `https://thedaddy.li/stream/stream-${channelId}.php`;
        upstreamRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Referer': 'https://thedaddy.li/',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!upstreamRes.ok) {
          return res.status(502).send('Failed to fetch sports channel upstream');
        }
        html = await upstreamRes.text();
      }

      // SANITIZATION LAYER: Strip out all ad injection scripts & trackers
      // 1. Strip the huge obfuscated ZpQw9XkLmN8c3vR3 ad bundle (over 650KB of ad SDK code)
      html = html.replace(/<script>window\['ZpQw9XkLmN8c3vR3'\][\s\S]*?<\/script>/gi, '');
      html = html.replace(/window\['ZpQw9XkLmN8c3vR3'\]\s*=\s*'[^']*';?/gi, '');

      // 2. Strip aclib.runPop and other popunder launchers
      html = html.replace(/<script[^>]*>[\s\S]*?aclib\.runPop[\s\S]*?<\/script>/gi, '');

      // 3. Strip all known external ad networks, redirects, and trackers
      html = html.replace(
        /<script[^>]+src=["'][^"']*(?:capitalhospitals|profitableratecpmnetwork|thirstacock|histats|xadsmart|llvpn|popads|propellerads|adsterra)[^"']*["'][^>]*><\/script>/gi,
        ''
      );

      // 4. If dembed, resolve all relative assets to dembed.st base
      if (isDembed) {
        html = html.replace(/(src|href)=["'](?!\/\/|https?:\/\/)([^"']+)["']/gi, (_match, attr, path) => {
          return `${attr}="https://dembed.st/premiumtv/${path}"`;
        });
      }

      // 5. Neutralize anti-sandbox detection
      html = html.replace(/Remove sandbox/gi, '');
      html = html.replace(/['"]isSandboxed['"]\s*:\s*this\.#\w+/gi, "'isSandboxed':false");

      // 6. Inject client-side Ad-Shield & popup neutralization
      const adShield = `
<script>
  // Neutralize popups and redirects
  window.aclib = { runPop: function() {} };
  window.open = function() { console.log('[NexusAdShield] Blocked popup window.open'); return null; };
  window.alert = function() {};
  window.confirm = function() { return true; };
  // Trap click events on transparent overlays / invisible ad links
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (target && target.tagName === 'A' && target.target === '_blank') {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
</script>
<style>
  /* Ensure player fills 100% and hide any lingering ad banners */
  iframe[id*="ad"], div[class*="banner"], div[id*="banner"], div[class*="popup"], .ad-container {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
</style>
`;

      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + adShield);
      } else {
        html = adShield + html;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.send(html);
    } catch (err: any) {
      return res.status(500).send('Error proxying sports stream: ' + (err?.message || 'unknown'));
    }
  });

  /**
   * GET /api/proxy/tmdb-image?path=<imagePath>&size=<size>
   * 
   * Proxies TMDB images to avoid CORS issues
   * Example: /api/proxy/tmdb-image?path=/abc123.jpg&size=w342
   */
  router.get('/tmdb-image', async (req: Request, res: Response) => {
    const path = req.query.path as string | undefined;
    const size = (req.query.size as string) || 'original';

    if (!path) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }

    try {
      const imageUrl = `https://image.tmdb.org/t/p/${size}${path.startsWith('/') ? path : '/' + path}`;
      
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(response.status).send('Image not found');
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (err: any) {
      return res.status(500).send('Error fetching image: ' + (err?.message || 'unknown'));
    }
  });

  /**
   * GET /api/proxy/embed?url=<embedUrl>
   * 
   * Returns HTML page that loads the embed URL in an iframe
   * This makes the embed same-origin for captureStream()
   */
  router.get('/embed', (req: Request, res: Response) => {
    const url = req.query.url as string | undefined;

    if (!url || !isSafePublicUrl(url)) {
      return res.status(400).json({ error: 'Invalid or forbidden URL parameter' });
    }

    // Return HTML page with iframe
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NexusNight Player Proxy</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
  </style>
</head>
<body>
  <iframe 
    src="${url.replace(/"/g, '&quot;')}" 
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
</body>
</html>`;

    res.type('text/html').send(html);
  });

  return router;
}
