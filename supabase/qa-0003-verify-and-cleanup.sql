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

-- ══════════════════════════════════════════════════════════════════════
-- 6 · SECOND QA RUN · Schedule-reservation verification (13 Sep)
--
-- Verifying the fix against the live preview posted three requests. Two
-- were refused and wrote nothing; one legitimate cta_click was stored so
-- that a refusal could be distinguished from a broken endpoint.
--
-- Session marker: 'forge-live'
-- ══════════════════════════════════════════════════════════════════════

-- Inspect: expect exactly ONE row, event_name = 'cta_click'.
-- A row named 'schedule' here means the reservation failed.
select id, event_name, event_id, created_at
from public.funnel_events
where session_id = 'forge-live'
order by created_at;

-- Cleanup. Uncomment after reading the above.
-- delete from public.funnel_events where session_id = 'forge-live';

-- Confirm: must return 0.
-- select count(*) from public.funnel_events where session_id = 'forge-live';

-- ══════════════════════════════════════════════════════════════════════
-- 7 · CAPI DEDUPLICATION VERIFICATION  (run BEFORE any cleanup)
--
-- Matches what the database stored against what Meta Test Events shows.
-- Meta's "Event ID" column is exactly lead_event_id below: the browser
-- pixel and the server CAPI call both send it, which is what lets Meta
-- collapse the pair into one event.
--
-- PII-safe: no address, name, phone or business is returned.
-- ══════════════════════════════════════════════════════════════════════

-- ── 7a · every test lead, with the id Meta should be showing ─────────
-- Copy the event_id_for_meta values and compare them to the Event ID in
-- Events Manager → Test Events. They must match character for character.
select
  l.id                                   as lead_id,       -- for the DELETE
  l.lead_event_id                        as event_id_for_meta,
  l.form_type,
  l.status,
  l.industry,
  l.utm_campaign,
  case
    when l.email like '%@ntc-test.invalid' then 'test address'
    else 'REAL ADDRESS · delete this one too'
  end                                    as address_kind,
  l.created_at
from public.leads l
where l.created_at > now() - interval '4 hours'
order by l.created_at;

-- ── 7b · expected event name per funnel ─────────────────────────────
-- strategy_call must produce Lead. founding_application must produce
-- SubmitApplication. Neither may produce Schedule.
select
  l.form_type,
  case l.form_type
    when 'strategy_call'          then 'Lead'
    when 'founding_application'   then 'SubmitApplication'
  end                                    as meta_event_expected,
  l.lead_event_id                        as event_id_for_meta,
  count(fe.id)                           as first_party_events_linked
from public.leads l
left join public.funnel_events fe on fe.lead_id = l.id
where l.created_at > now() - interval '4 hours'
group by l.form_type, l.lead_event_id
order by l.form_type;

-- ── 7c · the server's own copy of the event ─────────────────────────
-- One row per conversion. The event_id here must equal lead_event_id
-- above; that equality is the deduplication contract.
select
  fe.event_name,
  fe.funnel,
  fe.event_id,
  (fe.event_id = l.lead_event_id)        as matches_lead,
  fe.metadata ->> 'industry'             as industry,
  fe.created_at
from public.funnel_events fe
join public.leads l on l.id = fe.lead_id
where fe.created_at > now() - interval '4 hours'
order by fe.created_at;

-- ── 7d · no duplicate conversions ───────────────────────────────────
select
  event_name,
  count(*)                               as rows,
  count(distinct event_id)               as distinct_ids,
  case when count(*) = count(distinct event_id)
       then 'PASS · no duplicate event_id'
       else 'FAIL · a conversion was stored twice' end as verdict
from public.funnel_events
where created_at > now() - interval '4 hours'
  and event_name in ('lead', 'submit_application')
group by event_name;

-- ── 7e · Schedule must not exist at all ─────────────────────────────
select
  case when count(*) = 0
       then 'PASS · no schedule event exists'
       else 'FAIL · ' || count(*) || ' schedule row(s) — the reservation leaked' end
    as verdict
from public.funnel_events
where event_name = 'schedule';

-- ══════════════════════════════════════════════════════════════════════
-- 8 · FINAL CLEANUP · paste the exact lead_id values from 7a
--
-- Delete EVERY row 7a returned, not a fixed count: the number depends on
-- how many test submissions were made. Events first, so nothing orphans.
-- ══════════════════════════════════════════════════════════════════════

-- delete from public.funnel_events
--  where lead_id in ('<id-1>', '<id-2>', '<id-3>');

-- delete from public.leads
--  where id in ('<id-1>', '<id-2>', '<id-3>');

-- Confirm: both must return 0.
-- select count(*) from public.leads
--  where created_at > now() - interval '4 hours';
-- select count(*) from public.funnel_events
--  where created_at > now() - interval '4 hours' and lead_id is not null;
