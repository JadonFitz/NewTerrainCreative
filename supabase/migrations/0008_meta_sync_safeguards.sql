-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · safeguards on the Meta spend sync
--
-- Run in the Supabase SQL editor, after 0007.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- ── 1 · ONE ROW PER META AD PER DAY, ENFORCED ─────────────────────────
-- 0007's primary key includes the names, so in principle the same ad on
-- the same day could be stored twice under two names. The sync replaces
-- its window whole, which already prevents that, but "the code is
-- careful" is not a guarantee and this is money. A unique index on
-- (metric_date, ad_id) makes the database refuse it outright.
--
-- Partial on purpose: it covers rows that carry a Meta ad id. Hand
-- imports have ad_id '' and are still governed by the primary key alone.
--
-- ── 2 · WHEN META WAS LAST REFRESHED ──────────────────────────────────
-- sync_status holds one row per sync source. meta_sync_replace() stamps
-- it inside the same transaction as the replace, so last_synced_at moves
-- only when the figures really were refreshed, including on a day when
-- Meta legitimately returned no rows. A stale timestamp therefore means
-- the sync is failing, which is otherwise invisible: a failed sync
-- deliberately leaves the stored figures alone.
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
--   * one index, one new table, one function replaced with the same
--     signature and the same behaviour plus the stamp
--   * nothing existing is renamed, retyped or dropped
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create unique index if not exists campaign_daily_metrics_meta_ad_day_key
  on public.campaign_daily_metrics (metric_date, ad_id)
  where platform = 'meta' and ad_id <> '';

create table if not exists public.sync_status (
  source          text primary key,
  last_synced_at  timestamptz not null,
  window_from     date,
  window_to       date,
  rows_written    integer not null default 0
);

alter table public.sync_status enable row level security;

-- A new table after 30 Oct 2026 gets no Data API grants by default, so
-- this one is explicit. service_role only: see README.md in this folder.
revoke all on public.sync_status from anon, authenticated;
grant select, insert, update, delete on public.sync_status to service_role;

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
  v_now      timestamptz := now();
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

  -- Same transaction as the replace. If anything above failed, this never
  -- runs and the timestamp stays where it was.
  insert into public.sync_status (source, last_synced_at, window_from, window_to, rows_written)
  values ('meta_ads', v_now, p_from, p_to, v_inserted)
  on conflict (source) do update
    set last_synced_at = excluded.last_synced_at,
        window_from    = excluded.window_from,
        window_to      = excluded.window_to,
        rows_written   = excluded.rows_written;

  return jsonb_build_object(
    'deleted', v_deleted, 'inserted', v_inserted, 'last_synced_at', v_now);
end;
$$;

revoke all on function public.meta_sync_replace(date, date, jsonb)
  from public, anon, authenticated;
grant execute on function public.meta_sync_replace(date, date, jsonb)
  to service_role;
