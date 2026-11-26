/**
 * Referrer statistics. Financial years run 1 July to 30 June (Australia).
 * FY27 is 1 July 2026 to 30 June 2027, so FY27 is the year that starts in 2026.
 * FY25 and FY26 come from the Edge referral history. FY27 YTD uses the Referrer Master figures,
 * which are the authoritative current-year numbers, so the two sources are not added together.
 */
import { differenceInCalendarMonths, parseISO } from 'date-fns';
import type { ReferrerHistory } from '@/domain';

/** Start year of the financial year that contains an ISO date. */
export function financialYearStart(isoDate: string): number {
  const d = parseISO(isoDate);
  const month = d.getMonth(); // 0 = January
  return month >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

/** Label for a financial year that starts in `startYear`, for example 2026 becomes "FY27". */
export function fyLabel(startYear: number): string {
  return `FY${String(startYear + 1).slice(-2)}`;
}

export interface FyCount {
  referrals: number;
  booked: number;
}

/** Edge history counts for one financial year. */
export function historyCount(history: ReferrerHistory[], startYear: number): FyCount {
  let referrals = 0;
  let booked = 0;
  for (const h of history) {
    if (financialYearStart(h.receivedOn) !== startYear) continue;
    referrals += 1;
    if (h.booked) booked += 1;
  }
  return { referrals, booked };
}

/**
 * Share of referrals that converted, as a whole percentage, or null when there are no referrals.
 * Both counts must cover the same period. Clamped to 0 to 100 so a data mismatch can never show above 100%.
 */
export function startRate(converted: number, referrals: number): number | null {
  if (referrals <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((converted / referrals) * 100)));
}

/** All-time conversion rate for a referrer: referrals that started treatment / all recorded referrals. */
export function conversionRate(referrer: { totalStarted: number; totalReferrals: number }): number | null {
  return startRate(referrer.totalStarted, referrer.totalReferrals);
}

export function formatRate(rate: number | null): string {
  return rate === null ? 'No referrals' : `${rate}%`;
}

/** Whole months from the last referral to now, or null when no referral is recorded. */
export function monthsSince(isoDate: string | null, now: Date): number | null {
  if (!isoDate) return null;
  return Math.max(0, differenceInCalendarMonths(now, parseISO(isoDate)));
}

export function formatMonths(months: number | null): string {
  if (months === null) return 'None recorded';
  if (months === 0) return 'This month';
  return months === 1 ? '1 month' : `${months} months`;
}

/** Segment values from the Referrer Master. Kept as the exact strings the directory filters on. */
export const SEGMENTS = ['Active', 'Lapsing', 'Lapsed', 'No referral recorded'] as const;
