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
  7. Grants   · every new table grants service_role, none grant anon

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
import json as _json_mod
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
    # Captures the attributes too, so a type= that is not JavaScript can
    # be routed to the right parser: JSON-LD is data, and handing it to
    # node produces a syntax error on a perfectly valid block.
    blocks = re.findall(r'<script((?![^>]*\ssrc=)[^>]*)>(.*?)</script>', text, re.S)
    broken = []
    for i, (attrs, b) in enumerate(blocks):
        if not b.strip():
            continue
        if 'ld+json' in attrs or 'application/json' in attrs:
            try:
                _json_mod.loads(b)
            except Exception as e:
                broken.append(f'block {i + 1}: invalid JSON · {e}')
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
    'STRIPE_CHECKOUT_READ_KEY': '/welcome shows the booking link only for a paid checkout',
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

# Optional: absent is a supported state with a safe default, so it is
# reported but never warned about.
OPTIONAL = {
    'STRIPE_CHECKOUT_CREATE_KEY': 'without it /api/checkout sends buyers to the plain Payment Link',
}
for name, why in OPTIONAL.items():
    if resolve(name):
        ok(f'{name} present (optional)')
    else:
        print(f'  - {name} absent here (optional) · {why}')

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
listed = set()
if not vi.exists():
    bad('.vercelignore is missing. The repo root is the deployed directory, '
        'so docs/, scripts/ and supabase/ would be publicly reachable.')
else:
    listed = {l.strip().rstrip('/') for l in vi.read_text().splitlines()
              if l.strip() and not l.startswith('#')}
    # .claude/ and .impeccable/ hold the Claude design toolkit (skills,
    # hooks, tool state). Working files, never part of the public site.
    for d in ('docs', 'scripts', 'supabase', '.claude', '.impeccable', 'clients'):
        if (ROOT / d).exists():
            ok(f'{d}/ excluded from deploy') if d in listed \
                else bad(f'{d}/ exists but is NOT in .vercelignore, so it would ship')

# Working documents must not be reachable, whatever their extension.
# PRODUCT.md and DESIGN.md must sit in the root for the design skills to
# find them, so they are allowed there only while .vercelignore covers them.
for md in ROOT.glob('*.md'):
    if md.name == 'README.md':
        continue
    if md.name in listed:
        ok(f'{md.name} excluded from deploy')
    else:
        warn(f'{md.name} sits in the deployed root')

# ── no page may link a raw calendar ───────────────────────────────────
# iClosed owns qualification now, and its events ask their own questions,
# so a page linking to /strategy-call is fine. What is never fine is a
# link straight to the underlying Google Calendar: that skips iClosed
# entirely, so no questions are asked, no attribution is attached and no
# conversion fires. This guard exists because two homepage CTAs once did
# exactly that in production.
#
# /welcome is no exception: it is public, so it never carries the link.
# api/welcome.js hands the kickoff link out only for a paid checkout.
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
# Since the GHL migration the Lift tag is injected by assets/book-button.js,
# which shows our own button instead when the Growth provider is 'ghl'.
# Either string on a page means the floating launcher is there.
LIFT_MARKS = ('data-cta-widget', 'book-button.js')
NO_LIFT = ['apply.html', 'founding.html', 'project.html', 'strategy-call.html',
           'booked.html', 'call-booked.html', 'onboarding.html', 'welcome.html']
def _has_lift(text):
    return any(m in text for m in LIFT_MARKS)


wrong = [n for n in NO_LIFT
         if (ROOT / n).exists() and _has_lift((ROOT / n).read_text(encoding='utf-8'))]
carriers = sorted(f.stem for f in ROOT.glob('*.html')
                  if _has_lift(f.read_text(encoding='utf-8')))
bad('the booking widget is on page(s) that already ask for something: '
    + ', '.join(wrong)) if wrong     else ok('the booking widget is on ' + (', '.join('/' + c for c in carriers) or 'no page')
            + ', and nothing with a form')

# Booking embeds come from known hosts only. iClosed is still live and
# stays allowed until the migration finishes; GoHighLevel serves its
# calendar widget from api.leadconnectorhq.com and the frame resizer from
# link.msgsndr.com. Any other scheduler vendor showing up in a page or a
# page script is a booking path nobody qualified, tracked or carded.
BOOKING_HOSTS = {'app.iclosed.io', 'api.leadconnectorhq.com', 'link.msgsndr.com'}
_vendor = re.compile(r'https://([a-z0-9.-]*(?:iclosed|leadconnectorhq|msgsndr|gohighlevel|'
                     r'calendly|savvycal|cal\.com|acuityscheduling|hubspot\.com/meetings)[a-z0-9.-]*)', re.I)
