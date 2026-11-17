import { useEffect, useMemo, useState } from 'react';
import type { SportsChannel, RealSportsEvent, BigMatchFixture } from '../sports/sports-service';
import { fetchSportsEPG, extractRealSportsEvents, TODAY_BIG_MATCHES } from '../sports/sports-service';
import { SportsPlayer } from '../sports/SportsPlayer';
import { useI18n } from '../i18n';
import {
  Calendar,
  Play,
  Search,
  Spinner,
  Trophy,
  Tv,
  Zap,
  ChevronDown,
} from '../components/Icons';

type TabCategory = 'all' | 'main' | 'afc' | 'max' | 'xtra' | 'en_fr';
type MatchFilter = 'all' | 'live' | 'cl' | 'pl' | 'laliga' | 'arab' | 'europe';

export function SportsPage() {
  const { lang } = useI18n();
  const [channels, setChannels] = useState<SportsChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TabCategory>('all');
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChannel, setActiveChannel] = useState<SportsChannel | null>(null);
  const [expandedScheduleChannelId, setExpandedScheduleChannelId] = useState<string | null>(null);

  // Load EPG data on mount
  useEffect(() => {
    let mounted = true;
    fetchSportsEPG()
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchSportsEPG(true);
      setChannels(data);
    } finally {
      setRefreshing(false);
    }
  };

  // Launch a channel by slug or id
  const launchChannelBySlug = (slug: string) => {
    const target = channels.find((c) => c.slug === slug) || channels.find((c) => c.slug === 'bein-1') || channels[0];
    if (target) {
      setActiveChannel(target);
    }
  };

  // Real events extracted from authentic XMLTV data
  const { liveNow, upcomingToday } = useMemo(() => {
    return extractRealSportsEvents(channels, lang);
  }, [channels, lang]);

  // Featured Marquee Match (First match in TODAY_BIG_MATCHES)
  const marqueeMatch: BigMatchFixture = TODAY_BIG_MATCHES[0];

  // Filtered Matches based on matchFilter
  const filteredMatches = useMemo(() => {
    return TODAY_BIG_MATCHES.filter((m) => {
      if (matchFilter === 'all') return true;
      if (matchFilter === 'live') return m.status === 'live';
      return m.leagueKey === matchFilter;
    });
  }, [matchFilter]);

  // Filter channels based on selected tab and search query
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

  return (
    <div
      className="min-h-screen bg-[#07080b] text-bone pb-28 selection:bg-emerald-500 selection:text-black"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ── 1. Electric Matchday Atmosphere & Featured Marquee Clash ──────── */}
      <section
        className="relative overflow-hidden pt-18 sm:pt-24 pb-14 sm:pb-18 px-[var(--pad)] border-b border-white/[0.08]"
        style={{
          backgroundImage: `linear-gradient(to bottom, rgba(7, 8, 11, 0.45) 0%, rgba(7, 8, 11, 0.88) 65%, #07080b 100%), url('${marqueeMatch.backdrop}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 25%',
        }}
      >
        {/* Subtle Stadium Vignette & Lighting */}
        <div
          className="absolute inset-0 bg-radial-vignette opacity-80 pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Top Broadcaster Badge */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/40 bg-black/70 backdrop-blur-md px-4 py-1.5 text-xs font-bold text-emerald-400 mb-5 shadow-2xl">
            <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{lang === 'ar' ? 'مركز البث الرياضي الحي • beIN SPORTS ARENA' : 'LIVE BROADCAST ARENA'}</span>
            <span className="text-white/30">•</span>
            <span className="text-bone font-normal">
              {lang === 'ar' ? 'سيرفرات فائقة السرعة 1080p' : 'Ultra Fast HD'}
            </span>
          </div>

          <h1 className="font-display font-black text-2xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-tight mb-6 max-w-3xl drop-shadow-md">
            <span>{lang === 'ar' ? 'نبض الملاعب العالمية' : 'WORLD SPORTS'} </span>
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 bg-clip-text text-transparent">
              {lang === 'ar' ? 'بأعلى جودة للبث' : 'IN FULL DEFINITION'}
            </span>
          </h1>

          {/* Marquee Match Scoreboard Showcase with Real Club Crests */}
          <div className="w-full max-w-3xl rounded-3xl border border-white/20 bg-black/75 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_60px_rgba(0,0,0,0.85)] relative overflow-hidden mb-4">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400" />

            {/* Match Header Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 mb-5 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-400">
                <Trophy className="size-4" />
                <span>{marqueeMatch.league}</span>
              </div>
              <div className="flex items-center gap-2 text-dust">
                <span>{marqueeMatch.stadium}</span>
                <span>•</span>
                <span>{lang === 'ar' ? `تعليق: ${marqueeMatch.commentator}` : marqueeMatch.commentator}</span>
              </div>
            </div>

            {/* Teams & Scoreboard with Authentic Club Crests */}
            <div className="flex items-center justify-between sm:justify-around gap-4 sm:gap-8 my-2">
              {/* Home Team */}
              <div className="flex flex-1 flex-col items-center text-center gap-2.5">
                <div className="size-16 sm:size-20 rounded-2xl bg-white/5 border border-white/15 p-2 flex items-center justify-center shadow-xl transition-transform hover:scale-105">
                  <img
                    src={marqueeMatch.homeCrest}
                    alt={marqueeMatch.homeTeam}
                    className="size-full object-contain drop-shadow-lg"
                    loading="lazy"
                  />
                </div>
                <span className="font-display font-black text-sm sm:text-lg text-white">
                  {marqueeMatch.homeTeam}
                </span>
              </div>

              {/* Score / Kickoff Pill */}
              <div className="flex flex-col items-center justify-center shrink-0">
                {marqueeMatch.status === 'live' ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 px-3 py-0.5 text-xs font-bold text-emerald-400 uppercase tracking-widest animate-pulse">
                      <span className="size-2 rounded-full bg-emerald-400" />
                      <span>{marqueeMatch.minute}</span>
                    </span>
                    <div className="font-display font-black text-3xl sm:text-5xl text-white tracking-widest tabular-nums drop-shadow">
                      {marqueeMatch.homeScore} : {marqueeMatch.awayScore}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      {lang === 'ar' ? 'تبدأ في' : 'Kickoff'}
                    </span>
                    <span className="font-display font-black text-2xl sm:text-3xl text-white tabular-nums">
                      {marqueeMatch.time}
                    </span>
                  </div>
                )}
                <span className="text-[11px] text-dust font-medium mt-1">
                  {marqueeMatch.channelName}
                </span>
              </div>

              {/* Away Team */}
              <div className="flex flex-1 flex-col items-center text-center gap-2.5">
                <div className="size-16 sm:size-20 rounded-2xl bg-white/5 border border-white/15 p-2 flex items-center justify-center shadow-xl transition-transform hover:scale-105">
                  <img
                    src={marqueeMatch.awayCrest}
                    alt={marqueeMatch.awayTeam}
                    className="size-full object-contain drop-shadow-lg"
                    loading="lazy"
                  />
                </div>
                <span className="font-display font-black text-sm sm:text-lg text-white">
                  {marqueeMatch.awayTeam}
                </span>
              </div>
            </div>

            {/* Quick Watch CTA Buttons */}
            <div className="pt-5 border-t border-white/10 mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => launchChannelBySlug(marqueeMatch.channelSlug)}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 px-8 py-3 text-sm font-black text-black shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-95 transition-all"
              >
                <Play className="size-4" />
                <span>{lang === 'ar' ? `شاهد القمة الآن على ${marqueeMatch.channelName}` : `Watch Live on ${marqueeMatch.channelName}`}</span>
              </button>

              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-xs font-semibold text-bone hover:border-white/30 hover:bg-white/[0.08] active:scale-95 transition-all disabled:opacity-50"
              >
                <Spinner className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{lang === 'ar' ? 'تحديث الجدول' : 'Refresh EPG'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Matchday Schedule Board (جدول مباريات اليوم المنظم والواضح) ── */}
      <section className="max-w-7xl mx-auto px-[var(--pad)] pt-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2.5">
            <Trophy className="size-6 text-emerald-400" />
            <div>
              <h2 className="font-display font-black text-xl sm:text-2xl text-white">
                {lang === 'ar' ? 'جدول مباريات اليوم المباشرة' : "Today's Matchday Schedule"}
              </h2>
              <p className="text-xs text-dust">
                {lang === 'ar'
                  ? 'مواعيد المباريات، القنوات الناقلة، والمعلقين (بتوقيت القاهرة)'
                  : 'Live fixtures, kickoff times, broadcast channels & commentators'}
              </p>
            </div>
          </div>

          {/* League / Match Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: lang === 'ar' ? 'الكل (8)' : 'All' },
              { id: 'live', label: lang === 'ar' ? '🔴 مباشر الآن' : 'Live' },
              { id: 'cl', label: lang === 'ar' ? 'أبطال أوروبا' : 'UCL' },
              { id: 'pl', label: lang === 'ar' ? 'البريميرليج' : 'Premier League' },
              { id: 'laliga', label: lang === 'ar' ? 'الدوري الإسباني' : 'La Liga' },
              { id: 'arab', label: lang === 'ar' ? 'آسيا وأفريقيا' : 'Arab & Asian' },
              { id: 'europe', label: lang === 'ar' ? 'الدوريات الأوروبية' : 'European' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setMatchFilter(tab.id as MatchFilter)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold shrink-0 transition-all ${
                  matchFilter === tab.id
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'border border-white/10 bg-white/[0.04] text-dust hover:text-bone hover:border-white/20'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clear Match Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMatches.map((match) => (
            <div
              key={match.id}
              onClick={() => launchChannelBySlug(match.channelSlug)}
              className="group cursor-pointer rounded-2xl border border-white/10 hover:border-emerald-500/60 bg-[#0e1118]/90 hover:bg-[#121622] p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between shadow-xl relative overflow-hidden"
            >
              {/* Top Meta Line: League Badge, Stadium & Commentator */}
              <div className="flex items-center justify-between text-xs text-dust mb-4 border-b border-white/[0.08] pb-2.5">
                <span className="font-bold text-emerald-400 truncate max-w-[160px] sm:max-w-[200px]">
                  {match.league}
                </span>
                <span className="truncate max-w-[150px] sm:max-w-[200px] text-dust/80">
                  {lang === 'ar' ? `تعليق: ${match.commentator}` : match.commentator}
                </span>
              </div>

              {/* Match Clash: Home Team Crest vs Away Team Crest */}
              <div className="flex items-center justify-between gap-3 my-2">
                {/* Home Team */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-11 sm:size-12 rounded-xl bg-white/5 border border-white/10 p-1.5 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <img
                      src={match.homeCrest}
                      alt={match.homeTeam}
                      className="size-full object-contain drop-shadow"
                      loading="lazy"
                    />
                  </div>
                  <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                    {match.homeTeam}
                  </span>
                </div>

                {/* Center Time / Score Pill */}
                <div className="flex flex-col items-center justify-center px-3 shrink-0">
                  {match.status === 'live' ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="flex items-center gap-1 font-bold text-[10px] text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 rounded-full uppercase">
                        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{match.minute}</span>
                      </span>
                      <div className="font-display font-black text-xl sm:text-2xl text-white tracking-widest tabular-nums">
                        {match.homeScore} : {match.awayScore}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-dust">
                        {lang === 'ar' ? 'توقيت القاهرة' : 'Cairo Time'}
                      </span>
                      <span className="font-display font-black text-base sm:text-lg text-emerald-400 tabular-nums">
                        {match.time}
                      </span>
                    </div>
                  )}
                </div>

                {/* Away Team */}
                <div className="flex items-center justify-end gap-3 min-w-0 flex-1 text-end">
                  <span className="font-display font-bold text-sm sm:text-base text-white truncate">
                    {match.awayTeam}
                  </span>
                  <div className="size-11 sm:size-12 rounded-xl bg-white/5 border border-white/10 p-1.5 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
                    <img
                      src={match.awayCrest}
                      alt={match.awayTeam}
                      className="size-full object-contain drop-shadow"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>

              {/* Bottom Footer: Stadium, Channel & Direct Watch Action */}
              <div className="pt-3 border-t border-white/[0.08] mt-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/10 px-2 py-1 text-[11px] font-medium text-bone">
                    <Tv className="size-3 text-emerald-400" />
                    <span>{match.channelName}</span>
                  </span>
                </div>

                <span className="font-bold text-emerald-400 group-hover:text-emerald-300 group-hover:translate-x-0.5 transition-all flex items-center gap-1.5">
                  <span>{lang === 'ar' ? 'شاهد البث المباشر' : 'Watch Stream'}</span>
                  <Play className="size-3.5 fill-current" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3. Category Filter Tabs & Instant Search ─────────────────────── */}
      <section className="sticky top-14 sm:top-16 z-30 bg-[#07080b]/98 backdrop-blur-2xl border-y border-white/[0.08] px-[var(--pad)] py-3.5 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div
            role="tablist"
            className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none snap-x"
          >
            {[
              { id: 'all', label: lang === 'ar' ? 'كل القنوات' : 'All Channels' },
              { id: 'main', label: lang === 'ar' ? 'باقة beIN (1-9)' : 'beIN Main (1-9)' },
              { id: 'afc', label: lang === 'ar' ? 'آسيا (AFC)' : 'beIN AFC' },
              { id: 'max', label: lang === 'ar' ? 'ماكس (MAX)' : 'beIN MAX' },
              { id: 'xtra', label: lang === 'ar' ? 'إكسترا والإخبارية' : 'Xtra & News' },
              { id: 'en_fr', label: lang === 'ar' ? 'الإنجليزية والفرنسية' : 'EN & FR' },
            ].map((tab) => {
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(tab.id as TabCategory)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold shrink-0 snap-start transition-all ${
                    active
                      ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                      : 'border border-white/10 bg-white/[0.03] text-dust hover:text-bone hover:border-white/25'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search box */}
          <div className="relative w-full md:w-72">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-dust pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'ar' ? 'ابحث عن قناة أو بطولة...' : 'Search channel or league...'}
              className="w-full rounded-full border border-white/10 bg-white/[0.04] py-1.5 ps-10 pe-4 text-xs text-bone placeholder:text-dust/50 focus:border-emerald-500 focus:bg-white/[0.08] focus:outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* ── 4. Rich Channels Grid with Authentic Stadium Photography ──────── */}
      <section className="max-w-7xl mx-auto px-[var(--pad)] pt-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Tv className="size-5 text-emerald-400" />
            <h2 className="font-display font-black text-lg sm:text-xl text-white">
              {lang === 'ar' ? 'قنوات البث الحي المباشر (1080p)' : 'Live Sports Broadcast Channels'}
            </h2>
          </div>
          <span className="text-xs text-dust">
            {lang === 'ar' ? `${filteredChannels.length} قناة جاهزة للبث` : `${filteredChannels.length} channels ready`}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner className="size-10 text-emerald-400" />
            <p className="text-sm text-dust font-medium">
              {lang === 'ar' ? 'جاري الاتصال بجدول القنوات وسيرفرات البث...' : 'Loading channels & live streams...'}
            </p>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center max-w-md mx-auto my-12">
            <Tv className="size-12 text-dust/40 mx-auto mb-3" />
            <h3 className="font-display font-bold text-base text-bone mb-1">
              {lang === 'ar' ? 'لم يتم العثور على قنوات' : 'No Channels Found'}
            </h3>
            <p className="text-xs text-dust">
              {lang === 'ar'
                ? 'جرب البحث بكلمة أخرى أو اختر تصنيفاً مختلفاً.'
                : 'Try another search keyword or switch category.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredChannels.map((channel) => {
              const current = channel.currentProgram;
              const next = channel.nextProgram;
              const isExpanded = expandedScheduleChannelId === channel.id;

              return (
                <div
                  key={channel.id}
                  className="group rounded-3xl border border-white/10 hover:border-emerald-500/50 transition-all duration-300 flex flex-col justify-between overflow-hidden relative shadow-xl hover:shadow-[0_12px_40px_rgba(0,0,0,0.85)]"
                  style={{
                    backgroundImage: `linear-gradient(to top, rgba(7,8,11,0.98) 0%, rgba(7,8,11,0.82) 48%, rgba(7,8,11,0.6) 100%), url('${channel.backdropUrl}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {/* Card Content Top */}
                  <div className="p-5">
                    {/* Channel Header Line */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-12 rounded-2xl bg-black/75 border border-white/15 flex items-center justify-center p-1.5 shadow-md backdrop-blur-md shrink-0">
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
                        <div className="min-w-0">
                          <h3 className="font-display font-black text-base text-white group-hover:text-emerald-400 transition-colors truncate">
                            {lang === 'ar' ? channel.nameAr : channel.name}
                          </h3>
                          <span className="text-[11px] font-semibold text-dust/90 block truncate">
                            {channel.leagueAr}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setActiveChannel(channel)}
                        className="flex size-11 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg hover:scale-110 active:scale-95 transition-transform shrink-0"
                        title={lang === 'ar' ? 'تشغيل البث المباشر' : 'Play Live Stream'}
                      >
                        <Play className="size-4" />
                      </button>
                    </div>

                    {/* Airing Program Box (Direct XMLTV Integration) */}
                    {current ? (
                      <div className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md p-3.5 mb-2">
                        <div className="flex items-center justify-between text-[11px] text-dust mb-1.5">
                          <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {lang === 'ar' ? 'يُعرض الآن:' : 'Now Playing:'}
                          </span>
                          <span className="tabular-nums font-medium">{current.timeFormatted}</span>
                        </div>

                        <h4 className="font-bold text-sm text-bone line-clamp-1 mb-2">
                          {current.title}
                        </h4>

                        {/* Program Elapsed Bar */}
                        <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mb-2">
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300"
                            style={{ width: `${current.progressPercent}%` }}
                          />
                        </div>

                        {next && (
                          <p className="text-[11px] text-dust/80 line-clamp-1">
                            <span className="text-white/40 font-medium">
                              {lang === 'ar' ? 'التالي: ' : 'Next: '}
                            </span>
                            {next.title}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-black/50 backdrop-blur-md p-3.5 mb-2 text-xs text-dust text-center">
                        {lang === 'ar'
                          ? 'بث حي متواصل 24 ساعة بأعلى دقة'
                          : 'Continuous 24/7 Live Broadcast'}
                      </div>
                    )}

                    {/* Expanded Channel Program Schedule */}
                    {isExpanded && (
                      <div className="mt-3 rounded-2xl border border-white/15 bg-black/85 backdrop-blur-xl p-3 flex flex-col gap-2 max-h-56 overflow-y-auto scrollbar-none animate-fade">
                        <span className="text-[11px] font-bold text-dust uppercase tracking-wider mb-1">
                          {lang === 'ar' ? 'جدول برامج اليوم:' : "Today's Schedule:"}
                        </span>
                        {channel.programs.slice(0, 8).map((p) => (
                          <div
                            key={p.id}
                            className={`rounded-xl p-2 text-xs flex flex-col gap-0.5 ${
                              p.isLive
                                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                                : 'text-dust bg-white/[0.02]'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px]">
                              <span>{p.timeFormatted}</span>
                              {p.isLive && (
                                <span className="font-bold text-emerald-400">
                                  {lang === 'ar' ? 'مباشر الآن' : 'LIVE'}
                                </span>
                              )}
                            </div>
                            <span className="font-medium text-bone line-clamp-1">{p.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Action Buttons Footer */}
                  <div className="px-5 pb-5 pt-2 flex items-center gap-2 border-t border-white/[0.08] bg-black/40">
                    <button
                      onClick={() => setActiveChannel(channel)}
                      className="flex-1 rounded-xl bg-emerald-500/90 hover:bg-emerald-400 py-2.5 text-xs font-bold text-black active:scale-95 transition-all text-center flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Play className="size-3.5" />
                      <span>{lang === 'ar' ? 'مشاهدة البث المباشر' : 'Watch Live'}</span>
                    </button>

                    <button
                      onClick={() =>
                        setExpandedScheduleChannelId(isExpanded ? null : channel.id)
                      }
                      className="rounded-xl border border-white/15 bg-white/[0.05] hover:bg-white/[0.12] px-3.5 py-2.5 text-xs font-medium text-dust hover:text-bone active:scale-95 transition-all flex items-center gap-1"
                      title={lang === 'ar' ? 'عرض جدول القناة' : 'View Schedule'}
                    >
                      <Calendar className="size-3.5" />
                      <ChevronDown
                        className={`size-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
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
