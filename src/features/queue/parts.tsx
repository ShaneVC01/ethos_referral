import { Link } from 'react-router-dom';
import { type NextAction, type Referral, STATUS_META, formatDue, formatAuDate } from '@/domain';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/badges';
import { PatientIdentity } from '@/components/ui/patient-identity';
import { ICONS } from '@/components/ui/icons';
import { clinicDay } from './queue-model';

/** Next action in plain words, with overdue shown as icon and text, never colour alone. */
export function NextActionText({ next, closedText = 'No action due' }: { next: NextAction | null; closedText?: string }) {
  if (!next) return <span className="text-ink-muted">{closedText}</span>;
  return (
    <span className={cn('flex min-w-0 items-start gap-1.5', next.overdue ? 'text-danger' : 'text-ink')}>
      {next.overdue ? <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0" /> : null}
      <span className="min-w-0">{next.label}</span>
    </span>
  );
}

/** Patient cell for lists. Phone is masked until the row is opened. */
export function PatientCell({ r, possibleDuplicate = false }: { r: Referral; possibleDuplicate?: boolean }) {
  return (
    <PatientIdentity
      variant="row"
      firstName={r.patientFirstName}
      lastName={r.patientLastName}
      dob={r.dob}
      ageGroup={r.ageGroup}
      phone={r.phone}
      maskPhone
      urgent={r.flags.urgent}
      possibleDuplicate={possibleDuplicate}
    />
  );
}

export function StatusCell({ r }: { r: Referral }) {
  return <StatusBadge status={r.status} />;
}

/** Cadence step label used in lists, for example "Day 1 of 3 months" as plain text. */
export function stepText(r: Referral): string {
  if (r.closedReason) return 'Closed';
  const names = ['Coax #1', 'Day 1 call', 'Day 14 call', '3 month final', 'Finished'];
  return names[r.currentStep] ?? 'Finished';
}

export function dueText(r: Referral): string {
  return r.nextActionAt ? formatDue(r.nextActionAt) : '';
}

export function receivedText(r: Referral): string {
  return formatAuDate(clinicDay(r.receivedAt));
}

/** Plain-language status for the header and for screen readers. */
export function statusText(r: Referral): string {
  return STATUS_META[r.status].label;
}

/** A referral row link is not used: rows open through DataTable so the URL stays opaque and keyboard works. */
export function ReferrerLink({ referrerId, name }: { referrerId: string | null; name: string }) {
  if (!referrerId) return <span className="text-ink-muted">{name || 'Not set'}</span>;
  return (
    <Link
      to={`/referrers/${referrerId}`}
      onClick={(e) => e.stopPropagation()}
      className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent"
    >
      {name || referrerId}
    </Link>
  );
}
