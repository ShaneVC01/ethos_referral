import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/forms';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useStaff, useUpdateStaff } from '@/data/hooks';
import { ROLE_LABELS, useAuth } from '@/app/auth';
import type { Staff } from '@/domain';
import type { TabProps } from './types';

type Row = Pick<Staff, 'id' | 'initials' | 'name' | 'role' | 'active'>;

export function StaffTab({ onDirtyChange }: TabProps) {
  const staff = useStaff();
  if (!staff.data) return <Skeleton className="h-72 w-full" />;
  return <StaffEditor saved={staff.data} onDirtyChange={onDirtyChange} />;
}

function StaffEditor({ saved, onDirtyChange }: { saved: Staff[] } & TabProps) {
  const { user } = useAuth();
  const update = useUpdateStaff();
  const baseline: Row[] = useMemo(() => saved.map(({ id, initials, name, role, active }) => ({ id, initials, name, role, active })), [saved]);
  const [rows, setRows] = useState<Row[]>(baseline);

  const changed = rows.filter((r) => {
    const b = baseline.find((x) => x.id === r.id);
    return !!b && (b.name !== r.name || b.role !== r.role || b.active !== r.active);
  });
  const dirty = changed.length > 0;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const activeManagers = rows.filter((r) => r.active && r.role === 'manager').length;
  const problems: string[] = [];
  if (rows.some((r) => !r.name.trim())) problems.push('Every staff member needs a name.');
  if (activeManagers === 0) problems.push('Keep at least one active manager.');
  const selfChange = user ? changed.find((r) => r.id === user.id && (r.role !== user.role || !r.active)) : undefined;
  if (selfChange) problems.push('You cannot change your own role or deactivate yourself while signed in.');

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!user || problems.length) return;
    try {
      await Promise.all(changed.map((r) => update.mutateAsync({ id: r.id, patch: { name: r.name.trim(), role: r.role, active: r.active }, actorId: user.id })));
      notifySuccess(changed.length === 1 ? 'Staff member saved.' : `${changed.length} staff members saved.`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Staff could not be saved.');
    }
  };

  return (
    <Panel
      title="Staff and roles"
      description="Managers can change settings, import and see the dashboard. Agents work the queue. Initials come from the tracker and do not change."
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || update.isPending} onClick={() => setRows(baseline)}>
            Discard changes
          </Button>
          <Button size="sm" loading={update.isPending} disabled={!dirty || problems.length > 0} onClick={() => void save()}>
            Save staff
          </Button>
        </div>
      }
    >
      {problems.length ? (
        <div role="alert" className="mb-4 rounded-control border border-danger bg-danger-bg p-3 text-sm text-danger">
          {problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <caption className="sr-only">Staff members, initials, name, role and active status</caption>
          <thead>
            <tr className="border-b border-line bg-panel text-left text-ink-muted">
              <th scope="col" className="px-3 py-2 font-medium">Initials</th>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Role</th>
              <th scope="col" className="px-3 py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line-subtle">
                <td className="px-3 py-2 font-medium tabular-nums text-ink">{r.initials}</td>
                <td className="px-3 py-2">
                  <Input aria-label={`Name for ${r.initials}`} value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} className="min-w-[12rem]" />
                </td>
                <td className="px-3 py-2">
                  <Select aria-label={`Role for ${r.initials}`} value={r.role} onChange={(e) => setRow(r.id, { role: e.target.value as Row['role'] })} className="w-40">
                    {(Object.keys(ROLE_LABELS) as Row['role'][]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    aria-label={`${r.initials} active`}
                    checked={r.active}
                    onChange={(e) => setRow(r.id, { active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
