/**
 * Repository contract. The UI talks only to this interface (through data/hooks.ts).
 * Adapters: data/mock (in memory, default) and data/supabase (stub until the Supabase conversion).
 *
 * Rules every adapter must follow:
 *  - All methods are async. Mock adds ~150ms latency.
 *  - Writes take `actorId` (staff id) so the adapter can write the audit log.
 *  - Adapters own server-side fields: id, referenceNumber, ageGroup derivation, dedupeKey,
 *    nextActionAt, currentStep, status transitions, audit entries and timestamps.
 *  - Lists are paged on the server (PAGE_SIZE 100, max SERVER_MAX_ROWS 1000 per call) and return { items, total }.
 *    Filters, search and sort are query inputs, applied by the server before paging. Never filter a page on the client.
 *  - Return null (not throw) for a missing single record. Throw Error with a plain-language message for rule violations.
 */
import type {
  AppSettings,
  Attachment,
  AuditEntry,
  CadenceStep,
  ClosedReason,
  ContactAttempt,
  ContactChannel,
  ContactOutcome,
  Clinic,
  ClinicAlias,
  ImportBatch,
  ImportResult,
  ImportRow,
  NewContactAttempt,
  NewReferral,
  Orthodontist,
  OrthoAlias,
  Practice,
  Referral,
  ReferralFlags,
  ReferralSource,
  ReferralStatus,
  Referrer,
  ReferrerHistory,
  ReferrerNotification,
  RosterEntry,
  SmsMessage,
  SmsTemplate,
  Staff,
  SmsDirection,
  SmsStatus,
} from '@/domain';
// Dashboard result types are the pure metrics shapes (type-only import, no runtime dependency).
import type {
  Compare2025,
  DayRange,
  MonthlySeries,
  OverdueRow,
  RangePreset,
  ResponseStats,
  SmsFailureStats,
  SplitRow,
  StageRow,
  StatusCounts,
  WorkloadRow,
} from '@/features/dashboard/metrics';
import type { TodayItem } from '@/features/queue/queue-model';

/* ---------- Paging, sorting and search: always on the server ----------
 * Every list is paged by the server. The client never downloads a whole table and never filters,
 * sorts or searches the rows it happens to hold: each change of filter, search, sort or page is a
 * new server query. In Supabase this maps to an RPC / Edge Function using ORDER BY + LIMIT/OFFSET
 * (or keyset) with `count: 'exact'`. PostgREST caps a response at 1000 rows (db-max-rows), so
 * SERVER_MAX_ROWS mirrors that cap and the mock adapter enforces it.
 */

/** Default and standard page size for every list in the app. */
export const PAGE_SIZE = 100;
/** Hard cap on rows returned by one server call (Supabase default max rows). */
export const SERVER_MAX_ROWS = 1000;

/** Server sort: a named sort field and direction. Field names are listed per entity below. */
export interface SortSpec<F extends string = string> {
  field: F;
  desc: boolean;
}

/** Common paging inputs. offset defaults to 0, limit to PAGE_SIZE, capped at SERVER_MAX_ROWS. */
export interface PageQuery<F extends string = string> {
  offset?: number;
  limit?: number;
  orderBy?: SortSpec<F>;
}

export interface Page<T> {
  items: T[];
  /** Total rows matching the query across all pages (exact count). */
  total: number;
  /** Echo of the offset and limit the server applied (limit after capping). */
  offset?: number;
  limit?: number;
}

/** Sortable fields the server supports per list. Column `meta.sortField` must be one of these. */
export type ReferralSortField =
  | 'receivedAt'
  | 'patient'
  | 'ageGroup'
  | 'clinic'
  | 'orthodontist'
  | 'referrer'
  | 'source'
  | 'status'
  | 'currentStep'
  | 'nextActionAt'
  | 'assignedTo'
  | 'reference'
  | 'closedAt';
