/**
 * Shared contract between the public form (refer.html) and the staff app.
 * No React and no staff code here: the public bundle imports this file, and the staff app imports it too.
 *
 * Transport in the prototype (same browser, same origin only):
 *  1. The submission is appended to a localStorage outbox (durable, survives a closed staff app).
 *  2. A BroadcastChannel message tells an open staff app right away.
 *  3. The staff app ingests the outbox on load and on the storage event, then removes what it ingested.
 * In production this file's role moves to the Supabase Edge Function `public-referral-submit`.
 */
import { z } from 'zod';
import { ATTACHMENT_KINDS, MAX_FILE_BYTES, MAX_FILES, NEAREST_CLINIC, NEXT_AVAILABLE_ORTHO } from './options';

export const INTAKE_CHANNEL = 'ethos-referrals-intake';
export const OUTBOX_KEY = 'ethos.referrals.outbox.v1';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const publicReferralSchema = z
  .object({
    version: z.literal(1),
    submitter: z.enum(['practice', 'patient']),
    patient: z.object({
      firstName: z.string().min(1).max(60),
      lastName: z.string().min(1).max(60),
      dob: isoDate,
      guardianName: z.string().max(120).nullable(),
      mobile: z.string().regex(/^04\d{8}$/),
      email: z.string().max(120).nullable(),
      street: z.string().min(3).max(120),
      suburb: z.string().min(2).max(60),
      postcode: z.string().regex(/^\d{4}$/),
    }),
    preferences: z.object({
      clinicId: z.string().min(1), // a clinic id, or NEAREST_CLINIC
      orthodontistId: z.string().min(1), // an orthodontist id, or NEXT_AVAILABLE_ORTHO
      interpreterLanguage: z.string().max(60).nullable(),
      femaleOrthodontist: z.boolean(),
      urgentReason: z.string().max(500).nullable(),
      comments: z.string().max(1000).nullable(),
    }),
    referrer: z
      .object({
        practiceName: z.string().min(2).max(120),
        phone: z.string().regex(/^0\d{9}$/),
        email: z.string().max(120),
        address: z.string().min(5).max(200),
      })
      .nullable(),
    attachments: z
      .array(
        z.object({
          kind: z.enum(ATTACHMENT_KINDS.map((k) => k.value) as [string, ...string[]]),
          fileName: z.string().max(200),
          sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
          mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
        }),
      )
      .max(MAX_FILES),
    consent: z.literal(true),
  })
  .strict();

export type PublicReferralPayload = z.infer<typeof publicReferralSchema>;

export const submissionEnvelopeSchema = z.object({
  id: z.string().regex(/^WEB-[A-Z2-9]{6}$/),
  submittedAt: z.string().datetime({ offset: true }),
  payload: publicReferralSchema,
});

export type PublicSubmissionEnvelope = z.infer<typeof submissionEnvelopeSchema>;

export { NEAREST_CLINIC, NEXT_AVAILABLE_ORTHO };

/** Reads the outbox. Anything that does not match the schema is dropped rather than crashing the staff app. */
export function readOutbox(): PublicSubmissionEnvelope[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = submissionEnvelopeSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

/** Appends one submission. Returns false when storage is blocked (private windows, disabled site data). */
export function appendToOutbox(envelope: PublicSubmissionEnvelope): boolean {
  try {
    const next = [...readOutbox().filter((e) => e.id !== envelope.id), envelope];
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/** Removes ingested submissions. Called by the staff app only. */
export function removeFromOutbox(ids: string[]): void {
  try {
    const remaining = readOutbox().filter((e) => !ids.includes(e.id));
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
  } catch {
    // Storage blocked: the submission stays in memory for this session only.
  }
}
