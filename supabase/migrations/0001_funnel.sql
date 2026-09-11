-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · funnel schema
-- Run in the Supabase SQL editor, or via `supabase db push` once the CLI
-- is authenticated. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── leads ─────────────────────────────────────────────────────────────
-- The durable record of an application. Mirrors the fields the form
-- actually collects rather than inventing a generic shape.
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- contact
  name           text not null,
  email          text not null,
  phone          text,
  business       text,

  -- application answers, stored as given so the wording stays auditable
  sell           text,
  spend          text,
  who_runs       text,
  budget         text,
  infra          text,
  la             text,
  capacity       text,
  goal           text,
  sms_consent    boolean not null default false,

  -- verdict from the two hard gates
  status         text not null default 'new'
                 check (status in ('new', 'qualified', 'declined')),
  decline_reason text,

  -- attribution, first touch
  session_id     text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  utm_content    text,
  utm_term       text,
  fbclid         text,
  fbp            text,
  fbc            text,
  landing_page   text,
  referrer       text,

  -- the id shared by the browser pixel and the server CAPI call
  lead_event_id  text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_session_idx    on public.leads (session_id);
create index if not exists leads_status_idx     on public.leads (status);
create index if not exists leads_campaign_idx   on public.leads (utm_campaign);

-- ── funnel_events ─────────────────────────────────────────────────────
-- Anonymous journey. Deliberately holds no email or phone: events join to
-- a lead through lead_id once the person identifies themselves.
create table if not exists public.funnel_events (
  id           bigint generated always as identity primary key,
  event_id     text not null,
  created_at   timestamptz not null default now(),
  event_name   text not null,
  session_id   text,
  lead_id      uuid references public.leads(id) on delete set null,
  page_url     text,
  metadata     jsonb
);

-- Idempotency: a retried beacon or a double-fired milestone collides here
-- instead of double counting.
create unique index if not exists funnel_events_event_id_key
  on public.funnel_events (event_id);

create index if not exists funnel_events_session_idx on public.funnel_events (session_id);
create index if not exists funnel_events_name_idx    on public.funnel_events (event_name);
create index if not exists funnel_events_created_idx on public.funnel_events (created_at desc);
create index if not exists funnel_events_lead_idx    on public.funnel_events (lead_id);

-- ── lock both tables down ─────────────────────────────────────────────
-- RLS on with zero policies means the anon and authenticated roles can do
-- nothing at all. Only the service role key, which lives server side in
-- Vercel and never reaches a browser, can read or write.
alter table public.leads         enable row level security;
alter table public.funnel_events enable row level security;

-- ── attribution rollup, for reading the funnel by campaign ────────────
create or replace view public.funnel_by_campaign as
select
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
group by 1, 2
order by leads desc;
