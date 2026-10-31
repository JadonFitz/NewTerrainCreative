/* ══════════════════════════════════════════════════════════════════════
   /api/sms-optin  ·  the text-updates form on /strategy-call
   ──────────────────────────────────────────────────────────────────────
   The A2P opt-in URL is /strategy-call, and carriers (and GHL's
   compliance scan) have to be able to read the consent from the page
   itself. The iClosed widget renders in the browser, so its texting box
   is invisible to a scanner. This form is plain HTML on the page: an
   unticked, optional checkbox whose label carries the full consent text.

   POST { firstName, email, phone, consent, website }
     Upserts the contact in the NTC GHL location (email is the key, as
     everywhere else). Tags sms:optin and src:site-sms only when consent
     is exactly true; without it the contact is saved and nothing else.
     Sends nothing: every GHL workflow is off until A2P is approved.

   GUARDS: same origin only, a per-instance IP rate limit, a honeypot
   (`website`), length caps, and no PII in any log line.

   Env: GHL_API_TOKEN (api/_ghl.js). Without it the form still answers
   ok, so a visitor never sees a vendor problem, and logs that it
   could not save.
   ══════════════════════════════════════════════════════════════════════ */
import * as ghl from './_ghl.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 10;
const hits = new Map();

export function _resetRateLimit() { hits.clear(); }

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return list.length > MAX_HITS;
}

function sameOrigin(req) {
  const origin = req.headers.origin || '';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export function readOptin(d) {
  d = d && typeof d === 'object' ? d : {};
  const out = {
    firstName: str(d.firstName, 80),
    email: str(d.email, 254).toLowerCase(),
    phone: str(d.phone, 40),
    consent: d.consent === true || d.consent === 'yes' || d.consent === 'on'
  };
  const digits = out.phone.replace(/[^0-9]/g, '');
  const errors = [];
  if (!out.firstName) errors.push('firstName');
  if (!EMAIL.test(out.email)) errors.push('email');
  if (digits.length < 10 || digits.length > 15) errors.push('phone');
  return { optin: out, errors };
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  if (!sameOrigin(req)) return res.status(403).json({ ok: false });
  if (limited(clientIp(req))) return res.status(429).json({ ok: false });

  const d = parseBody(req);
  if (str(d.website, 200)) return res.status(200).json({ ok: true });

  const { optin, errors } = readOptin(d);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  if (!ghl.configured()) {
    console.error('sms-optin: GHL not configured, not saved');
    return res.status(200).json({ ok: true });
  }
  try {
    const c = await ghl.upsertContact({
      firstName: optin.firstName, email: optin.email, phone: optin.phone
    });
    if (optin.consent) await ghl.addTags(c.id, ['sms:optin', 'src:site-sms']);
    console.log('sms-optin: saved', optin.consent ? 'with consent' : 'without consent');
  } catch (e) {
    console.error('sms-optin: ghl failed', (e && e.message) || e);
  }
  return res.status(200).json({ ok: true });
}
