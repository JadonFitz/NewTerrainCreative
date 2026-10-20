/* ══════════════════════════════════════════════════════════════════════
   /api/book-intake  ·  the GHL booking form, server side
   ──────────────────────────────────────────────────────────────────────
   Behind the per-offer `provider` flag in strategy-call.html, which
   defaults to 'iclosed'. Until an offer is switched to 'ghl' (or a
   tester adds ?provider=ghl) nothing on the site calls this.

   The website asks the qualifying questions (assets/booking-forms.js);
   GoHighLevel holds the contact, the opportunity and the calendar. Two
   steps, both POST, contract flow 1:

     step "contact"  first name, last name, email, phone, attribution.
                     Upserts the GHL contact tagged src:ghl, offer:<key>
                     and stage:potential, opens an opportunity in "Sales"
                     at "Started form", and sends the Speed-to-Lead card
                     type=potential. Answers { ok, token }.

     step "answers"  the same contact plus every answer. Writes the
                     answers to the contact's custom fields, decides
                     disqualified or ready from the shared rules (never
                     from the browser), moves the opportunity, and answers
                       { next: 'calendar', calendarUrl }   prefilled, or
                       { next: 'redirect', url }           disqualified,
                     sending the card type=disqualified for the latter.

   GET ?offer=reschedule|follow-up answers { calendarUrl } for the two
   offers that skip the website's questions and embed the GHL calendar
   directly. Booking URLs are public anyway; they live in env only
   because they are being created as this ships.

   THE BOOKING NEVER WAITS ON A VENDOR
   A GHL outage or a Slack card failure is logged and swallowed. The
   calendar's own form takes name, email and phone again, so a lead who
   reaches it can always book, and the disqualify rules run here, locally.

   THE TOKEN
   Step one hands back a signed token naming the contact and opportunity
   it created, so step two moves that opportunity rather than opening a
   second. Signed with a key derived from GHL_API_TOKEN and bound to the
   email, so a browser cannot point step two at somebody else's record.
   Missing or invalid means step two opens a fresh opportunity: a
   duplicate in the pipeline is better than a lost lead.

   GUARDS: same origin only, a per-instance IP rate limit, a honeypot
   (`website`), length caps, exact option matching, and no PII in any
   log line (offer and outcome only).

   Env: GHL_API_TOKEN, GHL_LOCATION_ID, GHL_PIPELINE_ID, GHL_STAGE_IDS,
   GHL_CALENDARS (api/_ghl.js), LEAD_CARD_URL, LEAD_CARD_SECRET
   (api/_lead-card.js). docs/ENVIRONMENT.md has the details.
   ══════════════════════════════════════════════════════════════════════ */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import '../assets/booking-forms.js';
import * as ghl from './_ghl.js';
import { sendLeadCard } from './_lead-card.js';

const FORMS = globalThis.NTCBookingForms;
const { OFFERS, ATTRIBUTION } = FORMS;

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

// ── rate limit, per instance ──────────────────────────────────────────
// Twenty requests in ten minutes per IP: a real person makes two, plus a
// few retries. Per instance only, like the owner login limiter, so it
// slows abuse rather than stopping a determined attacker.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 20;
const hits = new Map();

export function _resetRateLimit() { hits.clear(); }

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
  }
  return list.length > MAX_HITS;
}

/* Same origin: the browser's Origin header must name the host this
   request arrived on. Works on production and on preview URLs alike,
   and refuses a cross-site form post or a scripted call with no Origin. */
