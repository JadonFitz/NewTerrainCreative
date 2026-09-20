# Funnel automation · lead to booking to conversion

How a click becomes a lead, a lead becomes a booked call, and a booked
call becomes a conversion Meta can optimise on.

Everything here is server-side. No secret reaches a browser, and no
conversion is ever emitted on the strength of a click.

---

## The lifecycle

```
PAID AD / SITE
  └─ view_content, cta_click          first-party + Meta
        ↓
LEAD SUBMITS FORM
  └─ /api/apply | /api/strategy-call | /api/project
        ↓
SUPABASE STORES LEAD                  leads row, session linked to lead
        ↓
META CONVERSION                       SubmitApplication or Lead
  └─ deduplicated against the browser copy on a shared event_id
        ↓
INTERNAL NOTIFICATION                 to APPLY_TO, reply-to = the prospect
        ↓
PROSPECT CONFIRMATION                 branded, reply-to = New Terrain Creative
  └─ carries the booking link when the funnel allows one
        ↓
BOOKING LINK SHOWN IN THE BROWSER     href assigned from the API response
        ↓
PROSPECT BOOKS ON GOOGLE CALENDAR
        ↓
/api/sync-bookings                    cron, authenticated, polls the calendar
  └─ matches attendee email to a lead
  └─ writes a bookings row (UNIQUE calendar_event_id)
  └─ stamps leads.booked_at, sales_stage = call_scheduled
  └─ writes the first-party `schedule` funnel event
  └─ sends Meta `Schedule` server-side
  └─ sends SMS if and only if consent AND Twilio are both present
```

### Who gets a booking link

| Funnel | Page | Booking link | Call is named |
|---|---|---|---|
| Founding Three, qualified | `/apply` | Yes, immediately | Strategy call |
| Founding Three, declined | `/apply` | **Never** | — |
| Paid retainer | `/strategy-call` | Yes, always | Strategy call |
| Signature Work, clean fit | `/project` | Yes, immediately | **Project call** |
| Signature Work, flagged | `/project` | No | — |

`/strategy-call` has no hard gates by design: a low budget band is a
triage note for whoever takes the call, not a rejection, so everyone who
submits gets the calendar.

A declined Founding application receives **no email at all**. Nothing is
stored for a decline either — personal data does not become a lead until
the application is both complete and a fit — and the browser has already
given an honest reason on screen. A follow-up would only repeat or
soften it.

A flagged project enquiry gets a receipt email with no booking link,
because "no timeline yet" or a budget below a typical project means the
next conversation is about scope.

---

## Messaging · `api/_messaging.js`

One module, three functions, no dependencies.

| Function | To | Reply-to |
|---|---|---|
| `sendInternalLeadNotification` | `APPLY_TO` | the prospect |
| `sendLeadConfirmationEmail` | the prospect | `REPLY_TO` (defaults to `APPLY_TO`) |
| `sendSms` | the lead | n/a |

The reply-to directions are deliberately opposite. Replying to the
internal notification answers the prospect; replying to the confirmation
reaches us.

**Messaging never costs a lead.** Every function resolves to a result
object and throws only on programmer error. A SendGrid outage leaves the
database write, the Meta conversion and the success screen untouched.
The handlers report what actually happened in `captured`:

```json
{ "ok": true, "bookingUrl": "...",
  "captured": { "stored": true, "notified": true, "confirmed": false } }
```

`confirmed: false` means the applicant's email failed and is a follow-up
task for a human. It is logged as `PROSPECT CONFIRMATION FAILED` with the
recipient's domain only, never the address or the key.

This replaced three drifted copies of the same SendGrid call. One of them
(`/api/project`) reported `notified: true` even when no provider was
configured, which could have satisfied the capture check on its own.

### Email deliverability

- Sender is `APPLY_FROM`, which must be a verified sender on the
  domain-authenticated `newterraincreative.com` in SendGrid.
- Every message ships `text/plain` alongside `text/html`. HTML-only mail
  is scored worse and a prospect reading in plain text still needs the
  link.
- Errors are logged with provider and status. Keys are never logged.

---

## Booking detection · `api/_google.js` + `api/sync-bookings.js`

### Why polling, and not a webhook

**Google Appointment Schedules do not emit a booking webhook.** There is
no such thing to subscribe to.

The Calendar API does offer `events.watch` push channels, but the
callback body carries no event data — only `X-Goog-Resource-State`
headers — so you still call `events.list` afterwards to learn what
changed. Channels also expire and need renewal, and the callback domain
needs verifying in Google Cloud. That is a cron, a list call and a domain
verification, to replace a cron and a list call.

