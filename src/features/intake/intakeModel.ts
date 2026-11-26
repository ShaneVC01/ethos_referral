/**
 * Intake rules shared by the manual New referral form and the public outbox ingest.
 * Pure functions. The UI and the repository do the I/O.
 */
import { format } from 'date-fns';
import { AGE_GROUP_LABELS, REFERRAL_SOURCES, SOURCE_META, deriveAgeGroup, digitsOnly, isAuPhone, normaliseName, renderTemplate, unresolvedFields, type AgeGroup, type NewReferral, type ReferralFlags, type ReferralSource, type SmsTemplate, type Staff } from '@/domain';
import type { Lookups } from '@/data/repository';
import { EMAIL_PATTERN } from '@/public/format';
import { NEAREST_CLINIC, NEXT_AVAILABLE_ORTHO, type PublicReferralPayload } from '@/public/bridge';

export const CLINIC_TZ = 'Australia/Brisbane';

/** Missing information ticked on intake. A blank mobile counts as missing without ticking. */
export interface MissingState {
  phone: boolean;
  opg: boolean;
  letter: boolean;
}

/** Consult already booked in Edge when the referral is received. Saved as booked, no Coax, never queued. */
export interface BookingState {
  enabled: boolean;
  edgePatientId: string;
  appointmentDate: string | null;
  bookedBy: string;
  differentOrthodontist: boolean;
  thankYouNotice: boolean;
}

export const EMPTY_MISSING: MissingState = { phone: false, opg: false, letter: false };
export const EMPTY_BOOKING: BookingState = { enabled: false, edgePatientId: '', appointmentDate: null, bookedBy: '', differentOrthodontist: false, thankYouNotice: true };

/** Form state for the manual intake. Dates are 'YYYY-MM-DD' or null, phones are typed (masked). */
export interface IntakeState {
  source: ReferralSource | '';
  receivedDate: string;
  patient: {
    firstName: string;
    lastName: string;
    dob: string | null;
    ageOverride: AgeGroup | 'derived';
    phone: string;
    contactPerson: string;
    email: string;
    address: string;
  };
  preferences: {
    clinicId: string; // clinic id, or NEAREST_CLINIC
    orthodontistId: string; // orthodontist id, or NEXT_AVAILABLE_ORTHO
  };
  flags: ReferralFlags;
  referrer: {
    referrerId: string | null;
    notListed: boolean;
    name: string;
    phone: string;
    email: string;
    address: string;
  };
  comments: string;
  assignedTo: string; // staff id, or '' for unassigned
  templateKey: string;
  missing: MissingState;
  /** Why the urgent flag is set. Required when Urgent is ticked. */
  urgentReason: string;
  booking: BookingState;
}

export const NO_FLAGS: ReferralFlags = {
  urgent: false,
  existingPatient: false,
  sibling: false,
  hcf: false,
  languageSupport: false,
  femaleOrthoRequested: false,
};

export function emptyIntake(today: string): IntakeState {
  return {
    source: '',
    receivedDate: today,
    patient: { firstName: '', lastName: '', dob: null, ageOverride: 'derived', phone: '', contactPerson: '', email: '', address: '' },
    preferences: { clinicId: NEAREST_CLINIC, orthodontistId: NEXT_AVAILABLE_ORTHO },
    flags: { ...NO_FLAGS },
    referrer: { referrerId: null, notListed: false, name: '', phone: '', email: '', address: '' },
    comments: '',
    assignedTo: '',
    templateKey: 'coax_1_standard',
    missing: { ...EMPTY_MISSING },
    urgentReason: '',
    booking: { ...EMPTY_BOOKING },
  };
}

/** Upgrades a saved draft from an older form version, so new fields always exist. */
export function normaliseDraft(draft: Partial<IntakeState>, today: string): IntakeState {
  const base = emptyIntake(today);
  return {
    ...base,
    ...draft,
    patient: { ...base.patient, ...draft.patient },
    preferences: { ...base.preferences, ...draft.preferences },
    flags: { ...base.flags, ...draft.flags },
    referrer: { ...base.referrer, ...draft.referrer },
    missing: { ...EMPTY_MISSING, ...draft.missing },
    booking: { ...EMPTY_BOOKING, ...draft.booking },
    urgentReason: draft.urgentReason ?? '',
  };
}

