/* ══════════════════════════════════════════════════════════════════════
   Google Calendar · read-only, service account, zero dependencies
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   Never import this into browser code: it reads a private key.

   ── Why a service account, and why polling ───────────────────────────
   Google Appointment Schedules (the calendar.app.google booking pages)
   do not emit a booking webhook. There is no such thing to subscribe
   to, so nothing here pretends otherwise.

   The Calendar API does offer events.watch push channels, but the
   callback body carries no event data — only X-Goog-Resource-State
   headers — so you still have to call events.list afterwards to learn
   what changed. Channels also expire and need a renewal job, and the
   callback domain needs verifying in Google Cloud. That is a cron, a
   list call and a domain verification to replace a cron and a list
   call. Polling is the smaller reliable design. events.watch stays
   documented as a later latency optimisation in
   docs/FUNNEL-AUTOMATION.md.

   Service account rather than OAuth because a refresh token issued
   while the consent screen is in "Testing" expires after seven days,
   which would break bookings silently. A service account holds no user
   session to expire. It reaches the calendar because the calendar is
   SHARED with its address, not through domain-wide delegation.

   ── Signing without a library ────────────────────────────────────────
   The JWT bearer flow is a signed assertion exchanged for an access
   token. node:crypto signs RS256 directly, so googleapis and
   jsonwebtoken would both be a build step for about twenty lines.

   Env:
     GOOGLE_SERVICE_ACCOUNT_JSON   the whole downloaded key file, or
     GOOGLE_SERVICE_ACCOUNT_EMAIL  + GOOGLE_PRIVATE_KEY
     GOOGLE_CALENDAR_ID            the calendar shared with the account
   ══════════════════════════════════════════════════════════════════════ */
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/* Least privilege. Reading events is all a booking sync ever needs, and
   a read-only token cannot alter or delete anything on the calendar. */
const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/**
 * The calendar to poll.
 *
 * Read at call time rather than captured at module load: a constant
 * evaluated on import cannot tell a missing variable from a present one
 * once the module is cached, which made calendarConfigured() unable to
 * report the one failure it exists to report.
 */
export const calendarId = () => process.env.GOOGLE_CALENDAR_ID || '';

/**
 * Read the service-account credentials from either supported shape.
 *
 * The JSON form is preferred in Vercel: pasting the downloaded key file
 * whole means the private key's newlines survive as \n inside a JSON
 * string, which is the usual thing to get wrong. The split form is
 * supported because some setups already have it, and it un-escapes \n
 * for exactly that reason.
 *
 * Returns null rather than throwing when nothing is configured, so the
 * sync endpoint can report "not configured" instead of crashing.
 */
function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j.client_email && j.private_key) {
        return { email: j.client_email, key: String(j.private_key).replace(/\\n/g, '\n') };
      }
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON parsed but lacks client_email or private_key');
      return null;
    } catch {
      // Deliberately does not echo the value: it contains the key.
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) return { email, key: String(key).replace(/\\n/g, '\n') };

  return null;
}

/** True when a calendar could actually be read. Callers log why not. */
export function calendarConfigured() {
  return Boolean(credentials() && calendarId());
}

const b64url = (buf) => Buffer.from(buf)
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* A warm Lambda reuses this. Tokens last an hour; refreshing 60s early
   avoids a request that expires mid-flight. */
let cachedToken = null;

/**
 * Exchange a signed JWT assertion for an OAuth access token.
 * @returns {Promise<string>}
 */
async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const creds = credentials();
  if (!creds) throw new Error('google service account not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: creds.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  let signature;
  try {
    signature = b64url(signer.sign(creds.key));
  } catch (e) {
    // Never include the key or the error's buffer contents.
    throw new Error(`google jwt signing failed (check the private key formatting): ${e.code || 'unknown'}`);
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`
    }).toString()
  });

  if (!res.ok) {
    // Google's token errors name the problem (invalid_grant, invalid_scope)
    // and echo no credential material.
    throw new Error(`google token ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (!json.access_token) throw new Error('google token response had no access_token');

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (Number(json.expires_in || 3600) * 1000)
  };
  return cachedToken.value;
}

/**
 * List events from the booking calendar.
 *
 * singleEvents expands recurrence into concrete instances, which is what
 * an appointment is. showDeleted stays off: a cancelled booking should
 * not arrive looking like a new one.
 *
 * Pages until exhausted, bounded by maxPages so a misconfigured window
 * cannot spin a function to its timeout.
 *
 * @param {object} o
 * @param {string} o.timeMin     ISO, earliest appointment START to consider
 * @param {string} [o.timeMax]   ISO
 * @param {string} [o.updatedMin] ISO, only events touched since then
 * @param {number} [o.maxPages]
 * @returns {Promise<object[]>} raw Google event resources
 */
export async function listCalendarEvents({ timeMin, timeMax, updatedMin, maxPages = 5 }) {
  const calId = calendarId();
  if (!calId) throw new Error('GOOGLE_CALENDAR_ID is not set');

  const token = await accessToken();
  const out = [];
  let pageToken;

  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'false',
      orderBy: 'startTime',
      maxResults: '250'
    });
    if (timeMin) qs.set('timeMin', timeMin);
    if (timeMax) qs.set('timeMax', timeMax);
    if (updatedMin) qs.set('updatedMin', updatedMin);
    if (pageToken) qs.set('pageToken', pageToken);

    const url = `https://www.googleapis.com/calendar/v3/calendars/`
      + `${encodeURIComponent(calId)}/events?${qs.toString()}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 404) {
      throw new Error(
        `google calendar 404 · the calendar id is wrong, or it has not been shared `
        + `with the service account address. Share it with "See all event details".`
      );
    }
    if (res.status === 403) {
      throw new Error(
        `google calendar 403 · ${await res.text()} · check the Calendar API is enabled `
        + `on the project and the calendar is shared with the service account.`
      );
    }
    if (!res.ok) throw new Error(`google calendar ${res.status} ${await res.text()}`);

    const json = await res.json();
    if (Array.isArray(json.items)) out.push(...json.items);

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return out;
}
