/* iClosed → GHL lead bridge contract.

   Off unless both the token and ICLOSED_GHL_BRIDGE=on are set. When on,
   each iClosed lead lands in the NTC location with the right stage tag
   and deal stage, never src:ghl, never moves a deal backward, and gets
   sms:optin only on an explicit texting yes. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';
process.env.ICLOSED_WEBHOOK_SECRET = 'k'.repeat(40);
delete process.env.GHL_API_TOKEN;
delete process.env.ICLOSED_GHL_BRIDGE;
delete process.env.GHL_LOCATION_ID;

const STAGES = {
  'Started form': 'cf946fe5-8597-4fe7-b8f2-8f4c6db47894',
  'Disqualified': '67599a1a-08ed-43f3-a98a-43f7442da375',
  'Booked': '11653ab6-34fd-4b39-858f-1393fe1f07f3',
  'Showed': 'e6098816-7bc3-4550-a76c-9dddfffac2e6',
  'No-show': '9c73f2ae-511a-4db6-ac2d-7cf2900340a3',
  'Won': 'bb538a91-4b20-4bbd-9664-2ab1bf068370',
  'Lost': '840782d0-59e3-4d34-ba1a-7bb08187550a'
};
const PIPE = 'gVWhpLqxgmOyTgyrGeKJ';

let calls = [];
let existingTags = [];
let isNew = true;
let deals = [];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url, method: opts.method, body });
  const ok = (v) => ({ ok: true, status: 200, json: async () => v, text: async () => '' });
  if (url.includes('/contacts/upsert')) return ok({ new: isNew, contact: { id: 'c1', tags: existingTags } });
  if (url.includes('/opportunities/search')) return ok({ opportunities: deals });
  if (url.includes('/opportunities/') && opts.method === 'POST') return ok({ opportunity: { id: 'o-new' } });
  if (/supabase/.test(url)) return { ok: true, status: 201, json: async () => [], text: async () => '' };
  return ok({});
};
console.log = ((log) => (...a) => (String(a[0]).startsWith('iclosed-webhook') ? undefined : log(...a)))(console.log);
console.warn = () => {};
console.error = () => {};

const { default: handler } = await import('../api/iclosed-webhook.js');
const bridge = await import('../api/_iclosed-ghl.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(body) {
  const res = response();
  calls = [];
  await handler({ method: 'POST', body, query: { key: process.env.ICLOSED_WEBHOOK_SECRET }, headers: {} }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const ghlCalls = () => calls.filter((c) => c.url.includes('leadconnectorhq'));
const tagsAdded = () => calls.filter((c) => /\/contacts\/c1\/tags$/.test(c.url) && c.method === 'POST').flatMap((c) => c.body.tags);
const tagsRemoved = () => calls.filter((c) => /\/contacts\/c1\/tags$/.test(c.url) && c.method === 'DELETE').flatMap((c) => c.body.tags);
const created = () => calls.filter((c) => /\/opportunities\/$/.test(c.url) && c.method === 'POST').map((c) => c.body);
const moved = () => calls.filter((c) => /\/opportunities\/o\d/.test(c.url) && c.method === 'PUT').map((c) => c.body.pipelineStageId);
const deal = (stage, id = 'o1') => ({ id, contactId: 'c1', pipelineId: PIPE, pipelineStageId: STAGES[stage], status: 'open', updatedAt: '2026-10-29T00:00:00Z' });

const contact = (status, extra = {}) => ({
  hookType: 'Contact created',
  contact: { email: 'Lead@Example.com', firstName: 'Ada', lastName: 'Lovelace', phoneNumber: '+13105550100', status },
  ...extra
});
const booked = (extra = {}) => ({
  hookType: 'CALL_BOOKED',
  event: { callPreviewId: 'call_test1' },
  event_type: { name: 'Story Session' },
  invitee: { email: 'lead@example.com', firstName: 'Ada', lastName: 'Lovelace', text_reminder_number: '+13105550100' },
  contact: { email: 'lead@example.com' },
  ...extra
});

console.info('\n\x1b[1mBRIDGE · DORMANT BY DEFAULT\x1b[0m');
let res = await request(contact('Potential 1'));
check('no token, no flag: nothing sent to GHL', ghlCalls().length === 0 && res.payload.ghl === 'off');
process.env.GHL_API_TOKEN = 'stub-ghl-token';
res = await request(booked());
check('token but no flag: still off', ghlCalls().length === 0 && res.payload.ghl === 'off');
check('the booking itself still works', res.payload.sent === true && res.payload.stored === true);
process.env.ICLOSED_GHL_BRIDGE = 'on';
process.env.GHL_LOCATION_ID = 'DVRZwYvYUOCWdvIvPbAu';
res = await request(contact('Potential 1'));
check('pointed at MASTER: refuses', ghlCalls().length === 0 && res.payload.ghl === 'off');
delete process.env.GHL_LOCATION_ID;

console.info('\n\x1b[1mBRIDGE · STAGES\x1b[0m');
deals = []; existingTags = []; isNew = true;
res = await request(contact('Potential 1'));
let up = calls.find((c) => c.url.includes('/contacts/upsert'));
check('switched on: writes to the NTC location', up?.body?.locationId === 'kzOVdsNR0ozcoyyaag0a', res.payload.ghl);
check('potential: iclosed + stage:potential', tagsAdded().join() === 'iclosed,stage:potential');
check('never src:ghl', !tagsAdded().includes('src:ghl'));
check('potential: opens a deal at Started form',
  created().length === 1 && created()[0].pipelineStageId === STAGES['Started form'] && created()[0].pipelineId === PIPE);

existingTags = ['iclosed', 'stage:potential']; isNew = false; deals = [deal('Started form')];
res = await request(contact('QUALIFIED'));
check('qualified: adds stage:qualified', tagsAdded().includes('stage:qualified'));
check('qualified: takes stage:potential off', tagsRemoved().join() === 'stage:potential');
check('qualified: keeps the existing deal, makes no second one', created().length === 0 && moved().length === 0);

res = await request(contact('Disqualified'));
check('disqualified: dq:iclosed', tagsAdded().includes('dq:iclosed'));
check('disqualified: deal moves to Disqualified', moved().join() === STAGES['Disqualified']);

existingTags = ['iclosed', 'stage:qualified']; deals = [deal('Started form')];
res = await request(booked());
check('booked: stage tags come off', tagsRemoved().join() === 'stage:qualified');
check('booked: deal moves to Booked', moved().join() === STAGES['Booked']);
check('booked: Meta and the dashboard still get the booking', res.payload.sent === true && res.payload.ghl === 'synced');

deals = [deal('Booked')];
res = await request({ hookType: 'Outcome added', contact: { email: 'lead@example.com' }, callOutcome: 'NO_SALE', noSaleReason: 'NO_SHOW' });
check('outcome NO_SHOW: deal moves to No-show', moved().join() === STAGES['No-show']);

deals = [deal('No-show')];
res = await request(booked({ event_type: { name: 'Rescheduled Call', slug: 'rescheduled-call' } }));
check('a no-show who rebooks moves back to Booked', moved().join() === STAGES['Booked']);

deals = [deal('Booked')];
res = await request({ hookType: 'Outcome added', contact: { email: 'lead@example.com' }, callOutcome: 'SALE' });
check('outcome SALE: deal moves to Won', moved().join() === STAGES['Won']);
res = await request({ hookType: 'Outcome added', contact: { email: 'lead@example.com' }, callOutcome: 'APPROVED' });
check('other outcome: deal moves to Showed', moved().join() === STAGES['Showed']);

console.info('\n\x1b[1mBRIDGE · NEVER BACKWARD\x1b[0m');
deals = [deal('Showed')];
await request(contact('Potential 2'));
check('a potential status never rewinds a deal at Showed', moved().length === 0 && created().length === 0);
await request(booked());
check('a booking never rewinds Showed', moved().length === 0);
deals = [deal('Won')];
await request({ hookType: 'Outcome added', contact: { email: 'lead@example.com' }, callOutcome: 'NO_SALE', noSaleReason: 'NO_SHOW' });
check('Won is never moved', moved().length === 0);
deals = [];
await request({ hookType: 'Outcome added', contact: { email: 'lead@example.com' }, callOutcome: 'SALE' });
check('an outcome with no deal invents none', created().length === 0);
check('mayMove: Booked → Started form refused', bridge.mayMove('Booked', 'Started form') === false);
check('mayMove: Booked → Disqualified refused', bridge.mayMove('Booked', 'Disqualified') === false);

console.info('\n\x1b[1mBRIDGE · TEXTING CONSENT\x1b[0m');
deals = []; existingTags = [];
await request(booked());
check('a reminder number alone is not consent', !tagsAdded().includes('sms:optin'));
await request(booked({ questions_and_answers: [{ question: 'Do you agree to receive text messages from New Terrain?', answer: 'Yes' }] }));
check('ticked texting question: sms:optin', tagsAdded().includes('sms:optin'));
await request(booked({ questions_and_answers: [{ question: 'Do you agree to receive text messages from New Terrain?', answer: 'No' }] }));
check('answered no: no sms:optin', !tagsAdded().includes('sms:optin'));
await request(booked({ questions_and_responses: { 'OK to text you about your project?': ['I agree'] } }));
check('label→answer map with a yes: sms:optin', tagsAdded().includes('sms:optin'));
await request(booked({ questions_and_answers: [{ question: 'What is your budget?', answer: 'Yes' }] }));
check('a yes to some other question is not consent', !tagsAdded().includes('sms:optin'));
await request(contact('Potential 1', { contact: { email: 'a@b.co', status: 'Potential 1', smsConsent: true } }));
check('an explicit consent field set true: sms:optin', tagsAdded().includes('sms:optin'));
check('sms:optin is never removed here', !tagsRemoved().includes('sms:optin'));

console.info('\n\x1b[1mBRIDGE · SAFE FAILURE\x1b[0m');
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => (String(url).includes('leadconnectorhq')
  ? { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' }
  : realFetch(url, opts));
res = await request(booked());
check('GHL down: the webhook still answers 200 and sends Meta', res.statusCode === 200 && res.payload.sent === true && res.payload.ghl === 'failed');
globalThis.fetch = realFetch;
res = await request({ hookType: 'Contact created', contact: { status: 'Potential 1' } });
check('no email: skipped, nothing written', ghlCalls().length === 0 && res.payload.ghl === 'skipped');
res = await request({ hookType: 'Call cancelled', contact: { email: 'lead@example.com' } });
check('cancelled: noted, nothing written', ghlCalls().length === 0 && res.payload.ghl === 'skipped');

console.info(failures ? `\n\x1b[31m${failures} failed\x1b[0m\n` : '\n\x1b[32mall passed\x1b[0m\n');
process.exit(failures ? 1 : 0);