export type ReferrerSortField = 'name' | 'type' | 'practice' | 'suburb' | 'segment' | 'conversion' | 'totalReferrals' | 'lastReferral';
export type SmsSortField = 'createdAt' | 'patient' | 'status' | 'direction' | 'reference' | 'body';
export type NoticeSortField = 'createdAt' | 'referrer' | 'patient' | 'type' | 'status' | 'createdBy';
export type HistorySortField = 'receivedOn' | 'clinic' | 'orthodontist' | 'booked';
export type ImportRowSortField = 'sheet' | 'rowNumber' | 'result' | 'reason' | 'patient';

/*
 * List rows carry the display labels the server joins in (patient, referrer, practice, clinic names),
 * so a page never has to download other tables to show names. Each extends its entity, so code that
 * takes the entity still accepts a row.
 */
export interface ReferralRow extends Referral {
  referrerName: string | null;
  practiceName: string | null;
  clinicName: string | null;
  orthodontistName: string | null;
  ownerInitials: string | null;
}
export interface ReferrerRow extends Referrer {
  practiceName: string | null;
  suburb: string | null;
  conversionRate: number | null;
}
export interface SmsRow extends SmsMessage {
  patientName: string | null;
  referenceNumber: string | null;
  /** Inbound reply that asks to book (worked out on the server, so the Inbox tabs page correctly). */
  bookingRequest: boolean;
}
export interface NoticeRow extends ReferrerNotification {
  referrerName: string | null;
  referrerEmail: string | null;
  practiceName: string | null;
  patientName: string | null;
  referenceNumber: string | null;
  createdByName: string | null;
}

/* ---------- Referrals ---------- */

export type ReferralSort = 'received_desc' | 'received_asc' | 'next_action_asc';

export interface ReferralQuery {
  /** Matches patient name, reference number, phone digits, referrer name. Case and accent insensitive. */
  search?: string;
  statuses?: ReferralStatus[];
  /** Exact currentStep (0 to 4). */
  currentStep?: number;
  clinicId?: string;
  orthodontistId?: string;
  source?: ReferralSource;
  referrerId?: string;
  receivedFrom?: string; // YYYY-MM-DD, clinic calendar
  receivedTo?: string; // YYYY-MM-DD, inclusive
  /** Only referrals whose nextActionAt is before this ISO datetime (overdue filter uses now). */
  dueBefore?: string;
  assignedTo?: string;
  flag?: keyof ReferralFlags;
  /** True = only referrals with no status set beyond New. Used by the "no status" KPI. */
  onlyOpen?: boolean;
  /** Legacy fixed sorts. Prefer orderBy, which wins when both are given. */
  sort?: ReferralSort;
  orderBy?: SortSpec<ReferralSortField>;
  offset?: number;
  limit?: number;
}

export interface ChangeStatusInput {
  status: ReferralStatus;
  /** Required for do_not_contact, declined and returned-to-referrer. Stored on the audit entry. */
  reason?: string;
  /** Required when status becomes booked. Edge stays the system of record. */
  edgePatientId?: string;
  bookedAt?: string; // ISO datetime, defaults to now when status becomes booked
  /** Set true with status unsuccessful or declined when the referral goes back to the referrer. */
  returnToReferrer?: boolean;
  /** Set true to create a referrer notice for declined, do not contact or unsuccessful closes. The dialog default is on. */
  notifyReferrer?: boolean;
}

/** Booking details for a consult already booked when the referral was received. */
export interface BookedAtReceipt {
  edgePatientId: string;
  /** Appointment date, YYYY-MM-DD, clinic calendar. */
  appointmentDate: string;
  /** Who booked it, for example "Call centre" or a staff name. */
  bookedBy: string;
  /** The consult is with a different orthodontist from the one referred. Adds a note and a notice line. */
  differentOrthodontist: boolean;
  /** Create a Thank you notice for the referrer. */
  thankYouNotice: boolean;
}

export interface NewReferrerNotice {
  referralId: string;
  kind: ReferrerNotification['kind'];
  missingItems?: string[];
  note?: string | null;
}

export interface NewAttachment {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
}

/* ---------- Work queue, summaries, export (server functions) ---------- */

