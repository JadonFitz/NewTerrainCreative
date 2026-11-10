/* GHL lead stage events (New Lead, Contacted, Won) into ghl_lead_events.

   One delivery is one row keyed on delivery_key; a redelivery is a
   harmless duplicate; nothing answers without the key; no answer ever
   echoes the payload. Modelled on test-ghl-webhook. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.GHL_LEAD_EVENTS_SECRET = 'k'.repeat(40);

const calls = [];
const seen = new Set();
let supabaseStatus = 201;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  const u = String(url);
  calls.push({ url: u, method: opts.method, body });
  if (/supabase/.test(u)) {
    // Mimic the unique index on delivery_key with ignore-duplicates.
    const dup = body && seen.has(body.delivery_key);
    if (body && supabaseStatus < 300) seen.add(body.delivery_key);
    return { ok: supabaseStatus < 300, status: supabaseStatus,
             json: async () => (dup ? [] : [body]), text: async () => 'stub' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const logged = [];
for (const k of ['log', 'warn', 'error']) {
  console[k] = ((orig) => (...a) => { logged.push(a.map(String).join(' ')); if (k === 'log' && !/^ghl-lead-events/.test(String(a[0]))) orig(...a); })(console[k]);
}

const { default: handler } = await import('../api/ghl-lead-events.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(body, key = process.env.GHL_LEAD_EVENTS_SECRET, query = {}, method = 'POST') {
  const res = response();
  await handler({ method, body, query: { key, ...query }, headers: {} }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const supa = (list) => list.filter((c) => /supabase/.test(c.url));

// The Custom Data the spec asks the Contacted workflow to send.
const contacted = (over = {}) => ({
  customData: {
    event: 'stage_contacted', location_id: 'Ab12Cd34Ef56Gh78Ij90', location_name: 'SWFL Famous Installations',
    contact_id: 'q8Xc2LmN4pRt7VbA1sKd', first_name: 'Dana', last_name: 'Reyes',
    email: 'Dana.Reyes@Example.com', phone: '+12395550142', source: 'Meta lead form',
    service_requested: 'Impact windows', opportunity_id: 'Hn3Jk9Pq2Wx5Yz7Lm1Bc',
    opportunity_name: 'Dana Reyes - Impact windows', pipeline_stage: 'Contacted',
    monetary_value: '$8,500', assigned_user_email: 'owner@client-business.com',
    date_added: '2026-11-03T15:42:00Z', ...over
  }
});

console.info('\n\x1b[1mCONTACTED\x1b[0m');
let n = calls.length;
let res = await request(contacted());
let made = calls.slice(n);
const row = supa(made)[0]?.body;
check('answers 200, stored', res.statusCode === 200 && res.payload.ok === true && res.payload.stored === true);
check('one row in ghl_lead_events', supa(made).length === 1 && /\/rest\/v1\/ghl_lead_events$/.test(supa(made)[0].url));
check('keyed event:location:opportunity', row?.delivery_key === 'stage_contacted:Ab12Cd34Ef56Gh78Ij90:Hn3Jk9Pq2Wx5Yz7Lm1Bc');
check('carries the lead', row?.first_name === 'Dana' && row?.phone === '+12395550142' &&
  row?.service_requested === 'Impact windows' && row?.location_name === 'SWFL Famous Installations');
check('email lowercased', row?.email === 'dana.reyes@example.com');
check('deal value parsed from "$8,500"', row?.monetary_value === 8500);
check('date_added stored as ISO', row?.ghl_date_added === '2026-11-03T15:42:00.000Z');
check('answer echoes nothing of the lead', !/Dana|Reyes|2395550142|example\.com|Impact/.test(JSON.stringify(res.payload)));
check('log holds no name, email or phone', !logged.some((l) => /Dana|Reyes|2395550142|example\.com/.test(l)));

console.info('\n\x1b[1mIDEMPOTENT\x1b[0m');
res = await request(contacted());
check('a redelivery is a harmless duplicate', res.statusCode === 200 && res.payload.duplicate === true);
n = calls.length;
res = await request(contacted({ event_id: 'evt_42' }));
check("the workflow's own event_id wins the key",
  supa(calls.slice(n))[0]?.body?.delivery_key === 'stage_contacted:evt_42' && res.payload.stored === true);

console.info('\n\x1b[1mNEW LEAD AND WON\x1b[0m');
n = calls.length;
res = await request({ contact_id: 'c_new1', first_name: 'Sam', email: 'sam@example.com',
  location: { id: 'Ab12Cd34Ef56Gh78Ij90', name: 'SWFL Famous Installations' } }, undefined, { event: 'new_lead' });
const nl = supa(calls.slice(n))[0]?.body;
check('new lead from the URL event and GHL standard body', res.payload.stored === true && nl?.event === 'new_lead' &&
  nl?.location_id === 'Ab12Cd34Ef56Gh78Ij90' && nl?.location_name === 'SWFL Famous Installations');
check('a new lead with no opportunity keys on the contact', nl?.delivery_key === 'new_lead:Ab12Cd34Ef56Gh78Ij90:c_new1');
res = await request(contacted({ event: 'Won', opportunity_id: 'opp_won_1' }));
check('"Won" in any case is won', res.payload.event === 'won' && res.payload.stored === true);
res = await request(contacted({ event: 'contacted', opportunity_id: 'opp_c_2' }));
check('"contacted" is stage_contacted', res.payload.event === 'stage_contacted');

console.info('\n\x1b[1mUNUSABLE PAYLOADS\x1b[0m');
n = calls.length;
res = await request(contacted({ event: 'appointment_booked' }));
check('unknown event: 200, noted false, nothing stored', res.statusCode === 200 && res.payload.noted === false &&
  res.payload.reason === 'unknown event' && supa(calls.slice(n)).length === 0);
res = await request(contacted({ opportunity_id: '' }));
check('Contacted with no opportunity id is refused', res.payload.noted === false && res.payload.reason === 'no opportunity id');
res = await request(contacted({ contact_id: '' }));
check('no contact id is refused', res.payload.reason === 'no contact id');
res = await request(contacted({ location_id: 'not an id!' }));
check('a malformed location id is not an id', res.payload.reason === 'no location id');
res = await request(contacted({ email: 'not-an-email', assigned_user_email: 'x' }));
check('a malformed email is dropped, not stored', res.payload.ok === true);
res = await request('{not json');
check('a body that is not JSON is 400', res.statusCode === 400);
res = await request([1, 2]);
check('an array body is 400', res.statusCode === 400);

console.info('\n\x1b[1mACCESS\x1b[0m');
n = calls.length;
res = await request(contacted(), 'wrong');
check('wrong key: 401', res.statusCode === 401 && res.payload.error === 'unauthorized');
res = await request(contacted(), '');
check('no key: 401', res.statusCode === 401);
check('and nothing stored', supa(calls.slice(n)).length === 0);
res = await request(contacted(), undefined, {}, 'GET');
check('GET: 405', res.statusCode === 405 && res.headers.Allow === 'POST');
const saved = process.env.GHL_LEAD_EVENTS_SECRET;
process.env.GHL_LEAD_EVENTS_SECRET = 'short';
res = await request(contacted(), 'short');
check('a short secret fails closed: 503', res.statusCode === 503);
process.env.GHL_LEAD_EVENTS_SECRET = '';
res = await request(contacted(), '');
check('an unset secret fails closed: 503', res.statusCode === 503);
process.env.GHL_LEAD_EVENTS_SECRET = saved;
check('no answer ever carries the key', !calls.length || ![res.payload].some((p) => JSON.stringify(p).includes(saved)));

console.info('\n\x1b[1mDATABASE DOWN\x1b[0m');
supabaseStatus = 500;
res = await request(contacted({ opportunity_id: 'opp_down' }));
check('still 200, stored false, so GHL keeps the webhook on', res.statusCode === 200 && res.payload.stored === false);
check('and the failure is logged', logged.some((l) => /event not stored/.test(l)));
supabaseStatus = 201;

console.info(failures ? `\n\x1b[31m${failures} failed\x1b[0m` : '\n\x1b[32mall passed\x1b[0m');
process.exit(failures ? 1 : 0);
