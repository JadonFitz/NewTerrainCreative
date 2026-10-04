# NTC AI Operating System Sourcebook

A source-of-truth technical dossier on the infrastructure New Terrain Creative built between June and October 2026. It is the raw material for two future paid guides: one for agencies (how to build an AI-assisted operating system and backend) and one for business owners (what a modern AI-enabled backend should contain). **This folder is not either guide.** It describes what exists, with file paths, commit SHAs and status labels, so a writer cannot accidentally overclaim.

Documentation only. Nothing in production code, config, migrations, env vars or deploys was changed to produce it.

## Files

- **`00-cowork-context-and-rates.md`** (input, written by Claude Cowork on Oct 4). Secondary evidence from Vercel, Slack, the Agent Handbook and Drive, plus sourced 2026 US rates. Where it disagrees with the code, the code wins; conflicts are listed in 01 and in section 3 of 04.
- **`01-architecture.md`**. Every component of the system: what it is, why it is used, what it connects to, data in and out, failure behaviour, where it lives in code, and its status. Full-system and subsystem Mermaid diagrams, all env var names, the auth gates, both database schemas, and an honest list of what is not used (Next.js, an auth provider, SMS, CI, GA4).
- **`02-workflows.md`**. The end-to-end trace from ad impression to retention, then separate traces for Growth, Ad Sprint, Founding Three and Signature leads, client onboarding day 0 to 7, the close desk, billing events, lead follow-up, shoot booking, Sprint-to-retainer upgrades, reporting, and internal and client-facing Slack. Every step is marked AUTO, AI, APPROVED or HUMAN.
- **`03-agents-and-automation.md`**. Every automated or AI-assisted system: Speed-to-Lead (the only model call in either repo), the NTC Agent (a rule engine with no model calls), the four scheduled Cowork tasks, and the website automations. The autonomy model (Handbook L0 to L3 and the spec's Tiers 1 to 3), and a rule-by-rule table of what the code enforces versus what is policy only.
- **`04-build-history-and-lessons.md`**. The most important file. A dated phase timeline of both repos and 56 lessons grouped by theme, each in the form Thought / Happened / Changed / Recommend, with SHAs. Includes item-by-item verification of the 23 reversals in the 00 file and corrections to its timeline.
- **`05-cost-and-build-estimate.md`**. A bottom-up estimate of what a conventional team without AI coding tools would have charged: 39 work packages, hours by role, sourced rates, LOW / REALISTIC / HIGH on a US freelance basis and a US agency basis, calendar time, maintenance, NTC's actual build span, defensible marketing statements and statements not to make. Ends with the reusable-vs-proprietary IP classification.
- **`06-business-principles.md`**. Thirty business principles drawn from the 56 lessons, written for business owners with no technical background (a dentist, a contractor, a law firm, a videographer). Each is tied to what happened at NTC and mapped to a lifecycle stage and one of the five scorecard dimensions (Acquisition, Conversion, Sales, Operations, Intelligence), so it can feed the Backend Scorecard and the quiz directly.

## Top 10 facts a writer must get right

1. **The website is not Next.js.** It is 16 static HTML pages plus Vercel serverless functions in `api/`, with no build step and no npm dependencies (`vercel.json`: `framework: null`, `buildCommand: null`).
2. **The "NTC Agent" on Railway makes no AI model calls.** It is a deterministic rule engine with Slack approval buttons. The only model call in either repo is Speed-to-Lead's internal call card (`ntc-speed-to-lead` `api/slack.js`). The scheduled AI work lives in four Claude Cowork tasks outside both repos.
3. **GoHighLevel is in development with an outside builder and is not in either repo.** Never describe an AI-built or deployed CRM.
4. **Nothing reaches a client without an approval.** Client templates send only when `approved = true`; every wording change resets approval; contracts need Jadon specifically; the agent has no Stripe API client, so it cannot move money.
5. **Booking is iClosed**, after five designs in ten weeks (04, L1). NTC keeps its own attribution passthrough, its own Meta `Schedule` conversion, and its own copy of every booking.
6. **Meta conversions are deduplicated by a shared `event_id`**: for bookings, the iClosed booking id (`callPreviewId`), sent from both the browser and the server.
7. **Autonomy levels L0 to L3 are Handbook policy, not code.** The code's real mechanism is per-template approval flags and allowlisted Slack buttons (03, section 4).
8. **There is no CI.** 227 website checks and 144 agent tests pass, but they run by hand and nothing gates a deploy.
9. **Build span:** 299 commits across 31 active days between Jun 10 and Oct 4 2026; the operating-system work itself is Sep 2 to Oct 4, about 25 active days. Most commits are co-authored by Claude models.
10. **Cost estimate:** realistic about 1,825 hours and **$177K on a US freelance basis** (range $108K to $272K). That is the central story. The agency basis ($309K, range $162K to $543K) is supporting context only. Always add the qualifier: estimated replacement cost, not money NTC actually spent. Never use a savings figure.

**Positioning:** "AI did not replace the operating system. AI helped us build and operate a better one." In body copy say "AI-enabled" or "AI-assisted backend", not "AI-powered".

## Production checks done Oct 4

Read-only checks (unauthenticated requests to live endpoints, plus Vercel runtime logs). Details are in 01 section 3.23.

- **Owner dashboard: LIVE, verified.** Password set; signed-in report loads succeed.
- **Migrations `0006`, `0007`, `0008`: live, verified.** `0005` cannot be verified from logs (likely applied).
- **Meta spend sync: running, verified, but returning no data.** The Oct 4 run logged `status: ok` with `fetched: 0` over 90 days. Either no ads ran in the configured account, or the account id or token points at the wrong account.
- **Signature attribution: wrong, confirmed from code.** Bookings from the `signature-project` event are filed as `paid_retainer`; `/signature` page traffic is filed as `organic_site`. Not fixed (a production code change, waiting on approval).
- **New finding: two iClosed webhook deliveries were rejected for a bad key** (Oct 3 23:02 and Oct 4 00:07 UTC), so those bookings never reached Meta server-side. Likely an older second webhook in iClosed with an outdated URL.
- **Close-desk approvals: not checkable without database access.** To see them, run this read-only query in a fresh Supabase SQL editor tab:

```sql
select 'message_template' as kind, key as name, approved from ops.message_templates
union all
select 'agreement_template', key, approved from ops.agreement_templates
union all
select 'payment_link', choice, approved from ops.payment_links where active
order by 1, 2;
```

## Open questions for Jadon

1. Why does the Meta spend sync fetch 0 rows? Is the configured ad account the one running NTC's ads, and does the token have `ads_read` on it?
2. Which close-desk texts are currently approved? (Run the query above.) Migrations `023` to `035` reset the MSA, order-form rows, payment links and Sprint-credit clauses to unapproved.
3. Should the Signature attribution fix go in now? (Two small code changes: map the `signature-project` event to `signature_work` in the webhook, and add `/signature` to `track.js`.)
4. Is there a second iClosed webhook with an old key? Check iClosed's webhook settings and delete or update the extra one.
5. Is the Founding Stripe checkout a one-time $0 checkout or a trial that auto-charges month two? (Flagged Sep 29, left to check in Stripe.)
6. Approximate cash spent during the build on tools and contractors (Claude, Vercel, Supabase, Railway, iClosed, Slack, Vimeo and Mux, Timeliner, Google, the GHL builder, other directly related software), and an estimate of personal hours (a range is fine). Both are needed before the cost comparison is used publicly.
7. GoHighLevel: the builder's quote is $1,600. What are the final scope and timeline, and when does the pilot sub-account go live?
8. Timeliner go/no-go on Oct 26: if no, does Clipflow stay, and should the agent's Timeliner steps be switched off?
9. When will `agent-v1` merge to `main`, and will the merge keep main's kickoff-ignore filter in `api/slack.js`?
10. Should GA4 and Google Ads be wired up, or removed from the pages and the privacy policy?
11. Are the four Cowork tasks still running on the schedules in the 00 file?

## Known gaps in the evidence

- **Some production state is still inferred.** Vercel-side checks are done (above). The Railway agent, Supabase `ops` data and vendor settings were not inspected; statuses marked "inferred" in those areas still need a check.
- **The four Cowork tasks are documented only from the 00 file.** Their instructions and run history were not inspected.
- **No transcript covers** the owner dashboard, the Meta spend sync, the iClosed webhook build or the Vimeo switch. Those are documented from git and code only.
- **Vendor configuration is invisible to git:** iClosed forms and events, Stripe products and Payment Link redirects, Slack app settings, Meta Events Manager.
- **No financial data:** tool spend, hours worked and revenue are not in the repos.
- **Several repo docs are stale:** `README.md`, `cursorrules`, `docs/ENVIRONMENT.md` (`BOOKING_URL`), `docs/ANALYTICS.md` (funnel table), `docs/PHASE-2-CHECKPOINT.md` ("not merged"), `docs/pricing/package-scopes.md`. The Handbook still names Notion and Clipflow as current systems.
- **Local clones were stale.** `ntc-speed-to-lead` was 16 commits behind GitHub at the start; this sourcebook uses the fetched `origin` branches (`origin/agent-v1` at `c9601e4`, `origin/main` at `de01a27`).
