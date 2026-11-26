/**
 * cadence-scheduler
 *
 * Run once a day by pg_cron (see supabase/README.md). Service role only.
 *
 * What it automates: the 3 month final step. When a referral reaches step 3 and the final action is due,
 * it queues and sends Coax #4, then closes the referral as unsuccessful (if the setting is on) and creates
 * a referrer notification (if that setting is on). Nothing is sent to the referrer automatically.
 *
 * What it does not do, by design: the Day 1 and Day 14 texts go out when staff log the call, so the
 * text and the call stay together, as the process doc requires. Coax #1 goes out at receipt
 * (public-referral-submit). The Today queue in the app shows the calls that are due.
 *
 * Idempotent: a referral already closed is skipped, and a second run on the same day finds nothing to do.
 */
import { audit, json, serviceClient } from '../_shared/client.ts';

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || req.headers.get('authorization') !== `Bearer ${serviceKey}`) return json({ error: 'Not allowed.' }, 401);
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const client = serviceClient();
  const now = new Date().toISOString();

  const { data: settings } = await client
    .from('app_settings')
    .select('close_unsuccessful_after_final, notify_referrer_on_unsuccessful')
    .eq('id', 'default')
    .maybeSingle();
  const closeAfterFinal = settings?.close_unsuccessful_after_final ?? true;
  const notifyReferrer = settings?.notify_referrer_on_unsuccessful ?? true;

  const { data: due, error } = await client
    .from('referrals')
    .select('id, referrer_id, phone, preferred_clinic_id, patient_first_name')
    .in('status', ['new', 'contacting', 'to_call_us'])
    .is('closed_reason', null)
    .eq('current_step', 3)
    .lte('next_action_at', now)
    .limit(500);
  if (error) return json({ error: 'Could not read the queue.' }, 500);

  const { data: template } = await client.from('sms_templates').select('body').eq('key', 'coax_4_final').maybeSingle();
  const clinicPhone = Deno.env.get('CLINIC_PUBLIC_PHONE') ?? '';
  let processed = 0;

  for (const referral of due ?? []) {
    const { data: clinic } = referral.preferred_clinic_id
      ? await client.from('clinics').select('name').eq('id', referral.preferred_clinic_id).maybeSingle()
      : { data: null };
    const body = (template?.body ?? '')
      .replaceAll('{patientFirstName}', referral.patient_first_name)
      .replaceAll('{clinicName}', clinic?.name ?? 'Ethos Orthodontics')
      .replaceAll('{clinicPhone}', clinicPhone);

    const { data: queued } = await client
      .from('sms_messages')
      .insert({
        referral_id: referral.id,
        direction: 'outbound',
        template_key: 'coax_4_final',
        body,
        to_phone: referral.phone,
        status: 'queued',
      })
      .select('id')
      .single();

    if (queued) {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/coax-send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ messageId: queued.id }),
      }).catch((err) => console.error('coax-send invoke failed', String(err)));
    }

    if (closeAfterFinal) {
      await client
        .from('referrals')
        .update({ status: 'unsuccessful', closed_reason: 'unsuccessful', closed_at: now, current_step: 4, next_action_at: null })
        .eq('id', referral.id);
      await audit(client, { actorName: 'Cadence', action: 'status_change', entityType: 'referral', entityId: referral.id, summary: 'Closed as unsuccessful after the final text' });
      if (notifyReferrer && referral.referrer_id) {
        const { data: notification } = await client
          .from('referrer_notifications')
          .insert({ referrer_id: referral.referrer_id, referral_id: referral.id, kind: 'unsuccessful_contact', status: 'pending' })
          .select('id')
          .single();
        await audit(client, { actorName: 'Cadence', action: 'notification_created', entityType: 'referrer_notification', entityId: notification?.id ?? null, summary: 'Referrer notification created for an unsuccessful referral' });
      }
    }
    processed += 1;
  }

  return json({ processed, runAt: now });
});
