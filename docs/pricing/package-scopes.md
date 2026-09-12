# Production Media · package scopes

> ## PROPOSED · NOT APPROVED
>
> Prices are provisionally agreed at three levels. **These scopes are not.**
> `/growth-guide` renders an empty panel where the rate table goes and says
> so, and `api/_rates.js` carries `approved: false`. Nothing here is
> client-facing until it is signed off.
>
> Drafted 12 September 2026.

Every package excludes advertising spend. It is paid by the client,
directly to the platform, on the client's own account and payment method.
Never marked up, never held by us.

---

## The Anchor · $3,500 monthly

**Production only.** We make the creative. Running it is yours.

- **Production days** · one per month, up to 8 hours, one location
- **Deliverables** · 4 short-form edits plus 1 hero cut up to 60 seconds, graded and captioned
- **Revisions** · 1 round per deliverable
- **Strategy** · one kickoff session at onboarding, then quarterly
- **Campaign setup** · not included
- **Campaign management** · not included. Available as an add-on, see below
- **Landing page or funnel work** · not included
- **Reporting** · monthly delivery summary. Production, not performance: we are not running the campaign, so we have nothing honest to say about its numbers
- **Posting** · not included
- **Travel** · Los Angeles and Tampa metro included. Outside those, quoted
- **Talent** · not included
- **Exclusions** · paid placements, media purchases, locations, permits, props, specific commercial music licensing, third-party software. Library music is included
- **Minimum term** · 3 months
- **Add-ons** · campaign management +$1,500/mo · additional production day quoted
- **90-Day Production Promise** · **does not apply.** See the note below

## Growth Partner · $6,500 monthly

**Production plus campaign strategy and management.** Creative that changes
in response to what the campaign shows.

- **Production days** · one full day per month, plus one half-day iteration shoot
- **Deliverables** · 8 short-form edits, 1 hero cut, and 3 variant cuts per month recut from existing footage against what is performing
- **Revisions** · 2 rounds per deliverable
- **Strategy** · monthly working session, plus offer and messaging development as the campaign teaches us something
- **Campaign setup** · full build on Meta. Audiences, pixel and Conversions API, conversion configuration, event validation
- **Campaign management** · active. Fortnightly optimisation, budget pacing, creative rotation driven by performance
- **Landing page or funnel work** · one landing page built and iterated through the term, with form and tracking wired and verified
- **Reporting** · fortnightly performance read, monthly written report with recommendations
- **Posting** · not included. Organic is a separate engagement
- **Travel** · Los Angeles and Tampa metro included
- **Talent** · not included
- **Exclusions** · as Anchor
- **Minimum term** · 3 months
- **Add-ons** · additional production day · longform · second landing page
- **90-Day Production Promise** · **applies**

## Brand Builder · from $15,000 monthly

**Flagship. Custom by definition**, which is why it is a starting figure
rather than a price.

- **Production days** · 2 to 3 per month, multi-location where the work needs it
- **Deliverables** · one longform piece (brand film or documentary), 12+ short-form, and the full campaign suite
- **Revisions** · 2 rounds plus a director review pass on longform
- **Strategy** · a named strategist, fortnightly
- **Campaign setup and management** · across multiple platforms, not Meta alone
- **Landing page or funnel work** · multiple pages with structured testing
- **Reporting** · weekly dashboard, monthly executive review
- **Posting** · available, scoped per engagement
- **Travel** · continental US included up to a cap documented in the agreement
- **Talent** · budgeted per project and quoted
- **Exclusions** · as above, less what the engagement explicitly absorbs
- **Minimum term** · 3 months. Six recommended, since longform rarely lands inside one quarter
- **Add-ons** · scoped per engagement
- **90-Day Production Promise** · **applies**

---

## Why Growth Partner is worth $3,000 more than Anchor

