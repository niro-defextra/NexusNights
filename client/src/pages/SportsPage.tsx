import { useEffect, useMemo, useState } from 'react';
import type { SportsChannel } from '../sports/sports-service';
import { fetchSportsEPG } from '../sports/sports-service';
import { SportsPlayer } from '../sports/SportsPlayer';
import { useI18n } from '../i18n';
import {
  Play,
  Search,
  Spinner,
  Tv,
} from '../components/Icons';
import { EmptyState } from '../components/States';

type TabCategory = 'all' | 'main' | 'afc' | 'max' | 'xtra' | 'en_fr';

export function SportsPage() {
  const { lang, t } = useI18n();
  const [channels, setChannels] = useState<SportsChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<TabCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<SportsChannel | null>(null);

  // Load live channels EPG on mount
  useEffect(() => {
    let mounted = true;
    fetchSportsEPG(true)
      .then((data) => {
        if (mounted) {
          setChannels(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Filter channels based on selected category tab and search query
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      let matchesCategory = true;
      if (selectedCategory === 'all') {
        matchesCategory = true;
      } else if (selectedCategory === 'xtra') {
        matchesCategory = ch.category === 'xtra' || ch.category === 'news';
      } else {
        matchesCategory = ch.category === selectedCategory;
      }

      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchesCategory;

      const matchesQuery =
        ch.name.toLowerCase().includes(q) ||
        ch.nameAr.toLowerCase().includes(q) ||
        ch.leagueAr.toLowerCase().includes(q) ||
        (ch.currentProgram &&
          (ch.currentProgram.title.toLowerCase().includes(q) ||
            ch.currentProgram.desc.toLowerCase().includes(q)));

      return matchesCategory && matchesQuery;
    });
  }, [channels, selectedCategory, searchQuery]);

  // If a channel is selected, display the refined Live Player workspace directly
  if (activeChannel) {
    return (
      <SportsPlayer
        channel={activeChannel}
        allChannels={channels}
        onSelectChannel={(newCh) => setActiveChannel(newCh)}
        onClose={() => setActiveChannel(null)}
      />
    );
  }

  const categoryTabs: { id: TabCategory; label: string; count?: number }[] = [
    { id: 'all', label: lang === 'ar' ? 'جميع القنوات' : 'All Channels', count: channels.length },
    { id: 'main', label: lang === 'ar' ? 'beIN الرئيسية (1-9)' : 'beIN Main (1-9)' },
    { id: 'afc', label: lang === 'ar' ? 'قنوات آسيا (AFC)' : 'beIN AFC' },
    { id: 'max', label: lang === 'ar' ? 'قنوات ماكس (MAX)' : 'beIN MAX' },
    { id: 'xtra', label: lang === 'ar' ? 'إكسترا والإخبارية' : 'Xtra & News' },
    { id: 'en_fr', label: lang === 'ar' ? 'الإنجليزية والفرنسية' : 'EN & FR' },
  ];

  return (
    <div
      className="min-h-screen bg-ink text-bone pb-28 selection:bg-blood selection:text-white"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ── 1. TV Broadcast Header Hub ────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 sm:pt-24 pb-8 sm:pb-10 px-[var(--pad)] border-b border-white/[0.06]">
        {/* Subtle Dark Cinema Glow */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-blood/10 via-transparent to-ink pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Live Indicator Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blood/40 bg-blood/10 backdrop-blur-md px-3.5 py-1 text-xs font-bold text-blood-hot mb-4 shadow-[0_0_20px_rgba(220,48,68,0.25)]">
            <span className="size-2 rounded-full bg-blood-hot animate-pulse" />
            <span>{lang === 'ar' ? 'بث حي تلفزيوني مباشر' : 'LIVE TELEVISION BROADCAST'}</span>
            <span className="text-white/20">•</span>
            <span className="text-bone/80 font-normal">
              {lang === 'ar' ? 'سيرفرات فائقة السرعة 1080p' : 'Ultra Fast 1080p'}
            </span>
          </div>

          {/* Main Title */}
          <h1 className="font-display font-black text-2xl sm:text-4xl lg:text-5xl text-bone tracking-tight leading-tight mb-3 drop-shadow-[0_2px_24px_rgba(0,0,0,0.9)]">
            <span>{lang === 'ar' ? 'قنوات البث التلفزيوني' : 'Live Sports Television'} </span>
            <span className="bg-gradient-to-r from-blood-hot via-gilt to-blood bg-clip-text text-transparent">
              {lang === 'ar' ? 'الرياضي' : 'Channels'}
            </span>
          </h1>

          <p className="text-xs sm:text-sm text-dust max-w-xl leading-relaxed mb-6">
            {lang === 'ar'
              ? 'اختر القناة للمشاهدة المباشرة الفورية بدون إعلانات وبأعلى دقة 1080p مع 6 خوادم بديلة لكل قناة.'
              : 'Choose any channel for instant high-definition streaming with 6 redundant server backups.'}
          </p>

          {/* Quick Search Bar */}
          <div className="relative w-full max-w-md">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 size-4 text-dust pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث عن قناة بالاسم أو البطولة...' : 'Search by channel name or league...'}
              className="w-full rounded-2xl border border-white/10 bg-crypt/80 py-2.5 ps-11 pe-4 text-xs sm:text-sm text-bone placeholder:text-dust/50 focus:border-blood focus:bg-crypt focus:outline-none focus:ring-1 focus:ring-blood/50 backdrop-blur-md transition-all shadow-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-3.5 top-1/2 -translate-y-1/2 text-xs text-dust hover:text-bone p-1"
                aria-label={lang === 'ar' ? 'مسح البحث' : 'Clear search'}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 2. TV Category Filter Tabs (Sticky) ───────────────────────────── */}
      <section className="sticky top-14 sm:top-16 z-30 bg-ink/95 backdrop-blur-2xl border-b border-white/[0.06] px-[var(--pad)] py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div
            role="tablist"
            className="flex items-center gap-2 overflow-x-auto w-full pb-1 sm:pb-0 scrollbar-none snap-x"
          >
            {categoryTabs.map((tab) => {
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(tab.id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold shrink-0 snap-start transition-all cursor-pointer ${
                    active
                      ? 'bg-blood text-white shadow-[0_3px_14px_rgba(179,32,47,0.45)] ring-1 ring-white/20'
                      : 'border border-white/10 bg-crypt/70 text-dust hover:text-bone hover:bg-white/[0.06] active:scale-95'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-dust shrink-0 font-medium">
            <Tv className="size-3.5 text-gilt" />
            <span>
              {lang === 'ar' ? `${filteredChannels.length} قناة متاحة` : `${filteredChannels.length} channels`}
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. TV Channel Grid (Clean Television Channels Selector) ───────── */}
      <section className="max-w-7xl mx-auto px-[var(--pad)] pt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Spinner className="size-10 text-blood-hot" />
            <p className="text-sm text-dust font-medium">
              {lang === 'ar' ? 'جاري تحميل قائمة القنوات الفضائية...' : 'Loading live broadcast channels...'}
            </p>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title={lang === 'ar' ? 'لم يتم العثور على قنوات' : 'No Channels Found'}
              hint={
                lang === 'ar'
                  ? 'جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً من الأعلى.'
                  : 'Try another search query or switch category from above.'
              }
              actionLabel={lang === 'ar' ? 'عرض جميع القنوات' : 'Show All Channels'}
              onAction={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredChannels.map((channel) => {
              const current = channel.currentProgram;

              return (
                <div
                  key={channel.id}
                  onClick={() => setActiveChannel(channel)}
                  className="group relative rounded-2xl border border-white/[0.08] hover:border-blood/50 bg-crypt/85 hover:bg-crypt backdrop-blur-xl p-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_16px_40px_rgba(0,0,0,0.85),0_0_24px_rgba(179,32,47,0.25)] flex flex-col justify-between cursor-pointer overflow-hidden"
                  style={{
                    backgroundImage: `linear-gradient(to top, rgba(11,11,13,0.98) 0%, rgba(11,11,13,0.88) 55%, rgba(11,11,13,0.7) 100%), url('${channel.backdropUrl}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Top: Logo & Badges */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      {/* Channel Icon */}
                      <div className="size-14 rounded-2xl bg-black/60 border border-white/15 p-2 flex items-center justify-center shrink-0 shadow-lg backdrop-blur-md group-hover:scale-105 group-hover:border-blood/40 transition-all">
                        <img
                          src={channel.icon}
                          alt={channel.name}
                          className="size-full object-contain drop-shadow"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      {/* Status Badges */}
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blood/15 border border-blood/40 px-2.5 py-0.5 text-[10px] font-bold text-blood-hot uppercase tracking-wider">
                          <span className="size-1.5 rounded-full bg-blood-hot animate-pulse" />
                          <span>{lang === 'ar' ? 'مباشر' : 'LIVE'}</span>
                        </span>
                        <span className="rounded-md bg-white/[0.06] border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-bone/70">
                          1080p Full HD
                        </span>
                      </div>
                    </div>

                    {/* Channel Title & League */}
                    <div className="mb-3">
                      <h2 className="font-display font-black text-base sm:text-lg text-bone group-hover:text-blood-hot transition-colors truncate">
                        {lang === 'ar' ? channel.nameAr : channel.name}
                      </h2>
                      <p className="text-xs text-dust/85 font-medium line-clamp-1 mt-0.5">
                        {channel.leagueAr}
                      </p>
                    </div>

                    {/* Now Playing EPG Box */}
                    {current ? (
                      <div className="rounded-xl border border-white/[0.06] bg-black/50 backdrop-blur-md p-3 mb-2">
                        <div className="flex items-center justify-between text-[11px] text-dust mb-1">
                          <span className="font-bold text-gilt flex items-center gap-1">
                            <Tv className="size-3" />
                            <span>{lang === 'ar' ? 'يُعرض الآن:' : 'Now Airing:'}</span>
                          </span>
                          <span className="tabular-nums font-mono text-[10px] text-dust/80">
                            {current.timeFormatted}
                          </span>
                        </div>
                        <p className="font-semibold text-xs text-bone line-clamp-1 mb-2">
                          {current.title}
                        </p>
                        {/* Progress Bar */}
                        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blood to-blood-hot h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(5, current.progressPercent))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-md p-2.5 mb-2 text-center text-[11px] text-dust/70">
                        {lang === 'ar'
                          ? 'بث فضائي مباشر متواصل 24 ساعة'
                          : 'Continuous 24/7 Live Broadcast'}
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-3 border-t border-white/[0.06] mt-2 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-dust/70 font-medium">
                      {lang === 'ar' ? '6 خوادم بديلة' : '6 Server Backups'}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveChannel(channel);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blood/20 border border-blood/40 group-hover:bg-blood group-hover:text-white px-3 py-1.5 text-xs font-bold text-blood-hot transition-all duration-200 shadow-sm"
                    >
                      <Play className="size-3 fill-current rtl:-scale-x-100" />
                      <span>{lang === 'ar' ? 'تشغيل' : 'Play'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
