import type { Referral, SmsTemplate } from './entities';

/**
 * Default Coax SMS templates (plain text, Australian English, no emoji). These are the seed for the template store.
 * Once saved in Settings, the stored copy is what gets sent. Nothing sends from these defaults directly.
 *
 * Merge fields use single braces: {patientFirstName}, {clinicName}, {clinicPhone}, {orthoName}, {referrerName}, {reference}.
 * The legacy double-brace fields ({{first_name}}, {{clinic}}, {{ortho}}, {{reference}}) still render, so older saved text keeps working.
 * Wording is a starting point: the clinical team should approve it in Settings before go-live.
 */
export const DEFAULT_SMS_TEMPLATES: SmsTemplate[] = [
  {
    key: 'coax_1_standard',
    name: 'Coax #1, standard',
    step: 0,
    body: 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received your referral. Reply to this text or call the clinic to book your appointment. Reference {reference}.',
    description: 'Sent on Day 0 to the patient or parent for a standard referral.',
  },
  {
    key: 'coax_1_existing_family',
    name: 'Coax #1, existing family',
    step: 0,
    body: 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received a referral for a family member. Reply to this text or call the clinic to book. Reference {reference}.',
    description: 'For patients already in a family that attends Ethos.',
  },
  {
    key: 'coax_1_transfer',
    name: 'Coax #1, transfer',
    step: 0,
    body: 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received your referral from your dentist. Reply to this text or call us to book. Reference {reference}.',
    description: 'For referrals transferred from another orthodontic practice.',
  },
  {
    key: 'coax_2',
    name: 'Coax #2',
    step: 1,
    body: 'Hi {patientFirstName}, we tried to reach you about your orthodontic referral to Ethos Orthodontics {clinicName}. Reply to this text or call us to book. Reference {reference}.',
    description: 'Sent after the Day 1 call.',
  },
  {
    key: 'coax_3',
    name: 'Coax #3',
    step: 2,
    body: 'Hi {patientFirstName}, we are following up on your orthodontic referral to Ethos Orthodontics {clinicName}. We would still like to help. Reply to this text or call us to book. Reference {reference}.',
    description: 'Sent after the Day 14 call.',
  },
  {
    key: 'coax_4_final',
    name: 'Coax #4, final',
    step: 3,
    body: 'Hi {patientFirstName}, this is our final message about your orthodontic referral to Ethos Orthodontics {clinicName}. If you still want an appointment, reply to this text or call us. Reference {reference}.',
    description: 'Sent after the 3 month final call. The referral closes after this.',
  },
];

/** Merge fields the Settings editor and the send preview understand. */
export const TEMPLATE_TOKENS = ['patientFirstName', 'clinicName', 'clinicPhone', 'orthoName', 'referrerName', 'reference'] as const;
export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

export type MergeValues = Partial<Record<TemplateToken, string>>;

/** Legacy names, mapped to the current tokens. Accepted on input so older text and callers keep working. */
const LEGACY_TOKENS: Record<string, TemplateToken> = {
  first_name: 'patientFirstName',
  clinic: 'clinicName',
  ortho: 'orthoName',
  referrer: 'referrerName',
};

const TOKEN_PATTERN = /\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g;

function resolveToken(name: string): TemplateToken | null {
  if ((TEMPLATE_TOKENS as readonly string[]).includes(name)) return name as TemplateToken;
  return LEGACY_TOKENS[name] ?? null;
}

/** Accepts either token style as a key, so callers can pass {first_name} or {patientFirstName}. */
function normaliseValues(values: Record<string, string | undefined>): MergeValues {
  const out: MergeValues = {};
  for (const [key, value] of Object.entries(values)) {
    const token = resolveToken(key);
    if (token && value !== undefined) out[token] = value;
  }
  return out;
}

/**
 * Replaces merge fields. Unknown or empty fields stay as a visible placeholder, so the editor shows what is missing.
 * Used by the intake and public outbox paths, which keep the placeholder behaviour.
 */
export function renderTemplate(body: string, values: Record<string, string | undefined>): string {
  const merged = normaliseValues(values);
  return body.replace(TOKEN_PATTERN, (match, legacy: string | undefined, single: string | undefined) => {
    const token = resolveToken(legacy ?? single ?? '');
    const v = token ? merged[token] : undefined;
    return v && v.trim() ? v : match;
  });
}

/** Tokens still unresolved after rendering. Sending is blocked while this is non-empty. */
export function unresolvedFields(rendered: string): string[] {
  return [...rendered.matchAll(TOKEN_PATTERN)].map((m) => m[1] ?? m[2] ?? '');
}

/**
 * Merge values for a Coax text. A missing first name reads "there". Missing values leave no gap in the sentence.
 * Shared by the cadence engine, the log sheet and the send preview, so the preview always matches what is sent.
 */
export function cadenceMergeValues(
  referral: Pick<Referral, 'patientFirstName' | 'referenceNumber'>,
  clinicName: string | null,
  extra: { clinicPhone?: string | null; orthoName?: string | null; referrerName?: string | null } = {},
): MergeValues {
  return {
    patientFirstName: referral.patientFirstName.trim() || 'there',
    clinicName: clinicName?.trim() ?? '',
    clinicPhone: extra.clinicPhone?.trim() ?? '',
    orthoName: extra.orthoName?.trim() ?? '',
    referrerName: extra.referrerName?.trim() ?? '',
    reference: referral.referenceNumber,
  };
}

/** Renders a text body for sending. Empty fields are removed and spacing is tidied. */
export function renderSmsBody(body: string, values: Record<string, string | undefined>): string {
  const merged = normaliseValues(values);
  return body
    .replace(TOKEN_PATTERN, (_match, legacy: string | undefined, single: string | undefined) => {
      const token = resolveToken(legacy ?? single ?? '');
      return token ? (merged[token] ?? '').trim() : '';
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ([,.])/g, '$1')
    .trim();
}
