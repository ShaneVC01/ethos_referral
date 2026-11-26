import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ICONS, type UiIconName } from './icons';

/** Hairline-bordered container. The only card-like surface. No nested cards. */
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Set false for edge-to-edge content such as tables. */
  padded?: boolean;
  children: ReactNode;
}

export function Panel({ title, description, actions, padded = true, className, children, ...rest }: PanelProps) {
  const headingId = title ? `panel-${String(title).replace(/\W+/g, '-').toLowerCase()}` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex min-w-0 flex-col rounded-panel border border-line bg-surface', className)}
      {...rest}
    >
      {title || actions ? (
        <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3">
          <div className="flex min-w-0 flex-col">
            {title ? (
              <h2 id={headingId} className="text-lg font-semibold leading-tight text-ink">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1', padded && 'p-4')}>{children}</div>
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-line-subtle', className)} />;
}

export interface EmptyStateProps {
  icon?: UiIconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Teaches the next step rather than saying "nothing here". Pass an action when one exists. */
export function EmptyState({ icon = 'inbox', title, description, action, className }: EmptyStateProps) {
  const Icon = ICONS[icon];
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <span className="flex size-10 items-center justify-center rounded-pill bg-panel text-ink-muted">
        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-lg font-semibold text-ink">{title}</p>
        {description ? <p className="text-base text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

export interface KeyValueProps {
  items: Array<{ label: string; value: ReactNode }>;
  /** 1 column for narrow panels, 2 for wide ones. */
  columns?: 1 | 2;
  className?: string;
}

export function KeyValue({ items, columns = 1, className }: KeyValueProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1', className)}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-sm text-ink-muted">{item.label}</dt>
          <dd className="min-w-0 break-words text-base text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-line bg-canvas px-1 text-xs font-medium text-ink-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
