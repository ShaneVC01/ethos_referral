import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AGE_GROUP_LABELS, CLINIC_TZ, cadenceMergeValues, digitsOnly, formatAuDate, maskPhone, renderSmsBody, type Referral, type SmsMessage } from '@/domain';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, Field, Select } from '@/components/ui/forms';
import { Dialog, Popover, Tooltip } from '@/components/ui/overlays';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { MobileListControls, type ActiveFilterChip } from '@/components/ui/list-controls';
import { EmptyState } from '@/components/ui/surfaces';
import { KpiCard } from '@/components/ui/kpi-card';
import { PillFilter } from '@/components/ui/pill-filter';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ICONS, type UiIconName } from '@/components/ui/icons';
import { notifyError, notifySuccess, showUndoToast } from '@/components/ui/toast';
import { useChangeStatus, useDemoNow, useLookups, useSendSms, useSettings, useSmsTemplates } from '@/data/hooks';
import { useServerList } from '@/data/use-server-list';
import type { QueueCounts, QueueGroup, QueueRow, QueueSortField } from '@/data/repository';
import { useNames, useQueuePage, useSessionUser } from './queue-hooks';
import { STAGE_NAMES, ageGroupLabel, clinicDay, defaultCutoverDay, shortDate, type TodayItem } from './queue-model';
import { ReferralDrawer } from './ReferralDrawer';
import { LogOutcomeSheet } from './LogOutcomeSheet';
import { SmsComposerDialog, defaultCoaxKey } from './SmsComposerDialog';
import { BookedDialog, ReasonDialog, type ReasonKind } from './StatusDialogs';

/** Underline tabs. Counts come from the server. */
const TABS: Array<{ key: QueueGroup; label: string }> = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'replies', label: 'Replies' },
  { key: 'sms_failed', label: 'SMS failed' },
  { key: 'to_call', label: 'To call us' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'backlog', label: 'Spreadsheet backlog' },
];

const CLOSE_REASONS = ['No response after the cadence', 'Patient not interested', 'Booked elsewhere', 'Other, see referral'] as const;

/** Stage pills. The step index matches the cadence. Null means "All stages". */
const STAGES: Array<{ key: string; label: string; step: number | null }> = [
  { key: 'all', label: 'All stages', step: null },
  { key: 'sms', label: 'SMS', step: 0 },
  { key: 'first', label: '1st call', step: 1 },
  { key: 'second', label: '2nd call', step: 2 },
  { key: 'third', label: '3rd call', step: 3 },
];

const EMPTY_COUNTS: QueueCounts = { all: 0, urgent: 0, overdue: 0, today: 0, replies: 0, sms_failed: 0, to_call: 0, upcoming: 0, backlog: 0, open: 0 };

/**
 * Column ids and the server sort field for each sortable column. The server sorts every page (100 rows),
 * so only columns with a sortField can be sorted. The table columns below declare the same fields.
 */
const SORT_FIELDS: ColumnDef<QueueRow, unknown>[] = [
  { id: 'patient', header: 'Patient', meta: { sortField: 'patient' } },
  { id: 'type', header: 'Type', meta: { sortField: 'type' } },
  { id: 'loc', header: 'Loc', meta: { sortField: 'loc' } },
  { id: 'referrer', header: 'Referrer', meta: { sortField: 'referrer' } },
  { id: 'received', header: 'Received', meta: { sortField: 'received' } },
  { id: 'sms', header: 'SMS', meta: { sortField: 'sms' } },
  { id: 'progress', header: 'Progress', meta: { sortField: 'progress' } },
  { id: 'next', header: 'Next', meta: { sortField: 'next' } },
  { id: 'due', header: 'Due', meta: { sortField: 'due' } },
  { id: 'owner', header: 'Owner', meta: { sortField: 'owner' } },
];

type Dialogs =
  | { kind: 'log'; referral: Referral }
  | { kind: 'coax'; referral: Referral; step: number }
  | { kind: 'booked'; referral: Referral }
  | { kind: 'reason'; referral: Referral; reason: ReasonKind }
  | { kind: 'bulk_coax' }
  | null;

/** Row menu choices. Book opens a dialog, the rest are status changes. */
type MenuChoice = 'open' | 'coax' | 'to_call' | 'book' | ReasonKind;

/** To call us rows show their own actions. Queue rows show the cadence action. */
type RowMode = 'queue' | 'to_call';

