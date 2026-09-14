/* First-party event ingestion contract. */

process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key';

const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  let body;
  try { body = opts.body ? JSON.parse(opts.body) : undefined; } catch { body = opts.body; }
  calls.push({ url: String(url), method: opts.method, body });
  return { ok: true, status: 201, json: async () => [], text: async () => '' };
};

const { default: handler } = await import('../api/track.js');

function response() {
  return {
    statusCode: 200, payload: null, headers: {},
    status(n) { this.statusCode = n; return this; },
    json(v) { this.payload = v; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
}
async function request(method, body) {
  const res = response();
  await handler({ method, body }, res);
  return res;
}

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('\n\x1b[1mFIRST-PARTY EVENT INGESTION\x1b[0m');
let n = calls.length;
let res = await request('POST', {
  event_id: 'view-1', event_name: 'view_content', session_id: 'session-1',
  page_url: 'https://www.newterraincreative.com/grow', funnel: 'paid_retainer',
  metadata: {
    utm_source: 'meta', utm_campaign: 'dentist-la', offer: 'paid_retainer',
    email: 'must-not-store@example.com', api_secret: 'must-not-store'
  }
});
let made = calls.slice(n);
const row = made[0]?.body;
check('accepted event reports stored', res.statusCode === 200 && res.payload.stored === true);
check('writes one event', made.length === 1);
check('stores the validated funnel', row?.funnel === 'paid_retainer');
check('keeps measurement metadata', row?.metadata?.utm_campaign === 'dentist-la');
check('removes contact and secret metadata', !row?.metadata?.email && !row?.metadata?.api_secret);

n = calls.length;
res = await request('POST', {
  event_id: 'bad-funnel', event_name: 'cta_click', funnel: 'made_up',
  metadata: { position: 'hero' }
});
made = calls.slice(n);
check('unknown funnel cannot be stored', made[0]?.body?.funnel === undefined);
check('known event still records without a funnel', res.payload.stored === true);

n = calls.length;
res = await request('POST', { event_name: 'anything_i_want' });
check('unknown event is ignored', res.payload.ignored === 'unknown event' && calls.length === n);

res = await request('GET');
check('GET is rejected', res.statusCode === 405);


/* ══════════════════════════════════════════════════════════════════════
   REGRESSION · a public request must never create a Schedule event
   ──────────────────────────────────────────────────────────────────────
   /api/track is public and unauthenticated. A Schedule event is supposed
   to mean an appointment was genuinely confirmed, so if this endpoint
   accepts one, the event means nothing: anybody could POST a conversion.

   'schedule' was in the allowlist and WAS accepted. This test exists so
   it cannot come back without someone deleting the test on purpose.
   ══════════════════════════════════════════════════════════════════════ */
console.log('\n\x1b[1mSCHEDULE IS RESERVED\x1b[0m');

for (const name of ['schedule', 'Schedule', ' schedule ']) {
  n = calls.length;
  res = await request('POST', {
    event_id: `forge-${name.trim()}`, event_name: name, session_id: 's-forge'
  });
  const wrote = calls.slice(n).some((c) => /funnel_events/.test(c.url));
  const label = JSON.stringify(name);
  if (name === 'schedule') {
    check(`${label} is refused with 403`, res.statusCode === 403, `got ${res.statusCode}`);
    check(`${label} says why`, res.payload?.error === 'reserved event', res.payload?.error);
  } else {
    // Casing and padding variants are not the reserved name, so they fall
    // through to the unknown-event path. Either way they must not store.
    check(`${label} is not stored`, res.statusCode === 200 && res.payload?.ignored === 'unknown event',
          `${res.statusCode} ${JSON.stringify(res.payload)}`);
  }
  check(`${label} writes NOTHING to the database`, !wrote);
}

// The allowlist itself must not contain it.
const trackSource = await (await import('node:fs/promises')).readFile(
  new URL('../api/track.js', import.meta.url), 'utf8');
// Slice only the Set literal itself. Slicing as far as RESERVED would
// swallow the comment explaining why schedule was removed, and the test
// would then fail on its own documentation.
const allowStart = trackSource.indexOf('ALLOWED = new Set');
const allowBlock = trackSource.slice(allowStart, trackSource.indexOf(']);', allowStart));
check('schedule is absent from the ALLOWED set', !/'schedule'/.test(allowBlock));
check('schedule is named in the RESERVED set', /RESERVED = new Set\(\['schedule'\]\)/.test(trackSource));

// And no browser code may map an event onto it.
const browserSource = await (await import('node:fs/promises')).readFile(
  new URL('../assets/track.js', import.meta.url), 'utf8');
check('no browser NAME_MAP entry produces schedule',
  !/:\s*'schedule'/.test(browserSource));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · first-party ingestion remains bounded and PII-free'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
