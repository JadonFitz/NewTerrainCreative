/* First-party event ingestion contract. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: String(url), method: opts.method, body });
  return { ok: true, status: 201, json: async () => [], text: async () => '' };
};

const { default: handler } = await import('../api/track.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(method, body) {
  const res = response();
  await handler({ method, body }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('\n\x1b[1mFIRST-PARTY EVENT INGESTION\x1b[0m');
let n = calls.length;
let res = await request('POST', {
  event_id: 'view-1', event_name: 'view_content', session_id: 'session-1',
  page_url: 'https://www.newterraincreative.com/grow', funnel: 'paid_retainer',
  metadata: {
    utm_source: 'meta', utm_campaign: 'dentist-la', offer: 'paid_retainer',
    email: 'must-not-store@example.com', api_secret: 'must-not-store'
  }
});
let made = calls.slice(n);
const row = made[0]?.body;
check('accepted event reports stored', res.statusCode === 200 && res.payload.stored === true);
check('writes one event', made.length === 1);
check('stores the validated funnel', row?.funnel === 'paid_retainer');
check('keeps measurement metadata', row?.metadata?.utm_campaign === 'dentist-la');
check('removes contact and secret metadata', !row?.metadata?.email && !row?.metadata?.api_secret);

n = calls.length;
res = await request('POST', {
  event_id: 'bad-funnel', event_name: 'cta_click', funnel: 'made_up',
  metadata: { position: 'hero' }
});
made = calls.slice(n);
check('unknown funnel cannot be stored', made[0]?.body?.funnel === undefined);
check('known event still records without a funnel', res.payload.stored === true);

n = calls.length;
res = await request('POST', { event_name: 'anything_i_want' });
check('unknown event is ignored', res.payload.ignored === 'unknown event' && calls.length === n);

res = await request('GET');
check('GET is rejected', res.statusCode === 405);

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · first-party ingestion remains bounded and PII-free'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
