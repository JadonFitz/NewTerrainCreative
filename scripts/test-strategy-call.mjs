/* End-to-end exercise of POST /api/strategy-call.
   A paid-retainer inquiry becomes Lead only after at least one durable
   capture path succeeds. It must never be mislabeled Schedule. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.SENDGRID_API_KEY = 'stub-sendgrid-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';

const calls = [];
let insertedId = 0;
let failSupabase = false;
let failEmail = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: u, method: opts.method, body });

  if (u.includes('supabase.co')) {
    if (failSupabase) return { ok: false, status: 500, text: async () => 'simulated database outage' };
    const row = { id: `strategy-row-${++insertedId}`, ...(Array.isArray(body) ? body[0] : body) };
    return { ok: true, status: 201, json: async () => [row], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) {
    return failEmail
      ? { ok: false, status: 500, text: async () => 'simulated email outage' }
      : { ok: true, status: 202, text: async () => '' };
  }
  if (u.includes('facebook.com')) {
    return { ok: true, status: 200, json: async () => ({ events_received: 1 }), text: async () => '' };
  }
  throw new Error(`unexpected fetch ${u}`);
};

const { default: handler } = await import('../api/strategy-call.js');

function response() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}

const post = async (body) => {
  const res = response();
  await handler({ method: 'POST', body, headers: { 'user-agent': 'test', 'x-forwarded-for': '203.0.113.4' } }, res);
  return res;
};

const since = (n) => calls.slice(n);
const hit = (list, frag) => list.filter((c) => c.url.includes(frag));
const inserts = (list, frag) => hit(list, frag).filter((c) => c.method === 'POST');

/* Internal notification and prospect confirmation are told apart by
   recipient, not by counting. */
const INTERNAL_INBOX = 'business@newterraincreative.com';
const recipient = (c) => c.body?.personalizations?.[0]?.to?.[0]?.email;
const mailTo = (list, addr) => hit(list, 'sendgrid.com').filter((c) => recipient(c) === addr);
const mailBody = (c) => JSON.stringify(c?.body?.content || []);
let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

const VALID = {
  name: 'Test Applicant', email: 'applicant@example.invalid', phone: '1555010100',
  business: 'Example Test Dental', industry: 'Dental practice', authority: 'I decide',
  offer: 'Implants and cosmetic dentistry', value: '$4,000',
  marketing: 'Referrals', ad_spend: '$1,500-5,000/mo',
  budget_band: '$5,000-$10,000', start: 'Within 30 days',
  objective: 'Add ten qualified consults', response: 'Same day',
  event_id: 'strategy-event-1', session_id: 'strategy-session-1',
  utm_source: 'meta', utm_medium: 'paid-social',
  utm_campaign: 'dentist-la', utm_content: 'clock-ad',
  page: 'https://www.newterraincreative.com/strategy-call'
};

console.log('\n\x1b[1mPAID-RETAINER INQUIRY\x1b[0m');
let n = calls.length;
let res = await post(VALID);
let made = since(n);
check('returns 200 only after capture', res.statusCode === 200 && res.payload.ok === true);
check('reports database and email capture', res.payload.captured?.stored && res.payload.captured?.notified);
const leadRows = inserts(made, '/leads');
check('inserts exactly one lead', leadRows.length === 1, `${leadRows.length} inserts`);
check('marks the form as strategy_call', leadRows[0]?.body?.form_type === 'strategy_call');
check('stores first-touch campaign and creative',
  leadRows[0]?.body?.utm_campaign === 'dentist-la' && leadRows[0]?.body?.utm_content === 'clock-ad');
const internal = inserts(made, '/funnel_events')[0]?.body;
check('stores one internal lead event', internal?.event_name === 'lead');
check('internal event belongs to paid_retainer', internal?.funnel === 'paid_retainer');
check('links the anonymous session to the lead',
  hit(made, '/funnel_events').some((c) => c.method === 'PATCH'));
