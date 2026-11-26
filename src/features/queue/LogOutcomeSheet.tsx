import { useState } from 'react';
import {
  CONTACT_OUTCOMES,
  OUTCOME_META,
  STATUS_META,
  formatAuMobile,
  type CadenceSettings,
  type ContactChannel,
  type ContactOutcome,
  type Referral,
  type ReferralStatus,
} from '@/domain';
import { Button } from '@/components/ui/button';
import { Field, Input, RadioGroup, Textarea, Checkbox } from '@/components/ui/forms';
import { DatePicker } from '@/components/ui/date-picker';
import { Sheet } from '@/components/ui/overlays';
import { PatientIdentity } from '@/components/ui/patient-identity';
import { notifyError, notifySuccess, showUndoToast } from '@/components/ui/toast';
import { useMediaQuery, useSessionUser } from './queue-hooks';
import { clinicDay, isTextOutcome, isNoContact } from './queue-model';
import { useChangeStatus, useDemoNow, useLogContact, useLookups, useSmsTemplates } from '@/data/hooks';
import { ICONS } from '@/components/ui/icons';
import { renderCoaxBody } from './SmsComposerDialog';

const OUTCOME_HINT: Record<ContactOutcome, string> = {
  lm_coax_sent: 'Voicemail left. The Coax text goes out next.',
  coax_sent: 'No call connected. The Coax text goes out next.',
  emailed: 'No call connected. Closes the step without a text.',
  spoke_pt_parent: 'The patient or parent answered. Choose a status if one changes.',
  called_booked: 'Booked on the call. Record the Edge patient ID below.',
  booked_via_cc: 'Booked by the call centre. Record the Edge patient ID below.',
};

const CHANNEL_FOR: Record<ContactOutcome, ContactChannel> = {
  lm_coax_sent: 'call',
  coax_sent: 'sms',
  emailed: 'email',
  spoke_pt_parent: 'call',
  called_booked: 'call',
  booked_via_cc: 'call',
};

type StatusChoice = 'keep' | 'to_call_us' | 'booked' | 'do_not_contact' | 'declined';

const STATUS_CHOICES: Array<{ value: StatusChoice; label: string; description?: string }> = [
  { value: 'keep', label: 'Keep contacting', description: 'The cadence continues.' },
  { value: 'to_call_us', label: 'To call us', description: 'The patient will call the clinic. You can undo this.' },
  { value: 'booked', label: 'Booked in Edge', description: 'Needs the Edge patient ID and booking date.' },
  { value: 'do_not_contact', label: 'Do not contact', description: 'Needs a reason. Stops the cadence.' },
  { value: 'declined', label: 'Declined', description: 'Needs a reason. Stops the cadence.' },
];

