/* ══════════════════════════════════════════════════════════════════════
   GET|POST /api/sync-bookings  ·  verified appointments become Schedule
   ──────────────────────────────────────────────────────────────────────
   The one place allowed to say an appointment exists.

   `schedule` is a reserved event: /api/track returns 403 for it, because
   that endpoint is public and anything a public endpoint accepts, anyone
   can forge. A Schedule conversion is supposed to mean a real booking,
   and an event anyone can send cannot mean that. This endpoint is the
   authenticated counterpart the reservation was waiting for. It does not
   re-open /api/track and nothing here is reachable from a browser.

   ── Order of operations, and why ─────────────────────────────────────
   The booking row is written FIRST, before Meta hears anything. Its
   UNIQUE calendar_event_id is what makes a re-run safe: if the insert
   did not create the row, some earlier run already handled this
   appointment and this one stops. Checking first and inserting second
   would be a race two overlapping crons could both lose.

   Meta then gets a deterministic event id, schedule-<calendar_event_id>,
   so even a bug that sent twice would deduplicate on their side. Two
   independent layers, neither relying on the other.

   ── Cadence ──────────────────────────────────────────────────────────
   vercel.json targets every 5 minutes. Nothing in this file depends on
   that: the query is a time window, not a cursor, so running it every
   5 minutes, hourly or once a day changes only latency. Re-running it
   ten times in a row is a no-op after the first.

   Env:
     CRON_SECRET                   required. Without it this refuses to run.
     GOOGLE_SERVICE_ACCOUNT_JSON   see api/_google.js
     GOOGLE_CALENDAR_ID
     BOOKING_SYNC_LOOKBACK_DAYS    optional, default 7
   ══════════════════════════════════════════════════════════════════════ */
import { listCalendarEvents, calendarConfigured, calendarId } from './_google.js';
import { select, insert, insertIfNew, update, configured as dbReady } from './_supabase.js';
import { sendMetaConversion, buildUserData } from './_meta.js';
import { sendSms, firstNameOf, BOOKING_URL } from './_messaging.js';

/** How far back to look for events that were created or edited. */
const LOOKBACK_DAYS = Number(process.env.BOOKING_SYNC_LOOKBACK_DAYS || 7);

/** leads.form_type -> the funnel name, when no first-party event is found. */
const FUNNEL_BY_FORM = {
  founding_application: 'founding_three',
  strategy_call: 'paid_retainer',
  project_enquiry: 'signature_work'
};

const iso = (d) => new Date(d).toISOString();
const EMAIL_RE = /^[^@\s,()*%]+@[^@\s,()*%]+\.[^@\s,()*%]+$/;

/**
 * Attendee addresses worth trying, best first.
 *
 * Drops the organiser (us), resources (rooms), and anyone who declined.
 * Filters to addresses safe to interpolate into a PostgREST filter:
 * commas and parens are that grammar's separators, so an address
 * containing them is skipped rather than escaped into a query it could
 * change the meaning of.
 */
function attendeeEmails(event) {
  const list = Array.isArray(event.attendees) ? event.attendees : [];
  return list
    .filter((a) => a && a.email)
    .filter((a) => !a.self && !a.organizer && !a.resource)
    .filter((a) => a.responseStatus !== 'declined')
    .map((a) => String(a.email).trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e));
}

/**
 * Find the lead this appointment belongs to.
 *
 * ── The matching rule ────────────────────────────────────────────────
 *   1. Match on the attendee's email address, case-insensitively. The
 *      address someone books with is the strongest evidence available;
 *      an event title is not evidence and is never used.
 *   2. Among leads with that address, prefer the most recently created
 *      one that has NOT already booked (booked_at is null). Someone who
 *      submits twice and then books is booking against their latest
 *      enquiry, and a lead already holding a confirmed appointment
 *      should not absorb a second one.
 *   3. If every lead with that address has already booked, fall back to
 *      the most recent one, so the booking still attributes somewhere
 *      rather than being dropped. Per-appointment uniqueness lives on
 *      bookings.calendar_event_id, so this cannot double-count.
 *   4. No lead with that address means this is not a funnel booking.
 *      Ignored, not recorded.
 */
async function findLead(email) {
  const rows = await select(
    'leads',
    `email=ilike.${encodeURIComponent(email)}`
    + `&select=id,name,email,phone,form_type,sms_consent,booked_at,`
    + `fbp,fbc,fbclid,utm_source,utm_medium,utm_campaign,utm_content,industry`
    + `&order=created_at.desc&limit=10`
  );
  if (!rows.length) return null;
  return rows.find((r) => !r.booked_at) || rows[0];
}

