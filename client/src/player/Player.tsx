import Hls from 'hls.js';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, u } from '../api';
import type { EpisodeDetail, PlaybackErrorCode, PlaybackConfigPublic, PlaybackSourcePublic, AniSkipTimingsPublic } from '../api-types';
import { ArrowLeft, AudioTracks, ExitFullscreen, Fullscreen, Gauge, Lock, Next, Pause, Pip, Play, Skip, Sliders, Spinner, Subtitles, Volume } from '../components/Icons';
import { clamp, fmtTime } from '../format';
import { useI18n } from '../i18n';
import { ControlButton, Menu } from './Menu';
import { SeekBar, type SeekMarker } from './SeekBar';
import { SubtitleOverlay } from './Subtitles';
import { parseVtt, type Cue } from './vtt';
import { SubtitleSearchModal } from '../components/SubtitleSearchModal';
import { useToast, ToastContainer } from '../components/Toast';
import { screenManager } from '../native/screen';
import { registerBackHandler } from '../native/back-button';

/** Imperative API — Stage 3 drives the player from the server through this (no echo loops:
 *  handle calls never fire the onUser* callbacks, only real user input does). */
export interface PlayerHandle {
  play(): Promise<void>;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  isPlaying(): boolean;
  setRate(r: number): void;
  getRate(): number;
  setAudioTrack(index: number): void;
  setSubtitle(id: string | null): void;
}

