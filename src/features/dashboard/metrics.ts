import {
  CLINIC_TZ,
  isOpenStatus,
  nextAction,
  type CadenceSettings,
  type ContactAttempt,
  type Referral,
  type ReferralStatus,
  type SmsMessage,
} from '@/domain';

/**
 * Dashboard calculations. Pure functions, no React. Every KPI definition lives here.
 *
 * Definitions (all day boundaries use the clinic calendar, Australia/Brisbane):
 *  - Received: referrals whose receivedAt falls in the period.
 *  - Booked: received referrals with status booked. Booked % = booked / received.
 *  - To call us, Do not contact, No status yet: received referrals with status to_call_us,
 *    do_not_contact and new. "No status yet" means still New.
 *  - Month to date and year to date run to today (the demo clock or real time).
 *  - Same month 2025 and year to date 2025 come from the 2025 constants below, which are the
 *    monthly totals on the spreadsheet Totals tab. They exist only for received and booked %.
 */

/** 2025 monthly totals from the spreadsheet Totals tab (Jan to Dec). Constants, not live data. */
export const RECEIVED_2025 = [420, 311, 247, 356, 309, 320, 572, 353, 388, 393, 370, 335] as const;
export const BOOKED_PCT_2025 = [0.757, 0.73, 0.668, 0.736, 0.738, 0.713, 0.74, 0.703, 0.76, 0.692, 0.765, 0.725] as const;

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type RangePreset = 'month' | 'quarter' | 'fy' | 'custom';

export interface DayRange {
  /** YYYY-MM-DD inclusive. */
  from: string;
  /** YYYY-MM-DD inclusive. */
  to: string;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Clinic calendar day for an ISO string or Date, as YYYY-MM-DD. */
export function dayKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return dayFormatter.format(d);
}

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Range for a preset, using today's clinic date. Quarters and FY follow the calendar (FY runs 1 July to 30 June). */
export function presetRange(preset: Exclude<RangePreset, 'custom'>, today: Date): DayRange {
  const [y, m] = dayKey(today).split('-').map(Number) as [number, number];
  if (preset === 'month') {
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
  }
  if (preset === 'quarter') {
    const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const endMonth = startMonth + 2;
    return { from: `${y}-${pad(startMonth)}-01`, to: `${y}-${pad(endMonth)}-${pad(lastDayOfMonth(y, endMonth))}` };
  }
  // Australian financial year: 1 July to 30 June.
  const fyStart = m >= 7 ? y : y - 1;
  return { from: `${fyStart}-07-01`, to: `${fyStart + 1}-06-30` };
}

export function inRange(key: string, range: DayRange): boolean {
  return key >= range.from && key <= range.to;
}

/** Referrals received within the range, optionally limited to one preferred clinic. */
export function referralsInPeriod(referrals: Referral[], range: DayRange, clinicId: string | null): Referral[] {
  return referrals.filter(
    (r) => inRange(dayKey(r.receivedAt), range) && (!clinicId || r.preferredClinicId === clinicId),
  );
}

export interface StatusCounts {
  received: number;
  booked: number;
  bookedPct: number | null;
  toCallUs: number;
  doNotContact: number;
  noStatus: number;
}

export function countStatuses(list: Referral[]): StatusCounts {
  const by = (s: ReferralStatus) => list.filter((r) => r.status === s).length;
  const received = list.length;
  const booked = by('booked');
  return {
    received,
    booked,
    bookedPct: received ? booked / received : null,
    toCallUs: by('to_call_us'),
    doNotContact: by('do_not_contact'),
    noStatus: by('new'),
  };
}

/** Month to date and year to date values for the current clinic day. */
export function periodRanges(today: Date): { mtd: DayRange; ytd: DayRange; ytdKeyFrom: string } {
  const key = dayKey(today);
  const [y, m] = key.split('-').map(Number) as [number, number];
  return {
    mtd: { from: `${y}-${pad(m)}-01`, to: key },
    ytd: { from: `${y}-01-01`, to: key },
    ytdKeyFrom: `${y}-01-01`,
  };
}

