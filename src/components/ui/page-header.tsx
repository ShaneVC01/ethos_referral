import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Back link for detail pages. Give the route, not patient data. */
  back?: { to: string; label: string };
  actions?: ReactNode;
  className?: string;
}

/** Page title row. Sentence case, no eyebrow labels. Actions wrap under the title on phones. */
export function PageHeader({ title, description, back, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-start justify-between gap-3 pb-4', className)}>
      <div className="flex min-w-0 flex-col gap-1">
        {back ? (
          <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ICONS.back size={16} strokeWidth={1.5} aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <h1 className="text-xl font-semibold leading-tight text-ink">{title}</h1>
        {description ? <p className="text-base text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
