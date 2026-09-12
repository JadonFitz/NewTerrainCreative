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
check('sends one notification', hit(made, 'sendgrid.com').length === 1);
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

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · paid-retainer event semantics and capture integrity hold'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
