#!/usr/bin/env python3
"""
Predeployment verification.

    python3 scripts/preflight.py

Five checks, all local, none of which touch the network:

  1. Syntax   · node --check on every api/*.js and every inline page script
  2. Offer    · scripts/check-offer.py, the price drift detector
  3. Config   · required environment variables, by NAME only
  4. Routes   · every internal href resolves to a real page
  5. Deploy   · nothing private is missing from .vercelignore
  6. Handlers · both acquisition forms end to end

Exit status is non-zero if any check fails, so this is safe to gate on.

On check 3: this can only see the current shell, never Vercel's
environment. A clean run here is not proof production is configured.
Confirm with `vercel env ls`, which prints names and not values.
"""
import os
import re
import subprocess
import sys
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
FAILURES = []
WARNINGS = []


def head(title):
    print(f'\n\033[1m{title}\033[0m')


def ok(msg):
    print(f'  \033[32m✓\033[0m {msg}')


def bad(msg):
    print(f'  \033[31m✗\033[0m {msg}')
    FAILURES.append(msg)


def warn(msg):
    print(f'  \033[33m!\033[0m {msg}')
    WARNINGS.append(msg)


# ── 1 · syntax ────────────────────────────────────────────────────────
def node_check(path, source=None):
    """Run node --check. ESM needs a .mjs suffix for the module goal."""
    if source is None:
        return subprocess.run(['node', '--check', str(path)],
                              capture_output=True, text=True)
    suffix = '.mjs' if re.search(r'^\s*(import|export)\s', source, re.M) else '.js'
    with tempfile.NamedTemporaryFile('w', suffix=suffix, delete=False) as fh:
        fh.write(source)
        tmp = fh.name
    try:
        return subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    finally:
        os.unlink(tmp)


head('1 · Syntax')
for f in sorted(ROOT.glob('api/*.js')):
    r = node_check(f)
    ok(f'api/{f.name}') if r.returncode == 0 else bad(f'api/{f.name}\n{r.stderr.strip()}')

for f in sorted(ROOT.glob('assets/*.js')):
    r = node_check(f)
    ok(f'assets/{f.name}') if r.returncode == 0 else bad(f'assets/{f.name}\n{r.stderr.strip()}')

for f in sorted(ROOT.glob('*.html')):
    if f.name.startswith('755b'):
        continue
    text = f.read_text(encoding='utf-8')
    # Inline scripts only. A src= script is a file we already checked.
    blocks = re.findall(r'<script(?![^>]*\ssrc=)[^>]*>(.*?)</script>', text, re.S)
    broken = []
    for i, b in enumerate(blocks):
        if not b.strip():
            continue
        r = node_check(None, b)
        if r.returncode != 0:
            broken.append(f'block {i + 1}: {r.stderr.strip().splitlines()[-1]}')
    ok(f'{f.name} ({len(blocks)} inline scripts)') if not broken \
        else bad(f'{f.name}\n      ' + '\n      '.join(broken))


# ── 2 · offer drift ───────────────────────────────────────────────────
head('2 · Offer consistency')
r = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'check-offer.py')],
                   capture_output=True, text=True)
last = [l for l in r.stdout.strip().splitlines() if l.strip()][-1]
ok(last) if r.returncode == 0 else bad(r.stdout.strip() + r.stderr.strip())


# ── 3 · configuration ─────────────────────────────────────────────────
# Names only. This file must never print or compare a value.
REQUIRED = {
    'SUPABASE_URL': 'database, suffix-matched so a prefix is fine',
    'SUPABASE_SERVICE_ROLE_KEY': 'database, server only',
    'SENDGRID_API_KEY': 'the /apply second capture path, and project enquiries',
    'META_CAPI_TOKEN': 'server-side conversions',
}

head('3 · Configuration (this shell only, not Vercel)')


def resolve(name):
    """Match how api/_supabase.js resolves a possibly namespaced variable."""
    if os.environ.get(name):
        return True
    return any(k.endswith('_' + name) and not k.startswith('NEXT_PUBLIC_')
               for k in os.environ)


for name, why in REQUIRED.items():
    if resolve(name):
        ok(f'{name} present')
    else:
        warn(f'{name} absent here · {why}')

