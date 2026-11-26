import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CLOSED_REASON_LABELS,
  DEFAULT_CADENCE,
  NOTICE_KIND_LABELS,
  OUTCOME_META,
  SOURCE_META,
  digitsOnly,
  formatAuDate,
  formatAuMobile,
  formatDateTime,
  nextAction,
  type ReferralFlags,
} from '@/domain';
import type { TodayItem } from './queue-model';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { Checkbox, Field, Textarea } from '@/components/ui/forms';
import { Badge, SmsStatusBadge, StatusBadge } from '@/components/ui/badges';
import { Dialog } from '@/components/ui/overlays';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Panel, EmptyState, KeyValue, Skeleton, Kbd } from '@/components/ui/surfaces';
import { Timeline, type TimelineItem } from '@/components/ui/timeline';
import { notifyError, notifySuccess, showUndoToast } from '@/components/ui/toast';
import { ICONS } from '@/components/ui/icons';
import {
  useAddAttachment,
  useAttachments,
  useAudit,
  useChangeStatus,
  useContacts,
  useDemoNow,
  useReferral,
  useReferrer,
  useReferralNotices,
  useRemoveAttachment,
  useSettings,
  useSimulateSms,
  useSmsMessages,
  useUpdateReferral,
} from '@/data/hooks';
import { useNames, useReferralDuplicates, useSessionUser, isTyping } from './queue-hooks';
import { isOpenReferral, ageGroupLabel, sourceLabel, receivedDate, clinicDay } from './queue-model';
import { LogOutcomeSheet } from './LogOutcomeSheet';
import { ContactStepper } from './ContactStepper';
import { SmsComposerDialog } from './SmsComposerDialog';
import { BookedDialog, ReasonDialog, type ReasonKind } from './StatusDialogs';
import { UrgentDialog } from './UrgentDialog';

type DialogKind = 'log' | 'sms' | 'booked' | 'reopen' | 'urgent' | ReasonKind | null;

const FLAG_LABELS: Array<{ key: keyof ReferralFlags; label: string }> = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'existingPatient', label: 'Existing patient' },
  { key: 'sibling', label: 'Sibling' },
  { key: 'hcf', label: 'HCF, do not call' },
  { key: 'languageSupport', label: 'Language support' },
  { key: 'femaleOrthoRequested', label: 'Female orthodontist requested' },
];

export interface ReferralDetailViewProps {
  id: string;
  /** Phone or drawer use: shows a back link to the list. */
  backTo?: string;
  /** Today items are shown on the same screen when this is set, so the header can say why it is here. */
  focusItem?: TodayItem | null;
  /** page: header, then a two-column body at desktop widths. drawer: everything in one column. */
  variant?: 'page' | 'drawer';
}

/**
 * The referral record. Used by the full page and by the drawer on the work screens.
 * Patient identity is in the header on every screen, so every action is taken against a confirmed patient.
 */
