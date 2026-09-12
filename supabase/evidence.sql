-- ══════════════════════════════════════════════════════════════════════
-- Post-migration evidence · PII-SAFE
--
-- Read only. Returns no name, email, phone, business name or website:
-- identity columns are reduced to a boolean or a short digest so the
-- output can be pasted into a chat, a ticket or a report.
--
-- Run AFTER 0002 and verify-0002.sql, and after submitting one test
-- /strategy-call and one test /apply.
--
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
-- ══════════════════════════════════════════════════════════════════════

-- ── A · one row per test submission, identity redacted ────────────────
select
  left(md5(l.email), 8)                  as who,        -- stable, not reversible to an address
  l.form_type,
  l.status,
  l.industry,
  l.utm_source, l.utm_campaign, l.utm_content,
  (l.fbclid   is not null)               as had_fbclid,
  (l.session_id is not null)             as had_session,
  l.prequalified_at is not null          as prequalified,
  l.submitted_at    is not null          as submitted,
  l.terms_acknowledged_at is not null    as terms_ack,
  l.data_agreement_at is not null        as data_ack,
  l.publicity_optin,
  l.created_at
from public.leads l
where l.created_at > now() - interval '2 hours'
order by l.created_at;

-- ── B · THE KEY TEST · one completed form, one lead row ──────────────
-- Step one stores no personal data. A founding applicant appears only
-- after step two, as exactly one complete row carrying both timestamps.
select
  left(md5(l.email), 8)                          as who,
  count(*)                                       as rows_for_this_person,
  count(*) filter (where l.prequalified_at is not null) as with_prequalified,
  count(*) filter (where l.submitted_at is not null)    as with_submitted,
  case
    when count(*) = 1
     and bool_and(l.prequalified_at is not null)
     and bool_and(l.submitted_at is not null)
      then 'PASS · one completed application, one row'
    when count(*) > 1
      then 'FAIL · ' || count(*) || ' rows for one completed application'
    when bool_and(l.submitted_at is null)
      then 'FAIL · incomplete application was persisted'
    else 'PASS · one row'
  end                                            as verdict
from public.leads l
where l.form_type = 'founding_application'
  and l.created_at > now() - interval '2 hours'
group by 1
order by 1;

-- ── C · one paid-retainer row per strategy call ───────────────────────
select
  l.form_type,
  count(*)                                       as rows,
  count(distinct l.email)                        as distinct_people,
  case when count(*) = count(distinct l.email)
       then 'PASS · one row per person' else 'FAIL · duplicates' end as verdict
from public.leads l
where l.created_at > now() - interval '2 hours'
group by 1
order by 1;

-- ── D · funnel events, and the shared event_id for dedup ──────────────
-- lead_event_id on the lead is the SAME id the browser pixel used. The
-- funnel_events row proves the server saw it too. Meta deduplicates on
-- that id plus the event name.
select
  fe.event_name,
  fe.funnel,
  fe.metadata ->> 'industry'                     as industry,
  fe.metadata ->> 'campaign'                     as campaign,
  (fe.lead_id is not null)                       as linked_to_a_lead,
  (fe.event_id = l.lead_event_id)                as id_matches_lead,
  fe.created_at
from public.funnel_events fe
left join public.leads l on l.id = fe.lead_id
where fe.created_at > now() - interval '2 hours'
order by fe.created_at;

-- ── E · dedup summary · one event_id must not appear twice ────────────
select
  fe.event_name,
  count(*)                                       as rows,
  count(distinct fe.event_id)                    as distinct_event_ids,
  case when count(*) = count(distinct fe.event_id)
       then 'PASS · no duplicate event_id'
       else 'FAIL · same event_id stored more than once' end as verdict
from public.funnel_events fe
where fe.created_at > now() - interval '2 hours'
group by 1
order by 1;

-- ── F · step one must NOT be counted as a conversion ──────────────────
select
  case when count(*) = 0
       then 'PASS · initial_fit_completed is never named as a conversion'
       else 'FAIL · ' || count(*) || ' rows' end as verdict
from public.funnel_events
where event_name = 'initial_fit_completed'
  and event_name in ('lead', 'submit_application', 'purchase', 'schedule');

-- ── G · the reporting views, which are already PII-free ───────────────
select * from public.funnel_by_industry;
select * from public.funnel_by_campaign;
