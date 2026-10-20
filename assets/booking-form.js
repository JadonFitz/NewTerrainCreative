/* ══════════════════════════════════════════════════════════════════════
   GHL booking form · the multi-step form, then the calendar
   ──────────────────────────────────────────────────────────────────────
   Rendered by /strategy-call only when the offer's provider is 'ghl'
   (or ?provider=ghl is on the URL for testing). With the default
   'iclosed' this file is loaded and does nothing.

     NTCBookingForm.mount(slot, { offer, attribution, query })
       step 1 name, email, phone; then the offer's questions from
       assets/booking-forms.js, a few per step; then the GHL calendar,
       or the disqualify redirect, as /api/book-intake decides.

     NTCBookingForm.embedCalendar(slot, url, title)
       the GHL calendar on its own. /reschedule and /follow-up use this
       directly: those two offers ask nothing on the website.

   Styling comes from the host page: .q, .opts, .opt, .btn, .err and the
   input rules /strategy-call already has. Built with DOM calls and
   textContent only, so no label or answer is ever parsed as HTML.

   Fires no Meta event. The conversion is the booking, and /call-booked
   and /api/ghl-webhook report it, keyed schedule_<ntc_session>.
   ══════════════════════════════════════════════════════════════════════ */
(function (w, d) {
  'use strict';

  var FORMS = w.NTCBookingForms;
  var PENDING_KEY = 'ntc_ghl_booking';
  var FALLBACK = 'Email business@newterraincreative.com or call or text (818) 266-8213 ' +
                 'and we will find a time by hand, usually the same day.';

  // GHL hosts the calendar may be served from. Anything else is refused,
  // so a misconfigured env var cannot frame an arbitrary page here.
  var CALENDAR_HOSTS = /(^|\.)leadconnectorhq\.com$|(^|\.)msgsndr\.com$|(^|\.)gohighlevel\.com$/;

  function el(tag, attrs, text) {
    var n = d.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }

  function store(key, val) {
    try {
      if (val === undefined) return w.localStorage.getItem(key);
      if (val === null) return w.localStorage.removeItem(key);
      w.localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }

  function post(body) {
    return fetch('/api/book-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j.status = r.status; return j;
      });
    });
  }

  /* ── the calendar ─────────────────────────────────────────────────
     GHL's own embed: an iframe plus form_embed.js, which sizes the frame
     to its content. The booking redirect (set on each GHL calendar) goes
     to /call-booked?offer=<key>&provider=ghl, and /call-booked lifts
     itself out of the frame if GHL navigates the frame instead of the
     page. */
  function embedCalendar(slot, url, title) {
    var ok = false;
    try { var u = new URL(url); ok = u.protocol === 'https:' && CALENDAR_HOSTS.test(u.hostname); } catch (e) {}
    slot.textContent = '';
    if (!ok) {
      slot.classList.remove('scheduler--live', 'scheduler--form');
      var pend = el('div', { 'class': 'scheduler-pending' });
      pend.appendChild(el('span', { 'class': 'mark' }, 'New Terrain'));
      pend.appendChild(el('p', null, 'The booking calendar did not load. ' + FALLBACK));
      slot.appendChild(pend);
      return false;
    }
    slot.classList.remove('scheduler--form');
    slot.classList.add('scheduler--live', 'scheduler--ghl');
    var id = 'ghl-cal-' + Math.random().toString(36).slice(2, 10);
    slot.appendChild(el('iframe', {
      src: url, id: id, title: title || 'Pick a time with New Terrain Creative',
      scrolling: 'no', loading: 'eager'
    }));
    if (!d.querySelector('script[data-ghl-embed]')) {
      var sc = el('script', { src: 'https://link.msgsndr.com/js/form_embed.js', 'data-ghl-embed': true });
      sc.async = true;
      d.body.appendChild(sc);
    }
    return true;
  }

  /* ── the form ───────────────────────────────────────────────────── */
  function mount(slot, opts) {
    opts = opts || {};
    var offerKey = opts.offer;
    var offer = FORMS && FORMS.OFFERS[offerKey];
    if (!slot || !offer || offer.direct) return false;

    var query = opts.query || new URLSearchParams(w.location.search);
    var attribution = opts.attribution || {};
    var contact = { firstName: '', lastName: '', email: '', phone: '' };
    var answers = {};
    var token = null;
    var step = 0;
    var total = offer.steps.length + 1;
    var busy = false;

    // Preselected answers from the URL (/sprint's pkg=eight|fifteen).
    Object.keys(offer.prefill || {}).forEach(function (param) {
      var rule = offer.prefill[param];
      var v = (query.get(param) || '').trim().toLowerCase();
      if (rule.map[v]) answers[rule.key] = rule.map[v];
    });

    slot.textContent = '';
    slot.classList.remove('scheduler--live');
    slot.classList.add('scheduler--form');

    var form = el('form', { 'class': 'bk', novalidate: true, 'aria-labelledby': 'bk-title' });
    var progress = el('p', { 'class': 'bk-progress', 'aria-live': 'polite' });
    var title = el('h2', { 'class': 'bk-title', id: 'bk-title', tabindex: '-1' });
    var body = el('div', { 'class': 'bk-body' });
    // Honeypot: off screen, out of the tab order, ignored by autofill.
    var hp = el('div', { 'class': 'hp', 'aria-hidden': 'true' });
    var hpInput = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
    hp.appendChild(el('label', null, 'Leave this empty')).appendChild(hpInput);
    var err = el('p', { 'class': 'err', role: 'alert' });
    var nav = el('div', { 'class': 'bk-nav' });
    var back = el('button', { type: 'button', 'class': 'bk-back' }, 'Back');
    var next = el('button', { type: 'submit', 'class': 'btn' });
    nav.appendChild(next); nav.appendChild(back);
    [progress, title, body, hp, err, nav].forEach(function (n) { form.appendChild(n); });
    slot.appendChild(form);

    function inputId(key) { return 'bk-' + key; }

    function textField(key, label, type, value, extra) {
      var wrap = el('div', { 'class': 'q' });
      wrap.appendChild(el('label', { 'for': inputId(key) }, label));
      var input = type === 'textarea'
        ? el('textarea', Object.assign({ id: inputId(key), name: key, rows: '3' }, extra || {}))
        : el('input', Object.assign({ id: inputId(key), name: key, type: type }, extra || {}));
      input.value = value || '';
      wrap.appendChild(input);
      return wrap;
    }

    function choiceField(key, q) {
      var fs = el('fieldset', { 'class': 'q', id: inputId(key) + '-group' });
      fs.appendChild(el('legend', { 'class': 'qlabel' }, q.label));
      var opts = el('div', { 'class': 'opts' });
      q.options.forEach(function (o, i) {
        var lab = el('label', { 'class': 'opt' });
        var r = el('input', { type: 'radio', name: key, value: o, id: inputId(key) + '-' + i });
        if (answers[key] === o) r.checked = true;
        lab.appendChild(r);
        lab.appendChild(el('span', null, o));
        opts.appendChild(lab);
      });
      fs.appendChild(opts);
      return fs;
    }

    function render() {
      body.textContent = '';
      err.textContent = '';
      progress.textContent = 'Step ' + (step + 1) + ' of ' + total;
      back.hidden = step === 0;
      next.textContent = step === 0 ? 'Continue' : step === total - 1 ? 'See available times' : 'Continue';
      if (step === 0) {
        title.textContent = 'First, who are we talking to?';
        body.appendChild(textField('firstName', 'First name', 'text', contact.firstName,
          { autocomplete: 'given-name', required: true, maxlength: '80' }));
        body.appendChild(textField('lastName', 'Last name', 'text', contact.lastName,
          { autocomplete: 'family-name', required: true, maxlength: '80' }));
        body.appendChild(textField('email', 'Email', 'email', contact.email,
          { autocomplete: 'email', required: true, maxlength: '254', inputmode: 'email' }));
        body.appendChild(textField('phone', 'Phone', 'tel', contact.phone,
          { autocomplete: 'tel', required: true, maxlength: '40', inputmode: 'tel' }));
        return;
      }
      title.textContent = step === total - 1 ? 'Last few questions' : 'A few questions';
      offer.steps[step - 1].forEach(function (key) {
        var q = offer.questions[key];
        var label = q.optional ? q.label + ' (optional)' : q.label;
        if (q.type === 'choice') body.appendChild(choiceField(key, q));
        else body.appendChild(textField(key, label, q.type === 'textarea' ? 'textarea' : 'text',
          answers[key], { maxlength: q.type === 'textarea' ? '2000' : '300', required: !q.optional }));
      });
    }

    function focusTitle() { try { title.focus({ preventScroll: false }); } catch (e) { title.focus(); } }

    function markInvalid(keys) {
      var first = null;
      body.querySelectorAll('[aria-invalid]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
      keys.forEach(function (k) {
        var n = d.getElementById(inputId(k)) || d.getElementById(inputId(k) + '-group');
        if (!n) return;
        n.setAttribute('aria-invalid', 'true');
        if (!first) first = n.tagName === 'FIELDSET' ? n.querySelector('input') : n;
      });
      if (first) first.focus();
    }

    function collect() {
      var bad = [];
      if (step === 0) {
        ['firstName', 'lastName', 'email', 'phone'].forEach(function (k) {
          contact[k] = (form.elements[k].value || '').trim();
        });
        if (!contact.firstName) bad.push('firstName');
        if (!contact.lastName) bad.push('lastName');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact.email)) bad.push('email');
        var digits = contact.phone.replace(/[^0-9]/g, '');
        if (digits.length < 10 || digits.length > 15) bad.push('phone');
        return bad;
      }
      offer.steps[step - 1].forEach(function (key) {
        var q = offer.questions[key];
        var v = '';
        if (q.type === 'choice') {
          var hit = form.querySelector('input[name="' + key + '"]:checked');
          v = hit ? hit.value : '';
        } else {
          v = (form.elements[key].value || '').trim();
        }
        if (v) answers[key] = v; else delete answers[key];
        if (!v && !q.optional) bad.push(key);
      });
      return bad;
    }

    function fail(msg) {
      busy = false; next.disabled = false;
      err.textContent = msg;
    }

    function payload(stepName) {
      return { step: stepName, offer: offerKey, contact: contact, answers: answers,
               attribution: attribution, token: token, website: hpInput.value };
    }

    function finish(res) {
      if (res.next === 'redirect' && typeof res.url === 'string' && res.url.charAt(0) === '/') {
        w.location.href = res.url;
        return;
      }
      if (res.next === 'calendar') {
        /* Read by /call-booked, which fires the browser Schedule only for
           a visit that came through this form, keyed on the session. */
        store(PENDING_KEY, JSON.stringify({ offer: offerKey, from: attribution.from || '', t: Date.now() }));
        embedCalendar(slot, res.calendarUrl || '', offer.calendar + ' with New Terrain Creative');
        try { slot.scrollIntoView({ block: 'start' }); } catch (e) {}
        return;
      }
      fail('Something went wrong saving your answers. ' + FALLBACK);
    }

    back.addEventListener('click', function () {
      if (busy || step === 0) return;
      collect();
      step -= 1; render(); focusTitle();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      var bad = collect();
      if (bad.length) {
        err.textContent = bad.length === 1 ? 'Please answer the highlighted question.'
                                           : 'Please answer the highlighted questions.';
        markInvalid(bad);
        return;
      }
      busy = true; next.disabled = true; err.textContent = '';

      if (step === 0) {
        /* A failed save here does not stop the visitor: step two saves
           the same contact again, and the calendar asks for it anyway. */
        post(payload('contact')).then(function (res) {
          if (res.status === 400 && res.fields) { fail('Please check the highlighted fields.'); markInvalid(res.fields); return; }
          if (res.status === 429) { fail(res.error || 'Too many tries. Please wait a few minutes.'); return; }
          token = res.token || null;
          busy = false; next.disabled = false;
          step = 1; render(); focusTitle();
        }, function () {
          busy = false; next.disabled = false;
          step = 1; render(); focusTitle();
        });
        return;
      }

      if (step < total - 1) {
        busy = false; next.disabled = false;
        step += 1; render(); focusTitle();
        return;
      }

      post(payload('answers')).then(function (res) {
        if (res.status === 400 && res.fields) { fail('Please check your answers.'); return; }
        if (res.status === 429) { fail(res.error || 'Too many tries. Please wait a few minutes.'); return; }
        finish(res);
      }, function () { fail('We could not reach the booking calendar. ' + FALLBACK); });
    });

    render();
    return true;
  }

  w.NTCBookingForm = { mount: mount, embedCalendar: embedCalendar, PENDING_KEY: PENDING_KEY };
})(window, document);
