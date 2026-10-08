# 04. Build history and lessons

The most important file in the sourcebook. It records what was tried, what broke, and what replaced it, with commit SHAs. Nothing has been sanded down. Dates are the author's local time (Pacific) from git unless marked.

Sources: `git log` of both repos (website `main` plus unmerged branches; `ntc-speed-to-lead` `origin/main` and `origin/agent-v1` after a fetch on Oct 4), seven past Claude Code session transcripts (short ids below), and section C of the 00 file (verified item by item in section 3).

---

## 1. Phase timeline

### 1.1 Website (`NewTerrainCreative`): 223 commits, Jun 10 to Oct 4 2026, 27 active days

| Phase | Dates | Commits | What was built | Key SHAs |
|---|---|---|---|---|
| W0 Portfolio | Jun 10 to 23 | 12 | Static portfolio on Vercel, hero video, YouTube modal work grid. `index.html` hand-synced with a duplicate `ntc-landing.html` | `6091f5e`, `569d730`, `c305011` |
| W1 Cinematic site, first packages | Jul 3 to 8 | 16 | 60-second intro film with gold title reveal, case studies, founder bio, first priced four-package lineup | `c82511b`, `0b310e2`, `c42f3cb` |
| W2 Three doors, growth page | Jul 21 | 12 | Offers collapsed to three, `grow.html`, Google Calendar booking, `/book` interstitial for Google Ads conversion tracking | `066302d`, `bfd6174`, `18974d5` |
| (gap) | Jul 22 to Sep 1 | 0 | 42 days with no commits | |
| W3 Ad Sprint, offer restructuring | Sep 2 to 4 | 35 | `sprint.html`, `cleanUrls` fix, Founding Five then Founding Three, vertical reel, retainer ladder, Lead Foundation, Founding split onto its own landing page | `5fd2776`, `488d5d5`, `ca44035`, `563741a`, `200b2d4` |
| W4 Application and tracking stack | Sep 10 | 26 | `/apply` with hard gates, Resend then SendGrid, Twilio verification, Meta Pixel, privacy policy, server CAPI Lead with shared `event_id`, `assets/track.js`, Supabase first-party DB, RLS hardening, `/onboarding`, `/booked` | `9bd2f6a`, `311eda1`, `661beee`, `5855994`, `c581263`, `42a86eb` |
| W5 Phase 2 analytics, offer source of truth | Sep 12 to 13 | 36 | `offer.js`, internal rates split off, custom `/strategy-call` funnel, two-step Founding application, event taxonomy, PII-safe evidence queries, `schedule` reserved server-side, CAPI dedup QA, `/project`, `/production-media`, claims-drift checker. "Phase 2 checkpoint": 95 automated checks | `9f49cb2`, `5f362d3`, `065dbe8`, `276cb92`, `5e19dd2`, `9c8e49f` |
| W6 Quiet week | Sep 15 to 19 | 3 on main (+3 on unmerged branches) | `/production-media` rebuilt, terms of service for Google/YouTube API verification. Unmerged: custom Google Calendar polling booking sync | `30880fe`, `8df65d4`, `b182a56` (unmerged) |
| W7 iClosed pivot | Sep 21 to 24 | 49 (33 on Sep 21) | Custom strategy-call funnel retired for iClosed, `/call-booked`, per-offer schedulers, `/apply` parked, pixel added to three pages that never had it, iClosed webhook to CAPI, `/signature`, `/project` parked, `/book` redirects, `/about`, `llms.txt`, sitemap | `4eaa70d`, `9519166`, `e6b92e3`, `eb85bb1`, `4079d70`, `b37b13c`, `71464ff` |
| W8 Price comparison, welcome | Sep 25 to 29 | 11 | Business phone, payroll comparison beside every price, `/welcome` after Stripe checkout, three-week cadence, Founding counter, intake forms gated by package | `5aadf84`, `fb69773`, `386f082`, `4a46103`, `fdd1cd8` |
| W9 Pricing off the site, owner dashboard | Oct 2 to 4 | 23 | All pricing removed, retainers become creative plus paid media, internal rate card, VSL on `/sprint` (Mux then Vimeo), first-party `VSLPlay`, `/owner`, first-party booking storage, daily Meta spend sync, Schedule stops sending iClosed's IP, offer-aware `/call-booked`, Founding VSL, Founding copy as a set-up month | `1bba59a`, `5a4747b`, `fecd5fd`, `cc7f75a`, `e8971f6`, `214eb8a`, `8402574`, `6398c1c`, `9be44d2` |

