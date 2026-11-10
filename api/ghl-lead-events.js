/* ══════════════════════════════════════════════════════════════════════
   POST /api/ghl-lead-events?key=<GHL_LEAD_EVENTS_SECRET>
   Lead stage events from client GHL sub-accounts
   ──────────────────────────────────────────────────────────────────────
   The receiving end of the lead-status webhooks in the master snapshot
   (MASTER, then every client sub-account built from it, SWFL first).
   A Webhook action in three workflows posts here:

     01 New Lead      event new_lead
     03 Contacted     event stage_contacted
     09 Won           event won

   WHAT IT DOES
   Checks the key, normalises the event, and stores one row in
   ghl_lead_events (supabase/migrations/0013_ghl_lead_events.sql). That
   is all, for now. The lead-status backend reads from that table later;
   nothing here writes back to GHL, texts anyone or calls another service.

   IDEMPOTENT. The row is keyed on delivery_key: the workflow's own
   event_id when it sends one, else event:location:opportunity (or
   contact, for a new lead with no opportunity yet). A redelivery
   collides on the unique index and answers duplicate: true. A lead that
   genuinely re-enters a stage is the same key, so it is recorded once;
   send event_id from the workflow if every entry should count.

   PAYLOAD (Custom Data on the Webhook action, snake_case, as in
   /mnt/project-files/ntc-ghl/lead-status-webhooks.md section 1)
     required  event, location_id, contact_id
               opportunity_id as well for stage_contacted and won
     optional  location_name, first_name, last_name, email, phone,
               source, service_requested, opportunity_name,
               pipeline_stage, monetary_value, assigned_user_email,
               date_added, event_id
   GHL's standard body (contact_id, first_name, email, location{id,name})
   is read as a fallback, because one delivery is not a contract.
   The event can also ride on the URL as &event=, so one URL per workflow
   works when Custom Data is awkward.

   ANSWERS
     401  bad or missing key
     503  GHL_LEAD_EVENTS_SECRET unset or shorter than 32 characters
     405  anything but POST
     400  body is not JSON
     200  everything else, including a payload it cannot use (noted:
          false with a reason): a retry would not help, and repeated
          failures get a GHL webhook switched off.
   No answer ever echoes the payload, the key or a stored value.

   AUTHENTICATION: the URL carries GHL_LEAD_EVENTS_SECRET as ?key=, the
   scheme the iClosed and GHL booking webhooks use, and fails closed
   without it. Its own secret, not GHL_WEBHOOK_SECRET, because this URL
   goes into client sub-accounts and the snapshot, and rotating it must
   not break bookings.
   ══════════════════════════════════════════════════════════════════════ */
import { createHash, timingSafeEqual } from 'node:crypto';
import { insert, configured } from './_supabase.js';

/* Every name a workflow might use for an event, to the one stored. */
const EVENTS = {
  new_lead: 'new_lead', lead_new: 'new_lead', lead_created: 'new_lead', new: 'new_lead',
  stage_contacted: 'stage_contacted', contacted: 'stage_contacted',
  won: 'won', stage_won: 'won', opportunity_won: 'won'
};
const NEEDS_OPPORTUNITY = new Set(['stage_contacted', 'won']);

/* Scalars only, first non-empty wins, dotted paths. The rule the
   booking webhooks learned the hard way: an object is never a value. */
const pick = (obj, ...paths) => {
  for (const path of paths) {
    let v = obj;
    for (const part of path.split('.')) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[part];
    }
    if (v === undefined || v === null || typeof v === 'object') continue;
    if (String(v).trim() !== '') return String(v).trim();
  }
  return undefined;
};

/** A field from Custom Data first, then the top level, then GHL's own shapes. */
const field = (d, key, ...fallbacks) => pick(d, `customData.${key}`, key, ...fallbacks);

const clip = (v, n = 200) => (v === undefined ? undefined : String(v).slice(0, n));

/* GHL ids are short and alphanumeric. Anything else is not an id, and is
   never used in a key or stored as one. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const id = (v) => (v && ID.test(v) ? v : undefined);

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function money(v) {
  if (v === undefined) return undefined;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n * 100) / 100 : undefined;
}

function isoDate(v) {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

/** Shape without contents, for the log. */
function shapeOf(d) {
  const out = {};
  Object.keys(d).forEach((k) => {
    const v = d[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v)
      : Array.isArray(v) ? `array[${v.length}]` : typeof v;
  });
  return out;
}

