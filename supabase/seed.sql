-- seed.sql
-- Non-personal defaults only. Safe to run on a new project after 0001 to 0003.
--
-- Patient and referrer data is NOT in this file. The real tracker data is imported through the
-- same import function the app uses (src/import), so it gets the dedupe, alias and audit rules.
-- For a one-off load from the seed JSON written by `npm run seed` (gitignored, never committed):
--   insert into clinics select * from json_populate_recordset(null::clinics, '<contents of seed/clinics.json>'::json);
-- Load in this order: clinics, clinic_aliases, orthodontists, ortho_aliases, clinic_roster, staff,
-- practices, referrers, referrer_history, import_batches, referrals, contact_attempts, sms_messages.
-- Staff and profiles must exist before referrals reference them. Do not load seed JSON into production
-- without the clinical team's sign-off.

-- App settings: one row. Demo clock off in production (the mock default is on).
insert into app_settings (id, close_unsuccessful_after_final, notify_referrer_on_unsuccessful, idle_lock_minutes, demo_clock_enabled)
values ('default', true, true, 15, false)
on conflict (id) do nothing;

-- SMS templates: keys are fixed. Wording follows the wording in src/domain/templates.ts, with the merge
-- fields named as in the Settings editor: {patientFirstName}, {clinicName}, {clinicPhone}, {orthoName},
-- {referrerName}. The reference number is not a merge field yet. See supabase/README.md.
insert into sms_templates (key, name, step, body, description) values
  ('coax_1_standard', 'Coax #1, standard', 0, 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received your referral. Reply to this text or call {clinicPhone} to book your appointment.', 'Standard first text'),
  ('coax_1_existing_family', 'Coax #1, existing family', 0, 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received a referral for a family member. Reply to this text or call {clinicPhone} to book.', 'Existing family'),
  ('coax_1_transfer', 'Coax #1, transfer', 0, 'Hi {patientFirstName}, Ethos Orthodontics {clinicName} has received your referral from your dentist. Reply to this text or call {clinicPhone} to book.', 'Transfer from another practice'),
  ('coax_2', 'Coax #2', 1, 'Hi {patientFirstName}, we tried to reach you about your orthodontic referral to Ethos Orthodontics {clinicName}. Reply to this text or call {clinicPhone} to book.', 'Sent with the Day 1 call'),
  ('coax_3', 'Coax #3', 2, 'Hi {patientFirstName}, we are following up on your orthodontic referral to Ethos Orthodontics {clinicName}. We would still like to help. Reply to this text or call {clinicPhone} to book.', 'Sent with the Day 14 call'),
  ('coax_4_final', 'Coax #4, final', 3, 'Hi {patientFirstName}, this is our final message about your orthodontic referral to Ethos Orthodontics {clinicName}. If you still want an appointment, reply to this text or call {clinicPhone}.', 'Sent with the 3 month final call')
on conflict (key) do nothing;

-- Cadence: Day 0 text, Day 1 call and text, Day 14 call and text, 3 months final call and text.
insert into cadence_steps (step, label, offset_amount, offset_unit, template_key) values
  (0, 'Coax #1', 0, 'day', 'coax_1_standard'),
  (1, 'Day 1 call and Coax #2', 1, 'day', 'coax_2'),
  (2, 'Day 14 call and Coax #3', 14, 'day', 'coax_3'),
  (3, '3 month final call and Coax #4', 3, 'month', 'coax_4_final')
on conflict (step) do nothing;

-- Staff initials from the tracker. Names are placeholders until managers confirm them in Settings.
-- ASSUMPTION: BM is set as the manager. Confirm the manager list before loading.
insert into staff (initials, name, role, active) values
  ('BM', 'BM', 'manager', true),
  ('SL', 'SL', 'agent', true),
  ('KT', 'KT', 'agent', true),
  ('JM', 'JM', 'agent', true),
  ('CC', 'CC', 'agent', true),
  ('TM', 'TM', 'agent', true)
on conflict (initials) do nothing;
