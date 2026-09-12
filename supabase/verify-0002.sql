-- ══════════════════════════════════════════════════════════════════════
-- Verification for migration 0002_two_funnels.sql
--
-- Run AFTER 0002 in the Supabase SQL editor. Read only: it changes
-- nothing and is safe to re-run.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- Every row must report PASS. Anything else means 0002 did not fully
-- apply, and the forms will keep falling back to email.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1 · columns ───────────────────────────────────────────────────────
with expected(col) as (
  values
    ('form_type'),('industry'),('authority'),('customer_value'),
    ('current_marketing'),('budget_band'),('desired_start'),('lead_response'),
    ('service_area'),('lead_sources'),('website'),('role'),('lead_owner'),
    ('budget_90d'),('data_agreement_at'),('prequalified_at'),('submitted_at'),
    ('continuation_capacity'),('production_window'),('fit_rationale'),
    ('terms_acknowledged_at'),('publicity_optin')
)
select
  '1 · leads columns' as check,
  case when count(*) filter (where c.column_name is null) = 0
       then 'PASS' else 'FAIL' end as result,
  count(*) filter (where c.column_name is not null) || ' of ' || count(*) || ' present'
    as detail,
  coalesce(string_agg(e.col, ', ') filter (where c.column_name is null), '') as missing
from expected e
left join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = 'leads' and c.column_name = e.col

union all

-- ── 2 · funnel_events.funnel ──────────────────────────────────────────
select
  '2 · funnel_events.funnel',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*) || ' column(s) named funnel', ''
from information_schema.columns
where table_schema = 'public' and table_name = 'funnel_events' and column_name = 'funnel'

union all

-- ── 3 · status constraint accepts 'prequalified' ──────────────────────
-- Step one writes this status. Without it every step-one write fails.
select
  '3 · status allows prequalified',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  coalesce(max(pg_get_constraintdef(oid)), 'constraint not found'), ''
from pg_constraint
where conrelid = 'public.leads'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%status%'
  and pg_get_constraintdef(oid) like '%prequalified%'

union all

-- ── 3b · and there must be exactly ONE of them ────────────────────────
-- A leftover constraint from an earlier definition would still reject
-- 'prequalified' while check 3 above happily reported PASS.
select
  '3b · exactly one status constraint',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*) || ' check constraint(s) mention status', ''
from pg_constraint
where conrelid = 'public.leads'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%status%'

union all

-- ── 4 · reporting views exist ─────────────────────────────────────────
select
  '4 · reporting views',
  case when count(*) = 2 then 'PASS' else 'FAIL' end,
  count(*) || ' of 2 · ' || coalesce(string_agg(viewname, ', '), 'none'), ''
from pg_views
where schemaname = 'public'
  and viewname in ('funnel_by_campaign', 'funnel_by_industry')

union all

-- ── 5 · views do NOT bypass row level security ────────────────────────
-- security_invoker = on is the whole reason the linter stopped complaining.
select
  '5 · views are security_invoker',
  case when count(*) = 2 then 'PASS' else 'FAIL' end,
  count(*) || ' of 2 views set security_invoker=on', ''
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('funnel_by_campaign', 'funnel_by_industry')
  and reloptions::text like '%security_invoker=on%'

union all

-- ── 6 · anon and authenticated cannot read the tables ─────────────────
select
  '6 · no anon/authenticated grants',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  case when count(*) = 0 then 'none, correct'
       else count(*) || ' unexpected grant(s)' end, ''
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in ('leads', 'funnel_events', 'funnel_by_campaign', 'funnel_by_industry')

order by 1;
