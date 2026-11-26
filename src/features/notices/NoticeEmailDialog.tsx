import { useState } from 'react';
import { CLOSED_REASON_LABELS, NOTICE_KIND_LABELS, formatDateTime, mailtoHref, missingItemsText, noticeTemplatesOf, renderNotice, unresolvedNoticeFields, type Practice, type Referral, type ReferrerNotification, type Referrer } from '@/domain';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/forms';
import { Dialog } from '@/components/ui/overlays';
import { notifyError, notifySuccess } from '@/components/ui/toast';
import { useSettings, useUpdateNotification } from '@/data/hooks';
import { useAuth } from '@/app/auth';
import { useNames } from '@/features/queue/queue-hooks';

export interface NoticeEmailDialogProps {
  notice: ReferrerNotification;
  referral: Referral | null;
  referrer: Referrer | null;
  practice: Practice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A prepared email for one referrer notice. Subject and body come from the editable notice templates, with merge
 * fields filled from the referral. The text can be edited before it goes. Copy and the email app both leave the
 * app, so "Mark as sent" is what records who sent it and when.
 */
export function NoticeEmailDialog({ notice, referral, referrer, practice, open, onOpenChange }: NoticeEmailDialogProps) {
  const { user } = useAuth();
  const settings = useSettings();
  const names = useNames();
  const markSent = useUpdateNotification();
  const isSent = notice.status === 'sent';

  const values = {
    referrerName: referrer ? `${referrer.title ?? ''} ${referrer.firstName} ${referrer.lastName}`.trim() : 'there',
    patientName: referral ? `${referral.patientFirstName} ${referral.patientLastName}`.trim() : 'the patient',
    reference: referral?.referenceNumber ?? '',
    clinicName: names.clinic(referral?.preferredClinicId ?? null),
    orthoName: names.ortho(referral?.preferredOrthodontistId ?? null),
    senderName: user?.name ?? '',
    detail: notice.note ?? 'We are arranging the first appointment with the patient.',
    missingItems: missingItemsText(notice.missingItems ?? []),
    reason: notice.note ?? (referral?.closedReason ? CLOSED_REASON_LABELS[referral.closedReason] : 'Not stated'),
  };
  const template = noticeTemplatesOf(settings.data?.noticeTemplates).find((t) => t.kind === notice.kind);
  const initialSubject = isSent ? (notice.emailSubject ?? '') : renderNotice(template?.subject ?? '', values);
  const initialBody = isSent ? (notice.emailBody ?? '') : renderNotice(template?.body ?? '', values);
  const initialTo = referrer?.email ?? practice?.email ?? '';

  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | undefined>();

  const openFields = unresolvedNoticeFields(`${subject}\n${body}`);
  const recipientName = referrer ? `${referrer.firstName} ${referrer.lastName}`.trim() : 'Referrer';
  const practiceName = practice?.name ?? '';

  const copy = async () => {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess('Email copied. Paste it into your email app.');
    } catch {
      notifyError('The email could not be copied. Select the text and copy it by hand.');
    }
  };

  const openInApp = () => {
    if (!to.trim()) {
      setError('Add an email address first. Referrers without one can be sent by letter or phone.');
      return;
    }
    window.location.href = mailtoHref(to.trim(), subject, body);
  };

  const submit = async () => {
    if (!user) return;
    try {
      await markSent.mutateAsync({ id: notice.id, status: 'sent', actorId: user.id, email: { subject, body } });
      notifySuccess('Marked as sent. Recorded with your name and the time.');
      onOpenChange(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'The notice could not be marked sent.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="w-[min(44rem,calc(100vw-2rem))]"
      title={NOTICE_KIND_LABELS[notice.kind]}
      description={`${recipientName}${practiceName ? `, ${practiceName}` : ''}${referral ? ` · ${referral.referenceNumber}` : ''}`}
      footer={
        isSent ? (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="ghost" icon="copy" onClick={() => void copy()}>
              Copy email
            </Button>
            <Button variant="secondary" icon="mail" onClick={openInApp}>
              Open in email app
            </Button>
            <Button variant="primary" icon="check" loading={markSent.isPending} onClick={() => void submit()}>
              Mark as sent
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {isSent ? (
          <p className="text-base text-ink-muted">
            Sent {notice.sentAt ? formatDateTime(notice.sentAt) : ''} by {names.staff(notice.sentBy ?? null) || 'staff'}. This is the email as sent.
          </p>
        ) : null}
        <Field label="To" id="notice-to" error={error} hint={referrer?.email ? 'From the Referrer Master.' : 'No email on the Referrer Master. Type one or send another way.'}>
          <Input inputMode="email" spellCheck={false} value={to} readOnly={isSent} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Subject" id="notice-subject">
          <Input value={subject} readOnly={isSent} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message" id="notice-body">
          <Textarea rows={12} value={body} readOnly={isSent} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {openFields.length > 0 && !isSent ? (
          <p role="status" className="text-sm text-warn-fg">
            Some fields are still empty: {openFields.join(', ')}. Fill them in before sending.
          </p>
        ) : null}
        <p className="text-sm text-ink-muted">Wording comes from Settings, Referrer emails. Changes here apply to this email only.</p>
      </div>
    </Dialog>
  );
}
