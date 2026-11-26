import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  OUTCOME_META,
  SMS_STATUS_META,
  STATUS_META,
  type ContactOutcome,
  type Meta,
  type ReferralStatus,
  type SmsStatus,
  type Tone,
} from '@/domain';
import { DOMAIN_ICON, ICONS } from './icons';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-neutral-bg text-ink-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-ok-bg text-ok',
  warning: 'bg-warn-bg text-warn-fg',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
};

export interface BadgeProps {
  tone?: Tone;
  /** Icon from ICONS. Always paired with the label, never colour alone. */
  icon?: keyof typeof ICONS;
  children: ReactNode;
  className?: string;
  title?: string;
}

/** Generic pill. Use the typed wrappers below for statuses so tone and icon stay consistent. */
export function Badge({ tone = 'neutral', icon, children, className, title }: BadgeProps) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-pill px-2 text-sm font-medium',
        toneClass[tone],
        className,
      )}
    >
      {Icon ? <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Any domain meta (status, outcome, SMS status). */
export function MetaBadge({ meta, className }: { meta: Meta; className?: string }) {
  const Icon = DOMAIN_ICON[meta.icon];
  return (
    <span className={cn('inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-pill px-2 text-sm font-medium', toneClass[meta.tone], className)}>
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

export function StatusBadge({ status, className }: { status: ReferralStatus; className?: string }) {
  return <MetaBadge meta={STATUS_META[status]} className={className} />;
}

export function OutcomeBadge({ outcome, className }: { outcome: ContactOutcome; className?: string }) {
  return <MetaBadge meta={OUTCOME_META[outcome]} className={className} />;
}

export function SmsStatusBadge({ status, className }: { status: SmsStatus; className?: string }) {
  return <MetaBadge meta={SMS_STATUS_META[status]} className={className} />;
}

/** Urgent flag. The only loud colour in the app. Shown on rows and detail headers. */
export function UrgentBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-pill bg-danger-bg px-2 text-sm font-medium text-danger', className)}>
      <ICONS.flag size={16} strokeWidth={1.5} aria-hidden="true" />
      Urgent
    </span>
  );
}
