-- 0002_rls.sql
-- Row Level Security. Depends on 0001_schema.sql.
--
-- Rules:
--  - anon (signed out, including the public form) has no table access at all.
--  - The public form writes only through the Edge Function public-referral-submit, which uses the
--    service role after a Turnstile check. No database function is granted to anon, because a
--    database function cannot verify Turnstile.
--  - manager: full access to every table.
--  - agent: reads lookups, referrers and settings. Reads and writes referrals, contact attempts,
--    texts, attachments and referrer notification status. Cannot change settings, imports, audit or staff.
--  - Audit rows are written by the server (service role or security definer functions), never by clients.

-- ---------------------------------------------------------------------------
-- Role helper. security definer so policies can read profiles without recursion.
-- ---------------------------------------------------------------------------
create or replace function public.current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from profiles p
  join staff s on s.id = p.staff_id
  where p.id = auth.uid() and s.active
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere and remove anon grants
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'clinics', 'clinic_aliases', 'orthodontists', 'ortho_aliases', 'clinic_roster', 'staff', 'profiles',
    'practices', 'referrers', 'referrer_history', 'referrals', 'contact_attempts', 'sms_templates',
    'sms_messages', 'attachments', 'referrer_notifications', 'app_settings', 'cadence_steps',
    'import_batches', 'import_rows', 'audit_log'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon', t);
    execute format('grant select, insert, update, delete on table %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Manager: full access to every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'clinics', 'clinic_aliases', 'orthodontists', 'ortho_aliases', 'clinic_roster', 'staff', 'profiles',
    'practices', 'referrers', 'referrer_history', 'referrals', 'contact_attempts', 'sms_templates',
    'sms_messages', 'attachments', 'referrer_notifications', 'app_settings', 'cadence_steps',
    'import_batches', 'import_rows', 'audit_log'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on %I for all to authenticated using (public.current_staff_role() = ''manager'') with check (public.current_staff_role() = ''manager'')',
      'manager_all_' || t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Agent: read lookups, referrers, templates and settings
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'clinics', 'clinic_aliases', 'orthodontists', 'ortho_aliases', 'clinic_roster', 'staff',
    'practices', 'referrers', 'referrer_history', 'sms_templates', 'app_settings', 'cadence_steps'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on %I for select to authenticated using (public.current_staff_role() = ''agent'')',
      'agent_read_' || t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Agent: working tables
-- ---------------------------------------------------------------------------
create policy agent_read_referrals on referrals for select to authenticated using (public.current_staff_role() = 'agent');
create policy agent_insert_referrals on referrals for insert to authenticated with check (public.current_staff_role() = 'agent');
create policy agent_update_referrals on referrals for update to authenticated
  using (public.current_staff_role() = 'agent') with check (public.current_staff_role() = 'agent');

create policy agent_read_contacts on contact_attempts for select to authenticated using (public.current_staff_role() = 'agent');
create policy agent_insert_contacts on contact_attempts for insert to authenticated with check (public.current_staff_role() = 'agent');

create policy agent_read_sms on sms_messages for select to authenticated using (public.current_staff_role() = 'agent');
create policy agent_insert_sms on sms_messages for insert to authenticated with check (public.current_staff_role() = 'agent');
create policy agent_update_sms on sms_messages for update to authenticated
  using (public.current_staff_role() = 'agent') with check (public.current_staff_role() = 'agent');

create policy agent_read_attachments on attachments for select to authenticated using (public.current_staff_role() = 'agent');
create policy agent_insert_attachments on attachments for insert to authenticated with check (public.current_staff_role() = 'agent');
create policy agent_delete_attachments on attachments for delete to authenticated using (public.current_staff_role() = 'agent');

create policy agent_read_notifications on referrer_notifications for select to authenticated using (public.current_staff_role() = 'agent');
create policy agent_update_notifications on referrer_notifications for update to authenticated
  using (public.current_staff_role() = 'agent') with check (public.current_staff_role() = 'agent');

-- ---------------------------------------------------------------------------
-- Everyone signed in: their own profile
-- ---------------------------------------------------------------------------
create policy own_profile_read on profiles for select to authenticated using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: private bucket for referral attachments (2 MB per file, pdf, jpeg, png)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('referral-attachments', 'referral-attachments', false, 2097152, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy staff_read_attachment_objects on storage.objects for select to authenticated
  using (bucket_id = 'referral-attachments' and public.current_staff_role() in ('manager', 'agent'));
create policy staff_upload_attachment_objects on storage.objects for insert to authenticated
  with check (bucket_id = 'referral-attachments' and public.current_staff_role() in ('manager', 'agent'));
create policy manager_delete_attachment_objects on storage.objects for delete to authenticated
  using (bucket_id = 'referral-attachments' and public.current_staff_role() = 'manager');
