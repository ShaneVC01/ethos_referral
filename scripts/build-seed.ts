/**
 * Builds the local seed from the real tracker and Referrer Master workbooks.
 *
 *   npm run seed
 *   npm run seed -- --tracker "<path to 2026 Dentist referrals.xlsx>" --master "<path to Referrer Master.xlsx>" --out seed
 *
 * Writes gitignored JSON files to seed/ in the shape src/data/mock/seed.ts loads, and prints a reconciliation
 * report. Output is deterministic: running it twice gives byte-identical files and the same report.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { DEFAULT_CADENCE, formatReference, isOpenStatus, stepDueAt } from '../src/domain';
import type { NewReferral, Referral, ContactAttempt, ImportBatch, ImportRow } from '../src/domain';
import { DEFAULT_LOOKUPS } from '../src/data/mock/lookups';
import {
  hashString,
  parseReferrerMaster,
  parseTracker,
  REFERRER_MASTER_SHEET_NAMES,
  TRACKER_SHEET_NAMES,
  type ImportContactDraft,
  type LookupContext,
  type ParsedRow,
  type SheetInput,
} from '../src/import';

const DEFAULT_DIR = join(homedir(), 'Trusenta', 'Management - Documents', '05 Deals', 'Ethos', 'Referral System', 'client provided');
const TRACKER_FILE = '2026 Dentist referrals.xlsx';
const MASTER_FILE = 'Ethos_Referrer_Master_20261113 (to Trusenta).xlsx';
const TOTALS_TAB = 'Totals';
const BATCH_ID = 'imp_seed_2026_tracker';
const SEED_TIME = '2026-11-13T00:00:00+10:00';
const SEED_DIR = fileURLToPath(new URL('../seed', import.meta.url));

interface Args {
  tracker: string;
  master: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    tracker: resolve(get('--tracker') ?? join(DEFAULT_DIR, TRACKER_FILE)),
    master: resolve(get('--master') ?? join(DEFAULT_DIR, MASTER_FILE)),
    out: resolve(get('--out') ?? SEED_DIR),
  };
}

function readSheets(path: string, names?: readonly string[]): SheetInput[] {
  // Read the bytes ourselves: SheetJS's ESM build cannot open paths under Node on Windows.
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false, cellNF: false, cellText: false });
  const wanted = names ? wb.SheetNames.filter((n) => names.some((x) => x.toLowerCase() === n.toLowerCase())) : wb.SheetNames;
  return wanted.map((name) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Array<Array<string | number | boolean | Date | null>>;
    return { name, rows: rows.map((r) => r.map((c) => (c === null ? undefined : c))) };
  });
}

/** Compact JSON. Key order follows the object literals, so repeated runs write identical bytes. */
function stableJson(value: unknown): string {
  return JSON.stringify(value) + '\n';
}

function writeSeed(dir: string, name: string, value: unknown, files: Record<string, string>): void {
  const text = stableJson(value);
  files[name] = text;
  writeFileSync(join(dir, `${name}.json`), text);
}

/* ---------- report helpers ---------- */

function pad(s: string | number, n: number, right = false): string {
  const t = String(s);
  return right ? t.padStart(n) : t.padEnd(n);
}