export function ReferralDetailView({ id, backTo = '/referrals', focusItem = null, variant = 'page' }: ReferralDetailViewProps) {
  const user = useSessionUser();
  const now = useDemoNow();
  const referral = useReferral(id);
  const contacts = useContacts(id);
  const texts = useSmsMessages({ referralId: id, limit: 200 });
  const auditAll = useAudit();
  const attachments = useAttachments(id);
  const notices = useReferralNotices(id);
  const settings = useSettings();
  // Possible duplicates come from the server, for this patient only (not from a list of all referrals).
  const duplicates = useReferralDuplicates(id);
  const referrer = useReferrer(referral.data?.referrerId ?? undefined);
  const names = useNames();
  const updateReferral = useUpdateReferral();
  const changeStatus = useChangeStatus();
  const simulate = useSimulateSms();
  const addAttachment = useAddAttachment();
  const removeAttachment = useRemoveAttachment();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [tab, setTab] = useState<string>('overview');
  const [reopenReason, setReopenReason] = useState('');
  const [reopenError, setReopenError] = useState<string | undefined>();

  const r = referral.data;
  const cadence = settings.data?.cadence ?? DEFAULT_CADENCE;
  const open = r ? isOpenReferral(r) : false;
  const canLog = !!r && open && r.currentStep >= 1 && r.currentStep <= 3;
  const dups = r ? (duplicates.data ?? []) : [];

  // "l" opens the log outcome sheet from anywhere on the record, unless the user is typing or a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'l' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || dialog) return;
      if (canLog) {
        e.preventDefault();
        setDialog('log');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canLog, dialog]);

  if (referral.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading referral">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (referral.isError) {
    return <EmptyState icon="alert" title="This referral could not be loaded" description="Check the connection, then try again." action={<Button variant="secondary" onClick={() => void referral.refetch()}>Try again</Button>} />;
  }
  if (!r) {
    return <EmptyState icon="file" title="This referral could not be found" description="It may have been removed by an import rollback." action={<Link to={backTo} className="text-accent underline underline-offset-4">Back to referrals</Link>} />;
  }

  const next = nextAction(r, cadence, now);
  const timeline = buildTimeline(r.id, contacts.data ?? [], texts.data?.items ?? [], auditAll.data ?? [], cadence.steps, names.staff);
  const messageItems = timeline.filter((i) => String(i.id).startsWith('sms-'));
  const clinicName = names.clinic(r.preferredClinicId);
  const orthoName = names.ortho(r.preferredOrthodontistId);
  const referrerName = referrer.data ? `${referrer.data.title ?? ''} ${referrer.data.firstName} ${referrer.data.lastName}`.trim() : (r.referrerText?.name ?? '');
  const lastContact = (contacts.data ?? [])[0];
  const ownerId = r.assignedTo ?? lastContact?.staffId ?? null;
  const closeEntry = (auditAll.data ?? []).find((a) => a.entityId === r.id && a.entityType === 'referral' && a.action === 'status_change');
  const closedBy = closeEntry?.actorName ?? '';
  const phoneDigits = digitsOnly(r.phone);
  const tel = phoneDigits ? `tel:+61${phoneDigits.slice(1)}` : null;
  const dob = r.dob ? formatAuDate(r.dob) : 'Not set';

  const toCallUs = async () => {
    if (!user) return;
    const previous = r.status;
    try {
      await changeStatus.mutateAsync({ id: r.id, input: { status: 'to_call_us' }, actorId: user.id });
      showUndoToast('Marked to call us', () => changeStatus.mutateAsync({ id: r.id, input: { status: previous }, actorId: user.id }).then(() => undefined));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The status could not be changed.');
    }
  };

  const reopen = async () => {
    if (!user) return;
    if (!reopenReason.trim()) {
      setReopenError('Add a reason for reopening this referral.');
      return;
    }
    try {
      await changeStatus.mutateAsync({ id: r.id, input: { status: 'contacting', reason: reopenReason.trim() }, actorId: user.id });
      notifySuccess('Referral reopened');
      setDialog(null);
      setReopenReason('');
      setReopenError(undefined);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'The referral could not be reopened.');
    }
  };

  const toggleFlag = (key: keyof ReferralFlags, value: boolean) => {
    if (!user) return;
    // The urgent flag always needs a reason, so it opens a dialog instead of toggling here.
    if (key === 'urgent') return setDialog('urgent');
    updateReferral.mutate({ id: r.id, patch: { flags: { ...r.flags, [key]: value } }, actorId: user.id });
  };

  const sendDemoReply = (body: string) => {
    if (!user) return;
    simulate.mutate(
      { input: { kind: 'inbound_reply', referralId: r.id, fromPhone: r.phone ?? '', body }, actorId: user.id },
      { onSuccess: () => notifySuccess('Reply received in the timeline'), onError: (e) => notifyError(e.message) },
    );
  };

  const failLastText = () => {
    if (!user) return;
    const last = (texts.data?.items ?? []).find((m) => m.direction === 'outbound' && (m.status === 'sent' || m.status === 'delivered' || m.status === 'queued'));
    if (!last) {
      notifyError('There is no text to fail yet. Send one first.');
      return;
    }
    simulate.mutate(
      { input: { kind: 'delivery_failed', messageId: last.id, error: 'Number not reachable' }, actorId: user.id },
      { onSuccess: () => notifySuccess('Text failed. It is in Inbox.'), onError: (e) => notifyError(e.message) },
    );
  };

  const onPickFile = (file: File | undefined) => {
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      notifyError('This file is over 2 MB. Choose a smaller file.');
      return;
    }
    addAttachment.mutate(
      { referralId: r.id, file: { fileName: file.name, sizeBytes: file.size, mimeType: file.type || 'application/octet-stream', storagePath: `attachments/${r.id}/${file.name}` }, actorId: user.id },
      { onSuccess: () => notifySuccess('Attachment added'), onError: (e) => notifyError(e.message) },
    );
  };

  const isPage = variant === 'page';
  const primaryAction = canLog ? (
    <Button variant="primary" icon="phone" onClick={() => setDialog('log')}>
      Log contact
      <Kbd>L</Kbd>
    </Button>
  ) : open && r.currentStep === 0 ? (
    <Button variant="primary" icon="send" disabled={!r.phone} onClick={() => setDialog('sms')}>
      Send Coax #1
    </Button>
  ) : null;

  const detailsCard = (
    <Panel title="Details">
      <KeyValue
        items={[
          { label: 'Phone', value: <span className="tabular">{r.phone ? formatAuMobile(r.phone) : 'Not set'}</span> },
          { label: 'Patient type', value: r.ageGroup ? ageGroupLabel(r.ageGroup) : 'Not set' },
          { label: 'Location', value: clinicName ? (r.preferredClinicIsNearest ? `${clinicName} (nearest)` : clinicName) : 'Not set' },
          { label: 'Orthodontist', value: orthoName ? (r.preferredOrthodontistIsNextAvailable ? `${orthoName} (next available)` : orthoName) : 'Next available' },
          { label: 'Referrer', value: referrerName || 'Not recorded' },
          { label: 'Received', value: receivedDate(r) },
          { label: 'Owner', value: names.staff(ownerId) || 'Not assigned' },
          { label: 'Referral returned', value: r.refReturnedAt ? 'Yes' : 'No' },
          { label: 'Edge patient ID', value: r.edgePatientId ? <span className="tabular">{r.edgePatientId}</span> : 'Not booked yet' },
        ]}
      />
      {r.comments ? <p className="mt-3 whitespace-pre-line text-base text-ink-muted">{r.comments}</p> : null}
    </Panel>
  );

  const bookingPanel = (
    <Panel title="Booking" description="Book in Edge first, then record it here.">
      {r.edgePatientId ? (
        <KeyValue items={[{ label: 'Edge patient ID', value: <span className="tabular">{r.edgePatientId}</span> }, { label: 'Booked on', value: r.bookedAt ? formatAuDate(clinicDay(r.bookedAt)) : 'Not recorded' }]} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-ink-muted">{r.closedReason === 'booked' ? 'Closed as booked, but no Edge patient ID is recorded on this referral.' : 'Not booked in Edge yet. Record the Edge patient ID and booking date when it is booked.'}</p>
          {open ? (
            <Button variant="secondary" icon="check" className="w-fit" onClick={() => setDialog('booked')}>
              Mark booked
            </Button>
          ) : null}
        </div>
      )}
    </Panel>
  );

  const flagsPanel = (
    <Panel title="Flags">
      <div className="flex flex-col gap-3">
        {FLAG_LABELS.map((flag) => (
          <div key={flag.key} className="flex flex-col gap-1">
            <Checkbox id={`flag-${flag.key}`} checked={r.flags[flag.key]} onCheckedChange={(v) => toggleFlag(flag.key, v)} label={flag.label} disabled={updateReferral.isPending} />
            {flag.key === 'urgent' && r.flags.urgent && r.urgentReason ? <p className="pl-7 text-sm text-ink-muted">Reason: {r.urgentReason}</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  );

  const dncButton = open ? (
    <Button variant="secondary" icon="ban" className="w-full justify-center border-danger text-danger hover:bg-danger-bg" onClick={() => setDialog('do_not_contact')}>
      Mark as do not contact
    </Button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-5 pb-4">
      {backTo && !isPage ? (
        <Link to={backTo} className="inline-flex w-fit items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ICONS.back size={16} strokeWidth={1.5} aria-hidden="true" />
          Back to referrals
        </Link>
      ) : null}

      {/* Header: name as the title, sub-line, status pills, and the actions on the right. */}
      <header className={cn('flex min-w-0 flex-col gap-3', isPage && 'lg:flex-row lg:items-start lg:justify-between')}>
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className={cn('font-semibold text-ink', isPage ? 'text-xl' : 'text-lg')}>
            {r.patientFirstName} {r.patientLastName}
          </h1>
          <p className="text-base text-ink-muted">
            <span className="tabular">{r.referenceNumber}</span> · {r.ageGroup ? ageGroupLabel(r.ageGroup) : 'Age group not set'} · {clinicName || 'Clinic not set'} · DOB <span className="tabular">{dob}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {open && next ? (
              <Badge tone={next.overdue ? 'danger' : 'neutral'} icon={next.overdue ? 'alert' : 'clock'}>
                {next.label}
              </Badge>
            ) : null}
            <Badge tone="neutral" icon={SOURCE_META[r.source].icon}>
              {sourceLabel(r.source)}
            </Badge>
            {dups.length > 0 ? (
              <Badge tone="warning" icon="alert">
                Possible duplicate or sibling
              </Badge>
            ) : null}
            <span className="text-sm text-ink-muted">Received {receivedDate(r)}</span>
          </div>
          {focusItem ? <p className="text-base text-ink-muted">Listed today: {focusItem.reason}</p> : null}
        </div>

        {open ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Contact actions">
            {tel ? (
              <a href={tel} className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-base text-ink hover:border-line-strong">
                <ICONS.phoneCall size={16} strokeWidth={1.5} aria-hidden="true" />
                Call
              </a>
            ) : null}
            <Button variant="secondary" icon="message" disabled={!r.phone} onClick={() => setDialog('sms')}>
              SMS
            </Button>
            {primaryAction}
          </div>
        ) : null}
      </header>

      {/* Closed banner: says what happened, by whom, and offers one action. Action buttons that no longer apply are not shown. */}
      {r.closedReason ? (
        <div role="status" className="flex flex-col gap-3 rounded-panel border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ICONS.info size={20} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-muted" />
            <p className="text-base text-ink">
              <span className="font-semibold">Closed: {CLOSED_REASON_LABELS[r.closedReason]}</span>
              {r.closedAt ? ` on ${formatAuDate(clinicDay(r.closedAt))}` : ''}
              {closedBy ? ` by ${closedBy}` : ''}
              {r.closedReason === 'booked' && r.edgePatientId ? `, Edge ID ${r.edgePatientId}` : ''}
            </p>
          </div>
          <Button variant="secondary" icon="reply" onClick={() => setDialog('reopen')}>
            Reopen
          </Button>
        </div>
      ) : null}


      <Tabs value={tab} onValueChange={setTab} className="flex min-w-0 flex-col">
        <TabsList aria-label="Referral sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Audit</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="referrer">Referrer</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-5">
          <div className={cn('grid min-w-0 gap-5', isPage && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]')}>
            <div className="flex min-w-0 flex-col gap-5">
              <ContactStepper
                referral={r}
                cadence={cadence}
                contacts={contacts.data ?? []}
                texts={texts.data?.items ?? []}
                staffName={names.staff}
                canLog={canLog}
                now={now}
                onLog={(step) => setDialog(step === 0 ? 'sms' : 'log')}
              />
              {bookingPanel}
              {open ? (
                <Panel title="Other outcomes" description="Only when the patient or dentist asks for something else.">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" icon="phone" loading={changeStatus.isPending} onClick={() => void toCallUs()}>
                      To call us
                    </Button>
                    <Button variant="secondary" icon="x" onClick={() => setDialog('declined')}>
                      Declined
                    </Button>
                    <Button variant="secondary" icon="reply" onClick={() => setDialog('return')}>
                      Return to referrer
                    </Button>
                  </div>
                </Panel>
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              {detailsCard}
              {dncButton}
              {flagsPanel}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-5">
          <Panel title="Audit trail" description="Newest first. Every entry shows who and when.">
            <Timeline items={timeline} emptyText="Nothing logged yet. Texts and calls appear here as they happen." />
          </Panel>
        </TabsContent>

        <TabsContent value="messages" className="mt-5">
          <Panel title="Texts" description="Texts out and replies in, newest first.">
            <Timeline items={messageItems} emptyText="No texts yet. Send a Coax text to start the conversation." />
          </Panel>
        </TabsContent>

        <TabsContent value="referrer" className="mt-5 flex flex-col gap-5">
          <Panel title="Referrer notices" description="Letters and emails to the referrer for this referral. Send them from Referrer notices.">
            {notices.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (notices.data ?? []).length === 0 ? (
              <p className="text-base text-ink-muted">No notices for this referral yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {(notices.data ?? []).map((n) => (
                  <li key={n.id} className="flex flex-col gap-0.5 text-base">
                    <span className="text-ink">
                      {NOTICE_KIND_LABELS[n.kind]} · <span className="text-ink-muted">{n.status === 'sent' ? 'Sent' : n.status === 'dismissed' ? 'Dismissed' : 'Not sent yet'}</span>
                    </span>
                    <span className="text-sm text-ink-muted">
                      Created {formatDateTime(n.createdAt)}
                      {n.sentAt ? `, sent ${formatDateTime(n.sentAt)} by ${names.staff(n.sentBy ?? null) || 'staff'}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Referrer">
            {r.referrerId ? (
              <div className="flex flex-col gap-2">
                <p className="text-base text-ink">{referrerName || 'Referrer not loaded'}</p>
                <Link to={`/referrers/${r.referrerId}`} className="inline-flex w-fit items-center gap-1 text-base text-accent underline underline-offset-4">
                  Open referrer profile
                </Link>
              </div>
            ) : (
              <p className="text-base text-ink-muted">{referrerName ? `${referrerName}, not in the referrer master.` : 'No referrer recorded.'}</p>
            )}
          </Panel>
          {dups.length > 0 ? (
            <Panel title="Possible duplicate or sibling" description="Shares a phone number, or a surname and address, with another referral. Check before acting.">
              <ul className="flex flex-col gap-2">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-base">
                    <Link to={`/referrals/${d.id}`} className="tabular text-accent underline underline-offset-4">
                      {d.referenceNumber}
                    </Link>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </TabsContent>

        <TabsContent value="attachments" className="mt-5 flex flex-col gap-5">
          <Panel
            title="Attachments"
            actions={
              <>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    onPickFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button variant="secondary" size="sm" icon="upload" loading={addAttachment.isPending} onClick={() => fileInput.current?.click()}>
                  Add file
                </Button>
              </>
            }
          >
            {attachments.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : (attachments.data ?? []).length === 0 ? (
              <p className="text-base text-ink-muted">No files yet. Files up to 2 MB can be added.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(attachments.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-base">
                    <span className="min-w-0 truncate text-ink">{a.fileName}</span>
                    <IconButton icon="trash" aria-label={`Remove ${a.fileName}`} size="sm" onClick={() => removeAttachment.mutate({ attachmentId: a.id, referralId: r.id, actorId: user?.id ?? '' })} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {settings.data?.demoClockEnabled ? (
            <Panel title="Demo tools" description="Simulates what the Coax integration would send back. Demo only.">
              <div className="flex flex-col gap-2">
                <Button variant="secondary" size="sm" icon="reply" onClick={() => sendDemoReply('Yes please book')}>
                  Reply: Yes please book
                </Button>
                <Button variant="secondary" size="sm" icon="reply" onClick={() => sendDemoReply('Not interested, thanks')}>
                  Reply: Not interested
                </Button>
                <Button variant="secondary" size="sm" icon="reply" onClick={() => sendDemoReply('Wrong number')}>
                  Reply: Wrong number
                </Button>
                <Button variant="secondary" size="sm" icon="alert" onClick={failLastText}>
                  Fail the last text
                </Button>
              </div>
            </Panel>
          ) : null}
        </TabsContent>
      </Tabs>

      {dialog === 'log' && canLog ? <LogOutcomeSheet referral={r} cadence={cadence} open onOpenChange={(o) => setDialog(o ? 'log' : null)} /> : null}
      {dialog === 'sms' ? <SmsComposerDialog referral={r} open onOpenChange={(o) => setDialog(o ? 'sms' : null)} /> : null}
      {dialog === 'booked' ? <BookedDialog referral={r} open onOpenChange={(o) => setDialog(o ? 'booked' : null)} /> : null}
      {dialog === 'do_not_contact' || dialog === 'declined' || dialog === 'return' || dialog === 'unsuccessful' ? (
        <ReasonDialog referral={r} kind={dialog} open onOpenChange={(o) => setDialog(o ? dialog : null)} />
      ) : null}
      {dialog === 'urgent' ? <UrgentDialog referral={r} open onOpenChange={(o) => setDialog(o ? 'urgent' : null)} /> : null}
      {dialog === 'reopen' ? (
        <Dialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          title="Reopen referral?"
          description="The referral goes back to contacting, and the cadence resumes from its current step. Record why."
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button variant="primary" icon="reply" loading={changeStatus.isPending} onClick={() => void reopen()}>
                Reopen referral
              </Button>
            </>
          }
        >
          <Field label="Reason for reopening" required error={reopenError} hint="Recorded on the audit trail.">
            <Textarea rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          </Field>
        </Dialog>
      ) : null}
    </div>
  );
}

/** One timeline for everything on the referral: texts out and in, calls, notes, status changes and cadence tasks. */
function buildTimeline(
  referralId: string,
  contacts: Array<{ id: string; at: string; channel: string; outcome: keyof typeof OUTCOME_META; staffId: string | null; notes: string | null; step: number }>,
  texts: Array<{ id: string; direction: string; status: string; body: string; templateKey: string | null; createdAt: string; needsReview: boolean }>,
  audit: Array<{ id: string; at: string; entityId: string | null; entityType: string; actorName: string; actorId: string | null; action: string; summary: string }>,
  steps: Array<{ label: string }>,
  staffName: (id: string | null) => string,
): TimelineItem[] {
  const actorForText = new Map<string, string>();
  for (const a of audit) {
    if (a.entityType === 'sms_message' && a.entityId) actorForText.set(a.entityId, a.actorName);
  }
  const items: TimelineItem[] = [];
  for (const c of contacts) {
    const stepName = steps[c.step]?.label ?? `step ${c.step}`;
    items.push({
      id: `contact-${c.id}`,
      at: c.at,
      icon: c.channel === 'sms' ? 'send' : c.channel === 'email' ? 'mail' : 'phone',
      tone: 'accent',
      title: (
        <span>
          {OUTCOME_META[c.outcome].label} <span className="text-ink-muted">({c.channel}, {stepName})</span>
        </span>
      ),
      body: c.notes ?? undefined,
      actor: staffName(c.staffId) || 'Unknown user',
    });
  }
  for (const m of texts) {
    if (m.direction === 'inbound') {
      items.push({
        id: `sms-${m.id}`,
        at: m.createdAt,
        icon: 'reply',
        tone: 'info',
        title: (
          <span className="flex flex-wrap items-center gap-2">
            Reply received {m.needsReview ? <Badge tone="info">Needs review</Badge> : null}
          </span>
        ),
        body: `"${m.body}"`,
        actor: 'Patient or parent',
      });
    } else {
      items.push({
        id: `sms-${m.id}`,
        at: m.createdAt,
        icon: 'send',
        tone: 'neutral',
        title: (
          <span className="flex flex-wrap items-center gap-2">
            Text {m.templateKey ? `(${m.templateKey.replace(/_/g, ' ')})` : ''}
            <SmsStatusBadge status={m.status as 'queued' | 'sent' | 'delivered' | 'failed' | 'received'} />
          </span>
        ),
        body: m.body,
        actor: actorForText.get(m.id) ?? 'Coax',
      });
    }
  }
  for (const a of audit) {
    if (a.entityId !== referralId || a.entityType !== 'referral') continue;
    items.push({
      id: `audit-${a.id}`,
      at: a.at,
      icon: a.action === 'status_change' ? 'check' : 'file',
      tone: a.action === 'status_change' ? 'accent' : 'neutral',
      title: a.summary,
      actor: a.actorName,
    });
  }
  return items.sort((x, y) => y.at.localeCompare(x.at));
}