By month: Jun 12, Jul 28, Aug 0, Sep 160, Oct 23. Lines added 30,262, deleted 7,504 (no binaries or lockfiles).

### 1.2 Speed-to-Lead and NTC Agent (`ntc-speed-to-lead`): 76 unique commits, Sep 24 to Oct 4 2026, 10 active days

| Phase | Dates | Commits | What was built | Key SHAs |
|---|---|---|---|---|
| S1 Speed-to-Lead webhook | Sep 24 | 2 | Vercel function: iClosed Slack alert becomes a Claude call card | `f1b870a`, `cca68df` |
| S2 Agent Phase 1 | Sep 26 to 29 | 26 | `AGENT_SPEC.md` v2.1, Handbook v1.6, `ops` schema (`001`), Bolt Socket Mode agent on Railway, Flow A + Flow D, offer catalog with metadata-first matching, billing alerts only, live + sandbox Stripe secrets, duplicate-client guard, Drive folders, `/healthz` channel membership | `6af857e`, `f4f52c4`, `a179575`, `ff802aa`, `f74f2d9`, `7c056fd`, `fbbbc5a`, `d3f757a` |
| S3 Lifecycle automation | Sep 30 to Oct 1 | 21 | Plan changes, annual offers, pilot offer, Timeliner + webhooks, Slack Connect nudge (Sep 30); kickoff calendar sync, HTML emails, close desk with signed PDF, Flow B shoot booking, calendar guest workaround (Oct 1) | `a149bae`, `903b4cb`, `5a205ee`, `2d49a92`, `15a1311`, `cf80cb6`, `716649a`, `31f861c` |
| S4 Rate card sync | Oct 2 | 10 | Offer v2 lock and rate card (`023`, `024`), Speed-to-Lead card for the new structure, Handbook v1.7/1.8, MSA "No Performance Promise" (`025`), Sprint budget ranges | `47f8757`, `19128c6`, `cb6d622`, `62813ee`, `dedc7bb` |
| S5 Packages and upgrades | Oct 3 22:36 to Oct 4 00:47 | 16 + 1 on main | Handbook v1.9 to v1.15, Slack reminder wording approved (`026`), Sprint welcome without Friday recaps (`027`), Front of the Line (`028`, `031`, `034`), Eight = 8 distinct angles (`029`), retainers Meta-focused (`030`), annual plans return (`032`), Sprint credit, welcome access by plan (`033`), package-specific contract and welcomes (`035`, `036`) | `7d56496`, `57b38c6`, `b7a4f01`, `f6324df`, `0e43baa`, `c9601e4`, `de01a27` |

Lines added 13,377, deleted 702. `agent-v1` has never been merged to `main`.

### 1.3 Combined

- Calendar span: Jun 10 to Oct 4 2026 (117 days). Active days across both repos: 31. Commits: 299.
- Everything that looks like an "AI operating system" (tracking stack, booking, agent, dashboard) was built between **Sep 2 and Oct 4**, about 25 active days.

---

## 2. Lessons

Format for each: **Thought / Happened / Changed / Recommend now.**

### 2.1 Custom replaced by SaaS

**L1. Booking: five designs in ten weeks.**
- **Thought:** "Put a booking calendar on the site" is a small job.
- **Happened:** Google Calendar link (`bfd6174`, Jul 21), then a `/book` interstitial because Calendar can't redirect after booking for Google Ads conversions (`18974d5`), then a custom 13-question `/strategy-call` form and endpoint (`5f362d3`, Sep 12), then an unmerged custom calendar-polling sync because "Appointment Schedules emit no webhook" (`b182a56`, Sep 19, session 3247d1bf), then iClosed (`4eaa70d`, Sep 21: "The 13-question form and its backend are gone"). iClosed then needed its own fixes (sections 2.3 and 2.8).
- **Changed:** iClosed owns qualification, calendar, reminders and SMS. NTC keeps attribution passthrough, its own Schedule conversion and first-party booking storage (`e8971f6`).
- **Recommend:** buy scheduling on day one. Spend the custom effort only on what the vendor can't do for you: attribution, dedup, your own copy of the data.

