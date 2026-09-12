/* ══════════════════════════════════════════════════════════════════════
   POST /api/apply  ·  Founding Three application, two steps
   ──────────────────────────────────────────────────────────────────────
   Zero dependencies: talks to Twilio SendGrid or Resend over REST with
   native fetch, so this project stays buildless (no package.json, no npm
   install). Set SENDGRID_API_KEY or RESEND_API_KEY; SendGrid wins if both
   exist. APPLY_FROM must be a sender verified with whichever provider.

   ── Why two steps ────────────────────────────────────────────────────
   Step one asks whether this is even the right offer for them. Step two
   asks for a commitment, and is the first place the optional $3,500
   continuation is named. Nobody should have that number sprung on them
   after they have already submitted, and nobody should have to read it
   before we know we can help them.

   Step one completing is NOT a conversion. It writes
   initial_fit_completed to our own funnel table and fires nothing to
   Meta. Only step two fires SubmitApplication. Counting step one as a
   lead would inflate every number downstream and teach the ad account to
   optimise for people who never finished.
   ══════════════════════════════════════════════════════════════════════ */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, update, linkSessionToLead, configured as dbReady } from './_supabase.js';

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';
const BOOKING_URL = process.env.BOOKING_URL || 'https://calendar.app.google/qardoZkWtaBsq2RG9';

// Step one: is this the right offer for them.
const STEP_ONE = ['name', 'email', 'phone', 'business', 'sell', 'spend',
                  'who_runs', 'budget', 'infra', 'la', 'capacity', 'goal'];

// Step two: are they actually able to do it.
const STEP_TWO = ['continuation_capacity', 'production_window', 'fit_rationale'];

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', business: 'Business',
  sell: 'What they sell', spend: 'Current ad spend', who_runs: 'Who runs the ads',
  budget: 'Can commit $1,500 month one', infra: 'Landing page + tracking',
  la: 'In Los Angeles', capacity: 'Customer capacity per month',
  goal: 'What they want fixed',
  continuation_capacity: 'Could continue at $3,500/mo if it works',
  production_window: 'Production availability',
  fit_rationale: 'Why them',
  publicity_optin: 'Opted in to being named publicly',
  sms_consent: 'SMS consent',
  utm_source: 'Source', utm_medium: 'Medium', utm_campaign: 'Campaign',
  utm_content: 'Ad / content', utm_term: 'Term', fbclid: 'Meta click id',
  landing_page: 'Landed on', referrer: 'Referrer', utm: 'Query string'
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── step-two handoff token ────────────────────────────────────────────
   Step two patches the row step one created, so the row id travels
   through the browser. Signing it means a returned id is the only id
   that can be patched: an arbitrary uuid typed into a console does not
   verify, and the client never sees the signing key.
   ──────────────────────────────────────────────────────────────────── */
function secret() {
  return process.env.APPLY_STEP_SECRET
      || process.env.SUPABASE_SERVICE_ROLE_KEY
      || Object.keys(process.env).find((k) => k.endsWith('_SUPABASE_SERVICE_ROLE_KEY'))
      || 'unset';
}
function sign(id) {
  return createHmac('sha256', secret()).update(String(id)).digest('hex').slice(0, 32);
}
function verify(id, token) {
  if (!id || !token) return false;
  const a = Buffer.from(sign(id));
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  return { qualified: true };
}

