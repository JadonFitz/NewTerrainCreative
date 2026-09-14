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

-- ── reporting · NOTHING TO DO ─────────────────────────────────────────
-- funnel_by_industry already selects l.form_type as `funnel`, so
-- project_enquiry rows appear in it the moment they exist. 0002's
-- definition and the one originally written here were byte for byte
-- identical, which made the drop-and-create a no-op. Removed rather than
-- left in place: re-running it would drop a live view to rebuild it
-- unchanged, which is risk for no benefit.
--
-- The revoke from anon and authenticated is likewise already applied by
-- 0002 and still in force.
--
-- APPLIED 14 Sep 2026. The do-block form of the constraint swap failed to
-- paste cleanly into the Supabase SQL editor, so it was applied as four
-- short statements instead. If re-running this file from scratch, prefer
-- the same approach: add the columns, read the constraint name from
-- pg_constraint, then drop and add it by that name.
