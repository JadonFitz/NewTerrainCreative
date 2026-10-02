#!/usr/bin/env python3
"""
Offer consistency check.

Greps every page for dollar figures and fails on any that is neither
declared in assets/offer.js nor derivable from it (prepay annual and
savings). Survey bands inside form option values are ignored: those
describe a client's spend, not our price.

PRICING IS WITHDRAWN FROM THE SITE (2 Oct 2026), so this now checks two
things. assets/offer.js must declare no price, because that file ships
to the browser. And a page may only show the figures that are left:
the client's own ad-spend minimum anywhere, and the Founding terms and
survey bands on the form pages that ask about them. Anything else that
looks like a price fails, which is the point.

Monthly deliverable counts came off the same day and are guarded the
same way: "N deliverables" may not appear on a page or in offer.js. The
Ad Sprint's 8 and 15 are "creatives", on purpose, and are not caught.

    python3 scripts/check-offer.py
"""
import re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
offer = (root / 'assets' / 'offer.js').read_text(encoding='utf-8')

# Declared prices
declared = {int(m) for m in re.findall(
    r'(?:monthly|price|Fee|Total|Monthly|AdSpend|AddOn|After)\s*:\s*(\d+)', offer)}

# Derived: prepay annual and savings for each tier
# Prepay derivations, only if the public file still declares the rule.
# Retainer rates moved to api/_rates.js when /grow stopped publishing a
# package table, so their absence here is expected and a page still
# showing them is a genuine finding rather than a checker bug.
m_charged = re.search(r'prepayMonthsCharged:\s*(\d+)', offer)
m_given   = re.search(r'prepayMonthsGiven:\s*(\d+)', offer)
if m_charged and m_given:
    charged, given = int(m_charged.group(1)), int(m_given.group(1))
    for monthly in [int(x) for x in re.findall(r'monthly:\s*(\d+)', offer)]:
        declared.add(monthly * charged)
        declared.add(monthly * (given - charged))

# Survey band boundaries: the applicant's spend, not our price
for key in ('adSpendBands', 'budgetBands', 'founding90DayBudgetBands',
            'projectBudgetBands'):
    bands = re.search(key + r':\s*\[([^\]]+)\]', offer)
    if bands:
        declared.update(int(x) for x in re.findall(r'\d+', bands.group(1)))

# ── figures that live in both public and server-side files ────────────
# Published prices are canonical in offer.js. _rates.js mirrors them for
# server-side quoting; both copies must agree.
mirror_fail = []
rates_path = root / 'api' / '_rates.js'
if rates_path.exists():
    rates = rates_path.read_text(encoding='utf-8')
    pub = re.search(r'continuationMonthly:\s*(\d+)', offer)
    blk = re.search(r'FOUNDING_CONTINUATION\s*=\s*\{(.*?)\}', rates, re.S)
    srv = re.search(r'monthly:\s*(\d+)', blk.group(1)) if blk else None
    if pub and srv and pub.group(1) != srv.group(1):
        mirror_fail.append(
            f'continuation mismatch: offer.js says ${pub.group(1)}, '
            f'api/_rates.js says ${srv.group(1)}')

# ── no price may be declared in the public file ───────────────────────
# Retainer rates, Sprint prices, add-on rates and the payroll comparison
# were deleted from offer.js on 2 Oct 2026. The tier mirror against
# api/_rates.js went with them: there is nothing public left to mirror.
# Founding terms are not on this list. They sit outside the rate card.
WITHDRAWN = [
    ('a retainer rate',          r"name:\s*'[^']+'\s*,\s*monthly:\s*\d"),
    ('a product price',          r'\bprice:\s*\d'),
    ('an add-on rate',           r'AddOn:\s*\d'),
    ('the payroll comparison',   r'\binHouse:\s*\{'),
    ('a capacity signal',        r'publicCapacitySignal'),
    ('a monthly deliverable count', r'\b\d+\s+deliverables\b'),
]
for label, pat in WITHDRAWN:
    if re.search(pat, offer):
        mirror_fail.append(
            f'assets/offer.js declares {label}, and pricing is withdrawn '
            f'from the site. That file ships to the browser.')