export interface LogOutcomeSheetProps {
  referral: Referral;
  cadence: CadenceSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Logs one call or text outcome for the current cadence step. The optional Coax text is shown
 * with its template, recipient and rendered body before confirming. Status choices carry their own requirements.
 */
export function LogOutcomeSheet({ referral, cadence, open, onOpenChange }: LogOutcomeSheetProps) {
  const user = useSessionUser();
  const now = useDemoNow();
  const lookups = useLookups();
  const logContact = useLogContact();
  const changeStatus = useChangeStatus();
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const step = Math.min(referral.currentStep, 3) as 0 | 1 | 2 | 3;
  const [outcome, setOutcome] = useState<ContactOutcome | ''>('');
  const [notes, setNotes] = useState('');
  const [sendText, setSendText] = useState(true);
  const [statusChoice, setStatusChoice] = useState<StatusChoice>('keep');
  const [edgeId, setEdgeId] = useState('');
  const [bookingDate, setBookingDate] = useState<string | null>(clinicDay(now));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'outcome' | 'edge' | 'bookingDate' | 'reason', string>>>({});
  const [saving, setSaving] = useState(false);

  const templates = useSmsTemplates();
  const template = (templates.data ?? []).find((t) => t.key === cadence.steps[step]?.templateKey);
  const showText = outcome !== '' && isTextOutcome(outcome) && step >= 1;
  const clinicName = lookups.data?.clinics.find((c) => c.id === referral.preferredClinicId)?.name ?? null;
  const previewBody = template ? renderCoaxBody(template, referral, { clinicName }) : '';
  const stepLabel = cadence.steps[step]?.label ?? 'Cadence step';

  const submit = async () => {
    const next: typeof errors = {};
    if (!outcome) next.outcome = 'Choose what happened on the call.';
    if (statusChoice === 'booked' && !edgeId.trim()) next.edge = 'Enter the Edge patient ID before marking this referral booked.';
    if (statusChoice === 'booked' && !bookingDate) next.bookingDate = 'Choose the booking date, as DD/MM/YYYY.';
    if ((statusChoice === 'do_not_contact' || statusChoice === 'declined') && !reason.trim()) {
      next.reason = 'Add a reason before closing this referral.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = Object.keys(next)[0];
      const target =
        first === 'outcome' ? document.querySelector<HTMLElement>('[role="radio"]') : document.getElementById(`log-${first}`);
      target?.focus();
      return;
    }
    if (!user || !outcome) return;

    setSaving(true);
    const previousStatus: ReferralStatus = referral.status;
    try {
      await logContact.mutateAsync({
        input: {
          referralId: referral.id,
          step,
          channel: CHANNEL_FOR[outcome],
          outcome,
          notes: notes.trim() || null,
          sendSms: showText ? sendText : false,
        },
        actorId: user.id,
      });
      if (statusChoice !== 'keep') {
        const bookedAt = statusChoice === 'booked' && bookingDate ? new Date(`${bookingDate}T09:00:00+10:00`).toISOString() : undefined;
        await changeStatus.mutateAsync({
          id: referral.id,
          input: {
            status: statusChoice,
            reason: reason.trim() || undefined,
            edgePatientId: statusChoice === 'booked' ? edgeId.trim() : undefined,
            bookedAt,
          },
          actorId: user.id,
        });
        if (statusChoice === 'to_call_us') {
          showUndoToast(`Marked ${STATUS_META.to_call_us.label.toLowerCase()}`, () =>
            changeStatus.mutateAsync({ id: referral.id, input: { status: previousStatus }, actorId: user.id }).then(() => undefined),
          );
        }
      }
      notifySuccess(showText ? `Outcome logged. ${stepLabel.split(' and ').pop()} queued.` : 'Outcome logged.');
      onOpenChange(false);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The outcome could not be logged. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
        Cancel
      </Button>
      <Button variant="primary" icon="check" loading={saving} onClick={() => void submit()}>
        {showText && sendText ? 'Log outcome and send text' : 'Log outcome'}
      </Button>
    </>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Log outcome" description={`${stepLabel}`} side={isDesktop ? 'right' : 'bottom'} footer={footer}>
      <div className="flex flex-col gap-5">
        <div className="rounded-control border border-line-subtle bg-canvas p-3">
          <PatientIdentity
            variant="header"
            firstName={referral.patientFirstName}
            lastName={referral.patientLastName}
            dob={referral.dob}
            ageGroup={referral.ageGroup}
            phone={referral.phone}
          />
        </div>

        <div className="flex flex-col gap-2">
          <RadioGroup
            label="What happened"
            value={outcome || undefined}
            onValueChange={(v) => {
              setOutcome(v as ContactOutcome);
              setErrors((e) => ({ ...e, outcome: undefined }));
            }}
            options={CONTACT_OUTCOMES.map((value) => ({ value, label: OUTCOME_META[value].label, description: OUTCOME_HINT[value] }))}
            invalid={!!errors.outcome}
          />
          {errors.outcome ? (
            <p role="alert" className="text-sm text-danger">
              {errors.outcome}
            </p>
          ) : null}
        </div>

        {showText ? (
          <section aria-label="Text to send" className="flex flex-col gap-3 rounded-control border border-line bg-surface p-4">
            <Checkbox
              id="log-send-text"
              checked={sendText}
              onCheckedChange={setSendText}
              label={`Send the ${stepLabel.split(' and ').pop()} text after logging`}
              description="The text is shown exactly as it will be sent."
            />
            {sendText ? (
              <dl className="flex flex-col gap-2 text-base">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-sm text-ink-muted">Template</dt>
                  <dd className="text-ink">{template?.name ?? 'No template set for this step'}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-sm text-ink-muted">Recipient</dt>
                  <dd className="tabular text-ink">{referral.phone ? formatAuMobile(referral.phone) : 'No phone on file. The text will fail and appear in Inbox.'}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-sm text-ink-muted">Message</dt>
                  <dd className="whitespace-pre-line rounded-control bg-canvas p-3 text-ink">{previewBody}</dd>
                </div>
              </dl>
            ) : null}
          </section>
        ) : outcome && isNoContact(outcome) ? (
          <p className="text-base text-ink-muted">No text is sent for this outcome.</p>
        ) : null}

        <Field label="Notes" hint="Optional. Keep it factual, for example what was said or the voicemail left.">
          <Textarea id="log-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex flex-col gap-3 border-t border-line-subtle pt-4">
          <RadioGroup
            label="Status after this contact"
            value={statusChoice}
            onValueChange={(v) => setStatusChoice(v as StatusChoice)}
            options={STATUS_CHOICES}
          />
          {statusChoice === 'booked' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Edge patient ID" error={errors.edge} required hint="From Edge. The system of record.">
                <Input id="log-edge" inputMode="numeric" autoComplete="off" value={edgeId} onChange={(e) => setEdgeId(e.target.value)} aria-invalid={!!errors.edge} />
              </Field>
              <DatePicker id="log-bookingDate" label="Booking date" value={bookingDate} max={clinicDay(now)} onChange={setBookingDate} invalid={!!errors.bookingDate} errorText={errors.bookingDate} />
            </div>
          ) : null}
          {statusChoice === 'do_not_contact' || statusChoice === 'declined' ? (
            <Field label="Reason" error={errors.reason} required>
              <Textarea id="log-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} />
            </Field>
          ) : null}
          {statusChoice === 'booked' || statusChoice === 'do_not_contact' || statusChoice === 'declined' ? (
            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
              <ICONS.info size={16} strokeWidth={1.5} aria-hidden="true" />
              This status change is recorded in the timeline with your name and the time.
            </p>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
