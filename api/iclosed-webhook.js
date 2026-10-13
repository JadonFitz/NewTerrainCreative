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

   WHAT MAKES A BOOKING ATTRIBUTABLE TO AN AD
   Hashed contact details let Meta match a booking to a person. They do
   not let it match the booking to the click: for that Meta wants the
   browser id (_fbp), the click id (_fbc, derived from fbclid) and the
   booker's own IP. Until 10 Oct 2026 the server copy sent none of them,
   and since almost every Schedule arrives server side (the browser copy
   on /call-booked rarely fires), Ads Manager attributed one booking in
   thirty days against five ad sets optimising for Schedule. Events
   Manager said the same thing: "low fbc coverage from the Conversions
   API".

   The embed on /strategy-call hands iClosed the visitor's fbclid and
   session, and iClosed's widget reads _fbp and _fbc from the browser on
   its own. All of it comes back in the webhook's `tracking` object, and
   the booker's IP comes back as invitee.ip_address, so this handler
   forwards them. See metaIdsFrom().

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

   THE FIRST-PARTY COPY
   Each confirmed booking is also written to funnel_events as a
   `schedule` event, which is what the owner dashboard counts as booked.
   This is the authenticated, server-side writer that /api/track's
   RESERVED guard has been holding the name for: the public endpoint
   still refuses schedule, and only a request carrying the webhook secret
   reaches the insert here.

   The row is keyed on the booking id, so a redelivered webhook collides
   on the unique index instead of counting twice. Like every other row in
   funnel_events it carries no contact details: the offer, the booking id
   and whatever campaign parameters iClosed passed along, nothing else.
   ══════════════════════════════════════════════════════════════════════ */
import { isIP } from 'node:net';
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, configured } from './_supabase.js';

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

/* THE ORDER HERE IS THE WHOLE DEDUPLICATION STORY.

   iClosed carries two different identifiers for one booking:

     event.callPreviewId   call_apxC1su7DBFw    the one on the redirect
     event.uuid            2661131              an internal row id

   /call-booked fires its browser Schedule keyed on the call_ form,
   because that is what iClosed puts in the ?previewId= and
   ?externalCallId= params when it sends someone to the confirmation
   page. If the server copy used the numeric uuid instead, Meta would
   see two different event ids for one booking and count it twice.

   So callPreviewId first, always. The first cut of this read uuid and
   would have doubled every conversion. */
