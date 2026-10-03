/* Meta spend sync contract.

   Reads reporting from Meta and replaces a window of stored figures, on a
   schedule, with nobody watching. So: only the cron may run it, a Meta
   failure must leave the stored figures alone, and the token must never
   end up anywhere it can be read. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.META_ADS_TOKEN = 'stub-ads-token';
process.env.META_AD_ACCOUNT_ID = 'act_1234567890';
process.env.CRON_SECRET = 'c'.repeat(32);

const insight = (over = {}) => ({
  campaign_id: '111', campaign_name: 'sprint-la-oct', adset_id: '222', adset_name: 'LA owners',
  ad_id: '333', ad_name: 'hook-a', impressions: '1200', inline_link_clicks: '34',
  spend: '56.78', date_start: '2026-10-01', date_stop: '2026-10-01', ...over
});

const calls = [];
let alreadySynced = true;
let metaStatus = 200;
let failAccount = null;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url, method: opts.method || 'GET', body, headers: opts.headers || {} });

  if (/graph\.facebook\.com/.test(url)) {
    if (metaStatus !== 200 || (failAccount && url.includes(`act_${failAccount}/`))) {
      return { ok: false, status: metaStatus, text: async () => '{"error":{"message":"token expired"}}' };
    }
    if (/after=PAGE2/.test(url)) {
      return { ok: true, status: 200, json: async () => ({ data: [insight({ ad_id: '444', ad_name: 'hook-b' })] }) };
    }
    return { ok: true, status: 200, json: async () => ({
      data: [insight(), insight({ ad_id: '', ad_name: 'no id' }),
             // Meta repeating an ad and day must fold into one row, not two.
             insight({ ad_name: 'hook-a renamed', spend: '1.22', impressions: '100', inline_link_clicks: '1' })],
      // Meta's next link stays on the account that was asked.
      paging: { next: `https://graph.facebook.com/v21.0/${url.match(/act_\d+/)[0]}/insights?after=PAGE2&access_token=stub-ads-token` }
    }) };
  }
  if (/rpc\/meta_sync_replace/.test(url)) {
    return { ok: true, status: 200, json: async () => ({ deleted: 2, inserted: body.p_rows.length }), text: async () => '' };
  }
  if (/campaign_daily_metrics\?/.test(url)) {
    return { ok: true, status: 200, json: async () => (alreadySynced ? [{ metric_date: '2026-10-01' }] : []), text: async () => '' };
  }
  return { ok: false, status: 500, text: async () => 'unexpected' };
};

const logged = [];
for (const k of ['log', 'warn', 'error']) {
  const real = console[k];
  console[k] = (...a) => (String(a[0]).startsWith('meta-sync') ? logged.push(a.join(' ')) : real(...a));
}

const { default: handler } = await import('../api/meta-sync.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request({ method = 'GET', auth = `Bearer ${process.env.CRON_SECRET}`, query = {} } = {}) {
  const res = response();
  await handler({ method, query, headers: auth ? { authorization: auth } : {} }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const meta = (l) => l.filter((c) => /graph\.facebook\.com/.test(c.url));
const replace = (l) => l.filter((c) => /rpc\/meta_sync_replace/.test(c.url));
const spanDays = (b) => (Date.parse(b.p_to) - Date.parse(b.p_from)) / 86400000 + 1;

console.info('\n\x1b[1mMETA SPEND SYNC · ONLY THE CRON MAY RUN IT\x1b[0m');
let n = calls.length;
let res = await request({ auth: null });
check('no secret is refused', res.statusCode === 401 && calls.length === n);
res = await request({ auth: 'Bearer wrong' });
check('a wrong secret is refused', res.statusCode === 401 && calls.length === n);
res = await request({ auth: process.env.CRON_SECRET });
check('the bare secret without Bearer is refused', res.statusCode === 401 && calls.length === n);
res = await request({ method: 'POST' });
check('POST is rejected', res.statusCode === 405 && calls.length === n);

console.info('\n\x1b[1mA NORMAL RUN\x1b[0m');
n = calls.length;
res = await request();
let made = calls.slice(n);
const sent = replace(made)[0]?.body;
check('it succeeds', res.statusCode === 200 && res.payload.ok === true);
check('the result names the account', res.payload.accounts.length === 1
  && res.payload.accounts[0].account === 'act_1234567890' && res.payload.accounts[0].ok === true);
check('the replace is scoped to that account', sent.p_account === 'act_1234567890');
check('the first-run check is scoped to that account',
  made.some((c) => /campaign_daily_metrics\?.*ad_account_id=eq\.act_1234567890/.test(c.url)));
check('it asks the right ad account', /\/act_1234567890\/insights\?/.test(meta(made)[0].url));
check('per ad, per day', /level=ad/.test(meta(made)[0].url) && /time_increment=1/.test(meta(made)[0].url));
check('the token rides in a header, not the URL',
  meta(made)[0].headers.Authorization === 'Bearer stub-ads-token' && !/stub-ads-token/.test(meta(made)[0].url));
check('it follows paging to the end', meta(made).length === 2);
check('it replaces the window once, atomically', replace(made).length === 1);
check('a routine run covers the trailing 7 days', spanDays(sent) === 7, `${spanDays(sent)} days`);
check('rows with no ad id are dropped', sent.p_rows.length === 2 && sent.p_rows.every((r) => r.ad_id));

const row = sent.p_rows[0];
check('names carry through for the UTM join', row.campaign === 'sprint-la-oct' && row.ad === 'hook-a');
check('ids are stored beside the names',
  row.campaign_id === '111' && row.adset_id === '222' && row.ad_id === '333' && row.adset_name === 'LA owners');
check('one row per ad per day, repeats folded in',
  sent.p_rows.filter((r) => r.ad_id === '333' && r.metric_date === '2026-10-01').length === 1);
check('figures are numbers', Math.abs(row.spend - 58) < 1e-9 && row.impressions === 1300);
check('clicks are link clicks', row.clicks === 35);
const okLine = logged.find((l) => /"status":"ok"/.test(l)) || '';
check('one log line carries the window and the outcome',
  /^meta-sync \{/.test(okLine) && /"since":"\d{4}-\d\d-\d\d"/.test(okLine) && /"meta":200/.test(okLine)
  && /"inserted":2/.test(okLine) && /"account":"act_1234567890"/.test(okLine));
check('the day is Meta\'s day', row.metric_date === '2026-10-01');
check('the token is never logged or returned',
  !logged.join(' ').includes('stub-ads-token') && !JSON.stringify(res.payload).includes('stub-ads-token'));

console.info('\n\x1b[1mTHE WINDOW\x1b[0m');
alreadySynced = false;
n = calls.length;
res = await request();
check('the first ever run backfills 90 days', spanDays(replace(calls.slice(n))[0].body) === 90);
alreadySynced = true;

n = calls.length;
res = await request({ query: { days: '30' } });
check('?days=30 is honoured', spanDays(replace(calls.slice(n))[0].body) === 30);
n = calls.length;
res = await request({ query: { days: '5000' } });
check('?days is capped at 90', spanDays(replace(calls.slice(n))[0].body) === 90);
n = calls.length;
res = await request({ query: { days: 'all; drop table' } });
check('a junk ?days falls back to the routine window', spanDays(replace(calls.slice(n))[0].body) === 7);

console.info('\n\x1b[1mA META FAILURE LEAVES STORED FIGURES ALONE\x1b[0m');
metaStatus = 400;
n = calls.length;
res = await request();
made = calls.slice(n);
check('it reports failure', res.statusCode === 502 && res.payload.ok === false);
check('and replaces nothing', replace(made).length === 0);
check('without leaking Meta\'s error to the caller',
  res.payload.accounts[0].error === 'sync failed' && !JSON.stringify(res.payload).includes('token expired'));
const errLine = logged.filter((l) => /"status":"error"/.test(l)).pop() || '';
check('the log line names the stage and Meta\'s status',
  /"stage":"meta"/.test(errLine) && /"meta":400/.test(errLine) && /"since":/.test(errLine));
metaStatus = 200;

console.info('\n\x1b[1mMORE THAN ONE AD ACCOUNT\x1b[0m');
{
  process.env.META_AD_ACCOUNT_IDS = 'act_1234567890, 9876543210';
  process.env.META_ADS_TOKEN_9876543210 = 'stub-second-token';
  const { default: multi } = await import('../api/meta-sync.js?case=multi');
  const run = async () => {
    const r = response();
    await multi({ method: 'GET', query: {}, headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }, r);
    return r;
  };

  n = calls.length;
  let r = await run();
  made = calls.slice(n);
  const reps = replace(made);
  check('each account is synced', r.statusCode === 200 && r.payload.accounts.length === 2);
  check('each replace names its own account',
    reps.length === 2 && reps[0].body.p_account === 'act_1234567890' && reps[1].body.p_account === 'act_9876543210');
  const second = meta(made).find((c) => c.url.includes('act_9876543210/'));
  const first = meta(made).find((c) => c.url.includes('act_1234567890/'));
  check('an account with its own token is read with it', second?.headers.Authorization === 'Bearer stub-second-token');
  check('the others use the shared token', first?.headers.Authorization === 'Bearer stub-ads-token');

  failAccount = '1234567890';
  n = calls.length;
  r = await run();
  made = calls.slice(n);
  check('one account failing is reported', r.statusCode === 502 && r.payload.ok === false
    && r.payload.accounts[0].ok === false);
  check('and does not stop the other account', r.payload.accounts[1].ok === true
    && replace(made).length === 1 && replace(made)[0].body.p_account === 'act_9876543210');
  failAccount = null;

  delete process.env.META_AD_ACCOUNT_IDS;
  delete process.env.META_ADS_TOKEN_9876543210;
}

console.info('\n\x1b[1mFAILS CLOSED\x1b[0m');
const cases = [
  ['no cron secret', { CRON_SECRET: '' }, 503],
  ['no ads token', { META_ADS_TOKEN: '' }, 503],
  ['a malformed account id', { META_AD_ACCOUNT_ID: 'my account' }, 503],
  ['one bad id in a list', { META_AD_ACCOUNT_IDS: '1234567890,oops' }, 503]
];
for (const [label, env, want] of cases) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  const { default: h } = await import(`../api/meta-sync.js?case=${encodeURIComponent(label)}`);
  n = calls.length;
  const r = response();
  await h({ method: 'GET', query: {}, headers: { authorization: `Bearer ${saved.CRON_SECRET || process.env.CRON_SECRET}` } }, r);
  check(`${label}: ${want}, and nothing is called`, r.statusCode === want && calls.length === n, String(r.statusCode));
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
}

console.info(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · spend is read by the cron alone and replaced whole or not at all'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
