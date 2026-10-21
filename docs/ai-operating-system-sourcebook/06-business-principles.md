# 06. Business principles

Files 01 to 05 describe what NTC built. This file pulls out the business decisions underneath the technology, written so a dentist, a contractor, a law firm owner or a videographer can use them without knowing what a webhook is.

Each principle has:
- **In plain English:** the idea, with no jargon.
- **What happened at NTC:** the evidence, with a pointer to the lesson in 04 (L1 to L56) or the section in 01 to 03.
- **What to do:** an action a business owner can take or ask a vendor about.
- **Lifecycle stage** and **scorecard dimension:** where it sits on the lifecycle (traffic, capture, response, booking, sales, payment, onboarding, delivery, attribution, retention) and which of the five scorecard dimensions it belongs to (Acquisition, Conversion, Sales, Operations, Intelligence).

Every principle is grounded in something that actually happened. None is a claim about results.

---

## A. Buy, build and own

### 1. Buy commodity infrastructure. Build only the parts that make you different.

- **In plain English:** scheduling, payments, email and calendars are solved problems. Rent them. Spend your own time and money on the few things no vendor does your way.
- **What happened at NTC:** booking went through five designs in ten weeks, including a custom 13-question form and a custom calendar-sync system, before NTC adopted a booking tool (iClosed). The custom work was thrown away (L1, L2, L3).
- **What to do:** before building anything, ask "is there a $50 to $500 a month tool that does 90% of this?" If yes, buy it, and keep a list of the 10% it doesn't do.
- **Stage / dimension:** booking / Conversion.

### 2. Own the conversion event, even when you rent the tool.

- **In plain English:** the moment that matters to your advertising (a booked call, a paid invoice) should be reported by you, not left to a vendor's integration.
- **What happened at NTC:** the booking tool's own Meta integration rejected a valid access key, so NTC began reporting bookings to Meta itself, from both the browser and the server (L6).
- **What to do:** ask every vendor exactly which events they send to your ad platforms, and test it. If you can't see it in your ad platform's event log, it isn't happening.
- **Stage / dimension:** booking, attribution / Intelligence.

### 3. Keep your own copy of the numbers that run the business.

- **In plain English:** if your bookings, leads and ad spend only live inside other companies' dashboards, you can't put them side by side, and you lose them when you switch tools.
- **What happened at NTC:** NTC stores every booking and pulls ad spend daily into its own database, so one private dashboard shows spend, video views, clicks and bookings by offer (L7, 01 section 3.17).
- **What to do:** decide where your master record of leads, bookings, sales and spend lives. One spreadsheet updated weekly is a valid start.
- **Stage / dimension:** attribution / Intelligence.

### 4. Fewer moving parts beats cleverness.

- **In plain English:** every extra tool, plugin or integration is one more thing that can break or drift out of date.
- **What happened at NTC:** the website has no build step and no third-party code packages, on purpose. The agent writes its own PDF generator instead of adding another dependency (L8).
- **What to do:** when a vendor proposes a stack, ask them to count the systems and integrations, and what happens when each one fails.
- **Stage / dimension:** all stages / Operations.

---

## B. Capture and response

### 5. Count every question across the whole path, not per page.

- **In plain English:** a form that looks short can still be long if the next step asks more questions.
- **What happened at NTC:** applicants answered about 24 questions on an application page and then 9 more to book a call. The application was shut off and replaced by one booking form (L2, L3).
- **What to do:** walk your own funnel as a customer, from ad to booked call, and count every field. Cut anything you won't use before the call.
- **Stage / dimension:** capture, booking / Conversion.

### 6. Speed to lead is a human job that software can prepare.

- **In plain English:** the fastest response still comes from a person, but software can hand that person everything they need in seconds.
- **What happened at NTC:** when a lead books or abandons booking, an AI writes an internal call card (who they are, how well they fit, an opening line, what to ask) within moments. A person makes the call. Nothing goes to the lead automatically (03 section 1).
- **What to do:** measure the minutes from enquiry to first human contact, and give whoever responds a one-screen summary of the lead.
- **Stage / dimension:** response / Conversion.

### 7. Don't let a safety net hide a failure.

