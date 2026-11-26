import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { toast } from '@/components/ui/toast';
import { useCreateReferral, useDemoNow, useLookups, useSendSms, useSmsTemplates } from '@/data/hooks';
import { formatAuMobile, renderTemplate, unresolvedFields } from '@/domain';
import { INTAKE_CHANNEL, OUTBOX_KEY, readOutbox, removeFromOutbox, submissionEnvelopeSchema, type PublicSubmissionEnvelope } from '@/public/bridge';
import { clinicForText, publicToNewReferral } from './intakeModel';

/**
 * Mounted once in the staff shell. Takes website submissions from the public form and creates each one
 * as a referral (source ethos_online) with Coax #1 queued.
 *
 * Two routes in, both idempotent by submission id:
 *  - a BroadcastChannel message from a public form open in the same browser (live)
 *  - the localStorage outbox, read once the data is ready, and again when another tab writes to it
 *
 * An entry leaves the outbox only after its referral exists, so a failed save is retried on the next load.
 * Prototype limits: each browser tab has its own in-memory mock data, and attachments are listed in the
 * comments rather than transported (see the intake notes).
 */
export function PublicOutboxBridge() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const demoNow = useDemoNow();
  const lookups = useLookups();
  const templates = useSmsTemplates();
  const createReferral = useCreateReferral();
  const sendSms = useSendSms();

  const actorId = user?.id ?? null;
  const ready = !!actorId && !!lookups.data && !!templates.data;

  // Everything the handlers need, read at call time so listeners do not need re-attaching.
  const latest = useRef({ lookups: lookups.data, templates: templates.data, demoNow, actorId, navigate });
  latest.current = { lookups: lookups.data, templates: templates.data, demoNow, actorId, navigate };
  const createAsync = useRef(createReferral.mutateAsync);
  createAsync.current = createReferral.mutateAsync;
  const sendAsync = useRef(sendSms.mutateAsync);
  sendAsync.current = sendSms.mutateAsync;

  const inFlight = useRef(new Set<string>());

  const ingest = async (envelope: PublicSubmissionEnvelope) => {
    const now = latest.current;
    if (!now.lookups || !now.templates || !now.actorId) return; // stays in the outbox until ready
    if (inFlight.current.has(envelope.id)) return;
    inFlight.current.add(envelope.id);
    try {
      const input = publicToNewReferral(envelope, now.lookups, now.demoNow.toISOString());
      const referral = await createAsync.current({ input, actorId: now.actorId });

      const template = now.templates.find((t) => t.key === 'coax_1_standard');
      if (template && referral.phone) {
        const clinic = clinicForText(now.lookups, input.preferredClinicId, input.preferredClinicIsNearest);
        const body = renderTemplate(template.body, { first_name: referral.patientFirstName, clinic, reference: envelope.id });
        if (unresolvedFields(body).length === 0) {
          await sendAsync.current({
            input: { referralId: referral.id, toPhone: referral.phone, body, templateKey: template.key, step: 0 },
            actorId: now.actorId,
          });
        }
      }

      removeFromOutbox([envelope.id]);
      toast.success('Website referral received', {
        description: `Reference ${envelope.id}. Coax #1 is queued to ${formatAuMobile(referral.phone)}.`,
        action: { label: 'Open referral', onClick: () => now.navigate(`/referrals/${referral.id}`) },
      });
    } catch {
      toast.error('A website referral could not be saved yet. It will try again on the next load.', { duration: 8000 });
    } finally {
      inFlight.current.delete(envelope.id);
    }
  };

  const drain = () => {
    for (const envelope of readOutbox()) void ingest(envelope);
  };

  // Keep the latest handlers reachable from the listeners below.
  const handlers = useRef({ ingest, drain });
  handlers.current = { ingest, drain };

  // Live channel and storage listeners, attached once per signed-in user.
  useEffect(() => {
    if (!actorId) return;
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(INTAKE_CHANNEL);
      channel.onmessage = (event: MessageEvent<{ type?: string; envelope?: unknown }>) => {
        if (event.data?.type !== 'submitted') return;
        const parsed = submissionEnvelopeSchema.safeParse(event.data.envelope);
        if (parsed.success) void handlers.current.ingest(parsed.data);
      };
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === OUTBOX_KEY) handlers.current.drain();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      channel?.close();
    };
  }, [actorId]);

  // Pick up anything already waiting once the data is ready.
  useEffect(() => {
    if (ready) handlers.current.drain();
  }, [ready]);

  return null;
}
