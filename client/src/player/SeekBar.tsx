import { useEffect, useRef, useState } from 'react';
import { u } from '../api';
import type { SpriteInfoPublic } from '../api-types';
import { clamp, fmtTime } from '../format';

export interface SeekMarker {
  start: number;
  end: number;
  kind: 'recap' | 'intro' | 'outro';
}

interface Props {
  time: number;
  duration: number;
  buffered: number;
  sprite: SpriteInfoPublic | null;
  markers?: SeekMarker[];
  onSeek: (t: number) => void;
  label: string;
  disabled?: boolean;
  onDisabledClick?: () => void;
}

const SCALE = 1.25;
const STEP = 10;

/** Time axis is always left→right (even in RTL), like every video player. */
export function SeekBar({ time, duration, buffered, sprite, markers = [], onSeek, label, disabled = false, onDisabledClick }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ t: number; x: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (sprite) new Image().src = u(sprite.url)!; // warm the cache so the first hover is instant
  }, [sprite]);

  const pos = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    return { x, t: duration > 0 ? (x / r.width) * duration : 0 };
  };

  const shown = drag ?? time;
  const pct = duration > 0 ? clamp((shown / duration) * 100, 0, 100) : 0;
  const bufPct = duration > 0 ? clamp((buffered / duration) * 100, 0, 100) : 0;
  const active = hover !== null || drag !== null;
  const tip = drag !== null && hover === null ? { t: drag, x: (pct / 100) * (track.current?.clientWidth ?? 0) } : hover;

  // Active marker at hovered position (e.g. Intro, Recap, Outro)
  const activeMarker = tip ? markers.find((m) => tip.t >= m.start && tip.t <= m.end) : null;

  let preview: JSX.Element | null = null;
  if (tip && !disabled) {
    const w = (sprite?.tileW ?? 0) * SCALE;
    const tw = track.current?.clientWidth ?? 0;
    const cardW = Math.max(w, 140);
    const left = clamp(tip.x, cardW / 2 + 8, Math.max(tw - cardW / 2 - 8, 0));
    
    let tile: JSX.Element | null = null;
    if (sprite) {
      const idx = Math.min(sprite.count - 1, Math.floor(tip.t / sprite.intervalSec));
      const col = idx % sprite.cols;
      const row = Math.floor(idx / sprite.cols);
      tile = (
        <div
          className="rounded-md border border-white/20 bg-black overflow-hidden shadow-2xl"
          style={{
            width: w,
            height: sprite.tileH * SCALE,
            backgroundImage: `url(${u(sprite.url)})`,
            backgroundSize: `${sprite.cols * w}px ${sprite.rows * sprite.tileH * SCALE}px`,
            backgroundPosition: `-${col * w}px -${row * sprite.tileH * SCALE}px`,
          }}
        />
      );
    }

    preview = (
      <div
        className="pointer-events-none absolute bottom-full mb-3.5 flex -translate-x-1/2 flex-col items-center gap-1.5 z-40 transition-all duration-75"
        style={{ left }}
      >
        {tile ? (
          <div className="flex flex-col items-center gap-1 p-1 rounded-lg bg-black/90 backdrop-blur-md border border-white/20 shadow-[0_12px_36px_rgba(0,0,0,0.85)]">
            {tile}
            <div className="flex items-center gap-1.5 px-2 py-0.5">
              {activeMarker && (
                <span className="rounded bg-gilt/20 px-1.5 py-0.2 text-[0.65rem] font-bold uppercase tracking-wider text-gilt border border-gilt/40">
                  {activeMarker.kind}
                </span>
              )}
              <span className="font-mono text-[0.78rem] font-bold tabular-nums text-bone">
                {fmtTime(tip.t)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-white/25 bg-black/90 backdrop-blur-md px-3 py-1 shadow-2xl">
            {activeMarker && (
              <span className="rounded-full bg-gilt/20 px-2 py-0.2 text-[0.65rem] font-bold uppercase tracking-wider text-gilt border border-gilt/40">
                {activeMarker.kind}
              </span>
            )}
            <span className="font-mono text-[0.8rem] font-bold tabular-nums text-bone">
              {fmtTime(tip.t)}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      dir="ltr"
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={fmtTime(shown)}
      className={`group/seek relative flex h-9 sm:h-7 w-full touch-none select-none items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bone/70 ${disabled ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'}`}
      onKeyDown={(e) => {
        if (disabled) return;
        let next: number | null = null;
        if (e.key === 'ArrowLeft') next = time - STEP;
        else if (e.key === 'ArrowRight') next = time + STEP;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = duration;
        if (next === null) return;
        e.preventDefault();
        e.stopPropagation();
        onSeek(clamp(next, 0, duration));
      }}
      onPointerMove={(e) => {
        if (disabled) return;
        const p = pos(e.clientX);
        setHover(p);
        if (drag !== null) setDrag(p.t);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        if (disabled) {
          onDisabledClick?.();
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = pos(e.clientX);
        setDrag(p.t);
        setHover(p);
      }}
      onPointerUp={(e) => {
        if (disabled || drag === null) return;
        onSeek(pos(e.clientX).t);
        setDrag(null);
        if (e.pointerType !== 'mouse') setHover(null);
      }}
      onPointerCancel={() => setDrag(null)}
    >
      <div className={`relative w-full overflow-visible rounded-full bg-white/20 transition-[height] duration-200 ${active ? 'h-[6px]' : 'h-[3.5px]'}`}>
        {/* Buffered Track */}
        <div className="absolute inset-y-0 start-0 rounded-full bg-white/35 transition-[width] duration-150" style={{ width: `${bufPct}%` }} />
        
        {/* Hover Ghost Bar */}
        {hover && (
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-white/25 pointer-events-none"
            style={{ width: `${hover.x}px` }}
          />
        )}

        {/* Played / Progress Bar (Netflix Crimson) */}
        <div
          className={`absolute inset-y-0 start-0 rounded-full bg-blood-hot shadow-[0_0_8px_rgba(220,48,68,0.7)] ${drag === null ? 'transition-[width] duration-200 ease-out' : ''}`}
          style={{ width: `${pct}%` }}
        />

        {/* Skip Markers (Intro, Recap, Outro) */}
        {markers.length > 0 && duration > 0 && (
          <div className="pointer-events-none absolute inset-x-0 inset-y-0 overflow-hidden rounded-full">
            {markers.map((marker, i) => {
              const start = Math.min(clamp((marker.start / duration) * 100, 0, 100), 99.6);
              const width = Math.max(0.5, Math.min(((marker.end - marker.start) / duration) * 100, 100 - start));
              return (
                <div
                  key={`${marker.kind}-${i}`}
                  className="absolute inset-y-0 bg-gilt/80 border-x border-black/40"
                  style={{ left: `${start}%`, width: `${width}%` }}
                  title={marker.kind}
                />
              );
            })}
          </div>
        )}

        {/* Netflix-Style Playhead Thumb */}
        <div
          className={`absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blood-hot ring-2 ring-white shadow-[0_0_12px_rgba(220,48,68,0.9)] transition-transform duration-150 group-hover/seek:scale-100 ${active ? (drag !== null ? 'scale-125' : 'scale-100') : 'scale-0'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      {preview}
    </div>
  );
}
