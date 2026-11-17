import type { ReactNode } from 'react';
import { Check } from '../components/Icons';

export interface MenuItem { id: string; label: string; hint?: string }

export function ControlButton({ 
  label, 
  onClick, 
  children, 
  active = false, 
  disabled = false,
  onDisabledClick,
  className = '' 
}: { 
  label: string; 
  onClick: () => void; 
  children: ReactNode; 
  active?: boolean; 
  disabled?: boolean;
  onDisabledClick?: () => void;
  className?: string 
}) {
  const handleClick = () => {
    if (disabled && onDisabledClick) {
      onDisabledClick();
    } else if (!disabled) {
      onClick();
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); handleClick(); }}
      className={`inline-flex size-9 sm:size-10 items-center justify-center rounded-full transition-all duration-200 hover:bg-white/15 hover:scale-105 active:scale-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gilt ${active ? 'bg-white/15 text-gilt shadow-[0_0_12px_rgba(212,175,106,0.35)]' : 'text-bone/90 hover:text-white'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** Popover that opens above or below its control button; items show a check next to the selection. */
export function Menu({
  title,
  items,
  selected,
  onSelect,
  footer,
  placement = 'bottom',
}: {
  title: string;
  items: MenuItem[];
  selected: string;
  onSelect: (id: string) => void;
  footer?: ReactNode;
  placement?: 'bottom' | 'top';
}) {
  const positionClass = placement === 'top'
    ? 'top-[calc(100%+0.5rem)] end-0'
    : 'bottom-[calc(100%+0.75rem)] end-0';

  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className={`absolute ${positionClass} z-30 max-h-[min(22rem,58cqh)] min-w-[13.5rem] max-w-[min(22rem,85cqw)] animate-fade overflow-y-auto scrollbar-thin rounded-2xl border border-white/15 bg-coal/95 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl`}
    >
      <p className="px-3 pb-2 pt-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-gilt border-b border-white/[0.06] mb-1">{title}</p>
      <div className="flex flex-col gap-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            role="menuitemradio"
            aria-checked={it.id === selected}
            onClick={() => onSelect(it.id)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-xs sm:text-sm transition-all duration-150 active:scale-[0.98] ${
              it.id === selected 
                ? 'bg-white/10 text-bone font-medium' 
                : 'text-dust hover:bg-white/[0.07] hover:text-bone'
            }`}
          >
            <span className="flex size-4 shrink-0 items-center justify-center text-gilt">
              {it.id === selected && <Check className="size-4" />}
            </span>
            <span className="min-w-0 flex-1 truncate" dir="auto">{it.label}</span>
            {it.hint && <span className="text-[11px] text-dust/70 shrink-0 font-mono">{it.hint}</span>}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