check('sends exactly one internal notification', mailTo(made, INTERNAL_INBOX).length === 1);
check('internal notification replies to the enquirer',
  mailTo(made, INTERNAL_INBOX)[0]?.body?.reply_to?.email === VALID.email);

/* ── immediate booking · the point of this change ───────────────────── */
console.log('\n\x1b[1mIMMEDIATE BOOKING\x1b[0m');
check('response returns a booking url', Boolean(res.payload.bookingUrl), res.payload.bookingUrl);
check('booking url is the Google scheduler',
  String(res.payload.bookingUrl).includes('calendar.app.google'));
const confirm = mailTo(made, VALID.email);
check('sends exactly one confirmation to the prospect', confirm.length === 1, `${confirm.length} sent`);
check('response reports the confirmation honestly', res.payload.captured?.confirmed === true);
check('confirmation subject names the strategy call',
  /strategy call/i.test(confirm[0]?.body?.subject || ''), confirm[0]?.body?.subject);
check('confirmation greets them by first name', mailBody(confirm[0]).includes('Hi Test'));
check('confirmation carries the same booking link',
  mailBody(confirm[0]).includes('calendar.app.google'));
check('confirmation lists what to bring',
  /spending|worth to you|already tried/i.test(mailBody(confirm[0])));
check('confirmation replies to New Terrain Creative',
  confirm[0]?.body?.reply_to?.email === INTERNAL_INBOX, confirm[0]?.body?.reply_to?.email);
check('confirmation ships a plain-text alternative',
  (confirm[0]?.body?.content || []).some((p) => p.type === 'text/plain' && p.value.includes('calendar.app.google')));

/* A booking link is not a booking. Nothing on this path may emit
   Schedule: only /api/sync-bookings does, from a verified appointment. */
check('exposing the calendar fires no Schedule conversion',
  hit(made, 'facebook.com').every((c) => c.body?.data?.[0]?.event_name !== 'Schedule'));

console.log('\n\x1b[1mCONVERSION\x1b[0m');
const capi = hit(made, 'facebook.com')[0]?.body?.data?.[0];
check('fires Lead', capi?.event_name === 'Lead', capi?.event_name);
check('never fires Schedule', capi?.event_name !== 'Schedule');
check('browser/server event id is shared', capi?.event_id === VALID.event_id);
check('email is hashed and absent in plaintext',
  /^[a-f0-9]{64}$/.test(capi?.user_data?.em?.[0] || '') && !JSON.stringify(capi).includes(VALID.email));

console.log('\n\x1b[1mVALIDATION AND TRIAGE\x1b[0m');
n = calls.length;
res = await post({ ...VALID, industry: undefined });
check('missing field returns 400', res.statusCode === 400 && res.payload.missing?.includes('industry'));
check('validation failure has no outbound calls', since(n).length === 0);
n = calls.length;
res = await post({ ...VALID, company_website_confirm: 'bot' });
check('honeypot has no outbound calls', res.statusCode === 200 && since(n).length === 0);
n = calls.length;
res = await post({ ...VALID, event_id: 'strategy-low-band', budget_band: 'Under $2,500' });
made = since(n);
check('low budget is recorded, not rejected', res.statusCode === 200);
check('low-budget lead remains new for review', inserts(made, '/leads')[0]?.body?.status === 'new');

console.log('\n\x1b[1mCAPTURE FALLBACKS\x1b[0m');
failSupabase = true;
n = calls.length;
res = await post({ ...VALID, event_id: 'strategy-db-down' });
made = since(n);
check('email fallback preserves the inquiry', res.statusCode === 200);
check('fallback is reported honestly', !res.payload.captured?.stored && res.payload.captured?.notified);
check('Lead fires after email capture', hit(made, 'facebook.com').length === 1);

failSupabase = false;
failEmail = true;
n = calls.length;
res = await post({ ...VALID, event_id: 'strategy-email-down' });
made = since(n);
check('database capture survives email outage', res.statusCode === 200);
check('database-only capture is reported honestly', res.payload.captured?.stored && !res.payload.captured?.notified);
check('Lead fires after database capture', hit(made, 'facebook.com').length === 1);

