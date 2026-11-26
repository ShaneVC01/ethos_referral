import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badges';
import { DataTable, sortOptions } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/forms';
import { ICONS } from '@/components/ui/icons';
import { MobileListControls, type ActiveFilterChip } from '@/components/ui/list-controls';
import { PageHeader } from '@/components/ui/page-header';
import { PillFilter } from '@/components/ui/pill-filter';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/surfaces';
import { useLookups, useReferrers, useReferrerTypes } from '@/data/hooks';
import { useDebouncedValue, useServerList } from '@/data/use-server-list';
import type { ReferrerRow, ReferrerSortField } from '@/data/repository';
import { clinicName } from '@/features/intake/intakeModel';
import { formatAuDate, type Referrer, type Tone } from '@/domain';
import { formatRate, SEGMENTS } from './referrerStats';

const SEGMENT_TONE: Record<string, { tone: Tone; icon: ComponentProps<typeof Badge>['icon'] }> = {
  Active: { tone: 'success', icon: 'check' },
  Lapsing: { tone: 'warning', icon: 'clock' },
  Lapsed: { tone: 'neutral', icon: 'x' },
  'No referral recorded': { tone: 'info', icon: 'dot' },
};

export function SegmentBadge({ segment }: { segment: string }) {
  const meta = SEGMENT_TONE[segment] ?? { tone: 'neutral' as Tone, icon: 'dot' as const };
  return (
    <Badge tone={meta.tone} icon={meta.icon}>
      {segment || 'Not set'}
    </Badge>
  );
}

function PracticeName({ name: found, linked }: { name: string | null; linked: boolean }) {
  if (!linked) return <span className="text-ink-muted">Not linked</span>;
  const name = found ?? 'Practice not found';
  return (
    <span className="block min-w-0 truncate" title={name}>
      {name}
    </span>
  );
}

function ReferrerNameLink({ referrer }: { referrer: Referrer }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-ink">
        {referrer.title ? `${referrer.title} ` : ''}
        {referrer.firstName} {referrer.lastName}
      </span>
    </span>
  );
}

