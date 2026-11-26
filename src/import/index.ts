/**
 * Shared import parser. Used by the Import screen (in a Web Worker) and by scripts/build-seed.ts.
 * Pure TypeScript: callers read the workbook and pass rows in.
 */
export * from './types';
export * from './normalise';
export { parseTracker, buildPlan } from './tracker';
export { parseReferrerMaster, type ReferrerMasterResult } from './referrer-master';
export { ReferrerMatcher, parseReferrerText, type ReferrerMatch } from './referrer-match';

/** Sheets the tracker parser reads. Everything else in the workbook is skipped. */
export const TRACKER_SHEET_NAMES = ['JAN', 'FEB', 'MAR', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC', 'HCF-Not to call'] as const;
export const REFERRER_MASTER_SHEET_NAMES = ['Referrer Master', 'Practices', 'Referral Detail'] as const;
