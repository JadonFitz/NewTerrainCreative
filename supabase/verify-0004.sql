-- ══════════════════════════════════════════════════════════════════════
-- Verification for 0004_project_enquiry.sql · read only, safe to re-run
--
-- One row, one column per check. The first six must read PASS.
--
-- Deliberately NOT a union-all chain: Supabase's SQL editor wraps a
-- query to apply its own LIMIT, and that wrapper breaks on a union
-- chain ending in 'order by ...;'. Scalar subqueries survive it.
-- ══════════════════════════════════════════════════════════════════════

select
  (select case when count(*) = 2 then 'PASS' else 'FAIL: ' || count(*) || '/2' end
     from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name in ('project_type','project_scope'))            as c1_project_columns,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_constraint
    where conrelid = 'public.leads'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%form_type%'
      and pg_get_constraintdef(oid) like '%project_enquiry%')         as c2_allows_project,

  (select case when count(*) = 1 then 'PASS' else 'FAIL: ' || count(*) end
     from pg_constraint
    where conrelid = 'public.leads'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%form_type%')              as c2b_one_constraint,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_constraint
    where conrelid = 'public.leads'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%founding_application%'
      and pg_get_constraintdef(oid) like '%strategy_call%')           as c3_old_funnels_ok,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'funnel_by_industry'
      and reloptions::text like '%security_invoker=on%')              as c4_view_invoker,

  (select case when count(*) = 0 then 'PASS' else 'FAIL: ' || count(*) end
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon','authenticated')
      and table_name in ('leads','funnel_events','funnel_by_industry')) as c5_no_public_grants,

  (select string_agg(pg_get_constraintdef(oid), ' | ')
     from pg_constraint
    where conrelid = 'public.leads'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%form_type%')              as constraint_definition
