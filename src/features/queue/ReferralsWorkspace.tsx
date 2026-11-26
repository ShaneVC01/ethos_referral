import { useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { SOURCE_META, STATUS_META, REFERRAL_SOURCES, REFERRAL_STATUSES, nextAction, type ReferralSource, type ReferralStatus } from '@/domain';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Checkbox, Field, Input, Select } from '@/components/ui/forms';
import { DatePicker } from '@/components/ui/date-picker';
import { DataTable, sortOptions, type Density } from '@/components/ui/data-table';
import { MobileListControls, type ActiveFilterChip, type FilterGroup } from '@/components/ui/list-controls';
import { EmptyState } from '@/components/ui/surfaces';
import { PageHeader } from '@/components/ui/page-header';
import { Popover } from '@/components/ui/overlays';
import { KpiCard } from '@/components/ui/kpi-card';
import { PillFilter } from '@/components/ui/pill-filter';
import { StatusBadge } from '@/components/ui/badges';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { ICONS } from '@/components/ui/icons';
import { useDemoNow, useReferrals, useReferrerSearch, useSettings } from '@/data/hooks';
import { useDebouncedValue, useServerList } from '@/data/use-server-list';
import type { ReferralRow, ReferralSortField } from '@/data/repository';
import { useNames, isTyping, useReferralSummary, exportReferralsCsv } from './queue-hooks';
import { clinicDay, receivedDate, sourceLabel } from './queue-model';
import { NextActionText, PatientCell, ReferrerLink, StatusCell, stepText } from './parts';
import { ReferralDrawer } from './ReferralDrawer';
import { Link } from 'react-router-dom';

export interface Filters {
  search: string;
  status: '' | ReferralStatus;
  step: '' | '0' | '1' | '2' | '3' | '4';
  clinicId: string;
  orthodontistId: string;
  source: '' | ReferralSource;
  referrerId: string | null;
  referrerLabel: string;
  receivedFrom: string | null;
  receivedTo: string | null;
  overdue: boolean;
}

export const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  step: '',
  clinicId: '',
  orthodontistId: '',
  source: '',
  referrerId: null,
  referrerLabel: '',
  receivedFrom: null,
  receivedTo: null,
  overdue: false,
};

/** Default order: most recently received first. */
const DEFAULT_SORT = [{ id: 'received', desc: true }];

/**
 * Column ids and the server sort field for each sortable column. Every page is sorted on the server, so a
 * column can only sort when it declares a sortField. The table columns below declare the same fields.
 */
const SORT_FIELDS: ColumnDef<ReferralRow, unknown>[] = [
  { id: 'received', header: 'Received', meta: { sortField: 'receivedAt' } },
  { id: 'patient', header: 'Patient', meta: { sortField: 'patient' } },
  { id: 'age', header: 'Age', meta: { sortField: 'ageGroup' } },
  { id: 'clinic', header: 'Clinic', meta: { sortField: 'clinic' } },
  { id: 'ortho', header: 'Orthodontist', meta: { sortField: 'orthodontist' } },
  { id: 'referrer', header: 'Referrer', meta: { sortField: 'referrer' } },
  { id: 'source', header: 'Source', meta: { sortField: 'source' } },
  { id: 'step', header: 'Step', meta: { sortField: 'currentStep' } },
  { id: 'next', header: 'Next action', meta: { sortField: 'nextActionAt' } },
  { id: 'status', header: 'Status', meta: { sortField: 'status' } },
  { id: 'assigned', header: 'Assigned', meta: { sortField: 'assignedTo' } },
];

const EMPTY_SUMMARY = { total: 0, active: 0, booked: 0, toCall: 0, overdue: 0 };

interface SavedView {
  id: string;
  name: string;
  filters: Filters;
}

/** Saved views live in memory for this session only. They are not stored in the browser. */
const memoryViews: SavedView[] = [];

const ACTIVE_FILTER_COUNT = (f: Filters) =>
  [f.search, f.status, f.step, f.clinicId, f.orthodontistId, f.source, f.referrerId, f.receivedFrom, f.receivedTo, f.overdue ? 'x' : ''].filter(Boolean).length;