/** Work queue tabs. "all" is every open item due today or overdue. */
export type QueueGroup = 'all' | 'urgent' | 'overdue' | 'today' | 'replies' | 'sms_failed' | 'to_call' | 'upcoming' | 'backlog';
export type QueueSortField = 'patient' | 'type' | 'loc' | 'referrer' | 'received' | 'sms' | 'progress' | 'next' | 'due' | 'owner';

export interface QueueQuery extends PageQuery<QueueSortField> {
  group: QueueGroup;
  /** Cadence step 0 to 3 (SMS, 1st, 2nd, 3rd call). Omit for all stages. */
  step?: number;
  /** Owner by staff id: assigned staff, or the staff member who logged the latest contact. */
  ownerId?: string;
  /** Patient name or reference. */
  search?: string;
  /** The instant the queue is evaluated at (the clinic clock). */
  asOf: string;
}

/** One work item on the queue, with the referral joined in. Extends TodayItem so the cadence logic is shared. */
export interface QueueRow extends Omit<TodayItem, 'referral' | 'message'> {
  referral: ReferralRow | null;
  /** Latest outbound text for the referral, for the SMS column. */
  latestText: SmsMessage | null;
  ownerId: string | null;
  ownerInitials: string | null;
}

export interface QueueCounts {
  all: number;
  urgent: number;
  overdue: number;
  today: number;
  replies: number;
  sms_failed: number;
  to_call: number;
  upcoming: number;
  backlog: number;
  /** Open referrals in total (the Open referrals card). */
  open: number;
}

export interface QueuePage extends Page<QueueRow> {
  /** Exact counts for every tab and card. Ignores the group, stage, owner and search. */
  counts: QueueCounts;
  /** Stage pill counts for the chosen group and owner. Keys: all, 0, 1, 2, 3. */
  stageCounts: Record<string, number>;
  /** Next clinic day with work, for the empty state. */
  nextDue: { day: string; count: number } | null;
}

/** The referral list filters, without paging. Used for summaries and exports. */
export type ReferralFilterQuery = Omit<ReferralQuery, 'offset' | 'limit' | 'sort'> & { asOf: string };

export interface ReferralSummary {
  total: number;
  active: number;
  booked: number;
  toCall: number;
  overdue: number;
}

export interface ReferralRepository {
  list(query: ReferralQuery): Promise<Page<ReferralRow>>;
  /** Work queue for the signed-in user. Filters, sort and paging all run on the server. */
  queue(query: QueueQuery): Promise<QueuePage>;
  /** Exact counts over the same filters as list, with no paging. */
  summary(query: ReferralFilterQuery): Promise<ReferralSummary>;
  /** CSV text for every row matching the filters, in the orderBy order. Not paged. */
  exportCsv(query: ReferralFilterQuery): Promise<string>;
  /** Other referrals for the same patient, for the duplicate warning. */
  possibleDuplicates(id: string): Promise<ReferralRow[]>;
  get(id: string): Promise<Referral | null>;
  /** Creates a referral, computes ageGroup, dedupeKey, nextActionAt and referenceNumber, and queues Coax #1 (via the caller's SMS send). */
  create(input: NewReferral, actorId: string): Promise<Referral>;
  /** Patches editable fields. Server-owned fields are ignored. */
  update(id: string, patch: Partial<NewReferral>, actorId: string): Promise<Referral>;
  changeStatus(id: string, input: ChangeStatusInput, actorId: string): Promise<Referral>;
  /**
   * Sets or clears the urgent flag. A reason is required both ways and is stored on the referral and the audit trail.
   */
  setUrgent(id: string, urgent: boolean, reason: string, actorId: string): Promise<Referral>;
  /**
   * Creates a referral that is already booked (Edge ID captured). It closes as booked, never enters the queue and
   * sends no Coax. Clinic and orthodontist come from the input and are required.
   */
  createBooked(input: NewReferral, booking: BookedAtReceipt, actorId: string): Promise<Referral>;
  /** Overrides the derived age group. Pass null to go back to the derived value. */
  setAgeGroupOverride(id: string, ageGroup: 'A' | 'Y' | 'C' | null, actorId: string): Promise<Referral>;
  listAttachments(referralId: string): Promise<Attachment[]>;
  addAttachment(referralId: string, file: NewAttachment, actorId: string): Promise<Attachment>;
  removeAttachment(attachmentId: string, actorId: string): Promise<void>;
}

