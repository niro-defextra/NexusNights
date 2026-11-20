/**
 * Unified Title Page
 * 
 * Handles both:
 * - Local titles (e.g., "t-the-boys") - Full playback
 * - TMDB-only titles (e.g., "tmdb:76479") - Metadata exploration
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, u } from '../api';
import type { EpisodeSummary, TitleDetail } from '../api-types';
import { Play, Star, Plus, ExternalLink, Users, ChevronRight } from '../components/Icons';
import { Skel } from '../components/Skeleton';
import { ErrorState } from '../components/States';
import { WatchPartyButton } from '../components/WatchPartyButton';
import { fmtCount, fmtRuntime } from '../format';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { allProgress, isFinished } from '../progress';
import { go, hrefs } from '../router';
import { tmdbArtworkUrl } from '../util/tmdb-artwork';

interface TmdbMovieDetail {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number | null;
  genres: { id: number; name: string }[];
  vote_average: number;
  vote_count: number;
  tagline: string;
  status: string;
}

interface TmdbTvDetail {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  vote_count: number;
  tagline: string;
  status: string;
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: Array<{
    id: number;
    season_number: number;
    name: string;
    overview: string;
    poster_path: string | null;
    episode_count: number;
  }>;
}

export function UnifiedTitlePage({ id }: { id: string }) {
  const { lang, t } = useI18n();
  
  // Detect if this is a TMDB-only title
  const isTmdbOnly = id.startsWith('tmdb:');
  const tmdbId = isTmdbOnly ? parseInt(id.substring(5), 10) : null;
  
  if (isTmdbOnly && tmdbId) {
    return <TmdbOnlyTitle tmdbId={tmdbId} />;
  } else {
    return <LocalTitle id={id} />;
  }
}

/**
 * TMDB-only title (metadata exploration, no playback)
 */
function TmdbOnlyTitle({ tmdbId }: { tmdbId: number }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movieData, setMovieData] = useState<TmdbMovieDetail | null>(null);
  const [tvData, setTvData] = useState<TmdbTvDetail | null>(null);
  
  useEffect(() => {
    loadTmdbData();
  }, [tmdbId]);
  
  async function loadTmdbData() {
    try {
      setLoading(true);
      setError(null);
      
      // Try movie first
      const movieRes = await fetch(u(`/api/tmdb/movie/${tmdbId}`));
      if (movieRes.ok) {
        const data = await movieRes.json();
        setMovieData(data);
        setLoading(false);
        return;
      }
      
      // Try TV
      const tvRes = await fetch(u(`/api/tmdb/tv/${tmdbId}`));
      if (tvRes.ok) {
        const data = await tvRes.json();
        setTvData(data);
        setLoading(false);
        return;
      }
      
      setError('Title not found');
      setLoading(false);
    } catch (err) {
      console.error('Failed to load TMDB data:', err);
      setError('Failed to load title details');
      setLoading(false);
    }
  }
  
  if (loading) {
    return (
      <div className="px-[var(--pad)] pt-28">
        <Skel className="mb-4 h-12 w-80 max-w-full" />
        <Skel className="mb-8 h-24 w-full max-w-xl" />
        {Array.from({ length: 4 }, (_, i) => <Skel key={i} className="mb-3 h-24 w-full" />)}
      </div>
    );
  }
  
  if (error || (!movieData && !tvData)) {
    return (
      <ErrorState
        title={t('notFound')}
        hint={t('notFoundHint')}
        onRetry={loadTmdbData}
      />
    );
  }
  
  if (movieData) {
    return <TmdbMovieView data={movieData} />;
  }
  
  if (tvData) {
    return <TmdbTvView data={tvData} />;
  }
  
  return null;
}

