import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { digitsOnly, formatAuMobile, formatDateTime, isAuMobile, type SmsMessage } from '@/domain';
import type { SmsRow, SmsSortField } from '@/data/repository';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Badge, SmsStatusBadge } from '@/components/ui/badges';
import { Dialog } from '@/components/ui/overlays';
import { Field, Input } from '@/components/ui/forms';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { MobileListControls } from '@/components/ui/list-controls';
import { EmptyState, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { ICONS } from '@/components/ui/icons';
import { useLinkInbound, useReferrals, useResendSms, useResolveSmsReview, useSmsMessages } from '@/data/hooks';
import { useServerList } from '@/data/use-server-list';
import { useSessionUser } from './queue-hooks';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type InboxTab = 'book' | 'other' | 'failed';

const LINK_CLASS = 'inline-flex h-11 items-center rounded-control px-3 text-base text-accent underline underline-offset-4 md:h-8 md:text-sm';

const EMPTY: Record<InboxTab, { icon: 'reply' | 'check'; title: string; description: string }> = {
  book: { icon: 'reply', title: 'No replies asking to book', description: 'Patient replies appear here. Replies asking to book are marked.' },
  other: { icon: 'reply', title: 'No other replies', description: 'Patient replies appear here. Replies asking to book are marked.' },
  failed: { icon: 'check', title: 'No failed texts', description: 'Texts that do not deliver appear here with the cause, so you can fix the number and resend.' },
};

function InboxCount({ n, tone }: { n: number; tone?: 'danger' }) {
  return <span className={`tabular ml-1 rounded-full px-2 text-xs font-semibold ${tone === 'danger' ? 'bg-danger-bg text-danger' : 'bg-panel text-ink'}`}>{n}</span>;
}

/* ---------- columns (module level: they hold no state, the actions call their own hooks) ---------- */

// Every data column declares its server sortField (DESIGN.md 10.3). The actions column is not data and does not sort.
const REPLY_COLUMNS: ColumnDef<SmsRow, unknown>[] = [
  {
    id: 'patient',
    header: 'Patient',
    size: 200,
    meta: { sortField: 'patient' satisfies SmsSortField },
    cell: ({ row }) => (row.original.patientName ? <span className="block truncate text-ink">{row.original.patientName}</span> : <span className="text-ink-muted">Not linked to a referral</span>),
  },
  {
    id: 'reply',
    header: 'Reply',
    meta: { sortField: 'body' satisfies SmsSortField },
    cell: ({ row }) => <span className="block truncate text-ink">&ldquo;{row.original.body}&rdquo;</span>,
  },
  {
    id: 'received',
    header: 'Received',
    size: 160,
    meta: { sortField: 'createdAt' satisfies SmsSortField },
    cell: ({ row }) => <span className="tabular whitespace-nowrap text-ink-muted">{formatDateTime(row.original.createdAt)}</span>,
  },
  {
    id: 'reference',
    header: 'Referral',
    size: 140,
    meta: { sortField: 'reference' satisfies SmsSortField },
    cell: ({ row }) => (row.original.referenceNumber ? <span className="tabular">{row.original.referenceNumber}</span> : <span className="text-ink-muted">Not linked</span>),
  },
  {
    id: 'status',
    header: 'Status',
    size: 130,
    // Every reply has the same message status, so there is nothing for the server to sort on. The link state is shown only.
    enableSorting: false,
    cell: ({ row }) => (row.original.referenceNumber ? <Badge tone="success" icon="check">Linked</Badge> : <Badge tone="neutral" icon="dot">Not linked</Badge>),
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 260,
    enableSorting: false,
    cell: ({ row }) => <ReplyActions row={row.original} />,
  },
];

const FAILURE_COLUMNS: ColumnDef<SmsRow, unknown>[] = [
  {
    id: 'patient',
    header: 'Patient',
    size: 200,
    meta: { sortField: 'patient' satisfies SmsSortField },
    cell: ({ row }) => <span className="block truncate text-ink">{row.original.patientName ?? 'Not linked to a referral'}</span>,
  },
  {
    id: 'cause',
    header: 'Failure cause',
    // The server has no sort field for the failure text, so this column is not sortable.
    enableSorting: false,
    cell: ({ row }) => (
      <span className="flex min-w-0 items-center gap-1.5 text-danger">
        <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{row.original.error ?? 'Not delivered'}</span>
      </span>
    ),
  },
  {
    id: 'sent',
    header: 'Sent',
    size: 160,
    meta: { sortField: 'createdAt' satisfies SmsSortField },
    cell: ({ row }) => <span className="tabular whitespace-nowrap text-ink-muted">{formatDateTime(row.original.createdAt)}</span>,
  },
  {
    id: 'reference',
    header: 'Referral',
    size: 140,
    meta: { sortField: 'reference' satisfies SmsSortField },
    cell: ({ row }) => (row.original.referenceNumber ? <span className="tabular">{row.original.referenceNumber}</span> : <span className="text-ink-muted">Not linked</span>),
  },
  {
    id: 'status',
    header: 'Status',
    size: 130,
    meta: { sortField: 'status' satisfies SmsSortField },
    cell: () => <SmsStatusBadge status="failed" />,
  },
  {
    id: 'actions',
    header: 'Actions',
    size: 300,
    enableSorting: false,
    cell: ({ row }) => <FailureActions row={row.original} />,
  },
];

/**
 * Inbox: texts that need a person. Failed sends can be fixed and resent. Replies can be linked to a referral.
 * Each tab is its own server query (paged, sorted and filtered on the server). Its total is the tab count.
 * Every action is written to the audit log and shows in the referral timeline.
 */
export function InboxPage() {
  const [tab, setTab] = useState<InboxTab>('book');

  const bookList = useServerList<SmsSortField, SmsRow>({ columns: REPLY_COLUMNS, initialSorting: [{ id: 'received', desc: true }] });
  const otherList = useServerList<SmsSortField, SmsRow>({ columns: REPLY_COLUMNS, initialSorting: [{ id: 'received', desc: true }] });
  const failedList = useServerList<SmsSortField, SmsRow>({ columns: FAILURE_COLUMNS, initialSorting: [{ id: 'sent', desc: true }] });

  const bookQ = useSmsMessages({ direction: 'inbound', needsReview: true, bookingRequest: true, orderBy: bookList.orderBy, offset: bookList.offset, limit: bookList.limit });
  const otherQ = useSmsMessages({ direction: 'inbound', needsReview: true, bookingRequest: false, orderBy: otherList.orderBy, offset: otherList.offset, limit: otherList.limit });
  const failedQ = useSmsMessages({ direction: 'outbound', statuses: ['failed'], needsReview: true, orderBy: failedList.orderBy, offset: failedList.offset, limit: failedList.limit });

  const counts = { book: bookQ.data?.total ?? 0, other: otherQ.data?.total ?? 0, failed: failedQ.data?.total ?? 0 };
  const replyCount = counts.book + counts.other;
  const loading = bookQ.isPending || otherQ.isPending || failedQ.isPending;
  const failed = bookQ.isError || otherQ.isError || failedQ.isError;
  const anything = counts.book + counts.other + counts.failed > 0;

  const current = tab === 'book' ? bookList : tab === 'other' ? otherList : failedList;
  const activeQ = tab === 'book' ? bookQ : tab === 'other' ? otherQ : failedQ;
  const columns = tab === 'failed' ? FAILURE_COLUMNS : REPLY_COLUMNS;
  const options = sortOptions(columns);

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-4">
      <PageHeader
        title="Inbox"
        description={
          !anything && !loading
            ? 'Nothing needs a person right now.'
            : `${counts.failed} ${counts.failed === 1 ? 'text' : 'texts'} not delivered, ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} to review.`
        }
      />

      {loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading inbox">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : failed ? (
        <EmptyState
          icon="alert"
          title="The inbox could not be loaded"
          description="Check the connection, then try again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void bookQ.refetch();
                void otherQ.refetch();
                void failedQ.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      ) : !anything ? (
        <EmptyState icon="inbox" title="The inbox is clear" description="Texts that fail to deliver and replies from patients land here." />
      ) : (
        <>
          {/* Tabs stay visible on phones: they are navigation, not filters. */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as InboxTab)}>
            <TabsList aria-label="Inbox sections" className="border-line">
              <TabsTrigger value="book">
                Replies to book <InboxCount n={counts.book} />
              </TabsTrigger>
              <TabsTrigger value="other">
                Other replies <InboxCount n={counts.other} />
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed texts <InboxCount n={counts.failed} tone="danger" />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Phone: sort only. The inbox has no filters, so the Filter button is not shown. */}
          <MobileListControls
            itemNoun={activeQ.data?.total === 1 ? 'item' : 'items'}
            resultCount={activeQ.data?.total ?? 0}
            groups={[]}
            sortOptions={options}
            sorting={current.sorting}
            onSortingChange={current.setSorting}
          />

          <div className="flex min-h-[18rem] flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card">
            <DataTable<SmsRow>
              key={tab}
              caption={tab === 'failed' ? 'Failed texts' : tab === 'book' ? 'Replies to book' : 'Other replies'}
              data={activeQ.data?.items ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              loading={activeQ.isPending}
              sorting={current.sorting}
              onSortingChange={current.setSorting}
              pagination={current.pagination(activeQ.data?.total ?? 0)}
              itemNoun={tab === 'failed' ? 'texts' : 'replies'}
              emptyState={<EmptyState icon={EMPTY[tab].icon} title={EMPTY[tab].title} description={EMPTY[tab].description} />}
              renderCard={(row) => (tab === 'failed' ? <FailureCard row={row} /> : <ReplyCard row={row} />)}
              className="min-h-[18rem]"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- row actions: shared by the table cell and the phone card, so the primary action stays reachable ---------- */

function useDealtWith(messageId: string) {
  const user = useSessionUser();
  const resolve = useResolveSmsReview();
  return () => {
    if (!user) return;
    resolve.mutate(
      { messageId, actorId: user.id },
      { onSuccess: () => notifySuccess('Marked as dealt with'), onError: (e) => notifyError(e.message) },
    );
  };
}

function FailureActions({ row }: { row: SmsRow }) {
  const [open, setOpen] = useState(false);
  const dealtWith = useDealtWith(row.id);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" size="sm" icon="send" onClick={() => setOpen(true)}>
        Fix number and resend
      </Button>
      {row.referralId ? (
        <Link to={`/referrals/${row.referralId}`} className={LINK_CLASS}>
          Open referral
        </Link>
      ) : null}
      <Button variant="ghost" size="sm" onClick={dealtWith}>
        Mark dealt with
      </Button>
      <FixAndResend message={row} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ReplyActions({ row }: { row: SmsRow }) {
  const [linking, setLinking] = useState(false);
  const dealtWith = useDealtWith(row.id);
  return (
    <div className="flex flex-wrap gap-2">
      {row.referralId ? (
        <Link to={`/referrals/${row.referralId}`} className={LINK_CLASS}>
          Open referral
        </Link>
      ) : (
        <Button variant="secondary" size="sm" icon="globe" onClick={() => setLinking(true)}>
          Link to referral
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={dealtWith}>
        Mark dealt with
      </Button>
      <LinkReply message={row} open={linking} onOpenChange={setLinking} />
    </div>
  );
}

function FailureCard({ row }: { row: SmsRow }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 truncate font-semibold text-ink">{row.patientName ?? 'Not linked to a referral'}</span>
        <SmsStatusBadge status="failed" />
      </div>
      <p className="flex items-center gap-1.5 text-base text-danger">
        <ICONS.alert size={16} strokeWidth={1.5} aria-hidden="true" />
        {row.error ?? 'Not delivered'}
      </p>
      <p className="text-sm text-ink-muted">
        To <span className="tabular">{row.toPhone ? formatAuMobile(row.toPhone) : 'no number'}</span> · {formatDateTime(row.createdAt)}
      </p>
      <p className="whitespace-pre-line rounded-control bg-canvas p-3 text-base text-ink-muted">{row.body}</p>
      <FailureActions row={row} />
    </div>
  );
}

function ReplyCard({ row }: { row: SmsRow }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-ink">{row.patientName ?? 'Not linked to a referral'}</span>
        {row.bookingRequest ? <Badge tone="accent" icon="reply">Asks to book</Badge> : null}
      </div>
      <p className="text-sm text-ink-muted">Received {formatDateTime(row.createdAt)}</p>
      <p className="whitespace-pre-line rounded-control bg-canvas p-3 text-base text-ink">&ldquo;{row.body}&rdquo;</p>
      <ReplyActions row={row} />
    </div>
  );
}

function FixAndResend({ message, open, onOpenChange }: { message: SmsMessage; open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useSessionUser();
  const resend = useResendSms();
  const [phone, setPhone] = useState(message.toPhone ? formatAuMobile(message.toPhone) : '');
  const [error, setError] = useState<string | undefined>();

  const submit = async () => {
    const digits = digitsOnly(phone);
    if (!digits || !isAuMobile(digits)) {
      setError('Enter an Australian mobile number, starting 04 and 10 digits long, for example 0412 345 678.');
      document.getElementById('fix-phone')?.focus();
      return;
    }
    if (!user) return;
    try {
      const result = await resend.mutateAsync({ messageId: message.id, correctedPhone: digits, actorId: user.id });
      if (result.status === 'failed') {
        setError(result.error ?? 'The text failed again. Check the number.');
        return;
      }
      notifySuccess('Text queued again. Delivery shows in the referral timeline.');
      onOpenChange(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The text could not be resent.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Fix number and resend"
      description="The corrected number is saved on this text and the same message is queued again."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="send" loading={resend.isPending} onClick={() => void submit()}>
            Resend text
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Mobile number" error={error} hint="Check it in Edge or ask the patient." required>
          <Input id="fix-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!error} />
        </Field>
        <p className="whitespace-pre-line rounded-control bg-canvas p-3 text-base text-ink-muted">{message.body}</p>
      </div>
    </Dialog>
  );
}

/**
 * Link an inbound reply to a referral. The referral search is server side and limited to 20 matches, so the dialog
 * never loads the whole referral list.
 */
function LinkReply({ message, open, onOpenChange }: { message: SmsMessage; open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useSessionUser();
  const link = useLinkInbound();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const found = useReferrals({ search: search.trim().length >= 2 ? search.trim() : undefined, limit: 20 });
  const options: ComboboxOption<string>[] = (found.data?.items ?? []).map((r) => ({
    value: r.id,
    label: `${r.patientFirstName} ${r.patientLastName}`.trim(),
    description: r.referenceNumber,
  }));

  const confirmLink = () => {
    if (!chosen || !user) return;
    link.mutate(
      { messageId: message.id, referralId: chosen, actorId: user.id },
      {
        onSuccess: () => {
          notifySuccess('Reply linked to the referral');
          onOpenChange(false);
        },
        onError: (e) => notifyError(e.message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Link reply to a referral"
      description="Find the referral this reply belongs to. The link shows in the referral timeline."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" disabled={!chosen} loading={link.isPending} onClick={confirmLink}>
            Link reply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Combobox<string>
          label="Find referral"
          value={chosen}
          selectedLabel={options.find((o) => o.value === chosen)?.label ?? ''}
          placeholder="Type two letters or a reference"
          options={options}
          loading={found.isFetching}
          onInputChange={setSearch}
          onChange={(v) => setChosen(v)}
        />
        <p className="whitespace-pre-line rounded-control bg-canvas p-3 text-base text-ink">&ldquo;{message.body}&rdquo;</p>
      </div>
    </Dialog>
  );
}
