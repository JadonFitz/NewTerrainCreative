-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · one-time production inquiries
--
-- Run in the Supabase SQL editor.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- /production-inquiry is where the Brand Builder application in iClosed
-- sends anyone under its monthly budget floor. They are stored as their
-- own form_type so they never count as retainer leads, and api/
-- production-inquiry.js returns an error until this has been applied,
-- because the current constraint rejects the new value.
--
-- ── BACKWARD COMPATIBLE ───────────────────────────────────────────────
--   * the form_type constraint is WIDENED from three values to four;
--     every existing value still passes
--   * both new columns are nullable
--   * no column is renamed, retyped or dropped, and no view changes:
--     owner_funnel_report() falls through to l.form_type for a value it
--     does not map, so these rows appear there as 'production_inquiry'
--
-- Written as short statements, not a do block, because 0004's do block
-- failed to paste cleanly into the SQL editor. 0004 named the constraint
-- leads_form_type_check, so it is dropped by that name. Run the check
-- at the bottom first if in doubt: it must return exactly one row.
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

alter table public.leads drop constraint if exists leads_form_type_check;

alter table public.leads
  add constraint leads_form_type_check
  check (form_type in ('founding_application', 'strategy_call',
                       'project_enquiry', 'production_inquiry'));

-- Set by the handler from the budget band: low, review or high. Only
-- production inquiries carry it today, so it is nullable.
alter table public.leads add column if not exists priority text
  check (priority is null or priority in ('low', 'review', 'high'));

-- The page's ?from= value, e.g. which iClosed redirect sent them. Not a
-- UTM: it says which of our own flows handed the visitor over.
alter table public.leads add column if not exists entry_point text;

-- Timeline reuses desired_start, budget reuses budget_band, the project
-- reuses project_type and project_scope, all from 0004.

-- ── verify ────────────────────────────────────────────────────────────
-- Exactly one form_type constraint, listing all four values.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.leads'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%form_type%';
