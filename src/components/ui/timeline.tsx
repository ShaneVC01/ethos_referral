import type { ReactNode } from 'react';
import { formatDateTime, type IconKey, type Tone } from '@/domain';
import { cn } from '@/lib/utils';
import { DOMAIN_ICON, ICONS, type UiIconName } from './icons';

export interface TimelineItem {
  id: string;
  /** ISO datetime. */
  at: string;
  title: ReactNode;
  body?: ReactNode;
  /** Who did it. Every entry shows who and when. */
  actor: string;
  icon?: IconKey | UiIconName;
  tone?: Tone;
}

const toneText: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  accent: 'text-accent',
  success: 'text-ok',
  warning: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
};

/** Unified history for a referral: SMS in and out, calls, notes and status changes. Newest first. */
export function Timeline({ items, emptyText = 'Nothing logged yet.' }: { items: TimelineItem[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="text-base text-ink-muted">{emptyText}</p>;
  }
  return (
    <ol className="flex flex-col">
      {items.map((item, i) => {
        const Icon = item.icon ? (item.icon in DOMAIN_ICON ? DOMAIN_ICON[item.icon as IconKey] : ICONS[item.icon as UiIconName]) : ICONS.dot;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 ? <span aria-hidden="true" className="absolute left-[11px] top-6 bottom-0 w-px bg-line" /> : null}
            <span
              className={cn(
                'relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-pill border border-line bg-surface',
                item.tone ? toneText[item.tone] : 'text-ink-muted',
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-base text-ink">{item.title}</div>
              {item.body ? <div className="whitespace-pre-line text-base text-ink-muted">{item.body}</div> : null}
              <time dateTime={item.at} className="tabular text-sm text-ink-muted">
                {formatDateTime(item.at)} · {item.actor}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
