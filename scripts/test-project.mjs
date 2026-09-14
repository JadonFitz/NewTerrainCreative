/* Signature Work project enquiry · runs the real handler, stubs only fetch. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.SENDGRID_API_KEY = 'stub-sendgrid-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';

const calls = [];
let failInsert = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method, body });
  if (u.includes('supabase.co')) {
    if (failInsert) { failInsert = false; return { ok: false, status: 500, text: async () => 'outage' }; }
    return { ok: true, status: 201, json: async () => [{ id: 'proj-row-1', ...body }], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) return { ok: true, status: 202, text: async () => '' };
  if (u.includes('facebook.com')) return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { default: handler } = await import('../api/project.js');
const res = () => { const r = { statusCode: 0, payload: null, headers: {} };
  r.status = c => (r.statusCode = c, r); r.json = p => (r.payload = p, r);
  r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const post = async body => { const r = res();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.5' } }, r); return r; };
const since = n => calls.slice(n);
const hit = (l, f) => l.filter(c => c.url.includes(f));
const inserts = (l, f) => hit(l, f).filter(c => c.method === 'POST');

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const VALID = {
  name: 'Dana Reyes', email: 'dana@ntc-test.invalid', phone: '3105550143',
  business: 'Alder Law', website: 'alderlaw.com',
  project_type: 'Documentary or brand film',
  project_scope: 'A 12 minute film about the firm for the site and paid social.',
  start: 'Within a couple of months',
  budget_band: '$25,000 to $50,000',
  authority: 'I do',
  event_id: 'pj-evt-1', session_id: 'pj-sess-1', utm_campaign: 'sig-01'
};

console.log('\n\x1b[1mPROJECT ENQUIRY · captured\x1b[0m');
let n = calls.length;
let r = await post(VALID);
let made = since(n);
check('200 ok', r.statusCode === 200 && r.payload.ok === true);
check('reports both capture paths', r.payload.captured?.stored && r.payload.captured?.notified);
const row = inserts(made, '/leads')[0]?.body;
check("form_type is 'project_enquiry'", row?.form_type === 'project_enquiry', row?.form_type);
check('NOT strategy_call or founding', !['strategy_call', 'founding_application'].includes(row?.form_type));
check('project fields persist', Boolean(row?.project_type && row?.project_scope));
check('timeline reuses desired_start', row?.desired_start === VALID.start);
check('budget reuses budget_band', row?.budget_band === VALID.budget_band);
check('authority persists', row?.authority === 'I do');
check('attribution persists', row?.utm_campaign === 'sig-01');
check('clean enquiry stored as qualified', row?.status === 'qualified', row?.status);

console.log('\n\x1b[1mEVENTS\x1b[0m');
const fe = inserts(made, '/funnel_events')[0]?.body;
check("funnel event is 'lead'", fe?.event_name === 'lead', fe?.event_name);
check("funnel tag is 'signature_work'", fe?.funnel === 'signature_work', fe?.funnel);
check('event carries project_type', fe?.metadata?.project_type === VALID.project_type);
const capi = hit(made, 'facebook.com')[0]?.body?.data?.[0];
check('fires Meta Lead', capi?.event_name === 'Lead', capi?.event_name);
check('NOT SubmitApplication', capi?.event_name !== 'SubmitApplication');
check('NOT Schedule', capi?.event_name !== 'Schedule');
check("offer is 'signature_work'", capi?.custom_data?.offer === 'signature_work');
check("form_type is 'project_enquiry'", capi?.custom_data?.form_type === 'project_enquiry');
check('content_category is the project type', capi?.custom_data?.content_category === VALID.project_type);
check('event_id shared with the browser', capi?.event_id === 'pj-evt-1');
check('email hashed, never plaintext',
  /^[a-f0-9]{64}$/.test(capi?.user_data?.em?.[0] || '') &&
  !JSON.stringify(capi).includes('dana@ntc-test.invalid'));

console.log('\n\x1b[1mTRIAGE · flags, never rejects\x1b[0m');
n = calls.length;
r = await post({ ...VALID, budget_band: 'Under $10,000', start: 'Just exploring', authority: 'Gathering information' });
check('still accepted', r.statusCode === 200 && r.payload.ok === true);
const flagged = inserts(since(n), '/leads')[0]?.body;
check("stored as 'new', not declined", flagged?.status === 'new', flagged?.status);
check('reasons recorded for the call', Boolean(flagged?.decline_reason));
check('still fires Lead', hit(since(n), 'facebook.com').length === 1);

console.log('\n\x1b[1mVALIDATION\x1b[0m');
for (const f of ['business', 'project_type', 'project_scope', 'start', 'budget_band', 'authority']) {
  r = await post({ ...VALID, [f]: undefined });
  check(`missing ${f} rejected`, r.statusCode === 400 && r.payload.missing?.includes(f));
}
r = await post({ ...VALID, email: 'nope' });
check('malformed email rejected', r.statusCode === 400);
n = calls.length;
r = await post({ ...VALID, company_website_confirm: 'bot' });
check('honeypot makes no outbound calls', since(n).length === 0);
r = await (async () => { const x = res(); await handler({ method: 'GET' }, x); return x; })();
check('GET rejected', r.statusCode === 405);

console.log('\n\x1b[1mDATABASE OUTAGE\x1b[0m');
failInsert = true;
n = calls.length;
r = await post(VALID);
check('still returns ok', r.payload.ok === true);
check('reports stored:false honestly', r.payload.captured?.stored === false);
check('still emails, enquiry not lost', hit(since(n), 'sendgrid.com').length === 1);

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the third funnel stays separate from the other two'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