/* ---------- Contacts (cadence log) ---------- */

export interface ContactRepository {
  list(referralId: string): Promise<ContactAttempt[]>;
  /** Every attempt across referrals, for the manager dashboard. Replace with a server aggregate before production scale. */
  listAll(): Promise<ContactAttempt[]>;
  /**
   * Logs an attempt. If input.step equals the referral's currentStep, the step completes and currentStep advances.
   * Completing step 3 closes the referral as unsuccessful and creates a referrer notification (when enabled in settings).
   */
  log(input: NewContactAttempt, actorId: string): Promise<ContactAttempt>;
}

/* ---------- SMS (Coax) ---------- */

export interface SendSmsInput {
  referralId: string | null;
  toPhone: string;
  body: string;
  templateKey: string | null;
  /** Cadence step this send belongs to, if any. Used to link a contact attempt. */
  step?: CadenceStep;
}

export interface SmsQuery {
  referralId?: string;
  direction?: SmsDirection;
  statuses?: SmsStatus[];
  /** true = failed sends and replies that need a person to act (the Inbox). */
  needsReview?: boolean;
  /** Inbound replies only: true = asks to book, false = every other reply. */
  bookingRequest?: boolean;
  /** Patient name, reference or message text. */
  search?: string;
  orderBy?: SortSpec<SmsSortField>;
  limit?: number;
  offset?: number;
}

export type SimulateSmsInput =
  | { kind: 'delivery_failed'; messageId: string; error?: string }
  | { kind: 'inbound_reply'; referralId: string | null; fromPhone: string; body: string };

export interface SmsRepository {
  templates(): Promise<SmsTemplate[]>;
  /** Saves an edited template body or name. Keys are fixed. Manager only. */
  saveTemplate(template: SmsTemplate, actorId: string): Promise<SmsTemplate>;
  list(query: SmsQuery): Promise<Page<SmsRow>>;
  send(input: SendSmsInput, actorId: string): Promise<SmsMessage>;
  /** Retry a failed send, optionally with a corrected number. */
  resend(messageId: string, correctedPhone: string | null, actorId: string): Promise<SmsMessage>;
  /** Mark a review item as dealt with (for example a reply that has been actioned). */
  resolveReview(messageId: string, actorId: string): Promise<SmsMessage>;
  /** Link an unmatched inbound text to a referral. */
  linkInbound(messageId: string, referralId: string, actorId: string): Promise<SmsMessage>;
  /** Demo and test helper: simulate a failed delivery or an inbound reply. */
  simulate(input: SimulateSmsInput, actorId: string): Promise<SmsMessage>;
}

/* ---------- Referrers ---------- */

export interface ReferrerQuery {
  search?: string;
  segment?: string;
  activeOnly?: boolean;
  professionalType?: string;
  clinicId?: string;
  orderBy?: SortSpec<ReferrerSortField>;
  offset?: number;
  limit?: number;
}

export interface NoticeQuery extends PageQuery<NoticeSortField> {
  referrerId?: string;
  referralId?: string;
  status?: ReferrerNotification['status'];
  kind?: ReferrerNotification['kind'];
  /** Referrer, practice or patient name. */
  search?: string;
}

