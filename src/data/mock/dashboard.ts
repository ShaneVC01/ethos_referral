/**
 * Dashboard aggregates, computed "on the server" (this mock plays the server).
 * Runs over the FULL in-memory state, never over a page, and returns only the numbers the dashboard renders.
 * Definitions stay in src/features/dashboard/metrics.ts (pure functions). Supabase equivalent: an rpc, see the
 * dashboard_metrics sketch in supabase/migrations/0003_views.sql.
 */
import { SOURCE_META, type AppSettings, type ContactAttempt, type Referral, type SmsMessage } from '@/domain';
import {
  bookedByStep,
  compare2025,
  countStatuses,
  dayKey,
  monthlySeries,
  overdueByStep,
  periodRanges,
  presetRange,
  referralsInPeriod,
  smsFailureStats,
  splitBy,
  timeToFirstContact,
  workloadWeeks,
  type DayRange,
} from '@/features/dashboard/metrics';
import {
  DASHBOARD_LIST_MAX,
  type DashboardMetrics,
  type DashboardQuery,
  type DashboardWorkloadRow,
  type Lookups,
} from '@/data/repository';

export interface DashboardSource {
  now: Date;
  lookups: Lookups;
  referrals: Referral[];
  contacts: ContactAttempt[];
  sms: SmsMessage[];
  settings: AppSettings;
}

export function computeDashboardMetrics(src: DashboardSource, query: DashboardQuery): DashboardMetrics {
  const { now } = src;
  const today = dayKey(now);
  const clinicId = query.clinicId || null;

  let range: DayRange;
  if (query.preset === 'custom') {
    const from = query.from ?? today;
    const to = query.to ?? today;
    range = from <= to ? { from, to } : { from: to, to: from };
  } else {
    range = presetRange(query.preset, now);
  }

  const { mtd, ytd } = periodRanges(now);
  const clinics = src.lookups.clinics;
  const clinicLabel = (id: string) => clinics.find((c) => c.id === id)?.name ?? 'Unknown clinic';
  const orthoLabel = (id: string) => src.lookups.orthodontists.find((o) => o.id === id)?.fullName ?? 'Unknown orthodontist';
  const staffLabel = (id: string) => src.lookups.staff.find((s) => s.id === id)?.initials ?? 'Unknown';

  const clinicReferrals = clinicId ? src.referrals.filter((r) => r.preferredClinicId === clinicId) : src.referrals;
  const periodList = referralsInPeriod(src.referrals, range, clinicId);
  const referralClinic = new Map(src.referrals.map((r) => [r.id, r.preferredClinicId]));

  const contacts = clinicId ? src.contacts.filter((c) => referralClinic.get(c.referralId) === clinicId) : src.contacts;
  const wk = workloadWeeks(contacts, now, 8);
  const workloadRows: DashboardWorkloadRow[] = wk.rows.map((r) => ({ ...r, label: staffLabel(r.staffId) }));

  const smsScoped = clinicId
    ? src.sms.filter((m) => m.referralId !== null && referralClinic.get(m.referralId) === clinicId)
    : src.sms;
  const sms = smsFailureStats(smsScoped, range);

  return {
    asOf: today,
    range,
    clinicId,
    clinicName: clinicId ? clinicLabel(clinicId) : null,
    totalReferrals: src.referrals.length,
    period: countStatuses(periodList),
    mtd: countStatuses(referralsInPeriod(src.referrals, mtd, clinicId)),
    ytd: countStatuses(referralsInPeriod(src.referrals, ytd, clinicId)),
    compare2025: clinicId ? null : compare2025(now),
    monthly: monthlySeries(clinicReferrals, now),
    funnel: bookedByStep(periodList),
    byClinic: splitBy(periodList, (r) => r.preferredClinicId, clinicLabel),
    bySource: splitBy(periodList, (r) => r.source, (k) => SOURCE_META[k as keyof typeof SOURCE_META]?.label ?? k),
    byOrtho: splitBy(periodList, (r) => r.preferredOrthodontistId, orthoLabel),
    overdue: overdueByStep(clinicReferrals, src.settings.cadence, now),
    workload: {
      weekStarts: wk.weekStarts,
      rows: workloadRows.slice(0, DASHBOARD_LIST_MAX),
      rowsTotal: workloadRows.length,
      contactsTotal: workloadRows.reduce((a, r) => a + r.total, 0),
    },
    response: timeToFirstContact(periodList, src.contacts),
    sms: { ...sms, reasons: sms.reasons.slice(0, DASHBOARD_LIST_MAX) },
  };
}
