/* /breakdown contract: form validation, the payload sent to /b/start,
   and result rendering, without a browser dependency.

   The rendering checks run on a tiny fake DOM whose innerHTML setter
   throws, so a model-written string can only ever reach the page as
   text. */

class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.style = {};
    this.className = '';
    this.hidden = false;
    this._text = '';
  }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(n) { this.childNodes.push(n); return n; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener() {}
  set textContent(v) { this.childNodes = []; this._text = String(v); }
  get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); }
  set innerHTML(v) { throw new Error('innerHTML assigned: ' + v); }
  get innerHTML() { throw new Error('innerHTML read'); }
  all() { return [this, ...this.childNodes.flatMap((c) => c.all())]; }
  find(pred) { return this.all().filter(pred); }
}

const head = new Node('head');
const doc = { head, createElement: (t) => new Node(t) };

globalThis.window = { location: { search: '' } };
await import(`../assets/breakdown.js?test=${Date.now()}`);
const B = window.NTCBreakdown;

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}

console.log('\n\x1b[1mBREAKDOWN FORM\x1b[0m');
const good = {
  site: 'acmeroofing.com', instagram: '', name: 'Pat Doe', email: 'pat@acme.com',
  phone: '', revenue: '2m_5m', investment: '5k_10k', consentEmail: false, hp: ''
};
check('a complete form passes', Object.keys(B.validate(good)).length === 0,
  JSON.stringify(B.validate(good)));
check('needs a website or an Instagram', B.validate({ ...good, site: '' }).site);
check('Instagram alone is enough', !B.validate({ ...good, site: '', instagram: '@acme.roofing' }).site &&
  Object.keys(B.validate({ ...good, site: '', instagram: '@acme.roofing' })).length === 0);
check('an Instagram URL is accepted',
  !B.validate({ ...good, site: '', instagram: 'https://www.instagram.com/acme/' }).instagram);
check('a bad website is flagged', B.validate({ ...good, site: 'not a site' }).site);
check('a full URL with a path is a website', !B.validate({ ...good, site: 'https://www.acme.co.uk/about' }).site);
check('name and email are required',
  B.validate({ ...good, name: '', email: '' }).name && B.validate({ ...good, email: 'pat@' }).email);
check('phone is optional but checked when given',
  !B.validate(good).phone && B.validate({ ...good, phone: '12' }).phone);
check('revenue and investment must be a known band',
  B.validate({ ...good, revenue: '' }).revenue && B.validate({ ...good, investment: '50k' }).investment);
check('the bands match the API contract',
  B.REVENUE.join() === 'under_1m,1m_2m,2m_5m,5m_10m,10m_plus' &&
  B.INVESTMENT.join() === 'under_5k,5k_10k,10k_plus');

console.log('\n\x1b[1mQUERY AND PAYLOAD\x1b[0m');
check('kind defaults to show', B.kindFrom('') === 'show' && B.kindFrom('?for=nonsense') === 'show');
check('?for=ads is the ad breakdown', B.kindFrom('?for=ads') === 'ads');
const tok = 'a'.repeat(48);
check('?t= accepts a 48 hex token only',
  B.tokenFrom('?t=' + tok) === tok && B.tokenFrom('?t=abc') === null && B.tokenFrom('?t=' + 'z'.repeat(48)) === null);
const utm = B.utmFrom('?utm_source=meta&utm_campaign=bb&for=show&fbclid=x', { utm_source: 'old', utm_content: 'ad7' });
check('utm takes the URL first, then first touch, and only utm_ keys',
  utm.utm_source === 'meta' && utm.utm_campaign === 'bb' && utm.utm_content === 'ad7' && !utm.for && !utm.fbclid);
const payload = B.buildPayload({ ...good, site: '  acmeroofing.com ', consentEmail: true },
  { kind: 'ads', browserId: 'bid-1', utm, referrer: 'https://instagram.com/' });
check('payload has exactly the contract keys',
  Object.keys(payload).sort().join() ===
  'browserId,consentEmail,email,hp,instagram,investment,kind,name,phone,referrer,revenue,site,utm');
check('payload trims and carries kind, consent and browser id',
  payload.site === 'acmeroofing.com' && payload.kind === 'ads' && payload.consentEmail === true &&
  payload.browserId === 'bid-1' && payload.hp === '');
check('consent is false unless ticked', B.buildPayload(good, {}).consentEmail === false);

