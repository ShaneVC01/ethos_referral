/**
 * The one place the public form sends a referral. ReferForm calls submitPublicReferral and nothing else.
 *
 * Prototype transport (see bridge.ts): outbox in localStorage plus a BroadcastChannel message.
 * The staff app creates the referral with source ethos_online and queues Coax #1.
 *
 * Production: replace the body with a POST to the Supabase Edge Function `public-referral-submit`,
 * sending the Turnstile token. The Edge Function validates the payload, dedupes, inserts the referral
 * and returns the reference. The UI does not change.
 */
import { appendToOutbox, INTAKE_CHANNEL, type PublicReferralPayload, type PublicSubmissionEnvelope } from './bridge';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1, so it reads back cleanly over the phone

/** A short reference such as WEB-7KQ2M9. Not patient data. */
export function newSubmissionReference(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
  return `WEB-${code}`;
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(INTAKE_CHANNEL);
  return channel;
}

export interface SubmitResult {
  /** The only thing shown back to the person after sending. */
  reference: string;
}

export async function submitPublicReferral(payload: PublicReferralPayload): Promise<SubmitResult> {
  const envelope: PublicSubmissionEnvelope = {
    id: newSubmissionReference(),
    submittedAt: new Date().toISOString(),
    payload,
  };

  // 1. Durable outbox. The staff app ingests it on load, even if it was closed when the form was sent.
  const stored = appendToOutbox(envelope);
  // 2. Live message for a staff app already open in this browser.
  const live = getChannel();
  if (!stored && !live) {
    throw new Error('We could not send your referral from this browser. Check your connection and try again.');
  }
  live?.postMessage({ type: 'submitted', envelope });

  return { reference: envelope.id };
}
