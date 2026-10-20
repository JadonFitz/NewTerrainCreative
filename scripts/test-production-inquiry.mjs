/* One-time production inquiry · runs the real handler, stubs only fetch. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';
process.env.SENDGRID_API_KEY = 'stub-sendgrid-key';
process.env.META_CAPI_TOKEN = 'stub-meta-token';

const calls = [];
let failInsert = false;
let failSendgrid = false;
let recent = [];       // what the duplicate check reads back
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: u, method: opts.method || 'GET', body });
  if (u.includes('supabase.co')) {
    if (!opts.method || opts.method === 'GET') {
      return { ok: true, status: 200, json: async () => recent, text: async () => '' };
    }
    if (failInsert) return { ok: false, status: 400, text: async () => 'violates check constraint' };
    return { ok: true, status: 201, json: async () => [{ id: 'pi-row-1', ...body }], text: async () => '' };
  }
  if (u.includes('sendgrid.com')) {
    return failSendgrid
      ? { ok: false, status: 500, text: async () => 'down' }
      : { ok: true, status: 202, text: async () => '' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { default: handler, PRIORITY } = await import('../api/production-inquiry.js');
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

// What an older tab of the page sends (business name and timeline were
// asked until 20 Oct 2026). PAGE below is what the page sends now.
const VALID = {
  form: 'production-inquiry',
  full_name: 'Dana Reyes', email: 'dana@ntc-test.invalid', phone: '(310) 555-0143',
  business_name: 'Reyes Dental', website_or_instagram: '@reyesdental',
  production_type: 'Commercial or brand video',
  budget_range: '$5,000 to $10,000',
  timeline: 'Within 30 days',
  project_description: 'A 60 second spot for the new Pasadena office opening.',
  source: 'bb-apply', utm_source: 'facebook', utm_medium: 'paid',
  utm_campaign: 'bb-oct', utm_content: 'story-01',
  page_url: 'https://www.newterraincreative.com/next-step?from=bb-apply',
  referrer: 'https://app.iclosed.io/', submitted_at: '2026-10-11T20:00:00.000Z'
};

const { business_name: _b, timeline: _t, ...PAGE } = VALID;

console.log('\n\x1b[1mPRODUCTION INQUIRY · stored\x1b[0m');
let n = calls.length;
let r = await post(VALID);
let made = since(n);
check('200 with exactly { ok: true }', r.statusCode === 200 && JSON.stringify(r.payload) === '{"ok":true}');
const row = inserts(made, '/leads')[0]?.body;
check("form_type is 'production_inquiry'", row?.form_type === 'production_inquiry', row?.form_type);
check('never a retainer or project form_type',
  !['strategy_call', 'founding_application', 'project_enquiry'].includes(row?.form_type));
check('fields map onto existing columns',
  row?.name === 'Dana Reyes' && row?.business === 'Reyes Dental' &&
  row?.project_type === VALID.production_type && row?.project_scope === VALID.project_description &&
  row?.desired_start === VALID.timeline && row?.budget_band === VALID.budget_range);
check('?from= stored as entry_point', row?.entry_point === 'bb-apply');
check('attribution persists', row?.utm_campaign === 'bb-oct' && row?.utm_content === 'story-01');
check('stored before notifying',
  made.findIndex(c => c.url.includes('/leads') && c.method === 'POST') <
  made.findIndex(c => c.url.includes('sendgrid.com')));

console.log('\n\x1b[1mPRIORITY\x1b[0m');
for (const [band, want] of [['Under $3,000', 'low'], ['$3,000 to $5,000', 'review'],
                            ['$5,000 to $10,000', 'high'], ['$10,000+', 'high']]) {
  n = calls.length;
  await post({ ...VALID, budget_range: band, project_description: 'Priority ' + band });
  const p = inserts(since(n), '/leads')[0]?.body?.priority;
  check(`${band} is ${want}`, p === want, p);
}
check('every budget label has a priority', Object.keys(PRIORITY).length === 4);

console.log('\n\x1b[1mNOTIFICATION\x1b[0m');
const mail = hit(made, 'sendgrid.com')[0]?.body;
check('one email, to business@', mail?.personalizations?.[0]?.to?.[0]?.email === 'business@newterraincreative.com');
check('subject leads with priority and name', /^\[HIGH\] Production inquiry · Dana Reyes · Reyes Dental/.test(mail?.subject || ''), mail?.subject);
const html = mail?.content?.[0]?.value || '';
const order = ['Priority', 'Name', 'Business', 'Production', 'Budget', 'Timeline'].map(k => html.indexOf('>' + k + '<'));
check('body leads with priority, name, business, type, budget, timeline',
  order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])));
check('reply-to is the submitter', mail?.reply_to?.email === VALID.email);
check('nothing sent to the submitter', !JSON.stringify(mail?.personalizations).includes(VALID.email));
n = calls.length;
await post({ ...VALID, project_description: '<script>alert(1)</script>' });
const xss = hit(since(n), 'sendgrid.com')[0]?.body?.content?.[0]?.value || '';
check('submitted text is escaped in the email', xss.includes('&lt;script&gt;') && !xss.includes('<script>'));

console.log('\n\x1b[1mNOTHING ELSE LEAVES THE SERVER\x1b[0m');
check('no Meta event', hit(calls, 'facebook.com').length === 0);
check('no iClosed or calendar call', hit(calls, 'iclosed').length === 0 && hit(calls, 'google').length === 0);
check('no funnel_events row', inserts(calls, '/funnel_events').length === 0);

console.log('\n\x1b[1mWITHOUT BUSINESS NAME OR TIMELINE (the page today)\x1b[0m');
n = calls.length;
r = await post({ ...PAGE, project_description: 'No business name, no timeline.' });
made = since(n);
check('accepted with 200', r.statusCode === 200 && r.payload.ok === true, JSON.stringify(r.payload));
const bare = inserts(made, '/leads')[0]?.body;
check('stored, business and desired_start null',
  bare?.form_type === 'production_inquiry' && bare?.business === null && bare?.desired_start === null);
const bareMail = hit(made, 'sendgrid.com')[0]?.body;
check('subject falls back to the website or Instagram',
  bareMail?.subject === '[HIGH] Production inquiry · Dana Reyes · @reyesdental', bareMail?.subject);
const bareHtml = bareMail?.content?.[0]?.value || '';
check('no empty Business or Timeline rows',
  !bareHtml.includes('>Business<') && !bareHtml.includes('>Timeline<') && bareHtml.includes('>Budget<'));
check('priority banner has no empty timeline slot', !/· <\/p>|·\s*·/.test(bareHtml));
n = calls.length;
r = await post({ ...PAGE, website_or_instagram: '', project_description: 'Name only.' });
const nameOnly = hit(since(n), 'sendgrid.com')[0]?.body?.subject;
check('subject falls back to the name alone', nameOnly === '[HIGH] Production inquiry · Dana Reyes', nameOnly);
r = await post({ ...PAGE, timeline: 'Someday' });
check('a timeline that is sent must still be a page label', r.statusCode === 400 && r.payload.fields?.includes('timeline'));

console.log('\n\x1b[1mVALIDATION\x1b[0m');
for (const f of ['full_name', 'email', 'phone', 'production_type',
                 'budget_range', 'project_description']) {
  r = await post({ ...VALID, [f]: undefined });
  check(`missing ${f} rejected`, r.statusCode === 400 && r.payload.fields?.includes(f));
}
r = await post({ ...VALID, email: 'nope' });
check('malformed email rejected', r.statusCode === 400);
r = await post({ ...VALID, form: 'project' });
check('wrong form rejected', r.statusCode === 400);
r = await post({ ...VALID, budget_range: '$1,000,000' });
check('budget outside the page labels rejected', r.statusCode === 400 && r.payload.fields?.includes('budget_range'));
r = await post({ ...VALID, production_type: 'Ad Sprint' });
check('production type outside the page labels rejected', r.statusCode === 400);
r = await post({ ...VALID, timeline: 'flexible' });
check('choices are exact, not case folded', r.statusCode === 400);
r = await post({ ...VALID, project_description: 'x'.repeat(601) });
check('601 character description rejected', r.statusCode === 400 && r.payload.fields?.includes('project_description'));
n = calls.length;
r = await post({ ...VALID, project_description: 'y'.repeat(600) });
check('600 characters accepted', r.statusCode === 200);
r = await post({ ...VALID, utm_campaign: 'c'.repeat(201) });
check('every string is length capped', r.statusCode === 400 && r.payload.fields?.includes('utm_campaign'));
r = await post({ ...VALID, full_name: { $ne: '' } });
check('non-string value rejected', r.statusCode === 400);
r = await post('not json');
check('unparseable body rejected', r.statusCode === 400);
n = calls.length;
r = await post({ ...VALID, company_url_confirm: 'bot' });
check('honeypot answers 200 and makes no calls', r.statusCode === 200 && since(n).length === 0);
r = await (async () => { const x = res(); await handler({ method: 'GET', headers: {} }, x); return x; })();
check('GET rejected with 405', r.statusCode === 405 && r.headers.Allow === 'POST');

console.log('\n\x1b[1mDUPLICATES\x1b[0m');
recent = [{ email: 'DANA@ntc-test.invalid', project_scope: VALID.project_description }];
n = calls.length;
r = await post(VALID);
check('same email and description: 200', r.statusCode === 200 && r.payload.ok === true);
check('and nothing stored or sent', inserts(since(n), '/leads').length === 0 && hit(since(n), 'sendgrid.com').length === 0);
const q = hit(since(n), '/leads')[0]?.url || '';
check('duplicate query carries no request input', !q.includes('dana') && !q.includes('Pasadena'));
n = calls.length;
await post({ ...VALID, project_description: 'A different project.' });
check('same email, new description: stored', inserts(since(n), '/leads').length === 1);
recent = [];

console.log('\n\x1b[1mFAILURES\x1b[0m');
failInsert = true;
n = calls.length;
r = await post({ ...VALID, project_description: 'DB down' });
failInsert = false;
check('storage failure returns 500', r.statusCode === 500 && r.payload.ok !== true);
check('and sends no email', hit(since(n), 'sendgrid.com').length === 0);
failSendgrid = true;
r = await post({ ...VALID, project_description: 'Mail down' });
failSendgrid = false;
check('email failure after storing still returns 200', r.statusCode === 200 && r.payload.ok === true);

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · production inquiries stay out of the retainer funnel'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
