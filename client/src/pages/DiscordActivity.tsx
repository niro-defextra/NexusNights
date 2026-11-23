import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useRoom } from '../room/RoomContext';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n';
import { api, u } from '../api';
import type { 
  GlobalTitleCard, 
  GlobalTitleDetail, 
  GlobalSeason, 
  PlaybackConfigPublic, 
  AniSkipTimingsPublic,
  EpisodeDetail 
} from '../api-types';
import { 
  Discord, Play, Users, Globe, Star, Spinner, 
  Check, Copy, Crown, Zap, Search, Film, Tv, X, Sigil, Volume
} from '../components/Icons';
import { Avatar } from '../components/Avatar';
import { Player, type PlayerHandle } from '../player/Player';
import { EMOJIS } from '../room/RoomContext';
import { useDiscord } from '../discord/useDiscord';
import { useRoomSync } from '../room/useRoomSync';

export function DiscordActivity() {
  const { lang, t, toggle } = useI18n();
  const room = useRoom();
  const auth = useAuth();
  const discord = useDiscord();

  // ── Auto-join Discord voice channel room ──────────────────────────────────
  // When inside Discord, map the voice channel to a NexusNight room so all
  // users in the same voice channel land in the same watch-party room.
  useEffect(() => {
    if (!discord.isReady || !discord.channelId) return;
    if (room.active && room.roomId) return;

    const roomId = `dc-${discord.channelId}`;
    const hash = window.location.hash;
    if (!hash.includes('room=')) {
      const separator = hash.includes('?') ? '&' : '?';
      window.location.hash = `${hash}${separator}room=${encodeURIComponent(roomId)}`;
      console.log('[DiscordActivity] Auto-joined voice channel room:', roomId);
    }
  }, [discord.isReady, discord.channelId, room.active, room.roomId]);

  const [activeTab, setActiveTab] = useState<'watch' | 'browse' | 'members'>('browse');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalTitleCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copied, setCopied] = useState(false);

  // Media & catalog state
  const [catalog, setCatalog] = useState<{ hero: GlobalTitleCard | null; titles: GlobalTitleCard[] }>({
    hero: null,
    titles: [],
  });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [filterKind, setFilterKind] = useState<'all' | 'movie' | 'series'>('all');

  // TV Series Episode Selector Modal state
  const [selectedShow, setSelectedShow] = useState<GlobalTitleCard | null>(null);
  const [showDetail, setShowDetail] = useState<GlobalTitleDetail | null>(null);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(1);
  const [seasonData, setSeasonData] = useState<GlobalSeason | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Playback state for active room media
  const activeMediaId = room.state?.mediaId ?? null;
  const [mediaDetail, setMediaDetail] = useState<EpisodeDetail | null>(null);
  const [streamingConfig, setStreamingConfig] = useState<PlaybackConfigPublic | null>(null);
  const [skipTimings, setSkipTimings] = useState<AniSkipTimingsPublic | null>(null);
  const [playbackLoading, setPlaybackLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const playerHandle = useRef<PlayerHandle>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);

  // Floating live reactions
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);

  // Room control permission: in Discord voice rooms, default to collaborative
  const canControlPlayback = useMemo(() => {
    if (!room.active) return true;
    if (room.isHost) return true;
    if (room.room?.mode === 'everyone') return true;
    return room.canControl;
  }, [room.active, room.isHost, room.room?.mode, room.canControl]);

  // ── Room ↔ Player sync (keeps player in step with room state) ─────────────
  useRoomSync({
    room,
    mediaId: activeMediaId || '',
    handle: playerHandle,
    ready: playerReady && !!activeMediaId,
    onNeedsGesture: setNeedsGesture,
  });

  // Reset player ready state when media changes
  useEffect(() => { 
    setPlayerReady(false);
    setNeedsGesture(false);
  }, [activeMediaId]);

  // ── Auto switch to watch tab when media is selected in room ───────────────
  useEffect(() => {
    if (activeMediaId) {
      setActiveTab('watch');
    }
  }, [activeMediaId]);

  // ── Update Discord Activity status when watching media ─────────────────────
  useEffect(() => {
    if (discord.isReady && mediaDetail) {
      const title = mediaDetail.titleName || mediaDetail.title;
      const details = mediaDetail.kind === 'series' 
        ? `${title} - S${mediaDetail.season}E${mediaDetail.episode}`
        : title;
      const count = room.room?.members.length || 1;
      const state = lang === 'ar'
        ? (count > 1 ? `مع ${count} أصدقاء في الغرفة الصوتية` : 'مشاهدة فردية')
        : (count > 1 ? `With ${count} friends in voice` : 'Watching alone');
      
      void discord.updateActivity(details, state);
    }
  }, [discord.isReady, mediaDetail, room.room?.members.length, lang]);

  // ── Load Catalog from Discovery ───────────────────────────────────────────
  useEffect(() => {
    let cancel = false;
    setCatalogLoading(true);

    api.discoveryHome(lang)
      .then((data) => {
        if (cancel) return;
        const allTitles: GlobalTitleCard[] = [];
        data.sections.forEach((sec) => {
          sec.items.forEach((item) => {
            if (!allTitles.find((t) => t.id === item.id)) {
              allTitles.push(item);
            }
          });
        });
        setCatalog({
          hero: data.hero,
          titles: allTitles,
        });
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load catalog:', err))
      .finally(() => {
        if (!cancel) setCatalogLoading(false);
      });

    return () => { cancel = true; };
  }, [lang]);

  // ── Search handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      api.search(q, lang, 1)
        .then((res) => {
          setSearchResults([...res.local, ...res.global]);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, lang]);

  // ── Load TV Show Seasons & Episodes when modal opens ──────────────────────
  useEffect(() => {
    if (!selectedShow || selectedShow.kind !== 'series') return;
    let cancel = false;
    setModalLoading(true);

    api.discoveryTV(selectedShow.tmdbId, lang)
      .then((detail) => {
        if (cancel) return;
        setShowDetail(detail);
        const firstSeason = detail.seasons?.find((s) => s.seasonNumber > 0)?.seasonNumber || 1;
        setSelectedSeasonNum(firstSeason);
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load TV detail:', err))
      .finally(() => {
        if (!cancel) setModalLoading(false);
      });

    return () => { cancel = true; };
  }, [selectedShow, lang]);

  // ── Load episodes for selected season ─────────────────────────────────────
  useEffect(() => {
    if (!selectedShow || selectedShow.kind !== 'series' || !selectedSeasonNum) return;
    let cancel = false;

    api.discoverySeason(selectedShow.tmdbId, selectedSeasonNum, lang)
      .then((sData) => {
        if (cancel) return;
        setSeasonData(sData);
      })
      .catch((err) => console.error('[DiscordActivity] Failed to load season episodes:', err));

    return () => { cancel = true; };
  }, [selectedShow, selectedSeasonNum, lang]);

  // ── Fetch active media details when room.state.mediaId changes ────────────
  useEffect(() => {
    if (!activeMediaId) {
      setMediaDetail(null);
      setStreamingConfig(null);
      setSkipTimings(null);
      setPlaybackError(null);
      return;
    }

    let cancel = false;
    setPlaybackLoading(true);
    setPlaybackError(null);

    const movieMatch = activeMediaId.match(/^streaming-movie-(\d+)$/);
    const tvMatch = activeMediaId.match(/^streaming-tv-(\d+)-(\d+)-(\d+)$/);

    const loadPlayback = async () => {
      try {
        let titleName = '';
        let tmdbId = 0;
        let kind: 'movie' | 'series' = 'movie';
        let season: number | undefined;
        let episode: number | undefined;

        if (movieMatch) {
          tmdbId = parseInt(movieMatch[1], 10);
          kind = 'movie';
          const pb = await api.playbackMovie(tmdbId, lang);
          if (cancel) return;
          setStreamingConfig(pb.playback);
          if (pb.skipTimings) setSkipTimings(pb.skipTimings);
          titleName = pb.title || `Movie #${tmdbId}`;
        } else if (tvMatch) {
          tmdbId = parseInt(tvMatch[1], 10);
          season = parseInt(tvMatch[2], 10);
          episode = parseInt(tvMatch[3], 10);
          kind = 'series';
          const pb = await api.playbackTV(tmdbId, season, episode, lang);
          if (cancel) return;
          setStreamingConfig(pb.playback);
          if (pb.skipTimings) setSkipTimings(pb.skipTimings);
          titleName = `${pb.title} - S${season}E${episode}`;
        } else {
          // Local media ID
          const med = await api.media(activeMediaId, lang);
          if (cancel) return;
          setMediaDetail(med);
          setPlaybackLoading(false);
          return;
        }

        const mockDetail: EpisodeDetail = {
          id: activeMediaId,
          titleId: `${kind}-${tmdbId}`,
          titleName,
          title: titleName,
          tmdbId,
          kind,
          season: season ?? null,
          episode: episode ?? null,
          episodeEnd: null,
          runtimeSec: 5400,
          overview: '',
          airDate: null,
          stillUrl: null,
          thumbUrl: null,
          playable: true,
          width: 1920,
          height: 1080,
          playback: null,
          audioTracks: [{ index: 0, lang: 'en', label: 'English', channels: 2, default: true }],
          subtitles: [],
          sprite: null,
          nextId: null,
          prevId: null,
        };

        if (!cancel) {
          setMediaDetail(mockDetail);
          setPlaybackLoading(false);
        }
      } catch (err: any) {
        console.error('[DiscordActivity] Error fetching playback:', err);
        if (!cancel) {
          setPlaybackLoading(false);
          room.setBuffering('load', false);
          setPlaybackError(err?.message || (lang === 'ar' ? 'فشل تحميل روابط البث المباشر' : 'Failed to load streaming playback'));
        }
      }
    };

    void loadPlayback();
    return () => { cancel = true; };
  }, [activeMediaId, lang, loadAttempt]);

  // ── Sync real-time floating reactions from room members ───────────────────
  useEffect(() => {
    if (!room.reactions.length) return;
    const latest = room.reactions[room.reactions.length - 1];
    const id = `${latest.id}-${Date.now()}`;
    const x = Math.floor(Math.random() * 60) + 20; // 20% to 80% horizontal range
    setFloatingReactions((prev) => [...prev.slice(-12), { id, emoji: latest.emoji, x }]);

    const timer = setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2400);

    return () => clearTimeout(timer);
  }, [room.reactions]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSelectMedia = async (item: GlobalTitleCard) => {
    if (item.kind === 'series') {
      setSelectedShow(item);
      return;
    }

    const syntheticId = `streaming-movie-${item.tmdbId}`;
    await playMediaInVoice(syntheticId);
  };

  const playMediaInVoice = async (mediaId: string) => {
    if (room.active) {
      if (!canControlPlayback) {
        room.toast(t('onlyHost'));
        return;
      }
      setPlaybackLoading(true);
      setPlaybackError(null);
      setMediaDetail(null);
      setStreamingConfig(null);
      setSkipTimings(null);

      const res = await room.send({ type: 'select', mediaId, position: 0 });
      if (!res.ok) {
        console.error('[DiscordActivity] Failed to select media in room:', res.error);
        room.toast(res.error === 'forbidden' ? t('onlyHost') : t('playbackErrorHint'));
        setPlaybackLoading(false);
        return;
      }
    } else {
      const channelRoom = discord.channelId ? `dc-${discord.channelId}` : `dc-voice`;
      const currentHash = window.location.hash.replace(/[?&]room=[^&]*/g, '');
      const sep = currentHash.includes('?') ? '&' : '?';
      window.location.hash = `${currentHash}${sep}room=${encodeURIComponent(channelRoom)}`;

      const waitAndSelect = () => {
        const check = setInterval(() => {
          if (room.active) {
            clearInterval(check);
            void room.send({ type: 'select', mediaId, position: 0 });
          }
        }, 200);
        setTimeout(() => clearInterval(check), 10_000);
      };
      waitAndSelect();
    }
    setActiveTab('watch');
    setSelectedShow(null);
  };

  const handleCopyLink = () => {
    const url = window.location.origin + '/#/discord' + (room.roomId ? `?room=${encodeURIComponent(room.roomId)}` : '');
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const filteredTitles = useMemo(() => {
    const list = searchQuery.trim() ? searchResults : catalog.titles;
    if (filterKind === 'all') return list;
    return list.filter((t) => t.kind === filterKind);
  }, [searchQuery, searchResults, catalog.titles, filterKind]);

  // Show Discord loading screen while SDK initializes
  if (discord.isLoading) {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="flex h-[100dvh] w-full flex-col items-center justify-center bg-ink text-bone font-sans antialiased"
      >
        <div className="flex flex-col items-center gap-4 p-8">
          <div className="group flex items-center gap-2 mb-2" aria-label="NexusNight">
            <Sigil className="size-10 text-blood-hot animate-pulse" />
            <span lang="en" dir="ltr" className="font-display text-[2rem] font-extrabold tracking-[0.02em] text-bone">
              <span className="text-blood-hot">NEXUS</span>
              <span className="text-gilt">NIGHT</span>
            </span>
          </div>
          <Spinner className="size-8 text-gilt animate-spin" />
          <p className="text-sm font-medium text-dust animate-pulse">
            {lang === 'ar' ? 'جاري الاتصال بـ Discord والتهيئة...' : 'Connecting to Discord and initializing...'}
          </p>
        </div>
      </div>
    );
  }

  // Show error if Discord SDK failed to initialize
  if (discord.error) {
    return (
      <div
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
        className="flex h-[100dvh] w-full flex-col items-center justify-center bg-ink text-bone font-sans antialiased"
      >
        <div className="flex flex-col items-center gap-4 p-8 text-center max-w-md">
          <div className="size-16 rounded-2xl bg-blood/20 border border-blood/40 flex items-center justify-center">
            <Discord className="size-8 text-blood" />
          </div>
          <h2 className="font-display text-lg font-bold text-bone">
            {lang === 'ar' ? 'فشل الاتصال بـ Discord' : 'Discord Connection Failed'}
          </h2>
          <p className="text-sm text-dust leading-relaxed">
            {lang === 'ar' 
              ? 'تأكد من تشغيل هذا التطبيق من داخل Discord Activity في قناة صوتية. يمكنك أيضاً استخدام الموقع مباشرة للمشاهدة مع أصدقائك.'
              : 'Make sure you are launching this inside a Discord Voice Channel Activity. You can also use the main site for watch parties.'}
          </p>
          <button
            onClick={() => window.location.hash = '#/'}
            className="mt-2 flex items-center gap-2 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-5 py-2.5 font-display text-sm font-bold text-white shadow-[0_0_20px_rgba(186,24,27,0.4)] transition-all hover:scale-105 active:scale-95"
          >
            {lang === 'ar' ? 'الذهاب إلى الموقع الرئيسي' : 'Go to Main Website'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-ink text-bone font-sans antialiased selection:bg-blood-hot selection:text-white"
    >
      {/* ── Top Bar: Pure NexusNight Brand Standard ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-ink/90 px-3 sm:px-5 backdrop-blur-xl select-none z-30">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="group flex items-center gap-2" aria-label="NexusNight">
            <Sigil className="size-6 sm:size-7 text-blood-hot transition-transform duration-500 group-hover:rotate-180 shrink-0" />
            <span lang="en" dir="ltr" className="font-display text-[1.2rem] sm:text-[1.35rem] font-extrabold tracking-[0.02em] text-bone">
              <span className="text-blood-hot">NEXUS</span>
              <span className="text-gilt">NIGHT</span>
            </span>
          </div>

          <span className="hidden sm:inline-block rounded-full border border-gilt/30 bg-gilt/10 px-2.5 py-0.5 text-[0.65rem] font-bold tracking-wider text-gilt uppercase">
            {lang === 'ar' ? 'جلسة مشاهدة ديسكورد' : 'Discord Activity'}
          </span>

          <div className="hidden md:flex items-center gap-1.5 text-xs text-dust">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">
              {room.roomId 
                ? (lang === 'ar' ? `متصل بالغرفة: ${room.roomId}` : `Voice: ${room.roomId}`) 
                : (lang === 'ar' ? 'متصل بالصوت' : 'Voice Connected')}
            </span>
          </div>
        </div>

        {/* Navigation Tabs (Watch Party / Browse / Voice Members) */}
        <nav className="flex items-center gap-1 rounded-xl bg-crypt/90 p-1 border border-white/10 shadow-inner">
          <button
            onClick={() => setActiveTab('watch')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              activeTab === 'watch'
                ? 'bg-blood text-white shadow-[0_0_14px_rgba(179,32,47,0.45)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={lang === 'ar' ? 'غرفة المشاهدة الحالية' : 'Watch Party'}
          >
            <Play className="size-3.5 fill-current shrink-0" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'المشاهدة' : 'Watch Party'}</span>
            {activeMediaId && <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>

          <button
            onClick={() => setActiveTab('browse')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              activeTab === 'browse'
                ? 'bg-blood text-white shadow-[0_0_14px_rgba(179,32,47,0.45)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={lang === 'ar' ? 'تصفح الأفلام والمسلسلات' : 'Browse Catalog'}
          >
            <Film className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'تصفح المحتوى' : 'Browse'}</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
              activeTab === 'members'
                ? 'bg-blood text-white shadow-[0_0_14px_rgba(179,32,47,0.45)]'
                : 'text-dust hover:bg-white/5 hover:text-bone'
            }`}
            title={lang === 'ar' ? 'أعضاء القناة الصوتية' : 'Voice Members'}
          >
            <Users className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'الأعضاء' : 'Members'}</span>
            <span className="text-[11px] font-bold bg-white/10 px-1.5 py-0.2 rounded-md">
              {room.room?.members.length || 1}
            </span>
          </button>
        </nav>

        {/* Right Tools: Share Link, Language Switcher, User Avatar */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-bone transition-colors hover:border-gilt/40 hover:bg-gilt/10"
            title={lang === 'ar' ? 'نسخ رابط الغرفة لدعوة الأصدقاء' : 'Copy Room Link'}
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5 text-gilt" />}
            <span className="hidden sm:inline">{copied ? (lang === 'ar' ? 'تم النسخ!' : 'Copied!') : (lang === 'ar' ? 'نسخ الرابط' : 'Invite')}</span>
          </button>

          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-dust transition-colors hover:border-gilt/40 hover:text-bone"
            title={lang === 'ar' ? 'Switch to English' : 'التحويل للعربية'}
          >
            <Globe className="size-3.5 text-gilt" />
            <span className="font-semibold">{lang === 'ar' ? 'English' : 'العربية'}</span>
          </button>

          {auth.user ? (
            <Avatar user={auth.user} size={28} />
          ) : (
            <div className="size-7 rounded-full bg-gilt/20 border border-gilt/40 flex items-center justify-center text-[11px] font-bold text-gilt">
              NN
            </div>
          )}
        </div>
      </header>

      {/* ── Main View Content (Full Width & Height, 100% Immersive) ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── TAB 1: WATCH PARTY PLAYER (100% FULL SCREEN WIDTH) ── */}
        {activeTab === 'watch' && (
          <div className="flex flex-1 flex-col overflow-hidden relative bg-black">
            {/* Playback Loading Skeleton */}
            {playbackLoading ? (
              <div className="flex flex-1 min-h-[300px] flex-col items-center justify-center gap-4 p-6 text-center">
                <Spinner className="size-12 text-gilt animate-spin" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-bone animate-pulse">
                    {lang === 'ar' ? 'جاري تجهيز سيرفر البث والترجمات...' : 'Preparing stream sources & subtitles...'}
                  </p>
                  <p className="text-xs text-dust">
                    {lang === 'ar' ? 'يتم الاتصال بأسرع سيرفر متوفر بدون إعلانات' : 'Connecting to the fastest available ad-free provider'}
                  </p>
                </div>
              </div>
            ) : playbackError ? (
              /* Playback Error Screen */
              <div className="flex flex-1 min-h-[300px] flex-col items-center justify-center gap-4 p-6 text-center">
                <div className="size-16 rounded-2xl bg-blood/20 border border-blood/40 flex items-center justify-center text-blood-hot">
                  <X className="size-8" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-base font-bold text-bone">
                    {lang === 'ar' ? 'تعذر تشغيل هذا المصدر' : 'Failed to Load Playback'}
                  </h3>
                  <p className="text-xs text-dust leading-relaxed">
                    {playbackError}
                  </p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={() => setLoadAttempt((prev) => prev + 1)}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-5 py-2 font-display text-xs font-bold text-white shadow-[0_0_15px_rgba(186,24,27,0.4)] transition hover:scale-105 active:scale-95"
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('browse')}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-bone hover:bg-white/10"
                  >
                    {lang === 'ar' ? 'اختيار عمل آخر' : 'Choose Another Title'}
                  </button>
                </div>
              </div>
            ) : mediaDetail ? (
              /* Video Player Container */
              <div className="relative flex-1 min-h-0 bg-black flex flex-col justify-center overflow-hidden">
                <Player
                  key={activeMediaId || mediaDetail.id}
                  ref={playerHandle}
                  media={mediaDetail}
                  streamingConfig={streamingConfig}
                  skipTimings={skipTimings}
                  title={mediaDetail.titleName || mediaDetail.title}
                  autoPlay
                  embedded={true}
                  controlled={room.active}
                  canControl={canControlPlayback}
                  intentPlaying={!!room.state?.playing}
                  holdLabel={room.active && room.state?.hold && room.waitingFor.length
                    ? (() => {
                        const myName = room.me?.name || auth.user?.username;
                        const others = room.waitingFor.filter((n) => n !== myName);
                        return others.length > 0 
                          ? (lang === 'ar' ? `في انتظار: ${others.join('، ')}...` : `Waiting for ${others.join(', ')}...`)
                          : null;
                      })()
                    : null}
                  onDisabledControlClick={() => room.toast(t('onlyHost'))}
                  onBuffering={(k, v) => room.setBuffering(k, v)}
                  onReady={() => { setPlayerReady(true); room.setBuffering('load', false); }}
                  onUserPlay={(time) => canControlPlayback && void room.send({ type: 'play', position: time })}
                  onUserPause={(time) => canControlPlayback && void room.send({ type: 'pause', position: time })}
                  onUserSeek={(time) => canControlPlayback && void room.send({ type: 'seek', position: time })}
                  onSubtitleChange={(subId) => canControlPlayback && void room.send({ type: 'subtitle', subtitleId: subId })}
                  onAudioChange={(trackIdx) => canControlPlayback && void room.send({ type: 'audio', audioTrack: trackIdx })}
                  onSpeedChange={(rate) => canControlPlayback && void room.send({ type: 'speed', playbackRate: rate })}
                  hasNext={false}
                  onBack={() => {
                    if (room.isHost || canControlPlayback) {
                      void room.send({ type: 'clear' });
                    }
                    setActiveTab('browse');
                  }}
                  onNext={() => {}}
                />

                {/* Autoplay blocked / User gesture overlay */}
                {needsGesture && (
                  <button
                    onClick={() => {
                      playerHandle.current?.play().then(() => setNeedsGesture(false)).catch(() => {});
                    }}
                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-all"
                  >
                    <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-crypt/90 border border-blood/50 shadow-[0_0_40px_rgba(186,24,27,0.35)] animate-scale">
                      <div className="size-16 sm:size-20 rounded-full bg-gradient-to-r from-blood to-blood-hot flex items-center justify-center shadow-[0_0_30px_rgba(186,24,27,0.6)]">
                        <Play className="size-8 sm:size-10 fill-white text-white ms-1" />
                      </div>
                      <div className="text-center">
                        <span className="text-sm sm:text-base font-bold text-bone block">
                          {lang === 'ar' ? 'اضغط للمشاهدة مع الصوت' : 'Click to Play with Audio'}
                        </span>
                        <span className="text-xs text-dust block mt-0.5">
                          {lang === 'ar' ? 'انقر لتفعيل الصوت ومزامنة البث المباشر' : 'Tap to start synchronized audio & video'}
                        </span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Floating Real-Time Reaction Overlay */}
                <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                  {floatingReactions.map((r) => (
                    <div
                      key={r.id}
                      style={{ left: `${r.x}%` }}
                      className="absolute bottom-16 text-3xl sm:text-4xl animate-float-up opacity-90 filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                    >
                      {r.emoji}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Empty State (When no media is playing) */
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
                <div className="size-20 rounded-3xl bg-crypt/80 flex items-center justify-center text-gilt mb-4 shadow-2xl border border-gilt/20">
                  <Film className="size-10" />
                </div>
                <h2 className="font-display text-lg sm:text-xl font-bold text-bone mb-2">
                  {lang === 'ar' ? 'جاهزون للمشاهدة مع الأصدقاء؟' : 'Ready to watch together?'}
                </h2>
                <p className="text-xs sm:text-sm text-dust mb-6 leading-relaxed">
                  {lang === 'ar'
                    ? 'اختر فيلماً أو مسلسلاً من القائمة لبدء البث المباشر فوراً لجميع المتواجدين في القناة الصوتية!'
                    : 'Pick a movie or TV show from the catalog to stream instantly for everyone in this Discord voice channel!'}
                </p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-6 py-3 font-display text-sm font-bold text-white shadow-[0_0_24px_rgba(186,24,27,0.45)] transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="size-4 fill-current" />
                  <span>{lang === 'ar' ? '🍿 تصفح الأفلام والمسلسلات' : '🍿 Browse Movies & Shows'}</span>
                </button>
              </div>
            )}

            {/* Media Information & Live Reaction Bar */}
            {mediaDetail && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-crypt/90 px-4 py-3 select-none">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-display text-xs sm:text-sm font-bold text-bone">
                    {mediaDetail.titleName || mediaDetail.title}
                  </h3>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 font-medium mt-0.5">
                    <Zap className="size-3 text-gilt fill-gilt" />
                    <span>{lang === 'ar' ? 'بث فائق الجودة 1080p خالي من الإعلانات' : '1080p Ad-Free Native Stream'}</span>
                  </p>
                </div>

                {/* Stop playback button for host/controller */}
                {canControlPlayback && (
                  <button
                    onClick={() => {
                      void room.send({ type: 'clear' });
                      setActiveTab('browse');
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-blood/40 bg-blood/10 px-3 py-1.5 text-xs font-semibold text-blood-hot hover:bg-blood/20 transition active:scale-95"
                    title={lang === 'ar' ? 'إنهاء العرض الحالي وخروج الجميع إلى القائمة' : 'Stop current playback and return everyone to browse'}
                  >
                    <X className="size-3.5" />
                    <span>{lang === 'ar' ? 'إنهاء العرض للجميع' : 'Stop Playback'}</span>
                  </button>
                )}

                {/* Real-time Emoji Reaction Quick Bar */}
                <div className="flex items-center gap-1 bg-ink/80 p-1 rounded-xl border border-white/10 shadow-inner">
                  {EMOJIS.slice(0, 6).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => room.react(emoji)}
                      className="size-7 sm:size-8 rounded-lg text-sm sm:text-base transition-transform hover:scale-125 hover:bg-white/10 active:scale-90 flex items-center justify-center"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: BROWSE MEDIA CATALOG ── */}
        {activeTab === 'browse' && (
          <div className="flex flex-1 flex-col overflow-y-auto p-3 sm:p-6 bg-ink">
            {/* Quick Search & Filter Controls */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-6 max-w-4xl mx-auto w-full">
              <div className="relative flex-1 w-full">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 size-4 text-dust" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'ar' ? 'ابحث عن أفلام، مسلسلات، أنمي...' : 'Search movies, TV shows, anime...'}
                  className="w-full rounded-xl bg-crypt/90 py-2.5 ps-10 pe-4 text-xs font-medium text-bone placeholder:text-dust/60 border border-white/10 focus:border-gilt/50 focus:outline-none transition-colors shadow-sm"
                />
                {isSearching && (
                  <Spinner className="absolute end-3.5 top-1/2 -translate-y-1/2 size-4 text-gilt animate-spin" />
                )}
              </div>

              {/* Filter Chips */}
              <div className="flex items-center gap-1 rounded-xl bg-crypt/90 p-1 border border-white/10 self-stretch sm:self-auto justify-center">
                {(['all', 'movie', 'series'] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilterKind(k)}
                    className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all duration-200 ${
                      filterKind === k
                        ? 'bg-blood text-white shadow-[0_0_12px_rgba(179,32,47,0.4)]'
                        : 'text-dust hover:bg-white/5 hover:text-bone'
                    }`}
                  >
                    {k === 'all' ? (lang === 'ar' ? 'الكل' : 'All') : k === 'movie' ? (lang === 'ar' ? 'أفلام' : 'Movies') : (lang === 'ar' ? 'مسلسلات' : 'TV Shows')}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid */}
            {catalogLoading ? (
              <div className="flex flex-1 items-center justify-center p-12">
                <Spinner className="size-8 text-gilt animate-spin" />
              </div>
            ) : filteredTitles.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center text-dust">
                <Film className="size-10 mb-2 opacity-40 text-gilt" />
                <p className="text-xs sm:text-sm font-semibold text-bone">{t('notFound')}</p>
                <p className="text-[11px] text-dust/70">{t('notFoundHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 max-w-7xl mx-auto w-full pb-8">
                {filteredTitles.map((title) => (
                  <div
                    key={title.id}
                    className="group relative flex flex-col rounded-2xl bg-crypt/80 p-2 sm:p-2.5 border border-white/10 transition-all duration-300 ease-[var(--ease-out-expo)] hover:border-gilt/50 hover:bg-crypt hover:shadow-[0_16px_36px_-6px_rgba(0,0,0,0.95),0_0_24px_rgba(179,32,47,0.28)] hover:-translate-y-2 hover:scale-[1.02]"
                  >
                    {/* Poster */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-ash mb-2 border border-white/5">
                      {title.posterUrl ? (
                        <img
                          src={u(title.posterUrl)}
                          alt={title.title}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-dust/40">
                          <Film className="size-8" />
                        </div>
                      )}

                      {/* Kind Badge */}
                      <span className="absolute top-1.5 start-1.5 rounded-md bg-ink/80 border border-white/10 px-1.5 py-0.5 text-[9px] font-bold text-bone uppercase backdrop-blur-md">
                        {title.kind === 'series' ? (lang === 'ar' ? 'مسلسل' : 'TV') : (lang === 'ar' ? 'فيلم' : 'MOVIE')}
                      </span>

                      {/* Rating */}
                      {title.rating && (
                        <span className="absolute top-1.5 end-1.5 flex items-center gap-0.5 rounded-md bg-ink/80 border border-gilt/30 px-1.5 py-0.5 text-[9px] font-bold text-gilt backdrop-blur-md">
                          <Star className="size-2.5 fill-current" />
                          <span>{title.rating.toFixed(1)}</span>
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <h4 className="truncate font-display text-xs font-bold text-bone mb-0.5" title={title.title}>
                      {title.title}
                    </h4>
                    <p className="text-[10px] text-dust mb-2">{title.releaseDate ? title.releaseDate.slice(0, 4) : '2026'}</p>

                    {/* Stream in Voice Button */}
                    <button
                      onClick={() => handleSelectMedia(title)}
                      className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blood to-blood-hot py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(186,24,27,0.35)] transition-all hover:scale-[1.02] active:scale-95"
                    >
                      <Play className="size-3 fill-current" />
                      <span>{title.kind === 'series' ? (lang === 'ar' ? 'اختر حلقة' : 'Pick Episode') : (lang === 'ar' ? 'تشغيل في الصوت' : 'Stream in Voice')}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: VOICE ROOM MEMBERS ── */}
        {activeTab === 'members' && (
          <div className="flex flex-1 flex-col p-4 sm:p-6 max-w-xl mx-auto w-full overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-bone">
                {lang === 'ar' ? 'أعضاء المشاهدة في القناة الصوتية' : 'Voice Watch Party Members'}
              </h2>
              {room.isHost && (
                <button
                  onClick={() => room.setMode(room.room?.mode === 'everyone' ? 'host' : 'everyone')}
                  className="rounded-xl border border-gilt/30 bg-gilt/10 px-3 py-1 text-xs font-bold text-gilt hover:bg-gilt/20 transition"
                  title={lang === 'ar' ? 'تغيير وضع التحكم في المشغل' : 'Change playback control permissions'}
                >
                  {room.room?.mode === 'everyone'
                    ? (lang === 'ar' ? 'وضع التحكم: الجميع' : 'Control: Everyone')
                    : (lang === 'ar' ? 'وضع التحكم: المضيف فقط' : 'Control: Host Only')}
                </button>
              )}
            </div>

            <p className="text-xs text-dust mb-4 leading-relaxed">
              {lang === 'ar' 
                ? 'جميع الأصدقاء المتواجدون معك الآن في القناة الصوتية يتم مزامنة البث معهم تلقائياً بدقة 100%.' 
                : 'All friends currently with you in this Discord voice channel are automatically synchronized.'}
            </p>

            <div className="rounded-2xl bg-crypt/90 border border-white/10 divide-y divide-white/10 overflow-hidden shadow-xl backdrop-blur-md">
              {room.room?.members && room.room.members.length > 0 ? (
                room.room.members.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar user={member} size={34} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-bone">{member.name}</span>
                          {member.isHost && (
                            <span className="flex items-center gap-0.5 rounded-full bg-gilt/15 border border-gilt/40 px-2 py-0.5 text-[9px] font-bold text-gilt">
                              <Crown className="size-2.5" />
                              <span>{lang === 'ar' ? 'المضيف' : 'Host'}</span>
                            </span>
                          )}
                          {member.id === room.me?.id && (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-dust">
                              {lang === 'ar' ? 'أنت' : 'You'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-dust mt-0.5">
                          {member.canControl 
                            ? (lang === 'ar' ? 'يتحكم في المشغل' : 'Can control playback') 
                            : (lang === 'ar' ? 'مشاهد' : 'Viewer')}
                        </p>
                      </div>
                    </div>

                    {/* Host action buttons */}
                    {room.isHost && member.id !== room.me?.id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => room.act(member.canControl ? 'control:revoke' : 'control:grant', member.id)}
                          className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-bone hover:border-gilt/40 hover:bg-gilt/15 hover:text-gilt transition"
                        >
                          {member.canControl ? (lang === 'ar' ? 'سحب التحكم' : 'Revoke') : (lang === 'ar' ? 'منح التحكم' : 'Grant')}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-dust">
                  <Users className="size-8 mx-auto mb-2 opacity-50 text-gilt" />
                  <p className="text-xs">{lang === 'ar' ? 'في انتظار انضمام الأصدقاء من القناة الصوتية...' : 'Waiting for voice channel members to join...'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TV SERIES EPISODE PICKER MODAL (NexusNight Aesthetic) ── */}
        {selectedShow && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/80 backdrop-blur-md animate-fade">
            <div className="relative flex flex-col w-full max-w-lg max-h-[85dvh] rounded-2xl bg-crypt/95 border border-gilt/30 shadow-2xl backdrop-blur-xl overflow-hidden">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-crypt">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-bold text-sm sm:text-base text-bone truncate">
                    {selectedShow.title}
                  </h3>
                  <p className="text-[11px] text-dust">
                    {lang === 'ar' ? 'اختر الموسم والحلقة للبث المباشر في القناة الصوتية' : 'Select season & episode to stream in voice'}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedShow(null)}
                  className="size-7 flex items-center justify-center rounded-lg bg-white/5 text-dust hover:text-bone hover:bg-white/10"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Season Selector Tabs */}
              {showDetail?.seasons && showDetail.seasons.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-white/10 bg-ink/80 no-scrollbar">
                  {showDetail.seasons
                    .filter((s) => s.seasonNumber > 0)
                    .map((s) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                        className={`rounded-xl px-3 py-1 text-xs font-bold whitespace-nowrap transition-all ${
                          selectedSeasonNum === s.seasonNumber
                            ? 'bg-gilt text-ink shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                            : 'bg-white/5 text-dust hover:bg-white/10 hover:text-bone'
                        }`}
                      >
                        {lang === 'ar' ? `الموسم ${s.seasonNumber}` : `Season ${s.seasonNumber}`}
                      </button>
                    ))}
                </div>
              )}

              {/* Episode List */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
                {modalLoading ? (
                  <div className="flex items-center justify-center p-12">
                    <Spinner className="size-7 text-gilt animate-spin" />
                  </div>
                ) : seasonData?.episodes && seasonData.episodes.length > 0 ? (
                  seasonData.episodes.map((ep) => (
                    <div
                      key={ep.episodeNumber}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-ink/80 border border-white/10 hover:border-gilt/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-gilt">E{ep.episodeNumber}</span>
                          <h4 className="text-xs font-bold text-bone truncate">{ep.name || `Episode ${ep.episodeNumber}`}</h4>
                        </div>
                        {ep.overview && (
                          <p className="text-[10px] text-dust line-clamp-1 mt-0.5">{ep.overview}</p>
                        )}
                      </div>

                      <button
                        onClick={() => playMediaInVoice(`streaming-tv-${selectedShow.tmdbId}-${selectedSeasonNum}-${ep.episodeNumber}`)}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blood to-blood-hot px-3.5 py-1.5 text-xs font-bold text-white shadow-[0_0_12px_rgba(186,24,27,0.3)] hover:scale-105 active:scale-95 shrink-0 transition"
                      >
                        <Play className="size-3 fill-current" />
                        <span>{lang === 'ar' ? 'تشغيل' : 'Play'}</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-dust">
                    <Tv className="size-7 mx-auto mb-2 opacity-50 text-gilt" />
                    <p className="text-xs">{lang === 'ar' ? 'لا توجد حلقات متاحة لهذا الموسم حالياً' : 'No episodes found for this season.'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
