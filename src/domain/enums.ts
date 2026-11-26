// Enums mirror the Postgres enums planned for Supabase. Keep values stable: they are stored.

export const REFERRAL_SOURCES = [
  'ethos_online',
  'email',
  'phone',
  'handwritten_scan',
  'practice_template',
  'mediref',
  'wetransfer',
  'sendinc',
  'kiteworks',
  'patient_referral',
  'other',
] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const REFERRAL_STATUSES = [
  'new',
  'contacting',
  'to_call_us',
  'booked',
  'do_not_contact',
  'unsuccessful',
  'declined',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** Outcome of one contact attempt, as recorded in the 2026 tracker. */
export const CONTACT_OUTCOMES = [
  'lm_coax_sent', // "LM and Coax sent"
  'called_booked', // "Called and booked"
  'spoke_pt_parent', // "Spoke with Pt/Parent"
  'booked_via_cc', // "Booked via CC"
  'coax_sent', // "Coax sent"
  'emailed', // "Emailed"
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];

export const CONTACT_CHANNELS = ['sms', 'call', 'email'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

/**
 * A = adult, Y = youth, C = child. Thresholds are an assumption until the
 * clinical team confirms them (see deriveAgeGroup in helpers.ts).
 */
export const AGE_GROUPS = ['A', 'Y', 'C'] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const SUBMISSION_TYPES = ['new_appointment', 'referring_patient'] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];

export const SMS_STATUSES = ['queued', 'sent', 'delivered', 'failed', 'received'] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

export const SMS_DIRECTIONS = ['outbound', 'inbound'] as const;
export type SmsDirection = (typeof SMS_DIRECTIONS)[number];

export const STAFF_ROLES = ['manager', 'agent'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const IMPORT_RESULTS = ['new', 'unchanged', 'updated', 'conflict', 'error'] as const;
export type ImportResult = (typeof IMPORT_RESULTS)[number];

export const IMPORT_BATCH_STATUSES = ['staged', 'committed', 'rolled_back'] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export const REFERRER_NOTIFICATION_KINDS = [
  'thank_you',
  'missing_info',
  'unsuccessful_contact',
  'referral_returned',
] as const;
export type ReferrerNotificationKind = (typeof REFERRER_NOTIFICATION_KINDS)[number];

export const REFERRER_NOTIFICATION_STATUSES = ['pending', 'sent', 'dismissed'] as const;
export type ReferrerNotificationStatus = (typeof REFERRER_NOTIFICATION_STATUSES)[number];

/** Why a referral was closed. Null while open. */
export const CLOSED_REASONS = ['booked', 'unsuccessful', 'declined', 'do_not_contact', 'returned'] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];

/** Cadence step index. 0 = Coax #1 (Day 0), 1 = Day 1 call and Coax #2, 2 = Day 14 call and Coax #3, 3 = 3 month final call and Coax #4. */
export const CADENCE_STEPS = [0, 1, 2, 3] as const;
export type CadenceStep = (typeof CADENCE_STEPS)[number];

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'status_change',
  'contact_logged',
  'sms_sent',
  'sms_failed',
  'sms_received',
  'import_staged',
  'import_committed',
  'import_rolled_back',
  'settings_updated',
  'notification_created',
  'notification_sent',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
