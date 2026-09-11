-- ══════════════════════════════════════════════════════════════════════
-- Verification queries · read only, nothing is changed
--
-- Paste into the Supabase SQL editor and hit Run:
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- Checks the test run from session verify-1789097805.
-- ══════════════════════════════════════════════════════════════════════


-- 1 · DEDUPLICATION
-- view_content was sent twice with the same event_id. If the unique index
-- is doing its job, rows and unique_ids match and view_content shows 1.
select
  event_name,
  count(*)                  as rows,
  count(distinct event_id)  as unique_ids
from funnel_events
where session_id like 'verify-1789097805%'
group by 1
order by 1;


-- 2 · SESSION LINKED TO LEAD
-- The anonymous journey should now carry the lead_id of the person it
-- turned out to be, so a click can be traced through to an application.
select
  fe.event_name,
  fe.lead_id,
  l.business,
  l.status
from funnel_events fe
left join leads l on l.id = fe.lead_id
where fe.session_id like 'verify-1789097805%'
order by fe.created_at;


-- 3 · ATTRIBUTION SURVIVED
-- The qualified row should show meta / Founding Three / ad-01, and the
-- declined lead should be stored too rather than thrown away.
select
  business,
  status,
  utm_source,
  utm_campaign,
  utm_content,
  fbclid,
  fbp,
  session_id,
  created_at
from leads
order by created_at desc
limit 5;


-- 4 · THE REPORTING VIEW
-- What you will actually read once ads are running.
select * from funnel_by_campaign;


-- ══════════════════════════════════════════════════════════════════════
-- CLEANUP · once you are happy, delete the test rows.
-- Uncomment both lines and run them together.
-- ══════════════════════════════════════════════════════════════════════

-- delete from funnel_events where session_id like 'verify-%' or session_id in ('s1','sess-probe','sess-test');
-- delete from leads where business ilike '%(ignore)%' or business ilike '%verify%' or business ilike '%check%';
