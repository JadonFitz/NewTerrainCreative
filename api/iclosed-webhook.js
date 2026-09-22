/* ══════════════════════════════════════════════════════════════════════
   POST /api/iclosed-webhook  ·  booking conversions, server side
   ──────────────────────────────────────────────────────────────────────
   iClosed's own Meta Conversions API setup rejects an access token that
   Meta itself accepts, so it cannot report bookings. This does the job
   instead, from our side, with our own token.

   WHY THIS EXISTS RATHER THAN JUST THE BROWSER EVENT
   /call-booked already fires Schedule from the browser, keyed on the
   booking id. That is real but lossy: ad blockers and iOS suppress a
   meaningful share of it, and it carries no identifiers, so Meta has
   little to match on.

   This fires the SAME event with the SAME event id, so Meta collapses
   the pair into one conversion rather than counting two, exactly as the
   browser and server copies of Lead already do on /project. What the
   server copy adds is reliability and hashed email, phone and name,
   which is what lifts match quality.

   IF ICLOSED'S OWN INTEGRATION IS EVER FIXED, one of the two has to go.
   Three senders keyed on the same id still dedupe, but only if theirs
   uses the booking id too, and that is not worth assuming.

   AUTHENTICATION
   iClosed offers no signing secret, only a URL. So the URL carries one:
   /api/iclosed-webhook?key=<ICLOSED_WEBHOOK_SECRET>. Weaker than a
   signature, because it sits in their logs and ours, but it stops
   anyone who guesses the path from minting appointments. Rotate by
   changing the env var and the subscriber URL together.

   Set ICLOSED_WEBHOOK_SECRET in Vercel (Production and Preview) to at
   least 32 random bytes. The handler fails closed without it.
   ══════════════════════════════════════════════════════════════════════ */
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || '';

/* The real payload, from the first delivery on 22 Sep 2026:

     contact, event_type, event, contactFields, invitee,
     questions_and_answers, questions_and_responses, tracking,
     call_booked_from, externalIntegrationData, hookType

   So the trigger is hookType, the booking lives under event, and the
   person is split across invitee and contact. Alternative spellings are
   kept as fallbacks because one delivery is not a contract.

   Only SCALARS count as found: the first cut read `event`, which is an
   object, and cheerfully stringified it to "[object object]". */
const pick = (obj, ...paths) => {
  for (const path of paths) {
    let v = obj;
    for (const part of path.split('.')) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[part];
    }
    if (v === undefined || v === null || typeof v === 'object') continue;
    if (String(v).trim() !== '') return v;
  }
  return undefined;
};

const bookingIdOf = (d) => pick(d,
  'event.externalCallId', 'event.external_call_id', 'event.callId',
  'event.call_id', 'event.uuid', 'event.id',
  'externalCallId', 'external_call_id', 'callId', 'call_id',
  'previewId', 'preview_id', 'id',
  'call.externalCallId', 'call.id', 'data.externalCallId', 'data.id');

const eventNameOf = (d) => String(
  pick(d, 'hookType', 'hook_type', 'eventType', 'trigger', 'type', 'event') || ''
).toLowerCase();

/* Log the shape without the contents. Keys two levels deep is enough to
   see where a field lives; the values are someone's contact details. */
