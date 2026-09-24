# Migrations

Applied by hand in the Supabase SQL editor, in order. There is no CLI in
this project and no build step, so nothing runs these for you.

## Grants: service_role only. Never anon.

From **30 October 2026** Supabase stops automatically granting Data API
access to new tables in `public`. Existing tables keep what they have, so
`leads`, `funnel_events` and `campaign_daily_metrics` are unaffected and
nothing breaks on that date.

**Any migration from `0005` onward that creates a table must grant
explicitly, or the table is unreachable through PostgREST and the first
sign of it is a write failing in production.**

The grant this project needs is one line:

```sql
grant select, insert, update, delete
  on public.<new_table>
  to service_role;
```

### Do not paste Supabase's three-role snippet

Their documentation and the deprecation email both show `anon`,
`authenticated` and `service_role` together. Two of those three are wrong
here, and one of them is dangerous.

| Role | Here |
|---|---|
| `anon` | **Never.** The key is public by design: it ships to browsers. |
| `authenticated` | Unused. Nothing on this site logs in. |
| `service_role` | The only client. `api/_supabase.js` holds the key. |

**The browser never talks to Supabase in this project.** Every read and
write goes through `/api/*`, which holds `SUPABASE_SERVICE_ROLE_KEY`.
There is no anon key anywhere in the codebase, and `assets/track.js`
says so where the events are sent: *"The browser never talks to Supabase.
/api/track holds the key."*

`leads` holds names, emails, phone numbers, business names, and the
consent records `sms_consent`, `publicity_optin` and `data_agreement_at`.
Granting `select` on that to `anon` would create a public read path to
all of it that does not exist today. Row level security is enabled on
every table and would still stand in the way, but that turns a door that
is currently absent into one held shut by policy correctness. Leave it
absent.

### If a browser ever does need to read a table

Then it needs its own migration, its own policies written before the
grant, and a deliberate decision recorded here about exactly which
columns are exposed. Not a copied snippet.

## Files

| File | |
|---|---|
| `0001_funnel.sql` | `leads`, `funnel_events`, RLS on both |
| `0002_two_funnels.sql` | Two funnels on one schema, reporting views |
| `0003_analytics.sql` | `campaign_daily_metrics`, RLS |
| `0004_project_enquiry.sql` | Signature Work enquiry fields |

Verification scripts live one level up in `supabase/`. They are read
only and PII safe: identity columns come back as a digest or a boolean,
so output can be pasted into a chat or a ticket.
