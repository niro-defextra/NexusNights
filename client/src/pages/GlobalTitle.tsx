import { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { api, ApiError, u } from '../api';
import type { GlobalTitleDetail } from '../api-types';
import { ErrorState } from '../components/States';
import { Skel } from '../components/Skeleton';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { go } from '../router';
import { WatchPartyButton } from '../components/WatchPartyButton';
import { Play, Star, ArrowLeft } from '../components/Icons';
import { setMovieMetaTags, setSeriesMetaTags, resetMetaTags } from '../meta';
import { registerBackHandler } from '../native/back-button';
import { shareContent } from '../native/share';
import { isNative } from '../native/platform';

interface Props {
  kind: 'movie' | 'series';
  tmdbId: number;
}

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
  known_for_department: string;
}

interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export function GlobalTitle({ kind, tmdbId }: Props) {
  const { lang, t } = useI18n();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const formatStatus = (status: string) => {
    if (lang !== 'ar') return status;
    const map: Record<string, string> = {
      Released: 'معروض',
      'Post Production': 'ما بعد الإنتاج',
      'In Production': 'قيد الإنتاج',
      Planned: 'مخطط له',
      Canceled: 'ملغى',
      'Returning Series': 'مستمر',
      Ended: 'منتهي',
    };
    return map[status] || status;
  };

  const episodesRef = useRef<HTMLDivElement>(null);

  // ── Trailer Native Sniffer & AFK State ───────────────────────────────────────
  const [trailerStreamUrl, setTrailerStreamUrl] = useState<string | null>(null);
  const [hasTrailer, setHasTrailer] = useState(false);
  const [trailerPhase, setTrailerPhase] = useState<'idle' | 'backdrop' | 'immersive'>('idle');
  const trailerStreamUrlRef = useRef<string | null>(null);
  trailerStreamUrlRef.current = trailerStreamUrl;
  const trailerPhaseRef = useRef<'idle' | 'backdrop' | 'immersive'>('idle');
  trailerPhaseRef.current = trailerPhase;

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhaseChangeRef = useRef<number>(0);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Extra Data ───────────────────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [showAllCast, setShowAllCast] = useState(false);
  const castScrollRef = useRef<HTMLDivElement>(null);

  // ── Clear all timers safely ─────────────────────────────────────────────────
  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (immersiveTimerRef.current) {
      clearTimeout(immersiveTimerRef.current);
      immersiveTimerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearTimers();
    if (!trailerStreamUrlRef.current) return;

    idleTimerRef.current = setTimeout(() => {
      setTrailerPhase('backdrop');
      lastPhaseChangeRef.current = Date.now();

      immersiveTimerRef.current = setTimeout(() => {
        setTrailerPhase('immersive');
        lastPhaseChangeRef.current = Date.now();
      }, 10000);
    }, 5000);
  }, [clearTimers]);

  const handleUserActivity = useCallback((e?: Event) => {
    if (trailerPhaseRef.current === 'immersive') {
      if (Date.now() - lastPhaseChangeRef.current < 600) {
        return;
      }
    }

    if (e instanceof MouseEvent && e.type === 'mousemove') {
      if (lastMousePosRef.current) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        if (Math.hypot(dx, dy) < 12) {
          return;
        }
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    }

    if (trailerPhaseRef.current !== 'idle') {
      setTrailerPhase('idle');
      lastPhaseChangeRef.current = Date.now();
    }
    scheduleIdle();
  }, [scheduleIdle]);

  // ── Fetch trailer + sniff native HLS stream + recommendations + credits ────
  useEffect(() => {
    clearTimers();
    setTrailerPhase('idle');
    setTrailerStreamUrl(null);
    setHasTrailer(false);
    setRecommendations([]);
    setCast([]);
    setCrew([]);
    setShowAllCast(false);

    let isSubscribed = true;
    const kindParam = kind === 'series' ? 'tv' : 'movie';

    // Trailer sniffer
    fetch(u(`/api/tmdb/videos/${kindParam}/${tmdbId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (!isSubscribed) return;
        if (d?.results?.length) {
          setHasTrailer(true);
          const key = d.results[0].key;
          try {
            const snifferRes = await fetch(u(`/api/trailer/stream/${key}`));
            if (!isSubscribed) return;
            if (snifferRes.ok) {
              const snifferData = await snifferRes.json();
              if (snifferData.ok && snifferData.streamUrl) {
                setTrailerStreamUrl(snifferData.streamUrl);
              }
            }
          } catch (e) {
            console.warn('[GlobalTitle] Trailer sniffer error:', e);
          }
        }
      })
      .catch(() => {});

    // Recommendations with fallback to similar titles
    fetch(u(`/api/tmdb/recommendations/${kindParam}/${tmdbId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (!isSubscribed) return;
        const results = d?.results?.filter((r: any) => r.poster_path) || [];
        if (results.length < 6) {
          try {
            const simRes = await fetch(u(`/api/tmdb/similar/${kindParam}/${tmdbId}`));
            if (simRes.ok) {
              const simData = await simRes.json();
              const simResults = simData?.results?.filter((r: any) => r.poster_path) || [];
              const existingIds = new Set(results.map((r: any) => r.id));
              for (const sim of simResults) {
                if (!existingIds.has(sim.id)) {
                  results.push(sim);
                  existingIds.add(sim.id);
                }
              }
            }
          } catch {}
        }
        if (isSubscribed && results.length) {
          setRecommendations(results.slice(0, 12));
        }
      })
      .catch(() => {});

    // Credits (cast & crew)
    fetch(u(`/api/tmdb/credits/${kindParam}/${tmdbId}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!isSubscribed) return;
        if (d?.cast) setCast(d.cast.slice(0, 20));
        if (d?.crew) setCrew(d.crew);
      })
      .catch(() => {});

    return () => {
      isSubscribed = false;
      clearTimers();
    };
  }, [kind, tmdbId, clearTimers]);

  // ── Attach Hls.js to native video element ──────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !trailerStreamUrl) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxBufferHole: 0.8,
      });
      hlsRef.current = hls;
      hls.loadSource(u(trailerStreamUrl));
      hls.attachMedia(v);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = u(trailerStreamUrl);
    }
  }, [trailerStreamUrl]);

  // ── Control video playback based on trailerPhase (seamless continuation) ───
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    if (trailerPhase === 'idle') {
      v.pause();
      v.muted = true;
    } else if (trailerPhase === 'backdrop') {
      v.muted = true;
      v.play().catch(() => {});
    } else if (trailerPhase === 'immersive') {
      v.muted = false;
      v.volume = 1;
      v.play().catch(() => {});
    }
  }, [trailerPhase]);

  // ── Attach global user activity listeners ──────────────────────────────────
  useEffect(() => {
    if (!trailerStreamUrl) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    const listener = (e: Event) => handleUserActivity(e);

    events.forEach((e) => window.addEventListener(e, listener, { passive: true }));
    scheduleIdle();

    return () => {
      events.forEach((e) => window.removeEventListener(e, listener));
      clearTimers();
    };
  }, [trailerStreamUrl, handleUserActivity, scheduleIdle, clearTimers]);

  const playTrailerNow = useCallback(() => {
    if (!trailerStreamUrl) return;
    clearTimers();
    lastPhaseChangeRef.current = Date.now();
    setTrailerPhase('immersive');
  }, [trailerStreamUrl, clearTimers]);

  const detail = useAsync(
    (s) => (kind === 'movie' ? api.discoveryMovie(tmdbId, lang, s) : api.discoveryTV(tmdbId, lang, s)),
    [kind, tmdbId, lang]
  );

  const season = useAsync(
    (s) => (kind === 'series' && selectedSeason > 0 ? api.discoverySeason(tmdbId, selectedSeason, lang, s) : Promise.resolve(null)),
    [kind, tmdbId, selectedSeason, lang]
  );

  // Sync logo
  useEffect(() => {
    setLogoFailed(false);
    if (detail.data?.logoUrl) {
      setLogoUrl(detail.data.logoUrl);
    }
    api.tmdbLogo(kind === 'series' ? 'tv' : 'movie', tmdbId, lang)
      .then((res) => {
        if (res?.logoUrl) setLogoUrl(res.logoUrl);
      })
      .catch(() => {});
  }, [detail.data?.logoUrl, kind, tmdbId, lang]);

  // Update meta tags
  useEffect(() => {
    if (detail.data) {
      if (kind === 'movie') {
        setMovieMetaTags({
          title: detail.data.title,
          overview: detail.data.overview,
          posterPath: detail.data.posterUrl?.replace(/^https:\/\/[^/]+/, '') || null,
          releaseYear: detail.data.year,
        });
      } else {
        setSeriesMetaTags({
          title: detail.data.title,
          overview: detail.data.overview,
          posterPath: detail.data.posterUrl?.replace(/^https:\/\/[^/]+/, '') || null,
          releaseYear: detail.data.year,
        });
      }
    }
    return () => resetMetaTags();
  }, [detail.data, kind]);

  useEffect(() => {
    return registerBackHandler(() => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        go.home();
      }
      return true;
    });
  }, []);

  const handleShare = () => {
    if (!detail.data) return;
    const baseWeb = isNative() ? 'https://nexusunights.tech' : window.location.origin;
    const shareUrl = `${baseWeb}/#/${kind === 'movie' ? 'movie' : 'tv'}/${tmdbId}`;
    void shareContent({
      title: detail.data.title,
      text: lang === 'ar' ? `🎬 شاهد "${detail.data.title}" على NexusNight!` : `🎬 Watch "${detail.data.title}" on NexusNight!`,
      url: shareUrl,
    });
  };

  if (detail.error && !detail.data) {
    const nf = detail.error instanceof ApiError && detail.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={nf ? t('notFoundHint') : t('loadErrorHint')} onRetry={detail.reload} />;
  }

  if (!detail.data) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Skel className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const title = detail.data;
  const directors = crew.filter((c) => c.job === 'Director');
  const displayCast = showAllCast ? cast : cast.slice(0, 8);

  const handlePlay = async () => {
    if (title.localId) {
      go.title(title.localId);
    } else {
      if (kind === 'movie') {
        const syntheticMediaId = `streaming-movie-${tmdbId}`;
        go.watch(syntheticMediaId);
      } else {
        episodesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleEpisodePlay = async (seasonNum: number, episodeNum: number, localMediaId?: string) => {
    if (localMediaId) {
      go.watch(localMediaId);
    } else {
      const syntheticMediaId = `streaming-tv-${tmdbId}-${seasonNum}-${episodeNum}`;
      go.watch(syntheticMediaId);
    }
  };

  const isImmersive = trailerPhase === 'immersive';
  const showBackdropVideo = trailerPhase === 'backdrop';

  return (
    <div className="relative min-h-screen pb-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* ════════════════════════════════════════════════════════════════════════
          HERO BANNER
          ════════════════════════════════════════════════════════════════════════ */}
      <div
        className={`relative isolate w-full h-[clamp(22rem,48vh,32rem)] select-none ${
          isImmersive ? 'z-[999]' : 'overflow-hidden'
        }`}
      >
        {/* Unified Native Video (Phase 1 Backdrop <-> Phase 2 Fullscreen Theater) */}
        <div
          className={
            isImmersive
              ? 'fixed inset-0 z-[999] bg-black flex items-center justify-center cursor-pointer select-none animate-[fade_0.4s_ease]'
              : `absolute inset-0 -z-20 overflow-hidden pointer-events-none transition-opacity duration-1000 ${
                  showBackdropVideo && trailerStreamUrl ? 'opacity-100' : 'opacity-0'
                }`
          }
          onClick={isImmersive ? () => handleUserActivity() : undefined}
        >
          <video
            ref={videoRef}
            playsInline
            loop
            muted={!isImmersive}
            className={
              isImmersive
                ? 'size-full object-contain'
                : 'size-full object-cover object-center scale-[1.05]'
            }
          />

          {isImmersive && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTrailerPhase('idle');
                  scheduleIdle();
                }}
                className="absolute top-6 end-6 z-50 flex size-11 items-center justify-center rounded-full bg-black/60 border border-white/20 text-white/90 hover:bg-black/90 hover:scale-110 active:scale-95 transition-all backdrop-blur-md cursor-pointer"
                aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-pulse text-sm text-white/80 pointer-events-none font-medium bg-black/60 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-md select-none">
                {t('moveToExit')}
              </div>
            </>
          )}
        </div>

        {/* Authentic TMDB Backdrop Image */}
        {title.backdropUrl ? (
          <img
            src={u(title.backdropUrl)}
            alt=""
            className={`absolute inset-0 -z-30 size-full object-cover object-[center_20%] sm:object-[center_25%] transition-opacity duration-1000 ${
              showBackdropVideo && trailerStreamUrl ? 'opacity-0' : 'opacity-100'
            }`}
          />
        ) : (
          <div
            className={`absolute inset-0 -z-30 bg-gradient-to-br from-blood/20 via-crypt to-ink transition-opacity duration-1000 ${
              showBackdropVideo && trailerStreamUrl ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        {/* Cinematic Vignettes */}
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 via-40% to-transparent rtl:bg-gradient-to-l pointer-events-none transition-opacity duration-500 ${
            isImmersive ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-t from-ink via-ink/80 to-transparent pointer-events-none transition-opacity duration-500 ${
            isImmersive ? 'opacity-0' : 'opacity-100'
          }`}
        />
        <div
          className={`absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-ink/80 via-transparent to-transparent pointer-events-none transition-opacity duration-500 ${
            isImmersive ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Top Back Action */}
        <div
          className={`absolute start-4 sm:start-8 top-20 z-20 transition-opacity duration-500 ${
            isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <button
            onClick={() => go.home()}
            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-bone backdrop-blur-md transition-all hover:bg-black/90 hover:scale-105 active:scale-95"
            aria-label={t('back')}
          >
            <ArrowLeft className={`size-5 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Content Box */}
        <div
          className={`absolute inset-x-0 bottom-8 sm:bottom-10 px-[var(--pad)] transition-opacity duration-500 ${
            isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="container mx-auto max-w-6xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] rtl:tracking-normal text-gilt/90">
              {kind === 'series' ? t('series') : t('movie')}
            </p>

            {/* Logo or Title */}
            {logoUrl && !logoFailed ? (
              <div className="mb-3 max-w-[min(26rem,85%)]">
                <img
                  src={u(logoUrl)}
                  alt={title.title}
                  className="max-h-20 sm:max-h-28 w-auto object-contain select-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]"
                  onError={() => setLogoFailed(true)}
                />
              </div>
            ) : (
              <h1 className="text-balance font-display text-[clamp(1.85rem,5vw,3.5rem)] font-black leading-[1.08] text-bone tracking-tight rtl:tracking-normal drop-shadow-[0_2px_24px_rgba(0,0,0,0.95)] mb-2">
                {title.title}
              </h1>
            )}

            {title.tagline && (
              <p className="mb-3 text-xs sm:text-sm text-gilt/85 italic max-w-xl">
                {title.tagline}
              </p>
            )}

            {/* Overview — compact 2-line teaser in hero */}
            {title.overview && (
              <p className="mb-4 text-sm text-bone/75 max-w-2xl line-clamp-2 leading-relaxed hidden sm:block">
                {title.overview}
              </p>
            )}

            {/* Metadata Bar */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-dust mb-5">
              {title.rating ? (
                <span className="inline-flex items-center gap-1 font-bold text-gilt">
                  <Star className="size-3.5 fill-gilt text-gilt" />
                  {title.rating.toFixed(1)}
                </span>
              ) : null}
              {title.year && (
                <span className="font-medium text-bone/80 after:ms-3 after:text-ash after:content-['•'] last:after:content-none">
                  {title.year}
                </span>
              )}
              {title.runtime && (
                <span className="font-medium text-bone/80 after:ms-3 after:text-ash after:content-['•'] last:after:content-none">
                  {title.runtime} {t('minutesUnit')}
                </span>
              )}
              {directors.length > 0 && (
                <span className="font-medium text-bone/80 after:ms-3 after:text-ash after:content-['•'] last:after:content-none">
                  {directors[0].name}
                </span>
              )}
              {title.genres.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wider text-bone/80"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePlay}
                className="group inline-flex h-11 sm:h-12 items-center gap-2.5 rounded-xl bg-blood px-7 sm:px-9 font-bold text-white shadow-[0_6px_24px_rgba(220,48,68,0.5)] transition-all duration-200 hover:bg-blood-hot hover:shadow-[0_8px_32px_rgba(220,48,68,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt"
              >
                <Play className="size-4 sm:size-5 transition-transform duration-200 group-hover:scale-110 rtl:-scale-x-100" aria-hidden="true" />
                <span>{kind === 'series' ? (lang === 'ar' ? 'اختر حلقة' : 'Select Episode') : t('play')}</span>
              </button>

              {(hasTrailer || trailerStreamUrl) && (
                <button
                  onClick={playTrailerNow}
                  disabled={!trailerStreamUrl}
                  className={`group inline-flex h-11 sm:h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-5 font-semibold text-bone backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/[0.14] active:scale-[0.98] ${
                    !trailerStreamUrl ? 'opacity-60 cursor-wait' : ''
                  }`}
                >
                  <svg className="size-4 text-blood transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>{t('watchTrailer')}</span>
                </button>
              )}

              {kind === 'movie' && (
                <WatchPartyButton
                  mediaId={title.localId || `streaming-movie-${tmdbId}`}
                  title={title.title}
                />
              )}

              <button
                onClick={handleShare}
                className="inline-flex h-11 sm:h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-4 font-semibold text-bone backdrop-blur-md transition-all duration-200 hover:border-white/30 hover:bg-white/[0.14] active:scale-[0.98]"
                title={lang === 'ar' ? 'مشاركة' : 'Share'}
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden sm:inline">{lang === 'ar' ? 'مشاركة' : 'Share'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="container mx-auto max-w-6xl px-[var(--pad)] pt-4 sm:pt-6">
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 lg:gap-10 items-start">
          {/* ── Main Column: Synopsis + Cast + Episodes ───────────────────── */}
          <div className="flex-1 min-w-0 space-y-8 w-full order-2 lg:order-1 lg:pt-1">
            {/* Mobile/Tablet Compact Poster + Details Header (visible when < lg) */}
            <div className="lg:hidden flex gap-4 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-sm">
              {title.posterUrl && (
                <div className="w-28 sm:w-36 shrink-0 aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-lg bg-crypt">
                  <img
                    src={u(title.posterUrl)}
                    alt={title.title}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-2 text-xs">
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dust pb-1.5 border-b border-white/[0.08]">
                  {lang === 'ar' ? 'تفاصيل العمل' : 'Details'}
                </h3>
                {title.releaseDate && (
                  <div className="flex justify-between gap-2">
                    <span className="text-dust">{lang === 'ar' ? 'الإصدار' : 'Release'}</span>
                    <span className="font-semibold text-bone">{title.releaseDate}</span>
                  </div>
                )}
                {title.runtime && (
                  <div className="flex justify-between gap-2">
                    <span className="text-dust">{t('titleRuntime')}</span>
                    <span className="font-semibold text-bone">{title.runtime} {t('minutesUnit')}</span>
                  </div>
                )}
                {directors.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-dust">{t('director')}</span>
                    <span className="font-semibold text-bone truncate">{directors[0].name}</span>
                  </div>
                )}
                {title.status && (
                  <div className="flex justify-between gap-2">
                    <span className="text-dust">{t('titleStatus')}</span>
                    <span className="font-semibold text-bone">{formatStatus(title.status)}</span>
                  </div>
                )}
                {title.genres && title.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {title.genres.slice(0, 3).map((g) => (
                      <span key={g} className="rounded-full bg-white/[0.05] border border-white/10 px-2 py-0.5 text-[0.62rem] text-bone/80">
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Synopsis */}
            <section>
              <h2 className="mb-3 font-display text-xl sm:text-2xl font-bold tracking-wide text-bone">
                {t('synopsis')}
              </h2>
              <p className="text-bone/80 leading-[1.75] text-sm sm:text-[0.95rem]">
                {title.overview || t('noSynopsis')}
              </p>
            </section>

            {/* ── Cast Horizontal Scroll ──────────────────────────────────── */}
            {cast.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wide text-bone">
                    {t('cast')}
                  </h2>
                  {cast.length > 8 && (
                    <button
                      onClick={() => setShowAllCast(!showAllCast)}
                      className="text-xs font-semibold text-gilt hover:text-gilt/80 transition-colors"
                    >
                      {showAllCast ? (lang === 'ar' ? 'عرض أقل' : 'Show Less') : t('viewAll')}
                    </button>
                  )}
                </div>

                <div
                  ref={castScrollRef}
                  className={
                    showAllCast
                      ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'
                      : 'flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent snap-x snap-mandatory'
                  }
                >
                  {displayCast.map((person) => (
                    <div
                      key={`${person.id}-${person.character}`}
                      className={`group flex-shrink-0 ${
                        showAllCast ? '' : 'w-[8.5rem] snap-start'
                      }`}
                    >
                      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-crypt ring-1 ring-white/[0.06] mb-2">
                        {person.profile_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                            alt={person.name}
                            loading="lazy"
                            decoding="async"
                            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="size-full flex items-center justify-center bg-crypt text-dust/30">
                            <svg className="size-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <p className="text-xs font-bold text-bone truncate leading-tight">{person.name}</p>
                      <p className="text-[0.68rem] text-dust/70 truncate leading-tight mt-0.5">{person.character}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── TV Show: Seasons & Episodes ────────────────────────────── */}
            {kind === 'series' && title.seasons && title.seasons.length > 0 && (
              <section ref={episodesRef} id="episodes" className="scroll-mt-24 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                  <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wide text-bone">
                    {t('seasons')}
                  </h2>
                </div>

                {/* Season Pills */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {title.seasons.map((s) => (
                    <button
                      key={s.seasonNumber}
                      onClick={() => setSelectedSeason(s.seasonNumber)}
                      className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt ${
                        selectedSeason === s.seasonNumber
                          ? 'bg-blood text-white shadow-md'
                          : 'bg-white/[0.03] border border-white/10 text-dust hover:text-bone hover:border-white/20 active:scale-95'
                      }`}
                      aria-pressed={selectedSeason === s.seasonNumber}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>

                {/* Episode Items */}
                {season.data && season.data.episodes && (
                  <div className="space-y-3 pt-2">
                    {season.data.episodes.map((ep) => (
                      <div
                        key={ep.episodeNumber}
                        className="group flex flex-col sm:flex-row gap-4 rounded-2xl bg-white/[0.02] border border-white/[0.07] p-3.5 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/15"
                      >
                        {ep.stillUrl ? (
                          <div className="relative aspect-video w-full sm:w-44 shrink-0 rounded-xl overflow-hidden bg-crypt ring-1 ring-white/10">
                            <img
                              src={u(ep.stillUrl)}
                              alt=""
                              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="flex size-9 items-center justify-center rounded-full bg-blood text-white shadow-md">
                                <Play className="size-3.5 rtl:-scale-x-100" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-video w-full sm:w-44 shrink-0 rounded-xl bg-crypt flex items-center justify-center text-dust/40">
                            <Play className="size-6" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h3 className="font-bold text-sm sm:text-base text-bone group-hover:text-gilt transition-colors truncate">
                                {ep.episodeNumber}. {ep.name}
                              </h3>
                              {ep.runtime && (
                                <span className="text-[11px] text-dust font-mono shrink-0">
                                  {ep.runtime} {t('minutesUnit')}
                                </span>
                              )}
                            </div>
                            {ep.overview && (
                              <p className="text-xs sm:text-sm text-dust/80 line-clamp-2 leading-relaxed">
                                {ep.overview}
                              </p>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3 pt-2 border-t border-white/[0.04]">
                            <div className="flex items-center gap-2 text-xs text-dust">
                              {ep.airDate && <span>{ep.airDate}</span>}
                              {ep.rating && (
                                <span className="inline-flex items-center gap-1 text-gilt font-semibold">
                                  <Star className="size-3 fill-gilt" aria-hidden="true" />
                                  {ep.rating.toFixed(1)}
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => handleEpisodePlay(ep.seasonNumber, ep.episodeNumber, ep.localMediaId)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blood px-3.5 text-xs font-bold text-white transition-all hover:bg-blood-hot active:scale-95 shadow-sm"
                            >
                              <Play className="size-3 rtl:-scale-x-100" />
                              <span>{t('play')}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {season.loading && (
                  <div className="space-y-3 pt-2">
                    {[...Array(4)].map((_, i) => (
                      <Skel key={i} className="h-28 w-full rounded-2xl" />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── Desktop Right Sidebar (Poster + Details) ────────────────── */}
          <aside
            className="hidden lg:block w-[240px] xl:w-[260px] shrink-0 space-y-3.5 lg:sticky lg:top-20 lg:-mt-36 xl:-mt-44 z-20 order-1 lg:order-2"
          >
            {/* Poster Card */}
            {title.posterUrl && (
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.85)] bg-crypt group">
                <img
                  src={u(title.posterUrl)}
                  alt={title.title}
                  className="w-full aspect-[2/3] object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  loading="lazy"
                />
              </div>
            )}

            {/* Details Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-black/40 backdrop-blur-md p-4 space-y-2.5 shadow-xl">
              <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dust pb-2 border-b border-white/[0.08]">
                {lang === 'ar' ? 'تفاصيل العمل' : 'Details'}
              </h3>

              {title.status && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dust">{t('titleStatus')}</span>
                  <span className="font-semibold text-bone">{formatStatus(title.status)}</span>
                </div>
              )}

              {title.releaseDate && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dust">{lang === 'ar' ? 'تاريخ الإصدار' : 'Release Date'}</span>
                  <span className="font-semibold text-bone">{title.releaseDate}</span>
                </div>
              )}

              {title.runtime && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-dust">{t('titleRuntime')}</span>
                  <span className="font-semibold text-bone">{title.runtime} {t('minutesUnit')}</span>
                </div>
              )}

              {title.originalTitle && title.originalTitle !== title.title && (
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-dust shrink-0">{lang === 'ar' ? 'العنوان الأصلي' : 'Original Title'}</span>
                  <span className="font-semibold text-bone truncate text-end">{title.originalTitle}</span>
                </div>
              )}

              {directors.length > 0 && (
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-dust shrink-0">{t('director')}</span>
                  <span className="font-semibold text-bone truncate text-end">{directors.map((d) => d.name).join(', ')}</span>
                </div>
              )}

              {title.genres && title.genres.length > 0 && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <span className="text-xs text-dust block mb-1.5">{lang === 'ar' ? 'التصنيفات' : 'Genres'}</span>
                  <div className="flex flex-wrap gap-1">
                    {title.genres.map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.65rem] font-medium text-bone/80"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          RECOMMENDATIONS
          ════════════════════════════════════════════════════════════════════════ */}
      {recommendations.length > 0 && (
        <div className="container mx-auto max-w-6xl px-[var(--pad)] pt-14 pb-4">
          <h2 className="mb-6 font-display text-xl sm:text-2xl font-bold tracking-wide text-bone">
            {t('recommended')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {recommendations.map((rec) => {
              const recKind = rec.media_type === 'tv' || (!rec.title && rec.name) ? 'tv' : 'movie';
              const recTitle = rec.title || rec.name;
              const recYear = (rec.release_date || rec.first_air_date || '').substring(0, 4);
              return (
                <a
                  key={rec.id}
                  href={`#/${recKind}/${rec.id}`}
                  className="group relative overflow-hidden rounded-xl bg-crypt ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1.5 hover:ring-blood/50 hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.95),0_0_20px_rgba(179,32,47,0.3)]"
                >
                  <img
                    src={`https://image.tmdb.org/t/p/w342${rec.poster_path}`}
                    alt={recTitle}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <p className="text-xs sm:text-sm font-bold text-bone leading-tight line-clamp-2">
                      {recTitle}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[0.7rem] text-dust">
                      {recYear && <span>{recYear}</span>}
                      {rec.vote_average ? (
                        <span className="inline-flex items-center gap-0.5 text-gilt font-semibold">
                          <Star className="size-2.5 fill-gilt text-gilt" />
                          {rec.vote_average.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
