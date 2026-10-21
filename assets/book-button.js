/* ══════════════════════════════════════════════════════════════════════
   Floating "Book a call" · iClosed Lift today, our own button with GHL
   ──────────────────────────────────────────────────────────────────────
   On / and /grow. Behind the same Growth provider flag as
   strategy-call.html (DEFAULT_SCHEDULER.provider):

     'iclosed'  loads the iClosed Lift widget exactly as the pages did
                before, same script, same widget id. Which pages it shows
                on is still decided by the include-list in iClosed.
     'ghl'      renders our own small button instead, a plain link to
                /strategy-call, where the Growth form and calendar live.

   ?provider=ghl previews the button on any page that loads this file.
   scripts/test-booking-forms.mjs fails if PROVIDER here and the Growth
   flag in strategy-call.html disagree.

   Mounts itself, unless the tag carries data-manual: the homepage opens
   on a full-screen film and mounts the launcher only once the intro is
   out of the way (index.html, mountBookingWidget). Idempotent.

   Never on a page that already asks for something (/apply, /founding,
   /project, /strategy-call, /booked, /call-booked, /onboarding,
   /welcome): scripts/preflight.py fails if this or the Lift tag turns
   up on one.
   ══════════════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var PROVIDER = 'iclosed';
  var LIFT_WIDGET = '_H-7V8fHVTuw';
  var HREF = '/strategy-call';

  var me = d.currentScript;
  var manual = !!(me && me.hasAttribute('data-manual'));
  var mounted = false;

  function provider() {
    var q = '';
    try { q = (new URLSearchParams(w.location.search).get('provider') || '').toLowerCase(); } catch (e) {}
    return q === 'ghl' ? 'ghl' : PROVIDER;
  }

  function lift() {
    var s = d.createElement('script');
    s.type = 'text/javascript';
    s.src = 'https://app.iclosed.io/assets/widget.js';
    s.setAttribute('data-cta-widget', LIFT_WIDGET);
    s.async = true;
    d.body.appendChild(s);
  }

  /* Our button. Styles inline so it needs nothing from the host page's
     sheet; colours are the site's gold and near-black. */
  function button() {
    var css = d.createElement('style');
    css.textContent =
      '.ntc-book{position:fixed;right:max(16px,env(safe-area-inset-right));' +
      'bottom:max(16px,env(safe-area-inset-bottom));z-index:900;display:inline-flex;' +
      'align-items:center;gap:10px;padding:14px 22px;background:#0A0A0A;color:#C8A96E;' +
      'border:1px solid #C8A96E;font:400 11px/1 Inter,-apple-system,BlinkMacSystemFont,sans-serif;' +
      'letter-spacing:.22em;text-transform:uppercase;text-decoration:none;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.45);transition:background .25s,color .25s}' +
      '.ntc-book:hover{background:#C8A96E;color:#0A0A0A}' +
      '.ntc-book:focus-visible{outline:1px solid #C8A96E;outline-offset:3px}' +
      '@media (max-width:480px){.ntc-book{padding:13px 18px;font-size:10.5px}}' +
      '@media (prefers-reduced-motion:reduce){.ntc-book{transition:none}}';
    d.head.appendChild(css);
    var a = d.createElement('a');
    a.className = 'ntc-book';
    a.href = HREF;
    a.setAttribute('data-cta', 'floating-book');
    a.textContent = 'Book a call';
    a.addEventListener('click', function () {
      try { if (w.ntc) w.ntc.track('CTAClick', { cta: 'floating-book', offer: 'paid_retainer' }, { once: false }); } catch (e) {}
    });
    d.body.appendChild(a);
  }

  function mount() {
    if (mounted || !d.body) return;
    mounted = true;
    if (provider() === 'ghl') button(); else lift();
  }

  w.ntcBookButton = { mount: mount, provider: provider };

  if (!manual) {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(window, document);
