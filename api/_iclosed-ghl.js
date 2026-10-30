/* ══════════════════════════════════════════════════════════════════════
   iClosed → GoHighLevel · the lead bridge
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint. Called
   from /api/iclosed-webhook for every delivery, before that handler
   decides whether the delivery is a Meta conversion.

   WHAT IT DOES
   iClosed is still where leads book. The follow-up workflows live in
   GHL. This copies each iClosed lead into the New Terrain GHL location
   (never MASTER, see _ghl.js) so those workflows can see them:

     iClosed says                     GHL gets
     ─────────────────────────────    ──────────────────────────────────
     contact, status Potential        tags iclosed + stage:potential,
                                      an open deal at Started form
     contact, status Qualified        tags iclosed + stage:qualified,
                                      an open deal at Started form
     contact, status Disqualified     tags iclosed + dq:iclosed + the
                                      offer's dq tag (dq:growth unless
                                      the event says otherwise), deal at
                                      Disqualified
     Call booked (or status booked)   tag iclosed, stage tags off, deal
                                      at Booked
     Outcome added, NO_SHOW           deal at No-show
     Outcome added, SALE              deal at Won
     Outcome added, anything else     deal at Showed
     Call cancelled / rescheduled     nothing yet, logged

   Never src:ghl. That tag starts the website-lead instant reply, which
   tells the person to pick a call time; an iClosed lead is already on
   the calendar or in iClosed's own sequence.

   NEVER BACKWARD
   A deal only moves forward: Started form → Booked → Showed / No-show →
   Plan sent → Won / Lost. Won and Lost are never moved. The one step
   back allowed is No-show → Booked, because a no-show who rebooks has
   to leave No-show or the no-show follow-up keeps chasing them.

   TEXTING CONSENT
   sms:optin is the gate every GHL texting step checks. It goes on only
   when the payload carries an explicit yes: a consent field set true, or
   a booking-form question about texts answered yes. iClosed documents
   no consent field, and invitee.text_reminder_number is a reminder
   number, not consent, so it is never read as one. With no explicit yes
   the tag is simply not added; it is never taken off here (STOP is GHL's
   job). The question labels that looked consent-like are logged, labels
   only, so the real field can be confirmed from a live delivery.

   DORMANT UNTIL SWITCHED ON
   Needs GHL_API_TOKEN (and the location, which defaults) AND
   ICLOSED_GHL_BRIDGE=on. Either missing, it does nothing and says so.
   Never throws and never holds the webhook long: iClosed disables a
   webhook that keeps failing, and the Meta conversion must still go.
   ══════════════════════════════════════════════════════════════════════ */
import * as ghl from './_ghl.js';

const BUDGET_MS = 15000;

/* Scalars only, same rule as the webhook's own pick(). */
export const pick = (obj, ...paths) => {
  for (const path of paths) {
    let v = obj;
    for (const part of path.split('.')) {
      if (v == null || typeof v !== 'object') { v = undefined; break; }
      v = v[part];
    }
    if (v === undefined || v === null || typeof v === 'object') continue;
    if (String(v).trim() !== '') return v;
  }
  return undefined;
};

export function enabled() {
  return String(process.env.ICLOSED_GHL_BRIDGE || '').trim().toLowerCase() === 'on' &&
    ghl.configured();
}

// ── reading the delivery ──────────────────────────────────────────────

const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/[_-]+/g, ' ').trim();

/** "potential" | "qualified" | "disqualified" | "booked" | "" */
export function statusOf(d) {
  const s = norm(pick(d,
    'contact.status', 'contact.contactStatus', 'contact.contact_status', 'contact.leadStatus',
    'updatedAttributes.status', 'contact.updatedAttributes.status',
    'status', 'contactStatus', 'contact_status', 'leadStatus'));
  if (!s) return '';
  if (s.includes('disqualif') || s.includes('unqualif')) return 'disqualified';
  if (s.includes('book')) return 'booked';
  if (s.includes('qualif')) return 'qualified';
  if (s.includes('potential')) return 'potential';
  return '';
}

/** "no-show" | "sale" | "other" | "" */
export function outcomeOf(d) {
  const reason = norm(pick(d,
    'noSaleReason', 'no_sale_reason', 'outcome.noSaleReason', 'outcome.no_sale_reason',
    'event.noSaleReason', 'call.noSaleReason', 'callOutcome.noSaleReason'));
  const outcome = norm(pick(d,
    'callOutcome', 'call_outcome', 'outcome.callOutcome', 'outcome.type', 'outcome.outcome',
    'outcome', 'event.callOutcome', 'call.callOutcome', 'callOutcome.type', 'callOutcome.outcome'));
  if (reason.includes('no show') || outcome.includes('no show')) return 'no-show';
  if (outcome === 'sale' || outcome === 'won' || outcome === 'closed won') return 'sale';
  return outcome || reason ? 'other' : '';
}

