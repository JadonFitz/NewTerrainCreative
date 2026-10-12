-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · post-call outcomes
--
-- Run in the Supabase SQL editor, after 0009.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- One row per sales call, logged by hand from the Calls section of
-- /owner right after the call ends. It answers two questions on the
-- Sunday review:
--
--   * which objection is costing us the most deals
--     (every lost call is tagged Authority, Budget, Needs or Timing)
--   * who closes that objection best
--     (every call records who took it, so close rate splits by caller)
--
-- ── WHAT IT HOLDS ─────────────────────────────────────────────────────
-- No name, email or phone. A call is identified by its date, the offer
-- and an optional short note, and /api/owner refuses a note that looks
-- like an email address or a phone number. The table is joined to
-- nothing: a booking's contact details stay where they already are.
--
-- ── RULES THE TABLE ENFORCES ──────────────────────────────────────────
--   * a lost call must say why (objection is required)
--   * a no-show has no objection, because nobody objected
--   * a won or follow-up call may carry one, e.g. a deal that slid to
--     next month on Timing
--   * the note is at most 280 characters
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
-- Creates one table and nothing else. No existing table, view or
-- function is touched.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.call_outcomes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  call_date   date not null,
  offer       text
              check (offer is null or offer in (
                'brand_builder', 'paid_retainer', 'founding_three',
                'ad_sprint', 'signature_work', 'production_inquiry')),
  taken_by    text not null
              check (taken_by in ('jadon', 'meghan', 'other')),
  outcome     text not null
              check (outcome in ('won', 'lost', 'follow_up', 'no_show')),
  objection   text
              check (objection is null or objection in (
                'authority', 'budget', 'needs', 'timing')),
  note        text
              check (note is null or char_length(note) <= 280),

  constraint call_outcomes_lost_has_objection
    check (outcome <> 'lost' or objection is not null),
  constraint call_outcomes_no_show_has_none
    check (outcome <> 'no_show' or objection is null)
);

create index if not exists call_outcomes_date_idx
  on public.call_outcomes (call_date desc, created_at desc);

-- ── locked down, service_role only ────────────────────────────────────
-- Same rule as every table here (supabase/migrations/README.md): RLS on,
-- no policies, nothing for anon or authenticated, and an explicit grant
-- to service_role because from 30 Oct 2026 Supabase no longer adds one.
alter table public.call_outcomes enable row level security;

revoke all on public.call_outcomes from anon, authenticated;
grant select, insert, update, delete on public.call_outcomes to service_role;

-- ── verify ────────────────────────────────────────────────────────────
-- Expect: rls_enabled true, and service_role as the only grantee.
select relrowsecurity as rls_enabled
from pg_class where oid = 'public.call_outcomes'::regclass;

select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'call_outcomes'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee;