_strays = {}
for f in list(ROOT.glob('*.html')) + list(ROOT.glob('assets/*.js')):
    for host in set(h.lower() for h in _vendor.findall(f.read_text(encoding='utf-8'))):
        if host not in BOOKING_HOSTS:
            _strays.setdefault(f.name, []).append(host)
bad('booking embed from an unlisted host: ' + '; '.join(
    f'{n}: {", ".join(sorted(h))}' for n, h in sorted(_strays.items()))) if _strays \
    else ok('booking embeds only from ' + ', '.join(sorted(BOOKING_HOSTS)))

# Every page a visitor can land on must carry the Meta pixel. /grow had
# ViewContent and CTAClick handlers written and firing into nothing for
# want of a base pixel, and the homepage reported no PageView at all,
# because the id was copy-pasted per page and two pages were missed.
# One id, checked everywhere, so a new page cannot ship untracked.
PIXEL = '1634935111618929'
NO_PIXEL_NEEDED = {'755b0bb56edaeb4dbe35c2cb512311c2', 'privacy', 'terms',
                   'onboarding'}

# The owner dashboard is the opposite case: it must NOT carry the pixel or
# the first-party tracker. Our own visits are not traffic, and a pixel
# there would put the owners into the ad account's audiences.
NO_PIXEL_NEEDED.add('owner')
_owner = ROOT / 'owner.html'
if _owner.exists():
    _t = _owner.read_text(encoding='utf-8')
    # Loaded scripts and pixel calls, not mentions: the page's own comment
    # names the tracker in order to say it is absent.
    tracked = [label for label, pat in (
        ('the Meta pixel', r'fbq\s*\(|connect\.facebook\.net'),
        ('assets/track.js', r'<script[^>]*track\.js'),
        ('Google tags', r'<script[^>]*googletagmanager'),
    ) if re.search(pat, _t)]
    bad('owner.html loads tracking: ' + ', '.join(tracked)) if tracked \
        else ok('/owner carries no pixel and no tracker')
    ok('/owner is noindexed') if re.search(r'<meta name="robots" content="noindex', _t) \
        else bad('owner.html is missing its noindex meta tag')
    # The service role key lives in api/ only. The page talks to /api/owner.
    bad('owner.html mentions Supabase directly') if re.search(r'supabase\.co|service_role', _t) \
        else ok('/owner reads through /api/owner, never Supabase')
untracked = sorted(f.name for f in ROOT.glob('*.html')
                   if f.stem not in NO_PIXEL_NEEDED
                   and PIXEL not in f.read_text(encoding='utf-8'))
bad('page(s) carry no Meta pixel: ' + ', '.join(untracked)) if untracked \
    else ok('every landing page carries the Meta pixel')

# And one id everywhere: a second id would split the dataset in two.
ids = set()
for f in ROOT.glob('*.html'):
    ids.update(re.findall(r"fbq\('init',\s*'(\d+)'\)", f.read_text(encoding='utf-8')))
bad('more than one pixel id in use: ' + ', '.join(sorted(ids))) if len(ids) > 1 \
    else ok(f'one pixel id across the site ({", ".join(ids) or "none"})')

# The Google tag is site-wide too, owner and the Twilio file aside, and
# loads gtag.js exactly once per page: a GA4 id is a second config line,
# not a second script.
GOOGLE_TAG = 'AW-18526060956'
NO_GOOGLE_TAG = {'owner', '755b0bb56edaeb4dbe35c2cb512311c2'}
gt_missing, gt_double = [], []
for f in sorted(ROOT.glob('*.html')):
    if f.stem in NO_GOOGLE_TAG:
        continue
    _t = f.read_text(encoding='utf-8')
    if f"gtag('config', '{GOOGLE_TAG}')" not in _t:
        gt_missing.append(f.name)
    if len(re.findall(r'<script[^>]*googletagmanager\.com/gtag/js', _t)) > 1:
        gt_double.append(f.name)
bad('page(s) carry no Google tag: ' + ', '.join(gt_missing)) if gt_missing \
    else ok(f'every public page carries the Google tag ({GOOGLE_TAG})')
bad('page(s) load gtag.js twice: ' + ', '.join(gt_double)) if gt_double \
    else ok('gtag.js loads once per page')