export function ReferrersPage() {
  const navigate = useNavigate();
  const lookups = useLookups();
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('');
  const [professionalType, setProfessionalType] = useState('');
  const [clinicId, setClinicId] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search when the user is not already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtersActive = !!search.trim() || !!segment || !!professionalType || !!clinicId;
  const clearFilters = () => {
    setSearch('');
    setSegment('');
    setProfessionalType('');
    setClinicId('');
  };

  // Server-paged list (DESIGN.md 10.3): each sortable column names its server sort field. The server
  // filters, searches, sorts and returns one page of 100, with the practice and rate already joined.
  const columns = useMemo<ColumnDef<ReferrerRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        size: 180,
        meta: { sortField: 'name' },
        cell: ({ row }) => <ReferrerNameLink referrer={row.original} />,
      },
      {
        id: 'type',
        header: 'Type',
        size: 150,
        meta: { sortField: 'type' },
        cell: ({ row }) => <span className="block truncate">{row.original.type || 'Not set'}</span>,
      },
      {
        id: 'practice',
        header: 'Practice',
        size: 190,
        meta: { sortField: 'practice' },
        cell: ({ row }) => <PracticeName name={row.original.practiceName} linked={!!row.original.practiceId} />,
      },
      {
        id: 'suburb',
        header: 'Suburb',
        size: 120,
        meta: { sortField: 'suburb' },
        cell: ({ row }) => (row.original.suburb ? <span>{row.original.suburb}</span> : <span className="text-ink-muted">Not set</span>),
      },
      {
        id: 'segment',
        header: 'Segment',
        size: 150,
        meta: { sortField: 'segment' },
        cell: ({ row }) => <SegmentBadge segment={row.original.segment} />,
      },
      {
        id: 'conversion',
        header: 'Conversion rate',
        size: 120,
        meta: { sortField: 'conversion' },
        cell: ({ row }) => (
          <span className="tabular" title="Referrals that started treatment, out of all recorded referrals">
            {formatRate(row.original.conversionRate)}
          </span>
        ),
      },
      {
        id: 'totalReferrals',
        header: 'Total referrals',
        size: 100,
        meta: { sortField: 'totalReferrals' },
        cell: ({ row }) => <span className="tabular">{row.original.totalReferrals.toLocaleString('en-AU')}</span>,
      },
      {
        id: 'lastReferral',
        header: 'Last referral',
        size: 110,
        meta: { sortField: 'lastReferral' },
        cell: ({ row }) => (
          <span className="tabular">{row.original.lastReferralAt ? formatAuDate(row.original.lastReferralAt) : 'None'}</span>
        ),
      },
    ],
    [],
  );

  // Search runs on the server once typing pauses. Any filter, search or sort change goes back to page 1.
  const debouncedSearch = useDebouncedValue(search.trim());
  const list = useServerList<ReferrerSortField, ReferrerRow>({
    columns,
    initialSorting: [{ id: 'name', desc: false }],
    resetOn: [debouncedSearch, segment, professionalType, clinicId],
  });
  const query = useReferrers({
    search: debouncedSearch || undefined,
    segment: segment || undefined,
    professionalType: professionalType || undefined,
    clinicId: clinicId || undefined,
    orderBy: list.orderBy,
    offset: list.offset,
    limit: list.limit,
  });
  const rows = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const types = useReferrerTypes().data ?? [];

  const activeClinics = (lookups.data?.clinics ?? []).filter((c) => c.active);
  const segmentPills = (
    <div role="group" aria-label="Segment" className="flex flex-wrap gap-2">
      {['', ...SEGMENTS].map((seg) => (
        <PillFilter key={seg || 'all'} label={seg || 'All segments'} active={segment === seg} onClick={() => setSegment(seg)} />
      ))}
    </div>
  );
  const typeSelect = (
    <Select aria-label="Professional type" value={professionalType} onChange={(e) => setProfessionalType(e.target.value)}>
      <option value="">All types</option>
      {types.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </Select>
  );
  const clinicSelect = (
    <Select aria-label="Primary clinic" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
      <option value="">All clinics</option>
      {activeClinics.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
  const chips: ActiveFilterChip[] = [
    ...(segment ? [{ id: 'segment', label: segment, onRemove: () => setSegment('') }] : []),
    ...(professionalType ? [{ id: 'type', label: professionalType, onRemove: () => setProfessionalType('') }] : []),
    ...(clinicId ? [{ id: 'clinic', label: clinicName(lookups.data, clinicId) ?? 'Clinic', onRemove: () => setClinicId('') }] : []),
  ];
  const clearListFilters = () => {
    setSegment('');
    setProfessionalType('');
    setClinicId('');
  };

  const emptyState = filtersActive ? (
    <EmptyState
      icon="referrers"
      title="No referrers match these filters"
      description="Try a shorter search, or clear the filters to see everyone."
      action={
        <Button variant="secondary" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon="referrers"
      title="No referrers loaded yet"
      description="The Referrer Master has not been imported. A manager can import it from the Import screen."
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title="Referrers"
        description={
          query.isLoading ? 'Loading referrers' : `${total.toLocaleString('en-AU')} ${total === 1 ? 'referrer' : 'referrers'}${filtersActive ? ' match' : ''}`
        }
      />

      {/* Desktop: inline segment pills. Phone: these live in the Filter sheet. */}
      <div role="group" aria-label="Segment" className="hidden gap-2 md:flex md:flex-wrap">
        {['', ...SEGMENTS].map((seg) => (
          <PillFilter key={seg || 'all'} label={seg || 'All segments'} active={segment === seg} onClick={() => setSegment(seg)} />
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <Field label="Search" id="ref-search">
          <div className="relative">
            <Input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or practice. Press / to search"
              autoComplete="off"
              className="pl-9"
            />
            <ICONS.search size={16} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          </div>
        </Field>
        <div className="hidden md:block">
          <Field label="Professional type" id="ref-type">
            {typeSelect}
          </Field>
        </div>
        <div className="hidden md:block">
          <Field label="Primary clinic" id="ref-clinic">
            {clinicSelect}
          </Field>
        </div>
      </div>

      <MobileListControls
        itemNoun={total === 1 ? 'referrer' : 'referrers'}
        resultCount={total}
        groups={[
          { id: 'segment', label: 'Segment', activeCount: segment ? 1 : 0, content: segmentPills },
          { id: 'type', label: 'Professional type', activeCount: professionalType ? 1 : 0, content: typeSelect },
          { id: 'clinic', label: 'Primary clinic', activeCount: clinicId ? 1 : 0, content: clinicSelect },
        ]}
        activeChips={chips}
        onClearFilters={clearListFilters}
        sortOptions={sortOptions(columns)}
        sorting={list.sorting}
        onSortingChange={list.setSorting}
      />

      <div className="flex min-h-[18rem] flex-1 flex-col overflow-hidden rounded-panel border border-line bg-surface">
        <DataTable<ReferrerRow>
          caption="Referrers"
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          hideBelowMd={['type', 'suburb', 'totalReferrals']}
          sorting={list.sorting}
          onSortingChange={list.setSorting}
          pagination={list.pagination(total)}
          itemNoun="referrers"
          onRowActivate={(r) => navigate(`/referrers/${r.id}`)}
          emptyState={emptyState}
          renderCard={(r) => (
            <ReferrerCard referrer={r} clinic={clinicName(lookups.data, r.primaryClinicId)} />
          )}
          className="min-h-[18rem]"
        />
      </div>

      {!query.isLoading && query.isError ? (
        <p role="alert" className="text-sm text-danger">
          The referrers could not be loaded. Refresh the page to try again.
        </p>
      ) : null}
    </div>
  );
}

function ReferrerCard({ referrer, clinic }: { referrer: ReferrerRow; clinic: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <ReferrerNameLink referrer={referrer} />
        <SegmentBadge segment={referrer.segment} />
      </div>
      <div className="truncate text-sm text-ink-muted">
        {referrer.type || 'Not set'}, {referrer.practiceId ? referrer.practiceName ?? 'Practice not found' : 'Not linked'}
      </div>
      <dl className="tabular grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-ink-muted">Conversion</dt>
          <dd className="text-ink">{formatRate(referrer.conversionRate)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Referrals</dt>
          <dd className="text-ink">{referrer.totalReferrals.toLocaleString('en-AU')}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Last referral</dt>
          <dd className="text-ink">{referrer.lastReferralAt ? formatAuDate(referrer.lastReferralAt) : 'None'}</dd>
        </div>
      </dl>
      <dl className="tabular text-sm">
        <div className="flex gap-1">
          <dt className="text-ink-muted">Clinic</dt>
          <dd className="truncate text-ink">{clinic ?? 'Not set'}</dd>
        </div>
      </dl>
    </div>
  );
}

