/* ══════════════════════════════════════════════════════════════════════
   /api/checkout · a tracked checkout that never loses a sale
   ──────────────────────────────────────────────────────────────────────
   Stripe and Supabase are faked; nothing leaves this machine. What these
   checks defend: only the site's own links are accepted, the session is
   the Payment Link's twin (prices, mode, metadata, success URL), the back
   link stays on this site, the reference id says who it was, the email
   comes only from the server's own lookup, and every failure lands on the
   plain link.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';

const mod = await import('../api/checkout.js');
const { default: handler, ALLOWED, resetCache, safeFrom, referenceId } = mod;

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const res = () => { const r = { statusCode: 0, payload: null, headers: {}, ended: false };
  r.status = c => (r.statusCode = c, r); r.json = p => (r.payload = p, r);
  r.setHeader = (k, v) => { r.headers[k] = v; }; r.end = () => { r.ended = true; return r; };
  return r; };

const EIGHT = '4gM5kCcmGgpVgMMaRK1RC0f';
const EIGHT_MONTHLY = '7sY3cueuO3D9cww2le1RC0J';
const LEAD = '11111111-2222-4333-8444-555555555555';
const OTHER_LEAD = '99999999-2222-4333-8444-555555555555';
const VISITOR = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const LINKS = {
  plink_eight0001: {
    id: 'plink_eight0001', object: 'payment_link', active: true, url: `https://buy.stripe.com/${EIGHT}`,
    metadata: { offer_key: 'ad_sprint', plan: 'the-eight' },
    after_completion: { type: 'redirect', redirect: { url: 'https://www.newterraincreative.com/welcome?plan=sprint&session_id={CHECKOUT_SESSION_ID}' } },
    phone_number_collection: { enabled: true }, allow_promotion_codes: true,
    billing_address_collection: 'auto', customer_creation: 'always', submit_type: 'auto',
    custom_fields: [], shipping_address_collection: null
  },
  plink_monthly01: {
    id: 'plink_monthly01', object: 'payment_link', active: true, url: `https://buy.stripe.com/${EIGHT_MONTHLY}`,
    metadata: { offer_key: 'ad_sprint', billing: 'monthly', addons: '' },
    subscription_data: { metadata: { offer_key: 'ad_sprint' }, trial_period_days: null },
    after_completion: { type: 'redirect', redirect: { url: 'https://www.newterraincreative.com/welcome?plan=sprint-monthly&session_id={CHECKOUT_SESSION_ID}' } },
    phone_number_collection: { enabled: true }, allow_promotion_codes: false, custom_fields: []
  }
};
const ITEMS = {
  plink_eight0001: [{ price: { id: 'price_eight', type: 'one_time' }, quantity: 1 }],
  plink_monthly01: [{ price: { id: 'price_eight_m', type: 'recurring', recurring: { interval: 'month' } }, quantity: 1 }]
};

let leads = [];   // rows the fake Supabase holds
let events = [];  // funnel_events rows
let stripeDown = false;
let calls = [];

function reply(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, method: init.method || 'GET', body: init.body });
  if (url.startsWith('https://stub.supabase.co/rest/v1/')) {
    const u = new URL(url);
    const table = u.pathname.split('/').pop();
    const eq = (k) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
    if (table === 'leads') {
      if (u.searchParams.get('id')) return reply(leads.filter(r => r.id === eq('id')));
      return reply(leads.filter(r => r.session_id === eq('session_id')));
    }
    if (table === 'funnel_events') {
      let rows = events.filter(r => r.session_id === eq('session_id'));
      if ((u.searchParams.get('lead_id') || '').startsWith('eq.')) rows = rows.filter(r => r.lead_id === eq('lead_id'));
      else rows = rows.filter(r => r.lead_id);
      return reply(rows);
    }
    return reply([]);
  }
  if (url.startsWith('https://api.stripe.com/v1/')) {
    if (stripeDown) return reply({ error: { message: 'down' } }, 500);
    const path = url.slice('https://api.stripe.com/v1'.length);
    if (path.startsWith('/payment_links?')) return reply({ data: Object.values(LINKS), has_more: false });
    const m = path.match(/^\/payment_links\/([^/?]+)(\/line_items)?/);
    if (m) {
      if (!LINKS[m[1]]) return reply({ error: { message: 'No such payment link' } }, 404);
      return m[2] ? reply({ data: ITEMS[m[1]] }) : reply(LINKS[m[1]]);
    }
    if (path === '/checkout/sessions' && init.method === 'POST') {
      return reply({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    }
  }
  return reply({ error: 'unexpected' }, 500);
};

async function go(query, { key = 'rk_test_stub', ua = 'Mozilla/5.0' } = {}) {
  calls = [];
  const r = res();
  await handler({ method: 'GET', query, headers: { 'user-agent': ua } }, r, { key });
  const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/checkout/sessions'));
  return { r, body: post ? new URLSearchParams(post.body) : null, calls };
}

const plain = (slug, ref) => `https://buy.stripe.com/${slug}${ref ? `?client_reference_id=${ref}` : ''}`;

// ── allowlist ─────────────────────────────────────────────────────────
console.log('\n\x1b[1mALLOWLIST\x1b[0m');
{
  const site = [
    readFileSync(new URL('../assets/offer.js', import.meta.url), 'utf8'),
    readFileSync(new URL('../next-step.html', import.meta.url), 'utf8'),
    readFileSync(new URL('../call-booked.html', import.meta.url), 'utf8')
  ].join('\n');
  const onSite = new Set([...site.matchAll(/https:\/\/buy\.stripe\.com\/([A-Za-z0-9]+)/g)].map(m => m[1]));
  check('every link on the site is allowed', [...onSite].every(s => ALLOWED.has(s)),
    [...onSite].filter(s => !ALLOWED.has(s)).join(', '));
  check('every allowed link is on the site', [...ALLOWED].every(s => onSite.has(s)),
    [...ALLOWED].filter(s => !onSite.has(s)).join(', '));
  check('the trial link is allowed', ALLOWED.has('00w28qgCW1v1gMM6Bu1RC0q'));
  check('seven links: six Sprints and the trial', ALLOWED.size === 7);

  resetCache();
  let { r, calls: c } = await go({ link: 'https://buy.stripe.com/zzzzzzzzzzzzzzzzzzzzzz', from: '/next-step' });
  check('an unknown link is not mirrored', r.statusCode === 303 && !c.some(x => x.url.includes('api.stripe.com')));
  check('an unknown link goes to its plain link', r.headers.Location === plain('zzzzzzzzzzzzzzzzzzzzzz'));

  ({ r } = await go({ link: 'https://evil.example.com/pay', from: '/next-step' }));
  check('a non-Stripe link never becomes a redirect', r.headers.Location === 'https://www.newterraincreative.com/next-step');

  ({ r } = await go({ link: 'https://buy.stripe.com.evil.com/' + EIGHT, from: '/next-step' }));
  check('a look-alike host is refused', r.headers.Location === 'https://www.newterraincreative.com/next-step');
}

// ── the mirror ────────────────────────────────────────────────────────
console.log('\n\x1b[1mMIRROR OF THE PAYMENT LINK\x1b[0m');
{
  resetCache();
  const { r, body } = await go({
    link: `https://buy.stripe.com/${EIGHT}?client_reference_id=next-step_growth`,
    from: '/next-step?from=growth', v: VISITOR
  });
  check('303 to the session', r.statusCode === 303 && r.headers.Location === 'https://checkout.stripe.com/c/pay/cs_test_1');
  check('not cached by the browser', r.headers['Cache-Control'] === 'no-store');
  check('same price and quantity', body.get('line_items[0][price]') === 'price_eight' && body.get('line_items[0][quantity]') === '1');
  check('one-time link is payment mode', body.get('mode') === 'payment');
  check('offer metadata copied', body.get('metadata[offer_key]') === 'ad_sprint' && body.get('metadata[plan]') === 'the-eight');
  check('success URL is the link\'s own redirect',
    body.get('success_url') === 'https://www.newterraincreative.com/welcome?plan=sprint&session_id={CHECKOUT_SESSION_ID}');
  check('phone collected', body.get('phone_number_collection[enabled]') === 'true');
  check('promotion codes as the link allows', body.get('allow_promotion_codes') === 'true');
  check('customer creation copied', body.get('customer_creation') === 'always');
  check('recovery on', body.get('after_expiration[recovery][enabled]') === 'true');
  check('ntc metadata added', body.get('metadata[ntc_visitor_id]') === VISITOR &&
    body.get('metadata[ntc_from]') === '/next-step?from=growth' && body.get('metadata[ntc_internal]') === 'false');
  check('the old page tag survives as ntc_ref', body.get('metadata[ntc_ref]') === 'next-step_growth');
  check('no subscription data on a one-time checkout', ![...body.keys()].some(k => k.startsWith('subscription_data')));

  const second = await go({ link: EIGHT, from: '/next-step', v: VISITOR });
  check('payment link lookups are cached', !second.calls.some(x => x.url.includes('/payment_links')));

  const m = await go({ link: `https://buy.stripe.com/${EIGHT_MONTHLY}`, from: '/next-step', v: VISITOR });
  check('recurring price is subscription mode', m.body.get('mode') === 'subscription');
  check('subscription metadata carries the offer', m.body.get('subscription_data[metadata][offer_key]') === 'ad_sprint' &&
    m.body.get('subscription_data[metadata][billing]') === 'monthly');
  check('subscription metadata carries the visitor', m.body.get('subscription_data[metadata][ntc_visitor_id]') === VISITOR);
  check('empty metadata values are not sent', m.body.get('metadata[addons]') === null);
  check('no promotion codes when the link has none', m.body.get('allow_promotion_codes') === null);
  check('no customer_creation in subscription mode', m.body.get('customer_creation') === null);

  const byId = await go({ link: 'plink_eight0001', from: '/next-step' });
  check('a plink id on the allowlist works', byId.r.headers.Location?.startsWith('https://checkout.stripe.com/'));

  LINKS.plink_eight0001.custom_fields = [{ key: 'company' }];
  resetCache();
  const odd = await go({ link: EIGHT, from: '/next-step' });
  check('a link with features we do not copy goes plain', odd.r.headers.Location === plain(EIGHT) && !odd.body);
  LINKS.plink_eight0001.custom_fields = [];
  resetCache();
}

// ── back link ─────────────────────────────────────────────────────────
console.log('\n\x1b[1mBACK LINK STAYS ON THIS SITE\x1b[0m');
{
  check('a page path is kept', safeFrom('/call-booked?offer=pest-control-trial') === '/call-booked?offer=pest-control-trial');
  check('no from means /next-step', safeFrom(undefined) === '/next-step');
  check('another origin is refused', safeFrom('https://evil.example.com/x') === '/next-step');
  check('a protocol-relative path is refused', safeFrom('//evil.example.com/x') === '/next-step');
  check('a backslash trick is refused', safeFrom('/\\evil.example.com') === '/next-step');
  check('the API is not a back link', safeFrom('/api/checkout?link=x') === '/next-step');
  const { body } = await go({ link: EIGHT, from: '//evil.example.com', v: VISITOR });
  check('cancel_url is on this site', body.get('cancel_url') === 'https://www.newterraincreative.com/next-step');
  const t = await go({ link: EIGHT, from: '/call-booked?offer=pest-control-trial' });
  check('cancel_url returns to the page', t.body.get('cancel_url') === 'https://www.newterraincreative.com/call-booked?offer=pest-control-trial');
}

// ── who it was ────────────────────────────────────────────────────────
console.log('\n\x1b[1mCLIENT REFERENCE ID AND EMAIL\x1b[0m');
{
  check('lead format', referenceId({ leadId: LEAD, visitorId: VISITOR }) === `lead_${LEAD}`);
  check('visitor format', referenceId({ visitorId: VISITOR }) === `visitor_${VISITOR}`);
  check('internal beats lead', referenceId({ leadId: LEAD, visitorId: VISITOR, internal: true }) === `internal_${VISITOR}`);
  check('nothing known keeps the old tag', referenceId({ fallback: 'next-step_other' }) === 'next-step_other');
  check('nothing at all sends none', referenceId({}) === undefined);
  const long = referenceId({ visitorId: 'x'.repeat(400) });
  check('within 200 characters, letters digits - and _', long.length === 200 && /^[A-Za-z0-9_-]+$/.test(long));

  leads = []; events = [];
  let { body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR });
  check('anonymous visitor: visitor_<id>', body.get('client_reference_id') === `visitor_${VISITOR}`);
  check('anonymous visitor: no email', body.get('customer_email') === null);

  leads = [{ id: LEAD, email: 'Owner@Example.com', session_id: VISITOR }];
  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('a visitor who filled a form: lead_<id>', body.get('client_reference_id') === `lead_${LEAD}`);
  check('their email from the server lookup', body.get('customer_email') === 'owner@example.com');
  check('ntc_lead_id set', body.get('metadata[ntc_lead_id]') === LEAD);

  leads = [{ id: LEAD, email: 'owner@example.com', session_id: 'someone-else-session' }];
  events = [{ session_id: VISITOR, lead_id: LEAD }];
  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('a lead linked through funnel_events is found', body.get('client_reference_id') === `lead_${LEAD}` &&
    body.get('customer_email') === 'owner@example.com');

  leads = [{ id: OTHER_LEAD, email: 'stranger@example.com', session_id: 'not-this-visitor' }];
  events = [];
  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR, l: OTHER_LEAD }));
  check('a lead id that is not this visitor\'s is ignored', body.get('client_reference_id') === `visitor_${VISITOR}`);
  check('and their email is never filled in', body.get('customer_email') === null);

  leads = [{ id: LEAD, email: 'owner@example.com', session_id: VISITOR }];
  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR, l: LEAD }));
  check('a lead id that is this visitor\'s is used', body.get('client_reference_id') === `lead_${LEAD}`);

  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR, email: 'spoof@example.com', customer_email: 'spoof@example.com' }));
  check('an email in the query is never used', body.get('customer_email') === 'owner@example.com');

  leads = [];
  ({ body } = await go({ link: EIGHT, from: '/next-step', v: VISITOR, i: '1' }));
  check('internal browser: internal_<id>', body.get('client_reference_id') === `internal_${VISITOR}`);
  check('internal browser: ntc_internal true', body.get('metadata[ntc_internal]') === 'true');

  ({ body } = await go({ link: EIGHT, from: '/next-step', v: 'bad id with spaces' }));
  check('a malformed visitor id is dropped', body.get('client_reference_id') === null && body.get('metadata[ntc_visitor_id]') === null);
}

// ── never lose a sale ─────────────────────────────────────────────────
console.log('\n\x1b[1mFALLBACK TO THE PLAIN LINK\x1b[0m');
{
  resetCache();
  let { r, calls: c } = await go({ link: `https://buy.stripe.com/${EIGHT}?client_reference_id=next-step_growth`, from: '/next-step' }, { key: '' });
  check('no key: the plain link, as before', r.statusCode === 303 && r.headers.Location === plain(EIGHT, 'next-step_growth'));
  check('no key: Stripe is not called', !c.some(x => x.url.includes('api.stripe.com')));

  stripeDown = true;
  ({ r } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('Stripe failing: the plain link', r.statusCode === 303 && r.headers.Location === plain(EIGHT));
  stripeDown = false;

  resetCache();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/checkout/sessions')) return reply({ error: { message: 'Invalid price' } }, 400);
    return realFetch(url, init);
  };
  ({ r } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('session refused: the plain link', r.headers.Location === plain(EIGHT));
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith('/checkout/sessions')) throw new Error('network');
    return realFetch(url, init);
  };
  ({ r } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('network error: the plain link', r.headers.Location === plain(EIGHT));
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('stub.supabase.co')) return reply({ message: 'down' }, 500);
    return realFetch(url, init);
  };
  ({ r } = await go({ link: EIGHT, from: '/next-step', v: VISITOR }));
  check('database down: still a tracked checkout', r.headers.Location === 'https://checkout.stripe.com/c/pay/cs_test_1');
  globalThis.fetch = realFetch;

  ({ r } = await go({ link: EIGHT, from: '/next-step' }, { ua: 'Googlebot/2.1' }));
  check('a crawler gets the plain link and opens no session', r.headers.Location === plain(EIGHT));

  const post = res();
  await handler({ method: 'POST', query: {}, headers: {} }, post, { key: 'rk_test_stub' });
  check('POST is refused', post.statusCode === 405);
}

// ── the browser side ──────────────────────────────────────────────────
console.log('\n\x1b[1mBUY BUTTONS GO THROUGH THE ENDPOINT\x1b[0m');
{
  const store = new Map([['ntc_sid', VISITOR]]);
  let clickHandler = null;
  const attrs = { href: `https://buy.stripe.com/${EIGHT}?client_reference_id=next-step_growth` };
  const a = {
    getAttribute: k => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = String(v); },
    hasAttribute: k => k in attrs
  };
  a.closest = () => a;
  globalThis.window = {
    location: { pathname: '/next-step', search: '?from=growth' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }
  };
  globalThis.document = {
    readyState: 'complete',
    querySelectorAll: () => [a],
    addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; }
  };
  await import(`../assets/checkout.js?test=${Date.now()}`);
  let u = new URL(attrs.href, 'https://www.newterraincreative.com');
  check('link rewritten on load', u.pathname === '/api/checkout');
  check('carries the original link and its tag', u.searchParams.get('link') === `https://buy.stripe.com/${EIGHT}?client_reference_id=next-step_growth`);
  check('carries the page it came from', u.searchParams.get('from') === '/next-step?from=growth');
  check('carries the visitor id', u.searchParams.get('v') === VISITOR);
  check('not internal by default', u.searchParams.get('i') === null);
  check('no email or name in the link', !/email|name|@/.test(attrs.href.replace(/link=[^&]*/, '')));
  check('crawlers told not to follow', /nofollow/.test(attrs.rel || ''));

  store.set('ntc_internal', '1');
  clickHandler({ target: a });
  u = new URL(attrs.href, 'https://www.newterraincreative.com');
  check('a click after marking internal sends i=1', u.searchParams.get('i') === '1');
  check('a second rewrite does not wrap itself', u.searchParams.get('link').startsWith('https://buy.stripe.com/'));
}

