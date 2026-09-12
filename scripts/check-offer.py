#!/usr/bin/env python3
"""
Offer consistency check.

Greps every page for dollar figures and fails on any that is neither
declared in assets/offer.js nor derivable from it (prepay annual and
savings). Survey bands inside form option values are ignored: those
describe a client's spend, not our price.

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
for key in ('adSpendBands', 'budgetBands'):
    bands = re.search(key + r':\s*\[([^\]]+)\]', offer)
    if bands:
        declared.update(int(x) for x in re.findall(r'\d+', bands.group(1)))

# ── the one figure that lives in two files ────────────────────────────
# The Founding Three continuation is a published term (application step
# two renders it) and an internal quoting figure (api/_rates.js). Both
# copies must agree or an applicant reads one number and gets quoted
# another.
mirror_fail = None
rates_path = root / 'api' / '_rates.js'
if rates_path.exists():
    rates = rates_path.read_text(encoding='utf-8')
    pub = re.search(r'continuationMonthly:\s*(\d+)', offer)
    blk = re.search(r'FOUNDING_CONTINUATION\s*=\s*\{(.*?)\}', rates, re.S)
    srv = re.search(r'monthly:\s*(\d+)', blk.group(1)) if blk else None
    if pub and srv and pub.group(1) != srv.group(1):
        mirror_fail = (pub.group(1), srv.group(1))

fmt = lambda n: f'{n:,}'
allowed = {fmt(n) for n in declared}

print(f'Declared or derived from assets/offer.js:')
print('  ' + '  '.join('$' + a for a in sorted(allowed, key=lambda x: int(x.replace(',','')))))
print()

if mirror_fail:
    print(f'  ✗ continuation mismatch: offer.js says ${mirror_fail[0]}, '
          f'api/_rates.js says ${mirror_fail[1]}')
    print()

fail = []
for f in sorted(root.glob('*.html')):
    if f.name.startswith('755b'):
        continue
    text = f.read_text(encoding='utf-8')
    # Drop form option values: those are the client's spend bands, not ours
    text = re.sub(r'value="\$[^"]*"', '', text)
    found = set(re.findall(r'\$(\d{1,3}(?:,\d{3})+)', text))
    bad = sorted(found - allowed)
    if bad:
        fail.append((f.name, bad))
        print(f'  ✗ {f.name:<16} undeclared: ' + ' '.join('$' + b for b in bad))
    elif found:
        print(f'  ✓ {f.name}')

print()
if mirror_fail:
    print('FAIL · the Founding Three continuation disagrees between the')
    print('       published term and the internal rate card.')
    sys.exit(1)
if fail:
    print('FAIL · a page names a figure assets/offer.js does not declare.')
    print('       Either the page publishes something it should not, or the')
    print('       canonical file needs updating. Internal retainer rates now')
    print('       live in api/_rates.js and must not appear on a public page.')
    sys.exit(1)
print('PASS · every figure on every page traces back to assets/offer.js')
