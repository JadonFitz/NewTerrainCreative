/* ══════════════════════════════════════════════════════════════════════
   GHL booking forms · the one definition the page and the API share
   ──────────────────────────────────────────────────────────────────────
   Every offer's questions, their exact GoHighLevel custom field keys,
   the option labels word for word, how they are grouped into steps,
   and the rules that turn a booking away.

   The source of truth above this file is the shared contract (GHL
   booking contract v1, 20 Oct 2026). The agent, the Speed-to-Lead bot
   and GHL itself all read these same keys and labels, and lib/rules.js
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

  /* type: text (GHL TEXT), textarea (LARGE_TEXT), choice (SINGLE_OPTIONS).
     optional: true only where the iClosed question was optional. */
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
        ntc_monthly_revenue: { type: 'choice', label: "Roughly what is your business's monthly revenue?",
          options: ['Under $25K', '$25K–$50K', '$50K–$100K', '$100K–$250K', '$250K–$500K', '$500K+',
                    'Prefer to discuss on the call'] },
        ntc_service_investment: { type: 'choice',
          label: "Every retainer includes creative production and paid media management, with a three-month minimum commitment. Ad spend is separate. What monthly investment in New Terrain's services are you planning?",
          options: ['Under $5K', '$5K–$8K', '$8K–$12K', '$12K–$18K', '$18K+', 'Not sure yet'] },
        ntc_ad_budget: { type: 'choice',
          label: 'Separately, what monthly advertising budget can you fund, paid directly to the advertising platforms?',
          options: ['Under $1,500', '$1,500–$3,000', '$3,000–$5,000', '$5,000–$10,000', '$10,000+', 'Not sure yet'] },
        ntc_decision_role: { type: 'choice', label: 'Who is involved in deciding on this?', options: DECISION_ROLE }
      },
      steps: [
        ['ntc_company', 'ntc_site_or_ig'],
        ['ntc_priority_90d', 'ntc_running_ads'],
        ['ntc_start_timing', 'ntc_monthly_revenue'],
        ['ntc_service_investment', 'ntc_ad_budget'],
        ['ntc_decision_role']
      ],
      // The live iClosed rules. Any one of them disqualifies.
      disqualify: [
        { key: 'ntc_service_investment', values: ['Under $5K'] },
        { key: 'ntc_monthly_revenue', values: ['Under $25K'] },
        { key: 'ntc_ad_budget', values: ['Under $1,500'] }
      ],
      disqualifyTo: '/production-inquiry?from=signature',
      valueKey: 'ntc_service_investment'
    },

    'brand-builder': {
      label: 'Brand Builder · Story Session',
      calendar: 'Brand Builder · Story Session',
      questions: {
        ntc_company:     { type: 'text', label: 'Your company, and what it does' },
        ntc_show_format: { type: 'choice', label: 'What kind of show do you picture?',
          options: ['Sit-down or podcast', 'Hands-on, behind the scenes (vlog style)', 'A mix of both', 'Not sure yet'] },
        ntc_location:    { type: 'choice', label: 'Where is the business based?',
          options: ['Los Angeles', 'Elsewhere in California', 'Outside California'] },
        ntc_site_or_ig:  { type: 'text', label: 'Your website or Instagram' },
        ntc_selling_status: { type: 'choice', label: 'Is the business already selling?',
          options: ['Yes, with customers', 'Pre-launch'] },
        ntc_on_camera:   { type: 'choice', label: 'Are you willing to be on camera?',
          options: ['Yes', 'Nervous, but willing', 'No'] },
        ntc_brand_goal:  { type: 'textarea', label: 'What should the brand do for the business?' },
        ntc_content_volume: { type: 'choice', label: 'How much content do you picture each month?',
          options: ['A few strong pieces (under 10)', 'Steady weekly presence (10 to 30)', 'Everywhere, every day (30+)'] },
        ntc_bb_investment: { type: 'choice',
          label: 'Brand Builder is an ongoing creative partnership: production, longform and paid media management. Ad spend is separate. What monthly investment are you planning for this?',
          options: ['Under $5K/month', '$5K to $10K/month', '$10K to $15K/month', '$15K+/month'] }
      },
      steps: [
        ['ntc_company', 'ntc_show_format'],
        ['ntc_location', 'ntc_site_or_ig', 'ntc_selling_status'],
        ['ntc_on_camera', 'ntc_brand_goal'],
        ['ntc_content_volume', 'ntc_bb_investment']
      ],
      disqualify: [{ key: 'ntc_bb_investment', values: ['Under $5K/month'] }],
      disqualifyTo: '/production-inquiry?from=bb-apply',
      valueKey: 'ntc_bb_investment'
    },

    'ad-sprint': {
      label: 'Ad Sprint',
      calendar: 'Ad Sprint Call',
      questions: {
        ntc_site_or_ig:     { type: 'text', label: 'Business website or Instagram' },
        ntc_sprint_package: { type: 'choice', label: 'Which Ad Sprint?',
          options: ['The Eight (8 ad creatives)', 'The Fifteen (15 ad creatives)', 'Not sure'] },
        ntc_sprint_promote: { type: 'text', label: 'What are you promoting?' },
        ntc_sprint_goal:    { type: 'choice', label: 'Main goal',
          options: ['Generate Leads', 'Book Appointments', 'Sell a Product', 'Build Awareness'] },
        ntc_location_text:  { type: 'text', label: 'Business location' },
        ntc_sprint_launch:  { type: 'choice', label: 'Launch date',
          options: ['ASAP', 'Within 30 days', '1-3 months', 'Flexible'] },
        ntc_sprint_budget:  { type: 'choice',
          label: 'One-time production budget (the Sprint is one-time creative production, paid in full upfront; ad spend and ongoing campaign management are not included)',
          options: ['Under $3,000', '$3,000-$5,500', '$5,500-$8,000', '$8,000+', 'Not sure yet'] },
        ntc_notes:          { type: 'textarea', label: 'Anything we should review before the call?', optional: true }
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

    /* Wording from agent-v1 ICLOSED-TRIAL.md, questions 2 to 10. The
       decision question reuses the Growth wording and sits third, as the
       live event was built. */
    'pest-control-trial': {
      label: '5-Day Trial Call',
      calendar: '5-Day Trial Call',
      questions: {
        ntc_company:       { type: 'text', label: 'Business name' },
        ntc_site_or_ig:    { type: 'text', label: 'Website or Instagram' },
        ntc_decision_role: { type: 'choice', label: 'Who is involved in deciding on this?', options: DECISION_ROLE },
        ntc_trial_metro:   { type: 'choice', label: 'Which metro do you serve?',
          options: ['Los Angeles', 'Tampa', 'Elsewhere'] },
        ntc_trial_recurring: { type: 'choice', label: 'Do you offer recurring service plans (monthly or quarterly)?',
          options: ['Yes', 'No'] },
        ntc_trial_footage: { type: 'choice', label: 'How much footage do you have of your work?',
          options: ['10+ minutes of video or 20+ photos', 'Some', 'None'] },
        ntc_trial_ad_account: { type: 'choice', label: 'Do you have a Meta (Facebook and Instagram) ad account?',
          options: ['Yes, I have admin access', 'Not sure', 'No ad account'] },
        ntc_trial_funded:  { type: 'choice',
          label: 'The trial needs at least $500 of ad spend, paid by you directly to Meta. Are you ready to fund that test?',
          options: ["Yes, I'm ready to fund the test", 'Not ready to fund a test yet'] },
        ntc_trial_response: { type: 'choice', label: 'If a homeowner messages you today, who responds and how fast?',
          options: ['I do, within the hour', 'Office staff, same day', 'Whoever gets to it', 'Not sure'] }
      },
      steps: [
        ['ntc_company', 'ntc_site_or_ig', 'ntc_decision_role'],
        ['ntc_trial_metro', 'ntc_trial_recurring', 'ntc_trial_footage'],
        ['ntc_trial_ad_account', 'ntc_trial_funded', 'ntc_trial_response']
      ],
      disqualify: [{ key: 'ntc_trial_funded', values: ['Not ready to fund a test yet'] }],
      disqualifyTo: '/pest-control-trial?from=trial-unfunded',
      valueKey: ''
    },

    'signature': {
      label: 'Signature Project',
      calendar: 'Signature Project',
      questions: {
        ntc_company:        { type: 'text', label: 'Business or project name' },
        ntc_sig_discussing: { type: 'textarea', label: 'What are we discussing?' },
        ntc_sig_references: { type: 'textarea', label: 'References or links', optional: true },
        // VERIFY: the iClosed event may carry more fit check options.
        ntc_sig_fit:        { type: 'choice', label: 'Fit check',
          options: ['Yes, I have a specific project in mind', "No, I'm looking for ongoing content or ads"] },
        ntc_signature_budget: { type: 'choice', label: 'Budget',
          options: ['Under $10,000', '$10,000-$25,000', '$25,000-$50,000', '$50,000+', 'Not sure'] }
      },
      steps: [
        ['ntc_company', 'ntc_sig_discussing', 'ntc_sig_references'],
        ['ntc_sig_fit', 'ntc_signature_budget']
      ],
      disqualify: [],
      disqualifyTo: '',
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
