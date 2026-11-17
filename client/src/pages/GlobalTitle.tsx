import { useState, useEffect, useRef } from 'react';
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

export function GlobalTitle({ kind, tmdbId }: Props) {
  const { lang, t } = useI18n();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const episodesRef = useRef<HTMLDivElement>(null);

  const detail = useAsync(
    (s) => (kind === 'movie' ? api.discoveryMovie(tmdbId, lang, s) : api.discoveryTV(tmdbId, lang, s)),
    [kind, tmdbId, lang]
  );

  const season = useAsync(
    (s) => (kind === 'series' && selectedSeason > 0 ? api.discoverySeason(tmdbId, selectedSeason, lang, s) : Promise.resolve(null)),
    [kind, tmdbId, selectedSeason, lang]
  );

  // Sync logo matching current site language
  useEffect(() => {
    setLogoFailed(false);
    if (detail.data?.logoUrl) {
      setLogoUrl(detail.data.logoUrl);
    }

    // Try resolving logo for current language
    api.tmdbLogo(kind === 'series' ? 'tv' : 'movie', tmdbId, lang)
      .then((res) => {
        if (res?.logoUrl) {
          setLogoUrl(res.logoUrl);
        }
      })
      .catch(() => {});
  }, [detail.data?.logoUrl, kind, tmdbId, lang]);

  // Update meta tags when title data loads
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

  return (
    <div className="min-h-screen pb-16" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Hero Banner Section */}
      <div className="relative isolate h-[clamp(28rem,60vh,38rem)] w-full overflow-hidden select-none">
        {title.backdropUrl ? (
          <img
            src={u(title.backdropUrl)}
            alt=""
            className="absolute inset-0 -z-20 size-full object-cover object-[center_20%] sm:object-[center_25%]"
          />
        ) : (
          <div className="absolute inset-0 -z-20 bg-gradient-to-br from-blood/20 via-crypt to-ink" />
        )}

        {/* Cinematic Vignettes */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 via-40% to-transparent rtl:bg-gradient-to-l" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-ink via-ink/75 to-transparent" />
        <div className="absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-ink/80 via-transparent to-transparent" />

        {/* Top Back Action */}
        <div className="absolute start-4 sm:start-8 top-20 z-20">
          <button
            onClick={() => go.home()}
            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/60 text-bone backdrop-blur-md transition-all hover:bg-black/90 hover:scale-105 active:scale-95"
            aria-label={t('back')}
          >
            <ArrowLeft className={`size-5 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Content Box */}
        <div className="absolute inset-x-0 bottom-6 sm:bottom-8 px-[var(--pad)]">
          <div className="container mx-auto max-w-6xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] rtl:tracking-normal text-gilt/90">
              {kind === 'series' ? t('series') : t('movie')}
            </p>

            {/* Authentic TMDB Logo Artwork or Clean Typographic Fallback */}
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

      {/* Main Content Details Grid */}
      <div className="container mx-auto max-w-6xl px-[var(--pad)] pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12 items-start">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            {/* Overview / Storyline */}
            <div>
              <h2 className="mb-3 font-display text-xl sm:text-2xl font-bold tracking-wide text-bone">
                {t('synopsis')}
              </h2>
              <p className="text-bone/85 leading-relaxed text-sm sm:text-base">
                {title.overview || t('synopsis')}
              </p>
            </div>

            {/* TV Show: Seasons & Episodes */}
            {kind === 'series' && title.seasons && title.seasons.length > 0 && (
              <div ref={episodesRef} id="episodes" className="scroll-mt-24 space-y-4">
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
              </div>
            )}
          </div>

          {/* Sidebar Column: Specifications & Meta */}
          <div className="lg:col-span-1 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4 backdrop-blur-sm">
            <h3 className="font-display font-bold text-xs uppercase tracking-wider text-dust pb-3 border-b border-white/[0.08]">
              {lang === 'ar' ? 'تفاصيل العمل' : 'Details'}
            </h3>

            {title.status && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-dust">{t('titleStatus')}</span>
                <span className="font-semibold text-bone">{title.status}</span>
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
              <div className="flex items-center justify-between text-xs gap-3">
                <span className="text-dust shrink-0">{lang === 'ar' ? 'العنوان الأصلي' : 'Original Title'}</span>
                <span className="font-semibold text-bone truncate text-end">{title.originalTitle}</span>
              </div>
            )}

            {title.genres && title.genres.length > 0 && (
              <div className="pt-2 border-t border-white/[0.06]">
                <span className="text-xs text-dust block mb-2">{lang === 'ar' ? 'التصنيفات' : 'Genres'}</span>
                <div className="flex flex-wrap gap-1.5">
                  {title.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[0.68rem] font-medium text-bone/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
