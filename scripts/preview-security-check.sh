#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# Headless security checks against a deployed preview.
#
#   ./scripts/preview-security-check.sh
#
# READY TO RUN, NOT YET RUNNABLE. Preview deployments sit behind Vercel
# Deployment Protection, which answers every request with a 401 or an SSO
# redirect before any of this reaches a function. That protection is
# staying on, so this script needs a Protection Bypass for Automation
# token, which has not been generated.
#
# To enable later:
#   Vercel → Project → Settings → Deployment Protection
#     → Protection Bypass for Automation → Add Secret
#   then export the value as BYPASS below.
#
# Until then the browser walkthrough in docs/FUNNEL-AUTOMATION.md covers
# the same ground interactively.
#
# Env:
#   BASE          preview URL, no trailing slash
#   CRON_SECRET   the same value set in Vercel Preview
#   BYPASS        optional, x-vercel-protection-bypass token
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail

BASE="${BASE:-}"
CRON_SECRET="${CRON_SECRET:-}"
BYPASS="${BYPASS:-}"

if [ -z "$BASE" ]; then
  echo "Set BASE to the preview URL. Example:"
  echo "  BASE=https://new-terrain-creative-git-feat-lead-b-7351fd-jadoncalfitzpatrick.vercel.app \\"
  echo "  CRON_SECRET=... BYPASS=... $0"
  exit 2
fi

# The bypass header must ride on every request, including the ones whose
# whole point is arriving unauthenticated. It defeats Vercel's edge
# protection, not the application's own auth, and conflating the two
# would make a 401 from the platform look like a 401 from our code.
HDR=()
[ -n "$BYPASS" ] && HDR=(-H "x-vercel-protection-bypass: $BYPASS"
                         -H "x-vercel-set-bypass-cookie: false")

pass=0; fail=0
check () { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  \033[32m✓\033[0m %s · %s\n' "$1" "$3"; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %s · expected %s, got %s\n' "$1" "$2" "$3"; fail=$((fail+1))
  fi
}

code () { curl -s -o /tmp/ntc-sec-body -w '%{http_code}' "${HDR[@]}" "$@"; }

echo
echo "Target: $BASE"

echo
echo $'\033[1mRESERVED EVENT · schedule must stay unforgeable\033[0m'
c=$(code -X POST "$BASE/api/track" -H 'Content-Type: application/json' \
      -d '{"event_name":"schedule"}')
check "POST /api/track schedule is refused" 403 "$c"
grep -q 'reserved event' /tmp/ntc-sec-body \
  && { printf '  \033[32m✓\033[0m the refusal says why\n'; pass=$((pass+1)); } \
  || { printf '  \033[31m✗\033[0m the refusal gave no reason\n'; fail=$((fail+1)); }

# A permitted event still works, so the check above is proving the
# reservation rather than a blanket outage.
c=$(code -X POST "$BASE/api/track" -H 'Content-Type: application/json' \
      -d '{"event_name":"cta_click","session_id":"sec-check"}')
check "a permitted event still succeeds" 200 "$c"

echo
echo $'\033[1mBOOKING SYNC · must not be reachable by the public\033[0m'
c=$(code "$BASE/api/sync-bookings")
check "no credentials is rejected" 401 "$c"

c=$(code -H 'Authorization: Bearer definitely-not-the-secret' "$BASE/api/sync-bookings")
check "a wrong bearer is rejected" 401 "$c"

c=$(code -H 'x-cron-secret: definitely-not-the-secret' "$BASE/api/sync-bookings")
check "a wrong manual header is rejected" 401 "$c"

if grep -qiE 'secret|token|key|private' /tmp/ntc-sec-body; then
  printf '  \033[31m✗\033[0m the 401 body mentions a credential\n'; fail=$((fail+1))
else
  printf '  \033[32m✓\033[0m the 401 body leaks no detail\n'; pass=$((pass+1))
fi

if [ -n "$CRON_SECRET" ]; then
  echo
  echo $'\033[1mBOOKING SYNC · authenticated, and idempotent\033[0m'
  c=$(code -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/sync-bookings")
  check "the real secret is accepted" 200 "$c"
  first=$(cat /tmp/ntc-sec-body)
  echo "    run 1: $first"

  code -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/sync-bookings" >/dev/null
  echo "    run 2: $(cat /tmp/ntc-sec-body)"

  # The property that matters: a second run must add nothing.
  if grep -q '"newBookings":0' /tmp/ntc-sec-body; then
    printf '  \033[32m✓\033[0m re-running records no new booking\n'; pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m re-running was not a no-op · %s\n' "$(cat /tmp/ntc-sec-body)"
    fail=$((fail+1))
  fi

  if grep -qiE '"(access_token|private_key|apikey|authorization)"' /tmp/ntc-sec-body; then
    printf '  \033[31m✗\033[0m the sync response contains a credential\n'; fail=$((fail+1))
  else
    printf '  \033[32m✓\033[0m the sync response carries no credential\n'; pass=$((pass+1))
  fi
else
  echo
  echo "  ! CRON_SECRET not set locally · skipped the authenticated checks"
fi

echo
echo $'\033[1mMETHOD SURFACE\033[0m'
c=$(code -X DELETE "$BASE/api/sync-bookings")
check "DELETE is refused" 401 "$c"   # auth is checked first, by design
c=$(code -X GET "$BASE/api/strategy-call")
check "GET on a POST-only form endpoint is refused" 405 "$c"

echo
if [ "$fail" -eq 0 ]; then
  printf '\033[32mPASS\033[0m · %s checks, nothing public that should not be\n' "$pass"
  exit 0
fi
printf '\033[31mFAIL\033[0m · %s of %s checks failed\n' "$fail" "$((pass+fail))"
exit 1