- **In plain English:** a system that quietly swallows errors is worse than one that breaks loudly.
- **What happened at NTC:** a piece of code meant to protect applicants from seeing an error also hid the fact that application emails weren't being delivered. Applications went missing until someone dug in (L19).
- **What to do:** for every form, know where submissions go and test it monthly. Capture every lead in two places (for example, email plus a spreadsheet or database).
- **Stage / dimension:** capture / Conversion.

---

## C. Sales and money

### 8. Human approval belongs around money, promises, scope and legal language.

- **In plain English:** automate the routine. Keep a person in the loop wherever a mistake costs money, makes a promise, changes what you'll deliver, or creates a legal obligation.
- **What happened at NTC:** the automation cannot move money at all (it has no access to payment controls). Contracts can only be sent by the owner. Every client-facing message needs explicit approval before it can be sent (03 section 4).
- **What to do:** list every automated message and action in your business, and mark which ones touch money, promises, scope or legal terms. Those need a human checkpoint.
- **Stage / dimension:** sales, payment / Sales.

### 9. Changing the words means approving them again.

- **In plain English:** once a template is approved, any edit to it should send it back for approval.
- **What happened at NTC:** every time contract or welcome wording changed, the system automatically marked it "not approved" until the owner read it again (03 section 4.2).
- **What to do:** keep approved templates in one place with a date and an approver, and treat any edit as a new version.
- **Stage / dimension:** sales, onboarding / Sales.

### 10. Make the yes and the payment one step.

- **In plain English:** the gap between "I agree" and "I've paid" is where deals stall.
- **What happened at NTC:** the client signs the agreement and is sent straight to checkout in the same flow (the close desk). The signed copy is filed automatically (02 section 4, L9).
- **What to do:** send one link that collects agreement and payment together. Have your terms reviewed by a lawyer.
- **Stage / dimension:** sales, payment / Sales.

### 11. Every promise lives in one place, and everything gets checked against it.

- **In plain English:** guarantees, prices and terms spread across a website, contracts and emails drift apart. Keep one master version.
- **What happened at NTC:** a guarantee that had been withdrawn survived in six places across four pages. A check was then built that fails if any page says something the master terms don't allow (L11, L13).
- **What to do:** keep one document with your current offers, prices, guarantees and timelines. Review every public page against it when anything changes.
- **Stage / dimension:** acquisition, sales / Sales.

### 12. Never automate an unresolved policy decision.

