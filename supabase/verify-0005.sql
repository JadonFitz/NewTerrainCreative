-- ══════════════════════════════════════════════════════════════════════
-- Verify 0005_bookings.sql applied cleanly.
--
-- Run in the Supabase SQL editor AFTER the migration. Read only: every
-- statement is a select, so this is safe to run at any time.
--
-- The editor wraps a statement in its own LIMIT, so each check is a
-- single row rather than a set, the same shape as verify-0004.sql.
-- ══════════════════════════════════════════════════════════════════════

-- 1 · the bookings table exists with the columns the sync writes
select
  'bookings columns' as check,
  count(*) filter (where column_name = 'calendar_event_id') as calendar_event_id,
  count(*) filter (where column_name = 'lead_id')           as lead_id,
  count(*) filter (where column_name = 'appointment_start') as appointment_start,
  count(*) filter (where column_name = 'appointment_end')   as appointment_end,
  count(*) filter (where column_name = 'schedule_event_id') as schedule_event_id,
  count(*) filter (where column_name = 'funnel')            as funnel,
  case when count(*) >= 14 then 'PASS' else 'FAIL' end      as verdict
from information_schema.columns
where table_schema = 'public' and table_name = 'bookings';

-- 2 · THE important one. Without this unique index a repeated sync would
--     record the same appointment twice and send Meta two conversions.
select
  'calendar_event_id is UNIQUE' as check,
  count(*)                      as matching_indexes,
  case when count(*) = 1 then 'PASS' else 'FAIL · idempotency is not enforced' end as verdict
from pg_indexes
where schemaname = 'public'
  and tablename = 'bookings'
  and indexdef ilike '%unique%'
  and indexdef ilike '%calendar_event_id%';

-- 3 · the booking columns added to leads
select
  'leads booking columns' as check,
  count(*) filter (where column_name = 'booked_at')         as booked_at,
  count(*) filter (where column_name = 'calendar_event_id') as calendar_event_id,
  count(*) filter (where column_name = 'appointment_start') as appointment_start,
  count(*) filter (where column_name = 'appointment_end')   as appointment_end,
  case when count(*) = 4 then 'PASS' else 'FAIL' end        as verdict
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in ('booked_at', 'calendar_event_id',
                      'appointment_start', 'appointment_end');

-- 4 · 0003's sales-stage machinery is intact and was NOT duplicated.
--     The sync sets sales_stage and lets this trigger stamp scheduled_at.
select
  'call_scheduled + stamping trigger survive' as check,
  (select count(*) from pg_trigger
    where tgrelid = 'public.leads'::regclass
      and tgname = 'ntc_stamp_sales_stage')                 as trigger_present,
  (select count(*) from pg_constraint
    where conrelid = 'public.leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%call_scheduled%') as stage_constraint,
  case when (select count(*) from pg_trigger
               where tgrelid = 'public.leads'::regclass
                 and tgname = 'ntc_stamp_sales_stage') = 1
       then 'PASS' else 'FAIL · scheduled_at will not be stamped' end as verdict;

-- 5 · row level security is on, exactly like every other table
select
  'bookings is locked down' as check,
  relrowsecurity            as rls_enabled,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'bookings') as policy_count,
  case when relrowsecurity and (select count(*) from pg_policies
        where schemaname = 'public' and tablename = 'bookings') = 0
       then 'PASS · service role only' else 'FAIL' end      as verdict
from pg_class where oid = 'public.bookings'::regclass;

-- 6 · nothing reachable by an anonymous caller
select
  'no anon or authenticated grants' as check,
  count(*)                          as grants_found,
  case when count(*) = 0 then 'PASS' else 'FAIL · revoke them' end as verdict
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('bookings', 'leads', 'funnel_events')
  and grantee in ('anon', 'authenticated');

-- 7 · the reporting view resolves
select 'booking_pipeline view' as check, count(*) as rows_visible, 'PASS' as verdict
from public.booking_pipeline;
