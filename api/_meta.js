/* ══════════════════════════════════════════════════════════════════════
   Meta Conversions API · shared server-side utility
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   Never import this into browser code: it reads META_CAPI_TOKEN.

   Env:
     META_PIXEL_ID             defaults to the live dataset
     META_CAPI_TOKEN           required, secret
     META_GRAPH_API_VERSION    defaults to v21.0
     META_TEST_EVENT_CODE      optional, MUST be unset in production
   ══════════════════════════════════════════════════════════════════════ */
import { createHash } from 'node:crypto';

export const PIXEL_ID = process.env.META_PIXEL_ID || '1634935111618929';
const API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

/** Meta requires lowercase, trimmed, then SHA-256 hex. */
const hash = (v) => createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

/** Digits only, leading zeros stripped, country code included. */
const normPhone = (v) => String(v).replace(/[^0-9]/g, '').replace(/^0+/, '');

/** Names: strip punctuation and whitespace before hashing. */
const normName = (v) => String(v).trim().toLowerCase().replace(/[^a-zÀ-ɏ]/g, '');

/**
 * Build Meta's user_data. Hashes what Meta requires hashed and leaves the
 * rest alone: client_ip_address, client_user_agent, fbp and fbc must be raw.
 * Only includes fields we actually have. Never fabricates fbc.
 */
export function buildUserData({ email, phone, firstName, lastName, externalId, ip, userAgent, fbp, fbc }) {
  const u = {};
  if (email) { u.em = [hash(email)]; }

  if (phone) {
    const p = normPhone(phone);
    if (p.length >= 7) u.ph = [hash(p)];
  }

  if (firstName) { const f = normName(firstName); if (f) u.fn = [hash(f)]; }
  if (lastName) { const l = normName(lastName); if (l) u.ln = [hash(l)]; }

  // external_id lets Meta join repeat events for the same person without us
  // sending an email twice. Hashed because it derives from PII.
  if (externalId) u.external_id = [hash(externalId)];
  else if (email) u.external_id = [hash(email)];

  // NOT hashed, per Meta's spec.
  if (ip) u.client_ip_address = ip;
  if (userAgent) u.client_user_agent = userAgent;
  if (fbp) u.fbp = fbp;
  if (fbc) u.fbc = fbc;

  return u;
}

/** Pull the caller's IP and UA off a Vercel request. */
export function requestIdentity(req) {
  const fwd = req.headers['x-forwarded-for'] || '';
  return {
    ip: String(fwd).split(',')[0].trim() || undefined,
    userAgent: req.headers['user-agent'] || undefined
  };
}

/**
 * Send one conversion. Resolves to a short status string; throws only on a
 * non-2xx from Meta so callers can log and continue. A tracking failure must
 * never break a lead submission or a payment.
 */
export async function sendMetaConversion({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  actionSource = 'website',
  userData = {},
  customData
}) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return 'skipped (no META_CAPI_TOKEN)';
  if (!eventName) throw new Error('eventName required');

  const event = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  if (customData && Object.keys(customData).length) event.custom_data = customData;

  const body = { data: [event], access_token: token };

  // Events carrying a test code are excluded from optimisation and
  // attribution, so this must be unset in production.
  if (process.env.META_TEST_EVENT_CODE) {
    body.test_event_code = process.env.META_TEST_EVENT_CODE;
  }

  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    // Meta's error body describes the payload shape, not the customer, so it
    // is safe to surface. The token is never echoed back.
    throw new Error(`meta ${res.status} ${await res.text()}`);
  }
  return 'sent';
}
