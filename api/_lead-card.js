/* ══════════════════════════════════════════════════════════════════════
   Speed-to-Lead card · POST <LEAD_CARD_URL>
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   The Slack card for a GHL booking: the Speed-to-Lead bot (repo
   ntc-speed-to-lead, /api/lead-card) builds the same card the iClosed
   path builds and posts it in #new-leads. This side only hands over the
   facts, in the contract's shape:

     { type: potential|disqualified|booked|cancelled, offer,
       contact: { name, email, phone }, answers: { key: label },
       labels: { key: question }, start_at }

   Never throws and never takes long. A Slack card is a courtesy to the
   team; a booking must never fail, or wait, because the card did.

   Env:
     LEAD_CARD_URL      e.g. https://<speed-to-lead>.vercel.app/api/lead-card
     LEAD_CARD_SECRET   sent as x-ntc-key
   ══════════════════════════════════════════════════════════════════════ */

const TIMEOUT_MS = 4000;

export async function sendLeadCard(card) {
  const url = process.env.LEAD_CARD_URL || '';
  const secret = process.env.LEAD_CARD_SECRET || '';
  if (!url || !secret) return 'skipped (no LEAD_CARD_URL or LEAD_CARD_SECRET)';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ntc-key': secret },
      body: JSON.stringify(card),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    return res.ok ? 'sent' : `failed ${res.status}`;
  } catch (e) {
    return `failed ${(e && e.name) || 'error'}`;
  }
}
