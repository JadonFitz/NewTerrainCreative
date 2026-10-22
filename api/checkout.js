/* ══════════════════════════════════════════════════════════════════════
   GET /api/checkout  ·  a Stripe checkout that knows where it came from
   ──────────────────────────────────────────────────────────────────────
   ?link=<buy.stripe.com URL, its slug, or a plink_ id>
   &from=<same-site path the buyer clicked from>
   &v=<anonymous visitor id, assets/track.js ntc_sid>
   &l=<lead id, optional>
   &i=1 when the browser is ours (assets/checkout.js)

   Why not the Payment Link itself: a Payment Link has no per-click back
   URL (its back arrow goes to the homepage) and carries no visitor id,
   so a checkout opened and abandoned is anonymous. This creates a
   Checkout Session per click that mirrors the Payment Link exactly
   (prices, quantities, mode, metadata, phone collection, promotion
   codes, success URL) and adds:

     cancel_url           https://www.newterraincreative.com + from
     client_reference_id  lead_<id> | visitor_<id> | internal_<id>
     metadata             ntc_visitor_id, ntc_lead_id, ntc_from,
                          ntc_internal, ntc_ref (the link's old tag)
     customer_email       looked up here from public.leads, never sent
                          by the browser
     after_expiration     recovery on, so an abandoned checkout has a
                          link the agent can send back

   The agent's offer matching reads offer_key, plan, addons and billing
   from the session (and subscription) metadata, copied from the link,
   so a sale made here onboards exactly as one made on the link.

   NEVER LOSES A SALE. Every failure (no key, Stripe down or refusing,
   a link we cannot mirror, anything thrown) answers 303 to the plain
   buy.stripe.com link with the tag it carried before, which is exactly
   what the button did before this endpoint existed. That is also the
   flag: until STRIPE_CHECKOUT_CREATE_KEY is set, nothing changes.

   STRIPE_CHECKOUT_CREATE_KEY is a restricted key with Checkout Sessions:
   Write and Payment Links: Read, nothing else.

   Only the site's own links are accepted (ALLOWED below). Mirrored by
   scripts/test-checkout.mjs against assets/offer.js, next-step.html and
   call-booked.html, so a link added to a page without being added here
   fails the test rather than quietly skipping the tracked checkout.
   ══════════════════════════════════════════════════════════════════════ */
import { select, configured as dbReady } from './_supabase.js';

const SITE = 'https://www.newterraincreative.com';
const STRIPE = 'https://api.stripe.com/v1';
const BUY = 'https://buy.stripe.com/';

/* The buy.stripe.com slugs the site links to. Front of the Line is not
   linked from the site (the agent's payment_links table holds it), so
   it is not here either. */
export const ALLOWED = new Set([
  // Ad Sprint, one time (offer.js products.adSprint*.stripePaymentLink)
  '4gM5kCcmGgpVgMMaRK1RC0f',   // The Eight
  '4gMcN4fySgpVbss2le1RC0g',   // The Fifteen
  'aFa8wOfySa1xeEEf801RC0H',   // The Thirty
  // Ad Sprint, monthly (stripePaymentLinkMonthly)
  '7sY3cueuO3D9cww2le1RC0J',   // The Eight
  '4gM4gygCW4Hdcwwgc41RC0K',   // The Fifteen
  '8x228q2M68Xt400aRK1RC0L',   // The Thirty
  // 5-Day Trial reserve, /call-booked?offer=pest-control-trial
  '00w28qgCW1v1gMM6Bu1RC0q'
]);

const SLUG = /^[A-Za-z0-9]{10,64}$/;
const PLINK = /^plink_[A-Za-z0-9]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR = /^[A-Za-z0-9_-]{6,120}$/;
// Stripe: client_reference_id up to 200 characters. The Payment Link
// form of it also takes letters, digits, - and _ only, so keep to that.
const REF = /^[A-Za-z0-9_-]{1,200}$/;
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse/i;

const CACHE_MS = 5 * 60 * 1000;
const STRIPE_TIMEOUT_MS = 5000;
let slugIndex = { at: 0, map: new Map() };   // slug -> plink id
const linkCache = new Map();                  // plink id -> { at, link, items }

/** Forget cached Payment Links. Tests only. */
export function resetCache() {
  slugIndex = { at: 0, map: new Map() };
  linkCache.clear();
}

