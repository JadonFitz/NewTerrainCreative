-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · separate the two acquisition funnels
--
-- Run in the Supabase SQL editor. Safe to re-run.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- Adds a discriminator so Founding Three applications and paid retainer
-- enquiries never blur in reporting, plus the fields the strategy call
-- form collects that the application does not.
--
-- ── BACKWARD COMPATIBLE with the code currently in production ─────────
-- Deliberately additive. The production branch keeps working unchanged
-- after this runs, so it is safe to apply before the new code ships:
--
--   * every new column is nullable, or has a default (form_type,
--     publicity_optin), so existing INSERTs that never mention them
--     still succeed
--   * no column is renamed, retyped or dropped
--   * the status constraint is WIDENED, from three values to four.
--     'new', 'qualified' and 'declined' all still pass
--   * only reporting views change, and no application code reads a view
--   * the revokes remove grants from anon and authenticated. Every
--     server path uses the service role, which is unaffected
--
-- Safe to re-run.
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

-- ── who we are actually talking to ────────────────────────────────────
-- role is the job title they type. authority is what they can decide.
-- They are not the same answer and an owner who still needs a partner to
-- sign is the case that matters.
alter table public.leads add column if not exists role            text;
alter table public.leads add column if not exists lead_owner      text;
alter table public.leads add column if not exists budget_90d      text;

-- Consent to hand over lead, appointment and closed-sale data. This is
-- what makes the waived month measurable, so it is recorded with a
-- timestamp rather than a boolean: we need to know when they agreed.
alter table public.leads add column if not exists data_agreement_at timestamptz;

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

-- ── 'prequalified' is a real state, so the constraint has to allow it ─
-- Someone who passed step one but never finished step two is neither a
-- qualified lead nor a declined one, and counting them as either would
-- misreport the funnel.
-- Dropping by assumed name is not safe enough. Postgres auto-names an
-- inline column check 'leads_status_check', so it almost certainly is
-- that, but if it is not, the drop no-ops, the add creates a SECOND
-- constraint, and the old three-value one keeps rejecting
-- 'prequalified'. The migration would report success and every step-one
-- write would then fail. So: find every check constraint on leads that
-- actually constrains status, whatever it is called, and drop them all.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);
    raise notice 'dropped status constraint: %', c.conname;
  end loop;
end $$;

alter table public.leads
  add constraint leads_status_check
  check (status in ('new', 'prequalified', 'qualified', 'declined'));

-- ── funnel_events: which funnel an anonymous event belongs to ─────────
alter table public.funnel_events add column if not exists funnel text;
create index if not exists funnel_events_funnel_idx on public.funnel_events (funnel);

-- ── reporting, split by funnel ────────────────────────────────────────
-- security_invoker so the view inherits row level security rather than
-- reading through it with the owner's rights.
--
-- DROP first, not CREATE OR REPLACE. Postgres will only let REPLACE append
-- columns to the end of a view: it cannot rename one or insert one in the
-- middle. 0001's first column is `campaign` and this one's is `funnel`, so
-- REPLACE fails with `cannot change name of view column "campaign" to
-- "funnel"` and takes the rest of the migration down with it.
--
-- Dropping costs nothing. A view holds no data, and no application code
-- reads it; it exists for us to query by hand.
drop view if exists public.funnel_by_campaign;

create view public.funnel_by_campaign
with (security_invoker = on) as
select
  l.form_type                                                 as funnel,
  coalesce(l.utm_campaign, '(none)')                          as campaign,
  coalesce(l.utm_content, '(none)')                           as ad,
  count(*)                                                    as leads,
  count(*) filter (where l.status = 'prequalified')           as step_one_only,
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

-- ── the four advertising verticals, side by side ──────────────────────
-- The reason industry is a required field rather than a nice-to-have.
-- Splits by funnel as well, because a founding application and a paid
-- retainer enquiry from the same vertical are not the same signal.
drop view if exists public.funnel_by_industry;

create view public.funnel_by_industry
with (security_invoker = on) as
select
  coalesce(l.industry, '(not given)')                         as industry,
  l.form_type                                                 as funnel,
  count(*)                                                    as leads,
  count(*) filter (where l.status = 'prequalified')           as step_one_only,
  count(*) filter (where l.status = 'qualified')              as qualified,
  count(*) filter (where l.status = 'declined')               as declined,
  round(
    100.0 * count(*) filter (where l.status = 'qualified')
    / nullif(count(*), 0), 1
  )                                                           as qualified_pct,
  min(l.created_at)                                           as first_lead,
  max(l.created_at)                                           as last_lead
from public.leads l
group by 1, 2
order by leads desc;

revoke all on public.funnel_by_industry  from anon, authenticated;
revoke all on public.funnel_by_campaign from anon, authenticated;
revoke all on public.leads               from anon, authenticated;
revoke all on public.funnel_events       from anon, authenticated;