export const SOURCE_OPTIONS = REFERRAL_SOURCES.map((value) => ({ value, label: SOURCE_META[value].label }));

export const FLAG_OPTIONS: Array<{ key: keyof ReferralFlags; label: string; description: string }> = [
  { key: 'urgent', label: 'Urgent', description: 'Pain, trauma or a treatment that cannot wait. Shows first in the queue.' },
  { key: 'existingPatient', label: 'Existing patient', description: 'Already attends Ethos, so use the existing family text.' },
  { key: 'sibling', label: 'Sibling', description: 'A brother or sister is already on the list or in treatment.' },
  { key: 'hcf', label: 'HCF list, check before calling', description: 'On the HCF do not call list from the tracker.' },
  { key: 'languageSupport', label: 'Interpreter needed', description: 'Book an interpreter before the first appointment.' },
  { key: 'femaleOrthoRequested', label: 'Female orthodontist requested', description: 'Match where possible.' },
];

export const TEMPLATE_OPTIONS = [
  { value: 'coax_1_standard', label: 'Coax #1, standard' },
  { value: 'coax_1_existing_family', label: 'Coax #1, existing family' },
  { value: 'coax_1_transfer', label: 'Coax #1, transfer' },
];

/** The calendar day in the clinic timezone, as 'YYYY-MM-DD'. */
export function clinicDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Received timestamp. Today uses the current time. Earlier days use midday clinic time, so they sort sensibly. */
export function receivedAtFor(day: string, now: Date): string {
  if (day === clinicDay(now)) return now.toISOString();
  return `${day}T12:00:00+10:00`;
}

export function clinicName(lookups: Lookups | undefined, id: string | null): string | null {
  if (!id) return null;
  return lookups?.clinics.find((c) => c.id === id)?.name ?? null;
}

/** Validation keyed by field. Only shown after a field is touched or the form is submitted. */
export function validateIntake(state: IntakeState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!state.source) errors['source'] = 'Choose where the referral came from.';
  if (!state.receivedDate) errors['receivedDate'] = 'Enter the date the referral was received.';
  if (!state.patient.firstName.trim()) errors['patient.firstName'] = 'Enter the patient first name.';
  if (!state.patient.lastName.trim()) errors['patient.lastName'] = 'Enter the patient last name.';
  if (state.patient.phone.trim() && !isAuPhone(state.patient.phone)) {
    errors['patient.phone'] = 'Enter a phone with 10 digits, for example 0412 345 678 or leave it blank.';
  }
  if (state.patient.email.trim() && !EMAIL_PATTERN.test(state.patient.email.trim())) {
    errors['patient.email'] = 'Enter an email like name@example.com or leave it blank.';
  }
  if (state.referrer.notListed) {
    if (!state.referrer.name.trim()) errors['referrer.name'] = 'Enter the referrer name or search the list instead.';
    if (state.referrer.phone.trim() && !isAuPhone(state.referrer.phone)) {
      errors['referrer.phone'] = 'Enter a phone with 10 digits or leave it blank.';
    }
    if (state.referrer.email.trim() && !EMAIL_PATTERN.test(state.referrer.email.trim())) {
      errors['referrer.email'] = 'Enter an email like name@example.com or leave it blank.';
    }
  }
  if (state.flags.urgent && !state.urgentReason.trim()) {
    errors['urgentReason'] = 'Say why this is urgent, so the team can prioritise it.';
  }
  if (state.booking.enabled) {
    if (!state.booking.edgePatientId.trim()) errors['booking.edgePatientId'] = 'Enter the Edge patient ID.';
    if (!state.booking.appointmentDate) errors['booking.appointmentDate'] = 'Choose the appointment date.';
    if (!state.booking.bookedBy.trim()) errors['booking.bookedBy'] = 'Say who booked it, for example the call centre.';
    if (state.preferences.clinicId === NEAREST_CLINIC) errors['preferences.clinicId'] = 'Choose the clinic the consult is booked at.';
    if (state.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO) errors['preferences.orthodontistId'] = 'Choose the orthodontist the consult is booked with.';
  }
  return errors;
}

