/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · internal rate card
   ──────────────────────────────────────────────────────────────────────
   SERVER SIDE ONLY. Underscore prefix keeps Vercel from routing it, and
   nothing here is bundled into a page, so these figures never reach a
   browser.

   ── WHERE THE PUBLISHED TRUTH LIVES ─────────────────────────────────
   assets/offer.js `retainer.publicGuideTiers` is now the source of
   truth for package names, prices, scope lines and deliverables. It is
   what /growth-guide renders, so it is what a client sees.

   This file is the INTERNAL companion: the figures we quote from and the
   commercial rules behind them (add-on pricing, minimum term, prepay,
   what the promise attaches to). It must AGREE with offer.js and never
   compete with it. If the two disagree, offer.js is right, because
   offer.js is the one a client has read.

   Public capacity signal on /grow is still "mid four figures monthly"
   and nothing more precise. /grow deliberately publishes no package
   structure; /growth-guide does, and is sent by hand.

   NOTE: à-la-carte property and event rates are a separate product line
   and are deliberately not represented here. Do not merge them into the
   Production Media retainer offer.
   ══════════════════════════════════════════════════════════════════════ */

export const RETAINER = {
  // APPROVED and published. /growth-guide renders these three packages
  // from assets/offer.js retainer.publicGuideTiers. Prices and
  // deliverables below mirror what is published; change offer.js first,
  // then mirror it here.
  approved: true,
  approvedOn: '2026-09-12',
  publishedAt: '/growth-guide',
  publishedSource: 'assets/offer.js · retainer.publicGuideTiers',

  tiers: [
    {
      name: 'The Anchor', monthly: 3500, from: false,
      label: 'Production partner',
      scope: 'One focused media day a month, with the feed, posting and creative read handled. Production only: we do not run the campaign at this tier unless the ad management add-on is taken.',
      mediaDaysPerMonth: 0.5,
      deliverables: 16,          // 12 short-form + 4 scripted hero
      includesPosting: true,
      includesCampaignManagement: false,
      productionPromiseEligible: false
    },
    {
      name: 'Growth Partner', monthly: 6500, from: false,
      label: 'Production + campaign system',
      scope: 'Brand content and dedicated ad creative, with production and paid media under one roof. Ad concepts are built as ads, not repurposed brand cuts.',
      mediaDaysPerMonth: 2,      // 4 half-days or 2 full days
      deliverables: 30,
      includesPosting: true,
      includesCampaignManagement: true,
      productionPromiseEligible: true
    },
    {
      name: 'Brand Builder', monthly: 15000, from: false,
      label: 'Flagship partnership',
      scope: 'Longform, short-form and dedicated ad creative in one monthly production system. Everything in Growth Partner, plus podcasts, YouTube and founder interviews.',
      mediaDaysPerMonth: 4,
      deliverables: 55,          // 10 longform + 30 short-form + 15 ads
      includesPosting: true,
      includesCampaignManagement: true,
      productionPromiseEligible: true
    }
  ],

  // Published on The Anchor card. Bolting management onto Anchor reaches
  // $5,000, which is $1,500 under Growth Partner, and the gap is real
  // scope rather than a pricing accident: Anchor runs one half-day media
  // day and 16 deliverables against Growth Partner's two days and 30,
  // with ad creative built as ad creative. The add-on does NOT carry the
  // 90-Day Production Promise, because it buys management of a fixed
  // batch with no iteration budget.
  campaignManagementAddOn: 1500,
  addOnProductionPromiseEligible: false,

  // Also published on The Anchor card.
  communityManagementAddOn: 750,

  minimumTermMonths: 3,

  // Twelve months for the price of ten. Still WITHHELD from the client
  // guide: the packages are approved, this incentive is not, and it does
  // not appear on /growth-guide. Internal only until that changes.
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
