import { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import type { SportsChannel, StreamSource, SportsProgram } from './sports-service';
import { setCustomStream, formatProgramTime } from './sports-service';
import {
  ArrowLeft,
  Close,
  Fullscreen,
  ExitFullscreen,
  Play,
  Pause,
  Volume,
  Tv,
  Sliders,
  Spinner,
  Check,
  ExternalLink,
  Search,
  Calendar,
  Zap,
} from '../components/Icons';
import { registerBackHandler } from '../native/back-button';
import { useI18n } from '../i18n';

interface Props {
  channel: SportsChannel;
  allChannels: SportsChannel[];
  onSelectChannel: (channel: SportsChannel) => void;
  onClose: () => void;
}

type SidebarTab = 'channels' | 'epg';

export function SportsPlayer({ channel, allChannels, onSelectChannel, onClose }: Props) {
  const { lang } = useI18n();
  const [currentSourceIdx, setCurrentSourceIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInputUrl, setCustomInputUrl] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('channels');
  const [channelFilter, setChannelFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [levels, setLevels] = useState<{ id: number; height: number; bitrate: number; name: string }[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = Auto

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<any>(null);

  // Active source
  const source: StreamSource | undefined = channel.streamSources[currentSourceIdx] || channel.streamSources[0];

  useEffect(() => {
    setCurrentSourceIdx(0);
    setHasError(false);
    setLevels([]);
    setCurrentLevel(-1);
  }, [channel.id]);

  useEffect(() => {
    return registerBackHandler(() => {
      if (showCustomModal) {
        setShowCustomModal(false);
        return true;
      }
      onClose();
      return true;
    });
  }, [showCustomModal, onClose]);

  // Handle Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Controls auto-hide timer
  const handleUserActivity = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !hasError && !showSourceMenu && !showQualityMenu) {
        setShowControls(false);
      }
    }, 3500);
  };

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, isMuted, isFullscreen, onClose]);

  // HLS playback engine
  useEffect(() => {
    if (!source || source.type !== 'hls') return;
    const video = videoRef.current;
    if (!video) return;

    setIsBuffering(true);
    setHasError(false);

    let hls: Hls | null = null;
    // Force a fresh upstream token resolution on recovery attempts (refreshKey > 0).
    const url = refreshKey > 0 ? `${source.url}?_r=${refreshKey}` : source.url;
    let destroyed = false;
    let nativeLoadedHandler: (() => void) | null = null;
    let nativeErrorHandler: (() => void) | null = null;
    let retryCount = 0;
    let watchdogTimer: any = null;
    let stallTimer: any = null;
    let lastTime = -1;
    let stallCount = 0;

    const clearTimers = () => {
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (stallTimer) clearInterval(stallTimer);
    };

    const recover = (reason: string) => {
      if (destroyed || !hls) return;
      console.warn('[SportsPlayer] Recovering stream:', reason);
      try { hls.recoverMediaError(); } catch {}
      try { hls.startLoad(); } catch {}
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 10,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        if (destroyed) return;
        setIsBuffering(false);
        setHasError(false);
        retryCount = 0;
        if (data.levels && data.levels.length > 0) {
          const parsed = data.levels.map((lvl, idx) => ({
            id: idx,
            height: lvl.height || 0,
            bitrate: lvl.bitrate || 0,
            name: lvl.height ? `${lvl.height}p` : `Level ${idx + 1}`,
          }));
          setLevels(parsed);
        }
        video.play().catch(() => {});

        // Initial watchdog: ensure video actually renders
        if (watchdogTimer) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
          if (destroyed) return;
          if (video.videoWidth === 0 || video.readyState < 2) {
            recover('initial watchdog (no video)');
          }
        }, 6000);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (destroyed) return;
        // Non-fatal buffer stalls: try to recover without surfacing an error
        if (!data.fatal) {
          if (data.details === 'bufferStalledError' || String(data.details).toLowerCase().includes('stall')) {
            recover('buffer stalled');
          }
          return;
        }
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (retryCount < 6) {
              retryCount++;
              const delay = Math.min(1000 * retryCount, 5000);
              setTimeout(() => {
                if (destroyed || !hls) return;
                hls.startLoad();
              }, delay);
            } else {
              // Re-resolve upstream by bumping refreshKey (server re-resolves token)
              setHasError(false);
              setIsBuffering(true);
              setRefreshKey((k) => k + 1);
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            recover('media error');
            break;
          default:
            if (retryCount < 3) {
              retryCount++;
              setTimeout(() => {
                if (destroyed) return;
                setRefreshKey((k) => k + 1);
              }, 1500);
            } else {
              setHasError(true);
              setIsBuffering(false);
            }
            break;
        }
      });

      // Playback stall watchdog: detect frozen currentTime
      stallTimer = setInterval(() => {
        if (destroyed || !video) return;
        if (video.paused) {
          lastTime = video.currentTime;
          stallCount = 0;
          return;
        }
        if (video.currentTime === lastTime && video.readyState < 3) {
          stallCount++;
          if (stallCount >= 2) {
            recover('playback frozen');
            stallCount = 0;
          }
        } else {
          stallCount = 0;
        }
        lastTime = video.currentTime;
      }, 3000);

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      nativeLoadedHandler = () => {
        if (destroyed) return;
        setIsBuffering(false);
        video.play().catch(() => {});
      };
      nativeErrorHandler = () => {
        if (destroyed) return;
        setHasError(true);
        setIsBuffering(false);
      };
      video.addEventListener('loadedmetadata', nativeLoadedHandler);
      video.addEventListener('error', nativeErrorHandler);
    }

    return () => {
      destroyed = true;
      clearTimers();
      if (hls) {
        hls.destroy();
        hlsRef.current = null;
      }
      if (video) {
        if (nativeLoadedHandler) video.removeEventListener('loadedmetadata', nativeLoadedHandler);
        if (nativeErrorHandler) video.removeEventListener('error', nativeErrorHandler);
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [source, refreshKey]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    setVolume(val);
    if (video) {
      video.volume = val;
      video.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleQualitySelect = (levelIndex: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
      setCurrentLevel(levelIndex);
      setShowQualityMenu(false);
    }
  };

  const toggleFullscreen = () => {
    const el = playerWrapperRef.current || containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleSaveCustomStream = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInputUrl.trim()) {
      setCustomStream(channel.slug, customInputUrl.trim());
      setShowCustomModal(false);
      setCustomInputUrl('');
      window.location.reload();
    }
  };

  // Filter channels in sidebar
  const filteredChannels = useMemo(() => {
    return allChannels.filter((ch) => {
      let matchesCat = true;
      if (channelFilter === 'all') matchesCat = true;
      else if (channelFilter === 'xtra') matchesCat = ch.category === 'xtra' || ch.category === 'news';
      else matchesCat = ch.category === channelFilter;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchesCat;
      return (
        matchesCat &&
        (ch.name.toLowerCase().includes(q) ||
          ch.nameAr.toLowerCase().includes(q) ||
          ch.leagueAr.toLowerCase().includes(q) ||
          (ch.currentProgram && ch.currentProgram.title.toLowerCase().includes(q)))
      );
    });
  }, [allChannels, channelFilter, searchQuery]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#07080b] text-bone flex flex-col pt-16 sm:pt-20 pb-16 px-4 sm:px-6 max-w-[1750px] mx-auto w-full select-none"
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      {/* ── 1. Top Sub-Navigation Header ───────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-white/[0.06] border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-bone hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all"
            aria-label="Back to channels"
          >
            <ArrowLeft className={`size-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
            <span>{lang === 'ar' ? 'العودة' : 'Back'}</span><span className="hidden sm:inline">{lang === 'ar' ? ' للدليل' : ' to Sports'}</span>
          </button>

          <div className="h-4 w-px bg-white/15 hidden sm:block" />

          {/* Active Channel Pill */}
          <div className="flex items-center gap-2.5">
            <img
              src={channel.icon}
              alt={channel.name}
              className="h-7 w-auto max-w-[65px] object-contain drop-shadow"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm sm:text-base text-white tracking-wide truncate max-w-[130px] sm:max-w-none">
                  {lang === 'ar' ? channel.nameAr : channel.name}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-blood/20 border border-blood/40 px-2 py-0.5 text-[10px] font-bold text-blood-hot uppercase tracking-wider">
                  <span className="size-1.5 rounded-full bg-blood-hot animate-pulse" />
                  <span>LIVE</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Controls Action Group */}
        <div className="flex items-center gap-2">
          {/* Source Selector Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSourceMenu((v) => !v);
                setShowQualityMenu(false);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-bone hover:bg-white/10 active:scale-95 transition-all"
            >
              <Sliders className="size-3.5 text-blood-hot" />
              <span className="max-w-[120px] sm:max-w-[180px] truncate">
                {source?.label || (lang === 'ar' ? 'السيرفر' : 'Server')}
              </span>
            </button>

            {showSourceMenu && (
              <div className="absolute end-0 top-full mt-2 w-72 rounded-2xl border border-white/15 bg-crypt/95 backdrop-blur-2xl p-2.5 shadow-2xl z-40 animate-fade">
                <div className="px-3 py-1 text-[11px] font-bold text-dust uppercase tracking-wider">
                  {lang === 'ar' ? 'اختر سيرفر البث المباشر' : 'Select Stream Server'}
                </div>
                <div className="flex flex-col gap-1 mt-1">
                  {channel.streamSources.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setCurrentSourceIdx(idx);
                        setShowSourceMenu(false);
                      }}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-start transition-colors ${
                        idx === currentSourceIdx ? 'bg-blood/20 text-blood-hot font-bold' : 'text-bone hover:bg-white/5'
                      }`}
                    >
                      <span className="truncate max-w-[210px]">{s.label}</span>
                      {idx === currentSourceIdx && <Check className="size-3.5 text-blood-hot shrink-0" />}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    onClick={() => {
                      setShowSourceMenu(false);
                      setShowCustomModal(true);
                    }}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-blood-hot hover:bg-blood/10 transition-colors"
                  >
                    <span>+</span>
                    <span>{lang === 'ar' ? 'إدخال سيرفر بث مخصص' : 'Custom Stream URL'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Popout Player Window Button */}
          <button
            onClick={() => {
              if (source?.url) {
                window.open(source.url, '_blank', 'noopener,noreferrer');
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-bone hover:bg-white/10 active:scale-95 transition-all"
            title={lang === 'ar' ? 'فتح البث في نافذة مستقلة' : 'Popout Window'}
          >
            <ExternalLink className="size-3.5 text-blood-hot" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'نافذة مستقلة' : 'Popout'}</span>
          </button>

          {/* Reload Stream Button */}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-bone hover:bg-white/10 active:scale-95 transition-all"
            title={lang === 'ar' ? 'إعادة تحميل البث' : 'Reload Stream'}
          >
            <Spinner className="size-3.5 text-blood-hot" />
            <span className="hidden sm:inline">{lang === 'ar' ? 'تحديث' : 'Reload'}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Desktop 12-Col Grid / Mobile Stack ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        {/* Main Stage (16:9 Cinema Player + Metadata) */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-4">
          {/* 16:9 Player Container */}
          <div
            ref={playerWrapperRef}
            onMouseMove={handleUserActivity}
            onTouchStart={handleUserActivity}
            className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.9)] group"
          >
            {source?.type === 'hls' ? (
              <div className="relative size-full flex items-center justify-center bg-black">
                <video
                  ref={videoRef}
                  className="size-full object-contain cursor-pointer"
                  playsInline
                  autoPlay
                  onClick={togglePlay}
                  onPlay={() => {
                    setIsPlaying(true);
                    setIsBuffering(false);
                  }}
                  onPlaying={() => setIsBuffering(false)}
                  onWaiting={() => setIsBuffering(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {/* Buffering Overlay */}
                {isBuffering && !hasError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm gap-3 pointer-events-none z-20">
                    <Spinner className="size-10 text-blood-hot" />
                    <p className="text-xs sm:text-sm font-semibold text-bone">
                      {lang === 'ar' ? 'جاري الاتصال بالبث المباشر...' : 'Connecting to Live Stream...'}
                    </p>
                  </div>
                )}

                {/* Error / Offline Overlay */}
                {hasError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md gap-3 p-6 text-center z-30 animate-fade">
                    <p className="text-sm sm:text-base text-blood-hot font-bold">
                      {lang === 'ar' ? 'تعذر تشغيل هذا السيرفر حالياً' : 'Unable to play this stream server'}
                    </p>
                    <p className="text-xs text-dust max-w-sm">
                      {lang === 'ar'
                        ? 'قد يكون هذا السيرفر في وضع الصيانة. يرجى تجربة إعادة المحاولة أو الانتقال إلى سيرفر بديل.'
                        : 'Stream server might be undergoing maintenance. Try reconnecting or switch to another server.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                      <button
                        onClick={() => {
                          setHasError(false);
                          setRefreshKey((k) => k + 1);
                        }}
                        className="rounded-full bg-white/10 border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 active:scale-95 transition-all"
                      >
                        {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
                      </button>
                      <button
                        onClick={() => {
                          const next = (currentSourceIdx + 1) % channel.streamSources.length;
                          setCurrentSourceIdx(next);
                        }}
                        className="rounded-full bg-blood px-4 py-2 text-xs font-bold text-white hover:bg-blood-hot active:scale-95 transition-all shadow-md"
                      >
                        {lang === 'ar' ? 'التبديل إلى سيرفر بديل' : 'Switch Server'}
                      </button>
                      {source?.url && (
                        <button
                          onClick={() => window.open(source.url, '_blank', 'noopener,noreferrer')}
                          className="rounded-full bg-white/[0.05] border border-white/10 px-4 py-2 text-xs font-medium text-dust hover:text-bone hover:bg-white/10 transition-all"
                        >
                          {lang === 'ar' ? 'نافذة مستقلة' : 'Popout'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Big Center Play/Pause Overlay Indicator */}
                {!isPlaying && !isBuffering && !hasError && (
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 group-hover:scale-105 transition-transform"
                    aria-label="Play Stream"
                  >
                    <div className="size-16 sm:size-20 rounded-full bg-blood text-white flex items-center justify-center shadow-[0_0_30px_rgba(220,48,68,0.6)]">
                      <Play className="size-8 sm:size-10 translate-x-0.5" />
                    </div>
                  </button>
                )}

                {/* Custom Cinema Bottom Control Bar */}
                <div
                  className={`absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/75 to-transparent px-4 py-3 flex items-center justify-between gap-3 transition-opacity duration-300 ${
                    showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {/* Left / Start Controls */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={togglePlay}
                      className="p-1 text-bone hover:text-blood-hot transition-colors"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
                    </button>

                    {/* Volume Slider & Mute Toggle */}
                    <div className="flex items-center gap-2 group/vol">
                      <button
                        onClick={toggleMute}
                        className="p-1 text-bone hover:text-blood-hot transition-colors"
                        aria-label="Mute Toggle"
                      >
                        <Volume level={isMuted || volume === 0 ? 0 : volume < 0.5 ? 1 : 2} className="size-4" />
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-16 sm:w-20 accent-blood-hot h-1 bg-white/20 rounded-lg cursor-pointer"
                        aria-label="Volume"
                      />
                    </div>

                    {/* Live Broadcast Badge (NO SEEK SCRUBBER) */}
                    <div className="flex items-center gap-1.5 rounded-full bg-blood/20 border border-blood/40 px-2.5 py-0.5 text-[10px] font-bold text-blood-hot uppercase tracking-wider ms-2">
                      <span className="size-1.5 rounded-full bg-blood-hot animate-pulse" />
                      <span>{lang === 'ar' ? 'مباشر' : 'LIVE'}</span>
                    </div>
                  </div>

                  {/* Right / End Controls */}
                  <div className="flex items-center gap-2">
                    {/* Quality Selector */}
                    {levels.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowQualityMenu((v) => !v)}
                          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-bone transition-colors"
                        >
                          {currentLevel === -1 ? (lang === 'ar' ? 'تلقائي' : 'AUTO') : levels[currentLevel]?.name || 'HD'}
                        </button>

                        {showQualityMenu && (
                          <div className="absolute end-0 bottom-full mb-2 w-32 rounded-xl border border-white/15 bg-crypt/95 backdrop-blur-2xl p-1.5 shadow-2xl z-40 animate-fade">
                            <button
                              onClick={() => handleQualitySelect(-1)}
                              className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                                currentLevel === -1 ? 'bg-blood/20 text-blood-hot font-bold' : 'text-bone hover:bg-white/5'
                              }`}
                            >
                              <span>{lang === 'ar' ? 'تلقائي (Auto)' : 'Auto'}</span>
                              {currentLevel === -1 && <Check className="size-3 text-blood-hot" />}
                            </button>
                            {levels.map((lvl) => (
                              <button
                                key={lvl.id}
                                onClick={() => handleQualitySelect(lvl.id)}
                                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                                  currentLevel === lvl.id ? 'bg-blood/20 text-blood-hot font-bold' : 'text-bone hover:bg-white/5'
                                }`}
                              >
                                <span>{lvl.name}</span>
                                {currentLevel === lvl.id && <Check className="size-3 text-blood-hot" />}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Fullscreen Button */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-1 text-bone hover:text-blood-hot transition-colors"
                      aria-label="Fullscreen"
                    >
                      {isFullscreen ? <ExitFullscreen className="size-4" /> : <Fullscreen className="size-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="size-full flex items-center justify-center p-6 text-center">
                <p className="text-sm text-dust">
                  {lang === 'ar' ? 'لا يتوفر سيرفر تشغيل لهذه القناة الآن.' : 'No stream server available for this channel.'}
                </p>
              </div>
            )}
          </div>

          {/* Active Channel & Broadcast Metadata Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0c0e14] p-5 shadow-lg flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={channel.icon}
                  alt={channel.name}
                  className="h-12 w-auto max-w-[85px] object-contain drop-shadow"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div>
                  <h2 className="font-display font-black text-lg sm:text-xl text-white">
                    {lang === 'ar' ? channel.nameAr : channel.name}
                  </h2>
                  <p className="text-xs text-dust">{channel.leagueAr}</p>
                </div>
              </div>

              {/* Server Quality Indicator */}
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-1.5 text-xs text-dust">
                <Zap className="size-3.5 text-gilt" />
                <span>
                  {source?.type === 'hls'
                    ? (lang === 'ar' ? 'مشغل أصلي فائق النقاء • 1080p' : 'Native Nexus Stream • 1080p')
                    : (lang === 'ar' ? 'سيرفر احتياطي خارجي' : 'External Backup Server')}
                </span>
              </div>
            </div>

            {/* Quick Server Switcher Pills */}
            {channel.streamSources.length > 1 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-bone flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-blood-hot" />
                    <span>{lang === 'ar' ? 'سيرفرات البث المتوفرة للقناة (اضغط للتبديل الفوري):' : 'Available Stream Servers:'}</span>
                  </span>
                  <span className="text-[11px] text-dust hidden sm:inline">
                    {lang === 'ar' ? 'في حال تقطيع أي سيرفر، يمكنك التبديل بضغطة واحدة' : 'Switch servers instantly if any lag occurs'}
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {channel.streamSources.map((s, idx) => (
                    <button
                      key={s.id}
                      onClick={() => setCurrentSourceIdx(idx)}
                      className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold shrink-0 transition-all ${
                        idx === currentSourceIdx
                          ? 'bg-blood text-white shadow-md font-bold'
                          : 'border border-white/10 bg-white/[0.04] text-dust hover:text-bone hover:border-white/25 hover:bg-white/[0.08]'
                      }`}
                    >
                      {s.label.split(' - ')[1] || s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Currently Airing EPG Program details */}
            {channel.currentProgram ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gilt uppercase tracking-wider">
                      {lang === 'ar' ? 'يُعرض الآن:' : 'Now Airing:'}
                    </span>
                    <span className="font-display font-bold text-sm text-white">
                      {channel.currentProgram.title}
                    </span>
                  </div>
                  <span className="text-dust font-medium">
                    {channel.currentProgram.timeFormatted}
                  </span>
                </div>

                {/* Real Show Duration Progress Bar */}
                <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden my-1">
                  <div
                    className="bg-blood h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(5, channel.currentProgram.progressPercent)}%` }}
                  />
                </div>

                {channel.currentProgram.desc && (
                  <p className="text-xs text-dust/90 leading-relaxed line-clamp-2">
                    {channel.currentProgram.desc}
                  </p>
                )}

                {channel.nextProgram && (
                  <div className="text-[11px] text-dust pt-2 border-t border-white/[0.06] flex items-center gap-2">
                    <span className="font-semibold text-bone">
                      {lang === 'ar' ? 'التالي:' : 'Up Next:'}
                    </span>
                    <span className="truncate">{channel.nextProgram.title}</span>
                    <span className="text-white/40">•</span>
                    <span>{channel.nextProgram.timeFormatted}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-dust/80 italic">
                {lang === 'ar'
                  ? 'بث رياضي حي ومستمر على مدار الساعة بأعلى جودة.'
                  : 'Live 24/7 sports broadcast in high definition.'}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Stage (Channel Surfer & Live EPG Schedule) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
          <div className="rounded-2xl border border-white/[0.08] bg-crypt/90 p-4 flex flex-col h-[650px] shadow-lg">
            {/* Sidebar Tabs */}
            <div className="flex items-center gap-1 p-1 bg-white/[0.04] border border-white/[0.08] rounded-xl mb-3">
              <button
                onClick={() => setSidebarTab('channels')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'channels'
                    ? 'bg-blood text-white shadow-md font-bold'
                    : 'text-dust hover:text-bone hover:bg-white/[0.04]'
                }`}
              >
                <Tv className="size-3.5" />
                <span>{lang === 'ar' ? 'القنوات المباشرة' : 'Live Channels'}</span>
              </button>

              <button
                onClick={() => setSidebarTab('epg')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  sidebarTab === 'epg'
                    ? 'bg-blood text-white shadow-md font-bold'
                    : 'text-dust hover:text-bone hover:bg-white/[0.04]'
                }`}
              >
                <Calendar className="size-3.5" />
                <span>{lang === 'ar' ? 'جدول البث (EPG)' : 'Schedule'}</span>
              </button>
            </div>

            {/* TAB 1: Live Channels Surfer */}
            {sidebarTab === 'channels' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Category Filter Pills */}
                <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none mb-2 text-[11px]">
                  {[
                    { id: 'all', label: lang === 'ar' ? 'الكل' : 'All' },
                    { id: 'main', label: lang === 'ar' ? 'beIN الرئيسية' : 'Main' },
                    { id: 'afc', label: 'AFC' },
                    { id: 'news', label: lang === 'ar' ? 'الإخبارية' : 'News' },
                    { id: 'en_fr', label: 'EN / FR' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setChannelFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg font-semibold shrink-0 transition-colors ${
                        channelFilter === cat.id
                          ? 'bg-blood/20 text-blood-hot border border-blood/40'
                          : 'bg-white/[0.03] text-dust hover:bg-white/[0.08] border border-white/5'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Channel Search Input */}
                <div className="relative mb-2">
                  <Search className="absolute start-3 top-2.5 size-3.5 text-dust pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={lang === 'ar' ? 'ابحث عن قناة أو برنامج...' : 'Search channels...'}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] ps-9 pe-3 py-1.5 text-xs text-bone placeholder:text-dust/50 focus:border-blood/60 focus:outline-none"
                  />
                </div>

                {/* Channel List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pe-1 scrollbar-thin">
                  {filteredChannels.map((ch) => {
                    const active = ch.id === channel.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onSelectChannel(ch)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-start transition-all ${
                          active
                            ? 'border-blood/80 bg-blood/15 shadow-[0_0_15px_rgba(179,32,47,0.25)]'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={ch.icon}
                            alt={ch.name}
                            className="h-8 w-auto max-w-[55px] object-contain drop-shadow shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="min-w-0">
                            <span className="font-display font-bold text-xs text-white block truncate">
                              {lang === 'ar' ? ch.nameAr : ch.name}
                            </span>
                            {ch.currentProgram ? (
                              <span className="text-[10px] text-dust block truncate">
                                {ch.currentProgram.title}
                              </span>
                            ) : (
                              <span className="text-[10px] text-dust/70 block truncate">
                                {ch.leagueAr}
                              </span>
                            )}
                          </div>
                        </div>

                        {active && (
                          <span className="size-2 rounded-full bg-blood-hot animate-pulse shrink-0 ms-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: Channel EPG Schedule */}
            {sidebarTab === 'epg' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="text-xs font-bold text-bone mb-2">
                  {lang === 'ar'
                    ? `جدول برامج ${channel.nameAr} لليوم (بتوقيت القاهرة)`
                    : `Schedule for ${channel.name} (Cairo Time)`}
                </div>

                {channel.programs.length > 0 ? (
                  <div className="flex-1 overflow-y-auto space-y-2 pe-1 scrollbar-thin">
                    {channel.programs.map((prog) => {
                      return (
                        <div
                          key={prog.id}
                          className={`p-2.5 rounded-xl border text-xs transition-colors ${
                            prog.isLive
                              ? 'border-blood/60 bg-blood/10'
                              : 'border-white/[0.05] bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-bold text-[11px] text-dust">
                              {prog.timeFormatted}
                            </span>
                            {prog.isLive && (
                              <span className="rounded-full bg-blood/20 px-2 py-0.5 text-[9px] font-bold text-blood-hot uppercase">
                                {lang === 'ar' ? 'مباشر الآن' : 'LIVE'}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-bone leading-tight">
                            {prog.title}
                          </p>
                          {prog.desc && (
                            <p className="text-[10px] text-dust mt-1 line-clamp-1">
                              {prog.desc}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                    <p className="text-xs text-dust">
                      {lang === 'ar'
                        ? 'لا تتوفر تفاصيل جدول البرامج لهذه القناة حالياً.'
                        : 'No detailed schedule available for this channel right now.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Stream URL Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-coal p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-lg text-bone">
                {lang === 'ar' ? 'إضافة سيرفر مخصص' : 'Add Custom Stream'}
              </h3>
              <button
                onClick={() => setShowCustomModal(false)}
                className="rounded-full p-1.5 text-dust hover:text-bone hover:bg-white/10"
              >
                <Close className="size-5" />
              </button>
            </div>

            <p className="text-xs text-dust mb-4 leading-relaxed">
              {lang === 'ar'
                ? `يمكنك إدخال رابط بث خاص بقناة ${channel.nameAr} (سواء رابط M3U8 مباشر أو رابط تضمين Embed) وسيتم حفظه تلقائياً.`
                : `Enter a direct M3U8 or Embed player URL for ${channel.name}. It will be saved locally.`}
            </p>

            <form onSubmit={handleSaveCustomStream} className="flex flex-col gap-4">
              <input
                type="url"
                required
                placeholder="https://.../stream.m3u8 أو https://..."
                value={customInputUrl}
                onChange={(e) => setCustomInputUrl(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-bone placeholder:text-dust/50 focus:border-blood/60 focus:outline-none"
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="rounded-full px-4 py-2 text-xs font-medium text-dust hover:text-bone"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-blood px-5 py-2.5 text-xs font-bold text-white hover:bg-blood-hot active:scale-95 transition-all"
                >
                  {lang === 'ar' ? 'حفظ وتشغيل' : 'Save & Play'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
