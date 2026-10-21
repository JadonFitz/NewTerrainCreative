-- 0012: the call log on /owner also takes 5-Day Trial calls.
--
-- 21 Oct 2026, Jadon: trial calls (offer key trial_pest_control, the
-- same key api/_offer.js and the booking webhooks use) could only be
-- logged with no offer. This widens the offer check on call_outcomes
-- by that one value. No new table and no change to grants: 0010's
-- service_role-only grant still applies.

alter table public.call_outcomes
  drop constraint if exists call_outcomes_offer_check;

alter table public.call_outcomes
  add constraint call_outcomes_offer_check
  check (offer is null or offer in (
    'brand_builder', 'paid_retainer', 'founding_three',
    'ad_sprint', 'signature_work', 'production_inquiry',
    'trial_pest_control'));

-- Check: expect one row whose definition names trial_pest_control.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.call_outcomes'::regclass
   and conname = 'call_outcomes_offer_check';
