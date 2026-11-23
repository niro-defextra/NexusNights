import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config';

export interface LiveWatcher {
  sessionId: string;
  userId?: string;
  userName?: string;
  userIP: string;
  country: string;
  countryCode: string;
  flag: string;
  device: 'Mobile' | 'Desktop' | 'TV' | 'Tablet';
  tmdbId: number;
  kind: 'movie' | 'series';
  title: string;
  season?: number;
  episode?: number;
  posterUrl?: string;
  provider?: string;
  currentTime: number;
  duration: number;
  progressPercent: number;
  lastPing: number;
}

export interface ContentActivity {
  id: string;
  tmdbId: number;
  kind: 'movie' | 'series';
  title: string;
  season?: number;
  episode?: number;
  posterUrl?: string;
  watchCount: number;
  totalWatchTime: number; // in seconds
  uniqueUsers: Set<string>;
  lastWatched: number;
  providerBreakdown: Record<string, number>;
}

export interface SearchRecord {
  query: string;
  count: number;
  resultsCount: number;
  lastSearched: number;
}

export interface ActivityEvent {
  id: string;
  timestamp: number;
  userName: string;
  userId: string;
  action: string;
  country: string;
  countryCode: string;
  flag: string;
  device: string;
}

interface SessionData {
  ip: string;
  country: string;
  countryCode: string;
  flag: string;
  device: string;
  firstSeen: number;
  lastSeen: number;
  requests: number;
  streamingRequests: number;
}

const COUNTRY_NAMES: Record<string, { en: string; ar: string; flag: string }> = {
  EG: { en: 'Egypt', ar: 'مصر', flag: '🇪🇬' },
  SA: { en: 'Saudi Arabia', ar: 'السعودية', flag: '🇸🇦' },
  AE: { en: 'UAE', ar: 'الإمارات', flag: '🇦🇪' },
  DZ: { en: 'Algeria', ar: 'الجزائر', flag: '🇩🇿' },
  MA: { en: 'Morocco', ar: 'المغرب', flag: '🇲🇦' },
  IQ: { en: 'Iraq', ar: 'العراق', flag: '🇮🇶' },
  JO: { en: 'Jordan', ar: 'الأردن', flag: '🇯🇴' },
  KW: { en: 'Kuwait', ar: 'الكويت', flag: '🇰🇼' },
  QA: { en: 'Qatar', ar: 'قطر', flag: '🇶🇦' },
  BH: { en: 'Bahrain', ar: 'البحرين', flag: '🇧🇭' },
  OM: { en: 'Oman', ar: 'عمان', flag: '🇴🇲' },
  TN: { en: 'Tunisia', ar: 'تونس', flag: '🇹🇳' },
  LB: { en: 'Lebanon', ar: 'لبنان', flag: '🇱🇧' },
  SY: { en: 'Syria', ar: 'سوريا', flag: '🇸🇾' },
  PS: { en: 'Palestine', ar: 'فلسطين', flag: '🇵🇸' },
  YE: { en: 'Yemen', ar: 'اليمن', flag: '🇾🇪' },
  SD: { en: 'Sudan', ar: 'السودان', flag: '🇸🇩' },
  LY: { en: 'Libya', ar: 'ليبيا', flag: '🇱🇾' },
  US: { en: 'United States', ar: 'أمريكا', flag: '🇺🇸' },
  GB: { en: 'United Kingdom', ar: 'بريطانيا', flag: '🇬🇧' },
  DE: { en: 'Germany', ar: 'ألمانيا', flag: '🇩🇪' },
  FR: { en: 'France', ar: 'فرنسا', flag: '🇫🇷' },
  TR: { en: 'Turkey', ar: 'تركيا', flag: '🇹🇷' },
  NL: { en: 'Netherlands', ar: 'هولندا', flag: '🇳🇱' },
  CA: { en: 'Canada', ar: 'كندا', flag: '🇨🇦' },
  SE: { en: 'Sweden', ar: 'السويد', flag: '🇸🇪' },
  IT: { en: 'Italy', ar: 'إيطاليا', flag: '🇮🇹' },
  ES: { en: 'Spain', ar: 'إسبانيا', flag: '🇪🇸' },
};

function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function extractCountry(headers: Record<string, any> = {}, ip = ''): { country: string; countryCode: string; flag: string } {
  const cfCountry = headers['cf-ipcountry'] || headers['x-country-code'] || headers['x-geo-country'];
  if (cfCountry && typeof cfCountry === 'string' && cfCountry.length === 2 && cfCountry !== 'XX') {
    const code = cfCountry.toUpperCase();
    const info = COUNTRY_NAMES[code];
    return {
      country: info ? `${info.ar} (${info.en})` : code,
      countryCode: code,
      flag: info ? info.flag : getFlagEmoji(code),
    };
  }

  // Check if private / loopback
  if (ip.startsWith('127.') || ip === '::1' || ip === 'localhost') {
    return { country: 'Localhost (محلي)', countryCode: 'LOCAL', flag: '💻' };
  }
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('172.31.')) {
    return { country: 'Private LAN (شبكة محلية)', countryCode: 'LAN', flag: '🏠' };
  }

  return { country: 'Global (عالمي)', countryCode: 'WW', flag: '🌍' };
}

