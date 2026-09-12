-- New Terrain Creative · read-only verification for migration 0003
-- Every result should say PASS.

-- 1 · sales fields exist
select case when count(*) = 9 then 'PASS' else 'FAIL' end as sales_fields
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in (
    'sales_stage', 'qualified_at', 'scheduled_at', 'proposal_sent_at',
    'closed_at', 'monthly_retainer_value', 'loss_reason',
    'booking_source', 'lead_event_id'
  );

-- 2 · sales-stage constraint is present
select case when count(*) >= 1 then 'PASS' else 'FAIL' end as stage_constraint
from pg_constraint
where conrelid = 'public.leads'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%sales_stage%'
  and pg_get_constraintdef(oid) ilike '%closed_won%';

-- 3 · timestamp trigger is active
select case when count(*) = 1 then 'PASS' else 'FAIL' end as stage_trigger
from pg_trigger
where tgrelid = 'public.leads'::regclass
  and tgname = 'ntc_stamp_sales_stage'
  and not tgisinternal;

-- 4 · campaign input table exists with RLS on
select case when c.relrowsecurity then 'PASS' else 'FAIL' end as campaign_metrics_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'campaign_daily_metrics';

-- 5 · reporting views exist
select case when count(*) = 2 then 'PASS' else 'FAIL' end as analytics_views
from information_schema.views
where table_schema = 'public'
  and table_name in ('funnel_performance', 'lead_pipeline');

-- 6 · anonymous roles have no direct table or view access
select case when count(*) = 0 then 'PASS' else 'FAIL' end as public_access
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'leads', 'funnel_events', 'campaign_daily_metrics',
    'funnel_performance', 'lead_pipeline'
  )
  and grantee in ('anon', 'authenticated');

-- 7 · performance view can be read by the migration owner
select case when count(*) >= 0 then 'PASS' else 'FAIL' end as performance_view_reads
from public.funnel_performance;