export interface ReferrerRepository {
  /** Typeahead over name, practice and ID. Returns at most `limit` (default 20). */
  search(q: string, limit?: number): Promise<Referrer[]>;
  list(query: ReferrerQuery): Promise<Page<ReferrerRow>>;
  get(id: string): Promise<Referrer | null>;
  /** Edge referral history (Referral Detail import). No patient names, only Edge references. */
  history(referrerId: string): Promise<ReferrerHistory[]>;
  /** Paged, sorted Edge history for one referrer (use for lists). */
  historyPage(referrerId: string, query: PageQuery<HistorySortField>): Promise<Page<ReferrerHistory>>;
  /** Edge history counts for the FY25 and FY26 summary on a referrer profile. Computed server side, so no history is downloaded. FY25 starts 1 July 2024. */
  historyStats(referrerId: string): Promise<{ fy25: { referrals: number; booked: number }; fy26: { referrals: number; booked: number } }>;
  /** Paged, sorted, searchable referrer notices (use for lists). */
  noticesPage(query: NoticeQuery): Promise<Page<NoticeRow>>;
  /** Distinct professional types, for the filter (server-side, not derived from a page). */
  types(): Promise<string[]>;
  /** Of these referrer IDs, the ones already in the Referrer Master (master import: new or updated). Server side. */
  existingIds(ids: string[]): Promise<string[]>;
  /** Matches raw referrer names from a tracker import to Referrer IDs. Returns raw name to ID for each match. Server side. */
  matchNames(names: string[]): Promise<Record<string, string>>;
  /** Referrals in this app for the referrer. */
  referrals(referrerId: string): Promise<Referral[]>;
  listNotifications(query: { referrerId?: string; referralId?: string; status?: ReferrerNotification['status'] }): Promise<ReferrerNotification[]>;
  /** Creates a notice for the referral's referrer. Fails when the referral has no referrer from the master. */
  createNotification(input: NewReferrerNotice, actorId: string): Promise<ReferrerNotification>;
  /**
   * Marks a notice sent (records who and when, and the subject and body as sent) or dismissed.
   * The email itself leaves through the staff member's email app, so the app only records it.
   */
  updateNotification(id: string, status: 'sent' | 'dismissed', actorId: string, email?: { subject: string; body: string } | null): Promise<ReferrerNotification>;
  /** Practice record, for referrers linked to a practice. */
  practice(practiceId: string): Promise<Practice | null>;
  /** All practices, for lists that sort or filter by practice name or suburb. */
  practices(): Promise<Practice[]>;
}

/* ---------- Dashboard (aggregates computed on the server) ----------
 * The dashboard never downloads rows. The server runs every KPI, split and chart series over the full data
 * set and returns only what the page renders. Definitions: src/features/dashboard/metrics.ts.
 * Row lists on the dashboard (staff workload, failure reasons) are capped at DASHBOARD_LIST_MAX, with totals.
 * Supabase: one rpc (sketch in supabase/migrations/0003_views.sql).
 */

/** Cap on row lists in the dashboard result. Matches PAGE_SIZE, so no list is ever longer than one page. */
export const DASHBOARD_LIST_MAX = PAGE_SIZE;

export interface DashboardQuery {
  /** Period preset, resolved on the server against the clinic calendar. */
  preset: RangePreset;
  /** Custom period only, YYYY-MM-DD inclusive. Reversed dates are swapped. */
  from?: string;
  /** Custom period only, YYYY-MM-DD inclusive. */
  to?: string;
  /** Preferred clinic. Omit or null for all clinics. */
  clinicId?: string | null;
}

export interface DashboardWorkloadRow extends WorkloadRow {
  /** Staff initials, joined on the server. */
  label: string;
}

export interface DashboardMetrics {
  /** Clinic calendar day the server treated as today (YYYY-MM-DD). */
  asOf: string;
  /** The resolved period, so the page never works out dates itself. */
  range: DayRange;
  clinicId: string | null;
  clinicName: string | null;
  /** Referrals in the whole data set, all clinics and dates. Drives the empty state. */
  totalReferrals: number;
  /** Status counts for the selected period and clinic. */
  period: StatusCounts;
  mtd: StatusCounts;
  ytd: StatusCounts;
  /** 2025 comparison constants. Null when a clinic is selected, because the 2025 figures are all clinics. */
  compare2025: Compare2025 | null;
  monthly: MonthlySeries;
  funnel: StageRow[];
  byClinic: SplitRow[];
  bySource: SplitRow[];
  byOrtho: SplitRow[];
  overdue: OverdueRow[];
  workload: {
    weekStarts: string[];
    /** Top DASHBOARD_LIST_MAX staff by contacts logged. */
    rows: DashboardWorkloadRow[];
    /** Staff with at least one contact in the eight weeks. */
    rowsTotal: number;
    /** Contacts logged across all staff in the eight weeks. */
    contactsTotal: number;
  };
  response: ResponseStats;
  /** Counts are complete. `reasons` is capped at DASHBOARD_LIST_MAX. */
  sms: SmsFailureStats;
}