**L2. `/apply` parked: the form was longer than the sale.**
- **Thought:** a two-step application filters for fit.
- **Happened:** built Sep 10 (`9bd2f6a`), split in two Sep 12 (`065dbe8`). Applicants answered about 24 questions on `/apply` and then 9 more to book, "nothing chased them across it" (`9519166`, Sep 21).
- **Changed:** parked, not deleted. Preflight fails if anything links `/apply` again.
- **Recommend:** one form, in the booking tool. Count every question across the whole path, not per page.

**L3. `/project` parked for the same reason** (`def133c` built Sep 13, `b37b13c` parked Sep 23): "keeping a brief in front of it would have meant asking the same things twice."

**L4. The confirmation iframe went back to the vendor.** An in-house iframe for the booking confirmation was replaced with iClosed's own widget "so the vendor owns the frame, its resize messaging and its mobile behaviour" (`8575ff4`).

**L5. Retire, then delete.** `api/strategy-call.js` was kept as a 410 tombstone: "Retiring and deleting in one step removes the fallback before the replacement is proven" (`4eaa70d`). It was meant to be deleted after a week; it still exists.

### 2.2 SaaS replaced by custom (or custom kept beside SaaS)

**L6. iClosed's Meta integration failed; NTC sends Schedule itself.**
- **Thought:** let iClosed report bookings to Meta (`4eaa70d`).
- **Happened:** "Its Conversions API setup rejects a token Meta itself accepts" (`f2a9f1c`, Sep 21).
- **Changed:** browser `Schedule` from `/call-booked` first (`f2a9f1c`), then a server webhook (`eb85bb1`) with the same booking id for dedup.
- **Recommend:** assume a vendor's "Meta integration" will be partial. Own the conversion events that your ad optimization depends on.

**L7. First-party copies of vendor data.** Bookings are written to Supabase (`e8971f6`) and Meta spend is pulled daily (`214eb8a`), so the owner dashboard does not depend on vendor reporting. **Recommend:** keep your own row for every conversion and every dollar of spend.

**L8. Buildless on purpose.** The website talks to Supabase over raw `fetch` "keeping the project buildless" (`c581263`); Google auth was written as an RS256 JWT with `node:crypto` instead of the googleapis package (session 3247d1bf). The agent uses `supabase-js` and Bolt but writes its own PDF generator (`agent/src/pdf.js`). **Recommend:** for AI-maintained code, fewer dependencies means fewer things the model can get wrong or that can break under it.

**L9. E-sign without a vendor.** The close desk (`cf80cb6`, `5ea6e87`) records typed name, IP, user agent, time and a SHA-256 of the exact text, then sends the client to pay. **Recommend:** fine for a small studio; get legal review, and know you have no third-party audit certificate.

### 2.3 Abandoned architecture and reversals

**L10. Mux to Vimeo in 12 hours 37 minutes.**
- **Thought:** muted autoplay (Mux) gets more people watching (`fecd5fd`, Oct 2 23:19).
- **Happened:** autoplay needed a "tap for sound" restart, silent plays inflated milestones (a `VSLUnmute` event was added to compensate), the player loaded late, and lip-sync looked off. Claude first blamed the file (variable frame rate); the real cause was six muted portfolio previews playing off screen at the same time (session efe13b2d).
- **Changed:** Vimeo, click to play with sound, player built inside the click (`cc7f75a`, Oct 3 11:56). Previews pause when off screen or while the VSL plays (`cd478e1`).
- **Recommend:** for a sales video, click-to-play with sound gives clean data. Check what else is playing on the page before blaming the media.

**L11. Pricing public, then private.** Priced packages from Jul 8 (`c42f3cb`); homepage prices swapped for a capacity statement (`78c0b09`); `/grow` prices published (`801f589`); payroll comparison beside every price (`fb69773`, Sep 26), moved out of the cards the same day (`020b043`); then "No price, add-on rate, rush fee, capacity signal or payroll comparison on any page" (`1bba59a`, Oct 2). `check-offer.py` and `check-claims.py` fail if any returns. **Recommend:** decide early whether price is a filter or a sales-call topic; enforce the decision with a check, not memory.

**L12. Annual plans: added, retired, returned within four days.** Added to the agent catalog Sep 30 (`a149bae`), retired Oct 2 (`47f8757` agent, `5a4747b` website), returned Oct 3 at 23:13 (`b7a4f01`, migration `032`). The 00 file says Oct 4; git says late Oct 3 Pacific.

