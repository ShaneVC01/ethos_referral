/**
 * Pure queue logic: due buckets for Today, duplicate markers, outcome rules and CSV export.
 * No React and no data access here, so it can be tested directly.
 */
import {
  AGE_GROUP_LABELS,
  CLINIC_TZ,
  digitsOnly,
  formatAuDate,
  formatDue,
  isOpenStatus,
  nextAction,
  normaliseName,
  SOURCE_META,
  STATUS_META,
  type CadenceSettings,
  type ContactAttempt,
  type ContactOutcome,
  type NextAction,
  type Referral,
  type SmsMessage,
  type Tone,
} from '@/domain';
import type { UiIconName } from '@/components/ui/icons';

/* ---------- days in the clinic calendar ---------- */

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Clinic calendar day (Australia/Brisbane) as YYYY-MM-DD. Compare these strings to test "due on or before today". */
export function clinicDay(value: string | Date): string {
  return dayFormatter.format(typeof value === 'string' ? new Date(value) : value);
}

export function isOpenReferral(r: Pick<Referral, 'status' | 'closedReason'>): boolean {
  return !r.closedReason && isOpenStatus(r.status);
}

/* ---------- outcomes ---------- */

/** Outcomes where the patient was not reached. Steps 1 to 3 send a Coax text after these, or close the referral on the final call. */
export const NO_CONTACT_OUTCOMES: ContactOutcome[] = ['lm_coax_sent', 'coax_sent', 'emailed'];

/** Outcomes that send the step's Coax text. Emailed closes the final step but sends no text. */
export const TEXT_OUTCOMES: ContactOutcome[] = ['lm_coax_sent', 'coax_sent'];

export function isNoContact(outcome: ContactOutcome): boolean {
  return NO_CONTACT_OUTCOMES.includes(outcome);
}

export function isTextOutcome(outcome: ContactOutcome): boolean {
  return TEXT_OUTCOMES.includes(outcome);
}

/* ---------- replies ---------- */

const NOT_BOOKING = /\b(not interested|wrong number|no thanks|unsubscribe|stop|do not|don't|not now)\b/i;
const BOOKING = /\b(book|booking|appointment|appt|yes|please|interested|sign me up|available)\b/i;

/** A reply that asks to book, such as "Yes please book". Negative replies never count as booking requests. */
export function isBookingRequest(body: string): boolean {
  return BOOKING.test(body) && !NOT_BOOKING.test(body);
}

/* ---------- Today buckets ---------- */

export type BucketKey =
  | 'urgent'
  | 'to_call'
  | 'sms_book'
  | 'ready'
  | 'sms_failed'
  | 'sms_reply'
  | 'verify'
  | 'coax_due'
  | 'call_day1'
  | 'call_day14'
  | 'call_final'
  | 'backlog';

/** Filter groups on the Today bucket bar. "All" and the headline counts leave out the backlog. */
export type BucketGroup = 'all' | 'overdue' | 'today' | 'upcoming' | 'replies' | 'sms_failed' | 'coax_due' | 'calls' | 'verify' | 'urgent' | 'to_call' | 'backlog';

export const BUCKET_ORDER: BucketKey[] = ['urgent', 'to_call', 'sms_book', 'ready', 'sms_failed', 'sms_reply', 'verify', 'coax_due', 'call_day1', 'call_day14', 'call_final', 'backlog'];

export const BUCKET_META: Record<BucketKey, { label: string; icon: UiIconName; tone: Tone }> = {
  urgent: { label: 'Urgent', icon: 'flag', tone: 'danger' },
  to_call: { label: 'To call us', icon: 'phone', tone: 'warning' },
  sms_book: { label: 'Reply: wants to book', icon: 'reply', tone: 'accent' },
  ready: { label: 'Ready to book', icon: 'check', tone: 'accent' },
  sms_failed: { label: 'Text failed', icon: 'alert', tone: 'danger' },
  sms_reply: { label: 'Reply: other', icon: 'message', tone: 'info' },
  verify: { label: 'New to verify', icon: 'globe', tone: 'info' },
  coax_due: { label: 'Send Coax', icon: 'send', tone: 'accent' },
  call_day1: { label: 'Day 1 call', icon: 'phone', tone: 'warning' },
  call_day14: { label: 'Day 14 call', icon: 'phone', tone: 'warning' },
  call_final: { label: '3 month final', icon: 'phone', tone: 'warning' },
  backlog: { label: 'Spreadsheet backlog', icon: 'file', tone: 'neutral' },
};

export const BUCKET_GROUP_OF: Record<BucketKey, BucketGroup> = {
  urgent: 'urgent',
  to_call: 'to_call',
  sms_book: 'replies',
  ready: 'replies',
  sms_failed: 'sms_failed',
  sms_reply: 'replies',
  verify: 'verify',
  coax_due: 'coax_due',
  call_day1: 'calls',
  call_day14: 'calls',
  call_final: 'calls',
  backlog: 'backlog',
};

export interface TodayItem {
  key: string;
  bucket: BucketKey;
  referral: Referral | null;
  message: SmsMessage | null;
  /** Plain language, for example "Day 14 call and Coax #3 due Thu 4 Dec". */
  reason: string;
  /** The next action in words: "Log Day 14 call", "Send Coax #1", "Reply: wants to book". */
  action: string;
  dueAt: string | null;
  overdue: boolean;
  /** Cadence step for call and Coax items. */
  step: number | null;
}

export interface TodayQueue {
  /** Work for Today: everything except the spreadsheet backlog. */
  items: TodayItem[];
  /** Imported work due before the cutover. Its own bucket, never in All or the headline counts. */
  backlog: TodayItem[];
  /** Open "To call us" referrals, every date. Feeds the To call us tab. */
  toCall: TodayItem[];
}

const CALL_BUCKET: Record<number, BucketKey | null> = { 1: 'call_day1', 2: 'call_day14', 3: 'call_final', 0: null };
const CALL_ACTION: Record<number, string> = { 1: 'Log Day 1 call', 2: 'Log Day 14 call', 3: 'Log 3 month final call' };

/** Plain-language next action for a cadence step. */
export function actionFor(step: number): string {
  if (step === 0) return 'Send Coax #1';
  return CALL_ACTION[step] ?? 'Log call';
}

/** The first day that counts as live work. Imported work due before this day goes to the backlog. */
export function defaultCutoverDay(now: Date): string {
  return clinicDay(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000));
}

