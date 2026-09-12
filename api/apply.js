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

   Step one completing is NOT a conversion. The browser records an
   anonymous initial_fit_completed event in our own funnel table and
   sends no contact details. Only step two persists an applicant and
   fires SubmitApplication. Counting step one as a lead would inflate
   every number downstream and teach the ad account to optimise for
   people who never finished.
   ══════════════════════════════════════════════════════════════════════ */

import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, linkSessionToLead, configured as dbReady } from './_supabase.js';

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';
const BOOKING_URL = process.env.BOOKING_URL || 'https://calendar.app.google/qardoZkWtaBsq2RG9';

// Step one: is this the right offer for them, and who are we talking to.
const STEP_ONE = ['name', 'email', 'phone', 'role', 'authority',
                  'business', 'website', 'industry', 'sell',
                  'spend', 'who_runs', 'budget', 'infra',
                  'la', 'service_area', 'budget_90d', 'capacity', 'goal'];

// Step two: are they actually able to do it, and can we measure it.
const STEP_TWO = ['customer_value', 'lead_sources', 'lead_owner', 'lead_response',
                  'continuation_capacity', 'production_window', 'fit_rationale'];

// Industry drives the vertical comparison the whole ad experiment rests
// on, so an unrecognised value is recorded as given rather than silently
// coerced. Kept in sync with assets/offer.js industries by hand: a server
// module cannot import a browser IIFE without a build step.
const INDUSTRIES = ['Health and wellness', 'Law firm', 'Dental practice',
                    'Construction or contracting'];
const normaliseIndustry = (v) => {
  const t = String(v || '').trim();
  return INDUSTRIES.includes(t) ? t : (t ? 'Other' : undefined);
};

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone',
  role: 'Their role', authority: 'Decision authority',
  business: 'Business', website: 'Website', industry: 'Industry',
  sell: 'What they sell', spend: 'Current ad spend', who_runs: 'Who runs the ads',
  budget: 'Can commit $1,500 month one', infra: 'Landing page + tracking',
  la: 'In Los Angeles', service_area: 'Service area',
  budget_90d: '90-day marketing budget',
  capacity: 'Customer capacity per month',
  goal: 'What they want fixed',
  customer_value: 'Value of one customer',
  lead_sources: 'Current lead sources',
  lead_owner: 'Who answers enquiries',
  lead_response: 'Lead response time',
  continuation_capacity: 'Could continue at $3,500/mo if it works',
  production_window: 'Production availability',
  fit_rationale: 'Why them',
  data_agreement: 'Agreed to share lead, appointment and sale data',
  publicity_optin: 'Opted in to being named publicly',
  sms_consent: 'SMS consent',
  utm_source: 'Source', utm_medium: 'Medium', utm_campaign: 'Campaign',
  utm_content: 'Ad / content', utm_term: 'Term', fbclid: 'Meta click id',
  landing_page: 'Landed on', referrer: 'Referrer', utm: 'Query string'
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
  return { qualified: true };
}

function emailBody(d, verdict, stage) {
  const order = [...STEP_ONE, ...STEP_TWO,
                 'data_agreement', 'publicity_optin', 'sms_consent',
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
    name: d.name, email: d.email, phone: d.phone,
    role: d.role, authority: d.authority,
    business: d.business, website: d.website,
    industry: normaliseIndustry(d.industry),
    sell: d.sell, spend: d.spend, who_runs: d.who_runs, budget: d.budget,
    infra: d.infra, la: d.la, service_area: d.service_area,
    budget_90d: d.budget_90d, capacity: d.capacity, goal: d.goal,
    sms_consent: d.sms_consent === 'yes' || d.sms_consent === true,
    session_id: d.session_id,
    utm_source: d.utm_source, utm_medium: d.utm_medium,
    utm_campaign: d.utm_campaign, utm_content: d.utm_content,
    utm_term: d.utm_term, fbclid: d.fbclid, fbp: d.fbp, fbc: d.fbc,
    landing_page: d.landing_page, referrer: d.referrer
  };
}

