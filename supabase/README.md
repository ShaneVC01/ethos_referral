# Supabase: Ethos Referrals

This folder holds the database, row level security, read models and Edge Functions for the Supabase
conversion. The prototype runs on the in-memory mock (`VITE_DATA_ADAPTER=mock`). Nothing here is
required to run the app today.

## Layout

| Path | What it is |
|---|---|
| `migrations/0001_schema.sql` | Enums, tables, foreign keys, indexes, `updated_at` triggers. Mirrors `src/domain/entities.ts` and `enums.ts` |
| `migrations/0002_rls.sql` | Row Level Security. Manager full access, agent working access, anon nothing, private attachment bucket |
| `migrations/0003_views.sql` | `v_today_queue`, `v_kpi_monthly`, `v_inbox_review`, `v_overdue_by_step`. All use `security_invoker` |
| `seed.sql` | Non-personal defaults: settings, cadence, the six SMS templates, staff initials. Not patient data |
| `functions/public-referral-submit` | Public form write path. Turnstile, schema, files, dedupe, insert, queue Coax #1 |
| `functions/coax-send` | Internal. Sends one queued text through Coax |
| `functions/coax-webhook` | Coax delivery status and inbound replies. HMAC signature required |
| `functions/cadence-scheduler` | Daily. Sends the 3 month final text and closes the referral |
| `functions/_shared/client.ts` | Service client, JSON helper, audit writer, dedupe key (mirrors `src/domain/helpers.ts`) |

## Apply order

1. Create a Supabase project. Enable `pg_cron` and `pg_net` in Database, Extensions.
2. Apply the migrations in file order with the Supabase CLI: `supabase db push`. Each file depends on the one before.
3. Create the first manager: sign up through Auth, then insert a `staff` row and a `profiles` row
   linking the Auth user to it with `role = 'manager'`. Do this in the SQL editor with the service role.
4. Run `seed.sql` once. It is safe to re-run (`on conflict do nothing`).
5. Load the tracker data through the app's import screen, not by hand. See "Dedupe" below.

Migration rule: never edit a migration that has been applied anywhere. Add `0004_...` and so on.
Add-column changes must sort after the create-table they alter.

## Environment variables

| Name | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | all functions | Set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | all functions | Set by Supabase. Never ship to the browser |
| `TURNSTILE_SECRET_KEY` | public-referral-submit | Turnstile secret. Missing means every submission is refused |
| `COAX_API_URL`, `COAX_API_KEY` | coax-send | Confirm the Coax contract first |
| `COAX_WEBHOOK_SECRET` | coax-webhook | Shared with Coax for the HMAC signature |
| `CLINIC_PUBLIC_PHONE` | public-referral-submit, cadence-scheduler | Stand-in until the clinic phone is in the data model |

Set them with `supabase secrets set NAME` and enter each value at the prompt. Do not paste values into
chat, commit files, or put them in `wrangler.toml`.

## Scheduling the cadence

Run `cadence-scheduler` daily at 06:00 Brisbane (20:00 UTC, Brisbane has no daylight saving). Store the
service key in Vault, not in a plain setting:

```sql
select cron.schedule('cadence-daily', '0 20 * * *', $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/cadence-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);
```

## Queries, paging and the 1,000 row limit

Supabase (PostgREST) returns at most **1,000 rows per request** by default (`max_rows`). The app is
built around that limit and must stay that way when the adapter is implemented:

- Every list query runs on the server: filters, search, `ORDER BY` and paging (`LIMIT` and `OFFSET`,
  or `.range(from, to)`), with `count: 'exact'` (or a `count(*) over ()` column) for the total.
  The page size is 100 (`PAGE_SIZE` in `src/data/repository.ts`); never request more than 1,000
  (`SERVER_MAX_ROWS`).
- The client never downloads a table to filter, search, sort or count it. Paging and filtering only on
  the client is not allowed, for performance and because a page is not the whole set.
- Search is a server query over the full table (for example `ilike` or a trigram or full text index on
  the searched columns), re-run on each search, never a filter over the rows on screen.
- List methods return denormalised rows (`ReferralRow`, `ReferrerRow`, `SmsRow`, `NoticeRow`). Build
  them with a view or an RPC (`security invoker`, so RLS still applies) that joins the names in.
- Sort fields are a fixed allow list per list (`ReferralSortField` and friends). Map each to a column
  in the RPC; never interpolate a client value into SQL.
- Aggregates are database functions or views, not client loops: work queue buckets and counts,
  dashboard metrics, CSV export and import referrer matching. Edge Functions are used where a call
  leaves the database (Coax, email).
- In the prototype the mock adapter (`src/data/mock/index.ts`) plays the server and enforces the same
  rules: 100 rows by default and never more than 1,000 per call.

## Switching the app to Supabase

1. Implement the methods in `src/data/supabase/index.ts`. Each one currently throws
   `Supabase adapter not implemented`. The UI does not change, because it talks to `data/hooks.ts` only.
2. Set `VITE_DATA_ADAPTER=supabase` and `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in the build environment.
3. Route guards: replace the prototype sign-in in `src/app/auth.tsx` with Supabase Auth. The guards
   keep the same shape.

## Security model

- anon has no table grants and no RLS policy. The public form cannot read or write tables directly.
- The public write path is the Edge Function only, because only it can check Turnstile before it writes.
  No database function is granted to anon. This is a deliberate change from the plan's "insert through a
  function", since a database function cannot verify Turnstile.
- Staff reach the data as `authenticated` users. Role comes from `profiles` through `current_staff_role()`.
- Audit rows come from the server (service role). Summaries never contain patient names.
- Attachments are in the private bucket `referral-attachments`. Downloads use signed URLs, created by the app.

## Dedupe

`referrals.dedupe_key` is `last name | first name | last 9 phone digits [| DOB]`, normalised the same way as
`dedupeKey` in `src/domain/helpers.ts`. The index is not unique on purpose. A public submission that matches an
existing key is kept and flagged `flag_existing_patient` with a note, so staff can check it. The importer merges
copies of the same patient across monthly tabs. Re-importing the same file creates no new rows, because row hashes
are stored in `import_rows`.

## Open issues

1. **Merge field names.** The Settings editor uses `{patientFirstName}`, `{clinicName}`, `{clinicPhone}`,
   `{orthoName}`, `{referrerName}`. `src/domain/templates.ts` still uses `{{first_name}}`, `{{clinic}}`,
   `{{reference}}`. The send path must render one set. The seed uses the new names.
2. **Clinic phone** is not in `clinics`. Add a column, then remove `CLINIC_PUBLIC_PHONE`.
3. **Coax contract.** Request and response shapes in `coax-send` and the webhook payloads are placeholders.
4. **Webhook signature.** The header name, encoding and any timestamp need confirming with Coax.
5. **Public form transport.** The form sends JSON today. The Edge Function needs multipart form data
   (`payload`, `cf-turnstile-response`, `file-N`). Change the form when the Supabase adapter goes live.
6. **Reference numbers** are sequential, and the public response returns one. This is acceptable for a
   confirmation number, but it does reveal approximate volume.
7. **Age group thresholds** (A, Y, C) are assumed in both the app and `public-referral-submit`. Confirm them.
8. **Staff roles in seed.** BM is set as manager as an assumption. Confirm before loading.
9. **Not run.** The SQL and Edge Functions have not been executed against a live Supabase project.
   Run `supabase db reset` locally and deploy the functions to a dev project before relying on them.
