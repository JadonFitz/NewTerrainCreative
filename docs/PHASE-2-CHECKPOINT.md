# Phase 2 · analytics checkpoint

**Status: passed on automated and server-side evidence.**
Branch `phase-2-analytics`. Not merged, not in Production.

Live browser deduplication is deliberately **not** a gate on this
checkpoint. It is listed under pre-ad-launch QA below, because it cannot
be exercised without a browser and it blocks spending money on ads, not
continued development.

## What is verified, and by what

| Area | Evidence | Result |
|---|---|---|
| Syntax, 19 files | `scripts/preflight.py` check 1 | pass |
| Offer/price drift | `scripts/check-offer.py` | pass |
| Internal links, dead CTAs | preflight check 4, 12 pages | pass |
| Deploy surface | preflight check 5 | pass |
| Founding application handler | `scripts/test-apply.mjs` | 40 checks |
| Paid-retainer handler | `scripts/test-strategy-call.mjs` | 26 checks |
| Browser attribution | `scripts/test-tracking.mjs` | 10 checks |
| First-party ingestion | `scripts/test-track-api.mjs` | 19 checks |
| Schedule reservation | `test-track-api.mjs`, plus live 403 | pass |
| Server CAPI reaches Meta | Preview runtime log: `capi Lead sent` | pass |
| Migration 0002 | `supabase/verify-0002.sql`, 7 rows | all PASS |
| Migration 0003 | `supabase/verify-0003.sql` | PASS |

95 automated checks total.

## Event taxonomy, as shipped

| Event | Fires when | Surfaces |
|---|---|---|
| `landing_view` | Page view | First party + Meta `PageView` |
| `view_content` | Acquisition page viewed | First party + Meta `ViewContent` |
| `cta_click` | Landing CTA clicked | First party + Meta custom `CTAClick` |
| `initial_fit_completed` | Founding Step 1 passed | **First party only.** Never a conversion |
| `submit_application` | Founding Step 2 captured | First party + Meta `SubmitApplication` |
| `lead` | Paid-retainer inquiry captured | First party + Meta `Lead` |
| `sales_deck_view` | `/growth-guide` opened | First party only |
| `vsl_25/50/75/90` | Native video milestone | First party + Meta custom |
| `schedule` | An appointment is genuinely confirmed | **Reserved. Refused with 403** |

Step 1 of the Founding application is stateless: it stores no lead and no
PII, and `initial_fit_completed` records qualification progress as an
analytics event only. Step 2 inserts the complete application once.
`prequalified_at` is never stamped; step-one-to-step-two duration comes
from joining `initial_fit_completed` on `session_id`.

## Server-side confirmation

`POST /api/strategy-call` on Preview logged `capi Lead sent`. That is the
Conversions API returning success, so:

- the token resolves in Preview
- the payload passes Meta's validation
- `test_event_code` is attached, keeping Preview events off attribution
- the event carries `offer` and `form_type`
- email and phone are SHA-256 hashed; no plaintext is transmitted

The server half of the deduplication pair is therefore proven end to end.
What is unproven is only that the *browser* half carries the same
`event_id` in a real session, which is a claim about a browser.

## Pre-ad-launch QA · not blockers

These gate spending money on ads. They do not gate development.

**1 · Live browser/server deduplication.** Submit `/strategy-call` and
`/apply` in a browser against a Preview deployment, then confirm in Meta
Events Manager → Test Events that `Lead` and `SubmitApplication` each
appear once showing both Browser and Server. The wiring is already
verified in code: the page mints one `event_id`, passes it to `fbq` as
`eventID` and posts it to the server, which sends it as `event_id`. Meta
deduplicates on event name plus that id.

**2 · Native VSL milestones.** `ntc.watchVideo` is attached to
`#video video` on `/founding`, `/grow` and `/sprint` and fires 25/50/75/90
once each. It cannot fire today because `assets/vsl-founding.mp4` and
`assets/vsl-poster.jpg` do not exist. Remaining work is a shoot and an
encode. If the video is hosted on YouTube instead, `watchVideo` will not
work at all: an iframe exposes no `timeupdate`, and the IFrame Player API
plus a polling adapter would be required.

**3 · Desktop and mobile visual QA.** Blocks production launch, not
analytics.

## Known open items

- **Scheduler integration.** `Schedule` stays refused until an
  authenticated endpoint can receive a booking confirmation, match it to a
  lead, stamp `scheduled_at` and fire the event server-side with a
  server-minted id. Until then `/api/track` answers 403.
- **Test rows.** Test submissions live in the production `leads` table,
  because Preview and Production share one Supabase project. Cleanup is in
  `supabase/qa-0003-verify-and-cleanup.sql` section 8 and must be run by
  hand: `vercel env pull` returns every encrypted value as an empty
  string, so no automated path to the database exists from a workstation.
