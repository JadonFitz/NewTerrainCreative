/* ══════════════════════════════════════════════════════════════════════
   POST /api/ghl-webhook?key=<GHL_WEBHOOK_SECRET>  ·  GHL appointments
   ──────────────────────────────────────────────────────────────────────
   The GoHighLevel twin of /api/iclosed-webhook, contract flow 2. A GHL
   workflow (trigger: Customer Booked Appointment / Appointment Status)
   posts here for booked, rescheduled and cancelled appointments. Nothing
   reaches it until those workflows exist, and the website's booking
   form only sends people to GHL for an offer whose provider is 'ghl'.

   WHAT EACH EVENT DOES

     booked       one `schedule` row in funnel_events (booking_source
                  'ghl'), one Meta Schedule (or NextStepSprintBooked for
                  a lead that came through /next-step), one Speed-to-Lead
                  card type=booked, and the contact's Sales opportunity
                  moved to Booked (markBooked, never backward). A Rescheduled Call or Quick Follow-Up
                  booking is a lead already counted: noted, carded, never
                  a second Schedule and never a second schedule row.
     rescheduled  noted in funnel_events, nothing else. Same booking,
                  new time; Meta has nothing to learn from it.
     cancelled    noted in funnel_events and carded type=cancelled.

   THE EVENT ID IS schedule_<ntc_session>
   /call-booked fires the browser Schedule with the same id, read from
   the same first-party session the booking form wrote onto the contact
   (ntc_session). Meta collapses the pair into one conversion. With no
   session on the contact (someone booked from a bare GHL link) the id
   falls back to the appointment, and only this server copy fires.

   IDEMPOTENT on (appointment id, event type). The funnel_events row is
   keyed ghl:<appointment id>:<event>, so a redelivery collides on the
   unique index, and a collision means Meta and Slack were already told.
   If the database is down the side effects still run: Meta dedupes on
   the event id, and a second card beats a lost booking.

   PAYLOAD
   Configure the workflow's Webhook action with Custom Data:
     event           booked | rescheduled | cancelled (or add &event= to
                     the URL; one workflow per event is simplest)
     appointment_id  {{appointment.id}}
     offer           the offer key, optional: the calendar name is
                     matched against assets/booking-forms.js otherwise
     ntc_session, ntc_fbp, ntc_fbc, ntc_fbclid, ntc_from, utm_source,
     utm_medium, utm_campaign, utm_content, utm_term
                     {{contact.ntc_session}} and so on
   GHL's standard webhook body (contact_id, first_name, last_name, email,
   phone, calendar{...}) is read for everything else, with fallbacks,
   because one delivery is not a contract. See fieldsFrom().

   AUTHENTICATION: the URL carries GHL_WEBHOOK_SECRET as ?key=, exactly
   as the iClosed webhook does, and fails closed without it.
   ══════════════════════════════════════════════════════════════════════ */
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, configured } from './_supabase.js';
import { sendLeadCard } from './_lead-card.js';
import * as ghl from './_ghl.js';
import '../assets/booking-forms.js';

const FORMS = globalThis.NTCBookingForms;
const { OFFERS } = FORMS;

/* The funnel name each offer reports under, the same names
   /api/iclosed-webhook and the owner dashboard use. */
const FUNNEL = {
  'growth': 'paid_retainer',
  'ad-sprint': 'ad_sprint',
  'signature': 'signature_work',
  'brand-builder': 'brand_builder',
  'pest-control-trial': 'trial_pest_control'
};
const REBOOKING = new Set(['reschedule', 'follow-up']);

/* Scalars only, first non-empty wins, dotted paths. The same rule the
   iClosed handler learned the hard way: an object is never a value. */
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

/* A contact field by its key, wherever the workflow put it: Custom
   Data, the top level, a contact object, or GHL's customFields array
   of { key | fieldKey, value }. */
function fieldsFrom(d) {
  const arrays = [d.customFields, d.contact && d.contact.customFields].filter(Array.isArray);
  return (key) => {
    const v = pick(d, `customData.${key}`, key, `contact.${key}`, `contact_${key}`);
    if (v !== undefined) return v;
    for (const list of arrays) {
      const hit = list.find((f) => f && (f.key === key || f.fieldKey === key ||
                                         f.fieldKey === `contact.${key}`));
      if (hit && hit.value != null && typeof hit.value !== 'object' && String(hit.value).trim()) {
        return String(hit.value).trim();
      }
    }
    return undefined;
  };
}

function eventOf(d, query) {
  const raw = String(pick(d, 'customData.event', 'event', 'type') || (query && query.event) ||
    pick(d, 'calendar.appoinmentStatus', 'calendar.appointmentStatus', 'calendar.status',
            'appointment.appointmentStatus', 'appointment.status') || '').toLowerCase();
  if (/cancel/.test(raw)) return 'cancelled';
  if (/resched/.test(raw)) return 'rescheduled';
  if (/book|confirm|new/.test(raw)) return 'booked';
  return '';
}

