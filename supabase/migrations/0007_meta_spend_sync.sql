-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · Meta spend, synced daily
--
-- Run in the Supabase SQL editor, after 0006.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- campaign_daily_metrics was built for hand imports from Ads Manager and
-- has never held a row. /api/meta-sync now fills it from the Marketing
-- API once a day, which needs two things the table did not have.
--
-- ── 1 · META'S OWN IDS ────────────────────────────────────────────────
-- Names are for display and for joining to the UTM values a visitor
-- arrives with. They are not stable: an ad gets renamed, and the same ad
-- name is routinely reused across ad sets. The ids are what identify a
-- row, so they are stored beside the names.
--
-- The primary key gains ad_id for the second reason. Two ads called
-- "hook-a" in two ad sets are two rows on the same day, and without ad_id
-- in the key the second would collide with the first. Hand imports leave
-- ad_id as '' and behave exactly as before.
--
-- ── 2 · AN ATOMIC REPLACE ─────────────────────────────────────────────
-- Meta revises recent days, so each sync re-pulls a trailing window and
-- must replace what it wrote last time. meta_sync_replace() deletes the
-- synced rows in the window and inserts the fresh ones in one
-- transaction, so a failed sync leaves yesterday's figures in place
-- rather than a hole. It only ever deletes rows that carry an ad_id:
-- hand-imported rows are never touched.
--
-- ── WHICH OFFER A CAMPAIGN BELONGS TO ─────────────────────────────────
-- Meta does not know Ad Sprint from the retainer. The function files each
-- row under the offer whose landing page that campaign and ad actually
-- sent visitors to, read from our own view_content events. Before any
-- visit exists it falls back to the campaign name, and failing that to
-- '(unclassified)', which the dashboard shows as its own tab rather than
-- guessing. The window is rewritten daily, so a row corrects itself once
-- visits arrive.
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
--   * four columns added, three nullable and one defaulted
--   * the primary key is widened, never narrowed: every row that was
--     unique before is still unique
--   * funnel_performance and owner_funnel_report() sum this table by
--     name, so they read the new rows with no change
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

alter table public.campaign_daily_metrics add column if not exists campaign_id text;
alter table public.campaign_daily_metrics add column if not exists adset_id    text;
alter table public.campaign_daily_metrics add column if not exists adset_name  text;
alter table public.campaign_daily_metrics add column if not exists ad_id       text not null default '';

alter table public.campaign_daily_metrics
  drop constraint if exists campaign_daily_metrics_pkey;
alter table public.campaign_daily_metrics
  add constraint campaign_daily_metrics_pkey
  primary key (metric_date, platform, funnel, source, medium, campaign, ad, ad_id);

create index if not exists campaign_daily_metrics_ad_id_idx
  on public.campaign_daily_metrics (ad_id, metric_date desc);

create or replace function public.meta_sync_replace(
  p_from date,
  p_to   date,
  p_rows jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_deleted  integer;
  v_inserted integer;
begin
  delete from public.campaign_daily_metrics
   where platform = 'meta'
     and ad_id <> ''
     and metric_date between p_from and p_to;
  get diagnostics v_deleted = row_count;

  insert into public.campaign_daily_metrics
    (metric_date, platform, funnel, source, medium, campaign, ad,
     impressions, clicks, spend, campaign_id, adset_id, adset_name, ad_id)
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
        when r.campaign ilike '%signature%' then 'signature_work'
        else '(unclassified)'
      end
    ),
    -- Matches the UTM pattern every ad carries, see docs/ANALYTICS.md.
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
    r.ad_id
  from jsonb_to_recordset(p_rows) as r(
    metric_date date, campaign text, ad text,
    impressions bigint, clicks bigint, spend numeric,
    campaign_id text, adset_id text, adset_name text, ad_id text
  )
  where r.metric_date between p_from and p_to
    and coalesce(r.ad_id, '') <> '';
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
end;
$$;

-- service_role only, for the reasons set out in 0006 and the README.
revoke all on function public.meta_sync_replace(date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.meta_sync_replace(date, date, jsonb)
  to service_role;

revoke all on public.campaign_daily_metrics from anon, authenticated;
