/* End-to-end exercise of POST /api/apply.
   Step one must stay anonymous and side-effect free; step two must insert
   exactly one lead, notify us, and fire one SubmitApplication conversion. */

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
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method, body });

  if (u.includes('supabase.co')) {
    if (failSupabase) return { ok: false, status: 500, text: async () => 'simulated database outage' };
    const row = { id: `row-${++insertedId}`, ...(Array.isArray(body) ? body[0] : body) };
    return { ok: true, status: 201, json: async () => [row], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) {
    return failEmail
      ? { ok: false, status: 500, text: async () => 'simulated email outage' }
      : { ok: true, status: 202, text: async () => '' };
  }
  if (u.includes('facebook.com')) {
    return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { default: handler } = await import('../api/apply.js');

function mockRes() {
  const r = { statusCode: 0, payload: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

const post = async (body) => {
  const res = mockRes();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.9' } }, res);
  return res;
};

const since = (n) => calls.slice(n);
const hit = (list, frag) => list.filter((c) => c.url.includes(frag));
const inserts = (list, frag) => hit(list, frag).filter((c) => c.method === 'POST');
const patches = (list, frag) => hit(list, frag).filter((c) => c.method === 'PATCH');

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const STEP_ONE = {
  step: 1,
  name: 'Test Applicant', email: 'applicant@example.invalid', phone: '1555010100',
  role: 'Owner', authority: 'I decide',
  business: 'Example Test Dental', website: 'example.invalid',
  industry: 'Dental practice', sell: 'Implants and cosmetic dentistry.',
  spend: '$1,500-5,000/mo', who_runs: 'Agency/freelancer',
  budget: 'Yes', infra: 'Partial', la: 'Yes',
  service_area: 'Sherman Oaks, Studio City', budget_90d: '$10,000 to $25,000',
  capacity: 'About 25', goal: 'Stop relying on one referral source.',
  session_id: 'sess-1', utm_campaign: 'ad-01'
};

const STEP_TWO = {
  step: 2,
  customer_value: 'About $4,000 over two years',
  lead_sources: 'Referrals, then Google.',
  lead_owner: 'Front desk or reception', lead_response: 'Same day',
  continuation_capacity: 'Yes', production_window: 'Weekday mornings',
  fit_rationale: 'We have capacity and nothing running.',
  terms_acknowledged: 'yes', data_agreement: 'yes', publicity_optin: true,
  event_id: 'evt-complete'
};

console.log('\n\x1b[1mSTEP ONE · fit only, no lead capture\x1b[0m');
let n = calls.length;
let res = await post(STEP_ONE);
let made = since(n);
check('200 and qualified', res.statusCode === 200 && res.payload.qualified === true);
check('no row, email or Meta call', made.length === 0, `${made.length} outbound calls`);
check('no handoff id or token', !res.payload.lead_id && !res.payload.token);

console.log('\n\x1b[1mSTEP TWO · one complete lead and one conversion\x1b[0m');
n = calls.length;
res = await post({ ...STEP_ONE, ...STEP_TWO });
made = since(n);
check('200 and qualified', res.statusCode === 200 && res.payload.qualified === true);
check('returns a booking url', Boolean(res.payload.bookingUrl));
check('reports both capture paths', res.payload.captured?.stored && res.payload.captured?.notified);
const leadInserts = inserts(made, '/leads');
const leadRow = leadInserts[0]?.body;
check('inserts exactly one lead', leadInserts.length === 1, `${leadInserts.length} inserts`);
check('never patches a browser-supplied row id', patches(made, '/leads').length === 0);
check("status is 'qualified'", leadRow?.status === 'qualified', leadRow?.status);
check('all lifecycle timestamps are set', Boolean(leadRow?.prequalified_at && leadRow?.submitted_at && leadRow?.terms_acknowledged_at));
check('data agreement is timestamped', Boolean(leadRow?.data_agreement_at));
check('all step-one fields persist on completion',
  ['website', 'role', 'authority', 'industry', 'service_area', 'budget_90d'].every((k) => leadRow?.[k]));
check('measurement fields persist',
  ['customer_value', 'lead_sources', 'lead_owner', 'lead_response'].every((k) => leadRow?.[k]));
check('publicity opt-in is separate', leadRow?.publicity_optin === true);
const funnelEvent = inserts(made, '/funnel_events')[0]?.body;
check('stores submit_application internally', funnelEvent?.event_name === 'submit_application', funnelEvent?.event_name);
check('links prior anonymous session events after submission', patches(made, '/funnel_events').length === 1);
check('sends one notification email', hit(made, 'sendgrid.com').length === 1);
const capi = hit(made, 'facebook.com')[0]?.body?.data?.[0];
check('fires SubmitApplication, not Lead', capi?.event_name === 'SubmitApplication', capi?.event_name);
check('offer + form_type are on the event',
  capi?.custom_data?.offer === 'founding_three' && capi?.custom_data?.form_type === 'founding_application');
check('content_category is the industry', capi?.custom_data?.content_category === 'Dental practice');
check('event_id is shared with the browser', capi?.event_id === 'evt-complete', capi?.event_id);
check('email is hashed and never plaintext',
  /^[a-f0-9]{64}$/.test(capi?.user_data?.em?.[0] || '') && JSON.stringify(capi).indexOf('applicant@example.invalid') === -1);

console.log('\n\x1b[1mUNTRUSTED HANDOFF FIELDS · ignored\x1b[0m');
n = calls.length;
res = await post({ ...STEP_ONE, ...STEP_TWO, event_id: 'evt-forged', lead_id: 'someone-elses-row', token: 'forged' });
made = since(n);
check('still inserts exactly one new lead', inserts(made, '/leads').length === 1);
check('cannot patch an existing lead', patches(made, '/leads').length === 0);

console.log('\n\x1b[1mDECLINES · no personal data retained\x1b[0m');
n = calls.length;
res = await post({ ...STEP_ONE, budget: 'No' });
check('budget decline returns a reason', res.payload.qualified === false && Boolean(res.payload.reason));
check('budget decline causes no outbound calls', since(n).length === 0);
n = calls.length;
res = await post({ ...STEP_ONE, la: 'No' });
check('geography decline returns a reason', res.payload.qualified === false && Boolean(res.payload.reason));
check('geography decline causes no outbound calls', since(n).length === 0);

console.log('\n\x1b[1mVALIDATION\x1b[0m');
res = await post({ ...STEP_ONE, industry: undefined });
check('step one rejects a missing industry', res.statusCode === 400 && res.payload.missing?.includes('industry'));
res = await post({ ...STEP_ONE, ...STEP_TWO, data_agreement: undefined });
check('step two rejects a missing data agreement', res.statusCode === 400 && res.payload.missing?.includes('data_agreement'));
res = await post({ ...STEP_ONE, ...STEP_TWO, terms_acknowledged: undefined });
check('step two rejects unacknowledged terms', res.statusCode === 400 && res.payload.missing?.includes('terms_acknowledged'));
res = await post({ ...STEP_ONE, ...STEP_TWO, email: 'not-an-email' });
check('step two rejects a malformed email', res.statusCode === 400);
n = calls.length;
res = await post({ ...STEP_ONE, company_website_confirm: 'bot' });
check('honeypot makes no outbound calls', since(n).length === 0);
n = calls.length;
res = await post({ ...STEP_ONE, ...STEP_TWO, event_id: 'evt-other', industry: 'Bakery' });
check("an off-list industry normalises to 'Other'",
  inserts(since(n), '/leads')[0]?.body?.industry === 'Other',
  inserts(since(n), '/leads')[0]?.body?.industry);

console.log('\n\x1b[1mCAPTURE FALLBACKS\x1b[0m');
failSupabase = true;
n = calls.length;
res = await post({ ...STEP_ONE, ...STEP_TWO, event_id: 'evt-db-down' });
made = since(n);
check('database outage still succeeds when email captures the lead', res.statusCode === 200 && res.payload.qualified === true);
check('response reports the fallback honestly', res.payload.captured?.stored === false && res.payload.captured?.notified === true);
check('Meta fires only after the email capture succeeds', hit(made, 'facebook.com').length === 1);

failEmail = true;
n = calls.length;
res = await post({ ...STEP_ONE, ...STEP_TWO, event_id: 'evt-all-down' });
made = since(n);
check('total capture failure returns a retryable error', res.statusCode === 503 && Boolean(res.payload.error));
check('total capture failure does not fire Meta', hit(made, 'facebook.com').length === 0);
failSupabase = false;
failEmail = false;

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · every path behaved'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
