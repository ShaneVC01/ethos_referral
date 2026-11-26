import { z } from 'zod';
import {
  AGE_GROUPS,
  AUDIT_ACTIONS,
  CLOSED_REASONS,
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  IMPORT_BATCH_STATUSES,
  IMPORT_RESULTS,
  REFERRAL_SOURCES,
  REFERRAL_STATUSES,
  REFERRER_NOTIFICATION_KINDS,
  REFERRER_NOTIFICATION_STATUSES,
  SMS_DIRECTIONS,
  SMS_STATUSES,
  STAFF_ROLES,
  SUBMISSION_TYPES,
} from './enums';

/*
 * Entity schemas. These mirror the Supabase tables in PRODUCT plan section "Data schema".
 * Conventions:
 *  - ids are opaque strings (uuid in Supabase, prefixed strings in the mock: "ref_", "clin_"...).
 *  - timestamps are ISO 8601 strings with offset (UTC in storage, shown in Australia/Brisbane).
 *  - dates without time are 'YYYY-MM-DD'.
 *  - phones are stored as the digits-only AU form where possible ("0412345678"); display with formatAuMobile.
 *  - nullable fields are explicit `null`, never undefined.
 */

const isoDateTime = z.string().datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const id = z.string().min(1);
const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable();

export const ClinicSchema = z.object({
  id,
  code: z.string().min(1), // canonical code as used in the tracker, e.g. "UMG", "TWG"
  name: z.string().min(1), // "Upper Mount Gravatt"
  openedOn: nullable(isoDate),
  active: z.boolean(),
});
export type Clinic = z.infer<typeof ClinicSchema>;

export const ClinicAliasSchema = z.object({
  alias: z.string().min(1), // e.g. "TOOW", "CLEVE", "cleve"
  clinicId: id,
});
export type ClinicAlias = z.infer<typeof ClinicAliasSchema>;

export const OrthodontistSchema = z.object({
  id,
  shortCode: z.string().min(1), // e.g. "AC", "MAT", "KSF"
  fullName: z.string().min(1), // "Anna Chang"
  startDate: nullable(isoDate),
  active: z.boolean(),
  notes: nullable(z.string()),
});
export type Orthodontist = z.infer<typeof OrthodontistSchema>;

export const OrthoAliasSchema = z.object({
  alias: z.string().min(1),
  orthodontistId: id,
  /** false for guessed aliases (for example "KC"). The importer flags these for review. */
  confirmed: z.boolean(),
});
export type OrthoAlias = z.infer<typeof OrthoAliasSchema>;