/**
 * Work queue. Summary cards and underline tabs narrow the work, stage and owner pills narrow it further.
 * Every list, count and sort is a server query (100 rows a page). A row opens the referral in a drawer
 * beside the list. Coax rows can be sent in bulk, and backlog rows closed in bulk with a reason.
 */
export function TodayPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const names = useNames();
  const lookups = useLookups();
  const settings = useSettings();
  const templates = useSmsTemplates();
  const user = useSessionUser();
  const changeStatus = useChangeStatus();
  const sendSms = useSendSms();
  const now = useDemoNow();

  const [group, setGroup] = useState<QueueGroup>('overdue');
  const [stage, setStage] = useState<string>('all');
  const [owner, setOwner] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [closeReason, setCloseReason] = useState<string>(CLOSE_REASONS[0]);
  const [sending, setSending] = useState(false);
  const selectedId = params.get('r');

  const stageStep = STAGES.find((s) => s.key === stage)?.step ?? null;
  const list = useServerList<QueueSortField, QueueRow>({
    columns: SORT_FIELDS,
    initialSorting: [{ id: 'due', desc: false }],
    resetOn: [group, stage, owner],
  });
  const page = useQueuePage({
    group,
    step: stageStep ?? undefined,
    ownerId: owner === 'all' ? undefined : owner,
    asOf: now.toISOString(),
    orderBy: list.orderBy,
    offset: list.offset,
    limit: list.limit,
  });
  const items: QueueRow[] = page.data?.items ?? [];
  const total = page.data?.total ?? 0;
  const counts = page.data?.counts ?? EMPTY_COUNTS;
  const stageCounts = page.data?.stageCounts ?? {};
  const nextDue = page.data?.nextDue ?? null;
  const stageCount = (key: string): number => {
    const step = STAGES.find((s) => s.key === key)?.step;
    return stageCounts[step === null || step === undefined ? 'all' : String(step)] ?? 0;
  };

  const cadence = settings.data?.cadence;
  const cutoverDay = settings.data?.queueCutoverDate ?? defaultCutoverDay(now);
  const staffList = (lookups.data?.staff ?? []).filter((s) => s.active);
  const openItem = selectedId ? (items.find((i) => i.referral?.id === selectedId) ?? null) : null;
  const rowMode: RowMode = group === 'to_call' ? 'to_call' : 'queue';
  const firstName = user?.name.trim().split(/\s+/)[0] ?? '';

  const pickGroup = (next: QueueGroup) => {
    setGroup(next);
    setSelected(new Set());
  };

  const open = (item: QueueRow) => {
    if (item.referral) setParams({ r: item.referral.id }, { replace: true });
    else navigate('/inbox');
  };
  const closeDrawer = () => setParams({}, { replace: true });

  const selectable = (item: QueueRow) => item.referral !== null && (item.step === 0 || item.bucket === 'backlog');
  const selectedItems = items.filter((i) => selected.has(i.key) && selectable(i));
  const toggle = (key: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const coaxFor = (r: Referral, step: number | null) => {
    const list = templates.data ?? [];
    const key = defaultCoaxKey(step ?? 0, r.flags.existingPatient, list);
    return list.find((t) => t.key === key) ?? null;
  };

  const sendBulkCoax = async () => {
    if (!user || selectedItems.length === 0) return;
    setSending(true);
    let sent = 0;
    const failures: string[] = [];
    for (const item of selectedItems) {
      const r = item.referral;
      const digits = digitsOnly(r?.phone);
      const template = r ? coaxFor(r, item.step) : null;
      if (!r || !digits || !template) {
        failures.push(r?.referenceNumber ?? 'Unknown referral');
        continue;
      }
      const clinicName = lookups.data?.clinics.find((c) => c.id === r.preferredClinicId)?.name ?? null;
      const body = renderSmsBody(template.body, cadenceMergeValues(r, clinicName));
      try {
        await sendSms.mutateAsync({ input: { referralId: r.id, toPhone: digits, body, templateKey: template.key }, actorId: user.id });
        sent += 1;
      } catch {
        failures.push(r.referenceNumber);
      }
    }
    setSending(false);
    setDialog(null);
    setSelected(new Set());
    if (failures.length) notifyError(`${sent} sent. ${failures.length} could not be sent: ${failures.slice(0, 3).join(', ')}.`);
    else notifySuccess(`${sent} ${sent === 1 ? 'text' : 'texts'} queued. Delivery shows in each timeline.`);
  };

  const closeBacklog = async () => {
    if (!user || selectedItems.length === 0) return;
    setSending(true);
    let closed = 0;
    for (const item of selectedItems) {
      if (!item.referral) continue;
      try {
        await changeStatus.mutateAsync({ id: item.referral.id, input: { status: 'unsuccessful', reason: `Spreadsheet backlog: ${closeReason}` }, actorId: user.id });
        closed += 1;
      } catch {
        // Counted below by what closed.
      }
    }
    setSending(false);
    setSelected(new Set());
    notifySuccess(`${closed} backlog ${closed === 1 ? 'referral' : 'referrals'} closed as unsuccessful.`);
  };

  const toCallUs = async (r: Referral) => {
    if (!user) return;
    const previous = r.status;
    try {
      await changeStatus.mutateAsync({ id: r.id, input: { status: 'to_call_us' }, actorId: user.id });
      showUndoToast('Marked to call us', () => changeStatus.mutateAsync({ id: r.id, input: { status: previous }, actorId: user.id }).then(() => undefined));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The status could not be changed.');
    }
  };

  const runPrimary = (item: QueueRow, mode: RowMode = 'queue') => {
    const r = item.referral;
    if (!r) return navigate('/inbox');
    // To call us rows log a call when a cadence step is due. Otherwise the record opens, to book or close from there.
    if (mode === 'to_call') return item.step !== null && item.step >= 1 ? setDialog({ kind: 'log', referral: r }) : open(item);
    if (item.step === 0) return setDialog({ kind: 'coax', referral: r, step: 0 });
    if (item.bucket === 'sms_book' || item.bucket === 'ready') return setDialog({ kind: 'booked', referral: r });
    if (item.step !== null && item.step >= 1) return setDialog({ kind: 'log', referral: r });
    return open(item);
  };

  const runMenu = (item: QueueRow, choice: MenuChoice) => {
    const r = item.referral;
    if (!r) return;
    if (choice === 'open') return open(item);
    if (choice === 'book') return setDialog({ kind: 'booked', referral: r });
    if (choice === 'coax') return setDialog({ kind: 'coax', referral: r, step: item.step ?? 0 });
    if (choice === 'to_call') return void toCallUs(r);
    setDialog({ kind: 'reason', referral: r, reason: choice });
  };

  const clinicCode = (id: string | null) => lookups.data?.clinics.find((c) => c.id === id)?.code ?? '';

  const columns: ColumnDef<QueueRow, unknown>[] = [
    {
      id: 'select',
      header: '',
      size: 36,
      enableSorting: false,
      cell: ({ row }) =>
        selectable(row.original) ? (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Checkbox
              id={`sel-${row.original.key}`}
              checked={selected.has(row.original.key)}
              onCheckedChange={(v) => toggle(row.original.key, v)}
              label={`Select ${row.original.referral?.referenceNumber ?? 'referral'}`}
              hideLabel
            />
          </span>
        ) : null,
    },
    {
      id: 'patient',
      header: 'Patient',
      size: 176,
      meta: { sortField: 'patient' },
      cell: ({ row }) => {
        const r = row.original.referral;
        if (!r) return <span className="text-ink-muted">Text not linked to a referral. Open Inbox to link it.</span>;
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ink">
              {r.patientLastName}, {r.patientFirstName}
            </span>
            <span className="tabular truncate text-sm text-ink-muted">{r.referenceNumber}</span>
          </div>
        );
      },
    },
    {
      id: 'type',
      header: 'Type',
      size: 64,
      meta: { sortField: 'type' },
      cell: ({ row }) => (row.original.referral?.ageGroup ? AGE_GROUP_LABELS[row.original.referral.ageGroup] : '-'),
    },
    {
      id: 'loc',
      header: 'Loc',
      size: 48,
      meta: { sortField: 'loc' },
      cell: ({ row }) => clinicCode(row.original.referral?.preferredClinicId ?? null) || '-',
    },
    {
      id: 'referrer',
      header: 'Referrer',
      size: 118,
      meta: { sortField: 'referrer' },
      cell: ({ row }) => {
        const r = row.original.referral;
        if (!r) return null;
        return <span className="block truncate text-ink">{r.referrerName || r.referrerText?.name || 'Not set'}</span>;
      },
    },
    {
      id: 'received',
      header: 'Received',
      size: 80,
      meta: { sortField: 'received' },
      cell: ({ row }) => (row.original.referral ? <span className="tabular whitespace-nowrap text-ink-muted">{shortDate(row.original.referral.receivedAt)}</span> : null),
    },
    {
      id: 'sms',
      header: 'SMS',
      size: 110,
      meta: { sortField: 'sms' },
      cell: ({ row }) => (row.original.referral ? <SmsPill message={row.original.latestText} /> : null),
    },
    {
      id: 'progress',
      header: 'Progress',
      size: 96,
      meta: { sortField: 'progress' },
      cell: ({ row }) => (row.original.referral ? <ProgressBar current={row.original.referral.currentStep} /> : null),
    },
    {
      id: 'next',
      header: 'Next',
      size: 100,
      meta: { sortField: 'next' },
      cell: ({ row }) => {
        const item = row.original;
        const label = item.bucket === 'urgent' ? 'Call today' : item.step === null ? item.action : STAGE_NAMES[item.step];
        return (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{label}</span>
            {item.dueAt ? <span className="tabular text-sm text-ink-muted">{shortDate(item.dueAt)}</span> : null}
          </div>
        );
      },
    },
    {
      id: 'due',
      header: 'Due',
      size: 100,
      meta: { sortField: 'due' },
      cell: ({ row }) => <DuePill item={row.original} now={now} />,
    },
    {
      id: 'owner',
      header: 'Owner',
      size: 52,
      meta: { sortField: 'owner' },
      cell: ({ row }) => <OwnerBadge initials={row.original.ownerInitials ?? ''} name={names.staff(row.original.ownerId)} />,
    },
    {
      id: 'actions',
      header: '',
      size: 160,
      cell: ({ row }) => (
        <RowActions
          item={row.original}
          mode={rowMode}
          onPrimary={() => runPrimary(row.original, rowMode)}
          onDnc={() => row.original.referral && setDialog({ kind: 'reason', referral: row.original.referral, reason: 'do_not_contact' })}
          onMenu={(choice) => runMenu(row.original, choice)}
        />
      ),
    },
  ];

  /** Count for each underline tab, from the server. */
  const tabCount = (key: QueueGroup): number => counts[key];

  // Stage and owner filters: the same pills are shown inline on desktop and inside the phone Filter sheet.
  const pillClass = (on: boolean) => (on ? 'border-accent bg-accent text-accent-fg hover:bg-accent-hover' : undefined);
  const stagePills = (wrap: string) => (
    <div role="group" aria-label="Stage" className={wrap}>
      {STAGES.map((s) => (
        <PillFilter key={s.key} label={s.label} count={stageCount(s.key)} active={stage === s.key} onClick={() => setStage(s.key)} className={pillClass(stage === s.key)} />
      ))}
    </div>
  );
  const ownerPills = (wrap: string) => (
    <div role="group" aria-label="Owner" className={wrap}>
      <PillFilter label="Everyone" active={owner === 'all'} onClick={() => setOwner('all')} className={pillClass(owner === 'all')} />
      {staffList.map((s) => (
        <PillFilter key={s.id} label={s.initials} active={owner === s.id} onClick={() => setOwner(s.id)} className={pillClass(owner === s.id)} />
      ))}
    </div>
  );
  const chips: ActiveFilterChip[] = [
    ...(stage !== 'all' ? [{ id: 'stage', label: STAGES.find((s) => s.key === stage)?.label ?? 'Stage', onRemove: () => setStage('all') }] : []),
    ...(owner !== 'all' ? [{ id: 'owner', label: `Owner ${staffList.find((s) => s.id === owner)?.initials ?? ''}`.trim(), onRemove: () => setOwner('all') }] : []),
  ];
  const clearListFilters = () => {
    setStage('all');
    setOwner('all');
  };

  const headline = (
    <div className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold text-ink">Work queue</h1>
      <p className="text-base text-ink-muted">
        {greeting(now)}, {firstName}. Here's who to contact next.
      </p>
    </div>
  );

  const list$ = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      {headline}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Overdue" count={counts.overdue} tone="danger" hint="Past due contact point" active={group === 'overdue'} onClick={() => pickGroup('overdue')} />
        <KpiCard label="Due today" count={counts.today} tone="warning" hint="SMS and calls" active={group === 'today'} onClick={() => pickGroup('today')} />
        <KpiCard label="SMS failed" count={counts.sms_failed} tone="danger" hint="Check numbers" active={group === 'sms_failed'} onClick={() => pickGroup('sms_failed')} />
        <KpiCard label="Open referrals" count={counts.open} tone="accent" hint="Across all locations" active={group === 'all'} onClick={() => pickGroup('all')} />
      </section>

      <Tabs value={TABS.some((t) => t.key === group) ? group : ''} onValueChange={(v) => pickGroup(v as QueueGroup)}>
        <TabsList aria-label="Work type" className="border-line">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className={t.key === 'backlog' ? 'text-ink-muted' : undefined}>
              {t.label}
              <span className={cn('tabular rounded-full px-2 text-xs font-semibold', tabBadgeTone(t.key, tabCount(t.key)))}>{tabCount(t.key)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Desktop: inline pills. Phone: these live in the Filter sheet below. */}
      <div className="hidden md:flex md:flex-row md:items-center md:justify-between">
        {stagePills('flex flex-wrap gap-2')}
        {ownerPills('flex flex-wrap justify-end gap-2')}
      </div>

      <MobileListControls
        itemNoun={total === 1 ? 'item' : 'items'}
        resultCount={total}
        groups={[
          { id: 'stage', label: 'Stage', activeCount: stage !== 'all' ? 1 : 0, content: stagePills('flex flex-wrap gap-2') },
          { id: 'owner', label: 'Owner', activeCount: owner !== 'all' ? 1 : 0, content: ownerPills('flex flex-wrap gap-2') },
        ]}
        activeChips={chips}
        onClearFilters={clearListFilters}
        sortOptions={sortOptions(columns)}
        sorting={list.sorting}
        onSortingChange={list.setSorting}
      />

      {group === 'backlog' ? (
        <p className="-mt-2 text-sm text-ink-muted">
          Imported from the spreadsheet and due before {formatAuDate(cutoverDay)}. Not counted in the headline. Close these in bulk, or one at a time.
        </p>
      ) : null}

      {selectedItems.length > 0 ? (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-3 rounded-panel border border-accent bg-accent-subtle px-4 py-3">
          <span className="text-base font-medium text-ink">{selectedItems.length} selected</span>
          {group !== 'backlog' ? (
            <Button variant="primary" icon="send" loading={sending} onClick={() => setDialog({ kind: 'bulk_coax' })}>
              Send {selectedItems.length} Coax {selectedItems.length === 1 ? 'message' : 'messages'}
            </Button>
          ) : (
            <>
              <Field label="Reason" required>
                <Select value={closeReason} onChange={(e) => setCloseReason(e.target.value)}>
                  {CLOSE_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="danger" icon="x" loading={sending} onClick={() => void closeBacklog()}>
                Close as unsuccessful
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <DataTable<QueueRow>
          caption={TABS.find((t) => t.key === group)?.label ?? 'Work queue'}
          data={items}
          columns={columns}
          getRowId={(i) => i.key}
          selectedId={openItem ? openItem.key : null}
          loading={page.isPending}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
          pagination={list.pagination(total)}
          itemNoun="items"
          onRowActivate={open}
          renderCard={(item) => (
            <TodayCard
              item={item}
              primaryOverride={rowMode === 'to_call' ? TO_CALL_PRIMARY : undefined}
              clinic={clinicCode(item.referral?.preferredClinicId ?? null)}
              referrer={item.referral ? (item.referral.referrerName || item.referral.referrerText?.name || '') : ''}
              sms={item.latestText}
              onOpen={() => open(item)}
              onPrimary={() => runPrimary(item, rowMode)}
              now={now}
            />
          )}
          emptyState={
            page.isError ? (
              <EmptyState icon="alert" title="The work queue could not be loaded" description="Check the connection, then try again." action={<Button variant="secondary" onClick={() => void page.refetch()}>Try again</Button>} />
            ) : group === 'urgent' ? (
              <EmptyState icon="check" title="No urgent referrals open" description="Urgent referrals stay here until they are booked or closed, whatever their due date." />
            ) : group === 'to_call' ? (
              <EmptyState icon="phone" title="Nobody is waiting to call us" description="Referrals the patient said they would call about appear here with their next follow-up date." />
            ) : group === 'backlog' ? (
              <EmptyState icon="check" title="No spreadsheet backlog" description={`Imported work due before ${formatAuDate(cutoverDay)} shows here. Nothing is waiting.`} />
            ) : group === 'upcoming' ? (
              <EmptyState icon="calendar" title="Nothing due in the next two weeks" description={nextDue ? `Next due: ${nextDue.day}, ${nextDue.count} ${nextDue.count === 1 ? 'item' : 'items'}.` : 'New referrals appear here as they arrive.'} />
            ) : group === 'all' ? (
              <EmptyState
                icon="check"
                title="Nothing due today"
                description={nextDue ? `Next due: ${nextDue.day}, ${nextDue.count} ${nextDue.count === 1 ? 'item' : 'items'}.` : 'Nothing is scheduled. New referrals appear here as they arrive.'}
                action={
                  <Button variant="secondary" icon="plus" onClick={() => navigate('/referrals/new')}>
                    New referral
                  </Button>
                }
              />
            ) : (
              <EmptyState icon="check" title="Nothing here right now" description="Choose another tab, or clear the stage and owner filters." />
            )
          }
          className="min-h-0"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 gap-0">
      {list$}
      {selectedId ? <ReferralDrawer id={selectedId} focusItem={openItem ? toTodayItem(openItem) : null} onClose={closeDrawer} /> : null}

      {dialog?.kind === 'log' && cadence ? (
        <LogOutcomeSheet referral={dialog.referral} cadence={cadence} open onOpenChange={(o) => !o && setDialog(null)} />
      ) : null}
      {dialog?.kind === 'coax' ? <SmsComposerDialog referral={dialog.referral} step={dialog.step} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === 'booked' ? <BookedDialog referral={dialog.referral} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === 'reason' ? <ReasonDialog referral={dialog.referral} kind={dialog.reason} open onOpenChange={(o) => !o && setDialog(null)} /> : null}
      {dialog?.kind === 'bulk_coax' ? (
        <BulkCoaxDialog items={selectedItems} pick={(r, step) => coaxFor(r, step)} sending={sending} onCancel={() => setDialog(null)} onConfirm={() => void sendBulkCoax()} />
      ) : null}
    </div>
  );
}

/* ---------- helpers and row pieces ---------- */

/** The drawer takes the cadence item shape. The latest text stands in for the message. */
function toTodayItem(item: QueueRow): TodayItem {
  return { ...item, message: item.latestText };
}

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hour12: false, timeZone: CLINIC_TZ }).format(now));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Plain SMS status, shown in the SMS column. */
function smsLabel(message: SmsMessage | null): string {
  if (!message) return 'Not sent';
  if (message.status === 'failed') return 'SMS failed';
  if (message.status === 'delivered') return 'SMS delivered';
  return 'Sent';
}

