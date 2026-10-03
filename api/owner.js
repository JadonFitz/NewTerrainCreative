/* ══════════════════════════════════════════════════════════════════════
   /api/owner  ·  the read behind the owner dashboard at /owner
   ──────────────────────────────────────────────────────────────────────
   POST { password }           sign in, sets the session cookie
   POST { action: 'logout' }   clears it
   GET  ?from=&to=             the funnel report, signed in only

   AGGREGATES ONLY. The numbers come from owner_funnel_report() in
   supabase/migrations/0006, which returns counts grouped by funnel,
   source, campaign and ad. No lead, no contact detail and no session id
   passes through here, so a leaked session exposes performance figures
   and nothing about a person.

   AUTHENTICATION
   One shared password, OWNER_DASHBOARD_PASSWORD. Fine for a v1 with two
   or three people; the upgrade is per-person sign in. A correct password
   is exchanged for a signed, expiring cookie that is HttpOnly, so page
   script cannot read it, and SameSite=Strict, so another site cannot
   ride it. The signing key is derived from the password, which means
   changing the password signs everyone out.

   The handler fails closed: without a password of at least 12 characters
   it answers 503 rather than letting anyone in.

   The attempt limiter is per server instance, so it slows guessing
   rather than stopping it. The real defence is a long password.
   ══════════════════════════════════════════════════════════════════════ */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { rpc, select, configured } from './_supabase.js';

const PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || '';
const READY = PASSWORD.length >= 12;

const COOKIE = 'ntc_owner';
const SESSION_DAYS = 30;
const TZ = 'America/Los_Angeles';

const sha = (v) => createHash('sha256').update(String(v)).digest();
const SIGNING_KEY = sha(`ntc-owner-session:${PASSWORD}`);

const sign = (exp) => createHmac('sha256', SIGNING_KEY).update(String(exp)).digest('hex');

function sessionToken(now = Date.now()) {
  const exp = now + SESSION_DAYS * 86400000;
  return `${exp}.${sign(exp)}`;
}

function validSession(token, now = Date.now()) {
  if (!READY || typeof token !== 'string') return false;
  const [exp, mac] = token.split('.');
  if (!/^\d{13}$/.test(exp || '') || !/^[0-9a-f]{64}$/.test(mac || '')) return false;
  if (Number(exp) <= now) return false;
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(sign(exp), 'hex'));
}

function readCookie(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/api/owner; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

// ── attempt limiter, per instance ──────────────────────────────────────
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60000;
const fails = new Map();

const callerIp = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

function blocked(ip, now) {
  const f = fails.get(ip);
  if (f && f.until <= now) { fails.delete(ip); return false; }
  return Boolean(f && f.n >= MAX_FAILS);
}

function noteFailure(ip, now) {
  const f = fails.get(ip) || { n: 0, until: now + WINDOW_MS };
  f.n += 1;
  fails.set(ip, f);
  if (fails.size > 5000) fails.clear(); // bounded, whatever is thrown at it
}

// ── date range ─────────────────────────────────────────────────────────
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Round-tripped, because Date accepts 2026-02-31 and quietly rolls it over.
const realDay = (s) => {
  if (!DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Today in the reporting timezone, as YYYY-MM-DD. */
function today(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

function shiftDay(day, delta) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!READY) {
    console.error('owner: OWNER_DASHBOARD_PASSWORD unset or shorter than 12 characters');
    return res.status(503).json({ error: 'not configured' });
  }

  if (req.method === 'POST') {
    let d = req.body;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    if (!d || typeof d !== 'object') return res.status(400).json({ error: 'bad request' });

    if (d.action === 'logout') {
      res.setHeader('Set-Cookie', cookieHeader('', 0));
      return res.status(200).json({ ok: true });
    }

    const ip = callerIp(req);
    const now = Date.now();
    if (blocked(ip, now)) {
      return res.status(429).json({ error: 'too many attempts, try again in 15 minutes' });
    }

    // Compared as digests so the lengths always match and the comparison
    // takes the same time whatever was sent.
    const given = typeof d.password === 'string' ? d.password : '';
    if (!timingSafeEqual(sha(given), sha(PASSWORD))) {
      noteFailure(ip, now);
      console.warn('owner: rejected sign in');
      return res.status(401).json({ error: 'wrong password' });
    }

    fails.delete(ip);
    res.setHeader('Set-Cookie', cookieHeader(sessionToken(now), SESSION_DAYS * 86400));
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validSession(readCookie(req))) {
    return res.status(401).json({ error: 'sign in required' });
  }

  const q = req.query || {};
  const to = q.to === undefined ? today() : String(q.to);
  const from = q.from === undefined ? shiftDay(to, -29) : String(q.from);
  if (!realDay(from) || !realDay(to) || from > to) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD, from on or before to' });
  }

  if (!configured) return res.status(503).json({ error: 'database not configured' });

  try {
    const report = await rpc('owner_funnel_report', { p_from: from, p_to: to, p_tz: TZ });

    // When Meta spend was last refreshed. With more than one ad account
    // this is the one refreshed longest ago, since that is the one whose
    // figures might be stale. Optional: the report must still load if this
    // table is missing or the read fails.
    let spendSync = null;
    try {
      const rows = await select('sync_status',
        'select=source,last_synced_at,window_from,window_to,rows_written' +
        '&source=like.meta_ads:*&order=last_synced_at.asc&limit=1');
      spendSync = (Array.isArray(rows) && rows[0]) || null;
    } catch (e) {
      console.warn('owner: sync status unavailable', (e && e.message) || e);
    }
    return res.status(200).json({
      ok: true,
      from, to, timezone: TZ,
      rows: (report && report.rows) || [],
      coverage: (report && report.coverage) || [],
      spend_coverage: (report && report.spend_coverage) || null,
      spend_sync: spendSync
    });
  } catch (e) {
    // PostgREST errors describe the query, never a customer. Logged, not
    // returned: the page only needs to know it failed.
    console.error('owner: report failed', (e && e.message) || e);
    return res.status(502).json({ error: 'report unavailable' });
  }
}