const bookingIdOf = (d) => pick(d,
  'event.callPreviewId', 'invitee.callPreviewId', 'contact.previewId',
  'event.externalCallId', 'event.external_call_id',
  'externalCallId', 'external_call_id', 'previewId', 'preview_id',
  'event.callId', 'event.call_id', 'event.uuid', 'event.id',
  'callId', 'call_id', 'id');

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
   "Ad Sprint Call" and "Ad Sprint" must both land on ad_sprint. The slug
   (the event's URL, e.g. signature-project) is read too, because it is
   fixed in strategy-call.html while the display name can be renamed.
   Signature is checked before the generic growth/strategy match: until
   it was, every Signature booking fell through to paid_retainer. Brand
   Builder is matched on 'brand' or 'story' (the event is the Story
   Session) for the same reason: until its own iClosed event exists it
   books the Growth event and files as paid_retainer, which is correct. */
function offerFrom(d) {
  const name = String(pick(d,
    'event_type.name', 'event_type.title', 'eventType.name',
    'eventTypeName', 'event_type_name', 'eventName', 'name',
    'call.eventTypeName', 'data.eventTypeName') || '').toLowerCase();
  const slug = String(pick(d, 'event_type.slug', 'eventType.slug') || '').toLowerCase();
  const key = `${name} ${slug}`;
  if (key.includes('founding')) return 'founding_three';
  if (key.includes('sprint')) return 'ad_sprint';
  if (key.includes('signature')) return 'signature_work';
  if (key.includes('brand') || key.includes('story session')) return 'brand_builder';
  // The 5-Day Trial Call (slug pest-control-trial). Before the growth
  // match: its name says neither, so it fell through to paid_retainer.
  if (key.includes('trial')) return 'trial_pest_control';
  if (key.includes('growth') || key.includes('strategy')) return 'paid_retainer';
  return 'paid_retainer';
}

/* The campaign a booking came from, if iClosed carried it through.

   The shape log (10 Oct 2026) shows `tracking` carrying utm_source,
   utm_medium, utm_campaign, utm_content and utm_term as we pass them,
   plus iClosed's own first_utm_* copies, offer, ntc_session,
   landing_page, _fbp, _fbc and fbclid. Both spellings are still tried
   and anything absent is simply left out. A booking with no campaign
   still counts; it reports under (none). */
function attributionFrom(d) {
  const out = {};
  for (const [key, camel] of [
    ['utm_source', 'utmSource'], ['utm_medium', 'utmMedium'],
    ['utm_campaign', 'utmCampaign'], ['utm_content', 'utmContent'],
    ['utm_term', 'utmTerm']
  ]) {
    const v = pick(d, `tracking.${key}`, `tracking.${camel}`,
                      `contact.${key}`, `contact.${camel}`, key, camel);
    if (v !== undefined) out[key] = String(v).slice(0, 200);
  }
  return out;
}

/* The three identifiers Meta needs to attribute a booking to a click.
   Confirmed against the production shape log on 10 Oct 2026:

     tracking._fbp         the pixel's browser id, read by iClosed's widget
     tracking._fbc         the pixel's click id, when the pixel had set it
     tracking.fbclid       the raw click id from the ad URL, passed by the
                           embed on /strategy-call, present even when _fbc
                           is not because the pixel had not written the
                           cookie yet
     invitee.ip_address    the booker's IP, as seen by iClosed
     contact.ipAddress     the same, on the contact record

   fbc is derived from fbclid when _fbc is absent, in the format Meta
   documents (fb.1.<ms timestamp>.<fbclid>), exactly as track.js does in
   the browser. Never invented for an organic booking: no fbclid, no fbc.

   The IP is validated as an address rather than trusted, and the
   webhook caller's own IP (iClosed's server) is never used, which is what
   the 3 Oct 2026 commit stopped doing. The two values are only ever
   compared, never logged. */
const FB_ID = /^fb\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$/;
const FBCLID = /^[A-Za-z0-9_-]{1,255}$/;

function metaIdsFrom(d, callerIp) {
  const out = {};

  const fbp = String(pick(d, 'tracking._fbp', 'tracking.fbp', 'contact._fbp', 'contact.fbp') || '');
  if (FB_ID.test(fbp)) out.fbp = fbp;

  let fbc = String(pick(d, 'tracking._fbc', 'tracking.fbc', 'contact._fbc', 'contact.fbc') || '');
  if (!FB_ID.test(fbc)) {
    fbc = '';
    const fbclid = String(pick(d, 'tracking.fbclid', 'contact.fbclid', 'fbclid') || '');
    if (FBCLID.test(fbclid)) fbc = `fb.1.${Date.now()}.${fbclid}`;
  }
  if (fbc) out.fbc = fbc;

  const ip = String(pick(d, 'invitee.ip_address', 'invitee.ipAddress',
                            'contact.ipAddress', 'contact.ip_address',
                            'tracking.ip_address', 'tracking.ipAddress') || '').trim();
  if (isIP(ip) && ip !== callerIp) out.ip = ip;

  return out;
}

/** Write the booking to funnel_events. Never throws: the Meta send and the
    200 back to iClosed must not depend on our own database. */
async function storeBooking(d, bookingId) {
  if (!configured) {
    console.warn('iclosed-webhook: supabase not configured, booking not stored');
    return false;
  }
  try {
    const offer = offerFrom(d);
    await insert('funnel_events', {
      event_id: String(bookingId).slice(0, 200),
      event_name: 'schedule',
      funnel: offer,
      page_url: 'https://www.newterraincreative.com/call-booked',
      metadata: {
        ...attributionFrom(d),
        offer,
        booking_id: String(bookingId).slice(0, 200),
        booking_source: 'iclosed'
      }
    }, { ignoreConflict: true });
    return true;
  } catch (e) {
    console.error('iclosed-webhook: booking not stored', (e && e.message) || e);
    return false;
  }
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

  // First party first, and independent of Meta: a CAPI outage must not
  // cost the dashboard a booking, nor the other way round.
  const stored = await storeBooking(d, bookingId);

  const email = pick(d, 'invitee.email', 'contact.email',
                        'inviteeEmail', 'invitee_email', 'email', 'data.email');
  const phone = pick(d, 'invitee.text_reminder_number', 'contact.phoneNumber',
                        'invitee.phone', 'invitee.phoneNumber', 'invitee.phone_number',
                        'contact.phone', 'inviteePhone', 'invitee_phone',
                        'phone', 'phoneNumber');

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
    /* The caller here is iClosed's server, not the person who booked, so
       its IP is never sent: it would match nobody and Meta flags a
       server IP in Diagnostics. The booker's IP, browser id and click id
       come out of the payload instead (metaIdsFrom). The caller's user
       agent stays only because Meta requires one on a website event; the
       payload carries no better one. */
    const { ip: callerIp, userAgent } = requestIdentity(req);
    const { fbp, fbc, ip } = metaIdsFrom(d, callerIp);
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
        ip, userAgent, fbp, fbc
      }),
      customData: {
        offer: offerFrom(d),
        form_type: 'iclosed_booking',
        content_name: pick(d, 'eventTypeName', 'event_type_name', 'eventName') || 'Strategy call',
        booking_id: String(bookingId)
      }
    });
    // Which match keys went out, so attribution gaps are diagnosable
    // from the logs. Flags only, never the values.
    console.log('iclosed-webhook: Schedule sent', bookingId, JSON.stringify(result),
      'ids', JSON.stringify({ fbp: !!fbp, fbc: !!fbc, ip: !!ip }));
    return res.status(200).json({ ok: true, sent: true, stored });
  } catch (e) {
    console.error('iclosed-webhook: Schedule failed', (e && e.message) || e);
    // Still 200. The booking happened regardless, and we would rather
    // lose one conversion than have the webhook switched off.
    return res.status(200).json({ ok: true, sent: false, stored });
  }
}
