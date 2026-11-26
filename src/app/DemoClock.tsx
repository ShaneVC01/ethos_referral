import { useState } from 'react';
import { format } from 'date-fns';
import { enAU } from 'date-fns/locale';
import { demoClock } from '@/data';
import { useDemoNow } from '@/data/hooks';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/overlays';
import { ICONS } from '@/components/ui/icons';

/**
 * Manager-only demo control. Advances "today" so Day 1, Day 14 and 3 month queues fill without waiting.
 * It only changes the mock clock. Production uses real time.
 */
export function DemoClock() {
  const now = useDemoNow();
  const [open, setOpen] = useState(false);
  const label = format(now, 'EEE d MMM yyyy', { locale: enAU });
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      trigger={
        <button
          type="button"
          aria-label={`Demo clock, today is ${label}. Open demo clock controls.`}
          className="inline-flex h-9 items-center gap-2 rounded-control border border-dashed border-line-strong bg-surface px-3 text-sm text-ink-muted hover:border-ink-muted"
        >
          <ICONS.clock size={16} strokeWidth={1.5} aria-hidden="true" />
          <span className="tabular">Demo: {label}</span>
        </button>
      }
    >
      <div className="flex w-64 flex-col gap-3 p-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-base font-medium text-ink">Demo clock</p>
          <p className="text-sm text-ink-muted">Moves the queues forward. Only for demonstrations.</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => demoClock.advanceDays(1)}>
            +1 day
          </Button>
          <Button variant="secondary" size="sm" onClick={() => demoClock.advanceDays(14)}>
            +14 days
          </Button>
          <Button variant="secondary" size="sm" onClick={() => demoClock.advanceDays(91)}>
            +3 months
          </Button>
          <Button variant="ghost" size="sm" onClick={() => demoClock.reset()}>
            Reset
          </Button>
        </div>
      </div>
    </Popover>
  );
}
