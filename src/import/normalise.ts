/**
 * Cell-level normalisers for the tracker and Referrer Master. Pure TypeScript, no DOM or Node APIs,
 * so the same code runs in the browser worker and in scripts/build-seed.ts.
 */
import { digitsOnly, normaliseName } from '../domain';
import type { ContactChannel, ContactOutcome, ReferralStatus } from '../domain';
import type { CellValue } from './types';

export const CLINIC_UTC_OFFSET = '+10:00'; // Australia/Brisbane has no daylight saving

/** Plain text of a cell. Collapses whitespace and line breaks. */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v.replace(/\s+/g, ' ').trim();
}

/** Header text for matching: lower case, single spaces. */
export function headerKey(v: CellValue): string {
  return cellText(v).toLowerCase();
}

/** Upper case key for code lookups (clinic, ortho, staff aliases). */
export function codeKey(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, ' ').trim();
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function ymd(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parses a cell as a calendar date. Accepts Excel serials, Date objects, ISO strings with or without time,
 * and Australian day-first text: 15/01/2026, 15/1/26, 22.09.26. Returns 'YYYY-MM-DD' or null.
 */
export function parseDateCell(v: CellValue): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v < 36526 || v > 73051) return null; // outside 2000 to 2100 as an Excel serial
    const d = new Date(EXCEL_EPOCH_UTC + Math.floor(v) * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const au = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s);
  if (au) {
    const yy = au[3].length === 2 ? 2000 + Number(au[3]) : Number(au[3]);
    return ymd(yy, Number(au[2]), Number(au[1]));
  }
  return null;
}

/** True when a cell holds something that reads as a date. Used to detect shifted rows and misplaced values. */
export function looksLikeDate(v: CellValue): boolean {
  return parseDateCell(v) !== null;
}

/** Receipt or contact day as an ISO datetime at the start of the clinic day. */
export function dayStartIso(ymdValue: string): string {
  return `${ymdValue}T00:00:00${CLINIC_UTC_OFFSET}`;
}

/** Contact time for a day. Noon avoids day shifts when shown in any timezone. */
export function dayNoonIso(ymdValue: string): string {
  return `${ymdValue}T12:00:00${CLINIC_UTC_OFFSET}`;
}

/* ---------- names ---------- */

export interface SplitName {
  first: string;
  last: string;
  /** False when the cell had no comma, so the whole text was taken as the surname. */
  hadComma: boolean;
}

/** "Last, First" to first and last. Trims spaces. Keeps compound first names such as "Coen and Marlo". */
export function splitPatientName(raw: string): SplitName | null {
  const t = cellText(raw);
  if (!t) return null;
  const comma = t.indexOf(',');
  if (comma < 0) return { first: '', last: t, hadComma: false };
  return {
    last: t.slice(0, comma).trim(),
    first: t.slice(comma + 1).trim(),
    hadComma: true,
  };
}

/** Name key used for matching referrers. Strips accents, punctuation and case. */
export function nameKey(s: string): string {
  return normaliseName(s);
}

/* ---------- phones ---------- */

export interface PhoneParse {
  /** Digits-only AU form ("0412345678") or null when the cell has no usable number. */
  phone: string | null;
  email: string | null;
  /** Tag that names who the number belongs to, e.g. "Sarah" or "DAD Andrew". */
  contactPerson: string | null;
  /** Anything else in the cell (extra numbers, "requested", "TCU-HCF"). Goes to comments. */
  notes: string[];
}

/**
 * Splits a contact cell. Examples:
 *   "0412 345 678 (Sarah)"          phone + contact "Sarah"
 *   "0412 345 678, 0455 111 222"    first number kept, second to notes
 *   "Pt TCU-HCF" / "requested"      no phone, text to notes
 *   "melinda@bhp.com"               email
 */
