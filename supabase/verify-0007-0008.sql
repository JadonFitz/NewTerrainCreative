-- ══════════════════════════════════════════════════════════════════════
-- Verification for 0007_meta_spend_sync.sql and 0008_meta_sync_safeguards.sql
-- Read only, safe to re-run. c1 to c6 must read PASS.
-- ══════════════════════════════════════════════════════════════════════

select
  (select case when count(*) = 5 then 'PASS' else 'FAIL: ' || count(*) || '/5' end
     from information_schema.columns
    where table_schema = 'public' and table_name = 'campaign_daily_metrics'
      and column_name in ('campaign_id', 'adset_id', 'adset_name', 'ad_id',
                          'ad_account_id'))                              as c1_meta_id_columns,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_indexes
    where schemaname = 'public'
      and indexname = 'campaign_daily_metrics_meta_ad_day_key'
      and indexdef ilike '%unique%')                                    as c2_one_row_per_ad_per_day,

  (select case when count(*) = 1 then 'PASS' else 'FAIL' end
     from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'sync_status' and relrowsecurity)                   as c3_sync_status_locked,

  (select case when count(*) = 1 then 'PASS' else 'FAIL: ' || count(*) end
     from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'meta_sync_replace'
      and pronargs = 4
      and prosrc like '%sync_status%')                                  as c4_replace_is_per_account,

  (select case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(grantee, ', ') end
     from information_schema.routine_privileges
    where routine_schema = 'public' and routine_name = 'meta_sync_replace'
      and grantee in ('PUBLIC', 'anon', 'authenticated'))               as c5_no_public_execute,

  (select case when count(*) = 0 then 'PASS' else 'FAIL: ' || count(*) end
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('campaign_daily_metrics', 'sync_status'))      as c6_no_public_grants,

  -- Informational. All empty until the first sync has run.
  (select string_agg(source || ' @ ' || last_synced_at, ' | ') from public.sync_status
    where source like 'meta_ads:%')                                     as meta_last_synced,
  (select count(*) from public.campaign_daily_metrics
    where platform = 'meta' and ad_id <> '')                            as synced_rows,
  (select count(*) from public.campaign_daily_metrics
    where platform = 'meta' and funnel = '(unclassified)')              as unclassified_rows,
  (select sum(spend) from public.campaign_daily_metrics
    where platform = 'meta' and ad_id <> '')                            as synced_spend_total
