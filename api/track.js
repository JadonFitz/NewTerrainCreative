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
  'vsl_25', 'vsl_50', 'vsl_75', 'vsl_90',
  'lead',        // written server side by /api/apply, allowed here for parity
  'schedule',    // not yet wired
  'purchase'     // not yet wired, will be server authoritative
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
  if (!eventName || !ALLOWED.has(eventName)) {
    return res.status(200).json({ ok: true, ignored: 'unknown event' });
  }

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
      metadata: safeMetadata(d.metadata)
    }, { ignoreConflict: true });

    return res.status(200).json({ ok: true, stored: true });
  } catch (e) {
    // A duplicate event_id is expected and harmless.
    console.error('track insert failed', (e && e.message) || e);
    return res.status(200).json({ ok: true, stored: false });
  }
}
