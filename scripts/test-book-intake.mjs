/* GHL booking intake contract (contract flow 1).

   Step one saves the contact and opens the opportunity; step two saves
   the answers, decides disqualified or ready from the shared rules, and
   hands back the prefilled calendar or the redirect. Nothing a vendor
   does, GHL or the Slack card, may stop a lead reaching the calendar,
   and no log line may carry a contact detail. GHL is stubbed: this never
   touches the live API. */

process.env.GHL_API_TOKEN = 'stub-ghl-token';
process.env.LEAD_CARD_URL = 'https://speed-to-lead.example/api/lead-card';
process.env.LEAD_CARD_SECRET = 'stub-card-secret';

const calls = [];
let ghlStatus = 200;
// What GHL's upsert says about the contact, and what its search returns.
let upsertNew = true;
let onFile = {};
let searchOpps = [];
const SALES = 'gVWhpLqxgmOyTgyrGeKJ';
const STARTED = 'cf946fe5-8597-4fe7-b8f2-8f4c6db47894';
const DQ = '67599a1a-08ed-43f3-a98a-43f7442da375';
let cardStatus = 200;
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  const u = String(url);
  calls.push({ url: u, method: opts.method, body, headers: opts.headers || {} });
  if (/leadconnectorhq/.test(u)) {
    const out = /\/contacts\/upsert$/.test(u) ? { new: upsertNew, contact: { id: 'c_123', ...onFile } }
      : /\/opportunities\/search/.test(u) ? { opportunities: searchOpps, meta: {} }
      : /\/opportunities\/$/.test(u) ? { opportunity: { id: 'o_456' } } : {};
    return { ok: ghlStatus < 300, status: ghlStatus, json: async () => out, text: async () => 'echoes person@example.com' };
  }
  if (/lead-card/.test(u)) return { ok: cardStatus < 300, status: cardStatus, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({}) };
};

const logged = [];
for (const k of ['log', 'warn', 'error']) {
  console[k] = ((orig) => (...a) => { logged.push(a.map(String).join(' ')); if (k === 'log' && !/^book-intake/.test(String(a[0]))) orig(...a); })(console[k]);
}

const mod = await import('../api/book-intake.js');
const handler = mod.default;

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
const SITE = { host: 'www.newterraincreative.com', origin: 'https://www.newterraincreative.com',
               'x-forwarded-for': '198.51.100.7' };
