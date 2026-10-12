# 05. Cost and build estimate

Question: what would a competent conventional team, without AI coding tools, have charged to build what exists in the two repos plus the four scheduled agents?

This estimate is rebuilt from scratch, bottom up, from the code inventory in 01 to 03. It uses only the sourced rates in section F of the 00 file. It does not start from the earlier $176K draft. Section 6 explains why the realistic figure nonetheless lands near that draft, and why that is a coincidence rather than an anchor.

---

## 1. What is being priced

Counted from the code (details in 01):

| Area | Count |
|---|---|
| Website HTML pages | 16 pages, about 14,500 lines (5 large sales pages, 6 mid, 5 small) |
| Shared browser JS | 2 files, 708 lines (`track.js`, `offer.js`) |
| Website serverless endpoints | 7 routable + 4 helpers, about 2,025 lines |
| Webhooks | 4 receivers (iClosed, Slack, Stripe, Timeliner) |
| Database migrations | 8 website (1,179 lines) + 36 agent (2,141 lines), plus 785 lines of verify/QA SQL |
| Database objects | 4 + 14 tables, 4 views, 5 functions |
| Cron / scheduled jobs | 1 Vercel cron, 2 interval jobs, 2 boot tasks, 4 Cowork schedules |
| Agent service | about 5,500 lines of source across 24 modules, 6 HTTP routes, 13 Slack actions, 3 modals, 4 event handlers |
| LLM integrations | 1 prompt with a model call (Speed-to-Lead), 4 scheduled Claude tasks |
| External integrations | Meta (Pixel, CAPI, Marketing API), iClosed, Supabase, Slack, Stripe, Resend, SendGrid, Google Drive, Google Calendar, Timeliner, Vimeo, Anthropic |
| Dashboards | 1 (owner) |
| Test harnesses | website: 8 scripts, 227 checks, 1,145 lines + 665 lines of Python guards; agent: 144 tests, about 3,400 lines |
| Governance docs | `AGENT_SPEC.md`, `HANDBOOK.md` (755 lines), website docs (about 1,100 lines) |

**Excluded:** GoHighLevel (in development with an outside builder, not part of the built system), video production itself, copywriting and offer strategy, Postiz setup, the abandoned unmerged branch `feat/lead-booking-automation`, and the cost of vendor subscriptions. **Included at cost:** the custom strategy-call funnel that was built and then retired, because a conventional team would have billed for it too.

## 2. Method

