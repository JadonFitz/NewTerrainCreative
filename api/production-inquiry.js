/* ══════════════════════════════════════════════════════════════════════
   POST /api/production-inquiry  ·  one-time production inquiry
   ──────────────────────────────────────────────────────────────────────
   The project form on /next-step (was /production-inquiry until 20 Oct
   2026, which now redirects there), where the iClosed booking forms send
   anyone under their floor. A one-off project, not a retainer, so it is
   stored as its own form_type and never counted with retainer leads.
   The endpoint, the form id and the payload kept their old names on
   purpose: renaming them would only break in-flight submissions.
   Since 20 Oct 2026 the page no longer asks for business_name or
   timeline. Both are still accepted, and checked when present, so an
   older tab can still submit; when empty they are left out of the email
   and stored as null.

   Store first. Unlike /api/project, a failed write is an error here: the
   page then shows the fallback email, so nothing depends on the alert
   email arriving. Once the row exists, a failed notification is logged
   and the visitor still gets 200.

   Deliberately does NOT:
     · fire any Meta event, server side or otherwise. These are leads the
       retainer application turned away, and a conversion would teach the
       Brand Builder campaign to find more of them.
     · email the person who submitted
     · create a booking, a calendar event or an iClosed record. Good
       projects are invited to a call by hand.
     · write a funnel_events row. The browser's ProductionInquiry event
       is custom and never stored, and the leads row is the record.

   No rate limit, matching /api/project and /api/apply. The honeypot runs
   in the browser, and the duplicate check below absorbs resubmits.

   Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SENDGRID_API_KEY, and
   optionally APPLY_TO and APPLY_FROM, all shared with /api/project.
   ══════════════════════════════════════════════════════════════════════ */
import { insert, select, configured as dbReady } from './_supabase.js';

const TO = process.env.APPLY_TO || 'business@newterraincreative.com';
const FROM = process.env.APPLY_FROM || 'New Terrain Creative <applications@newterraincreative.com>';

const FORM = 'production-inquiry';
const FORM_TYPE = 'production_inquiry';
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

// The page's visible labels, exactly. Anything else is refused.
// timeline is optional (see OPTIONAL_CHOICES): an empty one is fine.
export const CHOICES = {
  production_type: ['Commercial or brand video', 'Social media content',
                    'Podcast or interview', 'Other production'],
  budget_range: ['Under $3,000', '$3,000 to $5,000', '$5,000 to $10,000', '$10,000+'],
  timeline: ['Within 30 days', '1 to 3 months', 'Flexible']
};

export const PRIORITY = {
  'Under $3,000': 'low',
  '$3,000 to $5,000': 'review',
  '$5,000 to $10,000': 'high',
  '$10,000+': 'high'
};

const REQUIRED = ['full_name', 'email', 'phone', 'production_type',
                  'budget_range', 'project_description'];
const OPTIONAL_CHOICES = new Set(['timeline']);

// Every string the page sends, with its longest acceptable length.
const CAPS = {
  form: 40, full_name: 120, email: 254, phone: 40, business_name: 160,
  website_or_instagram: 300, production_type: 60, budget_range: 40, timeline: 40,
  project_description: 600, source: 120, utm_source: 200, utm_medium: 200,
  utm_campaign: 200, utm_content: 200, page_url: 2000, referrer: 2000,
  submitted_at: 40
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Returns { lead } or { error, status, fields? }. Pure, so it is testable. */
export function validate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { status: 400, error: 'Bad request' };
  if (d.form !== FORM) return { status: 400, error: 'Unknown form' };

  const v = {};
  const tooLong = [];
  for (const [k, max] of Object.entries(CAPS)) {
    const raw = d[k];
    if (raw == null) { v[k] = ''; continue; }
    if (typeof raw !== 'string') return { status: 400, error: 'Invalid field', fields: [k] };
    const s = raw.trim();
    if (s.length > max) tooLong.push(k);
    v[k] = s;
  }
  if (tooLong.length) return { status: 400, error: 'Field too long', fields: tooLong };

  const missing = REQUIRED.filter((k) => !v[k]);
  if (missing.length) return { status: 400, error: 'Missing fields', fields: missing };

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) {
    return { status: 400, error: 'Invalid email', fields: ['email'] };
  }
  if (v.phone.replace(/\D/g, '').length < 7) {
    return { status: 400, error: 'Invalid phone', fields: ['phone'] };
  }
  const badChoice = Object.keys(CHOICES).filter((k) =>
    !(OPTIONAL_CHOICES.has(k) && !v[k]) && !CHOICES[k].includes(v[k]));
  if (badChoice.length) return { status: 400, error: 'Invalid choice', fields: badChoice };

  return { lead: { ...v, priority: PRIORITY[v.budget_range] } };
}

/**
 * Same email and description inside the window. Reads recent rows of this
 * form_type only and compares in code, so no request input is ever
 * interpolated into the PostgREST query.
 */
async function isDuplicate(lead) {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const rows = await select('leads',
    `select=email,project_scope&form_type=eq.${FORM_TYPE}` +
    `&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=200`);
  const email = lead.email.toLowerCase();
  return (rows || []).some((r) =>
    String(r.email || '').toLowerCase() === email && r.project_scope === lead.project_description);
}

