export const Skel = ({ className = '' }: { className?: string }) => (
  <div className={`skeleton rounded-xl ${className}`} />
);

export function CardSkeleton({ landscape = false }: { landscape?: boolean }) {
  return (
    <div className={`shrink-0 ${landscape ? 'aspect-video w-[var(--card-w)]' : 'aspect-[2/3] w-[var(--poster-w)]'}`}>
      <Skel className="size-full" />
    </div>
  );
}

export function RowSkeleton({ landscape = false }: { landscape?: boolean }) {
  return (
    <section className="py-2.5 sm:py-3.5" aria-hidden>
      <div className="mb-3 px-[var(--pad)]">
        <Skel className="h-5 w-36 sm:w-48 rounded-lg" />
      </div>
      <div className="flex gap-3.5 sm:gap-4 overflow-hidden px-[var(--pad)] py-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skel
            key={i}
            className={`shrink-0 ${landscape ? 'aspect-video w-[var(--card-w)]' : 'aspect-[2/3] w-[var(--poster-w)]'}`}
          />
        ))}
      </div>
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <div className="relative isolate h-[clamp(30rem,70vh,45rem)] w-full overflow-hidden select-none" aria-hidden>
      <Skel className="absolute inset-0 rounded-none -z-20" />
      
      {/* Vignettes matching Hero */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/95 via-ink/75 via-40% to-transparent rtl:bg-gradient-to-l" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-44 bg-gradient-to-t from-ink via-ink/70 to-transparent" />
      <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-ink/80 via-ink/25 to-transparent" />

      <div className="absolute inset-x-0 bottom-6 sm:bottom-10 px-[var(--pad)] flex flex-col gap-3.5 max-w-2xl">
        <Skel className="h-4 w-28 rounded-md" />
        <Skel className="h-12 sm:h-16 w-3/4 rounded-xl" />
        <div className="flex gap-2.5 my-1">
          <Skel className="h-4 w-14 rounded-full" />
          <Skel className="h-4 w-12 rounded-full" />
          <Skel className="h-4 w-16 rounded-full" />
        </div>
        <Skel className="h-14 w-full rounded-xl hidden sm:block" />
        <div className="flex gap-3 pt-2">
          <Skel className="h-11 sm:h-12 w-32 sm:w-36 rounded-xl" />
          <Skel className="h-11 sm:h-12 w-28 sm:w-32 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
