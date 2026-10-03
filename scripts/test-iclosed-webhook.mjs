/* Booking webhook contract.

   One confirmed iClosed booking must produce one Meta Schedule and one
   first-party `schedule` row, both keyed on the booking id, and the
   first-party row must carry nothing about the person. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';
process.env.ICLOSED_WEBHOOK_SECRET = 'k'.repeat(40);

const calls = [];
let supabaseStatus = 201;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: String(url), method: opts.method, body });
  if (/supabase/.test(String(url))) {
    return { ok: supabaseStatus < 300, status: supabaseStatus, json: async () => [], text: async () => 'stub' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

// The handler logs payload shapes and outcomes. Keep the test output readable.
console.log = ((log) => (...a) => (String(a[0]).startsWith('iclosed-webhook') ? undefined : log(...a)))(console.log);
console.warn = () => {};
console.error = () => {};

const { default: handler } = await import('../api/iclosed-webhook.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(body, key = process.env.ICLOSED_WEBHOOK_SECRET) {
  const res = response();
  await handler({ method: 'POST', body, query: { key }, headers: {} }, res);
  return res;
}

// The shape of the first real delivery, 22 Sep 2026.
const booking = (over = {}) => ({
  hookType: 'CALL_BOOKED',
  event: { callPreviewId: 'call_apxC1su7DBFw', uuid: 2661131 },
  event_type: { name: 'Ad Sprint Call' },
  invitee: { email: 'person@example.com', firstName: 'Ada', lastName: 'Lovelace',
             text_reminder_number: '+13105550100' },
  contact: { email: 'person@example.com', phoneNumber: '+13105550100' },
  tracking: { utm_source: 'meta', utm_campaign: 'sprint-la', utm_content: 'hook-a' },
  ...over
});

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const supa = (list) => list.filter((c) => /supabase/.test(c.url));
const meta = (list) => list.filter((c) => /graph\.facebook\.com/.test(c.url));

console.info('\n\x1b[1mBOOKING WEBHOOK · FIRST-PARTY COPY\x1b[0m');
let n = calls.length;
let res = await request(booking());
let made = calls.slice(n);
const row = supa(made)[0]?.body;
check('a booking answers 200', res.statusCode === 200 && res.payload.ok === true);
check('it writes one funnel_events row', supa(made).length === 1 && /\/rest\/v1\/funnel_events$/.test(supa(made)[0].url));
check('the row is a schedule event', row?.event_name === 'schedule');
check('keyed on the booking id, not the internal uuid', row?.event_id === 'call_apxC1su7DBFw');
check('filed under the offer', row?.funnel === 'ad_sprint' && row?.metadata?.offer === 'ad_sprint');
check('carries the campaign', row?.metadata?.utm_campaign === 'sprint-la' && row?.metadata?.utm_content === 'hook-a');
check('reports stored', res.payload.stored === true);

const flat = JSON.stringify(row || {});
check('holds no contact details',
  !/person@example\.com|Ada|Lovelace|3105550100/.test(flat) && row?.lead_id === undefined);

check('Meta still gets its Schedule', meta(made).length === 1 && meta(made)[0].body.data[0].event_name === 'Schedule');
check('Meta and the row share the booking id', meta(made)[0]?.body.data[0].event_id === row?.event_id);

n = calls.length;
res = await request(booking({ tracking: undefined, event_type: { name: 'Growth Strategy Call' } }));
made = calls.slice(n);
check('a booking with no campaign still stores', supa(made)[0]?.body?.event_name === 'schedule'
  && supa(made)[0].body.metadata.utm_campaign === undefined);
check('and lands on its own offer', supa(made)[0]?.body?.funnel === 'paid_retainer');

console.info('\n\x1b[1mWHAT MUST NOT STORE\x1b[0m');
n = calls.length;
res = await request(booking(), 'wrong-key');
check('a bad key is refused and writes nothing', res.statusCode === 401 && calls.length === n);

n = calls.length;
res = await request(booking({ hookType: 'CALL_CANCELLED' }));
check('a cancellation writes nothing', res.statusCode === 200 && calls.length === n);

n = calls.length;
res = await request(booking({ hookType: 'CALL_RESCHEDULED' }));
check('a reschedule writes nothing', res.statusCode === 200 && calls.length === n);

n = calls.length;
res = await request({ hookType: 'CALL_BOOKED', event: {}, invitee: { email: 'person@example.com' } });
check('a booking with no id writes nothing', res.payload.sent === false && calls.length === n);

console.info('\n\x1b[1mFAILURE ISOLATION\x1b[0m');
supabaseStatus = 409;
n = calls.length;
res = await request(booking());
made = calls.slice(n);
check('a redelivered booking is a harmless duplicate', res.statusCode === 200 && res.payload.stored === true);
check('and Meta still dedupes on the same id', meta(made)[0]?.body.data[0].event_id === 'call_apxC1su7DBFw');

supabaseStatus = 500;
n = calls.length;
res = await request(booking());
made = calls.slice(n);
check('a database failure still answers 200', res.statusCode === 200 && res.payload.stored === false);
check('and does not cost the Meta conversion', meta(made).length === 1 && res.payload.sent === true);

// The public endpoint must still refuse the name this handler now writes.
const trackSource = await (await import('node:fs/promises')).readFile(
  new URL('../api/track.js', import.meta.url), 'utf8');
check('/api/track still reserves schedule', /RESERVED = new Set\(\['schedule'\]\)/.test(trackSource));

console.info(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · one booking, one conversion, one anonymous row'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
