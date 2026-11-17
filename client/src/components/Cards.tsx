import { memo } from 'react';
import { u } from '../api';
import { fmtRuntime } from '../format';
import { useI18n } from '../i18n';
import { hrefs } from '../router';
import type { EpisodeSummary, TitleSummary } from '../api-types';
import { Play } from './Icons';

const ring =
  'ring-1 ring-white/[0.08] transition-all duration-300 ease-[var(--ease-out-expo)] group-hover/card:ring-gilt/40 group-hover/card:shadow-[0_14px_32px_-6px_rgba(0,0,0,0.95)] group-hover/card:-translate-y-1.5 group-focus-visible/card:ring-gilt';

/** Portrait poster; falls back to a typographic card when there is no artwork. */
export const TitleCard = memo(function TitleCard({ title }: { title: TitleSummary }) {
  const { t } = useI18n();
  return (
    <a
      href={hrefs.title(title.id)}
      className="group/card block w-[var(--poster-w)] shrink-0 snap-start outline-offset-4 focus-visible:outline-none"
      aria-label={title.title}
    >
      <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-crypt ${ring}`}>
        {title.posterUrl ? (
          <img
            src={u(title.posterUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full flex-col justify-between bg-gradient-to-br from-blood/20 via-crypt to-ink p-4">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.3em] text-blood-hot">
              {title.kind === 'series' ? t('series') : t('movie')}
            </span>
            <span className="text-balance font-display text-lg font-bold leading-tight">{title.title}</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/card:opacity-100">
          <span className="line-clamp-2 text-sm font-bold leading-snug truncate-safe text-bone">{title.title}</span>
        </div>
      </div>
    </a>
  );
});

interface EpProps {
  ep: EpisodeSummary;
  /** Big outlined numeral (the episode number) like a "Top 10" card. */
  numeral?: boolean;
  /** 0..1 watch progress */
  progress?: number;
  currentTime?: number;
  duration?: number;
  showTitleName?: boolean;
}

export const EpisodeCard = memo(function EpisodeCard({
  ep,
  numeral,
  progress,
  currentTime,
  duration,
  showTitleName,
}: EpProps) {
  const { t, num, lang } = useI18n();
  const runtime = fmtRuntime(ep.runtimeSec, t);
  const label =
    ep.season !== null && ep.episode !== null && ep.kind === 'series'
      ? `${t('season', { n: ep.season })} · ${t('episodeShort', { n: ep.episode })}`
      : null;

  // Compute remaining time
  let remainingText: string | null = null;
  if (currentTime !== undefined && duration !== undefined && duration > currentTime) {
    const remainingSec = Math.max(0, duration - currentTime);
    const remainingMin = Math.ceil(remainingSec / 60);
    remainingText =
      lang === 'ar' ? `متبقي ${remainingMin} دقيقة` : `${remainingMin}m left`;
  }

  const cardLabel = `${showTitleName ? `${ep.titleName} - ` : ''}${ep.title}${label ? ` - ${label}` : ''}${remainingText ? ` (${remainingText})` : ''}`;

  return (
    <a
      href={hrefs.watch(ep.id)}
      className="group/card block w-[var(--card-w)] shrink-0 snap-start outline-offset-4 focus-visible:outline-none"
      aria-label={cardLabel}
    >
      <div className={`relative aspect-video overflow-hidden rounded-xl bg-crypt ${ring}`}>
        {ep.stillUrl ? (
          <img
            src={u(ep.stillUrl)}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.04]"
          />
        ) : (
          <div className="size-full bg-gradient-to-br from-blood/15 via-crypt to-ink" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {/* Big Outlined Numeral */}
        {numeral && ep.episode !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-3 start-2 select-none font-display text-[clamp(3.2rem,9vw,5.2rem)] font-extrabold leading-none text-transparent [-webkit-text-stroke:1.5px_rgba(242,235,227,0.85)] transition-[-webkit-text-stroke-color] group-hover/card:[-webkit-text-stroke-color:var(--color-gilt)]"
          >
            {num(ep.episode)}
          </span>
        )}

        {/* Remaining Time Badge */}
        {remainingText && (
          <span className="absolute start-2.5 bottom-2.5 z-10 inline-flex items-center gap-1.5 rounded-md bg-black/80 px-2 py-0.5 text-[0.68rem] font-medium text-bone/90 backdrop-blur-md border border-white/10 shadow-sm">
            <span className="size-1.5 rounded-full bg-blood-hot animate-pulse" />
            <span>{remainingText}</span>
          </span>
        )}

        {/* Hover Resume Action */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover/card:opacity-100">
          <span className="inline-flex items-center gap-2 rounded-full bg-blood px-4 py-2 text-xs font-bold text-white shadow-xl transition-transform duration-200 group-hover/card:scale-105 active:scale-95">
            <Play className="size-3.5 rtl:-scale-x-100" />
            <span>{lang === 'ar' ? 'استئناف' : 'Resume'}</span>
          </span>
        </div>

        {!ep.playable && (
          <span className="absolute start-3 top-3 rounded-full border border-dust/30 bg-ink/80 px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-dust backdrop-blur-sm">
            {t('unplayable')}
          </span>
        )}

        {/* Progress Bar */}
        {progress !== undefined && progress > 0 && (
          <div
            className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40"
            aria-label={`${Math.round(progress * 100)}% ${lang === 'ar' ? 'مكتمل' : 'complete'}`}
          >
            <div
              className="h-full bg-blood-hot shadow-[0_0_8px_rgba(220,48,68,0.8)]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="mt-2.5 px-0.5">
        <p
          dir="auto"
          className="line-clamp-1 text-sm font-semibold text-bone group-hover/card:text-gilt transition-colors truncate-safe"
        >
          {showTitleName && ep.titleName ? ep.titleName : ep.title}
        </p>
        <p className="mt-0.5 line-clamp-1 text-xs text-dust/80 truncate-safe flex items-center gap-1.5">
          {label && <span className="font-medium text-gilt/90">{label}</span>}
          {label && showTitleName && ep.title && ep.title !== ep.titleName && (
            <span className="text-white/25">•</span>
          )}
          {showTitleName && ep.title && ep.title !== ep.titleName && (
            <span className="truncate">{ep.title}</span>
          )}
          {!label && runtime && <span>{runtime}</span>}
        </p>
      </div>
    </a>
  );
});
