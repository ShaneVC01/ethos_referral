import { useRef, useState, type DragEvent } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { RadioGroup } from '@/components/ui/forms';
import { Panel } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useAuth } from '@/app/auth';
import { data } from '@/data';
import { useCommitImport, useStageImport } from '@/data/hooks';
import type { ImportBatch } from '@/domain';
import type { StageImportRow } from '@/data/repository';
import type { LookupContext } from '@/import';
import { BatchHistory } from './BatchHistory';
import { MasterReview, TrackerReview, count } from './ImportReview';
import { parseInWorker, type ParseKind, type ParseOutput, type ParseProgress } from './parse-client';

type Phase =
  | { name: 'idle' }
  | { name: 'parsing'; fileName: string; size: number; progress: ParseProgress | null }
  | { name: 'error'; fileName: string; message: string }
  | { name: 'preview'; fileName: string; output: ParseOutput; batch: ImportBatch | null; staging: boolean; existingIds: Set<string> | null }
  | { name: 'committed'; fileName: string; batch: ImportBatch };

const LARGE_FILE_BYTES = 2 * 1024 * 1024;

const KIND_OPTIONS = [
  { value: 'tracker', label: 'Referral tracker', description: '2026 Dentist referrals.xlsx. Month tabs, plus HCF.' },
  { value: 'master', label: 'Referrer master', description: 'Ethos_Referrer_Master. Referrers, practices and Edge history.' },
] as const;

/**
 * Lookups for the parser. Referrers are NOT sent: the server holds the full list (a page cannot be matched against),
 * so referrer names are matched afterwards by matchReferrers.
 */
async function buildContext(): Promise<LookupContext> {
  const [lookups, staff] = await Promise.all([data.lookups.get(), data.staff.list()]);
  return {
    clinics: lookups.clinics,
    clinicAliases: lookups.clinicAliases,
    orthodontists: lookups.orthodontists,
    orthoAliases: lookups.orthoAliases,
    staff,
    referrers: [],
  };
}

/**
 * Resolves referrer names the parser could not match, against the whole Referrer Master on the server.
 * Patches the parsed rows and removes the matched codes from the "Codes to review" list.
 */
async function matchReferrers(output: Extract<ParseOutput, { kind: 'tracker' }>): Promise<void> {
  const names = [...new Set(output.result.unmatched.filter((u) => u.kind === 'referrer').map((u) => u.value))];
  if (names.length === 0) return;
  const matches = await data.referrers.matchNames(names);
  for (const row of output.result.rows) {
    const candidate = row.candidate;
    if (!candidate?.referrerText) continue;
    const id = matches[candidate.referrerText.name];
    if (id) {
      candidate.referrerId = id;
      candidate.referrerText = null;
    }
  }
  output.result.unmatched = output.result.unmatched.filter((u) => !(u.kind === 'referrer' && matches[u.value]));
}

/** Maps parsed rows to the staging shape. Every source row is kept, so re-importing the file reports "unchanged". */
function toStageRows(output: Extract<ParseOutput, { kind: 'tracker' }>): StageImportRow[] {
  return output.result.rows.map((r) => ({
    sheet: r.sheet,
    rowNumber: r.rowNumber,
    rowHash: r.rowHash,
    dedupeKey: r.dedupeKey || `${r.sheet}|${r.rowNumber}`,
    candidate: r.candidate,
    message: r.messages.length ? r.messages.join(' ') : null,
    currentStep: r.candidate ? r.currentStep : undefined,
    contacts: r.candidate ? r.contacts : undefined,
  }));
}