const first = (v) => (Array.isArray(v) ? v[0] : v);
const str = (v, n = 500) => (v == null ? '' : String(first(v)).trim().slice(0, n));

/** The link param as a slug or a plink id, and the tag it already carried. */
export function parseLink(raw) {
  const s = str(raw, 600);
  if (PLINK.test(s)) return { id: s };
  if (SLUG.test(s)) return { slug: s };
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.hostname !== 'buy.stripe.com') return null;
    const slug = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!SLUG.test(slug)) return null;
    const ref = u.searchParams.get('client_reference_id') || '';
    return { slug, ref: REF.test(ref) ? ref : '' };
  } catch { return null; }
}

/** A same-site path and query, or the default. Never another origin. */
export function safeFrom(raw) {
  const s = str(raw, 500);
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '/next-step';
  try {
    const u = new URL(s, SITE);
    if (u.origin !== SITE || u.pathname.startsWith('/api/')) return '/next-step';
    return u.pathname + u.search;
  } catch { return '/next-step'; }
}

/** lead_ beats visitor_; internal_ beats both, so our tests never read as a lead. */
export function referenceId({ leadId, visitorId, internal, fallback }) {
  let ref = '';
  if (internal) ref = `internal_${visitorId || 'unknown'}`;
  else if (leadId) ref = `lead_${leadId}`;
  else if (visitorId) ref = `visitor_${visitorId}`;
  else ref = fallback || '';
  ref = ref.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 200);
  return ref || undefined;
}

/** The plain link, carrying the tag it had before. The fallback for everything. */
function plainUrl(parsed, slug) {
  const s = slug || parsed?.slug;
  if (!s) return null;
  return BUY + s + (parsed?.ref ? `?client_reference_id=${encodeURIComponent(parsed.ref)}` : '');
}

// ── Stripe, form-encoded the way its API wants ─────────────────────────
function encode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') encode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

async function stripe(f, key, method, path, body) {
  const init = {
    method,
    headers: { authorization: `Bearer ${key}` }
  };
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    init.signal = AbortSignal.timeout(STRIPE_TIMEOUT_MS);
  }
  if (body) {
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
    init.body = encode(body).join('&');
  }
  const r = await f(`${STRIPE}${path}`, init);
  const json = await r.json().catch(() => null);
  if (!r.ok) {
    // Stripe's error message describes the request, never the key.
    throw new Error(`stripe ${r.status} ${json?.error?.message || ''}`.trim());
  }
  return json;
}

