/* ══════════════════════════════════════════════════════════════════════
   GoHighLevel · server-side REST client
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   Plain fetch, no SDK, for the same reason _supabase.js has none: this
   project stays buildless. Every request shape lives in one small
   function here, so if GHL's API differs from what is written below the
   fix is one place, not a hunt through the handlers.

   NEVER import this into browser code. It reads GHL_API_TOKEN.

   Env (all but the token default to the live ids, see DEFAULTS):
     GHL_API_TOKEN      Private Integration Token, server only
     GHL_LOCATION_ID    kzOVdsNR0ozcoyyaag0a (New Terrain Creative). Never
                        DVRZwYvYUOCWdvIvPbAu, which is MASTER.
     GHL_PIPELINE_ID    the "Sales" pipeline
     GHL_STAGE_IDS      JSON, stage name -> stage id, names exactly as the
                        contract: {"Started form":"...","Disqualified":"...",
                        "Booked":"...", ...}
     GHL_CALENDARS      JSON, offer key -> booking URL, e.g.
                        {"growth":"https://api.leadconnectorhq.com/widget/booking/<id>"}
   ══════════════════════════════════════════════════════════════════════ */

export const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';
const TIMEOUT_MS = 8000;

// The one location this site may write to. A token scoped to the agency
// could reach MASTER, so the id is checked rather than trusted.
const MASTER = 'DVRZwYvYUOCWdvIvPbAu';

/* The objects built in the NTC location on 20 Oct 2026. Not secrets:
   ids, and booking URLs anyone can open. They are the defaults only;
   the env vars above win whenever they are set, so a rebuilt pipeline or
   calendar is an env change, not a deploy. */
const W = 'https://api.leadconnectorhq.com/widget/booking/';
export const DEFAULTS = {
  locationId: 'kzOVdsNR0ozcoyyaag0a',
  pipelineId: 'gVWhpLqxgmOyTgyrGeKJ',
  stages: {
    'Started form': 'cf946fe5-8597-4fe7-b8f2-8f4c6db47894',
    'Disqualified': '67599a1a-08ed-43f3-a98a-43f7442da375',
    'Booked': '11653ab6-34fd-4b39-858f-1393fe1f07f3',
    'Showed': 'e6098816-7bc3-4550-a76c-9dddfffac2e6',
    'No-show': '9c73f2ae-511a-4db6-ac2d-7cf2900340a3',
    'Plan sent': '1cad566a-54d9-45b1-8316-358addf6c7db',
    'Won': 'bb538a91-4b20-4bbd-9664-2ab1bf068370',
    'Lost': '840782d0-59e3-4d34-ba1a-7bb08187550a'
  },
  calendars: {
    'reschedule': W + 'OrFq52pbRRJvUjmicBQ1',
    'follow-up': W + 'PizvlYZQpD1Xw9dUxDX4',
    'ad-sprint': W + 'XIYDZhQeWVd4HIXMoN4f',
    'pest-control-trial': W + 'eVxG83WiXNS8yQTXde7f',
    'growth': W + 'EdeZLdlKq7Y3Qa9Q1JU8',
    'signature': W + 'zfeLSmDbDbizcMObYqIA',
    'brand-builder': W + 'yqDLtdUL8I0T6UTVNdcg'
  }
};

function json(name, fallback) {
  if (!process.env[name]) return fallback;
  try { return JSON.parse(process.env[name]) || fallback; } catch { return fallback; }
}

/** Read at call time, not import time, so tests and redeploys see changes. */
export function config() {
  const locationId = process.env.GHL_LOCATION_ID || DEFAULTS.locationId;
  return {
    token: process.env.GHL_API_TOKEN || '',
    locationId: locationId === MASTER ? '' : locationId,
    pipelineId: process.env.GHL_PIPELINE_ID || DEFAULTS.pipelineId,
    stages: json('GHL_STAGE_IDS', DEFAULTS.stages),
    calendars: json('GHL_CALENDARS', DEFAULTS.calendars)
  };
}

export function configured() {
  const c = config();
  return Boolean(c.token && c.locationId);
}