export function ImportPage() {
  const { user } = useAuth();
  const actorId = user?.id ?? '';
  const [kind, setKind] = useState<ParseKind>('tracker');
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stage = useStageImport();
  const commit = useCommitImport();

  const handleFile = async (file: File) => {
    const fileName = file.name;
    if (!/\.xlsx$/i.test(fileName)) {
      setPhase({ name: 'error', fileName, message: 'Choose an .xlsx file. Other formats cannot be read.' });
      return;
    }
    setPhase({ name: 'parsing', fileName, size: file.size, progress: null });
    try {
      const context = await buildContext();
      const output = await parseInWorker(kind, file, context, (progress) => setPhase((p) => (p.name === 'parsing' ? { ...p, progress } : p)));
      if (output.kind === 'master') {
        const existing = await data.referrers.existingIds(output.result.referrers.map((r) => r.id));
        setPhase({ name: 'preview', fileName, output, batch: null, staging: false, existingIds: new Set(existing) });
        return;
      }
      await matchReferrers(output);
      setPhase({ name: 'preview', fileName, output, batch: null, staging: true, existingIds: null });
      const batch = await stage.mutateAsync({ fileName, rows: toStageRows(output), actorId });
      setPhase({ name: 'preview', fileName, output, batch, staging: false, existingIds: null });
    } catch (error) {
      setPhase({ name: 'error', fileName, message: error instanceof Error ? error.message : 'The import could not be prepared. Try again.' });
    }
  };

  const onCommit = async () => {
    if (phase.name !== 'preview' || !phase.batch) return;
    try {
      const batch = await commit.mutateAsync({ batchId: phase.batch.id, actorId });
      notifySuccess('Import committed');
      setPhase({ name: 'committed', fileName: phase.fileName, batch });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The import could not be committed. Nothing was saved. Try again.');
    }
  };

  const reset = () => setPhase({ name: 'idle' });

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <>
      <PageHeader title="Import" description="Load referral tracker files. Preview before anything is saved." />

      {phase.name === 'idle' || phase.name === 'error' ? (
        <Panel title="Choose a file" description="Each row is checked before anything is saved. Nothing changes until you commit.">
          <RadioGroup label="File type" value={kind} onValueChange={(v) => setKind(v as ParseKind)} options={KIND_OPTIONS.map((o) => ({ ...o }))} />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-4 flex flex-col items-start gap-3 rounded-[var(--radius-panel)] border border-dashed p-5 ${dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]' : 'border-[var(--color-line-strong)]'}`}
          >
            <p className="text-sm">Drop the .xlsx file here, or choose it from your computer.</p>
            <Button variant="secondary" icon="upload" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="sr-only"
              aria-label="Choose an .xlsx file"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleFile(file);
              }}
            />
          </div>
          {phase.name === 'error' ? (
            <div role="alert" className="mt-4 rounded-[var(--radius-panel)] border border-[var(--color-danger)] p-4">
              <p className="text-sm font-medium">The file could not be imported.</p>
              <p className="mt-1 text-sm">
                {phase.fileName}: {phase.message}
              </p>
              <Button className="mt-3" variant="secondary" size="sm" onClick={reset}>
                Choose another file
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {phase.name === 'parsing' ? (
        <Panel title="Reading file" description={`${phase.fileName}${phase.size > LARGE_FILE_BYTES ? '. This is a large file, so it can take 10 to 20 seconds.' : ''}`}>
          <div role="progressbar" aria-label="Reading file" aria-valuemin={0} aria-valuemax={phase.progress?.total ?? 1} aria-valuenow={phase.progress?.done ?? 0} className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-line-subtle)]">
            <div className="h-full bg-[var(--color-accent)] transition-[width] duration-200 ease-out" style={{ width: `${phase.progress ? Math.round((phase.progress.done / Math.max(phase.progress.total, 1)) * 100) : 0}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]" aria-live="polite">
            {phase.progress ? `Reading ${phase.progress.sheet} (${phase.progress.done + 1} of ${phase.progress.total})` : 'Opening the workbook'}
          </p>
        </Panel>
      ) : null}

      {phase.name === 'preview' && phase.output.kind === 'tracker' ? (
        <TrackerReview
          fileName={phase.fileName}
          output={phase.output}
          batch={phase.batch}
          staging={phase.staging}
          committing={commit.isPending}
          onCommit={onCommit}
          onDiscard={reset}
        />
      ) : null}

      {phase.name === 'preview' && phase.output.kind === 'master' ? (
        <MasterReview summary={phase.output.result} existingIds={phase.existingIds} onDiscard={reset} />
      ) : null}

      {phase.name === 'committed' ? (
        <Panel title="Import committed" description={phase.fileName}>
          <p className="text-sm tabular-nums">
            {count(phase.batch.counts.new)} new referrals and {count(phase.batch.counts.updated)} updated. {count(phase.batch.counts.unchanged)} rows were already imported. {count(phase.batch.counts.error)} rows were not imported.
          </p>
          <Button className="mt-4" variant="secondary" onClick={reset}>
            Import another file
          </Button>
        </Panel>
      ) : null}

      <BatchHistory />
    </>
  );
}
