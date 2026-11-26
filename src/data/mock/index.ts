/**
 * In-memory adapter. Implements DataRepository with simulated latency.
 * State is seeded from /seed/*.json when present (see seed.ts), otherwise it starts with the
 * hand-authored lookups and empty collections. Nothing is persisted: a page reload resets the data.
 */
import {
  type AppSettings,
  type Attachment,
  type AuditEntry,
  type ClosedReason,
  type ContactAttempt,
  type ImportBatch,
  type ImportRow,
  type Referral,
  type ReferrerNotification,
  type ReferrerHistory,
  type Referrer,
  type Practice,
  type Staff,
  type SmsMessage,
  type NewReferral,
  NewReferralSchema,
  NewContactAttemptSchema,
  AppSettingsSchema,
  CadenceSettingsSchema,
  dedupeKey,
  deriveAgeGroup,
  formatReference,
  isOpenStatus,
  normaliseName,
  stepDueAt,
  nextAction,
  DEFAULT_CADENCE,
  DEFAULT_SMS_TEMPLATES,
  digitsOnly,
  cadenceMergeValues,
  renderSmsBody,
  type ContactOutcome,
  NOTICE_KIND_LABELS,
} from '@/domain';
import type {
  ContactRepository,
  DataRepository,
  ImportRepository,
  ListImportRowsQuery,
  LookupRepository,
  Page,
  ReferralQuery,
  ReferralRepository,
  ReferrerRepository,
  SettingsRepository,
  SmsQuery,
  SmsRepository,
  StaffRepository,
  AuditRepository,
  SendSmsInput,
  SimulateSmsInput,
  ChangeStatusInput,
  NewAttachment,
  StageImportRow,
  Lookups,
  BookedAtReceipt,
  NewReferrerNotice,
  NoticeQuery,
  NoticeRow,
  HistorySortField,
  ReferralRow,
  ReferralSortField,
  ReferrerRow,
  ReferrerSortField,
  SmsRow,
  SmsSortField,
  NoticeSortField,
  ImportRowSortField,
  SortSpec,
  DashboardRepository,
} from '@/data/repository';
// Dashboard aggregates: computed over the full state, here and in the Supabase rpc (see dashboard.ts).
import { computeDashboardMetrics } from './dashboard';
import {
  PAGE_SIZE,
  SERVER_MAX_ROWS,
  type QueueCounts,
  type QueueGroup,
  type QueueQuery,
  type QueuePage,
  type QueueRow,
  type QueueSortField,
  type ReferralFilterQuery,
  type ReferralSummary,
} from '@/data/repository';
import { ReferrerMatcher } from '@/import/referrer-match';
import { historyCount } from '@/features/referrers/referrerStats';
import {
  buildTodayQueue,
  buildUpcoming,
  countGroups,
  defaultCutoverDay,
  isBookingRequest,
  isOpenReferral,
  latestContacts,
  matchesGroup,
  nextDueSummary,
  possibleDuplicates as findDuplicates,
  referralsToCsv,
  type TodayItem,
} from '@/features/queue/queue-model';
import { demoClock } from './clock';
import { loadReferrerHistory, loadSeed } from './seed';
import { mockCoax, COAX_DELIVERY_MS, type CoaxClient } from './coax';
import { mockEvents } from './events';
import { DEFAULT_LOOKUPS } from './lookups';

export const MOCK_LATENCY_MS = 150;

interface MockState {
  lookups: Lookups;
  referrals: Referral[];
  contacts: ContactAttempt[];
  sms: SmsMessage[];
  referrers: Referrer[];
  referrerHistory: ReferrerHistory[];
  practices: Practice[];
  attachments: Attachment[];
  notifications: ReferrerNotification[];
  imports: ImportBatch[];
  importRows: ImportRow[];
  audit: AuditEntry[];
  settings: AppSettings;
}

/** Empty state with defaults. Seed files are loaded by hydrateState on the first data call. */
function initialState(): MockState {
  return {
    lookups: { ...DEFAULT_LOOKUPS },
    referrals: [],
    contacts: [],
    sms: [],
    referrers: [],
    referrerHistory: [], // loaded on first use (see loadReferrerHistory in seed.ts)
    practices: [],
    attachments: [],
    notifications: [],
    imports: [],
    importRows: [],
    audit: [],
    settings: {
      id: 'default',
      cadence: DEFAULT_CADENCE,
      idleLockMinutes: 15,
      clinicTimezone: 'Australia/Brisbane',
      demoClockEnabled: true,
    },
  };
}

/** Loads every seed file into the state. Runs once, on the first data call (after login). */
async function hydrateState(s: MockState): Promise<void> {
  const [seededLookups, seededSettings, referrals, contacts, sms, referrers, practices, attachments, notifications, imports, importRows, audit] = await Promise.all([
    loadSeed<Partial<Lookups> | null>('lookups', null),
    loadSeed<AppSettings | null>('settings', null),
    loadSeed<Referral[]>('referrals', []),
    loadSeed<ContactAttempt[]>('contact_attempts', []),
    loadSeed<SmsMessage[]>('sms_messages', []),
    loadSeed<Referrer[]>('referrers', []),
    loadSeed<Practice[]>('practices', []),
    loadSeed<Attachment[]>('attachments', []),
    loadSeed<ReferrerNotification[]>('referrer_notifications', []),
    loadSeed<ImportBatch[]>('import_batches', []),
    loadSeed<ImportRow[]>('import_rows', []),
    loadSeed<AuditEntry[]>('audit_log', []),
  ]);
  s.lookups = { ...DEFAULT_LOOKUPS, ...(seededLookups ?? {}) };
  if (seededSettings) s.settings = seededSettings;
  s.referrals = referrals;
  s.contacts = contacts;
  s.sms = sms;
  s.referrers = referrers;
  s.practices = practices;
  s.attachments = attachments;
  s.notifications = notifications;
  s.imports = imports;
  s.importRows = importRows;
  s.audit = audit;
  repairToCallUs(s);
}

/**
 * Imported "To call us" rows used to be committed as finished (step 4), so they never got a next action.
 * Re-derives their step from logged contacts, the same rule the importer uses for blank rows (capped at 3).
 * Rows already fixed by the importer are left alone, so this is idempotent.
 */
function repairToCallUs(s: MockState): void {
  const maxStepBy = new Map<string, number>();
  const countBy = new Map<string, number>();
  for (const c of s.contacts) {
    countBy.set(c.referralId, (countBy.get(c.referralId) ?? 0) + 1);
    maxStepBy.set(c.referralId, Math.max(maxStepBy.get(c.referralId) ?? -1, c.step));
  }
  for (const r of s.referrals) {
    if (r.status !== 'to_call_us' || r.closedReason || r.currentStep < 4) continue;
    r.currentStep = (countBy.get(r.id) ?? 0) === 0 ? 0 : Math.min((maxStepBy.get(r.id) ?? -1) + 1, 3);
    r.nextActionAt = stepDueAt(r.receivedAt, s.settings.cadence, r.currentStep).toISOString();
  }
}

let idCounter = 0;
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function nowIso(): string {
  return demoClock.now().toISOString();
}

/** Resolves once the seed files are loaded. Set by createMockRepository. */
let seedGate: () => Promise<void> = () => Promise.resolve();

/** Lists, single records and writes all return copies, so UI code cannot mutate the store. */
function io<T>(fn: () => T): Promise<T> {
  return seedGate().then(() => new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(structuredClone(fn()));
      } catch (error) {
        reject(error);
      }
    }, MOCK_LATENCY_MS);
  }));
}

function fail(message: string): never {
  throw new Error(message);
}

/**
 * Server-side paging, as Supabase does it: default PAGE_SIZE (100), never more than SERVER_MAX_ROWS
 * (1000) in one response, whatever the caller asks for. Filter and sort BEFORE calling this.
 */