/* The offer's dq tag, which is what the "Follow-up C: Disqualified"
   workflow triggers on (dq:growth, dq:brand-builder, dq:signature,
   dq:pest-control-trial, the same keys /api/book-intake uses). iClosed's
   own strategy call is the Growth offer, so that is the default. */
export function dqTagOf(d) {
  const key = norm(`${pick(d, 'event_type.name', 'eventTypeName', 'event_type_name') || ''} ${pick(d, 'event_type.slug') || ''}`);
  if (key.includes('signature')) return 'dq:signature';
  if (key.includes('brand') || key.includes('story session')) return 'dq:brand-builder';
  if (key.includes('trial')) return 'dq:pest-control-trial';
  return 'dq:growth';
}

/* What this delivery asks of GHL. Pure, so the tests can read it. */
export function planFor(d, trigger) {
  const t = norm(trigger);
  if (t.includes('outcome')) {
    const o = outcomeOf(d);
    const stage = o === 'no-show' ? 'No-show' : o === 'sale' ? 'Won' : o ? 'Showed' : '';
    return stage ? { kind: 'outcome', stage, add: ['iclosed'], remove: [] } : { kind: 'none', why: 'outcome unreadable' };
  }
  if (t.includes('cancel')) return { kind: 'none', why: 'cancelled' };
  if (t.includes('reschedul')) return { kind: 'none', why: 'rescheduled' };
  if (t.includes('book')) {
    return { kind: 'booked', stage: 'Booked', add: ['iclosed'], remove: ['stage:potential', 'stage:qualified'] };
  }
  const s = statusOf(d);
  if (s === 'booked') {
    return { kind: 'booked', stage: 'Booked', add: ['iclosed'], remove: ['stage:potential', 'stage:qualified'] };
  }
  if (s === 'disqualified') {
    return { kind: 'disqualified', stage: 'Disqualified', add: ['iclosed', 'dq:iclosed', dqTagOf(d)], remove: ['stage:potential', 'stage:qualified'] };
  }
  if (s === 'qualified') {
    return { kind: 'qualified', stage: 'Started form', add: ['iclosed', 'stage:qualified'], remove: ['stage:potential'] };
  }
  if (s === 'potential') {
    return { kind: 'potential', stage: 'Started form', add: ['iclosed', 'stage:potential'], remove: [] };
  }
  return { kind: 'none', why: t ? 'no status' : 'no trigger' };
}

/* The booking form's questions, as [label, answer] pairs. iClosed has
   sent both an array of {question, answer} and a label→answer map. */
function answersOf(d) {
  const out = [];
  for (const key of ['questions_and_answers', 'questions_and_responses', 'questionsAndAnswers', 'contactFields']) {
    const v = d && d[key];
    if (Array.isArray(v)) {
      for (const q of v) {
        if (!q || typeof q !== 'object') continue;
        const label = q.question || q.label || q.title || q.name || q.field || '';
        let ans = q.answer ?? q.response ?? q.value ?? q.answers ?? q.responses;
        if (Array.isArray(ans)) ans = ans.join(', ');
        if (typeof label === 'string' && ans != null && typeof ans !== 'object') out.push([label, String(ans)]);
      }
    } else if (v && typeof v === 'object') {
      for (const [label, raw] of Object.entries(v)) {
        const ans = Array.isArray(raw) ? raw.join(', ') : raw;
        if (ans != null && typeof ans !== 'object') out.push([label, String(ans)]);
      }
    }
  }
  return out;
}

