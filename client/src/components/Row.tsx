import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { ChevronLeft, ChevronRight } from './Icons';

interface RowProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
}

/** Netflix-style cinematic horizontal row with edge paddle scrollers and RTL awareness. */
export const Row = memo(function Row({ title, subtitle, children, action }: RowProps) {
  const { dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pos = Math.abs(el.scrollLeft);
    setEdge({
      start: pos < 10,
      end: pos + el.clientWidth >= el.scrollWidth - 10,
    });
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

    // Scroll by visible cards minus 1 to keep context peek
    const firstChild = el.querySelector<HTMLElement>('.snap-start');
    const cardWidth = firstChild ? firstChild.offsetWidth + 16 : 220;
    const visibleCards = Math.max(1, Math.floor(el.clientWidth / cardWidth));
    const scrollCards = Math.max(1, visibleCards > 2 ? visibleCards - 0.5 : visibleCards);
    const scrollDistance = scrollCards * cardWidth;

    el.scrollBy({ left: sign * scrollDistance, behavior: 'smooth' });
  };

  return (
    <section className="group/row relative py-2 sm:py-3.5">
      {/* Header */}
      <div className="mb-2 sm:mb-3 px-[var(--pad)] flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[1.1rem] sm:text-[1.28rem] font-bold tracking-tight text-bone select-none transition-colors group-hover/row:text-white">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-dust/70 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Row Scroller with Netflix Edge Paddles */}
      <div className="relative">
        <div
          ref={ref}
          onScroll={measure}
          className="no-scrollbar flex snap-x snap-mandatory gap-3.5 sm:gap-4 overflow-x-auto scroll-smooth px-[var(--pad)] py-2 [scroll-padding-inline:var(--pad)]"
        >
          {children}
        </div>

        {/* Start Edge Paddle */}
        {!edge.start && (
          <RowPaddle side="start" onClick={() => scroll(false)} />
        )}

        {/* End Edge Paddle */}
        {!edge.end && (
          <RowPaddle side="end" onClick={() => scroll(true)} />
        )}
      </div>
    </section>
  );
});

function RowPaddle({ side, onClick }: { side: 'start' | 'end'; onClick: () => void }) {
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
      className={`pointer-events-none absolute inset-y-2 z-20 hidden items-center opacity-0 transition-opacity duration-300 group-hover/row:opacity-100 sm:flex ${
        side === 'start'
          ? 'start-0 w-14 sm:w-16 justify-start ps-1 bg-gradient-to-r from-ink/90 via-ink/50 to-transparent rtl:bg-gradient-to-l'
          : 'end-0 w-14 sm:w-16 justify-end pe-1 bg-gradient-to-l from-ink/90 via-ink/50 to-transparent rtl:bg-gradient-to-r'
      }`}
    >
      <button
        onClick={onClick}
        aria-label={label}
        className="pointer-events-auto flex size-10 sm:size-11 items-center justify-center rounded-full border border-white/15 bg-black/75 text-bone/90 shadow-2xl backdrop-blur-md transition-all duration-200 hover:scale-115 hover:border-white/40 hover:bg-black/95 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt cursor-pointer"
      >
        <Icon className="size-5 sm:size-6 rtl:-scale-x-100" aria-hidden="true" />
      </button>
    </div>
  );
}
