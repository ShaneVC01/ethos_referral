/**
 * coax-send (internal)
 *
 * Sends one queued outbound text through Coax. Called by public-referral-submit and cadence-scheduler,
 * never by the browser. Requires the service role key as the bearer token.
 *
 * Body: { "messageId": "<uuid>" }
 *
 * A message with an invalid mobile, or one the carrier or Coax rejects, becomes `failed` with a plain
 * reason and needs_review = true, so it lands in the Inbox (src/features/queue Inbox) for a person to fix.
 *
 * COAX CONTRACT: the request and response shapes below are placeholders. Confirm them with Coax before
 * go live. Only sendToCoax() talks to Coax, so changing the contract touches one function.
 */
import { audit, json, serviceClient } from '../_shared/client.ts';

const AU_MOBILE = /^04\d{8}$/;

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Placeholder transport. Replace the URL, auth and body mapping with the confirmed Coax API. */
async function sendToCoax(to: string, body: string, reference: string): Promise<{ ok: true; coaxId: string } | { ok: false; error: string }> {
  const url = Deno.env.get('COAX_API_URL');
  const key = Deno.env.get('COAX_API_KEY');
  if (!url || !key) return { ok: false, error: 'Text sending is not configured.' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ to, body, reference }),
    });
    if (!res.ok) return { ok: false, error: `Coax returned ${res.status}.` };
    const data = (await res.json()) as { id?: string };
    if (!data.id) return { ok: false, error: 'Coax did not return a message id.' };
    return { ok: true, coaxId: data.id };
  } catch (err) {
    return { ok: false, error: `Coax could not be reached (${String(err).slice(0, 80)}).` };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('authorization') ?? '';
  if (!serviceKey || !constantTimeEquals(auth, `Bearer ${serviceKey}`)) return json({ error: 'Not allowed.' }, 401);

  const { messageId } = (await req.json().catch(() => ({}))) as { messageId?: string };
  if (!messageId) return json({ error: 'messageId is required.' }, 400);

  const client = serviceClient();
  const { data: message } = await client
    .from('sms_messages')
    .select('id, referral_id, direction, status, body, to_phone')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return json({ error: 'Message not found.' }, 404);
  if (message.direction !== 'outbound' || !['queued', 'failed'].includes(message.status)) {
    return json({ status: message.status, skipped: true });
  }

  const to = (message.to_phone ?? '').replace(/\D/g, '');
  if (!AU_MOBILE.test(to)) {
    await client
      .from('sms_messages')
      .update({ status: 'failed', error: 'Invalid mobile number', needs_review: true })
      .eq('id', message.id);
    await audit(client, { actorName: 'Coax', action: 'sms_failed', entityType: 'sms_message', entityId: message.id, summary: 'Text failed: invalid mobile number' });
    return json({ status: 'failed', error: 'Invalid mobile number' });
  }

  const result = await sendToCoax(to, message.body, message.id);
  if (!result.ok) {
    await client.from('sms_messages').update({ status: 'failed', error: result.error, needs_review: true }).eq('id', message.id);
    await audit(client, { actorName: 'Coax', action: 'sms_failed', entityType: 'sms_message', entityId: message.id, summary: `Text failed: ${result.error}` });
    return json({ status: 'failed', error: result.error });
  }

  await client.from('sms_messages').update({ status: 'sent', coax_id: result.coaxId, error: null, needs_review: false }).eq('id', message.id);
  await audit(client, { actorName: 'Coax', action: 'sms_sent', entityType: 'sms_message', entityId: message.id, summary: 'Text sent' });
  return json({ status: 'sent', coaxId: result.coaxId });
});