/** Imported spreadsheet work that was due before the cutover. */
export function isBacklog(r: Pick<Referral, 'importRef'>, dueDay: string, cutoverDay: string): boolean {
  return !!r.importRef && dueDay < cutoverDay;
}

export interface TodayInputs {
  cadence: CadenceSettings;
  cutoverDay: string;
  contacts?: ContactAttempt[];
}

/** Latest contact per referral, used for Ready to book. */
export function latestContacts(contacts: ContactAttempt[]): Map<string, ContactAttempt> {
  const latest = new Map<string, ContactAttempt>();
  for (const c of contacts) {
    const prev = latest.get(c.referralId);
    if (!prev || c.at > prev.at) latest.set(c.referralId, c);
  }
  return latest;
}

/**
 * Everything that needs a person, one item per referral and reason. Overdue and urgent work sort first.
 * Ready to book: a booking reply, or a last contact that spoke with the patient or parent, with no booking recorded.
 */
export function buildTodayQueue(referrals: Referral[], messages: SmsMessage[], inputs: TodayInputs, now: Date): TodayQueue {
  const { cadence, cutoverDay, contacts = [] } = inputs;
  const today = clinicDay(now);
  const byId = new Map(referrals.map((r) => [r.id, r]));
  const latest = latestContacts(contacts);
  const items: TodayItem[] = [];
  const backlog: TodayItem[] = [];
  const bookingReferralIds = new Set<string>();

  for (const r of referrals) {
    if (!isOpenReferral(r)) continue;
    const na: NextAction | null = nextAction(r, cadence, now);
    if (r.flags.urgent) {
      items.push({
        key: `urgent:${r.id}`,
        bucket: 'urgent',
        referral: r,
        message: null,
        reason: na?.label ?? 'Urgent referral',
        action: 'Call today',
        dueAt: na?.dueAt ?? null,
        overdue: na?.overdue ?? false,
        step: na?.step ?? null,
      });
    }
    if (r.source === 'ethos_online' && r.status === 'new') {
      items.push({
        key: `verify:${r.id}`,
        bucket: 'verify',
        referral: r,
        message: null,
        reason: 'New online referral. Check the details and confirm the first text went out.',
        action: 'Verify referral',
        dueAt: r.receivedAt,
        overdue: false,
        step: null,
      });
    }
    if (na && clinicDay(na.dueAt) <= today) {
      const dueDay = clinicDay(na.dueAt);
      const target = isBacklog(r, dueDay, cutoverDay) ? backlog : items;
      const onBacklog = target === backlog;
      if (na.step === 0) {
        target.push({ key: `coax:${r.id}`, bucket: onBacklog ? 'backlog' : 'coax_due', referral: r, message: null, reason: na.label, action: actionFor(0), dueAt: na.dueAt, overdue: na.overdue, step: 0 });
      } else {
        const bucket: BucketKey = onBacklog ? 'backlog' : (CALL_BUCKET[na.step] ?? 'call_day1');
        target.push({ key: `call:${r.id}`, bucket, referral: r, message: null, reason: na.label, action: actionFor(na.step), dueAt: na.dueAt, overdue: na.overdue, step: na.step });
      }
    }
  }

  for (const m of messages) {
    if (!m.needsReview) continue;
    const referral = m.referralId ? (byId.get(m.referralId) ?? null) : null;
    // Once the referral is closed, its texts no longer need a person on Today. They stay in Inbox until dealt with.
    if (referral && !isOpenReferral(referral)) continue;
    if (m.direction === 'outbound' && m.status === 'failed') {
      items.push({ key: `sms_failed:${m.id}`, bucket: 'sms_failed', referral, message: m, reason: `Text not delivered: ${m.error ?? 'unknown cause'}`, action: 'Fix number and resend', dueAt: null, overdue: false, step: null });
    } else if (m.direction === 'inbound') {
      const book = isBookingRequest(m.body);
      if (book && referral) bookingReferralIds.add(referral.id);
      items.push({
        key: `${book ? 'sms_book' : 'sms_reply'}:${m.id}`,
        bucket: book ? 'sms_book' : 'sms_reply',
        referral,
        message: m,
        reason: `Reply: "${m.body}"`,
        action: book ? 'Reply: wants to book' : 'Reply: review',
        dueAt: null,
        overdue: false,
        step: null,
      });
    }
  }

  for (const r of referrals) {
    if (!isOpenReferral(r) || bookingReferralIds.has(r.id)) continue;
    const last = latest.get(r.id);
    if (last?.outcome === 'spoke_pt_parent') {
      items.push({ key: `ready:${r.id}`, bucket: 'ready', referral: r, message: null, reason: 'Spoke with the patient or parent. Book in Edge, then record it here.', action: 'Book in Edge', dueAt: last.at, overdue: false, step: null });
    }
  }

  const rank = (b: BucketKey) => BUCKET_ORDER.indexOf(b);
  const sorter = (a: TodayItem, b: TodayItem) => {
    if (rank(a.bucket) !== rank(b.bucket)) return rank(a.bucket) - rank(b.bucket);
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.dueAt ?? '').localeCompare(b.dueAt ?? '');
  };
  return { items: items.sort(sorter), backlog: backlog.sort(sorter), toCall: buildToCallItems(referrals, cadence, cutoverDay, now) };
}