Polling is the smaller reliable design. `events.watch` is a **later
latency optimisation**, not a correctness fix: it would cut the delay
between booking and Schedule from minutes to seconds, and nothing else.

### Why a service account

A refresh token issued while an OAuth consent screen is in "Testing"
expires after seven days, which would break bookings silently. A service
account holds no user session to expire. It reaches the calendar because
the calendar is **shared with its address**, not through domain-wide
delegation.

Scope is `calendar.readonly`. A read-only token cannot alter or delete
anything on the calendar.

### The matching rule

1. Match on the **attendee's email**, case-insensitively. An event title
   is never used as evidence.
2. Among leads with that address, prefer the **most recently created one
   that has not already booked** (`booked_at is null`).
3. If every lead with that address has already booked, fall back to the
   most recent. The booking still attributes rather than being dropped;
   `bookings.calendar_event_id` is what prevents double counting.
4. **No matching lead means the event is ignored and not recorded.** An
   ordinary meeting, a solo calendar block, or someone booking with an
   address they never gave us produces nothing.
5. Cancelled events are counted separately and never processed.

### Idempotency, twice over

1. **`bookings.calendar_event_id` is UNIQUE.** The row is inserted
   *first*; everything downstream runs only if that insert created it.
   Two overlapping crons cannot both win, because Postgres decides, not a
   prior read.
2. **The Meta event id is deterministic**: `schedule-<calendar_event_id>`.
   Even a bug that sent twice would deduplicate on Meta's side.

Re-running the sync ten times changes nothing after the first.

### What a verified booking writes

| Target | Value |
|---|---|
| `bookings` | one row, with times, attendee, funnel, calendar id |
| `leads.booked_at` | now |
| `leads.calendar_event_id`, `appointment_start`, `appointment_end` | from the event |
| `leads.sales_stage` | `call_scheduled` |
| `leads.scheduled_at` | **stamped by the existing 0003 trigger**, not by hand |
| `leads.booking_source` | `google_appointment_schedule` |
| `funnel_events` | one `schedule` row, id `schedule-<calendar_event_id>` |
| Meta | one `Schedule`, same id, `fbp`/`fbc` from the stored lead |

Ad attribution survives because `fbp` and `fbc` were captured on the lead
at form time and are replayed here. No IP or user-agent is sent: nobody
is on the site when this runs, and inventing them would be false
matching signal.

### Cadence

`vercel.json` targets **every 5 minutes**. Nothing in the code depends on
that — the query is a time window, not a cursor — so hourly or daily
changes only latency. Vercel Pro supports the 5-minute schedule; a Hobby
plan silently degrades cron to roughly daily.

`BOOKING_SYNC_LOOKBACK_DAYS` (default 7) bounds how far back edited
events are reconsidered.

---

## Schedule stays reserved

`/api/track` still returns **403** for `schedule` and that has not
changed. It is public and unauthenticated; anything it accepts, anyone
can forge.

Schedule is **not** fired on: a button click, opening the calendar page,
a booking-link click, or a form submit. Only `/api/sync-bookings` emits
it, and only after Google confirms an appointment exists.

---

## Twilio SMS · shipped dormant

**Status: implemented, not activated.** The code path is complete and
tested. It sends nothing until every one of these is true:

- `TWILIO_ACCOUNT_SID` is set
- `TWILIO_AUTH_TOKEN` is set
- `TWILIO_PHONE_NUMBER` is set
- the lead's `sms_consent` is **exactly `true`**

Two independent gates. Configuration is an operational question; consent
is a legal one. Neither implies the other, and **having a phone number
implies neither**.

Only the Founding application asks for SMS consent (`apply.html`, with
STOP/HELP language and "consent is not a condition of applying"). The
column defaults to `false` and neither `/strategy-call` nor `/project`
ever sets it, so **a retainer or project lead can never be texted**. This
was not extended to those funnels, deliberately: adding a consent
checkbox changes a live form's compliance posture and belongs in its own
change.

Partial configuration leaves SMS dormant rather than half-working.
`preflight.py` warns when some-but-not-all Twilio variables are present,
because that is the state that reads as configured to a human.

### Before SMS can be switched on

These are **not done** and must be completed in Twilio first:

1. **Register a Twilio account and buy a number**, or create a Messaging
   Service.
2. **A2P 10DLC brand registration** — business legal name, EIN, address,
   website. Takes minutes to submit, hours to days to approve.
