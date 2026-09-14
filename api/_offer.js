/* ══════════════════════════════════════════════════════════════════════
   Shared offer-identifier resolution
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   A paid landing page sends visitors to a form with ?offer=<slug>. That
   slug travels through the browser, so the server must not trust it: the
   resolved value lands in Meta custom data and in our own event store,
   and an arbitrary string becoming an offer name would let anyone invent
   conversions in the reporting.

   Mirrors assets/offer.js `paidOffers` by hand. A server module cannot
   import a browser IIFE without a build step, and this project has no
   build step. scripts/check-offer.py asserts the two lists agree.
   ══════════════════════════════════════════════════════════════════════ */

const PAID_OFFERS = {
  'production-media': 'production_media',
  'ad-sprint': 'ad_sprint'
};

/**
 * Resolve the offer identifier for a conversion.
 *
 * @param {string|undefined} slug      the ?offer= value the client sent
 * @param {string}           fallback  the form's own default offer
 * @returns {string} an allowlisted identifier, never the raw input
 */
export function resolveOffer(slug, fallback) {
  const key = String(slug || '').trim().toLowerCase();
  return PAID_OFFERS[key] || fallback;
}

export { PAID_OFFERS };