function SmsPill({ message }: { message: SmsMessage | null }) {
  const label = smsLabel(message);
  if (!message) return <Pill tone="neutral" dot="bg-line-strong" label={label} />;
  if (message.status === 'failed') return <Pill tone="danger" dot="bg-danger" label={label} />;
  if (message.status === 'delivered') return <Pill tone="ok" dot="bg-ok" label={label} />;
  return <Pill tone="neutral" dot="bg-ink-subtle" label={label} />;
}

const PILL_TONE: Record<'neutral' | 'danger' | 'ok' | 'warn' | 'accent', string> = {
  neutral: 'bg-panel text-ink',
  danger: 'bg-danger-bg text-danger',
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn-fg',
  accent: 'bg-accent-subtle text-ink',
};

function Pill({ tone, label, dot }: { tone: keyof typeof PILL_TONE; label: string; dot?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium', PILL_TONE[tone])}>
      {dot ? <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', dot)} /> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Four segments: done is teal, the current step is amber, to do is grey. */
function ProgressBar({ current }: { current: number }) {
  const done = Math.min(current, 4);
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`${done} of 4 steps done`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} aria-hidden="true" className={cn('h-2 w-5 rounded-pill', i < done ? 'bg-accent' : i === done ? 'bg-amber' : 'bg-line')} />
      ))}
    </span>
  );
}