/**
 * The funnel that produced this lead.
 *
 * Read from the lead's own first-party conversion event where possible,
 * because that carries the paid landing page it came from
 * (production_media, ad_sprint) which leads.form_type cannot express.
 * Falls back to the form_type map.
 */
async function funnelFor(lead) {
  try {
    const rows = await select(
      'funnel_events',
      `lead_id=eq.${encodeURIComponent(lead.id)}`
      + `&event_name=in.(lead,submit_application)&select=funnel`
      + `&order=created_at.asc&limit=1`
    );
    if (rows[0] && rows[0].funnel) return rows[0].funnel;
  } catch (e) {
    console.warn('funnel lookup failed, falling back to form_type', (e && e.message) || e);
  }
  return FUNNEL_BY_FORM[lead.form_type] || lead.form_type || undefined;
}

/** "Tuesday 4 March at 2:30 PM" in the calendar's own timezone. */
function whenLabel(startIso, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: timeZone || 'America/Los_Angeles'
    }).format(new Date(startIso));
  } catch {
    return startIso;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   One appointment
   ══════════════════════════════════════════════════════════════════════ */
async function processEvent(event, report) {
  const calendarEventId = event.id;
  if (!calendarEventId) return;

  if (event.status === 'cancelled') { report.cancelled++; return; }

  const start = event.start && (event.start.dateTime || event.start.date);
  const end = event.end && (event.end.dateTime || event.end.date);

  // ── who booked ──────────────────────────────────────────────────────
  let lead = null;
  let matchedEmail = null;
  for (const email of attendeeEmails(event)) {
    // eslint-disable-next-line no-await-in-loop
    const found = await findLead(email);
    if (found) { lead = found; matchedEmail = email; break; }
  }

  // Not a funnel booking. An ordinary calendar entry, or someone who
  // booked with an address they never gave us. Ignored on purpose:
  // recording it would put unattributable rows in the conversion path.
  if (!lead) { report.ignored++; return; }

  const funnel = await funnelFor(lead);

  // ── the idempotency gate ────────────────────────────────────────────
  // Everything after this runs exactly once per appointment, because
  // Postgres decides who wins, not a prior read.
  const { inserted, row: bookingRow } = await insertIfNew('bookings', {
    calendar_event_id: calendarEventId,
    lead_id: lead.id,
    attendee_email: matchedEmail,
    attendee_name: lead.name,
    appointment_start: start,
    appointment_end: end,
    calendar_id: calendarId(),
    event_status: event.status || 'confirmed',
    funnel
  });

  if (!inserted) { report.alreadyRecorded++; return; }
  report.newBookings++;

  const scheduleEventId = `schedule-${calendarEventId}`;

  // ── the lead now has a confirmed call ───────────────────────────────
  // sales_stage is set and the 0003 trigger stamps scheduled_at. Not
  // stamped here: one place decides when a call became scheduled.
  try {
    await update('leads', lead.id, {
      booked_at: new Date().toISOString(),
      calendar_event_id: calendarEventId,
      appointment_start: start,
      appointment_end: end,
      sales_stage: 'call_scheduled',
      booking_source: 'google_appointment_schedule'
    });
  } catch (e) {
    console.error('booking: lead update failed', lead.id, (e && e.message) || e);
    report.errors.push(`lead update ${lead.id}`);
  }

  // ── first-party funnel event ────────────────────────────────────────
  try {
    await insert('funnel_events', {
      event_id: scheduleEventId,
      event_name: 'schedule',
      lead_id: lead.id,
      page_url: BOOKING_URL,
      funnel,
      metadata: {
        campaign: lead.utm_campaign, ad: lead.utm_content,
        source: 'google_calendar', appointment_start: start
      }
    }, { ignoreConflict: true });
  } catch (e) {
    console.error('booking: schedule funnel event failed', (e && e.message) || e);
    report.errors.push('funnel event');
  }

  // ── Meta, server side, from verified evidence only ──────────────────
  let scheduleSent = false;
  try {
    const [firstName, ...rest] = String(lead.name || '').trim().split(/\s+/);
    const result = await sendMetaConversion({
      eventName: 'Schedule',
      eventId: scheduleEventId,
      eventSourceUrl: BOOKING_URL,
      userData: buildUserData({
        email: lead.email, phone: lead.phone, firstName,
        lastName: rest.join(' ') || undefined,
        externalId: lead.id,
        // No ip or userAgent: nobody is on our site when this runs. The
        // lead's stored fbp and fbc are what carry the ad attribution.
        fbp: lead.fbp, fbc: lead.fbc
      }),
      customData: {
        offer: funnel,
        form_type: lead.form_type,
        content_name: 'Strategy call booked',
        content_category: lead.industry
      }
    });
    console.log('capi Schedule', result, scheduleEventId);
    scheduleSent = result === 'sent';
  } catch (e) {
    console.error('capi Schedule failed', (e && e.message) || e);
    report.errors.push('meta schedule');
  }

  // ── optional SMS · consent is the gate, not the phone number ────────
  // Only the Founding application asks for SMS consent, so only a
  // founding lead can ever reach the send. The column defaults to false
  // and the other two handlers never set it.
  let smsSentAt;
  try {
    const sms = await sendSms({
      to: lead.phone,
      consent: lead.sms_consent === true,
      body: `Hi ${firstNameOf(lead.name) || 'there'} — Jadon from New Terrain Creative here. `
          + `Your strategy call is booked for ${whenLabel(start, event.start && event.start.timeZone)}. `
          + `You'll get the calendar invite as well. Reply here if anything changes. `
          + `Reply STOP to opt out.`
    });
    if (sms.sent) { smsSentAt = new Date().toISOString(); report.smsSent++; }
    else report.smsSkipped.push(sms.reason || 'unknown');
  } catch (e) {
    // Unreachable in practice: sendSms resolves rather than throws. Here
    // so a future change cannot make a text message cost us a booking.
    console.error('booking: sms failed', (e && e.message) || e);
  }

  // Record what actually went out, on the row the insert just returned.
  // Bookkeeping only: if this fails the booking is still recorded and
  // the conversion still sent, and the unique constraint still prevents
  // a repeat next run.
  if (bookingRow && bookingRow.id) {
    try {
      await update('bookings', bookingRow.id, {
        schedule_event_id: scheduleEventId,
        schedule_sent_at: scheduleSent ? new Date().toISOString() : undefined,
        sms_sent_at: smsSentAt
      });
    } catch (e) {
      console.error('booking: could not stamp send state', (e && e.message) || e);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Handler
   ══════════════════════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── auth · fail closed ──────────────────────────────────────────────
  // No secret configured means no way to authenticate, which means this
  // must not run at all. Refusing is the safe default: the alternative
  // is a public endpoint that writes conversions.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('sync-bookings: CRON_SECRET is not set, refusing to run');
    return res.status(503).json({ error: 'not configured' });
  }

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> automatically.
  // x-cron-secret is for running it by hand during verification.
  const auth = String(req.headers.authorization || '');
  const header = String(req.headers['x-cron-secret'] || '');
  const presented = auth.startsWith('Bearer ') ? auth.slice(7) : header;

  if (presented !== secret) {
    // No detail. An unauthenticated caller learns nothing about why.
    return res.status(401).json({ error: 'unauthorized' });
  }

  if (!dbReady) return res.status(503).json({ error: 'database not configured' });
  if (!calendarConfigured()) {
    console.error('sync-bookings: google calendar not configured');
    return res.status(503).json({ error: 'calendar not configured' });
  }

  const report = {
    scanned: 0, newBookings: 0, alreadyRecorded: 0,
    ignored: 0, cancelled: 0, smsSent: 0, smsSkipped: [], errors: []
  };

  try {
    const now = Date.now();
    const events = await listCalendarEvents({
      // Appointments from yesterday onward. A call that already happened
      // needs no conversion sent late.
      timeMin: iso(now - 24 * 3600 * 1000),
      timeMax: iso(now + 180 * 24 * 3600 * 1000),
      // Only events created or edited recently, so a steady state sync
      // reads a handful of rows rather than the whole calendar.
      updatedMin: iso(now - LOOKBACK_DAYS * 24 * 3600 * 1000)
    });

    report.scanned = events.length;

    for (const event of events) {
      try {
        // Sequential on purpose. A booking run is a handful of events,
        // and serialising keeps the Supabase writes predictable.
        // eslint-disable-next-line no-await-in-loop
        await processEvent(event, report);
      } catch (e) {
        console.error('sync-bookings: event failed', event && event.id, (e && e.message) || e);
        report.errors.push(`event ${event && event.id}`);
      }
    }
  } catch (e) {
    console.error('sync-bookings failed', (e && e.message) || e);
    return res.status(502).json({ error: 'sync failed', detail: (e && e.message) || 'unknown', report });
  }

  console.log('sync-bookings', JSON.stringify(report));
  return res.status(200).json({ ok: true, ...report });
}