async function post(body, headers = SITE) {
  const res = response();
  await handler({ method: 'POST', body, query: {}, headers }, res);
  return res;
}
async function get(offer) {
  const res = response();
  await handler({ method: 'GET', query: { offer }, headers: SITE }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.info(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const ghl = (list) => list.filter((c) => /leadconnectorhq/.test(c.url));
const cards = (list) => list.filter((c) => /lead-card/.test(c.url));
const since = (n) => calls.slice(n);

const contact = { firstName: 'Ada', lastName: 'Lovelace', email: 'Person@Example.com', phone: '(310) 555-0100' };
const attribution = { utm_source: 'meta', utm_campaign: 'grow-la', fbclid: 'IwAR0abc', fbp: 'fb.1.1759.123',
                      ntc_session: 's_abc123', landing_page: 'https://www.newterraincreative.com/grow',
                      from: 'somewhere-else' };
const strong = {
  ntc_company: 'Analytical Engines', ntc_site_or_ig: 'engines.example',
  ntc_priority_90d: 'Generate more qualified leads', ntc_running_ads: 'Yes, actively',
  ntc_start_timing: 'Within 30 days', ntc_annual_revenue: '$2M–$5M',
  ntc_service_investment: '$8K–$12K', ntc_ad_budget: '$3,000–$5,000',
  ntc_decision_role: "I'm the decision-maker"
};

console.info('\n\x1b[1mGUARDS\x1b[0m');
let n = calls.length;
let res = await post({ step: 'contact', offer: 'growth', contact }, { host: SITE.host });
check('no Origin is refused', res.statusCode === 403 && calls.length === n);
res = await post({ step: 'contact', offer: 'growth', contact }, { ...SITE, origin: 'https://evil.example' });
check('another origin is refused', res.statusCode === 403 && calls.length === n);
res = await post({ step: 'contact', offer: 'growth', contact, website: 'http://spam' });
check('a filled honeypot gets a quiet 200 and nothing is sent', res.statusCode === 200 && calls.length === n);
res = await post({ step: 'contact', offer: 'growth', contact: { ...contact, email: 'nope', phone: '12' } });
check('a bad email and phone are named back', res.statusCode === 400 &&
  res.payload.fields.includes('email') && res.payload.fields.includes('phone') && calls.length === n);
res = await post({ step: 'contact', offer: 'founding-three', contact });
check('an offer outside the contract is refused', res.statusCode === 400);
res = await post({ step: 'contact', offer: 'reschedule', contact });
check('a direct-calendar offer has no form to post', res.statusCode === 400);

console.info('\n\x1b[1mSTEP ONE · CONTACT\x1b[0m');
n = calls.length;
res = await post({ step: 'contact', offer: 'growth', contact, attribution });
let made = since(n);
const upsert = ghl(made).find((c) => /\/contacts\/upsert$/.test(c.url));
const fields = Object.fromEntries((upsert?.body?.customFields || []).map((f) => [f.key, f.field_value]));
check('answers 200 with a token', res.statusCode === 200 && res.payload.ok && typeof res.payload.token === 'string');
check('upserts into the NTC location, never MASTER', upsert?.body?.locationId === 'kzOVdsNR0ozcoyyaag0a');
check('with the GHL headers', upsert?.headers?.Version === '2021-07-28' && upsert?.headers?.Authorization === 'Bearer stub-ghl-token');
const named = ghl(made).filter((c) => /\/contacts\/upsert$/.test(c.url))[1];
check('first by email and fields only, no name or phone', upsert?.body?.email === 'person@example.com' &&
  upsert?.body?.firstName === undefined && upsert?.body?.phone === undefined);
check('a new contact then gets its name and phone', named?.body?.firstName === 'Ada' && named?.body?.lastName === 'Lovelace' &&
  named?.body?.email === 'person@example.com' && named?.body?.phone === '(310) 555-0100');
check('attribution lands on the contract keys', fields.utm_source === 'meta' && fields.ntc_fbclid === 'IwAR0abc' &&
  fields.ntc_fbp === 'fb.1.1759.123' && fields.ntc_session === 's_abc123' &&
  fields.ntc_landing_page === 'https://www.newterraincreative.com/grow' && fields.ntc_offer === 'growth');
check('a from other than next-step is dropped', fields.ntc_from === undefined);
const tags = ghl(made).find((c) => /\/contacts\/c_123\/tags$/.test(c.url) && c.method === 'POST');
check('tagged src:ghl, offer:growth, stage:potential, added not replaced',
  JSON.stringify(tags?.body?.tags) === JSON.stringify(['src:ghl', 'offer:growth', 'stage:potential']));
const opp = ghl(made).find((c) => /\/opportunities\/$/.test(c.url));
check('opens the opportunity in Sales at Started form', opp?.body?.pipelineId === 'gVWhpLqxgmOyTgyrGeKJ' &&
  opp?.body?.pipelineStageId === 'cf946fe5-8597-4fe7-b8f2-8f4c6db47894' && opp?.body?.status === 'open' &&
  opp?.body?.contactId === 'c_123');
check('named "<Full name> · <Offer label>"', opp?.body?.name === 'Ada Lovelace · Growth Strategy Consultation');
check('sends no potential card: the agent sends it after 10 minutes', cards(made).length === 0);
const token = res.payload.token;

console.info('\n\x1b[1mBACK TO STEP ONE · NO SECOND DEAL\x1b[0m');
mod._resetRateLimit();
// The browser comes back to step one with the token it already holds.
searchOpps = [
  { id: 'o_other', contactId: 'c_999', pipelineId: SALES, pipelineStageId: STARTED, status: 'open' },
  { id: 'o_old', contactId: 'c_123', pipelineId: SALES, pipelineStageId: STARTED, status: 'open', updatedAt: '2026-10-19T10:00:00Z' },
  { id: 'o_456', contactId: 'c_123', pipelineId: SALES, pipelineStageId: STARTED, status: 'open', updatedAt: '2026-10-20T10:00:00Z' }
];
n = calls.length;
res = await post({ step: 'contact', offer: 'growth', contact, attribution, token: res.payload.token });
made = since(n);
check("reuses the contact's newest Started form deal", !ghl(made).some((c) => c.method === 'POST' && /\/opportunities\/$/.test(c.url)));
check('and still answers with a token', typeof res.payload.token === 'string');
check('still no card', cards(made).length === 0);
searchOpps = [{ id: 'o_dq', contactId: 'c_123', pipelineId: SALES, pipelineStageId: DQ, status: 'open' }];
n = calls.length;
await post({ step: 'contact', offer: 'ad-sprint', contact, attribution: { from: 'next-step' } });
check('a Disqualified deal is never reused: a new offer gets a new deal', ghl(since(n)).some((c) =>
  c.method === 'POST' && /\/opportunities\/$/.test(c.url) && c.body.pipelineStageId === STARTED));
searchOpps = [];

console.info('\n\x1b[1mAN EMAIL ALONE NEVER REWRITES A RECORD\x1b[0m');
mod._resetRateLimit();
upsertNew = false;
onFile = { firstName: 'Real', lastName: 'Owner', phone: '+13105559999' };
n = calls.length;
res = await post({ step: 'contact', offer: 'growth', contact: { ...contact, firstName: 'Mallory', phone: '3105550000' }, attribution });
made = since(n);
const ups = ghl(made).filter((c) => /\/contacts\/upsert$/.test(c.url));
check('an existing contact: one upsert, no name or phone in it', ups.length === 1 &&
  ups[0].body.firstName === undefined && ups[0].body.lastName === undefined && ups[0].body.phone === undefined);
check('but the session and attribution still land', (ups[0]?.body?.customFields || []).some((f) => f.key === 'ntc_session'));
check('and the tags still go on', ghl(made).some((c) => c.method === 'POST' && /tags$/.test(c.url)));
n = calls.length;
await post({ step: 'answers', offer: 'growth', contact: { ...contact, firstName: 'Mallory' }, answers: strong });
check('step two does not overwrite them either', !ghl(since(n)).some((c) => /upsert$/.test(c.url) && c.body.firstName));
onFile = { firstName: 'Real', lastName: 'Owner' };
n = calls.length;
await post({ step: 'contact', offer: 'growth', contact, attribution });
const fillCall = ghl(since(n)).filter((c) => /upsert$/.test(c.url))[1];
check('an existing contact with no phone on file gets only the phone', fillCall?.body?.phone === '(310) 555-0100' &&
  fillCall?.body?.firstName === undefined && fillCall?.body?.lastName === undefined);
upsertNew = true; onFile = {};

console.info('\n\x1b[1mSTEP TWO · READY\x1b[0m');
mod._resetRateLimit();
n = calls.length;
res = await post({ step: 'answers', offer: 'growth', contact, attribution, answers: { ...strong, sneaky: 'x' }, token });
made = since(n);
check('answers with the calendar', res.payload.next === 'calendar');
const cal = new URL(res.payload.calendarUrl);
check('the Growth calendar', cal.origin + cal.pathname === 'https://api.leadconnectorhq.com/widget/booking/EdeZLdlKq7Y3Qa9Q1JU8');
check('prefilled with name, email and phone', cal.searchParams.get('first_name') === 'Ada' &&
  cal.searchParams.get('last_name') === 'Lovelace' && cal.searchParams.get('email') === 'person@example.com' &&
  cal.searchParams.get('phone') === '(310) 555-0100');
const up2 = Object.fromEntries((ghl(made).find((c) => /upsert$/.test(c.url))?.body?.customFields || []).map((f) => [f.key, f.field_value]));
check('every answer is written by key', Object.entries(strong).every(([k, v]) => up2[k] === v));
check('a key the offer does not ask is dropped', up2.sneaky === undefined);
check('stage:potential comes off', ghl(made).some((c) => c.method === 'DELETE' && /tags$/.test(c.url) &&
  JSON.stringify(c.body.tags) === '["stage:potential"]'));
check('tagged stage:qualified', ghl(made).some((c) => c.method === 'POST' && /tags$/.test(c.url) && c.body.tags.includes('stage:qualified')));
const put = ghl(made).find((c) => c.method === 'PUT');
check("moves step one's opportunity rather than opening another", /\/opportunities\/o_456$/.test(put?.url || '') &&
  !ghl(made).some((c) => /\/opportunities\/$/.test(c.url)));
check('valued at the low end of the band', put?.body?.monetaryValue === 8000);
check('no card for a ready lead (the booking webhook sends it)', cards(made).length === 0);

console.info('\n\x1b[1mSTEP TWO · DISQUALIFIED\x1b[0m');
n = calls.length;
res = await post({ step: 'answers', offer: 'growth', contact, attribution,
  answers: { ...strong, ntc_ad_budget: 'Under $1,500' }, token });
made = since(n);
check('redirected, as iClosed does today', res.payload.next === 'redirect' && res.payload.url === '/next-step?from=growth');
check('no calendar for a disqualified lead', res.payload.calendarUrl === undefined);
const up3 = Object.fromEntries((ghl(made).find((c) => /upsert$/.test(c.url))?.body?.customFields || []).map((f) => [f.key, f.field_value]));
check('marked Disqualified with the reason', up3.ntc_fit === 'Disqualified' && /ntc_ad_budget = Under \$1,500/.test(up3.ntc_dq_reason || ''));
check('tagged dq:growth', ghl(made).some((c) => c.method === 'POST' && /tags$/.test(c.url) && c.body.tags.includes('dq:growth')));
check('not tagged stage:qualified', !ghl(made).some((c) => c.method === 'POST' && /tags$/.test(c.url) && c.body.tags.includes('stage:qualified')));
check('opportunity moved to Disqualified', ghl(made).find((c) => c.method === 'PUT')?.body?.pipelineStageId === '67599a1a-08ed-43f3-a98a-43f7442da375');
const dqCard = cards(made)[0]?.body;
check('the disqualified card carries answers and question labels', dqCard?.type === 'disqualified' &&
  dqCard.answers.ntc_ad_budget === 'Under $1,500' &&
  dqCard.labels.ntc_ad_budget.startsWith('Separately, what monthly advertising budget'));

n = calls.length;
res = await post({ step: 'answers', offer: 'brand-builder', contact, attribution, answers: {
  ntc_company: 'x', ntc_show_format: 'A mix of both', ntc_location: 'Los Angeles', ntc_site_or_ig: 'x',
  ntc_selling_status: 'Yes, with customers', ntc_on_camera: 'Yes', ntc_brand_goal: 'x',
  ntc_bb_investment: 'Under $5K/month' } });
check('Story Session under $5K goes to bb-apply', res.payload.url === '/next-step?from=bb-apply');
check('and with no token opens a fresh opportunity at Disqualified', ghl(since(n)).some((c) =>
  /\/opportunities\/$/.test(c.url) && c.body.pipelineStageId === '67599a1a-08ed-43f3-a98a-43f7442da375'));

console.info('\n\x1b[1mVALIDATION AND THE TOKEN\x1b[0m');
mod._resetRateLimit();
res = await post({ step: 'answers', offer: 'growth', contact, answers: { ...strong, ntc_ad_budget: 'Under $1,500.' } });
check('an option that differs by one character is refused', res.statusCode === 400 && res.payload.fields.includes('ntc_ad_budget'));
res = await post({ step: 'answers', offer: 'growth', contact, answers: { ntc_company: 'x' } });
check('missing required answers are named (annual revenue is optional)', res.statusCode === 400 &&
  res.payload.fields.length === 7 && !res.payload.fields.includes('ntc_annual_revenue'));
n = calls.length;
res = await post({ step: 'answers', offer: 'ad-sprint', contact, answers: {
  ntc_site_or_ig: 'x', ntc_sprint_package: 'Not sure, help me choose', ntc_sprint_promote: 'x', ntc_sprint_goal: 'Generate Leads',
  ntc_location_text: 'LA', ntc_sprint_launch: 'ASAP', ntc_sprint_budget: '$5,500–$8,000' } });
check('optional notes may be left out', res.payload.next === 'calendar');
n = calls.length;
res = await post({ step: 'answers', offer: 'growth', contact: { ...contact, email: 'other@example.com' }, answers: strong, token });
check("a token is bound to its email: someone else's opens a new opportunity",
  ghl(since(n)).some((c) => /\/opportunities\/$/.test(c.url)) && !ghl(since(n)).some((c) => c.method === 'PUT'));
n = calls.length;
res = await post({ step: 'answers', offer: 'growth', contact, answers: strong, token: token.slice(0, -2) + 'xx' });
check('a forged token is ignored', !ghl(since(n)).some((c) => c.method === 'PUT'));

console.info('\n\x1b[1mTHE BOOKING NEVER WAITS ON A VENDOR\x1b[0m');
mod._resetRateLimit(); // one visitor's worth of requests per section
ghlStatus = 500;
res = await post({ step: 'contact', offer: 'growth', contact, attribution });
check('GHL down at step one: still 200, no token', res.statusCode === 200 && res.payload.ok && res.payload.token === null);
n = calls.length;
res = await post({ step: 'answers', offer: 'growth', contact, attribution, answers: strong });
check('GHL down at step two: the calendar still comes back', res.payload.next === 'calendar' && /EdeZLdlKq7Y3Qa9Q1JU8/.test(res.payload.calendarUrl));
res = await post({ step: 'answers', offer: 'growth', contact, answers: { ...strong, ntc_annual_revenue: '$1M–$2M' } });
check('and the disqualify rule still runs locally', res.payload.url === '/next-step?from=growth');
ghlStatus = 200; cardStatus = 500;
res = await post({ step: 'answers', offer: 'growth', contact, answers: { ...strong, ntc_service_investment: 'Under $5K' } });
check('a failed Slack card does not fail the lead', res.statusCode === 200 && res.payload.next === 'redirect');
cardStatus = 200;
process.env.GHL_CALENDARS = '{"growth":"javascript:alert(1)"}';
res = await post({ step: 'answers', offer: 'growth', contact, answers: strong });
check('a non-https calendar URL is never handed out', res.payload.calendarUrl === '');
delete process.env.GHL_CALENDARS;
process.env.GHL_LOCATION_ID = 'DVRZwYvYUOCWdvIvPbAu';
n = calls.length;
await post({ step: 'contact', offer: 'growth', contact });
check('pointed at MASTER, it writes nothing to GHL', ghl(since(n)).length === 0);
delete process.env.GHL_LOCATION_ID;

console.info('\n\x1b[1mDIRECT CALENDARS\x1b[0m');
res = await get('reschedule');
check('/reschedule gets the Rescheduled Call calendar', res.payload.calendarUrl === 'https://api.leadconnectorhq.com/widget/booking/OrFq52pbRRJvUjmicBQ1');
res = await get('follow-up');
check('/follow-up gets the Quick Follow-Up calendar', res.payload.calendarUrl === 'https://api.leadconnectorhq.com/widget/booking/PizvlYZQpD1Xw9dUxDX4');
res = await get('growth');
check('a form offer has no direct calendar', res.statusCode === 404);

console.info('\n\x1b[1mRATE LIMIT AND LOGS\x1b[0m');
mod._resetRateLimit();
const flood = { ...SITE, 'x-forwarded-for': '203.0.113.50' };
let last;
for (let i = 0; i < 21; i++) last = await post({ step: 'contact', offer: 'growth', contact: { ...contact, email: 'nope' } }, flood);
check('the 21st request in ten minutes is refused', last.statusCode === 429);
check('another IP is unaffected', (await post({ step: 'contact', offer: 'growth', contact: { ...contact, email: 'nope' } })).statusCode === 400);
const all = logged.join('\n');
check('no log line carries a name, email or phone',
  !/person@example\.com|Person@Example|Lovelace|555-0100|3105550100|other@example/i.test(all));

console.info(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · two steps, one opportunity, nothing blocks the calendar'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