/**
 * Open "To call us" referrals for their own tab. Every date is listed, including later ones, with the next follow-up.
 * Imported rows due before the cutover stay in the spreadsheet backlog. A referral whose cadence has finished has no
 * next step, so it is listed with a plain "Log call" action.
 */
export function buildToCallItems(referrals: Referral[], cadence: CadenceSettings, cutoverDay: string, now: Date): TodayItem[] {
  const items: TodayItem[] = [];
  for (const r of referrals) {
    if (!isOpenReferral(r) || r.status !== 'to_call_us') continue;
    const na = nextAction(r, cadence, now);
    if (na && isBacklog(r, clinicDay(na.dueAt), cutoverDay)) continue;
    items.push({
      key: `to_call:${r.id}`,
      bucket: 'to_call',
      referral: r,
      message: null,
      reason: na?.label ?? 'Cadence finished. Log a call, book or close.',
      action: na ? actionFor(na.step) : 'Log call',
      dueAt: na?.dueAt ?? null,
      overdue: na?.overdue ?? false,
      step: na?.step ?? null,
    });
  }
  return items.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
}

export function countBuckets(items: TodayItem[]): Record<BucketKey, number> {
  const counts = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<BucketKey, number>;
  for (const item of items) counts[item.bucket] += 1;
  return counts;
}

/** Counts for the bucket bar. Overdue counts across Today work. Backlog is counted on its own. */
export function countGroups(items: TodayItem[], backlog: TodayItem[], toCall: TodayItem[] = []): Record<BucketGroup, number> {
  const out: Record<BucketGroup, number> = { all: items.length, overdue: 0, today: 0, upcoming: 0, replies: 0, sms_failed: 0, coax_due: 0, calls: 0, verify: 0, urgent: 0, to_call: toCall.length, backlog: backlog.length };
  for (const item of items) if (!item.overdue && item.dueAt) out.today += 1;
  for (const item of items) {
    if (item.overdue) out.overdue += 1;
    out[BUCKET_GROUP_OF[item.bucket]] += 1;
  }
  return out;
}

/** Whether an item belongs to a bar filter. The calls group can narrow to one cadence step. */
export function matchesGroup(item: TodayItem, group: BucketGroup, callBucket: BucketKey | null = null): boolean {
  if (group === 'all') return true;
  if (group === 'overdue') return item.overdue;
  if (group === 'today') return !item.overdue && item.dueAt !== null;
  if (group === 'calls' && callBucket) return item.bucket === callBucket;
  return BUCKET_GROUP_OF[item.bucket] === group;
}

