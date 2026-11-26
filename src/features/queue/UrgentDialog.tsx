import { useState } from 'react';
import type { Referral } from '@/domain';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/forms';
import { Dialog } from '@/components/ui/overlays';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSetUrgent } from '@/data/hooks';
import { useSessionUser } from './queue-hooks';

/** Sets or clears the urgent flag. Either way a reason is required and goes on the audit trail. */
export function UrgentDialog({ referral, open, onOpenChange }: { referral: Referral; open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useSessionUser();
  const setUrgent = useSetUrgent();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const clearing = referral.flags.urgent;

  const submit = async () => {
    if (!reason.trim()) {
      setError(clearing ? 'Add a reason for clearing the urgent flag.' : 'Add a reason for marking this referral urgent.');
      document.getElementById('urgent-reason')?.focus();
      return;
    }
    if (!user) return;
    try {
      await setUrgent.mutateAsync({ id: referral.id, urgent: !clearing, reason: reason.trim(), actorId: user.id });
      notifySuccess(clearing ? 'Urgent flag cleared' : 'Marked urgent. It shows first in the Urgent tab.');
      setReason('');
      setError(undefined);
      onOpenChange(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The urgent flag could not be changed.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={clearing ? 'Clear the urgent flag?' : 'Mark as urgent?'}
      description="Urgent referrals show in the Urgent tab with a call today action, whatever their due date. Record why."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="flag" loading={setUrgent.isPending} onClick={() => void submit()}>
            {clearing ? 'Clear urgent flag' : 'Mark urgent'}
          </Button>
        </>
      }
    >
      <Field label="Reason" required error={error} hint="Recorded on the audit trail.">
        <Textarea id="urgent-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!error} />
      </Field>
    </Dialog>
  );
}
