import { useMemo, useState } from 'react';
import { cadenceMergeValues, digitsOnly, formatAuMobile, renderSmsBody, unresolvedFields, type Referral, type SmsTemplate } from '@/domain';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/forms';
import { Dialog } from '@/components/ui/overlays';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useLookups, useSendSms, useSmsTemplates } from '@/data/hooks';
import { countSms } from '@/features/settings/smsPreview';
import { useSessionUser } from './queue-hooks';

/** Step 0 has three Coax #1 variants. Later steps have one template each. */
export function coaxVariants(templates: SmsTemplate[], step: number): SmsTemplate[] {
  return templates.filter((t) => t.step === step);
}

/** The variant to start with: existing family for existing patients, standard otherwise. */
export function defaultCoaxKey(step: number, existingPatient: boolean, templates: SmsTemplate[]): string | null {
  const preferred = step === 0 && existingPatient ? 'coax_1_existing_family' : null;
  const list = coaxVariants(templates, step);
  return (preferred && list.find((t) => t.key === preferred)?.key) ?? list[0]?.key ?? null;
}

export interface CoaxRenderContext {
  clinicName: string | null;
  orthoName?: string | null;
  referrerName?: string | null;
  clinicPhone?: string | null;
}

/** Renders a saved template for one referral. The same function feeds the preview and the send. */
export function renderCoaxBody(template: SmsTemplate, referral: Referral, ctx: CoaxRenderContext): string {
  return renderSmsBody(template.body, cadenceMergeValues(referral, ctx.clinicName, ctx));
}

export interface SmsComposerProps {
  referral: Referral;
  /** Step whose variants are offered. Defaults to Coax #1. */
  step?: number;
  /** Template key to start with. Defaults to the variant for this patient. */
  templateKey?: string;
  onSent?: () => void;
  onCancel?: () => void;
}

/**
 * The send preview: variant, recipient, the rendered message (editable before sending), segment count.
 * Templates come from the Settings store, so edits in Settings reach this preview straight away.
 */
export function SmsComposer({ referral, step = 0, templateKey, onSent, onCancel }: SmsComposerProps) {
  const user = useSessionUser();
  const lookups = useLookups();
  const templatesQuery = useSmsTemplates();
  const send = useSendSms();
  const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);
  const variants = coaxVariants(templates, step);
  const [key, setKey] = useState<string | null>(templateKey ?? null);
  const [edited, setEdited] = useState<string | null>(null);

  const activeKey = key ?? defaultCoaxKey(step, referral.flags.existingPatient, templates);
  const template = templates.find((t) => t.key === activeKey) ?? null;
  const clinicName = lookups.data?.clinics.find((c) => c.id === referral.preferredClinicId)?.name ?? null;
  const rendered = template ? renderCoaxBody(template, referral, { clinicName }) : '';
  const body = edited ?? rendered;
  const digits = digitsOnly(referral.phone);
  const count = countSms(body);
  const missing = unresolvedFields(body);
  const canSend = !!digits && !!user && !!template && body.trim().length > 0;

  const chooseVariant = (next: string) => {
    setKey(next);
    setEdited(null);
  };

  const submit = async () => {
    if (!user || !digits || !template) return;
    try {
      await send.mutateAsync({ input: { referralId: referral.id, toPhone: digits, body, templateKey: template.key }, actorId: user.id });
      notifySuccess('Text queued. Delivery shows in the timeline.');
      onSent?.();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The text could not be sent. Try again.');
    }
  };

  if (templatesQuery.isPending) {
    return <p className="text-base text-ink-muted" aria-busy="true">Loading templates</p>;
  }
  if (templatesQuery.isError || !template) {
    return <p className="text-base text-danger">No template is set for this step. Check Settings, then try again.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {variants.length > 1 ? (
        <Field label="Message variant" hint="Standard, existing family or transfer. Set the default in Settings.">
          <Select value={activeKey ?? ''} onChange={(e) => chooseVariant(e.target.value)}>
            {variants.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <p className="text-base text-ink">
          <span className="text-ink-muted">Template: </span>
          {template.name}
        </p>
      )}

      <dl className="flex flex-col gap-3 text-base">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm text-ink-muted">Recipient</dt>
          <dd className="tabular text-ink">{digits ? formatAuMobile(digits) : 'No phone number on file. Add one before sending.'}</dd>
        </div>
      </dl>

      <Field label="Message" hint="You can edit the text before sending. Texts cannot be recalled." error={missing.length ? `Unresolved field: ${missing.join(', ')}` : undefined}>
        <Textarea rows={5} value={body} onChange={(e) => setEdited(e.target.value)} aria-describedby="sms-count" />
      </Field>
      <div id="sms-count" className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
        <span className="tabular">
          {count.characters} characters, {count.segments} {count.segments === 1 ? 'segment' : 'segments'} ({count.encoding})
        </span>
        {edited !== null ? (
          <Button variant="ghost" size="sm" onClick={() => setEdited(null)}>
            Reset to template text
          </Button>
        ) : null}
      </div>
      {template.description ? <p className="text-sm text-ink-muted">{template.description}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button variant="primary" icon="send" loading={send.isPending} disabled={!canSend || missing.length > 0} onClick={() => void submit()}>
          Send text
        </Button>
      </div>
    </div>
  );
}

export interface SmsComposerDialogProps {
  referral: Referral;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step?: number;
  templateKey?: string;
}

/** Modal wrapper for the send preview. Used from the drawer and the Today row actions. */
export function SmsComposerDialog({ referral, open, onOpenChange, step = 0, templateKey }: SmsComposerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Send Coax text" description="Check the recipient and message before sending.">
      <SmsComposer referral={referral} step={step} templateKey={templateKey} onSent={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
    </Dialog>
  );
}