async function call(method, path, body) {
  const { token } = config();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!res.ok) {
    // GHL error bodies can echo the submitted contact, so only the status
    // leaves this function. Never the body.
    throw new Error(`ghl ${method} ${path.split('?')[0]} ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

/* ── shapes ──────────────────────────────────────────────────────────
   ASSUMPTION (noted in the PR): the payloads below follow GHL's public
   v2 docs. Custom fields go by key without the "contact." prefix (the
   GHL fieldKey is contact.<key>). Contact upsert dedupes on email then phone, per the
   location's own setting. Tags go through the contact tags endpoints
   rather than the upsert body, because the upsert replaces the tag list
   and the contract says to keep existing tags. */

/* POST /contacts/upsert, twice at most.

   The form is public, so an email alone must never let a stranger
   rewrite someone's record. The first call carries the email and the
   custom fields only. Name and phone follow in a second call only for a
   contact this created (response new: true), or to fill a field the
   existing contact does not have yet; a name or phone already on file is
   never overwritten from the website.

   Resolves to { id, isNew, tags }. */
export async function upsertContact({ firstName, lastName, email, phone, fields }) {
  const { locationId } = config();
  const customFields = Object.entries(fields || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => ({ key, field_value: value }));
  const out = await call('POST', '/contacts/upsert', { locationId, email, customFields });
  const c = (out && out.contact) || {};
  const id = c.id || (out && out.id);
  if (!id) throw new Error('ghl upsert returned no contact id');
  const isNew = Boolean(out && out.new === true);

  const fill = {};
  if (firstName && (isNew || !c.firstName)) fill.firstName = firstName;
  if (lastName && (isNew || !c.lastName)) fill.lastName = lastName;
  if (phone && (isNew || !c.phone)) fill.phone = phone;
  if (Object.keys(fill).length) {
    await call('POST', '/contacts/upsert', { locationId, email, ...fill });
  }
  return { id: String(id), isNew, tags: Array.isArray(c.tags) ? c.tags.map(String) : [] };
}

/** Newest first, by updatedAt then createdAt. */
export function newestFirst(list) {
  const t = (o) => Date.parse(o.updatedAt || o.dateUpdated || o.createdAt || o.dateAdded || '') || 0;
  return list.slice().sort((a, b) => t(b) - t(a));
}

/** POST /contacts/{id}/tags. Adds, never replaces. */
export async function addTags(contactId, tags) {
  if (!tags.length) return;
  await call('POST', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags });
}

/** DELETE /contacts/{id}/tags. Removes only the tags named. */
export async function removeTags(contactId, tags) {
  if (!tags.length) return;
  await call('DELETE', `/contacts/${encodeURIComponent(contactId)}/tags`, { tags });
}

/** POST /opportunities/. Resolves to the opportunity id. */
export async function createOpportunity({ contactId, stage, name, monetaryValue }) {
  const { locationId, pipelineId, stages } = config();
  if (!pipelineId || !stages[stage]) throw new Error(`ghl pipeline or stage "${stage}" not configured`);
  const out = await call('POST', '/opportunities/', {
    locationId, pipelineId,
    pipelineStageId: stages[stage],
    contactId, name, status: 'open',
    monetaryValue: monetaryValue || 0
  });
  const id = out && ((out.opportunity && out.opportunity.id) || out.id);
  if (!id) throw new Error('ghl opportunity returned no id');
  return String(id);
}

/** PUT /opportunities/{id}. Moves the stage and sets the value. */
export async function updateOpportunity(id, { stage, name, monetaryValue }) {
  const { pipelineId, stages } = config();
  if (!stages[stage]) throw new Error(`ghl stage "${stage}" not configured`);
  await call('PUT', `/opportunities/${encodeURIComponent(id)}`, {
    pipelineId,
    pipelineStageId: stages[stage],
    name, status: 'open',
    monetaryValue: monetaryValue || 0
  });
}

/** PUT /opportunities/{id} with the stage only: name and value stay as set. */
export async function moveOpportunity(id, stage) {
  const { pipelineId, stages } = config();
  if (!stages[stage]) throw new Error(`ghl stage "${stage}" not configured`);
  await call('PUT', `/opportunities/${encodeURIComponent(id)}`, {
    pipelineId, pipelineStageId: stages[stage]
  });
}

/* GET /opportunities/search, the contact's opportunities in the Sales
   pipeline. The catalogue documents camelCase filters (locationId,
   contactId, pipelineId); older docs used snake_case. Both are sent,
   because a filter the API ignores would return every opportunity in the
   location. And the answer is filtered again here, strictly: only an
   opportunity whose contact AND pipeline match is ever returned, so a
   wrong lead's deal can never be moved whatever the API did with the
   query. Response: { opportunities: [{ id, contactId, pipelineId,
   pipelineStageId, status }], meta }. */
export async function findOpportunities(contactId) {
  const { locationId, pipelineId } = config();
  if (!contactId || !pipelineId) return [];
  const q = new URLSearchParams({
    locationId, location_id: locationId,
    contactId, contact_id: contactId,
    pipelineId, pipeline_id: pipelineId
  });
  const out = await call('GET', `/opportunities/search?${q}`);
  const list = (out && (out.opportunities || out.data)) || [];
  if (!Array.isArray(list)) return [];
  return list.filter((o) => o && o.id &&
    String(o.contactId || (o.contact && o.contact.id) || '') === String(contactId) &&
    String(o.pipelineId || '') === String(pipelineId));
}

/** The stage name for a stage id, or '' when it is not one of ours. */
export function stageName(id) {
  const { stages } = config();
  return Object.keys(stages).find((k) => stages[k] === id) || '';
}

/** The booking URL for an offer, or '' when it is not set. https only. */
export function calendarUrl(offerKey) {
  const url = String(config().calendars[offerKey] || '');
  try { return new URL(url).protocol === 'https:' ? url : ''; } catch { return ''; }
}
