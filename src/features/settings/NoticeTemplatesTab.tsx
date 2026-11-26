import { useEffect, useState } from 'react';
import { DEFAULT_NOTICE_TEMPLATES, NOTICE_TOKENS, noticeTemplatesOf, type NoticeTemplate } from '@/domain';
import { useAuth } from '@/app/auth';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/forms';
import { Panel, Skeleton } from '@/components/ui/surfaces';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSettings, useUpdateSettings } from '@/data/hooks';
import type { TabProps } from './types';

/** Referrer email wording. One subject and body per notice type, with merge fields in braces. */
export function NoticeTemplatesTab({ onDirtyChange }: TabProps) {
  const settings = useSettings();
  if (settings.isError) {
    return <p className="text-base text-danger">The referrer email wording could not be loaded. Reload the page and try again.</p>;
  }
  if (!settings.data) return <Skeleton className="h-72 w-full" />;
  return <NoticeTemplateEditor saved={noticeTemplatesOf(settings.data.noticeTemplates)} onDirtyChange={onDirtyChange} />;
}

function NoticeTemplateEditor({ saved, onDirtyChange }: { saved: NoticeTemplate[] } & TabProps) {
  const { user } = useAuth();
  const update = useUpdateSettings();
  const [drafts, setDrafts] = useState<NoticeTemplate[]>(saved);
  const dirty = JSON.stringify(drafts) !== JSON.stringify(saved);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const edit = (kind: NoticeTemplate['kind'], patch: Partial<Pick<NoticeTemplate, 'subject' | 'body'>>) => {
    setDrafts((list) => list.map((t) => (t.kind === kind ? { ...t, ...patch } : t)));
  };

  const save = async () => {
    if (!user) return;
    if (drafts.some((t) => !t.subject.trim() || !t.body.trim())) {
      notifyError('Each notice needs a subject and a message.');
      return;
    }
    try {
      await update.mutateAsync({ patch: { noticeTemplates: drafts }, actorId: user.id });
      notifySuccess('Referrer emails saved. New notices use this wording.');
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The referrer emails could not be saved.');
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-base text-ink-muted">
        Merge fields: {NOTICE_TOKENS.map((t) => `{${t}}`).join(', ')}. Empty fields stay visible in the email, so they are easy to spot before it goes.
      </p>
      {drafts.map((t) => {
        const original = DEFAULT_NOTICE_TEMPLATES.find((d) => d.kind === t.kind);
        return (
          <Panel key={t.kind} title={t.name} description={original ? 'Sent from Referrer notices. Staff check the wording before it goes.' : undefined}>
            <div className="flex flex-col gap-4">
              <Field label="Subject" id={`notice-subject-${t.kind}`}>
                <Input value={t.subject} onChange={(e) => edit(t.kind, { subject: e.target.value })} />
              </Field>
              <Field label="Message" id={`notice-body-${t.kind}`}>
                <Textarea rows={8} value={t.body} onChange={(e) => edit(t.kind, { body: e.target.value })} />
              </Field>
            </div>
          </Panel>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="check" loading={update.isPending} disabled={!dirty} onClick={() => void save()}>
          Save referrer emails
        </Button>
        <Button variant="ghost" disabled={update.isPending} onClick={() => setDrafts(DEFAULT_NOTICE_TEMPLATES.map((t) => ({ ...t })))}>
          Reset to standard wording
        </Button>
      </div>
    </div>
  );
}