3. **A2P 10DLC campaign registration** — use case "Customer Care" or
   "Mixed", with sample messages matching what we actually send and a
   description of how consent is collected. **Link to the consent
   checkbox wording in `apply.html`**; campaigns are rejected for vague
   consent descriptions more than anything else.
4. **Attach the number to the campaign's Messaging Service.**
5. **STOP/HELP handling**: Twilio handles STOP, START and HELP
   automatically at the account level for US A2P traffic and will block
   further messages to an opted-out number, returning error 21610. We do
   **not** currently run an inbound webhook, so nothing custom is needed
   — but that also means an inbound reply lands in the Twilio console,
   not anywhere we watch. If two-way conversation is ever wanted, that is
   a new endpoint and a new piece of work.
6. Only then add the three variables in Vercel and redeploy.
7. Send one real test to a consented number and confirm delivery in the
   Twilio logs.

Do not describe SMS as live until step 7 passes.

---

## Reminders · Phase 2, deliberately not built

Google Calendar already sends its own invitation and reminder for an
appointment booked through the schedule, so a duplicate would be noise.

The hooks exist and are unused:

- `remindersEnabled` (`REMINDERS_ENABLED === 'true'`)
- `sendBookingReminderSms({ to, consent, firstName, whenLabel, hours })`
- `bookings.reminder_24h_sent_at`, `bookings.reminder_1h_sent_at`

Adding them means scanning `bookings` for appointments inside a window
where the relevant column is null, in the same cron. It was left out
because it is not needed before ads run and adding it now would be the
first step toward a CRM.

---

## Environment variables

Names only. Never paste a value into this file, a commit, or a log.

### Required for the new work

| Variable | Used by |
|---|---|
| `CRON_SECRET` | `api/sync-bookings.js` — **without it the endpoint refuses to run** |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `api/_google.js` — the whole downloaded key file |
| `GOOGLE_CALENDAR_ID` | `api/_google.js` — the calendar shared with the service account |

`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` are an accepted
alternative to the JSON form.

### Optional

| Variable | Default |
|---|---|
| `REPLY_TO` | falls back to `APPLY_TO` |
| `BOOKING_SYNC_LOOKBACK_DAYS` | `7` |
| `REMINDERS_ENABLED` | unset. Phase 2. |
| `TWILIO_ACCOUNT_SID` | unset. All three needed, or SMS stays dormant. |
| `TWILIO_AUTH_TOKEN` | unset. |
| `TWILIO_PHONE_NUMBER` | unset. |

Already in use and unchanged: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SENDGRID_API_KEY`, `META_CAPI_TOKEN`,
`META_PIXEL_ID`, `APPLY_TO`, `APPLY_FROM`, `BOOKING_URL`.

---

## Setup

### Vercel

1. Settings → Environment Variables → add the three required names above
   to **Production and Preview**.
2. `CRON_SECRET`: generate with `openssl rand -hex 32`. Vercel sends it
   as `Authorization: Bearer <value>` on every cron invocation
   automatically.
3. Confirm the cron appears under Settings → Cron Jobs after deploying.
   The 5-minute schedule needs **Pro**.
4. Verify names only, never values: `vercel env ls`.

### Google Cloud and Calendar

1. Google Cloud Console → create or select a project.
2. **APIs & Services → Library → enable "Google Calendar API".**
3. **IAM & Admin → Service Accounts → Create service account.** No
   project roles are needed; access comes from calendar sharing.
4. On the service account → **Keys → Add key → Create new key → JSON.**
   Download it.
5. Paste the **entire file contents** as `GOOGLE_SERVICE_ACCOUNT_JSON` in
   Vercel. Pasting the JSON whole is what keeps the private key's
   newlines intact — that is the usual thing to get wrong.
6. **Never commit this file.** It is a credential.
7. Google Calendar → the calendar holding appointments → **Settings and
   sharing → Share with specific people → add the service account's
   `...@....iam.gserviceaccount.com` address → permission **"See all
   event details"**.
8. Set `GOOGLE_CALENDAR_ID` to that calendar's ID (Settings → Integrate
   calendar → Calendar ID). For a primary calendar this is the account's
   email address.

A 404 from the sync means step 7 was missed or the ID is wrong. A 403
usually means step 2 was missed.

### SendGrid

1. Confirm `newterraincreative.com` is **domain authenticated** (Settings
   → Sender Authentication) — DKIM and SPF green.
2. Confirm the address in `APPLY_FROM` is a verified sender.
3. Confirm the API key has **Mail Send** permission and nothing else.
4. Send one test through each funnel and check Activity Feed for
   `delivered`, not just `processed`.

---

## PRE-ADS LAUNCH CHECKLIST

Run this end to end on the **preview deployment** first, then repeat the
production-only items after merging. Use a real address you control and a
real phone if testing SMS.

### Configuration

- [ ] Production environment variables confirmed with `vercel env ls`
- [ ] `META_TEST_EVENT_CODE` is **absent from Production** (it excludes
      events from optimisation and attribution)
- [ ] Migration `0005_bookings.sql` applied in Supabase
- [ ] `supabase/verify-0005.sql` returns the expected rows
- [ ] Cron job visible in Vercel → Settings → Cron Jobs

### Lead capture and email

- [ ] Strategy Call submission stores a `leads` row
- [ ] Internal lead email reaches `business@newterraincreative.com`
- [ ] SendGrid confirmation email reaches the applicant
- [ ] Confirmation renders correctly in Gmail on mobile, light and dark
- [ ] Replying to the confirmation reaches New Terrain Creative
- [ ] Strategy Call exposes the calendar immediately on the success screen
- [ ] Founding qualified application exposes the calendar
- [ ] Founding **declined** application shows no booking link and sends
      no email
- [ ] Clean-fit project enquiry exposes the calendar and says "project
      call"
- [ ] Flagged project enquiry shows no booking link

### Booking and conversion

- [ ] Calendar booking appears on Google Calendar
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/sync-bookings`
      returns `newBookings: 1`
