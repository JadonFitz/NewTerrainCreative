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
charged = int(re.search(r'prepayMonthsCharged:\s*(\d+)', offer).group(1))
given   = int(re.search(r'prepayMonthsGiven:\s*(\d+)', offer).group(1))
for monthly in [int(m) for m in re.findall(r'monthly:\s*(\d+)', offer)]:
    declared.add(monthly * charged)              # annual
    declared.add(monthly * (given - charged))    # saved

# Survey band boundaries: the applicant's spend, not our price
bands = re.search(r'adSpendBands:\s*\[([^\]]+)\]', offer)
if bands:
    declared.update(int(x) for x in re.findall(r'\d+', bands.group(1)))

fmt = lambda n: f'{n:,}'
allowed = {fmt(n) for n in declared}

print(f'Declared or derived from assets/offer.js:')
print('  ' + '  '.join('$' + a for a in sorted(allowed, key=lambda x: int(x.replace(',','')))))
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
if fail:
    print('FAIL · a page names a price the canonical file does not.')
    print('       Either the page is wrong, or assets/offer.js needs updating.')
    sys.exit(1)
print('PASS · every figure on every page traces back to assets/offer.js')
