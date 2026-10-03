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

const calls = [];
let failNext = false;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: String(url), method: opts.method, body, headers: opts.headers });
  if (failNext) { failNext = false; return { ok: false, status: 404, text: async () => 'no function' }; }
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
check('it calls the report function once', made.length === 1 && /\/rest\/v1\/rpc\/owner_funnel_report$/.test(made[0].url));
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
