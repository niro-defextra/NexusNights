/**
 * Super Ultra Advanced Admin Control Center & Telemetry Radar
 * 
 * Access via ADMIN_TOKEN or Discord Admin Session (ADMIN_DISCORD_ID)
 * Navigate to: /#/admin
 */

import { useEffect, useState, useRef } from 'react';
import { useI18n } from '../i18n';
import {
  Spinner,
  Users,
  Film,
  Clock,
  TrendingUp,
  Activity,
  Lock,
  Zap,
  BarChart,
  Tv,
  Search,
  Check,
  X,
  Trash2,
  Sliders,
  Globe,
  ExternalLink,
} from '../components/Icons';
import { u } from '../api';
import { useAuth } from '../auth/AuthContext';
import { nativeStorage } from '../native/platform';
import { registerBackHandler } from '../native/back-button';
import { go } from '../router';

const STORAGE_KEY = 'nexusnight_admin_token';
const DISCORD_TOKEN_KEY = 'nexusnight_token';

interface LiveWatcher {
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

interface ContentItem {
  id: string;
  tmdbId: number;
  title: string;
  kind?: 'movie' | 'series';
  season?: number;
  episode?: number;
  watchCount: number;
  totalWatchTime: number;
  uniqueUsers: number;
  posterUrl?: string;
  lastWatched?: number;
}

interface SearchItem {
  query: string;
  count: number;
  resultsCount: number;
  lastSearched: number;
}

interface TrafficSource {
  country: string;
  countryCode: string;
  flag: string;
  count: number;
  percentage: number;
}

interface DeviceStat {
  device: string;
  count: number;
  percentage: number;
}

interface ActivityEvent {
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

interface ProviderStat {
  id: string;
  name: string;
  enabled: boolean;
  healthScore: number;
  successRate: number;
  inCooldown: boolean;
  totalAttempts: number;
}

interface RoomMeta {
  id: string;
  hostId: string;
  hostName: string;
  title: string;
  mediaId: string;
  createdAt: number;
  isPublic: boolean;
  inviteCode: string;
  started?: boolean;
}

interface DashboardStats {
  totalUsers: number;
  activeSessions: number;
  totalWatchTime: number;
  totalViews: number;
  liveWatchers: LiveWatcher[];
  mostWatchedContent: ContentItem[];
  mostWatchedMovies: ContentItem[];
  mostWatchedSeries: ContentItem[];
  topSearches: SearchItem[];
  trafficSources: TrafficSource[];
  deviceBreakdown: DeviceStat[];
  recentActivity: ActivityEvent[];
  providers: ProviderStat[];
  rooms: RoomMeta[];
  activeRooms: number;
  totalRooms: number;
  library?: { movies: number; episodes: number; total: number };
  streaming?: {
    activeBrowserSessions: number;
    maxBrowserSessions: number;
    cachedStreams: number;
    pendingResolutions: number;
    segmentCache?: { entries: number; bytes: number; maxBytes: number };
  };
  system?: {
    uptime: number;
    nodeVersion: string;
    platform: string;
    memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  };
}

function useAdminToken() {
  const [token, setTokenState] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
  });

  useEffect(() => {
    nativeStorage.get(STORAGE_KEY).then((saved) => {
      if (saved && saved !== token) setTokenState(saved);
    }).catch(() => {});
  }, []);

  const save = (t: string) => {
    try {
      if (t) {
        localStorage.setItem(STORAGE_KEY, t);
        void nativeStorage.set(STORAGE_KEY, t);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        void nativeStorage.remove(STORAGE_KEY);
      }
    } catch { /* ignore */ }
    setTokenState(t);
  };
  return [token, save] as const;
}

