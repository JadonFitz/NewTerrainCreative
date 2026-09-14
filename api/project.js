/* ══════════════════════════════════════════════════════════════════════
   POST /api/project  ·  Signature Work enquiry
   ──────────────────────────────────────────────────────────────────────
   The third funnel. Signature Work is a commercial, documentary, brand
   film or podcast build-out: a project, not a monthly retainer and not
   the Founding Three.

   It exists because the homepage used to send these straight to a
   calendar with nothing captured, and because routing them through
   /api/strategy-call would have asked a documentary enquiry for its
   monthly ad spend and lead response time. Those questions have no
   sensible answer here, and a form that asks them reads as a studio that
   was not listening.

   No hard gates. A project enquiry is a conversation about scope, and
   the budget question exists so someone can self-select rather than be
   turned away by a form.

   Fires Meta Lead with offer: signature_work, form_type: project_enquiry,
   so it is separable from the paid retainer in reporting while still
   being a lead. Never SubmitApplication, which belongs to the Founding
   Three, and never Schedule.
   ══════════════════════════════════════════════════════════════════════ */
import { sendMetaConversion, buildUserData, requestIdentity } from './_meta.js';
import { insert, linkSessionToLead, configured as dbReady } from './_supabase.js';
import { resolveOffer } from './_offer.js';

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';

const REQUIRED = ['name', 'email', 'business', 'project_type',
                  'project_scope', 'start', 'budget_band', 'authority'];

const LABELS = {
  name: 'Name', email: 'Email', phone: 'Phone',
  business: 'Business', website: 'Website',
  project_type: 'What we would be making',
  project_scope: 'What they described',
  start: 'Timeline', budget_band: 'Budget range',
  authority: 'Decision authority',
  utm_source: 'Source', utm_medium: 'Medium', utm_campaign: 'Campaign',
  utm_content: 'Ad / content', fbclid: 'Meta click id',
  landing_page: 'Landed on', referrer: 'Referrer'
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Not a gate, a hint for whoever reads the email so the call is prepared.
const LOW_BANDS = new Set(['Under $10,000', 'Not sure yet']);

function triage(d) {
  const flags = [];
  if (LOW_BANDS.has(d.budget_band)) flags.push('budget below a typical project');
  if (d.start === 'Just exploring') flags.push('no timeline yet');
  if (d.authority === 'Gathering information') flags.push('not the decision maker');
  return flags;
}

function emailBody(d, flags) {
  const rows = [...REQUIRED, 'phone', 'website', 'utm_source', 'utm_medium',
                'utm_campaign', 'utm_content', 'fbclid', 'landing_page', 'referrer']
    .filter((k) => d[k])
    .map((k) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#6B6560;font-size:12px;white-space:nowrap;vertical-align:top">${esc(LABELS[k] || k)}</td>
        <td style="padding:7px 0;color:#16130F;font-size:13px">${esc(d[k]).replace(/\n/g, '<br>')}</td>
      </tr>`).join('');

  const banner = flags.length
    ? `<p style="margin:0 0 18px;padding:11px 15px;background:#FBF6EC;border-left:3px solid #8A6A28;color:#5C4718;font-size:13px"><b>Worth reading first:</b> ${esc(flags.join(' · '))}</p>`
    : '<p style="margin:0 0 18px;padding:11px 15px;background:#EEF4EF;border-left:3px solid #3F6B4F;color:#2C4A38;font-size:13px"><b>Clean fit</b> on every qualifying answer.</p>';

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px">
    <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8A6A28;margin:0 0 14px">Signature Work · project enquiry</p>
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
  console.warn('no SENDGRID_API_KEY — project enquiry not emailed');
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

  // Signature Work by default. /sprint sends ?offer=ad-sprint, because an
  // Ad Sprint is also a one-time project and asking it monthly-retainer
  // questions would be the same mismatch /project was built to avoid.
  // form_type stays project_enquiry either way: the DB constraint permits
  // three values and the two are told apart by this identifier plus the
  // first-touch landing_page, so no schema change is needed.
  const offerId = resolveOffer(d.offer_id, 'signature_work');

  const flags = triage(d);
  let leadId = null;
  let stored = false;

  // ── 1 · durable record ────────────────────────────────────────────────
  if (dbReady) {
    try {
      const row = await insert('leads', {
        form_type: 'project_enquiry',
        name: d.name, email: d.email, phone: d.phone,
        business: d.business, website: d.website,
        project_type: d.project_type, project_scope: d.project_scope,
        desired_start: d.start, budget_band: d.budget_band,
        authority: d.authority,
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
      stored = Boolean(leadId);
      if (!stored) console.error('project enquiry: insert returned no id');
    } catch (e) {
      // Loud on purpose. The email below keeps the enquiry, but a silent
      // database outage must never look like a healthy form.
      console.error('PROJECT ENQUIRY DB WRITE FAILED', (e && e.message) || e);
    }
    if (leadId && d.session_id) {
      try { await linkSessionToLead(d.session_id, leadId); }
      catch (e) { console.error('session link failed', (e && e.message) || e); }
    }
    if (d.event_id) {
      try {
        await insert('funnel_events', {
          event_id: d.event_id, event_name: 'lead',
          session_id: d.session_id, lead_id: leadId, page_url: d.page,
          funnel: offerId,
          metadata: { campaign: d.utm_campaign, ad: d.utm_content,
                      offer: offerId, project_type: d.project_type }
        }, { ignoreConflict: true });
      } catch (e) { console.error('lead event failed', (e && e.message) || e); }
    }
  } else {
    console.warn('supabase not configured, project enquiry not persisted');
  }

  // ── 2 · notify ────────────────────────────────────────────────────────
  let notified = false;
  try {
    await notify(`Project · ${String(d.business).slice(0, 60)}`,
                 emailBody(d, flags), String(d.email));
    notified = true;
  } catch (e) {
    console.error('notify failed', (e && e.message) || e);
  }

  // ── 3 · Meta, deduplicated against the browser copy on event_id ───────
  if (d.event_id) {
    try {
      const { ip, userAgent } = requestIdentity(req);
      const [firstName, ...rest] = String(d.name || '').trim().split(/\s+/);
      console.log('capi Lead', await sendMetaConversion({
        eventName: 'Lead',
        eventId: String(d.event_id),
        eventSourceUrl: d.page || 'https://www.newterraincreative.com/project',
        userData: buildUserData({
          email: d.email, phone: d.phone, firstName,
          lastName: rest.join(' ') || undefined,
          externalId: leadId || d.session_id || d.email,
          ip, userAgent, fbp: d.fbp, fbc: d.fbc
        }),
        customData: {
          offer: offerId,
          form_type: 'project_enquiry',
          content_name: 'Signature Work enquiry',
          content_category: d.project_type
        }
      }));
    } catch (e) {
      console.error('capi Lead failed', (e && e.message) || e);
    }
  }

  return res.status(200).json({ ok: true, captured: { stored, notified } });
}
