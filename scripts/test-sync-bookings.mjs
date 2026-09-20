/* ══════════════════════════════════════════════════════════════════════
   End-to-end exercise of /api/sync-bookings.
   ──────────────────────────────────────────────────────────────────────
   This endpoint is the only thing allowed to say an appointment exists,
   so the properties that matter are negative ones: it must not run
   unauthenticated, must not emit Schedule twice for one booking, must
   not touch Twilio without consent, and must not invent a conversion for
   a calendar event that has nothing to do with the funnel.
   ══════════════════════════════════════════════════════════════════════ */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';
process.env.CRON_SECRET = 'stub-cron-secret';
process.env.GOOGLE_CALENDAR_ID = 'bookings@newterraincreative.com';
process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'sync@ntc-test.iam.gserviceaccount.com';

/* A real RSA key, generated here and never committed, so the JWT signing
   path is genuinely exercised rather than stubbed past. */
const { generateKeyPairSync } = await import('node:crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.GOOGLE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

/* ── the fake world ──────────────────────────────────────────────────── */
const calls = [];
let leadsTable = [];
let bookingsTable = [];
let calendarEvents = [];
let failTwilio = false;
let twilioConfigured = false;

const qs = (url) => Object.fromEntries(new URL(url).searchParams.entries());

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: u, method: opts.method || 'GET', body });

  // ── Google token ──
  if (u.includes('oauth2.googleapis.com/token')) {
    return { ok: true, status: 200, json: async () => ({ access_token: 'stub-token', expires_in: 3600 }) };
  }

  // ── Google Calendar ──
  if (u.includes('googleapis.com/calendar')) {
    return { ok: true, status: 200, json: async () => ({ items: calendarEvents }) };
  }

  // ── Supabase ──
  if (u.includes('supabase.co')) {
    const path = new URL(u).pathname;

    if (path.endsWith('/leads') && opts.method === 'GET') {
      const params = qs(u);
      const want = String(params.email || '').replace(/^ilike\./, '').toLowerCase();
      const rows = leadsTable
        .filter((l) => l.email.toLowerCase() === want)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return { ok: true, status: 200, json: async () => rows, text: async () => '' };
    }

    if (path.endsWith('/funnel_events') && opts.method === 'GET') {
      return { ok: true, status: 200, json: async () => [], text: async () => '' };
    }

    if (path.endsWith('/bookings') && opts.method === 'GET') {
      return { ok: true, status: 200, json: async () => bookingsTable, text: async () => '' };
    }

    if (path.endsWith('/bookings') && opts.method === 'POST') {
      // The UNIQUE constraint, simulated. This is the whole idempotency
      // design, so the test models Postgres rejecting the second write
      // rather than the handler choosing to skip it.
      const exists = bookingsTable.some((b) => b.calendar_event_id === body.calendar_event_id);
      if (exists) {
        return { ok: false, status: 409, text: async () => 'duplicate key value violates unique constraint' };
      }
      const row = { id: `booking-${bookingsTable.length + 1}`, ...body };
      bookingsTable.push(row);
      return { ok: true, status: 201, json: async () => [row], text: async () => '' };
    }

    if (path.endsWith('/funnel_events') && opts.method === 'POST') {
      return { ok: true, status: 201, json: async () => [body], text: async () => '' };
    }

    if (opts.method === 'PATCH') {
      return { ok: true, status: 200, json: async () => [body], text: async () => '' };
    }

    return { ok: true, status: 200, json: async () => [], text: async () => '' };
  }

  if (u.includes('facebook.com')) {
    return { ok: true, status: 200, json: async () => ({ events_received: 1 }), text: async () => '' };
  }

  if (u.includes('twilio.com')) {
    if (!twilioConfigured) throw new Error('twilio called while unconfigured');
    return failTwilio
      ? { ok: false, status: 500, text: async () => 'simulated twilio outage' }
      : { ok: true, status: 201, json: async () => ({ sid: 'SM-stub' }), text: async () => '' };
  }

  throw new Error(`unexpected fetch ${u}`);
};

