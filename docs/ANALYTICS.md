# Phase 2 analytics

## Event contract

| Event | Meaning | Destination |
|---|---|---|
| `view_content` | Acquisition landing page viewed | First party + Meta `ViewContent` |
| `cta_click` | Landing-page CTA clicked | First party + Meta custom `CTAClick` |
| `initial_fit_completed` | Founding Step 1 passed | First party only |
| `submit_application` | Founding Step 2 captured | First party + Meta `SubmitApplication` |
| `lead` | Paid-retainer inquiry captured | First party + Meta `Lead` |
| `schedule` | An appointment was actually confirmed | Reserved; never fire from a form submission |
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
- Connect the scheduler or its webhook before implementing `Schedule`.
