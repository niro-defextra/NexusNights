import { useState, useEffect } from 'react';
import { api, u } from '../api';
import { fmtCount, fmtRuntime } from '../format';
import { useI18n } from '../i18n';
import type { TitleSummary } from '../api-types';
import { Info, Play, Star } from './Icons';

interface Props {
  hero: TitleSummary & { logoUrl?: string | null; logoRatio?: number | null };
  /** Used when TMDB has no backdrop (e.g. no API key): a generated still from the library. */
  fallbackImage?: string | null;
  resumable?: boolean;
  onPlay: () => void;
  onInfo: () => void;
}

export function Hero({ hero, fallbackImage, resumable, onPlay, onInfo }: Props) {
  const { t, num, lang } = useI18n();
  const [logoUrl, setLogoUrl] = useState<string | null>(hero.logoUrl || null);
  const [logoFailed, setLogoFailed] = useState(false);

  const img = hero.backdropUrl ?? fallbackImage ?? null;
  const meta: string[] = [];
  if (hero.year) meta.push(num(hero.year).replace(/[,٬]/g, ''));
  if (hero.kind === 'series') {
    if (hero.seasonCount) meta.push(fmtCount(hero.seasonCount, 'seasonCount1', 'seasonsCount', t));
    else if (hero.episodeCount) meta.push(fmtCount(hero.episodeCount, 'episodeCount1', 'episodesCount', t));
  } else {
    const r = fmtRuntime(hero.runtimeSec, t);
    if (r) meta.push(r);
  }

  // Attempt to resolve transparent TMDB title logo matching current site language
  useEffect(() => {
    setLogoFailed(false);

    // Extract TMDB ID if present in id (e.g. movie-550 or tv-1399)
    let tmdbId: number | null = null;
    let kind: 'movie' | 'tv' = hero.kind === 'series' ? 'tv' : 'movie';

    if (hero.id.startsWith('movie-')) {
      tmdbId = parseInt(hero.id.replace('movie-', ''), 10);
      kind = 'movie';
    } else if (hero.id.startsWith('tv-')) {
      tmdbId = parseInt(hero.id.replace('tv-', ''), 10);
      kind = 'tv';
    }

    if (hero.logoUrl) {
      setLogoUrl(hero.logoUrl);
    }

    if (tmdbId && !isNaN(tmdbId)) {
      api.tmdbLogo(kind, tmdbId, lang)
        .then((res) => {
          if (res?.logoUrl) {
            setLogoUrl(res.logoUrl);
          }
        })
        .catch(() => {});
    }
  }, [hero.id, hero.logoUrl, hero.kind, lang]);

  return (
    <section className="relative isolate h-[clamp(30rem,70vh,45rem)] w-full overflow-hidden select-none">
      {img ? (
        <img
          key={img}
          src={u(img)}
          alt=""
          className="absolute inset-0 -z-20 size-full origin-[center_25%] object-cover motion-safe:animate-drift"
        />
      ) : (
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(ellipse_at_70%_30%,#2a0d14_0%,#150c0f_55%,#0a0708_100%)]" />
      )}

      {/* Cinematic multi-stop gradient grading */}
      {/* 1. Horizontal vignette keeping text area pitch-dark and artwork focal point visible */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 via-40% to-transparent rtl:bg-gradient-to-l" />
      {/* 2. Bottom dissolve merging the hero base directly into the page content */}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-ink via-ink/70 to-transparent" />
      {/* 3. Top shadow protecting header navigation buttons */}
      <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-ink/80 via-ink/25 to-transparent" />
      {/* 4. Soft peripheral vignette */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_75%_35%,transparent_45%,rgba(10,7,8,0.65)_100%)] rtl:bg-[radial-gradient(ellipse_at_25%_35%,transparent_45%,rgba(10,7,8,0.65)_100%)]" />

      {/* Hero Content Body */}
      <div className="absolute inset-x-0 bottom-6 sm:bottom-10 px-[var(--pad)]">
        <div className="max-w-2xl">
          {/* Eyebrow / Tagline */}
          {hero.tagline ? (
            <p className="mb-2 animate-rise text-[0.7rem] sm:text-xs font-semibold uppercase tracking-[0.25em] rtl:tracking-normal text-gilt/90 [animation-delay:80ms]">
              {hero.tagline}
            </p>
          ) : (
            <p className="mb-2 animate-rise text-[0.7rem] sm:text-xs font-semibold uppercase tracking-[0.25em] rtl:tracking-normal text-gilt/90 [animation-delay:80ms]">
              {hero.kind === 'series' ? t('series') : t('movie')}
            </p>
          )}

          {/* Authentic TMDB Logo Artwork or Clean Typographic Fallback */}
          {logoUrl && !logoFailed ? (
            <div className="mb-3.5 sm:mb-4.5 animate-rise [animation-delay:160ms] max-w-[min(26rem,85%)]">
              <img
                src={u(logoUrl)}
                alt={hero.title}
                className="max-h-20 sm:max-h-28 md:max-h-32 w-auto object-contain select-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]"
                onError={() => setLogoFailed(true)}
              />
            </div>
          ) : (
            <h1
              dir="auto"
              className="animate-rise font-display text-[clamp(1.85rem,5.5vw,3.8rem)] font-black leading-[1.08] text-bone tracking-tight rtl:tracking-normal drop-shadow-[0_2px_24px_rgba(0,0,0,0.95)] mb-3 [animation-delay:160ms]"
            >
              {hero.title}
            </h1>
          )}

          {/* Metadata Row */}
          <div className="flex animate-rise flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-dust [animation-delay:240ms]">
            {hero.rating ? (
              <span className="inline-flex items-center gap-1 font-bold text-gilt">
                <Star className="size-3.5 fill-gilt text-gilt" />
                {hero.rating.toFixed(1)}
              </span>
            ) : null}
            {meta.map((m, i) => (
              <span key={i} className="font-medium text-bone/80 after:ms-3 after:text-ash after:content-['•'] last:after:content-none">
                {m}
              </span>
            ))}
            {hero.genres.slice(0, 3).map((g) => (
              <span
                key={g}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[0.68rem] font-medium uppercase tracking-wider text-bone/80"
              >
                {g}
              </span>
            ))}
          </div>

          {/* Synopsis */}
          {hero.overview && (
            <p
              dir="auto"
              className="mt-3 line-clamp-2 sm:line-clamp-3 text-[0.88rem] sm:text-[0.94rem] leading-relaxed text-bone/80 animate-rise [animation-delay:320ms]"
            >
              {hero.overview}
            </p>
          )}

          {/* Call-to-Action Buttons */}
          <div className="mt-5 sm:mt-6 flex animate-rise flex-wrap items-center gap-3 [animation-delay:400ms]">
            <button
              onClick={onPlay}
              className="group inline-flex h-11 sm:h-12 items-center gap-2.5 rounded-xl bg-blood px-7 sm:px-9 text-sm sm:text-base font-bold tracking-wide text-white shadow-[0_6px_24px_rgba(220,48,68,0.5)] transition-all duration-200 hover:bg-blood-hot hover:shadow-[0_8px_32px_rgba(220,48,68,0.7)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt"
            >
              <Play className="size-4 sm:size-5 transition-transform duration-200 group-hover:scale-110 rtl:-scale-x-100" aria-hidden="true" />
              <span>{resumable ? t('resume') : t('play')}</span>
            </button>
            <button
              onClick={onInfo}
              className="group inline-flex h-11 sm:h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] px-5 sm:px-7 text-sm sm:text-base font-semibold text-bone backdrop-blur-md transition-all duration-200 hover:border-gilt/40 hover:bg-white/[0.14] hover:text-gilt hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt"
            >
              <Info className="size-4 sm:size-5 transition-transform duration-200 group-hover:rotate-12" aria-hidden="true" />
              <span>{t('moreInfo')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
