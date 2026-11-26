/**
 * coax-webhook
 *
 * Receives Coax events: delivery status changes and inbound replies. This is the only public endpoint
 * that changes existing messages, so every request must carry a valid signature.
 *
 * Signature: HMAC-SHA256 of the raw request body with COAX_WEBHOOK_SECRET, hex encoded, sent in the
 * `x-coax-signature` header. ASSUMPTION: Coax signs this way. Confirm the header name, encoding and
 * whether a timestamp is included before go live. The check fails closed if the secret is missing.
 *
 * Events (JSON):
 *  { "type": "delivery_status", "coaxId": "...", "status": "delivered" | "failed", "error"?: "..." }
 *  { "type": "inbound", "from": "04xxxxxxxx", "body": "...", "receivedAt"?: "ISO" }
 *
 * Failures and replies that ask to book are flagged needs_review, so they appear in the Inbox.
 */
import { audit, digitsOnly, json, serviceClient } from '../_shared/client.ts';

const BOOK_INTENT = /\b(book|booking|appointment|appt|yes please|please call|call me)\b/i;

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type CoaxEvent =
  | { type: 'delivery_status'; coaxId: string; status: 'delivered' | 'failed'; error?: string }
  | { type: 'inbound'; from: string; body: string; receivedAt?: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const secret = Deno.env.get('COAX_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'Webhook is not configured.' }, 503);

  const raw = await req.text();
  const given = req.headers.get('x-coax-signature') ?? '';
  const expected = await hmacHex(secret, raw);
  if (!constantTimeEquals(given.toLowerCase(), expected)) return json({ error: 'Signature check failed.' }, 401);

  let event: CoaxEvent;
  try {
    event = JSON.parse(raw) as CoaxEvent;
  } catch {
    return json({ error: 'Body is not JSON.' }, 400);
  }

  const client = serviceClient();

  if (event.type === 'delivery_status') {
    const { data: message } = await client.from('sms_messages').select('id, referral_id').eq('coax_id', event.coaxId).maybeSingle();
    if (!message) return json({ status: 'unknown message' }, 202);
    if (event.status === 'delivered') {
      await client.from('sms_messages').update({ status: 'delivered', error: null, needs_review: false }).eq('id', message.id);
      return json({ status: 'delivered' });
    }
    const reason = event.error?.slice(0, 200) || 'Delivery failed';
    await client.from('sms_messages').update({ status: 'failed', error: reason, needs_review: true }).eq('id', message.id);
    await audit(client, { actorName: 'Coax', action: 'sms_failed', entityType: 'sms_message', entityId: message.id, summary: `Text failed: ${reason}` });
    return json({ status: 'failed' });
  }

  if (event.type === 'inbound') {
    const phone = digitsOnly(event.from) ?? '';
    const last9 = phone.slice(-9);
    // Match the most recent referral with the same mobile. Patient names are never matched automatically.
    const { data: referral } = last9
      ? await client.from('referrals').select('id').like('phone', `%${last9}`).order('received_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    const { data: lastOutbound } = referral
      ? await client.from('sms_messages').select('id').eq('referral_id', referral.id).eq('direction', 'outbound').order('created_at', { ascending: false }).limit(1).maybeSingle()
      : { data: null };
    const wantsBooking = BOOK_INTENT.test(event.body);
    const { data: inserted } = await client
      .from('sms_messages')
      .insert({
        referral_id: referral?.id ?? null,
        direction: 'inbound',
        body: event.body.slice(0, 1600),
        from_phone: phone || null,
        status: 'received',
        in_reply_to_id: lastOutbound?.id ?? null,
        needs_review: wantsBooking || !referral,
      })
      .select('id')
      .single();
    await audit(client, {
      actorName: 'Coax',
      action: 'sms_received',
      entityType: 'sms_message',
      entityId: inserted?.id ?? null,
      summary: !referral ? 'Reply received, not matched to a referral' : wantsBooking ? 'Reply received, asks to book' : 'Reply received',
    });
    return json({ status: 'received', matched: !!referral, needsReview: wantsBooking || !referral }, 202);
  }

  return json({ error: 'Unknown event type.' }, 400);
});
