import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge, StatusBadge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { DataTable, describeSort, sortOptions } from '@/components/ui/data-table';
import { SortSheet } from '@/components/ui/list-controls';
import { PageHeader } from '@/components/ui/page-header';
import { PatientIdentity } from '@/components/ui/patient-identity';
import { EmptyState, KeyValue, Panel, Skeleton } from '@/components/ui/surfaces';
import { useDemoNow, useLookups, useNoticesPage, usePractice, useReferrer, useReferrerHistoryPage, useReferrerHistoryStats, useReferrals, useSettings } from '@/data/hooks';
import { PAGE_SIZE, type HistorySortField, type ReferralRow, type ReferralSortField } from '@/data/repository';
import { useServerList } from '@/data/use-server-list';
import { CLOSED_REASON_LABELS, NOTICE_KIND_LABELS, digitsOnly, formatAuDate, formatAuMobile, formatDateTime, formatDue, nextAction, deriveAgeGroup, type ReferrerHistory } from '@/domain';
import { clinicName } from '@/features/intake/intakeModel';
import { SegmentBadge } from './ReferrersPage';
import { financialYearStart, fyLabel, formatMonths, monthsSince, formatRate, conversionRate } from './referrerStats';

/**
 * Referrer profile. Contact details, FY stats as a compact row, the referrals in this app and the Edge history.
 * Both tables are paged, sorted and filtered on the server. No patient names appear in the Edge history, only Edge
 * references. Current referrals show masked phones.
 */
