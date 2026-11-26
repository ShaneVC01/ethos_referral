import { useEffect, useMemo, useState } from 'react';
import type { Clinic, ClinicAlias, Orthodontist, OrthoAlias, RosterEntry } from '@/domain';
import type { Lookups } from '@/data/repository';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/forms';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useLookups } from '@/data/hooks';
import { useAuth } from '@/app/auth';
import { useUpdateLookups } from './hooks';
import type { TabProps } from './types';

const WEEKDAYS = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
] as const;

interface Draft {
  clinics: Clinic[];
  clinicAliasText: Record<string, string>;
  orthodontists: Orthodontist[];
  orthoAliasText: Record<string, string>;
  roster: RosterEntry[];
}

function aliasesToText<T extends { clinicId: string } | { orthodontistId: string }>(list: T[], idOf: (a: T) => string, aliasOf: (a: T) => string, id: string) {
  return list
    .filter((a) => idOf(a) === id)
    .map((a) => aliasOf(a))
    .join(', ');
}

function parseAliases(text: string): string[] {
  return [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))];
}

function buildDraft(l: Lookups): Draft {
  return {
    clinics: l.clinics,
    clinicAliasText: Object.fromEntries(l.clinics.map((c) => [c.id, aliasesToText<ClinicAlias>(l.clinicAliases, (a) => a.clinicId, (a) => a.alias, c.id)])),
    orthodontists: l.orthodontists,
    orthoAliasText: Object.fromEntries(
      l.orthodontists.map((o) => [o.id, aliasesToText<OrthoAlias>(l.orthoAliases, (a) => a.orthodontistId, (a) => a.alias, o.id)]),
    ),
    roster: l.roster,
  };
}