function pageOf<T>(all: T[], offset = 0, limit: number = PAGE_SIZE): Page<T> {
  const lim = Math.max(1, Math.min(Math.floor(limit) || PAGE_SIZE, SERVER_MAX_ROWS));
  const off = Math.max(0, Math.floor(offset) || 0);
  return { items: all.slice(off, off + lim), total: all.length, offset: off, limit: lim };
}

type SortValue = string | number | boolean | null | undefined;

/**
 * Server-side ORDER BY for one field. Empty values (null, undefined, '') always sort last in both
 * directions, like NULLS LAST. Text compares case and accent insensitively with numeric awareness.
 * Unknown fields leave the order unchanged (the server ignores an unsupported sort).
 */
function orderRows<T, F extends string>(list: T[], orderBy: SortSpec<F> | undefined, getters: Partial<Record<F, (t: T) => SortValue>>): T[] {
  if (!orderBy) return list;
  const get = getters[orderBy.field];
  if (!get) return list;
  const dir = orderBy.desc ? -1 : 1;
  const empty = (v: SortValue) => v === null || v === undefined || v === '';
  return [...list].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (empty(va) && empty(vb)) return 0;
    if (empty(va)) return 1;
    if (empty(vb)) return -1;
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : typeof va === 'boolean' && typeof vb === 'boolean'
          ? Number(va) - Number(vb)
          : String(va).localeCompare(String(vb), 'en-AU', { numeric: true, sensitivity: 'base' });
    return cmp * dir;
  });
}

/** Case and accent insensitive "contains" over several text fields, for server-side search. */
function textMatches(needle: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  const n = normaliseName(needle ?? '');
  if (!n) return true;
  return fields.some((f) => !!f && normaliseName(f).includes(n));
}

