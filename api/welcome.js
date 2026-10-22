/* ══════════════════════════════════════════════════════════════════════
   /api/welcome  ·  the booking link, for a paid checkout only
   ──────────────────────────────────────────────────────────────────────
   GET ?session_id=cs_live_...   →  { paid: true, booking }  or  { paid: false }

   /welcome is unlinked but public, so it does not carry the kickoff
   booking link itself. Stripe redirects a paying client to
   /welcome?plan=...&session_id={CHECKOUT_SESSION_ID}, the page sends the
   id here, and this asks Stripe whether that Checkout Session completed
   and was paid. Only then does the link come back.

   Paid means status "complete" and payment_status "paid", or
   "no_payment_required" (the Founding Three's free first month). A bank
   debit still clearing is "unpaid": no link yet, and the welcome email,
   which the agent sends once Stripe confirms payment, carries it.

   A session older than SESSION_DAYS gets no link, so a redirect URL that
   leaks later is not a standing pass to the calendar.

   STRIPE_CHECKOUT_READ_KEY is a restricted key with Checkout Sessions:
   Read and nothing else. Without it the handler answers 503 and the
   page simply leaves the booking step out.

   The agent (ntc-speed-to-lead, src/kickoff.js) is the second lock: a
   kickoff booking that matches no paying client is cancelled.
   ══════════════════════════════════════════════════════════════════════ */

const KEY = process.env.STRIPE_CHECKOUT_READ_KEY || '';

/* The kickoff calendar's booking page. The same link as Render's
   KICKOFF_BOOKING_LINK and TRIAL_INTAKE_BOOKING_LINK: the 5-Day Trial
   books its intake call there too, and the agent reads a trial client's
   booking as an intake call, not a kickoff. */
const BOOKING = 'https://calendar.app.google/LgzVBwhZL3wKuQgD7';

const SESSION_DAYS = 30;
const SESSION_ID = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
const PAID = new Set(['paid', 'no_payment_required']);

export function isPaid(session, now = Date.now()) {
  if (!session || session.object !== 'checkout.session') return false;
  if (session.status !== 'complete' || !PAID.has(session.payment_status)) return false;
  const created = Number(session.created) * 1000;
  return Number.isFinite(created) && now - created <= SESSION_DAYS * 86400000;
}

export default async function handler(req, res, deps = {}) {
  const f = deps.fetch || globalThis.fetch;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }
  const id = String(req.query?.session_id || '');
  if (!SESSION_ID.test(id)) return res.status(400).json({ paid: false });
  if (!KEY && !deps.key) return res.status(503).json({ paid: false });

  let session = null;
  try {
    const r = await f(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${deps.key || KEY}` },
    });
    if (r.status === 404) return res.status(200).json({ paid: false });
    if (!r.ok) {
      console.error('welcome: Stripe answered', r.status);
      return res.status(502).json({ paid: false });
    }
    session = await r.json();
  } catch (err) {
    console.error('welcome: Stripe unreachable', err?.message || err);
    return res.status(502).json({ paid: false });
  }

  return isPaid(session, deps.now)
    ? res.status(200).json({ paid: true, booking: BOOKING })
    : res.status(200).json({ paid: false });
}
