import { Link } from 'react-router-dom';
import { ICONS } from '@/components/ui/icons';
import { PatientIdentity } from '@/components/ui/patient-identity';
import { StatusBadge } from '@/components/ui/badges';
import { useReferralMatches } from '@/data/hooks';
import { digitsOnly, formatDue, deriveAgeGroup, type Referral } from '@/domain';
import { isLikelyDuplicate } from './intakeModel';

export interface DuplicateCandidate {
  firstName: string;
  lastName: string;
  dob: string | null;
  phone: string;
  receivedDate: string;
}

/**
 * Live duplicate check while the intake is typed. Non-blocking: it names the matching referrals with a link,
 * and the agent decides. Matches on the same phone (last 9 digits) or the same name with the same date of birth.
 * Phones and names in this panel are masked as list rows, so the warning does not expose more than needed.
 */
export function DuplicateWarning({ candidate }: { candidate: DuplicateCandidate }) {
  const first = candidate.firstName.trim();
  const last = candidate.lastName.trim();
  const digits = digitsOnly(candidate.phone) ?? '';
  const phoneReady = digits.length === 10;

  const byLastName = useReferralMatches(last, last.length >= 2);
  const byPhone = useReferralMatches(phoneReady ? digits : '', phoneReady);

  if (!first || !last) return null;

  const pool = new Map<string, Referral>();
  for (const r of [...(byLastName.data?.items ?? []), ...(byPhone.data?.items ?? [])]) pool.set(r.id, r);
  const matches = [...pool.values()].filter((r) =>
    isLikelyDuplicate(
      { patientFirstName: first, patientLastName: last, dob: candidate.dob, phone: candidate.phone },
      r,
    ),
  );

  if (matches.length === 0) return null;

  return (
    <section
      aria-labelledby="dup-title"
      role="status"
      className="flex flex-col gap-3 rounded-panel border border-line bg-warn-bg p-4"
    >
      <h3 id="dup-title" className="flex items-center gap-2 text-base font-semibold text-warn-fg">
        <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" />
        {matches.length === 1 ? 'Possible duplicate or sibling' : `${matches.length} possible duplicates or siblings`}
      </h3>
      <p className="text-sm text-ink">Check these before saving. Saving is still allowed, for example for a sibling.</p>
      <ul className="flex flex-col gap-2">
        {matches.slice(0, 5).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface p-3">
            <PatientIdentity
              variant="row"
              firstName={r.patientFirstName}
              lastName={r.patientLastName}
              dob={r.dob}
              ageGroup={r.ageGroup ?? deriveAgeGroup(r.dob, r.receivedAt)}
              phone={r.phone}
              maskPhone
            />
            <div className="flex items-center gap-3">
              <StatusBadge status={r.status} />
              <span className="text-sm text-ink-muted">{formatDue(r.receivedAt)}</span>
              <Link to={`/referrals/${r.id}`} className="text-sm font-medium text-accent underline underline-offset-4">
                Open {r.referenceNumber}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