/** Overdue is a red tint with text. Due today is amber. Anything else shows its date. */
function DuePill({ item, now }: { item: QueueRow; now: Date }) {
  if (!item.dueAt) return <Pill tone="accent" label="Now" />;
  if (item.overdue) return <Pill tone="danger" label="Overdue" />;
  if (clinicDay(item.dueAt) === clinicDay(now)) return <Pill tone="warn" label="Today" />;
  return <Pill tone="neutral" label={shortDate(item.dueAt)} />;
}

function OwnerBadge({ initials, name }: { initials: string; name: string }) {
  if (!initials) return <span className="text-ink-muted">-</span>;
  return (
    <span title={name} aria-label={`Owner ${name}`} className="flex size-8 items-center justify-center rounded-pill bg-panel text-sm font-semibold text-ink">
      {initials}
    </span>
  );
}

/** Mint primary row action. Text is teal on mint, 4.5:1 or better. */
function MintButton({ label, icon, onClick }: { label: string; icon: UiIconName; onClick: () => void }) {
  const Icon = ICONS[icon];
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control bg-accent-subtle px-3 text-sm font-semibold text-accent hover:bg-accent-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
      {label}
    </button>
  );
}

/** To call us rows always offer "Log call" as the primary action. */
const TO_CALL_PRIMARY: { label: string; icon: UiIconName } = { label: 'Log call', icon: 'phone' };

