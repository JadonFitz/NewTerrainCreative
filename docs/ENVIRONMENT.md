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
| `SENDGRID_API_KEY` | `api/_messaging.js` | Mail Send permission only. Sends both the internal notification and the prospect confirmation. |
| `META_CAPI_TOKEN` | `api/_meta.js` | Conversions API access token. |
| `CRON_SECRET` | `api/sync-bookings.js` | Generate with `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer`. **Without it the endpoint refuses to run**, which is deliberate: it would otherwise be a public endpoint that writes conversions. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `api/_google.js` | The whole downloaded service-account key file, pasted as-is. Read-only Calendar access. |
| `GOOGLE_CALENDAR_ID` | `api/_google.js` | The calendar shared with the service account at "See all event details". |

`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` are accepted as an
alternative to the JSON form.

## Optional, with defaults in code

| Variable | Default |
|---|---|
| `META_PIXEL_ID` | `1634935111618929` |
| `META_GRAPH_API_VERSION` | `v21.0` |
| `META_TEST_EVENT_CODE` | unset. Set only while testing, never in production. |
| `APPLY_TO` | `business@newterraincreative.com` |
| `APPLY_FROM` | `New Terrain Creative <applications@newterraincreative.com>` |
| `REPLY_TO` | falls back to `APPLY_TO`. Reply-to on the prospect confirmation. |
| `BOOKING_URL` | the Google Calendar booking link |
| `BOOKING_SYNC_LOOKBACK_DAYS` | `7` |
| `REMINDERS_ENABLED` | unset. Phase 2 hooks only. |
| `RESEND_API_KEY` | unset. Fallback if SendGrid is absent. |

## Dormant · SMS stays off until all three exist

| Variable | Notes |
|---|---|
| `TWILIO_ACCOUNT_SID` | All three required together. Partial configuration leaves SMS dormant rather than half-working, and `preflight.py` warns about it. |
| `TWILIO_AUTH_TOKEN` | |
| `TWILIO_PHONE_NUMBER` | |

Configuration is only one of two gates. A lead is texted only if
`sms_consent` is exactly `true`, which today only the Founding
application can set. See `docs/FUNNEL-AUTOMATION.md` for the A2P 10DLC
steps that must be completed before these are added.

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
