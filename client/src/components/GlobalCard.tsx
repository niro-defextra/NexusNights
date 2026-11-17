import type { GlobalTitleCard } from '../api-types';
import { go } from '../router';
import { Star } from './Icons';
import { useI18n } from '../i18n';
import { u } from '../api';

interface Props {
  card: GlobalTitleCard;
  progress?: number;
  rank?: number;
}

const ring =
  'ring-1 ring-white/[0.08] transition-all duration-300 ease-[var(--ease-out-expo)] group-hover/card:ring-gilt/40 group-hover/card:shadow-[0_14px_32px_-6px_rgba(0,0,0,0.95)] group-hover/card:-translate-y-1 group-focus-visible/card:ring-gilt';

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
      className={`group/card relative flex shrink-0 snap-start text-start outline-offset-4 focus-visible:outline-none items-end select-none ${
        rank !== undefined
          ? 'w-[calc(var(--poster-w)+clamp(1.5rem,3vw,2.5rem))]'
          : 'w-[var(--poster-w)]'
      }`}
      aria-label={cardLabel}
    >
      {/* Ranked Numeral Anchor */}
      {rank !== undefined && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute start-0 bottom-[-0.08em] z-10 select-none font-display text-[clamp(3.2rem,6.8vw,5.6rem)] font-black leading-none text-transparent [-webkit-text-stroke:2px_rgba(242,235,227,0.35)] transition-all duration-300 group-hover/card:[-webkit-text-stroke-color:rgba(212,175,106,0.95)]"
        >
          {rank}
        </span>
      )}

      {/* Card Poster Poster Box */}
      <div
        className={`relative ms-auto aspect-[2/3] overflow-hidden rounded-xl bg-crypt ${ring} ${
          rank !== undefined ? 'w-[var(--poster-w)]' : 'w-full'
        }`}
      >
        {card.posterUrl ? (
          <img
            src={u(card.posterUrl)}
            alt=""
            className="size-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover/card:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full flex-col justify-between bg-gradient-to-br from-blood/20 via-crypt to-ink p-3">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.25em] text-blood-hot">
              {card.kind === 'series' ? 'SERIES' : 'MOVIE'}
            </span>
            <span className="text-balance font-display text-sm font-bold leading-tight">{card.title}</span>
          </div>
        )}

        {/* Quiet Availability Pill */}
        {card.availability === 'local' && (
          <span className="absolute end-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-black/75 px-1.5 py-0.5 text-[0.58rem] font-bold tracking-wider text-emerald-300 shadow-md backdrop-blur-md">
            <span className="size-1 rounded-full bg-emerald-400" aria-hidden="true" />
            LOCAL
          </span>
        )}

        {/* Progress Bar */}
        {progress !== undefined && progress > 0.05 && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-black/40"
            aria-label={`${Math.round(progress * 100)}% ${lang === 'ar' ? 'مكتمل' : 'complete'}`}
          >
            <div
              className="h-full bg-blood-hot shadow-[0_0_8px_rgba(220,48,68,0.7)]"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </div>
        )}

        {/* Hover Quick Overlay */}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/95 via-black/40 to-transparent p-2.5 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
          <div className="truncate-safe w-full">
            <p className="line-clamp-2 text-xs font-bold leading-snug text-bone">{card.title}</p>
            <div className="mt-1 flex items-center gap-2 text-[0.68rem] text-dust">
              {card.year && <span>{card.year}</span>}
              {card.rating ? (
                <span className="font-bold text-gilt inline-flex items-center gap-0.5">
                  <Star className="size-2.5 fill-gilt" aria-hidden="true" /> {card.rating.toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
