/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · canonical offer terms
   ──────────────────────────────────────────────────────────────────────
   SINGLE SOURCE OF TRUTH for every price, scope bound and qualification
   threshold on the site.

   PUBLIC TERMS ONLY. Everything here ships to the browser and is
   inspectable whether or not it is rendered, so only figures we are
   willing to publish belong in this file. Exact retainer rates live
   server side in api/_rates.js.

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
      // on the landing page. The figure is disclosed at step two of the
      // application, before submission, and lives in api/_rates.js.
      continuationRequired: false,
      continuationDisclosedAt: 'application step 2',
      // Client-funded, paid directly to the ad platform, never to us.
      minMonthlyAdSpend: 1500,
      geography: 'Los Angeles'
    },

    // ── Paid retainer ─────────────────────────────────────────────────
    // No rate table here on purpose. /grow sells the relationship and
    // gives one capacity signal so a prospect can self-select; exact
    // scope and fee are quoted after qualification. Rates: api/_rates.js
    retainer: {
      publicCapacitySignal: 'mid four figures monthly',
      minimumTermMonths: 3
    },

    // ── One-time products ─────────────────────────────────────────────
    products: {
      adSprintEight:   { name: 'The Eight',   price: 2500, creatives: 8 },
      adSprintFifteen: { name: 'The Fifteen', price: 4500, creatives: 15 },
      leadFoundation:  { name: 'Lead Foundation', price: 2500 }
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
    otherIndustryLabel: 'Other (non-priority)',

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

    // ── Things we do not say ──────────────────────────────────────────
    // Kept here so the constraint is visible next to the numbers.
    neverClaim: [
      'guaranteed leads, revenue or ROAS',
      'a Founding Partner is a paying retainer client',
      'months two and three are required',
      'the free month is unlimited',
      'results, testimonials or logos we do not have'
    ]
  };

  // Convenience formatters so page copy and form labels agree.
  OFFER.fmt = function (n) {
    return '$' + Number(n).toLocaleString('en-US');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OFFER;
  if (w) w.NTC_OFFER = OFFER;
})(typeof window !== 'undefined' ? window : null);
