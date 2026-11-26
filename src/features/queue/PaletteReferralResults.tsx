import { Command } from 'cmdk';
import { useReferrals } from '@/data/hooks';
import { ICONS } from '@/components/ui/icons';

export interface PaletteReferralResultsProps {
  query: string;
  onSelect: (referralId: string) => void;
}

/**
 * Referral results for the command palette, searched by name, reference or phone digits.
 * Items use forceMount so cmdk's own text filter does not hide server results.
 * Results show the patient name only in the palette, never in the URL. Selecting one opens the opaque referral route.
 */
export function PaletteReferralResults({ query, onSelect }: PaletteReferralResultsProps) {
  const q = query.trim();
  const list = useReferrals({ search: q.length >= 2 ? q : undefined, limit: 8 });
  if (q.length < 2) return null;
  const items = list.data?.items ?? [];
  return (
    <Command.Group heading="Referrals" className="text-sm text-ink-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
      {items.map((r) => (
        <Command.Item
          key={r.id}
          value={`referral ${r.id} ${r.patientFirstName} ${r.patientLastName} ${r.referenceNumber}`}
          forceMount
          onSelect={() => onSelect(r.id)}
          className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-control px-3 text-base text-ink data-[selected=true]:bg-accent-subtle md:min-h-9"
        >
          <span className="flex min-w-0 items-center gap-3">
            <ICONS.referrals size={20} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
            <span className="truncate">
              {r.patientFirstName} {r.patientLastName}
            </span>
          </span>
          <span className="tabular shrink-0 text-sm text-ink-muted">{r.referenceNumber}</span>
        </Command.Item>
      ))}
      {list.isSuccess && items.length === 0 ? <p className="px-3 py-2 text-base text-ink-muted">No referral matches “{q}”.</p> : null}
    </Command.Group>
  );
}
