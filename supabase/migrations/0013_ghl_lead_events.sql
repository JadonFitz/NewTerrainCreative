-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · lead stage events from client GHL sub-accounts
--
-- Run in the Supabase SQL editor, after 0012.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- One row per lead event that /api/ghl-lead-events accepts: a new lead,
-- a lead moved to Contacted, a deal marked Won, Paid / Completed or
-- Lost. They come from the Webhook actions in the master snapshot's
-- New Lead, Contacted, Won, Paid / Completed and Lost workflows
-- (MASTER, then each client sub-account built from it).
--
-- ── WHAT IT HOLDS ─────────────────────────────────────────────────────
-- The client's own lead: GHL ids, name, email, phone, source, service,
-- deal value and stage. That is a client's customer data, held so the
-- lead-status backend can act on it. It is never shown on a page and
-- never leaves through the Data API to anyone but service_role.
-- No raw payload is kept: only the columns below.
--
-- ── IDEMPOTENT ────────────────────────────────────────────────────────
-- delivery_key is unique. The endpoint builds it from the workflow's
-- event_id when sent, else event:location:opportunity (or contact), and
-- inserts with ignore-duplicates, so a redelivered webhook is one row.
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
-- Creates one table and nothing else. No existing table, view or
-- function is touched.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.ghl_lead_events (
  id                   uuid primary key default gen_random_uuid(),
  received_at          timestamptz not null default now(),

  delivery_key         text not null unique
                       check (char_length(delivery_key) <= 200),
  event                text not null
                       constraint ghl_lead_events_event_check
                       check (event in ('new_lead', 'stage_contacted', 'won', 'paid', 'lost')),

  location_id          text not null check (char_length(location_id) <= 64),
  location_name        text check (char_length(location_name) <= 200),
  contact_id           text not null check (char_length(contact_id) <= 64),
  opportunity_id       text check (char_length(opportunity_id) <= 64),

  first_name           text check (char_length(first_name) <= 100),
  last_name            text check (char_length(last_name) <= 100),
  email                text check (char_length(email) <= 254),
  phone                text check (char_length(phone) <= 40),

  source               text check (char_length(source) <= 200),
  service_requested    text check (char_length(service_requested) <= 200),
  opportunity_name     text check (char_length(opportunity_name) <= 200),
  pipeline_stage       text check (char_length(pipeline_stage) <= 100),
  monetary_value       numeric(12, 2) check (monetary_value is null or monetary_value >= 0),
  assigned_user_email  text check (char_length(assigned_user_email) <= 254),
  ghl_date_added       timestamptz,

  constraint ghl_lead_events_stage_has_opportunity
    check (event = 'new_lead' or opportunity_id is not null)
);

-- If an earlier copy of this file already made the table with only
-- three events, widen the check to all five. Harmless on a fresh run.
alter table public.ghl_lead_events drop constraint if exists ghl_lead_events_event_check;
alter table public.ghl_lead_events add constraint ghl_lead_events_event_check
  check (event in ('new_lead', 'stage_contacted', 'won', 'paid', 'lost'));

create index if not exists ghl_lead_events_location_idx
  on public.ghl_lead_events (location_id, received_at desc);
create index if not exists ghl_lead_events_contact_idx
  on public.ghl_lead_events (location_id, contact_id);

-- ── locked down, service_role only ────────────────────────────────────
-- Same rule as every table here (supabase/migrations/README.md): RLS on,
-- no policies, nothing for anon or authenticated, and an explicit grant
-- to service_role because from 30 Oct 2026 Supabase no longer adds one.
alter table public.ghl_lead_events enable row level security;

revoke all on public.ghl_lead_events from anon, authenticated;
grant select, insert, update, delete on public.ghl_lead_events to service_role;

-- ── verify ────────────────────────────────────────────────────────────
-- Expect: rls_enabled true, and service_role as the only grantee.
select relrowsecurity as rls_enabled
from pg_class where oid = 'public.ghl_lead_events'::regclass;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'ghl_lead_events'
group by grantee
order by grantee;
