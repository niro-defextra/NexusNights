/** Pure sync maths (unit-tested). The server owns the truth; this only decides what one player should do. */
export interface SyncState {
  mediaId: string | null;
  /** seconds, valid at server time `at` */
  position: number;
  playing: boolean;
  /** paused for everyone because somebody is loading / buffering */
  hold: boolean;
  at: number;
  version: number;
  /** Current subtitle track ID (null = off) */
  subtitleId: string | null;
  /** Current audio track index */
  audioTrack: number;
  /** Playback speed rate */
  playbackRate: number;
}

export const expectedPosition = (s: SyncState, serverNow: number): number =>
  s.position + (s.playing && !s.hold ? Math.max(0, (serverNow - s.at) / 1000) : 0);

export interface Decision {
  seekTo?: number;
  play: boolean;
  rate: number;
}

/** Hard seek above this drift when a command just arrived / during the periodic check. */
export const HARD_EVENT = 1.0;   // was 0.4 — too aggressive, caused seek-stutter on every event
export const HARD_TICK = 2.5;    // was 1.5 — give HLS time to stabilize before hard-seeking
/** Between SOFT and HARD_TICK we nudge playbackRate instead of seeking (inaudible, no stutter). */
export const SOFT = 0.6;         // was 0.4 — wider deadband for network jitter

export function decide(s: SyncState, serverNow: number, current: number, rate: number, cause: 'event' | 'tick'): Decision {
  const target = expectedPosition(s, serverNow);
  const drift = current - target;
  const abs = Math.abs(drift);
  const shouldPlay = s.playing && !s.hold;

  if (!shouldPlay) return { play: false, rate: 1, seekTo: abs > 0.5 ? s.position : undefined };
  if (abs > (cause === 'event' ? HARD_EVENT : HARD_TICK)) return { play: true, rate: 1, seekTo: target + 0.15 };
  if (cause === 'tick' && abs > SOFT) return { play: true, rate: drift > 0 ? 0.95 : 1.05 };
  if (abs < 0.2) return { play: true, rate: 1 };
  return { play: true, rate }; // inside the hysteresis band: keep whatever we are doing
}

/** NTP-style offset: pick the sample with the smallest round trip. offset = serverTime − clientTime. */
export function bestOffset(samples: { t0: number; t1: number; server: number }[]): number {
  let best = samples[0];
  for (const s of samples) if (s.t1 - s.t0 < best.t1 - best.t0) best = s;
  return best.server + (best.t1 - best.t0) / 2 - best.t1;
}
