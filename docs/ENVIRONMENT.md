# Environment variables

Set in Vercel under Project → Settings → Environment Variables. Add each
to **Production, Preview and Development** unless noted.

**Never** paste a value into this file, a commit message, a chat, or a log
line. This file names variables and says how to generate them. That is all
it should ever contain.

## Required

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | `api/_supabase.js` | Provided by the Vercel Supabase integration, possibly prefixed (`sbdata_SUPABASE_URL`). The resolver matches on suffix. |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_supabase.js` | Server only. Bypasses row level security. Never expose to a browser and never use it as a signing key. |
| `SENDGRID_API_KEY` | `api/apply.js`, `api/project.js`, `api/production-inquiry.js` | Mail Send permission only. **Keep.** For `/apply` this is the second capture path, not a courtesy email: a submission fails only when Supabase *and* email both fail. Removing it makes Supabase a single point of failure for a record carrying contractual acknowledgements. |
| `META_CAPI_TOKEN` | `api/_meta.js` | Conversions API access token. |
| `META_ADS_TOKEN` | `api/meta-sync.js` | System user token with `ads_read` on the NTC ad account. Reads spend; it cannot send conversions, and `META_CAPI_TOKEN` cannot read spend. Keep them separate. Production only. |
| `META_AD_ACCOUNT_ID` | `api/meta-sync.js` | The ad account number, with or without `act_`. Not a secret. For more than one account use `META_AD_ACCOUNT_IDS`, comma separated, which takes precedence. An account can have its own token in `META_ADS_TOKEN_<digits>`; otherwise `META_ADS_TOKEN` is used. Before adding a second account, give `owner_funnel_report()` an account filter: it sums every account. |
| `CRON_SECRET` | `api/meta-sync.js` | What Vercel Cron authenticates with. At least 16 characters. The sync returns 503 without it. |
| `OWNER_DASHBOARD_PASSWORD` | `api/owner.js` | The shared password for `/owner`. At least 12 characters, and long is the point: the attempt limiter is per server instance, so length is the real defence. It is also the source of the session signing key, so changing it signs everyone out. The handler returns 503 without it rather than letting anyone in. Production only is enough. |
| `ICLOSED_WEBHOOK_SECRET` | `api/iclosed-webhook.js` | At least 32 random bytes. iClosed offers no signing secret, only a subscriber URL, so the URL carries this as `?key=`. Weaker than a signature because it sits in their logs and ours; rotate by changing this variable and the subscriber URL in iClosed together. The handler returns 503 without it rather than accepting anything, so an unset variable means no conversions, never open access. |

## GoHighLevel booking (iClosed migration)

Read only by `api/book-intake.js`, `api/ghl-webhook.js`, `api/_ghl.js` and
`api/_lead-card.js`. Nothing calls them until an offer's `provider` flag in
`strategy-call.html` is switched to `ghl` (or a tester adds `?provider=ghl`),
so the site behaves exactly as before while these are unset. The ids below
are not secrets; they are also the defaults in `api/_ghl.js`, so only the
token and the two secrets are strictly needed. Set the others to override
a default, for example after a pipeline or calendar is rebuilt.

| Variable | Used by | Notes |
|---|---|---|
| `GHL_API_TOKEN` | `api/_ghl.js` | Private Integration Token for the New Terrain Creative location, scopes: contacts (read/write), opportunities (read/write). Server only. Without it `/api/book-intake` still qualifies leads and hands out the calendar, but saves nothing to GHL. It also derives the key that signs the step one to step two token, so rotating it only invalidates forms left half finished. |
| `GHL_LOCATION_ID` | `api/_ghl.js` | `kzOVdsNR0ozcoyyaag0a`. Never `DVRZwYvYUOCWdvIvPbAu` (MASTER): the code refuses that id and writes nothing. |
| `GHL_PIPELINE_ID` | `api/_ghl.js` | The "Sales" pipeline, `gVWhpLqxgmOyTgyrGeKJ`. |
| `GHL_STAGE_IDS` | `api/_ghl.js` | JSON, stage name to id, names exactly as in GHL: `{"Started form":"cf946fe5-8597-4fe7-b8f2-8f4c6db47894","Disqualified":"67599a1a-08ed-43f3-a98a-43f7442da375","Booked":"11653ab6-34fd-4b39-858f-1393fe1f07f3"}`. Only Started form and Disqualified are written by the website; the full set is in `api/_ghl.js`. |
| `GHL_CALENDARS` | `api/_ghl.js` | JSON, offer key to booking URL (`https://api.leadconnectorhq.com/widget/booking/<calendar id>`): `{"growth":".../EdeZLdlKq7Y3Qa9Q1JU8","brand-builder":".../yqDLtdUL8I0T6UTVNdcg","ad-sprint":".../XIYDZhQeWVd4HIXMoN4f","pest-control-trial":".../eVxG83WiXNS8yQTXde7f","signature":".../zfeLSmDbDbizcMObYqIA","reschedule":".../OrFq52pbRRJvUjmicBQ1","follow-up":".../PizvlYZQpD1Xw9dUxDX4"}` with the full prefix on each. https only; anything else is ignored. |
| `GHL_WEBHOOK_SECRET` | `api/ghl-webhook.js` | At least 32 random bytes (`openssl rand -hex 32`). GHL workflows post to `/api/ghl-webhook?key=<secret>`, the same scheme as the iClosed webhook. Returns 503 without it, so unset means no conversions, never open access. |
| `LEAD_CARD_URL` | `api/_lead-card.js` | The Speed-to-Lead bot's `/api/lead-card` (repo ntc-speed-to-lead, Vercel). Unset means no Slack cards; bookings are unaffected. |
| `LEAD_CARD_SECRET` | `api/_lead-card.js` | Sent as `x-ntc-key`. The same value as `LEAD_CARD_SECRET` on the Speed-to-Lead project. |

