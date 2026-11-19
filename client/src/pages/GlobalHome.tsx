import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { EpisodeCard } from '../components/Cards';
import { GlobalCard } from '../components/GlobalCard';
import { Hero } from '../components/Hero';
import { Row } from '../components/Row';
import { HeroSkeleton, RowSkeleton } from '../components/Skeleton';
import { EmptyState, ErrorState } from '../components/States';
import { DiscordActivityBanner } from '../components/DiscordActivityBanner';
import { useAsync } from '../hooks';
import { useI18n } from '../i18n';
import { continueIds, getProgress, progressVersion, subscribeProgress } from '../progress';
import { go } from '../router';

type CategoryFilter = 'all' | 'movies' | 'series' | 'trending';

export function GlobalHome() {
  const { lang, t } = useI18n();
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const home = useAsync((s) => api.discoveryHome(lang, s), [lang]);
  const pv = useSyncExternalStore(subscribeProgress, progressVersion);
  const ids = useMemo(() => continueIds(), [pv]);
  const cont = useAsync((s) => api.batch(ids, lang, s), [lang, ids.join(',')]);

  const empty = !!home.data && !home.data.hero && home.data.sections.length === 0;

  // While the library is empty/scanning, keep checking
  useEffect(() => {
    if (!empty) return;
    const id = setInterval(() => home.reload(), 4000);
    return () => clearInterval(id);
  }, [empty, home.reload]);

  // Filter sections according to active category tab (called unconditionally before early returns)
  const sections = home.data?.sections;
  const filteredSections = useMemo(() => {
    if (!sections) return [];
    return sections
      .map((section) => {
        let items = section.items;
        if (filter === 'movies') {
          items = items.filter((item) => item.kind === 'movie');
        } else if (filter === 'series') {
          items = items.filter((item) => item.kind === 'series');
        }

        return { ...section, items };
      })
      .filter((section) => {
        if (filter === 'trending') {
          return (
            section.key.toLowerCase().includes('trending') ||
            section.key.toLowerCase().includes('popular')
          );
        }
        return section.items.length > 0;
      });
  }, [sections, filter]);

  if (home.error && !home.data) {
    const nf = home.error instanceof ApiError && home.error.status === 404;
    return <ErrorState title={nf ? t('notFound') : t('loadError')} hint={t('loadErrorHint')} onRetry={home.reload} />;
  }

  if (!home.data) {
    return (
      <div>
        <HeroSkeleton />
        <div className="-mt-8 space-y-6">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      </div>
    );
  }

  if (empty) return <ErrorState title={t('emptyTitle')} hint={t('emptyHint')} onRetry={home.reload} />;

  const { hero } = home.data;
  const contItems = cont.data?.items ?? [];

  const play = () => {
    if (!hero) return;
    if (hero.localId) {
      const resumeId = contItems.find((i) => i.titleId === hero.localId)?.id;
      const id = resumeId ?? hero.id;
      if (id) go.watch(id);
    } else {
      go.globalTitle(hero.kind, hero.tmdbId);
    }
  };

  const onInfo = () => {
    if (!hero) return;
    if (hero.localId) {
      go.title(hero.localId);
    } else {
      go.globalTitle(hero.kind, hero.tmdbId);
    }
  };

  return (
    <main className="pb-16 select-none" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {hero && (
        <Hero
          hero={{
            id: hero.id,
            kind: hero.kind,
            title: hero.title,
            year: hero.year,
            overview: hero.overview,
            tagline: null,
            genres: [],
            rating: hero.rating,
            posterUrl: hero.posterUrl,
            backdropUrl: hero.backdropUrl,
            logoUrl: hero.logoUrl,
            logoRatio: hero.logoRatio,
            seasonCount: 0,
            episodeCount: 0,
            addedAt: 0,
            mediaId: hero.localId || null,
            firstMediaId: hero.localId || null,
            runtimeSec: null,
          }}
          fallbackImage={null}
          resumable={false}
          onPlay={play}
          onInfo={onInfo}
        />
      )}

      {/* Category Filter Pills Ramp (Netflix/Shahid Style) */}
      <div className="relative z-20 -mt-7 sm:-mt-9 px-[var(--pad)] mb-5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {(
            [
              { key: 'all', label: t('filterAll') },
              { key: 'movies', label: t('filterMovies') },
              { key: 'series', label: t('filterSeries') },
              { key: 'trending', label: t('filterTrending') },
            ] as const
          ).map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                  active
                    ? 'bg-blood text-white shadow-[0_3px_14px_rgba(179,32,47,0.45)] scale-100 ring-1 ring-white/20'
                    : 'bg-crypt/80 text-dust/85 border border-white/10 hover:text-bone hover:bg-white/[0.08] backdrop-blur-md active:scale-95'
                }`}
                aria-pressed={active}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 space-y-4 sm:space-y-6">
        {/* Continue Watching Row (Always shown on 'all' or when items exist) */}
        {contItems.length > 0 && filter === 'all' && (
          <Row title={t('continueWatching')}>
            {contItems.map((e) => {
              const p = getProgress(e.id);
              return (
                <EpisodeCard
                  key={e.id}
                  ep={e}
                  showTitleName
                  progress={p && p.d > 0 ? p.t / p.d : undefined}
                  currentTime={p?.t}
                  duration={p?.d}
                />
              );
            })}
          </Row>
        )}

        {/* Filtered Sections */}
        {filteredSections.length > 0 ? (
          filteredSections.map((section, sectionIdx) => {
            const isRanked =
              filter === 'trending' ||
              (filter === 'all' && sectionIdx === 0) ||
              section.key.includes('trending') ||
              section.key.includes('popular');

            return (
              <Row key={section.key} title={section.title}>
                {section.items.map((card, idx) => (
                  <GlobalCard
                    key={card.id}
                    card={card}
                    rank={isRanked ? idx + 1 : undefined}
                  />
                ))}
              </Row>
            );
          })
        ) : (
          <EmptyState
            title={t('noCategoryContent')}
            actionLabel={t('filterAll')}
            onAction={() => setFilter('all')}
          />
        )}
      </div>

      {/* Discord Activity Banner — bottom of page, after all content */}
      <div className="px-[var(--pad)] pb-16 pt-10">
        <DiscordActivityBanner />
      </div>
    </main>
  );
}
