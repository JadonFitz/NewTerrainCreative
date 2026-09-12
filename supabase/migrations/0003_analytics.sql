-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · Phase 2 analytics
--
-- Adds the sales stages and campaign-cost inputs needed to follow a lead
-- from first visit through a signed retainer. Browser events remain
-- anonymous until a completed form links their session to a lead.
--
-- Additive and safe to run after 0002. No application code depends on the
-- new columns, table or views, so the live forms continue working if the
-- migration and deployment happen at different times.
-- ══════════════════════════════════════════════════════════════════════

-- ── sales outcome, separate from form qualification ─────────────────
-- `status` answers whether the submitted form appears qualified.
-- `sales_stage` answers what happened after that submission.
alter table public.leads
  add column if not exists sales_stage text not null default 'inquiry'
  check (sales_stage in (
    'inquiry', 'qualified', 'call_scheduled', 'proposal_sent',
    'closed_won', 'closed_lost'
  ));

alter table public.leads add column if not exists qualified_at          timestamptz;
alter table public.leads add column if not exists scheduled_at          timestamptz;
alter table public.leads add column if not exists proposal_sent_at      timestamptz;
alter table public.leads add column if not exists closed_at             timestamptz;
alter table public.leads add column if not exists monthly_retainer_value numeric(12,2)
  check (monthly_retainer_value is null or monthly_retainer_value >= 0);
alter table public.leads add column if not exists loss_reason           text;
alter table public.leads add column if not exists booking_source        text;

create index if not exists leads_sales_stage_idx on public.leads (sales_stage);
create index if not exists leads_closed_at_idx   on public.leads (closed_at desc);

-- Timestamp a stage the first time it is reached. A corrected stage never
-- erases history; an operator may still set a more precise time manually.
create or replace function public.ntc_stamp_sales_stage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sales_stage is distinct from old.sales_stage then
    if new.sales_stage = 'qualified' and new.qualified_at is null then
      new.qualified_at = now();
    elsif new.sales_stage = 'call_scheduled' and new.scheduled_at is null then
      new.scheduled_at = now();
    elsif new.sales_stage = 'proposal_sent' and new.proposal_sent_at is null then
      new.proposal_sent_at = now();
    elsif new.sales_stage in ('closed_won', 'closed_lost') and new.closed_at is null then
      new.closed_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists ntc_stamp_sales_stage on public.leads;
create trigger ntc_stamp_sales_stage
before update of sales_stage on public.leads
for each row execute function public.ntc_stamp_sales_stage();

-- ── ad-platform totals ───────────────────────────────────────────────
-- Meta owns impressions, clicks and spend. Import one row per day and ad
-- from Ads Manager; do not estimate these values from website traffic.
create table if not exists public.campaign_daily_metrics (
  metric_date  date not null,
  platform     text not null default 'meta',
  funnel       text not null,
  source       text not null default '(none)',
  medium       text not null default '(none)',
  campaign     text not null default '(none)',
  ad           text not null default '(none)',
  impressions  bigint not null default 0 check (impressions >= 0),
  clicks       bigint not null default 0 check (clicks >= 0),
  spend        numeric(12,2) not null default 0 check (spend >= 0),
  imported_at  timestamptz not null default now(),
  primary key (metric_date, platform, funnel, source, medium, campaign, ad)
);

create index if not exists campaign_daily_metrics_campaign_idx
  on public.campaign_daily_metrics (campaign, ad, metric_date desc);

alter table public.campaign_daily_metrics enable row level security;

-- ── one source for campaign and sales performance ───────────────────
drop view if exists public.funnel_performance;

create view public.funnel_performance
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
  round(p.spend / nullif(l.closed_won, 0), 2)                    as client_acquisition_cost
from dimensions d
left join event_rollup e using (funnel, source, medium, campaign, ad)
left join lead_rollup l using (funnel, source, medium, campaign, ad)
left join paid_rollup p using (funnel, source, medium, campaign, ad)
order by spend desc, leads desc, landing_sessions desc;

-- A compact view for the human sales follow-up. Still private: it contains
-- contact information and is readable only with the service role.
drop view if exists public.lead_pipeline;
create view public.lead_pipeline
with (security_invoker = on) as
select
  l.id, l.created_at, l.form_type, l.name, l.email, l.phone, l.business,
  l.industry, l.status, l.sales_stage, l.desired_start, l.budget_band,
  l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content,
  l.qualified_at, l.scheduled_at, l.proposal_sent_at, l.closed_at,
  l.monthly_retainer_value, l.loss_reason, l.booking_source
from public.leads l
order by
  case l.sales_stage
    when 'inquiry' then 1 when 'qualified' then 2
    when 'call_scheduled' then 3 when 'proposal_sent' then 4
    when 'closed_won' then 5 else 6
  end,
  l.created_at desc;

revoke all on public.campaign_daily_metrics from anon, authenticated;
revoke all on public.funnel_performance      from anon, authenticated;
revoke all on public.lead_pipeline           from anon, authenticated;
revoke all on public.leads                   from anon, authenticated;
revoke all on public.funnel_events           from anon, authenticated;