console.log('\n\x1b[1mRESULT RENDERING\x1b[0m');
check('only plain font names load from Google Fonts',
  B.fontLoadable('Playfair Display') && !B.fontLoadable('Inter, sans-serif') &&
  !B.fontLoadable('x"); background:url(evil)') && !B.fontLoadable(''));
check('only hex colors reach a style',
  B.safeColor('#C8A96E') === '#C8A96E' && B.safeColor('red') === null &&
  B.safeColor('#fff;background:url(x)') === null);

const evil = '<img src=x onerror=alert(1)>';
const data = {
  status: 'done', kind: 'show', company: 'Acme <b>Roofing</b>', qualified: true, deckPromised: true,
  result: {
    brand: { colors: ['#112233', 'url(javascript:1)', '#abc'], display: 'Playfair Display', body: 'Proxima Nova, sans-serif' },
    says: evil, buyersWant: 'Speed and a fair quote.', gap: 'You lead with price.',
    hero: { title: 'The 24 hour roof', idea: 'Follow one crew for a day.' },
    clips: [{ id: 'c1', title: 'Crew at dawn' }, { id: '../x', title: 'Second' }]
  }
};
const root = new Node('div');
let threw = null;
try { B.renderResult(root, data, tok, doc); } catch (e) { threw = e; }
check('renders without touching innerHTML', !threw, threw && threw.message);
const text = root.textContent;
check('model text stays text', text.includes(evil) && !root.find((n) => n.tagName === 'B').length);
check('shows every section heading',
  ['Your brand, as we see it', 'What you say', 'What your buyers want to hear', 'The gap', 'One idea']
    .every((h) => text.includes(h)));
const chips = root.find((n) => n.className === 'bd-swatch__chip');
check('drops a non-hex color', chips.length === 2 && chips[0].style.background === '#112233');
const fonts = root.find((n) => n.className === 'bd-font__name');
check('a plain font is shown in itself, a stack in the page font',
  fonts[0]?.style.fontFamily?.startsWith('"Playfair Display"') && !fonts[1]?.style.fontFamily);
check('loads only the plain font', head.childNodes.length === 1 &&
  head.childNodes[0].href === 'https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap');
const imgs = root.find((n) => n.tagName === 'IMG');
check('clip thumbnails come from /b/<token>/c/<id>, encoded',
  imgs.length === 2 && imgs[0].src === `/b/${tok}/c/c1` && imgs[1].src === `/b/${tok}/c/..%2Fx`);
const book = root.find((n) => n.tagName === 'A')[0];
check('a promised show deck books a Story Session',
  text.includes('three directions for your show') && text.includes('within 1 business day') &&
  book?.href === '/strategy-call?offer=brand-builder' && book?.textContent === 'Book a Story Session');

const adsRoot = B.renderResult(new Node('div'), { ...data, kind: 'ads' }, tok, doc);
const adsBook = adsRoot.find((n) => n.tagName === 'A')[0];
check('a promised ads deck books a strategy call',
  adsRoot.textContent.includes('for your ads') && adsBook?.href === '/strategy-call' &&
  adsBook?.textContent === 'Book a strategy call');

const smallRoot = B.renderResult(new Node('div'), { ...data, deckPromised: false, qualified: false }, tok, doc);
const sprint = smallRoot.find((n) => n.tagName === 'A')[0];
check('no deck points to a Sprint at /next-step',
  smallRoot.textContent.includes('a Sprint gets you the creative without the monthly commitment') &&
  sprint?.href === '/next-step?from=breakdown' && !smallRoot.textContent.includes('direction deck'));

const sparse = B.renderResult(new Node('div'), { status: 'done', kind: 'show', result: { says: 'Only this.' } }, tok, doc);
check('a sparse result still renders', sparse.textContent.includes('Only this.') && !sparse.textContent.includes('The gap'));

// The source itself: no innerHTML, no em dashes, no names.
const fs = await import('node:fs/promises');
const src = await fs.readFile(new URL('../assets/breakdown.js', import.meta.url), 'utf8');
const page = await fs.readFile(new URL('../breakdown.html', import.meta.url), 'utf8');
check('neither file assigns innerHTML', !/innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(src + page));
check('no em dashes', !/\u2014/.test(src + page));
check('no prices beyond the visitor bands', !/\$\d{1,3},\d{3}/.test(page));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the breakdown form validates and renders model text safely'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
