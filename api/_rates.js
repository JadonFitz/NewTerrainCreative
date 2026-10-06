/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · internal rate card
   ──────────────────────────────────────────────────────────────────────
   SERVER SIDE ONLY. Underscore prefix keeps Vercel from routing it, and
   nothing here is bundled into a page, so these figures never reach a
   browser.

   ── NOT PUBLISHED, AND UNDER REVISION ───────────────────────────────
   2 Oct 2026. Pricing was pulled off the site while the rate card is
   reworked. assets/offer.js no longer declares any retainer rate,
   Sprint price, add-on rate or capacity signal, no page renders one,
   and scripts/check-offer.py fails if either comes back.

   The STRUCTURE changed the same day, and the site already reflects
   it: every retainer now includes paid media management, there is no
   production-only tier and no ad management add-on, and the 90-Day
   Production Promise is off the site until its eligibility is decided.
   Posting became organic distribution of the campaign creative only,
   community management left the offer, and longform is Brand Builder.
   The tier objects, the add-on fields and the promise flags below still
   describe the OLD structure.

   The tiers below are the LAST PUBLISHED card, kept as the record of
   what was live. They are not current quotes. Replace them here when
   the new card is locked; nothing else needs to change for the site to
   keep publishing nothing.

   Everything under the next heading describes how this file related to
   offer.js while prices were public. It is history until they are
   again.

   ── WHERE THE PUBLISHED TRUTH LIVED ─────────────────────────────────
   assets/offer.js `retainer.publicGuideTiers` is now the source of
   truth for package names, prices, scope lines and deliverables. It is
   what /growth-guide renders, so it is what a client sees.

   This file is the INTERNAL companion: the figures we quote from and the
   commercial rules behind them (add-on pricing, minimum term, prepay,
   what the promise attaches to). It must AGREE with offer.js and never
   compete with it. If the two disagree, offer.js is right, because
   offer.js is the one a client has read.

   CHANGED 21 Sep 2026. /grow now PUBLISHES the three packages, rendered
   from assets/offer.js retainer.publicGuideTiers, the same object
   /growth-guide reads. It carries a three-line summary per tier to
   qualify; the guide carries the full deliverable composition to close.

   "Mid four figures monthly" survives as publicCapacitySignal for copy
   that still needs one figure rather than a table: the homepage engage
   card, /grow's meta description and the video scripts. It is no longer
   what the body of /grow says. /production-media was the other consumer
   and was retired 21 Sep 2026.

   NOTE: à-la-carte property and event rates are a separate product line
   and are deliberately not represented here. Do not merge them into the
   Production Media retainer offer.
   ══════════════════════════════════════════════════════════════════════ */

export const RETAINER = {
  // Approved 2 Oct 2026. NOT published: the site carries no price. The
  // card is quoted in private sales conversations, proposals, agreements,
  // Stripe checkout and invoices only. Stripe and the agent's catalog
  // (ntc-speed-to-lead, agent/migrations/024_offer_v2.sql) carry the
  // same figures; change them together.
  approved: true,
  approvedOn: '2026-10-02',
  withdrawnOn: null,
  underRevision: false,
  publishedAt: null,
  publishedSource: null,

  // Every retainer includes creative strategy, scripting, production,
  // editing, paid media management (platform-neutral, Meta the usual
  // default), creative testing and iteration, reporting, organic
  // distribution of the campaign creative NTC produces, and standard
  // conversion infrastructure: landing-page flow, CRM lead routing,
  // conversion tracking, core follow-up automations, basic funnel
  // maintenance. Custom systems work is scoped and quoted separately.
  // Longform is Brand Builder only. No production-only tier, no add-ons,
  // no community management, no performance promise.
  tiers: [
    {
      name: 'The Anchor', monthly: 6000, from: false,
      label: 'Creative + paid media',
      adCreatives: 12, coreConcepts: 4, productionDays: 1,
      heroAds: 0, longform: false,
      includesCampaignManagement: true,
      includesConversionInfrastructure: true,
      productionPromiseEligible: false
    },
    {
      name: 'Growth Partner', monthly: 9000, from: false,
      label: 'More volume, deeper testing',
      totalAssets: 20, coreConcepts: 5, productionDays: 2,
      heroAds: 1, longform: false,
      includesCampaignManagement: true,
      includesConversionInfrastructure: true,
      productionPromiseEligible: false
    },
    {
      name: 'Brand Builder', monthly: 15000, from: false,
      label: 'Flagship partnership',
      totalAssets: 30, productionDays: 2,
      heroAds: 2, longform: true,
      includesCampaignManagement: true,
      includesConversionInfrastructure: true,
      productionPromiseEligible: false
    }
  ],

  // Quoted individually. No standard Payment Link unless approved.
  customFrom: 18000,

  // One-time, paid in full upfront. Creative production only.
  sprints: [
    { name: 'The Eight', creatives: 8, oneTime: 3000 },
    { name: 'The Fifteen', creatives: 15, oneTime: 5500 }
  ],

  // Retired 2 Oct 2026. Kept as fields so nothing reads undefined.
  campaignManagementAddOn: null,
  communityManagementAddOn: null,
  addOnProductionPromiseEligible: false,

  minimumTermMonths: 3,
  noticeDays: 30,
  // First month paid before onboarding or production begins; then
  // monthly in advance.
  firstMonthUpfront: true,

  // Annual plans retired 2 Oct 2026; revisit only if deliberately modelled.
  prepayMonthsCharged: null,
  prepayMonthsGiven: null,
  prepayPublishable: false,

  // Rush: no standard fee for now, quoted by hand per request.
  rushFee: null,

  // Client-funded, paid directly to the platform. Recommended minimum.
  recommendedMinMonthlyAdSpend: 1500,

  publicCapacitySignal: null
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
  monthly: 5000,
  months: 2,
  total: 10000,
  required: false,
  // Explicitly NOT the Anchor package, whatever the matching figure
  // suggests. See the note above.
  isPackage: false,
  isPromotionalContinuation: true,
  continuesScope: 'founding pilot month one, including campaign management',
  renewsInto: null,          // ends; a standard package is a new agreement
  productionPromiseEligible: false
};
