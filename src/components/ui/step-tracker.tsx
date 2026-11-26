import { cn } from '@/lib/utils';
import { TRACKER_STAGE_LABELS } from '@/domain';
import { ICONS } from './icons';

export interface StepTrackerProps {
  /** Index from trackerStageIndex(): 0 Received, 1 Coax #1, 2 Day 1, 3 Day 14, 4 3 months, 5 Closed. */
  stageIndex: number;
  /** Closed referrals show every stage done and the last stage as Closed. */
  closed?: boolean;
  className?: string;
}

/**
 * Cadence progress. Each stage shows an icon and a label, so state is never colour alone.
 * Done = check, current = filled dot with aria-current, upcoming = empty circle.
 */
export function StepTracker({ stageIndex, closed = false, className }: StepTrackerProps) {
  return (
    <ol aria-label="Referral progress" className={cn('flex w-full min-w-0 items-start overflow-x-auto', className)}>
      {TRACKER_STAGE_LABELS.map((label, i) => {
        const isClosedStage = i === TRACKER_STAGE_LABELS.length - 1;
        const done = closed ? i < TRACKER_STAGE_LABELS.length - 1 : i < stageIndex;
        const current = !closed && i === stageIndex;
        const state = isClosedStage && closed ? 'closed' : done ? 'done' : current ? 'current' : 'upcoming';
        const stateLabel = state === 'done' ? 'done' : state === 'current' ? 'current' : state === 'closed' ? 'closed' : 'not started';
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="flex min-w-16 flex-1 flex-col items-center gap-1.5 text-center"
          >
            <div className="relative flex w-full items-center">
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn('absolute right-1/2 top-1/2 h-px w-full -translate-y-1/2', done || current ? 'bg-accent' : 'bg-line')}
                />
              ) : null}
              <span
                className={cn(
                  'relative mx-auto flex size-6 items-center justify-center rounded-pill border bg-surface',
                  done && 'border-accent bg-accent text-accent-fg',
                  current && 'border-accent text-accent ring-4 ring-accent-subtle',
                  state === 'upcoming' && 'border-line-strong text-ink-subtle',
                  state === 'closed' && 'border-ink-muted bg-neutral-bg text-ink-muted',
                )}
              >
                {done ? (
                  <ICONS.check_small size={16} strokeWidth={1.5} aria-hidden="true" />
                ) : state === 'closed' ? (
                  <ICONS.x size={16} strokeWidth={1.5} aria-hidden="true" />
                ) : current ? (
                  <span className="size-2 rounded-pill bg-accent" aria-hidden="true" />
                ) : (
                  <span className="size-2 rounded-pill bg-line-strong" aria-hidden="true" />
                )}
              </span>
            </div>
            <span className={cn('text-sm', current ? 'font-semibold text-ink' : 'text-ink-muted')}>
              {label}
              <span className="sr-only">, {stateLabel}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
