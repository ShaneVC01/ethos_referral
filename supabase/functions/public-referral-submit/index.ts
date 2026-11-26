/**
 * public-referral-submit
 *
 * The only public write path into the referral system. Called by the public form (refer.html) with
 * multipart/form-data: a `payload` field (JSON), a `cf-turnstile-response` field and file fields `file-0`, `file-1`...
 *
 * Order of work (each step fails closed):
 *  1. Method and size checks.
 *  2. Turnstile verification. Nothing else runs without a pass.
 *  3. Schema validation. The schema mirrors src/public/bridge.ts. Keep the two in step.
 *  4. File checks: size, declared type, and magic bytes (PDF, JPEG, PNG).
 *  5. Dedupe check. A likely duplicate is kept and flagged for review, never rejected or echoed back.
 *  6. Insert the referral (source ethos_online), upload files to private storage, record attachments.
 *  7. Queue Coax #1 and ask coax-send to send it. A send failure leaves the text queued for the Inbox.
 *
 * The response carries the reference number only. Patient data is never echoed.
 */
import { z } from 'npm:zod@3.25.76';
import { audit, dedupeKey, json, serviceClient } from '../_shared/client.ts';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 6; // matches src/public/options.ts
const BUCKET = 'referral-attachments';
// Sentinels from src/public/options.ts. Keep in sync.
const NEAREST_CLINIC = 'nearest';
const NEXT_AVAILABLE_ORTHO = 'next_available';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Mirror of publicReferralSchema in src/public/bridge.ts. Keep in sync.
const publicReferralSchema = z
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
      clinicId: z.string().min(1),
      orthodontistId: z.string().min(1),
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
          kind: z.string().min(1).max(40),
          fileName: z.string().max(200),
          sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),
          mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
        }),
      )
      .max(MAX_FILES),
    consent: z.literal(true),
  })
  .strict();

type Payload = z.infer<typeof publicReferralSchema>;

const MAGIC: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
};

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/** Turnstile server-side check. Fails closed when the secret is missing. */
async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) {
    console.error('TURNSTILE_SECRET_KEY is not set. Refusing the submission.');
    return false;
  }
  if (!token) return false;
  const body = new FormData();
  body.set('secret', secret);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const result = (await res.json()) as { success?: boolean };
  return result.success === true;
}

