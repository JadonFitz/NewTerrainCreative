/* Signature Work project enquiry · runs the real handler, stubs only fetch. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.SENDGRID_API_KEY = 'stub-sendgrid-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';

const calls = [];
let failInsert = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method, body });
  if (u.includes('supabase.co')) {
    if (failInsert) { failInsert = false; return { ok: false, status: 500, text: async () => 'outage' }; }
    return { ok: true, status: 201, json: async () => [{ id: 'proj-row-1', ...body }], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) return { ok: true, status: 202, text: async () => '' };
  if (u.includes('facebook.com')) return { ok: true, status: 200, json: async () => ({ events_received: 1 }) };
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { default: handler } = await import('../api/project.js');
const res = () => { const r = { statusCode: 0, payload: null, headers: {} };
  r.status = c => (r.statusCode = c, r); r.json = p => (r.payload = p, r);
  r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };
const post = async body => { const r = res();
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.5' } }, r); return r; };
const since = n => calls.slice(n);
const hit = (l, f) => l.filter(c => c.url.includes(f));
const inserts = (l, f) => hit(l, f).filter(c => c.method === 'POST');

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const VALID = {
  name: 'Dana Reyes', email: 'dana@ntc-test.invalid', phone: '3105550143',
  business: 'Alder Law', website: 'alderlaw.com',
  project_type: 'Documentary or brand film',
  project_scope: 'A 12 minute film about the firm for the site and paid social.',
  start: 'Within a couple of months',
  budget_band: '$25,000 to $50,000',
  authority: 'I do',
  event_id: 'pj-evt-1', session_id: 'pj-sess-1', utm_campaign: 'sig-01'
};

console.log('\n\x1b[1mPROJECT ENQUIRY · captured\x1b[0m');
let n = calls.length;
let r = await post(VALID);
let made = since(n);
check('200 ok', r.statusCode === 200 && r.payload.ok === true);
check('reports both capture paths', r.payload.captured?.stored && r.payload.captured?.notified);
const row = inserts(made, '/leads')[0]?.body;
check("form_type is 'project_enquiry'", row?.form_type === 'project_enquiry', row?.form_type);
check('NOT strategy_call or founding', !['strategy_call', 'founding_application'].includes(row?.form_type));
check('project fields persist', Boolean(row?.project_type && row?.project_scope));
check('timeline reuses desired_start', row?.desired_start === VALID.start);
check('budget reuses budget_band', row?.budget_band === VALID.budget_band);
check('authority persists', row?.authority === 'I do');
check('attribution persists', row?.utm_campaign === 'sig-01');
check('clean enquiry stored as qualified', row?.status === 'qualified', row?.status);

/* ══════════════════════════════════════════════════════════════════════
   CLEAN FIT · books immediately, and calls it a PROJECT call
   ──────────────────────────────────────────────────────────────────────
   Signature Work is a commercial, documentary or brand film. Framing it
   as the retainer's "strategy call" is the mismatch this endpoint was
   built to avoid, so the wording is asserted, not just the link.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mCLEAN FIT · immediate project call\x1b[0m');
const INTERNAL_INBOX = 'business@newterraincreative.com';
const recipient = (c) => c.body?.personalizations?.[0]?.to?.[0]?.email;
const mailTo = (list, addr) => hit(list, 'sendgrid.com').filter((c) => recipient(c) === addr);
const mailBody = (c) => JSON.stringify(c?.body?.content || []);

check('clean fit returns a booking url', Boolean(r.payload.bookingUrl), r.payload.bookingUrl);
check('sends exactly one internal notification', mailTo(made, INTERNAL_INBOX).length === 1);
const confirm = mailTo(made, VALID.email);
check('sends exactly one confirmation to the enquirer', confirm.length === 1, `${confirm.length} sent`);
check('response reports the confirmation honestly', r.payload.captured?.confirmed === true);
check('confirmation calls it a PROJECT call',
  /project call/i.test(confirm[0]?.body?.subject || ''), confirm[0]?.body?.subject);
check('confirmation never calls it a strategy call',
  !/strategy call/i.test(confirm[0]?.body?.subject + mailBody(confirm[0])));
check('CTA is the project call, not "pick a time"',
  /Book the project call/i.test(mailBody(confirm[0])));
check('what to bring is scope, not ad spend',
  /finished piece|deadline|references/i.test(mailBody(confirm[0]))
  && !/ad spend|what you are spending/i.test(mailBody(confirm[0])));
check('confirmation carries the booking link',
  mailBody(confirm[0]).includes('calendar.app.google'));
check('confirmation replies to New Terrain Creative',
  confirm[0]?.body?.reply_to?.email === INTERNAL_INBOX);

console.log('\n\x1b[1mEVENTS\x1b[0m');
const fe = inserts(made, '/funnel_events')[0]?.body;
check("funnel event is 'lead'", fe?.event_name === 'lead', fe?.event_name);
check("funnel tag is 'signature_work'", fe?.funnel === 'signature_work', fe?.funnel);
check('event carries project_type', fe?.metadata?.project_type === VALID.project_type);
const capi = hit(made, 'facebook.com')[0]?.body?.data?.[0];
check('fires Meta Lead', capi?.event_name === 'Lead', capi?.event_name);
check('NOT SubmitApplication', capi?.event_name !== 'SubmitApplication');
check('NOT Schedule', capi?.event_name !== 'Schedule');
check("offer is 'signature_work'", capi?.custom_data?.offer === 'signature_work');
check("form_type is 'project_enquiry'", capi?.custom_data?.form_type === 'project_enquiry');
check('content_category is the project type', capi?.custom_data?.content_category === VALID.project_type);
check('event_id shared with the browser', capi?.event_id === 'pj-evt-1');
check('email hashed, never plaintext',
  /^[a-f0-9]{64}$/.test(capi?.user_data?.em?.[0] || '') &&
  !JSON.stringify(capi).includes('dana@ntc-test.invalid'));

console.log('\n\x1b[1mTRIAGE · flags, never rejects\x1b[0m');
n = calls.length;
r = await post({ ...VALID, budget_band: 'Under $10,000', start: 'Just exploring', authority: 'Gathering information' });
check('still accepted', r.statusCode === 200 && r.payload.ok === true);
const flagged = inserts(since(n), '/leads')[0]?.body;
check("stored as 'new', not declined", flagged?.status === 'new', flagged?.status);
check('reasons recorded for the call', Boolean(flagged?.decline_reason));
check('still fires Lead', hit(since(n), 'facebook.com').length === 1);

/* A flagged enquiry is not rejected, but it does not skip the scoping
   conversation either. No link in the response and none in the email. */
