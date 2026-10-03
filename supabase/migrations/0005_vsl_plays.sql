-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · VSL plays in the funnel summary
--
-- Run in the Supabase SQL editor.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- /api/track has stored vsl_play since 2 Oct 2026, but funnel_performance
-- only counted the four watch-depth milestones, so the summary could not
-- say how many landing sessions actually started the video. This adds
-- that one count:
--
--   landing sessions → plays → 25% → 50% → 75% → 90%
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
--   * no table, column, constraint or index is touched
--   * CREATE OR REPLACE, not drop and create. Postgres allows REPLACE to
--     append a column to the end of a view, which is all this does, so
--     every existing column keeps its name, type and position and the
--     grants from 0003 stay in force
--   * vsl_plays counts distinct sessions, the same way vsl_25 to vsl_90
--     already do, so the five numbers divide into each other cleanly
--
-- The body below is 0003's definition unchanged apart from the two lines
-- marked NEW. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create or replace view public.funnel_performance
with (security_invoker = on) as
with event_rollup as (
  select
    coalesce(fe.funnel, '(unclassified)')                         as funnel,
    coalesce(nullif(fe.metadata->>'utm_source', ''), '(none)')    as source,
    coalesce(nullif(fe.metadata->>'utm_medium', ''), '(none)')    as medium,
    coalesce(nullif(fe.metadata->>'utm_campaign', ''), '(none)')  as campaign,
    coalesce(nullif(fe.metadata->>'utm_content', ''), '(none)')   as ad,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'view_content')               as landing_sessions,
    count(*) filter (where fe.event_name = 'view_content')        as landing_views,
    count(*) filter (where fe.event_name = 'cta_click')           as cta_clicks,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'initial_fit_completed')      as initial_fits,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'vsl_play')                   as vsl_plays,  -- NEW
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'vsl_25')                     as vsl_25,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'vsl_50')                     as vsl_50,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'vsl_75')                     as vsl_75,
    count(distinct coalesce(fe.session_id, fe.event_id))
      filter (where fe.event_name = 'vsl_90')                     as vsl_90
  from public.funnel_events fe
  group by 1, 2, 3, 4, 5
), lead_rollup as (
  select
    case l.form_type
      when 'founding_application' then 'founding_three'
      when 'strategy_call' then 'paid_retainer'
      else l.form_type
    end                                                           as funnel,
    coalesce(nullif(l.utm_source, ''), '(none)')                  as source,
    coalesce(nullif(l.utm_medium, ''), '(none)')                  as medium,
    coalesce(nullif(l.utm_campaign, ''), '(none)')                as campaign,
    coalesce(nullif(l.utm_content, ''), '(none)')                 as ad,
    count(*)                                                      as leads,
    count(*) filter (where l.status = 'qualified')                as qualified_forms,
    count(*) filter (where l.sales_stage in (
      'call_scheduled', 'proposal_sent', 'closed_won', 'closed_lost'
    ))                                                            as calls_scheduled,
    count(*) filter (where l.sales_stage in (
      'proposal_sent', 'closed_won', 'closed_lost'
    ))                                                            as proposals,
    count(*) filter (where l.sales_stage = 'closed_won')          as closed_won,
    count(*) filter (where l.sales_stage = 'closed_lost')         as closed_lost,
    coalesce(sum(l.monthly_retainer_value)
      filter (where l.sales_stage = 'closed_won'), 0)             as monthly_revenue_won
  from public.leads l
  group by 1, 2, 3, 4, 5
), paid_rollup as (
  select
    m.funnel, m.source, m.medium, m.campaign, m.ad,
    sum(m.impressions)                                            as impressions,
    sum(m.clicks)                                                 as ad_clicks,
    sum(m.spend)                                                  as spend
  from public.campaign_daily_metrics m
  group by 1, 2, 3, 4, 5
), dimensions as (
  select funnel, source, medium, campaign, ad from event_rollup
  union
  select funnel, source, medium, campaign, ad from lead_rollup
  union
  select funnel, source, medium, campaign, ad from paid_rollup
)
select
  d.funnel, d.source, d.medium, d.campaign, d.ad,
  coalesce(p.impressions, 0)                                     as impressions,
  coalesce(p.ad_clicks, 0)                                       as ad_clicks,
  coalesce(p.spend, 0)                                           as spend,
  coalesce(e.landing_sessions, 0)                                as landing_sessions,
  coalesce(e.landing_views, 0)                                   as landing_views,
  coalesce(e.cta_clicks, 0)                                      as cta_clicks,
  coalesce(e.initial_fits, 0)                                    as initial_fits,
  coalesce(e.vsl_25, 0)                                          as vsl_25,
  coalesce(e.vsl_50, 0)                                          as vsl_50,
  coalesce(e.vsl_75, 0)                                          as vsl_75,
  coalesce(e.vsl_90, 0)                                          as vsl_90,
  coalesce(l.leads, 0)                                           as leads,
  coalesce(l.qualified_forms, 0)                                 as qualified_forms,
  coalesce(l.calls_scheduled, 0)                                 as calls_scheduled,
  coalesce(l.proposals, 0)                                       as proposals,
  coalesce(l.closed_won, 0)                                      as closed_won,
  coalesce(l.closed_lost, 0)                                     as closed_lost,
  coalesce(l.monthly_revenue_won, 0)                             as monthly_revenue_won,
  round(100.0 * p.ad_clicks / nullif(p.impressions, 0), 2)        as ad_ctr_pct,
  round(100.0 * e.cta_clicks / nullif(e.landing_sessions, 0), 2) as landing_to_cta_pct,
  round(100.0 * l.leads / nullif(e.landing_sessions, 0), 2)      as landing_to_lead_pct,
  round(100.0 * l.calls_scheduled / nullif(l.leads, 0), 2)       as lead_to_booking_pct,
  round(100.0 * l.closed_won / nullif(l.calls_scheduled, 0), 2)  as booked_to_close_pct,
  round(p.spend / nullif(p.ad_clicks, 0), 2)                     as cost_per_ad_click,
  round(p.spend / nullif(l.leads, 0), 2)                         as cost_per_lead,
  round(p.spend / nullif(l.closed_won, 0), 2)                    as client_acquisition_cost,
  coalesce(e.vsl_plays, 0)                                       as vsl_plays   -- NEW, appended
from dimensions d
left join event_rollup e using (funnel, source, medium, campaign, ad)
left join lead_rollup l using (funnel, source, medium, campaign, ad)
left join paid_rollup p using (funnel, source, medium, campaign, ad)
order by spend desc, leads desc, landing_sessions desc;

-- Already applied by 0003 and preserved by REPLACE. Repeated so this file
-- is safe on its own.
revoke all on public.funnel_performance from anon, authenticated;
