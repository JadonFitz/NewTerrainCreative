/* ══════════════════════════════════════════════════════════════════════
   End-to-end exercise of POST /api/apply
   ──────────────────────────────────────────────────────────────────────
       node scripts/test-apply.mjs

   Runs the REAL handler. Nothing in api/apply.js is mocked or
   reimplemented. Supabase, SendGrid and Meta are all reached through
   global fetch, so stubbing that one function is enough to observe every
   outbound call while the handler's own logic runs untouched.

   This proves the code path. It does NOT prove the database accepts the
   rows: only running migration 0002 and submitting for real does that.
   ══════════════════════════════════════════════════════════════════════ */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.SENDGRID_API_KEY = 'stub-sendgrid-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';
process.env.APPLY_STEP_SECRET = 'a'.repeat(64);   // >=32 bytes, test only

const calls = [];
let insertedId = 0;
let failNextInsert = false;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method, body });

  if (u.includes('supabase.co')) {
    if (failNextInsert) {
      failNextInsert = false;
      return { ok: false, status: 500, text: async () => 'simulated outage' };
    }
    const row = { id: `row-${++insertedId}`, ...(Array.isArray(body) ? body[0] : body) };
    return { ok: true, status: 201, json: async () => [row], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) return { ok: true, status: 202, text: async () => '' };
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
// linkSessionToLead PATCHes funnel_events to attach the anonymous journey,
// so "did we write an event" and "did we link a session" both touch that
// path. Filter by method or the two get confused for each other.
const inserts = (list, frag) => hit(list, frag).filter((c) => c.method === 'POST');
const patches = (list, frag) => hit(list, frag).filter((c) => c.method === 'PATCH');

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const QUALIFIED_STEP_ONE = {
  step: 1,
  name: 'Dana Reyes', email: 'dana@acmedental.com', phone: '3105550143',
  role: 'Owner', authority: 'I decide',
  business: 'Acme Dental', website: 'acmedental.com',
  industry: 'Dental practice',
  sell: 'Implants and cosmetic dentistry.',
  spend: '$1,500-5,000/mo', who_runs: 'Agency/freelancer',
  budget: 'Yes', infra: 'Partial',
  la: 'Yes', service_area: 'Sherman Oaks, Studio City',
  budget_90d: '$10,000 to $25,000',
  capacity: 'About 25', goal: 'Stop relying on one referral source.',
  event_id: 'evt-1', session_id: 'sess-1', utm_campaign: 'ad-01'
};

const STEP_TWO_EXTRA = {
  step: 2,
  customer_value: 'About $4,000 over two years',
  lead_sources: 'Referrals, then Google.',
  lead_owner: 'Front desk or reception',
  lead_response: 'Same day',
  continuation_capacity: 'Yes',
  production_window: 'Weekday mornings',
  fit_rationale: 'We have capacity and nothing running.',
  terms_acknowledged: 'yes',
  data_agreement: 'yes',
  publicity_optin: true,
  event_id: 'evt-2'
};

console.log('\n\x1b[1mSTEP ONE · qualified\x1b[0m');
let n = calls.length;
let res = await post(QUALIFIED_STEP_ONE);
let made = since(n);
check('200 and qualified', res.statusCode === 200 && res.payload.qualified === true);
check('issues a signed handoff token', typeof res.payload.token === 'string' && res.payload.token.length === 64);
check('reports the row was stored', res.payload.stored === true);
const leadRow = hit(made, '/leads')[0]?.body;
check("status is 'prequalified', not qualified", leadRow?.status === 'prequalified', leadRow?.status);
check('prequalified_at is set', Boolean(leadRow?.prequalified_at));
check('submitted_at is NOT set', !leadRow?.submitted_at);
check('every new step-one field persisted',
  ['website', 'role', 'authority', 'industry', 'service_area', 'budget_90d']
    .every((k) => leadRow?.[k]),
  ['website', 'role', 'authority', 'industry', 'service_area', 'budget_90d']
    .filter((k) => !leadRow?.[k]).join(',') || 'all present');
const fe1 = inserts(made, '/funnel_events')[0]?.body;
check("funnel event is initial_fit_completed", fe1?.event_name === 'initial_fit_completed', fe1?.event_name);
check('funnel event carries industry', fe1?.metadata?.industry === 'Dental practice');
check('\x1b[1mNOTHING sent to Meta\x1b[0m', hit(made, 'facebook.com').length === 0,
  `${hit(made, 'facebook.com').length} calls`);
check('an email went out anyway', hit(made, 'sendgrid.com').length === 1);

console.log('\n\x1b[1mSTEP TWO · the conversion\x1b[0m');
const token = res.payload.token, leadId = res.payload.lead_id;
n = calls.length;
res = await post({ ...QUALIFIED_STEP_ONE, ...STEP_TWO_EXTRA, lead_id: leadId, token });
made = since(n);
check('200 and qualified', res.statusCode === 200 && res.payload.qualified === true);
check('returns a booking url', Boolean(res.payload.bookingUrl));
const patch = made.find((c) => c.method === 'PATCH' && c.url.includes('/leads'))?.body;
check('PATCHES step one\'s row, no second lead', Boolean(patch) && inserts(made, '/leads').length === 0);
check("status becomes 'qualified'", patch?.status === 'qualified', patch?.status);
check('submitted_at and terms_acknowledged_at set', Boolean(patch?.submitted_at && patch?.terms_acknowledged_at));
check('data_agreement_at timestamped', Boolean(patch?.data_agreement_at));
check('measurement fields persisted',
  ['customer_value', 'lead_sources', 'lead_owner', 'lead_response'].every((k) => patch?.[k]));
check('publicity opt-in captured separately', patch?.publicity_optin === true);
const capi = hit(made, 'facebook.com')[0]?.body?.data?.[0];
check('fires SubmitApplication', capi?.event_name === 'SubmitApplication', capi?.event_name);
check('NOT Lead', capi?.event_name !== 'Lead');
check('offer + form_type on the event',
  capi?.custom_data?.offer === 'founding_three' && capi?.custom_data?.form_type === 'founding_application');
check('content_category is the industry', capi?.custom_data?.content_category === 'Dental practice');
check('event_id shared with the browser', capi?.event_id === 'evt-2', capi?.event_id);
check('email is hashed, never plaintext',
  /^[a-f0-9]{64}$/.test(capi?.user_data?.em?.[0] || '') && JSON.stringify(capi).indexOf('dana@acmedental.com') === -1);

console.log('\n\x1b[1mSTEP TWO · forged token\x1b[0m');
n = calls.length;
res = await post({ ...QUALIFIED_STEP_ONE, ...STEP_TWO_EXTRA, lead_id: 'row-1', token: 'f'.repeat(64) });
made = since(n);
check('refuses to PATCH the named row', patches(made, '/leads').length === 0);
check('inserts its own row instead', inserts(made, '/leads').length === 1);
check('applicant still succeeds', res.payload.qualified === true);

console.log('\n\x1b[1mSTEP ONE · declined on budget\x1b[0m');
n = calls.length;
res = await post({ ...QUALIFIED_STEP_ONE, budget: 'No' });
made = since(n);
check('returns qualified:false with a reason', res.payload.qualified === false && Boolean(res.payload.reason));
check("stored as 'declined'", inserts(made, '/leads')[0]?.body?.status === 'declined');
check('no funnel event written', inserts(made, '/funnel_events').length === 0);
check('nothing sent to Meta', hit(made, 'facebook.com').length === 0);
check('still emailed', hit(made, 'sendgrid.com').length === 1);

console.log('\n\x1b[1mSTEP ONE · declined on geography\x1b[0m');
n = calls.length;
res = await post({ ...QUALIFIED_STEP_ONE, la: 'No' });
check('declined', res.payload.qualified === false);
check('nothing sent to Meta', hit(since(n), 'facebook.com').length === 0);

console.log('\n\x1b[1mVALIDATION\x1b[0m');
res = await post({ ...QUALIFIED_STEP_ONE, industry: undefined });
check('step one rejects a missing industry', res.statusCode === 400 && res.payload.missing?.includes('industry'));
res = await post({ ...QUALIFIED_STEP_ONE, ...STEP_TWO_EXTRA, data_agreement: undefined });
check('step two rejects a missing data agreement',
  res.statusCode === 400 && res.payload.missing?.includes('data_agreement'));
res = await post({ ...QUALIFIED_STEP_ONE, ...STEP_TWO_EXTRA, terms_acknowledged: undefined });
check('step two rejects unacknowledged terms',
  res.statusCode === 400 && res.payload.missing?.includes('terms_acknowledged'));
res = await post({ ...QUALIFIED_STEP_ONE, email: 'not-an-email' });
check('rejects a malformed email', res.statusCode === 400);
n = calls.length;
res = await post({ ...QUALIFIED_STEP_ONE, company_website_confirm: 'bot' });
check('honeypot makes no outbound calls at all', since(n).length === 0);
res = await post({ ...QUALIFIED_STEP_ONE, industry: 'Bakery' });
check("an off-list industry normalises to 'Other'",
  inserts(calls, '/leads').pop()?.body?.industry === 'Other',
  inserts(calls, '/leads').pop()?.body?.industry);

console.log('\n\x1b[1mDATABASE OUTAGE · the applicant must survive it\x1b[0m');
failNextInsert = true;
n = calls.length;
res = await post(QUALIFIED_STEP_ONE);
made = since(n);
check('still returns qualified', res.payload.qualified === true);
check('reports stored:false honestly', res.payload.stored === false);
check('issues NO token when there is no row', !res.payload.token);
check('still emails, so the lead is not lost', hit(made, 'sendgrid.com').length === 1);

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · every path behaved'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