function shapeOf(d) {
  const out = {};
  Object.keys(d).forEach(function (k) {
    const v = d[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.keys(v)
      : Array.isArray(v) ? `array[${v.length}]` : typeof v;
  });
  return out;
}

/* Which offer a booking belongs to. The event name iClosed sends is the
   one configured in its dashboard, so match loosely rather than exactly:
   "Ad Sprint Call" and "Ad Sprint" must both land on ad_sprint. */
function offerFrom(d) {
  const name = String(pick(d,
    'event_type.name', 'event_type.title', 'eventType.name',
    'eventTypeName', 'event_type_name', 'eventName', 'name',
    'call.eventTypeName', 'data.eventTypeName') || '').toLowerCase();
  if (name.includes('founding')) return 'founding_three';
  if (name.includes('sprint')) return 'ad_sprint';
  if (name.includes('growth') || name.includes('strategy')) return 'paid_retainer';
  return 'paid_retainer';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Fail closed. A missing secret must never mean "allow everything".
  if (!SECRET || SECRET.length < 32) {
    console.error('iclosed-webhook: ICLOSED_WEBHOOK_SECRET unset or too short');
    return res.status(503).json({ error: 'not configured' });
  }

  const key = (req.query && req.query.key) || req.headers['x-webhook-key'];
  if (key !== SECRET) {
    console.warn('iclosed-webhook: rejected, bad key');
    return res.status(401).json({ error: 'unauthorized' });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'bad payload' });

  // The payload is the documentation. Shape only, never values.
  console.log('iclosed-webhook shape', JSON.stringify(shapeOf(d)));

  const trigger = eventNameOf(d);
  const bookingId = bookingIdOf(d);

  /* Only a booking is a conversion.

     Cancelled and rescheduled are logged and nothing else. Meta has no
     way to retract a conversion, and a reschedule is the same booking
     on a new date rather than a second one, so firing again on the same
     id would be correct but pointless.

     Outcome added is where a closed sale would eventually come from,
     and is deliberately not wired up yet: that wants a Purchase with a
     real value on it, and a decision about which outcomes count. */
  if (!trigger.includes('book')) {
    console.log('iclosed-webhook: noted', trigger || '(unnamed)', bookingId || '(no id)');
    return res.status(200).json({ ok: true, noted: trigger || null });
  }

  if (!bookingId) {
    // 200 anyway: a retry would not help, and repeated failures make
    // vendors disable a webhook.
    console.error('iclosed-webhook: booking with no id, Schedule not sent');
    return res.status(200).json({ ok: true, sent: false, reason: 'no booking id' });
  }

  const email = pick(d, 'invitee.email', 'contact.email',
                        'inviteeEmail', 'invitee_email', 'email', 'data.email');
  const phone = pick(d, 'invitee.phone', 'invitee.phoneNumber', 'invitee.phone_number',
                        'contact.phone', 'contact.phoneNumber',
                        'inviteePhone', 'invitee_phone', 'phone', 'phoneNumber');

  /* First and last separately where they exist, because splitting a
     display name on whitespace guesses wrong on compound surnames, and
     these go into the match. Fall back to a full name only if it must. */
  let firstName = pick(d, 'invitee.firstName', 'invitee.first_name',
                          'contact.firstName', 'contact.first_name');
  let lastName = pick(d, 'invitee.lastName', 'invitee.last_name',
                         'contact.lastName', 'contact.last_name');
  if (!firstName && !lastName) {
    const full = String(pick(d, 'invitee.name', 'invitee.fullName', 'invitee.full_name',
                                'contact.name', 'contact.fullName',
                                'inviteeFullName', 'fullName', 'name') || '').trim();
    if (full) {
      const parts = full.split(/\s+/);
      firstName = parts.shift();
      lastName = parts.join(' ') || undefined;
    }
  }

  try {
    const { ip, userAgent } = requestIdentity(req);
    const result = await sendMetaConversion({
      eventName: 'Schedule',
      // The booking id, which is what /call-booked uses in the browser.
      // That shared id is the whole deduplication story.
      eventId: String(bookingId),
      eventSourceUrl: 'https://www.newterraincreative.com/call-booked',
      userData: buildUserData({
        email, phone,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        externalId: String(bookingId),
        ip, userAgent
      }),
      customData: {
        offer: offerFrom(d),
        form_type: 'iclosed_booking',
        content_name: pick(d, 'eventTypeName', 'event_type_name', 'eventName') || 'Strategy call',
        booking_id: String(bookingId)
      }
    });
    console.log('iclosed-webhook: Schedule sent', bookingId, JSON.stringify(result));
    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    console.error('iclosed-webhook: Schedule failed', (e && e.message) || e);
    // Still 200. The booking happened regardless, and we would rather
    // lose one conversion than have the webhook switched off.
    return res.status(200).json({ ok: true, sent: false });
  }
}
