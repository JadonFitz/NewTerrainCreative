# iClosed event: Brand Builder Story Session

The booking form behind `/brand-builder` and `/brand-builder-pro`. Both
pages have one call to action, "Claim your Story Session", which opens
`/strategy-call?offer=brand-builder`. That page embeds whichever iClosed
event its `SCHEDULERS['brand-builder'].url` names. Today that is the
Growth event. This document is the event to create in iClosed so the
Story Session has its own questions, its own calendar and its own line in
the reporting.

iClosed has no API for creating events, so this is built by hand in
app.iclosed.io. Everything on the site side is already wired: the
webhook files any event whose name or slug contains "brand" or "story
session" as `brand_builder`, `/call-booked?offer=brand-builder` shows the
right pre-call note, and `/owner` has a Brand Builder tab.

## Event settings

| Setting | Value |
|---|---|
| Name | `Brand Builder · Story Session` (keep "Brand" or "Story Session" in the name; the webhook matches on it) |
| URL slug | `brand-builder-story-session` → `https://app.iclosed.io/e/NewTerrain/brand-builder-story-session` |
| Duration | 30 minutes |
| Hosts | Jadon and Meghan. The page promises "30 minutes with Jadon and Meghan", so both calendars, or a round robin is not right here. |
| Buffer | Same as the Growth event |
| Availability | Same windows as the Growth event |
| Description on the booking page | Thirty minutes with Jadon and Meghan. You leave with a straight read on where your personal brand stands, three story angles, what we would make, and whether the Pilot or the series fits. Nothing is due to book. If it is not a fit, we say so on the call. |
| After booking | Redirect to `https://www.newterraincreative.com/call-booked?offer=brand-builder` |
| Reminders | Same as the Growth event: email and text, the day before and an hour before |
| Webhook | Confirm the account's Call Booked subscription includes this event. It posts to `/api/iclosed-webhook?key=…`, same as the others. |

## Questions

iClosed's built-ins first: first name, last name, email, phone. Phone is
required so the text reminder works.

Then, in this order. Every one maps to a line on the page: the three
"This fits" filters, and the four things the call leaves them with.

| # | Question | Type | Options | Required | Why it is asked |
|---|---|---|---|---|---|
| 1 | Your company, and what it does | Short text | | Yes | One line. We look the business up before the call. |
| 2 | Your role | Single choice | Founder or owner · Partner · Executive · Other | Yes | "Whose name is the business" |
| 3 | Where is the business based? | Single choice | Los Angeles · Elsewhere in California · Outside California | Yes | The page is for Los Angeles founders. Nobody is disqualified by the form; the call says so. |
| 4 | Your website or Instagram | Short text | | Yes | So the "straight read on where your brand stands" is prepared, not improvised |
| 5 | Is the business already selling? | Single choice | Yes, with customers · Pre-launch | Yes | "Already selling, with a record worth showing" |
| 6 | Are you willing to be on camera? | Single choice | Yes · Nervous, but willing · No | Yes | "Willing to be on camera" |
| 7 | What should the brand do for the business? | Long text | | Yes | Help text: "Sales, hiring, referrals, speaking, something else. A sentence is enough." This is where the professional variant's buyers answer in their own words. |
| 8 | What are you leaning toward? | Single choice | The Pilot, one time · The series, monthly · Not sure yet | No | "Pilot or series, and why" |
| 9 | How did you hear about us? | Short text | | No | Fills the gap when the UTMs are missing |

Nine questions plus contact details. Do not add a budget question: the
Pilot's price is on the page and the series is scoped on the call.

Do not ask for anything the page does not promise to use. Answers 7 and
9 are the two to read before every call.

## After it exists

1. In `strategy-call.html`, change `SCHEDULERS['brand-builder'].url` to
   the new event URL. Nothing else on that page changes.
2. Book a test slot from `/brand-builder` and confirm three things: the
   redirect lands on `/call-booked?offer=brand-builder` with the
   pre-call note showing, the booking appears on `/owner` under Brand
   Builder, and `vercel logs` shows the webhook filing it as
   `brand_builder`.
3. Cancel the test booking.

Until step 1 is done, the pages book the Growth event and the booking
files as `paid_retainer`. That is correct, and the tests in
`scripts/test-iclosed-webhook.mjs` cover both states.