export function ReferrerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const now = useDemoNow();
  const referrer = useReferrer(id);
  // FY summary counts come from a server aggregate, so no history rows are downloaded for them.
  const historyStats = useReferrerHistoryStats(id);
  // Notices for this referrer: first page on the server, with the total.
  const notices = useNoticesPage({ referrerId: id, limit: PAGE_SIZE });
  const lookups = useLookups();
  const settings = useSettings();
  const practice = usePractice(referrer.data?.practiceId);
  const cadence = settings.data?.cadence;

  // Current referrals: server-sorted, paged. Newest first by default.
  const referralColumns: ColumnDef<ReferralRow, unknown>[] = [
    {
      id: 'patient',
      header: 'Patient',
      size: 260,
      meta: { sortField: 'patient' satisfies ReferralSortField },
      cell: ({ row }) => {
        const x = row.original;
        return (
          <PatientIdentity
            variant="row"
            firstName={x.patientFirstName}
            lastName={x.patientLastName}
            dob={x.dob}
            ageGroup={x.ageGroup ?? deriveAgeGroup(x.dob, x.receivedAt)}
            phone={x.phone}
            maskPhone
            urgent={x.flags.urgent}
          />
        );
      },
    },
    {
      id: 'reference',
      header: 'Reference',
      size: 150,
      meta: { sortField: 'reference' satisfies ReferralSortField },
      cell: ({ row }) => <span className="tabular">{row.original.referenceNumber}</span>,
    },
    {
      id: 'received',
      header: 'Received',
      size: 120,
      meta: { sortField: 'receivedAt' satisfies ReferralSortField },
      cell: ({ row }) => <span className="tabular">{formatAuDate(row.original.receivedAt)}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      size: 150,
      meta: { sortField: 'status' satisfies ReferralSortField },
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'next',
      header: 'Next step',
      meta: { sortField: 'nextActionAt' satisfies ReferralSortField },
      cell: ({ row }) => {
        const x = row.original;
        if (x.closedReason) return <span className="text-ink-muted">{CLOSED_REASON_LABELS[x.closedReason]}</span>;
        const next = cadence ? nextAction(x, cadence, now) : null;
        return <span className={next?.overdue ? 'font-medium text-danger' : 'text-ink'}>{next?.label ?? 'No step due'}</span>;
      },
    },
  ];

  // Edge history: server-sorted, paged. Newest first by default.
  const historyColumns: ColumnDef<ReferrerHistory, unknown>[] = [
    {
      id: 'received',
      header: 'Received',
      size: 120,
      meta: { sortField: 'receivedOn' satisfies HistorySortField },
      cell: ({ row }) => <span className="tabular">{formatAuDate(row.original.receivedOn)}</span>,
    },
    {
      id: 'edge',
      header: 'Edge reference',
      size: 150,
      // The server has no sort field for the Edge reference, so this column is not sortable.
      enableSorting: false,
      cell: ({ row }) => <span className="tabular">{row.original.edgePatientRef ?? 'Not recorded'}</span>,
    },
    {
      id: 'clinic',
      header: 'Clinic',
      meta: { sortField: 'clinic' satisfies HistorySortField },
      cell: ({ row }) => <span className="truncate">{clinicName(lookups.data, row.original.clinicId) ?? 'Not recorded'}</span>,
    },
    {
      id: 'ortho',
      header: 'Orthodontist',
      meta: { sortField: 'orthodontist' satisfies HistorySortField },
      cell: ({ row }) => (
        <span className="truncate">{lookups.data?.orthodontists.find((o) => o.id === row.original.orthodontistId)?.fullName ?? 'Not recorded'}</span>
      ),
    },
    {
      id: 'booked',
      header: 'Outcome',
      size: 130,
      meta: { sortField: 'booked' satisfies HistorySortField },
      cell: ({ row }) =>
        row.original.booked ? (
          <Badge tone="success" icon="check">
            Booked
          </Badge>
        ) : (
          <Badge tone="neutral" icon="x">
            Not booked
          </Badge>
        ),
    },
  ];

  const referralList = useServerList<ReferralSortField, ReferralRow>({ columns: referralColumns, initialSorting: [{ id: 'received', desc: true }] });
  const historyList = useServerList<HistorySortField, ReferrerHistory>({ columns: historyColumns, initialSorting: [{ id: 'received', desc: true }] });
  const referrals = useReferrals({ referrerId: id, orderBy: referralList.orderBy, offset: referralList.offset, limit: referralList.limit });
  const historyPage = useReferrerHistoryPage(id, { orderBy: historyList.orderBy, offset: historyList.offset, limit: historyList.limit });
  const [referralSortOpen, setReferralSortOpen] = useState(false);
  const [historySortOpen, setHistorySortOpen] = useState(false);

  if (referrer.isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading referrer">
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!referrer.data) {
    return (
      <>
        <PageHeader title="Referrer" back={{ to: '/referrers', label: 'Referrers' }} />
        <EmptyState
          icon="user"
          title="That referrer could not be found"
          description="Check the link, or search for the referrer in the directory."
          action={
            <Link to="/referrers" className="font-medium text-accent underline underline-offset-4">
              Back to referrers
            </Link>
          }
        />
      </>
    );
  }

  const r = referrer.data;
  const name = `${r.title ? `${r.title} ` : ''}${r.firstName} ${r.lastName}`.trim();
  const fy25 = historyStats.data?.fy25 ?? { referrals: 0, booked: 0 };
  const fy26 = historyStats.data?.fy26 ?? { referrals: 0, booked: 0 };
  const conversion = conversionRate(r);
  const sinceLast = monthsSince(r.lastReferralAt, now);
  const ortho = lookups.data?.orthodontists.find((o) => o.id === r.primaryOrthodontistId);
  const phoneDigits = digitsOnly(r.phone);

  const stats = [
    { label: 'FY25', value: String(fy25.referrals), sub: `${fy25.booked} booked` },
    { label: 'FY26', value: String(fy26.referrals), sub: `${fy26.booked} booked` },
    { label: `${fyLabel(financialYearStart(now.toISOString()))} YTD`, value: String(r.fyReferrals), sub: 'Referrals this year' },
    { label: 'Total referrals', value: r.totalReferrals.toLocaleString('en-AU'), sub: 'All recorded' },
    { label: 'Conversion rate', value: formatRate(conversion), sub: `${r.totalStarted} started treatment` },
    { label: 'Since last referral', value: formatMonths(sinceLast), sub: r.lastReferralAt ? formatAuDate(r.lastReferralAt) : 'None recorded' },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader
        title={name}
        back={{ to: '/referrers', label: 'Referrers' }}
        description={[r.type, practice.data?.name].filter(Boolean).join(', ') || undefined}
        actions={
          <Button icon="plus" onClick={() => navigate(`/referrals/new?referrer=${encodeURIComponent(r.id)}`)}>
            New referral from this referrer
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line-subtle sm:grid-cols-5" aria-label="Referrer statistics">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col gap-0.5 bg-surface p-3">
            <dt className="text-sm text-ink-muted">{s.label}</dt>
            <dd className="tabular text-lg font-semibold text-ink">{s.value}</dd>
            <dd className="tabular text-sm text-ink-muted">{s.sub}</dd>
          </div>
        ))}
      </dl>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Panel title="Contact">
          <KeyValue
            items={[
              { label: 'Practice', value: practice.data?.name ?? (r.practiceId ? 'Loading practice' : 'Not linked') },
              { label: 'Suburb', value: practice.data?.suburb ?? r.address ?? 'Not set' },
              {
                label: 'Phone',
                value: phoneDigits ? (
                  <a href={`tel:+61${phoneDigits.slice(1)}`} className="tabular underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                    {formatAuMobile(r.phone)}
                  </a>
                ) : (
                  'Not recorded'
                ),
              },
              {
                label: 'Email',
                value: r.email ? (
                  <a href={`mailto:${r.email}`} className="break-all underline decoration-line-strong underline-offset-4 hover:decoration-accent">
                    {r.email}
                  </a>
                ) : (
                  'Not recorded'
                ),
              },
              { label: 'Address', value: r.address ?? practice.data?.address ?? 'Not recorded' },
              { label: 'Professional type', value: r.type || 'Not set' },
              { label: 'Segment', value: <SegmentBadge segment={r.segment} /> },
              { label: 'Primary clinic', value: clinicName(lookups.data, r.primaryClinicId) ?? 'Not set' },
              { label: 'Primary orthodontist', value: ortho?.fullName ?? 'Not set' },
              { label: 'On the referrer list', value: r.active ? 'Active' : 'Inactive' },
            ]}
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Notices" description="Letters and emails sent to this referrer, and the ones still waiting.">
            {notices.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (notices.data?.items ?? []).length === 0 ? (
              <p className="text-base text-ink-muted">No notices for this referrer yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(notices.data?.items ?? []).map((n) => (
                  <li key={n.id} className="flex flex-col gap-0.5 text-base">
                    <span className="text-ink">
                      {NOTICE_KIND_LABELS[n.kind]} · <span className="text-ink-muted">{n.status === 'sent' ? 'Sent' : n.status === 'dismissed' ? 'Dismissed' : 'Not sent yet'}</span>
                    </span>
                    <span className="text-sm text-ink-muted">
                      Created {formatDateTime(n.createdAt)}
                      {n.sentAt ? `, sent ${formatDateTime(n.sentAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(notices.data?.total ?? 0) > 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                {(notices.data?.total ?? 0).toLocaleString('en-AU')} in total.{' '}
                <Link to="/notices" className="font-medium text-accent underline underline-offset-4">
                  Open referrer notices
                </Link>
              </p>
            ) : null}
          </Panel>
          <Panel title="Current referrals" description="Referrals in this app from this referrer." padded={false}>
            <SectionSort
              label="Current referrals"
              sorting={referralList.sorting}
              options={sortOptions(referralColumns)}
              open={referralSortOpen}
              onOpenChange={setReferralSortOpen}
              onSortingChange={referralList.setSorting}
            />
            <DataTable<ReferralRow>
              caption="Current referrals"
              data={referrals.data?.items ?? []}
              columns={referralColumns}
              getRowId={(x) => x.id}
              loading={referrals.isPending}
              sorting={referralList.sorting}
              onSortingChange={referralList.setSorting}
              pagination={referralList.pagination(referrals.data?.total ?? 0)}
              itemNoun="referrals"
              hideBelowMd={['reference', 'received']}
              onRowActivate={(x) => navigate(`/referrals/${x.id}`)}
              className="max-h-[24rem]"
              emptyState={
                <EmptyState
                  icon="referrals"
                  title="No referrals from this referrer in the app yet"
                  description="Edge history is listed below. New referrals from this referrer start here."
                  action={
                    <Button variant="secondary" icon="plus" onClick={() => navigate(`/referrals/new?referrer=${encodeURIComponent(r.id)}`)}>
                      New referral
                    </Button>
                  }
                />
              }
              renderCard={(x) => (
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <PatientIdentity
                      variant="row"
                      firstName={x.patientFirstName}
                      lastName={x.patientLastName}
                      dob={x.dob}
                      ageGroup={x.ageGroup ?? deriveAgeGroup(x.dob, x.receivedAt)}
                      phone={x.phone}
                      maskPhone
                    />
                    <StatusBadge status={x.status} />
                  </div>
                  <p className="text-sm text-ink-muted">
                    <span className="tabular">{x.referenceNumber}</span>, received {formatDue(x.receivedAt)}
                  </p>
                </div>
              )}
            />
          </Panel>

          <Panel title="Edge history" description="From the Edge referral history. Shows Edge references only, not patient names." padded={false}>
            <SectionSort
              label="Edge history"
              sorting={historyList.sorting}
              options={sortOptions(historyColumns)}
              open={historySortOpen}
              onOpenChange={setHistorySortOpen}
              onSortingChange={historyList.setSorting}
            />
            <DataTable<ReferrerHistory>
              caption="Edge referral history"
              data={historyPage.data?.items ?? []}
              columns={historyColumns}
              getRowId={(h) => h.id}
              loading={historyPage.isPending}
              sorting={historyList.sorting}
              onSortingChange={historyList.setSorting}
              pagination={historyList.pagination(historyPage.data?.total ?? 0)}
              itemNoun="referrals"
              hideBelowMd={['edge', 'ortho']}
              className="max-h-[24rem]"
              emptyState={
                <EmptyState icon="file" title="No Edge history for this referrer" description="History appears here once the Edge referral detail is imported." />
              }
              renderCard={(h) => (
                <div className="flex flex-col gap-1">
                  <p className="tabular text-base text-ink">
                    {formatAuDate(h.receivedOn)}, Edge {h.edgePatientRef ?? 'not recorded'}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {clinicName(lookups.data, h.clinicId) ?? 'Clinic not recorded'}, {h.booked ? 'booked' : 'not booked'}
                  </p>
                </div>
              )}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * Phone-only Sort control for one table section. Cards have no headings to tap, so this opens the shared SortSheet.
 * Desktop uses the clickable column headings instead.
 */
function SectionSort({
  label,
  sorting,
  options,
  open,
  onOpenChange,
  onSortingChange,
}: {
  label: string;
  sorting: Parameters<typeof describeSort>[0];
  options: ReturnType<typeof sortOptions>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSortingChange: (sorting: Parameters<typeof describeSort>[0]) => void;
}) {
  const current = describeSort(sorting, options);
  return (
    <div className="px-4 pt-3 md:hidden">
      <Button
        variant="secondary"
        className="h-11 w-full justify-center"
        icon="sort"
        onClick={() => onOpenChange(true)}
        aria-label={current ? `Sort ${label}, currently ${current}` : `Sort ${label}`}
      >
        {current ? current.replace(', ascending', ' ↑').replace(', descending', ' ↓') : 'Sort'}
      </Button>
      <SortSheet open={open} onOpenChange={onOpenChange} options={options} sorting={sorting} onSortingChange={onSortingChange} />
    </div>
  );
}
