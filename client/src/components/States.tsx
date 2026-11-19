import { useI18n } from '../i18n';
import { Sigil } from './Icons';

interface ErrorStateProps {
  title: string;
  hint: string;
  onRetry?: () => void;
}

export function ErrorState({ title, hint, onRetry }: ErrorStateProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-6 py-12 text-center animate-fade select-none"
    >
      <div className="relative flex size-16 items-center justify-center rounded-2xl bg-blood/10 border border-blood/25 shadow-[0_0_30px_rgba(179,32,47,0.2)]">
        <Sigil className="size-8 text-blood-hot" />
      </div>
      
      <div className="space-y-1.5 max-w-md">
        <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-bone">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-dust/80 leading-relaxed">
          {hint}
        </p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blood px-6 text-xs sm:text-sm font-bold text-white shadow-md shadow-blood/30 transition-all duration-200 hover:bg-blood-hot hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gilt cursor-pointer"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>{t('retry')}</span>
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({ title, hint, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex min-h-[40dvh] flex-col items-center justify-center gap-3.5 px-6 py-12 text-center animate-fade select-none"
    >
      <div className="flex size-14 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/10 text-dust shadow-inner">
        {icon || <Sigil className="size-7 text-dust/60" />}
      </div>

      <div className="space-y-1 max-w-sm">
        <h3 className="font-display text-base sm:text-lg font-bold text-bone">
          {title}
        </h3>
        {hint && (
          <p className="text-xs text-dust/70 leading-relaxed">
            {hint}
          </p>
        )}
      </div>

      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-xs font-semibold text-bone backdrop-blur-md transition-all duration-200 hover:border-gilt/40 hover:bg-white/10 hover:text-gilt active:scale-95 cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