/** Clinic calendar day (Australia/Brisbane) for a timestamp, as YYYY-MM-DD. */
function brisbaneDay(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function createMockRepository(options: { coax?: CoaxClient } = {}): DataRepository {
  const coax = options.coax ?? mockCoax;
  const s = initialState();
  let hydration: Promise<void> | null = null;
  seedGate = () => (hydration ??= hydrateState(s));

  const staffName = (id: string | null): string => {
    if (!id) return 'System';
    return s.lookups.staff.find((st) => st.id === id)?.name ?? 'Unknown user';
  };

  const audit = (actorId: string | null, action: AuditEntry['action'], entityType: string, entityId: string | null, summary: string) => {
    s.audit.unshift({
      id: newId('aud'),
      at: nowIso(),
      actorId,
      actorName: staffName(actorId),
      action,
      entityType,
      entityId,
      summary,
    });
    mockEvents.emit();
  };

  const cadence = () => s.settings.cadence;
  /** Saved Coax templates. Cadence texts, the log sheet and the send preview all read this store. */
  let templateStore = structuredClone(DEFAULT_SMS_TEMPLATES);

  /** Recalculates nextActionAt from currentStep. Closed or finished referrals have none. */
  const refreshNext = (r: Referral) => {
    if (r.closedReason || !isOpenStatus(r.status) || r.currentStep >= 4) {
      r.nextActionAt = null;
    } else {
      r.nextActionAt = stepDueAt(r.receivedAt, cadence(), r.currentStep).toISOString();
    }
  };

  const findReferral = (id: string): Referral | undefined => s.referrals.find((r) => r.id === id);

  const requireReferral = (id: string): Referral => findReferral(id) ?? fail('That referral could not be found.');

  const referrerLabel = (referrerId: string | null, text: Referral['referrerText']): string => {
    if (referrerId) {
      const ref = s.referrers.find((r) => r.id === referrerId);
      if (ref) return `${ref.firstName} ${ref.lastName}`.trim();
    }
    return text?.name ?? '';
  };

  const matchesSearch = (r: Referral, q: string): boolean => {
    const needle = normaliseName(q);
    const digits = digitsOnly(q) ?? '';
    if (!needle && !digits) return true;
    const hay = normaliseName(`${r.patientFirstName} ${r.patientLastName} ${referrerLabel(r.referrerId, r.referrerText)}`);
    if (needle && hay.includes(needle)) return true;
    if (needle && normaliseName(r.referenceNumber).includes(needle)) return true;
    if (r.referenceNumber.toLowerCase().includes(q.trim().toLowerCase())) return true;
    if (digits.length >= 4 && (digitsOnly(r.phone) ?? '').includes(digits)) return true;
    return false;
  };

  /* Denormalised list rows: the server joins the names so a page never needs other tables. */
  const clinicNameOf = (id: string | null) => (id ? (s.lookups.clinics.find((c) => c.id === id)?.name ?? null) : null);
  const orthoNameOf = (id: string | null) => (id ? (s.lookups.orthodontists.find((o) => o.id === id)?.fullName ?? null) : null);
  const practiceOf = (id: string | null) => (id ? (s.practices.find((p) => p.id === id) ?? null) : null);
  const referrerOf = (id: string | null) => (id ? (s.referrers.find((r) => r.id === id) ?? null) : null);
  const patientNameOf = (r: Referral | undefined) => (r ? `${r.patientFirstName} ${r.patientLastName}`.trim() : null);

  const toReferralRow = (r: Referral): ReferralRow => {
    const ref = referrerOf(r.referrerId);
    return {
      ...r,
      referrerName: referrerLabel(r.referrerId, r.referrerText) || null,
      practiceName: practiceOf(ref?.practiceId ?? null)?.name ?? null,
      clinicName: clinicNameOf(r.preferredClinicId),
      orthodontistName: orthoNameOf(r.preferredOrthodontistId),
      ownerInitials: r.assignedTo ? (s.lookups.staff.find((st) => st.id === r.assignedTo)?.initials ?? null) : null,
    };
  };

  const referralSortGetters: Partial<Record<ReferralSortField, (r: ReferralRow) => SortValue>> = {
    receivedAt: (r) => r.receivedAt,
    patient: (r) => `${r.patientLastName} ${r.patientFirstName}`,
    ageGroup: (r) => r.ageGroup,
    clinic: (r) => r.clinicName,
    orthodontist: (r) => r.orthodontistName,
    referrer: (r) => r.referrerName,
    source: (r) => r.source,
    status: (r) => r.status,
    currentStep: (r) => r.currentStep,
    nextActionAt: (r) => r.nextActionAt,
    assignedTo: (r) => r.ownerInitials,
    reference: (r) => r.referenceNumber,
    closedAt: (r) => r.closedAt,
  };

  const applyReferralQuery = (q: ReferralQuery): ReferralRow[] => {
    let list = s.referrals.filter((r) => {
      if (q.search && !matchesSearch(r, q.search)) return false;
      if (q.statuses && q.statuses.length && !q.statuses.includes(r.status)) return false;
      if (q.currentStep !== undefined && r.currentStep !== q.currentStep) return false;
      if (q.clinicId && r.preferredClinicId !== q.clinicId) return false;
      if (q.orthodontistId && r.preferredOrthodontistId !== q.orthodontistId) return false;
      if (q.source && r.source !== q.source) return false;
      if (q.referrerId && r.referrerId !== q.referrerId) return false;
      if (q.assignedTo && r.assignedTo !== q.assignedTo) return false;
      if (q.flag && !r.flags[q.flag]) return false;
      if (q.onlyOpen && (!isOpenStatus(r.status) || r.status !== 'new')) return false;
      const day = brisbaneDay(r.receivedAt);
      if (q.receivedFrom && day < q.receivedFrom) return false;
      if (q.receivedTo && day > q.receivedTo) return false;
      if (q.dueBefore && (!r.nextActionAt || r.nextActionAt >= q.dueBefore)) return false;
      return true;
    });
    if (q.orderBy) return orderRows(list.map(toReferralRow), q.orderBy, referralSortGetters);
    const sort = q.sort ?? 'received_desc';
    list = [...list].sort((a, b) => {
      if (sort === 'next_action_asc') {
        return (a.nextActionAt ?? '9999').localeCompare(b.nextActionAt ?? '9999');
      }
      const cmp = a.receivedAt.localeCompare(b.receivedAt);
      return sort === 'received_asc' ? cmp : -cmp;
    });
    return list.map(toReferralRow);
  };

  const buildReferral = (input: NewReferral, actorId: string | null): Referral => {
    const now = nowIso();
    const year = new Date(input.receivedAt).getFullYear();
    const sequence =
      s.referrals.filter((r) => new Date(r.receivedAt).getFullYear() === year).length + 1;
    const ageGroup = input.ageGroup ?? deriveAgeGroup(input.dob, input.receivedAt);
    const referral: Referral = {
      ...input,
      id: newId('ref'),
      referenceNumber: formatReference(year, sequence),
      ageGroup,
      ageGroupOverridden: input.ageGroup !== null && input.ageGroup !== undefined,
      status: input.status ?? 'new',
      currentStep: 0,
      edgePatientId: null,
      bookedAt: null,
      nextActionAt: null,
      refReturnedAt: null,
      closedReason: null,
      closedAt: null,
      dedupeKey: dedupeKey({
        firstName: input.patientFirstName,
        lastName: input.patientLastName,
        phone: input.phone,
        dob: input.dob,
      }),
      importRef: null,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
    };
    refreshNext(referral);
    return referral;
  };

  const notify = (
    referrerId: string | null,
    referralId: string,
    kind: ReferrerNotification['kind'],
    extra: { actorId?: string | null; missingItems?: string[]; note?: string | null } = {},
  ): ReferrerNotification | null => {
    if (!referrerId) return null;
    const notice: ReferrerNotification = {
      id: newId('ntf'),
      referrerId,
      referralId,
      kind,
      status: 'pending',
      createdAt: nowIso(),
      sentAt: null,
      createdBy: extra.actorId ?? null,
      sentBy: null,
      missingItems: extra.missingItems ?? [],
      note: extra.note ?? null,
      emailSubject: null,
      emailBody: null,
    };
    s.notifications.unshift(notice);
    audit(extra.actorId ?? null, 'notification_created', 'referrer_notification', notice.id, `Referrer notice created: ${NOTICE_KIND_LABELS[kind]}`);
    return notice;
  };

  const closeReferral = (r: Referral, reason: ClosedReason) => {
    r.status = reason === 'booked' ? 'booked' : reason === 'do_not_contact' ? 'do_not_contact' : reason === 'declined' ? 'declined' : 'unsuccessful';
    r.closedReason = reason;
    r.closedAt = nowIso();
    r.updatedAt = nowIso();
    refreshNext(r);
  };

  /* ---------- Coax queue and cadence engine ---------- */

  /** Step tasks already announced in the audit log, so each call task is raised once. Key: referralId:step. */
  const raisedTasks = new Set<string>();

  /** Outcomes where the patient was not reached. These send the step's Coax text. */
  const NO_CONTACT_OUTCOMES: ContactOutcome[] = ['lm_coax_sent', 'coax_sent', 'emailed'];

  /**
   * Queues an outbound text. Status moves queued, then sent or failed (after the mock Coax answers),
   * then delivered. Failed sends set needsReview, so they land in the Inbox.
   */
  const enqueueSms = (
    input: { referralId: string | null; toPhone: string | null; body: string; templateKey: string | null },
    actorId: string | null,
  ): SmsMessage => {
    const now = nowIso();
    const message: SmsMessage = {
      id: newId('sms'),
      referralId: input.referralId,
      direction: 'outbound',
      templateKey: input.templateKey,
      body: input.body,
      toPhone: input.toPhone,
      fromPhone: null,
      status: 'queued',
      error: null,
      coaxId: null,
      inReplyToId: null,
      needsReview: false,
      createdAt: now,
      updatedAt: now,
    };
    s.sms.unshift(message);
    if (!input.toPhone) {
      message.status = 'failed';
      message.error = 'No phone number on file';
      message.needsReview = true;
      audit(actorId, 'sms_failed', 'sms_message', message.id, 'Text failed: No phone number on file');
      return message;
    }
    void transmit(message, actorId);
    return message;
  };

  const transmit = async (message: SmsMessage, actorId: string | null) => {
    const result = await coax.send({ to: message.toPhone ?? '', body: message.body, clientRef: message.id });
    message.coaxId = result.coaxId;
    message.updatedAt = nowIso();
    if (result.status === 'failed') {
      message.status = 'failed';
      message.error = result.error;
      message.needsReview = true;
      audit(actorId, 'sms_failed', 'sms_message', message.id, `Text failed: ${result.error ?? 'unknown error'}`);
    } else {
      message.status = 'sent';
      message.error = null;
      message.needsReview = false;
      audit(actorId, 'sms_sent', 'sms_message', message.id, 'Text sent');
      setTimeout(() => {
        if (message.status !== 'sent') return;
        message.status = 'delivered';
        message.updatedAt = nowIso();
        mockEvents.emit();
      }, COAX_DELIVERY_MS);
    }
    mockEvents.emit();
  };

  /** The cadence text for a step, rendered from the referral. Returns null when the step has no template. */
  const cadenceSms = (r: Referral, step: number, actorId: string | null): SmsMessage | null => {
    const templateKey = step === 0 && r.flags.existingPatient ? 'coax_1_existing_family' : (cadence().steps[step]?.templateKey ?? null);
    const template = templateStore.find((t) => t.key === templateKey);
    if (!template) return null;
    const clinicName = s.lookups.clinics.find((c) => c.id === r.preferredClinicId)?.name ?? null;
    const body = renderSmsBody(template.body, cadenceMergeValues(r, clinicName));
    return enqueueSms({ referralId: r.id, toPhone: digitsOnly(r.phone), body, templateKey: template.key }, actorId);
  };

  /** Runs when the demo clock moves, and on every change: completes Coax #1 if still pending, and raises due call tasks. */
  const runCadenceTick = () => {
    const now = demoClock.now();
    const today = brisbaneDay(now.toISOString());
    for (const r of s.referrals) {
      if (r.closedReason || !isOpenStatus(r.status) || r.currentStep >= 4) continue;
      if (r.currentStep === 0) {
        cadenceSms(r, 0, null);
        r.currentStep = 1;
        r.updatedAt = nowIso();
        refreshNext(r);
        audit(null, 'update', 'referral', r.id, 'Coax #1 sent by the cadence');
        continue;
      }
      const due = stepDueAt(r.receivedAt, cadence(), r.currentStep);
      const key = `${r.id}:${r.currentStep}`;
      if (brisbaneDay(due.toISOString()) <= today && !raisedTasks.has(key)) {
        raisedTasks.add(key);
        audit(null, 'update', 'referral', r.id, `${cadence().steps[r.currentStep]?.label ?? 'Cadence'} task created`);
      }
    }
    mockEvents.emit();
  };

  /* ---------- server functions: work queue, summaries, export, duplicates ----------
   * Each one runs where the database would: over every referral, text and contact, returning only the
   * page, counts or CSV the screen asked for. Nothing here is built from a partial list in the client.
   */
  const latestOutboundTexts = (): Map<string, SmsMessage> => {
    const out = new Map<string, SmsMessage>();
    for (const m of s.sms) {
      if (m.direction !== 'outbound' || !m.referralId) continue;
      const prev = out.get(m.referralId);
      if (!prev || m.createdAt > prev.createdAt) out.set(m.referralId, m);
    }
    return out;
  };
  const smsStatusLabel = (m: SmsMessage | null): string => {
    if (!m) return 'Not sent';
    if (m.status === 'failed') return 'SMS failed';
    if (m.status === 'delivered') return 'SMS delivered';
    return 'Sent';
  };
  const staffById = (id: string | null) => (id ? (s.lookups.staff.find((st) => st.id === id) ?? null) : null);
  const clinicCodeOf = (id: string | null) => (id ? (s.lookups.clinics.find((c) => c.id === id)?.code ?? null) : null);

  const queueSortGetters: Partial<Record<QueueSortField, (r: QueueRow) => SortValue>> = {
    patient: (r) => (r.referral ? `${r.referral.patientLastName} ${r.referral.patientFirstName}` : null),
    type: (r) => r.referral?.ageGroup ?? null,
    loc: (r) => (r.referral ? clinicCodeOf(r.referral.preferredClinicId) : null),
    referrer: (r) => r.referral?.referrerName ?? null,
    received: (r) => r.referral?.receivedAt ?? null,
    sms: (r) => smsStatusLabel(r.latestText),
    progress: (r) => r.referral?.currentStep ?? null,
    next: (r) => r.dueAt,
    due: (r) => r.dueAt,
    owner: (r) => r.ownerInitials,
  };

  /** Builds the Today queue for a clock, once per call. Every tab count and the rows come from this. */
  const buildQueue = (asOf: Date) => {
    const cadence = s.settings.cadence;
    const cutoverDay = s.settings.queueCutoverDate ?? defaultCutoverDay(asOf);
    const contactsLatest = latestContacts(s.contacts);
    const latestText = latestOutboundTexts();
    const queue = buildTodayQueue(s.referrals, s.sms, { cadence, cutoverDay, contacts: s.contacts }, asOf);
    const upcoming = buildUpcoming(s.referrals, cadence, asOf);
    const toRow = (item: TodayItem): QueueRow => {
      const ownerId = item.referral ? (item.referral.assignedTo ?? contactsLatest.get(item.referral.id)?.staffId ?? null) : null;
      return {
        key: item.key,
        bucket: item.bucket,
        reason: item.reason,
        action: item.action,
        dueAt: item.dueAt,
        overdue: item.overdue,
        step: item.step,
        referral: item.referral ? toReferralRow(item.referral) : null,
        latestText: item.referral ? (latestText.get(item.referral.id) ?? null) : null,
        ownerId,
        ownerInitials: staffById(ownerId)?.initials ?? null,
      };
    };
    const rowsFor = (group: QueueGroup): QueueRow[] => {
      const base =
        group === 'all'
          ? queue.items
          : group === 'upcoming'
            ? upcoming
            : group === 'backlog'
              ? queue.backlog
              : group === 'to_call'
                ? queue.toCall
                : queue.items.filter((i) => matchesGroup(i, group));
      return base.map(toRow);
    };
    const groups = countGroups(queue.items, queue.backlog, queue.toCall);
    const counts: QueueCounts = {
      all: queue.items.length,
      urgent: groups.urgent,
      overdue: groups.overdue,
      today: groups.today,
      replies: groups.replies,
      sms_failed: groups.sms_failed,
      to_call: queue.toCall.length,
      upcoming: upcoming.length,
      backlog: queue.backlog.length,
      open: s.referrals.filter(isOpenReferral).length,
    };
    return { rowsFor, counts, cadence };
  };

  const queueFor = (q: QueueQuery): QueuePage => {
    const asOf = new Date(q.asOf);
    const built = buildQueue(asOf);
    const groupRows = built.rowsFor(q.group);
    const stageCounts: Record<string, number> = { all: groupRows.length };
    for (const step of [0, 1, 2, 3]) stageCounts[String(step)] = groupRows.filter((r) => r.step === step).length;
    const filtered = groupRows.filter(
      (r) =>
        (q.step === undefined || r.step === q.step) &&
        (!q.ownerId || r.ownerId === q.ownerId) &&
        (!q.search || textMatches(q.search, r.referral?.patientFirstName, r.referral?.patientLastName, r.referral?.referenceNumber)),
    );
    const page = pageOf(orderRows(filtered, q.orderBy, queueSortGetters), q.offset, q.limit);
    return { ...page, counts: built.counts, stageCounts, nextDue: nextDueSummary(s.referrals, built.cadence, asOf) };
  };

  const summaryFor = (q: ReferralFilterQuery): ReferralSummary => {
    const asOf = new Date(q.asOf);
    const cadence = s.settings.cadence;
    const rows = applyReferralQuery(q);
    return {
      total: rows.length,
      active: rows.filter((r) => isOpenReferral(r)).length,
      booked: rows.filter((r) => r.status === 'booked').length,
      toCall: rows.filter((r) => r.status === 'to_call_us').length,
      overdue: rows.filter((r) => nextAction(r, cadence, asOf)?.overdue === true).length,
    };
  };

  const csvFor = (q: ReferralFilterQuery): string => {
    const rows = applyReferralQuery(q);
    return referralsToCsv(
      rows,
      { clinic: (id) => clinicNameOf(id) ?? '', ortho: (id) => orthoNameOf(id) ?? '', staff: (id) => staffById(id)?.name ?? '' },
      s.settings.cadence,
      new Date(q.asOf),
    );
  };

  const duplicatesOf = (id: string): ReferralRow[] => findDuplicates(requireReferral(id), s.referrals).map(toReferralRow);

  /* ---------- referrals ---------- */

  const referrals: ReferralRepository = {
    list: (q) => io(() => pageOf(applyReferralQuery(q), q.offset, q.limit)),
    queue: (q) => io(() => queueFor(q)),
    summary: (q) => io(() => summaryFor(q)),
    exportCsv: (q) => io(() => csvFor(q)),
    possibleDuplicates: (id) => io(() => duplicatesOf(id)),
    get: (id) => io(() => findReferral(id) ?? null),
    create: (input, actorId) =>
      io(() => {
        const parsed = NewReferralSchema.safeParse(input);
        if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Check the referral details.');
        const referral = buildReferral(parsed.data, actorId);
        s.referrals.unshift(referral);
        audit(actorId, 'create', 'referral', referral.id, `Referral ${referral.referenceNumber} created`);
        if (referral.currentStep === 0) {
          // Coax #1 goes out on Day 0. Step 0 completes when the text is queued, so Day 1 becomes the next action.
          cadenceSms(referral, 0, actorId);
          referral.currentStep = 1;
          refreshNext(referral);
        }
        return referral;
      }),
    update: (id, patch, actorId) =>
      io(() => {
        const r = requireReferral(id);
        const { ageGroup, status, ...rest } = patch;
        void status;
        Object.assign(r, rest);
        if (ageGroup !== undefined && !r.ageGroupOverridden) {
          r.ageGroup = ageGroup ?? deriveAgeGroup(r.dob, r.receivedAt);
        }
        r.dedupeKey = dedupeKey({ firstName: r.patientFirstName, lastName: r.patientLastName, phone: r.phone, dob: r.dob });
        r.updatedAt = nowIso();
        refreshNext(r);
        audit(actorId, 'update', 'referral', id, 'Referral details updated');
        return r;
      }),
    changeStatus: (id, input: ChangeStatusInput, actorId) =>
      io(() => {
        const r = requireReferral(id);
        const previous = r.status;
        const wasClosed = !!r.closedReason || !isOpenStatus(previous);
        const reasonText = input.reason?.trim() ?? '';
        // Reopening a closed referral needs a reason. It is stored on the audit trail and shown in the timeline.
        const reopening = wasClosed && isOpenStatus(input.status) && !input.returnToReferrer;
        if (reopening && !reasonText) fail('Add a reason for reopening this referral.');
        if (input.status === 'booked') {
          if (!input.edgePatientId?.trim()) fail('Enter the Edge patient ID before marking this referral booked.');
          r.edgePatientId = input.edgePatientId.trim();
          r.bookedAt = input.bookedAt ?? nowIso();
          closeReferral(r, 'booked');
        } else if (input.status === 'do_not_contact' || input.status === 'declined') {
          if (!reasonText) fail('Add a reason before closing this referral.');
          closeReferral(r, input.status === 'do_not_contact' ? 'do_not_contact' : 'declined');
        } else if (input.status === 'unsuccessful') {
          closeReferral(r, 'unsuccessful');
        } else {
          r.status = input.status;
          r.closedReason = null;
          r.closedAt = null;
          r.updatedAt = nowIso();
          refreshNext(r);
        }
        if (input.returnToReferrer) {
          if (!reasonText) fail('Add a reason before returning this referral to the referrer.');
          r.closedReason = 'returned';
          r.refReturnedAt = nowIso();
          r.closedAt = r.closedAt ?? nowIso();
          refreshNext(r);
          notify(r.referrerId, r.id, 'referral_returned', { actorId, note: reasonText });
        } else if (input.notifyReferrer && (input.status === 'declined' || input.status === 'do_not_contact')) {
          notify(r.referrerId, r.id, 'referral_returned', { actorId, note: reasonText });
        } else if (input.notifyReferrer && input.status === 'unsuccessful') {
          notify(r.referrerId, r.id, 'unsuccessful_contact', { actorId, note: reasonText || null });
        }
        audit(
          actorId,
          'status_change',
          'referral',
          id,
          reopening
            ? `Reopened from ${previous}: ${reasonText}`
            : `Status changed from ${previous} to ${r.status}${reasonText ? `: ${reasonText}` : ''}`,
        );
        return r;
      }),
    setUrgent: (id, urgent, reason, actorId) =>
      io(() => {
        const r = requireReferral(id);
        const text = reason.trim();
        if (!text) fail(urgent ? 'Add a reason for marking this referral urgent.' : 'Add a reason for clearing the urgent flag.');
        r.flags = { ...r.flags, urgent };
        r.urgentReason = urgent ? text : null;
        r.updatedAt = nowIso();
        audit(actorId, 'update', 'referral', id, `${urgent ? 'Marked urgent' : 'Urgent flag cleared'}: ${text}`);
        return r;
      }),
    createBooked: (input, booking: BookedAtReceipt, actorId) =>
      io(() => {
        const parsed = NewReferralSchema.safeParse(input);
        if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Check the referral details.');
        const edge = booking.edgePatientId.trim();
        if (!edge) fail('Enter the Edge patient ID before saving as booked.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.appointmentDate)) fail('Choose the appointment date.');
        if (!booking.bookedBy.trim()) fail('Say who booked the consult, for example the call centre.');
        if (!parsed.data.preferredClinicId || parsed.data.preferredClinicIsNearest) fail('Choose the clinic the consult is booked at.');
        if (!parsed.data.preferredOrthodontistId || parsed.data.preferredOrthodontistIsNextAvailable) fail('Choose the orthodontist the consult is booked with.');
        const clinicName = s.lookups.clinics.find((c) => c.id === parsed.data.preferredClinicId)?.name ?? 'the clinic';
        const orthoName = s.lookups.orthodontists.find((o) => o.id === parsed.data.preferredOrthodontistId)?.fullName ?? 'the orthodontist';
        const referral = buildReferral({ ...parsed.data, status: 'booked' }, actorId);
        referral.status = 'booked';
        referral.edgePatientId = edge;
        referral.bookedAt = new Date(`${booking.appointmentDate}T09:00:00+10:00`).toISOString();
        referral.closedReason = 'booked';
        referral.closedAt = nowIso();
        referral.currentStep = 4;
        if (booking.differentOrthodontist) {
          const note = 'Consult booked with a different orthodontist than referred.';
          referral.comments = referral.comments ? `${referral.comments} ${note}` : note;
        }
        refreshNext(referral);
        s.referrals.unshift(referral);
        audit(actorId, 'create', 'referral', referral.id, `Booked at receipt: Edge ID ${edge}, booked by ${booking.bookedBy.trim()}`);
        if (booking.thankYouNotice && referral.referrerId) {
          const day = new Date(`${booking.appointmentDate}T12:00:00+10:00`).toLocaleDateString('en-AU', { timeZone: 'Australia/Brisbane', day: 'numeric', month: 'short', year: 'numeric' });
          const detail = `The consult is booked for ${day} at ${clinicName} with ${orthoName}.${booking.differentOrthodontist ? ' This is with a different orthodontist from the one referred.' : ''}`;
          notify(referral.referrerId, referral.id, 'thank_you', { actorId, note: detail });
        }
        return referral;
      }),
    setAgeGroupOverride: (id, ageGroup, actorId) =>
      io(() => {
        const r = requireReferral(id);
        r.ageGroup = ageGroup ?? deriveAgeGroup(r.dob, r.receivedAt);
        r.ageGroupOverridden = ageGroup !== null;
        r.updatedAt = nowIso();
        audit(actorId, 'update', 'referral', id, ageGroup ? `Age group set to ${ageGroup}` : 'Age group reset to derived value');
        return r;
      }),
    listAttachments: (referralId) => io(() => s.attachments.filter((a) => a.referralId === referralId)),
    addAttachment: (referralId: string, file: NewAttachment, actorId: string) =>
      io(() => {
        requireReferral(referralId);
        if (file.sizeBytes > 2 * 1024 * 1024) fail('Files must be 2 MB or smaller.');
        const attachment: Attachment = {
          id: newId('att'),
          referralId,
          storagePath: file.storagePath,
          fileName: file.fileName,
          sizeBytes: file.sizeBytes,
          mimeType: file.mimeType,
          uploadedAt: nowIso(),
          uploadedBy: actorId,
        };
        s.attachments.push(attachment);
        audit(actorId, 'update', 'attachment', attachment.id, `Attachment added: ${file.fileName}`);
        return attachment;
      }),
    removeAttachment: (attachmentId, actorId) =>
      io(() => {
        const idx = s.attachments.findIndex((a) => a.id === attachmentId);
        if (idx >= 0) {
          const [removed] = s.attachments.splice(idx, 1);
          audit(actorId, 'update', 'attachment', attachmentId, `Attachment removed: ${removed?.fileName ?? ''}`);
        }
      }),
  };

  /* ---------- contacts ---------- */

  const contacts: ContactRepository = {
    list: (referralId) =>
      io(() => s.contacts.filter((c) => c.referralId === referralId).sort((a, b) => b.at.localeCompare(a.at))),
    listAll: () => io(() => [...s.contacts]),
    log: (input, actorId) =>
      io(() => {
        const parsed = NewContactAttemptSchema.safeParse(input);
        if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Check the contact details.');
        const r = requireReferral(parsed.data.referralId);
        if (r.closedReason || !isOpenStatus(r.status)) fail('This referral is closed. Reopen it before logging a contact.');
        const attempt: ContactAttempt = {
          id: newId('con'),
          referralId: parsed.data.referralId,
          step: parsed.data.step,
          channel: parsed.data.channel,
          outcome: parsed.data.outcome,
          staffId: actorId,
          at: parsed.data.at ?? nowIso(),
          notes: parsed.data.notes ?? null,
          smsMessageId: parsed.data.smsMessageId ?? null,
        };
        s.contacts.unshift(attempt);
        if (r.status === 'new') r.status = 'contacting';
        if (parsed.data.step === r.currentStep && r.currentStep < 4) {
          r.currentStep += 1;
          const noContact = NO_CONTACT_OUTCOMES.includes(parsed.data.outcome);
          // Day 1, Day 14 and final no-contact outcomes send that step's text, unless the user skipped it in the preview.
          const textOutcome = parsed.data.outcome === 'lm_coax_sent' || parsed.data.outcome === 'coax_sent';
          if (parsed.data.step >= 1 && textOutcome && parsed.data.sendSms !== false) {
            cadenceSms(r, parsed.data.step, actorId);
          }
          // The final call closes the referral as unsuccessful only when it was no contact (and settings allow it).
          if (parsed.data.step === 3 && noContact && cadence().closeUnsuccessfulAfterFinal && isOpenStatus(r.status)) {
            closeReferral(r, 'unsuccessful');
            if (cadence().notifyReferrerOnUnsuccessful) notify(r.referrerId, r.id, 'unsuccessful_contact');
          }
        }
        r.updatedAt = nowIso();
        refreshNext(r);
        audit(actorId, 'contact_logged', 'contact_attempt', attempt.id, `Contact logged: ${attempt.outcome} (${attempt.channel}, step ${attempt.step})`);
        return attempt;
      }),
  };

  /* ---------- SMS ---------- */

  /** Hands a queued message to the Coax queue. Returns at once. Status changes arrive through timers. */
  const sendSms = (message: SmsMessage, actorId: string | null): Promise<SmsMessage> => {
    if (message.status === 'queued') void transmit(message, actorId);
    return Promise.resolve(message);
  };

  const sms: SmsRepository = {
    templates: () => io(() => templateStore),
    saveTemplate: (template, actorId) =>
      io(() => {
        if (!templateStore.some((t) => t.key === template.key)) fail('That template could not be found.');
        if (!template.name.trim()) fail('Give the template a name.');
        if (!template.body.trim()) fail('The template body cannot be empty.');
        templateStore = templateStore.map((t) => (t.key === template.key ? { ...template } : t));
        audit(actorId, 'settings_updated', 'sms_template', template.key, `Template updated: ${template.name}`);
        return templateStore.find((t) => t.key === template.key) ?? fail('That template could not be found.');
      }),
    list: (q: SmsQuery) =>
      io(() => {
        const rows: SmsRow[] = [];
        for (const m of s.sms) {
          if (q.referralId && m.referralId !== q.referralId) continue;
          if (q.direction && m.direction !== q.direction) continue;
          if (q.statuses && q.statuses.length && !q.statuses.includes(m.status)) continue;
          if (q.needsReview !== undefined && m.needsReview !== q.needsReview) continue;
          const bookingRequest = m.direction === 'inbound' && isBookingRequest(m.body);
          if (q.bookingRequest !== undefined && (m.direction !== 'inbound' || bookingRequest !== q.bookingRequest)) continue;
          const r = m.referralId ? findReferral(m.referralId) : undefined;
          const row: SmsRow = { ...m, patientName: patientNameOf(r), referenceNumber: r?.referenceNumber ?? null, bookingRequest };
          if (q.search && !textMatches(q.search, row.patientName, row.referenceNumber, m.body)) continue;
          rows.push(row);
        }
        rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const ordered = orderRows<SmsRow, SmsSortField>(rows, q.orderBy, {
          createdAt: (m) => m.createdAt,
          patient: (m) => m.patientName,
          status: (m) => m.status,
          direction: (m) => m.direction,
          reference: (m) => m.referenceNumber,
          body: (m) => m.body,
        });
        return pageOf(ordered, q.offset, q.limit);
      }),
    send: async (input: SendSmsInput, actorId: string) => {
      const now = nowIso();
      const message: SmsMessage = {
        id: newId('sms'),
        referralId: input.referralId,
        direction: 'outbound',
        templateKey: input.templateKey,
        body: input.body,
        toPhone: input.toPhone,
        fromPhone: null,
        status: 'queued',
        error: null,
        coaxId: null,
        inReplyToId: null,
        needsReview: false,
        createdAt: now,
        updatedAt: now,
      };
      if (!input.toPhone) {
        message.status = 'failed';
        message.error = 'No phone number on file';
        message.needsReview = true;
      }
      s.sms.unshift(message);
      await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
      await sendSms(message, actorId);
      return structuredClone(message);
    },
    resend: async (messageId, correctedPhone, actorId) => {
      await new Promise((r) => setTimeout(r, MOCK_LATENCY_MS));
      const message = s.sms.find((m) => m.id === messageId) ?? fail('That text could not be found.');
      if (message.status !== 'failed') fail('Only failed texts can be resent.');
      if (correctedPhone) message.toPhone = correctedPhone;
      message.status = 'queued';
      message.error = null;
      await sendSms(message, actorId);
      return structuredClone(message);
    },
    resolveReview: (messageId, actorId) =>
      io(() => {
        const m = s.sms.find((x) => x.id === messageId) ?? fail('That text could not be found.');
        m.needsReview = false;
        m.updatedAt = nowIso();
        audit(actorId, 'update', 'sms_message', messageId, 'Text marked as dealt with');
        return m;
      }),
    linkInbound: (messageId, referralId, actorId) =>
      io(() => {
        const m = s.sms.find((x) => x.id === messageId) ?? fail('That text could not be found.');
        requireReferral(referralId);
        m.referralId = referralId;
        m.needsReview = false;
        m.updatedAt = nowIso();
        audit(actorId, 'update', 'sms_message', messageId, 'Reply linked to referral');
        return m;
      }),
    simulate: (input: SimulateSmsInput, actorId: string) =>
      io(() => {
        const now = nowIso();
        if (input.kind === 'delivery_failed') {
          const m = s.sms.find((x) => x.id === input.messageId) ?? fail('That text could not be found.');
          m.status = 'failed';
          m.error = input.error ?? 'Number not reachable';
          m.needsReview = true;
          m.updatedAt = now;
          audit(actorId, 'sms_failed', 'sms_message', m.id, `Simulated failure: ${m.error}`);
          return m;
        }
        const reply: SmsMessage = {
          id: newId('sms'),
          referralId: input.referralId,
          direction: 'inbound',
          templateKey: null,
          body: input.body,
          toPhone: null,
          fromPhone: input.fromPhone,
          status: 'received',
          error: null,
          coaxId: null,
          inReplyToId: null,
          needsReview: true,
          createdAt: now,
          updatedAt: now,
        };
        s.sms.unshift(reply);
        audit(actorId, 'sms_received', 'sms_message', reply.id, 'Simulated reply received');
        return reply;
      }),
  };

  /* ---------- referrers ---------- */

  const referrerMatches = (r: Referrer, q: string): boolean => {
    const needle = normaliseName(q);
    if (!needle) return true;
    const practice = s.practices.find((p) => p.id === r.practiceId)?.name ?? '';
    const hay = normaliseName(`${r.firstName} ${r.lastName} ${practice}`);
    return hay.includes(needle) || r.id.toLowerCase() === q.trim().toLowerCase();
  };

  const referrersRepo: ReferrerRepository = {
    search: (q, limit = 20) => io(() => s.referrers.filter((r) => r.active && referrerMatches(r, q)).slice(0, limit)),
    list: (q) =>
      io(() => {
        const rows: ReferrerRow[] = s.referrers
          .filter(
            (r) =>
              referrerMatches(r, q.search ?? '') &&
              (!q.segment || r.segment === q.segment) &&
              (!q.professionalType || r.type === q.professionalType) &&
              (!q.clinicId || r.primaryClinicId === q.clinicId) &&
              (!q.activeOnly || r.active),
          )
          .map((r) => {
            const practice = practiceOf(r.practiceId);
            return { ...r, practiceName: practice?.name ?? null, suburb: practice?.suburb ?? null, conversionRate: r.totalReferrals > 0 ? Math.min(100, Math.max(0, Math.round((r.totalStarted / r.totalReferrals) * 100))) : null };
          });
        const ordered = orderRows<ReferrerRow, ReferrerSortField>(rows, q.orderBy ?? { field: 'name', desc: false }, {
          name: (r) => `${r.lastName} ${r.firstName}`,
          type: (r) => r.type,
          practice: (r) => r.practiceName,
          suburb: (r) => r.suburb,
          segment: (r) => r.segment,
          conversion: (r) => r.conversionRate,
          totalReferrals: (r) => r.totalReferrals,
          lastReferral: (r) => r.lastReferralAt,
        });
        return pageOf(ordered, q.offset, q.limit);
      }),
    types: () => io(() => [...new Set(s.referrers.map((r) => r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en-AU'))),
    historyPage: async (referrerId, q) => {
      if (s.referrerHistory.length === 0) s.referrerHistory = await loadReferrerHistory<ReferrerHistory>();
      return io(() => {
        const list = s.referrerHistory.filter((h) => h.referrerId === referrerId);
        const ordered = orderRows<ReferrerHistory, HistorySortField>(list, q.orderBy ?? { field: 'receivedOn', desc: true }, {
          receivedOn: (h) => h.receivedOn,
          clinic: (h) => clinicNameOf(h.clinicId),
          orthodontist: (h) => orthoNameOf(h.orthodontistId),
          booked: (h) => h.booked,
        });
        return pageOf(ordered, q.offset, q.limit);
      });
    },
    historyStats: async (referrerId) => {
      if (s.referrerHistory.length === 0) s.referrerHistory = await loadReferrerHistory<ReferrerHistory>();
      return io(() => {
        const list = s.referrerHistory.filter((h) => h.referrerId === referrerId);
        return { fy25: historyCount(list, 2024), fy26: historyCount(list, 2025) };
      });
    },
    noticesPage: (q: NoticeQuery) =>
      io(() => {
        const rows: NoticeRow[] = [];
        for (const n of s.notifications) {
          if (q.referrerId && n.referrerId !== q.referrerId) continue;
          if (q.referralId && n.referralId !== q.referralId) continue;
          if (q.status && n.status !== q.status) continue;
          if (q.kind && n.kind !== q.kind) continue;
          const ref = referrerOf(n.referrerId);
          const r = findReferral(n.referralId);
          const row: NoticeRow = {
            ...n,
            referrerName: ref ? `${ref.firstName} ${ref.lastName}`.trim() : null,
            referrerEmail: ref?.email ?? null,
            practiceName: practiceOf(ref?.practiceId ?? null)?.name ?? null,
            patientName: patientNameOf(r),
            referenceNumber: r?.referenceNumber ?? null,
            createdByName: n.createdBy ? staffName(n.createdBy) : null,
          };
          if (q.search && !textMatches(q.search, row.referrerName, row.practiceName, row.patientName, row.referenceNumber)) continue;
          rows.push(row);
        }
        const ordered = orderRows<NoticeRow, NoticeSortField>(rows, q.orderBy ?? { field: 'createdAt', desc: true }, {
          createdAt: (n) => n.createdAt,
          referrer: (n) => n.referrerName,
          patient: (n) => n.patientName,
          type: (n) => NOTICE_KIND_LABELS[n.kind],
          status: (n) => n.status,
          createdBy: (n) => n.createdByName,
        });
        return pageOf(ordered, q.offset, q.limit);
      }),
    // Server-side helpers for the import screens. They answer for every referrer, so the client never needs the full list.
    existingIds: (ids) =>
      io(() => {
        const known = new Set(s.referrers.map((r) => r.id));
        return ids.filter((id) => known.has(id));
      }),
    matchNames: (names) =>
      io(() => {
        const matcher = new ReferrerMatcher(s.referrers.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, practice: null })));
        const out: Record<string, string> = {};
        for (const raw of names) {
          const match = matcher.match(raw);
          if (match) out[raw] = match.id;
        }
        return out;
      }),
    get: (id) => io(() => s.referrers.find((r) => r.id === id) ?? null),
    history: async (referrerId) => {
      if (s.referrerHistory.length === 0) s.referrerHistory = await loadReferrerHistory<ReferrerHistory>();
      return io(() => s.referrerHistory.filter((h) => h.referrerId === referrerId).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)));
    },
    referrals: (referrerId) => io(() => s.referrals.filter((r) => r.referrerId === referrerId)),
    listNotifications: (q) =>
      io(() =>
        s.notifications.filter(
          (n) =>
            (!q.referrerId || n.referrerId === q.referrerId) &&
            (!q.referralId || n.referralId === q.referralId) &&
            (!q.status || n.status === q.status),
        ),
      ),
    createNotification: (input: NewReferrerNotice, actorId) =>
      io(() => {
        const r = requireReferral(input.referralId);
        if (!r.referrerId) fail('This referral has no referrer from the referrer master, so there is no one to notify.');
        return notify(r.referrerId, r.id, input.kind, { actorId, missingItems: input.missingItems, note: input.note ?? null }) ?? fail('The notice could not be created.');
      }),
    updateNotification: (id, status, actorId, email) =>
      io(() => {
        const n = s.notifications.find((x) => x.id === id) ?? fail('That notification could not be found.');
        n.status = status;
        n.sentAt = status === 'sent' ? nowIso() : null;
        n.sentBy = status === 'sent' ? actorId : null;
        if (status === 'sent') {
          n.emailSubject = email?.subject ?? null;
          n.emailBody = email?.body ?? null;
          audit(actorId, 'notification_sent', 'referrer_notification', id, `Referrer notice marked sent: ${NOTICE_KIND_LABELS[n.kind]}`);
        } else {
          audit(actorId, 'update', 'referrer_notification', id, `Referrer notice dismissed: ${NOTICE_KIND_LABELS[n.kind]}`);
        }
        return n;
      }),
    practice: (practiceId) => io(() => s.practices.find((p) => p.id === practiceId) ?? null),
    practices: () => io(() => [...s.practices]),
  };

  /* ---------- lookups and staff ---------- */

  const lookupsRepo: LookupRepository = {
    get: () => io(() => s.lookups),
    update: (patch, actorId) =>
      io(() => {
        s.lookups = { ...s.lookups, ...patch };
        audit(actorId, 'settings_updated', 'lookups', null, 'Clinics, orthodontists or roster updated');
        return s.lookups;
      }),
  };

  const staffRepo: StaffRepository = {
    list: () => io(() => s.lookups.staff),
    update: (id, patch, actorId) =>
      io(() => {
        const st: Staff = s.lookups.staff.find((x) => x.id === id) ?? fail('That staff member could not be found.');
        Object.assign(st, patch);
        audit(actorId, 'update', 'staff', id, 'Staff member updated');
        return st;
      }),
  };

  /* ---------- imports ---------- */

  /** Closed reason implied by an imported status. Null for open statuses. */
  const closedReasonFor = (status: Referral['status']): Referral['closedReason'] => {
    if (status === 'booked') return 'booked';
    if (status === 'do_not_contact') return 'do_not_contact';
    if (status === 'declined') return 'declined';
    if (status === 'unsuccessful') return 'unsuccessful';
    return null;
  };

  /** Adds imported contact attempts. `check` skips attempts already logged for the same referral (re-merge). */
  const addImportedContacts = (referralId: string, drafts: NonNullable<StageImportRow['contacts']>, check: boolean) => {
    for (const c of drafts) {
      if (check && s.contacts.some((x) => x.referralId === referralId && x.step === c.step && x.outcome === c.outcome && x.at === c.at && (x.staffId ?? null) === (c.staffId ?? null))) continue;
      s.contacts.push({ id: newId('cat'), referralId, step: c.step as ContactAttempt['step'], channel: c.channel, outcome: c.outcome, staffId: c.staffId, at: c.at, notes: c.notes, smsMessageId: null });
    }
  };

  const importRepo: ImportRepository = {
    stage: (fileName: string, rows: StageImportRow[], actorId: string) =>
      io(() => {
        const batchId = newId('imp');
        const seenHashes = new Set(s.importRows.map((r) => r.rowHash));
        const batchKeys = new Set<string>();
        const counts: ImportBatch['counts'] = { new: 0, unchanged: 0, updated: 0, conflict: 0, error: 0 };
        const staged: ImportRow[] = rows.map((row) => {
          let result: ImportRow['result'];
          let message = row.message;
          let referralId: string | null = null;
          if (!row.candidate) {
            result = 'error';
          } else if (seenHashes.has(row.rowHash)) {
            result = 'unchanged';
          } else {
            const existing = s.referrals.find((r) => r.dedupeKey === row.dedupeKey);
            if (existing) {
              referralId = existing.id;
              if (existing.dob && row.candidate.dob && existing.dob !== row.candidate.dob) {
                result = 'conflict';
                message = 'Same name and phone as an existing referral, but a different date of birth. Check before committing.';
              } else {
                result = 'updated';
              }
            } else if (batchKeys.has(row.dedupeKey)) {
              result = 'updated';
              message = 'Copied into a later month in this file. Will merge with the earlier row.';
            } else {
              result = 'new';
            }
          }
          batchKeys.add(row.dedupeKey);
          counts[result] += 1;
          return {
            id: newId('imr'),
            batchId,
            sheet: row.sheet,
            rowNumber: row.rowNumber,
            rowHash: row.rowHash,
            dedupeKey: row.dedupeKey,
            result,
            message,
            referralId,
            candidate: row.candidate,
            currentStep: row.currentStep,
            contacts: row.contacts,
          };
        });
        const batch: ImportBatch = {
          id: batchId,
          fileName,
          status: 'staged',
          createdAt: nowIso(),
          createdBy: actorId,
          committedAt: null,
          rolledBackAt: null,
          counts,
        };
        s.imports.unshift(batch);
        s.importRows.push(...staged);
        audit(actorId, 'import_staged', 'import_batch', batchId, `Import staged: ${fileName}, ${rows.length} rows`);
        return batch;
      }),
    listBatches: () => io(() => s.imports),
    listRows: (q: ListImportRowsQuery) =>
      io(() => {
        const patientOf = (r: ImportRow) => (r.candidate ? `${r.candidate.patientFirstName} ${r.candidate.patientLastName}`.trim() : null);
        const list = s.importRows.filter(
          (r) =>
            r.batchId === q.batchId &&
            (!q.result || r.result === q.result) &&
            (q.needsReview === undefined || (r.result !== 'error' && !!r.message) === q.needsReview) &&
            (!q.search || textMatches(q.search, r.sheet, String(r.rowNumber), r.message, patientOf(r))),
        );
        const ordered = orderRows<ImportRow, ImportRowSortField>(list, q.orderBy, {
          sheet: (r) => r.sheet,
          rowNumber: (r) => r.rowNumber,
          result: (r) => r.result,
          reason: (r) => r.message,
          patient: patientOf,
        });
        return pageOf(ordered, q.offset, q.limit);
      }),
    commit: (batchId, actorId) =>
      io(() => {
        const batch = s.imports.find((b) => b.id === batchId) ?? fail('That import could not be found.');
        if (batch.status === 'committed') return batch;
        if (batch.status === 'rolled_back') fail('This import was rolled back. Stage it again to commit.');
        for (const row of s.importRows.filter((x) => x.batchId === batchId)) {
          if (!row.candidate || (row.result !== 'new' && row.result !== 'updated')) continue;
          const existing = s.referrals.find((r) => r.dedupeKey === row.dedupeKey);
          if (existing && row.result === 'updated') {
            // Merge: earliest received date kept, latest status wins, blank fields filled from the import.
            if (row.candidate.receivedAt < existing.receivedAt) existing.receivedAt = row.candidate.receivedAt;
            if (row.candidate.status) existing.status = row.candidate.status;
            for (const [k, v] of Object.entries(row.candidate)) {
              const key = k as keyof Referral;
              if ((existing[key] === null || existing[key] === '') && v !== null && v !== '') {
                (existing as unknown as Record<string, unknown>)[key] = v;
              }
            }
            if (row.currentStep !== undefined) existing.currentStep = Math.max(existing.currentStep, row.currentStep);
            const closedNow = closedReasonFor(existing.status);
            if (closedNow && !existing.closedReason) {
              existing.closedReason = closedNow;
              existing.closedAt = nowIso();
            }
            addImportedContacts(existing.id, row.contacts ?? [], true);
            refreshNext(existing);
            existing.updatedAt = nowIso();
            row.referralId = existing.id;
          } else {
            const created = buildReferral({ ...row.candidate, status: row.candidate.status ?? 'new' }, actorId);
            // Historical rows are not re-run through the cadence. Treat as finished until the importer sets state.
            created.currentStep = row.currentStep ?? 4;
            const closed = closedReasonFor(created.status);
            if (closed) {
              created.closedReason = closed;
              created.closedAt = nowIso();
            }
            refreshNext(created);
            created.importRef = { batchId, sheet: row.sheet, row: row.rowNumber };
            s.referrals.push(created);
            row.referralId = created.id;
            addImportedContacts(created.id, row.contacts ?? [], false);
          }
        }
        batch.status = 'committed';
        batch.committedAt = nowIso();
        audit(actorId, 'import_committed', 'import_batch', batchId, `Import committed: ${batch.fileName}`);
        return batch;
      }),
    rollback: (batchId, actorId) =>
      io(() => {
        const batch = s.imports.find((b) => b.id === batchId) ?? fail('That import could not be found.');
        if (batch.status !== 'committed') fail('Only committed imports can be rolled back.');
        s.referrals = s.referrals.filter((r) => r.importRef?.batchId !== batchId);
        batch.status = 'rolled_back';
        batch.rolledBackAt = nowIso();
        audit(actorId, 'import_rolled_back', 'import_batch', batchId, `Import rolled back: ${batch.fileName}`);
        return batch;
      }),
  };

  /* ---------- settings and audit ---------- */

  const settingsRepo: SettingsRepository = {
    get: () => io(() => s.settings),
    update: (patch, actorId) =>
      io(() => {
        const next = { ...s.settings, ...patch };
        const parsed = AppSettingsSchema.safeParse(next);
        if (!parsed.success) fail(parsed.error.issues[0]?.message ?? 'Check the settings.');
        const cadenceCheck = CadenceSettingsSchema.safeParse(next.cadence);
        if (!cadenceCheck.success) fail('Cadence settings are not valid.');
        s.settings = parsed.data;
        audit(actorId, 'settings_updated', 'settings', 'default', 'Settings updated');
        return s.settings;
      }),
  };

  const auditRepo: AuditRepository = {
    list: (q) =>
      io(() =>
        s.audit
          .filter((a) => (!q.entityId || a.entityId === q.entityId) && (!q.entityType || a.entityType === q.entityType))
          .slice(0, q.limit ?? 100),
      ),
  };

  /* ---------- dashboard: server-side aggregates over the full state (never a page) ---------- */
  const dashboardRepo: DashboardRepository = {
    metrics: (q) =>
      io(() =>
        computeDashboardMetrics(
          { now: demoClock.now(), lookups: s.lookups, referrals: s.referrals, contacts: s.contacts, sms: s.sms, settings: s.settings },
          q,
        ),
      ),
  };

  // Moving the demo clock runs the cadence: due call tasks are raised and due texts go out.
  demoClock.subscribe(runCadenceTick);

  return {
    referrals,
    contacts,
    sms,
    referrers: referrersRepo,
    lookups: lookupsRepo,
    staff: staffRepo,
    imports: importRepo,
    settings: settingsRepo,
    audit: auditRepo,
    dashboard: dashboardRepo,
  };
}

export { demoClock } from './clock';
