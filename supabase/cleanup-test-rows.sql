-- ══════════════════════════════════════════════════════════════════════
-- Remove test submissions
--
-- Preview and Production share ONE Supabase project: sbdata_SUPABASE_URL
-- is set for both environments. Anything submitted against the preview
-- lands in the same leads table as real enquiries.
--
-- So every test submission must use an obviously fake address on the
-- ntc-test.invalid domain (.invalid can never be registered, RFC 2606),
-- and must be removed afterwards.
--
-- SELECT FIRST. Read what you are about to delete, then run the delete.
-- ══════════════════════════════════════════════════════════════════════

-- 1 · look at them
select left(md5(email), 8) as who, form_type, status, created_at
from public.leads
where email like '%@ntc-test.invalid'
order by created_at;

-- 2 · funnel events belonging to them
select fe.event_name, fe.funnel, fe.created_at
from public.funnel_events fe
join public.leads l on l.id = fe.lead_id
where l.email like '%@ntc-test.invalid'
order by fe.created_at;

-- 3 · delete, events first so nothing is orphaned
-- Uncomment to run.
-- delete from public.funnel_events
--  where lead_id in (select id from public.leads where email like '%@ntc-test.invalid');
-- delete from public.leads
--  where email like '%@ntc-test.invalid';

-- 4 · confirm
-- select count(*) as remaining_test_rows from public.leads
--  where email like '%@ntc-test.invalid';