/** Weekday roster. weekday: 1 = Monday ... 5 = Friday. A clinic can have several entries for one day (joint sessions). */
export const RosterEntrySchema = z.object({
  id,
  clinicId: id,
  weekday: z.number().int().min(1).max(5),
  orthodontistId: id,
  notes: nullable(z.string()),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const StaffSchema = z.object({
  id,
  initials: z.string().min(1), // tracker initials: BM, SL, KT, JM, CC, TM...
  name: z.string().min(1), // editable in Settings. Seeded as initials until confirmed
  role: z.enum(STAFF_ROLES),
  active: z.boolean(),
});
export type Staff = z.infer<typeof StaffSchema>;

export const PracticeSchema = z.object({
  id,
  name: z.string().min(1),
  address: nullable(z.string()),
  suburb: nullable(z.string()),
  state: nullable(z.string()),
  postcode: nullable(z.string()),
  phone: nullable(z.string()),
  email: nullable(z.string()),
});
export type Practice = z.infer<typeof PracticeSchema>;

export const ReferrerSchema = z.object({
  id: z.string().regex(/^R\d+$/, 'Referrer IDs look like R1234'), // kept from Referrer Master
  segment: z.string(), // Referrer Master segment, free text until mapped
  type: z.string(), // Referrer Master type, free text until mapped
  practiceId: nullable(id),
  title: nullable(z.string()),
  firstName: z.string(),
  lastName: z.string(),
  phone: nullable(z.string()),
  email: nullable(z.string()),
  address: nullable(z.string()),
  primaryClinicId: nullable(id),
  primaryOrthodontistId: nullable(id),
  fyReferrals: z.number().int().nonnegative(), // current financial year referrals from Referrer Master
  // All-time figures from the Referrer Master: "Referrals (all recorded)" and "Started" (treatment
  // started in Edge). Conversion rate = totalStarted / totalReferrals, never above 100%.
  totalReferrals: z.number().int().nonnegative().default(0),
  totalStarted: z.number().int().nonnegative().default(0),
  lastReferralAt: nullable(isoDate),
  active: z.boolean(),
});
export type Referrer = z.infer<typeof ReferrerSchema>;

export const ReferrerHistorySchema = z.object({
  id,
  referrerId: z.string().regex(/^R\d+$/),
  receivedOn: isoDate,
  edgePatientRef: nullable(z.string()), // patient reference in Edge. No names held here
  clinicId: nullable(id),
  orthodontistId: nullable(id),
  booked: z.boolean(),
  notes: nullable(z.string()),
});
export type ReferrerHistory = z.infer<typeof ReferrerHistorySchema>;

/** Flags shown on the referral. Each one changes how staff handle the patient. */
export const ReferralFlagsSchema = z.object({
  urgent: z.boolean(),
  existingPatient: z.boolean(),
  sibling: z.boolean(),
  hcf: z.boolean(), // from the "HCF-Not to call" tab
  languageSupport: z.boolean(),
  femaleOrthoRequested: z.boolean(),
});
export type ReferralFlags = z.infer<typeof ReferralFlagsSchema>;

/** Free-text referrer used when the referrer is not in the Referrer Master. */
export const ReferrerTextSchema = z.object({
  name: z.string(),
  address: nullable(z.string()),
  phone: nullable(z.string()),
  email: nullable(z.string()),
});
export type ReferrerText = z.infer<typeof ReferrerTextSchema>;

export const ReferralSchema = z.object({
  id,
  /** Human reference shown to staff and on the public confirmation, e.g. "REF-2026-000123". Not patient data. */
  referenceNumber: z.string().min(1),
  receivedAt: isoDateTime,
  source: z.enum(REFERRAL_SOURCES),
  submissionType: z.enum(SUBMISSION_TYPES),
  patientFirstName: z.string(),
  patientLastName: z.string(),
  dob: nullable(isoDate),
  ageGroup: z.enum(AGE_GROUPS).nullable(), // null when there is no DOB and no override
  ageGroupOverridden: z.boolean(),
  phone: nullable(z.string()),
  contactPerson: nullable(z.string()), // parent or guardian
  email: nullable(z.string()),
  address: nullable(z.string()),
  preferredClinicId: nullable(id),
  preferredClinicIsNearest: z.boolean(), // "Nearest to Pt" in the tracker
  preferredOrthodontistId: nullable(id),
  preferredOrthodontistIsNextAvailable: z.boolean(), // "Next Available" in the tracker
  referrerId: nullable(z.string()), // Referrer Master ID, e.g. "R1234"
  referrerText: nullable(ReferrerTextSchema), // used when referrerId is null
  comments: nullable(z.string()),
  flags: ReferralFlagsSchema,
  /** Why the urgent flag was set. Null when not urgent. Required when the flag is set through the app. */
  urgentReason: nullable(z.string()).optional(),
  edgePatientId: nullable(z.string()), // entered when booked in Edge
  bookedAt: nullable(isoDateTime),
  status: z.enum(REFERRAL_STATUSES),
  /** Cadence steps completed so far, 0 to 4. 4 means the cadence is finished. See domain/cadence.ts. */
  currentStep: z.number().int().min(0).max(4),
  nextActionAt: nullable(isoDateTime), // denormalised for queue sorting, recalculated on write
  assignedTo: nullable(id),
  refReturnedAt: nullable(isoDateTime),
  closedReason: z.enum(CLOSED_REASONS).nullable(),
  closedAt: nullable(isoDateTime),
  dedupeKey: z.string(),
  importRef: nullable(z.object({ batchId: id, sheet: z.string(), row: z.number().int() })),
  createdAt: isoDateTime,
  createdBy: nullable(id),
  updatedAt: isoDateTime,
});
export type Referral = z.infer<typeof ReferralSchema>;

/** Input for creating a referral. Server-side fields are filled by the repository. */
export const NewReferralSchema = ReferralSchema.omit({
  id: true,
  referenceNumber: true,
  ageGroup: true,
  ageGroupOverridden: true,
  edgePatientId: true,
  bookedAt: true,
  status: true,
  currentStep: true,
  nextActionAt: true,
  refReturnedAt: true,
  closedReason: true,
  closedAt: true,
  dedupeKey: true,
  importRef: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
}).extend({
  ageGroup: z.enum(AGE_GROUPS).nullable(), // null = derive from dob
  status: z.enum(REFERRAL_STATUSES).optional(), // defaults to "new"
});
export type NewReferral = z.infer<typeof NewReferralSchema>;

export const ContactAttemptSchema = z.object({
  id,
  referralId: id,
  step: z.number().int().min(0).max(3),
  channel: z.enum(CONTACT_CHANNELS),
  outcome: z.enum(CONTACT_OUTCOMES),
  staffId: nullable(id),
  at: isoDateTime,
  notes: nullable(z.string()),
  smsMessageId: nullable(id),
});
export type ContactAttempt = z.infer<typeof ContactAttemptSchema>;

export const NewContactAttemptSchema = ContactAttemptSchema.omit({ id: true, at: true, staffId: true, smsMessageId: true }).extend({
  at: isoDateTime.optional(), // defaults to now
  smsMessageId: nullable(id).optional(),
  /** No-contact outcomes on steps 1 to 3 send that step's Coax text. Default true. Set false to skip it. */
  sendSms: z.boolean().optional(),
});
export type NewContactAttempt = z.infer<typeof NewContactAttemptSchema>;

export const SmsMessageSchema = z.object({
  id,
  referralId: nullable(id), // null when an inbound text cannot be matched yet
  direction: z.enum(SMS_DIRECTIONS),
  templateKey: nullable(z.string()),
  body: z.string(),
  toPhone: nullable(z.string()),
  fromPhone: nullable(z.string()),
  status: z.enum(SMS_STATUSES),
  error: nullable(z.string()), // for example "Invalid mobile number" or "Recipient opted out"
  coaxId: nullable(z.string()),
  inReplyToId: nullable(id), // inbound replies link to the outbound message
  needsReview: z.boolean(), // failed sends and replies that ask to book
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SmsMessage = z.infer<typeof SmsMessageSchema>;

export const SmsTemplateSchema = z.object({
  key: z.string().min(1), // coax_1_standard | coax_1_existing_family | coax_1_transfer | coax_2 | coax_3 | coax_4_final
  name: z.string().min(1),
  step: z.number().int().min(0).max(3).nullable(),
  body: z.string(), // merge fields: {{first_name}}, {{clinic}}, {{ortho}}, {{reference}}
  description: nullable(z.string()),
});
export type SmsTemplate = z.infer<typeof SmsTemplateSchema>;

export const AttachmentSchema = z.object({
  id,
  referralId: id,
  storagePath: z.string(), // Supabase Storage path in production, object URL or key in mock
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  mimeType: z.string(),
  uploadedAt: isoDateTime,
  uploadedBy: nullable(id),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const ReferrerNotificationSchema = z.object({
  id,
  referrerId: z.string(),
  referralId: id,
  kind: z.enum(REFERRER_NOTIFICATION_KINDS),
  status: z.enum(REFERRER_NOTIFICATION_STATUSES),
  createdAt: isoDateTime,
  sentAt: nullable(isoDateTime),
  createdBy: nullable(id).optional(),
  sentBy: nullable(id).optional(),
  /** missing_info notices: what the referrer needs to send, for example "Mobile number". */
  missingItems: z.array(z.string()).optional(),
  /** Plain-language detail for the email, for example the booking line or the return reason. */
  note: nullable(z.string()).optional(),
  /** The subject and body as sent. Set when the notice is marked sent. */
  emailSubject: nullable(z.string()).optional(),
  emailBody: nullable(z.string()).optional(),
});
export type ReferrerNotification = z.infer<typeof ReferrerNotificationSchema>;

export const CadenceStepConfigSchema = z.object({
  step: z.number().int().min(0).max(3),
  label: z.string().min(1), // "Coax #1", "Day 1 call and Coax #2"...
  offsetAmount: z.number().int().nonnegative(),
  offsetUnit: z.enum(['day', 'month']),
  templateKey: nullable(z.string()),
});
export type CadenceStepConfig = z.infer<typeof CadenceStepConfigSchema>;

export const CadenceSettingsSchema = z.object({
  steps: z.array(CadenceStepConfigSchema).length(4),
  /** Days after receipt for the final step is set by offsetAmount and offsetUnit (3 months by default). */
  closeUnsuccessfulAfterFinal: z.boolean(),
  notifyReferrerOnUnsuccessful: z.boolean(),
});
export type CadenceSettings = z.infer<typeof CadenceSettingsSchema>;

/** Editable email wording for one referrer notice type. Merge fields are listed in domain/notices.ts. */
export const NoticeTemplateSchema = z.object({
  kind: z.enum(REFERRER_NOTIFICATION_KINDS),
  name: z.string().min(1),
  subject: z.string(),
  body: z.string(),
});
export type NoticeTemplate = z.infer<typeof NoticeTemplateSchema>;

export const AppSettingsSchema = z.object({
  id: z.literal('default'),
  cadence: CadenceSettingsSchema,
  idleLockMinutes: z.number().int().min(1).max(120),
  clinicTimezone: z.literal('Australia/Brisbane'),
  demoClockEnabled: z.boolean(),
  /** Imported work due before this clinic day goes to the spreadsheet backlog. Null means 14 days before the demo today. */
  queueCutoverDate: isoDate.nullable().optional(),
  /** Referrer email wording. Missing means the defaults in domain/notices.ts. */
  noticeTemplates: z.array(NoticeTemplateSchema).optional(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const ImportBatchSchema = z.object({
  id,
  fileName: z.string(),
  status: z.enum(IMPORT_BATCH_STATUSES),
  createdAt: isoDateTime,
  createdBy: nullable(id),
  committedAt: nullable(isoDateTime),
  rolledBackAt: nullable(isoDateTime),
  counts: z.object({
    new: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    conflict: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
  }),
});
export type ImportBatch = z.infer<typeof ImportBatchSchema>;

export const ImportRowSchema = z.object({
  id,
  batchId: id,
  sheet: z.string(),
  rowNumber: z.number().int().positive(),
  rowHash: z.string(),
  dedupeKey: z.string(),
  result: z.enum(IMPORT_RESULTS),
  message: nullable(z.string()), // for conflicts and errors: what went wrong and what to check
  referralId: nullable(id), // the referral this row created or updated
  /** Normalised candidate referral. Committed by the repository. */
  candidate: NewReferralSchema.nullable(),
  /** Cadence step after merge (optional, set by the importer). */
  currentStep: z.number().int().min(0).max(4).optional(),
  /** Contact attempts from the source (optional). Written on commit. */
  contacts: z
    .array(
      z.object({
        step: z.number().int().min(0).max(3),
        channel: z.enum(CONTACT_CHANNELS),
        outcome: z.enum(CONTACT_OUTCOMES),
        at: isoDateTime,
        staffId: nullable(id),
        notes: nullable(z.string()),
      }),
    )
    .optional(),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

export const AuditEntrySchema = z.object({
  id,
  at: isoDateTime,
  actorId: nullable(id),
  actorName: z.string(),
  action: z.enum(AUDIT_ACTIONS),
  entityType: z.string(), // "referral", "contact_attempt", "sms_message", "settings"...
  entityId: nullable(z.string()),
  summary: z.string(), // plain language, no patient names. "Status changed from New to Booked"
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

/** A signed-in staff member as held by the app shell (mock login). */
export type SessionUser = Pick<Staff, 'id' | 'name' | 'role' | 'initials'>;