interface Props {
  media: EpisodeDetail;
  streamingConfig?: PlaybackConfigPublic | null;
  streamingLoading?: boolean;
  streamingError?: string | null;
  skipTimings?: AniSkipTimingsPublic | null;
  title: string;
  subtitle?: string;
  startAt?: number;
  autoPlay?: boolean;
  /** true → user input only fires onUser* callbacks; the parent applies state via the handle. */
  controlled?: boolean;
  canControl?: boolean;
  onDisabledControlClick?: () => void;
  theatreMode?: boolean;
  hasNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onEnded?: () => void;
  onProgress?: (t: number, d: number) => void;
  onUserPlay?: (t: number) => void;
  onUserPause?: (t: number) => void;
  onUserSeek?: (t: number) => void;
  onSubtitleChange?: (subId: string | null) => void;
  onAudioChange?: (trackIdx: number) => void;
  onSpeedChange?: (rate: number) => void;
  /** Room mode: what the room *says* is happening (so a click during a "hold" sends the right intent). */
  intentPlaying?: boolean;
  /** Called once the media is loaded and can start. */
  onReady?: () => void;
  /** Loading (first start) or stalling (network) — the room waits for everybody. */
  onBuffering?: (kind: 'load' | 'stall', value: boolean) => void;
  /** "Waiting for Alice…" pill shown while the room is on hold. */
  holdLabel?: string | null;
  hideSpeed?: boolean;
  /** Rendered inside the player root so it also shows in fullscreen (chat, reactions, toasts). */
  overlay?: ReactNode;
  /** Extra buttons in the control bar (chat, reactions, people). */
  extraControls?: ReactNode;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const num = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
const str = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const sleep = (ms: number, s: AbortSignal) => new Promise<void>((res) => { const t = setTimeout(res, ms); s.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

export const Player = forwardRef<PlayerHandle, Props>(function Player(props, ref) {
  const { media, title, subtitle, startAt = 0, autoPlay = true, controlled = false, canControl = true, onDisabledControlClick, theatreMode = false, hasNext, onBack, onNext, onEnded, onProgress, onUserPlay, onUserPause, onUserSeek, onSubtitleChange, onAudioChange, onSpeedChange, intentPlaying, onReady, onBuffering, holdLabel, hideSpeed, overlay, extraControls } = props;
  const { streamingConfig, streamingLoading, streamingError, skipTimings } = props;
  const { t, lang } = useI18n();

  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const live = useRef(false); // HLS playlist still growing (transcode in progress)
  const startRef = useRef(startAt);
  const cb = useRef({ onProgress, onEnded, onNext, onReady, onBuffering });
  cb.current = { onProgress, onEnded, onNext, onReady, onBuffering };

  // ── streaming failover state ──────────────────────────────────────────────
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [failoverMessage, setFailoverMessage] = useState<string | null>(null);
  const attemptedSources = useRef(new Set<string>());

  const allSources = useMemo(() => {
    if (!streamingConfig) return [];
    return [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
  }, [streamingConfig]);
  const currentSource = allSources[currentSourceIndex] || streamingConfig?.source || null;

  useEffect(() => {
    setCurrentSourceIndex(0);
    attemptedSources.current.clear();
  }, [media.id]);

  const [phase, setPhase] = useState<'preparing' | 'loading' | 'ready' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<PlaybackErrorCode>('playback_failed');
  const [prep, setPrep] = useState(0);
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(startAt);
  const [duration, setDuration] = useState(media.runtimeSec ?? 0);
  const [bufEnd, setBufEnd] = useState(0);
  const [volume, setVolume] = useState(() => clamp(num('umbra:vol', 1), 0, 1));
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0); // index of current playback source
  const [uiVisible, setUiVisible] = useState(true);
  const [menu, setMenu] = useState<null | 'subs' | 'audio' | 'speed' | 'quality' | 'source'>(null);
  const [fs, setFs] = useState(false);
  const [subId, setSubId] = useState<string | null>(null);
  const [subOffset, setSubOffset] = useState(0);
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [audioIdx, setAudioIdx] = useState(0);
  const [availableAudioTracks, setAvailableAudioTracks] = useState<Array<{ id: number; label: string; lang?: string; channels?: number }>>([]);
  const [availableLevels, setAvailableLevels] = useState<Array<{ id: number; label: string; height?: number }>>([]);
  const [currentLevelIdx, setCurrentLevelIdx] = useState<number>(-1); // -1 = Auto
  const [flash, setFlash] = useState<{ kind: 'play' | 'pause' | 'back' | 'fwd'; n: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  countdownRef.current = countdown;
  const dismissedCountdown = useRef(false);
  const [seekRipple, setSeekRipple] = useState<{ dir: 'fwd' | 'back'; seconds: number } | null>(null);
  const seekRippleTimer = useRef<number>(0);
  const activeSkipRef = useRef<SeekMarker | null>(null);
  const [showExternalSubModal, setShowExternalSubModal] = useState(false);
  const [externalSubtitles, setExternalSubtitles] = useState<Array<{ id: string; label: string; url: string }>>([]);
  const { toasts, showToast, removeToast } = useToast();

  // ── Picture-in-Picture State & Handlers ────────────────────────────────────
  const [isPip, setIsPip] = useState(false);
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && !!document.pictureInPictureEnabled;

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPip(false);
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
        setIsPip(true);
      }
    } catch (err) {
      console.warn('[Player] PiP toggle error:', err);
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);
    v.addEventListener('enterpictureinpicture', onEnterPip);
    v.addEventListener('leavepictureinpicture', onLeavePip);
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnterPip);
      v.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, []);

  const hideTimer = useRef<number>();
  const clickTimer = useRef<number>();
  const pointerType = useRef('mouse');
  const cueCache = useRef(new Map<string, Cue[]>());
  const flashN = useRef(0);

  // ── helpers ────────────────────────────────────────────────────────────────
  const effDuration = useCallback(() => {
    const v = videoRef.current;
    const apiD = media.runtimeSec ?? 0;
    if (!v) return apiD;
    const vd = v.duration;
    if (live.current || !Number.isFinite(vd) || vd <= 0) return apiD || (Number.isFinite(vd) ? vd : 0);
    return vd;
  }, [media.runtimeSec]);

  const maxSeek = useCallback(() => {
    const v = videoRef.current!;
    return live.current && v.seekable.length ? v.seekable.end(v.seekable.length - 1) : effDuration();
  }, [effDuration]);

  const doFlash = (kind: 'play' | 'pause' | 'back' | 'fwd') => setFlash({ kind, n: ++flashN.current });

  const syncBuffered = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    let end = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 0.3 && v.buffered.end(i) >= v.currentTime) end = v.buffered.end(i);
    setBufEnd(end);
  }, []);

  // ── source setup (local direct/HLS or streaming) ───────────────────────────
  useEffect(() => {
    const v = videoRef.current!;
    const ac = new AbortController();
    let hls: Hls | null = null;
    let dead = false;
    live.current = false;
    setPhase('loading');
    setErrorCode('playback_failed');
    setPrep(0);
    setDuration(media.runtimeSec ?? 0);
    setFailoverMessage(null);

    const fail = (code: PlaybackErrorCode = 'playback_failed', canFailover = false) => {
      if (dead) return;
      
      // Try automatic failover for streaming sources
      if (canFailover && streamingConfig) {
        const allSources = [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
        const tried = attemptedSources.current;
        
        // Prioritize an untried source from a different provider first
        const curSource = allSources[currentSourceIndex];
        const currentProvider = curSource?.provider;
        
        let nextSource = allSources.find(alt => !tried.has(alt.url) && alt.provider !== currentProvider);
        if (!nextSource) {
          nextSource = allSources.find(alt => !tried.has(alt.url));
        }
        
        if (nextSource) {
          tried.add(nextSource.url);
          const nextIdx = allSources.indexOf(nextSource);
          setFailoverMessage(t('fallbackPreparing'));
          setCurrentSourceIndex(nextIdx >= 0 ? nextIdx : currentSourceIndex + 1);
          setRetry(prev => prev + 1);
          return;
        }
      }
      
      setErrorCode(code);
      setPhase('error');
    };

    const begin = () => {
      if (dead) return;
      setPhase('ready');
      setFailoverMessage(null);
      cb.current.onReady?.();
      if (autoPlay) v.play().catch(() => { /* autoplay blocked → user presses play */ });
    };

    (async () => {
      // LOCAL PLAYBACK: direct file
      if (media.playback?.mode === 'direct') {
        v.src = u(`/api/stream/${media.id}`);
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        return;
      }

      // LOCAL PLAYBACK: HLS transcode
      if (media.playback) {
        setPhase('preparing');
        for (;;) {
          const s = await api.hlsStatus(media.id, ac.signal);
          if (dead) return;
          setPrep(s.progress);
          if (s.state === 'error') return fail(s.error ?? 'ffmpeg_failed');
          if (s.canStart) break;
          await sleep(900, ac.signal);
          if (dead) return;
        }
        setPhase('loading');
        const url = u(`/api/hls/${media.id}/master.m3u8`);

        if (Hls.isSupported()) {
          hls = new Hls({
            startPosition: startRef.current,
            maxBufferLength: 40,
            backBufferLength: 90,
            enableWorker: true,
            xhrSetup: (xhr) => { xhr.withCredentials = false; },
          });
          hlsRef.current = hls;
          let net = 0, mediaErr = 0;
          const syncLocalHlsTracks = () => {
            if (!hls) return;
            if (hls.audioTracks && hls.audioTracks.length > 0) {
              const tracks = hls.audioTracks.map((t: any, idx: number) => ({
                id: idx,
                label: t.name || t.lang || `Track ${idx + 1}`,
                lang: t.lang,
                channels: t.channels,
              }));
              setAvailableAudioTracks(tracks);
            }
            if (hls.levels && hls.levels.length > 1) {
              const lvls = hls.levels.map((lvl: any, idx: number) => ({
                id: idx,
                height: lvl.height,
                label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
              }));
              setAvailableLevels(lvls);
            }
          };

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            syncLocalHlsTracks();
            const wanted = str('umbra:audiolang');
            const idx = media.audioTracks.findIndex((a) => a.lang && a.lang === wanted);
            const pick = idx >= 0 ? idx : Math.max(0, media.audioTracks.findIndex((a) => a.default));
            if (hls && hls.audioTracks.length > 1) hls.audioTrack = pick;
            setAudioIdx(pick);
            begin();
          });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
            syncLocalHlsTracks();
          });
          hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => {
            live.current = !!d.details.live;
            setDuration(effDuration());
          });
          hls.on(Hls.Events.ERROR, (_e, d) => {
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 4) hls?.startLoad();
            else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErr++ < 3) hls?.recoverMediaError();
            else fail('playback_failed', false); // Local playback doesn't have alternatives
          });
          hls.loadSource(url);
          hls.attachMedia(v);
        } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
          v.src = url;
          v.addEventListener('loadedmetadata', () => { if (startRef.current > 0) v.currentTime = startRef.current; begin(); }, { once: true });
        } else return fail();
        return;
      }

      // STREAMING PLAYBACK: wait for streaming config
      if (streamingLoading) {
        setPhase('preparing');
        setPrep(0.3);
        return; // Wait for next effect when streamingConfig arrives
      }

      if (streamingError) {
        return fail('media_not_ready');
      }

      if (!streamingConfig || !streamingConfig.source) {
        return fail(media.playbackError ?? 'media_not_ready');
      }

      // Get current streaming source
      const allSources = [streamingConfig.source, ...streamingConfig.alternatives];
      const source = allSources[currentSourceIndex] || streamingConfig.source;
      if (!source) return fail('media_not_ready');

      // Mark this source as attempted
      attemptedSources.current.add(source.url);

      setPhase('loading');
      let url = u(source.url) || source.url;

      // On-demand native sniffer resolution
      if (url.includes('/api/streaming/resolve-native')) {
        setPhase('preparing');
        setPrep(0.4);
        setFailoverMessage(lang === 'ar' ? `جاري الاتصال بسيرفر ${source.provider}...` : `Connecting to ${source.provider}...`);
        try {
          const res = await fetch('/api/streaming/resolve-native', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tmdbId: media.tmdbId,
              kind: media.kind,
              season: media.season,
              episode: media.episode,
              provider: source.provider,
            }),
            signal: ac.signal,
          });
          if (dead) return;
          const data = await res.json();
          if (!data.ok || !data.streamUrl) {
            throw new Error(data.message || 'Sniffer resolution failed');
          }
          url = u(data.streamUrl) || data.streamUrl;
          setPhase('loading');
          setFailoverMessage(null);
        } catch (err: any) {
          if (dead) return;
          console.warn('[Player] On-demand sniffer failed, failing over:', err.message);
          return fail('playback_failed', true);
        }
      }

      // STREAMING: HLS source
      if ((source.type === 'hls' || url.includes('.m3u8')) && Hls.isSupported()) {
        hls = new Hls({
          startPosition: startRef.current,
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,          // seconds ahead to buffer
          maxMaxBufferLength: 60,        // absolute max buffer
          backBufferLength: 20,          // seconds behind to keep
          maxBufferHole: 0.8,            // tolerate gaps up to 0.8s without stalling
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.15,            // jump 150ms forward when stuck in a gap
          nudgeMaxRetry: 10,            // retry up to 10 times to jump past timestamp gaps
          maxFragLookUpTolerance: 0.3,
          fragLoadingTimeOut: 25000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          fragLoadingMaxRetryTimeout: 64000,
          levelLoadingTimeOut: 15000,
          levelLoadingMaxRetry: 4,
          abrEwmaDefaultEstimate: 800000,
          abrBandWidthFactor: 0.8,
          abrBandWidthUpFactor: 0.7,
          xhrSetup: (xhr) => { xhr.withCredentials = false; },
        });
        hlsRef.current = hls;
        let net = 0, mediaErr = 0, fragParseFails = 0, fragLoadFails = 0, stallCount = 0;
        
        const syncStreamingHlsTracks = () => {
          if (!hls) return;
          if (hls.audioTracks && hls.audioTracks.length > 0) {
            const tracks = hls.audioTracks.map((t: any, idx: number) => ({
              id: idx,
              label: t.name || t.lang || `Track ${idx + 1}`,
              lang: t.lang,
              channels: t.channels,
            }));
            setAvailableAudioTracks(tracks);

            const wanted = str('umbra:audiolang');
            const enIdx = tracks.findIndex((t) => 
              t.lang?.toLowerCase().startsWith('en') || 
              /english|ingil|orijinal/i.test(t.label)
            );
            const arIdx = tracks.findIndex((t) => 
              t.lang?.toLowerCase().startsWith('ar') || 
              /arabic|عربي/i.test(t.label)
            );

            let pick = -1;
            if (wanted && wanted !== 'tr') {
              pick = tracks.findIndex((t) => t.lang?.toLowerCase() === wanted.toLowerCase());
            }
            // Always default to English if available, then Arabic
            if (pick === -1) {
              if (enIdx >= 0) pick = enIdx;
              else if (arIdx >= 0) pick = arIdx;
              else {
                const defIdx = hls.audioTracks.findIndex((t: any) => t.default);
                pick = defIdx >= 0 ? defIdx : 0;
              }
            }
            if (hls.audioTracks.length > 0) {
              hls.audioTrack = pick;
            }
            setAudioIdx(pick);
          }

          if (hls.levels && hls.levels.length > 1) {
            const lvls = hls.levels.map((lvl: any, idx: number) => ({
              id: idx,
              height: lvl.height,
              label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            }));
            setAvailableLevels(lvls);
          }
        };

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          syncStreamingHlsTracks();
          
          // Report success to backend
          api.reportPlaybackSuccess({
            provider: source.provider,
            sourceUrl: source.url,
          }).catch(() => {}); // Silent fail on reporting
          
          begin();
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          syncStreamingHlsTracks();
        });
        
        hls.on(Hls.Events.LEVEL_LOADED, (_e, d) => {
          live.current = !!d.details.live;
          setDuration(effDuration());
        });
        
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          fragParseFails = 0;
          fragLoadFails = 0;
          stallCount = 0;
        });
        v.addEventListener('seeking', () => {
          fragLoadFails = 0;
          stallCount = 0;
        }, { signal: ac.signal });
        v.addEventListener('timeupdate', () => {
          if (!v.paused && v.readyState >= 3) {
            stallCount = 0;
          }
        }, { signal: ac.signal });

        hls.on(Hls.Events.ERROR, (_e, d) => {
          console.error('[Player] HLS error:', {
            type: d.type,
            details: d.details,
            fatal: d.fatal,
            networkRetries: net,
            mediaRetries: mediaErr,
            response: d.response?.code,
            fragUrl: d.frag?.url,
            reason: d.reason
          });

          // Proactively handle buffer stalls (e.g. bufferStalledError / bufferSeekOverHole)
          // instead of ignoring non-fatal stalls and letting the player sit frozen
          if (d.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || d.details === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE) {
            stallCount++;
            console.warn(`[Player] Buffer stall detected (${stallCount}/5) at ${v.currentTime.toFixed(2)}s`);

            // 1. Check for a micro buffer hole ahead and jump past it if < 1.5s
            try {
              if (v.buffered && v.buffered.length > 0) {
                const cur = v.currentTime;
                for (let i = 0; i < v.buffered.length; i++) {
                  const start = v.buffered.start(i);
                  if (start > cur && (start - cur) <= 1.5) {
                    console.log(`[Player] Buffer hole detected (${(start - cur).toFixed(2)}s). Nudging currentTime from ${cur.toFixed(2)} to ${(start + 0.05).toFixed(2)}`);
                    v.currentTime = start + 0.05;
                    break;
                  }
                }
              }
            } catch (err) {
              console.warn('[Player] Buffer inspection error:', err);
            }

            // 2. Wake up fragment loading immediately
            try {
              hls?.startLoad();
            } catch (e) {}

            // 3. If stalled repeatedly (2+ times), downshift quality level to alleviate bandwidth pressure
            if (stallCount >= 2 && hls) {
              if (hls.currentLevel > 0) {
                console.log(`[Player] Repeated stalls, downshifting quality from level ${hls.currentLevel} to ${hls.currentLevel - 1}`);
                hls.currentLevel = hls.currentLevel - 1;
              } else if (hls.autoLevelEnabled && hls.nextLevel > 0) {
                hls.currentLevel = Math.max(0, hls.nextLevel - 1);
              }
            }

            // 4. If stalled persistently (5+ times without making progress), failover to alternative provider
            if (stallCount >= 5) {
              console.warn('[Player] Persistent buffer stalls reached threshold (5), failing over to alternative provider');
              api.reportPlaybackFailure({
                provider: source.provider,
                sourceUrl: source.url,
                failureType: 'http_timeout',
                responseStatus: 0,
                errorDetails: 'persistent_buffer_stalled',
              }).catch(() => {});
              fail('playback_failed', true);
            }
            return;
          }

          // fragLoadError is non-fatal by default in hls.js, but 403 Forbidden or repeated failures
          // mean the stream segments are blocked or invalid. Fail over to an alternative source.
          if (d.details === Hls.ErrorDetails.FRAG_LOAD_ERROR) {
            const status = d.response?.code || (d.context as any)?.xhr?.status;
            // Status 0 represents aborted requests (e.g. when user seeks and previous segment fetch is cancelled).
            // Do NOT count aborted requests as failures!
            if (status === 0) {
              return;
            }
            if (status === 403 || ++fragLoadFails >= 5) {
              console.log(`[Player] Fragment load failed (status: ${status}, count: ${fragLoadFails}), failing over`);
              api.reportPlaybackFailure({
                provider: source.provider,
                sourceUrl: source.url,
                failureType: status === 403 ? 'http_403_forbidden' : 'http_timeout',
                responseStatus: status || 0,
                errorDetails: `${d.details} - fragLoadError`,
              }).catch(() => {});
              fail('playback_failed', true);
              return;
            }
          }

          // fragParsingError is flagged non-fatal by hls.js, but it means the segment
          // bytes are unusable. After a few in a row, give up on this source and fail over.
          if (d.details === Hls.ErrorDetails.FRAG_PARSING_ERROR && ++fragParseFails >= 3) {
            console.log('[Player] Repeated fragParsingError, failing over to alternative source');
            fail('playback_failed', true);
            return;
          }
          
          // Report network errors to backend
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && d.response?.code) {
            let failureType: 'cloudflare_challenge' | 'http_403_forbidden' | 'http_404_not_found' | 'http_timeout' = 'http_timeout';
            
            if (d.response.code === 403) {
              const responseText = d.response.text || '';
              if (responseText.includes('Cloudflare') || responseText.includes('cf-ray')) {
                failureType = 'cloudflare_challenge';
              } else {
                failureType = 'http_403_forbidden';
              }
            } else if (d.response.code === 404) {
              failureType = 'http_404_not_found';
            }
            
            api.reportPlaybackFailure({
              provider: source.provider,
              sourceUrl: source.url,
              failureType,
              responseStatus: d.response.code,
              errorDetails: `${d.details} - ${d.fatal ? 'fatal' : 'recoverable'}`,
            }).catch(() => {});
          }
          
          // Report media errors ONLY when fatal (don't falsely report non-fatal buffer stalls as invalid_manifest)
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR && d.fatal) {
            console.log('[Player] Reporting fatal media error:', d.details);
            api.reportPlaybackFailure({
              provider: source.provider,
              sourceUrl: source.url,
              failureType: 'invalid_manifest',
              responseStatus: 0,
              errorDetails: `${d.details} - fatal`,
            }).catch(() => {});
          }
          
          // Don't proceed with recovery if not fatal
          if (!d.fatal) {
            console.log('[Player] Non-fatal error, ignoring for now');
            return;
          }
          
          // For streaming sources, be more aggressive with failover
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 2) {
            console.log('[Player] Network error, retrying... (attempt', net, 'of 2)');
            hls?.startLoad();
          } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaErr++ < 1) {
            console.log('[Player] Media error, recovering... (attempt', mediaErr, 'of 1)');
            hls?.recoverMediaError();
          } else {
            console.log('[Player] Fatal error limit reached, attempting failover to alternative source');
            fail('playback_failed', true);
          }
        });
        
        hls.loadSource(url);
        hls.attachMedia(v);
      }
      // STREAMING: Native HLS (Safari)
      else if (source.type === 'hls' && v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = url;
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        v.addEventListener('error', () => fail('playback_failed', true), { once: true });
      }
      // STREAMING: Direct MP4
      else if (source.type === 'mp4') {
        v.src = url;
        v.addEventListener('loadedmetadata', () => {
          if (startRef.current > 0) v.currentTime = startRef.current;
          begin();
        }, { once: true });
        v.addEventListener('error', () => fail('playback_failed', true), { once: true });
      }
      else {
        return fail('playback_failed', true);
      }
    })().catch(() => fail('playback_failed', true));

    return () => {
      dead = true;
      ac.abort();
      hls?.destroy();
      hlsRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [media.id, media.playback, media.audioTracks, media.runtimeSec, autoPlay, retry, effDuration, streamingConfig, streamingLoading, streamingError, currentSourceIndex, t]);

  // ── <video> events ─────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current!;
    const on = <K extends keyof HTMLMediaElementEventMap>(n: K, f: () => void) => { v.addEventListener(n, f); return () => v.removeEventListener(n, f); };
    const offs = [
      on('timeupdate', () => {
        setTime(v.currentTime);
        syncBuffered();
        // Netflix-style outro auto-detection: when entering outro segment or last 20 seconds of episode
        if (hasNext && !dismissedCountdown.current && countdownRef.current === null) {
          const d = effDuration();
          const rem = d - v.currentTime;
          const isOutro = activeSkipRef.current?.kind === 'outro';
          if ((isOutro || (rem <= 20 && rem > 0 && d > 60))) {
            setCountdown(5);
          }
        }
      }),
      on('progress', syncBuffered),
      on('play', () => setPlaying(true)),
      on('pause', () => { setPlaying(false); cb.current.onProgress?.(v.currentTime, effDuration()); }),
      on('waiting', () => setBuffering(true)),
      on('playing', () => { setBuffering(false); setPlaying(true); }),
      on('canplay', () => setBuffering(false)),
      on('seeked', () => { setBuffering(false); setTime(v.currentTime); }),
      on('volumechange', () => { setVolume(v.volume); setMuted(v.muted); }),
      on('ratechange', () => setRate(v.playbackRate)),
      on('durationchange', () => setDuration(effDuration())),
      on('error', () => { if (v.getAttribute('src')) setPhase('error'); }),
      on('ended', () => {
        setPlaying(false);
        cb.current.onProgress?.(effDuration(), effDuration());
        cb.current.onEnded?.();
        if (hasNext && !dismissedCountdown.current && countdownRef.current === null) {
          setCountdown(5);
        }
      }),
    ];
    v.volume = volume;
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.id, hasNext]);

  // reset countdown state on new episode
  useEffect(() => {
    dismissedCountdown.current = false;
    setCountdown(null);
  }, [media.id]);

  // periodic progress save
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      if (v && !v.paused) cb.current.onProgress?.(v.currentTime, effDuration());
    }, 5000);
    return () => {
      clearInterval(id);
      const v = videoRef.current;
      if (v && v.currentTime > 0) cb.current.onProgress?.(v.currentTime, effDuration());
    };
  }, [media.id, effDuration]);

  // next-episode countdown (5 seconds, auto-advances if not cancelled)
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      cb.current.onNext();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  // ── subtitles (merge local + streaming + external) ───────────────────────────────────
  const allSubtitles = useMemo(() => {
    const local = media.subtitles;
    
    // Streaming subtitles
    const streaming = streamingConfig?.subtitles?.map((sub, i) => ({
      id: `stream-${i}`,
      lang: sub.language,
      label: sub.label || sub.language,
      source: 'external' as const,
      forced: false,
      url: sub.url,
    })) || [];
    
    // External OpenSubtitles
    const external = externalSubtitles.map(sub => ({
      id: sub.id,
      lang: sub.id.split('-')[1] || 'en',
      label: sub.label,
      source: 'external' as const,
      forced: false,
      url: sub.url,
    }));
    
    return [...local, ...streaming, ...external];
  }, [media.subtitles, streamingConfig, externalSubtitles]);

  const selectSubtitle = useCallback(async (id: string | null) => {
    setSubId(id);
    setMenu(null);
    onSubtitleChange?.(id);
    const tr = allSubtitles.find((s: any) => s.id === id);
    put('umbra:sublang', tr?.lang ?? (id ? '' : 'off'));
    if (!tr) return setCues(null);
    
    // Check cache first
    const hit = cueCache.current.get(tr.url);
    if (hit) return setCues(hit);
    
    try {
      // For blob URLs or internal APIs, fetch directly; for remote URLs route through our CORS & encoding proxy
      const fetchUrl = tr.url.startsWith('blob:')
        ? tr.url
        : (tr.url.startsWith('/api/') ? u(tr.url) : u(`/api/subtitles/proxy?url=${encodeURIComponent(tr.url)}`));
      const r = await fetch(fetchUrl);
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      
      // Parse VTT (blob URLs are already VTT format, proxy converts SRT to VTT)
      const parsed = parseVtt(text);
      cueCache.current.set(tr.url, parsed);
      setCues(parsed);
    } catch (err) {
      console.error('[Player] Subtitle load failed:', err);
      setCues(null);
    }
  }, [allSubtitles]);

  // ── External Subtitles Logic ──────────────────────────────────────────────
  const handleExternalSubtitleSelect = useCallback(async (fileId: string, language: string, languageName: string) => {
    setShowExternalSubModal(false);
    
    try {
      console.log('[Player] Loading external subtitle:', { fileId, language, languageName });
      
      // Get download link
      const downloadInfo = await api.getSubtitleDownloadLink(fileId);
      console.log('[Player] Download info received:', downloadInfo);
      
      // Fetch the content through our proxy to avoid CORS and decode properly
      const fetchUrl = downloadInfo.link.startsWith('http')
        ? u(`/api/subtitles/proxy?url=${encodeURIComponent(downloadInfo.link)}`)
        : u(downloadInfo.link);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }
      
      const vttContent = await response.text();
      const parsed = parseVtt(vttContent);
      console.log('[Player] Parsed cues count:', parsed.length);
      
      // Create blob URL for consistency
      const blob = new Blob([vttContent], { type: 'text/vtt; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const newSubId = `external-${language}-${Date.now()}`;
      const newSubtitle = {
        id: newSubId,
        label: `${languageName}`,
        url,
      };
      
      cueCache.current.set(url, parsed);
      setSubId(newSubId);
      setCues(parsed);
      put('umbra:sublang', language);
      onSubtitleChange?.(newSubId);

      setExternalSubtitles(prev => [...prev, newSubtitle]);
      
      // Show success toast
      showToast(
        lang === 'ar' 
          ? `تم تفعيل ترجمة ${languageName} (${parsed.length} سطر)` 
          : `${languageName} subtitle loaded (${parsed.length} lines)`,
        'success'
      );
    } catch (error: any) {
      console.error('[Player] Failed to load external subtitle:', error);
      showToast(
        lang === 'ar' 
          ? `فشل تحميل الترجمة: ${error.message || 'خطأ غير معروف'}` 
          : `Failed to load subtitle: ${error.message || 'Unknown error'}`,
        'error'
      );
    }
  }, [lang, onSubtitleChange, showToast]);

  // Convert SRT to VTT with robust line and timestamp formatting
  const srtToVtt = (srt: string): string => {
    const t = srt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (t.startsWith('WEBVTT')) return t + '\n';
    const body = t
      .split('\n')
      .map((line) => (line.includes('-->') ? line.replace(/,/g, '.') : line))
      .join('\n');
    return `WEBVTT\n\n${body}\n`;
  };

  useEffect(() => {
    // restore last language choice when the next episode loads
    const pref = str('umbra:sublang');
    const match = pref && pref !== 'off' ? allSubtitles.find((s: any) => s.lang === pref && !s.forced) : undefined;
    void selectSubtitle(match?.id ?? null);
  }, [media.id, selectSubtitle]);

  const effectiveAudioTracks = useMemo(() => {
    if (availableAudioTracks.length > 0) return availableAudioTracks;
    return media.audioTracks.map((a, idx) => ({ id: idx, label: a.label, lang: a.lang, channels: a.channels }));
  }, [availableAudioTracks, media.audioTracks]);

  const selectAudio = useCallback((i: number) => {
    setAudioIdx(i);
    setMenu(null);
    onAudioChange?.(i);
    const hls = hlsRef.current;
    if (hls && hls.audioTracks && hls.audioTracks.length > 0) hls.audioTrack = i;
    const l = effectiveAudioTracks[i]?.lang;
    if (l) put('umbra:audiolang', l);
  }, [effectiveAudioTracks, onAudioChange]);

  const selectQuality = useCallback((lvlIdx: number) => {
    setCurrentLevelIdx(lvlIdx);
    setMenu(null);
    const hls = hlsRef.current;
    if (hls) {
      hls.currentLevel = lvlIdx;
    }
  }, []);

  const selectSource = useCallback((idx: number) => {
    if (idx === currentSourceIndex) {
      setMenu(null);
      return;
    }
    setCurrentSourceIndex(idx);
    setMenu(null);
    setRetry((r) => r + 1);
  }, [currentSourceIndex]);

  // ── tell the room when we are loading / stalling ─────────────────────────────
  useEffect(() => {
    const loading = phase === 'preparing' || phase === 'loading';
    const t1 = loading ? window.setTimeout(() => cb.current.onBuffering?.('load', true), 400) : undefined;
    if (!loading) cb.current.onBuffering?.('load', false);
    return () => window.clearTimeout(t1);
  }, [phase, media.id]);
  useEffect(() => {
    const stalled = phase === 'ready' && buffering && playing;
    const t1 = stalled ? window.setTimeout(() => cb.current.onBuffering?.('stall', true), 700) : undefined;
    if (!stalled) cb.current.onBuffering?.('stall', false);
    return () => window.clearTimeout(t1);
  }, [phase, buffering, playing, media.id]);

  // ── actions (user input → callbacks; handle → no callbacks) ────────────────
  const seekTo = useCallback((tt: number) => {
    const v = videoRef.current!;
    const x = clamp(tt, 0, Math.max(0, maxSeek()));
    v.currentTime = x;
    setTime(x);
  }, [maxSeek]);

  const userPlay = () => { const v = videoRef.current!; if (!controlled) v.play().catch(() => {}); onUserPlay?.(v.currentTime); doFlash('play'); };
  const userPause = () => { const v = videoRef.current!; if (!controlled) v.pause(); onUserPause?.(v.currentTime); doFlash('pause'); };
  const togglePlay = () => ((intentPlaying ?? !videoRef.current!.paused) ? userPause() : userPlay());
  const userSeek = (tt: number) => {
    const x = clamp(tt, 0, Math.max(0, maxSeek()));
    if (!controlled) seekTo(x);
    onUserSeek?.(x);
  };
  const triggerSeekWithRipple = useCallback((d: number) => {
    const v = videoRef.current;
    if (!v) return;
    const cur = v.currentTime;
    userSeek(cur + d);
    const dir = d < 0 ? 'back' : 'fwd';

    setSeekRipple((prev) => {
      const accumulated = (prev && prev.dir === dir) ? prev.seconds + Math.abs(d) : Math.abs(d);
      return { dir, seconds: accumulated };
    });

    window.clearTimeout(seekRippleTimer.current);
    seekRippleTimer.current = window.setTimeout(() => {
      setSeekRipple(null);
    }, 750);
  }, [userSeek]);

  const skip = (d: number) => {
    triggerSeekWithRipple(d);
    doFlash(d < 0 ? 'back' : 'fwd');
  };

  // One active skip action at a time: recap → intro → credits.
  const skipSegments = useMemo<SeekMarker[]>(() => {
    if (!skipTimings?.found) return [];
    const list: SeekMarker[] = [];
    for (const kind of ['recap', 'intro', 'outro'] as const) {
      const segment = skipTimings[kind];
      if (segment) list.push({ start: segment.startTime, end: segment.endTime, kind });
    }
    return list;
  }, [skipTimings]);

  const activeSkip = useMemo(
    () => skipSegments.find((segment) => time >= segment.start && time < segment.end) ?? null,
    [skipSegments, time],
  );
  activeSkipRef.current = activeSkip;

  const skipActiveSegment = useCallback(() => {
    if (!activeSkip) return;
    userSeek(activeSkip.kind === 'outro' ? Math.max(0, effDuration() - 0.5) : activeSkip.end + 0.5);
  }, [activeSkip, effDuration]);

  const triggerNextSource = useCallback(() => {
    if (!streamingConfig) return;
    const all = [streamingConfig.source, ...streamingConfig.alternatives].filter(Boolean) as PlaybackSourcePublic[];
    if (all.length <= 1) return;

    if (currentSource) {
      attemptedSources.current.add(currentSource.url);
      api.reportPlaybackFailure({
        provider: currentSource.provider,
        sourceUrl: currentSource.url,
        failureType: 'http_timeout',
        responseStatus: 0,
        errorDetails: 'User switched to alternative source',
      }).catch(() => {});
    }

    const tried = attemptedSources.current;
    const currentProvider = currentSource?.provider;
    let next = all.find(s => !tried.has(s.url) && s.provider !== currentProvider);
    if (!next) next = all.find(s => !tried.has(s.url));
    if (!next) {
      tried.clear();
      if (currentSource) tried.add(currentSource.url);
      next = all.find(s => s.url !== currentSource?.url) || all[0];
    }

    if (next) {
      tried.add(next.url);
      const nextIdx = all.indexOf(next);
      setFailoverMessage('جاري تجهيز مصدر بديل...');
      setCurrentSourceIndex(nextIdx >= 0 ? nextIdx : 0);
      setRetry(r => r + 1);
    }
  }, [streamingConfig, currentSource]);

  useImperativeHandle(ref, () => ({
    play: async () => { if (videoRef.current) await videoRef.current.play(); },
    pause: () => { if (videoRef.current) videoRef.current.pause(); },
    seek: (tt) => {
      seekTo(tt);
    },
    getTime: () => (videoRef.current?.currentTime ?? 0),
    isPlaying: () => (!videoRef.current?.paused),
    setRate: (r) => { if (videoRef.current) videoRef.current.playbackRate = r; },
    getRate: () => (videoRef.current?.playbackRate ?? 1),
    setAudioTrack: selectAudio,
    setSubtitle: (id) => void selectSubtitle(id),
  }), [seekTo, selectAudio, selectSubtitle]);

  const setVol = (x: number) => {
    const v = videoRef.current!;
    v.volume = clamp(x, 0, 1);
    v.muted = x <= 0;
    put('umbra:vol', String(v.volume));
  };
  const toggleMute = () => { const v = videoRef.current!; v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; };

  const toggleFs = useCallback(() => {
    const el = rootRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else (el.requestFullscreen?.() ?? Promise.reject()).catch(() => el.webkitRequestFullscreen?.());
  }, []);
  useEffect(() => {
    const on = () => {
      const isFullscreen = !!document.fullscreenElement;
      setFs(isFullscreen);
      if (isFullscreen) {
        void screenManager.enterVideoFullscreen();
      } else {
        void screenManager.exitVideoFullscreen();
      }
    };
    document.addEventListener('fullscreenchange', on);
    return () => {
      document.removeEventListener('fullscreenchange', on);
      void screenManager.exitVideoFullscreen();
      void screenManager.setKeepAwake(false);
    };
  }, []);

  // Back button handling during fullscreen or playing
  useEffect(() => {
    return registerBackHandler(() => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return true;
      }
      return false;
    });
  }, []);

  // Screen keep-awake while playing
  useEffect(() => {
    void screenManager.setKeepAwake(playing);
    return () => {
      void screenManager.setKeepAwake(false);
    };
  }, [playing]);

  // ── auto-hiding controls ───────────────────────────────────────────────────
  const poke = useCallback(() => {
    setUiVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setUiVisible(false), 3200);
  }, []);
  useEffect(() => {
    if (!playing || menu) { window.clearTimeout(hideTimer.current); setUiVisible(true); }
    else poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [playing, menu, poke]);

  // ── keyboard ───────────────────────────────────────────────────────────────
  // The listener is registered rarely; it must always call the LATEST actions (their closures
  // depend on room permissions / state), otherwise a guest who was just granted control keeps
  // hitting the stale "not allowed" version.
  const act = useRef({ togglePlay, skip, skipActiveSegment, setVol, toggleMute });
  act.current = { togglePlay, skip, skipActiveSegment, setVol, toggleMute };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const v = videoRef.current!;
      const k = e.key.toLowerCase();
      let handled = true;

      // Handle active countdown shortcuts
      if (countdownRef.current !== null) {
        if (k === 'enter') {
          e.preventDefault();
          setCountdown(null);
          cb.current.onNext();
          return;
        }
        if (k === 'escape') {
          e.preventDefault();
          dismissedCountdown.current = true;
          setCountdown(null);
          return;
        }
      }

      if (k === ' ' || k === 'k') act.current.togglePlay();
      else if (k === 'arrowleft' || k === 'j') act.current.skip(-10);
      else if (k === 'arrowright' || k === 'l') act.current.skip(10);
      else if (k === 's' || k === 'س') act.current.skipActiveSegment();
      else if (k === 'arrowup') act.current.setVol(v.volume + 0.1);
      else if (k === 'arrowdown') act.current.setVol(v.volume - 0.1);
      else if (k === 'm') act.current.toggleMute();
      else if (k === 'f') toggleFs();
      else if (k === 'p') void togglePip();
      else if (k === 'n' && hasNext) cb.current.onNext();
      else if (k === 'c' && allSubtitles.length) void selectSubtitle(subId ? null : allSubtitles[0].id);
      else if (k === '[' || k === 'z') {
        if (subId && subId !== 'off') {
          setSubOffset((prev) => {
            const next = Math.round((prev - 0.5) * 10) / 10;
            showToast(
              lang === 'ar'
                ? `تأخير الترجمة: ${next > 0 ? '+' : ''}${next.toFixed(1)} ثانية`
                : `Subtitle offset: ${next > 0 ? '+' : ''}${next.toFixed(1)}s`,
              'info'
            );
            return next;
          });
        }
      }
      else if (k === ']' || k === 'x') {
        if (subId && subId !== 'off') {
          setSubOffset((prev) => {
            const next = Math.round((prev + 0.5) * 10) / 10;
            showToast(
              lang === 'ar'
                ? `تقديم الترجمة: ${next > 0 ? '+' : ''}${next.toFixed(1)} ثانية`
                : `Subtitle offset: ${next > 0 ? '+' : ''}${next.toFixed(1)}s`,
              'info'
            );
            return next;
          });
        }
      }
      else if (k === 'escape' && menu) setMenu(null);
      else handled = false;
      if (handled) { e.preventDefault(); poke(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, hasNext, menu, subId, allSubtitles, toggleFs, poke, selectSubtitle, lang, showToast]);

  // ── surface gestures: click = play/pause (tap = toggle UI on touch), double-click = skip/fullscreen ──
  const onSurfaceClick = () => {
    if (theatreMode) { poke(); return; }
    if (menu) return setMenu(null);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      if (pointerType.current === 'touch') setUiVisible((x) => (x && playing ? false : true));
      else togglePlay();
    }, 230);
  };
  const onSurfaceDouble = (e: React.MouseEvent<HTMLDivElement>) => {
    if (theatreMode) { toggleFs(); return; }
    window.clearTimeout(clickTimer.current);
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.35) triggerSeekWithRipple(-10);
    else if (x > 0.65) triggerSeekWithRipple(10);
    else toggleFs();
  };

  // ── render ─────────────────────────────────────────────────────────────────
  const volLevel: 0 | 1 | 2 = muted || volume === 0 ? 0 : volume < 0.5 ? 1 : 2;
  const showUi = uiVisible || !playing || phase !== 'ready';
  const multiAudio = effectiveAudioTracks.length > 1;
  const iconFlip = 'rtl:-scale-x-100';
  const errorHint = errorCode === 'media_not_ready' ? 'mediaNotReady'
    : errorCode === 'media_tools_missing' ? 'mediaToolsMissing'
      : errorCode === 'media_probe_failed' ? 'mediaProbeFailed'
        : errorCode === 'ffmpeg_missing' ? 'ffmpegMissing'
          : errorCode === 'ffmpeg_failed' ? 'ffmpegFailed'
            : 'playbackErrorHint';

  return (
    <div
      ref={rootRef}
      onPointerMove={poke}
      onPointerDown={(e) => { pointerType.current = e.pointerType; poke(); }}
      className={`@container ${theatreMode ? 'relative size-full' : 'fixed inset-0'} select-none overflow-hidden bg-black text-bone ${!showUi ? 'cursor-none' : ''}`}
    >
      {theatreMode && !canControl && (
        <div
          className="absolute inset-0 z-10 cursor-default"
          onClick={(e) => {
            e.stopPropagation();
            onDisabledControlClick?.();
          }}
        />
      )}
      <video ref={videoRef} playsInline preload="auto" poster={u(media.stillUrl)} className="absolute inset-0 size-full bg-black object-contain" />

      {/* gesture surface */}
      <div className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={onSurfaceDouble} />

      <SubtitleOverlay video={videoRef.current} cues={cues} offset={subOffset} raised={showUi} />

      {/* top bar */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-3 bg-gradient-to-b from-black/85 to-transparent px-[max(1rem,2.5cqw)] pb-10 pt-[max(0.75rem,2cqh)] transition-opacity duration-300 ${showUi ? 'opacity-100' : 'opacity-0'}`}>
        <button onClick={onBack} aria-label={t('back')} className={`pointer-events-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-black/60 transition hover:bg-white/15 active:scale-90 ${showUi ? '' : 'invisible'}`}>
          <ArrowLeft className={`size-5 ${iconFlip}`} />
        </button>
        <div className="min-w-0 pt-0.5">
          <p className="truncate font-display text-[clamp(1rem,2.4cqw,1.5rem)] font-bold tracking-wide">{title}</p>
          {subtitle && <p className="truncate text-[clamp(0.75rem,1.5cqw,0.95rem)] text-dust">{subtitle}</p>}
        </div>
        {currentSource && (
          <div className="pointer-events-auto ms-auto flex items-center gap-2">
            {startAt > 10 && (
              <span
                className="hidden md:inline-flex rounded-full border border-white/20 bg-black/60 px-2.5 py-1 text-xs font-mono text-dust"
                title={lang === 'ar' ? 'موضع التوقف المحفوظ' : 'Saved resume position'}
              >
                {lang === 'ar' ? `الموضع السابق: ${fmtTime(startAt)}` : `Resume: ${fmtTime(startAt)}`}
              </span>
            )}
            <div className="relative">
              <button
                onClick={() => setMenu(menu === 'source' ? null : 'source')}
                className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-medium text-bone transition hover:border-white/40 hover:bg-white/10 active:scale-95"
                title={lang === 'ar' ? 'تغيير سيرفر البث المباشر' : 'Change streaming server'}
              >
                <span>{currentSource.provider}</span>
                {allSources.length > 1 && <span className="text-[10px] text-dust">({allSources.length})</span>}
              </button>
              {menu === 'source' && allSources.length > 0 && (
                <Menu
                  title={t('source')}
                  placement="top"
                  selected={String(currentSourceIndex)}
                  onSelect={(id) => selectSource(Number(id))}
                  items={allSources.map((s, idx) => ({
                    id: String(idx),
                    label: s.provider,
                    hint: 'HLS (Direct Stream)',
                  }))}
                />
              )}
            </div>
            {hasNext && (
              <button
                onClick={onNext}
                title={t('nextEpisode')}
                className="inline-flex items-center gap-1.5 rounded-full bg-blood px-3 py-1 text-xs font-semibold text-bone transition hover:bg-blood-hot active:scale-95"
              >
                <span>{t('nextEpisode')}</span>
                <Next className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* center indicators */}
      {flash && (
        <div key={flash.n} className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" onAnimationEnd={() => setFlash(null)}>
          <div className="flex size-20 items-center justify-center rounded-full bg-black/60">
            {flash.kind === 'play' && <Play className={`size-9 ${iconFlip}`} />}
            {flash.kind === 'pause' && <Pause className="size-9" />}
            {flash.kind === 'back' && <Skip dir="back" className="size-10" />}
            {flash.kind === 'fwd' && <Skip dir="fwd" className="size-10" />}
          </div>
        </div>
      )}
      {phase === 'ready' && !playing && !buffering && !flash && (
        <button onClick={togglePlay} aria-label={t('play')} className="absolute left-1/2 top-1/2 z-10 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/60 transition hover:bg-white/15 active:scale-95">
          <Play className={`size-9 ${iconFlip}`} />
        </button>
      )}
      {phase === 'ready' && buffering && playing && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><Spinner className="size-14 text-bone/90" /></div>
      )}

      {/* preparing / error */}
      {(phase === 'preparing' || phase === 'loading') && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
          <Spinner className="size-12 text-bone" />
          <p className="font-display text-lg tracking-wide text-bone font-bold">
            {failoverMessage || (streamingLoading ? t('nativeStreamLoading') : t('preparing'))}
          </p>
          {(phase === 'preparing' || streamingLoading) && !failoverMessage && (
            <>
              <div className="h-1 w-64 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full bg-blood transition-[width] duration-700"
                  style={{ width: `${Math.max(15, prep * 100)}%` }}
                />
              </div>
              <p className="max-w-sm text-xs text-dust">
                {streamingLoading ? t('nativeStreamLoadingHint') : t('preparingHint')}
              </p>
            </>
          )}
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="font-display text-2xl">{t('playbackError')}</p>
          <p className="max-w-sm text-sm text-dust">{t(errorHint)}</p>
          <div className="mt-2 flex gap-3">
            <button onClick={() => setRetry((r) => r + 1)} className="rounded-md bg-blood px-5 py-2.5 font-semibold transition hover:bg-blood-hot">{t('retry')}</button>
            <button onClick={onBack} className="rounded-md border border-white/20 px-5 py-2.5 transition hover:bg-white/10">{t('back')}</button>
          </div>
        </div>
      )}

      {holdLabel && (
        <div className="pointer-events-none absolute inset-x-0 top-[max(4.5rem,9cqh)] z-20 flex justify-center">
          <div className="flex items-center gap-2.5 rounded-full border border-white/15 bg-coal px-4 py-2 text-sm">
            <Spinner className="size-4 text-bone" />
            <span>{holdLabel}</span>
          </div>
        </div>
      )}

      {/* Netflix-style Quick Seek Ripple Feedback */}
      {seekRipple && (
        <div
          className={`pointer-events-none absolute inset-y-0 z-30 flex w-1/3 items-center justify-center transition-opacity duration-200 ${
            seekRipple.dir === 'back' ? 'start-0' : 'end-0'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-2 rounded-full bg-black/70 p-6 backdrop-blur-xl border border-white/15 shadow-[0_0_40px_rgba(0,0,0,0.85)] animate-in zoom-in-75 duration-200">
            <div className="relative flex items-center justify-center">
              <svg
                className={`size-12 text-bone ${seekRipple.dir === 'back' ? '-scale-x-100' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12A9 9 0 1 1 12 3a9 9 0 0 1 8.5 6" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              <span className="absolute font-mono text-[0.7rem] font-black text-bone">
                {seekRipple.seconds}
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-bone">
              {seekRipple.dir === 'back' ? `-${seekRipple.seconds}s` : `+${seekRipple.seconds}s`}
            </span>
          </div>
        </div>
      )}

      {/* Up Next - Netflix-style floating card with 5s countdown & auto-advance */}
      {countdown !== null && !menu && hasNext && (
        <aside
          role="dialog"
          aria-label={t('nextEpisode')}
          className="absolute bottom-24 end-[max(1.25rem,3cqw)] z-40 w-80 rounded-2xl border border-white/20 bg-black/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gilt">
              {t('nextEpisode')}
            </span>
            <div className="relative flex size-7 items-center justify-center">
              <svg className="size-7 -rotate-90 text-white/20" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="14"
                  fill="none"
                  stroke="#dc3044"
                  strokeWidth="3"
                  strokeDasharray="88"
                  strokeDashoffset={88 - (88 * (5 - countdown)) / 5}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="absolute font-mono text-xs font-bold text-bone">
                {countdown}
              </span>
            </div>
          </div>

          <p className="mt-2 text-sm font-semibold text-bone line-clamp-1">
            {subtitle ? `${title} • ${subtitle}` : title}
          </p>
          <p className="mt-0.5 text-xs text-dust">
            {t('nextIn', { n: countdown })}
          </p>

          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setCountdown(null);
                onNext();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blood-hot py-2.5 text-sm font-bold text-bone shadow-[0_0_20px_rgba(220,48,68,0.5)] transition-all duration-150 hover:bg-[#e83d51] hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play className="size-4 fill-current" />
              <span>{t('playNow')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                dismissedCountdown.current = true;
                setCountdown(null);
              }}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-dust transition-all duration-150 hover:bg-white/10 hover:text-bone"
            >
              {t('cancel')}
            </button>
          </div>
        </aside>
      )}

      {/* Skip recap / intro / credits — Netflix-style floating pill */}
      {activeSkip && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            skipActiveSegment();
          }}
          className="group absolute bottom-[max(6.5rem,15cqh)] end-[max(1.25rem,3cqw)] z-30 flex items-center gap-2.5 rounded-full border border-white/40 bg-black/85 px-5 py-2.5 text-sm font-bold text-bone shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-all duration-200 hover:scale-105 hover:border-white hover:bg-white hover:text-black active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/80 sm:px-6"
        >
          <Skip dir="fwd" className="size-4 rtl:rotate-180 transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          <span>
            {activeSkip.kind === 'recap' ? t('skipRecap') : activeSkip.kind === 'intro' ? t('skipIntro') : t('skipCredits')}
          </span>
          <kbd className="hidden sm:inline-block rounded bg-white/20 px-1.5 py-0.5 text-[0.68rem] font-mono font-bold text-bone group-hover:bg-black/20 group-hover:text-black">
            S
          </kbd>
        </button>
      )}

      {/* bottom controls */}
      <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-[max(0.75rem,2cqw)] pb-[max(0.75rem,1.8cqh)] pt-14 transition-opacity duration-300 ${showUi ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          {!theatreMode && (
            <SeekBar
              time={time}
              duration={duration}
              buffered={bufEnd}
              sprite={media.sprite}
              markers={skipSegments}
              onSeek={userSeek}
              label={t('seek')}
              disabled={controlled && !canControl}
              onDisabledClick={onDisabledControlClick}
            />
          )}
          <div className="mt-1 flex items-center gap-1 sm:gap-1.5" dir="ltr">
            {!theatreMode && (
              <>
                <ControlButton label={playing ? t('pause') : t('play')} onClick={togglePlay} disabled={controlled && !canControl} onDisabledClick={onDisabledControlClick}>
                  {playing ? <Pause className="size-5 sm:size-6" /> : <Play className="size-5 sm:size-6" />}
                </ControlButton>
                <ControlButton label={t('skipBack')} onClick={() => skip(-10)} className="@max-md:hidden" disabled={controlled && !canControl} onDisabledClick={onDisabledControlClick}><Skip dir="back" className="size-5 sm:size-6" /></ControlButton>
                <ControlButton label={t('skipForward')} onClick={() => skip(10)} className="@max-md:hidden" disabled={controlled && !canControl} onDisabledClick={onDisabledControlClick}><Skip dir="fwd" className="size-5 sm:size-6" /></ControlButton>
              </>
            )}

            <div className="group/vol flex items-center">
              <ControlButton label={muted ? t('unmute') : t('mute')} onClick={toggleMute}><Volume level={volLevel} className="size-5 sm:size-6" /></ControlButton>
              <input
                type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume} aria-label="Volume"
                onChange={(e) => setVol(Number(e.target.value))} onClick={(e) => e.stopPropagation()}
                className="h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/30 accent-[var(--color-gilt)] opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 group-hover/vol:me-2 focus-visible:w-20 focus-visible:opacity-100 @max-sm:hidden"
              />
            </div>

            <span className="ms-1 shrink-0 whitespace-nowrap text-xs sm:text-[0.82rem] tabular-nums text-bone/90 select-none">
              {fmtTime(time)} <span className="text-dust">/ {fmtTime(duration)}</span>
            </span>

            {controlled && !canControl && !theatreMode && (
              <span className="ms-2 inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2 py-0.5 text-[0.7rem] font-medium text-dust" title={t('hostPlaybackLocked')}>
                <Lock className="size-3" />
                <span className="@max-sm:hidden">{t('hostControlOnly')}</span>
              </span>
            )}

            <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
              {extraControls}
              {hasNext && (
                <ControlButton label={t('nextEpisode')} onClick={onNext}><Next className="size-5 sm:size-6" /></ControlButton>
              )}
              {!hideSpeed && <div className="relative">
                <ControlButton label={t('speed')} active={menu === 'speed'} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} className="@max-sm:hidden">
                  <Gauge className="size-5 sm:size-6" />
                </ControlButton>
                {menu === 'speed' && (
                  <Menu title={t('speed')} selected={String(rate)} onSelect={(id) => { 
                    const newRate = Number(id);
                    videoRef.current!.playbackRate = newRate; 
                    onSpeedChange?.(newRate);
                    setMenu(null); 
                  }}
                    items={RATES.map((r) => ({ id: String(r), label: r === 1 ? t('normal') : `${r}×` }))} />
                )}
              </div>}
              {effectiveAudioTracks.length > 0 && (
                <div className="relative">
                  <ControlButton
                    label={t('audio')}
                    active={menu === 'audio'}
                    onClick={() => setMenu(menu === 'audio' ? null : 'audio')}
                  >
                    <AudioTracks className="size-5 sm:size-6" />
                  </ControlButton>
                  {menu === 'audio' && (
                    <Menu
                      title={t('audio')}
                      selected={String(audioIdx)}
                      onSelect={(id) => selectAudio(Number(id))}
                      items={effectiveAudioTracks.map((a) => ({
                        id: String(a.id),
                        label: a.label,
                        hint: a.channels && a.channels > 2 ? `${a.channels}.0` : undefined,
                      }))}
                      footer={
                        effectiveAudioTracks.length === 1 ? (
                          <div className="mt-2 border-t border-white/10 pt-2 px-3 text-[11px] text-dust text-center">
                            {lang === 'ar' ? 'المسار الصوتي الوحيد المتاح' : 'Single audio track available'}
                          </div>
                        ) : undefined
                      }
                    />
                  )}
                </div>
              )}
              {availableLevels.length > 1 && (
                <div className="relative">
                  <ControlButton label={t('quality')} active={menu === 'quality'} onClick={() => setMenu(menu === 'quality' ? null : 'quality')}>
                    <Sliders className="size-5 sm:size-6" />
                  </ControlButton>
                  {menu === 'quality' && (
                    <Menu
                      title={t('quality')}
                      selected={String(currentLevelIdx)}
                      onSelect={(id) => selectQuality(Number(id))}
                      items={[
                        { id: '-1', label: `${t('auto')}${currentLevelIdx === -1 && hlsRef.current?.currentLevel !== undefined && hlsRef.current.currentLevel >= 0 && availableLevels[hlsRef.current.currentLevel] ? ` (${availableLevels[hlsRef.current.currentLevel].label})` : ''}` },
                        ...availableLevels.map((lvl) => ({ id: String(lvl.id), label: lvl.label })),
                      ]}
                    />
                  )}
                </div>
              )}
              {/* Always show subtitle button to allow external subtitle search */}
              <div className="relative">
                <ControlButton label={t('subtitles')} active={menu === 'subs' || !!subId} onClick={() => setMenu(menu === 'subs' ? null : 'subs')}><Subtitles className="size-5 sm:size-6" /></ControlButton>
                {menu === 'subs' && (
                  <Menu
                    title={t('subtitles')}
                    selected={subId ?? 'off'}
                    onSelect={(id) => {
                      if (id === '__search__') {
                        if (!media.tmdbId) {
                          showToast(
                            lang === 'ar'
                              ? 'لا يمكن البحث عن ترجمات: المحتوى غير مرتبط بـ TMDB'
                              : 'Cannot search subtitles: media is not linked to TMDB',
                            'error'
                          );
                        } else {
                          setShowExternalSubModal(true);
                        }
                        setMenu(null);
                      } else {
                        void selectSubtitle(id === 'off' ? null : id);
                      }
                    }}
                    items={[
                      { id: 'off', label: t('off') },
                      ...allSubtitles.map((s: any) => ({ id: s.id, label: s.label })),
                      { id: '__search__', label: lang === 'ar' ? 'بحث عن ترجمات...' : 'Search subtitles...', hint: 'Stremio / OpenSubs' }
                    ]}
                    footer={
                      subId && subId !== 'off' ? (
                        <div className="mt-2 border-t border-white/10 pt-2.5 px-2">
                          <div className="flex items-center justify-between text-[11px] text-dust mb-1.5 px-1">
                            <span>{lang === 'ar' ? 'مزامنة التوقيت' : 'Subtitle Sync'}</span>
                            <span className="font-mono text-gilt font-medium">
                              {subOffset > 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubOffset((prev) => Math.round((prev - 0.5) * 10) / 10);
                              }}
                              className="flex-1 py-1 rounded-lg bg-white/10 text-xs font-mono font-medium hover:bg-white/20 active:scale-95 transition"
                              title="-0.5s"
                            >
                              -0.5s
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubOffset((prev) => Math.round((prev - 0.1) * 10) / 10);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/10 text-xs font-mono hover:bg-white/20 active:scale-95 transition"
                              title="-0.1s"
                            >
                              -0.1s
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubOffset(0);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/5 text-[11px] text-dust hover:bg-white/15 hover:text-bone active:scale-95 transition"
                              title="Reset"
                            >
                              0s
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubOffset((prev) => Math.round((prev + 0.1) * 10) / 10);
                              }}
                              className="px-2 py-1 rounded-lg bg-white/10 text-xs font-mono hover:bg-white/20 active:scale-95 transition"
                              title="+0.1s"
                            >
                              +0.1s
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubOffset((prev) => Math.round((prev + 0.5) * 10) / 10);
                              }}
                              className="flex-1 py-1 rounded-lg bg-white/10 text-xs font-mono font-medium hover:bg-white/20 active:scale-95 transition"
                              title="+0.5s"
                            >
                              +0.5s
                            </button>
                          </div>
                          <div className="mt-1.5 text-[10px] text-dust/60 text-center px-1">
                            {lang === 'ar' ? 'اختصار: [ أو ] لضبط التوقيت' : 'Hotkeys: [ or ] to adjust sync'}
                          </div>
                        </div>
                      ) : undefined
                    }
                  />
                )}
              </div>
              {pipSupported && (
                <ControlButton label={t('pip')} onClick={togglePip} active={isPip}>
                  <Pip className="size-5 sm:size-6" />
                </ControlButton>
              )}
              <ControlButton label={fs ? t('exitFullscreen') : t('fullscreen')} onClick={toggleFs}>
                {fs ? <ExitFullscreen className="size-5 sm:size-6" /> : <Fullscreen className="size-5 sm:size-6" />}
              </ControlButton>
            </div>
          </div>
        </div>
      {overlay}
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      
      {/* External Subtitles Modal */}
      {showExternalSubModal && media.tmdbId && (
        <SubtitleSearchModal
          tmdbId={media.tmdbId}
          type={media.kind === 'movie' ? 'movie' : 'tv'}
          season={media.season ?? undefined}
          episode={media.episode ?? undefined}
          onSelect={handleExternalSubtitleSelect}
          onClose={() => setShowExternalSubModal(false)}
        />
      )}
    </div>
  );
});