/** Count badge for an underline tab. Urgent turns red when it has work. Overdue is always red. */
function tabBadgeTone(key: QueueGroup, count: number): string {
  if (key === 'urgent' && count > 0) return 'bg-danger text-surface';
  if (key === 'urgent' || key === 'overdue') return 'bg-danger-bg text-danger';
  return 'bg-panel text-ink';
}

/** The primary action matches the next action in words. */
function primaryLabel(item: QueueRow): { label: string; icon: UiIconName } {
  if (item.step === 0) return { label: 'Send Coax #1', icon: 'send' };
  if (item.bucket === 'sms_book' || item.bucket === 'ready') return { label: 'Book', icon: 'check' };
  if (item.step !== null && item.step >= 1) return { label: 'Log', icon: 'phone' };
  if (item.bucket === 'sms_failed') return { label: 'Open text', icon: 'alert' };
  if (item.bucket === 'sms_reply') return { label: 'Reply', icon: 'reply' };
  return { label: 'Open', icon: 'file' };
}

function RowActions({ item, mode, onPrimary, onDnc, onMenu }: { item: QueueRow; mode: RowMode; onPrimary: () => void; onDnc: () => void; onMenu: (choice: MenuChoice) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const r = item.referral;
  if (!r) return null;
  const isOpen = !r.closedReason;
  const primary = mode === 'to_call' ? TO_CALL_PRIMARY : primaryLabel(item);
  const coaxLabel = item.step === null ? null : item.step === 0 ? 'Send Coax #1' : `Send Coax #${item.step + 1}`;
  const pick = (choice: MenuChoice) => {
    setMenuOpen(false);
    onMenu(choice);
  };
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <MintButton label={primary.label} icon={primary.icon} onClick={onPrimary} />
      {isOpen ? (
        <Tooltip content="Mark do not contact">
          <IconButton icon="ban" aria-label={`Mark ${r.referenceNumber} do not contact`} size="sm" onClick={onDnc} />
        </Tooltip>
      ) : null}
      <Popover open={menuOpen} onOpenChange={setMenuOpen} align="end" trigger={<IconButton icon="more" aria-label={`More actions for ${r.referenceNumber}`} size="sm" />}>
        <div role="menu" className="flex min-w-56 flex-col">
          <MenuItem onSelect={() => pick('open')} icon="file">
            Open referral
          </MenuItem>
          {mode === 'to_call' && isOpen ? (
            <>
              <MenuItem onSelect={() => pick('book')} icon="check">
                Book
              </MenuItem>
              <MenuItem onSelect={() => pick('unsuccessful')} icon="x">
                Close as unsuccessful
              </MenuItem>
              <MenuItem onSelect={() => pick('declined')} icon="x">
                Declined
              </MenuItem>
            </>
          ) : null}
          {mode === 'queue' && coaxLabel && isOpen ? (
            <MenuItem onSelect={() => pick('coax')} icon="send">
              {coaxLabel}
            </MenuItem>
          ) : null}
          {mode === 'queue' && isOpen ? (
            <MenuItem onSelect={() => pick('to_call')} icon="phone">
              To call us
            </MenuItem>
          ) : null}
          {mode === 'queue' && isOpen ? (
            <MenuItem onSelect={() => pick('declined')} icon="x">
              Declined
            </MenuItem>
          ) : null}
          {mode === 'queue' && isOpen ? (
            <MenuItem onSelect={() => pick('return')} icon="reply">
              Return to referrer
            </MenuItem>
          ) : null}
        </div>
      </Popover>
    </div>
  );
}

