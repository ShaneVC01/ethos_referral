import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/forms';
import { Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSmsTemplates } from '@/data/hooks';
import { useAuth } from '@/app/auth';
import type { SmsTemplate } from '@/domain';
import { useSaveTemplate } from './hooks';
import { MERGE_FIELDS, countSms, renderPreview, unknownFields } from './smsPreview';
import type { TabProps } from './types';

/** Fixed order and plain-language labels for the six Coax variants. Keys never change. */
const ORDER = ['coax_1_standard', 'coax_1_existing_family', 'coax_1_transfer', 'coax_2', 'coax_3', 'coax_4_final'] as const;
const GROUP: Record<string, string> = {
  coax_1_standard: 'First text',
  coax_1_existing_family: 'First text',
  coax_1_transfer: 'First text',
  coax_2: 'Day 1 text',
  coax_3: 'Day 14 text',
  coax_4_final: 'Final text',
};

interface Draft {
  name: string;
  body: string;
}

export function TemplatesTab({ onDirtyChange }: TabProps) {
  const templates = useSmsTemplates();
  if (!templates.data) return <Skeleton className="h-72 w-full" />;
  return <TemplateEditor saved={templates.data} onDirtyChange={onDirtyChange} />;
}

function TemplateEditor({ saved, onDirtyChange }: { saved: SmsTemplate[] } & TabProps) {
  const { user } = useAuth();
  const save = useSaveTemplate();
  const ordered = useMemo(
    () => [...saved].sort((a, b) => ORDER.indexOf(a.key as (typeof ORDER)[number]) - ORDER.indexOf(b.key as (typeof ORDER)[number])),
    [saved],
  );
  const [selected, setSelected] = useState<string>(ordered[0]?.key ?? '');
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(saved.map((t) => [t.key, { name: t.name, body: t.body }])));
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const savedFor = (key: string) => saved.find((t) => t.key === key);
  const isDirty = (key: string) => {
    const s = savedFor(key);
    const d = drafts[key];
    return !!s && !!d && (s.name !== d.name || s.body !== d.body);
  };
  const dirtyAny = ordered.some((t) => isDirty(t.key));
  useEffect(() => {
    onDirtyChange(dirtyAny);
  }, [dirtyAny, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const current = savedFor(selected);
  const draft = drafts[selected] ?? { name: '', body: '' };
  const count = countSms(draft.body);
  const unknown = unknownFields(draft.body);
  const bodyError = !draft.body.trim() ? 'The message cannot be empty.' : unknown.length ? `Unknown field: ${unknown.map((u) => `{${u}}`).join(', ')}. Use a field from the list.` : null;
  const nameError = !draft.name.trim() ? 'Give the template a name.' : null;

  const setDraft = (patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [selected]: { ...draft, ...patch } }));

  const insertField = (token: string) => {
    const el = bodyRef.current;
    const text = `{${token}}`;
    if (!el) {
      setDraft({ body: `${draft.body}${text}` });
      return;
    }
    const start = el.selectionStart ?? draft.body.length;
    const end = el.selectionEnd ?? start;
    const next = draft.body.slice(0, start) + text + draft.body.slice(end);
    setDraft({ body: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const discard = () => {
    if (!current) return;
    setDrafts((d) => ({ ...d, [selected]: { name: current.name, body: current.body } }));
  };

  const onSave = async () => {
    if (!user || !current || bodyError || nameError) return;
    try {
      await save.mutateAsync({ template: { ...current, name: draft.name.trim(), body: draft.body }, actorId: user.id });
      notifySuccess(`${draft.name.trim()} saved.`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The template could not be saved.');
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label="SMS templates" className="flex flex-col gap-1">
        {ordered.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-current={t.key === selected ? 'true' : undefined}
            onClick={() => setSelected(t.key)}
            className="flex min-h-11 items-center justify-between gap-2 rounded-control px-3 text-left text-base text-ink hover:bg-panel aria-[current=true]:bg-accent-subtle aria-[current=true]:font-medium md:min-h-9"
          >
            <span className="flex flex-col">
              <span>{t.name}</span>
              <span className="text-xs text-ink-muted">{GROUP[t.key] ?? ''}</span>
            </span>
            {isDirty(t.key) ? <span className="text-xs font-medium text-warn-fg">Unsaved</span> : null}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-col gap-5">
        <Field label="Template name" error={nameError ?? undefined}>
          <Input value={draft.name} onChange={(e) => setDraft({ name: e.target.value })} maxLength={80} />
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink">Insert a field</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Merge fields">
            {MERGE_FIELDS.map((f) => (
              <Button key={f.token} variant="secondary" size="sm" onClick={() => insertField(f.token)} aria-label={`Insert ${f.label}`}>
                {`{${f.token}}`}
              </Button>
            ))}
          </div>
        </div>

        <Field
          label="Message"
          error={bodyError ?? undefined}
          hint={`${count.characters} characters. ${count.segments} ${count.segments === 1 ? 'segment' : 'segments'} (${count.encoding}, ${count.perSegmentLimit} characters per segment).${count.encoding === 'UCS-2' ? ' Special characters make each text cost more and reduce the length.' : ''}`}
        >
          <Textarea ref={bodyRef} rows={7} value={draft.body} onChange={(e) => setDraft({ body: e.target.value })} className="font-sans" />
        </Field>

        <section aria-labelledby="sms-preview-heading" className="rounded-panel border border-line bg-panel p-4">
          <h3 id="sms-preview-heading" className="text-base font-medium text-ink">
            Preview
          </h3>
          <p className="mb-3 text-sm text-ink-muted">Sample values are filled in. Real texts use the patient and clinic on the referral.</p>
          <p className="max-w-prose whitespace-pre-wrap rounded-panel bg-surface p-3 text-base text-ink">{draft.body.trim() ? renderPreview(draft.body) : 'Nothing to preview yet.'}</p>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={discard} disabled={!isDirty(selected) || save.isPending}>
            Discard changes
          </Button>
          <Button loading={save.isPending} disabled={!isDirty(selected) || !!bodyError || !!nameError} onClick={() => void onSave()}>
            Save template
          </Button>
        </div>
      </div>
    </div>
  );
}