# ── 4 · routes ────────────────────────────────────────────────────────
head('4 · Internal links')
pages = {f.stem for f in ROOT.glob('*.html')}
known_external_paths = {'privacy', 'sitemap.xml', 'robots.txt'}
dead = {}

for f in sorted(ROOT.glob('*.html')):
    if f.name.startswith('755b'):
        continue
    text = f.read_text(encoding='utf-8')
    for href in set(re.findall(r'href="(/[^"#?]*)"', text)):
        target = href.strip('/')
        if not target or target in pages or target in known_external_paths:
            continue
        if (ROOT / target).exists():
            continue
        dead.setdefault(f.name, []).append(href)

    # A CTA that goes nowhere is worse than no CTA.
    for m in re.finditer(r'<a[^>]*\bdata-cta="([^"]*)"[^>]*>', text):
        tag = m.group(0)
        if 'href=' not in tag or re.search(r'href="\s*(#)?\s*"', tag):
            dead.setdefault(f.name, []).append(f'data-cta="{m.group(1)}" with no href')

if dead:
    for name, links in dead.items():
        bad(f'{name}: ' + ', '.join(links))
else:
    ok(f'every internal href resolves ({len(pages)} pages)')


# ── 5 · what ships ────────────────────────────────────────────────────
head('5 · Deployment surface')
vi = ROOT / '.vercelignore'
if not vi.exists():
    bad('.vercelignore is missing. The repo root is the deployed directory, '
        'so docs/, scripts/ and supabase/ would be publicly reachable.')
else:
    listed = {l.strip().rstrip('/') for l in vi.read_text().splitlines()
              if l.strip() and not l.startswith('#')}
    for d in ('docs', 'scripts', 'supabase'):
        if (ROOT / d).exists():
            ok(f'{d}/ excluded from deploy') if d in listed \
                else bad(f'{d}/ exists but is NOT in .vercelignore, so it would ship')

# Working documents must not be reachable, whatever their extension.
for md in ROOT.glob('*.md'):
    if md.name != 'README.md':
        warn(f'{md.name} sits in the deployed root')

# ── no page may link a raw calendar ───────────────────────────────────
# iClosed owns qualification now, and its events ask their own questions,
# so a page linking to /strategy-call is fine. What is never fine is a
# link straight to the underlying Google Calendar: that skips iClosed
# entirely, so no questions are asked, no attribution is attached and no
# conversion fires. This guard exists because two homepage CTAs once did
# exactly that in production.
CALENDAR = 'calendar.app.google'
MAY_LINK_CALENDAR = {'apply.html'}
leaks = [f.name for f in ROOT.glob('*.html')
         if f.name not in MAY_LINK_CALENDAR
         and CALENDAR in f.read_text(encoding='utf-8')]
bad('page(s) link straight to the scheduler, bypassing qualification: '
    + ', '.join(leaks)) if leaks \
    else ok('no page links a raw calendar, bypassing iClosed')

# The floating booking widget must not sit on a page that already asks
# for something. Two ways in at once is a worse page, /strategy-call
# would load the vendor script twice, and a booking widget on top of a
# submitted application or a confirmation is noise, not a CTA.
LIFT = 'data-cta-widget'
NO_LIFT = ['apply.html', 'founding.html', 'project.html', 'strategy-call.html',
           'booked.html', 'call-booked.html', 'onboarding.html', 'book.html']
wrong = [n for n in NO_LIFT
         if (ROOT / n).exists() and LIFT in (ROOT / n).read_text(encoding='utf-8')]
carriers = sorted(f.stem for f in ROOT.glob('*.html')
                  if LIFT in f.read_text(encoding='utf-8'))
bad('the booking widget is on page(s) that already ask for something: '
    + ', '.join(wrong)) if wrong     else ok('the booking widget is on ' + (', '.join('/' + c for c in carriers) or 'no page')
            + ', and nothing with a form')

# Parked pages. /apply still works and is deliberately unlinked: the
# Founding Three event in iClosed now asks the same questions, and two
# forms back to back was a place to drop out of. Linking it again is a
# real decision, so it should fail here first. See the note in apply.html.
PARKED = ['apply']
for page in PARKED:
    linkers = [f.name for f in ROOT.glob('*.html')
               if f.stem != page
               and (f'href="/{page}"' in f.read_text(encoding='utf-8')
                    or f'href="{page}.html"' in f.read_text(encoding='utf-8'))]
    bad(f'/{page} is parked but linked from ' + ', '.join(linkers)) if linkers \
        else ok(f'/{page} is parked and unlinked')

