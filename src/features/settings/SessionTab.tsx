import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/forms';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSettings, useUpdateSettings } from '@/data/hooks';
import { useAuth } from '@/app/auth';
import type { TabProps } from './types';

export function SessionTab({ onDirtyChange }: TabProps) {
  const settings = useSettings();
  if (!settings.data) return <Skeleton className="h-48 w-full" />;
  return <SessionForm savedIdle={settings.data.idleLockMinutes} onDirtyChange={onDirtyChange} />;
}

function SessionForm({ savedIdle, onDirtyChange }: { savedIdle: number } & TabProps) {
  const { user } = useAuth();
  const update = useUpdateSettings();
  const [idle, setIdle] = useState(String(savedIdle));
  const [touched, setTouched] = useState(false);

  const parsed = Number(idle);
  const error =
    idle.trim() === '' || !Number.isInteger(parsed) ? 'Enter a whole number of minutes.' : parsed < 1 || parsed > 120 ? 'Choose between 1 and 120 minutes.' : null;
  const dirty = parsed !== savedIdle && idle.trim() !== '';
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const save = async () => {
    setTouched(true);
    if (!user || error) return;
    try {
      await update.mutateAsync({ patch: { idleLockMinutes: parsed }, actorId: user.id });
      notifySuccess(`The screen now locks after ${parsed} minutes idle.`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The session setting could not be saved.');
    }
  };

  return (
    <Panel
      title="Session"
      description="Desk computers at clinics are shared. The screen blurs after a period without input, and the signed-in name stays visible."
      actions={
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || update.isPending} onClick={() => { setIdle(String(savedIdle)); setTouched(false); }}>
            Discard changes
          </Button>
          <Button size="sm" loading={update.isPending} disabled={!dirty || !!error} onClick={() => void save()}>
            Save session
          </Button>
        </div>
      }
    >
      <div className="max-w-sm">
        <Field
          label="Lock after idle minutes"
          hint="Between 1 and 120. The default is 15."
          error={touched && error ? error : undefined}
          required
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            step={1}
            value={idle}
            onChange={(e) => setIdle(e.target.value)}
            onBlur={() => setTouched(true)}
            className="w-32 tabular-nums"
          />
        </Field>
      </div>
      <p className="mt-4 text-sm text-ink-muted">
        Signed in as <span className="font-medium text-ink">{user?.name ?? 'nobody'}</span>. Changing the setting does not lock the screen straight away.
      </p>
    </Panel>
  );
}
