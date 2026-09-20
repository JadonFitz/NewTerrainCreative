# Phase 2 analytics

## Event contract

| Event | Meaning | Destination |
|---|---|---|
| `view_content` | Acquisition landing page viewed | First party + Meta `ViewContent` |
| `cta_click` | Landing-page CTA clicked | First party + Meta custom `CTAClick` |
| `initial_fit_completed` | Founding Step 1 passed | First party only |
| `submit_application` | Founding Step 2 captured | First party + Meta `SubmitApplication` |
| `lead` | Paid-retainer inquiry captured (`/strategy-call`) | First party + Meta `Lead`, `offer: paid_retainer` |
| `lead` | Signature Work enquiry captured (`/project`) | First party + Meta `Lead`, `offer: signature_work` |
| `schedule` | An appointment was actually confirmed | **Still reserved on `/api/track`, which returns 403.** Written only by `/api/sync-bookings` after Google Calendar confirms the appointment. First party + Meta `Schedule` |
| `vsl_25/50/75/90` | Native VSL playback milestone | First party + matching Meta custom event |
| `sales_deck_view` | Unlisted growth guide opened | First party only |

Browser and server copies of `Lead` and `SubmitApplication` share the same
event ID for Meta deduplication. Neither conversion fires unless Supabase or
email successfully captures the submission.

## Attribution contract

First touch wins for `utm_source`, `utm_medium`, `utm_campaign`,
`utm_content`, `utm_term`, and `fbclid`. The browser keeps those values in
first-party local storage and adds them to every internal event and completed
form. It never puts contact information in `funnel_events`.

Use this URL pattern for every ad:

```text
https://www.newterraincreative.com/grow?utm_source=meta&utm_medium=paid-social&utm_campaign=<campaign>&utm_content=<ad>
```

Use `/founding` instead of `/grow` for the Founding Three campaign. Campaign
and ad names must match the values exported from Ads Manager, or spend and
website outcomes will not join in `funnel_performance`.

## Sales stages

Form qualification and sales outcome are deliberately separate:

- `status`: what the submitted form says (`new`, `qualified`, or `declined`).
- `sales_stage`: what happened afterward (`inquiry`, `qualified`,
  `call_scheduled`, `proposal_sent`, `closed_won`, or `closed_lost`).

Changing `sales_stage` stamps the corresponding timestamp automatically.
When a lead becomes `closed_won`, add `monthly_retainer_value`; when it becomes
`closed_lost`, add `loss_reason`. Never mark `call_scheduled` until the
calendar actually confirms the appointment.

## Campaign costs

Import Meta totals into `campaign_daily_metrics` by date and ad. This table is
the source for impressions, clicks, and spend; the site must not attempt to
reconstruct those figures. The `funnel_performance` view then calculates:

- ad CTR and cost per ad click;
- landing-to-CTA and landing-to-lead rates;
- lead-to-booking and booked-to-close rates;
- cost per lead and client acquisition cost;
- monthly retainer revenue won.

## Remaining live verification

- Add `META_CAPI_TOKEN` and `META_TEST_EVENT_CODE` to Preview only, submit one
  controlled lead through each funnel, and confirm the browser/server copies
  deduplicate in Meta Test Events.
- Never add `META_TEST_EVENT_CODE` to Production.
- Add the two native VSL files and posters, then verify the four watch-depth
  events. YouTube or Vimeo embeds require provider-specific player API wiring;
  the current watcher is intentionally for native `<video>` elements.
- Book one real appointment and confirm `Schedule` arrives once, then run the
  sync again and confirm it does not arrive twice. See the PRE-ADS LAUNCH
  CHECKLIST in `docs/FUNNEL-AUTOMATION.md`.


## The three acquisition funnels

| Funnel | Page | `form_type` | Meta event | `offer` |
|---|---|---|---|---|
| Founding Three | `/apply` | `founding_application` | `SubmitApplication` | `founding_three` |
| Paid retainer | `/strategy-call` | `strategy_call` | `Lead` | `paid_retainer` |
| Signature Work | `/project` | `project_enquiry` | `Lead` | `signature_work` |

Two of them fire `Lead`, so they are separated on the `offer` and
`form_type` parameters rather than the event name. Build custom
conversions on those parameters, not on `Lead` alone, or the retainer and
project funnels will optimise as one audience.

`funnel_events.funnel` carries `paid_retainer`, `founding_three` or
`signature_work` for the same reason on the first-party side.

## No booking without qualification

Every call now starts with a completed form. `/book` forwards to
`/strategy-call` rather than the scheduler, and the only page allowed to
link the scheduler directly is `apply.html`, as a success state shown
after a full application. `scripts/preflight.py` fails the build if any
other page links it.

`/strategy-call` and `/project` also show the calendar after submission,
but neither contains the scheduler URL. The API returns `bookingUrl` and
the browser assigns the `href` at runtime, so the guard above still holds
literally: the link cannot be reached by reading the page source, only by
completing the form. A flagged project enquiry gets no link at all.

## Booking is server-verified

A booking link is not a booking. Clicking it, opening the calendar, and
submitting a form all fire nothing. `Schedule` is emitted only by
`/api/sync-bookings`, which polls Google Calendar with a service account
and matches the attendee email to a lead.

Idempotency is enforced twice: `bookings.calendar_event_id` is UNIQUE and
the Meta event id is the deterministic `schedule-<calendar_event_id>`.
Re-running the sync produces no second conversion. Full detail in
`docs/FUNNEL-AUTOMATION.md`.
