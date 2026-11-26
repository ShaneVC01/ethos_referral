import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DatePicker } from '@/components/ui/date-picker';
import { Field, Select } from '@/components/ui/forms';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, Skeleton } from '@/components/ui/surfaces';
import { ICONS } from '@/components/ui/icons';
import { useDemoNow, useLookups } from '@/data/hooks';
import type { DashboardMetrics, DashboardQuery } from '@/data';
import { ChartPanel, BarList, Heatmap, LineChart } from './charts';
import { useDashboardMetrics } from './hooks';
import { dayKey, formatCount, formatHours, formatPct, presetRange, type DayRange, type RangePreset } from './metrics';

const PRESET_LABELS: Record<RangePreset, string> = {
  month: 'This month',
  quarter: 'This quarter',
  fy: 'Financial year (1 July to 30 June)',
  custom: 'Custom dates',
};

const dateLong = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' });

function fmtRange(r: DayRange): string {
  const f = (k: string) => dateLong.format(new Date(`${k}T12:00:00+10:00`));
  return `${f(r.from)} to ${f(r.to)}`;
}

function signedPct(now: number | null, base: number): string {
  if (now === null || !base) return 'n/a';
  const delta = (now - base) / base;
  return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
}

function signedPts(now: number | null, base: number): string {
  if (now === null) return 'n/a';
  const pts = (now - base) * 100;
  return `${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`;
}

/*
 * The page holds only filter state. Every number comes from the server (data.dashboard.metrics), computed over
 * the full data set. The page never downloads referral, contact or SMS rows, and never counts them.
 */
