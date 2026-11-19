import type { GlobalTitleCard } from '../api-types';
import { go } from '../router';
import { Play, Star } from './Icons';
import { useI18n } from '../i18n';
import { u } from '../api';

interface Props {
  card: GlobalTitleCard;
  progress?: number;
  rank?: number;
}

const ring =
  'ring-1 ring-white/[0.08] transition-all duration-300 ease-[var(--ease-out-expo)] group-hover/card:ring-blood/60 group-hover/card:shadow-[0_14px_32px_-6px_rgba(0,0,0,0.95),0_0_20px_rgba(220,48,68,0.3)] group-hover/card:-translate-y-1.5 group-focus-visible/card:ring-2 group-focus-visible/card:ring-gilt group-focus-visible/card:shadow-[0_0_24px_rgba(212,175,106,0.5)] group-focus-visible/card:-translate-y-1.5';

export function GlobalCard({ card, progress, rank }: Props) {
  const { lang } = useI18n();
  const handleClick = () => {
    if (card.localId) {
      go.title(card.localId);
    } else {
      go.globalTitle(card.kind, card.tmdbId);
    }
  };

  const cardLabel = `${card.title}${card.year ? ` (${card.year})` : ''}${card.rating ? ` - ${card.rating.toFixed(1)} stars` : ''}`;

  return (
    <button
      onClick={handleClick}
      className={`group/card relative flex shrink-0 snap-start text-start outline-offset-4 focus-visible:outline-none items-end select-none cursor-pointer ${
        rank !== undefined
          ? 'w-[calc(var(--poster-w)+clamp(1.5rem,3vw,2.5rem))]'
          : 'w-[var(--poster-w)]'
      }`}
      aria-label={cardLabel}
    >
      {/* Ranked Numeral Anchor (Top 10) */}
      {rank !== undefined && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-0 bottom-[-0.06em] z-10 select-none font-display text-[clamp(3.4rem,7vw,5.8rem)] font-black leading-none text-transparent [-webkit-text-stroke:2px_rgba(242,235,227,0.32)] transition-all duration-300 group-hover/card:[-webkit-text-stroke-color:rgba(220,48,68,0.9)] group-hover/card:drop-shadow-[0_0_12px_rgba(220,48,68,0.45)]"
        >
          {rank}
        </span>
      )}

      {/* Card Poster Box */}
      <div
        className={`relative ms-auto aspect-[2/3] overflow-hidden rounded-xl bg-crypt ${ring} ${
          rank !== undefined ? 'w-[var(--poster-w)]' : 'w-full'
        }`}
      >
        {card.posterUrl ? (
          <img
            src={u(card.posterUrl)}
            alt=""
            className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full flex-col justify-between bg-gradient-to-br from-blood/20 via-crypt to-ink p-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-blood-hot">
              {card.kind === 'series' ? 'SERIES' : 'MOVIE'}
            </span>
            <span className="text-balance font-display text-xs sm:text-sm font-bold leading-tight text-bone">
              {card.title}
            </span>
          </div>
        )}

        {/* Local Library Badge */}
        {card.availability === 'local' && (
          <span className="absolute end-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-black/80 px-2 py-0.5 text-[0.6rem] font-bold tracking-wider text-emerald-300 shadow-md backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            LOCAL
          </span>
        )}

        {/* Progress Bar (Continue Watching) */}
        {progress !== undefined && progress > 0.03 && (
          <div
            className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60"
            aria-label={`${Math.round(progress * 100)}% ${lang === 'ar' ? 'مكتمل' : 'complete'}`}
          >
            <div
              className="h-full bg-blood-hot shadow-[0_0_8px_rgba(220,48,68,0.8)] transition-all"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        )}

        {/* Hover Quick Overlay with Play Button & Details */}
        <div className="absolute inset-0 flex flex-col justify-between p-2.5 bg-gradient-to-t from-black/95 via-black/40 via-60% to-transparent opacity-0 transition-opacity duration-250 group-hover/card:opacity-100 pointer-events-none">
          <div className="flex justify-end pt-0.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-blood text-white shadow-lg transition-transform duration-200 group-hover/card:scale-105">
              <Play className="size-3.5 rtl:-scale-x-100" />
            </span>
          </div>

          <div className="truncate-safe w-full">
            <p className="line-clamp-2 text-xs font-bold leading-tight text-bone drop-shadow-sm">
              {card.title}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-dust">
              {card.year && <span>{card.year}</span>}
              {card.rating ? (
                <span className="font-bold text-gilt inline-flex items-center gap-0.5">
                  <Star className="size-2.5 fill-gilt" aria-hidden="true" />
                  {card.rating.toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