/** Items the referrer needs to send. Online referrals never ask. A blank mobile always counts as missing. */
export function missingInfoItems(state: IntakeState): string[] {
  if (state.source === '' || state.source === 'ethos_online') return [];
  const items: string[] = [];
  if (state.missing.phone || !state.patient.phone.trim()) items.push('Mobile number');
  if (state.missing.opg) items.push('OPG or x-rays');
  if (state.missing.letter) items.push('Referral letter');
  return items;
}

/** Plain-language list: "a", "a and b", "a, b and c". */
export function listAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function toNewReferral(state: IntakeState, now: Date): NewReferral {
  const notListed = state.referrer.notListed && state.referrer.name.trim();
  const hasReferrer = !!state.referrer.referrerId || !!notListed;
  const ageGroup: AgeGroup | null = state.patient.ageOverride === 'derived' ? null : state.patient.ageOverride;
  return {
    receivedAt: receivedAtFor(state.receivedDate, now),
    source: state.source as ReferralSource,
    submissionType: hasReferrer ? 'referring_patient' : 'new_appointment',
    patientFirstName: state.patient.firstName.trim(),
    patientLastName: state.patient.lastName.trim(),
    dob: state.patient.dob,
    ageGroup,
    phone: digitsOnly(state.patient.phone),
    contactPerson: state.patient.contactPerson.trim() || null,
    email: state.patient.email.trim() || null,
    address: state.patient.address.trim() || null,
    preferredClinicId: state.preferences.clinicId === NEAREST_CLINIC ? null : state.preferences.clinicId,
    preferredClinicIsNearest: state.preferences.clinicId === NEAREST_CLINIC,
    preferredOrthodontistId: state.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO ? null : state.preferences.orthodontistId,
    preferredOrthodontistIsNextAvailable: state.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO,
    referrerId: notListed ? null : state.referrer.referrerId,
    referrerText: notListed
      ? {
          name: state.referrer.name.trim(),
          address: state.referrer.address.trim() || null,
          phone: digitsOnly(state.referrer.phone),
          email: state.referrer.email.trim() || null,
        }
      : null,
    comments: state.comments.trim() || null,
    flags: { ...state.flags },
    urgentReason: state.flags.urgent ? state.urgentReason.trim() || null : null,
    assignedTo: state.assignedTo || null,
  };
}

/** Coax #1 body for a template, with the reference filled in. Returns the text and any merge fields still open. */
export function renderCoax(
  template: SmsTemplate | undefined,
  values: { firstName: string; clinic: string; reference: string },
): { body: string; open: string[] } {
  if (!template) return { body: '', open: ['template'] };
  const body = renderTemplate(template.body, { first_name: values.firstName, clinic: values.clinic, reference: values.reference });
  return { body, open: unresolvedFields(body) };
}

/** Clinic wording for the text. "Nearest" has no single clinic, so the text says "near you". */
export function clinicForText(lookups: Lookups | undefined, clinicId: string | null, isNearest: boolean): string {
  if (isNearest || !clinicId) return 'near you';
  return clinicName(lookups, clinicId) ?? 'near you';
}

/* ---------- public submissions ---------- */

const ATTACHMENT_LABELS: Record<string, string> = {
  xray_opg: 'X-ray or OPG',
  referral_letter: 'Referral letter',
  other: 'Other',
};

