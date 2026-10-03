/* ══════════════════════════════════════════════════════════════════════
   GET /api/meta-sync  ·  ad spend, read from Meta once a day
   ──────────────────────────────────────────────────────────────────────
   The other direction from api/_meta.js. That file SENDS conversions to
   Meta with META_CAPI_TOKEN. This one READS impressions, link clicks and
   spend back with META_ADS_TOKEN, per ad per day, and stores them in
   campaign_daily_metrics, which is where the owner dashboard gets spend.

   The two tokens are deliberately separate. The Conversions API token
   cannot read reporting, and the reporting token needs only ads_read, so
   neither can do the other's job if it leaks.

   WHEN IT RUNS
   Vercel Cron calls it daily (see vercel.json) with
   Authorization: Bearer <CRON_SECRET>. Nothing else may call it: without
   a matching secret the answer is 401, and without a secret set at all it
   is 503. Fails closed, like the webhook.

   WHAT IT PULLS
   The trailing 7 days, every run, because Meta revises recent figures as
   attribution settles. The very first run, when nothing has been synced
   yet, pulls 90 days so the dashboard has history. ?days=N overrides
   either, up to 90.

   The window is replaced atomically by meta_sync_replace() in migration
   0007. If Meta errors or the token has expired, this throws before that
   call, so the figures already stored are left exactly as they were.

   WHAT MAKES SPEND LINE UP WITH VISITS
   campaign and ad are Meta's own names, and the site records the
   utm_campaign and utm_content a visitor arrived with. They match when
   the ads carry, in their URL parameters:

     utm_source=meta&utm_medium=paid-social
       &utm_campaign={{campaign.name}}&utm_content={{ad.name}}

   Meta's ids are stored too. Names get edited; ids do not.

   MORE THAN ONE AD ACCOUNT
   One today, but nothing below assumes it. META_AD_ACCOUNT_IDS takes a
   comma-separated list. Each account is fetched, replaced and logged on
   its own, so one account failing never touches another's figures, and
   each may have its own token: META_ADS_TOKEN_<digits> wins over the
   shared META_ADS_TOKEN, because a second business should be read with
   its own authorisation, not ours.

   Before a second account is switched on, the owner report needs an
   account filter. It sums every account today. See migration 0008.

   Env:
     META_ADS_TOKEN            system user token with ads_read, secret
     META_ADS_TOKEN_<digits>   optional, a token for that one account
     META_AD_ACCOUNT_IDS       one or more ids, comma separated, with or
                               without the act_ prefix
     META_AD_ACCOUNT_ID        the single-account spelling, still read
     CRON_SECRET               what Vercel Cron authenticates with
     META_GRAPH_API_VERSION    defaults to v21.0, shared with api/_meta.js
   ══════════════════════════════════════════════════════════════════════ */
import { createHash, timingSafeEqual } from 'node:crypto';
import { rpc, select, configured } from './_supabase.js';

/* Accounts as digits. Anything that is not a plain account number is
   dropped here, so nothing from the environment reaches a URL unchecked. */
const ACCOUNTS = [...new Set(
  String(process.env.META_AD_ACCOUNT_IDS || process.env.META_AD_ACCOUNT_ID || '')
    .split(',')
    .map((v) => v.trim().replace(/^act_/, ''))
)];
const VALID_ACCOUNTS = ACCOUNTS.filter((a) => /^\d{5,}$/.test(a));
const ACCOUNTS_OK = VALID_ACCOUNTS.length > 0 && VALID_ACCOUNTS.length === ACCOUNTS.length;

const tokenFor = (account) =>
  process.env[`META_ADS_TOKEN_${account}`] || process.env.META_ADS_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

const TZ = 'America/Los_Angeles';
const TRAILING_DAYS = 7;
const FIRST_RUN_DAYS = 90;
const MAX_PAGES = 100;

const sha = (v) => createHash('sha256').update(String(v)).digest();

function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Every ad, every day in the window. Follows Meta's paging to the end. */
async function fetchInsights(account, token, since, until) {
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: [
      'campaign_id', 'campaign_name', 'adset_id', 'adset_name',
      'ad_id', 'ad_name', 'impressions', 'inline_link_clicks', 'spend'
    ].join(','),
    limit: '500'
  });

  // The token rides in a header for the first request. Meta's `next`
  // links carry it in the query string, so a URL is never logged here.
  let url = `https://graph.facebook.com/${API_VERSION}/act_${account}/insights?${params}`;
  let headers = { Authorization: `Bearer ${token}` };
  const out = [];

  for (let page = 0; url; page++) {
    if (page >= MAX_PAGES) throw new Error('meta paging did not end');
    const res = await fetch(url, { headers });
    if (!res.ok) {
      // Meta's error body describes the request, and never echoes the token.
      const err = new Error((await res.text()).slice(0, 300));
      err.metaStatus = res.status;
      throw err;
    }
    const body = await res.json();
    for (const r of body.data || []) out.push(r);
    url = (body.paging && body.paging.next) || null;
    headers = {};
  }
  return out;
}