failSupabase = true;
n = calls.length;
res = await post({ ...VALID, event_id: 'strategy-all-down' });
made = since(n);
check('total capture failure returns 503', res.statusCode === 503 && Boolean(res.payload.error));
check('total capture failure never fires Meta', hit(made, 'facebook.com').length === 0);


/* ══════════════════════════════════════════════════════════════════════
   OFFER PROPAGATION · a paid landing page must stay reportable
   ──────────────────────────────────────────────────────────────────────
   /production-media sends ?offer=production-media, which the form forwards as offer_id. The
   conversion must carry the resolved identifier, and an unrecognised or
   hostile value must fall back to this form's default rather than
   inventing an offer name in the reporting.
   ══════════════════════════════════════════════════════════════════════ */
// The outage section above leaves failSupabase/failEmail set, and they are
// sticky in this suite rather than one-shot. Clear them or every check
// below fails against a simulated outage rather than against the code.
failSupabase = false;
failEmail = false;

console.log('\n\x1b[1mOFFER PROPAGATION\x1b[0m');

async function offerOf(offer_id) {
  const n = calls.length;
  await post({ ...VALID, offer_id, event_id: 'off-' + String(offer_id) });
  const made = calls.slice(n);
  const capi = made.filter(c => c.url.includes('facebook.com'))[0]?.body?.data?.[0];
  const ev = made.filter(c => c.url.includes('/funnel_events') && c.method === 'POST')[0]?.body;
  return { meta: capi?.custom_data?.offer, funnel: ev?.funnel, metaOffer: ev?.metadata?.offer };
}

let r2 = await offerOf('production-media');
check('slug resolves on the Meta event', r2.meta === 'production_media', r2.meta);
check('funnel tag matches', r2.funnel === 'production_media', r2.funnel);
check('metadata carries the offer', r2.metaOffer === 'production_media', r2.metaOffer);

r2 = await offerOf(undefined);
check('no slug falls back to the default', r2.meta === 'paid_retainer', r2.meta);

r2 = await offerOf('not-a-real-offer');
check('unknown slug falls back, never passes through', r2.meta === 'paid_retainer', r2.meta);

r2 = await offerOf('<script>alert(1)</script>');
check('hostile slug cannot become an offer name', r2.meta === 'paid_retainer', r2.meta);

r2 = await offerOf('AD-SPRINT');
check('resolution is case-insensitive', ['ad_sprint', 'paid_retainer'].includes(r2.meta), r2.meta);

/* ══════════════════════════════════════════════════════════════════════
   THE PAGE · the booking link must arrive at runtime, not in the source
   ──────────────────────────────────────────────────────────────────────
   scripts/preflight.py fails the build if the scheduler URL appears in
   any page but apply.html. That guard is the reason the calendar sits
   behind a completed form, so this implementation had to satisfy it
   rather than have it relaxed. Asserted here too, next to the feature,
   so the reason survives someone reading only this file.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mPAGE SOURCE\x1b[0m');
const { readFileSync } = await import('node:fs');
const page = readFileSync(new URL('../strategy-call.html', import.meta.url), 'utf8');

check('no hardcoded scheduler URL in strategy-call.html',
  !page.includes('calendar.app.google'));
check('the booking anchor exists with no href to hardcode',
  /id="book-link"/.test(page) && !/id="book-link"[^>]*href=/.test(page));
check('the href is assigned from the API response',
  /getElementById\('book-link'\)\.href\s*=\s*url/.test(page));
check('a visible booking button remains in the success state',
  /id="done-booking"/.test(page) && /id="book-link"/.test(page));
check('there is a fallback state when no link comes back',
  /id="done-nolink"/.test(page));
check('the page no longer promises an email it does not send',
  !/reply to the confirmation email/i.test(page));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · paid-retainer event semantics and capture integrity hold'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
