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
process.env.GHL_API_TOKEN = 'stub-ghl-token';

// The contact's opportunities as GHL's search would return them.
const STAGE = { started: 'cf946fe5-8597-4fe7-b8f2-8f4c6db47894', dq: '67599a1a-08ed-43f3-a98a-43f7442da375',
  booked: '11653ab6-34fd-4b39-858f-1393fe1f07f3', showed: 'e6098816-7bc3-4550-a76c-9dddfffac2e6',
  noshow: '9c73f2ae-511a-4db6-ac2d-7cf2900340a3', plan: '1cad566a-54d9-45b1-8316-358addf6c7db',
  won: 'bb538a91-4b20-4bbd-9664-2ab1bf068370', lost: '840782d0-59e3-4d34-ba1a-7bb08187550a' };
let ghlOpps = [];
const SALES = 'gVWhpLqxgmOyTgyrGeKJ';
const own = (o) => ({ contactId: 'c_123', pipelineId: SALES, ...o });
let ghlStatus = 200;

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
  if (/leadconnectorhq/.test(u)) {
    const out = /\/opportunities\/search/.test(u) ? { opportunities: ghlOpps }
      : /\/opportunities\/$/.test(u) ? { opportunity: { id: 'o_new' } } : {};
    return { ok: ghlStatus < 300, status: ghlStatus, json: async () => out, text: async () => '' };
  }
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
let before = logged.length;
await request(bare);
check('falls back to the appointment id', meta(calls.slice(n))[0]?.body?.data?.[0]?.event_id === `schedule_ghl_${bare.calendar.appointmentId}`);
const loud = logged.slice(before).find((l) => /no usable ntc_session/.test(l)) || '';
check('and says so loudly, with the appointment id and nothing personal',
  loud.includes(bare.calendar.appointmentId) && !/person@example|Lovelace|3105550100/.test(loud));
before = logged.length;
await request(appt({ calendar: { calendarName: 'Rescheduled Call', appointmentId: `appt_${++seq}` } }, { ntc_session: undefined }));
check('not for a rebooking, which sends no Schedule', !logged.slice(before).some((l) => /no usable ntc_session/.test(l)));
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
n = calls.length;
res = await request(appt(), 'g'.repeat(39) + 'h');
check('a same-length wrong key is refused too (constant-time compare)', res.statusCode === 401 && calls.length === n);
const src = await (await import('node:fs/promises')).readFile(new URL('../api/ghl-webhook.js', import.meta.url), 'utf8');
check('the key is compared with timingSafeEqual on digests', /timingSafeEqual\(sha\(key\), sha\(SECRET\)\)/.test(src) &&
  !/key !== SECRET/.test(src));
n = calls.length;
let errs = logged.length;
res = await request({ calendar: { id: 'cal_EdeZLdlKq7Y3Qa9Q1JU8', calendarName: 'Growth Strategy Consultation' },
  email: 'person@example.com', customData: { event: 'booked' } });
check('calendar.id is never taken as the appointment id', res.payload.noted === false && calls.length === n);
check('and the miss is logged', logged.slice(errs).some((l) => /missing event or appointment id/.test(l)));
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

console.info('\n\x1b[1mTHE OPPORTUNITY MOVES TO BOOKED\x1b[0m');
const ghlCalls = (list) => list.filter((c) => /leadconnectorhq/.test(c.url));
const puts = (list) => ghlCalls(list).filter((c) => c.method === 'PUT');
const creates = (list) => ghlCalls(list).filter((c) => c.method === 'POST' && /\/opportunities\/$/.test(c.url));

ghlOpps = [own({ id: 'o_open', pipelineStageId: STAGE.started, status: 'open' })];
n = calls.length;
const bookIt = appt();
res = await request(bookIt);
made = calls.slice(n);
const search = ghlCalls(made).find((c) => /\/opportunities\/search/.test(c.url));
const sq = search && new URL(search.url).searchParams;
check('filters by contact and pipeline in both spellings',
  sq?.get('contactId') === 'c_123' && sq?.get('contact_id') === 'c_123' &&
  sq?.get('pipelineId') === SALES && sq?.get('pipeline_id') === SALES &&
  sq?.get('locationId') === 'kzOVdsNR0ozcoyyaag0a' && sq?.get('location_id') === 'kzOVdsNR0ozcoyyaag0a');