const { default: handler } = await import('../api/sync-bookings.js');

function mockRes() {
  const r = { statusCode: 0, payload: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

const run = async (headers = { authorization: 'Bearer stub-cron-secret' }, method = 'GET') => {
  const res = mockRes();
  await handler({ method, headers }, res);
  return res;
};

const since = (n) => calls.slice(n);
const hit = (list, frag) => list.filter((c) => c.url.includes(frag));
const metaEvents = (list) => hit(list, 'facebook.com').map((c) => c.body?.data?.[0]);

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const soon = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
const later = new Date(Date.now() + 3 * 24 * 3600 * 1000 + 1800_000).toISOString();

const appointment = (id, email, extra = {}) => ({
  id,
  status: 'confirmed',
  summary: 'Strategy call',
  start: { dateTime: soon, timeZone: 'America/Los_Angeles' },
  end: { dateTime: later },
  attendees: [
    { email: 'business@newterraincreative.com', organizer: true, self: true },
    { email, responseStatus: 'accepted' }
  ],
  ...extra
});

const lead = (over = {}) => ({
  id: 'lead-1', name: 'Dana Reyes', email: 'dana@ntc-test.invalid',
  phone: '3105550143', form_type: 'strategy_call', sms_consent: false,
  booked_at: null, created_at: '2026-09-01T10:00:00Z',
  fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc', utm_campaign: 'dentist-la',
  utm_content: 'clock-ad', industry: 'Dental practice', ...over
});

function reset() {
  leadsTable = [lead()];
  bookingsTable = [];
  calendarEvents = [];
  failTwilio = false;
}

/* ══════════════════════════════════════════════════════════════════════
   SECURITY · this endpoint writes conversions, so it must not be open
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mSECURITY\x1b[0m');
reset();
let n = calls.length;
let res = await run({});
check('no credentials is 401', res.statusCode === 401, String(res.statusCode));
check('unauthenticated request touches nothing', since(n).length === 0, `${since(n).length} calls`);
check('401 body leaks no detail', JSON.stringify(res.payload) === '{"error":"unauthorized"}');

n = calls.length;
res = await run({ authorization: 'Bearer wrong-secret' });
check('a wrong secret is 401', res.statusCode === 401);
check('wrong secret touches nothing', since(n).length === 0);

res = await run({ 'x-cron-secret': 'stub-cron-secret' });
check('the manual header is accepted', res.statusCode === 200);

res = await run({ authorization: 'Bearer stub-cron-secret' }, 'DELETE');
check('an unsupported method is 405', res.statusCode === 405);

/* Fail closed: with no secret configured there is no way to
   authenticate, so the endpoint must refuse rather than run open. */
const savedSecret = process.env.CRON_SECRET;
delete process.env.CRON_SECRET;
n = calls.length;
res = await run({});
check('no CRON_SECRET configured refuses to run', res.statusCode === 503, String(res.statusCode));
check('refusing to run touches nothing', since(n).length === 0);
process.env.CRON_SECRET = savedSecret;

/* ══════════════════════════════════════════════════════════════════════
   MATCHING
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mMATCHING · attendee email, nothing else\x1b[0m');
reset();
calendarEvents = [appointment('evt-aaa', 'dana@ntc-test.invalid')];
n = calls.length;
res = await run();
let made = since(n);
check('sync succeeds', res.statusCode === 200 && res.payload.ok === true);
check('one new booking recorded', res.payload.newBookings === 1, JSON.stringify(res.payload));
check('booking row carries the calendar event id',
  bookingsTable[0]?.calendar_event_id === 'evt-aaa');
check('booking row is attached to the lead', bookingsTable[0]?.lead_id === 'lead-1');
check('appointment times are copied across',
  bookingsTable[0]?.appointment_start === soon && bookingsTable[0]?.appointment_end === later);
check('funnel is resolved for attribution',
  bookingsTable[0]?.funnel === 'paid_retainer', bookingsTable[0]?.funnel);

const leadPatch = made.find((c) => c.method === 'PATCH' && c.url.includes('/leads'));
check('lead is stamped booked_at', Boolean(leadPatch?.body?.booked_at));
check('lead moves to call_scheduled', leadPatch?.body?.sales_stage === 'call_scheduled');
check('scheduled_at is NOT set by hand · the 0003 trigger owns it',
  !('scheduled_at' in (leadPatch?.body || {})));
check('booking source is recorded',
  leadPatch?.body?.booking_source === 'google_appointment_schedule');

const fe = made.find((c) => c.method === 'POST' && c.url.includes('/funnel_events'));
check('one first-party schedule event', fe?.body?.event_name === 'schedule', fe?.body?.event_name);
check('schedule event id is deterministic',
  fe?.body?.event_id === 'schedule-evt-aaa', fe?.body?.event_id);
check('schedule event keeps the funnel', fe?.body?.funnel === 'paid_retainer');

const meta = metaEvents(made);
check('exactly one Meta event', meta.length === 1, `${meta.length}`);
check('it is Schedule', meta[0]?.event_name === 'Schedule', meta[0]?.event_name);
check('Meta uses the same deterministic id',
  meta[0]?.event_id === 'schedule-evt-aaa', meta[0]?.event_id);
check('ad attribution is carried by the stored fbp/fbc',
  meta[0]?.user_data?.fbp === 'fb.1.123.456' && meta[0]?.user_data?.fbc === 'fb.1.123.abc');
check('email is hashed, never plaintext',
  /^[a-f0-9]{64}$/.test(meta[0]?.user_data?.em?.[0] || '')
  && !JSON.stringify(meta[0]).includes('dana@ntc-test.invalid'));
check('offer and form_type survive onto the conversion',
  meta[0]?.custom_data?.offer === 'paid_retainer'
  && meta[0]?.custom_data?.form_type === 'strategy_call');

/* ══════════════════════════════════════════════════════════════════════
   IDEMPOTENCY · the property everything else depends on
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mIDEMPOTENCY · re-running must change nothing\x1b[0m');
n = calls.length;
res = await run();
made = since(n);
check('second run reports no new bookings', res.payload.newBookings === 0, JSON.stringify(res.payload));
check('second run recognises it was already recorded', res.payload.alreadyRecorded === 1);
check('no second booking row', bookingsTable.length === 1, `${bookingsTable.length} rows`);
check('no second Schedule to Meta', metaEvents(made).length === 0);
check('no second funnel event',
  made.filter((c) => c.method === 'POST' && c.url.includes('/funnel_events')).length === 0);
check('the lead is not re-stamped',
  made.filter((c) => c.method === 'PATCH' && c.url.includes('/leads')).length === 0);

n = calls.length;
await run(); await run(); await run();
check('running three more times still changes nothing',
  metaEvents(since(n)).length === 0 && bookingsTable.length === 1);

/* ══════════════════════════════════════════════════════════════════════
   UNRELATED EVENTS
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mUNRELATED CALENDAR EVENTS · ignored, not recorded\x1b[0m');
reset();
calendarEvents = [
  // an ordinary meeting with someone who never filled in a form
  appointment('evt-personal', 'accountant@example.invalid'),
  // a solo calendar block with no attendees at all
  { id: 'evt-solo', status: 'confirmed', summary: 'Edit day',
    start: { dateTime: soon }, end: { dateTime: later } },
  // a cancelled booking must not look like a new one
  appointment('evt-gone', 'dana@ntc-test.invalid', { status: 'cancelled' })
];
n = calls.length;
res = await run();
made = since(n);
check('nothing is booked', res.payload.newBookings === 0, JSON.stringify(res.payload));
check('two events are ignored as unmatched', res.payload.ignored === 2, String(res.payload.ignored));
check('the cancelled one is counted separately', res.payload.cancelled === 1);
check('no booking rows written', bookingsTable.length === 0);
check('no Schedule conversion for any of them', metaEvents(made).length === 0);
check('an event title alone never matches a lead',
  !made.some((c) => c.method === 'POST' && c.url.includes('/bookings')));

/* ══════════════════════════════════════════════════════════════════════
   MULTIPLE LEADS, ONE EMAIL · the documented rule
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mDUPLICATE EMAILS · most recent unscheduled wins\x1b[0m');
reset();
leadsTable = [
  lead({ id: 'lead-old', created_at: '2026-08-01T10:00:00Z' }),
  lead({ id: 'lead-booked', created_at: '2026-09-10T10:00:00Z', booked_at: '2026-09-11T10:00:00Z' }),
  lead({ id: 'lead-newest-open', created_at: '2026-09-05T10:00:00Z' })
];
calendarEvents = [appointment('evt-dup', 'dana@ntc-test.invalid')];
res = await run();
check('the already-booked lead is skipped even though it is newest',
  bookingsTable[0]?.lead_id !== 'lead-booked');
check('the most recent UNSCHEDULED lead wins',
  bookingsTable[0]?.lead_id === 'lead-newest-open', bookingsTable[0]?.lead_id);

/* When every lead for that address has already booked, the booking still
   attributes rather than being dropped. Uniqueness on calendar_event_id
   is what stops this double counting, not the choice of lead. */
reset();
leadsTable = [
  lead({ id: 'lead-a', created_at: '2026-08-01T10:00:00Z', booked_at: '2026-08-02T10:00:00Z' }),
  lead({ id: 'lead-b', created_at: '2026-09-09T10:00:00Z', booked_at: '2026-09-10T10:00:00Z' })
];
calendarEvents = [appointment('evt-second-call', 'dana@ntc-test.invalid')];
res = await run();
check('all-booked falls back to the most recent lead',
  bookingsTable[0]?.lead_id === 'lead-b', bookingsTable[0]?.lead_id);
check('the booking is still recorded rather than dropped', res.payload.newBookings === 1);

/* Case differences between the form and the calendar must still match. */
reset();
calendarEvents = [appointment('evt-case', 'Dana@NTC-Test.Invalid')];
res = await run();
check('matching is case-insensitive', res.payload.newBookings === 1, JSON.stringify(res.payload));

/* ══════════════════════════════════════════════════════════════════════
   SMS · consent is the gate, not the phone number
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mSMS · dormant without consent AND configuration\x1b[0m');

// 1 · consent false, Twilio absent (the state this ships in)
reset();
calendarEvents = [appointment('evt-sms-1', 'dana@ntc-test.invalid')];
n = calls.length;
res = await run();
check('booking succeeds with no Twilio configured', res.payload.newBookings === 1);
check('no Twilio call without consent', hit(since(n), 'twilio.com').length === 0);
check('Schedule still fires', metaEvents(since(n)).length === 1);
check('the skip reason is reported', res.payload.smsSkipped.includes('no sms consent'));

// 2 · consent TRUE but Twilio not configured — must still not call, must not fail
reset();
leadsTable = [lead({ form_type: 'founding_application', sms_consent: true })];
calendarEvents = [appointment('evt-sms-2', 'dana@ntc-test.invalid')];
n = calls.length;
res = await run();
check('consent without configuration sends nothing',
  hit(since(n), 'twilio.com').length === 0);
check('booking still succeeds', res.payload.newBookings === 1);
check('Schedule still fires', metaEvents(since(n)).length === 1);
check('the skip reason names configuration',
  res.payload.smsSkipped.includes('twilio not configured'));

// 3 · a funnel with no consent question can never become eligible
reset();
leadsTable = [lead({ form_type: 'strategy_call', sms_consent: false })];
calendarEvents = [appointment('evt-sms-3', 'dana@ntc-test.invalid')];
n = calls.length;
await run();
check('a strategy-call lead is never texted', hit(since(n), 'twilio.com').length === 0);

reset();
leadsTable = [lead({ form_type: 'project_enquiry', sms_consent: false })];
calendarEvents = [appointment('evt-sms-4', 'dana@ntc-test.invalid')];
n = calls.length;
await run();
check('a project lead is never texted', hit(since(n), 'twilio.com').length === 0);

/* ══════════════════════════════════════════════════════════════════════
   SMS · the activated path, and its failure mode
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mSMS · once Twilio is actually activated\x1b[0m');
process.env.TWILIO_ACCOUNT_SID = 'ACstub';
process.env.TWILIO_AUTH_TOKEN = 'stub-token';
process.env.TWILIO_PHONE_NUMBER = '+15555550100';
twilioConfigured = true;

// The module read its config at import, so re-import under a fresh
// registry key to pick the activated state up.
const { sendSms } = await import('../api/_messaging.js?activated=1');

let sms = await sendSms({ to: '3105550143', body: 'test', consent: true });
check('a consented send reaches Twilio', sms.sent === true);
const last = calls[calls.length - 1];
check('it posts to the Messages endpoint', last.url.includes('/Messages.json'));
check('the number is normalised to E.164', String(last.body).includes('%2B13105550143')
  || decodeURIComponent(String(last.body)).includes('+13105550143'));

n = calls.length;
sms = await sendSms({ to: '3105550143', body: 'test', consent: false });
check('consent false never reaches Twilio',
  sms.sent === false && hit(since(n), 'twilio.com').length === 0);
n = calls.length;
sms = await sendSms({ to: '3105550143', body: 'test', consent: 'yes' });
check('a truthy non-true consent is refused',
  sms.sent === false && hit(since(n), 'twilio.com').length === 0, String(sms.reason));
n = calls.length;
sms = await sendSms({ to: '3105550143', body: 'test', consent: undefined });
check('missing consent is refused', sms.sent === false && hit(since(n), 'twilio.com').length === 0);

sms = await sendSms({ to: 'not-a-number', body: 'test', consent: true });
check('an unusable number is refused, not sent', sms.sent === false, String(sms.reason));

failTwilio = true;
sms = await sendSms({ to: '3105550143', body: 'test', consent: true });
check('a Twilio outage resolves rather than throwing', sms.sent === false);
check('the outage is reported, not swallowed', Boolean(sms.error));
failTwilio = false;

delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_PHONE_NUMBER;
twilioConfigured = false;

/* ══════════════════════════════════════════════════════════════════════
   CONFIGURATION AND FAILURE
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mCONFIGURATION\x1b[0m');
const savedCalendar = process.env.GOOGLE_CALENDAR_ID;
delete process.env.GOOGLE_CALENDAR_ID;
const { default: unconfigured } = await import('../api/sync-bookings.js?nocal=1');
let r2 = mockRes();
await unconfigured({ method: 'GET', headers: { authorization: 'Bearer stub-cron-secret' } }, r2);
check('an unconfigured calendar reports 503, it does not crash', r2.statusCode === 503);
check('the 503 names no secret', !JSON.stringify(r2.payload).match(/key|token|secret/i));
process.env.GOOGLE_CALENDAR_ID = savedCalendar;

console.log('\n\x1b[1mNO SECRET LEAKS\x1b[0m');
const everything = JSON.stringify(calls);
check('no private key in any outbound request', !everything.includes('BEGIN PRIVATE KEY'));
check('no cron secret in any outbound request', !everything.includes('stub-cron-secret'));
check('no service role key posted anywhere but Supabase',
  calls.filter((c) => JSON.stringify(c.body || '').includes('stub-service-key')).length === 0);

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · a booking becomes exactly one Schedule, once, and only when it is real'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
