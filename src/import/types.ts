/**
 * Types shared by the tracker parser, the Referrer Master parser, the seed script and the Import screen.
 * The parser never touches SheetJS. Callers read the workbook and pass plain rows in.
 */
import type {
  Clinic,
  ClinicAlias,
  ContactChannel,
  ContactOutcome,
  NewReferral,
  Orthodontist,
  OrthoAlias,
  ReferralStatus,
  Staff,
} from '../domain';

/** A cell as read by SheetJS with raw values: numbers are Excel date serials, text is trimmed by the parser. */
export type CellValue = string | number | boolean | Date | null | undefined;

export interface SheetInput {
  name: string;
  /** Row index 0 is the header row. Excel row number = index + 1. */
  rows: CellValue[][];
}

export interface ReferrerIndexEntry {
  id: string;
  firstName: string;
  lastName: string;
  practice: string | null;
}

export interface LookupContext {
  clinics: Clinic[];
  clinicAliases: ClinicAlias[];
  orthodontists: Orthodontist[];
  orthoAliases: OrthoAlias[];
  staff: Staff[];
  referrers: ReferrerIndexEntry[];
}

/** Cadence step a contact belongs to: 0 Coax #1, 1 Day 1 call, 2 Day 14 call, 3 final call. */
export type ContactStep = 0 | 1 | 2 | 3;

export interface ImportContactDraft {
  step: ContactStep;
  channel: ContactChannel;
  outcome: ContactOutcome;
  /** ISO datetime (clinic offset). */
  at: string;
  staffId: string | null;
  notes: string | null;
}

export type UnmatchedKind = 'clinic' | 'ortho' | 'staff' | 'referrer' | 'outcome' | 'status';

export interface UnmatchedCode {
  kind: UnmatchedKind;
  value: string;
  sheet: string;
  rowNumber: number;
}

export type RowLevel = 'ok' | 'warning' | 'error';

/** One source row, after normalisation and duplicate merge. */
export interface ParsedRow {
  sheet: string;
  /** Excel row number (header is row 1). */
  rowNumber: number;
  /** Hash of the raw source row. Stored on the import row so a re-import reports "unchanged". */
  rowHash: string;
  /** Patient key shared by every copy of the same patient. */
  dedupeKey: string;
  /** Merged referral for the patient. Null when the row could not be read (for example no patient name). */
  candidate: NewReferral | null;
  /** Merged cadence step (0 to 4). See the step rule in tracker.ts. */
  currentStep: number;
  /** Merged contact attempts for the patient. */
  contacts: ImportContactDraft[];
  /** Raw status text from this row, before merge, or null when blank. */
  rawStatus: string | null;
  /** Number of source rows merged into this patient, including this one. */
  copies: number;
  /** True for the row that owns the referral (earliest copy). */
  isBase: boolean;
  /** Source rows merged into this patient, as "SHEET row N". Set on every copy. */
  mergedFrom: string[];
  /** Closed reason for booked, do not contact and to call us. Null for open rows. */
  closedAt: string | null;
  level: RowLevel;
  /** Plain-language warnings and errors for this row. */
  messages: string[];
  unmatched: UnmatchedCode[];
}

export interface SheetReport {
  name: string;
  layout: 'jan_may' | 'jun_dec' | 'hcf' | 'skipped';
  /** Non-blank data rows read from the sheet. */
  dataRows: number;
  /** Rows with no usable patient name. */
  errorRows: number;
}

export interface TrackerParseResult {
  sheets: SheetReport[];
  rows: ParsedRow[];
  /** Distinct patients after merge. */
  patients: number;
  /** Source rows that were merged into an earlier copy. */
  mergedCopies: number;
  unmatched: UnmatchedCode[];
  /** Ortho aliases used that are not yet confirmed. Counted, not listed per row. */
  unconfirmedOrthoUses: number;
}

export type { ReferralStatus };
