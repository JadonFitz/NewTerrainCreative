/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · tracked checkout links
   ──────────────────────────────────────────────────────────────────────
   Sends every Stripe Payment Link on the page through /api/checkout,
   which opens the same checkout with a back link to this page and the
   visitor's id on it (see api/checkout.js). Load after assets/track.js
   on any page with a buy button.

   What travels: the link, this page's path and query, the anonymous
   visitor id track.js already keeps (ntc_sid), and i=1 for our own
   browsers. Never an email or a name: the server looks those up.

   The click rewrites the link, so a button that is built later (the
   reserve button on /call-booked) is covered too, and a page's own
   click handler (NextStepSprintCheckout on /next-step) still fires as
   before. Links already on the page are also rewritten on load, so the
   address a visitor copies is the tracked one.

   If /api/checkout cannot open the tracked checkout it sends the
   visitor to the plain link, so this never stands between a buyer and
   Stripe.

   Internal browsers: signing into /owner, or opening any page with
   ?ntc_internal=1, marks this browser as ours (localStorage
   ntc_internal). ?ntc_internal=0 clears it. track.js does the marking.
   ══════════════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var PREFIX = 'https://buy.stripe.com/';
  var ENDPOINT = '/api/checkout';

  function get(key) {
    try { return w.localStorage.getItem(key); } catch (e) { return null; }
  }

  function visitorId() {
    try { if (w.ntc && w.ntc.sessionId) return w.ntc.sessionId(); } catch (e) {}
    return get('ntc_sid');
  }

  function internal() {
    try { if (w.ntc && w.ntc.isInternal) return w.ntc.isInternal(); } catch (e) {}
    return get('ntc_internal') === '1';
  }

  function tracked(stripeHref) {
    var p = new URLSearchParams();
    p.set('link', stripeHref);
    p.set('from', w.location.pathname + w.location.search);
    var v = visitorId();
    if (v) p.set('v', v);
    if (internal()) p.set('i', '1');
    return ENDPOINT + '?' + p.toString();
  }

  // The Stripe address, kept on the element the first time it is seen,
  // so a second rewrite never wraps the endpoint in itself.
  function original(a) {
    var o = a.getAttribute('data-ntc-stripe');
    if (o) return o;
    var href = a.getAttribute('href') || '';
    if (href.indexOf(PREFIX) !== 0) return null;
    a.setAttribute('data-ntc-stripe', href);
    return href;
  }

  function rewrite(a) {
    var o = original(a);
    if (!o) return;
    a.setAttribute('href', tracked(o));
    // A crawler that follows it would open a checkout session.
    var rel = (a.getAttribute('rel') || '').split(/\s+/);
    if (rel.indexOf('nofollow') < 0) a.setAttribute('rel', (rel.join(' ') + ' nofollow').trim());
  }

  function rewriteAll() {
    var links = d.querySelectorAll('a[href^="' + PREFIX + '"], a[data-ntc-stripe]');
    for (var i = 0; i < links.length; i++) rewrite(links[i]);
  }

  // Capture phase: runs before the page's own handlers, which read
  // a.href after this has set it.
  d.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a && (a.hasAttribute('data-ntc-stripe') ||
              (a.getAttribute('href') || '').indexOf(PREFIX) === 0)) rewrite(a);
  }, true);

  // Pages set their own tags on the links in scripts at the end of the
  // body, so wait for those before rewriting.
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', rewriteAll);
  else rewriteAll();

  w.ntcCheckout = { tracked: tracked, rewriteAll: rewriteAll };
})(window, document);