const appointmentIdOf = (d) => pick(d, 'customData.appointment_id', 'customData.appointmentId',
  'appointment_id', 'appointmentId', 'calendar.appointmentId', 'calendar.appointment_id',
  'appointment.id', 'calendar.id');

/* The offer: named outright, or the booked calendar's name matched to
   the contract's calendar names, or the ntc_offer field the booking form
   wrote on the contact. Unknown stays unknown rather than guessed. */
function offerOf(d, field) {
  const named = String(pick(d, 'customData.offer') || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(OFFERS, named)) return named;
  const cal = String(pick(d, 'calendar.calendarName', 'calendar.name', 'calendarName',
                         'appointment.calendarName') || '').trim().toLowerCase();
  if (cal) {
    for (const [key, o] of Object.entries(OFFERS)) {
      if (o.calendar.toLowerCase() === cal) return key;
    }
  }
  const stored = String(field('ntc_offer') || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(OFFERS, stored)) return stored;
  return '';
}

const FB_ID = /^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$/;
const FBCLID = /^[A-Za-z0-9_-]{1,255}$/;
const SESSION = /^[A-Za-z0-9_-]{6,120}$/;

/** Browser and click ids, validated. Never invented for an organic lead. */
function metaIds(field) {
  const out = {};
  const fbp = String(field('ntc_fbp') || '');
  if (FB_ID.test(fbp)) out.fbp = fbp;
  let fbc = String(field('ntc_fbc') || '');
  if (!FB_ID.test(fbc)) {
    fbc = '';
    const fbclid = String(field('ntc_fbclid') || '');
    if (FBCLID.test(fbclid)) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  if (fbc) out.fbc = fbc;
  return out;
}

function attributionFrom(field) {
  const out = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = field(k);
    if (v) out[k] = v.slice(0, 200);
  }
  return out;
}

/** The offer's answers present on the payload, for the Slack card. */
function answersFrom(offerKey, field) {
  const answers = {}; const labels = {};
  const q = (OFFERS[offerKey] && OFFERS[offerKey].questions) || {};
  for (const [key, def] of Object.entries(q)) {
    const v = field(key);
    if (v) { answers[key] = v; labels[key] = def.label; }
  }
  return { answers, labels };
}

/* ── the opportunity, moved to Booked ─────────────────────────────
   So the GHL workflow needs nothing but this webhook. The contact's open
   Sales opportunity moves to Booked; with none open, one is created at
   Booked. Never backward: an opportunity already at Showed or beyond
   (No-show, Plan sent, Won, Lost) stays where the team put it, which is
   also what keeps a rebooking after a no-show from rewinding it.
   Already at Booked is left alone, so a redelivery changes nothing.
   Never throws: a pipeline hiccup must not cost the conversion. */
const PAST_BOOKED = new Set(['Showed', 'No-show', 'Plan sent', 'Won', 'Lost']);

async function markBooked({ contactId, offer, fullName, field }) {
  if (!ghl.configured()) return 'skipped (GHL not configured)';
  if (!contactId) return 'skipped (no contact id)';
  try {
    const all = await ghl.findOpportunities(contactId);
    const open = all.filter((o) => !o.status || o.status === 'open');
    const stages = open.map((o) => ghl.stageName(o.pipelineStageId));
    if (stages.some((s) => PAST_BOOKED.has(s))) return 'kept (already past Booked)';
    if (stages.includes('Booked')) return 'kept (already Booked)';
    if (open.length) {
      await ghl.moveOpportunity(open[0].id, 'Booked');
      return 'moved';
    }
    const label = (OFFERS[offer] && OFFERS[offer].label) || 'Strategy call';
    const { answers } = answersFrom(offer, field);
    await ghl.createOpportunity({
      contactId, stage: 'Booked',
      name: `${fullName || 'New lead'} · ${label}`,
      monetaryValue: FORMS.opportunityValue(offer, answers)
    });
    return 'created';
  } catch (e) {
    console.error('ghl-webhook: opportunity not moved', (e && e.message) || e);
    return 'failed';
  }
}

