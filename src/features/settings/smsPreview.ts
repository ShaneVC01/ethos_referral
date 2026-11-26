/**
 * SMS template helpers for the Settings editor: merge fields, live preview and segment counting.
 * Segment rules follow GSM 03.38: 160 characters for one GSM-7 segment (153 per segment when joined),
 * 70 for UCS-2 (67 per segment when joined). Extension characters count as two.
 */

export const MERGE_FIELDS = [
  { token: 'patientFirstName', label: 'Patient first name', sample: 'Ava' },
  { token: 'clinicName', label: 'Clinic name', sample: 'Sample clinic' },
  { token: 'clinicPhone', label: 'Clinic phone', sample: '07 0000 0000' },
  { token: 'orthoName', label: 'Orthodontist', sample: 'Dr Sample' },
  { token: 'referrerName', label: 'Referrer name', sample: 'Dr Referrer' },
  { token: 'reference', label: 'Reference', sample: 'REF-2026-000123' },
] as const;

const ALLOWED = new Set<string>(MERGE_FIELDS.map((f) => f.token));

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

export interface SmsCount {
  characters: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
  perSegmentLimit: number;
}

export function countSms(text: string): SmsCount {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) {
    const ucs = [...text].length;
    return {
      characters: ucs,
      segments: ucs === 0 ? 0 : ucs <= 70 ? 1 : Math.ceil(ucs / 67),
      encoding: 'UCS-2',
      perSegmentLimit: ucs <= 70 ? 70 : 67,
    };
  }
  return {
    characters: units,
    segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153),
    encoding: 'GSM-7',
    perSegmentLimit: units <= 160 ? 160 : 153,
  };
}

/** Merge tokens in the body that are not on the allowed list. */
export function unknownFields(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{(\w+)\}/g)) {
    const name = m[1] ?? '';
    if (!ALLOWED.has(name)) found.add(name);
  }
  return [...found];
}

/** Body with sample values filled in. Unknown tokens are left visible so the editor shows them. */
export function renderPreview(body: string): string {
  return body.replace(/\{(\w+)\}/g, (match, name: string) => {
    const field = MERGE_FIELDS.find((f) => f.token === name);
    return field ? field.sample : match;
  });
}
