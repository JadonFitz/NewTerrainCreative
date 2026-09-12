/* Browser-tracking contract without a browser dependency. */

const stored = new Map();
const requests = [];
const pixel = [];

globalThis.window = {
  location: {
    search: '?utm_source=meta&utm_medium=paid-social&utm_campaign=dentist-la&utm_content=clock-ad&fbclid=test-click',
    hostname: 'www.newterraincreative.com',
    origin: 'https://www.newterraincreative.com',
    pathname: '/grow',
    href: 'https://www.newterraincreative.com/grow?utm_source=meta&utm_medium=paid-social&utm_campaign=dentist-la&utm_content=clock-ad&fbclid=test-click'
  },
  localStorage: {
    getItem(k) { return stored.has(k) ? stored.get(k) : null; },
    setItem(k, v) { stored.set(k, String(v)); }
  },
  matchMedia() { return { matches: false }; },
  fbq(...args) { pixel.push(args); }
};
globalThis.document = {
  cookie: '_fbp=fb.1.100.test-browser',
  referrer: 'https://instagram.com/'
};
globalThis.fetch = async (url, opts = {}) => {
  requests.push({ url: String(url), body: JSON.parse(opts.body) });
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

await import(`../assets/track.js?test=${Date.now()}`);

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('\n\x1b[1mATTRIBUTION AND EVENT ROUTING\x1b[0m');
const viewId = window.ntc.track('ViewContent', { offer: 'paid_retainer' });
const clickId = window.ntc.track('CTAClick', { offer: 'paid_retainer', position: 'hero' }, { once: false });
const beforeInternal = pixel.length;
window.ntc.trackInternal('InitialFitCompleted', { industry: 'Dental practice' });

await new Promise((resolve) => setTimeout(resolve, 0));

check('assigns the paid-retainer funnel from /grow', window.ntc.funnelName() === 'paid_retainer');
check('creates stable event ids', Boolean(viewId && clickId && viewId !== clickId));
check('ViewContent uses a standard Meta event', pixel[0]?.[0] === 'track' && pixel[0]?.[1] === 'ViewContent');
check('CTAClick uses a custom Meta event', pixel[1]?.[0] === 'trackCustom' && pixel[1]?.[1] === 'CTAClick');
check('first-party-only events never reach Meta', pixel.length === beforeInternal);

const view = requests.find((r) => r.body.event_name === 'view_content')?.body;
const click = requests.find((r) => r.body.event_name === 'cta_click')?.body;
const fit = requests.find((r) => r.body.event_name === 'initial_fit_completed')?.body;
check('all internal events carry the funnel', [view, click, fit].every((e) => e?.funnel === 'paid_retainer'));
check('landing event carries first-touch source and medium',
  view?.metadata?.utm_source === 'meta' && view?.metadata?.utm_medium === 'paid-social');
check('landing event carries campaign and ad',
  view?.metadata?.utm_campaign === 'dentist-la' && view?.metadata?.utm_content === 'clock-ad');
check('CTA position survives enrichment', click?.metadata?.position === 'hero');
check('attribution persists first touch', JSON.parse(stored.get('ntc_attribution')).utm_campaign === 'dentist-la');

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · browser events are attributable and correctly routed'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
