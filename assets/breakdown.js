/* ══════════════════════════════════════════════════════════════════════
   New Terrain Creative · the free breakdown (/breakdown)
   ──────────────────────────────────────────────────────────────────────
   A visitor enters a website or Instagram and gets a brand breakdown on
   screen. The work happens on the agent, reached through the /b/ rewrite
   in vercel.json:

     POST /b/start          start one, returns { token, status, existing }
     GET  /b/<token>        poll it, returns { status, kind, result, ... }
     GET  /b/<token>/c/<id> a reference clip thumbnail (9:16)

   Every string in a result is written by a model, so it reaches the page
   through textContent only. Nothing here assigns innerHTML; preflight.py
   fails the build if this file or breakdown.html ever does.

   One breakdown per browser: the token is kept in localStorage and shown
   instead of the form on the next visit. /breakdown?t=<token> loads a
   token directly, which is the link the agent emails when a queued
   breakdown finishes later.

   Plain script, no build step, like track.js. Pure helpers are exposed on
   window.NTCBreakdown so scripts/test-breakdown.mjs can test them.
   ══════════════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var TOKEN_KEY = 'ntc_breakdown_token';
  var BID_KEY = 'ntc_bid';
  var LEAD_KEY = 'ntc_breakdown_lead';
  var POLL_MS = 3000;
  var POLL_LIMIT_MS = 3 * 60 * 1000;

  var REVENUE = ['under_1m', '1m_2m', '2m_5m', '5m_10m', '10m_plus'];
  var INVESTMENT = ['under_5k', '5k_10k', '10k_plus'];

  var COPY = {
    show: {
      title: 'Free Show Breakdown',
      sub: 'See your brand the way a buyer does, and the show we’d build from it.',
      noun: 'show',
      bookLabel: 'Book a Story Session',
      bookHref: '/strategy-call?offer=brand-builder'
    },
    ads: {
      title: 'Free Ad Breakdown',
      sub: 'See your brand the way a buyer does, and the first ad we’d run.',
      noun: 'ads',
      bookLabel: 'Book a strategy call',
      bookHref: '/strategy-call'
    }
  };

  var PROGRESS = ['Reading your site', 'Pulling your colors', 'Finding your story',
                  'Writing your breakdown'];

  // ── pure helpers ─────────────────────────────────────────────────────
  function kindFrom(search) {
    var k = '';
    try { k = new URLSearchParams(search || '').get('for') || ''; } catch (e) {}
    return k.toLowerCase() === 'ads' ? 'ads' : 'show';
  }

  function isToken(t) { return typeof t === 'string' && /^[0-9a-f]{48}$/i.test(t); }

  function tokenFrom(search) {
    var t = '';
    try { t = new URLSearchParams(search || '').get('t') || ''; } catch (e) {}
    return isToken(t) ? t : null;
  }

  function looksLikeSite(v) {
    return /^(https?:\/\/)?[^\s\/.@]+(\.[^\s\/.@]+)*\.[a-z]{2,}(\/\S*)?$/i.test(v);
  }

  function looksLikeInstagram(v) {
    return /^@?[A-Za-z0-9._]{1,30}$/.test(v) ||
           /^(https?:\/\/)?(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?(\?\S*)?$/i.test(v);
  }

  /** Returns { field: message } for every problem, {} when the form is fine. */
  function validate(v) {
    var e = {};
    var site = String(v.site || '').trim();
    var ig = String(v.instagram || '').trim();
    if (!site && !ig) e.site = 'Add your website or your Instagram.';
    else {
      if (site && !looksLikeSite(site)) e.site = 'That website does not look right.';
      if (ig && !looksLikeInstagram(ig)) e.instagram = 'That Instagram handle does not look right.';
    }
    if (!String(v.name || '').trim()) e.name = 'Please enter your name.';
    var email = String(v.email || '').trim();
    if (!email) e.email = 'Please enter your email.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'That email does not look right.';
    var phone = String(v.phone || '').trim();
    if (phone && phone.replace(/\D/g, '').length < 7) e.phone = 'That phone number looks too short.';
    if (REVENUE.indexOf(v.revenue) < 0) e.revenue = 'Pick your annual revenue.';
    if (INVESTMENT.indexOf(v.investment) < 0) e.investment = 'Pick your monthly investment.';
    return e;
  }

  function utmFrom(search, firstTouch) {
    var out = {};
    var p;
    try { p = new URLSearchParams(search || ''); } catch (e) { p = new URLSearchParams(''); }
    p.forEach(function (val, key) { if (/^utm_/.test(key) && val) out[key] = val.slice(0, 200); });
    // A visitor who arrived from an ad and browsed here keeps that ad.
    Object.keys(firstTouch || {}).forEach(function (key) {
      if (/^utm_/.test(key) && !out[key] && firstTouch[key]) out[key] = String(firstTouch[key]);
    });
    return out;
  }

  function buildPayload(v, ctx) {
    ctx = ctx || {};
    return {
      kind: ctx.kind === 'ads' ? 'ads' : 'show',
      site: String(v.site || '').trim(),
      instagram: String(v.instagram || '').trim(),
      name: String(v.name || '').trim(),
      email: String(v.email || '').trim(),
      phone: String(v.phone || '').trim(),
      revenue: v.revenue,
      investment: v.investment,
      browserId: ctx.browserId || '',
      consentEmail: v.consentEmail === true,
      utm: ctx.utm || {},
      referrer: ctx.referrer || '',
      hp: String(v.hp || '')
    };
  }

  /** A plain family name we can ask Google Fonts for, e.g. "Playfair Display". */
  function fontLoadable(name) {
    return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9 ]{1,39}$/.test(name.trim());
  }

  function safeColor(c) {
    return typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim()) ? c.trim() : null;
  }

  function clipSrc(token, id) {
    return '/b/' + encodeURIComponent(token) + '/c/' + encodeURIComponent(String(id));
  }

  // ── DOM building, textContent only ───────────────────────────────────
  function el(doc, tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function section(doc, eyebrow) {
    var s = el(doc, 'section', 'bd-sec');
    s.appendChild(el(doc, 'p', 'eyebrow', eyebrow));
    return s;
  }

  function loadFont(doc, name) {
    if (!doc.head || !fontLoadable(name)) return false;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' +
      encodeURIComponent(name.trim()).replace(/%20/g, '+') + '&display=swap';
    doc.head.appendChild(link);
    return true;
  }

  function fontSample(doc, role, name) {
    var box = el(doc, 'div', 'bd-font');
    box.appendChild(el(doc, 'span', 'bd-font__role', role));
    var sample = el(doc, 'span', 'bd-font__name', name);
    // Only a validated plain name is ever put into a style.
    if (loadFont(doc, name)) sample.style.fontFamily = '"' + name.trim() + '", var(--body)';
    box.appendChild(sample);
    return box;
  }

  /**
   * Renders a finished breakdown into `root`. Returns the root.
   * data: the GET /b/<token> JSON. token: for clip thumbnails.
   */
  function renderResult(root, data, token, doc) {
    doc = doc || d;
    root.textContent = '';
    var kind = data.kind === 'ads' ? 'ads' : 'show';
    var c = COPY[kind];
    var r = data.result || {};
    var brand = r.brand || {};

    var head = el(doc, 'header', 'bd-result__head');
    head.appendChild(el(doc, 'p', 'eyebrow', c.title));
    head.appendChild(el(doc, 'h2', 'bd-result__title',
      data.company ? data.company + ', as a buyer sees it' : 'Your breakdown'));
    root.appendChild(head);

    // 1 · the brand
    var s1 = section(doc, 'Your brand, as we see it');
    var colors = (Array.isArray(brand.colors) ? brand.colors : []).map(safeColor).filter(Boolean);
    if (colors.length) {
      var sw = el(doc, 'div', 'bd-swatches');
      colors.slice(0, 8).forEach(function (hex) {
        var item = el(doc, 'div', 'bd-swatch');
        var chip = el(doc, 'span', 'bd-swatch__chip');
        chip.style.background = hex;
        item.appendChild(chip);
        item.appendChild(el(doc, 'span', 'bd-swatch__hex', hex.toUpperCase()));
        sw.appendChild(item);
      });
      s1.appendChild(sw);
    }
    var fonts = el(doc, 'div', 'bd-fonts');
    if (brand.display) fonts.appendChild(fontSample(doc, 'Display', String(brand.display)));
    if (brand.body) fonts.appendChild(fontSample(doc, 'Body', String(brand.body)));
    if (fonts.firstChild) s1.appendChild(fonts);
    root.appendChild(s1);

    // 2 · the read
    [['What you say', r.says], ['What your buyers want to hear', r.buyersWant],
     ['The gap', r.gap]].forEach(function (pair) {
      if (!pair[1]) return;
      var s = section(doc, pair[0]);
      s.appendChild(el(doc, 'p', 'bd-copy', pair[1]));
      root.appendChild(s);
    });

    // 3 · one idea
    var hero = r.hero || {};
    if (hero.title || hero.idea) {
      var s3 = section(doc, 'One idea');
      if (hero.title) s3.appendChild(el(doc, 'h3', 'bd-idea__title', hero.title));
      if (hero.idea) s3.appendChild(el(doc, 'p', 'bd-copy', hero.idea));
      var clips = Array.isArray(r.clips) ? r.clips.filter(function (x) { return x && x.id != null; }) : [];
      if (clips.length && token) {
        var grid = el(doc, 'div', 'bd-clips');
        clips.slice(0, 6).forEach(function (clip) {
          var fig = el(doc, 'figure', 'bd-clip');
          var img = doc.createElement('img');
          img.src = clipSrc(token, clip.id);
          img.alt = clip.title ? 'Reference: ' + String(clip.title) : 'Reference clip';
          img.loading = 'lazy';
          img.width = 270; img.height = 480;
          if (img.addEventListener) img.addEventListener('error', function () { fig.hidden = true; });
          fig.appendChild(img);
          if (clip.title) fig.appendChild(el(doc, 'figcaption', '', clip.title));
          grid.appendChild(fig);
        });
        s3.appendChild(grid);
      }
      root.appendChild(s3);
    }

    // 4 · what happens next
    var next = el(doc, 'section', 'bd-next');
    if (data.deckPromised) {
      next.appendChild(el(doc, 'p', 'bd-next__lead',
        'Your full direction deck is on its way: three directions for your ' + c.noun +
        ', with reference clips. Expect it within 1 business day.'));
      var a = el(doc, 'a', 'btn', c.bookLabel);
      a.href = c.bookHref;
      a.setAttribute('data-cta', 'breakdown-book');
      next.appendChild(a);
    } else {
      next.className = 'bd-next bd-next--card';
      next.appendChild(el(doc, 'p', 'bd-next__lead',
        'At your stage, a Sprint gets you the creative without the monthly commitment.'));
      var b = el(doc, 'a', 'btn btn--ghost', 'See how a Sprint works');
      b.href = '/next-step?from=breakdown';
      b.setAttribute('data-cta', 'breakdown-sprint');
      next.appendChild(b);
    }
    root.appendChild(next);
    return root;
  }

  // ── storage, failure tolerant ────────────────────────────────────────
  function ls(key, val) {
    try {
      if (val === undefined) return w.localStorage.getItem(key);
      if (val === null) { w.localStorage.removeItem(key); return null; }
      w.localStorage.setItem(key, val);
      return val;
    } catch (e) { return null; }
  }

  function browserId() {
    var id = ls(BID_KEY);
    if (!id) {
      try { id = w.crypto.randomUUID(); }
      catch (e) { id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12); }
      ls(BID_KEY, id);
    }
    return id;
  }

  // ── the page ─────────────────────────────────────────────────────────
  function init() {
    var app = d.getElementById('breakdown-app');
    if (!app) return;

    var search = w.location.search;
    var kind = kindFrom(search);
    var form = d.getElementById('bd-form');
    var btn = d.getElementById('bd-submit');
    var formErr = d.getElementById('bd-form-err');
    var states = ['bd-state-form', 'bd-state-progress', 'bd-state-result', 'bd-state-notice'];
    var attempted = false;
    var sending = false;
    var progressTimer = null;
    var viewed = false;

    function applyKind(k) {
      kind = k === 'ads' ? 'ads' : 'show';
      var c = COPY[kind];
      d.getElementById('bd-title').textContent = c.title;
      d.getElementById('bd-sub').textContent = c.sub;
      d.title = c.title + ' · New Terrain Creative';
    }

    function show(id) {
      states.forEach(function (s) { d.getElementById(s).hidden = s !== id; });
      d.getElementById('bd-intro').hidden = id === 'bd-state-result';
      if (id !== 'bd-state-progress' && progressTimer) {
        clearInterval(progressTimer); progressTimer = null;
      }
    }

    function startProgress() {
      show('bd-state-progress');
      var line = d.getElementById('bd-progress-line');
      var i = 0;
      line.textContent = PROGRESS[0];
      if (progressTimer) clearInterval(progressTimer);
      progressTimer = setInterval(function () {
        i = (i + 1) % PROGRESS.length;
        line.textContent = PROGRESS[i];
      }, 2600);
    }

    // A notice: a heading, a line, and a way to book. Text only.
    function notice(heading, line, withBook) {
      var box = d.getElementById('bd-state-notice');
      box.textContent = '';
      box.appendChild(el(d, 'h2', 'bd-notice__title', heading));
      box.appendChild(el(d, 'p', 'bd-copy', line));
      if (withBook) {
        var a = el(d, 'a', 'btn btn--ghost', COPY[kind].bookLabel);
        a.href = COPY[kind].bookHref;
        a.setAttribute('data-cta', 'breakdown-fallback');
        box.appendChild(a);
      }
      show('bd-state-notice');
    }

    function fireLead(data, token) {
      if (!data.qualified || ls(LEAD_KEY) === token) return;
      ls(LEAD_KEY, token);
      // Deterministic id, so a server copy sent by the agent deduplicates.
      var payload = { content_name: COPY[kind].title, offer: 'breakdown_' + kind };
      if (w.ntc) w.ntc.track('Lead', payload, { eventId: 'breakdown-lead-' + token });
      else if (typeof w.fbq === 'function') w.fbq('track', 'Lead', payload, { eventID: 'breakdown-lead-' + token });
    }

    function renderDone(data, token) {
      var root = d.getElementById('bd-state-result');
      renderResult(root, data, token, d);
      show('bd-state-result');
      if (!viewed && w.ntc) {
        viewed = true;
        w.ntc.track('BreakdownView', { kind: kind, qualified: !!data.qualified });
      }
      fireLead(data, token);
      var ctas = root.querySelectorAll('[data-cta]');
      Array.prototype.forEach.call(ctas, function (a) {
        a.addEventListener('click', function () {
          if (w.ntc) w.ntc.track('CTAClick', { offer: 'breakdown_' + kind, position: a.getAttribute('data-cta') }, { once: false });
        });
      });
      w.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function poll(token) {
      var started = Date.now();
      var misses = 0;
      startProgress();

      function tick() {
        fetch('/b/' + encodeURIComponent(token), { headers: { Accept: 'application/json' }, cache: 'no-store' })
          .then(function (r) {
            if (r.status === 404) return { status: 'missing' };
            if (!r.ok) throw new Error('status ' + r.status);
            return r.json();
          })
          .then(function (data) {
            misses = 0;
            if (data.kind) applyKind(data.kind);
            if (data.status === 'missing') {
              // An unknown token: forget it and offer the form again.
              ls(TOKEN_KEY, null);
              show('bd-state-form');
              return;
            }
            if (data.status === 'done' && data.result) return renderDone(data, token);
            if (data.status === 'queued') {
              return notice('You’re in line.',
                'We’re at capacity today. Yours is in line and we’ll email it to you.', false);
            }
            if (data.status === 'error') {
              return notice('That one got away from us.',
                data.message ? String(data.message)
                  : 'Something went wrong, we’ll email you. If you’d rather talk it through now, book a call.',
                true);
            }
            next();
          })
          .catch(function () {
            // A blip is retried. Several in a row is a real failure.
            if (++misses >= 5) {
              return notice('That one got away from us.',
                'Something went wrong, we’ll email you. If you’d rather talk it through now, book a call.', true);
            }
            next();
          });
      }

      function next() {
        if (Date.now() - started >= POLL_LIMIT_MS) {
          return notice('Still working on yours.',
            'This one is taking longer than usual. We’ll email it to you as soon as it’s ready.', false);
        }
        setTimeout(tick, POLL_MS);
      }

      tick();
    }

    function load(token) {
      ls(TOKEN_KEY, token);
      poll(token);
    }

    // ── form ──────────────────────────────────────────────────────────
    function values() {
      function v(n) { var x = form.elements[n]; return x ? String(x.value || '').trim() : ''; }
      function radio(n) {
        var x = form.querySelector('input[name="' + n + '"]:checked');
        return x ? x.value : '';
      }
      return {
        site: v('site'), instagram: v('instagram'), name: v('name'), email: v('email'),
        phone: v('phone'), revenue: radio('revenue'), investment: radio('investment'),
        consentEmail: !!(form.elements.consentEmail && form.elements.consentEmail.checked),
        hp: v('company_website')
      };
    }

    var FIELDS = ['site', 'instagram', 'name', 'email', 'phone', 'revenue', 'investment'];

    function fieldTarget(name) {
      return form.querySelector('[data-group="' + name + '"]') || form.elements[name];
    }

    function setError(name, msg) {
      var err = d.getElementById('bd-' + name + '-err');
      var t = fieldTarget(name);
      if (err) err.textContent = msg || '';
      if (t && t.setAttribute) {
        if (msg) t.setAttribute('aria-invalid', 'true'); else t.removeAttribute('aria-invalid');
      }
    }

    function showErrors(errs) {
      FIELDS.forEach(function (f) { setError(f, errs[f]); });
      var first = FIELDS.filter(function (f) { return errs[f]; })[0];
      if (first) {
        var t = form.elements[first];
        if (t && !t.focus && t[0]) t = t[0];
        if (t && t.focus) t.focus();
      }
      return !first;
    }

    Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) {
      input.addEventListener(input.type === 'radio' ? 'change' : 'input', function () {
        if (attempted) showErrors(validate(values()));
      });
    });

    function formError(msg) {
      formErr.textContent = msg;
      formErr.hidden = !msg;
    }

    function done() {
      sending = false;
      btn.disabled = false;
      btn.textContent = 'Get my breakdown';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;
      formError('');
      attempted = true;
      var v = values();
      if (!showErrors(validate(v))) return;

      var payload = buildPayload(v, {
        kind: kind,
        browserId: browserId(),
        utm: utmFrom(search, w.ntc ? w.ntc.attribution() : {}),
        referrer: d.referrer || ''
      });

      sending = true;
      btn.disabled = true;
      btn.textContent = 'Starting...';
      if (w.ntc) w.ntc.track('BreakdownStart', { kind: kind, revenue: v.revenue, investment: v.investment });

      fetch('/b/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { status: r.status, body: body || {} };
        });
      }).then(function (res) {
        var b = res.body;
        if (res.status === 200 && isToken(b.token)) {
          if (b.status === 'queued') {
            ls(TOKEN_KEY, b.token);
            done();
            return notice('You’re in line.',
              'We’re at capacity today. Yours is in line and we’ll email it to you.', false);
          }
          return load(b.token);
        }
        if (res.status === 409 && isToken(b.token)) return load(b.token);
        done();
        if (res.status === 400 && b.field && FIELDS.indexOf(b.field) >= 0) {
          var errs = {}; errs[b.field] = String(b.error || 'Please check this.');
          showErrors(errs);
          return;
        }
        if (res.status === 503) {
          return notice('The free breakdown is paused.',
            String(b.error || 'We are not taking new breakdowns right now. Book a call and we’ll walk you through it in person.'),
            true);
        }
        formError(String(b.error || 'Something went wrong starting that. Try again in a minute.'));
      }).catch(function () {
        done();
        formError('Something went wrong starting that, and your answers are still here. Try again in a minute.');
      });
    });

    // ── boot ──────────────────────────────────────────────────────────
    applyKind(kind);
    // breakdown.html lifts ?t= out of the URL before the pixel loads.
    var linked = tokenFrom(search) ||
      (isToken(w.NTC_BREAKDOWN_LINKED) ? w.NTC_BREAKDOWN_LINKED : null);
    var stored = ls(TOKEN_KEY);
    if (linked) load(linked);
    else if (isToken(stored)) poll(stored);
    else show('bd-state-form');
  }

  w.NTCBreakdown = {
    kindFrom: kindFrom, tokenFrom: tokenFrom, isToken: isToken,
    validate: validate, utmFrom: utmFrom, buildPayload: buildPayload,
    fontLoadable: fontLoadable, safeColor: safeColor, clipSrc: clipSrc,
    renderResult: renderResult, COPY: COPY, REVENUE: REVENUE, INVESTMENT: INVESTMENT
  };

  if (d && d.getElementById) {
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(window, typeof document !== 'undefined' ? document : null);
