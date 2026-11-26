/**
 * Form state, step rules and payload building for the public referral form.
 * Pure functions only. ReferForm.tsx owns the React state and calls these.
 */
import { differenceInYears, isAfter, startOfDay } from 'date-fns';
import { digitsOnly, isAuMobile, isAuPhone, parseAuDate } from '@/domain/helpers';
import { MAX_FILE_BYTES, NEAREST_CLINIC, NEXT_AVAILABLE_ORTHO, type AttachmentKind } from './options';
import { EMAIL_PATTERN, NAME_PATTERN, digitsOf } from './format';
import { publicReferralSchema, type PublicReferralPayload } from './bridge';

export type Submitter = 'practice' | 'patient';
export type StepId = 'who' | 'patient' | 'preferences' | 'referrer' | 'attachments' | 'review';

export interface UploadedFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  kind: AttachmentKind;
  status: 'reading' | 'ready' | 'error';
  progress: number; // 0 to 100 while the file is being checked
  error: string | null;
}

export interface FormState {
  submitter: Submitter | null;
  patient: {
    firstName: string;
    lastName: string;
    dob: string; // typed DD/MM/YYYY
    guardianName: string;
    mobile: string; // typed, masked
    email: string;
    street: string;
    suburb: string;
    postcode: string;
  };
  preferences: {
    clinicId: string;
    orthodontistId: string;
    needsInterpreter: boolean;
    interpreterLanguage: string;
    femaleOrthodontist: boolean;
    isUrgent: boolean;
    urgentReason: string;
    comments: string;
  };
  referrer: {
    practiceName: string;
    phone: string;
    email: string;
    address: string;
  };
  consent: boolean;
  securityCheck: boolean;
}

export const EMPTY_FORM: FormState = {
  submitter: null,
  patient: { firstName: '', lastName: '', dob: '', guardianName: '', mobile: '', email: '', street: '', suburb: '', postcode: '' },
  preferences: {
    clinicId: NEAREST_CLINIC,
    orthodontistId: NEXT_AVAILABLE_ORTHO,
    needsInterpreter: false,
    interpreterLanguage: '',
    femaleOrthodontist: false,
    isUrgent: false,
    urgentReason: '',
    comments: '',
  },
  referrer: { practiceName: '', phone: '', email: '', address: '' },
  consent: false,
  securityCheck: false,
};

/** Steps shown for the chosen submitter. The referrer step only applies to a practice. */
export function stepsFor(submitter: Submitter | null): StepId[] {
  if (submitter === 'practice') return ['who', 'patient', 'preferences', 'referrer', 'attachments', 'review'];
  return ['who', 'patient', 'preferences', 'attachments', 'review'];
}

export const STEP_LABELS: Record<StepId, string> = {
  who: 'Who',
  patient: 'Patient',
  preferences: 'Preferences',
  referrer: 'Practice',
  attachments: 'Files',
  review: 'Send',
};

export type Errors = Record<string, string>;

/** The age in whole years from a typed DD/MM/YYYY date, or null when it is not a valid date. */
export function ageFromTypedDob(raw: string, today: Date = new Date()): number | null {
  const iso = parseAuDate(raw);
  if (!iso) return null;
  return differenceInYears(today, new Date(`${iso}T00:00:00`));
}

function isFutureIso(iso: string, today: Date): boolean {
  return isAfter(startOfDay(new Date(`${iso}T00:00:00`)), startOfDay(today));
}