The question is sharper than it looks, because Anchor plus the $1,500
management add-on is **$5,000**, only $1,500 under Growth Partner. If those
two bought the same thing, the tier would be a pricing artifact. They do
not, and the difference is deliberate.

**1 · The add-on manages a fixed batch. Growth Partner manages a system.**
At $5,000 we run campaigns using the creative that month's shoot produced.
When the data says a hook is not working, we can change targeting and
budget, and that is the end of what we can do: there is no iteration shoot
and no variant budget, so the creative stays as shot. Growth Partner buys
the half-day iteration shoot and three variant cuts a month, which means
the answer to "this is not working" is new creative rather than a
reshuffle of the same assets.

**2 · The funnel is included, and it is where campaigns actually die.**
Anchor and the add-on both stop at the ad. Growth Partner includes a
landing page built and iterated across the term, with tracking wired and
verified. In practice more campaigns fail between the click and the form
than fail at the ad, and at Anchor we can see that happening and are not
scoped to fix it.

**3 · Strategy is continuous rather than quarterly.** Anchor's kickoff plus
quarterly check-ins are enough to brief production. They are not enough to
develop an offer. Growth Partner's monthly working session is where the
offer itself changes, which is the highest-leverage variable and the one
nobody sells.

**4 · Accountability, and it is not free to give.** The 90-Day Production
Promise attaches at Growth Partner and above. That is a real liability we
are taking, and it is priced.

### Where the promise attaches · DECIDED

Growth Partner and Brand Builder only. Approved 12 September 2026 and now
stated in section 3A of the terms draft, in `assets/offer.js`, on `/grow`
and on `/growth-guide`.

The promise requires that we managed the campaign throughout the
measurement period (condition 4.6 in the terms draft):

- **Anchor** · we do not manage the campaign, so every claim would fail on
  4.6 automatically. Offering it there would be a promise made in a place
  it can never pay out, which is worse than not offering it.
- **Anchor plus the management add-on** · we do manage, but we cannot
  change the creative, so the main lever the remedy assumes is missing.
  **Does not apply**, and is stated plainly in the agreement rather than
  left to be discovered.
- **Growth Partner and Brand Builder** · applies.

This is explicit in the sales guide. A prospect comparing $5,000 against
$6,500 needs to know the promise is one of the things the extra $1,500
buys.

`/grow` states the same rule without naming packages, since that page
deliberately publishes no package structure: there it reads as "applies to
engagements where we manage the campaign, not to production-only work."
Same rule, no rate card leaked.

---

## The Founding Three continuation is not The Anchor

Both are $3,500 a month. They are different products and the shared figure
is a coincidence to guard against, not a link.

| | The Anchor | Founding continuation |
|---|---|---|
| What it is | A standard, open-ended package | A time-boxed continuation of a specific pilot |
| Campaign management | Not included | Included, carried over from the founding month |
| Who can buy it | Anyone | Only the three, only months two and three |
| What follows | Renews | Ends. A standard package is a new agreement |
| Production Promise | Does not apply | Does not apply, and cannot be stacked with the waived month |

The agreement must name the continuation as its own thing with its own
scope exhibit, and must not reference the Anchor package by name. Encoded
in `api/_rates.js` as `FOUNDING_CONTINUATION.isPackage: false`.

---

## Withheld from the sales guide

"Prepay 10 months, receive 12" stays internal until the core packages are
approved. Held in `api/_rates.js` behind `prepayPublishable: false`.

## Open for Jadon

1. Deliverable counts above are proposed, not derived from what a shoot
   day actually yields. Confirm 4 / 8 / 12+ is realistic before it becomes
   contractual, because it is the line most likely to be enforced.
2. Brand Builder's travel cap and Growth Partner's promise cap both need
   figures. Section 5.1 of the promise terms requires a documented maximum.
3. Whether Anchor should exist at all. It is the only package where we
   hand over creative and lose sight of whether it worked, which means it
   generates no evidence for the case studies the other two are sold on.
