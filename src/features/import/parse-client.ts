/**
 * Runs the shared import parser in a Web Worker, so a 4,000-row tracker does not freeze the screen.
 * The worker reads the workbook with SheetJS and sends back plain results.
 */
import type { Referrer, ReferrerHistory } from '@/domain';
import type { LookupContext, TrackerParseResult, UnmatchedCode } from '@/import';

export type ParseKind = 'tracker' | 'master';

export interface MasterSummary {
  referrers: Referrer[];
  practiceCount: number;
  historyCount: number;
  skippedReferrers: number;
  historyWithoutReferrer: number;
  unmatched: UnmatchedCode[];
  tabs: Array<{ name: string; rows: number }>;
}

export type ParseOutput = { kind: 'tracker'; result: TrackerParseResult } | { kind: 'master'; result: MasterSummary };

export interface ParseProgress {
  sheet: string;
  done: number;
  total: number;
}

export interface WorkerIn {
  kind: ParseKind;
  buffer: ArrayBuffer;
  context: LookupContext;
}

export type WorkerOut =
  | { type: 'progress'; sheet: string; done: number; total: number }
  | { type: 'done'; output: ParseOutput }
  | { type: 'error'; message: string };

/** Parses a workbook in a worker. `onProgress` fires per tab as it is read. */
export function parseInWorker(kind: ParseKind, file: File, context: LookupContext, onProgress: (p: ParseProgress) => void): Promise<ParseOutput> {
  return new Promise<ParseOutput>((resolve, reject) => {
    const worker = new Worker(new URL('./import-worker.ts', import.meta.url), { type: 'module' });
    const finish = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const msg = event.data;
      if (msg.type === 'progress') onProgress({ sheet: msg.sheet, done: msg.done, total: msg.total });
      else if (msg.type === 'done') {
        finish();
        resolve(msg.output);
      } else {
        finish();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      finish();
      reject(new Error('This file could not be read. Check that it is an .xlsx file and try again.'));
    };
    file
      .arrayBuffer()
      .then((buffer) => {
        const message: WorkerIn = { kind, buffer, context };
        worker.postMessage(message, [buffer]);
      })
      .catch(() => {
        finish();
        reject(new Error('The file could not be opened. Try choosing it again.'));
      });
  });
}

/** Referrer history is not needed for the preview. Kept here so the type stays with the summary. */
export type HistoryRow = ReferrerHistory;