function sameOrigin(req) {
  const origin = req.headers.origin || '';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

// ── validation ────────────────────────────────────────────────────────
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

function readContact(c) {
  c = c && typeof c === 'object' ? c : {};
  const out = {
    firstName: str(c.firstName, 80),
    lastName: str(c.lastName, 80),
    email: str(c.email, 254).toLowerCase(),
    phone: str(c.phone, 40)
  };
  const digits = out.phone.replace(/[^0-9]/g, '');
  const errors = [];
  if (!out.firstName) errors.push('firstName');
  if (!out.lastName) errors.push('lastName');
  if (!EMAIL.test(out.email)) errors.push('email');
  if (digits.length < 10 || digits.length > 15) errors.push('phone');
  return { contact: out, errors };
}

/* Every answer is checked against the shared definition: a choice must
   be one of its options word for word, text is trimmed and capped, and
   anything the offer does not ask is dropped. */
function readAnswers(offer, a) {
  a = a && typeof a === 'object' ? a : {};
  const answers = {};
  const errors = [];
  for (const [key, q] of Object.entries(offer.questions)) {
    const raw = a[key];
    let v = '';
    if (q.type === 'choice') v = q.options.includes(raw) ? raw : '';
    else v = str(raw, q.type === 'textarea' ? 2000 : 300);
    if (v) answers[key] = v;
    else if (!q.optional) errors.push(key);
  }
  return { answers, errors };
}

/** The hidden fields, renamed to their GHL keys. Strings only, capped. */
function readAttribution(a) {
  a = a && typeof a === 'object' ? a : {};
  const out = {};
  for (const [from, to] of Object.entries(ATTRIBUTION)) {
    const v = str(a[from], 300);
    if (v) out[to] = v;
  }
  // Only the one value the rest of the funnel acts on (see /next-step).
  if (out.ntc_from && out.ntc_from.toLowerCase() !== 'next-step') delete out.ntc_from;
  return out;
}

// ── the step one -> step two token ────────────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64url');
const sha = (s) => createHash('sha256').update(s).digest('hex');
function signingKey() {
  const t = ghl.config().token;
  return t ? sha(`ntc-book-intake:${t}`) : '';
}
function sign(payload) {
  const key = signingKey();
  if (!key) return null;
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}
function verify(token, email) {
  const key = signingKey();
  if (!key || typeof token !== 'string' || token.length > 1000) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!p || p.e !== sha(email) || !(Date.now() - p.t < TOKEN_TTL_MS)) return null;
  return p;
}

// ── helpers ───────────────────────────────────────────────────────────
const fullName = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ');

/* Tags are the one write a failure may skip without losing the lead:
   the contact and its answers are already saved by then. */
async function quietly(what, offerKey, fn) {
  try { await fn(); } catch (e) { console.error(`book-intake: ${what} failed`, offerKey, (e && e.message) || e); }
}

function labelsFor(offer, answers) {
  const labels = {};
  for (const k of Object.keys(answers)) labels[k] = offer.questions[k].label;
  return labels;
}

/* The calendar, opened already knowing who is booking. ASSUMPTION
   (noted in the PR): GHL's booking widget prefills from first_name,
   last_name, email and phone query parameters. */
export function prefilledCalendar(offerKey, c) {
  const base = ghl.calendarUrl(offerKey);
  if (!base) return '';
  const u = new URL(base);
  if (c.firstName) u.searchParams.set('first_name', c.firstName);
  if (c.lastName) u.searchParams.set('last_name', c.lastName);
  if (c.email) u.searchParams.set('email', c.email);
  if (c.phone) u.searchParams.set('phone', c.phone);
  return u.toString();
}

function parseBody(req) {
  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  return d && typeof d === 'object' ? d : null;
}

// ── step one ──────────────────────────────────────────────────────────
async function stepContact(offerKey, offer, contact, attribution) {
  let token = null;
  if (ghl.configured()) {
    try {
      const contactId = await ghl.upsertContact({
        ...contact,
        fields: { ...attribution, ntc_offer: offerKey }
      });
      await quietly('tags', offerKey, () =>
        ghl.addTags(contactId, ['src:ghl', `offer:${offerKey}`, 'stage:potential']));
      let opportunityId = '';
      try {
        opportunityId = await ghl.createOpportunity({
          contactId, stage: 'Started form',
          name: `${fullName(contact)} · ${offer.label}`, monetaryValue: 0
        });
      } catch (e) {
        console.error('book-intake: opportunity not opened', offerKey, (e && e.message) || e);
      }
      token = sign({ c: contactId, o: opportunityId, e: sha(contact.email), t: Date.now() });
    } catch (e) {
      console.error('book-intake: contact not saved', offerKey, (e && e.message) || e);
    }
  } else {
    console.warn('book-intake: GHL not configured, contact not saved', offerKey);
  }

  const card = await sendLeadCard({
    type: 'potential', offer: offerKey,
    contact: { name: fullName(contact), email: contact.email, phone: contact.phone },
    answers: {}, labels: {}, start_at: null
  });
  console.log('book-intake: contact step', offerKey, 'card', card);
  return { ok: true, token };
}