function validateStepOne(d) {
  const missing = STEP_ONE.filter((k) => !d[k] || !String(d[k]).trim());
  if (missing.length) return { error: 'Missing fields', missing };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) {
    return { error: 'Invalid email' };
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
   STEP ONE · fit check only

   The normal browser flow performs this check locally and records an
   anonymous event through /api/track. Keeping this endpoint response is
   useful for non-browser clients, but it deliberately performs no write,
   email or Meta call. Personal data is not a lead until the application
   is complete.
   ══════════════════════════════════════════════════════════════════════ */
async function handleStepOne(req, res, d) {
  const invalid = validateStepOne(d);
  if (invalid) return res.status(400).json(invalid);
  const verdict = decide(d);
  return res.status(200).json({ ...verdict, step: 1 });
}

/* ══════════════════════════════════════════════════════════════════════
   STEP TWO · commitment. The conversion.
   ══════════════════════════════════════════════════════════════════════ */
async function handleStepTwo(req, res, d) {
  const invalid = validateStepOne(d);
  if (invalid) return res.status(400).json(invalid);

  const missing = STEP_TWO.filter((k) => !d[k] || !String(d[k]).trim());
  if (!d.terms_acknowledged) missing.push('terms_acknowledged');
  if (!d.data_agreement) missing.push('data_agreement');
  if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });

  // Step one is re-sent from browser memory. The server receives and stores
  // personal data only now, once the application is complete.
  const one = decide(d);
  if (!one.qualified) return res.status(200).json({ qualified: false, reason: one.reason });

  const now = new Date().toISOString();
  const patch = {
    status: 'qualified',
    submitted_at: now,
    terms_acknowledged_at: now,
    // Timestamped rather than a boolean: for the waived month this is the
    // clause that makes the arrangement measurable, so when they agreed
    // matters as much as that they did.
    data_agreement_at: now,
    customer_value: d.customer_value,
    lead_sources: d.lead_sources,
    lead_owner: d.lead_owner,
    lead_response: d.lead_response,
    continuation_capacity: d.continuation_capacity,
    production_window: d.production_window,
    fit_rationale: d.fit_rationale,
    publicity_optin: d.publicity_optin === true || d.publicity_optin === 'yes',
    lead_event_id: d.event_id
  };

  let leadId = null;
  let stored = false;
  if (dbReady) {
    try {
      const row = await insert('leads', {
        ...stepOneRow(d), ...patch, prequalified_at: now
      }, { returning: true });
      leadId = row && row.id;
      stored = Boolean(leadId);
      if (!leadId) console.error('apply step 2: insert returned no id');
    } catch (e) {
      console.error('APPLY STEP 2 DB WRITE FAILED', (e && e.message) || e);
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
          metadata: {
            campaign: d.utm_campaign, ad: d.utm_content,
            industry: normaliseIndustry(d.industry)
          }
        }, { ignoreConflict: true });
      } catch (e) { console.error('submit_application event failed', (e && e.message) || e); }
    }
  } else {
    console.warn('supabase not configured, application not persisted');
  }

  let notified = false;
  try {
    const provider = await notify(`QUALIFIED · ${String(d.business).slice(0, 60)}`,
                                  emailBody(d, { qualified: true }, 'complete'), String(d.email));
    notified = provider !== 'none';
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  // Do not show a success screen or train Meta on a conversion if both
  // capture paths failed. The browser will leave the form intact for retry.
  if (!stored && !notified) {
    return res.status(503).json({
      error: 'We could not save the application. Please try again or email business@newterraincreative.com.'
    });
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
          content_category: normaliseIndustry(d.industry) || undefined
        }
      }));
    } catch (e) {
      console.error('capi SubmitApplication failed', (e && e.message) || e);
    }
  }

  return res.status(200).json({
    qualified: true,
    step: 2,
    bookingUrl: BOOKING_URL,
    captured: { stored, notified }
  });
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