export function eventOf(d, query) {
  const raw = String(field(d, 'event') || pick(d, 'type') || (query && query.event) || '')
    .trim().toLowerCase().replace(/[\s-]+/g, '_');
  return EVENTS[raw] || '';
}

/** The row to store, or { reason } when the payload cannot be used. */
export function rowFrom(d, query) {
  const event = eventOf(d, query);
  if (!event) return { reason: 'unknown event' };

  const locationId = id(field(d, 'location_id', 'locationId', 'location.id'));
  const contactId = id(field(d, 'contact_id', 'contactId', 'contact.id'));
  const opportunityId = id(field(d, 'opportunity_id', 'opportunityId', 'opportunity.id'));
  if (!locationId) return { reason: 'no location id' };
  if (!contactId) return { reason: 'no contact id' };
  if (NEEDS_OPPORTUNITY.has(event) && !opportunityId) return { reason: 'no opportunity id' };

  const given = field(d, 'event_id');
  const deliveryKey = given && /^[A-Za-z0-9_:.-]{1,160}$/.test(given)
    ? `${event}:${given}`
    : `${event}:${locationId}:${opportunityId || contactId}`;

  const email = field(d, 'email', 'contact.email');
  const assigned = field(d, 'assigned_user_email');

  return {
    row: {
      delivery_key: deliveryKey,
      event,
      location_id: locationId,
      location_name: clip(field(d, 'location_name', 'location.name')),
      contact_id: contactId,
      opportunity_id: opportunityId,
      first_name: clip(field(d, 'first_name', 'firstName', 'contact.firstName', 'contact.first_name'), 100),
      last_name: clip(field(d, 'last_name', 'lastName', 'contact.lastName', 'contact.last_name'), 100),
      email: email && EMAIL.test(email) ? email.toLowerCase() : undefined,
      phone: clip(field(d, 'phone', 'contact.phone'), 40),
      source: clip(field(d, 'source', 'contact.source')),
      service_requested: clip(field(d, 'service_requested')),
      opportunity_name: clip(field(d, 'opportunity_name', 'opportunity.name')),
      pipeline_stage: clip(field(d, 'pipeline_stage', 'opportunity.pipeline_stage', 'pipleline_stage'), 100),
      monetary_value: money(field(d, 'monetary_value', 'opportunity.monetary_value', 'lead_value')),
      assigned_user_email: assigned && EMAIL.test(assigned) ? assigned.toLowerCase() : undefined,
      ghl_date_added: isoDate(field(d, 'date_added', 'contact.date_added', 'date_created'))
    }
  };
}

/** Write the row. Resolves true (new), false (seen before), or null (not stored). */
async function record(row) {
  if (!configured) { console.warn('ghl-lead-events: supabase not configured, event not stored'); return null; }
  try {
    const out = await insert('ghl_lead_events', row, { ignoreConflict: true, returning: true });
    return Boolean(out);
  } catch (e) {
    console.error('ghl-lead-events: event not stored', (e && e.message) || e);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read per request, so a rotated secret takes effect without a cold start.
  const SECRET = process.env.GHL_LEAD_EVENTS_SECRET || '';
  if (!SECRET || SECRET.length < 32) {
    console.error('ghl-lead-events: GHL_LEAD_EVENTS_SECRET unset or too short');
    return res.status(503).json({ error: 'not configured' });
  }
  // Constant time, on digests so the lengths match.
  const key = String((req.query && req.query.key) || req.headers['x-webhook-key'] || '');
  const sha = (v) => createHash('sha256').update(v).digest();
  if (!timingSafeEqual(sha(key), sha(SECRET))) {
    console.warn('ghl-lead-events: rejected, bad key');
    return res.status(401).json({ error: 'unauthorized' });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return res.status(400).json({ error: 'bad payload' });

  console.log('ghl-lead-events shape', JSON.stringify(shapeOf(d)));

  const { row, reason } = rowFrom(d, req.query);
  if (!row) {
    console.error('ghl-lead-events: not usable,', reason);
    return res.status(200).json({ ok: true, noted: false, reason });
  }

  const fresh = await record(row);
  if (fresh === false) {
    console.log('ghl-lead-events: duplicate', row.event, row.location_id);
    return res.status(200).json({ ok: true, event: row.event, duplicate: true });
  }

  // Ids only in the log, never a name, email or phone.
  console.log('ghl-lead-events:', row.event, 'location', row.location_id,
    'opportunity', row.opportunity_id || '(none)', 'stored', fresh);
  return res.status(200).json({ ok: true, event: row.event, stored: fresh === true });
}
