/* ══════════════════════════════════════════════════════════════════════
   Supabase · server-side REST client
   ──────────────────────────────────────────────────────────────────────
   Underscore prefix keeps Vercel from routing this as an endpoint.

   Talks to PostgREST over plain fetch rather than @supabase/supabase-js,
   so this project stays buildless with no package.json and no bundler,
   matching how SendGrid and Meta are already called.

   NEVER import this into browser code. It reads the service role key,
   which bypasses row level security.

   Env:
     SUPABASE_URL                https://<ref>.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   server-side secret
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Resolve a Supabase variable regardless of prefix.
 *
 * The Vercel marketplace integration namespaces everything by resource name,
 * so SUPABASE_URL arrives as e.g. sbdata_SUPABASE_URL. Matching on the
 * suffix means re-provisioning under a different name keeps working.
 *
 * NEXT_PUBLIC_ prefixed variables are skipped deliberately: those carry the
 * client-safe anon key, and privileged writes need the service role.
 */
function resolve(suffix) {
  if (process.env[suffix]) return process.env[suffix];
  const key = Object.keys(process.env).find(
    (k) => k.endsWith(`_${suffix}`) && !k.startsWith('NEXT_PUBLIC_')
  );
  return key ? process.env[key] : undefined;
}

const URL_BASE = resolve('SUPABASE_URL');
const SERVICE_KEY = resolve('SUPABASE_SERVICE_ROLE_KEY');

export const configured = Boolean(URL_BASE && SERVICE_KEY);

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

/** Strip undefined so PostgREST uses column defaults instead of nulling them. */
function clean(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

/**
 * Insert one row.
 *
 * @param {string} table
 * @param {object} row
 * @param {object} [opts]
 * @param {boolean} [opts.returning]  resolve with the inserted row
 * @param {boolean} [opts.ignoreConflict]  treat a unique violation as success,
 *        which is how funnel_events stays idempotent on retried beacons
 * @returns {Promise<object|null>}
 */
export async function insert(table, row, opts = {}) {
  if (!configured) throw new Error('supabase not configured');

  const prefer = [];
  if (opts.returning) prefer.push('return=representation');
  else prefer.push('return=minimal');
  if (opts.ignoreConflict) prefer.push('resolution=ignore-duplicates');

  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: prefer.join(',') }),
    body: JSON.stringify(clean(row))
  });

  if (res.status === 409 && opts.ignoreConflict) return null;

  if (!res.ok) {
    // PostgREST errors describe the query, not the customer. Safe to surface,
    // and the key is never echoed back in the body.
    throw new Error(`supabase ${res.status} ${await res.text()}`);
  }

  if (!opts.returning) return null;
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body[0] || null : body;
}

/**
 * Patch one row by primary key.
 *
 * Used by the two-step application: step one inserts the prequalified row,
 * step two fills in the commitment answers on that same row rather than
 * creating a second lead for one person.
 *
 * @returns {Promise<object|null>} the updated row when opts.returning
 */
export async function update(table, id, patchRow, opts = {}) {
  if (!configured) throw new Error('supabase not configured');

  const res = await fetch(
    `${URL_BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: headers({
        Prefer: opts.returning ? 'return=representation' : 'return=minimal'
      }),
      body: JSON.stringify(clean(patchRow))
    }
  );
  if (!res.ok) throw new Error(`supabase update ${res.status} ${await res.text()}`);
  if (!opts.returning) return null;
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body[0] || null : body;
}

/**
 * Read rows with a raw PostgREST query string.
 *
 * @param {string} table
 * @param {string} query  e.g. `email=eq.x%40y.com&order=created_at.desc&limit=1`
 * @returns {Promise<object[]>} always an array, empty when nothing matched
 */
export async function select(table, query = '') {
  if (!configured) throw new Error('supabase not configured');

  const url = `${URL_BASE}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const res = await fetch(url, { method: 'GET', headers: headers() });
  if (!res.ok) throw new Error(`supabase select ${res.status} ${await res.text()}`);
  const body = await res.json().catch(() => null);
  return Array.isArray(body) ? body : body ? [body] : [];
}

/**
 * Insert a row that must exist at most once, and report whether THIS call
 * is the one that created it.
 *
 * `insert(..., { ignoreConflict: true })` cannot answer that: it resolves
 * to null both when the row was written and when it collided, which is
 * exactly right for a retried analytics beacon and exactly wrong here. A
 * booking may only produce one Schedule conversion, so the caller has to
 * know which of two concurrent syncs won.
 *
 * The unique constraint in Postgres is what decides, not a prior read.
 * Checking for existence first and inserting second is a race: two cron
 * invocations overlapping would both see nothing and both send Meta a
 * conversion for the same appointment.
 *
 * @returns {Promise<{inserted: boolean, row: object|null}>}
 *          inserted false means someone else already recorded it.
 */
export async function insertIfNew(table, row) {
  if (!configured) throw new Error('supabase not configured');

  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(clean(row))
  });

  // 409 is the unique violation. Expected on a re-run, and not an error.
  if (res.status === 409) return { inserted: false, row: null };

  if (!res.ok) throw new Error(`supabase insertIfNew ${res.status} ${await res.text()}`);

  const body = await res.json().catch(() => null);
  const created = Array.isArray(body) ? body[0] || null : body;
  return { inserted: Boolean(created), row: created };
}

/** Attach previously anonymous events to a lead once they identify themselves. */
export async function linkSessionToLead(sessionId, leadId) {
  if (!configured || !sessionId || !leadId) return 0;

  const res = await fetch(
    `${URL_BASE}/rest/v1/funnel_events?session_id=eq.${encodeURIComponent(sessionId)}&lead_id=is.null`,
    {
      method: 'PATCH',
      headers: headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ lead_id: leadId })
    }
  );
  if (!res.ok) throw new Error(`supabase link ${res.status} ${await res.text()}`);
  return 1;
}
