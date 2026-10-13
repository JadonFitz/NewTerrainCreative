/* ══════════════════════════════════════════════════════════════════════
   /api/welcome · the booking link goes to a paid checkout only
   ──────────────────────────────────────────────────────────────────────
   Stripe is faked; nothing leaves this machine. What these checks
   defend: the page never carries the calendar link, and the handler
   hands it out only for a completed, paid, recent Checkout Session.
   ══════════════════════════════════════════════════════════════════════ */

const { default: handler, isPaid } = await import('../api/welcome.js');

const res = () => { const r = { statusCode: 0, payload: null, headers: {} };
  r.status = c => (r.statusCode = c, r); r.json = p => (r.payload = p, r);
  r.setHeader = (k, v) => { r.headers[k] = v; }; return r; };

let failures = 0;
const check = (label, cond, detail = '') => {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ' · ' + detail : ''}`);
  if (!cond) failures++;
};

const NOW = Date.parse('2026-10-12T18:00:00Z');
const ID = 'cs_live_a1B2c3D4e5F6g7H8i9J0';
const session = (over = {}) => ({ object: 'checkout.session', id: ID, status: 'complete',
  payment_status: 'paid', created: Math.floor(NOW / 1000) - 120, ...over });

function stripe(body, status = 200) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, auth: init?.headers?.authorization });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { calls, fetch };
}

async function ask(id, s, opts = {}) {
  const r = res();
  await handler({ method: opts.method || 'GET', query: { session_id: id } }, r,
    { fetch: s.fetch, key: 'key' in opts ? opts.key : 'rk_live_x', now: NOW });
  return r;
}

console.log('\n\x1b[1mWELCOME BOOKING LINK\x1b[0m');

{
  const s = stripe(session());
  const r = await ask(ID, s);
  check('a paid session gets the booking link', r.payload?.paid === true && /^https:\/\/calendar\.app\.google\//.test(r.payload?.booking || ''));
  check('asks Stripe for that session with the key', s.calls[0]?.url.endsWith(`/v1/checkout/sessions/${ID}`) && s.calls[0]?.auth === 'Bearer rk_live_x');
  check('never cached', r.headers['Cache-Control'] === 'no-store');
}

{
  const r = await ask(ID, stripe(session({ payment_status: 'no_payment_required' })));
  check('a completed free-trial checkout (Founding Three) gets the link', r.payload?.paid === true);
}

for (const [label, over] of [
  ['an open, unfinished checkout', { status: 'open', payment_status: 'unpaid' }],
  ['an expired checkout', { status: 'expired', payment_status: 'unpaid' }],
  ['a bank debit still clearing', { status: 'complete', payment_status: 'unpaid' }],
  ['a session older than 30 days', { created: Math.floor(NOW / 1000) - 31 * 86400 }],
]) {
  const r = await ask(ID, stripe(session(over)));
  check(`${label} gets no link`, r.payload?.paid === false && !('booking' in (r.payload || {})));
}

{
  const r = await ask(ID, stripe({ error: { message: 'No such checkout.session' } }, 404));
  check('an unknown session gets no link', r.statusCode === 200 && r.payload?.paid === false);
}
{
  const r = await ask(ID, stripe({}, 500));
  check('a Stripe error gets no link', r.statusCode === 502 && !r.payload?.booking);
}
{
  const s = stripe(session());
  const r = await ask('../customers/cus_123', s);
  check('a malformed id is refused before Stripe is called', r.statusCode === 400 && s.calls.length === 0);
}
{
  const r = await ask(ID, stripe(session()), { key: '' });
  check('no Stripe key: 503, no link (fails closed)', r.statusCode === 503 && !r.payload?.booking);
}
{
  const r = await ask(ID, stripe(session()), { method: 'POST' });
  check('GET only', r.statusCode === 405);
}
check('isPaid rejects something that is not a checkout session', !isPaid({ ...session(), object: 'payment_intent' }, NOW));

// The page must not carry the link itself, and must ask the API for it.
const fs = await import('node:fs/promises');
const page = await fs.readFile(new URL('../welcome.html', import.meta.url), 'utf8');
check('welcome.html carries no calendar link', !page.includes('calendar.app.google'));
check('welcome.html asks /api/welcome with the session id', /\/api\/welcome\?session_id=/.test(page));
check('the booking step starts hidden', /id="kickoffRow" hidden/.test(page));

console.log(`\n${failures === 0 ? '\x1b[32mall checks passed\x1b[0m' : `\x1b[31m${failures} failed\x1b[0m`}`);
process.exit(failures === 0 ? 0 : 1);
