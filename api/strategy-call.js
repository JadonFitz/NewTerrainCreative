/* ══════════════════════════════════════════════════════════════════════
   POST /api/strategy-call  ·  paid retainer enquiry
   ──────────────────────────────────────────────────────────────────────
   Deliberately separate from /api/apply. Different funnel, different
   qualification, different conversion event, so the two never blur in
   reporting.

   No hard gates here. The Founding Three application gates on media
   budget and geography because the offer genuinely requires both. A
   strategy call is a conversation: the budget band question exists so an
   applicant can self-select, and a low band is recorded rather than
   rejected.
   ══════════════════════════════════════════════════════════════════════ */
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, linkSessionToLead, configured as dbReady } from './_supabase.js';

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';

const REQUIRED = ['name', 'email', 'phone', 'business', 'industry', 'authority',
                  'offer', 'value', 'marketing', 'ad_spend', 'budget_band',
                  'start', 'objective', 'response'];

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone', business: 'Business',
  industry: 'Industry', authority: 'Decision authority',
  offer: 'What they sell', value: 'Customer value',
  marketing: 'Current marketing', ad_spend: 'Current ad spend',
  budget_band: 'Monthly budget available', start: 'Desired start',
  objective: '90 day objective', response: 'Lead response speed',
  utm_source: 'Source', utm_medium: 'Medium', utm_campaign: 'Campaign',
  utm_content: 'Ad / content', fbclid: 'Meta click id',
  landing_page: 'Landed on', referrer: 'Referrer'
};

// Not a gate. A hint for whoever reads the email, so the call is prepared for.
const LOW_BANDS = new Set(['Under $2,500', 'Not sure yet']);
const SOFT_SIGNALS = new Set(['Just researching', 'Researching', 'Honestly inconsistent']);

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function triage(d) {
  const flags = [];
  if (LOW_BANDS.has(d.budget_band)) flags.push('budget below typical starting point');
  if (SOFT_SIGNALS.has(d.start)) flags.push('not ready to start');
  if (SOFT_SIGNALS.has(d.response)) flags.push('inconsistent lead follow-up');
  if (d.authority === 'Researching') flags.push('not the decision maker');
  if (d.industry === 'Other') flags.push('outside the four priority industries');
  return flags;
}

function emailBody(d, flags) {
  const rows = [...REQUIRED, 'utm_source', 'utm_medium', 'utm_campaign',
                'utm_content', 'fbclid', 'landing_page', 'referrer']
    .filter((k) => d[k])
    .map((k) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#6B6560;font-size:12px;white-space:nowrap;vertical-align:top">${esc(LABELS[k] || k)}</td>
        <td style="padding:7px 0;color:#16130F;font-size:13px">${esc(d[k]).replace(/\n/g, '<br>')}</td>
      </tr>`).join('');

  const banner = flags.length
    ? `<p style="margin:0 0 18px;padding:11px 15px;background:#FBF6EC;border-left:3px solid #8A6A28;color:#5C4718;font-size:13px"><b>Worth reading before the call:</b> ${esc(flags.join(' · '))}</p>`
    : '<p style="margin:0 0 18px;padding:11px 15px;background:#EEF4EF;border-left:3px solid #3F6B4F;color:#2C4A38;font-size:13px"><b>Clean fit</b> on every qualifying answer.</p>';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px">
    <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8A6A28;margin:0 0 14px">Strategy call request</p>
    ${banner}
    <table style="border-collapse:collapse;width:100%">${rows}</table>
  </div>`;
}

async function notify(subject, html, replyTo) {
  const sg = process.env.SENDGRID_API_KEY;
  if (sg) {
    const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(FROM);
    const from = m ? { name: m[1], email: m[2] } : { email: FROM.trim() };
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sg}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: TO }] }],
        from, reply_to: { email: replyTo }, subject,
        content: [{ type: 'text/html', value: html }]
      })
    });
    if (!r.ok) throw new Error(`sendgrid ${r.status} ${await r.text()}`);
    return 'sendgrid';
  }
  console.warn('no SENDGRID_API_KEY — strategy call request not emailed');
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
  if (d.company_website_confirm) return res.status(200).json({ ok: true });

  const missing = REQUIRED.filter((k) => !d[k] || !String(d[k]).trim());
  if (missing.length) return res.status(400).json({ error: 'Missing fields', missing });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email))) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const flags = triage(d);

  // ── 1 · durable record ────────────────────────────────────────────────
  let leadId = null;
  if (dbReady) {
    try {
      const row = await insert('leads', {
        form_type: 'strategy_call',
        name: d.name, email: d.email, phone: d.phone, business: d.business,
        industry: d.industry, authority: d.authority,
        sell: d.offer, customer_value: d.value, current_marketing: d.marketing,
        spend: d.ad_spend, budget_band: d.budget_band,
        desired_start: d.start, goal: d.objective, lead_response: d.response,
        status: flags.length ? 'new' : 'qualified',
        decline_reason: flags.length ? flags.join('; ') : undefined,
        session_id: d.session_id,
        utm_source: d.utm_source, utm_medium: d.utm_medium,
        utm_campaign: d.utm_campaign, utm_content: d.utm_content,
        utm_term: d.utm_term, fbclid: d.fbclid, fbp: d.fbp, fbc: d.fbc,
        landing_page: d.landing_page, referrer: d.referrer,
        lead_event_id: d.event_id
      }, { returning: true });
      leadId = row && row.id;
    } catch (e) {
      console.error('strategy call store failed, continuing', (e && e.message) || e);
    }
    if (leadId && d.session_id) {
      try { await linkSessionToLead(d.session_id, leadId); } catch (e) {
        console.error('session link failed', (e && e.message) || e);
      }
    }
    if (d.event_id) {
      try {
        await insert('funnel_events', {
          event_id: d.event_id, event_name: 'schedule',
          session_id: d.session_id, lead_id: leadId, page_url: d.page,
          metadata: { campaign: d.utm_campaign, ad: d.utm_content, funnel: 'retainer' }
        }, { ignoreConflict: true });
      } catch (e) { console.error('schedule event failed', (e && e.message) || e); }
    }
  }

  // ── 2 · notify ────────────────────────────────────────────────────────
  try {
    await notify(`Strategy call · ${String(d.business).slice(0, 60)}`,
                 emailBody(d, flags), String(d.email));
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  // ── 3 · Meta, server side, deduplicated against the browser Schedule ──
  if (d.event_id) {
    try {
      const { ip, userAgent } = requestIdentity(req);
      const [firstName, ...rest] = String(d.name || '').trim().split(/\s+/);
      console.log('capi Schedule', await sendMetaConversion({
        eventName: 'Schedule',
        eventId: String(d.event_id),
        eventSourceUrl: d.page || 'https://www.newterraincreative.com/strategy-call',
        userData: buildUserData({
          email: d.email, phone: d.phone, firstName,
          lastName: rest.join(' ') || undefined,
          externalId: leadId || d.session_id || d.email,
          ip, userAgent, fbp: d.fbp, fbc: d.fbc
        }),
        customData: { content_name: 'Strategy call request', content_category: d.industry }
      }));
    } catch (e) {
      console.error('capi Schedule failed', (e && e.message) || e);
    }
  }

  return res.status(200).json({ ok: true });
}