/** Write the event row. Resolves true (new), false (seen before), or null (unknown). */
async function record(row) {
  if (!configured) { console.warn('ghl-webhook: supabase not configured, event not stored'); return null; }
  try {
    const out = await insert('funnel_events', row, { ignoreConflict: true, returning: true });
    return Boolean(out);
  } catch (e) {
    console.error('ghl-webhook: event not stored', (e && e.message) || e);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read per request, so a rotated secret takes effect without a cold start.
  const SECRET = process.env.GHL_WEBHOOK_SECRET || '';
  if (!SECRET || SECRET.length < 32) {
    console.error('ghl-webhook: GHL_WEBHOOK_SECRET unset or too short');
    return res.status(503).json({ error: 'not configured' });
  }
  const key = (req.query && req.query.key) || req.headers['x-webhook-key'];
  if (key !== SECRET) {
    console.warn('ghl-webhook: rejected, bad key');
    return res.status(401).json({ error: 'unauthorized' });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'bad payload' });

  console.log('ghl-webhook shape', JSON.stringify(shapeOf(d)));

  const event = eventOf(d, req.query);
  const appointmentId = appointmentIdOf(d);
  if (!event || !appointmentId) {
    // 200 anyway: a retry would not help, and repeated failures get a
    // webhook switched off.
    console.error('ghl-webhook: missing event or appointment id', event || '(no event)');
    return res.status(200).json({ ok: true, noted: false, reason: 'no event or appointment id' });
  }

  const field = fieldsFrom(d);
  const offer = offerOf(d, field);
  const rebooking = REBOOKING.has(offer);
  const nextStep = String(field('ntc_from') || '').toLowerCase() === 'next-step';
  const session = String(field('ntc_session') || '');
  const startAt = pick(d, 'calendar.startTime', 'calendar.start_time', 'appointment.startTime',
                          'customData.start_at') || null;

  const counted = event === 'booked' && !rebooking;
  const rowId = `ghl:${appointmentId}:${event}`.slice(0, 200);
  const fresh = await record({
    event_id: rowId,
    event_name: counted ? 'schedule' : `booking_${event === 'booked' ? 'rebooked' : event}`,
    funnel: FUNNEL[offer],
    page_url: 'https://www.newterraincreative.com/call-booked',
    metadata: {
      ...attributionFrom(field),
      offer: FUNNEL[offer] || offer || undefined,
      booking_id: String(appointmentId).slice(0, 200),
      booking_source: 'ghl',
      ...(nextStep ? { from: 'next-step' } : {})
    }
  });

  if (fresh === false) {
    console.log('ghl-webhook: duplicate', event, appointmentId);
    return res.status(200).json({ ok: true, duplicate: true });
  }

  const email = pick(d, 'email', 'contact.email', 'customData.email');
  const phone = pick(d, 'phone', 'contact.phone', 'customData.phone');
  let firstName = pick(d, 'first_name', 'firstName', 'contact.firstName', 'contact.first_name');
  let lastName = pick(d, 'last_name', 'lastName', 'contact.lastName', 'contact.last_name');
  const full = pick(d, 'full_name', 'fullName', 'name', 'contact.name') ||
    [firstName, lastName].filter(Boolean).join(' ');
  if (!firstName && !lastName && full) {
    const parts = full.split(/\s+/);
    firstName = parts.shift();
    lastName = parts.join(' ') || undefined;
  }

  let sent = false;
  if (counted) {
    try {
      const { userAgent } = requestIdentity(req);
      const { fbp, fbc } = metaIds(field);
      const eventId = SESSION.test(session) ? `schedule_${session}` : `schedule_ghl_${appointmentId}`;
      const result = await sendMetaConversion({
        eventName: nextStep ? 'NextStepSprintBooked' : 'Schedule',
        eventId,
        eventSourceUrl: 'https://www.newterraincreative.com/call-booked',
        userData: buildUserData({
          email, phone,
          firstName: firstName || undefined, lastName: lastName || undefined,
          externalId: String(appointmentId),
          userAgent, fbp, fbc
        }),
        customData: {
          offer: FUNNEL[offer] || 'paid_retainer',
          form_type: 'ghl_booking',
          content_name: (OFFERS[offer] && OFFERS[offer].calendar) || 'Strategy call',
          booking_id: String(appointmentId)
        }
      });
      sent = result === 'sent';
      console.log(`ghl-webhook: ${nextStep ? 'NextStepSprintBooked' : 'Schedule'}`, result,
        'ids', JSON.stringify({ fbp: !!fbp, fbc: !!fbc, session: SESSION.test(session) }));
    } catch (e) {
      console.error('ghl-webhook: Schedule failed', (e && e.message) || e);
    }
  }

  const opportunity = event === 'booked'
    ? await markBooked({
        contactId: pick(d, 'contact_id', 'contactId', 'contact.id', 'customData.contact_id'),
        offer, fullName: full, field
      })
    : 'not touched';

  let card = 'not sent';
  if (event === 'booked' || event === 'cancelled') {
    const { answers, labels } = answersFrom(offer, field);
    card = await sendLeadCard({
      type: event, offer: offer || 'unknown',
      contact: { name: full || '', email: email || '', phone: phone || '' },
      answers, labels, start_at: startAt
    });
  }

  console.log('ghl-webhook:', event, offer || '(unknown offer)', 'stored', fresh, 'opportunity', opportunity, 'card', card);
  return res.status(200).json({ ok: true, event, stored: fresh === true, sent, opportunity, card });
}
