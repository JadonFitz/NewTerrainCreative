-- ══════════════════════════════════════════════════════════════════════
-- Optional pre-check · run BEFORE 0002 if you want to see the before
--
-- Read only. Selects only. Nothing here changes anything, so Supabase
-- will not warn about it.
-- ══════════════════════════════════════════════════════════════════════

-- What check constraints currently sit on leads, and what do they allow?
-- 0002 drops whichever of these mention status and installs one that
-- also permits 'prequalified'.
select conname as constraint_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.leads'::regclass and contype = 'c';

-- What views exist today? 0002 drops and recreates funnel_by_campaign
-- because its first column changes from campaign to funnel, and Postgres
-- will not let CREATE OR REPLACE rename a view column.
select viewname from pg_views
where schemaname = 'public' and viewname like 'funnel%';

-- How much data is at stake. 0002 touches none of it, but it is worth
-- knowing the number before and after.
select
  (select count(*) from public.leads)         as leads_rows,
  (select count(*) from public.funnel_events) as funnel_event_rows;

-- Which of 0002's columns already exist, if a previous run was partial.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in ('form_type','industry','role','lead_owner','budget_90d',
                      'data_agreement_at','prequalified_at','submitted_at',
                      'service_area','customer_value','lead_sources')
order by column_name;
