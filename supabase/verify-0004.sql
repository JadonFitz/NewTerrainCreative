-- ══════════════════════════════════════════════════════════════════════
-- Verification for 0004_project_enquiry.sql · read only, safe to re-run
-- Every row must report PASS.
-- ══════════════════════════════════════════════════════════════════════

select '1 · project columns' as check,
  case when count(*) = 2 then 'PASS' else 'FAIL' end as result,
  count(*) || ' of 2 present' as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'leads'
  and column_name in ('project_type', 'project_scope')

union all

select '2 · form_type allows project_enquiry',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  coalesce(max(pg_get_constraintdef(oid)), 'constraint not found')
from pg_constraint
where conrelid = 'public.leads'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%form_type%'
  and pg_get_constraintdef(oid) like '%project_enquiry%'

union all

select '2b · exactly one form_type constraint',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*) || ' constraint(s) mention form_type'
from pg_constraint
where conrelid = 'public.leads'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%form_type%'

union all

select '3 · the older funnels still pass',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  'founding_application and strategy_call still permitted'
from pg_constraint
where conrelid = 'public.leads'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) like '%founding_application%'
  and pg_get_constraintdef(oid) like '%strategy_call%'

union all

select '4 · funnel_by_industry is security_invoker',
  case when count(*) = 1 then 'PASS' else 'FAIL' end,
  count(*) || ' of 1'
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'funnel_by_industry'
  and reloptions::text like '%security_invoker=on%'

union all

select '5 · no anon/authenticated grants',
  case when count(*) = 0 then 'PASS' else 'FAIL' end,
  case when count(*) = 0 then 'none, correct' else count(*) || ' unexpected' end
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('leads', 'funnel_events', 'funnel_by_industry')

order by 1;