check('Started form moves to Booked', res.payload.opportunity === 'moved' && puts(made).length === 1 &&
  /\/opportunities\/o_open$/.test(puts(made)[0].url) && puts(made)[0].body.pipelineStageId === STAGE.booked);
check('stage only: name and value untouched', puts(made)[0]?.body?.name === undefined &&
  puts(made)[0]?.body?.monetaryValue === undefined);
n = calls.length;
res = await request(bookIt);
check('a redelivery touches GHL not at all', res.payload.duplicate === true && ghlCalls(calls.slice(n)).length === 0);

ghlOpps = [own({ id: 'o_dq', pipelineStageId: STAGE.dq, status: 'open' })];
n = calls.length;
await request(appt());
check('Disqualified who booked anyway moves to Booked', puts(calls.slice(n))[0]?.body?.pipelineStageId === STAGE.booked);

ghlOpps = [own({ id: 'o_b', pipelineStageId: STAGE.booked, status: 'open' })];
n = calls.length;
res = await request(appt());
check('already Booked is left alone', res.payload.opportunity === 'kept (already Booked)' && puts(calls.slice(n)).length === 0);

for (const [name, id] of [['Showed', STAGE.showed], ['No-show', STAGE.noshow], ['Plan sent', STAGE.plan],
                          ['Won', STAGE.won], ['Lost', STAGE.lost]]) {
  ghlOpps = [own({ id: 'o_past', pipelineStageId: id, status: 'open' })];
  n = calls.length;
  res = await request(appt({ calendar: { calendarName: 'Rescheduled Call', appointmentId: `appt_${++seq}` } }));
  check(`never backward from ${name}`, /past Booked/.test(res.payload.opportunity) &&
    puts(calls.slice(n)).length === 0 && creates(calls.slice(n)).length === 0);
}

// The API ignored the filters and answered with the whole location:
// other leads' deals, and this lead's deal in another pipeline. None of
// them may be moved; with nothing of ours left, a new one is created.
ghlOpps = [
  { id: 'o_other_lead', contactId: 'c_999', pipelineId: SALES, pipelineStageId: STAGE.started, status: 'open' },
  { id: 'o_other_nested', contact: { id: 'c_998' }, pipelineId: SALES, pipelineStageId: STAGE.dq, status: 'open' },
  { id: 'o_other_pipe', contactId: 'c_123', pipelineId: 'pipe_other', pipelineStageId: STAGE.started, status: 'open' },
  { id: 'o_no_contact', pipelineId: SALES, pipelineStageId: STAGE.started, status: 'open' },
  { id: 'o_no_pipe', contactId: 'c_123', pipelineStageId: STAGE.started, status: 'open' }
];
n = calls.length;
res = await request(appt());
made = calls.slice(n);
check("filters ignored by the API: no other lead's or pipeline's deal is touched",
  puts(made).length === 0 && res.payload.opportunity === 'created');
ghlOpps.push({ id: 'o_nested_ok', contact: { id: 'c_123' }, pipelineId: SALES, pipelineStageId: STAGE.started, status: 'open' });
n = calls.length;
res = await request(appt());
made = calls.slice(n);
check('only the matching deal moves, read from contact.id too',
  puts(made).length === 1 && /\/opportunities\/o_nested_ok$/.test(puts(made)[0].url));
ghlOpps = [{ id: 'o_other_won', contactId: 'c_999', pipelineId: SALES, pipelineStageId: STAGE.won, status: 'open' }];
res = await request(appt());
check("another lead's later stage never blocks this lead", res.payload.opportunity === 'created');