**L13. Guarantees: the hardest copy to remove.** The `/grow` performance guarantee went first (`bee7fa0`, Sep 12). The free-shoot-day guarantee survived in six places across four files after its withdrawal and was removed in `8ced95c`; that led directly to the claims checker (`9c8e49f`). A bounded "90-Day Promise" followed (`a77b675`, `80aa4c5`), its remedy was changed (`020b043`), then it came off the site (`1bba59a`) and out of the MSA (`cb6d622`, migration `025`). **Recommend:** keep every promise in one source file and grep-check every page and contract against it.

**L14. Lead Foundation: an offer outside the business.** Added Sep 4 (`f42e3ac`, Sep 5 UTC), narrowed Sep 10 (`2ff68d8`): CRM setup and speed-to-lead for clients "sits outside what the studio actually does." It lingered in `offer.js` after nothing sold it (session 95892108). Relevant to the GoHighLevel plan: CRM work came back later as an outsourced build.

**L15. Page sprawl.** `/production-media` built (`2eb842f`, Sep 13), rebuilt (`30880fe`), retired (`9b232f2`, Sep 21, 307 on purpose). `/growth-guide` built, published, retired (`566722e`). Both restorable by SHA. **Recommend:** a new page is a new thing to keep consistent; prefer one page per offer.

**L16. Cadence change rippled everywhere.** "Under 14 days, sell the 7-day version" (`e6e45e7`, Sep 2) became a three-week cadence (`386f082`, Sep 29) because the client guide booked the first shoot at least 7 days after kickoff; Front of the Line went from 21 to 14 days. Stale "under 14 days" copy survived on `/about` and `llms.txt` until fixed by hand (session 95892108). Oct 4: the Founding month was re-described as a set-up month with ads live in week three (`9be44d2`).

**L17. Notion as the agent hub; agents on Vercel Workflow.** Both abandoned within days in favour of a Railway Slack app with a Postgres `ops` schema (00 file). The Handbook still names Notion for records and SOPs. **Recommend:** put approvals where the team already works (Slack), and state in Postgres.

**L18. Duplicate source file.** `ntc-landing.html` had to be copied into `index.html` by hand (`c305011`) and Vercel served a stale page until it was; removed Sep 2 (`24fd63e`).

### 2.4 Integration trouble

**L19. Email on Sep 10: one day, five problems.**
- **Thought:** "Email me the application."
- **Happened:** Resend first (`9bd2f6a`), then SendGrid (`311eda1`). A catch block protected the applicant but swallowed a SendGrid 403 from missing domain authentication: "Applications were not arriving and the SendGrid error was being swallowed" (`da5891c`). Found with a header-gated diagnostic, removed 17 minutes later once domain auth was live (`bc53852`). Twilio's verification file had been placed in the gitignored `.vercel/` folder, so it would never deploy (`73ed87f`). Env changes needed redeploys (`ba3360f`, `aac920e`).
- **Changed:** dual capture: `/api/apply` returns 503 only if both the database and email fail.
- **Recommend:** never let a catch block hide a delivery failure; log it loudly and capture to a second place. Authenticate the sending domain before the first send.

**L20. Supabase env prefixes.** The Vercel marketplace integration namespaced the variables (`sbdata_...`), so lookups failed (`c2b6440`). The same issue later made a step token sign with a variable *name* instead of its value, with an `'unset'` fallback (`80aa4c5`, now fails closed). `_supabase.js` matches by suffix.

**L21. Google Calendar refused service-account guest invites.** The first live shoot booking hit a 403 (`31f861c`, Oct 1). Events are now saved without guests; optional domain-wide delegation added.

**L22. Slack bot not in the channel.** `chat.postMessage` to a channel the bot was never invited to was silently dropped (`d3f757a`, `e137737`). `/healthz` reports membership.

**L23. Stripe live vs sandbox.** Two webhook secrets (`ff802aa`); $0 trial checkouts needed a special path (`285cadf`). A "$0 first month trial" would auto-charge month two, contradicting "nothing rolls over" on `/founding` (flagged in session 95892108; left for Jadon to check in Stripe).

**L24. iClosed automation quirks** (session 7d615863): saved single-select choices can't be renamed (add new, hide old); drag-to-reorder only works by keyboard; event cards ignore the first click; public pages are an app shell, so verify in the editor.

**L25. iClosed embed layout.** Cramped two-pane layout (`b97b19f`), launcher over the intro film (`653eed1`), confirmation card clipped (`566722e`, then `d89ebbf` "fix the reveal I broke"), late "no such booking" hide (`d0f9dbb`). Three commits in one evening for "show the confirmation card".

