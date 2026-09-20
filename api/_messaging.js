/* ══════════════════════════════════════════════════════════════════════
   Messaging · SendGrid email and Twilio SMS, in one place
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   Never import this into browser code: it reads SENDGRID_API_KEY,
   RESEND_API_KEY and TWILIO_AUTH_TOKEN.

   Three funnels were each carrying their own copy of the same SendGrid
   call, and they had already drifted apart: only /api/apply had the
   Resend fallback, and /api/project reported `notified: true` even when
   no provider was configured and nothing was sent. Centralising fixes
   the drift rather than just removing the duplication.

   ── The rule that governs this whole file ────────────────────────────
   Messaging is never allowed to cost us a lead. Every function here
   resolves to a result object and throws only on programmer error. A
   SendGrid outage, a Twilio misconfiguration or an absent API key must
   leave the database write, the Meta conversion and the applicant's
   success screen exactly as they were. Callers log the result; they do
   not branch on it except to report capture honestly.

   Env:
     SENDGRID_API_KEY    required for any email
     RESEND_API_KEY      optional fallback, used only if SendGrid absent
     APPLY_TO            internal inbox, default business@
     APPLY_FROM          verified sender, "Name <address>"
     REPLY_TO            optional, defaults to APPLY_TO
     TWILIO_ACCOUNT_SID  all three required, or SMS stays dormant
     TWILIO_AUTH_TOKEN
     TWILIO_PHONE_NUMBER
   ══════════════════════════════════════════════════════════════════════ */

export const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
export const FROM = process.env.APPLY_FROM
  || 'New Terrain Creative <applications@newterraincreative.com>';
export const REPLY_TO = process.env.REPLY_TO || TO;
export const BOOKING_URL = process.env.BOOKING_URL
  || 'https://calendar.app.google/qardoZkWtaBsq2RG9';

/** HTML-escape. Every interpolated value below is applicant-supplied. */
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** "New Terrain Creative <a@b.com>" -> { name, email } */
function parseFrom(v) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(v));
  return m ? { name: m[1], email: m[2] } : { name: '', email: String(v).trim() };
}

/** First word of a name, for a greeting. Falls back to nothing, not "there". */
export function firstNameOf(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}][\p{L}'’-]*$/u.test(first) ? first : '';
}

