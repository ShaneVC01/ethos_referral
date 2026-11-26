-- 0003_views.sql
-- Read models for the queue, the KPI totals and the Inbox. Depends on 0001 and 0002.
-- All views use security_invoker, so RLS on the base tables applies to whoever reads the view.

-- Today queue: every open referral with its next action. The app sorts by next_action_at.
-- Phone, email and DOB are left out on purpose. Screens that need them read the referral directly.
create or replace view v_today_queue with (security_invoker = true) as
select
  r.id,
  r.reference_number,
  r.status,
  r.current_step,
  r.received_at,
  r.next_action_at,
  (r.next_action_at is not null and r.next_action_at < now()) as is_overdue,
  r.patient_first_name,
  r.patient_last_name,
  r.age_group,
  r.preferred_clinic_id,
  r.preferred_orthodontist_id,
  r.assigned_to,
  r.flag_urgent,
  r.flag_existing_patient,
  r.flag_sibling,
  r.flag_hcf,
  r.source
from referrals r
where r.status in ('new', 'contacting', 'to_call_us')
  and r.closed_reason is null;

-- KPI monthly totals by Brisbane calendar month and preferred clinic.
-- Matches the dashboard definitions in src/features/dashboard/metrics.ts.
-- Booked % is booked divided by received, null when nothing was received.
create or replace view v_kpi_monthly with (security_invoker = true) as
select
  (date_trunc('month', r.received_at at time zone 'Australia/Brisbane'))::date as month,
  r.preferred_clinic_id as clinic_id,
  count(*)::integer as received,
  count(*) filter (where r.status = 'booked')::integer as booked,
  (count(*) filter (where r.status = 'booked')::numeric / nullif(count(*), 0)) as booked_pct,
  count(*) filter (where r.status = 'to_call_us')::integer as to_call_us,
  count(*) filter (where r.status = 'do_not_contact')::integer as do_not_contact,
  count(*) filter (where r.status = 'new')::integer as no_status
from referrals r
group by 1, 2;

-- Inbox: failed sends and replies that need a person to act.
create or replace view v_inbox_review with (security_invoker = true) as
select
  m.id,
  m.referral_id,
  m.direction,
  m.status,
  m.error,
  m.to_phone,
  m.from_phone,
  m.template_key,
  m.created_at
from sms_messages m
where m.needs_review;

-- Overdue contacts by the cadence step that is due. Feeds the dashboard overdue panel.
create or replace view v_overdue_by_step with (security_invoker = true) as
select
  r.current_step as step,
  count(*)::integer as overdue_count,
  min(r.next_action_at) as oldest_due_at
from referrals r
where r.status in ('new', 'contacting', 'to_call_us')
  and r.closed_reason is null
  and r.next_action_at < now()
group by r.current_step;

/*
 * SKETCH, NOT APPLIED. Dashboard metrics as one server-side function.
 * The app calls data.dashboard.metrics(query), which is supabase.rpc('dashboard_metrics', {...}) in production.
 * It mirrors src/features/dashboard/metrics.ts and src/data/mock/dashboard.ts. Only aggregates and capped lists
 * (top 100) leave the database. Nothing downloads whole tables.
 * Still to do: the statuses, the period and clinic filter, the cadence settings for overdue (app_settings), and
 * the SMS failure reasons. Review with supabase-rls-review before applying.
 *
 * create or replace function dashboard_metrics(
 *   p_from date,
 *   p_to date,
 *   p_clinic_id uuid default null
 * ) returns jsonb
 * language sql stable security invoker
 * as $$
 *   with scoped as (
 *     select r.*, (r.received_at at time zone 'Australia/Brisbane')::date as received_day
 *     from referrals r
 *     where p_clinic_id is null or r.preferred_clinic_id = p_clinic_id
 *   ),
 *   period as (
 *     select * from scoped where received_day between p_from and p_to
 *   ),
 *   period_counts as (
 *     select
 *       count(*)::int as received,
 *       count(*) filter (where status = 'booked')::int as booked,
 *       count(*) filter (where status = 'to_call_us')::int as to_call_us,
 *       count(*) filter (where status = 'do_not_contact')::int as do_not_contact,
 *       count(*) filter (where status = 'new')::int as no_status
 *     from period
 *   ),
 *   overdue as (
 *     select current_step as step, count(*)::int as count, min(next_action_at) as oldest_due_at
 *     from scoped
 *     where status in ('new', 'contacting', 'to_call_us') and closed_reason is null and next_action_at < now()
 *     group by current_step
 *   ),
 *   workload as (
 *     select c.staff_id, s.initials,
 *       count(*)::int as total
 *     from contact_attempts c
 *     join staff s on s.id = c.staff_id
 *     join scoped r on r.id = c.referral_id
 *     where c.at >= now() - interval '8 weeks'
 *     group by c.staff_id, s.initials
 *     order by total desc
 *     limit 100
 *   )
 *   select jsonb_build_object(
 *     'period', (select to_jsonb(period_counts) from period_counts),
 *     'overdue', (select coalesce(jsonb_agg(overdue order by step), '[]'::jsonb) from overdue),
 *     'workload', (select coalesce(jsonb_agg(workload), '[]'::jsonb) from workload)
 *     -- ytd and mtd: the same count filters on received_day, using date_trunc('year' / 'month').
 *     -- monthly series: v_kpi_monthly above, filtered by clinic.
 *     -- funnel, byClinic, bySource, byOrtho: group by on period, returning at most a few dozen rows each.
 *     -- sms: sms_messages where direction = 'outbound' and the period, grouped by status and error (top 20).
 *   );
 * $$;
 */
