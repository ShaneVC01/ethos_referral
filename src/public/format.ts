/**
 * Input masks for the public form. Plain functions, no React, so they are easy to test.
 * Australian formats: mobiles 04xx xxx xxx, landlines 0x xxxx xxxx, dates DD/MM/YYYY.
 */

/** Keeps digits only, converts a +61 or 61 prefix to 0, and spaces the number as the user types. */
export function maskPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  digits = digits.slice(0, 10);
  if (!digits.startsWith('0')) return digits;
  const groups = digits.startsWith('04') ? [4, 3, 3] : [2, 4, 4];
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  return parts.join(' ');
}

/** Keeps digits and inserts slashes as DD/MM/YYYY is typed. */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Digits only, for storage and validation. */
export function digitsOf(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('61') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Letters, spaces, apostrophes, hyphens and full stops. Accents allowed. */
export const NAME_PATTERN = /^\p{L}[\p{L} '.-]*$/u;
