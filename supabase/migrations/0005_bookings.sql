-- ══════════════════════════════════════════════════════════════════════
-- New Terrain Creative · verified calendar bookings
--
-- Run in the Supabase SQL editor.
--   https://supabase.com/dashboard/project/ffxemovvxpwejvfswxyn/sql/new
--
-- Closes the last gap in the funnel. Everything up to "lead captured"
-- was already durable; an actual booked call existed only inside Google
-- Calendar, which is why `schedule` has been a reserved event that
-- /api/track refuses with a 403.
--
-- ── WHAT THIS DELIBERATELY DOES NOT ADD ──────────────────────────────
-- 0003 already ships `sales_stage` with a `call_scheduled` value, a
-- `scheduled_at` column, and the ntc_stamp_sales_stage trigger that
-- fills `scheduled_at` on the first transition into that stage. None of
-- that is recreated here. The sync endpoint sets `sales_stage` and lets
-- the existing trigger do the stamping, so there is exactly one place
-- that decides when a call became scheduled.
--
-- `booking_source` also already exists on leads, from 0003. Reused.
--
-- ── BACKWARD COMPATIBLE ──────────────────────────────────────────────
--   * one new table, which nothing existing reads
--   * every added column on leads is nullable
--   * no column is renamed, retyped or dropped
--   * no constraint is narrowed
--   * no view is replaced
--   * the currently deployed code keeps working unchanged after this
--     runs, so it is safe to apply BEFORE the new code ships
--
-- Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

-- ── the durable booking record ────────────────────────────────────────
-- One row per real Google Calendar appointment.
--
-- calendar_event_id is UNIQUE, and that constraint is the whole
-- idempotency design. The sync endpoint inserts here FIRST and only
-- sends Meta a Schedule conversion if the insert actually created the
-- row. Two overlapping cron invocations therefore cannot both report the
-- same appointment: Postgres decides which one won, not a prior read.
create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Google's immutable id for the event. The idempotency key.
  calendar_event_id text not null,

  -- Which lead this appointment belongs to. Nullable on purpose: a
  -- booking we cannot match is still worth recording, because an
  -- unmatched row is the signal that someone booked outside the funnel.
  lead_id           uuid references public.leads(id) on delete set null,

  -- Copied from the calendar so reporting never needs a Google call.
  attendee_email    text,
  attendee_name     text,
  appointment_start timestamptz,
  appointment_end   timestamptz,
  calendar_id       text,
  event_status      text,

  -- Which funnel produced the lead, denormalised at match time so a
  -- booking stays attributable even if the lead row is later edited.
  funnel            text,

  -- The deterministic id sent to Meta: 'schedule-<calendar_event_id>'.
  -- Stored so a resend can reuse it rather than mint a second one.
  schedule_event_id text,
  schedule_sent_at  timestamptz,

  -- Phase 2 reminder hooks. Nothing writes these yet; see
  -- docs/FUNNEL-AUTOMATION.md.
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,

  -- Transactional SMS actually sent for this booking, if any.
  sms_sent_at       timestamptz
);

-- The idempotency guarantee.
create unique index if not exists bookings_calendar_event_id_key
  on public.bookings (calendar_event_id);

create index if not exists bookings_lead_idx    on public.bookings (lead_id);
create index if not exists bookings_start_idx   on public.bookings (appointment_start);
create index if not exists bookings_created_idx on public.bookings (created_at desc);
create index if not exists bookings_email_idx   on public.bookings (lower(attendee_email));

-- ── leads · the booking fields that belong on the lead itself ────────
-- booked_at answers "has this lead booked", which is what the matching
-- query filters on. It is not a duplicate of scheduled_at: scheduled_at
-- is stamped by the 0003 trigger when the SALES STAGE changes and an
-- operator may move a stage by hand, whereas booked_at is only ever
-- written by verified calendar evidence.
alter table public.leads add column if not exists booked_at         timestamptz;
alter table public.leads add column if not exists calendar_event_id text;
alter table public.leads add column if not exists appointment_start timestamptz;
alter table public.leads add column if not exists appointment_end   timestamptz;

create index if not exists leads_booked_at_idx on public.leads (booked_at);
-- Matching reads this on every sync: most recent unscheduled lead for an
-- email address. lower() because an attendee address may differ in case
-- from what they typed into the form.
create index if not exists leads_email_lower_idx on public.leads (lower(email));

-- ── lock it down, exactly like every other table ──────────────────────
-- RLS on with zero policies: anon and authenticated can do nothing. Only
-- the service role key, which lives server side in Vercel, can read or
-- write.
alter table public.bookings enable row level security;

revoke all on public.bookings from anon, authenticated;
revoke all on public.leads    from anon, authenticated;

-- ── reporting · bookings joined to their lead ─────────────────────────
-- security_invoker so the view inherits row level security rather than
-- reading through it with the owner's rights.
drop view if exists public.booking_pipeline;

create view public.booking_pipeline
with (security_invoker = on) as
select
  b.id                                as booking_id,
  b.created_at                        as recorded_at,
  b.appointment_start,
  b.appointment_end,
  b.attendee_email,
  b.event_status,
  b.funnel,
  b.schedule_sent_at,
  b.sms_sent_at,
  l.id                                as lead_id,
  l.name,
  l.business,
  l.email                             as lead_email,
  l.form_type,
  l.status,
  l.sales_stage,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  l.utm_content,
  (b.lead_id is null)                 as unmatched
from public.bookings b
left join public.leads l on l.id = b.lead_id
order by b.appointment_start desc nulls last;

revoke all on public.booking_pipeline from anon, authenticated;