# Parked pages. Both still work and are deliberately unlinked, for the
# same reason: an iClosed event now asks what the form asked, and two
# forms back to back was a place to drop out of rather than a
# qualification step. /apply went first, /project followed when the
# Signature Project Consultation event went live. Linking either again
# is a real decision, so it should fail here first.
PARKED = ['apply', 'project']  # also used by the sitemap check below
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
# /next-step (was /production-inquiry) is reached only by the booking
# forms' disqualifier redirects in iClosed.
# /pest-control-trial is live (assets/offer.js trial.live) and in the
# sitemap, but no other page links it: it is offered to pest control
# only, so it stays on the link check and off the sitemap check.
UNLISTED = ['call-booked', 'owner', 'next-step', 'pest-control-trial']
IN_SITEMAP_OK = {'pest-control-trial'}
sitemap = ROOT / 'sitemap.xml'
if sitemap.exists():
    # Strip comments first. The sitemap documents which pages are left
    # out and why, so a naive substring search finds the very names the
    # file exists to exclude and fails on correct content.
    body = re.sub(r'<!--[\s\S]*?-->', '', sitemap.read_text(encoding='utf-8'))
    leaked = [u for u in UNLISTED + PARKED + ['strategy-call', 'booked']
              if u not in IN_SITEMAP_OK
              and (f'/{u}<' in body or f'/{u}/' in body)]
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

# /next-step takes leads a booking form turned away. A standard Meta
# event from there would feed them back into that campaign. Its one
# booking link is the Sprint call, tagged from=next-step so the booking
# fires a custom event instead of Schedule; any other booking link or a
# calendar embed is a mistake. Prices are check-offer.py's job.
_pi = ROOT / 'next-step.html'
if _pi.exists():
    _t = _pi.read_text(encoding='utf-8')
    _t_code = re.sub(r'<!--[\s\S]*?-->', '', _t)
    _hrefs = re.findall(r'href="([^"]*)"', _t_code)
    _booking = [h for h in _hrefs
                if re.search(r'iclosed|calendar\.app\.google|calendly|/strategy-call|/booked', h, re.I)
                and h != '/strategy-call?offer=ad-sprint&amp;from=next-step']
    problems = []
    if re.search(r"fbq\(\s*'track'\s*,\s*'(?!PageView')|"
                 r"track\(\s*'(Lead|Schedule|InitiateCheckout|Purchase|ViewContent)'", _t_code):
        problems.append('a standard Meta event')
    if _booking:
        problems.append('a booking link other than the tagged Sprint call: ' + ', '.join(_booking))
    if '/strategy-call?offer=ad-sprint&amp;from=next-step' not in _t_code:
        problems.append('no tagged Sprint call link')
    bad('next-step.html carries ' + ', '.join(problems)) if problems \
        else ok('/next-step fires no standard event and books only the tagged Sprint call')


# The 5-day trial must stay noindexed until assets/offer.js trial.live.
# Its button books a call that does not exist yet, so a search visitor
# would land on the wrong promise.
_trial = ROOT / 'pest-control-trial.html'
_off = (ROOT / 'assets' / 'offer.js').read_text(encoding='utf-8')
_trial_live = re.search(r'trial:\s*\{.*?\blive:\s*true', _off, re.S) is not None
if _trial.exists() and not _trial_live:
    _noindex = re.search(r'<meta name="robots" content="noindex', _trial.read_text(encoding='utf-8'))
    ok('/pest-control-trial is noindexed until trial.live') if _noindex \
        else bad('pest-control-trial.html lost its noindex while offer.js trial.live is false')


# Retired pages. A page we stopped publishing must be gone from the tree
# AND have a redirect, or an old ad lands on a 404. Checking both halves
# together is the point: either one alone is a silent failure.
import json as _json
_cfg = _json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
_redirects = {r['source']: r['destination'] for r in _cfg.get('redirects', [])}
RETIRED = {'/production-media': '/grow', '/growth-guide': '/grow',
           '/production-inquiry': '/next-step'}

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


