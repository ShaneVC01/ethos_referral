import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/forms';
import { ICONS } from '@/components/ui/icons';
import { useLookups, usePracticeMap, useReferrer, useReferrerSearch } from '@/data/hooks';
import { clinicName, type IntakeState } from './intakeModel';

export interface ReferrerPickerProps {
  value: IntakeState['referrer'];
  onChange: (next: IntakeState['referrer']) => void;
  errorFor: (key: string) => string | undefined;
  touch: (key: string) => void;
}

/**
 * Referrer typeahead over the Referrer Master. Search by name, practice or suburb. The option line shows
 * practice, segment and primary clinic. Referrers who are not in the list enter free text instead, which
 * the repository keeps as a referrer block on the referral.
 */
export function ReferrerPicker({ value, onChange, errorFor, touch }: ReferrerPickerProps) {
  const [query, setQuery] = useState('');
  const search = useReferrerSearch(query, !value.notListed);
  const selected = useReferrer(value.referrerId ?? undefined);
  const lookups = useLookups();
  const items = search.data ?? [];
  const practices = usePracticeMap(items.map((r) => r.practiceId));

  const options: ComboboxOption<string>[] = items.map((r) => ({
    value: r.id,
    label: `${r.firstName} ${r.lastName}`.trim(),
    description: [practices.get(r.practiceId ?? '')?.name, r.segment, clinicName(lookups.data, r.primaryClinicId)]
      .filter(Boolean)
      .join(', '),
  }));

  const selectedName = selected.data ? `${selected.data.firstName} ${selected.data.lastName}`.trim() : undefined;

  if (value.notListed) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-muted">Referrer not in the list. Enter the details as they came in.</p>
          <Button variant="ghost" size="sm" icon="search" onClick={() => onChange({ ...value, notListed: false, name: '', phone: '', email: '', address: '' })}>
            Search the list instead
          </Button>
        </div>
        <Field label="Referrer name" required error={errorFor('referrer.name')} id="intake-referrerName">
          <Input value={value.name} autoComplete="off" onChange={(e) => onChange({ ...value, name: e.target.value })} onBlur={() => touch('referrer.name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errorFor('referrer.phone')} id="intake-referrerPhone">
            <Input inputMode="tel" autoComplete="off" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} onBlur={() => touch('referrer.phone')} />
          </Field>
          <Field label="Email" error={errorFor('referrer.email')} id="intake-referrerEmail">
            <Input inputMode="email" autoComplete="off" spellCheck={false} value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} onBlur={() => touch('referrer.email')} />
          </Field>
        </div>
        <Field label="Address" id="intake-referrerAddress">
          <Input autoComplete="off" value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
        </Field>
      </div>
    );
  }

  const chosen = value.referrerId ? items.find((r) => r.id === value.referrerId) ?? selected.data ?? null : null;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Referrer" hint="Search by name, practice or suburb. At least 2 letters." id="intake-referrer">
        <Combobox<string>
          label="Referrer"
          value={value.referrerId}
          selectedLabel={selectedName}
          options={options}
          loading={search.isFetching}
          onInputChange={setQuery}
          placeholder="Start typing a name or practice"
          emptyText="No referrer matches that. Try a different spelling, or enter them as not in the list."
          onChange={(id) => onChange({ ...value, referrerId: id, notListed: false })}
        />
      </Field>
      {chosen ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
          <ICONS.check size={16} strokeWidth={1.5} aria-hidden="true" className="text-ok" />
          <span>
            {chosen.segment}, primary clinic {clinicName(lookups.data, chosen.primaryClinicId) ?? 'not recorded'}
          </span>
          <Link to={`/referrers/${chosen.id}`} className="font-medium text-accent underline underline-offset-4">
            Open referrer profile
          </Link>
        </p>
      ) : null}
      <div>
        <Button variant="ghost" size="sm" icon="plus" onClick={() => onChange({ ...value, referrerId: null, notListed: true })}>
          Referrer not in the list
        </Button>
      </div>
    </div>
  );
}