function MenuItem({ icon, onSelect, children }: { icon: UiIconName; onSelect: () => void; children: ReactNode }) {
  const Icon = ICONS[icon];
  return (
    <button type="button" role="menuitem" onClick={onSelect} className="flex h-10 items-center gap-2 rounded-control px-2 text-left text-base text-ink hover:bg-panel">
      <Icon size={16} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
      {children}
    </button>
  );
}

/** Phone card: the same information as the row, with the primary action full width at the bottom. */
function TodayCard({
  item,
  primaryOverride,
  clinic,
  referrer,
  sms,
  onOpen,
  onPrimary,
  now,
}: {
  item: QueueRow;
  primaryOverride?: { label: string; icon: UiIconName };
  clinic: string;
  referrer: string;
  sms: SmsMessage | null;
  onOpen: () => void;
  onPrimary: () => void;
  now: Date;
}) {
  const r = item.referral;
  const primary = primaryOverride ?? primaryLabel(item);
  return (
    <div className="flex min-w-0 flex-col gap-3 p-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-col gap-2 text-left">
        <span className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold text-ink">{r ? `${r.patientLastName}, ${r.patientFirstName}` : 'Text not linked to a referral'}</span>
            {r ? (
              <span className="tabular truncate text-sm text-ink-muted">
                {r.referenceNumber} · {ageGroupLabel(r.ageGroup)} · {clinic || 'Clinic not set'}
              </span>
            ) : null}
          </span>
          <DuePill item={item} now={now} />
        </span>
        <span className="text-base text-ink">
          {item.action}
          {item.dueAt ? <span className="text-ink-muted"> · {shortDate(item.dueAt)}</span> : null}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <SmsPill message={sms} />
          {referrer ? <span className="truncate">{referrer}</span> : null}
          {r ? <span className="tabular">{maskPhone(r.phone)}</span> : null}
        </span>
        <ProgressBar current={r?.currentStep ?? 0} />
      </button>
      {r ? (
        <Button variant="primary" icon={primary.icon} className="w-full" onClick={onPrimary}>
          {primary.label}
        </Button>
      ) : null}
    </div>
  );
}