### 2.5 Tracking

**L26. The pixel was missing on three pages for weeks.** Homepage, `/grow` and `/booked` had no pixel from launch until `e6b92e3` (Sep 21): "/grow was the costly one... firing since the page was built, into nothing." Preflight now checks every landing page carries the single pixel id. **Recommend:** check tracking presence automatically on every page, every deploy.

**L27. `META_TEST_EVENT_CODE` in production for about 11 minutes** (`33b7340` 16:49, redeploy `7841bf5` 16:54, removed `3ab7319` 17:00). Test events are excluded from optimization. Now preview-only.

**L28. Wrong event names.** `Schedule` was being fired from a form; corrected to `Lead` / `SubmitApplication` (`80aa4c5`, `bb2df7a`). CTA clicks are `trackCustom`, never a standard event, so funnels stay readable.

**L29. Our Lead could not dedupe against iClosed's.** NTC stopped firing its own `Lead` on `/strategy-call` because "our event_id cannot deduplicate against an id iClosed mints itself" (`4eaa70d`).

**L30. Server-side events sent the vendor's IP.** The webhook's Schedule carried iClosed's server IP as the booker's; now omitted (`8402574`, Oct 3).

**L31. Muted autoplay inflates video milestones** (`fecd5fd`), and first-party `VSLPlay` storage came later (`e1f3712`).

**L32. Signature was invisible in the funnel.** `track.js funnelName()` had no `/signature` case and `iclosed-webhook.js offerFrom()` defaulted unknown event names to `paid_retainer`. Found while writing this sourcebook, fixed Oct 4 in PR #2 (`dc2c996`, merged as `84db545`), with regression checks in `scripts/test-iclosed-webhook.mjs` and `scripts/test-tracking.mjs`. Not retroactive: rows stored before the fix keep their old funnel. The webhook now also reads the event slug, which is fixed in code while the display name can be renamed.

### 2.6 Attribution

**L33. Sprint visitors counted as retainer leads.** Sprint CTAs went through `book.html` to `/strategy-call`, so Sprint conversions reported as retainer (found in `2eb842f`). Fixed with an `?offer=` allowlist shared between browser and server (`_offer.js` mirrors `offer.js`, `check-offer.py` asserts they match).

**L34. Interstitials drop query strings.** The `/book` page lost UTMs; replaced by Vercel redirects that keep them (`71464ff`). Deleting `book.html` outright would have sent old links to the homepage because of the catch-all rewrite (session 8373d4f4).

**L35. Raw calendar links leak conversions.** Two homepage CTAs pointed at a raw Google Calendar with no capture (`def133c`). Preflight blocks raw calendar links outside one page.

### 2.7 CRM

**L36. "A lead acquisition and booking system, not a CRM."** Jadon's guardrail in session 3247d1bf (Sep 20): no workflow builders, inboxes or deal UI. `public.leads.sales_stage` exists but is updated by hand. The CRM is now being built by an outside GoHighLevel builder (`IN DEVELOPMENT`). **Recommend:** don't build a CRM by accident inside your tracking database; decide where pipeline state lives.

**L37. Duplicate clients.** A checkout and its first invoice arriving together created two clients (`f4f52c4`). Fixed by serializing new-client decisions with a 24h email guard (`f74f2d9`) and a unique `stripe_purchase_id` upsert (`7c056fd`).

### 2.8 Webhooks

**L38. iClosed webhook: the payload was not what anyone guessed.** No signing secret, so a URL key (`eb85bb1`). The trigger field is `hookType`, not `event`; the first log read "noted [object object] (no id)" (`c3f54d9`). Keyed on `callPreviewId`, not `uuid`, because `uuid` double counted (`4079d70`). The webhook now logs payload *shape* (keys only). **Recommend:** log the shape of the first real delivery before writing the parser.

**L39. Store first, then process.** The agent stores every Stripe and Timeliner event in `ops.inbound_events` (unique on source and id), acknowledges, processes asynchronously, and replays stuck events at boot (`f4f52c4`). Timeliner webhooks self-register and rotate their secret (`5a205ee`).

### 2.9 Analytics

**L40. Supabase SQL editor gotchas.** Its LIMIT wrapper broke a `UNION` ending in `order by` (`0259b3e`). In session 7d615863 (Oct 3) Claude's read-only SELECT was typed into an unsaved tab holding migration 024; Supabase's "UPDATE without WHERE" warning stopped it, the buffer was restored and verified by hash, and the rule since is that Jadon pastes SQL into a fresh tab himself.