# Unlisted pages must stay unlisted. There is no sitemap today; this fires
# the moment someone adds one and forgets.
# /call-booked is reached only by an iClosed redirect after a booking, so
# nothing on the site should link it and nothing should index it.
UNLISTED = ['call-booked']
sitemap = ROOT / 'sitemap.xml'
if sitemap.exists():
    body = sitemap.read_text(encoding='utf-8')
    leaked = [u for u in UNLISTED if u in body]
    bad('sitemap.xml lists unlisted page(s): ' + ', '.join(leaked)) if leaked \
        else ok('sitemap.xml excludes every unlisted page')
else:
    ok('no sitemap.xml · nothing can leak an unlisted page yet')

# An unlisted page must not be linked from a public one, or it is listed.
for u in UNLISTED:
    linkers = [f.name for f in ROOT.glob('*.html')
               if f.stem != u and f'href="/{u}"' in f.read_text(encoding='utf-8')]
    bad(f'/{u} is linked from ' + ', '.join(linkers)) if linkers \
        else ok(f'/{u} is not linked from any public page')


# Retired pages. A page we stopped publishing must be gone from the tree
# AND have a redirect, or an old ad lands on a 404. Checking both halves
# together is the point: either one alone is a silent failure.
import json as _json
_cfg = _json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
_redirects = {r['source']: r['destination'] for r in _cfg.get('redirects', [])}
RETIRED = {'/production-media': '/grow', '/growth-guide': '/grow'}

for src, dest in RETIRED.items():
    stem = src.lstrip('/')
    if (ROOT / f'{stem}.html').exists():
        bad(f'{src} is retired but {stem}.html is still in the tree')
    elif _redirects.get(src) != dest:
        bad(f'{src} is gone with no redirect to {dest} in vercel.json')
    else:
        ok(f'{src} redirects to {dest}')

# Every redirect must land somewhere that exists, or it just moves the 404.
for src, dest in _redirects.items():
    target = dest.split('?')[0].lstrip('/') or 'index'
    if not (ROOT / f'{target}.html').exists():
        bad(f'redirect {src} points at {dest}, which is not a page')
ok(f'{len(_redirects)} redirect(s) resolve to real pages') if _redirects else None


# ── 5b · published claims must trace to canonical terms ───────────────
head('5b · Risk-reversal claims')
r = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'check-claims.py')],
                   capture_output=True, text=True)
if r.returncode == 0:
    ok(f"{r.stdout.count(chr(10)+'  ' + chr(10003))} claims trace to assets/offer.js")
else:
    bad('check-claims.py failed\n      ' +
        '\n      '.join(l.strip() for l in r.stdout.splitlines() if l.strip().startswith('✗')))


# ── 6 · the handler itself ────────────────────────────────────────────
head('6 · Acquisition handlers')
for test, label in (
    ('test-apply.mjs', 'Founding application'),
    ('test-strategy-call.mjs', 'strategy-call retirement'),
    ('test-project.mjs', 'Signature Work enquiry'),
    ('test-tracking.mjs', 'browser attribution'),
    ('test-track-api.mjs', 'first-party event ingestion'),
):
    r = subprocess.run(['node', str(ROOT / 'scripts' / test)],
                       capture_output=True, text=True)
    if r.returncode == 0:
        passed = r.stdout.count('\u2713')
        ok(f'{label} · {passed} checks passed')
    else:
        fails = [l.strip() for l in r.stdout.splitlines() if '\u2717' in l]
        bad(f'{test} failed\n      ' + '\n      '.join(fails))


# ── verdict ───────────────────────────────────────────────────────────
print()
if FAILURES:
    print(f'\033[31mFAIL\033[0m · {len(FAILURES)} problem(s) must be fixed before deploying.')
    sys.exit(1)
if WARNINGS:
    print(f'\033[33mPASS with {len(WARNINGS)} warning(s)\033[0m · '
          'absent variables are expected locally. Confirm with `vercel env ls`.')
    sys.exit(0)
print('\033[32mPASS\033[0m · syntax, offer, config, routes and deploy surface all clean.')