function emailBody(d, verdict, stage) {
  const order = [...STEP_ONE, ...STEP_TWO, 'publicity_optin', 'sms_consent',
                 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                 'utm_term', 'fbclid', 'landing_page', 'referrer', 'utm'];

  const rows = order
    .filter((k) => d[k] !== undefined && d[k] !== '' && d[k] !== false)
    .map((k) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#6B6560;font-size:12px;white-space:nowrap;vertical-align:top">${esc(LABELS[k] || k)}</td>
        <td style="padding:7px 0;color:#16130F;font-size:13px">${esc(d[k] === true ? 'Yes' : d[k]).replace(/\n/g, '<br>')}</td>
      </tr>`).join('');

  let banner;
  if (!verdict.qualified) {
    banner = `<p style="margin:0 0 18px;padding:11px 15px;background:#F7EFEE;border-left:3px solid #B4655A;color:#7A3B32;font-size:13px"><b>Declined at step one.</b> ${esc(verdict.reason)}</p>`;
  } else if (stage === 'prequalified') {
    banner = '<p style="margin:0 0 18px;padding:11px 15px;background:#FBF6EC;border-left:3px solid #8A6A28;color:#5C4718;font-size:13px"><b>Passed step one, has not finished step two.</b> No commitment answers yet, and no conversion recorded. Worth a nudge if it stays this way.</p>';
  } else {
    banner = '<p style="margin:0 0 18px;padding:11px 15px;background:#EEF4EF;border-left:3px solid #3F6B4F;color:#2C4A38;font-size:13px"><b>Complete application.</b> They acknowledged the terms and were shown the booking link.</p>';
  }

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

/** Everything the leads table stores from step one. */
function stepOneRow(d) {
  return {
    form_type: 'founding_application',
    name: d.name, email: d.email, phone: d.phone, business: d.business,
    sell: d.sell, spend: d.spend, who_runs: d.who_runs, budget: d.budget,
    infra: d.infra, la: d.la, capacity: d.capacity, goal: d.goal,
    sms_consent: d.sms_consent === 'yes' || d.sms_consent === true,
    session_id: d.session_id,
    utm_source: d.utm_source, utm_medium: d.utm_medium,
    utm_campaign: d.utm_campaign, utm_content: d.utm_content,
    utm_term: d.utm_term, fbclid: d.fbclid, fbp: d.fbp, fbc: d.fbc,
    landing_page: d.landing_page, referrer: d.referrer
  };
}

/* ══════════════════════════════════════════════════════════════════════
   STEP ONE · fit
   ══════════════════════════════════════════════════════════════════════ */
async function handleStepOne(req, res, d) {
  const missing = STEP_ONE.filter((k) => !d[k] || !String(d[k]).trim());
  if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const verdict = decide(d);
  const now = new Date().toISOString();

  let leadId = null;
  let stored = false;
  if (dbReady) {
    try {
      const row = await insert('leads', {
        ...stepOneRow(d),
        status: verdict.qualified ? 'prequalified' : 'declined',
        prequalified_at: verdict.qualified ? now : undefined,
        decline_reason: verdict.qualified ? undefined : verdict.reason,
        lead_event_id: d.event_id
      }, { returning: true });
      leadId = row && row.id;
      stored = Boolean(leadId);
      if (!stored) console.error('apply step 1: insert returned no id');
    } catch (e) {
      // Loud on purpose. The email fallback below keeps the applicant, but
      // a silent database outage must not look like a healthy form.
      console.error('APPLY STEP 1 DB WRITE FAILED', (e && e.message) || e);
    }
    if (leadId && d.session_id) {
      try { await linkSessionToLead(d.session_id, leadId); }
      catch (e) { console.error('session link failed', (e && e.message) || e); }
    }
    // Measurable, deliberately not a conversion, and never sent to Meta.
    if (verdict.qualified && d.event_id) {
      try {
        await insert('funnel_events', {
          event_id: `${d.event_id}-fit`, event_name: 'initial_fit_completed',
          session_id: d.session_id, lead_id: leadId,
          page_url: d.page, funnel: 'founding_three',
          metadata: { campaign: d.utm_campaign, ad: d.utm_content }
        }, { ignoreConflict: true });
      } catch (e) { console.error('initial_fit_completed failed', (e && e.message) || e); }
    }
  } else {
    console.warn('supabase not configured, step 1 not persisted');
  }

  // A decline ends here, so it is the only chance to tell anyone about it.
  // A prequalified applicant is emailed too: if they never finish step two
  // we still know they exist and can follow up by hand.
  try {
    await notify(
      verdict.qualified
        ? `step 1 · ${String(d.business).slice(0, 60)}`
        : `declined · ${String(d.business).slice(0, 60)}`,
      emailBody(d, verdict, 'prequalified'),
      String(d.email)
    );
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  if (!verdict.qualified) {
    return res.status(200).json({ qualified: false, reason: verdict.reason });
  }
  return res.status(200).json({
    qualified: true,
    step: 1,
    lead_id: leadId || undefined,
    token: leadId ? sign(leadId) : undefined,
    stored
  });
}

/* ══════════════════════════════════════════════════════════════════════
   STEP TWO · commitment. The conversion.
   ══════════════════════════════════════════════════════════════════════ */
async function handleStepTwo(req, res, d) {
  const missing = STEP_TWO.filter((k) => !d[k] || !String(d[k]).trim());
  if (!d.terms_acknowledged) missing.push('terms_acknowledged');
  if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });

  // Step one is re-sent so an applicant is never lost to a database blip
  // between the two steps. It is also the only path when Supabase is down.
  const one = decide(d);
  if (!one.qualified) return res.status(200).json({ qualified: false, reason: one.reason });

  const now = new Date().toISOString();
  const patch = {
    status: 'qualified',
    submitted_at: now,
    terms_acknowledged_at: now,
    continuation_capacity: d.continuation_capacity,
    production_window: d.production_window,
    fit_rationale: d.fit_rationale,
    publicity_optin: d.publicity_optin === true || d.publicity_optin === 'yes',
    lead_event_id: d.event_id
  };

  let leadId = null;
  if (dbReady) {
    const signed = verify(d.lead_id, d.token);
    if (d.lead_id && !signed) console.warn('apply step 2: bad token, treating as a new row');

    if (signed) {
      try {
        await update('leads', d.lead_id, patch);
        leadId = d.lead_id;
      } catch (e) {
        console.error('APPLY STEP 2 DB UPDATE FAILED', (e && e.message) || e);
      }
    }
    // No verified row to patch, either because step one never stored or
    // the token did not check out. Write a complete row instead of losing
    // the application.
    if (!leadId) {
      try {
        const row = await insert('leads', {
          ...stepOneRow(d), ...patch, prequalified_at: now
        }, { returning: true });
        leadId = row && row.id;
        if (!leadId) console.error('apply step 2: insert returned no id');
      } catch (e) {
        console.error('APPLY STEP 2 DB WRITE FAILED', (e && e.message) || e);
      }
    }
    if (leadId && d.session_id) {
      try { await linkSessionToLead(d.session_id, leadId); }
      catch (e) { console.error('session link failed', (e && e.message) || e); }
    }
    if (d.event_id) {
      try {
        await insert('funnel_events', {
          event_id: d.event_id, event_name: 'submit_application',
          session_id: d.session_id, lead_id: leadId,
          page_url: d.page, funnel: 'founding_three',
          metadata: { campaign: d.utm_campaign, ad: d.utm_content }
        }, { ignoreConflict: true });
      } catch (e) { console.error('submit_application event failed', (e && e.message) || e); }
    }
  } else {
    console.warn('supabase not configured, application not persisted');
  }

  try {
    await notify(`QUALIFIED · ${String(d.business).slice(0, 60)}`,
                 emailBody(d, { qualified: true }, 'complete'), String(d.email));
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  // The conversion, matching the browser SubmitApplication on event_id.
  // Meta failing must never cost us the applicant, so this is fire and forget.
  if (d.event_id) {
    try {
      const { ip, userAgent } = requestIdentity(req);
      const [firstName, ...rest] = String(d.name || '').trim().split(/\s+/);
      console.log('capi SubmitApplication', await sendMetaConversion({
        eventName: 'SubmitApplication',
        eventId: String(d.event_id),
        eventSourceUrl: d.page || 'https://www.newterraincreative.com/apply',
        userData: buildUserData({
          email: d.email, phone: d.phone, firstName,
          lastName: rest.join(' ') || undefined,
          externalId: leadId || d.session_id || d.email,
          ip, userAgent, fbp: d.fbp, fbc: d.fbc
        }),
        customData: {
          offer: 'founding_three',
          form_type: 'founding_application',
          content_name: 'Founding Three application',
          content_category: d.spend || undefined
        }
      }));
    } catch (e) {
      console.error('capi SubmitApplication failed', (e && e.message) || e);
    }
  }

  return res.status(200).json({ qualified: true, step: 2, bookingUrl: BOOKING_URL });
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

  return Number(d.step) === 2
    ? handleStepTwo(req, res, d)
    : handleStepOne(req, res, d);
}
