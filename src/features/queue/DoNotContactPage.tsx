import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { MobileListControls } from '@/components/ui/list-controls';
import { EmptyState } from '@/components/ui/surfaces';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badges';
import { useReferrals } from '@/data/hooks';
import type { ReferralRow, ReferralSortField } from '@/data/repository';
import { useServerList } from '@/data/use-server-list';
import { PatientCell } from './parts';
import { shortDate } from './queue-model';

// Every data column declares its server sortField (DESIGN.md 10.3). Status is shared by every row, but it still sorts.
const COLUMNS: ColumnDef<ReferralRow, unknown>[] = [
  {
    id: 'patient',
    header: 'Patient',
    size: 280,
    meta: { sortField: 'patient' satisfies ReferralSortField },
    cell: ({ row }) => <PatientCell r={row.original} />,
  },
  {
    id: 'ref',
    header: 'Reference',
    size: 150,
    meta: { sortField: 'reference' satisfies ReferralSortField },
    cell: ({ row }) => <span className="tabular">{row.original.referenceNumber}</span>,
  },
  {
    id: 'clinic',
    header: 'Loc',
    size: 160,
    meta: { sortField: 'clinic' satisfies ReferralSortField },
    cell: ({ row }) => row.original.clinicName ?? '-',
  },
  {
    id: 'referrer',
    header: 'Referrer',
    size: 200,
    meta: { sortField: 'referrer' satisfies ReferralSortField },
    cell: ({ row }) => row.original.referrerName ?? 'Not set',
  },
  {
    id: 'closed',
    header: 'Closed',
    size: 120,
    meta: { sortField: 'closedAt' satisfies ReferralSortField },
    cell: ({ row }) => (row.original.closedAt ? <span className="tabular">{shortDate(row.original.closedAt)}</span> : '-'),
  },
  {
    id: 'status',
    header: 'Status',
    size: 150,
    meta: { sortField: 'status' satisfies ReferralSortField },
    cell: () => <Badge tone="danger" icon="ban">Do not contact</Badge>,
  },
];

/**
 * Do not contact. Every referral marked do not contact, with the date it was closed. Read only here: the reason and
 * any change are recorded on the referral timeline. Nothing on this list is ever texted or called.
 */
export function DoNotContactPage() {
  const navigate = useNavigate();
  // Newest closure first by default. The server sorts, pages and counts.
  const list = useServerList<ReferralSortField, ReferralRow>({ columns: COLUMNS, initialSorting: [{ id: 'closed', desc: true }] });
  const query = useReferrals({ statuses: ['do_not_contact'], orderBy: list.orderBy, offset: list.offset, limit: list.limit });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <PageHeader title="Do not contact" description={`${total.toLocaleString('en-AU')} ${total === 1 ? 'patient' : 'patients'} marked do not contact. No texts or calls go to them.`} />

      {/* Phone: sort only. This list has no filters, so no Filter button. */}
      <MobileListControls
        itemNoun={total === 1 ? 'patient' : 'patients'}
        resultCount={total}
        groups={[]}
        sortOptions={sortOptions(COLUMNS)}
        sorting={list.sorting}
        onSortingChange={list.setSorting}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <DataTable
          caption="Do not contact"
          data={rows}
          columns={COLUMNS}
          getRowId={(r) => r.id}
          loading={query.isPending}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
          pagination={list.pagination(total)}
          itemNoun="patients"
          onRowActivate={(r) => navigate(`/referrals/${r.id}`)}
          renderCard={(r) => (
            <div className="flex min-w-0 flex-col gap-2 p-4">
              <PatientCell r={r} />
              <Badge tone="danger" icon="ban">
                Do not contact
              </Badge>
            </div>
          )}
          emptyState={
            query.isError ? (
              <EmptyState icon="alert" title="The list could not be loaded" description="Check the connection, then try again." action={<Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button>} />
            ) : (
              <EmptyState icon="ban" title="Nobody on the list" description="Patients marked do not contact appear here. Mark one from the work queue or a referral." />
            )
          }
          className="min-h-0"
        />
      </div>
    </div>
  );
}
