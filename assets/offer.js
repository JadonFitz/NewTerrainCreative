/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · canonical offer terms
   ──────────────────────────────────────────────────────────────────────
   SINGLE SOURCE OF TRUTH for every scope bound and qualification
   threshold on the site.

   PRICING WITHDRAWN 2 Oct 2026. The rate card is being reworked and the
   site publishes no price while it is: no retainer rate, no Sprint
   price, no add-on rate, no rush fee, no "mid four figures" signal and
   no payroll comparison, which only existed to anchor the prices.
   Monthly deliverable and production-day counts came off the same day,
   because the package scopes are being reworked with the prices and a
   stale count is a promise in the same way a stale price is. The
   figures were deleted from this file rather than hidden on the pages,
   for the reason in the next paragraph. The internal card is
   api/_rates.js, which never reaches a browser. When pricing is
   published again, declare it here first and scripts/check-offer.py
   will let it onto a page.

   What is still a number here is not our price list: the Founding
   Three terms, which sit outside the rate card, the client's own
   ad-spend minimum, and the survey bands the forms ask applicants about.

   PUBLIC TERMS ONLY. Everything here ships to the browser and is
   inspectable whether or not it is rendered, so only figures we are
   willing to publish belong in this file.

   If a number appears in page copy it must match this file. Run
   `scripts/check-offer.py` to verify; it greps every page and fails on a
   figure that is not declared here.

   Loaded by the forms so labels and validation cannot drift from the copy.
   Read by humans before editing any page that mentions money.
   ══════════════════════════════════════════════════════════════════════ */
