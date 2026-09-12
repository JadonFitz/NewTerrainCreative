/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · internal rate card
   ──────────────────────────────────────────────────────────────────────
   SERVER SIDE ONLY. Underscore prefix keeps Vercel from routing it, and
   nothing here is bundled into a page, so these figures never reach a
   browser.

   Retainer rates moved here when /grow stopped publishing a package
   table. Anything shipped in assets/offer.js is publicly inspectable
   whether or not it is rendered, so exact rates do not belong there.

   Public capacity signal on /grow is "mid four figures monthly" and
   nothing more precise. Exact scope and fee are quoted after
   qualification.

   NOTE: à-la-carte property and event rates are a separate product line
   and are deliberately not represented here. Do not merge them into the
   Production Media retainer offer.
   ══════════════════════════════════════════════════════════════════════ */

export const RETAINER = {
  // PROVISIONAL. Prices agreed at three levels; the full scopes are in
  // docs/pricing/package-scopes.md and are NOT yet approved. Do not
  // publish a figure until the scope behind it is signed off.
  approved: false,
  tiers: [
    {
      name: 'The Anchor', monthly: 3500, from: false,
      scope: 'Production only. We make the creative; the campaign is yours to run.',
      productionPromiseEligible: false
    },
    {
      name: 'Growth Partner', monthly: 6500, from: false,
      scope: 'Production plus campaign strategy and management, with creative that changes in response to results.',
      productionPromiseEligible: true
    },
    {
      name: 'Brand Builder', monthly: 15000, from: true,
      scope: 'Flagship. Custom engagement, includes longform.',
      productionPromiseEligible: true
    }
  ],

  // Bolts campaign management onto Anchor. Anchor + this is $5,000, which
  // is $1,500 under Growth Partner, and the difference has to be real
  // scope rather than a pricing accident. It buys management of a FIXED
  // batch of creative: no iteration shoot, no variant cuts, no funnel
  // work, and no 90-Day Production Promise. See docs/pricing.
  campaignManagementAddOn: 1500,
  addOnProductionPromiseEligible: false,

  minimumTermMonths: 3,

  // Twelve months for the price of ten. WITHHELD from the sales guide by
  // decision of 12 Sep 2026: it is not to appear in any client-facing
  // table until the core packages are approved. Internal only.
  prepayMonthsCharged: 10,
  prepayMonthsGiven: 12,
  prepayPublishable: false,

  // What the public page is allowed to say.
  publicCapacitySignal: 'mid four figures monthly'
};

/* ── Founding Three continuation ──────────────────────────────────────
   A PROMOTIONAL CONTINUATION OF THE PILOT. It is not a package, and it
   is not The Anchor.

   The two are the same number and that is a coincidence worth guarding
   against, because conflating them causes two concrete problems:

     1. The Anchor is production only. The founding continuation carries
        the pilot scope the founding month established, which includes
        campaign management. Selling one as the other under-delivers or
        over-delivers depending on which way the mistake runs.

     2. The Anchor is an open, ongoing package. This is a time-boxed
        continuation of a specific pilot, available only to the three,
        only for months two and three, and it does not renew into itself.
        At the end of month three a founding client moves onto a standard
        package at standard rates, or stops.

   The agreement must name it as its own thing, with its own scope
   exhibit, and must not reference the Anchor package by name.

   The 90-Day Production Promise does not apply here: a founding client
   has already had a production cycle at no service charge and the two
   cannot be stacked.

   Disclosed at step two of the application, before submission, never on
   the landing page. MIRRORS assets/offer.js founding.continuationMonthly,
   which is the source of truth now that step two renders it. Change both
   or scripts/check-offer.py fails.
   ─────────────────────────────────────────────────────────────────── */
export const FOUNDING_CONTINUATION = {
  monthly: 3500,
  months: 2,
  total: 7000,
  required: false,
  // Explicitly NOT the Anchor package, whatever the matching figure
  // suggests. See the note above.
  isPackage: false,
  isPromotionalContinuation: true,
  continuesScope: 'founding pilot month one, including campaign management',
  renewsInto: null,          // ends; a standard package is a new agreement
  productionPromiseEligible: false
};
