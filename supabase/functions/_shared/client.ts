/**
 * Shared helpers for the Edge Functions. Runs on Deno. Import with a relative path from each function.
 * Every function here uses the service role, so each one must check its caller itself.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Digits only, Australian national form. Used by the dedupe key and the webhook phone match. */
export function digitsOnly(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  return d.length ? d : null;
}

/**
 * Mirror of normaliseName in src/domain/helpers.ts. Keep the two in step.
 * Strips accents, lower-cases, removes everything except a to z and spaces, and collapses spaces.
 */
export function normaliseName(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Mirror of dedupeKey in src/domain/helpers.ts: last name | first name | last 9 phone digits [| dob]. */
export function dedupeKey(input: { firstName: string; lastName: string; phone?: string | null; dob?: string | null }): string {
  const phone = digitsOnly(input.phone)?.slice(-9) ?? '';
  const parts = [normaliseName(input.lastName), normaliseName(input.firstName), phone];
  if (input.dob) parts.push(input.dob);
  return parts.join('|');
}

/** Writes one audit row. Summaries must never contain patient names. */
export async function audit(
  client: SupabaseClient,
  row: { actorName: string; action: string; entityType: string; entityId: string | null; summary: string; actorId?: string | null },
): Promise<void> {
  const { error } = await client.from('audit_log').insert({
    actor_id: row.actorId ?? null,
    actor_name: row.actorName,
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId,
    summary: row.summary,
  });
  if (error) console.error('audit insert failed', error.message);
}