/** Meta's row, in the shape meta_sync_replace() reads. */
function toRow(r) {
  return {
    metric_date: r.date_start,
    campaign: r.campaign_name || '(none)',
    ad: r.ad_name || '(none)',
    impressions: Number(r.impressions) || 0,
    // Link clicks, not all clicks. A reaction or a profile tap is not
    // traffic, and cost per click should mean a visit we could have had.
    clicks: Number(r.inline_link_clicks) || 0,
    spend: Number(r.spend) || 0,
    campaign_id: r.campaign_id || null,
    adset_id: r.adset_id || null,
    adset_name: r.adset_name || null,
    ad_id: r.ad_id || ''
  };
}

/* One row per ad per day, whatever Meta sends. The database enforces the
   same rule (migration 0008), and a duplicate would fail the whole
   replace, so fold any repeats together here rather than lose the run. */
function onePerAdPerDay(rows) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.metric_date}|${r.ad_id}`;
    const seen = byKey.get(key);
    if (!seen) { byKey.set(key, { ...r }); continue; }
    seen.impressions += r.impressions;
    seen.clicks += r.clicks;
    seen.spend += r.spend;
  }
  return [...byKey.values()];
}

/* One line per run, always the same shape, so a search for "meta-sync" in
   Vercel's logs reads as a table: the window, how far it got, and what
   Meta and the database each said. */
function report(level, fields) {
  console[level](`meta-sync ${JSON.stringify(fields)}`);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail closed. A missing secret must never mean "anyone may run this".
  if (CRON_SECRET.length < 16) {
    console.error('meta-sync: CRON_SECRET unset or too short');
    return res.status(503).json({ error: 'not configured' });
  }
  const given = String(req.headers.authorization || '');
  if (!timingSafeEqual(sha(given), sha(`Bearer ${CRON_SECRET}`))) {
    console.warn('meta-sync: rejected, bad secret');
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!ACCOUNTS_OK || VALID_ACCOUNTS.some((a) => !tokenFor(a))) {
    console.error('meta-sync: an ad account id is missing or malformed, or an account has no token');
    return res.status(503).json({ error: 'meta not configured' });
  }
  if (!configured) return res.status(503).json({ error: 'database not configured' });

  const asked = Number.parseInt((req.query && req.query.days) || '', 10);

  // One account at a time, each whole or not at all. A failure is recorded
  // and the loop moves on: one account's expired token must not stop
  // another account's figures from refreshing.
  const results = [];
  for (const account of VALID_ACCOUNTS) {
    results.push(await syncAccount(`act_${account}`, account, asked));
  }

  const failed = results.filter((r) => !r.ok);
  return res.status(failed.length ? 502 : 200).json({ ok: failed.length === 0, accounts: results });
}

async function syncAccount(label, account, asked) {
  // What the log line says if this run dies partway.
  const run = { account: label, status: 'error', stage: 'window', since: null, until: null };

  try {
    let days = asked;
    if (!Number.isInteger(days) || days < 1) {
      const synced = await select('campaign_daily_metrics',
        `select=metric_date&platform=eq.meta&ad_account_id=eq.${label}&ad_id=neq.&limit=1`);
      days = synced.length ? TRAILING_DAYS : FIRST_RUN_DAYS;
    }
    days = Math.min(days, FIRST_RUN_DAYS);

    run.until = today();
    run.since = shiftDay(run.until, -(days - 1));
    run.days = days;

    run.stage = 'meta';
    const fetched = (await fetchInsights(account, tokenFor(account), run.since, run.until))
      .map(toRow).filter((r) => r.ad_id && r.metric_date);
    const rows = onePerAdPerDay(fetched);
    run.meta = 200;
    run.fetched = rows.length;

    run.stage = 'store';
    const result = await rpc('meta_sync_replace',
      { p_from: run.since, p_to: run.until, p_rows: rows, p_account: label });

    report('log', { ...run, status: 'ok', stage: 'done', ...result });
    return { ok: true, account: label, since: run.since, until: run.until,
             fetched: rows.length, ...result };
  } catch (e) {
    // Nothing was replaced for this account: the fetch or the single
    // replace call failed whole. Its stored figures stand, and its
    // last_synced_at does not move, which is how a failing sync shows up
    // on the dashboard.
    if (e && e.metaStatus) run.meta = e.metaStatus;
    report('error', { ...run, error: String((e && e.message) || e).slice(0, 300) });
    return { ok: false, account: label, error: 'sync failed', stage: run.stage };
  }
}
