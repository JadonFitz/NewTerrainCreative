-- ══════════════════════════════════════════════════════════════════════
-- Remove test submissions
--
-- Preview and Production share ONE Supabase project: sbdata_SUPABASE_URL
-- is set for both environments. Anything submitted against the preview
-- lands in the same leads table as real enquiries.
--
-- ── TWO TEST CONVENTIONS, AND WHY ────────────────────────────────────
--
-- 1 · UNDELIVERABLE  ...@ntc-test.invalid
--     For anything that only needs a row to exist. .invalid can never be
--     registered (RFC 2606), so a stray send can never reach a stranger.
--     Use this by default.
--
-- 2 · DELIVERABLE    jadon+ntctest<NN>@newterraincreative.com
--     For the end-to-end booking test ONLY. Verifying the prospect
--     confirmation and the calendar match requires an address that can
--     actually receive mail and be typed into Google's booking form, so
--     .invalid cannot be used there.
--
--     Plus-addressing keeps it identifiable and self-owned: everything
--     after the + is ignored for delivery, so it reaches Jadon's inbox
--     while staying trivially greppable here.
--
-- Every deliverable test lead must also carry a business name beginning
-- 'ZZ TEST', so it is obvious in the internal notification subject line
-- and sorts to the bottom of any list.
--
-- SELECT FIRST. Read what you are about to delete, then run the delete.
-- ══════════════════════════════════════════════════════════════════════

-- ── the filter both halves of this file use ───────────────────────────
--   email like '%@ntc-test.invalid'   OR
--   email like '%+ntctest%'           OR
--   business ilike 'ZZ TEST%'

-- 1 · look at the leads
select
  left(md5(email), 8)                         as who,
  case when email like '%@ntc-test.invalid' then 'undeliverable'
       else 'deliverable' end                 as convention,
  business, form_type, status, sales_stage,
  booked_at, calendar_event_id, created_at
from public.leads
where email like '%@ntc-test.invalid'
   or email like '%+ntctest%'
   or business ilike 'ZZ TEST%'
order by created_at;

-- 2 · funnel events belonging to them
select fe.event_name, fe.event_id, fe.funnel, fe.created_at
from public.funnel_events fe
join public.leads l on l.id = fe.lead_id
where l.email like '%@ntc-test.invalid'
   or l.email like '%+ntctest%'
   or l.business ilike 'ZZ TEST%'
order by fe.created_at;

-- 3 · bookings belonging to them
--
-- Includes bookings whose lead has since been deleted, matched on the
-- attendee address, so a half-finished cleanup cannot strand a row that
-- would keep counting in booking_pipeline.
select b.calendar_event_id, b.attendee_email, b.appointment_start,
       b.funnel, b.schedule_sent_at, b.sms_sent_at
from public.bookings b
where b.attendee_email like '%@ntc-test.invalid'
   or b.attendee_email like '%+ntctest%'
   or b.lead_id in (
        select id from public.leads
        where email like '%@ntc-test.invalid'
           or email like '%+ntctest%'
           or business ilike 'ZZ TEST%')
order by b.created_at;

-- ══════════════════════════════════════════════════════════════════════
-- 4 · delete. Bookings and events first, so nothing is orphaned.
--     Uncomment to run.
-- ══════════════════════════════════════════════════════════════════════

-- delete from public.bookings
--  where attendee_email like '%@ntc-test.invalid'
--     or attendee_email like '%+ntctest%'
--     or lead_id in (select id from public.leads
--                     where email like '%@ntc-test.invalid'
--                        or email like '%+ntctest%'
--                        or business ilike 'ZZ TEST%');

-- delete from public.funnel_events
--  where lead_id in (select id from public.leads
--                     where email like '%@ntc-test.invalid'
--                        or email like '%+ntctest%'
--                        or business ilike 'ZZ TEST%');

-- delete from public.leads
--  where email like '%@ntc-test.invalid'
--     or email like '%+ntctest%'
--     or business ilike 'ZZ TEST%';

-- 5 · confirm nothing is left
-- select
--   (select count(*) from public.leads
--     where email like '%@ntc-test.invalid'
--        or email like '%+ntctest%'
--        or business ilike 'ZZ TEST%')                as leads_left,
--   (select count(*) from public.bookings
--     where attendee_email like '%@ntc-test.invalid'
--        or attendee_email like '%+ntctest%')         as bookings_left;

-- ══════════════════════════════════════════════════════════════════════
-- 6 · DO NOT FORGET THE CALENDAR
--
-- Deleting the bookings row does not delete the appointment. Remove the
-- test event from Google Calendar too, or it stays on the calendar as a
-- real-looking commitment. Order does not matter: calendar_event_id is
-- UNIQUE, so even if a sync runs between the two deletions it would only
-- re-record a row you are about to remove.
-- ══════════════════════════════════════════════════════════════════════
