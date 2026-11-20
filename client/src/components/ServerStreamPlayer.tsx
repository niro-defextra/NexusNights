import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { ArrowLeft, ExitFullscreen, Fullscreen, MessageCircle, Spinner, Users, Volume, X } from './Icons';
import { useI18n } from '../i18n';
import { ChatPanel } from '../room/ChatPanel';
import { useRoom } from '../room/RoomContext';
import { u } from '../api';
import { isDiscordEnvironment } from '../discord/DiscordSDK';

interface Props {
  hlsUrl: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
}

/**
 * Server Stream Player - Displays HLS stream from server-side Puppeteer capture
 * Used when embed sources don't support Player.js for full sync
 */
export function ServerStreamPlayer({ hlsUrl, title, subtitle, onBack }: Props) {
  const { t } = useI18n();
  const room = useRoom();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(!isDiscordEnvironment);
  const [fs, setFs] = useState(false);
  const [muted, setMuted] = useState(false);
  const hlsRef = useRef<Hls | null>(null);

  const isHost = room.isHost;

  const toggleFs = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setFs(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setFs(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const targetUrl = u(hlsUrl) || hlsUrl;
    console.log('[ServerStreamPlayer] Loading HLS stream:', targetUrl);

    let retries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => { xhr.withCredentials = false; },
        lowLatencyMode: true,
        backBufferLength: 3,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        maxBufferSize: 20 * 1000 * 1000,
        liveSyncDurationCount: 1, // Start immediately at latest chunk for minimum delay
        liveMaxLatencyDurationCount: 2, // Auto speed-up to stay in sync with live host
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 500,
      });

      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[ServerStreamPlayer] Manifest loaded, starting playback');
        setLoading(false);
        setError(null);
        video.play().catch((err) => {
          console.error('[ServerStreamPlayer] Autoplay failed:', err);
          setError('Click to play');
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('[ServerStreamPlayer] HLS error:', data);
        if (
          data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.MANIFEST_PARSING_ERROR ||
          data.type === Hls.ErrorTypes.NETWORK_ERROR
        ) {
          if (retries < 30) {
            retries++;
            setLoading(true);
            setError(null);
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
              if (hlsRef.current) {
                hlsRef.current.loadSource(targetUrl);
              }
            }, 1200);
            return;
          }
        }
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError('Network error - retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError('Media error - recovering...');
              hls.recoverMediaError();
              break;
            default:
              setError('Fatal error - stream unavailable');
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(targetUrl);
      hls.attachMedia(video);

      return () => {
        if (retryTimer) clearTimeout(retryTimer);
        console.log('[ServerStreamPlayer] Cleanup');
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = targetUrl;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        setError(null);
        video.play().catch(() => setError('Click to play'));
      });
      video.addEventListener('error', () => {
        setError('Failed to load stream');
      });
    } else {
      setError('HLS not supported in this browser');
    }
  }, [hlsUrl]);

  const handleVideoClick = () => {
    if (error === 'Click to play') {
      videoRef.current?.play();
      setError(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink flex">
      {/* Chat Panel - Left Side (hidden in Discord Activity) */}
      {showChat && !isDiscordEnvironment && (
        <div className="w-80 border-r border-white/10 flex flex-col bg-crypt shrink-0">
          {/* Chat Header */}
          <div className="h-14 border-b border-white/10 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="size-5 text-gilt" />
              <span className="font-semibold text-bone">{t('chat')}</span>
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-dust hover:text-bone transition"
              aria-label="Close chat"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel onClose={() => setShowChat(false)} />
          </div>

          {/* Room Info */}
          <div className="border-t border-white/10 p-3 bg-ash/50">
            <div className="flex items-center gap-2 text-sm text-dust">
              <Users className="size-4" />
              <span>{room.room?.members.length || 0} {t('watching')}</span>
            </div>
            {isHost && (
              <div className="mt-2 text-xs text-gilt">
                ⚡ {t('youAreHost')} - Server Streaming
              </div>
            )}
            <div className="mt-2 text-xs text-dust">
              🎥 Puppeteer + FFmpeg Stream
            </div>
          </div>
        </div>
      )}

      {/* Player Area - Right Side */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Top Bar */}
        <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-crypt/95 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onBack}
              className="text-dust hover:text-bone transition shrink-0"
              aria-label="Back"
            >
              ←
            </button>
            <div className="min-w-0">
              <h1 className="text-bone font-semibold truncate">{title}</h1>
              {subtitle && <p className="text-sm text-dust truncate">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Room members badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-dust">
              <Users className="size-3.5 text-gilt" />
              <span>{room.room?.members.length || 0}</span>
              {isHost && <span className="text-gilt font-medium">({t('youAreHost')})</span>}
            </div>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !videoRef.current.muted;
                  setMuted(videoRef.current.muted);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-dust transition hover:border-gilt/40 hover:text-bone"
              title={muted ? 'إلغاء الكتم' : 'كتم الصوت'}
            >
              <Volume level={muted ? 0 : 2} className="size-4" />
            </button>

            <button
              onClick={toggleFs}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-dust transition hover:border-gilt/40 hover:text-bone"
              title={fs ? 'خروج من الشاشة الكاملة' : 'شاشة كاملة'}
            >
              {fs ? <ExitFullscreen className="size-4" /> : <Fullscreen className="size-4" />}
            </button>

            {!isDiscordEnvironment && !showChat && (
              <button
                onClick={() => setShowChat(true)}
                className="flex items-center gap-2 rounded-lg border border-gilt/30 bg-gilt/10 px-3 py-1.5 text-sm text-gilt transition hover:border-gilt hover:bg-gilt/20"
              >
                <MessageCircle className="size-4" />
                <span>{t('showChat')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Container */}
        <div
          ref={containerRef}
          onDoubleClick={toggleFs}
          className="flex-1 flex items-center justify-center bg-black relative select-none"
        >
          <video
            ref={videoRef}
            className="w-full h-full object-contain"
            onClick={handleVideoClick}
            playsInline
            muted={muted}
          />

          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
              <Spinner className="size-12 text-gilt" />
              <p className="mt-4 text-sm text-dust">جاري استقبال بث المضيف...</p>
              <p className="mt-1 text-xs text-dust/60">تجهيز مشغل البث المباشر</p>
            </div>
          )}

          {/* Error Overlay */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90">
              <div className="text-blood text-lg mb-2">⚠️</div>
              <p className="text-sm text-bone">{error}</p>
              {error === 'Click to play' && (
                <button
                  onClick={handleVideoClick}
                  className="mt-4 rounded-lg bg-blood px-6 py-2 text-sm font-semibold text-white transition hover:bg-blood-hot"
                >
                  {t('play')}
                </button>
              )}
            </div>
          )}

          {/* Host Badge */}
          {isHost && !loading && !error && (
            <div className="absolute top-4 right-4 rounded-lg border border-gilt/30 bg-gilt/10 px-3 py-1.5 text-xs text-gilt backdrop-blur">
              ⚡ Server Stream Active
            </div>
          )}

          {/* Viewer Notice */}
          {!isHost && !loading && !error && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-dust/30 bg-crypt/90 px-4 py-2 text-sm text-dust backdrop-blur">
              Host controls playback via server
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
