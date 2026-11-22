import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import type { LibraryService } from '../library/service';
import { DiscordOAuth } from '../auth/discord-oauth';
import { SessionManager } from '../auth/session';
import { ProgressStore } from '../realtime/progress';
import { createRoutes } from './routes';
import { createAuthRoutes } from './auth-routes';
import { registerRoomRoutes } from './room-routes';
import { attachStreamingRoutes } from './streaming-routes';
import { createProxyRoutes } from './proxy-routes';
import { ROOT } from '../config';

function isOriginTrusted(origin: string, hostHeader?: string): boolean {
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    const hostWithPort = parsed.host.toLowerCase();

    // 1. Same host as incoming request Host header
    if (hostHeader) {
      const incomingHost = hostHeader.toLowerCase();
      const incomingHostname = incomingHost.split(':')[0];
      if (hostWithPort === incomingHost || hostname === incomingHostname) {
        return true;
      }
    }

    // 2. Localhost & Loopback development
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return true;
    }

    // 3. Mobile / Hybrid WebViews (Capacitor, Ionic, Tauri)
    if (parsed.protocol === 'capacitor:' || parsed.protocol === 'ionic:' || parsed.protocol === 'tauri:') {
      return true;
    }

    // 4. Discord Activities
    if (hostname.endsWith('.discordsays.com')) {
      return true;
    }

    // 5. Cloudflare tunnels for development/previews
    if (hostname.endsWith('.trycloudflare.com')) {
      return true;
    }

    // 6. Explicitly configured ALLOWED_ORIGINS env variable
    if (process.env.ALLOWED_ORIGINS) {
      const allowed = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim().toLowerCase());
      if (allowed.includes(origin.toLowerCase()) || allowed.includes(hostname) || allowed.includes(hostWithPort)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function createApp(svc: LibraryService) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', svc.cfg.trustProxy);

  // Hardened CORS support: reflect origin + credentials ONLY for trusted origins (Capacitor, Discord, local, host)
  // Untrusted cross-origins receive public '*' without credentials to prevent credential/session theft.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (isOriginTrusted(origin, req.headers.host)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, Range, accept');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      // Posters/artwork/HLS are consumed from other origins (Tizen TV app, Capacitor WebView,
      // Discord Activity iframe). Sending an explicit `cross-origin` CORP prevents responses
      // (and anything a proxy/CDN caches from them) from being treated as `same-origin`, which
      // browsers kill with net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: false,
    }),
  );
  // Discord's proxy strips "/.proxy" before forwarding; this keeps the same URLs working when the
  // app is opened through another proxy (or when testing the in-Discord code path locally).
  app.use((req, _res, next) => {
    if (req.url.startsWith('/.proxy/')) req.url = req.url.slice('/.proxy'.length);
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  const discord = new DiscordOAuth(svc.cfg);
  const sessions = new SessionManager(svc.cfg);
  const progress = new ProgressStore(svc.cfg);
  void progress.load();

  // Auth routes
  const authRoutes = createAuthRoutes(discord, sessions, svc.cfg);
  app.use('/api/auth', authRoutes);

  // Proxy routes (for same-origin embeds)
  app.use('/api/proxy', createProxyRoutes());

  // Room management routes
  registerRoomRoutes(app, sessions);

  // Streaming routes (server-side streaming)
  attachStreamingRoutes(app, sessions);

  // HLS streaming directory (serve .m3u8 and .ts files)
  const hlsDir = path.resolve(ROOT, 'data', 'hls');
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }
  app.use('/hls', express.static(hlsDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.m3u8')) {
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.endsWith('.ts')) {
        res.set('Content-Type', 'video/MP2T');
        res.set('Cache-Control', 'public, max-age=3600');
      }
      res.set('Access-Control-Allow-Origin', '*');
    },
  }));

  // IMPORTANT: Missing HLS segments/manifests must return 404, never fall through to SPA index.html!
  app.use('/hls', (_req, res) => {
    res.status(404).type('text/plain').send('HLS resource not ready or not found');
  });

  // Direct downloads serving (APK, WGT) from directed folder
  const directedDir = path.resolve(ROOT, 'directed');
  if (fs.existsSync(directedDir)) {
    const serveDownloads = express.static(directedDir, {
      setHeaders: (res, filePath) => {
        const basename = path.basename(filePath);
        res.set('Content-Disposition', `attachment; filename="${basename}"`);
        res.set('Access-Control-Allow-Origin', '*');
      },
    });
    app.use('/downloads', serveDownloads);
    app.use('/directed', serveDownloads);
  }

  // Main API routes
  const { router, adminToken } = createRoutes(svc, { sessions, progress });
  app.use('/api', router);

  // Production: one process serves API + the built React client (client/dist).
  const dist = svc.cfg.clientDir;
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '365d', immutable: true }));
    app.use(express.static(dist, { maxAge: '5m', index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return { app, adminToken, sessions, progress };
}
