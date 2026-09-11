/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · funnel tracking
   ──────────────────────────────────────────────────────────────────────
   One interface for application code:

     ntc.track('ViewContent')             browser Meta event + internal
     ntc.track('VSL50')                   custom milestone
     ntc.context()                        attribution to POST to the server
     ntc.watchVideo(el)                   auto-fires VSL25/50/75/90 once each

   Deliberately does NOT fire PageView: the Meta base pixel in each page's
   head already does, and firing here would double count.

   No build step in this project, so this is a plain script include rather
   than a module. Keep it dependency free.
   ══════════════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var SESSION_KEY = 'ntc_sid';
  var ATTRIB_KEY = 'ntc_attribution';
  var DEBUG = /[?&]ntc_debug=1/.test(w.location.search) ||
              /localhost|127\.0\.0\.1/.test(w.location.hostname);

  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, ['[ntc]'].concat([].slice.call(arguments))); } catch (e) {}
  }

  // ── storage helpers, all failure tolerant ────────────────────────────
  function ls(key, val) {
    try {
      if (val === undefined) return w.localStorage.getItem(key);
      w.localStorage.setItem(key, val);
      return val;
    } catch (e) { return null; }
  }

  function cookie(name) {
    try {
      var m = d.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? decodeURIComponent(m[2]) : null;
    } catch (e) { return null; }
  }

  function uuid() {
    try { return crypto.randomUUID(); }
    catch (e) {
      return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
  }

  // ── anonymous session id, first party, ours not Meta's ───────────────
  function sessionId() {
    var id = ls(SESSION_KEY);
    if (!id) { id = uuid(); ls(SESSION_KEY, id); }
    return id;
  }

  // ── attribution, captured on FIRST touch and never overwritten ───────
  // A visitor who lands from an ad then browses to another page must not
  // lose the ad that brought them.
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function readAttribution() {
    var params = new URLSearchParams(w.location.search);
    var fresh = {};
    var sawAny = false;

    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) { fresh[k] = v; sawAny = true; }
    });

    var fbclid = params.get('fbclid');
    if (fbclid) { fresh.fbclid = fbclid; sawAny = true; }

    if (!sawAny) return null;

    fresh.landing_page = w.location.origin + w.location.pathname;
    fresh.referrer = d.referrer || '';
    fresh.first_seen = new Date().toISOString();
    return fresh;
  }

  function attribution() {
    var stored = null;
    try { stored = JSON.parse(ls(ATTRIB_KEY) || 'null'); } catch (e) {}

    var fresh = readAttribution();
    // First touch wins. Only store if we have nothing yet.
    if (fresh && !stored) {
      ls(ATTRIB_KEY, JSON.stringify(fresh));
      stored = fresh;
      log('attribution captured', fresh);
    }
    return stored || {};
  }

  // ── Meta click + browser ids ─────────────────────────────────────────
  // _fbp is set by the pixel. _fbc is set by the pixel when a click comes
  // in with fbclid, but the pixel may not have written it yet on the first
  // pageview, so derive it per Meta's documented format as a fallback.
  // Never invent fbc for an organic visitor.
  function metaIds() {
    var out = {};
    var fbp = cookie('_fbp');
    if (fbp) out.fbp = fbp;

    var fbc = cookie('_fbc');
    if (!fbc) {
      var a = attribution();
      var fbclid = new URLSearchParams(w.location.search).get('fbclid') || a.fbclid;
      if (fbclid) {
        // fb.<subdomainIndex>.<creationTime>.<fbclid>
        fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      }
    }
    if (fbc) out.fbc = fbc;
    return out;
  }

  // ── the context blob the server needs for CAPI matching ──────────────
  function context() {
    var ctx = { session_id: sessionId() };
    var a = attribution();
    Object.keys(a).forEach(function (k) { ctx[k] = a[k]; });
    var m = metaIds();
    Object.keys(m).forEach(function (k) { ctx[k] = m[k]; });
    ctx.page = w.location.origin + w.location.pathname;
    return ctx;
  }

  // ── the one tracking call application code uses ──────────────────────
  // Browser side only. Server-authoritative events (Lead, Purchase) are
  // fired by the backend, not here.
  var fired = {};

  function track(eventName, data, opts) {
    opts = opts || {};
    var once = opts.once !== false; // milestones fire once per page by default
    if (once && fired[eventName]) { log('skipped duplicate', eventName); return null; }
    fired[eventName] = true;

    var eventId = opts.eventId || (eventName.toLowerCase() + '-' + uuid());
    var payload = data || {};

    if (typeof w.fbq === 'function') {
      try {
        w.fbq('track', eventName, payload, { eventID: eventId });
        log('fbq', eventName, eventId, payload);
      } catch (e) {
        // Custom events are not standard events; fall back to trackCustom.
        try { w.fbq('trackCustom', eventName, payload, { eventID: eventId }); } catch (e2) {}
      }
    } else {
      log('fbq unavailable, skipped', eventName);
    }
    return eventId;
  }

  // ── VSL milestones ───────────────────────────────────────────────────
  // Attach to a <video>. Fires VSL25/50/75/90 once each per page view.
  // Deliberately does not send every timeupdate to Meta.
  function watchVideo(el) {
    if (!el || !el.addEventListener) return;
    var marks = [25, 50, 75, 90];
    var done = {};

    el.addEventListener('timeupdate', function () {
      var dur = el.duration;
      if (!dur || !isFinite(dur)) return;
      var pct = (el.currentTime / dur) * 100;
      marks.forEach(function (m) {
        if (pct >= m && !done[m]) {
          done[m] = true;
          track('VSL' + m, { percent: m });
        }
      });
    });

    log('watching video');
  }

  // ── boot ─────────────────────────────────────────────────────────────
  attribution();   // capture first touch immediately, before any navigation
  sessionId();

  w.ntc = {
    track: track,
    context: context,
    attribution: attribution,
    sessionId: sessionId,
    metaIds: metaIds,
    watchVideo: watchVideo,
    uuid: uuid
  };

  log('ready', context());
})(window, document);
