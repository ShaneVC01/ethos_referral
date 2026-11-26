import { cn } from '@/lib/utils';

export type SoftTone = 'neutral' | 'accent' | 'danger' | 'warning' | 'info' | 'success';

/** Number colour per tone. Each is at least 4.5:1 on white (see DESIGN.md, palette v2). */
export const KPI_NUMBER_TONE: Record<SoftTone, string> = {
  neutral: 'text-ink',
  accent: 'text-accent',
  danger: 'text-danger',
  warning: 'text-warn',
  info: 'text-info',
  success: 'text-ok',
};

export interface KpiCardProps {
  /** Uppercase label above the number, for example "Overdue". */
  label: string;
  count: number;
  tone?: SoftTone;
  /** Clicking filters the list below. The active card shows a teal ring and aria-pressed. */
  active?: boolean;
  onClick?: () => void;
  /** Caption under the number, for example "Past due contact point". */
  hint?: string;
  className?: string;
}

/** Summary card: small uppercase label, a large coloured count and a caption. White surface, clickable when onClick is given. */
export function KpiCard({ label, count, tone = 'neutral', active = false, onClick, hint, className }: KpiCardProps) {
  const body = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className={cn('tabular text-2xl font-semibold leading-none', KPI_NUMBER_TONE[tone])}>{count}</span>
      {hint ? <span className="text-sm text-ink-muted">{hint}</span> : null}
    </>
  );
  const base = cn(
    'flex min-h-[7.5rem] flex-col items-start gap-2 rounded-panel border bg-surface p-4 text-left shadow-card',
    active ? 'border-accent ring-2 ring-accent' : 'border-line',
    className,
  );
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label}, ${count}`}
      onClick={onClick}
      className={cn(base, 'transition-shadow duration-[var(--duration-fast)] hover:shadow-overlay')}
    >
      {body}
    </button>
  );
}