/** buy.stripe.com slug to plink id. Payment Links: Read lists them. */
async function idForSlug(f, key, slug) {
  if (Date.now() - slugIndex.at < CACHE_MS && slugIndex.map.has(slug)) return slugIndex.map.get(slug);
  const map = new Map();
  let after = '';
  for (let page = 0; page < 10; page++) {
    const list = await stripe(f, key, 'GET',
      `/payment_links?active=true&limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
    for (const pl of list?.data || []) {
      const s = String(pl.url || '').replace(BUY, '').replace(/[/?].*$/, '');
      if (s) map.set(s, pl.id);
    }
    if (!list?.has_more || !list.data?.length) break;
    after = list.data[list.data.length - 1].id;
  }
  slugIndex = { at: Date.now(), map };
  return map.get(slug) || null;
}

async function loadLink(f, key, id) {
  const hit = linkCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const link = await stripe(f, key, 'GET', `/payment_links/${encodeURIComponent(id)}`);
  const items = await stripe(f, key, 'GET', `/payment_links/${encodeURIComponent(id)}/line_items?limit=100`);
  const entry = { at: Date.now(), link, items: items?.data || [] };
  linkCache.set(id, entry);
  return entry;
}

/* Features a Payment Link can have that this endpoint does not copy.
   Rather than open a checkout that differs from the link, such a link
   goes to the plain link. None of the site's links use them today. */
function unmirrorable(link) {
  if (Array.isArray(link.custom_fields) && link.custom_fields.length) return 'custom_fields';
  if (link.shipping_address_collection) return 'shipping_address_collection';
  if (Array.isArray(link.optional_items) && link.optional_items.length) return 'optional_items';
  if (link.after_completion?.type !== 'redirect' || !link.after_completion?.redirect?.url) return 'no redirect';
  return '';
}

const stringMap = (m) => {
  const out = {};
  for (const [k, v] of Object.entries(m || {})) if (v != null && v !== '') out[k] = String(v);
  return out;
};

/**
 * The Checkout Session body, mirroring the link. Pure, so the test can
 * read exactly what would be sent.
 */
export function sessionBody(link, items, extra) {
  const lineItems = items.map((li) => ({
    price: typeof li.price === 'string' ? li.price : li.price?.id,
    quantity: li.quantity || 1
  }));
  if (!lineItems.length || lineItems.some((li) => !li.price)) throw new Error('link has no line items');
  const recurring = items.some((li) => li.price?.type === 'recurring' || li.price?.recurring);
  const mode = recurring ? 'subscription' : 'payment';

  const metadata = { ...stringMap(link.metadata), ...extra.metadata };
  const body = {
    mode,
    line_items: lineItems,
    success_url: link.after_completion.redirect.url,
    cancel_url: SITE + extra.from,
    client_reference_id: extra.clientReferenceId,
    customer_email: extra.customerEmail,
    metadata,
    phone_number_collection: link.phone_number_collection?.enabled ? { enabled: true } : undefined,
    allow_promotion_codes: link.allow_promotion_codes ? true : undefined,
    billing_address_collection: link.billing_address_collection && link.billing_address_collection !== 'auto'
      ? link.billing_address_collection : undefined,
    automatic_tax: link.automatic_tax?.enabled ? { enabled: true } : undefined,
    tax_id_collection: link.tax_id_collection?.enabled ? { enabled: true } : undefined,
    payment_method_collection: link.payment_method_collection || undefined,
    payment_method_types: Array.isArray(link.payment_method_types) && link.payment_method_types.length
      ? link.payment_method_types : undefined,
    consent_collection: consentOf(link.consent_collection),
    custom_text: link.custom_text
      ? Object.fromEntries(Object.entries(link.custom_text)
          .filter(([, v]) => v?.message)
          .map(([k, v]) => [k, { message: v.message }]))
      : undefined,
    after_expiration: {
      recovery: { enabled: true, allow_promotion_codes: link.allow_promotion_codes ? true : undefined }
    }
  };

  if (mode === 'subscription') {
    const sd = link.subscription_data || {};
    body.subscription_data = {
      description: sd.description || undefined,
      trial_period_days: sd.trial_period_days || undefined,
      trial_settings: sd.trial_settings?.end_behavior?.missing_payment_method
        ? { end_behavior: { missing_payment_method: sd.trial_settings.end_behavior.missing_payment_method } }
        : undefined,
      // The agent reads subscription metadata on renewals and changes.
      metadata: { ...stringMap(sd.metadata), ...metadata }
    };
  } else {
    if (link.customer_creation) body.customer_creation = link.customer_creation;
    if (link.submit_type && link.submit_type !== 'auto') body.submit_type = link.submit_type;
    const pid = link.payment_intent_data;
    if (pid && Object.keys(pid.metadata || {}).length) {
      body.payment_intent_data = { metadata: stringMap(pid.metadata) };
    }
    if (link.invoice_creation?.enabled) {
      const inv = link.invoice_creation.invoice_data || {};
      body.invoice_creation = {
        enabled: true,
        invoice_data: {
          description: inv.description || undefined,
          footer: inv.footer || undefined,
          metadata: Object.keys(inv.metadata || {}).length ? stringMap(inv.metadata) : undefined
        }
      };
    }
  }
  return body;
}

/**
 * Who this is, server side. The browser sends only ids; the email is
 * read here and never travels through it.
 *
 * A lead id from the browser is trusted only when it belongs to this
 * visitor (the lead's session, or an event linked to both). Otherwise
 * anyone holding a lead id could open a checkout with that person's
 * email in it. With no lead id, the visitor's own lead is looked up.
 *
 * Both ids are checked against strict patterns above before they reach
 * a query, and are URL encoded as well.
 */
async function findLead(leadHint, visitorId) {
  if (!dbReady || !visitorId) return null;
  const v = encodeURIComponent(visitorId);
  if (leadHint) {
    const l = encodeURIComponent(leadHint);
    const rows = await select('leads', `id=eq.${l}&select=id,email,session_id&limit=1`);
    const lead = rows[0];
    if (lead) {
      if (lead.session_id === visitorId) return lead;
      const linked = await select('funnel_events', `session_id=eq.${v}&lead_id=eq.${l}&select=lead_id&limit=1`);
      if (linked.length) return lead;
    }
  }
  const own = await select('leads', `session_id=eq.${v}&select=id,email&order=created_at.desc&limit=1`);
  if (own[0]) return own[0];
  const ev = await select('funnel_events',
    `session_id=eq.${v}&lead_id=not.is.null&select=lead_id&order=created_at.desc&limit=1`);
  if (!ev[0]?.lead_id || !UUID.test(ev[0].lead_id)) return null;
  const rows = await select('leads', `id=eq.${encodeURIComponent(ev[0].lead_id)}&select=id,email&limit=1`);
  return rows[0] || null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function redirect(res, url) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', url);
  res.status(303);
  return res.end();
}

/* Copy only consent the link actually asks for. "none" is Stripe's
   default and is left out: sending promotions at all, even "none", is
   refused until the account accepts Checkout's promotions terms. */
export function consentOf(c) {
  if (!c) return undefined;
  const out = {};
  if (c.terms_of_service && c.terms_of_service !== 'none') out.terms_of_service = c.terms_of_service;
  if (c.promotions && c.promotions !== 'none') out.promotions = c.promotions;
  return Object.keys(out).length ? out : undefined;
}

export default async function handler(req, res, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  const key = deps.key !== undefined ? deps.key : (process.env.STRIPE_CHECKOUT_CREATE_KEY || '');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }

  const q = req.query || {};
  const from = safeFrom(q.from);
  const parsed = parseLink(q.link);
  // Unreadable link: nowhere on Stripe to send them, so back where they were.
  if (!parsed) return redirect(res, SITE + from);

  let slug = parsed.slug || '';
  const fallback = () => redirect(res, plainUrl(parsed, slug) || SITE + from);

  try {
    if (slug && !ALLOWED.has(slug)) {
      console.warn('checkout: link not on the allowlist', slug);
      return fallback();
    }
    if (!key) return fallback();
    if (req.method === 'HEAD' || BOTS.test(String(req.headers?.['user-agent'] || ''))) return fallback();

    const id = parsed.id || await idForSlug(f, key, slug);
    if (!id) throw new Error(`no active payment link for ${slug}`);
    const { link, items } = await loadLink(f, key, id);
    slug = String(link.url || '').replace(BUY, '').replace(/[/?].*$/, '') || slug;
    if (!ALLOWED.has(slug) || link.active === false) {
      console.warn('checkout: link not on the allowlist or inactive', id);
      return fallback();
    }
    const why = unmirrorable(link);
    if (why) {
      console.warn('checkout: cannot mirror', id, why);
      return fallback();
    }

    const visitorId = VISITOR.test(str(q.v, 120)) ? str(q.v, 120) : '';
    const leadHint = UUID.test(str(q.l, 40)) ? str(q.l, 40).toLowerCase() : '';
    const internal = str(q.i, 4) === '1';

    let lead = null;
    try { lead = await findLead(leadHint, visitorId); }
    catch (e) { console.error('checkout: lead lookup failed', (e && e.message) || e); }

    const metadata = { ntc_from: from, ntc_internal: internal ? 'true' : 'false' };
    if (visitorId) metadata.ntc_visitor_id = visitorId;
    if (lead?.id) metadata.ntc_lead_id = String(lead.id);
    if (parsed.ref) metadata.ntc_ref = parsed.ref;

    const body = sessionBody(link, items, {
      from,
      metadata,
      clientReferenceId: referenceId({
        leadId: lead?.id, visitorId, internal, fallback: parsed.ref
      }),
      customerEmail: lead?.email && EMAIL.test(lead.email) ? String(lead.email).trim().toLowerCase() : undefined
    });

    const session = await stripe(f, key, 'POST', '/checkout/sessions', body);
    // https only. Usually checkout.stripe.com, but a custom checkout
    // domain set in Stripe would change it, so the host is not pinned.
    if (!session?.url || !/^https:\/\/[^/]+\//.test(session.url)) {
      throw new Error('session has no checkout url');
    }
    return redirect(res, session.url);
  } catch (e) {
    console.error('checkout: falling back to the plain link', (e && e.message) || e);
    return fallback();
  }
}