# ── the paid-offer allowlist also lives in two files ──────────────────
# assets/offer.js ships to the browser; api/_offer.js runs on the server
# and cannot import it without a build step. A slug resolving one way in
# the browser and another on the server would put two different offer
# names on the two halves of one conversion, and Meta would stop
# deduplicating it as a single event.
offer_path = root / 'api' / '_offer.js'
if offer_path.exists():
    def _map(text, key):
        # offer.js writes `paidOffers: {`, _offer.js writes `PAID_OFFERS = {`.
        # Accept either separator or this silently finds nothing and the
        # whole check passes by doing no work.
        m = re.search(key + r'\s*[:=]\s*\{(.*?)\}', text, re.S)
        return dict(re.findall(r"'([a-z-]+)'\s*:\s*'([a-z_]+)'", m.group(1))) if m else None
    pub_off = _map(offer, 'paidOffers')
    srv_off = _map(offer_path.read_text(encoding='utf-8'), 'PAID_OFFERS')
    if pub_off is not None and srv_off is not None and pub_off != srv_off:
        mirror_fail.append(
            f'paid-offer allowlist mismatch: offer.js has {pub_off}; '
            f'api/_offer.js has {srv_off}')

fmt = lambda n: f'{n:,}'
allowed = {fmt(n) for n in declared}

# Where a declared figure may appear. The ad-spend minimum is the
# client's own money and is stated wherever the qualification is. The
# rest are Founding terms and survey bands, which only the forms show.
m_spend = re.search(r'minMonthlyAdSpend:\s*(\d+)', offer)
anywhere = {fmt(int(m_spend.group(1)))} if m_spend else set()
FORM_PAGES = {'apply.html', 'project.html', 'strategy-call.html'}

print(f'Declared or derived from assets/offer.js:')
print('  ' + '  '.join('$' + a for a in sorted(allowed, key=lambda x: int(x.replace(',','')))))
print(f'Allowed outside the form pages: ' + '  '.join('$' + a for a in sorted(anywhere)))
print()

if mirror_fail:
    for problem in mirror_fail:
        print(f'  ✗ {problem}')
    print()

fail = []
for f in sorted(root.glob('*.html')):
    if f.name.startswith('755b'):
        continue
    text = f.read_text(encoding='utf-8')
    # Drop form option values and input placeholders. Both describe the
    # applicant's own money (their spend band, what a customer is worth to
    # them), never a price we charge, so they are not ours to declare.
    text = re.sub(r'value="\$[^"]*"', '', text)
    text = re.sub(r'placeholder="[^"]*"', '', text)
    found = set(re.findall(r'\$(\d{1,3}(?:,\d{3})+)', text))
    bad = sorted(found - (allowed if f.name in FORM_PAGES else anywhere))
    counts = sorted(set(re.findall(r'\b\d+\s+deliverables\b', text)))
    if counts:
        fail.append((f.name, counts))
        print(f'  ✗ {f.name:<16} monthly scope count: ' + ', '.join(counts))
    if bad:
        fail.append((f.name, bad))
        print(f'  ✗ {f.name:<16} undeclared: ' + ' '.join('$' + b for b in bad))
    elif found:
        print(f'  ✓ {f.name}')

print()
if mirror_fail:
    print('FAIL · the public offer file declares a withdrawn price, or')
    print('       disagrees with the internal rate card.')
    sys.exit(1)
if fail:
    print('FAIL · a page names a figure it may not show.')
    print('       Pricing is withdrawn from the site, so outside the form')
    print('       pages only the ad-spend minimum may appear, and no page')
    print('       may state a monthly deliverable count. To publish a')
    print('       price again, declare it in assets/offer.js first.')
    sys.exit(1)
print('PASS · no page publishes a price, and every figure left traces back to assets/offer.js')
