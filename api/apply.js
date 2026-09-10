// Founding Three application handler.
// Zero dependencies: talks to Twilio SendGrid or Resend over REST with native
// fetch, so this project stays buildless (no package.json, no npm install).
// Set SENDGRID_API_KEY or RESEND_API_KEY; SendGrid wins if both exist.
// APPLY_FROM must be a sender you have verified with whichever provider.

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';
const BOOKING_URL = process.env.BOOKING_URL || 'https://calendar.app.google/qardoZkWtaBsq2RG9';

const REQUIRED = ['name', 'email', 'phone', 'business', 'sell', 'spend',
                  'who_runs', 'budget', 'infra', 'la', 'capacity', 'goal'];

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', business: 'Business',
  sell: 'What they sell', spend: 'Current ad spend', who_runs: 'Who runs the ads',
  budget: 'Can commit $1,500 month one', infra: 'Landing page + tracking',
  la: 'In Los Angeles', capacity: 'Customer capacity per month',
  goal: 'What they want fixed', sms_consent: 'SMS consent',
  utm: 'Query string', referrer: 'Referrer'
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function decide(d) {
  if (d.budget !== 'Yes') {
    return {
      qualified: false,
      reason: 'The founding programme needs $1,500 in month-one ad spend to produce anything either of us could learn from, and you told us that is not workable right now. That is a timing problem, not a verdict on the business.'
    };
  }
  if (d.la !== 'Yes') {
    return {
      qualified: false,
      reason: 'For these first three we are shooting on location in Los Angeles and not travelling, so geography is the blocker rather than anything about your business.'
    };
  }
  return { qualified: true, bookingUrl: BOOKING_URL };
}

function emailBody(d, verdict) {
  const rows = [...REQUIRED, 'sms_consent', 'utm', 'referrer']
    .filter((k) => d[k])
    .map((k) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#6B6560;font-size:12px;white-space:nowrap;vertical-align:top">${esc(LABELS[k] || k)}</td>
        <td style="padding:7px 0;color:#16130F;font-size:13px">${esc(d[k]).replace(/\n/g, '<br>')}</td>
      </tr>`).join('');

  const banner = verdict.qualified
    ? '<p style="margin:0 0 18px;padding:11px 15px;background:#EEF4EF;border-left:3px solid #3F6B4F;color:#2C4A38;font-size:13px"><b>Qualified.</b> They were shown the booking link.</p>'
    : `<p style="margin:0 0 18px;padding:11px 15px;background:#F7EFEE;border-left:3px solid #B4655A;color:#7A3B32;font-size:13px"><b>Declined.</b> ${esc(verdict.reason)}</p>`;

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px">
    <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8A6A28;margin:0 0 14px">Founding Three · application</p>
    ${banner}
    <table style="border-collapse:collapse;width:100%">${rows}</table>
  </div>`;
}

function parseFrom(v) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(v);
  return m ? { name: m[1], email: m[2] } : { name: '', email: String(v).trim() };
}

async function notify(subject, html, replyTo) {
  const from = parseFrom(FROM);

  if (process.env.SENDGRID_API_KEY) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: TO }] }],
        from: from.name ? from : { email: from.email },
        reply_to: { email: replyTo },
        subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    // SendGrid returns 202 with an empty body on success
    if (!r.ok) throw new Error(`sendgrid ${r.status} ${await r.text()}`);
    return 'sendgrid';
  }

  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: replyTo, subject, html })
    });
    if (!r.ok) throw new Error(`resend ${r.status} ${await r.text()}`);
    return 'resend';
  }

  console.warn('No SENDGRID_API_KEY or RESEND_API_KEY set — application not emailed');
  return 'none';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return res.status(400).json({ error: 'Bad request' });

  // honeypot: real people never fill this
  if (d.company_website_confirm) return res.status(200).json({ qualified: false, reason: '' });

  const missing = REQUIRED.filter((k) => !d[k] || !String(d[k]).trim());
  if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const verdict = decide(d);

  // Notify, but never let a mail failure cost us the applicant.
  // Works with Twilio SendGrid or Resend, whichever key is present.
  const subject = `${verdict.qualified ? 'QUALIFIED' : 'declined'} · ${String(d.business).slice(0, 60)}`;
  const html = emailBody(d, verdict);
  try {
    await notify(subject, html, String(d.email));
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  return res.status(200).json(verdict);
}