// ── step two ──────────────────────────────────────────────────────────
async function stepAnswers(offerKey, offer, contact, answers, attribution, token) {
  const reasons = FORMS.disqualifiers(offerKey, answers);
  const dq = reasons.length > 0;
  const value = FORMS.opportunityValue(offerKey, answers);

  if (ghl.configured()) {
    try {
      const fields = { ...attribution, ...answers, ntc_offer: offerKey };
      if (dq) { fields.ntc_fit = 'Disqualified'; fields.ntc_dq_reason = reasons.join('; ').slice(0, 300); }
      const contactId = await ghl.upsertContact({ ...contact, fields });
      await quietly('tags', offerKey, () =>
        ghl.addTags(contactId, ['src:ghl', `offer:${offerKey}`, ...(dq ? [`dq:${offerKey}`] : [])]));
      await quietly('tag removal', offerKey, () => ghl.removeTags(contactId, ['stage:potential']));

      const stage = dq ? 'Disqualified' : 'Started form';
      const name = `${fullName(contact)} · ${offer.label}`;
      const t = verify(token, contact.email);
      if (t && t.c === contactId && t.o) {
        await ghl.updateOpportunity(t.o, { stage, name, monetaryValue: value });
      } else {
        await ghl.createOpportunity({ contactId, stage, name, monetaryValue: value });
      }
    } catch (e) {
      console.error('book-intake: answers not saved', offerKey, (e && e.message) || e);
    }
  } else {
    console.warn('book-intake: GHL not configured, answers not saved', offerKey);
  }

  if (dq) {
    const card = await sendLeadCard({
      type: 'disqualified', offer: offerKey,
      contact: { name: fullName(contact), email: contact.email, phone: contact.phone },
      answers, labels: labelsFor(offer, answers), start_at: null
    });
    console.log('book-intake: disqualified', offerKey, 'card', card);
    return { ok: true, next: 'redirect', url: offer.disqualifyTo || '/next-step' };
  }

  const calendarUrl = prefilledCalendar(offerKey, contact);
  if (!calendarUrl) console.error('book-intake: no GHL_CALENDARS entry', offerKey);
  console.log('book-intake: ready', offerKey);
  return { ok: true, next: 'calendar', calendarUrl };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const offerKey = String((req.query && req.query.offer) || '').trim().toLowerCase();
    const offer = Object.prototype.hasOwnProperty.call(OFFERS, offerKey) ? OFFERS[offerKey] : null;
    if (!offer || !offer.direct) return res.status(404).json({ error: 'unknown offer' });
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ ok: true, calendarUrl: ghl.calendarUrl(offerKey) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!sameOrigin(req)) return res.status(403).json({ error: 'forbidden' });
  if (limited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Try again in a few minutes.' });

  const d = parseBody(req);
  if (!d) return res.status(400).json({ error: 'bad payload' });

  // Real people never fill this. A bot gets a quiet success and nothing
  // is written, sent or carded.
  if (str(d.website, 200)) return res.status(200).json({ ok: true });

  const offerKey = str(d.offer, 40).toLowerCase();
  const offer = Object.prototype.hasOwnProperty.call(OFFERS, offerKey) ? OFFERS[offerKey] : null;
  if (!offer || offer.direct) return res.status(400).json({ error: 'unknown offer' });

  const { contact, errors: contactErrors } = readContact(d.contact);
  if (contactErrors.length) return res.status(400).json({ error: 'invalid', fields: contactErrors });

  const attribution = readAttribution(d.attribution);

  if (d.step === 'contact') {
    return res.status(200).json(await stepContact(offerKey, offer, contact, attribution));
  }
  if (d.step === 'answers') {
    const { answers, errors } = readAnswers(offer, d.answers);
    if (errors.length) return res.status(400).json({ error: 'invalid', fields: errors });
    return res.status(200).json(await stepAnswers(offerKey, offer, contact, answers, attribution, d.token));
  }
  return res.status(400).json({ error: 'unknown step' });
}