1. Break the system into 39 work packages, each tied to files that exist.
2. For each package estimate design, build, integrate and test hours for a competent conventional team that does not use AI coding tools. Low / Realistic / High hours reflect uncertainty about that team, not about scope.
3. Assign each package to one role from section F of the 00 file and price it at that role's **typical** rate.
4. Add project management and coordination overhead: 10% (low), 15% (realistic), 20% (high) of build hours, at the PM typical rate.
5. Show rate sensitivity separately (the same realistic hours at section F's low and high rates), so hour uncertainty and rate uncertainty are not multiplied together into a meaningless range.
6. Agency basis: freelance total × 1.5 (low), × 1.75 (realistic), × 2.0 (high), per section F ("multiply by about 1.5 to 2.0"; projectcostestimator's agency/freelancer median ratio is about 1.76).

Reasoning behind the per-package hours, in brief:

- **Large sales pages (50 h each realistic):** 1,400 to 2,500 lines each with custom reel players, modals, video facades, per-offer CTAs, tracking hooks and responsive fixes. About 2 days design, 3 days build, half a day tracking, most of a day QA across devices.
- **Mid pages (25 h each):** forms with validation and multi-step logic (`apply`), widget wrappers (`strategy-call`), per-offer confirmation logic (`call-booked`), plan-driven content (`welcome`).
- **Meta CAPI (40 h):** section F cites Cometly at 20 to 40 hours for a basic CAPI build; this one adds a shared `event_id` dedup scheme across browser, server and a vendor webhook, plus Events Manager QA.
- **Agent Flow A (80 h):** Slack Connect provisioning, a template engine with conditional sections, per-step idempotency and retry, Drive and Timeliner provisioning, prefilled form links.
- **Close desk (64 h):** agreement rendering, a signature record with hashing, a dependency-free PDF writer, Drive filing, Slack modals and allowlists.
- **Test suites (40 h website, 60 h agent):** 227 checks and 144 tests with hand-rolled fakes; conventional teams write tests more slowly than they write the code under test.
- **Scheduled Claude agents (32 h):** four prompts and skills with a shared preamble and output formats, plus a few days of tuning.

## 3. Work packages

| ID | Work package | Basis in code | Role | Low h | Realistic h | High h | Realistic cost |
|---|---|---|---|---|---|---|---|
| W1 | UX and visual design system for the site | 1 system | UX/UI designer | 24 | 40 | 60 | $4,000 |
| W2 | Large sales pages (index, founding, grow, sprint, signature) | 5 pages, about 9,700 lines | Frontend engineer | 175 | 250 | 350 | $21,750 |
| W2d | Design passes for the large pages | 5 pages | UX/UI designer | 40 | 60 | 90 | $6,000 |
| W3 | Mid pages (apply, owner UI shell, call-booked, welcome, project, strategy-call) | 6 pages, about 3,570 lines | Frontend engineer | 100 | 150 | 210 | $13,050 |
| W4 | Small pages (onboarding, about, privacy, terms, booked) | 5 pages, about 1,190 lines | Frontend engineer | 35 | 55 | 85 | $4,785 |
| W5 | Shared reel player and video modal, incl. the mobile fixes | 1 component reused on 4 pages | Frontend engineer | 25 | 40 | 60 | $3,480 |
| W6 | Vimeo VSL facade with Player API mirroring and milestones | 2 pages | Frontend engineer | 10 | 16 | 24 | $1,392 |
| T1 | assets/track.js: first-touch attribution, fbp/fbc, session, watchVideo | 282 lines | Analytics/tracking | 16 | 24 | 36 | $3,000 |
| T2 | Meta Pixel plus server CAPI (_meta.js), event taxonomy, dedup QA | 1 sender, 3 server events | Meta CAPI/pixel specialist | 24 | 40 | 60 | $4,000 |
| T3 | /api/track first-party ingestion (allowlist, PII strip, reserved schedule) | 140 lines + 22 checks | Backend engineer | 10 | 16 | 24 | $1,520 |
| I1 | iClosed scheduler wrapper, per-offer events, UTM passthrough | strategy-call + call-booked | Frontend engineer | 10 | 16 | 24 | $1,392 |
| I2 | iClosed vendor setup: 4 events, forms, redirects | vendor config | Automation/integration engineer | 8 | 16 | 24 | $1,920 |
| I3 | iClosed webhook: payload discovery, dedup key, CAPI Schedule, storage | 292 lines + 21 checks | Backend engineer | 14 | 24 | 36 | $2,280 |
| B1 | Supabase schema 0001-0004, views, RLS, verify SQL | 4 migrations, about 570 lines + 785 aux SQL | Backend engineer | 24 | 40 | 60 | $3,800 |
| B2 | Founding application endpoint (2 step, gates, dual capture) | 378 lines + 40 checks | Backend engineer | 16 | 24 | 36 | $2,280 |
| B3 | Project enquiry endpoint | 214 lines + 44 checks | Backend engineer | 8 | 12 | 18 | $1,140 |
| B4 | Custom strategy-call funnel (built Sep 12, retired Sep 21) | 208 lines, retired | Backend engineer | 10 | 16 | 24 | $1,520 |
| B5 | Transactional email and domain auth (SendGrid, Resend fallback) | 2 providers | DevOps/cloud engineer | 4 | 8 | 12 | $1,040 |
| B6 | Owner dashboard: report function 0006, auth API, dashboard UI | 162 SQL + 192 API + 733 HTML + 37 checks | Full-stack engineer | 34 | 52 | 76 | $4,940 |
| B7 | Meta spend sync, migrations 0007-0008, cron | 250 lines + 316 SQL + 41 checks | Backend engineer | 20 | 32 | 48 | $3,040 |
| B8 | Vercel config, redirects, cron, env, deploys | vercel.json + 2 envs | DevOps/cloud engineer | 8 | 12 | 20 | $1,560 |
| Q1 | Offer single source of truth plus claim/offer/preflight guards | offer.js 426 + 665 lines Python | Full-stack engineer | 20 | 32 | 48 | $3,040 |
| Q2 | Website test harness (8 scripts, 227 checks) | 1,145 lines | QA engineer | 24 | 40 | 60 | $2,880 |
| D1 | Website docs (analytics contract, environment, checkpoint) | about 1,100 lines | Product/project manager | 10 | 16 | 24 | $1,440 |
| S1 | Speed-to-Lead Slack function with Claude call card and prompt | about 210 lines + 1 prompt | AI/LLM engineer | 14 | 24 | 36 | $3,600 |
| A0 | Agent spec and Handbook governance (approval matrix, autonomy levels) | AGENT_SPEC + HANDBOOK, 755 lines | Product/project manager | 20 | 32 | 48 | $2,880 |
| A1 | ops schema and 36 migrations (incl. approval-reset pattern) | 2,141 lines SQL | Backend engineer | 30 | 48 | 72 | $4,560 |
| A2 | Railway service: Bolt Socket Mode, HTTP server, healthz, config, logging | core modules about 900 lines | DevOps/cloud engineer | 20 | 32 | 48 | $4,160 |
| A3 | Stripe webhook intake, store-first, offer matching, mismatch and duplicate approvals | stripe.js, offers.js, parts of onboarding | Backend engineer | 30 | 48 | 70 | $4,560 |
| A4 | Flow A onboarding: Slack Connect, templated email, Drive folder, prefill, template engine | onboarding.js 836+, templates, drive, prefill | Automation/integration engineer | 50 | 80 | 120 | $9,600 |
| A5 | Billing alerts, Sprint-to-retainer, Sprint credit, Front of the Line | billing.js + offers/onboarding changes | Backend engineer | 20 | 32 | 48 | $3,040 |
| A6 | Close desk: agreement page, signing record, PDF writer, Drive filing, modals | agreements.js 660+, pdf.js | Full-stack engineer | 40 | 64 | 96 | $6,080 |
| A7 | Flow B shoot booking with calendar and DB date rule | shoots.js 400, calendar.js | Automation/integration engineer | 20 | 32 | 48 | $3,840 |
| A8 | Kickoff calendar sweep | kickoff.js 170 | Automation/integration engineer | 10 | 16 | 24 | $1,920 |
| A9 | Timeliner integration and self-registering webhooks | timeliner.js + production.js | Automation/integration engineer | 14 | 24 | 36 | $2,880 |
| A10 | Slack manifest, handlers, home tab, no-join nudge | handlers.js 317 + slack.js | Automation/integration engineer | 14 | 24 | 36 | $2,880 |
| A11 | Agent test suite (144 tests, in-memory fakes) | about 3,400 lines | QA engineer | 40 | 60 | 90 | $4,320 |
| A12 | Google Forms via Apps Script (intake, build questionnaire) | 247 lines | Automation/integration engineer | 4 | 8 | 12 | $960 |
| C1 | Four scheduled Claude agents (prompts, skills, Handbook preamble, QC) | 4 tasks, outside repos | AI/LLM engineer | 20 | 32 | 48 | $4,800 |
| | **Build subtotal** | | | **1,015** | **1,587** | **2,341** | |

| Role | Typical rate (00 file F) | Low h | Realistic h | High h | Realistic cost |
|---|---|---|---|---|---|
| Frontend engineer | $87 | 355 | 527 | 753 | $45,849 |
| Backend engineer | $95 | 182 | 292 | 436 | $27,740 |
| Automation/integration engineer | $120 | 120 | 200 | 300 | $24,000 |
| Full-stack engineer | $95 | 94 | 148 | 220 | $14,060 |
| UX/UI designer | $100 | 64 | 100 | 150 | $10,000 |
| QA engineer | $72 | 64 | 100 | 150 | $7,200 |
| AI/LLM engineer | $150 | 34 | 56 | 84 | $8,400 |
| DevOps/cloud engineer | $130 | 32 | 52 | 80 | $6,760 |
| Product/project manager | $90 | 30 | 48 | 72 | $4,320 |
| Meta CAPI/pixel specialist | $100 | 24 | 40 | 60 | $4,000 |
| Analytics/tracking | $125 | 16 | 24 | 36 | $3,000 |

Build subtotal plus overhead:

| Basis | Build hours | PM / coordination hours | Total hours | Freelance cost (typical rates) |
|---|---|---|---|---|
| LOW | 1,015 | 102 (10%) | 1,116 | **$108,000** |
| REALISTIC | 1,587 | 238 (15%) | 1,825 | **$177,000** |
| HIGH | 2,341 | 468 (20%) | 2,809 | **$272,000** |

Blended realistic rate: about $97/hour. Of the 1,587 realistic build hours, about 1,030 are the website and about 560 are Speed-to-Lead, the agent and the Cowork tasks.

**Rate sensitivity (realistic hours, rates varied):** at section F's low rates for every role, $108,000; at its high rates, $262,000. So a reasonable freelance team could land anywhere from about $108K to $272K, and the honest single number is about $177K.

## 4. Two bases: US freelance team vs US agency

| | LOW | REALISTIC | HIGH |
|---|---|---|---|
| US freelance team | $108,000 | $177,000 | $272,000 |
| Agency multiplier | × 1.5 | × 1.75 | × 2.0 |
| **US agency** | **$162,000** | **$309,000** | **$543,000** |

Cross-checks from section F:
- FullStack Labs: small US agencies bill $75 to $250 per hour; the realistic agency figure implies about $170 per hour blended, inside that band.
- QBS Global: a roughly 1,000-hour custom CRM build costs $100K to $180K with a US team. This system is larger than 1,000 hours but is not a CRM, so the comparison is directional only.
- Clutch: custom software averages $132K and about 13 months. The freelance realistic figure is above that average, which fits a system with this many integrations.
- EGGKNITE: a server-side tracking build runs $5K to $25K. The tracking packages here (T1 to T3, I3) total about $10,800 realistic, inside that range.
- BLS: software developer median $135,980 per year gives a contractor rate of about $97 to $129 per hour at salary/2080 × 1.5 to 2.0. The blended realistic rate here ($97) sits at the bottom of that band.

## 5. Team, calendar time and maintenance

**Team shape (realistic):** a part-time PM, one frontend engineer, one backend engineer, one automation/full-stack engineer, plus part-time UX, QA, a Meta tracking specialist and an AI/LLM engineer. About 4 to 5 people, roughly 4.5 full-time equivalents.

**Calendar time:**

| Basis | Hours | Team throughput | Build weeks | With coordination, vendor setup and client review cycles |
|---|---|---|---|---|
| LOW | 1,116 | 5 people × 30 productive h/week | about 7.5 | 2 to 3 months |
| REALISTIC | 1,825 | 4.5 FTE × 30 h/week | about 13.5 | 4 to 5 months |
| HIGH | 2,809 | 4 people × 30 h/week | about 23 | 6 to 7 months |

The extra calendar time beyond build weeks reflects things a conventional team waits on: vendor approvals (Google API verification, A2P registration, Slack Pro for Slack Connect), Meta Events Manager verification, legal review of contract text, and client sign-off rounds.

**Monthly maintenance (labor only):** 15 to 30 hours per month for vendor API changes (Meta Graph versions, iClosed payload changes), offer and copy changes that ripple through `offer.js`, migrations and template re-approvals, and monitoring. At the blended freelance rate that is about **$1,500 to $2,900 per month**; at agency rates about $2,600 to $5,800 per month. Vendor subscriptions are extra: `[JADON: actual monthly tool spend]`.

## 6. Why the realistic figure lands near the old $176K draft

The earlier Cowork draft used placeholder rates ($150/hour backend, $175/hour AI) over about 1,360 hours and reached about $176K. This estimate uses lower, sourced rates (blended $97/hour) over more hours (1,825), built package by package from the code. The two errors in the draft (rates too high, hours too low) roughly cancelled out. The per-package table above is the evidence that the hours were not tuned to hit a target. If a reviewer disputes the hours, the table shows exactly which packages to argue about.

## 7. What NTC actually spent

**Build span from git:**

| | Website | Speed-to-Lead + Agent | Combined |
|---|---|---|---|
| First commit | Jun 10 2026 | Sep 24 2026 | Jun 10 2026 |
| Last commit | Oct 4 2026 | Oct 4 2026 | Oct 4 2026 |
| Active days | 27 | 10 | 31 |
| Commits | 223 | 76 | 299 |
| Lines added / deleted | 30,262 / 7,504 | 13,377 / 702 | 43,639 / 8,206 |

The operating-system work (tracking, booking, agent, dashboard) falls between Sep 2 and Oct 4: about 25 active days. Hours worked per day are not in git: `[JADON: hours per active day, or total hours]`.

**Tools the repos show NTC using (amounts not in the repo):**

| Tool | Evidence | Monthly cost |
|---|---|---|
| Vercel (Pro, per session 3247d1bf) | `vercel.json`, cron | `[JADON: actual spend]` |
| Supabase | migrations, `_supabase.js` | `[JADON: actual spend]` |
| Railway (agent, Postiz) | `agent/railway.json` | `[JADON: actual spend]` |
| iClosed | widgets, webhook | `[JADON: actual spend]` |
| Slack (Pro required for Slack Connect, `AGENT_SPEC.md`) | Bolt app | `[JADON: actual spend]` |
| Stripe | webhooks, Payment Links | per-transaction fees |
| SendGrid, Resend | `api/apply.js`, `agent/src/email.js` | `[JADON: actual spend]` |
| Twilio (verification only) | verification file | `[JADON: actual spend]` |
| Vimeo | VSL embeds | `[JADON: actual spend]` |
| Mux (one night) | `fecd5fd` | `[JADON: actual spend]` |
| Google Workspace / Cloud | Drive, Calendar, service account | `[JADON: actual spend]` |
| Timeliner (pilot) | `agent/src/timeliner.js` | `[JADON: actual spend]` |
| Claude (Claude Code, Cowork, API for Speed-to-Lead) | commit trailers, `api/slack.js` | `[JADON: actual spend]` |
| GitHub Copilot (one commit) | `cca68df` trailer | `[JADON: actual spend]` |
| GoHighLevel builder (outside builder, in development) | 00 file; cost confirmed by Jadon | **$1,600** quoted (one-time; scope and timeline not yet confirmed). Ongoing GHL subscription: `[JADON: actual spend]` |

## 8. Defensible marketing statements

**Central story: the freelance realistic figure, $177K.** The agency figure ($309K) is supporting context only. It is the more dramatic number, but the freelance basis is harder to dismiss as marketing inflation.

**Approved headline wording:**

> We asked what it would cost a conventional US freelance team to recreate the system we built. The realistic estimate came back around $177,000.

**Required qualifier, immediately after the headline:**

> Based on approximately 1,825 estimated hours across development, automation, tracking, QA, AI implementation, design, and project management. Estimated replacement cost, not money NTC actually spent.

**Positioning line:**

> AI did not replace the operating system. AI helped us build and operate a better one.

In body copy prefer "AI-enabled" or "AI-assisted backend" over "AI-powered". The automation engine is deterministic; the AI layer is Speed-to-Lead, the four scheduled Cowork tasks, and Claude Code as the development tool (03, section 0).

**Before the cost comparison is used publicly,** two numbers are needed from Jadon: approximate cash spent on tools and contractors during the build (Claude, Vercel, Supabase, Railway, iClosed, Slack, Vimeo and Mux, Timeliner, Google, the GHL builder, other directly related software), and an estimate of personal hours worked (a range such as "120 to 180 hours" is enough). Git commits do not measure labor.

### Supporting statements

1. **"A conventional US freelance team would need roughly 1,100 to 2,800 hours to build this system; at sourced 2026 rates that is about $108K to $272K, with a realistic estimate near $177K."** Rests on: section 3 totals and section 4 freelance row.
2. **"Built in about 25 active days of work between September 2 and October 4, 2026; a conventional team of four to five would typically need four to five months of calendar time."** Rests on: git span (section 7) and the realistic calendar estimate (section 5). Replace "active days" with hours once `[JADON: total hours]` is known.
3. **"At typical US agency rates, the same scope would price at roughly $160K to $540K."** Rests on: section 4 agency row. Use the range, not the top.

**Do NOT say:**
- "We saved $177K" or any savings figure. NTC never had that budget; savings require actual spend, which is unknown.
- "AI built our CRM" or anything implying GoHighLevel is deployed or validated. It is in development with an outside builder.
- "Our AI agent runs onboarding / the business." The Railway agent contains no AI model calls; it is rule-based with human approvals. Accurate: "AI coding tools built our automation layer" and "scheduled AI assistants draft briefs and replies for human approval."
- "Fully automated." Every client-facing step is template-approved or human-approved.
- "$500K system." The high agency figure is a ceiling, not an estimate.
- "Built in 27 days" for the whole thing. The website history spans 117 calendar days; 27 is its active-day count, and the agent adds more.
- Any client result, conversion rate or revenue figure. None is in this sourcebook.
- Anything that implies the tests run automatically on every deploy. There is no CI.

---

## 9. Reusable IP vs NTC proprietary IP

| Concept | Classification | Why |
|---|---|---|
| Static HTML + serverless functions as an AI-maintainable stack | SAFE TO TEACH | General architecture choice |
| First-touch attribution in localStorage, `fbc` derived from `fbclid`, never invented | SAFE TO TEACH | Standard practice, well documented by Meta |
| Browser + server CAPI with a shared `event_id` | SAFE TO TEACH | Meta's own recommended pattern |
| Using the vendor's booking id as the dedup key | SAFE TO TEACH | Generic technique |
| Reserving conversion events server-side so the public endpoint can't forge them | SAFE TO TEACH | Security lesson |
| First-party event table with allowlist and PII stripping | SAFE TO TEACH | Generic pattern |
| Coverage-aware dashboard ("unavailable", not zero) | SAFE TO TEACH | Generic design principle |
| Meta spend sync with atomic per-account replace and staleness flag | SAFE TO TEACH | Generic integration pattern |
| RLS on, zero policies, service-role-only access | SAFE TO TEACH | Generic Supabase hardening |
| Store-first webhook processing with replay on boot | SAFE TO TEACH | Generic reliability pattern |
| Per-template approval flags; wording changes reset approval | SAFE TO TEACH | The core governance idea, and the most teachable |
| "No money actions" by construction (no payment API client) | SAFE TO TEACH | Generic safety pattern |
| Autonomy levels L0 to L3 and L1-to-L2 promotion rule | SAFE TO TEACH IN ABSTRACT | Teach the ladder; keep the exact thresholds and approval matrix private |
| Handbook preamble on every prompt | SAFE TO TEACH | Generic prompt-governance technique |
| Treat inbound text as data inside delimiters | SAFE TO TEACH | Generic prompt-injection defense |
| Offer single source of truth plus grep checks against every page | SAFE TO TEACH | Generic; NTC's actual terms stay private |
| Lessons in section 2 of 04 | SAFE TO TEACH (with `<Client>` placeholders) | Experience, not secrets |
| Close desk (sign then pay, hash of exact text, PDF) | SAFE TO TEACH IN ABSTRACT | Teach the flow; not the contract text; add a legal-review caveat |
| Slack Connect onboarding with a 48h nudge | SAFE TO TEACH IN ABSTRACT | Pattern is generic; channel naming and copy are NTC's |
| Speed-to-Lead call card format | SAFE TO TEACH IN ABSTRACT | Card sections are teachable; the prompt is not |
| `lib/rules.js` prompt text, fit signals, budget-to-offer mapping | KEEP PRIVATE | Sales playbook |
| Cowork task instructions and skills | KEEP PRIVATE | Operating playbook |
| `HANDBOOK.md` full text (approval matrix, escalation list, QC checklist, client list) | KEEP PRIVATE | Contains client list and internal policy |
| MSA, Order Form, Sprint-credit clauses (`ops.agreement_templates`) | KEEP PRIVATE | Legal documents |
| Rate card (`api/_rates.js`, `ops.offers`, `payment_links`), continuation price, Front of the Line pricing | KEEP PRIVATE | Pricing deliberately removed from the public site |
| Offer economics (outsourced post-production cost, margin floor) | KEEP PRIVATE | Unit economics |
| Welcome email and Slack template wording | KEEP PRIVATE | Client-facing brand copy |
| Founding Three terms beyond what the public page says | KEEP PRIVATE | Offer strategy |
| Supabase project URL, pixel id, Slack channel and bot ids in repo files | KEEP PRIVATE | Identifiers, not secrets, but no reason to publish |
| GoHighLevel snapshot design (outside builder) | KEEP PRIVATE | Not NTC's to teach yet, and not built |
