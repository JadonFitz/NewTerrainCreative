-- ══════════════════════════════════════════════════════════════════════
-- Phase 2 · migration 0003 ingestion QA
--
-- Nonce for this run: qa-1789280223
-- Every row written by the test carries it in event_id and session_id, so
-- the cleanup at the bottom targets exactly those rows and nothing else.
--
-- Run sections 1-4. They are read only. Then read section 5 before
-- uncommenting it.
-- ══════════════════════════════════════════════════════════════════════

-- ── 1 · the exact rows created, with their ids ────────────────────────
select id, event_name, event_id, session_id, funnel,
       metadata ->> 'qa'       as qa_marker,
       metadata ->> 'campaign' as campaign,
       created_at
from public.funnel_events
where session_id = 'qa-1789280223'
order by created_at;

-- ── 2 · idempotency · cta_click was posted TWICE with one event_id ────
-- Exactly one row must exist for it. Two means ignore-duplicates is not
-- working and retried beacons would inflate every count.
select
  event_id,
  count(*) as rows,
  case when count(*) = 1 then 'PASS · replay deduplicated'
       else 'FAIL · ' || count(*) || ' rows for one event_id' end as verdict
from public.funnel_events
where event_id = 'qa-1789280223-cta_click'
group by event_id;

-- ── 3 · migration 0003 objects respond ────────────────────────────────
select 'funnel_performance' as view, count(*) as rows from public.funnel_performance
union all
select 'lead_pipeline', count(*) from public.lead_pipeline
union all
select 'campaign_daily_metrics', count(*) from public.campaign_daily_metrics;

-- 0003's new lead columns exist and are queryable
select count(*) filter (where sales_stage is not null) as with_stage,
       count(*) filter (where qualified_at  is not null) as qualified,
       count(*) filter (where scheduled_at  is not null) as scheduled,
       count(*) filter (where closed_at     is not null) as closed,
       count(*)                                          as total_leads
from public.leads;

-- campaign_daily_metrics must be RLS-locked, like every other table
select relname,
       case when relrowsecurity then 'PASS · RLS enabled'
            else 'FAIL · RLS off' end as verdict
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'campaign_daily_metrics';

-- ── 4 · nothing else was written by this test ─────────────────────────
-- Should return zero. The QA events are anonymous and must not have
-- created or touched a lead.
select count(*) as leads_created_by_qa
from public.leads
where created_at > now() - interval '30 minutes';

-- ══════════════════════════════════════════════════════════════════════
-- 5 · CLEANUP · deletes only the rows this run created
--
-- Read section 1's output first. The ids listed there are the only rows
-- this removes. The nonce is a timestamp unique to this run, so it cannot
-- match anything else in the table.
--
-- Uncomment the delete, run it, then run the confirm below it.
-- ══════════════════════════════════════════════════════════════════════

-- delete from public.funnel_events where session_id = 'qa-1789280223';

-- confirm: must return 0
-- select count(*) as remaining_qa_rows
-- from public.funnel_events where session_id = 'qa-1789280223';
