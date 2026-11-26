/// <reference lib="webworker" />
/**
 * Web Worker: reads the uploaded workbook with SheetJS and runs the shared parser.
 * Plain messages only (see parse-client.ts). Nothing is stored here.
 */
import * as XLSX from 'xlsx';
import { parseReferrerMaster, parseTracker, REFERRER_MASTER_SHEET_NAMES, TRACKER_SHEET_NAMES } from '@/import';
import type { CellValue, SheetInput } from '@/import';
import type { ParseOutput, WorkerIn, WorkerOut } from './parse-client';

const scope = self as unknown as { postMessage: (m: WorkerOut) => void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };

const MONTH_TAB = /^(JAN|FEB|MAR|APRIL|MAY|JUNE|JULY|AUG|SEPT|OCT|NOV|DEC)$/i;

scope.onmessage = (event) => {
  const { kind, buffer, context } = event.data;
  try {
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
    const wanted = kind === 'tracker' ? TRACKER_SHEET_NAMES : REFERRER_MASTER_SHEET_NAMES;
    const names = wb.SheetNames.filter((n) => wanted.some((w) => w.toLowerCase() === n.toLowerCase()));

    if (kind === 'tracker' && names.filter((n) => MONTH_TAB.test(n.trim())).length < 3) {
      throw new Error('This does not look like the referral tracker. It needs the month tabs, JAN to DEC.');
    }
    if (kind === 'master' && !names.some((n) => n.toLowerCase() === 'referrer master')) {
      throw new Error('This does not look like the Referrer Master. It needs the Referrer Master tab.');
    }

    const sheets: SheetInput[] = [];
    names.forEach((name, i) => {
      scope.postMessage({ type: 'progress', sheet: name, done: i, total: names.length });
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }) as Array<Array<CellValue | null>>;
      sheets.push({ name, rows: rows.map((r) => r.map((c) => (c === null ? undefined : c))) });
    });
    scope.postMessage({ type: 'progress', sheet: 'Checking rows', done: names.length, total: names.length });

    let output: ParseOutput;
    if (kind === 'tracker') {
      output = { kind: 'tracker', result: parseTracker(sheets, context) };
    } else {
      const r = parseReferrerMaster(sheets, context);
      output = {
        kind: 'master',
        result: {
          referrers: r.referrers,
          practiceCount: r.practices.length,
          historyCount: r.history.length,
          skippedReferrers: r.skippedReferrers,
          historyWithoutReferrer: r.historyWithoutReferrer,
          unmatched: r.unmatched,
          tabs: r.tabs,
        },
      };
    }
    scope.postMessage({ type: 'done', output });
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The file could not be read.' });
  }
};