# Agent proxies. /d/ (direction decks) and /b/ (the free breakdown) are
# served by the agent on Render through a rewrite. Each must sit before
# the catch-all, or the catch-all answers with the homepage, and each must
# be noindexed with no referrer, because its URLs carry private tokens.
AGENT = 'https://ntc-agent.onrender.com'
_rewrites = _cfg.get('rewrites', [])
_catch = next((i for i, r in enumerate(_rewrites) if r['source'].startswith('/((?!')), len(_rewrites))
_hdrs = {h['source']: {x['key']: x['value'] for x in h['headers']} for h in _cfg.get('headers', [])}
for prefix in ('d', 'b'):
    i = next((i for i, r in enumerate(_rewrites) if r['source'] == f'/{prefix}/:path*'), None)
    h = _hdrs.get(f'/{prefix}/(.*)', {})
    if i is None or _rewrites[i]['destination'] != f'{AGENT}/{prefix}/:path*':
        bad(f'/{prefix}/ is not rewritten to the agent')
    elif i > _catch:
        bad(f'/{prefix}/ rewrite sits after the catch-all, so it never matches')
    elif 'noindex' not in h.get('X-Robots-Tag', '') or h.get('Referrer-Policy') != 'no-referrer':
        bad(f'/{prefix}/ is missing its noindex or no-referrer header')
    else:
        ok(f'/{prefix}/ proxies to the agent, noindexed, no referrer')

# /breakdown renders model-written text. It must only ever do so as text.
_bd = [ROOT / 'breakdown.html', ROOT / 'assets' / 'breakdown.js']
if all(f.exists() for f in _bd):
    _src = ''.join(f.read_text(encoding='utf-8') for f in _bd)
    bad('/breakdown assigns HTML from a string (innerHTML and the like)') \
        if re.search(r'innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write', _src) \
        else ok('/breakdown renders model text with textContent only')
    # Its Sprint card links /next-step, which PR #35 creates by renaming
    # /production-inquiry. Until that lands the link is a known 404.
    if '/next-step' in _src and not (ROOT / 'next-step.html').exists():
        warn('/breakdown links /next-step, which does not exist yet (PR #35)')

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
    ('test-production-inquiry.mjs', 'production inquiry'),
    ('test-tracking.mjs', 'browser attribution'),
    ('test-track-api.mjs', 'first-party event ingestion'),
    ('test-owner.mjs', 'owner dashboard access'),
    ('test-iclosed-webhook.mjs', 'booking webhook'),
    ('test-booking-forms.mjs', 'GHL booking form contract'),
    ('test-book-intake.mjs', 'GHL booking intake'),
    ('test-ghl-webhook.mjs', 'GHL booking webhook'),
    ('test-meta-sync.mjs', 'Meta spend sync'),
    ('test-welcome.mjs', 'welcome booking link'),
    ('test-checkout.mjs', 'tracked checkout'),
    ('test-breakdown.mjs', 'free breakdown page'),
):
    r = subprocess.run(['node', str(ROOT / 'scripts' / test)],
                       capture_output=True, text=True)
    if r.returncode == 0:
        passed = r.stdout.count('\u2713')
        ok(f'{label} · {passed} checks passed')
    else:
        fails = [l.strip() for l in r.stdout.splitlines() if '\u2717' in l]
        bad(f'{test} failed\n      ' + '\n      '.join(fails))


# ── 7 · migration grants ──────────────────────────────────────────────
# From 30 Oct 2026 Supabase no longer grants Data API access to new
# tables in public. A table created without an explicit grant is
# unreachable through PostgREST, and the first sign is a production write
# failing. See supabase/migrations/README.md: service_role only, never anon.
head('7 · Migration grants')
# Created before the change, so they keep the grants they were born with.
PRE_GRANT_TABLES = {'leads', 'funnel_events', 'campaign_daily_metrics'}
_sql = ''
for f in sorted((ROOT / 'supabase' / 'migrations').glob('*.sql')):
    # Comments out first: the files explain grants in prose.
    _sql += re.sub(r'--[^\n]*', '', f.read_text(encoding='utf-8')) + '\n'
_created = set(re.findall(
    r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?', _sql, re.I))
_granted = set()
for tables, roles in re.findall(
        r'grant\s+[\w\s,]+?\s+on\s+(?:table\s+)?([\w.,\s"]+?)\s+to\s+([\w\s,]+?);', _sql, re.I):
    if 'service_role' in roles.lower():
        _granted.update(t.strip().strip('"').split('.')[-1]
                        for t in tables.split(','))
_missing = sorted(_created - _granted - PRE_GRANT_TABLES)
bad('table(s) with no service_role grant: ' + ', '.join(_missing)) if _missing \
    else ok(f'every new table grants service_role ({len(_created)} tables checked)')
_anon = re.findall(r'grant\s[^;]*?\bto\s[^;]*\b(?:anon|authenticated)\b[^;]*;', _sql, re.I)
bad('a migration grants to anon or authenticated: ' + _anon[0].strip()[:80]) if _anon \
    else ok('no migration grants anon or authenticated')


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
