import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { ChevronLeft, ChevronRight } from './Icons';

/** Horizontal scroller with snap, edge arrows and RTL-correct scrolling. */
export const Row = memo(function Row({ title, children }: { title: string; children: ReactNode }) {
  const { dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft); // RTL scrollLeft is negative in Chromium
    setEdge({ start: pos < 8, end: pos + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);

  const scroll = (forward: boolean) => {
    const el = ref.current;
    if (!el) return;
    const sign = (forward ? 1 : -1) * (dir === 'rtl' ? -1 : 1);
    
    // Calculate scroll distance matching exact card multiples to prevent clipped cards
    const firstChild = el.querySelector<HTMLElement>('.snap-start');
    const cardWidth = firstChild ? firstChild.offsetWidth + 16 : 200;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const scrollDistance = visibleCards * cardWidth;

    el.scrollBy({ left: sign * scrollDistance, behavior: 'smooth' });
  };

  return (
    <section className="group/row relative py-2 sm:py-3">
      <div className="mb-2.5 px-[var(--pad)] flex items-center justify-between">
        <h2 className="font-display text-[1.05rem] sm:text-[1.2rem] font-bold tracking-wide text-bone/95 select-none">
          {title}
        </h2>
      </div>

      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          className="no-scrollbar flex snap-x snap-proximity gap-3.5 sm:gap-4 overflow-x-auto scroll-smooth px-[var(--pad)] py-2.5 [scroll-padding-inline:var(--pad)]"
        >
          {children}
        </div>

        {!edge.start && <Arrow side="start" onClick={() => scroll(false)} />}
        {!edge.end && <Arrow side="end" onClick={() => scroll(true)} />}
      </div>
    </section>
  );
});

function Arrow({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
  const { lang } = useI18n();
  const Icon = side === 'start' ? ChevronLeft : ChevronRight;
  const label =
    side === 'start'
      ? lang === 'ar'
        ? 'السابق'
        : 'Previous'
      : lang === 'ar'
      ? 'التالي'
      : 'Next';

  return (
    <div
      className={`pointer-events-none absolute inset-y-2 z-20 hidden w-16 items-center opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 sm:flex ${
        side === 'start'
          ? 'start-0 justify-start ps-2 bg-gradient-to-r from-ink via-ink/60 to-transparent rtl:bg-gradient-to-l'
          : 'end-0 justify-end pe-2 bg-gradient-to-l from-ink via-ink/60 to-transparent rtl:bg-gradient-to-r'
      }`}
    >
      <button
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/80 text-bone shadow-xl backdrop-blur-md transition-all duration-200 hover:scale-110 hover:border-gilt/60 hover:bg-black hover:text-gilt active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt"
      >
        <Icon className="size-5 rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  );
}