function tally(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Totals tab rows for months: Booked, To call us, DNC, Blank, total. */
function readTotals(sheets: SheetInput[]): Map<string, { booked: number; toCall: number; dnc: number; blank: number; total: number }> {
  const out = new Map<string, { booked: number; toCall: number; dnc: number; blank: number; total: number }>();
  const tab = sheets.find((s) => s.name === TOTALS_TAB);
  if (!tab) return out;
  for (const row of tab.rows) {
    const label = String(row[0] ?? '').trim().toLowerCase();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const key = months.find((m) => label.startsWith(m));
    if (!key) continue;
    const n = (i: number) => Number(row[i] ?? 0) || 0;
    out.set(key, { booked: n(1), toCall: n(2), dnc: n(3), blank: n(4), total: n(5) });
  }
  return out;
}

function classify(raw: string | null): 'booked' | 'toCall' | 'dnc' | 'blank' | 'other' {
  if (raw === null) return 'blank';
  const t = raw.trim().toLowerCase();
  if (t === 'booked') return 'booked';
  if (t === 'to call us') return 'toCall';
  if (t === 'dnc') return 'dnc';
  if (!/[a-z]/.test(t)) return 'blank';
  return 'other';
}

/* ---------- build ---------- */

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.out, { recursive: true });


  const masterSheets = readSheets(args.master, REFERRER_MASTER_SHEET_NAMES);
  const trackerSheets = readSheets(args.tracker);
  const totals = readTotals(trackerSheets);

  // Referrers first: the tracker matches free-text referrer names against them.
  const masterParsed = parseReferrerMaster(masterSheets, { ...DEFAULT_LOOKUPS, referrers: [] });
  const ctx: LookupContext = {
    clinics: DEFAULT_LOOKUPS.clinics,
    clinicAliases: DEFAULT_LOOKUPS.clinicAliases,
    orthodontists: DEFAULT_LOOKUPS.orthodontists,
    orthoAliases: DEFAULT_LOOKUPS.orthoAliases,
    staff: DEFAULT_LOOKUPS.staff,
    referrers: masterParsed.referrers.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, practice: null })),
  };
  const tracker = parseTracker(trackerSheets.filter((s) => TRACKER_SHEET_NAMES.some((n) => n.toLowerCase() === s.name.toLowerCase())), ctx);

  // Referrals: one per patient, from the base copy of each group.
  const referrals: Referral[] = [];
  const contacts: ContactAttempt[] = [];
  const referralIdByKey = new Map<string, string>();
  const baseRows = tracker.rows.filter((r) => r.candidate && r.isBase);
  for (const row of baseRows) {
    const cand = row.candidate as NewReferral;
    const id = `ref_${hashString(row.dedupeKey)}`;
    referralIdByKey.set(row.dedupeKey, id);
    const status = cand.status ?? 'contacting';
    const closedReason = status === 'booked' ? 'booked' : status === 'do_not_contact' ? 'do_not_contact' : null;
    const closedAt = closedReason ? row.closedAt : null;
    const seedRef: Omit<Referral, 'referenceNumber'> = {
      id,
      receivedAt: cand.receivedAt,
      source: cand.source,
      submissionType: cand.submissionType,
      patientFirstName: cand.patientFirstName,
      patientLastName: cand.patientLastName,
      dob: cand.dob,
      ageGroup: cand.ageGroup,
      ageGroupOverridden: cand.ageGroup !== null,
      phone: cand.phone,
      contactPerson: cand.contactPerson,
      email: cand.email,
      address: cand.address,
      preferredClinicId: cand.preferredClinicId,
      preferredClinicIsNearest: cand.preferredClinicIsNearest,
      preferredOrthodontistId: cand.preferredOrthodontistId,
      preferredOrthodontistIsNextAvailable: cand.preferredOrthodontistIsNextAvailable,
      referrerId: cand.referrerId,
      referrerText: cand.referrerText,
      comments: cand.comments,
      flags: cand.flags,
      edgePatientId: null,
      bookedAt: status === 'booked' ? row.closedAt : null,
      status,
      currentStep: row.currentStep,
      nextActionAt: null,
      assignedTo: null,
      refReturnedAt: null,
      closedReason,
      closedAt,
      dedupeKey: row.dedupeKey,
      importRef: { batchId: BATCH_ID, sheet: row.sheet, row: row.rowNumber },
      createdAt: cand.receivedAt,
      createdBy: null,
      updatedAt: cand.receivedAt,
    };
    const open = isOpenStatus(status) && !closedReason;
    if (open && seedRef.currentStep < 4) {
      seedRef.nextActionAt = stepDueAt(cand.receivedAt, DEFAULT_CADENCE, seedRef.currentStep).toISOString();
    }
    referrals.push(seedRef as Referral);
    for (const c of row.contacts) contacts.push(contactRecord(id, c));
  }

  // Reference numbers: per year, in receipt order, so they are stable across runs.
  const ordered = [...referrals].sort((a, b) => (a.receivedAt === b.receivedAt ? (a.dedupeKey < b.dedupeKey ? -1 : 1) : a.receivedAt < b.receivedAt ? -1 : 1));
  const seqByYear = new Map<number, number>();
  for (const r of ordered) {
    const year = Number(r.receivedAt.slice(0, 4));
    const seq = (seqByYear.get(year) ?? 0) + 1;
    seqByYear.set(year, seq);
    r.referenceNumber = formatReference(year, seq);
  }
  referrals.sort((a, b) => (a.id < b.id ? -1 : 1));
  contacts.sort((a, b) => (a.id < b.id ? -1 : 1));

  // Import batch and rows, so a re-import of the same file reports "unchanged".
  const importRows: ImportRow[] = tracker.rows.map((r: ParsedRow) => ({
    id: `imr_${hashString(`${r.sheet}|${r.rowNumber}`)}`,
    batchId: BATCH_ID,
    sheet: r.sheet,
    rowNumber: r.rowNumber,
    rowHash: r.rowHash,
    dedupeKey: r.dedupeKey,
    result: !r.candidate ? 'error' : r.isBase ? 'new' : 'updated',
    message: r.messages.length ? r.messages.join(' ') : null,
    referralId: r.candidate ? referralIdByKey.get(r.dedupeKey) ?? null : null,
    candidate: null,
  }));
  const errorCount = tracker.rows.filter((r) => !r.candidate).length;
  const batch: ImportBatch = {
    id: BATCH_ID,
    fileName: `${basename(args.tracker)} (seed)`,
    status: 'committed',
    createdAt: SEED_TIME,
    createdBy: null,
    committedAt: SEED_TIME,
    rolledBackAt: null,
    counts: {
      new: referrals.length,
      unchanged: 0,
      updated: tracker.mergedCopies,
      conflict: 0,
      error: errorCount,
    },
  };

  // Referrer history: only rows with a Referrer ID. Names are never written.
  const practices = masterParsed.practices;
  const referrers = masterParsed.referrers.map((r) => ({ ...r, practiceId: r.practiceId }));

  const files: Record<string, string> = {};
  writeSeed(args.out, 'referrals', referrals, files);
  writeSeed(args.out, 'contact_attempts', contacts, files);
  writeSeed(args.out, 'import_batches', [batch], files);
  writeSeed(args.out, 'import_rows', importRows, files);
  writeSeed(args.out, 'referrers', referrers, files);
  writeSeed(args.out, 'practices', practices, files);
  writeSeed(args.out, 'referrer_history', masterParsed.history, files);

  printReport({ args, tracker, totals, masterParsed, referrals, contacts, files });
}

