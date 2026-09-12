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
  tiers: [
    { name: 'The Anchor',     monthly: 3500,  scope: 'Production only. Campaign management is a separate add-on at this tier.' },
    { name: 'Growth Partner', monthly: 6500,  scope: 'Production and campaign management under one roof.' },
    { name: 'Brand Builder',  monthly: 15000, scope: 'Flagship. Includes longform.' }
  ],
  campaignManagementAddOn: 1500,
  minimumTermMonths: 3,
  // Twelve months for the price of ten.
  prepayMonthsCharged: 10,
  prepayMonthsGiven: 12,
  // What the public page is allowed to say.
  publicCapacitySignal: 'mid four figures monthly'
};

// Founding Three continuation. Disclosed to an applicant at step two of
// the application, before they submit. Never on the landing page.
//
// MIRRORS assets/offer.js founding.continuationMonthly, which is the
// source of truth now that step two renders the figure. Change both, or
// scripts/check-offer.py will fail.
export const FOUNDING_CONTINUATION = {
  monthly: 3500,
  months: 2,
  total: 7000,
  required: false
};
