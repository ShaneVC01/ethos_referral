import { AGE_GROUP_LABELS, formatAuMobile, formatAuDate, maskPhone, digitsOnly, type AgeGroup } from '@/domain';
import { cn } from '@/lib/utils';
import { ICONS } from './icons';
import { UrgentBadge } from './badges';

export interface PatientIdentityProps {
  firstName: string;
  lastName: string;
  /** 'YYYY-MM-DD' or null. */
  dob: string | null;
  ageGroup: AgeGroup | null;
  phone: string | null;
  /** Lists mask the phone until the row is opened. Detail and logging show it in full. */
  maskPhone?: boolean;
  urgent?: boolean;
  /** Shown when another referral has a similar name, sibling or possible duplicate. */
  possibleDuplicate?: boolean;
  /** 'header' is the large version for detail screens. 'row' is for tables and lists. */
  variant?: 'header' | 'row';
  className?: string;
}

/**
 * The patient identity block. Name, DOB, age group and phone are always shown together on
 * detail and log screens, so a wrong-patient action is hard to make. Phones are tap-to-call.
 */
export function PatientIdentity({
  firstName,
  lastName,
  dob,
  ageGroup,
  phone,
  maskPhone: masked = false,
  urgent = false,
  possibleDuplicate = false,
  variant = 'header',
  className,
}: PatientIdentityProps) {
  const name = `${firstName} ${lastName}`.trim() || 'Name not entered';
  const digits = digitsOnly(phone);
  const telHref = digits ? `tel:+61${digits.slice(1)}` : null;
  const phoneText = masked ? maskPhone(phone) : formatAuMobile(phone);
  const ageLabel = ageGroup ? `${AGE_GROUP_LABELS[ageGroup]} (${ageGroup})` : 'Age not set';

  if (variant === 'row') {
    return (
      <div className={cn('flex min-w-0 flex-col', className)}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-ink">{name}</span>
          {urgent ? <ICONS.flag size={16} strokeWidth={1.5} aria-label="Urgent" className="shrink-0 text-danger" /> : null}
          {possibleDuplicate ? (
            <span className="shrink-0 text-sm text-warn-fg">Possible duplicate</span>
          ) : null}
        </span>
        <span className="tabular truncate text-sm text-ink-muted">
          {dob ? formatAuDate(dob) : 'DOB not set'} · {ageGroup ?? '-'} · {phoneText || 'No phone'}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="min-w-0 break-words text-xl font-semibold leading-tight text-ink">{name}</h1>
        {urgent ? <UrgentBadge /> : null}
        {possibleDuplicate ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-warn-bg px-2 text-sm font-medium text-warn-fg">
            <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" />
            Possible duplicate or sibling
          </span>
        ) : null}
      </div>
      <dl className="tabular flex flex-wrap gap-x-5 gap-y-1 text-base text-ink">
        <div className="flex gap-1.5">
          <dt className="text-ink-muted">DOB</dt>
          <dd>{dob ? formatAuDate(dob) : 'Not set'}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink-muted">Age group</dt>
          <dd>{ageLabel}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-ink-muted">Phone</dt>
          <dd>
            {telHref && !masked ? (
              <a href={telHref} className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                {phoneText}
              </a>
            ) : (
              phoneText || 'No phone'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