function contactRecord(referralId: string, c: ImportContactDraft): ContactAttempt {
  return {
    id: `ca_${hashString(`${referralId}|${c.step}|${c.outcome}|${c.at}|${c.staffId ?? ''}|${c.notes ?? ''}`)}`,
    referralId,
    step: c.step,
    channel: c.channel,
    outcome: c.outcome,
    staffId: c.staffId,
    at: c.at,
    notes: c.notes,
    smsMessageId: null,
  };
}

interface ReportInput {
  args: Args;
  tracker: ReturnType<typeof parseTracker>;
  totals: ReturnType<typeof readTotals>;
  masterParsed: ReturnType<typeof parseReferrerMaster>;
  referrals: Referral[];
  contacts: ContactAttempt[];
  files: Record<string, string>;
}

function printReport(input: ReportInput): void {
  const { tracker, totals, masterParsed, referrals, contacts, files, args } = input;
  const line = (s = '') => console.log(s);
  const hash = createHash('sha256');
  for (const k of Object.keys(files).sort()) hash.update(k).update(files[k]);

  line('SEED REPORT');
  line(`Tracker: ${basename(args.tracker)}`);
  line(`Referrer Master: ${basename(args.master)}`);
  line('');

  line('1. Rows read per sheet');
  line(`   ${pad('sheet', 16)}${pad('layout', 10)}${pad('data rows', 12, true)}${pad('no name', 10, true)}`);
  for (const s of tracker.sheets) line(`   ${pad(s.name, 16)}${pad(s.layout, 10)}${pad(s.dataRows, 12, true)}${pad(s.errorRows, 10, true)}`);
  const totalRows = tracker.sheets.reduce((n, s) => n + s.dataRows, 0);
  line(`   Total source rows: ${totalRows}`);
  line('');

  line('2. Patients and duplicates');
  line(`   Distinct patients (referrals written): ${referrals.length}`);
  line(`   Source rows merged into an earlier copy: ${tracker.mergedCopies}`);
  line(`   Rows not imported (no patient name): ${tracker.rows.filter((r) => !r.candidate).length}`);
  line(`   Contact attempts written: ${contacts.length}`);
  line('');

  line('3. Status per month: tracker tabs against the Totals tab');
  line(`   ${pad('month', 7)}${pad('tab rows', 10, true)}${pad('Totals', 8, true)}${pad('Booked', 8, true)}${pad('(tab)', 7, true)}${pad('To call', 9, true)}${pad('(tab)', 7, true)}${pad('DNC', 6, true)}${pad('(tab)', 7, true)}${pad('Blank', 7, true)}${pad('(tab)', 7, true)}${pad('copies', 8, true)}`);
  const monthNames = ['JAN', 'FEB', 'MAR', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];
  const totalsKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const sum = { rows: 0, booked: 0, toCall: 0, dnc: 0, blank: 0, copies: 0, totalsTotal: 0, totalsBooked: 0, totalsToCall: 0, totalsDnc: 0, totalsBlank: 0 };
  monthNames.forEach((m, i) => {
    const rows = tracker.rows.filter((r) => r.sheet.toUpperCase() === m);
    const counts = { booked: 0, toCall: 0, dnc: 0, blank: 0, other: 0 };
    for (const r of rows) counts[classify(r.rawStatus)]++;
    const copies = rows.filter((r) => r.candidate && !r.isBase).length;
    const t = totals.get(totalsKeys[i]);
    line(
      `   ${pad(m.slice(0, 3), 7)}${pad(rows.length, 10, true)}${pad(t?.total ?? '-', 8, true)}${pad(t?.booked ?? '-', 8, true)}${pad(counts.booked, 7, true)}${pad(t?.toCall ?? '-', 9, true)}${pad(counts.toCall, 7, true)}${pad(t?.dnc ?? '-', 6, true)}${pad(counts.dnc, 7, true)}${pad(t?.blank ?? '-', 7, true)}${pad(counts.blank, 7, true)}${pad(copies, 8, true)}`,
    );
    if (t) {
      sum.totalsTotal += t.total;
      sum.totalsBooked += t.booked;
      sum.totalsToCall += t.toCall;
      sum.totalsDnc += t.dnc;
      sum.totalsBlank += t.blank;
    }
    sum.rows += rows.length;
    sum.booked += counts.booked;
    sum.toCall += counts.toCall;
    sum.dnc += counts.dnc;
    sum.blank += counts.blank;
    sum.copies += copies;
  });
  line(
    `   ${pad('Total', 7)}${pad(sum.rows, 10, true)}${pad(sum.totalsTotal, 8, true)}${pad(sum.totalsBooked, 8, true)}${pad(sum.booked, 7, true)}${pad(sum.totalsToCall, 9, true)}${pad(sum.toCall, 7, true)}${pad(sum.totalsDnc, 6, true)}${pad(sum.dnc, 7, true)}${pad(sum.totalsBlank, 7, true)}${pad(sum.blank, 7, true)}${pad(sum.copies, 8, true)}`,
  );
  line('   Tab rows: non-blank rows on each tab. "(tab)" counts come from the Status column as read.');
  line('   Copies: rows that repeat a patient already imported from an earlier tab, so they add no referral.');
  line('   Totals are the Totals tab values. Copies explain most of the gap. Other differences are listed below.');
  line('');

  line('4. Referrer matching');
  const rowsWithReferrer = referrals.filter((r) => r.referrerId || r.referrerText);
  const matched = referrals.filter((r) => r.referrerId).length;
  line(`   Referrals with a referrer: ${rowsWithReferrer.length}. Matched to Referrer Master: ${matched}. Free text kept: ${rowsWithReferrer.length - matched}.`);
  line('');

  line('5. Unmatched codes and values (count, then value)');
  const groups = new Map<string, number>();
  for (const u of tracker.unmatched) tally(groups, `${u.kind}: ${u.value}`);
  for (const u of masterParsed.unmatched) tally(groups, `${u.kind}: ${u.value}`);
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) line('   None.');
  for (const [k, n] of sorted.slice(0, 40)) line(`   ${pad(n, 6, true)}  ${k}`);
  if (sorted.length > 40) line(`   ... ${sorted.length - 40} more kinds`);
  line(`   Unconfirmed ortho aliases used (counted, not listed): ${tracker.unconfirmedOrthoUses}`);
  line('');

  line('6. Row messages (count by message type)');
  const msgTally = new Map<string, number>();
  for (const r of tracker.rows) for (const m of r.messages) tally(msgTally, m.replace(/"[^"]*"/g, '"..."').replace(/\d{4}-\d{2}-\d{2}/g, 'DATE').replace(/row \d+/g, 'row N'));
  for (const [m, n] of [...msgTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) line(`   ${pad(n, 6, true)}  ${m}`);
  line('');

  line('7. Referrer Master');
  for (const t of masterParsed.tabs) line(`   ${pad(t.name, 20)} ${t.rows} rows`);
  line(`   Referrers written: ${masterParsed.referrers.length}. Skipped (no valid Referrer ID or duplicate): ${masterParsed.skippedReferrers}`);
  line(`   Practices written: ${masterParsed.practices.length}`);
  line(`   Referral history rows written: ${masterParsed.history.length}. Without a Referrer ID (not imported): ${masterParsed.historyWithoutReferrer}`);
  line('   Other Sources and Patient Referrers are not imported: no data model yet.');
  line('');

  line('8. Output');
  for (const k of Object.keys(files).sort()) line(`   ${pad(k + '.json', 24)}${pad(Math.round(files[k].length / 1024) + ' KB', 10, true)}`);
  line(`   Content hash: ${hash.digest('hex').slice(0, 16)}`);
}

main();
