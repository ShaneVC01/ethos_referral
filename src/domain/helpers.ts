import { differenceInYears, format, isValid, parse, parseISO } from 'date-fns';
import { enAU } from 'date-fns/locale';
import type { AgeGroup } from './enums';

export const CLINIC_TZ = 'Australia/Brisbane';

/**
 * Age group from date of birth. A = adult (18+), Y = youth (12 to 17), C = child (under 12).
 * ASSUMPTION: thresholds are not yet confirmed by the clinical team. Change here only.
 */
export function ageInYears(dob: string | Date, at: string | Date): number {
  const d = typeof dob === 'string' ? parseISO(dob) : dob;
  const a = typeof at === 'string' ? parseISO(at) : at;
  return differenceInYears(a, d);
}

export function deriveAgeGroup(dob: string | Date | null | undefined, at: string | Date): AgeGroup | null {
  if (!dob) return null;
  const years = ageInYears(dob, at);
  if (years >= 18) return 'A';
  if (years >= 12) return 'Y';
  return 'C';
}

/** Digits only, with +61 or 61 country prefix turned into 0. Returns null for empty input. */
export function digitsOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits || null;
}

/** True for an Australian mobile (04xx xxx xxx) once normalised. */
export function isAuMobile(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw);
  return !!d && /^04\d{8}$/.test(d);
}

/** True for an Australian mobile or landline (10 digits starting 0). */
export function isAuPhone(raw: string | null | undefined): boolean {
  const d = digitsOnly(raw);
  return !!d && /^0\d{9}$/.test(d);
}

/**
 * Display form. Mobiles "0412 345 678", landlines "07 3123 4567".
 * Input with tags such as "(DAD)" or "TCU-HCF" is stripped to digits first.
 * Anything that is not a valid AU number is returned trimmed, so no data is lost.
 */
export function formatAuMobile(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = digitsOnly(raw);
  if (!d || !/^0\d{9}$/.test(d)) return raw.trim();
  if (d.startsWith('04')) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
}

/** List masking: shows the last three digits only. "0412 345 678" becomes "04xx xxx 678". */
export function maskPhone(raw: string | null | undefined): string {
  const d = digitsOnly(raw);
  if (!d) return '';
  return `${d.slice(0, 2)}xx xxx ${d.slice(-3)}`;
}

/** Strips accents, punctuation (O'Shea becomes oshea), case and extra spaces. For matching only. */
export function normaliseName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Duplicate key: normalised last + first name, last 9 phone digits, and DOB when known.
 * Same patient copied into a later month produces the same key, so the importer can merge.
 */
export function dedupeKey(input: {
  firstName: string;
  lastName: string;
  phone?: string | null;
  dob?: string | null;
}): string {
  const phone = digitsOnly(input.phone)?.slice(-9) ?? '';
  const parts = [normaliseName(input.lastName), normaliseName(input.firstName), phone];
  if (input.dob) parts.push(input.dob);
  return parts.join('|');
}

/** Parses DD/MM/YYYY (also D/M/YY and DD.MM.YY) or YYYY-MM-DD. Returns 'YYYY-MM-DD' or null. */
export function parseAuDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  for (const pattern of ['dd/MM/yyyy', 'd/M/yyyy', 'dd.MM.yy', 'dd.MM.yyyy', 'd/M/yy']) {
    const d = parse(s, pattern, new Date(2000, 0, 1));
    if (isValid(d)) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

/** "DD/MM/YYYY" for display and input. Input 'YYYY-MM-DD' or ISO datetime. */
export function formatAuDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? parse(value, 'yyyy-MM-dd', new Date()) : parseISO(value);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
}

/** Plain-language date for due work, e.g. "Thu 4 Dec". */
export function formatDue(value: string | Date): string {
  const d = value instanceof Date ? value : parseISO(value);
  return format(d, 'EEE d MMM', { locale: enAU });
}

/** Date and time for timelines, e.g. "4 Dec 2026, 9:15am". */
export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : parseISO(value);
  return format(d, 'd MMM yyyy, h:mma', { locale: enAU }).replace('AM', 'am').replace('PM', 'pm');
}

export function isAuPostcode(raw: string | null | undefined): boolean {
  return !!raw && /^\d{4}$/.test(raw.trim());
}

/** Referral reference for humans, e.g. REF-2026-000123. */
export function formatReference(year: number, sequence: number): string {
  return `REF-${year}-${String(sequence).padStart(6, '0')}`;
}
