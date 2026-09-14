/* ══════════════════════════════════════════════════════════════════════
   POST /api/track  ·  first-party funnel events
   ──────────────────────────────────────────────────────────────────────
   The browser posts anonymous journey events here. The browser never
   touches Supabase: this endpoint holds the service role key.

   Deliberately stores no email or phone. Events join to a person through
   lead_id, which is filled in when they submit the application.

   Always answers 200 with { ok: true }. Analytics must never surface an
   error to a visitor or block a page.
   ══════════════════════════════════════════════════════════════════════ */
import { insert, configured } from './_supabase.js';

// Only these names are accepted. An open endpoint writing arbitrary rows
// to a public database is an invitation.
const ALLOWED = new Set([
  'landing_view',
  'view_content',
  'cta_click',
  'vsl_25', 'vsl_50', 'vsl_75', 'vsl_90',
  'initial_fit_completed', // step one of the application. NOT a conversion:
                           // it exists so step one to step two abandonment
                           // is measurable without inflating lead counts.
  'lead',                 // paid retainer enquiry, server written
  'submit_application',   // Founding Three, server written
  'sales_deck_view',      // /growth-guide opened. First party only: it is
                          // deliberately outside the paid funnel and is
                          // never sent to Meta.
  'purchase'              // not yet wired, will be server authoritative
]);

/* ── deliberately NOT postable here ────────────────────────────────────
   'schedule' used to sit in the list above. It was removed because this
   endpoint is public and unauthenticated: anything it accepts, anyone can
   send. A Schedule event is supposed to mean an appointment was genuinely
   confirmed, and an event anyone can forge cannot mean that.

   It will come back only when a booking-confirmation integration can
   write it server side, authenticated, from the scheduler's own webhook.
   Until then a request naming it is refused explicitly rather than
   silently ignored, so a premature attempt to wire it up fails loudly in
   testing instead of quietly producing fake conversions.
   ─────────────────────────────────────────────────────────────────── */
const RESERVED = new Set(['schedule']);

const ALLOWED_FUNNELS = new Set([
  'founding_three', 'paid_retainer', 'ad_sprint',
  // Paid landing pages. production_media is /production-media traffic,
  // separated from paid_retainer (which is /grow) so the ad-driven page
  // is reportable on its own while both sell the same retainer.
  'production_media',
  // Written server side by /api/project. Listed here too so a browser
  // event fired from /project is not silently rejected.
  'signature_work',
  'sales_enablement', 'organic_site'
]);

const MAX = {
  event_id: 200,
  session_id: 120,
  page_url: 500,
  event_name: 60
};

const trim = (v, n) => (v == null ? undefined : String(v).slice(0, n));

/** Keep metadata small, flat and free of anything resembling contact details. */
function safeMetadata(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined;
  const banned = /email|phone|mail|tel|name|address|card|token|key|secret/i;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(m)) {
    if (n >= 20) break;
    if (banned.test(k)) continue;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      out[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      n++;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // sendBeacon may arrive as text/plain rather than JSON.
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return res.status(200).json({ ok: true });

  const eventName = trim(d.event_name, MAX.event_name);

  // Refused, not ignored. A caller trying to post a reserved event is
  // either a mistake worth surfacing or an attempt worth refusing, and
  // neither should look like success.
  if (eventName && RESERVED.has(eventName)) {
    console.warn('track: refused reserved event', eventName);
    return res.status(403).json({
      ok: false,
      error: 'reserved event',
      detail: `${eventName} is written server side only, from an authenticated booking confirmation.`
    });
  }

  if (!eventName || !ALLOWED.has(eventName)) {
    return res.status(200).json({ ok: true, ignored: 'unknown event' });
  }

  const funnel = trim(d.funnel, 60);

  if (!configured) {
    console.warn('track: supabase not configured, event dropped', eventName);
    return res.status(200).json({ ok: true, stored: false });
  }

  try {
    await insert('funnel_events', {
      event_id: trim(d.event_id, MAX.event_id) || `${eventName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      event_name: eventName,
      session_id: trim(d.session_id, MAX.session_id),
      page_url: trim(d.page_url, MAX.page_url),
      funnel: ALLOWED_FUNNELS.has(funnel) ? funnel : undefined,
      metadata: safeMetadata(d.metadata)
    }, { ignoreConflict: true });

    return res.status(200).json({ ok: true, stored: true });
  } catch (e) {
    // A duplicate event_id is expected and harmless.
    console.error('track insert failed', (e && e.message) || e);
    return res.status(200).json({ ok: true, stored: false });
  }
}
