import { useState } from 'react';
import { Badge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlays';
import { EmptyState, Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useAuth } from '@/app/auth';
import { useImportBatches, useRollbackImport } from '@/data/hooks';
import { formatDateTime, type ImportBatch } from '@/domain';
import { count } from './ImportReview';

/** The initial tracker load is the base data, so it is not rolled back from the screen. */
export const SEED_BATCH_ID = 'imp_seed_2026_tracker';

export function BatchHistory() {
  const { user } = useAuth();
  const batches = useImportBatches();
  const rollback = useRollbackImport();
  const [target, setTarget] = useState<ImportBatch | null>(null);

  const confirmRollback = async () => {
    if (!target || !user) return;
    try {
      await rollback.mutateAsync({ batchId: target.id, actorId: user.id });
      notifySuccess('Import rolled back');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The import could not be rolled back. Try again.');
    } finally {
      setTarget(null);
    }
  };

  return (
    <Panel title="Import history" description="Committed imports. Rolling back removes the referrals an import created. Edge is not changed.">
      {batches.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : !batches.data || batches.data.length === 0 ? (
        <EmptyState icon="upload" title="No imports yet" description="Committed imports appear here, with rollback." />
      ) : (
        <ul className="divide-y divide-[var(--color-line-subtle)]">
          {batches.data.map((b) => {
            const canRollback = b.status === 'committed' && b.id !== SEED_BATCH_ID;
            return (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.fileName}</p>
                  <p className="text-xs text-[var(--color-ink-muted)] tabular-nums">
                    {formatDateTime(b.committedAt ?? b.createdAt)}. {count(b.counts.new)} new, {count(b.counts.updated)} updated, {count(b.counts.error)} errors.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {b.status === 'rolled_back' ? (
                    <Badge tone="neutral" icon="x">
                      Rolled back
                    </Badge>
                  ) : b.status === 'committed' ? (
                    <Badge tone="success" icon="check">
                      Committed
                    </Badge>
                  ) : (
                    <Badge tone="info" icon="dot">
                      Staged
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="refresh"
                    disabled={!canRollback}
                    title={b.id === SEED_BATCH_ID ? 'The initial load is not rolled back from this screen.' : undefined}
                    onClick={() => setTarget(b)}
                  >
                    Roll back
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title="Roll back this import?"
        description="Referrals this import created are removed. Referrals it updated keep their new details. Edge is not changed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={rollback.isPending} onClick={confirmRollback}>
              Roll back import
            </Button>
          </>
        }
      >
        <p className="text-sm">{target?.fileName}</p>
      </Dialog>
    </Panel>
  );
}
