import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { MobileListControls, type ActiveFilterChip } from '@/components/ui/list-controls';
import { EmptyState, Panel, Skeleton } from '@/components/ui/surfaces';
import type { ICONS } from '@/components/ui/icons';
import { useImportRows } from '@/data/hooks';
import type { ImportRowSortField, ListImportRowsQuery } from '@/data/repository';
import { useServerList } from '@/data/use-server-list';
import type { ImportBatch, ImportResult, ImportRow, Tone } from '@/domain';
import { cn } from '@/lib/utils';
import type { MasterSummary, ParseOutput } from './parse-client';

type IconName = keyof typeof ICONS;

const RESULT_META: Record<ImportResult, { label: string; tone: Tone; icon: IconName }> = {
  new: { label: 'New', tone: 'info', icon: 'dot' },
  unchanged: { label: 'Unchanged', tone: 'neutral', icon: 'check' },
  updated: { label: 'Updated', tone: 'accent', icon: 'clock' },
  conflict: { label: 'Conflict', tone: 'warning', icon: 'alert' },
  error: { label: 'Error', tone: 'danger', icon: 'x' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'new', label: 'New' },
  { key: 'updated', label: 'Updated' },
  { key: 'unchanged', label: 'Unchanged' },
  { key: 'conflict', label: 'Conflicts' },
  { key: 'error', label: 'Errors' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

export function count(n: number): string {
  return n.toLocaleString('en-AU');
}

function patientLabel(row: ImportRow): string {
  const c = row.candidate;
  return c ? `${c.patientLastName}, ${c.patientFirstName}` : 'No patient name';
}

export function ResultBadge({ result }: { result: ImportResult }) {
  const meta = RESULT_META[result];
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </Badge>
  );
}

/* ---------- referral tracker preview ---------- */

export function TrackerReview({
  fileName,
  output,
  batch,
  staging,
  committing,
  onCommit,
  onDiscard,
}: {
  fileName: string;
  output: Extract<ParseOutput, { kind: 'tracker' }>;
  batch: ImportBatch | null;
  staging: boolean;
  committing: boolean;
  onCommit: () => void;
  onDiscard: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const unmatched = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of output.result.unmatched) {
      const key = `${u.kind}|${u.value}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [output]);

  // Every data column has an accessorFn so its heading sorts (DESIGN.md 10.3). Empty values return undefined and sort last.
  const columns: ColumnDef<ImportRow, unknown>[] = [
    { id: 'sheet', header: 'Sheet', accessorFn: (r) => r.sheet || undefined, cell: ({ row }) => row.original.sheet },
    { id: 'row', header: 'Row', accessorFn: (r) => r.rowNumber, cell: ({ row }) => <span className="tabular">{row.original.rowNumber}</span> },
    {
      id: 'patient',
      header: 'Patient',
      accessorFn: (r) => (r.candidate ? `${r.candidate.patientLastName} ${r.candidate.patientFirstName}`.trim() || undefined : undefined),
      cell: ({ row }) => patientLabel(row.original),
    },
    { id: 'result', header: 'Result', accessorFn: (r) => RESULT_META[r.result].label, cell: ({ row }) => <ResultBadge result={row.original.result} /> },
    { id: 'reason', header: 'Reason', accessorFn: (r) => r.message || undefined, cell: ({ row }) => row.original.message ?? '' },
  ];

  // Rows are paged, sorted and filtered on the server. Import order by default (no sort).
  const list = useServerList<ImportRowSortField, ImportRow>({ columns, initialSorting: [], resetOn: [filter, batch?.id] });
  const query: ListImportRowsQuery | undefined = batch
    ? {
        batchId: batch.id,
        result: filter === 'all' || filter === 'review' ? undefined : filter,
        needsReview: filter === 'review' ? true : undefined,
        orderBy: list.orderBy,
        offset: list.offset,
        limit: list.limit,
      }
    : undefined;
  const rowsQuery = useImportRows(query);
  const items = rowsQuery.data?.items ?? [];
  const total = rowsQuery.data?.total ?? 0;
  const reviewTotal = useImportRows(batch ? { batchId: batch.id, needsReview: true, limit: 1 } : undefined).data?.total ?? 0;

  const filterButtons = FILTERS.map((f) => (
    <Button
      key={f.key}
      size="sm"
      variant={filter === f.key ? 'secondary' : 'ghost'}
      aria-pressed={filter === f.key}
      onClick={() => setFilter(f.key)}
      className="h-11 md:h-8"
    >
      {f.label}
      {f.key === 'review' ? ` (${count(reviewTotal)})` : ''}
    </Button>
  ));
  const activeFilter = FILTERS.find((f) => f.key === filter);

  const toCommit = batch ? batch.counts.new + batch.counts.updated : 0;
  const counts = batch?.counts;

  return (
    <>
      <Panel title="Summary" description={`${fileName}. ${count(output.result.patients)} patients from ${count(output.result.sheets.reduce((n, s) => n + s.dataRows, 0))} rows.`}>
        {staging || !counts ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-5">
            {(
              [
                ['New', counts.new],
                ['Unchanged', counts.unchanged],
                ['Updated', counts.updated],
                ['Conflicts', counts.conflict],
                ['Errors', counts.error],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="bg-[var(--color-panel)] p-3">
                <dt className="text-xs text-[var(--color-ink-muted)]">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums">{count(n)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Updated rows are copies of a patient already in the file (for example, copied into a later tab), so they merge into one referral.
          Unchanged rows are already imported and are skipped. Errors are rows with no patient name and are not imported.
        </p>
      </Panel>

      <Panel title="Codes to review" description="Values the importer did not recognise. They are left blank, and the rows still import." padded={unmatched.length > 0}>
        {unmatched.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Every clinic, orthodontist, staff and referrer code matched.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-line-subtle)] text-sm">
            {unmatched.slice(0, 60).map(([key, n]) => {
              const [kind, value] = key.split('|');
              return (
                <li key={key} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="text-[var(--color-ink-muted)] capitalize">{kind}</span> <span className="font-medium">{value}</span>
                  </span>
                  <span className="tabular-nums text-[var(--color-ink-muted)]">{count(n)} {n === 1 ? 'row' : 'rows'}</span>
                </li>
              );
            })}
            {unmatched.length > 60 ? <li className="py-2 text-[var(--color-ink-muted)]">{count(unmatched.length - 60)} more not shown</li> : null}
          </ul>
        )}
      </Panel>

      <Panel
        title="Rows"
        padded={false}
        actions={
          // Desktop: inline result filters. Phone: the same buttons live in the Filter sheet below.
          <div role="group" aria-label="Filter rows" className="hidden flex-wrap gap-1 md:flex">{filterButtons}</div>
        }
      >
        <div className="p-3 md:hidden">
          <MobileListControls
            itemNoun={total === 1 ? 'row' : 'rows'}
            resultCount={total}
            groups={[
              {
                id: 'result',
                label: 'Result',
                activeCount: filter === 'all' ? 0 : 1,
                content: (
                  <div role="group" aria-label="Result" className="flex flex-wrap gap-2">
                    {filterButtons}
                  </div>
                ),
              },
            ]}
            activeChips={filter === 'all' || !activeFilter ? [] : [{ id: 'result', label: activeFilter.label, onRemove: () => setFilter('all') } satisfies ActiveFilterChip]}
            onClearFilters={() => setFilter('all')}
            sortOptions={sortOptions(columns)}
            sorting={list.sorting}
            onSortingChange={list.setSorting}
          />
        </div>
        {rowsQuery.isLoading || staging ? (
          <div className="space-y-2 p-4" aria-busy="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <DataTable<ImportRow>
            caption="Import rows"
            data={items}
            columns={columns}
            getRowId={(r) => r.id}
            density="compact"
            sorting={list.sorting}
            onSortingChange={list.setSorting}
            pagination={list.pagination(total)}
            itemNoun="rows"
            renderCard={(r) => (
              <div className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{patientLabel(r)}</span>
                  <ResultBadge result={r.result} />
                </div>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {r.sheet}, row {r.rowNumber}
                </span>
                {r.message ? <span className="text-xs">{r.message}</span> : null}
              </div>
            )}
            emptyState={<EmptyState icon="file" title="No rows match this filter" description="Choose All to see every row in the file." />}
          />
        )}
      </Panel>

      <div className={cn('sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-panel)] p-4')}>
        <p className="text-sm">
          {staging ? 'Checking rows against the data.' : toCommit > 0 ? `Ready to commit ${count(counts?.new ?? 0)} new and ${count(counts?.updated ?? 0)} updated referrals.` : 'Nothing new to commit. Every row is already imported.'}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDiscard} disabled={committing}>
            Discard
          </Button>
          <Button variant="primary" icon="upload" loading={committing} disabled={staging || !batch || toCommit === 0} onClick={onCommit}>
            Commit import
          </Button>
        </div>
      </div>
    </>
  );
}

/* ---------- referrer master preview (commit is out of band in the prototype) ---------- */

export function MasterReview({ summary, existingIds, onDiscard }: { summary: MasterSummary; existingIds: Set<string> | null; onDiscard: () => void }) {
  const isNew = existingIds ? summary.referrers.filter((r) => !existingIds.has(r.id)).length : null;
  const updated = existingIds ? summary.referrers.length - (isNew ?? 0) : null;
  return (
    <>
      <Panel title="Summary" description="Referrer Master, matched on Referrer ID.">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
          {(
            [
              ['Referrers', summary.referrers.length],
              ['New', isNew],
              ['Updated', updated],
              ['Practices', summary.practiceCount],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="bg-[var(--color-panel)] p-3">
              <dt className="text-xs text-[var(--color-ink-muted)]">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{n === null ? '...' : count(n)}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-3 space-y-1 text-sm text-[var(--color-ink-muted)]">
          <li>Referral history rows: {count(summary.historyCount)}. Patient names are never stored.</li>
          <li>Skipped: {count(summary.skippedReferrers)} referrers without a valid Referrer ID, and {count(summary.historyWithoutReferrer)} history rows without one.</li>
          <li>Other Sources and Patient Referrers are not imported. The data model does not hold them yet.</li>
        </ul>
      </Panel>
      <Panel title="Codes to review" padded={false}>
        <ul className="divide-y divide-[var(--color-line-subtle)] px-4 text-sm">
          {summary.unmatched.length === 0 ? <li className="py-3 text-[var(--color-ink-muted)]">Every clinic and orthodontist code matched.</li> : null}
          {summary.unmatched.slice(0, 40).map((u, i) => (
            <li key={i} className="py-2">
              <span className="capitalize text-[var(--color-ink-muted)]">{u.kind}</span> <span className="font-medium">{u.value}</span> ({u.sheet}, row {u.rowNumber})
            </li>
          ))}
        </ul>
      </Panel>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <p className="text-sm text-[var(--color-ink-muted)]">Committing the Referrer Master is not available in this prototype. Load it with npm run seed, or when the Supabase adapter lands.</p>
        <Button variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </>
  );
}