check('flagged enquiry gets NO booking url', !r.payload.bookingUrl, r.payload.bookingUrl);
const flaggedMail = mailTo(since(n), VALID.email);
check('flagged enquiry still gets a receipt email', flaggedMail.length === 1);
check('flagged receipt contains no booking link',
  !mailBody(flaggedMail[0]).includes('calendar.app.google'));
check('flagged receipt does not promise a call time',
  /within one business day/i.test(mailBody(flaggedMail[0])));

console.log('\n\x1b[1mVALIDATION\x1b[0m');
for (const f of ['business', 'project_type', 'project_scope', 'start', 'budget_band', 'authority']) {
  r = await post({ ...VALID, [f]: undefined });
  check(`missing ${f} rejected`, r.statusCode === 400 && r.payload.missing?.includes(f));
}
r = await post({ ...VALID, email: 'nope' });
check('malformed email rejected', r.statusCode === 400);
n = calls.length;
r = await post({ ...VALID, company_website_confirm: 'bot' });
check('honeypot makes no outbound calls', since(n).length === 0);
r = await (async () => { const x = res(); await handler({ method: 'GET' }, x); return x; })();
check('GET rejected', r.statusCode === 405);

console.log('\n\x1b[1mDATABASE OUTAGE\x1b[0m');
failInsert = true;
n = calls.length;
r = await post(VALID);
check('still returns ok', r.payload.ok === true);
check('reports stored:false honestly', r.payload.captured?.stored === false);
check('still notifies us, enquiry not lost', mailTo(since(n), INTERNAL_INBOX).length === 1);
check('enquirer still gets their confirmation', mailTo(since(n), VALID.email).length === 1);


/* ══════════════════════════════════════════════════════════════════════
   OFFER PROPAGATION · a paid landing page must stay reportable
   ──────────────────────────────────────────────────────────────────────
   /sprint sends ?offer=ad-sprint, which the form forwards as offer_id. The
   conversion must carry the resolved identifier, and an unrecognised or
   hostile value must fall back to this form's default rather than
   inventing an offer name in the reporting.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mOFFER PROPAGATION\x1b[0m');

async function offerOf(offer_id) {
  const n = calls.length;
  await post({ ...VALID, offer_id, event_id: 'off-' + String(offer_id) });
  const made = calls.slice(n);
  const capi = made.filter(c => c.url.includes('facebook.com'))[0]?.body?.data?.[0];
  const ev = made.filter(c => c.url.includes('/funnel_events') && c.method === 'POST')[0]?.body;
  return { meta: capi?.custom_data?.offer, funnel: ev?.funnel, metaOffer: ev?.metadata?.offer };
}

let r2 = await offerOf('ad-sprint');
check('slug resolves on the Meta event', r2.meta === 'ad_sprint', r2.meta);
check('funnel tag matches', r2.funnel === 'ad_sprint', r2.funnel);
check('metadata carries the offer', r2.metaOffer === 'ad_sprint', r2.metaOffer);

r2 = await offerOf(undefined);
check('no slug falls back to the default', r2.meta === 'signature_work', r2.meta);

r2 = await offerOf('not-a-real-offer');
check('unknown slug falls back, never passes through', r2.meta === 'signature_work', r2.meta);

r2 = await offerOf('<script>alert(1)</script>');
check('hostile slug cannot become an offer name', r2.meta === 'signature_work', r2.meta);

r2 = await offerOf('AD-SPRINT');
check('resolution is case-insensitive', ['ad_sprint', 'signature_work'].includes(r2.meta), r2.meta);

console.log('\n\x1b[1mPAGE SOURCE\x1b[0m');
const { readFileSync } = await import('node:fs');
const page = readFileSync(new URL('../project.html', import.meta.url), 'utf8');
check('no hardcoded scheduler URL in project.html',
  !page.includes('calendar.app.google'));
check('the href is assigned from the API response',
  /getElementById\('book-link'\)\.href\s*=\s*url/.test(page));
check('both success shapes exist',
  /id="done-booking"/.test(page) && /id="done-nolink"/.test(page));
/* Visible copy only. HTML comments explain WHY this is not a strategy
   call, so matching the raw source would fail on its own rationale. */
const visible = page.replace(/<!--[\s\S]*?-->/g, '');
check('the success copy says project call, not strategy call',
  /project call/i.test(visible) && !/strategy call/i.test(visible));
check('the page no longer promises an email it does not send',
  !/reply to the confirmation email/i.test(page));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the third funnel stays separate from the other two'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
