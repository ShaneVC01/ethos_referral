-- 0001_schema.sql
-- Ethos Referrals: tables, enums, foreign keys, indexes and updated_at triggers.
-- Mirrors src/domain/entities.ts and src/domain/enums.ts. Keep enum values identical: they are stored.
-- Greenfield migration (no data yet). Later changes go in new numbered files, never edits to this one.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type referral_source as enum (
  'ethos_online', 'email', 'phone', 'handwritten_scan', 'practice_template',
  'mediref', 'wetransfer', 'sendinc', 'kiteworks', 'patient_referral', 'other'
);

create type referral_status as enum (
  'new', 'contacting', 'to_call_us', 'booked', 'do_not_contact', 'unsuccessful', 'declined'
);

create type contact_outcome as enum (
  'lm_coax_sent', 'called_booked', 'spoke_pt_parent', 'booked_via_cc', 'coax_sent', 'emailed'
);

create type contact_channel as enum ('sms', 'call', 'email');

create type age_group as enum ('A', 'Y', 'C');

create type submission_type as enum ('new_appointment', 'referring_patient');

create type sms_status as enum ('queued', 'sent', 'delivered', 'failed', 'received');

create type sms_direction as enum ('outbound', 'inbound');

create type staff_role as enum ('manager', 'agent');

create type import_result as enum ('new', 'unchanged', 'updated', 'conflict', 'error');

create type import_batch_status as enum ('staged', 'committed', 'rolled_back');

create type referrer_notification_kind as enum (
  'thank_you', 'missing_info', 'unsuccessful_contact', 'referral_returned'
);

create type referrer_notification_status as enum ('pending', 'sent', 'dismissed');

create type closed_reason as enum ('booked', 'unsuccessful', 'declined', 'do_not_contact', 'returned');

create type offset_unit as enum ('day', 'month');

create type audit_action as enum (
  'create', 'update', 'status_change', 'contact_logged', 'sms_sent', 'sms_failed', 'sms_received',
  'import_staged', 'import_committed', 'import_rolled_back', 'settings_updated', 'notification_created'
);

-- Human reference numbers, e.g. REF-2026-000123. Year is the Brisbane calendar year at insert time.
create sequence referral_reference_seq start 1;

-- ---------------------------------------------------------------------------
-- Helper: updated_at maintained by trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookups: clinics, orthodontists, roster, staff
-- ---------------------------------------------------------------------------
create table clinics (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- canonical tracker code, e.g. UMG, TWG
  name text not null,
  opened_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clinics_updated_at before update on clinics for each row execute function set_updated_at();

create table clinic_aliases (
  alias text primary key,                    -- TOOW, CLEVE ... stored as typed; matched case-insensitively
  clinic_id uuid not null references clinics (id) on delete cascade
);
create unique index clinic_aliases_lower_alias on clinic_aliases (lower(alias));

create table orthodontists (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,           -- AC, MAT, KSF
  full_name text not null,
  start_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger orthodontists_updated_at before update on orthodontists for each row execute function set_updated_at();

create table ortho_aliases (
  alias text primary key,
  orthodontist_id uuid not null references orthodontists (id) on delete cascade,
  confirmed boolean not null default true    -- false for guessed aliases; the importer flags them
);
create unique index ortho_aliases_lower_alias on ortho_aliases (lower(alias));

create table clinic_roster (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),   -- 1 = Monday
  orthodontist_id uuid not null references orthodontists (id) on delete cascade,
  notes text
);
create index clinic_roster_clinic_day on clinic_roster (clinic_id, weekday);

create table staff (
  id uuid primary key default gen_random_uuid(),
  initials text not null unique,
  name text not null,
  role staff_role not null default 'agent',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_updated_at before update on staff for each row execute function set_updated_at();

-- Links a Supabase Auth user to a staff record and role. Written by an admin, never by the public.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  staff_id uuid unique references staff (id) on delete set null,
  role staff_role not null default 'agent',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Referrers and practices
-- ---------------------------------------------------------------------------
create table practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  suburb text,
  state text,
  postcode text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, postcode)                    -- importer upserts on name plus postcode
);
create trigger practices_updated_at before update on practices for each row execute function set_updated_at();

