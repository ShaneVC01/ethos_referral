import { cn } from '@/lib/utils';
import { ICONS, type UiIconName } from './icons';
import type { SoftTone } from './kpi-card';

/** Fully rounded filter button with a count. Used for bucket bars and quick filters. Never wraps the page sideways on phones. */
export interface PillFilterProps {
  label: string;
  count?: number;
  icon?: UiIconName;
  active?: boolean;
  onClick: () => void;
  /** Icon colour when the filter has work to do. Count is always shown as text. */
  tone?: SoftTone;
  className?: string;
}

const ICON_TONE: Record<SoftTone, string> = {
  neutral: 'text-ink-muted',
  accent: 'text-accent',
  danger: 'text-danger',
  warning: 'text-warn',
  info: 'text-info',
  success: 'text-ok',
};

export function PillFilter({ label, count, icon, active = false, onClick, tone = 'neutral', className }: PillFilterProps) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium md:h-9',
        active ? 'border-accent bg-accent-subtle text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={cn(active ? 'text-accent' : ICON_TONE[tone])} /> : null}
      <span className="whitespace-nowrap">{label}</span>
      {count !== undefined ? <span className={cn('tabular rounded-full px-2 text-sm', active ? 'bg-surface text-ink' : 'bg-panel text-ink')}>{count}</span> : null}
    </button>
  );
}
