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
10. **Cost estimate:** realistic about 1,825 hours and $177K on a US freelance basis (range $108K to $272K), $309K on a US agency basis (range $162K to $543K). Use ranges, never a savings figure.

## Open questions for Jadon

1. Have migrations `0005` to `0008` been run on the production Supabase project? (Only `0004` is marked applied in the repo.)
2. Are the owner dashboard and Meta spend sync confirmed working in production, with `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID` and `CRON_SECRET` set?
3. Which close-desk texts are currently approved? Migrations `023` to `035` reset the MSA, order-form rows, payment links and Sprint-credit clauses to unapproved.
4. Is the Signature funnel misfiled? Check the iClosed Signature event name against `offerFrom()` in `api/iclosed-webhook.js`, and add `/signature` to `track.js funnelName()`.
5. Is the Founding Stripe checkout a one-time $0 checkout or a trial that auto-charges month two? (Flagged Sep 29, left to check in Stripe.)
6. Total hours worked, and monthly tool spend for every vendor in 05 section 7.
7. What is the GoHighLevel builder's scope, timeline and cost, and when does the pilot sub-account go live?
8. Timeliner go/no-go on Oct 26: if no, does Clipflow stay, and should the agent's Timeliner steps be switched off?
9. When will `agent-v1` merge to `main`, and will the merge keep main's kickoff-ignore filter in `api/slack.js`?
10. Should GA4 and Google Ads be wired up, or removed from the pages and the privacy policy?
11. Are the four Cowork tasks still running on the schedules in the 00 file?

## Known gaps in the evidence

- **Production state is inferred.** The repos show what was deployed, not whether migrations ran or env vars are set. Statuses marked "inferred" need a check in Supabase, Vercel and Railway.
- **The four Cowork tasks are documented only from the 00 file.** Their instructions and run history were not inspected.
- **No transcript covers** the owner dashboard, the Meta spend sync, the iClosed webhook build or the Vimeo switch. Those are documented from git and code only.
- **Vendor configuration is invisible to git:** iClosed forms and events, Stripe products and Payment Link redirects, Slack app settings, Meta Events Manager.
- **No financial data:** tool spend, hours worked and revenue are not in the repos.
- **Several repo docs are stale:** `README.md`, `cursorrules`, `docs/ENVIRONMENT.md` (`BOOKING_URL`), `docs/ANALYTICS.md` (funnel table), `docs/PHASE-2-CHECKPOINT.md` ("not merged"), `docs/pricing/package-scopes.md`. The Handbook still names Notion and Clipflow as current systems.
- **Local clones were stale.** `ntc-speed-to-lead` was 16 commits behind GitHub at the start; this sourcebook uses the fetched `origin` branches (`origin/agent-v1` at `c9601e4`, `origin/main` at `de01a27`).
