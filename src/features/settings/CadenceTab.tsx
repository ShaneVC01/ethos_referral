import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select } from '@/components/ui/forms';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSettings, useSmsTemplates, useUpdateSettings } from '@/data/hooks';
import { useAuth } from '@/app/auth';
import type { CadenceSettings } from '@/domain';
import type { TabProps } from './types';

const CHANNELS = ['Text', 'Call and text', 'Call and text', 'Call and text'] as const;

function sameCadence(a: CadenceSettings, b: CadenceSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Days from receipt, used only to check the steps run in order. */
function daysFromReceipt(amount: number, unit: 'day' | 'month'): number {
  return unit === 'month' ? amount * 30 : amount;
}

export function CadenceTab({ onDirtyChange }: TabProps) {
  const settings = useSettings();
  if (!settings.data) return <Skeleton className="h-64 w-full" />;
  return <CadenceForm saved={settings.data.cadence} onDirtyChange={onDirtyChange} />;
}

function CadenceForm({ saved, onDirtyChange }: { saved: CadenceSettings } & TabProps) {
  const { user } = useAuth();
  const templates = useSmsTemplates();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<CadenceSettings>(saved);

  const dirty = !sameCadence(draft, saved);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const stepErrors = useMemo(() => {
    const errors: (string | null)[] = draft.steps.map(() => null);
    draft.steps.forEach((s, i) => {
      if (i === 0) return;
      const prev = draft.steps[i - 1];
      if (!prev) return;
      if (!Number.isInteger(s.offsetAmount) || s.offsetAmount < 0) {
        errors[i] = 'Enter a whole number of days or months, 0 or more.';
      } else if (daysFromReceipt(s.offsetAmount, s.offsetUnit) <= daysFromReceipt(prev.offsetAmount, prev.offsetUnit)) {
        errors[i] = `${s.label} must come after ${prev.label}.`;
      }
    });
    return errors;
  }, [draft.steps]);
  const hasErrors = stepErrors.some(Boolean);

  const setStep = (index: number, patch: Partial<CadenceSettings['steps'][number]>) => {
    setDraft((d) => ({ ...d, steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  };

  const save = async () => {
    if (!user) return;
    try {
      await update.mutateAsync({ patch: { cadence: draft }, actorId: user.id });
      notifySuccess('Cadence saved. New referrals use these offsets.');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The cadence could not be saved.');
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Contact steps"
        description="Offsets count from the date the referral was received. The first text goes out as soon as the referral is saved."
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={!dirty || update.isPending} onClick={() => setDraft(saved)}>
              Discard changes
            </Button>
            <Button size="sm" loading={update.isPending} disabled={!dirty || hasErrors} onClick={() => void save()}>
              Save cadence
            </Button>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <caption className="sr-only">Cadence steps, offset, unit, channel and template</caption>
            <thead>
              <tr className="border-b border-line bg-panel text-left text-ink-muted">
                <th scope="col" className="px-3 py-2 font-medium">Step</th>
                <th scope="col" className="px-3 py-2 font-medium">Offset</th>
                <th scope="col" className="px-3 py-2 font-medium">Unit</th>
                <th scope="col" className="px-3 py-2 font-medium">Channel</th>
                <th scope="col" className="px-3 py-2 font-medium">Template</th>
              </tr>
            </thead>
            <tbody>
              {draft.steps.map((s, i) => {
                const error = stepErrors[i];
                const first = i === 0;
                return (
                  <tr key={s.step} className="border-b border-line-subtle align-top">
                    <th scope="row" className="px-3 py-3 text-left font-medium text-ink">
                      {s.label}
                    </th>
                    <td className="px-3 py-3">
                      <Field label={`Offset for ${s.label}`} error={error ?? undefined} className="w-28">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          disabled={first}
                          value={s.offsetAmount}
                          onChange={(e) => setStep(i, { offsetAmount: Number(e.target.value) })}
                          className="tabular-nums"
                        />
                      </Field>
                    </td>
                    <td className="px-3 py-3">
                      <Field label={`Unit for ${s.label}`} className="w-28">
                        <Select disabled={first} value={s.offsetUnit} onChange={(e) => setStep(i, { offsetUnit: e.target.value as 'day' | 'month' })}>
                          <option value="day">Days</option>
                          <option value="month">Months</option>
                        </Select>
                      </Field>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">{CHANNELS[i]}</td>
                    <td className="px-3 py-3">
                      <Field label={`Template for ${s.label}`} className="min-w-[14rem]">
                        <Select value={s.templateKey ?? ''} onChange={(e) => setStep(i, { templateKey: e.target.value || null })}>
                          <option value="">No template</option>
                          {(templates.data ?? []).map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="When a referral closes" description="Applies after the final step, three months after receipt by default.">
        <div className="flex flex-col gap-4">
          <Checkbox
            id="close-unsuccessful"
            label="Close as unsuccessful after the final text"
            description="The referral closes when the final call and text are logged with no booking."
            checked={draft.closeUnsuccessfulAfterFinal}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, closeUnsuccessfulAfterFinal: v === true }))}
          />
          <Checkbox
            id="notify-referrer"
            label="Tell the referrer when a referral closes as unsuccessful"
            description="Creates a referrer notification for someone to send. Nothing is sent automatically."
            checked={draft.notifyReferrerOnUnsuccessful}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, notifyReferrerOnUnsuccessful: v === true }))}
          />
        </div>
      </Panel>
    </div>
  );
}
