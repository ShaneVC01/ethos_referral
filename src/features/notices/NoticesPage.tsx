import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { NOTICE_KIND_LABELS, type ReferrerNotification, type ReferrerNotificationKind } from '@/domain';
import type { NoticeQuery, NoticeRow, NoticeSortField } from '@/data/repository';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { MobileListControls } from '@/components/ui/list-controls';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/surfaces';
import { PillFilter } from '@/components/ui/pill-filter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePractice, useNoticesPage, useReferral, useReferrer } from '@/data/hooks';
import { useServerList } from '@/data/use-server-list';
import { shortDate } from '@/features/queue/queue-model';
import { NoticeEmailDialog } from './NoticeEmailDialog';

type StatusTab = 'unsent' | 'sent';
type KindFilter = 'all' | ReferrerNotificationKind;

/** Type pills in the order the team uses them. */
const PILL_ORDER: ReferrerNotificationKind[] = ['missing_info', 'unsuccessful_contact', 'referral_returned', 'thank_you'];

/** Unsent is pending. Sent is sent. Dismissed notices stay out of both tabs. */
function statusFor(tab: StatusTab): ReferrerNotification['status'] {
  return tab === 'unsent' ? 'pending' : 'sent';
}

const KIND_TONE: Record<ReferrerNotificationKind, string> = {
  thank_you: 'bg-ok-bg text-ok',
  missing_info: 'bg-warn-bg text-warn-fg',
  unsuccessful_contact: 'bg-panel text-ink',
  referral_returned: 'bg-danger-bg text-danger',
};

// Every data column declares its server sortField (DESIGN.md 10.3). Sorting, paging and search run on the server.
const COLUMNS: ColumnDef<NoticeRow, unknown>[] = [
  {
    id: 'referrer',
    header: 'Referrer and practice',
    size: 220,
    meta: { sortField: 'referrer' satisfies NoticeSortField },
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-semibold text-ink">{row.original.referrerName ?? 'Referrer not found'}</span>
        <span className="truncate text-sm text-ink-muted">{row.original.practiceName ?? ''}</span>
      </div>
    ),
  },
  {
    id: 'patient',
    header: 'Patient',
    size: 180,
    meta: { sortField: 'patient' satisfies NoticeSortField },
    cell: ({ row }) =>
      row.original.patientName ? (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{row.original.patientName}</span>
          <span className="tabular text-sm text-ink-muted">{row.original.referenceNumber}</span>
        </div>
      ) : (
        <span className="text-ink-muted">Referral not found</span>
      ),
  },
  {
    id: 'type',
    header: 'Type',
    size: 190,
    meta: { sortField: 'type' satisfies NoticeSortField },
    cell: ({ row }) => (
      <span className={cn('inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-sm font-medium', KIND_TONE[row.original.kind])}>
        <span className="truncate">{NOTICE_KIND_LABELS[row.original.kind]}</span>
      </span>
    ),
  },
  {
    id: 'created',
    header: 'Created',
    size: 96,
    meta: { sortField: 'createdAt' satisfies NoticeSortField },
    cell: ({ row }) => <span className="tabular whitespace-nowrap text-ink-muted">{shortDate(row.original.createdAt)}</span>,
  },
  {
    id: 'by',
    header: 'Created by',
    size: 110,
    meta: { sortField: 'createdBy' satisfies NoticeSortField },
    cell: ({ row }) => <span className="truncate text-ink">{row.original.createdByName ?? 'Cadence'}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    size: 140,
    meta: { sortField: 'status' satisfies NoticeSortField },
    cell: ({ row }) => {
      const n = row.original;
      if (n.status === 'sent') {
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-0.5 text-sm font-medium text-ok">
            Sent {n.sentAt ? shortDate(n.sentAt) : ''}
          </span>
        );
      }
      return <span className="inline-flex items-center rounded-full bg-accent-subtle px-2.5 py-0.5 text-sm font-medium text-ink">Not sent</span>;
    },
  },
];

/**
 * Referrer notices: letters and emails the team sends back to referrers. Unsent is the work. Each notice opens a
 * prepared email. Marking it sent records who and when.
 */