const TEXTS = /\b(sms|texts?|texting|text messages?)\b/i;
const ASKS = /(consent|agree|opt|permission|allow|receive|ok\b|okay|may we|can we)/i;
const YES = /^\s*(yes|y|true|checked|on|1|i agree|agree|i consent|consent|opt in|opt-in|ok|okay)\b/i;
const NO = /\b(no|not|don'?t|do not|decline|declined|false|unchecked|off)\b/i;

/* { optin, labels }: optin only on an explicit yes. labels are the
   consent-looking question labels, for the log. Answers never leave. */
export function consentOf(d) {
  for (const path of [
    'contact.smsConsent', 'invitee.smsConsent', 'contact.sms_consent', 'invitee.sms_consent',
    'contact.smsOptIn', 'invitee.smsOptIn', 'contact.sms_opt_in', 'invitee.sms_opt_in',
    'smsConsent', 'sms_consent', 'smsOptIn', 'sms_opt_in'
  ]) {
    const v = pick(d, path);
    if (v === true || /^(true|yes)$/i.test(String(v ?? '').trim())) return { optin: true, labels: [path] };
  }
  const labels = [];
  let optin = false;
  for (const [label, answer] of answersOf(d)) {
    if (!TEXTS.test(label) || !ASKS.test(label)) continue;
    labels.push(label.slice(0, 120));
    if (YES.test(answer) && !NO.test(answer)) optin = true;
  }
  return { optin, labels };
}

function personOf(d) {
  const email = pick(d, 'invitee.email', 'contact.email', 'email', 'inviteeEmail', 'invitee_email');
  const phone = pick(d, 'contact.phoneNumber', 'invitee.text_reminder_number', 'invitee.phone',
    'invitee.phoneNumber', 'contact.phone', 'phoneNumber', 'phone');
  let firstName = pick(d, 'invitee.firstName', 'invitee.first_name', 'contact.firstName',
    'contact.first_name', 'firstName', 'first_name');
  let lastName = pick(d, 'invitee.lastName', 'invitee.last_name', 'contact.lastName',
    'contact.last_name', 'lastName', 'last_name');
  if (!firstName && !lastName) {
    const full = String(pick(d, 'invitee.name', 'contact.name', 'contact.fullName', 'name') || '').trim();
    if (full) { const p = full.split(/\s+/); firstName = p.shift(); lastName = p.join(' ') || undefined; }
  }
  return {
    email: email ? String(email).trim().toLowerCase() : '',
    phone: phone ? String(phone) : undefined,
    firstName: firstName ? String(firstName) : undefined,
    lastName: lastName ? String(lastName) : undefined
  };
}

// ── the deal ──────────────────────────────────────────────────────────

const RANK = { 'Started form': 0, 'Disqualified': 0, 'Booked': 1, 'Showed': 2, 'No-show': 2, 'Plan sent': 3, 'Won': 4, 'Lost': 4 };

/** May a deal at `from` move to `to`? */
export function mayMove(from, to) {
  if (from === to) return false;
  if (from === 'Won' || from === 'Lost') return false;
  if (from === 'No-show' && to === 'Booked') return true;
  if (to === 'Disqualified') return from === 'Started form';
  return (RANK[to] ?? -1) > (RANK[from] ?? -1);
}

async function placeDeal(contactId, stage, name) {
  const all = await ghl.findOpportunities(contactId);
  const open = ghl.newestFirst(all.filter((o) => !o.status || o.status === 'open'));
  // The newest open deal is the one this lead is on. Won and Lost come
  // back with status won / lost and so are never in `open`.
  const target = open[0];
  if (!target) {
    // Outcomes need a deal to move; never invent one at Won or No-show.
    if (stage !== 'Started form' && stage !== 'Disqualified' && stage !== 'Booked') return 'no deal to move';
    await ghl.createOpportunity({ contactId, stage, name, monetaryValue: 0 });
    return `created at ${stage}`;
  }
  const at = ghl.stageName(target.pipelineStageId);
  if (at === stage) return `kept (already ${stage})`;
  if (!mayMove(at, stage)) return `kept (at ${at || 'unknown stage'})`;
  await ghl.moveOpportunity(target.id, stage);
  return `moved ${at || '?'} → ${stage}`;
}

// ── the bridge ────────────────────────────────────────────────────────

async function run(d, trigger) {
  const plan = planFor(d, trigger);
  if (plan.kind === 'none') return { ghl: 'skipped', why: plan.why };
  const person = personOf(d);
  if (!person.email) return { ghl: 'skipped', why: 'no email' };

  const { optin, labels } = consentOf(d);
  if (labels.length) console.log('iclosed-webhook: consent-like questions', JSON.stringify(labels));

  const contact = await ghl.upsertContact(person);
  const add = plan.add.concat(optin ? ['sms:optin'] : []);
  const remove = plan.remove.filter((t) => contact.tags.includes(t));
  await ghl.addTags(contact.id, add);
  if (remove.length) await ghl.removeTags(contact.id, remove);

  const event = String(pick(d, 'event_type.name', 'eventTypeName', 'event_type_name') || 'iClosed lead');
  const name = `${[person.firstName, person.lastName].filter(Boolean).join(' ') || 'New lead'} · ${event}`;
  const deal = await placeDeal(contact.id, plan.stage, name);
  return { ghl: 'synced', kind: plan.kind, isNew: contact.isNew, optin, deal };
}

/** Never throws. Resolves to a small report with no contact details in it. */
export async function syncToGhl(d, trigger) {
  if (!enabled()) return { ghl: 'off' };
  let timer;
  try {
    const out = await Promise.race([
      run(d, trigger),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ ghl: 'timeout' }), BUDGET_MS); })
    ]);
    console.log('iclosed-webhook: ghl', JSON.stringify(out));
    return out;
  } catch (e) {
    console.error('iclosed-webhook: ghl failed', (e && e.message) || e);
    return { ghl: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