/** Maps a website submission onto the same referral shape a person would type. */
export function publicToNewReferral(
  envelope: { id: string; submittedAt: string; payload: PublicReferralPayload },
  lookups: Lookups,
  receivedAt: string,
): NewReferral {
  const { payload, id } = envelope;
  const clinicKnown = payload.preferences.clinicId === NEAREST_CLINIC || lookups.clinics.some((c) => c.id === payload.preferences.clinicId);
  const orthoKnown = payload.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO || lookups.orthodontists.some((o) => o.id === payload.preferences.orthodontistId);
  const isNearest = payload.preferences.clinicId === NEAREST_CLINIC || !clinicKnown;
  const isNextAvailable = payload.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO || !orthoKnown;

  const notes: string[] = [`Website reference ${id}.`];
  notes.push(payload.submitter === 'practice' ? 'Sent by a dentist or practice on the website form.' : 'Sent by the patient or a parent on the website form.');
  if (!clinicKnown) notes.push(`Clinic choice "${payload.preferences.clinicId}" was not matched, so nearest is used.`);
  if (!orthoKnown) notes.push(`Orthodontist choice "${payload.preferences.orthodontistId}" was not matched, so next available is used.`);
  if (payload.preferences.interpreterLanguage) notes.push(`Interpreter: ${payload.preferences.interpreterLanguage}.`);
  if (payload.preferences.femaleOrthodontist) notes.push('Female orthodontist requested.');
  if (payload.preferences.urgentReason) notes.push(`Urgent: ${payload.preferences.urgentReason}`);
  if (payload.preferences.comments) notes.push(payload.preferences.comments);
  if (payload.attachments.length) {
    const list = payload.attachments.map((a) => `${a.fileName} (${ATTACHMENT_LABELS[a.kind] ?? 'Other'})`).join('; ');
    notes.push(`Files listed on the website, not yet received: ${list}.`);
  }
  notes.push('Consent to contact by text and phone given on the website form.');

  const referrer = payload.referrer;
  return {
    receivedAt,
    source: 'ethos_online',
    submissionType: payload.submitter === 'practice' ? 'referring_patient' : 'new_appointment',
    patientFirstName: payload.patient.firstName,
    patientLastName: payload.patient.lastName,
    dob: payload.patient.dob,
    ageGroup: null,
    phone: payload.patient.mobile,
    contactPerson: payload.patient.guardianName,
    email: payload.patient.email,
    address: `${payload.patient.street}, ${payload.patient.suburb} ${payload.patient.postcode}`,
    preferredClinicId: isNearest ? null : payload.preferences.clinicId,
    preferredClinicIsNearest: isNearest,
    preferredOrthodontistId: isNextAvailable ? null : payload.preferences.orthodontistId,
    preferredOrthodontistIsNextAvailable: isNextAvailable,
    referrerId: null,
    referrerText: referrer
      ? { name: referrer.practiceName, address: referrer.address, phone: referrer.phone, email: referrer.email }
      : null,
    comments: notes.join(' '),
    flags: {
      urgent: !!payload.preferences.urgentReason,
      existingPatient: false,
      sibling: false,
      hcf: false,
      languageSupport: !!payload.preferences.interpreterLanguage,
      femaleOrthoRequested: payload.preferences.femaleOrthodontist,
    },
    assignedTo: null,
  };
}

/* ---------- duplicates ---------- */

/** Same phone (last 9 digits) or same name with the same date of birth. */
export function isLikelyDuplicate(
  candidate: { patientFirstName: string; patientLastName: string; dob: string | null; phone: string | null },
  existing: { patientFirstName: string; patientLastName: string; dob: string | null; phone: string | null },
): boolean {
  const phoneA = digitsOnly(candidate.phone)?.slice(-9);
  const phoneB = digitsOnly(existing.phone)?.slice(-9);
  if (phoneA && phoneB && phoneA === phoneB) return true;
  const sameName =
    normaliseName(candidate.patientFirstName) === normaliseName(existing.patientFirstName) &&
    normaliseName(candidate.patientLastName) === normaliseName(existing.patientLastName);
  return sameName && !!candidate.dob && candidate.dob === existing.dob;
}

export function staffLabel(staff: Staff[], id: string | null): string {
  if (!id) return 'Unassigned';
  return staff.find((s) => s.id === id)?.name ?? 'Unknown user';
}

export function ageLabel(ageGroup: AgeGroup | null): string {
  return ageGroup ? `${AGE_GROUP_LABELS[ageGroup]} (${ageGroup})` : 'Not set';
}

/** Derived age group for the preview next to the DOB field. */
export function derivedAge(dob: string | null, receivedDate: string): AgeGroup | null {
  if (!dob) return null;
  return deriveAgeGroup(dob, `${receivedDate}T12:00:00+10:00`);
}

export function displayDate(iso: string): string {
  return format(new Date(`${iso}T12:00:00`), 'd MMM yyyy');
}
