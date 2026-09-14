#!/usr/bin/env python3
"""
Risk-reversal claim check.

    python3 scripts/check-claims.py

Every risk-reversal statement published on /founding and /sprint must
trace to a term in assets/offer.js, and the withdrawn guarantee must
appear on no page at all.

This exists because that guarantee survived its own withdrawal in six
places across four files, including a meta description and above-the-fold
microcopy. Prose drifts from terms quietly; this makes it fail loudly.
"""
import io, re, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
offer = (root / 'assets' / 'offer.js').read_text(encoding='utf-8')


def live(path):
    """Rendered text only: no comments, scripts or styles."""
    h = (root / path).read_text(encoding='utf-8')
    h = re.sub(r'<!--.*?-->|<script.*?</script>|<style.*?</style>', '', h, flags=re.S)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', h))


def term(pattern):
    m = re.search(pattern, offer)
    return m.group(1) if m else None


FND, SPR = live('founding.html'), live('sprint.html')
fails = []


def check(label, cond, why):
    print(f"  {'✓' if cond else '✗'} {label}")
    if not cond:
        fails.append(f'{label}  ({why})')


print('\nFounding · risk reversal is the waived fee and optional continuation')
check('service fee waived month one',
      'service fee is waived' in FND or 'no service fee' in FND,
      'monthOneServiceFee must be 0 and the page must say so')
check('bounded, stated as not unlimited', 'not unlimited production' in FND,
      "monthOneExcludes bans unlimited revisions")
check('months two and three optional',
      'optional' in FND and 'Nothing rolls over on its own' in FND,
      'continuationRequired is false')
check('continuation PRICE not published here',
      '3,500' not in FND,
      "continuationDisclosedAt is 'application step 2', not this page")
check('client funds own ad spend',
      'own ad account' in FND or 'pay the platform directly' in FND,
      'spend is client funded and never held by us')
check('acceptance not guaranteed', 'does not guarantee acceptance' in FND,
      'foundingRiskReversal.acceptanceGuaranteed is false')
check('no result guaranteed',
      'no particular result is guaranteed' in FND or 'no result is guaranteed' in FND,
      'foundingRiskReversal.resultGuaranteed is false')
check('nothing added on top', 'not adding a performance guarantee' in FND,
      'no further promise, refund or remedy may be offered')

print('\nSprint · risk reduction is scope, price, no retainer, ownership')
check('fixed scope named', 'Eight creatives or fifteen' in SPR,
      'must match adSprintEight/adSprintFifteen creatives')
check('fixed price', 'One time, fixed' in SPR, 'adSprintTerms.fixedPrice')
check('no retainer', 'no retainer attached' in SPR, 'adSprintTerms.noRetainer')
check('client owns the assets', 'footage and every cut are yours' in SPR,
      'adSprintTerms.clientOwnsAssets')
check('campaign management excluded',
      'Campaign management is not part of the Sprint' in SPR,
      'adSprintTerms.campaignManagementIncluded is false')
check('no result guaranteed', 'no result is guaranteed' in SPR,
      'adSprintTerms.resultGuaranteed is false')
check('nothing added on top',
      'not offering a performance guarantee, a free reshoot or a refund' in SPR,
      'no further promise, refund or remedy may be offered')

print('\nWithdrawn guarantee must appear on no page')
BANNED = ['next shoot day is free', 'beats your baseline',
          'outperforms your current content', 'until we get you a creative']
for phrase in BANNED:
    hits = [p.name for p in root.glob('*.html')
            if phrase in p.read_text(encoding='utf-8').lower()]
    check(f'"{phrase}"', not hits, f'found in {hits}')

# The canonical terms these checks read must themselves still exist.
print('\nCanonical terms are present to check against')
for name, pat in [('adSprintTerms', r'adSprintTerms:\s*\{'),
                  ('foundingRiskReversal', r'foundingRiskReversal:\s*\{'),
                  ('continuationRequired false', r'continuationRequired:\s*false'),
                  ('monthOneServiceFee 0', r'monthOneServiceFee:\s*0')]:
    check(name, re.search(pat, offer) is not None, 'missing from assets/offer.js')

print()
if fails:
    print(f'FAIL · {len(fails)} claim(s) do not trace to canonical terms:')
    for f in fails:
        print('       ' + f)
    sys.exit(1)
print('PASS · every published risk statement traces to assets/offer.js')