export function parsePhoneCell(raw: CellValue): PhoneParse {
  const out: PhoneParse = { phone: null, email: null, contactPerson: null, notes: [] };
  if (typeof raw === 'number') {
    const digits = String(raw);
    if (digits.length === 9) out.phone = `0${digits}`;
    else if (digits.length === 10) out.phone = digits;
    return out;
  }
  const text = cellText(raw);
  if (!text) return out;

  const emailMatch = /[^\s,;/]+@[^\s,;/]+/.exec(text);
  if (emailMatch) out.email = emailMatch[0];
  const rest = emailMatch ? text.replace(emailMatch[0], ' ') : text;

  const runs = rest.match(/\+?\d[\d ]*\d/g) ?? [];
  const numbers = runs.map((r) => r.replace(/\D/g, '')).filter((d) => d.length >= 8 && d.length <= 11);
  if (numbers.length > 0) {
    out.phone = digitsOnly(numbers[0]);
    for (const extra of numbers.slice(1)) out.notes.push(`Other number: ${extra}`);
  }

  // Whatever is left once the numbers are removed is a tag or a note.
  let tag = rest;
  for (const r of runs) tag = tag.replace(r, ' ');
  tag = tag.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:/-]+|[\s,;:/-]+$/g, '');
  tag = tag.replace(/^nan,?\s*/i, '').trim();
  if (tag) {
    if (out.phone && tag.length <= 40 && !/\d/.test(tag)) out.contactPerson = tag;
    else out.notes.push(tag);
  }
  return out;
}

/* ---------- status and outcome ---------- */

export interface StatusParse {
  status: ReferralStatus | null;
  /** Plain-language warning for values that are not a status. */
  warning: string | null;
}

/** Tracker status column. Blank and junk such as "///" read as no status (null). */
export function parseTrackerStatus(raw: CellValue): StatusParse {
  const t = cellText(raw).toLowerCase();
  if (!t || !/[a-z]/.test(t)) return { status: null, warning: null };
  if (t === 'booked') return { status: 'booked', warning: null };
  if (t === 'to call us') return { status: 'to_call_us', warning: null };
  if (t === 'dnc' || t === 'do not contact') return { status: 'do_not_contact', warning: null };
  if (t === 'b') return { status: 'booked', warning: "Status 'b' was read as Booked. Confirm in Edge." };
  return {
    status: null,
    warning: `Status "${cellText(raw)}" is not a status value. Imported as contacting and kept in the comments.`,
  };
}

const OUTCOME_RULES: Array<[RegExp, ContactOutcome]> = [
  [/^lm\b.*coax/, 'lm_coax_sent'],
  [/^called and booked$/, 'called_booked'],
  [/^spoke (with|to) (the )?pt/, 'spoke_pt_parent'],
  [/^booked via cc$/, 'booked_via_cc'],
  [/^coax sent$/, 'coax_sent'],
  [/^coax\b/, 'coax_sent'], // "Coax`" typo in the tracker
  [/^sent$/, 'coax_sent'],
  [/^emailed?\b/, 'emailed'],
];

/** Maps a tracker outcome to the ContactOutcome enum. Returns null when the text is not a known outcome. */
export function parseOutcome(raw: CellValue): ContactOutcome | null {
  const t = cellText(raw).toLowerCase();
  for (const [re, outcome] of OUTCOME_RULES) if (re.test(t)) return outcome;
  return null;
}

/** Values that mean "something happened" with no outcome text (the Coax column holds "Yes"). */
export function isAffirmativeOnly(raw: CellValue): boolean {
  const t = cellText(raw).toLowerCase();
  return t === '' || t === 'yes' || t === 'y' || t === 'x' || t === '/' || t === '///';
}

export function channelFor(outcome: ContactOutcome, coaxColumn: boolean): ContactChannel {
  if (outcome === 'emailed') return 'email';
  if (outcome === 'coax_sent' || (coaxColumn && outcome !== 'lm_coax_sent')) return 'sms';
  return 'call';
}

/* ---------- hashing ---------- */

/** Deterministic 64-bit style hash as 16 hex characters (two FNV-1a passes). Same input gives the same hash in every runtime. */
export function hashString(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x5bd1e995) >>> 0;
    h2 ^= h2 >>> 15;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Hash of one source row. Trailing blank cells are ignored so readers that pad rows give the same result. */
export function rowHash(sheet: string, row: CellValue[]): string {
  let end = row.length;
  while (end > 0 && cellText(row[end - 1]) === '') end--;
  const parts: string[] = [];
  for (let i = 0; i < end; i++) {
    const v = row[i];
    parts.push(v instanceof Date ? `d:${v.toISOString()}` : typeof v === 'number' ? `n:${v}` : cellText(v));
  }
  return hashString(`${sheet}\u0001${parts.join('\u0002')}`);
}

export function isBlankRow(row: CellValue[] | undefined): boolean {
  if (!row) return true;
  return row.every((c) => cellText(c) === '');
}
