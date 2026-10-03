-- ══════════════════════════════════════════════════════════════════════
-- Verification for 0005_vsl_plays.sql and 0006_owner_dashboard.sql
-- Read only, safe to re-run. Aggregates only, so the output can be pasted
-- into a chat or a ticket.
--
-- One row, one column per check. c1 to c6 must read PASS.
-- ══════════════════════════════════════════════════════════════════════

select
  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from information_schema.columns
    where table_schema = 'public' and table_name = 'funnel_performance'
      and column_name = 'vsl_plays')                                   as c1_plays_column,

  -- 0003 shipped 31 columns. REPLACE may only append, so 32 means nothing
  -- else moved.
  (select case when count(*) = 32 then 'PASS' else 'FAIL: ' || count(*) || '/32' end
     from information_schema.columns
    where table_schema = 'public' and table_name = 'funnel_performance') as c2_nothing_else_changed,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'funnel_performance'
      and reloptions::text like '%security_invoker=on%')               as c3_view_invoker,

  (select case when count(*) = 1 then 'PASS' else 'FAIL: ' || count(*) end
     from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'owner_funnel_report'
      and not prosecdef)                                               as c4_report_function,

  (select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(grantee, ', ') end
     from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'owner_funnel_report'
      and grantee in ('PUBLIC', 'anon', 'authenticated'))              as c5_no_public_execute,

  (select case when count(*) = 0 then 'PASS' else 'FAIL: ' || count(*) end
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('leads', 'funnel_events', 'funnel_performance',
                         'campaign_daily_metrics'))                    as c6_no_public_grants,

  -- Informational. What the dashboard will have to work with.
  (select count(*) from public.funnel_events
    where event_name = 'vsl_play')                                     as vsl_play_events,
  (select count(*) from public.funnel_events
    where event_name = 'schedule')                                     as schedule_events,
  (select count(*) from public.campaign_daily_metrics)                 as spend_rows,
  (select jsonb_array_length(
            public.owner_funnel_report(current_date - 30, current_date)->'rows')) as report_rows_last_30d