export function validateStep(step: StepId, state: FormState, today: Date = new Date()): Errors {
  const errors: Errors = {};

  if (step === 'who' && !state.submitter) {
    errors['submitter'] = 'Choose who is submitting the referral.';
  }

  if (step === 'patient') {
    const p = state.patient;
    const first = p.firstName.trim();
    const last = p.lastName.trim();
    if (!first) errors['patient.firstName'] = 'Enter the patient first name.';
    else if (!NAME_PATTERN.test(first)) errors['patient.firstName'] = 'Use letters only. Apostrophes and hyphens are fine.';
    if (!last) errors['patient.lastName'] = 'Enter the patient last name.';
    else if (!NAME_PATTERN.test(last)) errors['patient.lastName'] = 'Use letters only. Apostrophes and hyphens are fine.';

    const dobIso = parseAuDate(p.dob);
    if (!p.dob.trim()) {
      errors['patient.dob'] = 'Enter the date of birth as DD/MM/YYYY.';
    } else if (!dobIso) {
      errors['patient.dob'] = 'Enter a real date as DD/MM/YYYY, for example 04/11/2014.';
    } else if (isFutureIso(dobIso, today)) {
      errors['patient.dob'] = 'This date is in the future. Check the year.';
    } else if (differenceInYears(today, new Date(`${dobIso}T00:00:00`)) >= 120) {
      errors['patient.dob'] = 'Check the year of birth.';
    }

    const age = ageFromTypedDob(p.dob, today);
    if (age !== null && age < 18 && !p.guardianName.trim()) {
      errors['patient.guardianName'] = 'Enter the parent or guardian name, because the patient is under 18.';
    }

    if (!isAuMobile(p.mobile)) errors['patient.mobile'] = 'Enter a mobile number starting 04, with 10 digits.';

    if (p.email.trim() && !EMAIL_PATTERN.test(p.email.trim())) {
      errors['patient.email'] = 'Enter an email address like name@example.com or leave this blank.';
    }

    if (p.street.trim().length < 3) errors['patient.street'] = 'Enter the street address.';
    if (!p.suburb.trim()) errors['patient.suburb'] = 'Enter the suburb.';
    if (!/^\d{4}$/.test(p.postcode.trim())) errors['patient.postcode'] = 'Enter a 4 digit postcode.';
  }

  if (step === 'preferences') {
    const pr = state.preferences;
    if (pr.needsInterpreter && !pr.interpreterLanguage.trim()) {
      errors['preferences.interpreterLanguage'] = 'Tell us the language, so we can arrange an interpreter.';
    }
    if (pr.isUrgent && !pr.urgentReason.trim()) {
      errors['preferences.urgentReason'] = 'Tell us why this is urgent, so the team can prioritise it.';
    }
    if (pr.comments.length > 1000) errors['preferences.comments'] = 'Keep comments under 1,000 characters.';
  }

  if (step === 'referrer') {
    const r = state.referrer;
    if (r.practiceName.trim().length < 2) errors['referrer.practiceName'] = 'Enter the practice or dentist name.';
    if (!isAuPhone(r.phone)) errors['referrer.phone'] = 'Enter the practice phone with 10 digits, for example 07 3123 4567.';
    if (!EMAIL_PATTERN.test(r.email.trim())) errors['referrer.email'] = 'Enter the practice email address.';
    if (r.address.trim().length < 5) errors['referrer.address'] = 'Enter the practice address.';
  }

  if (step === 'attachments') {
    if (!state.consent) errors['consent'] = 'Tick the consent box before you send the referral.';
    if (!state.securityCheck) errors['securityCheck'] = 'Complete the security check before you send the referral.';
  }

  return errors;
}

/** The first step that still has an invalid field, or null when every step is valid. */
export function firstInvalidStep(state: FormState, today: Date = new Date()): StepId | null {
  for (const step of stepsFor(state.submitter)) {
    if (step === 'review') continue;
    if (Object.keys(validateStep(step, state, today)).length > 0) return step;
  }
  return null;
}

/** Builds the payload for the transport. Throws when a value is missing or out of shape. */
export function buildPayload(state: FormState, files: UploadedFile[]): PublicReferralPayload {
  if (!state.submitter) throw new Error('Choose who is submitting the referral.');
  const dobIso = parseAuDate(state.patient.dob);
  if (!dobIso) throw new Error('The date of birth is not valid.');
  const age = ageFromTypedDob(state.patient.dob) ?? 99;
  const isPractice = state.submitter === 'practice';

  const payload = {
    version: 1 as const,
    submitter: state.submitter,
    patient: {
      firstName: state.patient.firstName.trim(),
      lastName: state.patient.lastName.trim(),
      dob: dobIso,
      guardianName: age < 18 && state.patient.guardianName.trim() ? state.patient.guardianName.trim() : null,
      mobile: digitsOf(state.patient.mobile),
      email: state.patient.email.trim() || null,
      street: state.patient.street.trim(),
      suburb: state.patient.suburb.trim(),
      postcode: state.patient.postcode.trim(),
    },
    preferences: {
      clinicId: state.preferences.clinicId,
      orthodontistId: state.preferences.orthodontistId,
      interpreterLanguage: state.preferences.needsInterpreter ? state.preferences.interpreterLanguage.trim() : null,
      femaleOrthodontist: state.preferences.femaleOrthodontist,
      urgentReason: state.preferences.isUrgent ? state.preferences.urgentReason.trim() : null,
      comments: state.preferences.comments.trim() || null,
    },
    referrer: isPractice
      ? {
          practiceName: state.referrer.practiceName.trim(),
          phone: digitsOnly(state.referrer.phone) ?? '',
          email: state.referrer.email.trim(),
          address: state.referrer.address.trim(),
        }
      : null,
    attachments: files
      .filter((f) => f.status === 'ready')
      .map((f) => ({
        kind: f.kind,
        fileName: f.fileName,
        sizeBytes: Math.min(f.sizeBytes, MAX_FILE_BYTES),
        mimeType: f.mimeType,
      })),
    consent: true as const,
  };

  return publicReferralSchema.parse(payload);
}