/** 2025 comparison for the same calendar months as the 2026 year to date and month. */
export function compare2025(today: Date): {
  sameMonth: { received: number; booked: number; bookedPct: number };
  ytd: { received: number; booked: number; bookedPct: number };
} {
  const [, m] = dayKey(today).split('-').map(Number) as [number, number];
  let ytdReceived = 0;
  let ytdBooked = 0;
  for (let i = 0; i < m; i += 1) {
    ytdReceived += RECEIVED_2025[i] ?? 0;
    ytdBooked += (RECEIVED_2025[i] ?? 0) * (BOOKED_PCT_2025[i] ?? 0);
  }
  const monthReceived = RECEIVED_2025[m - 1] ?? 0;
  const monthBooked = monthReceived * (BOOKED_PCT_2025[m - 1] ?? 0);
  return {
    sameMonth: { received: monthReceived, booked: Math.round(monthBooked), bookedPct: BOOKED_PCT_2025[m - 1] ?? 0 },
    ytd: { received: ytdReceived, booked: Math.round(ytdBooked), bookedPct: ytdReceived ? ytdBooked / ytdReceived : 0 },
  };
}

export type Compare2025 = ReturnType<typeof compare2025>;

/** Monthly received and booked % for the calendar year of `today`, 2026 values plus 2025 constants. */
export function monthlySeries(referrals: Referral[], today: Date): {
  labels: readonly string[];
  received: (number | null)[];
  bookedPct: (number | null)[];
  received2025: readonly number[];
  bookedPct2025: readonly number[];
} {
  const [y, m] = dayKey(today).split('-').map(Number) as [number, number];
  const received: (number | null)[] = [];
  const bookedPct: (number | null)[] = [];
  for (let i = 1; i <= 12; i += 1) {
    if (i > m) {
      received.push(null);
      bookedPct.push(null);
      continue;
    }
    const range = { from: `${y}-${pad(i)}-01`, to: `${y}-${pad(i)}-${pad(lastDayOfMonth(y, i))}` };
    const counts = countStatuses(referralsInPeriod(referrals, range, null));
    received.push(counts.received);
    bookedPct.push(counts.bookedPct);
  }
  return { labels: MONTH_LABELS, received, bookedPct, received2025: RECEIVED_2025, bookedPct2025: BOOKED_PCT_2025 };
}

export type MonthlySeries = ReturnType<typeof monthlySeries>;

export interface StageRow {
  /** Cadence step completed when the referral was booked (0 = before Day 1). */
  label: string;
  count: number;
  share: number | null;
}

/** Booked referrals grouped by the cadence step they had reached. currentStep stops moving once booked. */
export function bookedByStep(list: Referral[]): StageRow[] {
  const labels = ['Coax #1', 'Day 1', 'Day 14', '3 months'];
  const booked = list.filter((r) => r.status === 'booked');
  const total = booked.length;
  return labels.map((label, step) => {
    const count = booked.filter((r) => r.currentStep === step).length;
    return { label, count, share: total ? count / total : null };
  });
}

export interface SplitRow {
  label: string;
  received: number;
  booked: number;
  bookedPct: number | null;
}

/** Split received referrals by a key. Missing keys are grouped as "Not set". */
export function splitBy(list: Referral[], keyOf: (r: Referral) => string | null, labelOf: (key: string) => string): SplitRow[] {
  const map = new Map<string, { received: number; booked: number }>();
  for (const r of list) {
    const key = keyOf(r) ?? '__none';
    const entry = map.get(key) ?? { received: 0, booked: 0 };
    entry.received += 1;
    if (r.status === 'booked') entry.booked += 1;
    map.set(key, entry);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      label: key === '__none' ? 'Not set' : labelOf(key),
      received: v.received,
      booked: v.booked,
      bookedPct: v.received ? v.booked / v.received : null,
    }))
    .sort((a, b) => b.received - a.received || a.label.localeCompare(b.label));
}

export interface OverdueRow {
  step: number;
  label: string;
  count: number;
  oldestDueAt: string | null;
}

/** Open referrals whose next cadence action is overdue, grouped by the step that is due. */
export function overdueByStep(list: Referral[], cadence: CadenceSettings, now: Date): OverdueRow[] {
  const rows = [0, 1, 2, 3].map((step) => ({ step, label: ['Coax #1', 'Day 1 call', 'Day 14 call', '3 month final'][step] ?? '', count: 0, oldestDueAt: null as string | null }));
  for (const r of list) {
    if (!isOpenStatus(r.status)) continue;
    const next = nextAction(r, cadence, now);
    if (!next || !next.overdue) continue;
    const row = rows[next.step];
    if (!row) continue;
    row.count += 1;
    if (!row.oldestDueAt || next.dueAt < row.oldestDueAt) row.oldestDueAt = next.dueAt;
  }
  return rows;
}