export function DashboardPage() {
  const now = useDemoNow();
  const lookups = useLookups();

  const [preset, setPreset] = useState<RangePreset>('quarter');
  const [customFrom, setCustomFrom] = useState<string | null>(() => presetRange('month', now).from);
  const [customTo, setCustomTo] = useState<string | null>(() => presetRange('month', now).to);
  const [clinicId, setClinicId] = useState('');

  const query: DashboardQuery = useMemo(
    () => ({
      preset,
      from: preset === 'custom' ? customFrom ?? undefined : undefined,
      to: preset === 'custom' ? customTo ?? undefined : undefined,
      clinicId: clinicId || null,
    }),
    [preset, customFrom, customTo, clinicId],
  );
  const metricsQuery = useDashboardMetrics(query);
  const m = metricsQuery.data;
  const activeClinics = (lookups.data?.clinics ?? []).filter((c) => c.active);

  return (
    <>
      <PageHeader title="Dashboard" description="Referral volumes, bookings and overdue work. Dates use the clinic calendar." />

      <form className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end" aria-label="Dashboard filters" onSubmit={(e) => e.preventDefault()}>
        <Field label="Period">
          <Select value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)}>
            {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        {preset === 'custom' ? (
          <>
            <DatePicker label="From" value={customFrom} onChange={setCustomFrom} max={customTo ?? undefined} />
            <DatePicker label="To" value={customTo} onChange={setCustomTo} min={customFrom ?? undefined} />
          </>
        ) : (
          <p className="text-sm text-ink-muted sm:col-span-2 lg:col-span-2" aria-live="polite">
            Showing {m ? fmtRange(m.range) : 'the period'}
          </p>
        )}
        <Field label="Clinic">
          <Select value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="">All clinics</option>
            {activeClinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>

      {metricsQuery.isError && !m ? (
        <p role="alert" className="mb-6 rounded-panel border border-line bg-surface p-4 text-sm text-ink">
          The dashboard could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      {m ? <DashboardBody m={m} /> : metricsQuery.isError ? null : <DashboardSkeleton />}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function DashboardBody({ m }: { m: DashboardMetrics }) {
  const cmp = m.compare2025;
  const showComparison = cmp !== null;
  const clinicLabel = m.clinicName ?? 'all clinics';
  const scopeNote = m.clinicName ? `Clinic: ${m.clinicName}. 2025 comparisons are for all clinics, so they are hidden.` : 'All clinics.';
  const sameMonthRef = cmp ? ` Same month 2025: ${formatCount(cmp.sameMonth.received)} received, ${formatPct(cmp.sameMonth.bookedPct)} booked.` : '';
  const monthly = m.monthly;
  const yMaxCount = Math.max(50, ...monthly.received.map((v) => v ?? 0), ...monthly.received2025.map((v) => v));
  const funnelTotal = m.funnel.reduce((a, r) => a + r.count, 0);

  const kpis = [
    {
      key: 'received',
      label: 'Received',
      mtd: formatCount(m.mtd.received),
      ytd: formatCount(m.ytd.received),
      compare: cmp ? `2025 year to date ${formatCount(cmp.ytd.received)}, ${signedPct(m.ytd.received, cmp.ytd.received)}` : null,
    },
    {
      key: 'booked',
      label: 'Booked',
      mtd: formatCount(m.mtd.booked),
      ytd: formatCount(m.ytd.booked),
      compare: cmp ? `2025 year to date ${formatCount(cmp.ytd.booked)}, ${signedPct(m.ytd.booked, cmp.ytd.booked)}` : null,
    },
    {
      key: 'bookedPct',
      label: 'Booked %',
      mtd: formatPct(m.mtd.bookedPct),
      ytd: formatPct(m.ytd.bookedPct),
      compare: cmp ? `2025 year to date ${formatPct(cmp.ytd.bookedPct)}, ${signedPts(m.ytd.bookedPct, cmp.ytd.bookedPct)}` : null,
    },
    { key: 'toCallUs', label: 'To call us', mtd: formatCount(m.mtd.toCallUs), ytd: formatCount(m.ytd.toCallUs), compare: null },
    { key: 'dnc', label: 'Do not contact', mtd: formatCount(m.mtd.doNotContact), ytd: formatCount(m.ytd.doNotContact), compare: null },
    { key: 'noStatus', label: 'No status yet', mtd: formatCount(m.mtd.noStatus), ytd: formatCount(m.ytd.noStatus), compare: null },
  ];

  return (
    <>
      {m.totalReferrals === 0 ? (
        <EmptyState
          icon="dashboard"
          title="No referrals to report on yet"
          description="Import the tracker or log a referral, then the totals, funnel and workload fill in here."
          action={
            <Link to="/import" className="inline-flex h-9 items-center rounded-control bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover">
              Go to import
            </Link>
          }
        />
      ) : null}

      <section aria-labelledby="kpi-heading" className="mb-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="kpi-heading" className="text-lg font-semibold text-ink">
            Totals
          </h2>
          <p className="text-sm text-ink-muted">{scopeNote}</p>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-surface sm:grid-cols-3 xl:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.key} className="border-b border-r border-line-subtle p-4">
              <p className="text-sm font-medium text-ink-muted">{k.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{k.ytd}</p>
              <p className="text-sm tabular-nums text-ink-muted">Year to date</p>
              <p className="mt-2 text-sm tabular-nums text-ink">Month to date: {k.mtd}</p>
              {k.compare ? <p className="mt-1 text-xs tabular-nums text-ink-muted">{k.compare}</p> : null}
            </div>
          ))}
        </div>
        {showComparison ? (
          <p className="mt-2 text-xs text-ink-muted">
            2025 figures are monthly totals from the spreadsheet Totals tab (constants).{sameMonthRef}
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Referrals received by month"
          description={`Calendar year to date, ${clinicLabel}`}
          summary={`Monthly referrals received this year, ${monthly.received.filter((v) => v !== null).length} months so far. ${showComparison ? '2025 comparison shown alongside.' : ''}`}
          table={{
            headers: ['Month', '2026 received', ...(showComparison ? ['2025 received'] : [])],
            rows: monthly.labels.map((l, i) => [l, monthly.received[i] ?? 'n/a', ...(showComparison ? [monthly.received2025[i] ?? 'n/a'] : [])]),
          }}
          empty={m.totalReferrals === 0}
          emptyText="No referrals received yet, so there is no monthly trend."
        >
          <LineChart
            ariaLabel="Referrals received by month, 2026 against 2025"
            labels={monthly.labels}
            yMax={Math.ceil(yMaxCount / 50) * 50}
            format={(v) => formatCount(Math.round(v))}
            series={[
              { name: '2026', values: monthly.received, role: 'current' },
              ...(showComparison ? [{ name: '2025', values: [...monthly.received2025], role: 'reference' as const }] : []),
            ]}
          />
        </ChartPanel>

        <ChartPanel
          title="Booked % by month"
          description="Booked divided by received, per calendar month"
          summary={`Monthly booked percentage. ${showComparison ? 'The 2025 line is the Totals tab value for each month.' : ''}`}
          table={{
            headers: ['Month', '2026 booked %', ...(showComparison ? ['2025 booked %'] : [])],
            rows: monthly.labels.map((l, i) => [l, formatPct(monthly.bookedPct[i] ?? null), ...(showComparison ? [formatPct(monthly.bookedPct2025[i] ?? null)] : [])]),
          }}
          empty={m.totalReferrals === 0}
          emptyText="No referrals received yet, so there is no booked percentage."
        >
          <LineChart
            ariaLabel="Booked percentage by month, 2026 against 2025"
            labels={monthly.labels}
            yMax={1}
            format={(v) => `${Math.round(v * 100)}%`}
            series={[
              { name: '2026', values: monthly.bookedPct, role: 'current' },
              ...(showComparison ? [{ name: '2025', values: [...monthly.bookedPct2025], role: 'reference' as const }] : []),
            ]}
          />
        </ChartPanel>

        <ChartPanel
          title="Booked by contact step"
          description="The cadence step each booked referral had reached"
          summary={`Booked referrals by the step reached when booked, ${funnelTotal} in total.`}
          table={{ headers: ['Step', 'Booked', 'Share'], rows: m.funnel.map((r) => [r.label, r.count, formatPct(r.share, 0)]) }}
          empty={m.period.booked === 0}
          emptyText="Nothing booked in this period yet."
        >
          <BarList
            ariaLabel="Booked referrals by contact step"
            items={m.funnel.map((r) => ({ label: r.label, value: r.count, display: formatCount(r.count), sub: r.share === null ? undefined : `${formatPct(r.share, 0)} of booked` }))}
          />
        </ChartPanel>

        <ChartPanel
          title="Overdue contacts by step"
          description="Open referrals whose next cadence action has passed"
          summary={`Overdue contacts: ${m.overdue.reduce((a, r) => a + r.count, 0)} across the cadence steps.`}
          table={{ headers: ['Step due', 'Overdue', 'Oldest due'], rows: m.overdue.map((r) => [r.label, r.count, r.oldestDueAt ? dayKey(r.oldestDueAt) : 'n/a']) }}
          empty={m.overdue.every((r) => r.count === 0)}
          emptyText="Nothing is overdue. The queue is on time."
        >
          <BarList
            ariaLabel="Overdue contacts by step"
            items={m.overdue.map((r) => ({ label: r.label, value: r.count, display: formatCount(r.count), sub: r.oldestDueAt ? `Oldest due ${dateLong.format(new Date(r.oldestDueAt))}` : undefined }))}
          />
        </ChartPanel>

        <ChartPanel
          title="Referrals by clinic"
          summary={`Received referrals by preferred clinic, ${m.byClinic.length} groups.`}
          table={{ headers: ['Clinic', 'Received', 'Booked', 'Booked %'], rows: m.byClinic.map((r) => [r.label, r.received, r.booked, formatPct(r.bookedPct)]) }}
          empty={m.period.received === 0}
          emptyText="No referrals received in this period."
        >
          <BarList ariaLabel="Referrals by clinic" items={m.byClinic.map((r) => ({ label: r.label, value: r.received, display: formatCount(r.received), sub: `${formatCount(r.booked)} booked, ${formatPct(r.bookedPct, 0)}` }))} />
        </ChartPanel>

        <ChartPanel
          title="Referrals by source"
          summary={`Received referrals by source, ${m.bySource.length} sources.`}
          table={{ headers: ['Source', 'Received', 'Booked', 'Booked %'], rows: m.bySource.map((r) => [r.label, r.received, r.booked, formatPct(r.bookedPct)]) }}
          empty={m.period.received === 0}
          emptyText="No referrals received in this period."
        >
          <BarList ariaLabel="Referrals by source" items={m.bySource.map((r) => ({ label: r.label, value: r.received, display: formatCount(r.received), sub: `${formatCount(r.booked)} booked, ${formatPct(r.bookedPct, 0)}` }))} />
        </ChartPanel>

        <ChartPanel
          title="Referrals by orthodontist"
          summary={`Received referrals by preferred orthodontist, ${m.byOrtho.length} groups.`}
          table={{ headers: ['Orthodontist', 'Received', 'Booked', 'Booked %'], rows: m.byOrtho.map((r) => [r.label, r.received, r.booked, formatPct(r.bookedPct)]) }}
          empty={m.period.received === 0}
          emptyText="No referrals received in this period."
        >
          <BarList ariaLabel="Referrals by orthodontist" items={m.byOrtho.map((r) => ({ label: r.label, value: r.received, display: formatCount(r.received), sub: `${formatCount(r.booked)} booked, ${formatPct(r.bookedPct, 0)}` }))} />
        </ChartPanel>

        <ChartPanel
          title="Contacts logged per staff member"
          description="Last 8 weeks, weeks start Monday"
          summary={`Contacts logged in the last eight weeks: ${m.workload.contactsTotal} in total across ${m.workload.rowsTotal} staff.`}
          table={{
            headers: ['Staff', ...m.workload.weekStarts.map((w) => w.slice(5))],
            rows: m.workload.rows.map((r) => [r.label, ...r.weeks]),
          }}
          empty={m.workload.rowsTotal === 0}
          emptyText="No contacts logged in the last eight weeks."
          className="lg:col-span-2"
        >
          <Heatmap
            ariaLabel="Contacts logged per staff member per week"
            rowLabels={m.workload.rows.map((r) => r.label)}
            colLabels={m.workload.weekStarts.map((w) => w.slice(5))}
            values={m.workload.rows.map((r) => r.weeks)}
          />
        </ChartPanel>

        <ChartPanel
          title="Text delivery failures"
          description="Outbound Coax texts in this period"
          summary={`Outbound texts: ${m.sms.sent}. Delivered ${m.sms.delivered}, failed ${m.sms.failed}, still pending ${m.sms.pending}. Failure rate ${formatPct(m.sms.failureRate)} of finished texts.`}
          table={{ headers: ['Reason', 'Failed'], rows: m.sms.reasons.map((r) => [r.label, r.count]) }}
          empty={m.sms.sent === 0}
          emptyText="No texts sent in this period."
        >
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">{formatPct(m.sms.failureRate)}</p>
                <p className="text-sm text-ink-muted tabular-nums">
                  {formatCount(m.sms.failed)} failed of {formatCount(m.sms.delivered + m.sms.failed)} finished, {formatCount(m.sms.pending)} pending
                </p>
              </div>
            </div>
            {m.sms.reasons.length ? (
              <BarList ariaLabel="Failure reasons" items={m.sms.reasons.map((r) => ({ label: r.label, value: r.count, display: formatCount(r.count) }))} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-ink-muted">
                <ICONS.check className="size-4 text-ok" aria-hidden="true" strokeWidth={1.5} />
                No failed texts in this period.
              </p>
            )}
          </div>
        </ChartPanel>

        <ChartPanel
          title="Time to first contact"
          description="From receipt to the first logged contact"
          summary={`Median time to first contact: ${formatHours(m.response.medianHours)}. ${m.response.uncontacted} referrals in this period have no contact yet.`}
          table={{
            headers: ['Time to first contact', 'Referrals'],
            rows: [...m.response.buckets.map((b) => [b.label, b.count]), ['Not contacted yet', m.response.uncontacted]],
          }}
          empty={m.period.received === 0}
          emptyText="No referrals received in this period."
        >
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Median: <span className="font-semibold tabular-nums">{formatHours(m.response.medianHours)}</span>
              <span className="text-ink-muted">
                {' '}
                from {formatCount(m.response.contacted)} contacted referrals. {formatCount(m.response.uncontacted)} not contacted yet.
              </span>
            </p>
            <BarList
              ariaLabel="Time to first contact"
              items={[...m.response.buckets.map((b) => ({ label: b.label, count: b.count })), { label: 'Not contacted yet', count: m.response.uncontacted }].map((b) => ({
                label: b.label,
                value: b.count,
                display: formatCount(b.count),
              }))}
            />
          </div>
        </ChartPanel>
      </div>
    </>
  );
}