**L41. Coverage-aware dashboards.** The owner dashboard shows "unavailable" instead of 0 for periods before an event was first recorded and for missing spend (`e8971f6`). Spend sync flags itself stale after 36 hours.

**L42. Shared preview and production database.** Test rows land in production tables; test plans use plus-addressed emails and a "ZZ TEST" prefix and are cleaned up by hand (session 3247d1bf). `vercel env pull` returns encrypted values empty, so cleanup can't be automated (`5e19dd2`).

### 2.10 Security

**L43. A `SECURITY DEFINER` view bypassed RLS** (`c581263`, fixed `42a86eb`): flagged by Supabase's linter, fixed with `security_invoker` and revokes.

**L44. A public endpoint accepted forged conversions.** `/api/track` allowlisted `schedule`, so anyone could POST a fake booking. Proven by POSTing one against preview; `schedule` is now reserved server-side with a 403 and ten regression checks (`276cb92`).

**L45. A migration dropped a constraint by its assumed auto-generated name** (`065dbe8`); Supabase flagged it as destructive before harm. It now drops by definition (`537e13b`).

**L46. A reference screen recording almost deployed with the site** (`2ff68d8`). `.vercelignore` excludes `docs/`, `scripts/`, `supabase/`; preflight checks it.

**L47. Claude declined to disable Vercel Deployment Protection** to test previews; Jadon chose to keep protection on and test by hand while logged in (session 3247d1bf).

### 2.11 Auth

**L48. Shared-password owner dashboard** (`e8971f6`): timing-safe compare, HMAC-signed HttpOnly cookie scoped to the API path, password rotation signs everyone out, per-instance rate limit. Adequate for one owner; not for a team.

**L49. Approver allowlists in Slack** (`APPROVER_SLACK_IDS`, `CONTRACT_SLACK_IDS`). Gap: payment-mismatch buttons accept any approver.

### 2.12 Onboarding

**L50. One welcome email, then package-specific sections.** Migration `007` cut onboarding to one welcome email for every offer; `016` fixed pilot and annual offers to match; `027`, `033`, `035` then added per-plan sections (`{{#flag}}`) so Sprint clients don't get retainer promises.

**L51. Numbered lists drift.** Making a line optional broke a numbered template (`d9f8ef6`, fixed `a08eaa1`).

**L52. Slack Connect drop-off is the biggest onboarding risk** (00 file); the 48h nudge exists because of it (`2d49a92`).

### 2.13 Deployment

**L53. Catch-all rewrite sent `/sprint` to the homepage**; fixed with `cleanUrls` (`488d5d5`, Sep 2). The rewrite also had to exclude `/api` (`9bd2f6a`). There is still no real 404.

**L54. No CI.** 227 website checks and 144 agent tests exist and pass, but nothing runs them automatically and Vercel's build command is null. A production push to the Speed-to-Lead `main` was blocked by Claude Code's own permission check (session 7d615863), which is the closest thing to a gate.

**L55. Parallel sessions and machines.** A laptop session edited the phone number and never pushed (session e98aaa81); ten commits from another session landed mid-work (session 95892108); local branches of `ntc-speed-to-lead` were 16 commits behind GitHub on Oct 4. **Recommend:** pull before every session, push at the end of every session.

**L56. Unmerged long-lived branch.** `agent-v1` deploys to Railway from its own branch and has never merged to `main`; its copy of `api/slack.js` lacks main's kickoff filter (`3225303`).

### 2.14 Seemed simple, got complicated

- **"Put a booking calendar on the site"**: L1, L6, L25, L29, L38. Jul 21 to Oct 3.
- **"Email me the application"**: L19. One day, five problems.
- **"Add a privacy link to every footer"**: `de5860d` claimed "Linked from all five footers"; a scripted edit had aborted on a differently indented footer, so the links never went in (`4704b12`).
- **"Add the pixel"**: copied per page, missed on three (L26).
- **"Withdraw a guarantee"**: six places, four files (L13).
- **"Put the sales video on the page"**: L10.
- **"Change the delivery cadence"**: L16.

---

## 3. Section C verification (00 file)