/* ══════════════════════════════════════════════════════════════════════
   LOW LEVEL · one email, one provider
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Send one email. Resolves to { sent, provider, error }; never throws.
 *
 * A text/plain part is always included alongside the HTML. Spam filters
 * treat HTML-only mail worse, and a prospect reading in plain text still
 * needs the booking link.
 *
 * @returns {Promise<{sent: boolean, provider: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text, replyTo, from = FROM }) {
  if (!to || !subject || !html) {
    return { sent: false, provider: 'none', error: 'missing to, subject or html' };
  }

  const sender = parseFrom(from);

  if (process.env.SENDGRID_API_KEY) {
    try {
      const body = {
        personalizations: [{ to: [{ email: to }] }],
        from: sender.name ? sender : { email: sender.email },
        subject,
        content: [
          { type: 'text/plain', value: text || stripTags(html) },
          { type: 'text/html', value: html }
        ]
      };
      if (replyTo) body.reply_to = { email: replyTo };

      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      // SendGrid answers 202 with an empty body on success.
      if (!r.ok) {
        // SendGrid's error body describes the payload, not the key.
        const detail = await r.text();
        return { sent: false, provider: 'sendgrid', error: `sendgrid ${r.status} ${detail}` };
      }
      return { sent: true, provider: 'sendgrid' };
    } catch (e) {
      return { sent: false, provider: 'sendgrid', error: (e && e.message) || String(e) };
    }
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from, to: [to], reply_to: replyTo, subject, html,
          text: text || stripTags(html)
        })
      });
      if (!r.ok) {
        return { sent: false, provider: 'resend', error: `resend ${r.status} ${await r.text()}` };
      }
      return { sent: true, provider: 'resend' };
    } catch (e) {
      return { sent: false, provider: 'resend', error: (e && e.message) || String(e) };
    }
  }

  return { sent: false, provider: 'none', error: 'no SENDGRID_API_KEY or RESEND_API_KEY' };
}

/** Crude tags-to-text, good enough for the plain-text alternative part. */
function stripTags(html) {
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|h1|h2|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ══════════════════════════════════════════════════════════════════════
   A · INTERNAL NOTIFICATION
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Tell New Terrain Creative a lead arrived.
 *
 * reply_to is the APPLICANT, so hitting reply in the inbox answers the
 * person rather than ourselves. That is the opposite of the prospect
 * confirmation below, and the difference is deliberate.
 */
export async function sendInternalLeadNotification({ subject, html, replyTo }) {
  const result = await sendEmail({ to: TO, subject, html, replyTo });
  if (!result.sent) {
    console.error('INTERNAL LEAD NOTIFICATION FAILED', result.error);
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════
   B · PROSPECT CONFIRMATION
   ══════════════════════════════════════════════════════════════════════ */

const BRAND = {
  ink: '#0A0A0A',
  parchment: '#F5F0E8',
  card: '#FFFFFF',
  text: '#16130F',
  muted: '#6B6560',
  gold: '#8A6A28',       // gold on light. #C8A96E fails contrast here.
  goldOnDark: '#C8A96E',
  rule: '#E4DCCB'
};

/** The three things that make a thirty minute retainer call worth having. */
export const BRING_STRATEGY = [
  'What you are spending on marketing or ads right now, if anything',
  'Roughly what one customer is worth to you',
  'What you have already tried, including the things that did not work'
];

/** A project call is about scope, not ad spend. Asking for a media budget
    here is the same mismatch /api/project was built to avoid. */
export const BRING_PROJECT = [
  'Roughly what the finished piece needs to do, and who has to see it',
  'Any deadline or date it has to be ready for',
  'References, brand files or previous work worth watching first'
];

/**
 * Branded confirmation for the person who submitted the form.
 *
 * Restrained on purpose: this is a transactional receipt, and a prospect
 * who just handed over their numbers is owed a plain confirmation rather
 * than a sales email. No superlatives, no urgency, no promises the offer
 * does not already make.
 *
 * @param {object}  o
 * @param {string}  o.email        recipient
 * @param {string}  o.name         full name, greeting uses the first word
 * @param {string}  o.subject
 * @param {string}  o.lede         one or two sentences, already escaped-safe text
 * @param {string}  [o.bookingUrl] omit to send a confirmation with NO booking CTA
 * @param {string}  [o.note]       optional extra paragraph, e.g. founding terms
 * @param {string[]} [o.bring]     what to prepare, defaults to the retainer list
 * @param {string}  [o.ctaLabel]   button text, e.g. "Pick a time"
 */
export async function sendLeadConfirmationEmail({
  email, name, subject, lede, bookingUrl, note,
  bring = BRING_STRATEGY, ctaLabel = 'Pick a time'
}) {
  const first = firstNameOf(name);
  const greeting = first ? `Hi ${esc(first)},` : 'Hi,';

  const cta = bookingUrl ? `
      <tr><td style="padding:6px 32px 4px">
        <a href="${esc(bookingUrl)}"
           style="display:inline-block;background:${BRAND.ink};color:${BRAND.goldOnDark};
                  text-decoration:none;font-size:12px;letter-spacing:.16em;
                  text-transform:uppercase;padding:15px 30px;border-radius:2px">
          ${esc(ctaLabel)}
        </a>
      </td></tr>
      <tr><td style="padding:14px 32px 0;color:${BRAND.muted};font-size:12px;line-height:1.7">
        If the button does not work, this is the link:<br>
        <a href="${esc(bookingUrl)}" style="color:${BRAND.gold};word-break:break-all">${esc(bookingUrl)}</a>
      </td></tr>` : '';

  const bringBlock = bookingUrl ? `
      <tr><td style="padding:30px 32px 0">
        <p style="margin:0 0 10px;font-size:11px;letter-spacing:.22em;
                  text-transform:uppercase;color:${BRAND.gold}">What to bring</p>
        <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-size:14px;line-height:1.85">
          ${bring.map((b) => `<li>${esc(b)}</li>`).join('')}
        </ul>
        <p style="margin:12px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.75">
          Rough numbers beat no numbers. A figure you can defend is more useful than a blank.
        </p>
      </td></tr>` : '';

  const extra = note ? `
      <tr><td style="padding:24px 32px 0;color:${BRAND.text};font-size:14px;line-height:1.8">
        ${esc(note)}
      </td></tr>` : '';

  const html = `<!-- preheader -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(lede)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="background:${BRAND.parchment};margin:0;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.rule};
                  border-radius:3px;overflow:hidden;
                  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">

      <tr><td style="background:${BRAND.ink};padding:22px 32px">
        <span style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:${BRAND.parchment}">
          New Terrain <span style="color:${BRAND.goldOnDark}">Creative</span>
        </span>
      </td></tr>

      <tr><td style="padding:32px 32px 0;color:${BRAND.text};font-size:15px;line-height:1.8">
        <p style="margin:0 0 16px">${greeting}</p>
        <p style="margin:0">${esc(lede)}</p>
      </td></tr>
      ${extra}
      <tr><td style="padding:26px 32px 0"></td></tr>
      ${cta}
      ${bringBlock}

      <tr><td style="padding:30px 32px 32px;color:${BRAND.text};font-size:14px;line-height:1.8">
        <p style="margin:0">Reply to this email if anything changes, or if you would rather
        just ask a question first. It reaches us directly.</p>
        <p style="margin:16px 0 0;color:${BRAND.muted}">Jadon<br>
        <span style="font-size:13px">New Terrain Creative</span></p>
      </td></tr>

      <tr><td style="border-top:1px solid ${BRAND.rule};padding:18px 32px;
                     color:${BRAND.muted};font-size:11px;line-height:1.8">
        New Terrain Creative · Los Angeles, CA · Tampa, FL<br>
        You are receiving this because you submitted a form at newterraincreative.com.
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const textParts = [
    greeting.replace(/&[a-z]+;/g, ''),
    '',
    lede
  ];
  if (note) textParts.push('', note);
  if (bookingUrl) {
    textParts.push('', `${ctaLabel}: ${bookingUrl}`, '',
      'What to bring:', ...bring.map((b) => '  - ' + b));
  }
  textParts.push('', 'Reply to this email if anything changes.',
    '', 'Jadon', 'New Terrain Creative', 'Los Angeles, CA · Tampa, FL');

  const result = await sendEmail({
    to: email,
    subject,
    html,
    text: textParts.join('\n'),
    replyTo: REPLY_TO
  });

  if (!result.sent) {
    // Loud, and specific about who did not get their email. The lead is
    // already stored by the time this runs, so this is a follow-up task
    // for a human, not a lost applicant.
    console.error('PROSPECT CONFIRMATION FAILED', result.error, '· recipient domain:',
      String(email).split('@')[1] || 'unknown');
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════
   C · SMS  ·  Twilio
   ──────────────────────────────────────────────────────────────────────
   Dormant unless every variable is present AND the lead consented.

   Two independent gates, on purpose. `smsConfigured` is an operational
   question: is there an account to send through. `consent` is a legal
   one: did this person agree to be texted. Neither implies the other,
   and having a phone number implies neither.
   ══════════════════════════════════════════════════════════════════════ */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/** True only when Twilio could actually send. Exported so callers can log why not. */
export const smsConfigured = Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_NUMBER);

/** E.164, defaulting to +1. Returns null if it cannot be made valid. */
export function toE164(raw) {
  const digits = String(raw || '').replace(/[^0-9+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
  }
  const d = digits.replace(/^0+/, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

/**
 * Send one transactional SMS.
 *
 * Refuses, loudly and without calling Twilio, if consent is anything
 * other than exactly true. There is no "probably consented" path and no
 * override argument, because the only way this stays compliant is if
 * there is no way to reach Twilio from here without it.
 *
 * @param {object}  o
 * @param {string}  o.to        the lead's phone, any format
 * @param {string}  o.body      the message. Caller appends its own opt-out line.
 * @param {boolean} o.consent   MUST be strictly true
 * @returns {Promise<{sent: boolean, reason?: string, sid?: string, error?: string}>}
 */
export async function sendSms({ to, body, consent }) {
  if (consent !== true) {
    return { sent: false, reason: 'no sms consent' };
  }
  if (!smsConfigured) {
    console.warn('sms: consented lead, but Twilio is not configured — skipping send');
    return { sent: false, reason: 'twilio not configured' };
  }

  const dest = toE164(to);
  if (!dest) return { sent: false, reason: 'unusable phone number' };
  if (!body || !String(body).trim()) return { sent: false, reason: 'empty body' };

  try {
    const form = new URLSearchParams({
      To: dest,
      From: TWILIO_NUMBER,
      Body: String(body).slice(0, 1500)
    });
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_SID)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form.toString()
      }
    );

    if (!r.ok) {
      // Twilio's error body names the parameter at fault, not the token.
      // 21610 is "recipient has opted out" — expected, not a fault.
      const detail = await r.text();
      console.error('TWILIO SEND FAILED', r.status, detail);
      return { sent: false, reason: 'twilio error', error: `twilio ${r.status} ${detail}` };
    }

    const json = await r.json().catch(() => ({}));
    return { sent: true, sid: json.sid };
  } catch (e) {
    console.error('TWILIO SEND FAILED', (e && e.message) || e);
    return { sent: false, reason: 'twilio unreachable', error: (e && e.message) || String(e) };
  }
}

/* ── reminder hooks ────────────────────────────────────────────────────
   Google Calendar already emails its own invitation and reminder for an
   appointment booked through the schedule, so a duplicate 24h email is
   noise. These exist so a reminder can be added without touching the
   sync endpoint's matching logic, and are called only when
   REMINDERS_ENABLED is set. See docs/FUNNEL-AUTOMATION.md.
   ─────────────────────────────────────────────────────────────────── */

export const remindersEnabled = process.env.REMINDERS_ENABLED === 'true';

/** Transactional reminder for a booked call. Same consent gate as any SMS. */
export async function sendBookingReminderSms({ to, consent, firstName, whenLabel, hours }) {
  const who = firstName ? ` ${firstName}` : '';
  const when = hours === 1 ? `in about an hour (${whenLabel})` : `tomorrow, ${whenLabel}`;
  return sendSms({
    to,
    consent,
    body: `Hi${who} — Jadon from New Terrain Creative. Reminder that our strategy call is ${when}. `
        + 'Reply here if anything changes. Reply STOP to opt out.'
  });
}
