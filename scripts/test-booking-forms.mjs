/* GHL booking form contract.

   assets/booking-forms.js must say exactly what the shared contract
   (GHL booking contract v2, 21 Oct 2026, from the live iClosed audit) says: the same field keys, the
   same option labels to the character, the same disqualifiers. The agent,
   the Speed-to-Lead bot (lib/rules.js) and GHL read those words, so a
   "tidied" label is a silent break three systems away.

   The fixture below is a COPY of the contract's tables, typed in on
   purpose rather than imported. Change the contract first, then this
   fixture, then the module: a drift in only one of them fails here.

   Also guards the rollout: every provider flag ships as 'iclosed', so
   merging this changes nothing live. */
import { readFile } from 'node:fs/promises';

await import('../assets/booking-forms.js');
const FORMS = globalThis.NTCBookingForms;

let failures = 0;
function check(label, cond, detail = '') {
  console.log(`  ${cond ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail ? ` · ${detail}` : ''}`);
  if (!cond) failures++;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const DECISION = ["I'm the decision-maker",
  'I decide with a partner or team (they can join the call)',
  'Someone else makes the final decision'];

// key: [label, options|null, optional?]. null options = free text.
// Copied from the live iClosed audit (agent/docs/iclosed-audit.md, 21 Oct
// 2026), which contract v2 follows. Curly apostrophes and en dashes are
// the live characters.
const REVENUE = ['Under $1M', '$1M–$2M', '$2M–$5M', '$5M–$10M', '$10M+'];
const CONTRACT = {
  'brand-builder': {
    ntc_company: ['Your company, and what it does', null],
    ntc_location: ['Where is the business based?', ['Los Angeles', 'Elsewhere in California', 'Outside California']],
    ntc_site_or_ig: ['Your website or Instagram', null],
    ntc_selling_status: ['Is the business already selling?', ['Yes, with customers', 'Pre-launch']],
    ntc_on_camera: ['Are you willing to be on camera?', ['Yes', 'Nervous, but willing', 'No']],
    ntc_brand_goal: ['What should the brand do for the business?', null],
    ntc_annual_revenue: ["What is your business's annual revenue?", REVENUE, true],
    ntc_bb_investment: ['Brand Builder is an ongoing creative partnership: production, longform and paid media management. Ad spend is separate. What monthly investment are you planning for this?', ['Under $5K/month', '$5K to $10K/month', '$10K to $15K/month', '$15K+/month']],
    ntc_show_format: ['What kind of show do you picture?', ['Sit-down or podcast', 'Hands-on, behind the scenes (vlog style)', 'A mix of both', 'Not sure yet']]
  },
  'growth': {
    ntc_company: ['Business Name', null],
    ntc_site_or_ig: ['Business Website or Instagram', null],
    ntc_priority_90d: ['What do you need most to improve over the next 90 days?', ['Generate more qualified leads', 'Build a stronger, more consistent content presence', 'Improve an existing paid-ad campaign', 'Launch or promote a specific offer', 'A mix of the above']],
    ntc_running_ads: ['Are you currently running paid advertising?', ['Yes, actively', 'Not currently', 'We have in the past', 'Preparing to start']],
    ntc_start_timing: ['How soon would you like to start?', ['As soon as possible', 'Within 30 days', 'Within 1-3 months', 'Just researching for now']],
    ntc_annual_revenue: ["What is your business's annual revenue?", REVENUE, true],
    ntc_service_investment: ["Every retainer includes creative production and paid media management, with a three-month minimum commitment. Ad spend is separate. What monthly investment in New Terrain's services are you planning?", ['Under $5K', '$5K–$8K', '$8K–$12K', '$12K–$18K', '$18K+']],
    ntc_ad_budget: ['Separately, what monthly advertising budget can you fund, paid directly to the advertising platforms?', ['Under $1,500', '$1,500–$3,000', '$3,000–$5,000', '$5,000–$10,000', '$10,000+', 'Not sure yet']],
    ntc_decision_role: ['Who is involved in deciding on this?', DECISION]
  },
  'ad-sprint': {
    ntc_site_or_ig: ['Business Website or Instagram', null],
    ntc_sprint_package: ['Which Ad Sprint are you considering?', ['The Eight (8 ad creatives)', 'The Fifteen (15 ad creatives)', 'Not sure, help me choose']],
    ntc_sprint_promote: ['What are you trying to promote or sell?', null],
    ntc_sprint_goal: ['What’s the main goal of the campaign?', ['Generate Leads', 'Book Appointments', 'Sell a Product', 'Build Awareness']],
    ntc_location_text: ['Where is your business located?', null],
    ntc_sprint_launch: ['Do you have a launch date or deadline?', ['ASAP', 'Within 30 days', '1-3 months', 'Flexible / no fixed date']],
    ntc_sprint_budget: ['Ad Sprints are a one-time creative production engagement, paid in full upfront. Ad spend and ongoing campaign management are not included. What one-time production budget do you have for this project?', ['Under $3,000', '$3,000–$5,500', '$5,500–$8,000', '$8,000+']],
    ntc_notes: ['Anything you’d like us to review before the call?', null, true]
  },
  'pest-control-trial': {
    ntc_company: ['Business Name', null],
    ntc_site_or_ig: ['Business Website or Instagram', null],
    ntc_decision_role: ['Who is involved in deciding on this?', DECISION],
    ntc_trial_metro_text: ['Which metro do you serve?', null],
    ntc_trial_recurring: ['Do you offer recurring service plans (monthly or quarterly)?', ['Yes', 'No']],
    ntc_trial_footage: ['How much footage do you have of your work?', ['10+ minutes of video or 20+ photos', 'Some', 'None']],
    ntc_trial_ad_account: ['Do you have a Meta (Facebook and Instagram) ad account?', ['Yes, I have admin access', 'Not sure', 'No ad account']],
    ntc_trial_funded: ['The total spend required in the trial is $2,000. Are you able to fund the trial immediately?', ["Yes, I'm ready to fund the trial", 'Not ready to fund the trial yet']],
    ntc_trial_response: ['If a homeowner messages you today, who responds and how fast?', ['I do, within the hour', 'Office staff, same day', 'Whoever gets to it', 'Not sure']]
  },
  'signature': {
    ntc_company: ['Business / Project Name', null, true],
    ntc_sig_discussing: ['What are we discussing?', null],
    ntc_sig_references: ["Any references or links you'd like us to review?", null, true],
    ntc_sig_fit: ["Signature Work is bespoke production: commercials, brand films, documentaries, launch campaigns and podcast build-outs. Scoped and priced per project rather than sold as a package. Is that what you're looking for?", ['Yes, I have a specific project in mind', "I'm not sure yet, I'd like to talk it through", "No, I'm looking for ongoing content or ads"]],
    ntc_signature_budget: ["What is your company's budget for this piece?", ['Under $10,000', '$10,000-$25,000', '$25,000-$50,000', '$50,000+']]
  }
};

const DISQUALIFY = {
  'brand-builder': [['ntc_bb_investment', 'Under $5K/month'], ['ntc_annual_revenue', 'Under $1M'], ['ntc_annual_revenue', '$1M–$2M']],
  'growth': [['ntc_ad_budget', 'Under $1,500'], ['ntc_service_investment', 'Under $5K'],
             ['ntc_annual_revenue', 'Under $1M'], ['ntc_annual_revenue', '$1M–$2M']],
  'pest-control-trial': [['ntc_trial_funded', 'Not ready to fund the trial yet']],
  'signature': [['ntc_signature_budget', 'Under $10,000']],
  'ad-sprint': []
};
const DISQUALIFY_TO = {
  'brand-builder': '/next-step?from=bb-apply',
  'growth': '/next-step?from=growth',
  'signature': '/next-step?from=signature-project',
  'pest-control-trial': '/pest-control-trial?from=trial-unfunded'
};
const CALENDAR = {
  'reschedule': 'Rescheduled Call', 'follow-up': 'Quick Follow-Up', 'ad-sprint': 'Ad Sprint Call',
  'pest-control-trial': '5-Day Trial Call', 'growth': 'Growth Strategy Consultation',
  'signature': 'Signature Project', 'brand-builder': 'Brand Builder · Story Session'
};

console.log('\n\x1b[1mOFFERS AND CALENDARS\x1b[0m');
check('exactly the contract offers', same(Object.keys(FORMS.OFFERS).sort(), Object.keys(CALENDAR).sort()),
  Object.keys(FORMS.OFFERS).join(', '));
for (const [k, name] of Object.entries(CALENDAR)) {
  check(`${k} books the "${name}" calendar`, FORMS.OFFERS[k] && FORMS.OFFERS[k].calendar === name);
}
check('reschedule and follow-up ask nothing on the website',
  ['reschedule', 'follow-up'].every((k) => FORMS.OFFERS[k].direct && FORMS.OFFERS[k].steps.length === 0));

console.log('\n\x1b[1mQUESTIONS, WORD FOR WORD\x1b[0m');
for (const [offerKey, qs] of Object.entries(CONTRACT)) {
  const offer = FORMS.OFFERS[offerKey];
  check(`${offerKey}: the contract's keys and no others`,
    same(Object.keys(offer.questions).sort(), Object.keys(qs).sort()));
  let labelsOk = true; let optsOk = true; let reqOk = true; const drift = [];
  for (const [key, [label, options, optional]] of Object.entries(qs)) {
    const q = offer.questions[key] || {};
    if (q.label !== label) { labelsOk = false; drift.push(`${key} label`); }
    if (!!q.optional !== !!optional) { reqOk = false; drift.push(`${key} required`); }
    if (options ? !same(q.options, options) || q.type !== 'choice' : q.type === 'choice') {
      optsOk = false; drift.push(`${key} options`);
    }
  }
  check(`${offerKey}: labels match`, labelsOk, drift.filter((x) => /label/.test(x)).join(', '));
  check(`${offerKey}: options match, in order`, optsOk, drift.filter((x) => /options/.test(x)).join(', '));
  check(`${offerKey}: required flags match iClosed`, reqOk, drift.filter((x) => /required/.test(x)).join(', '));
  const stepped = offer.steps.flat();
  check(`${offerKey}: every question sits in exactly one step`,
    stepped.length === new Set(stepped).size && same(stepped.slice().sort(), Object.keys(qs).sort()));
}

console.log('\n\x1b[1mDISQUALIFIERS\x1b[0m');
for (const [offerKey, rules] of Object.entries(DISQUALIFY)) {
  const offer = FORMS.OFFERS[offerKey];
  const got = offer.disqualify.flatMap((r) => r.values.map((v) => [r.key, v]));
  check(`${offerKey}: ${rules.length ? rules.map((r) => r[1]).join(', ') : 'no disqualifier'}`, same(got, rules));
  for (const [key, value] of rules) {
    check(`  "${value}" is a real option of ${key}`, offer.questions[key].options.includes(value));
    check(`  and turns the booking away`, FORMS.disqualifiers(offerKey, { [key]: value }).length === 1);
  }
  check(`${offerKey}: redirect ${DISQUALIFY_TO[offerKey] || '(none)'}`,
    offer.disqualifyTo === (DISQUALIFY_TO[offerKey] || ''));
}
check('a strong Growth lead is not disqualified', FORMS.disqualifiers('growth', {
  ntc_service_investment: '$8K–$12K', ntc_annual_revenue: '$2M–$5M', ntc_ad_budget: '$3,000–$5,000'
}).length === 0);
check('annual revenue left blank is not a disqualifier (it is optional)',
  FORMS.disqualifiers('growth', { ntc_service_investment: '$8K–$12K', ntc_ad_budget: 'Not sure yet' }).length === 0);
check('the iClosed redirects are the ones /next-step knows', ['growth', 'brand-builder', 'signature']
  .every((k) => /^\/next-step\?from=(growth|bb-apply|signature-project)$/.test(FORMS.OFFERS[k].disqualifyTo)));

console.log('\n\x1b[1mOPPORTUNITY VALUE · LOW END OF THE BAND\x1b[0m');
for (const [label, want] of [['Under $5K', 0], ['$5K–$8K', 5000], ['$18K+', 18000], ['Not sure yet', 0],
  ['$5K to $10K/month', 5000], ['$15K+/month', 15000], ['$3,000–$5,500', 3000], ['$50,000+', 50000],
  ['Under $10,000', 0], ['', 0]]) {
  check(`${label || '(blank)'} -> ${want}`, FORMS.bandValue(label) === want, String(FORMS.bandValue(label)));
}
check('the trial carries no value', FORMS.opportunityValue('pest-control-trial', { ntc_trial_funded: "Yes, I'm ready to fund the trial" }) === 0);

console.log('\n\x1b[1mATTRIBUTION FIELDS\x1b[0m');
check('hidden fields map to the contract keys', same(Object.values(FORMS.ATTRIBUTION).sort(),
  ['ntc_fbc', 'ntc_fbclid', 'ntc_fbp', 'ntc_from', 'ntc_landing_page', 'ntc_session',
   'utm_campaign', 'utm_content', 'utm_medium', 'utm_source', 'utm_term']));
check('/sprint pkg=eight preselects The Eight',
  FORMS.OFFERS['ad-sprint'].prefill.pkg.map.eight === 'The Eight (8 ad creatives)');

console.log('\n\x1b[1mROLLOUT · MERGING CHANGES NOTHING LIVE\x1b[0m');
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const sc = await read('strategy-call.html');
const providers = [...sc.matchAll(/provider:\s*'([a-z]+)'/g)].map((m) => m[1]);
check('every strategy-call provider flag is iclosed', providers.length >= 8 && providers.every((p) => p === 'iclosed'),
  providers.join(','));
const growth = (sc.match(/var DEFAULT_SCHEDULER = \{[\s\S]*?provider:\s*'([a-z]+)'/) || [])[1];
const button = ((await read('assets/book-button.js')).match(/var PROVIDER = '([a-z]+)'/) || [])[1];
check('the floating button follows the Growth flag', growth && growth === button, `${growth} / ${button}`);
for (const page of ['reschedule.html', 'follow-up.html']) {
  check(`${page} defaults to iclosed`, /var PROVIDER = 'iclosed';/.test(await read(page)));
}
check('the iClosed widget is still mounted for the iclosed provider',
  /app\.iclosed\.io\/assets\/widget\.js/.test(sc) && /} else if \(slot && SCHEDULER\.ready\)/.test(sc));
const bb = await read('assets/book-button.js');
check('the Lift widget id is unchanged', /_H-7V8fHVTuw/.test(bb));

console.log('\n\x1b[1mHYGIENE\x1b[0m');
for (const p of ['assets/booking-forms.js', 'assets/booking-form.js', 'assets/book-button.js',
                 'api/book-intake.js', 'api/ghl-webhook.js', 'api/_ghl.js', 'api/_lead-card.js']) {
  const src = await read(p);
  check(`${p}: no em dashes`, !src.includes('\u2014'));
}
const form = await read('assets/booking-form.js');
check('the form renders text with textContent, never innerHTML', !/innerHTML|insertAdjacentHTML|outerHTML/.test(form));
check('step one is re-posted only when the details changed or no token came back',
  /if \(token && now === postedContact\)/.test(form) && /postedContact = token \? now : ''/.test(form));
check('lead-facing copy names neither founder', !/Jadon|Meghan/.test(form + bb));

console.log(`\n${failures === 0
  ? '\x1b[32mPASS\x1b[0m · the forms say what the contract says'
  : `\x1b[31mFAIL\x1b[0m · ${failures} check(s) failed`}`);
process.exit(failures ? 1 : 0);
