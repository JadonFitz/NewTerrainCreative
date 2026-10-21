/* Owner dashboard access contract.

   The dashboard reads business figures with the service role, so the
   things worth pinning are the ones that keep it shut: it fails closed,
   it never answers a report without a valid session, and it returns
   aggregates rather than rows. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.OWNER_DASHBOARD_PASSWORD = 'correct horse battery staple';

const REPORT = {
  rows: [{
    funnel: 'ad_sprint', source: 'meta', campaign: 'sprint-la', ad: 'hook-a',
    landing_sessions: 40, vsl_plays: 12, vsl_25: 9, vsl_50: 6, vsl_75: 4, vsl_90: 3,
    cta_sessions: 5, cta_clicks: 7, bookings: 1, leads: 0,
    impressions: null, ad_clicks: null, spend: null
  }],
  coverage: [{ funnel: 'ad_sprint', event_name: 'vsl_play',
               first_seen: '2026-10-02T18:00:00Z', last_seen: '2026-10-03T18:00:00Z' }],
  spend_coverage: { first_day: null, last_day: null }
};

const SYNC = { last_synced_at: '2026-10-03T13:00:04Z', window_from: '2026-09-27',
               window_to: '2026-10-03', rows_written: 14 };

const CALL_ROWS = [
  { id: '3f6c1a2e-0b4d-4c55-9a77-1e2f3a4b5c6d', call_date: '2026-09-14', offer: 'brand_builder',
    taken_by: 'jadon', outcome: 'lost', objection: 'authority', note: 'wife decides', created_at: '2026-09-14T22:00:00Z' }
];

const calls = [];
let failNext = false;
let syncStatusDown = false;
let callLogDown = false;
let deleteFinds = 1;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: String(url), method: opts.method, body, headers: opts.headers });
  if (failNext) { failNext = false; return { ok: false, status: 404, text: async () => 'no function' }; }
  if (/\/rest\/v1\/call_outcomes/.test(String(url))) {
    if (opts.method === 'POST') return { ok: true, status: 201, json: async () => [{ id: 'new', ...body }], text: async () => '' };
    if (opts.method === 'DELETE') return { ok: true, status: 200, json: async () => Array(deleteFinds).fill({}), text: async () => '' };
    if (callLogDown) return { ok: false, status: 404, text: async () => 'relation does not exist' };
    return { ok: true, status: 200, json: async () => CALL_ROWS, text: async () => '' };
  }
  if (/sync_status/.test(String(url))) {
    if (syncStatusDown) return { ok: false, status: 404, text: async () => 'no table' };
    return { ok: true, status: 200, json: async () => [SYNC], text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => REPORT, text: async () => '' };
};

const { default: handler } = await import('../api/owner.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request({ method = 'GET', body, query = {}, cookie, ip = '203.0.113.1' } = {}) {
  const res = response();
  const headers = { 'x-forwarded-for': ip };
  if (cookie) headers.cookie = cookie;
  await handler({ method, body, query, headers }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('\n\x1b[1mOWNER DASHBOARD · SHUT BY DEFAULT\x1b[0m');
let n = calls.length;
let res = await request();
check('no cookie is refused with 401', res.statusCode === 401);
check('a refused request never reaches Supabase', calls.length === n);
check('responses are never cached', res.headers['Cache-Control'] === 'no-store');
check('responses are noindexed', /noindex/.test(res.headers['X-Robots-Tag'] || ''));

res = await request({ cookie: 'ntc_owner=9999999999999.' + 'a'.repeat(64) });
check('a forged signature is refused', res.statusCode === 401 && calls.length === n);

res = await request({ cookie: 'ntc_owner=garbage' });
check('a malformed cookie is refused', res.statusCode === 401 && calls.length === n);

res = await request({ method: 'POST', body: { password: 'wrong' } });
check('a wrong password is refused', res.statusCode === 401 && !res.headers['Set-Cookie']);

res = await request({ method: 'POST', body: {} });
check('a missing password is refused', res.statusCode === 401 && !res.headers['Set-Cookie']);

res = await request({ method: 'DELETE' });
check('other methods are rejected', res.statusCode === 405);

console.log('\n\x1b[1mSIGN IN\x1b[0m');
res = await request({ method: 'POST', body: { password: 'correct horse battery staple' } });
const setCookie = res.headers['Set-Cookie'] || '';
check('the right password signs in', res.statusCode === 200 && res.payload.ok === true);
check('cookie is HttpOnly', /;\s*HttpOnly/.test(setCookie));
check('cookie is Secure', /;\s*Secure/.test(setCookie));
check('cookie is SameSite=Strict', /SameSite=Strict/.test(setCookie));
check('cookie is scoped to the endpoint', /Path=\/api\/owner/.test(setCookie));
check('the password is not in the cookie', !setCookie.includes('correct horse'));
const cookie = setCookie.split(';')[0];

// A sendBeacon-style string body must work the same way.
res = await request({ method: 'POST', body: JSON.stringify({ password: 'correct horse battery staple' }) });
check('a string body signs in too', res.statusCode === 200);

console.log('\n\x1b[1mTHE REPORT\x1b[0m');
n = calls.length;
res = await request({ cookie, query: { from: '2026-09-01', to: '2026-09-30' } });
let made = calls.slice(n);
check('a signed-in request returns the report', res.statusCode === 200 && res.payload.ok === true);
check('it calls the report function once',
  made.filter((c) => /\/rest\/v1\/rpc\/owner_funnel_report$/.test(c.url)).length === 1 && made[0].method === 'POST');
check('it reports when Meta spend was last refreshed', res.payload.spend_sync?.last_synced_at === SYNC.last_synced_at);

syncStatusDown = true;
console.warn = () => {};
res = await request({ cookie, query: { from: '2026-09-01', to: '2026-09-30' } });
check('a missing sync status does not break the report',
  res.statusCode === 200 && res.payload.spend_sync === null && res.payload.rows.length === 1);
syncStatusDown = false;
check('it passes the range through', made[0].body.p_from === '2026-09-01' && made[0].body.p_to === '2026-09-30');
check('it reports in Pacific time', made[0].body.p_tz === 'America/Los_Angeles');
check('it never queries a table directly', !made.some((c) => /\/rest\/v1\/(leads|funnel_events)/.test(c.url)));
check('missing spend stays null, not zero', res.payload.rows[0].spend === null);
check('coverage is passed to the page', res.payload.coverage.length === 1);
check('no key or secret is echoed', !JSON.stringify(res.payload).includes('stub-service-key'));

n = calls.length;
res = await request({ cookie });
made = calls.slice(n);
const span = (Date.parse(made[0].body.p_to) - Date.parse(made[0].body.p_from)) / 86400000;
check('the default range is the last 30 days', res.statusCode === 200 && span === 29, `${span + 1} days`);

for (const [label, query] of [
  ['a malformed date', { from: '2026-9-1', to: '2026-09-30' }],
  ['an impossible date', { from: '2026-02-31', to: '2026-03-30' }],
  ['a reversed range', { from: '2026-09-30', to: '2026-09-01' }],
  ['an injection attempt', { from: "2026-09-01'; drop table leads;--", to: '2026-09-30' }]
]) {
  n = calls.length;
  res = await request({ cookie, query });
  check(`${label} is refused before the database`, res.statusCode === 400 && calls.length === n);
}

failNext = true;
res = await request({ cookie, query: { from: '2026-09-01', to: '2026-09-30' } });
check('a database failure is a 502, with no detail leaked',
  res.statusCode === 502 && res.payload.error === 'report unavailable');

console.log('\n\x1b[1mTHE CALL LOG\x1b[0m');
n = calls.length;
res = await request({ cookie, query: { from: '2026-09-01', to: '2026-09-30' } });
made = calls.slice(n);
const callRead = made.find((c) => /\/rest\/v1\/call_outcomes\?/.test(c.url));
check('the report carries the calls in range', res.statusCode === 200 && res.payload.calls.length === 1);
check('the calls are read for the same range',
  Boolean(callRead) && callRead.url.includes('call_date=gte.2026-09-01') && callRead.url.includes('call_date=lte.2026-09-30'));
check('the call read never asks for leads or contact columns',
  Boolean(callRead) && !/email|phone|name=|leads/.test(callRead.url));

callLogDown = true;
res = await request({ cookie, query: { from: '2026-09-01', to: '2026-09-30' } });
check('a missing call log (0010 not applied) does not break the report',
  res.statusCode === 200 && res.payload.calls === null && res.payload.rows.length === 1);
callLogDown = false;

const goodCall = { action: 'log_call', call_date: '2026-09-15', offer: 'brand_builder',
                   taken_by: 'meghan', outcome: 'lost', objection: 'budget', note: 'liked it, 3k is the ceiling' };

n = calls.length;
res = await request({ method: 'POST', body: goodCall });
check('logging a call without a session is refused', res.statusCode === 401 && calls.length === n);

res = await request({ method: 'POST', body: goodCall, cookie });
made = calls.slice(n);
const write = made.find((c) => c.method === 'POST' && /\/rest\/v1\/call_outcomes$/.test(c.url));
check('a valid call is saved', res.statusCode === 200 && res.payload.ok === true && Boolean(write));
check('only the call fields are written',
  Boolean(write) && Object.keys(write.body).sort().join() === 'call_date,note,objection,offer,outcome,taken_by');

for (const [label, patch, expect] of [
  ['a lost call with no objection', { objection: '' }, /objection/],
  ['a no-show with an objection', { outcome: 'no_show' }, /no-show/],
  ['an unknown outcome', { outcome: 'ghosted' }, /outcome/],
  ['an unknown caller', { taken_by: 'bob' }, /taken_by/],
  ['an unknown offer', { offer: 'logo_design' }, /offer/],
  ['an unknown objection', { objection: 'vibes' }, /objection/],
  ['a malformed date', { call_date: '9/15/26' }, /call_date/],
  ['a date far in the future', { call_date: '2099-01-01' }, /future/],
  ['a note with an email in it', { note: 'reach her at jane@example.com' }, /email/],
  ['a note with a phone number in it', { note: 'call back on 818 555 0100' }, /phone/],
  ['a note over 280 characters', { note: 'x'.repeat(281) }, /280/]
]) {
  n = calls.length;
  res = await request({ method: 'POST', body: { ...goodCall, ...patch }, cookie });
  check(`${label} is refused before the database`,
    res.statusCode === 400 && expect.test(res.payload.error || '') && calls.length === n,
    res.payload.error);
}

res = await request({ method: 'POST', body: { ...goodCall, outcome: 'no_show', objection: null, note: '' }, cookie });
check('a no-show with no objection is fine', res.statusCode === 200);
res = await request({ method: 'POST', body: { ...goodCall, outcome: 'follow_up', objection: 'timing', offer: '' }, cookie });
check('a follow-up may carry an objection and no offer', res.statusCode === 200);
res = await request({ method: 'POST', body: { ...goodCall, note: '$7,500 pilot, 10 episodes, 50 clips' }, cookie });
check('ordinary deal numbers in a note are allowed', res.statusCode === 200, res.payload.error);

n = calls.length;
res = await request({ method: 'POST', body: { action: 'delete_call', id: CALL_ROWS[0].id } });
check('deleting without a session is refused', res.statusCode === 401 && calls.length === n);
res = await request({ method: 'POST', body: { action: 'delete_call', id: "x' or 1=1" }, cookie });
check('a malformed id is refused before the database', res.statusCode === 400 && calls.length === n);
res = await request({ method: 'POST', body: { action: 'delete_call', id: CALL_ROWS[0].id }, cookie });
made = calls.slice(n);
check('a call can be deleted by id',
  res.statusCode === 200 && made.some((c) => c.method === 'DELETE' && c.url.endsWith(`id=eq.${CALL_ROWS[0].id}`)));
deleteFinds = 0;
res = await request({ method: 'POST', body: { action: 'delete_call', id: CALL_ROWS[0].id }, cookie });
check('deleting a call that is gone is a 404', res.statusCode === 404);
deleteFinds = 1;

console.log('\n\x1b[1mSIGN OUT AND THROTTLE\x1b[0m');
res = await request({ method: 'POST', body: { action: 'logout' }, cookie });
check('sign out clears the cookie', /ntc_owner=;/.test(res.headers['Set-Cookie'] || '') && /Max-Age=0/.test(res.headers['Set-Cookie']));

for (let i = 0; i < 5; i++) await request({ method: 'POST', body: { password: `guess-${i}` }, ip: '198.51.100.9' });
res = await request({ method: 'POST', body: { password: 'correct horse battery staple' }, ip: '198.51.100.9' });
check('five wrong guesses lock that address out', res.statusCode === 429 && !res.headers['Set-Cookie']);
res = await request({ method: 'POST', body: { password: 'correct horse battery staple' }, ip: '198.51.100.10' });
check('another address is unaffected', res.statusCode === 200);

console.log('\n\x1b[1mFAILS CLOSED\x1b[0m');
for (const [label, value] of [['unset', ''], ['too short', 'short']]) {
  process.env.OWNER_DASHBOARD_PASSWORD = value;
  const { default: closed } = await import(`../api/owner.js?case=${label.replace(' ', '-')}`);
  n = calls.length;
  const r1 = response();
  await closed({ method: 'GET', query: {}, headers: { cookie } }, r1);
  const r2 = response();
  await closed({ method: 'POST', body: { password: value }, headers: {} }, r2);
  check(`password ${label}: every request is a 503`,
    r1.statusCode === 503 && r2.statusCode === 503 && !r2.headers['Set-Cookie'] && calls.length === n);
}

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the owner dashboard stays shut without a valid session'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
