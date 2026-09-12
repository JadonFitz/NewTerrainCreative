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
  6. Handler  · scripts/test-apply.mjs, both application steps end to end

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
    'APPLY_STEP_SECRET': 'signs the two-step application handoff (>=32 bytes)',
    'SUPABASE_URL': 'database, suffix-matched so a prefix is fine',
    'SUPABASE_SERVICE_ROLE_KEY': 'database, server only',
    'SENDGRID_API_KEY': 'application and enquiry email',
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
        if name == 'APPLY_STEP_SECRET':
            raw = os.environ.get(name, '')
            if len(raw.encode()) < 32:
                bad(f'{name} is set but under 32 bytes. apply.js will refuse to sign.')
                continue
        ok(f'{name} present')
    else:
        warn(f'{name} absent here · {why}')

if not resolve('APPLY_STEP_SECRET'):
    print('      Without it the application still works, but step two inserts')
    print('      a second row instead of patching step one. Generate with')
    print('      `openssl rand -hex 32`. See docs/ENVIRONMENT.md.')


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

# Unlisted pages must stay unlisted. There is no sitemap today; this fires
# the moment someone adds one and forgets.
UNLISTED = ['growth-guide']
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


# ── 6 · the handler itself ────────────────────────────────────────────
head('6 · Application handler')
r = subprocess.run(['node', str(ROOT / 'scripts' / 'test-apply.mjs')],
                   capture_output=True, text=True)
if r.returncode == 0:
    passed = r.stdout.count('\u2713')
    ok(f'both steps end to end · {passed} checks passed')
else:
    fails = [l.strip() for l in r.stdout.splitlines() if '\u2717' in l]
    bad('test-apply.mjs failed\n      ' + '\n      '.join(fails))


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