(function (w) {
  'use strict';

  var OFFER = {

    // ── Founding Three ────────────────────────────────────────────────
    founding: {
      slots: 3,
      applicationsCloseAt: '2026-10-24T23:59:59-07:00',
      // Month one: our service fee is waived. The client still funds media.
      monthOneServiceFee: 0,
      // What the waived month actually covers. Bounded on purpose: the
      // brief forbids anything that reads as unlimited.
      monthOneScope: [
        'One offer and strategy session',
        'One production day on location',
        'One batch of campaign creative, cut, captioned and graded',
        'One revision round on that batch',
        'Campaign build and launch on Meta',
        'Campaign management for the remainder of the first 30 days',
        'One written performance report at the end of the month'
      ],
      monthOneExcludes: [
        'Additional production days',
        'Unlimited revisions or re-edits',
        'Organic posting or community management',
        'Work outside the agreed 30-day scope'
      ],
      // Optional continuation. NOT contractually required, and NOT priced
      // in the copy of the landing page. See continuationDisclosedAt
      // below for where it is disclosed and why that is enough.
      //
      // The figure lives here rather than in api/_rates.js because it is
      // a published term now, not an internal rate. api/_rates.js mirrors
      // it for server-side quoting and scripts/check-offer.py fails if
      // the two ever disagree.
      /* ── application window ─────────────────────────────────────
         RESTORED 5 Oct 2026: applications close 24 Oct 2026, 11:59 PM
         Pacific. Jadon's call, and a date he will hold: past it the
         page says "Applications closed" and nothing is extended. The
         "N of 3 open" slot counter came off /founding the same day; the
         three-partner framing stays in the copy, the countdown is the
         urgency. founding.html carries the same instant in CLOSE_AT and
         scripts/check-claims.py fails if the two ever differ. The timer
         counts down to this fixed moment for every visitor, never to the
         visitor's own clock.

         WHAT THE DATE CLOSES, added 5 Oct 2026. It is the deadline to
         submit an application, not to finish the sale: anyone who
         applies before it completes the call and the decision after.
         Past it, a late applicant who fits is not turned away and is
         not let into the round either. /strategy-call stops loading the
         Founding event for ?offer=founding-three and loads the Growth
         calendar instead, on the standard engagement with no waived
         month, tagged founding-three-late. The Founding event itself
         has to be switched off in iClosed at the same moment, and the
         ads end with it; the site cannot do either.

         History, kept because the reasoning still applies to any future
         extension:

         REMOVED 22 Sep 2026. There is no date, on purpose.

         applicationsCloseAt was '2026-09-30T23:59:59-07:00', eight days
         out at the point the Founding VSL was being filmed. An ad
         cannot outrun its own deadline: the flight would have carried
         an offer whose close date had passed, while /founding either
         hid the callout or contradicted it.

         The honest answer was that the round was always going to run
         until three partners were signed, and the date would have been
         extended rather than enforced. A deadline you would extend
         anyway teaches people your deadlines do not mean anything, and
         that is a worse trade than the urgency is worth.

         SCARCITY IS NOW THE SLOT COUNT ALONE. slots: 3 is a real
         constraint that closes itself, it is verifiable against how
         many partners exist, and it needs no maintenance.

         If a dated round is ever wanted again, put the field back with
         a date you will actually hold, and never make it relative to
         the visitor's clock: a "7 days" that resets per visitor is the
         fake-urgency pattern and costs more trust than it buys.
         ─────────────────────────────────────────────────────────── */

      continuationRequired: false,
      /* Changed 22 Sep 2026. Was 'application step 2', which stopped
         existing when /apply was parked and Founding started routing
         straight to iClosed. The figure is now disclosed in the required
         terms acknowledgement on the booking form, before anyone picks
         a slot, and spoken aloud in the VSL. Both sit before any
         commitment, which was always the point of the rule. */
      continuationDisclosedAt: 'iClosed booking form, and the VSL',
      continuationMonthly: 5000,
      continuationMonths: 2,
      continuationTotal: 10000,
      // Client-funded, paid directly to the ad platform, never to us.
      minMonthlyAdSpend: 1500,
      geography: 'Los Angeles'
    },

    // ── The 90-Day Production Promise · WITHDRAWN 2 Oct 2026 ──────────
    // Off the site while its terms are reworked. It was written for a
    // structure in which The Anchor was production only and so could not
    // carry it; every retainer now includes paid media management, which
    // removes that reason and leaves the eligibility rule undecided.
    // Rather than publish a promise whose scope is open, no page states
    // one. The last terms are in docs/terms/90-day-production-promise.md,
    // which is NOT attorney-approved and must not be published as-is.
    //
    // It replaced the withdrawn total-views guarantee. Do not reinstate
    // that in any form, and do not bring this back by pasting old copy:
    // decide who it applies to first.
    productionPromise: { published: false },

    // ── Paid retainer ─────────────────────────────────────────────────
    // /grow renders the three packages from publicGuideTiers: name,
    // label and a short summary, with no price and no monthly counts.
    // The volume and production allocation are agreed in the proposal.
    //
    // STRUCTURE, changed 2 Oct 2026. Every retainer is creative plus
    // paid media management plus iteration. There is no production-only
    // tier and no ad management add-on any more: The Anchor used to be
    // both. The tiers differ on creative volume and depth of testing,
    // not on whether we run the campaign. Creative production with no
    // ongoing media management is the Ad Sprint, and only the Ad Sprint.
    //
    // Also 2 Oct 2026. "Posting and scheduling" became "organic
    // distribution of the campaign creative": we post the ads we made,
    // we do not run the client's social presence. Community management
    // left the offer. Longform is Brand Builder only. And the platform
    // is not named in retainer copy: it is paid media, chosen for the
    // audience. The Founding Three scope above still names its platform
    // because that is a defined pilot with its own terms.
    //
    // Also 2 Oct 2026. Every retainer includes funnel, tracking and
    // automation support, "conversion infrastructure" in the headline
    // copy: landing-page flow, lead routing into the CRM, conversion
    // tracking and core automations. It means a STANDARD setup, built
    // and managed inside the engagement. Custom systems work (bespoke
    // integrations, dashboards, multi-step custom funnels) is scoped
    // separately and no page may suggest otherwise. The line is the
    // same on every tier in public; depth per tier is internal.
    retainer: {
      /* No rate and no capacity signal, on purpose. Both were removed
         2 Oct 2026 with the rest of the pricing: the per-tier monthly
         figure, and the single-line signal the homepage engage card and
         /grow's meta description used to carry. Scope and fee are set on
         a strategy call. */
      pricePublished: false,
      minimumTermMonths: 3,
      publicGuideTiers: [
        {
          name: 'The Anchor',
          label: 'Creative + paid media',
          scope: 'A focused monthly ad creative and paid media system: recurring campaign concepts, production, testing and management under one roof.',
          includes: [
            'A recurring monthly media day',
            'A steady monthly volume of ad creative, built as ad creative',
            'Directed setups, finished with b-roll, sound design and color',
            'Organic distribution of the campaign creative',
            'Monthly analytics and creative direction',
            'Paid media management, testing and iteration',
            'Funnel, tracking and automation support: lead routing, conversion tracking and core automations'
          ]
        },
        {
          name: 'Growth Partner',
          label: 'More volume, deeper testing',
          scope: 'Higher creative volume, deeper testing and more ambitious campaign concepts, for a business ready to scale what is working.',
          includes: [
            'More shoot time each month than The Anchor',
            'A higher monthly volume across brand content and ad creative',
            'Dedicated ad concepts and hook variations, not repurposed brand cuts',
            'Event, product and brand-identity coverage within the included shoot days',
            'Organic distribution of the campaign creative',
            'Paid media setup and weekly management',
            'Funnel, tracking and automation support: lead routing, conversion tracking and core automations',
            'Monthly analytics and creative direction'
          ]
        },
        {
          name: 'Brand Builder',
          label: 'Flagship partnership',
          scope: 'Our largest production allocation, with broader testing and premium campaign creative.',
          includes: [
            'Our largest monthly production allocation',
            'Our highest monthly volume across longform, short-form and ads',
            'Everything in Growth Partner, including paid media management',
            'Longform: founder interviews, YouTube episodes, podcasts and case-study pieces',
            'Monthly analytics and creative direction'
          ]
        }
      ]
    },

    // ── One-time products ─────────────────────────────────────────────
    products: {
      /* Sprint packages are sold on OUTPUT, not on hours. No shoot
         duration is published for either, deliberately.

         A simple Sprint is often done in about two hours; saying
         "half-day" or "full day" would commit us to a block we do not
         need and would read as the deliverable rather than the ads. If a
         project genuinely needs a long directed day, that is Signature
         Work and priced as a project.

         This replaced a duration split that was briefly specified and
         then withdrawn. Before that, index.html and sprint.html had
         drifted apart, one saying half-day for The Eight and the other a
         full day, because duration lived only in page copy and nothing
         checked it. scripts/check-claims.py now fails if a duration
         claim appears on /sprint at all.

         The ladder still reads correctly without hours, because the
         packages differ on what you walk away with: 8 creatives, then
         15, one-off; then a monthly volume on the retainers.

         No price on any of them since 2 Oct 2026. The Sprint is still
         fixed price; the figure is quoted on the fit call. */
      adSprintEight:   { name: 'The Eight',   creatives: 8 },
      adSprintFifteen: { name: 'The Fifteen', creatives: 15 },
      leadFoundation:  { name: 'Lead Foundation' }
    },

    /* ── Ad Sprint · what reduces the buyer's risk ───────────────────
       NOT a guarantee, a refund, or a remedy. These are properties the
       engagement already has, written down so the page can only state
       what is true.

       Recorded 14 Sep 2026 on instruction. Client asset ownership was
       not previously encoded anywhere; /growth-guide already states the
       same principle for the ad account, pixel and data.

       The withdrawn "next shoot day is free" guarantee must not return
       in any form. See neverClaim below.
       ─────────────────────────────────────────────────────────────── */
    adSprintTerms: {
      fixedScope: true,          // 8 or 15 creatives, agreed before the shoot
      fixedPrice: true,          // the price does not move with the day
      noRetainer: true,          // nothing rolls into a monthly commitment
      clientOwnsAssets: true,    // footage and every cut
      campaignManagementIncluded: false,
      resultGuaranteed: false
    },

    /* ── Founding Three · what reduces the applicant's risk ──────────
       The waived fee and the optional continuation ARE the risk
       reversal. Nothing is added on top: no free production promise, no
       performance guarantee, no refund, no open-ended remedy.

       continuationPricePublicOnFoundingPage is false on purpose, and
       stays false. $3,500 must not appear in the COPY of /founding.

       What that rule is protecting has not changed: nobody should meet
       the continuation price before they understand what the waived
       month actually is. It is a reason to keep it out of the page's
       running text, not a reason to hide it. It is disclosed in the
       required terms acknowledgement on the iClosed booking form and
       spoken in the VSL, both before any commitment.

       SO: if the VSL is ever embedded on /founding, the page will state
       $3,500 aloud while this flag says it must not appear. That is
       fine and it is deliberate. The flag governs the written copy,
       where a number with no context reads as a price list. A figure
       inside a two-minute explanation is the context. Do not "fix" the
       mismatch by muting the VSL or by adding the price to the copy.
       ─────────────────────────────────────────────────────────────── */
    foundingRiskReversal: {
      serviceFeeWaivedMonthOne: true,
      continuationOptional: true,
      continuationPricePublicOnFoundingPage: false,
      clientFundsOwnAdSpend: true,
      acceptanceGuaranteed: false,
      resultGuaranteed: false
    },

    /* ── Boutique, by design ──────────────────────────────────────────
       Added 26 Sep 2026. Positioning decision: we say we are small on
       purpose rather than hide it. Akoola sells scale, the content farms
       sell volume; nobody in the lane sells a small roster as the reason
       to buy. Until we scale, if we decide to, this is how we run.

       Two rules for any copy that uses it. By design, never by default:
       "a handful of clients at a time, on purpose", never "we are a
       small business". And always paired with a mechanism from the list
       below, or it is fluff.

       maxActiveRetainers is null on purpose. A number is stronger, but
       only one we will hold; a cap we would quietly raise teaches people
       our caps mean nothing (see the removed application deadline above).
       Set it when there is a real ceiling, and print it then.
       ─────────────────────────────────────────────────────────────── */
    boutique: {
      byDesign: true,
      maxActiveRetainers: null,
      directAccess: ['Jadon Cal Fitzpatrick', 'Meghan Carrasquillo'],
      accountManager: false,
      // Mechanisms that are true today. Add to this list before claiming
      // anything new in copy.
      mechanisms: [
        'The person who plans the shoot is the person who shoots and cuts it',
        'Clients talk to the founder and the creative strategist directly',
        'The Angle Call before any Sprint shoot',
        'Monthly analytics and creative direction on every retainer',
        'Paid media management on every retainer'
      ]
    },

    // ── Priority industries ───────────────────────────────────────────
    // Used to build the application's industry field. "Other" is accepted
    // but flagged as non-priority rather than hidden.
    industries: [
      'Health and wellness',
      'Law firm',
      'Dental practice',
      'Construction or contracting'
    ],
    // What an applicant sees. "Non-priority" is how we talk internally
    // and there is no reason to say it to someone's face; the server
    // normalises anything outside the four to 'Other' for reporting.
    otherIndustryLabel: 'Something else',

    // ── Qualification bands ───────────────────────────────────────────
    // Boundaries for the "what do you spend on ads today" question. These
    // describe the applicant's spend, not our pricing, but they live here
    // so the form and the consistency check agree on them.
    adSpendBands: [1500, 5000],

    // Boundaries for "what can you invest monthly in production and
    // campaign work" on the strategy call form. Set so an applicant can
    // self-select without us publishing a rate card.
    budgetBands: [2500, 5000, 10000],

    // Founding Three asks for a 90-DAY total, not a monthly figure, so it
    // needs its own bands. Do not conflate the two: budgetBands above is
    // monthly and belongs to the strategy call.
    //
    // Anchored on the real floor. $1,500 a month of media across three
    // months is $4,500, so a band under that is someone telling us the
    // month-one requirement will be a struggle even if they ticked yes.
    founding90DayBudgetBands: [4500, 10000, 25000],

    // Signature Work is project priced, not monthly, so its bands are
    // whole-project totals and sit an order of magnitude away from the
    // retainer's. Do not reuse budgetBands here: a $10,000 month and a
    // $10,000 film are not the same conversation.
    projectBudgetBands: [10000, 25000, 50000],
    projectTypes: [
      // First, because /sprint routes here and an Ad Sprint is the most
      // common single thing this form is asked for.
      'Ad Sprint',
      'Commercial',
      'Documentary or brand film',
      'Podcast build-out',
      'Event or summit coverage',
      'Something else'
    ],

    /* ── paid landing pages · offer identifiers ─────────────────────
       Maps the ?offer= slug a CTA carries into the canonical id used on
       the Meta conversion and in funnel_events.metadata.

       An allowlist, not a passthrough. The value reaches Meta custom
       data and our own event store, so an arbitrary query string must
       never become an offer name: that would let anyone invent
       conversions in the reporting. Anything unrecognised falls back to
       the page's own default.

       Deliberately NOT stored as a new column on leads. First-touch
       landing_page already separates these funnels for ad traffic and is
       persisted by both handlers, so the identifier only needs to ride
       on the event. No schema change.
       ─────────────────────────────────────────────────────────────── */
    paidOffers: {
      // Retired page. The slug stays so a live ad still carrying it keeps
      // its offer identifier; /production-media now redirects to /grow.
      'production-media': 'production_media',
      'ad-sprint':        'ad_sprint'
    },

    // ── Things we do not say ──────────────────────────────────────────
    // Kept here so the constraint is visible next to the numbers.
    neverClaim: [
      'guaranteed leads, revenue or ROAS',
      'a Founding Partner is a paying retainer client',
      'months two and three are required',
      // Added 22 Sep 2026 with the removal of applicationsCloseAt, kept
      // when the date came back on 5 Oct 2026: 24 Oct 2026 is held, not
      // extended. Past it the page says closed.
      'a closing date for applications that we would extend anyway',
      // Added 5 Oct 2026 with the countdown. The counter is gone, and a
      // made-up "N of 3 taken" must not come back in copy or ads.
      'how many of the three places are taken',
      'the free month is unlimited',
      'results, testimonials or logos we do not have',
      // Withdrawn 13 Sep 2026. It was unbounded, its benchmark was
      // undefined, and it stacked on the Founding waived month. It must
      // not come back in any wording.
      'a free shoot day if the creative does not beat your baseline',
      // Added 26 Sep 2026 with the boutique block.
      'a client cap we would raise quietly, or a review cadence a tier does not include',
      // Added 2 Oct 2026 with the withdrawal of published pricing.
      'a price, a starting-from figure or a payroll comparison, on any page, until pricing is published again',
      'a monthly deliverable or production-day count on a retainer, until the package scopes are published again',
      'a production-only retainer, or ad management as an optional add-on to one',
      'full organic social management or community management as part of a retainer',
      'unlimited or custom systems development as part of a retainer',
      'the 90-Day Production Promise, on any page, until its terms and eligibility are decided'
    ]
  };

  // Convenience formatters so page copy and form labels agree.
  OFFER.fmt = function (n) {
    return '$' + Number(n).toLocaleString('en-US');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OFFER;
  if (w) w.NTC_OFFER = OFFER;
})(typeof window !== 'undefined' ? window : null);