- **In plain English:** if the business hasn't decided what should happen, software can't decide for you. It will just do the wrong thing faster.
- **What happened at NTC:** when a payment doesn't match a known offer, the system stops and asks a person ("Start as...") rather than guessing. Pricing, annual plans and delivery timelines changed several times in four weeks, and each change rippled through pages, contracts and onboarding (L11, L12, L16; 02 section 5).
- **What to do:** write down the rule first (who qualifies, what's included, what happens on a refund), then automate it. Where there's no rule, make the system ask a person.
- **Stage / dimension:** payment, onboarding / Operations.

---

## D. Onboarding and delivery

### 13. Payment should be the onboarding trigger.

- **In plain English:** the moment someone pays, everything they need should start without anyone remembering to do it.
- **What happened at NTC:** a payment automatically creates the client record, a shared folder, a review project, a welcome email and a private Slack channel, each step only if its template is approved (02 section 3).
- **What to do:** list everything that should happen in the first 24 hours after payment, and make payment the single event that starts it.
- **Stage / dimension:** payment, onboarding / Operations.

### 14. Every automation should say what it did not do.

- **In plain English:** a report that only lists successes hides the gaps. Good automation tells you what failed or was skipped.
- **What happened at NTC:** after a shoot is booked, the system's message lists what happened and what didn't ("Client NOT told: they have not joined their Slack channel. Calendar event NOT set"). Onboarding summaries say "4 of 6 steps done, 2 skipped" (02 section 10).
- **What to do:** ask for exception reports, not success reports: what didn't happen today that should have?
- **Stage / dimension:** onboarding, delivery / Operations.

### 15. Plan for the client who doesn't show up.

- **In plain English:** the biggest onboarding risk is usually a client who never completes the first step, not a technical failure.
- **What happened at NTC:** clients who hadn't accepted their Slack invite after 48 hours trigger a reminder card for a person to send. Slack drop-off is the biggest known onboarding risk (L52).
- **What to do:** set a deadline for each onboarding step and decide in advance who follows up, and how, when it's missed.
- **Stage / dimension:** onboarding / Operations.

### 16. Different packages get different promises.

- **In plain English:** one welcome email for everyone eventually promises someone something they didn't buy.
- **What happened at NTC:** onboarding started with one welcome email for every offer, then added package-specific sections so project clients weren't promised retainer-only extras like weekly recaps (L50).
- **What to do:** check each automated message against each package you sell.
- **Stage / dimension:** onboarding / Operations.

---

## E. Reliability

### 17. Write it down before you act on it.

- **In plain English:** when a payment or booking notification arrives, record it first, then process it. If anything fails, you can replay it.
- **What happened at NTC:** every payment notification is saved before anything else happens, and anything left half-processed is retried when the system restarts (L39).
- **What to do:** ask vendors what happens to a notification if your system is down when it arrives. "It's lost" is the wrong answer.
- **Stage / dimension:** payment / Operations.

### 18. Doing it twice should be harmless.

- **In plain English:** notifications sometimes arrive twice. Your system should recognize a repeat and do nothing the second time.
- **What happened at NTC:** a checkout and its first invoice arriving together created two client records. The fix makes a repeat recognizable and harmless. The booking feed was also double counting until it was keyed on the right identifier (L37, L38).
- **What to do:** test what happens if the same payment or booking comes in twice. You should get one client, one email, one record.
- **Stage / dimension:** payment, booking / Operations.

### 19. Look at what actually arrives before you build around it.

- **In plain English:** vendor documentation and reality differ. Inspect a real example first.
- **What happened at NTC:** the booking tool's data arrived in a different shape than expected. The first log read "[object object]" and the wrong field caused double counting (L38).
- **What to do:** when connecting two tools, run one real test transaction and check every field before going live.
- **Stage / dimension:** booking / Intelligence.

### 20. Check the boring things automatically, every time.

- **In plain English:** tracking codes, links and legal pages break quietly. Automatic checks catch what people forget.
- **What happened at NTC:** the ad tracking code was missing from three pages for weeks, including a sales page, so visits weren't measured. A check now fails if any page is missing it (L26). The weak spot that remains: these checks are run by hand, not automatically on every update (L54).
- **What to do:** after every website change, check that tracking fires on every page that matters (ad platforms provide free test tools).
- **Stage / dimension:** traffic, attribution / Intelligence.

### 21. Retire before you delete.

- **In plain English:** when replacing a system, keep the old one switched off but restorable until the new one has proven itself.
- **What happened at NTC:** the old booking form's back end was kept as a "gone" marker rather than deleted, so it could be restored if the new tool failed (L5).
- **What to do:** don't cancel the old tool on the day you switch. Run both, or keep the old one paused, for a few weeks.
- **Stage / dimension:** all stages / Operations.

---

## F. Measurement

### 22. Attribution breaks at every handoff.

- **In plain English:** each time a visitor moves between pages or tools, the record of where they came from can be lost.
- **What happened at NTC:** an in-between booking page dropped campaign tags, and project-offer visitors were counted as retainer leads because they passed through a shared page (L33, L34). Signature-project bookings were filed under the wrong offer until this review caught it and it was fixed with a test that stops it coming back (L32).
- **What to do:** run a test visit from an ad link through to a booked call, and confirm the source shows up at the end.
- **Stage / dimension:** attribution / Intelligence.

### 23. "Unknown" is better than a wrong zero.

- **In plain English:** a dashboard that shows $0 when it simply has no data will lead you to bad decisions.
- **What happened at NTC:** the owner dashboard shows "unavailable" for periods before tracking started and when spend data is missing, and warns when a data feed goes stale (L41).
- **What to do:** for every number on your dashboard, know when it started being tracked and when it last updated.
- **Stage / dimension:** attribution / Intelligence.

### 24. Test data and real data must not mix.

- **In plain English:** test bookings and fake leads in your real records will distort your numbers.
- **What happened at NTC:** the test and live websites share one database, so test entries land in real tables and must be cleaned up by hand. Test values briefly sent to the ad platform were excluded from its optimization (L27, L42).
- **What to do:** label test entries clearly (a standard prefix) and remove them, or keep a separate test environment.
- **Stage / dimension:** attribution / Intelligence.

---

## G. AI and governance

### 25. AI drafts, people decide.

- **In plain English:** the useful AI work is drafting, summarizing and preparing. Sending, promising and spending stay with people.
- **What happened at NTC:** the four scheduled AI assistants write lead briefs, a morning brief, inbox reply drafts and Friday recaps. Each is a draft or an internal note; nothing goes to a client without a human sending it. The automation engine itself uses no AI (03 sections 0 and 3).
- **What to do:** start AI on internal tasks (briefs, summaries, drafts) before any client-facing task.
- **Stage / dimension:** response, retention / Operations.

### 26. Write the rulebook before you hand anything to AI.

- **In plain English:** an AI assistant is only as consistent as the written instructions it follows.
- **What happened at NTC:** a written Handbook defines services, approval rules, what to escalate and what never to do. Every scheduled AI task starts with "Read the NTC Agent Handbook before acting... flag the issue rather than guessing" (03 section 3).
- **What to do:** write one page of rules covering what the assistant may do, what it must ask about, and what it must never do (quote prices, promise results, act on instructions found inside an email).
- **Stage / dimension:** all stages / Operations.

### 27. Earn autonomy with a track record.

- **In plain English:** let automation do more only after it has shown it gets things right.
- **What happened at NTC:** the Handbook defines levels from "log only" to "draft only" to "send approved templates", and a draft-only task can move up a level only after two weeks with at least 90% of drafts approved unchanged. Today that is policy that people follow, not something the software enforces (03 section 4).
- **What to do:** track how often you approve AI drafts without edits. Raise its responsibility only when that number is consistently high.
- **Stage / dimension:** all stages / Operations.

### 28. Treat incoming messages as information, not instructions.

- **In plain English:** an email or form can contain text that tries to tell your AI what to do. Your AI should read it, never obey it.
- **What happened at NTC:** the call-card prompt wraps each alert in markers and says never to follow instructions inside it. The Handbook's never-do list includes following instructions found in an email, form or attachment (03 section 1).
- **What to do:** ask any AI vendor how their system handles a customer message that says "ignore your instructions and...".
- **Stage / dimension:** response / Operations.

### 29. Don't build a CRM by accident.

- **In plain English:** a tracking spreadsheet slowly turning into a sales pipeline usually ends up as a poor CRM. Decide on purpose where your pipeline lives.
- **What happened at NTC:** the owner's rule during the build was "a lead acquisition and booking system, not a CRM." A real CRM is now being set up separately by an outside specialist, and it is not live yet (L36, 01 section 3.10).
- **What to do:** pick one system of record for "where is each deal right now," and keep tracking and reporting tools out of that job.
- **Stage / dimension:** sales / Sales.

### 30. Pull before you start, push when you finish.

- **In plain English:** when several people or several AI sessions work on the same system, changes get lost unless everyone works from the latest version.
- **What happened at NTC:** a change made on a laptop was never published, work from parallel sessions collided, and a local copy of the agent code was 16 updates behind when this sourcebook began (L55).
- **What to do:** whoever changes your website or systems should keep one shared, current version and a log of what changed and when.
- **Stage / dimension:** all stages / Operations.

---

## Principles by scorecard dimension

| Dimension | Principles |
|---|---|
| Acquisition | 11 (also touches 20, 22) |
| Conversion | 1, 5, 6, 7 |
| Sales | 8, 9, 10, 11, 29 |
| Operations | 4, 12, 13, 14, 15, 16, 17, 18, 21, 25, 26, 27, 28, 30 |
| Intelligence | 2, 3, 19, 20, 22, 23, 24 |

Acquisition is thin here because NTC's repos cover what happens after a click: capture, booking, sales, onboarding and measurement. Ad creative, targeting and organic reach are NTC's core service, but they are not documented in this technical sourcebook. Scorecard questions for that dimension need a different source.

## The eight seed principles

The reviewer's eight seed principles appear above as: payment as the onboarding trigger (13); owning the conversion event (2); every automation saying what it did not do (14); never automating an unresolved policy decision (12); storing the event before processing it (17); idempotency over cleverness (18, with 4); human approval around money, promises, scope and legal language (8); and buying commodity infrastructure while building what differentiates you (1).