- [ ] Booking matches the correct Supabase lead
- [ ] `booked_at` populated on that lead
- [ ] `sales_stage` is `call_scheduled` and `scheduled_at` is stamped
- [ ] One `schedule` row in `funnel_events`, id `schedule-<event id>`
- [ ] Meta Schedule event received (Events Manager → Test Events during
      preview, Events Manager → Overview in production)
- [ ] **Run the sync a second time: `newBookings: 0`, no duplicate
      Schedule, no second booking row**
- [ ] An unrelated calendar event with a non-lead attendee is ignored

### Security

- [ ] `POST /api/track` with `{"event_name":"schedule"}` returns **403**
- [ ] `GET /api/sync-bookings` with no auth header returns **401**
- [ ] `GET /api/sync-bookings` with a wrong secret returns **401**
- [ ] No secret appears in any API response body
- [ ] No secret appears in Vercel function logs

### SMS

- [ ] SMS sends only when `sms_consent = true` **and** Twilio is
      configured
- [ ] A strategy-call or project lead is never texted
- [ ] Twilio unavailable does not break booking processing
- [ ] STOP/compliance behaviour documented (above) and A2P status known

### Cleanup

- [ ] End-to-end test lead removed or tagged as test —
      `supabase/cleanup-test-rows.sql`
- [ ] Test booking deleted from Google Calendar **and** its `bookings`
      row removed, or the next sync will not re-add it but reporting will
      count it

---

## Running the end-to-end test

```bash
# 1 · local, no network, no credentials needed
python3 scripts/preflight.py

# 2 · against a preview deployment
BASE=https://<preview>.vercel.app

# submit a strategy call and confirm a booking url comes back
curl -s -X POST "$BASE/api/strategy-call" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Person","email":"you@yourdomain.com","phone":"3105550100",
       "business":"Test Co","industry":"Dental practice","authority":"I decide",
       "offer":"Test","value":"$4,000","marketing":"Referrals",
       "ad_spend":"$1,500-5,000/mo","budget_band":"$5,000-$10,000",
       "start":"Within 30 days","objective":"Test","response":"Same day",
       "event_id":"manual-test-1"}' | python3 -m json.tool

# 3 · book that slot on the calendar with the SAME email address

# 4 · run the sync by hand rather than waiting for the cron
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/sync-bookings" \
  | python3 -m json.tool          # expect newBookings: 1

# 5 · the idempotency check that matters most
curl -s -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/sync-bookings" \
  | python3 -m json.tool          # expect newBookings: 0, alreadyRecorded: 1

# 6 · confirm the reservation still holds
curl -s -X POST "$BASE/api/track" -H 'Content-Type: application/json' \
  -d '{"event_name":"schedule"}'  # expect 403

# 7 · confirm the sync is not public
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/sync-bookings"  # expect 401
```

Then clean up with `supabase/cleanup-test-rows.sql` and delete the test
appointment from the calendar.