function extractDevice(userAgent = ''): 'Mobile' | 'Desktop' | 'TV' | 'Tablet' {
  const ua = userAgent.toLowerCase();
  if (
    ua.includes('smart-tv') ||
    ua.includes('tizen') ||
    ua.includes('webos') ||
    ua.includes('appletv') ||
    ua.includes('crkey') ||
    ua.includes('googletv') ||
    ua.includes('android tv') ||
    ua.includes('large screen')
  ) {
    return 'TV';
  }
  if (ua.includes('ipad') || ua.includes('tablet') || (ua.includes('android') && !ua.includes('mobile'))) {
    return 'Tablet';
  }
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('ipod') || (ua.includes('android') && ua.includes('mobile')) || ua.includes('capacitor')) {
    return 'Mobile';
  }
  return 'Desktop';
}

class AnalyticsTracker {
  private sessions = new Map<string, SessionData>();
  private contentActivity = new Map<string, ContentActivity>();
  private liveWatchers = new Map<string, LiveWatcher>();
  private searchQueries = new Map<string, SearchRecord>();
  private recentActivity: ActivityEvent[] = [];

  private readonly MAX_SESSIONS = 5000;
  private readonly MAX_ACTIVITY = 100;
  private readonly filePath = path.resolve(ROOT, 'data', 'analytics.json');
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.load();
    // Prune stale live watchers every 30 seconds
    setInterval(() => this.pruneStaleWatchers(), 30_000);
  }

  /**
   * Universal Playback Telemetry Tracking
   * Call whenever a user plays, pauses, or finishes any movie or series episode
   */
  trackPlayback(data: {
    sessionId?: string;
    userId?: string;
    userName?: string;
    userIP: string;
    userAgent?: string;
    headers?: Record<string, any>;
    tmdbId: number;
    kind: 'movie' | 'series';
    title: string;
    season?: number;
    episode?: number;
    posterUrl?: string;
    provider?: string;
    currentTime: number;
    duration: number;
    completed?: boolean;
  }): void {
    const now = Date.now();
    const geo = extractCountry(data.headers, data.userIP);
    const device = extractDevice(data.userAgent);
    const userHash = this.hashIP(data.userId || data.userIP);
    const userName = data.userName || `User ${userHash.slice(0, 4)}`;

    const contentKey = data.kind === 'movie'
      ? `movie-${data.tmdbId}`
      : `tv-${data.tmdbId}-s${data.season ?? 1}e${data.episode ?? 1}`;

    const progressPercent = data.duration > 0
      ? Math.min(100, Math.max(0, Math.round((data.currentTime / data.duration) * 100)))
      : 0;

    // 1. Update Live Watcher state
    const watcherKey = `${userHash}-${contentKey}`;
    this.liveWatchers.set(watcherKey, {
      sessionId: watcherKey,
      userId: data.userId,
      userName,
      userIP: this.anonymizeIP(data.userIP),
      country: geo.country,
      countryCode: geo.countryCode,
      flag: geo.flag,
      device,
      tmdbId: data.tmdbId,
      kind: data.kind,
      title: data.title,
      season: data.season,
      episode: data.episode,
      posterUrl: data.posterUrl,
      provider: data.provider || 'Aether',
      currentTime: data.currentTime,
      duration: data.duration,
      progressPercent,
      lastPing: now,
    });

    // 2. Update Content Aggregate Analytics
    let content = this.contentActivity.get(contentKey);
    const isNewWatch = !content || (now - content.lastWatched > 15 * 60 * 1000);

    if (!content) {
      content = {
        id: contentKey,
        tmdbId: data.tmdbId,
        kind: data.kind,
        title: data.title,
        season: data.season,
        episode: data.episode,
        posterUrl: data.posterUrl,
        watchCount: 0,
        totalWatchTime: 0,
        uniqueUsers: new Set(),
        lastWatched: now,
        providerBreakdown: {},
      };
      this.contentActivity.set(contentKey, content);
    }

    if (data.posterUrl && !content.posterUrl) {
      content.posterUrl = data.posterUrl;
    }

    if (isNewWatch) {
      content.watchCount++;
    }

    // Add 15s watch increment if actively watching
    content.totalWatchTime += 15;
    content.uniqueUsers.add(userHash);
    content.lastWatched = now;

    if (data.provider) {
      content.providerBreakdown[data.provider] = (content.providerBreakdown[data.provider] || 0) + 1;
    }

    // 3. Record Recent Activity log (avoid spamming every second)
    const lastEvent = this.recentActivity[0];
    const shouldAddEvent = !lastEvent || (lastEvent.userId !== userHash || now - lastEvent.timestamp > 3 * 60 * 1000);

    if (shouldAddEvent) {
      const epLabel = data.season && data.episode ? ` (S${data.season}E${data.episode})` : '';
      const actionText = data.completed
        ? `أكمل مشاهدة "${data.title}${epLabel}" (100%)`
        : `يشاهد "${data.title}${epLabel}" — ${progressPercent}% عبر ${data.provider || 'المشغل'}`;

      this.addActivityEvent({
        id: `ev-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        userName,
        userId: userHash,
        action: actionText,
        country: geo.country,
        countryCode: geo.countryCode,
        flag: geo.flag,
        device,
      });
    }

    // 4. Update session
    this.trackRequest(data.userIP, true, data.headers, data.userAgent);
    this.scheduleSave();
  }

  /**
   * Track search query
   */
  trackSearch(data: { query: string; resultsCount?: number; ip: string; headers?: Record<string, any> }): void {
    const raw = (data.query || '').trim().toLowerCase();
    if (!raw || raw.length < 2) return;

    let rec = this.searchQueries.get(raw);
    if (!rec) {
      rec = {
        query: data.query.trim(),
        count: 0,
        resultsCount: data.resultsCount ?? 0,
        lastSearched: Date.now(),
      };
      this.searchQueries.set(raw, rec);
    }

    rec.count++;
    rec.resultsCount = data.resultsCount ?? rec.resultsCount;
    rec.lastSearched = Date.now();

    this.scheduleSave();
  }

  /**
   * Track incoming request
   */
  trackRequest(ip: string, isStreaming = false, headers: Record<string, any> = {}, userAgent = ''): void {
    const sessionId = this.hashIP(ip);
    const now = Date.now();
    const geo = extractCountry(headers, ip);
    const device = extractDevice(userAgent);

    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        ip: this.anonymizeIP(ip),
        country: geo.country,
        countryCode: geo.countryCode,
        flag: geo.flag,
        device,
        firstSeen: now,
        lastSeen: now,
        requests: 0,
        streamingRequests: 0,
      };
      this.sessions.set(sessionId, session);
      if (this.sessions.size > this.MAX_SESSIONS) {
        this.cleanupOldSessions();
      }
    }

    session.lastSeen = now;
    session.requests++;
    if (isStreaming) session.streamingRequests++;
  }

  /**
   * Clean up live watchers inactive for more than 2 minutes
   */
  private pruneStaleWatchers(): void {
    const cutoff = Date.now() - 2 * 60 * 1000;
    for (const [key, watcher] of this.liveWatchers.entries()) {
      if (watcher.lastPing < cutoff) {
        this.liveWatchers.delete(key);
      }
    }
  }

  private addActivityEvent(event: ActivityEvent): void {
    this.recentActivity.unshift(event);
    if (this.recentActivity.length > this.MAX_ACTIVITY) {
      this.recentActivity.pop();
    }
  }

  private cleanupOldSessions(): void {
    const expiry = 48 * 60 * 60 * 1000; // 48h
    const now = Date.now();
    for (const [id, s] of this.sessions.entries()) {
      if (now - s.lastSeen > expiry) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Returns complete Ultra-Advanced Dashboard payload
   */
  getStats() {
    this.pruneStaleWatchers();

    // 1. Content lists
    const allContent = Array.from(this.contentActivity.values());

    const mostWatchedMovies = allContent
      .filter((c) => c.kind === 'movie')
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 30)
      .map((c) => ({
        id: c.id,
        tmdbId: c.tmdbId,
        title: c.title,
        kind: c.kind,
        watchCount: c.watchCount,
        totalWatchTime: c.totalWatchTime,
        uniqueUsers: c.uniqueUsers.size,
        posterUrl: c.posterUrl,
        lastWatched: c.lastWatched,
      }));

    const mostWatchedSeries = allContent
      .filter((c) => c.kind === 'series')
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 30)
      .map((c) => ({
        id: c.id,
        tmdbId: c.tmdbId,
        title: c.season && c.episode ? `${c.title} (S${c.season}E${c.episode})` : c.title,
        kind: c.kind,
        season: c.season,
        episode: c.episode,
        watchCount: c.watchCount,
        totalWatchTime: c.totalWatchTime,
        uniqueUsers: c.uniqueUsers.size,
        posterUrl: c.posterUrl,
        lastWatched: c.lastWatched,
      }));

    const allTimeTop = [...allContent]
      .sort((a, b) => b.watchCount - a.watchCount)
      .slice(0, 30)
      .map((c) => ({
        id: c.id,
        tmdbId: c.tmdbId,
        title: c.kind === 'series' && c.season && c.episode ? `${c.title} (S${c.season}E${c.episode})` : c.title,
        kind: c.kind,
        watchCount: c.watchCount,
        totalWatchTime: c.totalWatchTime,
        uniqueUsers: c.uniqueUsers.size,
        posterUrl: c.posterUrl,
        lastWatched: c.lastWatched,
      }));

    // 2. Total Watch Time & Views
    const totalWatchTime = allContent.reduce((sum, c) => sum + c.totalWatchTime, 0);
    const totalViews = allContent.reduce((sum, c) => sum + c.watchCount, 0);

    // 3. Traffic & Countries
    const countryCounts = new Map<string, { count: number; country: string; flag: string }>();
    for (const session of this.sessions.values()) {
      const code = session.countryCode || 'WW';
      const cur = countryCounts.get(code) || { count: 0, country: session.country, flag: session.flag };
      cur.count++;
      countryCounts.set(code, cur);
    }
    const totalSessions = Math.max(1, this.sessions.size);
    const trafficSources = Array.from(countryCounts.entries())
      .map(([code, data]) => ({
        countryCode: code,
        country: data.country,
        flag: data.flag,
        count: data.count,
        percentage: Math.round((data.count / totalSessions) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // 4. Device breakdown
    const deviceCounts = new Map<string, number>();
    for (const s of this.sessions.values()) {
      const d = s.device || 'Desktop';
      deviceCounts.set(d, (deviceCounts.get(d) || 0) + 1);
    }
    const deviceBreakdown = Array.from(deviceCounts.entries()).map(([device, count]) => ({
      device,
      count,
      percentage: Math.round((count / totalSessions) * 100),
    }));

    // 5. Active Sessions (last 5 min)
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    let activeSessions = 0;
    for (const s of this.sessions.values()) {
      if (s.lastSeen > fiveMinAgo) activeSessions++;
    }

    // 6. Top Searches
    const topSearches = Array.from(this.searchQueries.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 7. System Stats
    const mem = process.memoryUsage();
    const system = {
      uptime: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      },
    };

    return {
      totalUsers: Math.max(this.sessions.size, allContent.reduce((sum, c) => sum + c.uniqueUsers.size, 0)),
      activeSessions: Math.max(activeSessions, this.liveWatchers.size),
      totalWatchTime,
      totalViews,
      liveWatchers: Array.from(this.liveWatchers.values()),
      mostWatchedContent: allTimeTop,
      mostWatchedMovies,
      mostWatchedSeries,
      topSearches,
      trafficSources,
      deviceBreakdown,
      recentActivity: this.recentActivity,
      system,
    };
  }

  private hashIP(ip: string): string {
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = (hash << 5) - hash + ip.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  private anonymizeIP(ip: string): string {
    if (ip.includes(':')) {
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + ':xxxx';
    }
    const parts = ip.split('.');
    return parts.slice(0, 3).join('.') + '.xxx';
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 5000);
    this.saveTimer.unref();
  }

  public async save(): Promise<void> {
    try {
      const data = {
        content: Array.from(this.contentActivity.entries()).map(([k, v]) => ({
          ...v,
          uniqueUsers: Array.from(v.uniqueUsers),
        })),
        searches: Array.from(this.searchQueries.entries()),
        recent: this.recentActivity.slice(0, 100),
      };
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[AnalyticsTracker] Failed to save analytics:', err.message);
    }
  }

  public load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw);

      if (Array.isArray(data.content)) {
        for (const item of data.content) {
          this.contentActivity.set(item.id, {
            ...item,
            uniqueUsers: new Set(item.uniqueUsers || []),
            providerBreakdown: item.providerBreakdown || {},
          });
        }
      }

      if (Array.isArray(data.searches)) {
        for (const [k, v] of data.searches) {
          this.searchQueries.set(k, v);
        }
      }

      if (Array.isArray(data.recent)) {
        this.recentActivity = data.recent;
      }

      console.log(`[AnalyticsTracker] Loaded ${this.contentActivity.size} content records and ${this.searchQueries.size} searches from disk.`);
    } catch (err: any) {
      console.warn('[AnalyticsTracker] Could not load saved analytics:', err.message);
    }
  }

  public clearTelemetry(): void {
    this.contentActivity.clear();
    this.searchQueries.clear();
    this.liveWatchers.clear();
    this.recentActivity = [];
    void this.save();
  }
}

export const analyticsTracker = new AnalyticsTracker();