// ── Token / Admin Login Screen ──────────────────────────────────────────────
function TokenLoginScreen({ onVerified }: { onVerified: (token: string) => void }) {
  const { lang } = useI18n();
  const { user, login } = useAuth();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const verify = async (tToVerify?: string) => {
    const t = (tToVerify ?? input).trim();
    if (!t && !user) return;
    setLoading(true);
    setError(null);
    try {
      const discordToken = localStorage.getItem(DISCORD_TOKEN_KEY);
      const headers: Record<string, string> = {};
      if (t) {
        headers['x-admin-token'] = t;
        headers['Authorization'] = `Bearer ${t}`;
      } else if (discordToken) {
        headers['Authorization'] = `Bearer ${discordToken}`;
      }

      const res = await fetch(u('/api/admin/verify'), {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        onVerified(t || (discordToken ?? 'session'));
      } else {
        setError(lang === 'ar' ? 'التوكن غير صحيح أو حسابك ليس أدمن' : 'Invalid admin token or unauthorized account');
      }
    } catch {
      setError(lang === 'ar' ? 'فشل الاتصال بالخادم' : 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-20 items-center justify-center rounded-3xl bg-gilt/10 border border-gilt/30 shadow-xl shadow-gilt/5">
            <Lock className="size-10 text-gilt" />
          </div>
          <h1 className="font-display text-3xl font-extrabold text-bone tracking-wide">
            {lang === 'ar' ? 'مركز التحكم والتحليلات' : 'Admin Command Center'}
          </h1>
          <p className="mt-2 text-sm text-dust">
            {lang === 'ar' ? 'تسجيل الدخول بصلاحيات المسؤول الكاملة' : 'Login with full administrator privileges'}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-crypt/90 p-8 shadow-2xl backdrop-blur-xl">
          <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-dust">
            {lang === 'ar' ? 'رمز الأدمن السري (Admin Token)' : 'Admin Token'}
          </label>
          <input
            ref={ref}
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') void verify(); }}
            placeholder={lang === 'ar' ? 'أدخل التوكن أو كلمة السر...' : 'Enter token or password...'}
            className="w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3.5 text-sm text-bone outline-none transition focus:border-gilt/60 placeholder:text-dust/40 font-mono"
            dir="ltr"
          />

          {error && <p className="mt-3 text-xs font-semibold text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">{error}</p>}

          <button
            onClick={() => void verify()}
            disabled={loading || !input.trim()}
            className="mt-5 w-full rounded-2xl bg-gilt px-6 py-3.5 text-sm font-bold text-ink transition hover:bg-gilt/90 active:scale-95 disabled:opacity-40 shadow-lg shadow-gilt/20 flex items-center justify-center gap-2"
          >
            {loading ? <Spinner className="size-4" /> : <span>{lang === 'ar' ? 'دخول لوحة التحكم' : 'Authenticate & Enter'}</span>}
          </button>

          {/* Discord Login Option */}
          <div className="mt-6 border-t border-white/10 pt-6 text-center">
            <p className="text-xs text-dust/70 mb-3">
              {lang === 'ar' ? 'أو الدخول المباشر إذا كان حساب ديسكورد مسجل كمسؤول:' : 'Or direct entry if your Discord account is admin:'}
            </p>
            {user ? (
              <button
                onClick={() => void verify('')}
                disabled={loading}
                className="w-full rounded-2xl border border-gilt/30 bg-gilt/10 py-3 text-xs font-bold text-gilt transition hover:bg-gilt/20 flex items-center justify-center gap-2"
              >
                <Users className="size-4" />
                <span>{lang === 'ar' ? `المتابعة كـ ${user.name}` : `Continue as ${user.name}`}</span>
              </button>
            ) : (
              <button
                onClick={login}
                className="w-full rounded-2xl border border-indigo-500/30 bg-indigo-500/10 py-3 text-xs font-bold text-indigo-300 transition hover:bg-indigo-500/20 flex items-center justify-center gap-2"
              >
                <span>{lang === 'ar' ? 'تسجيل الدخول عبر Discord' : 'Sign in with Discord'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Ultra-Advanced Dashboard ───────────────────────────────────────────
export function AdminDashboard() {
  const { lang } = useI18n();
  const { user, isAdmin, refreshAdmin } = useAuth();
  const [token, saveToken] = useAdminToken();
  const [verified, setVerified] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'content' | 'providers' | 'system'>('live');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string; duration?: number } | null>(null);

  const ar = lang === 'ar';

  useEffect(() => {
    return registerBackHandler(() => {
      go.home();
      return true;
    });
  }, []);

  // Helper to get auth header (token or discord session)
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (token) {
      headers['x-admin-token'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
    const discordToken = localStorage.getItem(DISCORD_TOKEN_KEY);
    if (discordToken && !token) {
      headers['Authorization'] = `Bearer ${discordToken}`;
    }
    return headers;
  };

  // Auto-verify on mount (if token exists or user is admin via Discord)
  useEffect(() => {
    const verifyAuth = async () => {
      try {
        const res = await fetch(u('/api/admin/verify'), {
          method: 'POST',
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          setVerified(true);
        } else if (token) {
          saveToken('');
        }
      } catch {
        // network issue
      }
    };

    if (token || isAdmin || user) {
      void verifyAuth();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, user]);

  const handleVerified = (t: string) => {
    saveToken(t);
    setVerified(true);
    void refreshAdmin();
  };

  const loadStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(u('/api/admin/stats'), {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        if (response.status === 401) {
          saveToken('');
          setVerified(false);
          return;
        }
        throw new Error(ar ? 'فشل تحميل بيانات لوحة التحكم' : 'Failed to fetch dashboard stats');
      }
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || (ar ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!verified) return;
    void loadStats();
    // Auto refresh every 15 seconds for realtime telemetry
    const interval = setInterval(() => void loadStats(true), 15_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified]);

  const showNotification = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  // ── Admin Actions ──────────────────────────────────────────────────────────
  const toggleProvider = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(u(`/api/streaming/providers/${id}/toggle`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (res.ok) {
        showNotification(ar ? `تم ${!currentEnabled ? 'تفعيل' : 'تعطيل'} المزود ${id}` : `Provider ${id} ${!currentEnabled ? 'enabled' : 'disabled'}`);
        void loadStats(true);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const testProvider = async (id: string) => {
    setTestingProvider(id);
    setTestResult(null);
    const start = Date.now();
    try {
      const res = await fetch(u(`/api/streaming/providers/${id}/test`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ tmdbId: 1368337, kind: 'movie' }),
      });
      const data = await res.json();
      const duration = Date.now() - start;
      if (res.ok && data.success) {
        setTestResult({ id, ok: true, message: `✅ نجح في ${duration}ms! جودة: ${data.quality || 'HLS'}`, duration });
      } else {
        setTestResult({ id, ok: false, message: `❌ فشل: ${data.error || 'No stream resolved'}`, duration });
      }
    } catch (e: any) {
      setTestResult({ id, ok: false, message: `❌ خطأ في الفحص: ${e.message}` });
    } finally {
      setTestingProvider(null);
    }
  };

  const resetCooldowns = async () => {
    try {
      const res = await fetch(u('/api/streaming/providers/reset-cooldowns'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification(ar ? 'تم تصفير جميع فترات الانتظار والأخطاء بنجاح' : 'All provider cooldowns reset successfully');
        void loadStats(true);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const clearCache = async () => {
    try {
      const res = await fetch(u('/api/admin/clear-cache'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification(ar ? 'تم مسح كاش البث والقطع المؤقتة بنجاح' : 'All stream and segment caches cleared');
        void loadStats(true);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const closeRoom = async (roomId: string) => {
    if (!confirm(ar ? `هل أنت متأكد من إنهاء الغرفة ${roomId}؟` : `Terminate room ${roomId}?`)) return;
    try {
      const res = await fetch(u(`/api/admin/rooms/${roomId}/close`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification(ar ? `تم إنهاء الغرفة ${roomId}` : `Room ${roomId} closed`);
        void loadStats(true);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const rescanLibrary = async () => {
    try {
      const res = await fetch(u('/api/library/rescan'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification(ar ? 'بدأ فحص المكتبة في الخلفية...' : 'Library scan started...');
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  const resetTelemetry = async () => {
    if (!confirm(ar ? 'تنبيه: سيتم مسح جميع سجلات المشاهدة والتحليلات. متأكد؟' : 'Warning: This will clear all telemetry history. Proceed?')) return;
    try {
      const res = await fetch(u('/api/admin/telemetry/reset'), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        showNotification(ar ? 'تم تصفير بيانات التحليلات بنجاح' : 'Telemetry data reset');
        void loadStats(true);
      }
    } catch (e: any) {
      showNotification(`Error: ${e.message}`);
    }
  };

  if (!verified) return <TokenLoginScreen onVerified={handleVerified} />;

  if (loading && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-10 text-gilt" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center max-w-md bg-crypt/90 border border-white/10 p-8 rounded-3xl">
          <h1 className="text-2xl font-bold text-blood-hot mb-3">{ar ? 'خطأ في الاتصال' : 'Error'}</h1>
          <p className="text-dust mb-6 text-sm leading-relaxed">{error}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => void loadStats()} className="rounded-xl bg-gilt px-6 py-2.5 font-bold text-ink">
              {ar ? 'إعادة المحاولة' : 'Retry'}
            </button>
            <button onClick={() => { saveToken(''); setVerified(false); }} className="rounded-xl border border-white/15 px-6 py-2.5 text-sm text-dust">
              {ar ? 'تسجيل الخروج' : 'Logout'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (ar) return hours > 0 ? `${hours} س ${minutes} د` : `${minutes} د`;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const fmt = (n: number) => new Intl.NumberFormat(ar ? 'ar-EG' : 'en-US').format(n);

  return (
    <div className="min-h-screen px-[var(--pad)] py-20 bg-gradient-to-b from-black via-crypt/50 to-black">
      <div className="mx-auto max-w-7xl">

        {/* Global Notification Banner */}
        {actionNotice && (
          <div className="fixed top-6 start-1/2 -translate-x-1/2 z-50 rounded-2xl bg-gilt text-ink px-6 py-3 font-bold text-sm shadow-2xl animate-fade-in flex items-center gap-2">
            <Check className="size-5" />
            <span>{actionNotice}</span>
          </div>
        )}

        {/* Header Bar */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-5 bg-crypt/70 border border-white/10 p-6 rounded-3xl backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="flex size-3 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-2xl md:text-3xl font-extrabold text-bone tracking-wide">
                ⚡ {ar ? 'لوحة التحكم الفائقة والإحصائيات' : 'Ultra Admin Command Center'}
              </h1>
            </div>
            <p className="text-xs text-dust/80">
              {ar
                ? `مسؤول النظام: ${user?.name || 'Admin'} · تحديث حي ومراقبة فورية للموقع`
                : `Active Admin: ${user?.name || 'Admin'} · Real-time monitoring & telemetry`}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => void loadStats(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-gilt/40 bg-gilt/10 px-4 py-2.5 text-xs font-bold text-gilt transition hover:bg-gilt/20 disabled:opacity-50"
            >
              {refreshing ? <Spinner className="size-4" /> : <Activity className="size-4" />}
              <span>{ar ? 'تحديث فوري' : 'Live Refresh'}</span>
            </button>
            <button
              onClick={() => { saveToken(''); setVerified(false); }}
              className="rounded-2xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-dust transition hover:bg-white/10 hover:text-bone"
            >
              {ar ? 'خروج' : 'Logout'}
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <StatCard
            icon={<Users className="size-5 text-gilt" />}
            color="gilt"
            label={ar ? 'إجمالي الزوار' : 'Total Viewers'}
            value={fmt(stats.totalUsers)}
            sub={ar ? `${fmt(stats.activeSessions)} متصل الآن` : `${fmt(stats.activeSessions)} online now`}
          />
          <StatCard
            icon={<Activity className="size-5 text-emerald-400" />}
            color="emerald"
            label={ar ? 'يشاهدون البث حالياً' : 'Live Watchers'}
            value={fmt(stats.liveWatchers.length)}
            sub={ar ? 'جلسات فيديو نشطة بالثانية' : 'Active playback streams'}
          />
          <StatCard
            icon={<Clock className="size-5 text-blood-hot" />}
            color="blood"
            label={ar ? 'إجمالي وقت المشاهدة' : 'Total Watch Time'}
            value={formatDuration(stats.totalWatchTime)}
            sub={ar ? `${fmt(stats.totalViews)} مرات تشغيل` : `${fmt(stats.totalViews)} total plays`}
          />
          <StatCard
            icon={<Film className="size-5 text-sky-400" />}
            color="sky"
            label={ar ? 'المكتبة والغرف' : 'Library & Rooms'}
            value={`${fmt(stats.library?.total ?? 0)}`}
            sub={ar ? `${stats.activeRooms} غرف جماعية نشطة` : `${stats.activeRooms} active rooms`}
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-white/10 pb-4 mb-8 overflow-x-auto scrollbar-none">
          {[
            { id: 'live', label: ar ? '🛰️ الرادار والمشاهدين الآن' : '🛰️ Live Radar', count: stats.liveWatchers.length },
            { id: 'content', label: ar ? '🎬 الأكثر مشاهدة والبحث' : '🎬 Top Content & Searches', count: stats.mostWatchedMovies.length + stats.mostWatchedSeries.length },
            { id: 'providers', label: ar ? '⚡ المزودات وسنيفر البث' : '⚡ Providers & Sniffer', count: stats.providers.length },
            { id: 'system', label: ar ? '🛠️ الغرف والنظام والكاش' : '🛠️ Rooms & Vitals', count: stats.rooms.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-5 py-3 rounded-2xl text-xs font-bold transition flex items-center gap-2.5 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gilt text-ink shadow-lg shadow-gilt/20'
                  : 'bg-crypt/80 border border-white/10 text-dust hover:text-bone hover:border-white/20'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  activeTab === tab.id ? 'bg-ink/20 text-ink' : 'bg-white/10 text-dust'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: LIVE RADAR & WATCHERS */}
        {activeTab === 'live' && (
          <div className="space-y-8 animate-fade-in">
            {/* Live Watchers Right Now */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-3 rounded-full bg-emerald-500 animate-ping" />
                  <h2 className="text-lg font-bold text-bone">
                    {ar ? 'يشاهدون الآن على الموقع (Live Telemetry)' : 'Watching Right Now (Live Watchers)'}
                  </h2>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  {stats.liveWatchers.length} {ar ? 'متابع نشط' : 'active now'}
                </span>
              </div>

              {stats.liveWatchers.length === 0 ? (
                <div className="text-center py-12 text-dust/60">
                  <Film className="size-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{ar ? 'لا يوجد أحد يشاهد بثاً في هذه اللحظة. تظهر الشاشات فور بدء أي زائر المشاهدة.' : 'No active stream playback right now. Watchers appear instantly upon playing.'}</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {stats.liveWatchers.map((w) => (
                    <div key={w.sessionId} className="rounded-2xl border border-white/10 bg-black/40 p-4 hover:border-gilt/40 transition">
                      <div className="flex gap-3.5 mb-3">
                        {w.posterUrl ? (
                          <img src={u(w.posterUrl)} alt="" className="size-16 rounded-xl object-cover shrink-0 border border-white/10 shadow" />
                        ) : (
                          <div className="size-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-dust">
                            <Film className="size-6" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-bone truncate">{w.title}</h3>
                          {w.season && w.episode && (
                            <p className="text-xs text-gilt font-mono mt-0.5">S{w.season} E{w.episode}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-dust">
                            <span className="flex items-center gap-1 font-mono">
                              <span>{w.flag}</span>
                              <span className="truncate max-w-[90px]">{w.country}</span>
                            </span>
                            <span>•</span>
                            <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-bone font-medium">{w.device}</span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1 mt-3">
                        <div className="flex justify-between text-[10px] font-mono text-dust">
                          <span>{formatDuration(w.currentTime)} / {formatDuration(w.duration)}</span>
                          <span className="text-emerald-400 font-bold">{w.progressPercent}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-gilt rounded-full transition-all duration-500" style={{ width: `${w.progressPercent}%` }} />
                        </div>
                      </div>

                      {/* Provider Badge */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-dust/70 pt-2 border-t border-white/5 font-mono">
                        <span>{w.userName}</span>
                        <span className="text-gilt/80 font-bold">via {w.provider || 'Aether'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Geography & Device Telemetry */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Traffic Sources */}
              <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2.5 mb-5">
                  <Globe className="size-5 text-sky-400" />
                  <h3 className="text-base font-bold text-bone">{ar ? 'التوزيع الجغرافي للزوار (البلدان)' : 'Visitor Geography & Countries'}</h3>
                </div>
                {stats.trafficSources.length === 0 ? (
                  <p className="text-xs text-dust/60 py-6 text-center">{ar ? 'لا توجد بيانات جغرافية بعد' : 'No geographic data yet'}</p>
                ) : (
                  <div className="space-y-3">
                    {stats.trafficSources.slice(0, 8).map((src) => (
                      <div key={src.countryCode} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-2 text-bone font-medium">
                            <span className="text-base">{src.flag}</span>
                            <span>{src.country}</span>
                          </span>
                          <span className="font-mono text-dust">{fmt(src.count)} ({src.percentage}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full bg-sky-500 rounded-full" style={{ width: `${src.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Device Distribution */}
              <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2.5 mb-5">
                  <Tv className="size-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-bone">{ar ? 'أنواع الأجهزة المستخدمة' : 'Device Breakdown'}</h3>
                </div>
                {stats.deviceBreakdown.length === 0 ? (
                  <p className="text-xs text-dust/60 py-6 text-center">{ar ? 'لا توجد بيانات أجهزة بعد' : 'No device data yet'}</p>
                ) : (
                  <div className="space-y-3">
                    {stats.deviceBreakdown.map((dev) => (
                      <div key={dev.device} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-bone font-medium">{dev.device}</span>
                          <span className="font-mono text-dust">{fmt(dev.count)} ({dev.percentage}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${dev.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Live Activity Stream Feed */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <TrendingUp className="size-5 text-gilt" />
                <h3 className="text-base font-bold text-bone">{ar ? 'سجل الأحداث والنشاط الفوري' : 'Live Event Activity Stream'}</h3>
              </div>
              {stats.recentActivity.length === 0 ? (
                <p className="text-xs text-dust/60 py-6 text-center">{ar ? 'لا يوجد نشاط مسجل بعد' : 'No activity logged yet'}</p>
              ) : (
                <div className="space-y-2.5 max-h-96 overflow-y-auto scrollbar-thin">
                  {stats.recentActivity.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] p-3 text-xs hover:bg-white/[0.06] transition border border-white/5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-base shrink-0">{ev.flag || '🌍'}</span>
                        <div className="min-w-0">
                          <p className="text-bone truncate font-medium">
                            <span className="text-gilt font-bold">{ev.userName}</span>: {ev.action}
                          </p>
                          <span className="text-[10px] text-dust/60 font-mono">{ev.country} · {ev.device}</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-dust shrink-0">
                        {new Date(ev.timestamp).toLocaleTimeString(ar ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: TOP CONTENT & SEARCHES */}
        {activeTab === 'content' && (
          <div className="space-y-8 animate-fade-in">
            {/* Top Movies & Series Side-by-Side */}
            <div className="grid gap-6 lg:grid-cols-2">

              {/* Most Watched Movies */}
              <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <Film className="size-5 text-gilt" />
                    <h3 className="text-base font-bold text-bone">{ar ? 'الأفلام الأكثر مشاهدة' : 'Most Watched Movies'}</h3>
                  </div>
                  <span className="text-xs text-dust font-mono">{stats.mostWatchedMovies.length} {ar ? 'فيلم' : 'movies'}</span>
                </div>

                {stats.mostWatchedMovies.length === 0 ? (
                  <p className="text-xs text-dust/60 py-8 text-center">{ar ? 'لا توجد بيانات مشاهدة للأفلام بعد' : 'No movie watch data yet'}</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                    {stats.mostWatchedMovies.map((m, i) => (
                      <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 hover:bg-white/[0.06] transition border border-white/5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-gilt/20 text-xs font-bold text-gilt font-mono">
                          #{i + 1}
                        </span>
                        {m.posterUrl && (
                          <img src={u(m.posterUrl)} alt="" className="size-12 shrink-0 rounded-xl object-cover border border-white/10" loading="lazy" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-bone truncate">{m.title}</h4>
                          <div className="flex items-center gap-2 text-[11px] text-dust mt-1 font-mono">
                            <span className="text-emerald-400 font-bold">{fmt(m.watchCount)} {ar ? 'مشاهدة' : 'views'}</span>
                            <span>•</span>
                            <span>{formatDuration(m.totalWatchTime)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Most Watched Series */}
              <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2.5">
                    <Tv className="size-5 text-sky-400" />
                    <h3 className="text-base font-bold text-bone">{ar ? 'المسلسلات والحلقات الأكثر مشاهدة' : 'Most Watched Series'}</h3>
                  </div>
                  <span className="text-xs text-dust font-mono">{stats.mostWatchedSeries.length} {ar ? 'حلقة' : 'episodes'}</span>
                </div>

                {stats.mostWatchedSeries.length === 0 ? (
                  <p className="text-xs text-dust/60 py-8 text-center">{ar ? 'لا توجد بيانات مشاهدة للمسلسلات بعد' : 'No series watch data yet'}</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                    {stats.mostWatchedSeries.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 hover:bg-white/[0.06] transition border border-white/5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-xs font-bold text-sky-400 font-mono">
                          #{i + 1}
                        </span>
                        {s.posterUrl && (
                          <img src={u(s.posterUrl)} alt="" className="size-12 shrink-0 rounded-xl object-cover border border-white/10" loading="lazy" />
                        )}
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-bone truncate">{s.title}</h4>
                          <div className="flex items-center gap-2 text-[11px] text-dust mt-1 font-mono">
                            <span className="text-sky-400 font-bold">{fmt(s.watchCount)} {ar ? 'مشاهدة' : 'views'}</span>
                            <span>•</span>
                            <span>{formatDuration(s.totalWatchTime)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Search Queries Telemetry */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Search className="size-5 text-gilt" />
                  <h3 className="text-base font-bold text-bone">
                    {ar ? 'أكثر ما يبحث عنه المستخدمون (Search Insights)' : 'Top Search Queries'}
                  </h3>
                </div>
                <span className="text-xs text-dust font-mono">{stats.topSearches.length} {ar ? 'كلمة بحث مسجلة' : 'queries'}</span>
              </div>

              {stats.topSearches.length === 0 ? (
                <p className="text-xs text-dust/60 py-8 text-center">
                  {ar ? 'لم يتم تسجيل عمليات بحث بعد. تظهر الكلمات هنا فور كتابة المستخدمين في شريط البحث.' : 'No search telemetry logged yet.'}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {stats.topSearches.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-gilt/30 transition">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-bone truncate">🔍 {s.query}</p>
                        <p className="text-[10px] text-dust/60 mt-0.5 font-mono">{s.resultsCount} {ar ? 'نتائج وجدت' : 'results'}</p>
                      </div>
                      <span className="ms-2 px-2.5 py-1 rounded-xl bg-gilt/15 text-gilt font-bold font-mono text-xs shrink-0">
                        {fmt(s.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: STREAMING & PROVIDERS CONTROL */}
        {activeTab === 'providers' && (
          <div className="space-y-8 animate-fade-in">
            {/* Quick Actions & Reset Cooldowns */}
            <div className="flex items-center justify-between flex-wrap gap-4 bg-crypt/80 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
              <div>
                <h3 className="text-base font-bold text-bone">{ar ? 'التحكم المباشر في السيرفرات' : 'Streaming Engine Controls'}</h3>
                <p className="text-xs text-dust mt-0.5">{ar ? 'تفعيل أو تعطيل السيرفرات فورياً لجميع مستخدمي الموقع' : 'Instantly toggle or reset providers'}</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => void resetCooldowns()}
                  className="px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition flex items-center gap-2"
                >
                  <Activity className="size-4" />
                  <span>{ar ? 'تصفير الحظر وفترات الانتظار' : 'Reset Cooldowns & Health'}</span>
                </button>
              </div>
            </div>

            {/* Test Result Banner */}
            {testResult && (
              <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between ${
                testResult.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                <span>{testResult.message}</span>
                <button onClick={() => setTestResult(null)} className="text-dust hover:text-bone">✕</button>
              </div>
            )}

            {/* Providers Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {stats.providers.map((p) => (
                <div key={p.id} className="rounded-3xl border border-white/10 bg-crypt/80 p-5 backdrop-blur-xl hover:border-white/20 transition">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className={`size-3 rounded-full ${p.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                      <div>
                        <h4 className="text-sm font-bold text-bone">{p.name}</h4>
                        <span className="text-[10px] font-mono text-dust">{p.id}</span>
                      </div>
                    </div>

                    {/* Enable / Disable Switch */}
                    <button
                      onClick={() => void toggleProvider(p.id, p.enabled)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                        p.enabled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                      }`}
                    >
                      {p.enabled ? (ar ? 'نشط (مفعل)' : 'Enabled') : (ar ? 'معطل' : 'Disabled')}
                    </button>
                  </div>

                  {/* Health Score & Stats */}
                  <div className="space-y-2 mb-4 bg-black/30 p-3 rounded-2xl border border-white/5 font-mono text-xs">
                    <div className="flex justify-between">
                      <span className="text-dust">{ar ? 'نقاط الصحة (Health)' : 'Health Score'}:</span>
                      <span className={p.healthScore >= 80 ? 'text-emerald-400 font-bold' : p.healthScore >= 50 ? 'text-amber-400' : 'text-red-400'}>
                        {p.healthScore} / 100
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dust">{ar ? 'نسبة النجاح' : 'Success Rate'}:</span>
                      <span className="text-bone">{Math.round(p.successRate * 100)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dust">{ar ? 'حالة التبريد (Cooldown)' : 'Cooldown'}:</span>
                      <span className={p.inCooldown ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                        {p.inCooldown ? (ar ? 'في فترة تبريد ⏳' : 'In Cooldown') : (ar ? 'سليم 🟢' : 'Healthy')}
                      </span>
                    </div>
                  </div>

                  {/* Test Button */}
                  <button
                    onClick={() => void testProvider(p.id)}
                    disabled={testingProvider === p.id}
                    className="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-bone hover:bg-white/10 transition flex items-center justify-center gap-2"
                  >
                    {testingProvider === p.id ? <Spinner className="size-3.5" /> : <Zap className="size-3.5 text-gilt" />}
                    <span>{ar ? 'فحص البث المباشر (Test Resolution)' : 'Run Resolution Test'}</span>
                  </button>
                </div>
              ))}
            </div>

            {/* Chromium Sniffer Engine Status */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <Sliders className="size-5 text-gilt" />
                <h3 className="text-base font-bold text-bone">{ar ? 'سنيفر البث التلقائي (Chromium Engine)' : 'Chromium Stream Sniffer'}</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-xs text-dust block mb-1">{ar ? 'جلسات المتصفح النشطة' : 'Active Browsers'}</span>
                  <p className="text-2xl font-bold font-mono text-emerald-400">
                    {stats.streaming?.activeBrowserSessions ?? 0} / {stats.streaming?.maxBrowserSessions ?? 3}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-xs text-dust block mb-1">{ar ? 'روابط البث المحفوظة في الكاش' : 'Cached Streams'}</span>
                  <p className="text-2xl font-bold font-mono text-gilt">
                    {stats.streaming?.cachedStreams ?? 0}
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                  <span className="text-xs text-dust block mb-1">{ar ? 'كاش قطع الفيديو في الذاكرة' : 'Segment RAM Cache'}</span>
                  <p className="text-2xl font-bold font-mono text-sky-400">
                    {Math.round((stats.streaming?.segmentCache?.bytes ?? 0) / 1024 / 1024)} MB
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ROOMS, SYSTEM & CACHE */}
        {activeTab === 'system' && (
          <div className="space-y-8 animate-fade-in">
            {/* Active Watch Party Rooms */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <Users className="size-5 text-gilt" />
                  <h3 className="text-base font-bold text-bone">{ar ? 'غرف المشاهدة الجماعية النشطة (Watch Rooms)' : 'Active WatchParty Rooms'}</h3>
                </div>
                <span className="text-xs font-mono text-dust">{stats.rooms?.length ?? 0} {ar ? 'غرفة' : 'rooms'}</span>
              </div>

              {!stats.rooms || stats.rooms.length === 0 ? (
                <p className="text-xs text-dust/60 py-8 text-center">{ar ? 'لا توجد غرف مشاهدة نشطة حالياً' : 'No active watch rooms right now'}</p>
              ) : (
                <div className="space-y-3">
                  {stats.rooms.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <h4 className="text-sm font-bold text-bone">{r.title || r.id}</h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gilt/15 text-gilt font-bold">{r.inviteCode}</span>
                        </div>
                        <p className="text-xs text-dust mt-1">
                          {ar ? 'المنشئ' : 'Host'}: <span className="text-bone">{r.hostName}</span> · {r.isPublic ? (ar ? 'عامة' : 'Public') : (ar ? 'خاصة' : 'Private')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`/#/watch/${r.mediaId}?room=${r.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-bone hover:bg-white/10 transition flex items-center gap-1.5"
                        >
                          <ExternalLink className="size-3.5" />
                          <span>{ar ? 'دخول' : 'Join'}</span>
                        </a>
                        <button
                          onClick={() => void closeRoom(r.id)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/20 transition flex items-center gap-1.5"
                        >
                          <Trash2 className="size-3.5" />
                          <span>{ar ? 'إنهاء الغرفة' : 'Terminate'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cache & Maintenance Center */}
            <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <Trash2 className="size-5 text-blood-hot" />
                <h3 className="text-base font-bold text-bone">{ar ? 'أدوات التنظيف والصيانة' : 'Maintenance & Cache Management'}</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <button
                  onClick={() => void clearCache()}
                  className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-gilt/40 hover:bg-gilt/5 transition text-start"
                >
                  <Zap className="size-6 text-gilt mb-2" />
                  <h4 className="text-xs font-bold text-bone">{ar ? 'مسح كاش البث والقطع' : 'Flush Streaming Cache'}</h4>
                  <p className="text-[11px] text-dust mt-1">{ar ? 'تفريغ الذاكرة المؤقتة من قطع الفيديو وروابط السنيفر القديمة' : 'Clear in-memory segments & proxy cache'}</p>
                </button>

                <button
                  onClick={() => void rescanLibrary()}
                  className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-sky-400/40 hover:bg-sky-500/5 transition text-start"
                >
                  <Film className="size-6 text-sky-400 mb-2" />
                  <h4 className="text-xs font-bold text-bone">{ar ? 'إعادة فحص المكتبة' : 'Rescan Media Library'}</h4>
                  <p className="text-[11px] text-dust mt-1">{ar ? 'البحث عن ملفات فيديو أو ترجمات جديدة في السيرفر' : 'Scan storage for new media and subtitles'}</p>
                </button>

                <button
                  onClick={() => void resetTelemetry()}
                  className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:border-red-400/40 hover:bg-red-500/5 transition text-start"
                >
                  <Activity className="size-6 text-red-400 mb-2" />
                  <h4 className="text-xs font-bold text-bone">{ar ? 'تصفير بيانات التحليلات' : 'Reset All Analytics'}</h4>
                  <p className="text-[11px] text-dust mt-1">{ar ? 'مسح إحصائيات المشاهدات والبحث والبدء من جديد' : 'Clear all stored telemetry history'}</p>
                </button>
              </div>
            </div>

            {/* Server Vitals & Environment */}
            {stats.system && (
              <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2.5 mb-5">
                  <BarChart className="size-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-bone">{ar ? 'مؤشرات أداء السيرفر (Server Vitals)' : 'Server Health & Resources'}</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-4 font-mono text-xs">
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-dust block mb-1">RAM Heap Used</span>
                    <span className="text-xl font-bold text-emerald-400">{stats.system.memory.heapUsedMb} MB</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-dust block mb-1">RAM Total RSS</span>
                    <span className="text-xl font-bold text-gilt">{stats.system.memory.rssMb} MB</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-dust block mb-1">Uptime</span>
                    <span className="text-xl font-bold text-sky-400">{formatDuration(stats.system.uptime)}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
                    <span className="text-dust block mb-1">Node & OS</span>
                    <span className="text-sm font-bold text-bone truncate block">{stats.system.nodeVersion} ({stats.system.platform})</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  const bg: Record<string, string> = {
    gilt: 'bg-gilt/20 border-gilt/30',
    emerald: 'bg-emerald-600/20 border-emerald-500/30',
    blood: 'bg-blood/20 border-blood/30',
    sky: 'bg-sky-600/20 border-sky-500/30',
  };
  return (
    <div className="rounded-3xl border border-white/10 bg-crypt/80 p-6 backdrop-blur-xl shadow-xl transition hover:border-white/20">
      <div className="flex items-center gap-3.5 mb-4">
        <div className={`rounded-2xl p-3 border ${bg[color] ?? 'bg-white/10'}`}>{icon}</div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-dust">{label}</h3>
      </div>
      <p className="text-3xl font-extrabold text-bone tracking-tight font-mono">{value}</p>
      {sub && <p className="mt-2 text-xs text-dust/70 font-medium">{sub}</p>}
    </div>
  );
}
