import { cn } from '@/lib/utils';

/**
 * Ethos wordmark. Prefer the logo PNG (public/brand/ethos-logo.png) for the header and login.
 * This SVG is a text fallback in Montserrat (falls back to Figtree) for places where the PNG cannot load.
 */
export function Wordmark({ className, title = 'Ethos Orthodontics' }: { className?: string; title?: string }) {
  return (
    <span role="img" aria-label={title} className={cn('inline-flex items-baseline font-brand text-ink', className)}>
      <span className="text-lg font-medium lowercase tracking-tight">ethos</span>
      <span className="ml-1.5 text-sm font-light lowercase tracking-wide text-accent">orthodontics</span>
    </span>
  );
}

/** Square monogram for compact spaces such as the rail. */
export function Monogram({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Ethos Orthodontics"
      className={cn('inline-flex size-8 items-center justify-center rounded-control bg-accent font-brand text-base font-medium lowercase text-accent-fg', className)}
    >
      e
    </span>
  );
}