## Retired

| Variable | Status |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Resolved 21 Sep 2026.** Provisioned for the abandoned `feat/lead-booking-automation` branch, which polled Google Calendar because Appointment Schedules emit no booking webhook. iClosed made it unnecessary. The key was revoked in Google Cloud and the variable removed from Vercel. Nothing deployed ever referenced it. |
| `APPLY_STEP_SECRET` | Removed earlier. The two-step application became stateless, so nothing signs a handoff token any more. |

## Optional, with defaults in code

| Variable | Default |
|---|---|
| `META_PIXEL_ID` | `1634935111618929` |
| `META_GRAPH_API_VERSION` | `v21.0` |
| `META_TEST_EVENT_CODE` | unset. Set only while testing, never in production. |
| `APPLY_TO` | `business@newterraincreative.com` |
| `APPLY_FROM` | `New Terrain Creative <applications@newterraincreative.com>` |
| `BOOKING_URL` | the Google Calendar booking link |
| `RESEND_API_KEY` | unset. Fallback if SendGrid is absent. |
| `STRIPE_CHECKOUT_CREATE_KEY` | unset: buy buttons go to the plain Stripe Payment Link, exactly as before. See below. |

### `STRIPE_CHECKOUT_CREATE_KEY` (optional, `api/checkout.js`)

A Stripe **restricted** live key with exactly two permissions: **Checkout
Sessions: Write** and **Payment Links: Read**. Nothing else. Create it in
the Stripe Dashboard under Developers, API keys, Create restricted key,
and add it to Vercel **Production and Preview**, then redeploy.

With it, every buy button (`/next-step`, the trial reserve on
`/call-booked`) opens a Checkout Session that mirrors its Payment Link,
with a back link to the page the buyer came from and the visitor or lead
id on it. Without it, or if Stripe refuses, `/api/checkout` sends the
buyer to the plain Payment Link, so unset is the safe state and the
kill switch: remove it and redeploy to go back to plain links.

It is separate from `STRIPE_CHECKOUT_READ_KEY` (`api/welcome.js`, Checkout
Sessions: Read only) on purpose: the welcome page never needs to create
anything.

### Marking our own browsers as internal

Open any page once with `?ntc_internal=1` (for example
`https://www.newterraincreative.com/?ntc_internal=1`), or sign into
`/owner`. The browser keeps the mark in localStorage (`ntc_internal`) for
that address (`www.` and the bare domain count separately), its events are
stored with `internal: true`, and its checkouts carry
`client_reference_id` `internal_<visitor id>`. Do it on each browser and
phone used for testing. `?ntc_internal=0` clears it. Clearing site data or
a private window starts unmarked.

Confirm the required variables are registered, which prints names and
never values:

```
vercel env ls
```

## Predeployment check

`python3 scripts/preflight.py` verifies syntax across every API file and
every inline page script, runs the offer drift check, and reports which
required variables are absent from the current shell. It cannot see
Vercel's environment, so a clean local run is not proof production is
configured. Confirm with `vercel env ls` before deploying.
