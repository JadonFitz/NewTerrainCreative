-- 0009 · Brand Builder spend is filed by campaign name too
--
-- meta_sync_replace files each Meta row under an offer in three steps:
-- where that ad sent visitors, else where the campaign sent visitors,
-- else what the campaign is called. The third step knew Sprint, Founding
-- and Signature but not Brand Builder, so a Brand Builder ad with spend
-- and no tagged visits yet landed under '(unclassified)' on /owner.
--
-- This is 0008's function unchanged except for one added line:
--     when r.campaign ilike '%brand%' then 'brand_builder'
--
-- The update below refiles rows already stored. The nightly sync also
-- replaces the trailing seven days, so it would catch up without it.
--
-- Apply by hand in the Supabase SQL editor, like every other migration.
-- No new table, so no grant beyond the function's own.

create or replace function public.meta_sync_replace(
  p_from    date,
  p_to      date,
  p_rows    jsonb,
  p_account text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_deleted  integer;
  v_inserted integer;
  v_now      timestamptz := now();
begin
  if coalesce(p_account, '') = '' then
    raise exception 'meta_sync_replace needs an ad account';
  end if;

  -- This account's rows only. Another account's window is not ours to clear.
  delete from public.campaign_daily_metrics
   where platform = 'meta'
     and ad_id <> ''
     and ad_account_id = p_account
     and metric_date between p_from and p_to;
  get diagnostics v_deleted = row_count;

  insert into public.campaign_daily_metrics
    (metric_date, platform, funnel, source, medium, campaign, ad,
     impressions, clicks, spend, campaign_id, adset_id, adset_name, ad_id,
     ad_account_id)
  select
    r.metric_date,
    'meta',
    coalesce(
      -- where this exact campaign and ad sent people
      (select fe.funnel
         from public.funnel_events fe
        where fe.event_name = 'view_content' and fe.funnel is not null
          and fe.metadata->>'utm_campaign' = r.campaign
          and fe.metadata->>'utm_content'  = r.ad
        group by fe.funnel order by count(*) desc limit 1),
      -- else where the campaign as a whole sent people
      (select fe.funnel
         from public.funnel_events fe
        where fe.event_name = 'view_content' and fe.funnel is not null
          and fe.metadata->>'utm_campaign' = r.campaign
        group by fe.funnel order by count(*) desc limit 1),
      -- else what the campaign is called
      case
        when r.campaign ilike '%sprint%'    then 'ad_sprint'
        when r.campaign ilike '%found%'     then 'founding_three'
        when r.campaign ilike '%brand%'     then 'brand_builder'
        when r.campaign ilike '%signature%' then 'signature_work'
        else '(unclassified)'
      end
    ),
    'meta',
    'paid-social',
    r.campaign,
    r.ad,
    coalesce(r.impressions, 0),
    coalesce(r.clicks, 0),
    coalesce(r.spend, 0),
    r.campaign_id,
    r.adset_id,
    r.adset_name,
    r.ad_id,
    p_account
  from jsonb_to_recordset(p_rows) as r(
    metric_date date, campaign text, ad text,
    impressions bigint, clicks bigint, spend numeric,
    campaign_id text, adset_id text, adset_name text, ad_id text
  )
  where r.metric_date between p_from and p_to
    and coalesce(r.ad_id, '') <> '';
  get diagnostics v_inserted = row_count;

  -- Same transaction as the replace. If anything above failed, this never
  -- runs and the timestamp stays where it was.
  insert into public.sync_status (source, last_synced_at, window_from, window_to, rows_written)
  values ('meta_ads:' || p_account, v_now, p_from, p_to, v_inserted)
  on conflict (source) do update
    set last_synced_at = excluded.last_synced_at,
        window_from    = excluded.window_from,
        window_to      = excluded.window_to,
        rows_written   = excluded.rows_written;

  return jsonb_build_object(
    'account', p_account, 'deleted', v_deleted, 'inserted', v_inserted,
    'last_synced_at', v_now);
end;
$$;

revoke all on function public.meta_sync_replace(date, date, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.meta_sync_replace(date, date, jsonb, text)
  to service_role;


-- Rows already stored under the old rule.
update public.campaign_daily_metrics
   set funnel = 'brand_builder'
 where platform = 'meta'
   and funnel = '(unclassified)'
   and campaign ilike '%brand%';