/* ---------- bulk Coax ---------- */

function BulkCoaxDialog({
  items,
  pick,
  sending,
  onCancel,
  onConfirm,
}: {
  items: QueueRow[];
  pick: (r: Referral, step: number | null) => { key: string; name: string; body: string } | null;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const plan = items.map((item) => {
    const r = item.referral;
    const template = r ? pick(r, item.step) : null;
    return { item, template };
  });
  const byTemplate = new Map<string, number>();
  for (const p of plan) if (p.template) byTemplate.set(p.template.name, (byTemplate.get(p.template.name) ?? 0) + 1);
  const missing = plan.filter((p) => !p.template || !p.item.referral?.phone).length;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onCancel()}
      title={`Send ${items.length} Coax ${items.length === 1 ? 'message' : 'messages'}?`}
      description="Each referral gets the template shown. Texts cannot be recalled."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" icon="send" loading={sending} disabled={items.length - missing === 0} onClick={onConfirm}>
            Send {items.length - missing} {items.length - missing === 1 ? 'text' : 'texts'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-base">
        <ul className="flex flex-col gap-1.5">
          {[...byTemplate.entries()].map(([name, n]) => (
            <li key={name} className="flex items-center justify-between gap-3">
              <span className="text-ink">{name}</span>
              <span className="tabular text-ink-muted">{n}</span>
            </li>
          ))}
        </ul>
        {missing > 0 ? (
          <p className="text-sm text-danger">
            {missing} {missing === 1 ? 'referral has' : 'referrals have'} no phone number or template and will be skipped.
          </p>
        ) : null}
        <p className="text-sm text-ink-muted">Each message uses that referral's clinic. Open a referral first if you want to edit the wording.</p>
      </div>
    </Dialog>
  );
}
