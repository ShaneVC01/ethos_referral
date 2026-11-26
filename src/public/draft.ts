/**
 * Draft autosave for the public form. Per-browser convenience only: the draft never leaves the device,
 * and it is cleared as soon as the referral is sent. Every storage call is wrapped in try/catch.
 * Attachments are not kept in the draft, because a file cannot be stored safely in localStorage.
 */
import { EMPTY_FORM, type FormState } from './form';

const DRAFT_KEY = 'ethos.refer.draft.v1';

export function loadDraft(): FormState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormState> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...EMPTY_FORM,
      ...parsed,
      patient: { ...EMPTY_FORM.patient, ...(parsed.patient ?? {}) },
      preferences: { ...EMPTY_FORM.preferences, ...(parsed.preferences ?? {}) },
      referrer: { ...EMPTY_FORM.referrer, ...(parsed.referrer ?? {}) },
    };
  } catch {
    return null;
  }
}

export function saveDraft(state: FormState): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage: the form still works, it just does not resume.
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}