| # | Item | Verdict | Problem SHA | Fix SHA | Notes |
|---|---|---|---|---|---|
| 1 | Lead Foundation added then narrowed | VERIFIED | `f42e3ac` | `2ff68d8` | Added Sep 4 Pacific (Sep 5 UTC) |
| 2 | Custom funnel deleted for iClosed; `/apply` parked (24 + 9 questions) | VERIFIED | `5f362d3`, `9bd2f6a`/`065dbe8` | `4eaa70d`, `9519166` | Endpoint kept as a 410, `/apply` unlinked, not deleted |
| 3 | Payroll comparison then all pricing removed | VERIFIED | `fb69773` (`020b043` same day) | `1bba59a` | |
| 4 | Annual plans retired Oct 2, returned Oct 4 | VERIFIED, date corrected | `a149bae` | retired `47f8757`/`5a4747b`; returned `b7a4f01` | Returned Oct 3 23:13 Pacific (migration `032`) |
| 5 | Mux to Vimeo in under 13 hours | VERIFIED | `fecd5fd` | `cc7f75a` | 12h37m |
| 6 | Swallowed SendGrid 403 | VERIFIED | `311eda1` | `da5891c`, `bc53852` | |
| 7 | Twilio file in gitignored `.vercel/` | VERIFIED | never committed | `73ed87f` | |
| 8 | Privacy links aborted on indented footer | VERIFIED | `de5860d` | `4704b12` | |
| 9 | `META_TEST_EVENT_CODE` in production about 10 min | VERIFIED | `33b7340`/`7841bf5` | `3ab7319` | about 11 min from code to removal |
| 10 | Supabase env prefixes | VERIFIED | `c581263` | `c2b6440` | also caused `80aa4c5` |
| 11 | `SECURITY DEFINER` view bypassed RLS | VERIFIED | `c581263` | `42a86eb` | |
| 12 | Constraint dropped by assumed name | VERIFIED | `065dbe8` | `537e13b` | caught before harm |
| 13 | Forged `schedule` accepted | VERIFIED | `c581263` | `276cb92` | |
| 14 | SQL editor LIMIT wrapper broke UNION | VERIFIED | `def133c` (verify-0004) | `0259b3e` | |
| 15 | Sprint counted as retainer via `book.html` | VERIFIED | `def133c` | `2eb842f`, later `71464ff` | |
| 16 | Withdrawn guarantee still live | VERIFIED | `5fd2776`/`200b2d4` | `8ced95c` | six places, four files; led to `9c8e49f` |
| 17 | iClosed CAPI rejected a valid token | VERIFIED | `4eaa70d` | `f2a9f1c`, `eb85bb1` | |
| 18 | Webhook parsing (`hookType`, "[object object]", `callPreviewId`) | VERIFIED | `eb85bb1` | `c3f54d9`, `4079d70` | |
| 19 | Mobile player bugs | VERIFIED, two separate fixes | `324d253`/`6ebf2bb` (reel); `8575ff4`/`9ac014e` (confirmation iframe) | `d88ea33`; `566722e`, `d89ebbf` | The iframe height bug was the `/call-booked` confirmation card, not the reel player |
| 20 | Two clients from checkout + first invoice | VERIFIED | `f4f52c4` | `f74f2d9`, `7c056fd` | |
| 21 | Uninvited bot, posts dropped | VERIFIED | `f4f52c4` | `d3f757a`, `e137737` | |
| 22 | Calendar guest invites refused (403) | VERIFIED | `716649a`, `15a1311` | `31f861c` | |
| 23 | Numbered list drift | VERIFIED | `d9f8ef6` | `a08eaa1` | |

### Section B corrections (git wins)

- Website commits Sep 4 to Oct 4: about 161 to 165 in git, not 141 (the 00 file likely counted deployed commits). Sep 21 had 33 commits, not 19.
- Agent repo: 76 unique commits, not 66; it does have Oct 3 and 4 commits (S5 above).
- Phase A was Sep 2 to 4, not Sep 4 to 5.
- Phase B: Resend came first, then SendGrid, not the reverse. No Sep 11 commits.
- Phase C: Sep 12 to 13 only.
- Phase D: `/production-media` was built Sep 13, rebuilt Sep 15; the lead-booking branch (Sep 19) never merged.
- S3: Timeliner and the Slack nudge landed Sep 30.
- S4: offer migrations, Handbook sync and MSA change are Oct 2; Front of the Line, annual plans returning, Sprint credit and package-specific language are Oct 3 to 4 (S5).
