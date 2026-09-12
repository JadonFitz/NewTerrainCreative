# Environment variables

Set in Vercel under Project → Settings → Environment Variables. Add each
to **Production, Preview and Development** unless noted.

**Never** paste a value into this file, a commit message, a chat, or a log
line. This file names variables and says how to generate them. That is all
it should ever contain.

## Required

| Variable | Used by | Notes |
|---|---|---|
| `APPLY_STEP_SECRET` | `api/apply.js` | **New.** Signs the step-one → step-two handoff token. At least 32 random bytes. Generate with `openssl rand -hex 32`. Dedicated: do not reuse another credential. |
| `SUPABASE_URL` | `api/_supabase.js` | Provided by the Vercel Supabase integration, possibly prefixed (`sbdata_SUPABASE_URL`). The resolver matches on suffix. |
| `SUPABASE_SERVICE_ROLE_KEY` | `api/_supabase.js` | Server only. Bypasses row level security. Never expose to a browser and never use it as a signing key. |
| `SENDGRID_API_KEY` | `api/apply.js`, `api/strategy-call.js` | Mail Send permission only. |
| `META_CAPI_TOKEN` | `api/_meta.js` | Conversions API access token. |

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

## About `APPLY_STEP_SECRET`

The two-step application hands a row id through the browser between step
one and step two. It is signed so that the only id which can be patched is
one we issued.

The code **fails closed**. With the variable missing or shorter than 32
bytes it logs `CONFIG ERROR · APPLY_STEP_SECRET ...`, issues no token, and
step two inserts a complete row instead of patching. Applications are
still captured. The cost is a duplicate row per applicant, not a lost one.

It deliberately does **not** fall back to `SUPABASE_SERVICE_ROLE_KEY`.
That is a database credential; giving it a second job means rotating it
breaks two things and one leak costs more.

To add it:

```
openssl rand -hex 32          # generate, copy the output
vercel env add APPLY_STEP_SECRET production
vercel env add APPLY_STEP_SECRET preview
vercel env add APPLY_STEP_SECRET development
```

Paste the value at the prompt. Do not put it on the command line, where
it lands in shell history.

Then confirm it is registered, which prints names and never values:

```
vercel env ls
```

## Predeployment check

`python3 scripts/preflight.py` verifies syntax across every API file and
every inline page script, runs the offer drift check, and reports which
required variables are absent from the current shell. It cannot see
Vercel's environment, so a clean local run is not proof production is
configured. Confirm with `vercel env ls` before deploying.