// ── owner sign-in marks the browser ───────────────────────────────────
{
  const owner = readFileSync(new URL('../owner.html', import.meta.url), 'utf8');
  check('/owner sign-in sets ntc_internal', /localStorage\.setItem\('ntc_internal', '1'\)/.test(owner));
  for (const page of ['next-step.html', 'call-booked.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const t = html.indexOf('/assets/track.js'), c = html.indexOf('/assets/checkout.js');
    check(`${page} loads checkout.js after track.js`, t > 0 && c > t);
  }
}

// ── consent: "none" is never sent (Stripe refuses promotions until its terms are accepted) ──
{
  const c = mod.consentOf;
  check('consent none/none is left out', c({ terms_of_service: 'none', promotions: 'none' }) === undefined);
  check('consent missing is left out', c(null) === undefined);
  check('consent required terms kept', JSON.stringify(c({ terms_of_service: 'required', promotions: 'none' })) === '{"terms_of_service":"required"}');
  check('consent auto promotions kept', JSON.stringify(c({ promotions: 'auto' })) === '{"promotions":"auto"}');
}

// ── payment_method_collection only on subscriptions ──
{
  const link = { after_completion: { type: 'redirect', redirect: { url: 'https://www.newterraincreative.com/welcome?plan=x' } }, payment_method_collection: 'always', metadata: {} };
  const extra = { from: '/next-step', metadata: {} };
  const one = mod.sessionBody(link, [{ price: { id: 'price_1', type: 'one_time' }, quantity: 1 }], extra);
  check('one-time: no payment_method_collection', !('payment_method_collection' in one) || one.payment_method_collection === undefined);
  const sub = mod.sessionBody({ ...link, payment_method_collection: 'if_required' }, [{ price: { id: 'price_2', type: 'recurring', recurring: { interval: 'month' } }, quantity: 1 }], extra);
  check('subscription: if_required kept', sub.payment_method_collection === 'if_required');
  const subDefault = mod.sessionBody(link, [{ price: { id: 'price_2', type: 'recurring', recurring: { interval: 'month' } }, quantity: 1 }], extra);
  check('subscription: always (default) not sent', subDefault.payment_method_collection === undefined);
}

console.log(failures ? `\n\x1b[31m${failures} failed\x1b[0m\n` : '\n\x1b[32mall checks passed\x1b[0m\n');
process.exit(failures ? 1 : 0);
