import { useState } from 'react';
import { addMonths, differenceInCalendarDays, format } from 'date-fns';
import { enAU } from 'date-fns/locale';
import { demoClock } from '@/data';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/forms';
import { Dialog } from '@/components/ui/overlays';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useDemoNow, useSettings, useUpdateSettings } from '@/data/hooks';
import { useAuth } from '@/app/auth';

/**
 * Demo tools. These only move the mock clock or reset the in-memory data.
 * Production uses real time, so the Supabase adapter will hide this tab.
 */
export function DemoTab() {
  const settings = useSettings();
  if (!settings.data) return <Skeleton className="h-64 w-full" />;
  return <DemoPanel enabled={settings.data.demoClockEnabled} />;
}

function DemoPanel({ enabled }: { enabled: boolean }) {
  const now = useDemoNow();
  const { user } = useAuth();
  const update = useUpdateSettings();
  const [resetOpen, setResetOpen] = useState(false);
  const shown = format(now, 'EEEE d MMMM yyyy', { locale: enAU });
  const threeMonthDays = differenceInCalendarDays(addMonths(now, 3), now);

  const toggle = async (next: boolean) => {
    if (!user) return;
    try {
      await update.mutateAsync({ patch: { demoClockEnabled: next }, actorId: user.id });
      notifySuccess(next ? 'Demo clock is on.' : 'Demo clock is off. Queues use real time.');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The demo clock setting could not be saved.');
    }
  };

  return (
    <div className="space-y-6">
      <Panel title="Demo clock" description="Moves the queues forward so Day 1, Day 14 and 3 month work appears without waiting.">
        <div className="flex flex-col gap-5">
          <p className="text-base text-ink">
            Today in the app is <span className="font-semibold tabular-nums">{shown}</span>
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Advance the demo clock">
            <Button variant="secondary" disabled={!enabled} onClick={() => demoClock.advanceDays(1)}>
              Advance 1 day
            </Button>
            <Button variant="secondary" disabled={!enabled} onClick={() => demoClock.advanceDays(14)}>
              Advance 14 days
            </Button>
            <Button variant="secondary" disabled={!enabled} onClick={() => demoClock.advanceDays(threeMonthDays)}>
              Advance 3 months
            </Button>
            <Button variant="ghost" disabled={!enabled} onClick={() => demoClock.reset()}>
              Reset to today
            </Button>
          </div>
          <Checkbox
            id="demo-clock-enabled"
            label="Demo clock enabled"
            description="When off, the advance controls stop working and the queues use real time."
            checked={enabled}
            disabled={update.isPending}
            onCheckedChange={(v) => void toggle(v === true)}
          />
        </div>
      </Panel>

      <Panel title="Reset mock data" description="Clears every change made in this session and reloads the demo data. Nothing is saved to a server, so nothing else is affected.">
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          Reset mock data
        </Button>
      </Panel>

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset the demo data?"
        description="Referrals, contacts, texts and settings changed in this session are lost. The page reloads."
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Keep working
            </Button>
            <Button variant="danger" onClick={() => window.location.reload()}>
              Reset and reload
            </Button>
          </>
        }
      />
    </div>
  );
}