export interface DashboardRepository {
  /** Every dashboard number for one period and clinic, computed over the full data set. */
  metrics(query: DashboardQuery): Promise<DashboardMetrics>;
}

/* ---------- Lookups and staff ---------- */

export interface Lookups {
  clinics: Clinic[];
  clinicAliases: ClinicAlias[];
  orthodontists: Orthodontist[];
  orthoAliases: OrthoAlias[];
  roster: RosterEntry[];
  staff: Staff[];
}

export interface LookupRepository {
  get(): Promise<Lookups>;
  /** Replaces clinic, orthodontist, alias or roster collections. Manager only. */
  update(patch: Partial<Pick<Lookups, 'clinics' | 'clinicAliases' | 'orthodontists' | 'orthoAliases' | 'roster'>>, actorId: string): Promise<Lookups>;
}

export interface StaffRepository {
  list(): Promise<Staff[]>;
  update(id: string, patch: Partial<Pick<Staff, 'name' | 'role' | 'active'>>, actorId: string): Promise<Staff>;
}

/* ---------- Imports ---------- */

export interface StageImportRow {
  sheet: string;
  rowNumber: number;
  rowHash: string;
  dedupeKey: string;
  /** Normalised candidate, or null when the row could not be read. */
  candidate: NewReferral | null;
  /** Set when candidate is null, or to explain a conflict. */
  message: string | null;
  /** Cadence step the referral is at after merging the source rows (0 to 4). Optional: defaults to 4 (finished). */
  currentStep?: number;
  /** Contact attempts from the source, merged per patient. Written on commit, skipping any already logged. */
  contacts?: ImportContactDraft[];
}

/** Contact attempt read from a source file, before it gets an id. */
export interface ImportContactDraft {
  step: number;
  channel: ContactChannel;
  outcome: ContactOutcome;
  at: string;
  staffId: string | null;
  notes: string | null;
}

export interface ListImportRowsQuery {
  batchId: string;
  result?: ImportResult;
  search?: string;
  orderBy?: SortSpec<ImportRowSortField>;
  /** Rows that need a person: a message and not an error. Used for the "Needs review" filter and its count. */
  needsReview?: boolean;
  offset?: number;
  limit?: number;
}

export interface ImportRepository {
  /**
   * Stores a preview. The adapter classifies every row against existing data:
   * unchanged (row hash seen before), new, updated (dedupe key exists), conflict or error.
   * Nothing is written to referrals until commit.
   */
  stage(fileName: string, rows: StageImportRow[], actorId: string): Promise<ImportBatch>;
  listBatches(): Promise<ImportBatch[]>;
  listRows(query: ListImportRowsQuery): Promise<Page<ImportRow>>;
  /** Writes new and updated rows as referrals. Re-committing a batch is a no-op. */
  commit(batchId: string, actorId: string): Promise<ImportBatch>;
  /** Removes referrals created by a committed batch. Mock only until Supabase has a batch rollback. */
  rollback(batchId: string, actorId: string): Promise<ImportBatch>;
}

/* ---------- Settings and audit ---------- */

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(patch: Partial<Omit<AppSettings, 'id'>>, actorId: string): Promise<AppSettings>;
}

export interface AuditRepository {
  list(query: { entityId?: string; entityType?: string; limit?: number }): Promise<AuditEntry[]>;
}

/** Everything the UI can reach. Adapters implement this whole object. */
export interface DataRepository {
  referrals: ReferralRepository;
  contacts: ContactRepository;
  sms: SmsRepository;
  referrers: ReferrerRepository;
  lookups: LookupRepository;
  staff: StaffRepository;
  imports: ImportRepository;
  settings: SettingsRepository;
  audit: AuditRepository;
  dashboard: DashboardRepository;
}

export type { ClosedReason, ContactOutcome, CadenceStep };