function TmdbMovieView({ data }: { data: TmdbMovieDetail }) {
  const { t } = useI18n();
  const backdropUrl = tmdbArtworkUrl('backdrop', data.backdrop_path);
  const posterUrl = tmdbArtworkUrl('poster', data.poster_path);
  const year = data.release_date?.substring(0, 4);
  const runtime = data.runtime ? Math.round(data.runtime) * 60 : null;
  
  const meta = [
    year,
    runtime ? fmtRuntime(runtime, t) : null,
    data.status,
  ].filter(Boolean);
  
  return (
    <div className="pb-20">
      <section className="relative isolate mt-14 sm:mt-16 min-h-[min(66dvh,34rem)] overflow-hidden">
        {backdropUrl ? (
          <img src={u(backdropUrl)} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_20%,#3a1219,#0a0708_70%)]" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-ink/20 rtl:bg-gradient-to-l" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/20 to-ink/60" />
        
        <div className="flex min-h-[min(66dvh,34rem)] items-end px-[var(--pad)] pb-10 pt-10">
          <div className="flex gap-6 max-w-full">
            {/* Poster */}
            {posterUrl && (
              <div className="hidden sm:block w-48 shrink-0">
                <img
                  src={u(posterUrl)}
                  alt={data.title}
                  className="w-full rounded-lg shadow-2xl"
                />
              </div>
            )}
            
            {/* Content */}
            <div className="max-w-[min(42rem,100%)] animate-rise">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-gilt">
                {t('movie')}
              </p>
              <h1 className="text-balance font-display text-[clamp(2rem,5.4vw,3.8rem)] font-extrabold leading-[1.05] tracking-wide">
                {data.title}
              </h1>
              
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust">
                {data.vote_average > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-gilt">
                    <Star className="size-3.5" />
                    {data.vote_average.toFixed(1)}
                  </span>
                )}
                {meta.map((m, i) => <span key={i}>{m}</span>)}
                {data.genres.slice(0, 4).map((g) => (
                  <span
                    key={g.id}
                    className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
              
              {data.tagline && (
                <p className="mt-3 text-gilt/90 italic">{data.tagline}</p>
              )}
              
              <p dir="auto" className="mt-4 max-w-prose leading-relaxed text-bone/85">
                {data.overview || t('synopsis')}
              </p>
              
              {/* Explore Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-md bg-white/5 px-5 py-3 text-sm text-dust border border-white/10">
                  <ExternalLink className="size-4" />
                  {t('exploreOnly')}
                </div>
                
                <a
                  href={`https://www.themoviedb.org/movie/${data.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 px-5 py-3 text-sm transition-colors"
                >
                  <ExternalLink className="size-4" />
                  {t('viewOnTmdb')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Additional Info */}
      <section className="px-[var(--pad)] pt-8">
        <div className="max-w-4xl">
          <div className="rounded-lg bg-white/5 border border-white/10 p-6">
            <h2 className="font-display text-xl font-semibold mb-4">{t('aboutThisTitle')}</h2>
            <div className="space-y-2 text-sm text-dust">
              <p>{t('tmdbExplainPlayback')}</p>
              <p>{t('tmdbExplainSources')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function TmdbTvView({ data }: { data: TmdbTvDetail }) {
  const { t } = useI18n();
  const backdropUrl = tmdbArtworkUrl('backdrop', data.backdrop_path);
  const posterUrl = tmdbArtworkUrl('poster', data.poster_path);
  const year = data.first_air_date?.substring(0, 4);
  
  const meta = [
    year,
    fmtCount(data.number_of_seasons, 'seasonCount1', 'seasonsCount', t),
    fmtCount(data.number_of_episodes, 'episodeCount1', 'episodesCount', t),
    data.status,
  ].filter(Boolean);
  
  return (
    <div className="pb-20">
      <section className="relative isolate mt-14 sm:mt-16 min-h-[min(66dvh,34rem)] overflow-hidden">
        {backdropUrl ? (
          <img src={u(backdropUrl)} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_20%,#3a1219,#0a0708_70%)]" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/75 to-ink/20 rtl:bg-gradient-to-l" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/20 to-ink/60" />
        
        <div className="flex min-h-[min(66dvh,34rem)] items-end px-[var(--pad)] pb-10 pt-10">
          <div className="flex gap-6 max-w-full">
            {/* Poster */}
            {posterUrl && (
              <div className="hidden sm:block w-48 shrink-0">
                <img
                  src={u(posterUrl)}
                  alt={data.name}
                  className="w-full rounded-lg shadow-2xl"
                />
              </div>
            )}
            
            {/* Content */}
            <div className="max-w-[min(42rem,100%)] animate-rise">
              <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-gilt">
                {t('series')}
              </p>
              <h1 className="text-balance font-display text-[clamp(2rem,5.4vw,3.8rem)] font-extrabold leading-[1.05] tracking-wide">
                {data.name}
              </h1>
              
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust">
                {data.vote_average > 0 && (
                  <span className="inline-flex items-center gap-1 font-semibold text-gilt">
                    <Star className="size-3.5" />
                    {data.vote_average.toFixed(1)}
                  </span>
                )}
                {meta.map((m, i) => <span key={i}>{m}</span>)}
                {data.genres.slice(0, 4).map((g) => (
                  <span
                    key={g.id}
                    className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
              
              {data.tagline && (
                <p className="mt-3 text-gilt/90 italic">{data.tagline}</p>
              )}
              
              <p dir="auto" className="mt-4 max-w-prose leading-relaxed text-bone/85">
                {data.overview || t('synopsis')}
              </p>
              
              {/* Explore Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <div className="inline-flex items-center gap-2 rounded-md bg-white/5 px-5 py-3 text-sm text-dust border border-white/10">
                  <ExternalLink className="size-4" />
                  {t('exploreOnly')}
                </div>
                
                <a
                  href={`https://www.themoviedb.org/tv/${data.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 px-5 py-3 text-sm transition-colors"
                >
                  <ExternalLink className="size-4" />
                  {t('viewOnTmdb')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* Seasons Overview */}
      {data.seasons && data.seasons.length > 0 && (
        <section className="px-[var(--pad)] pt-8">
          <h2 className="font-display text-2xl font-semibold mb-4">{t('seasons')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {data.seasons
              .filter(s => s.season_number > 0)
              .map(season => (
                <div key={season.id} className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors">
                  {season.poster_path && (
                    <img
                      src={tmdbArtworkUrl('poster', season.poster_path) ?? undefined}
                      alt={season.name}
                      className="w-full aspect-[2/3] object-cover rounded-md mb-2"
                    />
                  )}
                  <h3 className="font-semibold text-sm mb-1">{season.name}</h3>
                  <p className="text-xs text-dust">
                    {fmtCount(season.episode_count, 'episodeCount1', 'episodesCount', t)}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}
      
      {/* Info Notice */}
      <section className="px-[var(--pad)] pt-8">
        <div className="max-w-4xl">
          <div className="rounded-lg bg-white/5 border border-white/10 p-6">
            <h2 className="font-display text-xl font-semibold mb-4">{t('aboutThisTitle')}</h2>
            <div className="space-y-2 text-sm text-dust">
              <p>{t('tmdbExplainPlayback')}</p>
              <p>{t('tmdbExplainSources')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Local title (full playback support)
 * Enhanced with: trailer auto-play, immersive idle mode, recommendations
 */
function LocalTitle({ id }: { id: string }) {
  const { lang, t, num } = useI18n();
  const d = useAsync((s) => api.title(id, lang, s), [id, lang]);
  const progress = useMemo(() => allProgress(), [id]);
  const [season, setSeason] = useState<number | null>(null);
  const data = d.data;

  // ── Trailer state ──────────────────────────────────────────────────────────
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerPhase, setTrailerPhase] = useState<'idle' | 'backdrop' | 'immersive'>('idle');
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const immersiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heroRef = useRef<HTMLElement>(null);

  // ── Recommendations state ──────────────────────────────────────────────────
  const [recommendations, setRecommendations] = useState<any[]>([]);

  const resumeEp = useMemo(() => {
    if (!data) return undefined;
    const all = data.seasons.flatMap((s) => s.episodes);
    const seen = all.filter((e) => progress[e.id]).sort((a, b) => progress[b.id].at - progress[a.id].at);
    const cur = seen.find((e) => !isFinished(progress[e.id]));
    if (cur) return cur;
    const last = seen[0];
    if (last) { const i = all.findIndex((e) => e.id === last.id); return all[i + 1] ?? last; }
    return undefined;
  }, [data, progress]);

  useEffect(() => { setSeason(null); setTrailerPhase('idle'); setTrailerKey(null); window.scrollTo(0, 0); }, [id]);
  useEffect(() => {
    if (data && season === null && data.seasons.length) setSeason(resumeEp?.season ?? data.seasons[0].season);
  }, [data, season, resumeEp]);

  // ── Fetch trailer + recommendations from TMDB ─────────────────────────────
  useEffect(() => {
    if (!data?.tmdbId) return;
    const kind = data.kind === 'series' ? 'tv' : 'movie';
    const tmdbId = data.tmdbId;

    // Fetch trailer
    fetch(u(`/api/tmdb/videos/${kind}/${tmdbId}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.results?.length) setTrailerKey(d.results[0].key);
      })
      .catch(() => {});

    // Fetch recommendations
    fetch(u(`/api/tmdb/recommendations/${kind}/${tmdbId}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.results?.length) {
          setRecommendations(d.results.filter((r: any) => r.poster_path).slice(0, 12));
        }
      })
      .catch(() => {});
  }, [data?.tmdbId, data?.kind]);

  // ── Idle timer: 5s → backdrop trailer, 5s more → immersive ────────────────
  const resetIdleTimer = useCallback(() => {
    // If in immersive → exit to idle, cancel everything
    if (trailerPhase === 'immersive') {
      setTrailerPhase('idle');
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);

    if (!trailerKey) return;

    idleTimerRef.current = setTimeout(() => {
      setTrailerPhase('backdrop');
      immersiveTimerRef.current = setTimeout(() => {
        setTrailerPhase('immersive');
      }, 5000);
    }, 5000);
  }, [trailerKey, trailerPhase]);

  useEffect(() => {
    if (!trailerKey) return;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    const handler = () => resetIdleTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetIdleTimer(); // Start the first timer

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
    };
  }, [trailerKey, resetIdleTimer]);

  // ── Watch trailer button handler ───────────────────────────────────────────
  const playTrailerNow = useCallback(() => {
    if (!trailerKey) return;
    setTrailerPhase('backdrop');
    if (immersiveTimerRef.current) clearTimeout(immersiveTimerRef.current);
    immersiveTimerRef.current = setTimeout(() => {
      setTrailerPhase('immersive');
    }, 5000);
  }, [trailerKey]);

  if (d.error && !data) {
    const nf = d.error instanceof ApiError && d.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={nf ? t('notFoundHint') : t('loadErrorHint')} onRetry={nf ? undefined : d.reload} />;
  }
  if (!data) {
    return (
      <div className="px-[var(--pad)] pt-28"><Skel className="mb-4 h-12 w-80 max-w-full" /><Skel className="mb-8 h-24 w-full max-w-xl" />
        {Array.from({ length: 4 }, (_, i) => <Skel key={i} className="mb-3 h-24 w-full" />)}</div>
    );
  }

  const firstId = data.firstMediaId;
  const playId = resumeEp?.id ?? firstId;
  const hasProgress = !!resumeEp && !!progress[resumeEp.id];
  const cur = data.seasons.find((s) => s.season === season) ?? data.seasons[0];
  const still = data.seasons[0]?.episodes.find((e) => e.stillUrl)?.stillUrl ?? null;
  const img = data.backdropUrl ?? still;
  const meta = [
    data.year ? String(data.year) : null,
    data.kind === 'series' ? (data.seasonCount ? fmtCount(data.seasonCount, 'seasonCount1', 'seasonsCount', t) : null) : fmtRuntime(data.runtimeSec, t),
    data.kind === 'series' ? fmtCount(data.episodeCount, 'episodeCount1', 'episodesCount', t) : null,
  ].filter(Boolean);

  const isImmersive = trailerPhase === 'immersive';
  const showTrailerVideo = trailerPhase === 'backdrop' || trailerPhase === 'immersive';

  return (
    <div className="pb-20">
      {/* ── Immersive overlay ─────────────────────────────────────────────── */}
      {isImmersive && (
        <div
          className="fixed inset-0 z-[999] bg-black animate-[fade_0.6s_ease]"
          onClick={() => setTrailerPhase('idle')}
          onMouseMove={() => setTrailerPhase('idle')}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=0&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&playlist=${trailerKey}`}
            className="size-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-pulse text-sm text-white/50 pointer-events-none">
            {t('moveToExit') || 'حرّك الماوس للخروج'}
          </div>
        </div>
      )}

      {/* ── Hero section ──────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative isolate mt-14 sm:mt-16 min-h-[min(72dvh,38rem)] overflow-hidden">
        {/* Backdrop: static image OR trailer video */}
        {showTrailerVideo && trailerKey ? (
          <div className="absolute inset-0 -z-20 animate-[fade_1s_ease]">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&showinfo=0&loop=1&playlist=${trailerKey}`}
              className="absolute inset-0 size-full scale-[1.2] pointer-events-none"
              style={{ border: 'none' }}
              allow="autoplay; encrypted-media"
              tabIndex={-1}
            />
          </div>
        ) : img ? (
          <img src={u(img)} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_20%,#3a1219,#0a0708_70%)]" />
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/80 to-ink/10 rtl:bg-gradient-to-l" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/30 to-ink/50" />

        {/* Hero content */}
        <div className="flex min-h-[min(72dvh,38rem)] items-end px-[var(--pad)] pb-12 pt-10">
          <div className="max-w-[min(42rem,100%)] animate-rise">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.3em] text-gilt">
              {data.kind === 'series' ? t('series') : t('movie')}
            </p>
            <h1 className="text-balance font-display text-[clamp(2rem,5.4vw,3.8rem)] font-extrabold leading-[1.05] tracking-wide">
              {data.title}
            </h1>

            {/* Meta row */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dust">
              {data.rating ? (
                <span className="inline-flex items-center gap-1 font-semibold text-gilt">
                  <Star className="size-3.5" />{data.rating.toFixed(1)}
                </span>
              ) : null}
              {meta.map((m, i) => <span key={i}>{m}</span>)}
              {data.genres.slice(0, 4).map((g) => (
                <span key={g} className="rounded-sm border border-white/15 px-1.5 py-px text-[0.72rem] uppercase tracking-wider">{g}</span>
              ))}
            </div>

            {/* Tagline */}
            {data.tagline && (
              <p className="mt-3 text-gilt/80 italic text-sm">{data.tagline}</p>
            )}

            {/* Overview */}
            <p dir="auto" className="mt-4 max-w-prose text-[0.94rem] leading-relaxed text-bone/85 line-clamp-4">
              {data.overview || t('synopsis')}
            </p>

            {/* Action buttons */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {playId && (
                <button
                  onClick={() => go.watch(playId)}
                  className="group inline-flex h-12 items-center gap-2.5 rounded-lg bg-blood px-8 font-semibold text-white shadow-[0_8px_30px_-8px_rgba(220,48,68,0.7)] transition-all hover:bg-blood-hot hover:shadow-[0_12px_40px_-6px_rgba(220,48,68,0.85)] active:scale-[0.97]"
                >
                  <Play className="size-5 transition-transform group-hover:scale-110 rtl:-scale-x-100" />
                  {hasProgress ? t('resume') : t('play')}
                  {data.kind === 'series' && resumeEp?.season != null && (
                    <span className="text-white/75">· {t('season', { n: resumeEp.season })} {t('episodeShort', { n: resumeEp.episode ?? 0 })}</span>
                  )}
                </button>
              )}

              {/* Watch Trailer button */}
              {trailerKey && (
                <button
                  onClick={playTrailerNow}
                  className="group inline-flex h-12 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 text-sm font-medium text-bone backdrop-blur-sm transition-all hover:border-white/30 hover:bg-white/10 active:scale-[0.97]"
                >
                  <svg className="size-5 text-blood transition-transform group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
                  </svg>
                  {t('watchTrailer') || 'مشاهدة الإعلان'}
                </button>
              )}

              {playId && <WatchPartyButton mediaId={playId} title={data.title || ''} />}
            </div>
          </div>
        </div>
      </section>

      {/* ── Details grid (for movies) ─────────────────────────────────────── */}
      {data.kind === 'movie' && (
        <section className="px-[var(--pad)] pt-6">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 max-w-md rounded-xl bg-white/[0.03] border border-white/[0.06] p-5 text-sm">
            {data.year && (
              <>
                <span className="text-dust">{t('releaseDate') || 'تاريخ الإصدار'}</span>
                <span className="font-medium text-bone text-end">{data.year}</span>
              </>
            )}
            {data.runtimeSec && data.runtimeSec > 0 && (
              <>
                <span className="text-dust">{t('duration') || 'المدة'}</span>
                <span className="font-medium text-bone text-end">{fmtRuntime(data.runtimeSec, t)}</span>
              </>
            )}
            {data.genres.length > 0 && (
              <>
                <span className="text-dust">{t('genres') || 'التصنيفات'}</span>
                <span className="font-medium text-bone text-end">{data.genres.join(' · ')}</span>
              </>
            )}
            {data.rating && (
              <>
                <span className="text-dust">{t('rating') || 'التقييم'}</span>
                <span className="inline-flex items-center gap-1 font-medium text-gilt justify-end">
                  <Star className="size-3" />{data.rating.toFixed(1)}
                </span>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Episodes (series) ──────────────────────────────────────────────── */}
      {data.kind === 'series' && cur && (
        <section className="px-[var(--pad)] pt-6">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-white/10 pb-3">
            <h2 className="font-display text-xl font-semibold tracking-[0.12em]">{t('episodes')}</h2>
            {data.seasons.length > 1 && (
              <select
                value={cur.season}
                onChange={(e) => setSeason(Number(e.target.value))}
                aria-label="Season"
                className="rounded-md border border-white/15 bg-crypt px-3 py-2 text-sm text-bone transition-colors hover:border-gilt/60"
              >
                {data.seasons.map((s) => <option key={s.season} value={s.season}>{s.name ?? (s.season === 0 ? t('specials') : t('season', { n: s.season }))}</option>)}
              </select>
            )}
          </div>
          <ol className="divide-y divide-white/5">
            {cur.episodes.map((e, i) => <EpisodeRow key={e.id} ep={e} index={i} progress={progress[e.id]} />)}
          </ol>
        </section>
      )}

      {/* ── Recommendations ────────────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <section className="px-[var(--pad)] pt-10">
          <h2 className="mb-5 font-display text-xl font-semibold tracking-[0.12em]">
            {t('recommended') || 'قد يعجبك أيضًا'}
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {recommendations.map((rec) => (
              <RecommendationCard key={rec.id} item={rec} kind={data.kind} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Recommendation card */
function RecommendationCard({ item, kind }: { item: any; kind: string }) {
  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').substring(0, 4);
  const posterUrl = item.poster_path
    ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
    : null;
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  // Determine if this is a movie or tv based on media_type or fallback to parent kind
  const itemKind = item.media_type === 'tv' ? 'series' : item.media_type === 'movie' ? 'movie' : kind;

  return (
    <a
      href={hrefs.globalTitle(itemKind as 'movie' | 'series', item.id)}
      className="group relative overflow-hidden rounded-lg bg-crypt ring-1 ring-white/5 transition-all duration-300 hover:-translate-y-1 hover:ring-white/15 hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.9),0_0_16px_rgba(179,32,47,0.2)]"
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="aspect-[2/3] w-full bg-crypt flex items-center justify-center text-xs text-dust">
          {title}
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="text-xs font-semibold leading-tight line-clamp-2">{title}</p>
        <div className="mt-1 flex items-center gap-2 text-[0.65rem] text-dust">
          {year && <span>{year}</span>}
          {rating && rating !== '0.0' && (
            <span className="inline-flex items-center gap-0.5 text-gilt">
              <Star className="size-2.5" />{rating}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function EpisodeRow({ ep, index, progress }: { ep: EpisodeSummary; index: number; progress?: { t: number; d: number } }) {
  const { t, num } = useI18n();
  const rt = fmtRuntime(ep.runtimeSec, t);
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}>
      <a href={hrefs.watch(ep.id)} className="group/ep flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-white/[0.04] sm:gap-5 sm:px-3">
        <span className="w-7 shrink-0 text-center font-display text-2xl font-bold text-dust transition-colors group-hover/ep:text-gilt sm:w-10 sm:text-3xl">{num(ep.episode ?? index + 1)}</span>
        <div className="relative aspect-video w-[clamp(7.5rem,24vw,13rem)] shrink-0 overflow-hidden rounded-md bg-crypt ring-1 ring-white/5">
          {ep.stillUrl && <img src={u(ep.stillUrl)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover/ep:scale-105" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/ep:bg-black/40 group-hover/ep:opacity-100"><Play className="size-8 rtl:-scale-x-100" /></span>
          {progress && progress.d > 0 && <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/15"><div className="h-full bg-blood-hot" style={{ width: `${Math.min(100, (progress.t / progress.d) * 100)}%` }} /></div>}
          {!ep.playable && <span className="absolute start-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wider text-dust">{t('unplayable')}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p dir="auto" className="truncate font-semibold">{ep.title}</p>
            {rt && <span className="shrink-0 text-sm text-dust">{rt}</span>}
          </div>
          {ep.overview && <p dir="auto" className="mt-1 line-clamp-2 text-sm leading-relaxed text-dust @max-sm:hidden sm:line-clamp-3">{ep.overview}</p>}
        </div>
      </a>
    </li>
  );
}