export interface WorkloadRow {
  staffId: string;
  weeks: number[];
  total: number;
}

/** Contacts logged per staff member per ISO week (Monday start), for the last `weekCount` weeks ending with today. */
export function workloadWeeks(contacts: ContactAttempt[], today: Date, weekCount = 8): { weekStarts: string[]; rows: WorkloadRow[] } {
  const todayKey = dayKey(today);
  const weekStarts: string[] = [];
  const startOf = (key: string) => {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d));
    const offset = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - offset);
    return dt.toISOString().slice(0, 10);
  };
  const thisWeek = startOf(todayKey);
  for (let i = weekCount - 1; i >= 0; i -= 1) {
    const dt = new Date(`${thisWeek}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - i * 7);
    weekStarts.push(dt.toISOString().slice(0, 10));
  }
  const byStaff = new Map<string, number[]>();
  for (const c of contacts) {
    if (!c.staffId) continue;
    const wk = startOf(dayKey(c.at));
    const idx = weekStarts.indexOf(wk);
    if (idx < 0) continue;
    const arr = byStaff.get(c.staffId) ?? Array.from({ length: weekCount }, () => 0);
    arr[idx] = (arr[idx] ?? 0) + 1;
    byStaff.set(c.staffId, arr);
  }
  const rows = [...byStaff.entries()]
    .map(([staffId, weeks]) => ({ staffId, weeks, total: weeks.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  return { weekStarts, rows };
}

export interface SmsFailureStats {
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  failureRate: number | null;
  /** Failures grouped by error text, most common first. */
  reasons: { label: string; count: number }[];
}

export function smsFailureStats(messages: SmsMessage[], range: DayRange): SmsFailureStats {
  const outbound = messages.filter((m) => m.direction === 'outbound' && inRange(dayKey(m.createdAt), range));
  const delivered = outbound.filter((m) => m.status === 'delivered').length;
  const failedList = outbound.filter((m) => m.status === 'failed');
  const failed = failedList.length;
  const pending = outbound.filter((m) => m.status === 'queued' || m.status === 'sent').length;
  const reasonMap = new Map<string, number>();
  for (const m of failedList) {
    const label = m.error?.trim() || 'No reason given';
    reasonMap.set(label, (reasonMap.get(label) ?? 0) + 1);
  }
  const reasons = [...reasonMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const finished = delivered + failed;
  return {
    sent: outbound.length,
    delivered,
    failed,
    pending,
    failureRate: finished ? failed / finished : null,
    reasons,
  };
}

export interface ResponseStats {
  /** Referrals with at least one contact in the period. */
  contacted: number;
  /** Referrals in the period with no contact yet. */
  uncontacted: number;
  medianHours: number | null;
  buckets: { label: string; count: number }[];
}

/** Hours from receipt to the first contact attempt, for referrals in the period. */
export function timeToFirstContact(referrals: Referral[], contacts: ContactAttempt[]): ResponseStats {
  const firstAt = new Map<string, number>();
  for (const c of contacts) {
    const t = Date.parse(c.at);
    const prev = firstAt.get(c.referralId);
    if (prev === undefined || t < prev) firstAt.set(c.referralId, t);
  }
  const hours: number[] = [];
  let uncontacted = 0;
  for (const r of referrals) {
    const first = firstAt.get(r.id);
    if (first === undefined) {
      uncontacted += 1;
      continue;
    }
    hours.push(Math.max(0, (first - Date.parse(r.receivedAt)) / 3_600_000));
  }
  hours.sort((a, b) => a - b);
  const median = hours.length ? (hours[Math.floor(hours.length / 2)] ?? 0) : null;
  const buckets = [
    { label: 'Under 24 hours', count: hours.filter((h) => h < 24).length },
    { label: '24 to 48 hours', count: hours.filter((h) => h >= 24 && h < 48).length },
    { label: '48 to 72 hours', count: hours.filter((h) => h >= 48 && h < 72).length },
    { label: 'Over 72 hours', count: hours.filter((h) => h >= 72).length },
  ];
  return { contacted: hours.length, uncontacted, medianHours: median, buckets };
}

export function formatPct(value: number | null, digits = 1): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCount(value: number | null): string {
  if (value === null) return 'n/a';
  return new Intl.NumberFormat('en-AU').format(value);
}

export function formatHours(value: number | null): string {
  if (value === null) return 'No contacts yet';
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} hours`;
  return `${(value / 24).toFixed(1)} days`;
}