/** The next day with work after today, for the empty state: "Thu 4 Dec, 6 items". */
export function nextDueSummary(referrals: Referral[], cadence: CadenceSettings, now: Date): { day: string; count: number } | null {
  const today = clinicDay(now);
  const byDay = new Map<string, number>();
  for (const r of referrals) {
    if (!isOpenReferral(r)) continue;
    const na = nextAction(r, cadence, now);
    if (!na) continue;
    const day = clinicDay(na.dueAt);
    if (day <= today) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  const first = [...byDay.keys()].sort()[0];
  if (!first) return null;
  return { day: formatDue(`${first}T12:00:00+10:00`), count: byDay.get(first) ?? 0 };
}

/* ---------- duplicates and siblings ---------- */

/**
 * Other referrals that may be the same patient or a sibling: same phone (last 9 digits), or same surname and address.
 * Shown as a marker, never merged automatically.
 */
export function possibleDuplicates(target: Referral, all: Referral[]): Referral[] {
  const phoneKey = digitsOnly(target.phone)?.slice(-9) ?? null;
  const surname = normaliseName(target.patientLastName);
  const address = normaliseName(target.address);
  return all.filter((r) => {
    if (r.id === target.id) return false;
    if (phoneKey && (digitsOnly(r.phone)?.slice(-9) ?? null) === phoneKey) return true;
    return !!surname && normaliseName(r.patientLastName) === surname && !!address && normaliseName(r.address) === address;
  });
}

/* ---------- display helpers ---------- */

export function statusLabel(r: Pick<Referral, 'status'>): string {
  return STATUS_META[r.status].label;
}

export function sourceLabel(source: Referral['source']): string {
  return SOURCE_META[source].label;
}

export function ageGroupLabel(group: Referral['ageGroup']): string {
  return group ? `${AGE_GROUP_LABELS[group]} (${group})` : 'Not set';
}

/** Date for the received column and export: DD/MM/YYYY in the clinic calendar. */
export function receivedDate(r: Pick<Referral, 'receivedAt'>): string {
  return formatAuDate(clinicDay(r.receivedAt));
}

/* ---------- CSV export ---------- */

export interface CsvNames {
  clinic: (id: string | null) => string;
  ortho: (id: string | null) => string;
  staff: (id: string | null) => string;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV of the current view. Header row first. Dates are DD/MM/YYYY. */
export function referralsToCsv(rows: Referral[], names: CsvNames, cadence: CadenceSettings, now: Date): string {
  const header = [
    'Reference',
    'Received',
    'First name',
    'Last name',
    'Date of birth',
    'Age group',
    'Phone',
    'Clinic',
    'Orthodontist',
    'Source',
    'Status',
    'Cadence step',
    'Next action due',
    'Assigned to',
    'Edge patient ID',
    'Booked on',
  ];
  const lines = rows.map((r) => {
    const na = nextAction(r, cadence, now);
    return [
      r.referenceNumber,
      receivedDate(r),
      r.patientFirstName,
      r.patientLastName,
      formatAuDate(r.dob),
      r.ageGroup,
      digitsOnly(r.phone),
      names.clinic(r.preferredClinicId),
      names.ortho(r.preferredOrthodontistId),
      sourceLabel(r.source),
      statusLabel(r),
      r.currentStep,
      na ? na.label : '',
      names.staff(r.assignedTo),
      r.edgePatientId,
      r.bookedAt ? formatAuDate(clinicDay(r.bookedAt)) : '',
    ]
      .map(csvCell)
      .join(',');
  });
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
}

/**
 * Upcoming cadence work: open referrals whose next step falls after today, within the horizon.
 * Read only. Upcoming items never count in the headline or in All.
 */
export function buildUpcoming(referrals: Referral[], cadence: CadenceSettings, now: Date, horizonDays = 14): TodayItem[] {
  const today = clinicDay(now);
  const limit = clinicDay(new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000));
  const items: TodayItem[] = [];
  for (const r of referrals) {
    if (!isOpenReferral(r)) continue;
    const na = nextAction(r, cadence, now);
    if (!na) continue;
    const day = clinicDay(na.dueAt);
    if (day <= today || day > limit) continue;
    const bucket: BucketKey = na.step === 0 ? 'coax_due' : (CALL_BUCKET[na.step] ?? 'call_day1');
    items.push({ key: `upcoming:${r.id}`, bucket, referral: r, message: null, reason: na.label, action: actionFor(na.step), dueAt: na.dueAt, overdue: false, step: na.step });
  }
  return items.sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}

/** Short Australian date for dense tables: "18 Jan". */
export function shortDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', timeZone: CLINIC_TZ }).format(typeof value === 'string' ? new Date(value) : value);
}

/** Stage names as the team says them. Index is the cadence step. */
export const STAGE_NAMES = ['SMS', '1st call', '2nd call', '3rd call'] as const;

