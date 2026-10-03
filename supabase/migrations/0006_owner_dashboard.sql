-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · the read behind /owner
--
-- Run in the Supabase SQL editor, after 0005.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- funnel_performance is all time. The owner dashboard needs the same
-- funnel for a chosen date range, so this adds one read-only function
-- that /api/owner calls through PostgREST with the service role.
--
-- ── WHAT IT RETURNS ───────────────────────────────────────────────────
-- Aggregates only. No name, email, phone, session id or event id leaves
-- this function, only counts grouped by funnel, source, campaign and ad.
--
--   rows            one object per funnel, source, campaign and ad
--   coverage        when each event was first and last recorded, per
--                   funnel, across ALL time. This is how the dashboard
--                   tells "nothing happened" from "we were not recording
--                   that yet", and shows the second as unavailable.
--   spend_coverage  the first and last day with imported ad totals
--
-- ── HOW IT COUNTS ─────────────────────────────────────────────────────
--   * funnel steps are DISTINCT SESSIONS, the same rule funnel_performance
--     uses, so one visitor replaying the video is one play. cta_clicks is
--     also returned raw, beside cta_sessions
--   * bookings are distinct schedule events. /api/iclosed-webhook writes
--     one per confirmed booking, keyed on the booking id
--   * a lead is a completed form. Step one of the Founding application
--     alone ('prequalified') is not one, as 0002 sets out
--   * impressions, ad_clicks and spend are NULL, not zero, where nothing
--     was imported into campaign_daily_metrics for that row and range
--   * days are calendar days in p_tz, both ends inclusive
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
-- Creates one function and nothing else. No table, column, view or
-- constraint is touched, and nothing existing calls it.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.owner_funnel_report(
  p_from date,
  p_to   date,
  p_tz   text default 'America/Los_Angeles'
)
returns jsonb
language sql
stable
set search_path = public
as $$
with bounds as (
  select
    (p_from::timestamp at time zone p_tz)       as t0,
    ((p_to + 1)::timestamp at time zone p_tz)   as t1
), ev as (
  select
    coalesce(fe.funnel, '(unclassified)')                         as funnel,
    coalesce(nullif(fe.metadata->>'utm_source', ''), '(none)')    as source,
    coalesce(nullif(fe.metadata->>'utm_campaign', ''), '(none)')  as campaign,
    coalesce(nullif(fe.metadata->>'utm_content', ''), '(none)')   as ad,
    fe.event_name,
    coalesce(fe.session_id, fe.event_id)                          as sid
  from public.funnel_events fe
  cross join bounds b
  where fe.created_at >= b.t0 and fe.created_at < b.t1
), event_rollup as (
  select
    funnel, source, campaign, ad,
    count(distinct sid) filter (where event_name = 'view_content') as landing_sessions,
    count(distinct sid) filter (where event_name = 'vsl_play')     as vsl_plays,
    count(distinct sid) filter (where event_name = 'vsl_25')       as vsl_25,
    count(distinct sid) filter (where event_name = 'vsl_50')       as vsl_50,
    count(distinct sid) filter (where event_name = 'vsl_75')       as vsl_75,
    count(distinct sid) filter (where event_name = 'vsl_90')       as vsl_90,
    count(distinct sid) filter (where event_name = 'cta_click')    as cta_sessions,
    count(*)            filter (where event_name = 'cta_click')    as cta_clicks,
    count(distinct sid) filter (where event_name = 'schedule')     as bookings
  from ev
  group by 1, 2, 3, 4
), lead_rollup as (
  select
    case l.form_type
      when 'founding_application' then 'founding_three'
      when 'strategy_call'        then 'paid_retainer'
      when 'project_enquiry'      then 'signature_work'
      else l.form_type
    end                                                           as funnel,
    coalesce(nullif(l.utm_source, ''), '(none)')                  as source,
    coalesce(nullif(l.utm_campaign, ''), '(none)')                as campaign,
    coalesce(nullif(l.utm_content, ''), '(none)')                 as ad,
    count(*)                                                      as leads
  from public.leads l
  cross join bounds b
  where l.created_at >= b.t0 and l.created_at < b.t1
    and l.status <> 'prequalified'
  group by 1, 2, 3, 4
), paid_rollup as (
  select
    m.funnel, m.source, m.campaign, m.ad,
    sum(m.impressions)                                            as impressions,
    sum(m.clicks)                                                 as ad_clicks,
    sum(m.spend)                                                  as spend
  from public.campaign_daily_metrics m
  where m.metric_date between p_from and p_to
  group by 1, 2, 3, 4
), dimensions as (
  select funnel, source, campaign, ad from event_rollup
  union
  select funnel, source, campaign, ad from lead_rollup
  union
  select funnel, source, campaign, ad from paid_rollup
), report as (
  select
    d.funnel, d.source, d.campaign, d.ad,
    coalesce(e.landing_sessions, 0)  as landing_sessions,
    coalesce(e.vsl_plays, 0)         as vsl_plays,
    coalesce(e.vsl_25, 0)            as vsl_25,
    coalesce(e.vsl_50, 0)            as vsl_50,
    coalesce(e.vsl_75, 0)            as vsl_75,
    coalesce(e.vsl_90, 0)            as vsl_90,
    coalesce(e.cta_sessions, 0)      as cta_sessions,
    coalesce(e.cta_clicks, 0)        as cta_clicks,
    coalesce(e.bookings, 0)          as bookings,
    coalesce(l.leads, 0)             as leads,
    -- Deliberately NOT coalesced. No imported row means unknown, and an
    -- unknown spend shown as 0 reads as free traffic.
    p.impressions,
    p.ad_clicks,
    p.spend
  from dimensions d
  left join event_rollup e using (funnel, source, campaign, ad)
  left join lead_rollup  l using (funnel, source, campaign, ad)
  left join paid_rollup  p using (funnel, source, campaign, ad)
), coverage as (
  select
    coalesce(fe.funnel, '(unclassified)')  as funnel,
    fe.event_name,
    min(fe.created_at)                     as first_seen,
    max(fe.created_at)                     as last_seen
  from public.funnel_events fe
  group by 1, 2
)
select jsonb_build_object(
  'rows',     coalesce((select jsonb_agg(to_jsonb(r)) from report r), '[]'::jsonb),
  'coverage', coalesce((select jsonb_agg(to_jsonb(c)) from coverage c), '[]'::jsonb),
  'spend_coverage', (
    select jsonb_build_object('first_day', min(m.metric_date), 'last_day', max(m.metric_date))
    from public.campaign_daily_metrics m
  )
);
$$;

-- ── service_role only ─────────────────────────────────────────────────
-- A function in public is callable through the Data API by whoever holds
-- EXECUTE, and Postgres grants that to PUBLIC by default. It runs as the
-- caller, so anon would get empty rollups from row level security rather
-- than data, but as supabase/migrations/README.md puts it: leave the door
-- absent rather than held shut by policy.
revoke all on function public.owner_funnel_report(date, date, text)
  from public, anon, authenticated;
grant execute on function public.owner_funnel_report(date, date, text)
  to service_role;
