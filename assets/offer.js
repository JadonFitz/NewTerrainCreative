/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · canonical offer terms
   ──────────────────────────────────────────────────────────────────────
   SINGLE SOURCE OF TRUTH for every price, scope bound and qualification
   threshold on the site.

   PUBLIC TERMS ONLY. Everything here ships to the browser and is
   inspectable whether or not it is rendered, so only figures we are
   willing to publish belong in this file. High-level retainer rates are
   published only in the unlisted /growth-guide and mirrored server side
   in api/_rates.js.

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
      // on the landing page. Disclosed at step two of the application,
      // before anyone submits, which is the whole reason the application
      // has two steps.
      //
      // The figure lives here rather than in api/_rates.js because step
      // two renders it: it is a published term now, not an internal rate.
      // api/_rates.js mirrors it for server-side quoting and
      // scripts/check-offer.py fails if the two ever disagree.
      /* ── application window ─────────────────────────────────────
         A REAL deadline, not a rolling countdown. The page renders this
         date and hides the callout entirely once it has passed, so a
         lapsed date can never sit on the page pretending to be live.

         To extend or reopen the round, change this ONE line. Do not
         make it relative to the visitor's clock: a "7 days" that resets
         per visitor is the fake-urgency pattern, and it costs more
         trust than it buys.

         Set to the end of September 2026. Visitors arriving later in
         the window correctly see less time remaining, which is how a
         real deadline behaves.
         ─────────────────────────────────────────────────────────── */
      applicationsCloseAt: '2026-09-30T23:59:59-07:00',

      continuationRequired: false,
      /* Changed 22 Sep 2026. Was 'application step 2', which stopped
         existing when /apply was parked and Founding started routing
         straight to iClosed. The figure is now disclosed in the required
         terms acknowledgement on the booking form, before anyone picks
         a slot, and spoken aloud in the VSL. Both sit before any
         commitment, which was always the point of the rule. */
      continuationDisclosedAt: 'iClosed booking form, and the VSL',
      continuationMonthly: 3500,
      continuationMonths: 2,
      continuationTotal: 7000,
      // Client-funded, paid directly to the ad platform, never to us.
      minMonthlyAdSpend: 1500,
      geography: 'Los Angeles'
    },

    // ── The 90-Day Production Promise ─────────────────────────────────
    // Public terms only. Full conditions, and the questions still open on
    // them, are in docs/terms/90-day-production-promise.md, which is NOT
    // attorney-approved and must not be published as-is.
    //
    // This replaces the withdrawn total-views guarantee. Do not reinstate
    // that in any form.
    productionPromise: {
      days: 90,
      // A promise about our work, never about the client's revenue.
      remedy: 'one standard production cycle matching the contracted monthly allocation',
      remedyIncludesRevisions: 1,
      isServiceCredit: true,      // never a cash refund
      stacksWithFoundingWaiver: false,
      benchmarkChosenBeforeLaunch: true,
      eligibleBenchmarks: [
        'Qualified cost per lead',
        'Qualified-lead rate',
        'Landing page conversion rate',
        'Click-through rate',
        'Another mutually agreed measurable indicator'
      ],
      // Explicitly not a default benchmark. This is the term that made the
      // old guarantee meaningless.
      totalViewsEligibleByDefault: false,

      // WHERE IT APPLIES. Growth Partner and Brand Builder only.
      //
      // Not Anchor, and not Anchor plus the campaign-management add-on.
      // The promise requires that we managed the campaign AND could change
      // the creative in response to it. Anchor is production only, so
      // every claim would fail on the management condition automatically;
      // the add-on gives us management of a fixed batch with no iteration
      // budget, so the lever the remedy assumes is missing. A promise
      // offered where it can never pay out is worse than no promise.
      //
      // /grow does not publish package names, so it states the same rule
      // as "engagements where we manage the campaign". /growth-guide names
      // the packages because it publishes them.
      eligiblePackages: ['Growth Partner', 'Brand Builder'],
      ineligiblePackages: ['The Anchor', 'The Anchor plus campaign management'],
      requiresManagedCampaign: true,

      attorneyApproved: false
    },

    // ── Paid retainer ─────────────────────────────────────────────────
    // /grow still publishes only the capacity signal below. The tier
    // summaries render on the unlisted /growth-guide, which is sent by
    // hand after qualification. These deliverable counts are the approved
    // package baselines; a proposal confirms fit and any custom scope.
    retainer: {
      /* Kept for copy that still needs a single figure rather than the
         table: the homepage engage card, /grow's meta description, the
         video scripts, a reply to "roughly what does it cost". It is NO
         LONGER what the body of /grow publishes.
         /production-media used to be the main consumer; that page was
         retired 21 Sep 2026 and redirects to /grow.
         Changed 21 Sep 2026: /grow now renders publicGuideTiers, the
         same object /growth-guide reads. One definition, two depths.
         The page qualifies, the guide closes. */
      publicCapacitySignal: 'mid four figures monthly',
      minimumTermMonths: 3,
      publicGuideTiers: [
        {
          name: 'The Anchor', monthly: 3500, from: false,
          label: 'Production partner',
          scope: 'Consistency is the whole game: one focused media day a month, with the feed, posting and creative read handled.',
          includes: [
            'One half-day media day each month',
            '16 deliverables: 12 short-form + 4 scripted hero pieces',
            '3–4 directed setups, with hero pieces finished with b-roll, sound design and color',
            'Posting and scheduling across your channels',
            'Monthly analytics and creative direction',
            'Meta ad management available as a $1,500 monthly add-on',
            'Community management available as a $750 monthly add-on'
          ],
          productionPromiseEligible: false
        },
        {
          name: 'Growth Partner', monthly: 6500, from: false,
          label: 'Production + campaign system',
          scope: 'The conversion tier: brand content and dedicated ad creative, with production and paid media under one roof.',
          includes: [
            '4 half-day or 2 full-day shoots each month',
            '30 deliverables across brand content and ad creative',
            'Dedicated ad concepts and hook variations—not repurposed brand cuts',
            'Event, product and brand-identity coverage within the included shoot days',
            'Posting and scheduling across your channels',
            'Meta campaign setup and weekly management',
            'Monthly analytics and creative direction'
          ],
          productionPromiseEligible: true
        },
        {
          name: 'Brand Builder', monthly: 15000, from: false,
          label: 'Flagship partnership',
          scope: 'The engine at full volume: longform, short-form and dedicated ad creative in one monthly production system.',
          includes: [
            'Up to 4 full production days each month',
            '55 deliverables: 10 longform + 30 short-form + 15 ads',
            'Everything in Growth Partner, including Meta management',
            'Podcasts, YouTube content and founder interviews',
            'Monthly analytics and creative direction'
          ],
          productionPromiseEligible: true
        }
      ]
    },

    // Optional services attached to the package structure above.
    campaignManagementAddOn: 1500,
    communityManagementAddOn: 750,

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
         packages differ on what you walk away with:
           $2,500  one-off,  8 creatives     The Eight
           $3,500  monthly, 16 pieces        The Anchor
           $4,500  one-off, 15 creatives     The Fifteen
           $6,500  monthly, 30 pieces        Growth Partner */
      adSprintEight:   { name: 'The Eight',   price: 2500, creatives: 8 },
      adSprintFifteen: { name: 'The Fifteen', price: 4500, creatives: 15 },
      leadFoundation:  { name: 'Lead Foundation', price: 2500 }
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
    // campaign work" on the strategy call form. Set so the bands straddle
    // the mid-four-figure starting point and an applicant can self-select
    // without us publishing a rate card.
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
      'the free month is unlimited',
      'results, testimonials or logos we do not have',
      // Withdrawn 13 Sep 2026. It was unbounded, its benchmark was
      // undefined, and it stacked on the Founding waived month. It must
      // not come back in any wording.
      'a free shoot day if the creative does not beat your baseline'
    ]
  };

  // Convenience formatters so page copy and form labels agree.
  OFFER.fmt = function (n) {
    return '$' + Number(n).toLocaleString('en-US');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OFFER;
  if (w) w.NTC_OFFER = OFFER;
})(typeof window !== 'undefined' ? window : null);
