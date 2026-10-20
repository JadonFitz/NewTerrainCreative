/* GHL booking webhook contract (contract flow 2).

   One booked GHL appointment must produce one Meta Schedule keyed
   schedule_<ntc_session> (the id /call-booked fires in the browser), one
   anonymous `schedule` row with booking_source 'ghl', and one Slack card.
   A redelivery does none of it twice. Modelled on test-iclosed-webhook. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';
process.env.GHL_WEBHOOK_SECRET = 'g'.repeat(40);
process.env.LEAD_CARD_URL = 'https://speed-to-lead.example/api/lead-card';
process.env.LEAD_CARD_SECRET = 'stub-card-secret';

const calls = [];
const seen = new Set();
let supabaseStatus = 201;
let cardStatus = 200;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  const u = String(url);
  calls.push({ url: u, method: opts.method, body, headers: opts.headers || {} });
  if (/supabase/.test(u)) {
    // Mimic the unique index on event_id with ignore-duplicates: a repeat
    // comes back as an empty representation.
    const dup = body && seen.has(body.event_id);
    if (body && supabaseStatus < 300) seen.add(body.event_id);
    return { ok: supabaseStatus < 300, status: supabaseStatus,
             json: async () => (dup ? [] : [body]), text: async () => 'stub' };
  }
  if (/lead-card/.test(u)) return { ok: cardStatus < 300, status: cardStatus, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const logged = [];
for (const k of ['log', 'warn', 'error']) {
  console[k] = ((orig) => (...a) => { logged.push(a.map(String).join(' ')); if (k === 'log' && !/^ghl-webhook/.test(String(a[0]))) orig(...a); })(console[k]);
}

const { default: handler } = await import('../api/ghl-webhook.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(body, key = process.env.GHL_WEBHOOK_SECRET, query = {}) {
  const res = response();
  await handler({ method: 'POST', body, query: { key, ...query },
    headers: { 'x-forwarded-for': '34.1.2.3', 'user-agent': 'GHL-Webhook/1.0' } }, res);
  return res;
}

// GHL's standard workflow webhook body, plus the Custom Data the
// workflow is configured to send (see the header of api/ghl-webhook.js).
let seq = 0;
const appt = (over = {}, custom = {}) => ({
  contact_id: 'c_123', first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace',
  email: 'person@example.com', phone: '+13105550100',
  ntc_company: 'Analytical Engines', ntc_service_investment: '$8K–$12K',
  calendar: { calendarName: 'Growth Strategy Consultation', startTime: '2026-10-22T17:00:00Z',
              appointmentId: `appt_${++seq}` },
  customData: { event: 'booked', ntc_session: 's_abc123', ntc_fbp: 'fb.1.1759900000000.1234567890',
                ntc_fbclid: 'IwAR0abc-DEF_ghi', utm_source: 'meta', utm_campaign: 'grow-la', ...custom },
  ...over
});

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const supa = (list) => list.filter((c) => /supabase/.test(c.url));
const meta = (list) => list.filter((c) => /graph\.facebook\.com/.test(c.url));
const cards = (list) => list.filter((c) => /lead-card/.test(c.url));

console.info('\n\x1b[1mBOOKED\x1b[0m');
let n = calls.length;
const first = appt();
let res = await request(first);
let made = calls.slice(n);
const row = supa(made)[0]?.body;
check('a booking answers 200', res.statusCode === 200 && res.payload.ok === true);
check('one schedule row in funnel_events', supa(made).length === 1 && row?.event_name === 'schedule' &&
  /\/rest\/v1\/funnel_events$/.test(supa(made)[0].url));
check('keyed on (appointment, event)', row?.event_id === `ghl:${first.calendar.appointmentId}:booked`);
check("booking_source 'ghl', filed under the offer", row?.metadata?.booking_source === 'ghl' &&
  row?.funnel === 'paid_retainer' && row?.metadata?.offer === 'paid_retainer');
check('carries the campaign', row?.metadata?.utm_campaign === 'grow-la');
check('holds no contact details', !/person@example|Ada|Lovelace|3105550100|fb\.1\.|IwAR0/.test(JSON.stringify(row || {})));
const ev = meta(made)[0]?.body?.data?.[0];
check('Meta gets one Schedule', meta(made).length === 1 && ev?.event_name === 'Schedule');
check('keyed schedule_<ntc_session>, the id /call-booked fires', ev?.event_id === 'schedule_s_abc123');
check('fbp goes out raw, fbc derived from fbclid', ev?.user_data?.fbp === 'fb.1.1759900000000.1234567890' &&
  /^fb\.1\.[0-9]{13}\.IwAR0abc-DEF_ghi$/.test(ev?.user_data?.fbc || ''));
check('contact details hashed', /^[0-9a-f]{64}$/.test(ev?.user_data?.em?.[0] || '') && ev.user_data.ph && ev.user_data.fn);
check("GHL's server IP is never sent as the booker's", ev?.user_data?.client_ip_address === undefined);
const card = cards(made)[0];
check('the booked card goes to Speed-to-Lead', card?.body?.type === 'booked' && card?.body?.offer === 'growth' &&
  card?.headers?.['x-ntc-key'] === 'stub-card-secret');
check('with the time and the answers on the contact', card?.body?.start_at === '2026-10-22T17:00:00Z' &&
  card?.body?.answers?.ntc_service_investment === '$8K–$12K' &&
  card?.body?.labels?.ntc_company === 'Business Name');

console.info('\n\x1b[1mIDEMPOTENT\x1b[0m');
n = calls.length;
res = await request(first);
made = calls.slice(n);
check('a redelivery is a harmless duplicate', res.statusCode === 200 && res.payload.duplicate === true);
check('and sends no second Schedule or card', meta(made).length === 0 && cards(made).length === 0);
n = calls.length;
res = await request({ ...first, customData: { ...first.customData, event: 'cancelled' } });
check('the same appointment cancelled is a new event', res.payload.event === 'cancelled' &&
  supa(calls.slice(n))[0]?.body?.event_id === `ghl:${first.calendar.appointmentId}:cancelled`);

console.info('\n\x1b[1mRESCHEDULED AND CANCELLED\x1b[0m');
n = calls.length;
res = await request(appt({}, { event: 'rescheduled' }));
made = calls.slice(n);
check('a reschedule is noted', supa(made)[0]?.body?.event_name === 'booking_rescheduled');
check('with no Schedule and no card', meta(made).length === 0 && cards(made).length === 0);
n = calls.length;
res = await request(appt({}, { event: 'cancelled' }));
made = calls.slice(n);
check('a cancellation is noted and carded, no Schedule', supa(made)[0]?.body?.event_name === 'booking_cancelled' &&
  cards(made)[0]?.body?.type === 'cancelled' && meta(made).length === 0);
n = calls.length;
const viaQuery = appt({}, {}); delete viaQuery.customData.event;
res = await request(viaQuery, undefined, { event: 'cancelled' });
check('the event can ride on the URL instead', res.payload.event === 'cancelled');
n = calls.length;
const viaStatus = appt({}, {}); delete viaStatus.customData.event; viaStatus.calendar.appoinmentStatus = 'cancelled';
res = await request(viaStatus);
check("or come from GHL's own appointment status", res.payload.event === 'cancelled');

console.info('\n\x1b[1mOFFERS\x1b[0m');
for (const [cal, funnel] of [['Brand Builder · Story Session', 'brand_builder'], ['Ad Sprint Call', 'ad_sprint'],
  ['5-Day Trial Call', 'trial_pest_control'], ['Signature Project', 'signature_work']]) {
  n = calls.length;
  await request(appt({ calendar: { calendarName: cal, appointmentId: `appt_${++seq}` } }));
  made = calls.slice(n);
  check(`${cal} files under ${funnel}`, supa(made)[0]?.body?.funnel === funnel &&
    meta(made)[0]?.body?.data?.[0]?.custom_data?.offer === funnel);
}
n = calls.length;
await request(appt({ calendar: { calendarName: 'Renamed in GHL', appointmentId: `appt_${++seq}` } }, { offer: 'signature' }));
check('Custom Data offer wins over the calendar name', supa(calls.slice(n))[0]?.body?.funnel === 'signature_work');

console.info('\n\x1b[1mREBOOKINGS ARE NOT NEW BOOKINGS\x1b[0m');
for (const cal of ['Rescheduled Call', 'Quick Follow-Up']) {
  n = calls.length;
  res = await request(appt({ calendar: { calendarName: cal, appointmentId: `appt_${++seq}` } }));
  made = calls.slice(n);
  check(`${cal}: no Schedule, no schedule row`, meta(made).length === 0 &&
    supa(made)[0]?.body?.event_name === 'booking_rebooked');
  check(`${cal}: still carded`, cards(made)[0]?.body?.type === 'booked');
}

console.info('\n\x1b[1mBOOKED FROM /next-step\x1b[0m');
n = calls.length;
await request(appt({ calendar: { calendarName: 'Ad Sprint Call', appointmentId: `appt_${++seq}` } }, { ntc_from: 'next-step' }));
made = calls.slice(n);
check('Meta gets NextStepSprintBooked, not Schedule', meta(made)[0]?.body?.data?.[0]?.event_name === 'NextStepSprintBooked');
check('the row is tagged from next-step', supa(made)[0]?.body?.metadata?.from === 'next-step');

console.info('\n\x1b[1mNO SESSION\x1b[0m');
n = calls.length;
const bare = appt(); delete bare.customData.ntc_session;
await request(bare);
check('falls back to the appointment id', meta(calls.slice(n))[0]?.body?.data?.[0]?.event_id === `schedule_ghl_${bare.calendar.appointmentId}`);
n = calls.length;
await request(appt({}, { ntc_session: 'bad id with spaces' }));
check('a malformed session is never used as the id', /^schedule_ghl_/.test(meta(calls.slice(n))[0]?.body?.data?.[0]?.event_id || ''));
n = calls.length;
const arr = appt(); delete arr.customData.ntc_session;
arr.customFields = [{ fieldKey: 'contact.ntc_session', value: 's_fromarray' }];
await request(arr);
check("reads GHL's customFields array too", meta(calls.slice(n))[0]?.body?.data?.[0]?.event_id === 'schedule_s_fromarray');

console.info('\n\x1b[1mWHAT MUST NOT RUN\x1b[0m');
n = calls.length;
res = await request(appt(), 'wrong-key');
check('a bad key is refused and does nothing', res.statusCode === 401 && calls.length === n);
const saved = process.env.GHL_WEBHOOK_SECRET; process.env.GHL_WEBHOOK_SECRET = 'short';
res = await request(appt(), 'short');
check('a short secret fails closed', res.statusCode === 503);
process.env.GHL_WEBHOOK_SECRET = saved;
n = calls.length;
res = await request({ email: 'person@example.com', customData: { event: 'booked' } });
check('no appointment id: 200, nothing sent', res.statusCode === 200 && res.payload.noted === false && calls.length === n);

console.info('\n\x1b[1mFAILURE ISOLATION\x1b[0m');
supabaseStatus = 500;
n = calls.length;
res = await request(appt());
made = calls.slice(n);
check('a database failure still answers 200', res.statusCode === 200 && res.payload.stored === false);
check('and still sends Meta and the card', meta(made).length === 1 && cards(made).length === 1);
supabaseStatus = 201; cardStatus = 500;
res = await request(appt());
check('a failed card does not fail the webhook', res.statusCode === 200 && res.payload.sent === true);
cardStatus = 200;

check('no log line carries a contact detail',
  !/person@example|Lovelace|3105550100|IwAR0/.test(logged.join('\n')));

console.info(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · one appointment, one conversion, one anonymous row, one card'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