const STEP_LABELS: Record<string, string> = { '0': 'Coax #1', '1': 'Day 1 call', '2': 'Day 14 call', '3': '3 month final', '4': 'Finished' };

/**
 * Referrals list with search, filters, saved views, density and CSV export. On 1280px and wider the list
 * sits beside the open referral. Used by both /referrals and /referrals/:id, so the list keeps its place.
 * Every filter, search, sort and page is a server query. Phone: search stays above; every other filter
 * lives in the grouped Filter sheet, and sorting in the Sort sheet.
 */
export function ReferralsWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useDemoNow();
  const settings = useSettings();
  const names = useNames();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [density, setDensity] = useState<Density>('comfortable');
  const [views, setViews] = useState<SavedView[]>(memoryViews);
  const [viewName, setViewName] = useState<string | null>(null);
  const [referrerQuery, setReferrerQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const openId = id ?? null;

  // "/" moves to search, unless the user is already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTyping(e.target) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Search is debounced, then re-queried on the server. Every other filter is re-queried as it changes.
  const debouncedSearch = useDebouncedValue(filters.search.trim());
  const list = useServerList<ReferralSortField, ReferralRow>({
    columns: SORT_FIELDS,
    initialSorting: DEFAULT_SORT,
    resetOn: [debouncedSearch, filters.status, filters.step, filters.clinicId, filters.orthodontistId, filters.source, filters.referrerId, filters.receivedFrom, filters.receivedTo, filters.overdue],
  });

  const filterQuery = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      statuses: filters.status ? [filters.status] : undefined,
      currentStep: filters.step === '' ? undefined : Number(filters.step),
      clinicId: filters.clinicId || undefined,
      orthodontistId: filters.orthodontistId || undefined,
      source: filters.source || undefined,
      referrerId: filters.referrerId ?? undefined,
      receivedFrom: filters.receivedFrom ?? undefined,
      receivedTo: filters.receivedTo ?? undefined,
      dueBefore: filters.overdue ? now.toISOString() : undefined,
    }),
    [debouncedSearch, filters, now],
  );
  const rowsQuery = useReferrals({ ...filterQuery, orderBy: list.orderBy, offset: list.offset, limit: list.limit });
  const rows = rowsQuery.data?.items ?? [];
  const total = rowsQuery.data?.total ?? 0;
  const summaryQuery = useReferralSummary({ ...filterQuery, asOf: now.toISOString() });
  const summary = summaryQuery.data ?? EMPTY_SUMMARY;

  const referrerOptions = useReferrerSearch(referrerQuery).data ?? [];
  const comboOptions: ComboboxOption<string>[] = referrerOptions.map((r) => ({
    value: r.id,
    label: `${r.firstName} ${r.lastName}`.trim(),
    description: r.id,
  }));

  const columns = useMemo<ColumnDef<ReferralRow, unknown>[]>(() => {
    const nextFor = (r: ReferralRow) => (settings.data?.cadence ? nextAction(r, settings.data.cadence, now) : null);
    return [
      { id: 'received', header: 'Received', size: 110, meta: { sortField: 'receivedAt' }, cell: ({ row }) => <span className="tabular">{receivedDate(row.original)}</span> },
      { id: 'patient', header: 'Patient', size: 260, meta: { sortField: 'patient' }, cell: ({ row }) => <PatientCell r={row.original} /> },
      { id: 'age', header: 'Age', size: 56, meta: { sortField: 'ageGroup' }, cell: ({ row }) => <span className="tabular">{row.original.ageGroup ?? '-'}</span> },
      { id: 'clinic', header: 'Clinic', size: 150, meta: { sortField: 'clinic' }, cell: ({ row }) => row.original.clinicName || '-' },
      { id: 'ortho', header: 'Orthodontist', size: 140, meta: { sortField: 'orthodontist' }, cell: ({ row }) => row.original.orthodontistName || '-' },
      {
        id: 'referrer',
        header: 'Referrer',
        size: 170,
        meta: { sortField: 'referrer' },
        cell: ({ row }) => <ReferrerLink referrerId={row.original.referrerId} name={row.original.referrerName ?? row.original.referrerText?.name ?? ''} />,
      },
      { id: 'source', header: 'Source', size: 130, meta: { sortField: 'source' }, cell: ({ row }) => sourceLabel(row.original.source) },
      { id: 'step', header: 'Step', size: 120, meta: { sortField: 'currentStep' }, cell: ({ row }) => stepText(row.original) },
      {
        id: 'next',
        header: 'Next action',
        size: 280,
        meta: { sortField: 'nextActionAt' },
        cell: ({ row }) => <NextActionText next={nextFor(row.original)} closedText={row.original.closedReason ? 'Closed' : 'No action due'} />,
      },
      { id: 'status', header: 'Status', size: 130, meta: { sortField: 'status' }, cell: ({ row }) => <StatusCell r={row.original} /> },
      { id: 'assigned', header: 'Assigned', size: 100, meta: { sortField: 'assignedTo' }, cell: ({ row }) => names.staff(row.original.assignedTo) || '-' },
    ];
  }, [settings.data, now, names]);

  const exportCsv = async () => {
    if (total === 0) {
      notifyError('There is nothing to export in this view.');
      return;
    }
    try {
      // The server builds the CSV for every matching row in the current sort order, not just this page.
      const csv = await exportReferralsCsv({ ...filterQuery, orderBy: list.orderBy, asOf: now.toISOString() });
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `referrals-${clinicDay(now)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notifySuccess(`Exported ${total} referrals`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The export could not be made.');
    }
  };

  const saveView = () => {
    const name = (viewName ?? '').trim();
    if (!name) return;
    const view: SavedView = { id: `view-${Date.now().toString(36)}`, name, filters };
    memoryViews.push(view);
    setViews([...memoryViews]);
    setViewName(null);
    notifySuccess(`Saved view "${name}"`);
  };

  const open = (r: ReferralRow) => navigate(`/referrals/${r.id}`);
  const closeDrawer = () => navigate('/referrals', { replace: true });

  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.search.trim()) activeChips.push({ key: 'search', label: `Search: ${filters.search.trim()}`, clear: () => setFilters((f) => ({ ...f, search: '' })) });
  if (filters.status) activeChips.push({ key: 'status', label: `Status: ${STATUS_META[filters.status].label}`, clear: () => setFilters((f) => ({ ...f, status: '' })) });
  if (filters.step !== '') activeChips.push({ key: 'step', label: `Step: ${STEP_LABELS[filters.step]}`, clear: () => setFilters((f) => ({ ...f, step: '' })) });
  if (filters.clinicId) activeChips.push({ key: 'clinic', label: `Clinic: ${names.clinic(filters.clinicId)}`, clear: () => setFilters((f) => ({ ...f, clinicId: '' })) });
  if (filters.orthodontistId) activeChips.push({ key: 'ortho', label: `Orthodontist: ${names.ortho(filters.orthodontistId)}`, clear: () => setFilters((f) => ({ ...f, orthodontistId: '' })) });
  if (filters.source) activeChips.push({ key: 'source', label: `Source: ${SOURCE_META[filters.source].label}`, clear: () => setFilters((f) => ({ ...f, source: '' })) });
  if (filters.referrerId) activeChips.push({ key: 'referrer', label: `Referrer: ${filters.referrerLabel || filters.referrerId}`, clear: () => setFilters((f) => ({ ...f, referrerId: null, referrerLabel: '' })) });
  if (filters.receivedFrom || filters.receivedTo) activeChips.push({ key: 'dates', label: `Received: ${filters.receivedFrom ?? 'start'} to ${filters.receivedTo ?? 'today'}`, clear: () => setFilters((f) => ({ ...f, receivedFrom: null, receivedTo: null })) });
  if (filters.overdue) activeChips.push({ key: 'overdue', label: 'Overdue only', clear: () => setFilters((f) => ({ ...f, overdue: false })) });

  const moreCount = [filters.orthodontistId, filters.source, filters.referrerId, filters.receivedFrom, filters.receivedTo, filters.overdue ? 'x' : ''].filter(Boolean).length;
  const clinicList = names.clinicList;
  const today = clinicDay(now);

  /* ---------- filter controls. Each is built once and used inline on desktop and inside the phone sheet. ---------- */

  const statusSelect = (
    <Select aria-label="Status" className="h-11 md:h-9" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as '' | ReferralStatus }))}>
      <option value="">All statuses</option>
      {REFERRAL_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </Select>
  );
  const stepSelect = (
    <Select aria-label="Step" className="h-11 md:h-9" value={filters.step} onChange={(e) => setFilters((f) => ({ ...f, step: e.target.value as Filters['step'] }))}>
      <option value="">All steps</option>
      <option value="0">Coax #1</option>
      <option value="1">Day 1 call</option>
      <option value="2">Day 14 call</option>
      <option value="3">3 month final</option>
      <option value="4">Finished</option>
    </Select>
  );
  const clinicSelect = (
    <Select aria-label="Clinic" className="h-11 md:h-9" value={filters.clinicId} onChange={(e) => setFilters((f) => ({ ...f, clinicId: e.target.value }))}>
      <option value="">All clinics</option>
      {clinicList.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
  const orthoSelect = (
    <Select aria-label="Orthodontist" className="h-11 md:h-9" value={filters.orthodontistId} onChange={(e) => setFilters((f) => ({ ...f, orthodontistId: e.target.value }))}>
      <option value="">All orthodontists</option>
      {names.orthoList
        .filter((o) => o.active)
        .map((o) => (
          <option key={o.id} value={o.id}>
            {o.fullName}
          </option>
        ))}
    </Select>
  );
  const sourceSelect = (
    <Select aria-label="Source" className="h-11 md:h-9" value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value as '' | ReferralSource }))}>
      <option value="">All sources</option>
      {REFERRAL_SOURCES.map((s) => (
        <option key={s} value={s}>
          {SOURCE_META[s].label}
        </option>
      ))}
    </Select>
  );
  const referrerCombo = (
    <Combobox<string>
      label="Referrer"
      value={filters.referrerId}
      selectedLabel={filters.referrerLabel}
      placeholder="Type two letters"
      options={comboOptions}
      loading={false}
      onInputChange={setReferrerQuery}
      onChange={(value, option) => {
        setFilters((f) => ({ ...f, referrerId: value, referrerLabel: option?.label ?? '' }));
        if (!value) setReferrerQuery('');
      }}
    />
  );
  const dateFilters = (
    <div className="grid grid-cols-2 gap-3">
      <DatePicker id="filter-from" label="Received from" value={filters.receivedFrom} max={filters.receivedTo ?? today} onChange={(v) => setFilters((f) => ({ ...f, receivedFrom: v }))} />
      <DatePicker id="filter-to" label="Received to" value={filters.receivedTo} min={filters.receivedFrom ?? undefined} max={today} onChange={(v) => setFilters((f) => ({ ...f, receivedTo: v }))} />
    </div>
  );
  const overdueCheckbox = <Checkbox id="filter-overdue" checked={filters.overdue} onCheckedChange={(v) => setFilters((f) => ({ ...f, overdue: v }))} label="Overdue only" />;
  const viewControls = (
    <div className="flex flex-col gap-3 border-t border-line-subtle pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Saved views"
          className="h-9 w-44"
          value=""
          onChange={(e) => {
            const view = views.find((v) => v.id === e.target.value);
            if (view) setFilters(view.filters);
          }}
        >
          <option value="">Saved views</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Button variant="ghost" size="sm" onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))} aria-pressed={density === 'compact'}>
          {density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
        </Button>
      </div>
      {viewName === null ? (
        <Button variant="ghost" size="sm" icon="plus" onClick={() => setViewName('')} disabled={ACTIVE_FILTER_COUNT(filters) === 0}>
          Save these filters as a view
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input aria-label="View name" className="h-9" placeholder="View name" value={viewName} onChange={(e) => setViewName(e.target.value)} />
          <Button variant="primary" size="sm" onClick={saveView} disabled={!viewName.trim()}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
  const statusPills = (
    <div className="flex flex-wrap gap-2">
      <PillFilter label="All" active={!filters.status && !filters.overdue} onClick={() => setFilters((f) => ({ ...f, status: '', overdue: false }))} />
      <PillFilter label="To call us" icon="phone" tone="warning" active={filters.status === 'to_call_us'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'to_call_us' ? '' : 'to_call_us' }))} />
      <PillFilter label="Booked" icon="check" active={filters.status === 'booked'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'booked' ? '' : 'booked' }))} />
      <PillFilter label="Do not contact" icon="ban" active={filters.status === 'do_not_contact'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'do_not_contact' ? '' : 'do_not_contact' }))} />
    </div>
  );

  // Phone Filter sheet groups. Search is not a group: it stays visible above the toolbar.
  const filterGroups: FilterGroup[] = [
    { id: 'status', label: 'Status', activeCount: filters.status ? 1 : 0, content: <div className="flex flex-col gap-3">{statusPills}{statusSelect}</div> },
    { id: 'step', label: 'Step', activeCount: filters.step !== '' ? 1 : 0, content: stepSelect },
    { id: 'clinic', label: 'Clinic', activeCount: filters.clinicId ? 1 : 0, content: clinicSelect },
    { id: 'ortho', label: 'Orthodontist', activeCount: filters.orthodontistId ? 1 : 0, content: orthoSelect },
    { id: 'source', label: 'Source', activeCount: filters.source ? 1 : 0, content: sourceSelect },
    { id: 'referrer', label: 'Referrer', activeCount: filters.referrerId ? 1 : 0, content: referrerCombo },
    { id: 'received', label: 'Received date', activeCount: filters.receivedFrom || filters.receivedTo ? 1 : 0, content: dateFilters },
    {
      id: 'other',
      label: 'Other',
      activeCount: filters.overdue ? 1 : 0,
      content: (
        <div className="flex flex-col gap-4">
          {overdueCheckbox}
          {viewControls}
        </div>
      ),
    },
  ];
  const mobileChips: ActiveFilterChip[] = activeChips.filter((c) => c.key !== 'search').map((c) => ({ id: c.key, label: c.label, onRemove: c.clear }));

  return (
    <div className="flex min-h-0 flex-1 gap-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
        <PageHeader
          title="Referrals"
          description={`${total} ${total === 1 ? 'referral' : 'referrals'} in this view. Press j and k to move, Enter to open, / to search.`}
          actions={
            <Button variant="secondary" icon="download" onClick={() => void exportCsv()}>
              Export CSV
            </Button>
          }
        />

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Total" count={summary.total} tone="neutral" active={!filters.status && !filters.overdue} hint="In this view" onClick={() => setFilters((f) => ({ ...f, status: '', overdue: false }))} />
          <KpiCard label="Active" count={summary.active} tone="accent" hint="Still being contacted" active={false} onClick={() => setFilters((f) => ({ ...f, status: '', overdue: false }))} />
          <KpiCard label="Booked" count={summary.booked} tone="success" hint="Booked in Edge" active={filters.status === 'booked'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'booked' ? '' : 'booked' }))} />
          <KpiCard label="To call us" count={summary.toCall} tone="warning" hint="Patient to call the clinic" active={filters.status === 'to_call_us'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'to_call_us' ? '' : 'to_call_us' }))} />
        </section>

        <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-3 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Search" className="w-full md:w-auto">
              <div className="relative">
                <ICONS.search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <Input
                  ref={searchRef}
                  type="search"
                  placeholder="Name, reference, phone or referrer"
                  className="h-11 w-full pl-9 md:h-9 md:w-72"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </Field>
            <div className="hidden md:block">
              <Field label="Status">{statusSelect}</Field>
            </div>
            <div className="hidden md:block">
              <Field label="Step">{stepSelect}</Field>
            </div>
            <div className="hidden md:block">
              <Field label="Clinic">{clinicSelect}</Field>
            </div>
            <div className="hidden md:block">
              <Popover
                open={moreOpen}
                onOpenChange={setMoreOpen}
                align="end"
                className="w-[22rem] p-4"
                trigger={
                  <Button variant="secondary" icon="settings" className="md:h-9" aria-expanded={moreOpen}>
                    More filters{moreCount > 0 ? ` (${moreCount})` : ''}
                  </Button>
                }
              >
                <div className="flex flex-col gap-4">
                  <Field label="Orthodontist">{orthoSelect}</Field>
                  <Field label="Source">{sourceSelect}</Field>
                  {referrerCombo}
                  {dateFilters}
                  {overdueCheckbox}
                  {viewControls}
                </div>
              </Popover>
            </div>
          </div>

          {activeChips.length > 0 ? (
            <div className="hidden flex-wrap items-center gap-2 border-t border-line-subtle pt-3 md:flex" aria-label="Active filters">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  aria-label={`Remove filter ${chip.label}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-accent bg-accent-subtle px-3 text-sm text-ink hover:bg-surface"
                >
                  {chip.label}
                  <ICONS.close size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all
              </Button>
            </div>
          ) : null}
        </div>

        <MobileListControls
          itemNoun={total === 1 ? 'referral' : 'referrals'}
          resultCount={total}
          groups={filterGroups}
          activeChips={mobileChips}
          onClearFilters={() => setFilters(EMPTY_FILTERS)}
          sortOptions={sortOptions(columns)}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
        />

        <div role="group" aria-label="Quick filters" className="hidden gap-2 md:flex md:flex-wrap">
          <PillFilter label="All" active={!filters.status && !filters.overdue} onClick={() => setFilters((f) => ({ ...f, status: '', overdue: false }))} />
          <PillFilter label="Overdue" count={summary.overdue} icon="alert" tone="danger" active={filters.overdue} onClick={() => setFilters((f) => ({ ...f, overdue: !f.overdue }))} />
          <PillFilter label="To call us" icon="phone" tone="warning" active={filters.status === 'to_call_us'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'to_call_us' ? '' : 'to_call_us' }))} />
          <PillFilter label="Booked" icon="check" active={filters.status === 'booked'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'booked' ? '' : 'booked' }))} />
          <PillFilter label="Do not contact" icon="ban" active={filters.status === 'do_not_contact'} onClick={() => setFilters((f) => ({ ...f, status: f.status === 'do_not_contact' ? '' : 'do_not_contact' }))} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card">
          <DataTable<ReferralRow>
            caption="Referrals"
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            density={density}
            selectedId={openId ?? null}
            loading={rowsQuery.isPending}
            sorting={list.sorting}
            onSortingChange={list.setSorting}
            pagination={list.pagination(total)}
            itemNoun="referrals"
            onRowActivate={open}
            renderCard={(r) => {
              const next = settings.data?.cadence ? nextAction(r, settings.data.cadence, now) : null;
              return (
                <div className="flex min-w-0 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <PatientCell r={r} />
                    <StatusBadge status={r.status} />
                  </div>
                  <NextActionText next={next} closedText={r.closedReason ? 'Closed' : 'No action due'} />
                  <p className="text-sm text-ink-muted">
                    {r.clinicName || 'No clinic'} · {sourceLabel(r.source)}
                  </p>
                </div>
              );
            }}
            emptyState={
              rowsQuery.isError ? (
                <EmptyState icon="alert" title="The referrals could not be loaded" description="Check the connection, then try again." action={<Button variant="secondary" onClick={() => void rowsQuery.refetch()}>Try again</Button>} />
              ) : rowsQuery.isPending ? (
                <EmptyState icon="referrals" title="Loading referrals" description="This takes a moment on the first load." />
              ) : (
                <EmptyState
                  icon="referrals"
                  title="No referrals match these filters"
                  description="Change or clear a filter. Saved views keep a set of filters for the session."
                  action={
                    ACTIVE_FILTER_COUNT(filters) > 0 ? (
                      <Button variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
                        Clear filters
                      </Button>
                    ) : (
                      <Link to="/referrals/new" className="text-accent underline underline-offset-4">
                        Add a referral
                      </Link>
                    )
                  }
                />
              )
            }
            className="min-h-0"
          />
        </div>
      </div>

      {openId ? <ReferralDrawer id={openId} onClose={closeDrawer} /> : null}
    </div>
  );
}
