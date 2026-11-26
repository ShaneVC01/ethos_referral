import { useState } from 'react';
import { CLOSED_REASON_LABELS, type Referral } from '@/domain';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/forms';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog } from '@/components/ui/overlays';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSessionUser } from './queue-hooks';
import { clinicDay } from './queue-model';
import { useChangeStatus, useDemoNow } from '@/data/hooks';

/** Mark booked. Edge stays the system of record, so the Edge patient ID is required. */
export function BookedDialog({ referral, open, onOpenChange }: { referral: Referral; open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useSessionUser();
  const now = useDemoNow();
  const changeStatus = useChangeStatus();
  const [edgeId, setEdgeId] = useState('');
  const [date, setDate] = useState<string | null>(clinicDay(now));
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<{ edge?: string; date?: string; confirm?: string }>({});

  const submit = async () => {
    const next: { edge?: string; date?: string; confirm?: string } = {};
    if (!edgeId.trim()) next.edge = 'Enter the Edge patient ID before marking this referral booked.';
    if (!confirmed) next.confirm = 'Confirm the clinic and orthodontist in Edge before recording the booking.';
    if (!date) next.date = 'Choose the booking date, as DD/MM/YYYY.';
    setErrors(next);
    if (next.edge) {
      document.getElementById('booked-edge')?.focus();
      return;
    }
    if (next.date) {
      document.getElementById('booked-date')?.focus();
      return;
    }
    if (!user || !date) return;
    try {
      await changeStatus.mutateAsync({
        id: referral.id,
        input: { status: 'booked', edgePatientId: edgeId.trim(), bookedAt: new Date(`${date}T09:00:00+10:00`).toISOString() },
        actorId: user.id,
      });
      notifySuccess('Marked booked in Edge');
      onOpenChange(false);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The referral could not be marked booked.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mark booked"
      description="Book in Edge first, then record it here. The cadence stops and the referral closes as booked."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" loading={changeStatus.isPending} onClick={() => void submit()}>
            Mark booked
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Edge patient ID" error={errors.edge} required hint="Copy it from Edge exactly as shown.">
          <Input id="booked-edge" inputMode="numeric" autoComplete="off" value={edgeId} onChange={(e) => setEdgeId(e.target.value)} />
        </Field>
        <Checkbox id="booked-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v)} label="Clinic and orthodontist are confirmed in Edge" invalid={!!errors.confirm} />
        {errors.confirm ? <p className="text-sm text-danger">{errors.confirm}</p> : null}
        <DatePicker id="booked-date" label="Booking date" value={date} max={clinicDay(now)} onChange={setDate} invalid={!!errors.date} errorText={errors.date} />
      </div>
    </Dialog>
  );
}

export type ReasonKind = 'do_not_contact' | 'declined' | 'return' | 'unsuccessful';

const REASON_COPY: Record<ReasonKind, { title: string; description: string; confirm: string }> = {
  do_not_contact: {
    title: 'Mark do not contact?',
    description: 'The cadence stops and no more texts or calls go out. Record why.',
    confirm: 'Mark do not contact',
  },
  declined: {
    title: 'Mark declined?',
    description: 'The patient or dentist has declined. The cadence stops. Record why.',
    confirm: 'Mark declined',
  },
  unsuccessful: {
    title: 'Close as unsuccessful?',
    description: 'The patient could not be reached or did not book. The cadence stops. Record why.',
    confirm: 'Close as unsuccessful',
  },
  return: {
    title: 'Return to referrer?',
    description: 'Closes the referral as returned and creates a notification for the referrer. Record why.',
    confirm: 'Return to referrer',
  },
};

/**
 * Do not contact, declined, unsuccessful and return to referrer each need a reason. These close the referral,
 * so they confirm first. Declined, do not contact and unsuccessful can tell the referrer (default on).
 */
export function ReasonDialog({ referral, kind, open, onOpenChange }: { referral: Referral; kind: ReasonKind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useSessionUser();
  const changeStatus = useChangeStatus();
  const [reason, setReason] = useState('');
  const [tellReferrer, setTellReferrer] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const copy = REASON_COPY[kind];
  const canTellReferrer = kind !== 'return' && !!referral.referrerId;

  const submit = async () => {
    if (!reason.trim()) {
      setError('Add a reason before closing this referral.');
      document.getElementById('reason-text')?.focus();
      return;
    }
    if (!user) return;
    try {
      if (kind === 'return') {
        await changeStatus.mutateAsync({
          id: referral.id,
          input: { status: 'unsuccessful', reason: reason.trim(), returnToReferrer: true },
          actorId: user.id,
        });
        notifySuccess('Returned to referrer. A notice is waiting in Referrer notices.');
      } else {
        await changeStatus.mutateAsync({
          id: referral.id,
          input: { status: kind, reason: reason.trim(), notifyReferrer: canTellReferrer && tellReferrer },
          actorId: user.id,
        });
        notifySuccess(`Marked ${REASON_LABEL[kind]}`);
      }
      setReason('');
      onOpenChange(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The referral could not be closed.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={kind === 'do_not_contact' ? 'danger' : 'primary'} loading={changeStatus.isPending} onClick={() => void submit()}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Reason" error={error} required hint={kind === 'return' ? 'Shown to the referrer team. Keep it factual.' : undefined}>
          <Textarea id="reason-text" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error} />
        </Field>
        {canTellReferrer ? (
          <Checkbox
            id="reason-tell-referrer"
            checked={tellReferrer}
            onCheckedChange={(v) => setTellReferrer(v)}
            label="Tell the referrer"
            description="Adds a notice to Referrer notices for the team to send."
          />
        ) : null}
        <p className="text-sm text-ink-muted">
          Closing reason: {kind === 'return' ? CLOSED_REASON_LABELS.returned : CLOSED_REASON_LABELS[kind]}. Recorded with your name and the time.
        </p>
      </div>
    </Dialog>
  );
}

const REASON_LABEL: Record<Exclude<ReasonKind, 'return'>, string> = {
  do_not_contact: 'do not contact',
  declined: 'declined',
  unsuccessful: 'unsuccessful',
};