function ageGroupFor(dob: string, at: Date): 'A' | 'Y' | 'C' {
  // Thresholds match deriveAgeGroup in src/domain/helpers.ts (assumption until the clinical team confirms).
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = at.getUTCFullYear() - y;
  if (at.getUTCMonth() + 1 < m || (at.getUTCMonth() + 1 === m && at.getUTCDate() < d)) age -= 1;
  if (age >= 18) return 'A';
  if (age >= 12) return 'Y';
  return 'C';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_FILE_BYTES * MAX_FILES + 64 * 1024) return json({ error: 'The submission is too large.' }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Send the form as multipart form data.' }, 400);
  }

  const turnstileToken = form.get('cf-turnstile-response');
  const ip = req.headers.get('cf-connecting-ip');
  if (!(await verifyTurnstile(typeof turnstileToken === 'string' ? turnstileToken : null, ip))) {
    return json({ error: 'The security check did not pass. Refresh the page and try again.' }, 403);
  }

  const rawPayload = form.get('payload');
  if (typeof rawPayload !== 'string') return json({ error: 'The form is missing its details.' }, 400);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    return json({ error: 'The form details could not be read.' }, 400);
  }
  const checked = publicReferralSchema.safeParse(parsedJson);
  if (!checked.success) return json({ error: 'Check the highlighted details and try again.' }, 422);
  const payload: Payload = checked.data;

  // Files: count and declared metadata must match, then magic bytes must match the declared type.
  const files: File[] = [];
  for (let i = 0; i < payload.attachments.length; i += 1) {
    const f = form.get(`file-${i}`);
    if (!(f instanceof File)) return json({ error: 'A file is missing. Attach it again.' }, 422);
    const meta = payload.attachments[i];
    if (!meta || f.size > MAX_FILE_BYTES || f.size !== meta.sizeBytes || f.type !== meta.mimeType) {
      return json({ error: 'A file does not match its details. Attach it again.' }, 422);
    }
    const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
    const sigs = MAGIC[meta.mimeType] ?? [];
    if (!sigs.some((sig) => startsWith(head, sig))) return json({ error: 'A file is not a valid PDF, JPEG or PNG.' }, 422);
    files.push(f);
  }

  const client = serviceClient();
  const now = new Date();
  const dob = payload.patient.dob;
  const key = dedupeKey({ firstName: payload.patient.firstName, lastName: payload.patient.lastName, phone: payload.patient.mobile, dob });

  // Likely duplicate: kept, flagged, never rejected or echoed back.
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const { data: dupes } = await client.from('referrals').select('id').eq('dedupe_key', key).gte('received_at', since).limit(1);
  const possibleDuplicate = (dupes?.length ?? 0) > 0;

  const nearest = payload.preferences.clinicId === NEAREST_CLINIC;
  const nextAvailable = payload.preferences.orthodontistId === NEXT_AVAILABLE_ORTHO;
  const clinicId = !nearest && UUID.test(payload.preferences.clinicId) ? payload.preferences.clinicId : null;
  const orthoId = !nextAvailable && UUID.test(payload.preferences.orthodontistId) ? payload.preferences.orthodontistId : null;
  const { data: clinic } = clinicId
    ? await client.from('clinics').select('id, name').eq('id', clinicId).maybeSingle()
    : { data: null };
  const { data: ortho } = orthoId
    ? await client.from('orthodontists').select('id').eq('id', orthoId).maybeSingle()
    : { data: null };

  const commentParts = [
    payload.preferences.comments,
    payload.preferences.urgentReason ? `Urgent: ${payload.preferences.urgentReason}` : null,
    payload.patient.guardianName ? `Guardian: ${payload.patient.guardianName}` : null,
    possibleDuplicate ? 'Possible duplicate of an existing referral. Check before contacting.' : null,
  ].filter(Boolean);

  const { data: referral, error: insertError } = await client
    .from('referrals')
    .insert({
      received_at: now.toISOString(),
      source: 'ethos_online',
      submission_type: payload.submitter === 'practice' ? 'referring_patient' : 'new_appointment',
      patient_first_name: payload.patient.firstName,
      patient_last_name: payload.patient.lastName,
      dob,
      age_group: ageGroupFor(dob, now),
      phone: payload.patient.mobile,
      contact_person: payload.patient.guardianName,
      email: payload.patient.email,
      address: `${payload.patient.street}, ${payload.patient.suburb} ${payload.patient.postcode}`,
      preferred_clinic_id: nearest || !clinic ? null : clinic.id,
      preferred_clinic_is_nearest: nearest,
      preferred_orthodontist_id: nextAvailable || !ortho ? null : ortho.id,
      preferred_orthodontist_is_next_available: nextAvailable,
      referrer_text: payload.referrer
        ? { name: payload.referrer.practiceName, address: payload.referrer.address, phone: payload.referrer.phone, email: payload.referrer.email }
        : null,
      comments: commentParts.length ? commentParts.join('\n') : null,
      flag_urgent: !!payload.preferences.urgentReason,
      flag_existing_patient: possibleDuplicate,
      flag_language_support: !!payload.preferences.interpreterLanguage,
      flag_female_ortho_requested: payload.preferences.femaleOrthodontist,
      status: 'new',
      current_step: 0,
      dedupe_key: key,
    })
    .select('id, reference_number')
    .single();

  if (insertError || !referral) {
    console.error('referral insert failed', insertError?.message);
    return json({ error: 'The referral could not be saved. Try again in a few minutes.' }, 500);
  }

  // Coax #1 is due at receipt (step 0 offset is zero), so the next action is now. Mirrors nextAction in cadence.ts.
  await client.from('referrals').update({ next_action_at: now.toISOString() }).eq('id', referral.id);

  for (let i = 0; i < files.length; i += 1) {
    const f = files[i];
    const meta = payload.attachments[i];
    if (!f || !meta) continue;
    const safeName = meta.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'attachment';
    const path = `${referral.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, f, { contentType: meta.mimeType, upsert: false });
    if (uploadError) {
      console.error('attachment upload failed', uploadError.message);
      continue;
    }
    await client.from('attachments').insert({
      referral_id: referral.id,
      storage_path: path,
      file_name: safeName,
      size_bytes: f.size,
      mime_type: meta.mimeType,
    });
  }

  // Coax #1 (first text) queued, then sent. The template follows the submitter, as in templates.ts.
  const templateKey = payload.submitter === 'practice' ? 'coax_1_transfer' : 'coax_1_standard';
  // Clinic phone is not in the domain model yet. It comes from an env var until it is added to clinics. See supabase/README.md.
  const { data: template } = await client.from('sms_templates').select('body').eq('key', templateKey).maybeSingle();
  const body = (template?.body ?? '')
    .replaceAll('{patientFirstName}', payload.patient.firstName)
    .replaceAll('{clinicName}', clinic?.name ?? 'Ethos Orthodontics')
    .replaceAll('{clinicPhone}', Deno.env.get('CLINIC_PUBLIC_PHONE') ?? '');
  const { data: queued } = await client
    .from('sms_messages')
    .insert({
      referral_id: referral.id,
      direction: 'outbound',
      template_key: templateKey,
      body,
      to_phone: payload.patient.mobile,
      status: 'queued',
      needs_review: false,
    })
    .select('id')
    .single();

  if (queued) {
    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/coax-send`;
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ messageId: queued.id }),
    }).catch((err) => console.error('coax-send invoke failed', String(err)));
  }

  await audit(client, {
    actorName: 'Public form',
    action: 'create',
    entityType: 'referral',
    entityId: referral.id,
    summary: `Referral ${referral.reference_number} received from the public form${possibleDuplicate ? ', flagged as a possible duplicate' : ''}`,
  });

  return json({ reference: referral.reference_number }, 201);
});
