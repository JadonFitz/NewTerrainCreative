-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · Signature Work project enquiries
--
-- Run in the Supabase SQL editor.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- The homepage had two CTAs going straight to the calendar with nothing
-- captured. The general one now goes to /strategy-call. Signature Work
-- (commercial, documentary, brand film, podcast) is a different product
-- line and cannot answer the retainer form's questions about ad spend or
-- lead response, so it gets its own short enquiry at /project.
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
--   * both new columns are nullable
--   * the form_type constraint is WIDENED from two values to three;
--     'founding_application' and 'strategy_call' still pass
--   * no column is renamed, retyped or dropped
--   * only reporting views are replaced, and no application code reads a
--     view
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

-- ── the third funnel ──────────────────────────────────────────────────
-- Drop by definition rather than by assumed name, for the same reason
-- 0002 does: if the constraint were named anything else, dropping by name
-- would no-op, the add would create a second constraint, and the original
-- two-value one would keep rejecting 'project_enquiry' while the
-- migration reported success.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%form_type%'
  loop
    execute format('alter table public.leads drop constraint %I', c.conname);
    raise notice 'dropped form_type constraint: %', c.conname;
  end loop;
end $$;

alter table public.leads
  add constraint leads_form_type_check
  check (form_type in ('founding_application', 'strategy_call', 'project_enquiry'));

-- ── what the project actually is ──────────────────────────────────────
-- Timeline reuses desired_start, budget reuses budget_band and decision
-- authority reuses authority: those questions mean the same thing across
-- funnels and splitting them would fragment reporting for no gain.
alter table public.leads add column if not exists project_type  text;
alter table public.leads add column if not exists project_scope text;

-- ── reporting ─────────────────────────────────────────────────────────
-- DROP then CREATE, not CREATE OR REPLACE: Postgres will only let REPLACE
-- append columns to the end of a view, never insert one. A view holds no
-- data and no application code reads one, so dropping costs nothing.
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

revoke all on public.funnel_by_industry from anon, authenticated;