create table referrers (
  id text primary key check (id ~ '^R[0-9]+$'),   -- kept from Referrer Master, e.g. R1234
  segment text not null default '',
  type text not null default '',
  practice_id uuid references practices (id) on delete set null,
  title text,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  email text,
  address text,
  primary_clinic_id uuid references clinics (id) on delete set null,
  primary_orthodontist_id uuid references orthodontists (id) on delete set null,
  fy_referrals integer not null default 0 check (fy_referrals >= 0),
  total_referrals integer not null default 0 check (total_referrals >= 0),
  total_started integer not null default 0 check (total_started >= 0),
  last_referral_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index referrers_name on referrers (lower(last_name), lower(first_name));
create trigger referrers_updated_at before update on referrers for each row execute function set_updated_at();

create table referrer_history (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null references referrers (id) on delete cascade,
  received_on date not null,
  edge_patient_ref text,                     -- Edge reference only. No names are held here
  clinic_id uuid references clinics (id) on delete set null,
  orthodontist_id uuid references orthodontists (id) on delete set null,
  booked boolean not null default false,
  notes text
);
create index referrer_history_referrer on referrer_history (referrer_id, received_on);

-- ---------------------------------------------------------------------------
-- Referrals and the cadence log
-- ---------------------------------------------------------------------------
create table referrals (
  id uuid primary key default gen_random_uuid(),
  reference_number text not null unique
    default 'REF-' || to_char(now() at time zone 'Australia/Brisbane', 'YYYY') || '-' || lpad(nextval('referral_reference_seq')::text, 6, '0'),
  received_at timestamptz not null default now(),
  source referral_source not null,
  submission_type submission_type not null default 'new_appointment',
  patient_first_name text not null,
  patient_last_name text not null,
  dob date,
  age_group age_group,
  age_group_overridden boolean not null default false,
  phone text,                                -- digits-only AU form where possible
  contact_person text,
  email text,
  address text,
  preferred_clinic_id uuid references clinics (id) on delete set null,
  preferred_clinic_is_nearest boolean not null default false,
  preferred_orthodontist_id uuid references orthodontists (id) on delete set null,
  preferred_orthodontist_is_next_available boolean not null default false,
  referrer_id text references referrers (id) on delete set null,
  referrer_text jsonb,                       -- { name, address, phone, email } when referrer_id is null
  comments text,
  flag_urgent boolean not null default false,
  flag_existing_patient boolean not null default false,
  flag_sibling boolean not null default false,
  flag_hcf boolean not null default false,
  flag_language_support boolean not null default false,
  flag_female_ortho_requested boolean not null default false,
  edge_patient_id text,
  booked_at timestamptz,
  status referral_status not null default 'new',
  current_step smallint not null default 0 check (current_step between 0 and 4),
  next_action_at timestamptz,
  assigned_to uuid references staff (id) on delete set null,
  ref_returned_at timestamptz,
  closed_reason closed_reason,
  closed_at timestamptz,
  dedupe_key text not null,                  -- last|first|phone9|dob, see the dedupe note in supabase/README.md
  import_batch_id uuid,                      -- set by the importer; FK added below
  import_sheet text,
  import_row integer,
  created_at timestamptz not null default now(),
  created_by uuid references staff (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint referrals_booked_has_edge check (status <> 'booked' or edge_patient_id is not null or booked_at is not null)
);
-- Not unique: a public submission that looks like an existing patient is kept and flagged for review.
create index referrals_dedupe_key on referrals (dedupe_key);
create index referrals_received_at on referrals (received_at desc);
create index referrals_status on referrals (status);
create index referrals_next_action_open on referrals (next_action_at) where status in ('new', 'contacting', 'to_call_us');
create index referrals_clinic on referrals (preferred_clinic_id);
create index referrals_referrer on referrals (referrer_id);
create trigger referrals_updated_at before update on referrals for each row execute function set_updated_at();

create table contact_attempts (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals (id) on delete cascade,
  step smallint not null check (step between 0 and 3),
  channel contact_channel not null,
  outcome contact_outcome not null,
  staff_id uuid references staff (id) on delete set null,
  at timestamptz not null default now(),
  notes text,
  sms_message_id uuid                        -- FK added below, after sms_messages exists
);
create index contact_attempts_referral on contact_attempts (referral_id, at);
create index contact_attempts_staff_at on contact_attempts (staff_id, at);

create table sms_templates (
  key text primary key,                      -- coax_1_standard | coax_1_existing_family | coax_1_transfer | coax_2 | coax_3 | coax_4_final
  name text not null,
  step smallint check (step between 0 and 3),
  body text not null,
  description text,
  updated_at timestamptz not null default now()
);
create trigger sms_templates_updated_at before update on sms_templates for each row execute function set_updated_at();

create table sms_messages (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references referrals (id) on delete set null,   -- null until an inbound text is matched
  direction sms_direction not null,
  template_key text references sms_templates (key) on delete set null,
  body text not null,
  to_phone text,
  from_phone text,
  status sms_status not null,
  error text,
  coax_id text unique,
  in_reply_to_id uuid references sms_messages (id) on delete set null,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sms_messages_referral on sms_messages (referral_id, created_at);
create index sms_messages_review on sms_messages (needs_review) where needs_review;
create index sms_messages_status on sms_messages (status, created_at);
create trigger sms_messages_updated_at before update on sms_messages for each row execute function set_updated_at();

alter table contact_attempts
  add constraint contact_attempts_sms_fk foreign key (sms_message_id) references sms_messages (id) on delete set null;

create table attachments (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals (id) on delete cascade,
  storage_path text not null,                -- Storage object path in bucket referral-attachments
  file_name text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  mime_type text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references staff (id) on delete set null
);
create index attachments_referral on attachments (referral_id);

create table referrer_notifications (
  id uuid primary key default gen_random_uuid(),
  referrer_id text not null references referrers (id) on delete cascade,
  referral_id uuid not null references referrals (id) on delete cascade,
  kind referrer_notification_kind not null,
  status referrer_notification_status not null default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index referrer_notifications_status on referrer_notifications (status, created_at);

-- ---------------------------------------------------------------------------
-- Settings: one app_settings row (id = 'default') and four cadence step rows
-- ---------------------------------------------------------------------------
create table app_settings (
  id text primary key default 'default' check (id = 'default'),
  close_unsuccessful_after_final boolean not null default true,
  notify_referrer_on_unsuccessful boolean not null default true,
  idle_lock_minutes integer not null default 15 check (idle_lock_minutes between 1 and 120),
  clinic_timezone text not null default 'Australia/Brisbane' check (clinic_timezone = 'Australia/Brisbane'),
  demo_clock_enabled boolean not null default true,   -- matches the mock default. Set false for production
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated_at before update on app_settings for each row execute function set_updated_at();

create table cadence_steps (
  step smallint primary key check (step between 0 and 3),
  label text not null,
  offset_amount integer not null default 0 check (offset_amount >= 0),
  offset_unit offset_unit not null default 'day',
  template_key text references sms_templates (key) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger cadence_steps_updated_at before update on cadence_steps for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Imports and audit
-- ---------------------------------------------------------------------------
create table import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  status import_batch_status not null default 'staged',
  created_at timestamptz not null default now(),
  created_by uuid references staff (id) on delete set null,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  count_new integer not null default 0,
  count_unchanged integer not null default 0,
  count_updated integer not null default 0,
  count_conflict integer not null default 0,
  count_error integer not null default 0
);

alter table referrals
  add constraint referrals_import_batch_fk foreign key (import_batch_id) references import_batches (id) on delete set null;

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches (id) on delete cascade,
  sheet text not null,
  row_number integer not null check (row_number > 0),
  row_hash text not null,
  dedupe_key text not null,
  result import_result not null,
  message text,
  referral_id uuid references referrals (id) on delete set null,
  candidate jsonb
);
create unique index import_rows_batch_sheet_row on import_rows (batch_id, sheet, row_number);
create index import_rows_row_hash on import_rows (row_hash);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references staff (id) on delete set null,
  actor_name text not null,
  action audit_action not null,
  entity_type text not null,
  entity_id text,
  summary text not null                      -- plain language, no patient names
);
create index audit_log_entity on audit_log (entity_type, entity_id);
create index audit_log_at on audit_log (at desc);