// Growth disqualified, then the /next-step Ad Sprint call: the Sprint
// form opened its own Started form deal, and the booking must move that
// one, never the Growth deal at Disqualified, whatever order GHL lists.
ghlOpps = [
  own({ id: 'o_growth_dq', pipelineStageId: STAGE.dq, status: 'open', updatedAt: '2026-10-20T12:00:00Z' }),
  own({ id: 'o_sprint', pipelineStageId: STAGE.started, status: 'open', updatedAt: '2026-10-20T11:00:00Z' })
];
n = calls.length;
res = await request(appt({ calendar: { calendarName: 'Ad Sprint Call', appointmentId: `appt_${++seq}` } }, { ntc_from: 'next-step' }));
made = calls.slice(n);
check('Growth turned away, then the next-step Sprint booked: the Sprint deal moves',
  puts(made).length === 1 && /\/opportunities\/o_sprint$/.test(puts(made)[0].url));
ghlOpps = [
  own({ id: 'o_sf_old', pipelineStageId: STAGE.started, status: 'open', createdAt: '2026-10-18T09:00:00Z' }),
  own({ id: 'o_sf_new', pipelineStageId: STAGE.started, status: 'open', createdAt: '2026-10-20T09:00:00Z' })
];
n = calls.length;
await request(appt());
check('of two Started form deals, the newest moves', /\/opportunities\/o_sf_new$/.test(puts(calls.slice(n))[0]?.url || ''));
ghlOpps = [
  own({ id: 'o_dq2', pipelineStageId: STAGE.dq, status: 'open', updatedAt: '2026-10-20T12:00:00Z' }),
  own({ id: 'o_bk', pipelineStageId: STAGE.booked, status: 'open', updatedAt: '2026-10-19T12:00:00Z' })
];
n = calls.length;
res = await request(appt());
check('a deal already Booked wins over a Disqualified one: nothing moves',
  res.payload.opportunity === 'kept (already Booked)' && puts(calls.slice(n)).length === 0);
ghlOpps = [own({ id: 'o_dq3', pipelineStageId: STAGE.dq, status: 'open' })];
n = calls.length;
await request(appt());
check('only a Disqualified deal: that one moves', /\/opportunities\/o_dq3$/.test(puts(calls.slice(n))[0]?.url || ''));

ghlOpps = [];
n = calls.length;
res = await request(appt());
made = calls.slice(n);
const cr = creates(made)[0]?.body;
check('none open: one is created at Booked', res.payload.opportunity === 'created' &&
  cr?.pipelineStageId === STAGE.booked && cr?.pipelineId === 'gVWhpLqxgmOyTgyrGeKJ' && cr?.contactId === 'c_123');
check('named and valued like the form does it', cr?.name === 'Ada Lovelace · Growth Strategy Consultation' &&
  cr?.monetaryValue === 8000);
ghlOpps = [own({ id: 'o_won_old', pipelineStageId: STAGE.won, status: 'won' })];
n = calls.length;
res = await request(appt());
check('a closed (won or lost) opportunity does not block a new booking', res.payload.opportunity === 'created');

ghlOpps = [own({ id: 'o_open', pipelineStageId: STAGE.started, status: 'open' })];
n = calls.length;
res = await request(appt({}, { event: 'cancelled' }));
check('a cancellation does not touch the pipeline', ghlCalls(calls.slice(n)).length === 0);

ghlStatus = 500;
n = calls.length;
res = await request(appt());
made = calls.slice(n);
check('GHL down: still 200, Meta and the card still go', res.statusCode === 200 && res.payload.opportunity === 'failed' &&
  meta(made).length === 1 && cards(made).length === 1);
ghlStatus = 200;
const savedToken = process.env.GHL_API_TOKEN; delete process.env.GHL_API_TOKEN;
n = calls.length;
res = await request(appt());
check('no GHL token: the pipeline is skipped, nothing else changes', ghlCalls(calls.slice(n)).length === 0 &&
  res.payload.sent === true);
process.env.GHL_API_TOKEN = savedToken;

check('no log line carries a contact detail',
  !/person@example|Lovelace|3105550100|IwAR0/.test(logged.join('\n')));

console.info(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · one appointment, one conversion, one anonymous row, one card'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