export function NoticesPage() {
  const [tab, setTab] = useState<StatusTab>('unsent');
  const [kind, setKind] = useState<KindFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useServerList<NoticeSortField, NoticeRow>({
    columns: COLUMNS,
    initialSorting: [{ id: 'created', desc: true }],
    resetOn: [tab, kind],
  });

  const status = statusFor(tab);
  const query: NoticeQuery = {
    status,
    kind: kind === 'all' ? undefined : kind,
    orderBy: list.orderBy,
    offset: list.offset,
    limit: list.limit,
  };
  const notices = useNoticesPage(query);
  const unsentQ = useNoticesPage({ status: 'pending', limit: 1 });
  const sentQ = useNoticesPage({ status: 'sent', limit: 1 });
  const kindCounts = {
    missing_info: useNoticesPage({ status, kind: 'missing_info', limit: 1 }).data?.total ?? 0,
    unsuccessful_contact: useNoticesPage({ status, kind: 'unsuccessful_contact', limit: 1 }).data?.total ?? 0,
    referral_returned: useNoticesPage({ status, kind: 'referral_returned', limit: 1 }).data?.total ?? 0,
    thank_you: useNoticesPage({ status, kind: 'thank_you', limit: 1 }).data?.total ?? 0,
  } satisfies Record<ReferrerNotificationKind, number>;
  const tabTotal = tab === 'unsent' ? (unsentQ.data?.total ?? 0) : (sentQ.data?.total ?? 0);
  const total = notices.data?.total ?? 0;
  const failed = notices.isError || unsentQ.isError || sentQ.isError;

  const typePills = (
    <>
      <PillFilter label="All types" count={tabTotal} active={kind === 'all'} onClick={() => setKind('all')} className={kind === 'all' ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover' : undefined} />
      {PILL_ORDER.map((k) => (
        <PillFilter
          key={k}
          label={NOTICE_KIND_LABELS[k]}
          count={kindCounts[k]}
          active={kind === k}
          onClick={() => setKind(k)}
          className={kind === k ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover' : undefined}
        />
      ))}
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <PageHeader title="Referrer notices" description="Letters and emails to referrers. Check the wording, send it from your email app, then mark it sent." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList aria-label="Notice status">
          <TabsTrigger value="unsent">
            Unsent
            <span className={cn('tabular rounded-full px-2 text-xs font-semibold', (unsentQ.data?.total ?? 0) > 0 ? 'bg-accent-subtle text-ink' : 'bg-panel text-ink')}>
              {unsentQ.data?.total ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="sent">
            Sent
            <span className="tabular rounded-full bg-panel px-2 text-xs font-semibold text-ink">{sentQ.data?.total ?? 0}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Desktop: inline type pills. Phone: the same pills live in the Filter sheet. */}
      <div role="group" aria-label="Notice type" className="hidden gap-2 md:flex md:flex-wrap">
        {typePills}
      </div>

      <MobileListControls
        itemNoun={total === 1 ? 'notice' : 'notices'}
        resultCount={total}
        groups={[
          {
            id: 'type',
            label: 'Notice type',
            activeCount: kind === 'all' ? 0 : 1,
            content: (
              <div role="group" aria-label="Notice type" className="flex flex-wrap gap-2">
                {typePills}
              </div>
            ),
          },
        ]}
        activeChips={kind === 'all' ? [] : [{ id: 'type', label: NOTICE_KIND_LABELS[kind], onRemove: () => setKind('all') }]}
        onClearFilters={() => setKind('all')}
        sortOptions={sortOptions(COLUMNS)}
        sorting={list.sorting}
        onSortingChange={list.setSorting}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <DataTable
          caption={tab === 'unsent' ? 'Unsent notices' : 'Sent notices'}
          data={notices.data?.items ?? []}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          selectedId={openId}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
          pagination={list.pagination(total)}
          itemNoun="notices"
          loading={notices.isPending}
          onRowActivate={(row) => setOpenId(row.id)}
          renderCard={(row) => (
            <button type="button" onClick={() => setOpenId(row.id)} className="flex w-full min-w-0 flex-col gap-2 p-4 text-left">
              <span className="flex items-start justify-between gap-2">
                <span className="truncate font-semibold text-ink">{row.referrerName ?? 'Referrer not found'}</span>
                <span className="shrink-0 text-sm text-ink-muted">{shortDate(row.createdAt)}</span>
              </span>
              <span className="text-base text-ink">{NOTICE_KIND_LABELS[row.kind]}</span>
              <span className="text-sm text-ink-muted">{row.patientName ? `${row.patientName} · ${row.referenceNumber ?? ''}` : ''}</span>
            </button>
          )}
          emptyState={
            failed ? (
              <EmptyState
                icon="alert"
                title="Notices could not be loaded"
                description="Check the connection, then try again."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void notices.refetch();
                      void unsentQ.refetch();
                      void sentQ.refetch();
                    }}
                  >
                    Try again
                  </Button>
                }
              />
            ) : tab === 'unsent' ? (
              <EmptyState icon="check" title="No notices to send" description="Thank you, missing information and return notices appear here when they are created." />
            ) : (
              <EmptyState icon="file" title="Nothing sent yet" description="Notices appear here once they are marked as sent." />
            )
          }
          className="min-h-0"
        />
      </div>

      {openId ? <NoticeDialogHost key={openId} noticeId={openId} notice={notices.data?.items.find((n) => n.id === openId) ?? null} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

/** Loads the referral, referrer and practice for the open notice, then shows the prepared email. */
function NoticeDialogHost({ noticeId, notice, onClose }: { noticeId: string; notice: NoticeRow | null; onClose: () => void }) {
  const referral = useReferral(notice?.referralId);
  const referrer = useReferrer(notice?.referrerId);
  const practice = usePractice(referrer.data?.practiceId);
  if (!notice) return null;
  return (
    <NoticeEmailDialog
      key={noticeId}
      notice={notice}
      referral={referral.data ?? null}
      referrer={referrer.data ?? null}
      practice={practice.data ?? null}
      open
      onOpenChange={(o) => !o && onClose()}
    />
  );
}
