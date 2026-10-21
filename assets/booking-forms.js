/* ══════════════════════════════════════════════════════════════════════
   GHL booking forms · the one definition the page and the API share
   ──────────────────────────────────────────────────────────────────────
   Every offer's questions, their exact GoHighLevel custom field keys,
   the option labels word for word, how they are grouped into steps,
   and the rules that turn a booking away.

   The source of truth above this file is the shared contract (GHL
   booking contract v2, 21 Oct 2026, which follows the live iClosed
   audit of the same day). The agent, the Speed-to-Lead bot and GHL
   itself all read these same keys and labels, and lib/rules.js
   matches the words, the disqualifiers especially. Change the contract
   first, then this file, then scripts/test-booking-forms.mjs, whose
   fixture is a copy of the contract's option lists and fails on drift.

   A classic script, not a module, so the page can load it with a plain
   <script src> and no build step. /api/book-intake imports it for its
   side effect and reads globalThis.NTCBookingForms; the same object
   either way, so the server re-checks exactly what the page asked.

   Option labels: no trailing periods, and ranges use a plain "-" except
   where the live iClosed label uses an en dash or "to". Do not "tidy"
   them: a label that differs by one character is a different answer to
   every reader downstream.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var DECISION_ROLE = [
    "I'm the decision-maker",
    'I decide with a partner or team (they can join the call)',
    'Someone else makes the final decision'
  ];

  /* Annual revenue, asked by Growth and the Story Session (optional on
     both, as in iClosed). The two bands under $2M turn a booking away. */
  var ANNUAL_REVENUE = ['Under $1M', '$1M–$2M', '$2M–$5M', '$5M–$10M', '$10M+'];
  var UNDER_2M = ['Under $1M', '$1M–$2M'];

  /* type: text (GHL TEXT), textarea (LARGE_TEXT), choice (SINGLE_OPTIONS).
     iClosed short text renders as text and long text as textarea.
     optional: true only where the iClosed question is not required. */
  var OFFERS = {
    'growth': {
      label: 'Growth Strategy Consultation',
      calendar: 'Growth Strategy Consultation',
      questions: {
        ntc_company:      { type: 'text', label: 'Business Name' },
        ntc_site_or_ig:   { type: 'text', label: 'Business Website or Instagram' },
        ntc_priority_90d: { type: 'choice', label: 'What do you need most to improve over the next 90 days?',
          options: ['Generate more qualified leads', 'Build a stronger, more consistent content presence',
                    'Improve an existing paid-ad campaign', 'Launch or promote a specific offer',
                    'A mix of the above'] },
        ntc_running_ads:  { type: 'choice', label: 'Are you currently running paid advertising?',
          options: ['Yes, actively', 'Not currently', 'We have in the past', 'Preparing to start'] },
        ntc_start_timing: { type: 'choice', label: 'How soon would you like to start?',
          options: ['As soon as possible', 'Within 30 days', 'Within 1-3 months', 'Just researching for now'] },
        ntc_annual_revenue: { type: 'choice', label: "What is your business's annual revenue?",
          options: ANNUAL_REVENUE, optional: true },
        ntc_service_investment: { type: 'choice',
          label: "Every retainer includes creative production and paid media management, with a three-month minimum commitment. Ad spend is separate. What monthly investment in New Terrain's services are you planning?",
          options: ['Under $5K', '$5K–$8K', '$8K–$12K', '$12K–$18K', '$18K+'] },
        ntc_ad_budget: { type: 'choice',
          label: 'Separately, what monthly advertising budget can you fund, paid directly to the advertising platforms?',
          options: ['Under $1,500', '$1,500–$3,000', '$3,000–$5,000', '$5,000–$10,000', '$10,000+', 'Not sure yet'] },
        ntc_decision_role: { type: 'choice', label: 'Who is involved in deciding on this?', options: DECISION_ROLE }
      },
      steps: [
        ['ntc_company', 'ntc_site_or_ig'],
        ['ntc_priority_90d', 'ntc_running_ads'],
        ['ntc_start_timing', 'ntc_annual_revenue'],
        ['ntc_service_investment', 'ntc_ad_budget'],
        ['ntc_decision_role']
      ],
      // The live iClosed rules (audit, 21 Oct 2026). Any one disqualifies.
      disqualify: [
        { key: 'ntc_ad_budget', values: ['Under $1,500'] },
        { key: 'ntc_service_investment', values: ['Under $5K'] },
        { key: 'ntc_annual_revenue', values: UNDER_2M }
      ],
      disqualifyTo: '/next-step?from=growth',
      valueKey: 'ntc_service_investment'
    },

    'brand-builder': {
      label: 'Brand Builder · Story Session',
      calendar: 'Brand Builder · Story Session',
      questions: {
        ntc_company:     { type: 'text', label: 'Your company, and what it does' },
        ntc_location:    { type: 'choice', label: 'Where is the business based?',
          options: ['Los Angeles', 'Elsewhere in California', 'Outside California'] },
        ntc_site_or_ig:  { type: 'text', label: 'Your website or Instagram' },
        ntc_selling_status: { type: 'choice', label: 'Is the business already selling?',
          options: ['Yes, with customers', 'Pre-launch'] },
        ntc_on_camera:   { type: 'choice', label: 'Are you willing to be on camera?',
          options: ['Yes', 'Nervous, but willing', 'No'] },
        ntc_brand_goal:  { type: 'textarea', label: 'What should the brand do for the business?' },
        ntc_annual_revenue: { type: 'choice', label: "What is your business's annual revenue?",
          options: ANNUAL_REVENUE, optional: true },
        ntc_bb_investment: { type: 'choice',
          label: 'Brand Builder is an ongoing creative partnership: production, longform and paid media management. Ad spend is separate. What monthly investment are you planning for this?',
          options: ['Under $5K/month', '$5K to $10K/month', '$10K to $15K/month', '$15K+/month'] },
        ntc_show_format: { type: 'choice', label: 'What kind of show do you picture?',
          options: ['Sit-down or podcast', 'Hands-on, behind the scenes (vlog style)', 'A mix of both', 'Not sure yet'] }
      },
      // The live order: show format comes last, after the investment.
      steps: [
        ['ntc_company', 'ntc_location', 'ntc_site_or_ig'],
        ['ntc_selling_status', 'ntc_on_camera', 'ntc_brand_goal'],
        ['ntc_annual_revenue', 'ntc_bb_investment', 'ntc_show_format']
      ],
      disqualify: [
        { key: 'ntc_bb_investment', values: ['Under $5K/month'] },
        { key: 'ntc_annual_revenue', values: UNDER_2M }
      ],
      disqualifyTo: '/next-step?from=bb-apply',
      valueKey: 'ntc_bb_investment'
    },

    'ad-sprint': {
      label: 'Ad Sprint',
      calendar: 'Ad Sprint Call',
      questions: {
        ntc_site_or_ig:     { type: 'text', label: 'Business Website or Instagram' },
        ntc_sprint_package: { type: 'choice', label: 'Which Ad Sprint are you considering?',
          options: ['The Eight (8 ad creatives)', 'The Fifteen (15 ad creatives)', 'Not sure, help me choose'] },
        ntc_sprint_promote: { type: 'text', label: 'What are you trying to promote or sell?' },
        // The live label uses a curly apostrophe; keep it.
        ntc_sprint_goal:    { type: 'choice', label: 'What’s the main goal of the campaign?',
          options: ['Generate Leads', 'Book Appointments', 'Sell a Product', 'Build Awareness'] },
        ntc_location_text:  { type: 'text', label: 'Where is your business located?' },
        ntc_sprint_launch:  { type: 'choice', label: 'Do you have a launch date or deadline?',
          options: ['ASAP', 'Within 30 days', '1-3 months', 'Flexible / no fixed date'] },
        ntc_sprint_budget:  { type: 'choice',
          label: 'Ad Sprints are a one-time creative production engagement, paid in full upfront. Ad spend and ongoing campaign management are not included. What one-time production budget do you have for this project?',
          options: ['Under $3,000', '$3,000–$5,500', '$5,500–$8,000', '$8,000+'] },
        // Short text in iClosed; GHL keeps ntc_notes as LARGE_TEXT.
        ntc_notes:          { type: 'text', label: 'Anything you’d like us to review before the call?', optional: true }
      },
      steps: [
        ['ntc_site_or_ig', 'ntc_sprint_package', 'ntc_sprint_promote'],
        ['ntc_sprint_goal', 'ntc_location_text', 'ntc_sprint_launch'],
        ['ntc_sprint_budget', 'ntc_notes']
      ],
      // /sprint sends pkg=eight|fifteen; it preselects the package.
      prefill: { pkg: { key: 'ntc_sprint_package',
        map: { eight: 'The Eight (8 ad creatives)', fifteen: 'The Fifteen (15 ad creatives)' } } },
      disqualify: [],
      disqualifyTo: '',
      valueKey: 'ntc_sprint_budget'
    },

    /* The live 5-Day Trial Call form (audit, 21 Oct 2026). The metro is
       free text now, so it lives in ntc_trial_metro_text. */
    'pest-control-trial': {
      label: '5-Day Trial Call',
      calendar: '5-Day Trial Call',
      questions: {
        ntc_company:       { type: 'text', label: 'Business Name' },
        ntc_site_or_ig:    { type: 'text', label: 'Business Website or Instagram' },
        ntc_decision_role: { type: 'choice', label: 'Who is involved in deciding on this?', options: DECISION_ROLE },
        ntc_trial_metro_text: { type: 'text', label: 'Which metro do you serve?' },
        ntc_trial_recurring: { type: 'choice', label: 'Do you offer recurring service plans (monthly or quarterly)?',
          options: ['Yes', 'No'] },
        ntc_trial_footage: { type: 'choice', label: 'How much footage do you have of your work?',
          options: ['10+ minutes of video or 20+ photos', 'Some', 'None'] },
        ntc_trial_ad_account: { type: 'choice', label: 'Do you have a Meta (Facebook and Instagram) ad account?',
          options: ['Yes, I have admin access', 'Not sure', 'No ad account'] },
        ntc_trial_funded:  { type: 'choice',
          label: 'The total spend required in the trial is $2,000. Are you able to fund the trial immediately?',
          options: ["Yes, I'm ready to fund the trial", 'Not ready to fund the trial yet'] },
        ntc_trial_response: { type: 'choice', label: 'If a homeowner messages you today, who responds and how fast?',
          options: ['I do, within the hour', 'Office staff, same day', 'Whoever gets to it', 'Not sure'] }
      },
      steps: [
        ['ntc_company', 'ntc_site_or_ig', 'ntc_decision_role'],
        ['ntc_trial_metro_text', 'ntc_trial_recurring', 'ntc_trial_footage'],
        ['ntc_trial_ad_account', 'ntc_trial_funded', 'ntc_trial_response']
      ],
      disqualify: [{ key: 'ntc_trial_funded', values: ['Not ready to fund the trial yet'] }],
      disqualifyTo: '/pest-control-trial?from=trial-unfunded',
      valueKey: ''
    },

    'signature': {
      label: 'Signature Project',
      calendar: 'Signature Project',
      questions: {
        ntc_company:        { type: 'text', label: 'Business / Project Name', optional: true },
        ntc_sig_discussing: { type: 'textarea', label: 'What are we discussing?' },
        ntc_sig_references: { type: 'text', label: 'Any references or links you\'d like us to review?', optional: true },
        ntc_sig_fit:        { type: 'choice',
          label: 'Signature Work is bespoke production: commercials, brand films, documentaries, launch campaigns and podcast build-outs. Scoped and priced per project rather than sold as a package. Is that what you\'re looking for?',
          options: ['Yes, I have a specific project in mind', "I'm not sure yet, I'd like to talk it through",
                    "No, I'm looking for ongoing content or ads"] },
        ntc_signature_budget: { type: 'choice', label: "What is your company's budget for this piece?",
          options: ['Under $10,000', '$10,000-$25,000', '$25,000-$50,000', '$50,000+'] }
      },
      steps: [
        ['ntc_company', 'ntc_sig_discussing', 'ntc_sig_references'],
        ['ntc_sig_fit', 'ntc_signature_budget']
      ],
      disqualify: [{ key: 'ntc_signature_budget', values: ['Under $10,000'] }],
      disqualifyTo: '/next-step?from=signature-project',
      valueKey: 'ntc_signature_budget'
    },

    /* Name, email and phone only, on the GHL calendar's own form. The
       website asks nothing, so these have no steps: /reschedule and
       /follow-up embed the calendar directly. */
    'reschedule': { label: 'Rescheduled Call', calendar: 'Rescheduled Call', questions: {}, steps: [],
                    disqualify: [], disqualifyTo: '', valueKey: '', direct: true },
    'follow-up':  { label: 'Quick Follow-Up', calendar: 'Quick Follow-Up', questions: {}, steps: [],
                    disqualify: [], disqualifyTo: '', valueKey: '', direct: true }
  };

  /* Hidden attribution fields, filled from the landing URL and the
     browser. Request name on the left, GHL contact field on the right. */
  var ATTRIBUTION = {
    utm_source: 'utm_source', utm_medium: 'utm_medium', utm_campaign: 'utm_campaign',
    utm_content: 'utm_content', utm_term: 'utm_term',
    fbclid: 'ntc_fbclid', fbp: 'ntc_fbp', fbc: 'ntc_fbc',
    ntc_session: 'ntc_session', landing_page: 'ntc_landing_page', from: 'ntc_from'
  };

  /** The reasons an answer set is turned away, empty when it is not. */
  function disqualifiers(offerKey, answers) {
    var offer = OFFERS[offerKey];
    if (!offer) return [];
    var out = [];
    offer.disqualify.forEach(function (rule) {
      if (rule.values.indexOf(answers && answers[rule.key]) !== -1) {
        out.push(rule.key + ' = ' + answers[rule.key]);
      }
    });
    return out;
  }

  /* The opportunity value: the low end of the investment band, in
     dollars, or 0. "Under ..." and "Not sure" are 0. */
  function bandValue(label) {
    var s = String(label || '');
    if (!s || /^under\b/i.test(s)) return 0;
    var m = s.match(/\$([0-9][0-9,]*(?:\.[0-9]+)?)\s*(K)?/i);
    if (!m) return 0;
    var n = Number(m[1].replace(/,/g, ''));
    if (m[2]) n *= 1000;
    return isFinite(n) ? Math.round(n) : 0;
  }

  function opportunityValue(offerKey, answers) {
    var offer = OFFERS[offerKey];
    if (!offer || !offer.valueKey) return 0;
    return bandValue(answers && answers[offer.valueKey]);
  }

  var api = {
    OFFERS: OFFERS,
    ATTRIBUTION: ATTRIBUTION,
    DECISION_ROLE: DECISION_ROLE,
    disqualifiers: disqualifiers,
    bandValue: bandValue,
    opportunityValue: opportunityValue
  };
  root.NTCBookingForms = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
