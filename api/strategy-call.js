/* ══════════════════════════════════════════════════════════════════════
   RETIRED · 21 September 2026 · superseded by iClosed
   ──────────────────────────────────────────────────────────────────────
   /strategy-call no longer posts here. That page is now an iClosed
   scheduler inside an NTC wrapper, and iClosed owns the qualification
   questions, availability against the connected Google Calendar, the
   booking, confirmations, reminders, SMS, and the scheduler-stage Meta
   events (Potential, Qualified, Disqualified, Call Booked).

   ── Why this file still exists ───────────────────────────────────────
   It answers 410 Gone rather than running, and it is not deleted,
   because retiring and deleting in one step removes the fallback before
   the replacement is proven. The full previous implementation, 208 lines
   including the SendGrid call, the triage flags and the Lead conversion,
   is in git history at 8df65d4 and on the branch paid-landing-cro.

   To roll back:  git show 8df65d4:api/strategy-call.js > api/strategy-call.js
   then restore strategy-call.html from the same commit.

   ── Delete this file when ────────────────────────────────────────────
   The iClosed flow has run clean in production for one week. Remove it
   together with scripts/test-strategy-call.mjs. That is the whole list.

   SENDGRID_API_KEY is NOT part of this cleanup and must not be removed
   with it. /api/apply still depends on it, and not as a nicety: it is
   the second capture path. api/apply.js fails a submission only when
   Supabase AND email both fail, so removing the key would make Supabase
   a single point of failure for a record carrying the applicant's
   contractual acknowledgements. api/project.js uses it too.

   That variable becomes removable only if /api/apply is first changed to
   stop depending on it, which is a separate decision and not scheduled.
   ══════════════════════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  // Logged rather than silent. If this fires in production something is
  // still pointing here and we want to see it, not absorb it.
  console.warn('strategy-call: retired endpoint called', req.method);

  res.setHeader('Allow', '');
  return res.status(410).json({
    error: 'This endpoint has been retired. Bookings are handled at /strategy-call.'
  });
}