/** Compares two drafts by value. Used for the dirty flag. */
function same(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function LookupsTab({ onDirtyChange }: TabProps) {
  const lookups = useLookups();
  if (!lookups.data) return <Skeleton className="h-96 w-full" />;
  return <LookupsEditor saved={lookups.data} onDirtyChange={onDirtyChange} />;
}

function LookupsEditor({ saved, onDirtyChange }: { saved: Lookups } & TabProps) {
  const { user } = useAuth();
  const update = useUpdateLookups();
  const baseline = useMemo(() => buildDraft(saved), [saved]);
  const [draft, setDraft] = useState<Draft>(baseline);

  const dirty = !same(draft, baseline);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const clinicNames = useMemo(() => Object.fromEntries(draft.clinics.map((c) => [c.id, c.name])), [draft.clinics]);
  const activeClinics = draft.clinics.filter((c) => c.active);
  const activeOrthos = draft.orthodontists.filter((o) => o.active);

  /** Validation: every alias must be unique within its list, and short codes must be unique. */
  const problems = useMemo(() => {
    const out: string[] = [];
    const seen = new Map<string, string>();
    for (const c of draft.clinics) {
      for (const alias of parseAliases(draft.clinicAliasText[c.id] ?? '')) {
        const key = alias.toLowerCase();
        if (seen.has(key)) out.push(`The clinic alias ${alias} is used for both ${seen.get(key)} and ${c.name}.`);
        else seen.set(key, c.name);
      }
    }
    const codes = new Set<string>();
    for (const o of draft.orthodontists) {
      const code = o.shortCode.trim().toUpperCase();
      if (!code) out.push(`${o.fullName} needs a short code.`);
      else if (codes.has(code)) out.push(`The short code ${code} is used more than once.`);
      codes.add(code);
    }
    return out;
  }, [draft]);

  const setClinic = (id: string, patch: Partial<Clinic>) =>
    setDraft((d) => ({ ...d, clinics: d.clinics.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setOrtho = (id: string, patch: Partial<Orthodontist>) =>
    setDraft((d) => ({ ...d, orthodontists: d.orthodontists.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));

  /** Replaces every roster entry for one clinic and weekday with a single orthodontist, or clears it. */
  const setRoster = (clinicId: string, weekday: number, orthodontistId: string) => {
    setDraft((d) => ({
      ...d,
      roster: [
        ...d.roster.filter((r) => !(r.clinicId === clinicId && r.weekday === weekday)),
        ...(orthodontistId ? [{ id: `ros_${crypto.randomUUID()}`, clinicId, weekday, orthodontistId, notes: null }] : []),
      ],
    }));
  };

  const save = async () => {
    if (!user || problems.length) return;
    const clinicAliases: ClinicAlias[] = draft.clinics.flatMap((c) => parseAliases(draft.clinicAliasText[c.id] ?? '').map((alias) => ({ alias, clinicId: c.id })));
    const orthoAliases: OrthoAlias[] = draft.orthodontists.flatMap((o) => {
      const existing = saved.orthoAliases.filter((a) => a.orthodontistId === o.id);
      return parseAliases(draft.orthoAliasText[o.id] ?? '').map((alias) => ({
        alias,
        orthodontistId: o.id,
        confirmed: existing.find((e) => e.alias === alias)?.confirmed ?? true,
      }));
    });
    try {
      await update.mutateAsync({
        patch: { clinics: draft.clinics, clinicAliases, orthodontists: draft.orthodontists, orthoAliases, roster: draft.roster },
        actorId: user.id,
      });
      notifySuccess('Clinics, orthodontists and roster saved.');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'These changes could not be saved.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Aliases are the codes used in the tracker, separated by commas. Inactive clinics and orthodontists stay on past referrals.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || update.isPending} onClick={() => setDraft(baseline)}>
            Discard changes
          </Button>
          <Button size="sm" loading={update.isPending} disabled={!dirty || problems.length > 0} onClick={() => void save()}>
            Save lookups
          </Button>
        </div>
      </div>
      {problems.length ? (
        <div role="alert" className="rounded-panel border border-danger bg-danger-bg p-3 text-sm text-danger">
          <p className="font-medium">Fix these before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Panel title="Clinics" description="Only active clinics appear in intake and the roster.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">Clinics, code, active and aliases</caption>
            <thead>
              <tr className="border-b border-line bg-panel text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">Clinic</th>
                <th scope="col" className="px-3 py-2 font-medium">Code</th>
                <th scope="col" className="px-3 py-2 font-medium">Active</th>
                <th scope="col" className="px-3 py-2 font-medium">Aliases</th>
              </tr>
            </thead>
            <tbody>
              {draft.clinics.map((c) => (
                <tr key={c.id} className="border-b border-line-subtle">
                  <td className="px-3 py-2 text-ink">{c.name}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">{c.code}</td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent)]"
                      aria-label={`${c.name} active`}
                      checked={c.active}
                      onChange={(e) => setClinic(c.id, { active: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Aliases for ${c.name}`}
                      value={draft.clinicAliasText[c.id] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, clinicAliasText: { ...d.clinicAliasText, [c.id]: e.target.value } }))}
                      placeholder="For example TOOW, TWG"
                      className="min-w-[12rem]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Orthodontists" description="Short codes are the tracker initials for orthodontists. Resigned orthodontists stay inactive.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <caption className="sr-only">Orthodontists, short code, active and aliases</caption>
            <thead>
              <tr className="border-b border-line bg-panel text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Short code</th>
                <th scope="col" className="px-3 py-2 font-medium">Active</th>
                <th scope="col" className="px-3 py-2 font-medium">Aliases</th>
              </tr>
            </thead>
            <tbody>
              {draft.orthodontists.map((o) => (
                <tr key={o.id} className="border-b border-line-subtle">
                  <td className="px-3 py-2">
                    <Input aria-label={`Name for orthodontist ${o.shortCode}`} value={o.fullName} onChange={(e) => setOrtho(o.id, { fullName: e.target.value })} className="min-w-[10rem]" />
                  </td>
                  <td className="px-3 py-2">
                    <Input aria-label={`Short code for ${o.fullName}`} value={o.shortCode} onChange={(e) => setOrtho(o.id, { shortCode: e.target.value.toUpperCase() })} className="w-28 uppercase" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent)]"
                      aria-label={`${o.fullName} active`}
                      checked={o.active}
                      onChange={(e) => setOrtho(o.id, { active: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`Aliases for ${o.fullName}`}
                      value={draft.orthoAliasText[o.id] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, orthoAliasText: { ...d.orthoAliasText, [o.id]: e.target.value } }))}
                      className="min-w-[10rem]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Weekday roster" description="Who is in each clinic each day. A cell with two orthodontists keeps the first one until you change it.">
        {activeClinics.length === 0 ? (
          <p className="text-sm text-ink-muted">No active clinics. Turn a clinic on above to build its roster.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">Weekday roster by clinic</caption>
              <thead>
                <tr className="border-b border-line bg-panel text-left text-ink-muted">
                  <th scope="col" className="px-3 py-2 font-medium">Clinic</th>
                  {WEEKDAYS.map((w) => (
                    <th key={w.n} scope="col" className="px-2 py-2 font-medium">
                      {w.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeClinics.map((c) => (
                  <tr key={c.id} className="border-b border-line-subtle">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
                      {clinicNames[c.id]}
                    </th>
                    {WEEKDAYS.map((w) => {
                      const entries = draft.roster.filter((r) => r.clinicId === c.id && r.weekday === w.n);
                      const current = entries[0]?.orthodontistId ?? '';
                      const currentOrtho = draft.orthodontists.find((o) => o.id === current);
                      const options = currentOrtho && !currentOrtho.active ? [...activeOrthos, currentOrtho] : activeOrthos;
                      return (
                        <td key={w.n} className="px-2 py-2">
                          <Select
                            aria-label={`${c.name}, ${w.label}`}
                            value={current}
                            onChange={(e) => setRoster(c.id, w.n, e.target.value)}
                            className="w-40"
                          >
                            <option value="">Not rostered</option>
                            {options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.fullName}
                              </option>
                            ))}
                          </Select>
                          {entries.length > 1 ? <p className="mt-1 text-xs text-ink-muted">Joint session, {entries.length} listed</p> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
