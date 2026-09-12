-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · separate the two acquisition funnels
--
-- Run in the Supabase SQL editor. Safe to re-run.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- Adds a discriminator so Founding Three applications and paid retainer
-- enquiries never blur in reporting, plus the fields the strategy call
-- form collects that the application does not.
-- ══════════════════════════════════════════════════════════════════════

-- ── which funnel produced this lead ───────────────────────────────────
alter table public.leads
  add column if not exists form_type text not null default 'founding_application'
  check (form_type in ('founding_application', 'strategy_call'));

create index if not exists leads_form_type_idx on public.leads (form_type);

-- ── shared qualification fields ───────────────────────────────────────
alter table public.leads add column if not exists industry          text;
alter table public.leads add column if not exists authority         text;
alter table public.leads add column if not exists customer_value    text;
alter table public.leads add column if not exists current_marketing text;
alter table public.leads add column if not exists budget_band       text;
alter table public.leads add column if not exists desired_start     text;
alter table public.leads add column if not exists lead_response     text;
alter table public.leads add column if not exists service_area      text;
alter table public.leads add column if not exists lead_sources      text;
alter table public.leads add column if not exists website           text;

-- ── Founding Three, two step application ──────────────────────────────
-- Step one completion is a prequalification, NOT a lead and NOT a
-- conversion. Recorded separately so abandonment is measurable without
-- inflating lead counts.
alter table public.leads add column if not exists prequalified_at      timestamptz;
alter table public.leads add column if not exists submitted_at         timestamptz;
alter table public.leads add column if not exists continuation_capacity text;
alter table public.leads add column if not exists production_window     text;
alter table public.leads add column if not exists fit_rationale         text;

-- Consent, kept apart from the waiver conditions on purpose.
-- Data access and honest feedback are conditions of the fee waiver.
-- Publicity is optional, revocable, and never a condition of acceptance.
alter table public.leads add column if not exists terms_acknowledged_at timestamptz;
alter table public.leads add column if not exists publicity_optin       boolean not null default false;

-- ── funnel_events: which funnel an anonymous event belongs to ─────────
alter table public.funnel_events add column if not exists funnel text;
create index if not exists funnel_events_funnel_idx on public.funnel_events (funnel);

-- ── reporting, split by funnel ────────────────────────────────────────
-- security_invoker so the view inherits row level security rather than
-- reading through it with the owner's rights.
create or replace view public.funnel_by_campaign
with (security_invoker = on) as
select
  l.form_type                                                 as funnel,
  coalesce(l.utm_campaign, '(none)')                          as campaign,
  coalesce(l.utm_content, '(none)')                           as ad,
  count(*)                                                    as leads,
  count(*) filter (where l.status = 'qualified')              as qualified,
  round(
    100.0 * count(*) filter (where l.status = 'qualified')
    / nullif(count(*), 0), 1
  )                                                           as qualified_pct,
  min(l.created_at)                                           as first_lead,
  max(l.created_at)                                           as last_lead
from public.leads l
group by 1, 2, 3
order by leads desc;

revoke all on public.funnel_by_campaign from anon, authenticated;
revoke all on public.leads               from anon, authenticated;
revoke all on public.funnel_events       from anon, authenticated;
