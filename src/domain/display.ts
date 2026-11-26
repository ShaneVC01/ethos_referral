import type {
  AgeGroup,
  ClosedReason,
  ContactOutcome,
  ReferralSource,
  ReferralStatus,
  SmsStatus,
  SubmissionType,
} from './enums';

/**
 * Display metadata. No React here. The UI maps `icon` keys to Lucide icons (see components/StatusBadge.tsx).
 * Every status is shown with icon + label, never colour alone.
 */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export type IconKey =
  | 'check'
  | 'phone'
  | 'ban'
  | 'dot'
  | 'clock'
  | 'x'
  | 'flag'
  | 'message'
  | 'mail'
  | 'send'
  | 'alert'
  | 'user'
  | 'globe'
  | 'file'
  | 'reply';

export interface Meta {
  label: string;
  icon: IconKey;
  tone: Tone;
}

export const STATUS_META: Record<ReferralStatus, Meta> = {
  new: { label: 'New', icon: 'dot', tone: 'info' },
  contacting: { label: 'Contacting', icon: 'clock', tone: 'accent' },
  to_call_us: { label: 'To call us', icon: 'phone', tone: 'warning' },
  booked: { label: 'Booked', icon: 'check', tone: 'success' },
  do_not_contact: { label: 'Do not contact', icon: 'ban', tone: 'danger' },
  unsuccessful: { label: 'Unsuccessful', icon: 'x', tone: 'neutral' },
  declined: { label: 'Declined', icon: 'x', tone: 'neutral' },
};

/** Labels match the tracker outcome values so staff recognise them. */
export const OUTCOME_META: Record<ContactOutcome, Meta> = {
  lm_coax_sent: { label: 'LM and Coax sent', icon: 'message', tone: 'neutral' },
  called_booked: { label: 'Called and booked', icon: 'check', tone: 'success' },
  spoke_pt_parent: { label: 'Spoke with Pt/Parent', icon: 'phone', tone: 'accent' },
  booked_via_cc: { label: 'Booked via CC', icon: 'check', tone: 'success' },
  coax_sent: { label: 'Coax sent', icon: 'send', tone: 'neutral' },
  emailed: { label: 'Emailed', icon: 'mail', tone: 'neutral' },
};

export const SOURCE_META: Record<ReferralSource, { label: string; icon: IconKey }> = {
  ethos_online: { label: 'Ethos website', icon: 'globe' },
  email: { label: 'Email', icon: 'mail' },
  phone: { label: 'Phone', icon: 'phone' },
  handwritten_scan: { label: 'Handwritten scan', icon: 'file' },
  practice_template: { label: 'Practice template', icon: 'file' },
  mediref: { label: 'Mediref', icon: 'file' },
  wetransfer: { label: 'WeTransfer', icon: 'file' },
  sendinc: { label: 'Sendinc', icon: 'file' },
  kiteworks: { label: 'Kiteworks', icon: 'file' },
  patient_referral: { label: 'Patient referral', icon: 'user' },
  other: { label: 'Other', icon: 'file' },
};

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  A: 'Adult',
  Y: 'Youth',
  C: 'Child',
};

export const SUBMISSION_LABELS: Record<SubmissionType, string> = {
  new_appointment: 'New appointment',
  referring_patient: 'Referring a patient',
};

export const SMS_STATUS_META: Record<SmsStatus, Meta> = {
  queued: { label: 'Queued', icon: 'clock', tone: 'accent' },
  sent: { label: 'Sent', icon: 'send', tone: 'neutral' },
  delivered: { label: 'Delivered', icon: 'check', tone: 'success' },
  failed: { label: 'Failed', icon: 'alert', tone: 'danger' },
  received: { label: 'Reply', icon: 'reply', tone: 'info' },
};

export const CLOSED_REASON_LABELS: Record<ClosedReason, string> = {
  booked: 'Booked',
  unsuccessful: 'Unsuccessful after final contact',
  declined: 'Declined',
  do_not_contact: 'Do not contact',
  returned: 'Returned to referrer',
};