/**
 * GoHighLevel goes here when the CRM moves. Deliberately a no-op today:
 * nothing is forwarded anywhere. Called only after the lead is stored,
 * and a throw from it never fails the request.
 */
export async function forwardToCrm(lead) { // eslint-disable-line no-unused-vars
  return 'skipped';
}

const PRIORITY_LABEL = { high: 'HIGH', review: 'REVIEW', low: 'LOW' };

function emailBody(lead) {
  const head = [
    ['Priority', PRIORITY_LABEL[lead.priority]],
    ['Name', lead.full_name],
    ['Business', lead.business_name],
    ['Production', lead.production_type],
    ['Budget', lead.budget_range],
    ['Timeline', lead.timeline]
  ].filter(([, val]) => val);
  const rest = [
    ['Email', lead.email], ['Phone', lead.phone],
    ['Website or Instagram', lead.website_or_instagram],
    ['The project', lead.project_description],
    ['Came from', lead.source], ['Source', lead.utm_source], ['Medium', lead.utm_medium],
    ['Campaign', lead.utm_campaign], ['Ad / content', lead.utm_content],
    ['Page', lead.page_url], ['Referrer', lead.referrer]
  ];
  const row = ([k, val]) => `<tr>
        <td style="padding:7px 14px 7px 0;color:#6B6560;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td>
        <td style="padding:7px 0;color:#16130F;font-size:13px">${esc(val).replace(/\n/g, '<br>')}</td>
      </tr>`;
  const tone = { high: ['#EEF4EF', '#3F6B4F', '#2C4A38'],
                 review: ['#FBF6EC', '#8A6A28', '#5C4718'],
                 low: ['#F4F1EE', '#8B847D', '#4A4540'] }[lead.priority];

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px">
    <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8A6A28;margin:0 0 14px">One-time production inquiry</p>
    <p style="margin:0 0 18px;padding:11px 15px;background:${tone[0]};border-left:3px solid ${tone[1]};color:${tone[2]};font-size:13px"><b>${esc(PRIORITY_LABEL[lead.priority])} priority</b> · ${[lead.budget_range, lead.timeline].filter(Boolean).map(esc).join(' · ')}</p>
    <table style="border-collapse:collapse;width:100%">${head.map(row).join('')}</table>
    <hr style="border:0;border-top:1px solid #E6E1DA;margin:14px 0">
    <table style="border-collapse:collapse;width:100%">${rest.filter(([, val]) => val).map(row).join('')}</table>
    <p style="margin:18px 0 0;color:#8B847D;font-size:12px">Nothing was sent to them. Reply to this email to reach them directly.</p>
  </div>`;
}

async function notify(subject, html, replyTo) {
  const sg = process.env.SENDGRID_API_KEY;
  if (!sg) {
    console.warn('no SENDGRID_API_KEY, production inquiry not emailed');
    return false;
  }
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
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let d = req.body;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  // The page drops honeypot submits itself; this catches a direct POST.
  if (d && typeof d === 'object' && d.company_url_confirm) return res.status(200).json({ ok: true });

  const { lead, error, status, fields } = validate(d);
  if (error) return res.status(status).json(fields ? { error, fields } : { error });

  if (!dbReady) {
    console.error('PRODUCTION INQUIRY NOT STORED: supabase not configured');
    return res.status(503).json({ error: 'Unavailable' });
  }

  // ── 1 · duplicate check. A failed read never blocks a real lead. ─────
  try {
    if (await isDuplicate(lead)) {
      console.log('production inquiry: duplicate within 10 minutes, dropped');
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    console.error('production inquiry duplicate check failed', (e && e.message) || e);
  }

  // ── 2 · durable record, or an error the page can act on ──────────────
  let leadId = null;
  try {
    const row = await insert('leads', {
      form_type: FORM_TYPE,
      status: 'new',
      priority: lead.priority,
      name: lead.full_name, email: lead.email, phone: lead.phone,
      business: lead.business_name || null, website: lead.website_or_instagram,
      project_type: lead.production_type, project_scope: lead.project_description,
      desired_start: lead.timeline || null, budget_band: lead.budget_range,
      entry_point: lead.source,
      utm_source: lead.utm_source, utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign, utm_content: lead.utm_content,
      landing_page: lead.page_url, referrer: lead.referrer
    }, { returning: true });
    leadId = row && row.id;
  } catch (e) {
    console.error('PRODUCTION INQUIRY DB WRITE FAILED', (e && e.message) || e);
  }
  if (!leadId) return res.status(500).json({ error: 'Could not save' });

  // ── 3 · after this point nothing can fail the request ────────────────
  // The subject names the business, else the website or Instagram, else
  // just the person.
  const who = lead.business_name || lead.website_or_instagram;
  try {
    await notify(
      `[${PRIORITY_LABEL[lead.priority]}] Production inquiry · ${lead.full_name.slice(0, 60)}` +
        (who ? ` · ${who.slice(0, 60)}` : ''),
      emailBody(lead), lead.email);
  } catch (e) {
    console.error('production inquiry notify failed', (e && e.message) || e);
  }

  try { await forwardToCrm({ id: leadId, ...lead }); }
  catch (e) { console.error('forwardToCrm failed', (e && e.message) || e); }

  return res.status(200).json({ ok: true });
}
