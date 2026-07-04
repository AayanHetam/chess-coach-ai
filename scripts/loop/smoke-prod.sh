#!/usr/bin/env bash
# Prod smoke for the autonomous ship loop.
#
# Usage: smoke-prod.sh <expected-sha> [base-url]
#
# 1. Polls <base-url>/api/version until the deployed sha matches <expected-sha>
#    (Vercel build ~3-6 min; we allow DEPLOY_TIMEOUT, default 15 min).
# 2. Runs the fixed smoke suite: key routes 200 + LLM provider health.
# 3. If .loop/objective-smoke.sh exists (objective-specific prod checks,
#    maintained by the loop during BUILD), runs it with BASE_URL exported.
#
# Exit 0 = commit is live and healthy. Exit 1 = deploy timeout or smoke red
# (caller reverts). All output is plain lines for the loop log.
set -uo pipefail

SHA="${1:?usage: smoke-prod.sh <expected-sha> [base-url]}"
BASE_URL="${2:-https://www.chessmasti.com}"
DEPLOY_TIMEOUT="${DEPLOY_TIMEOUT:-900}"
POLL_INTERVAL="${POLL_INTERVAL:-20}"

echo "smoke: waiting for $SHA on $BASE_URL (timeout ${DEPLOY_TIMEOUT}s)"
deadline=$(( $(date +%s) + DEPLOY_TIMEOUT ))
while true; do
  live_sha=$(curl -sf --max-time 10 "$BASE_URL/api/version" | jq -r '.sha // empty' 2>/dev/null || true)
  if [ "$live_sha" = "$SHA" ]; then
    echo "smoke: deploy live ($live_sha)"
    break
  fi
  # a newer deploy may have superseded ours; if our sha is an ancestor of what's
  # live, our commit IS deployed — accept it (needs git context + fresh origin/main)
  if [ -n "$live_sha" ] && [ "$live_sha" != "dev" ] && git rev-parse --git-dir >/dev/null 2>&1; then
    git fetch -q origin main 2>/dev/null || true
    if git merge-base --is-ancestor "$SHA" "$live_sha" 2>/dev/null; then
      echo "smoke: deploy superseded but $SHA is an ancestor of live $live_sha — accepted"
      break
    fi
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "smoke: FAIL deploy-timeout (live=$live_sha expected=$SHA)"
    exit 1
  fi
  sleep "$POLL_INTERVAL"
done

fail=0
check_route() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -L "$BASE_URL$path" || echo 000)
  if [ "$code" = "200" ]; then
    echo "smoke: ok  $path"
  else
    echo "smoke: FAIL $path -> $code"
    fail=1
  fi
}

check_route "/"
check_route "/play"
check_route "/puzzles"
check_route "/analysis"
check_route "/plan"

llm_ok=$(curl -sf --max-time 30 "$BASE_URL/api/health/llm" | jq -r '.ok // false' 2>/dev/null || echo false)
if [ "$llm_ok" = "true" ]; then
  echo "smoke: ok  /api/health/llm"
else
  echo "smoke: FAIL /api/health/llm (ok=$llm_ok)"
  fail=1
fi

if [ -f ".loop/objective-smoke.sh" ]; then
  echo "smoke: running objective-specific checks"
  if BASE_URL="$BASE_URL" bash .loop/objective-smoke.sh; then
    echo "smoke: ok  objective-smoke"
  else
    echo "smoke: FAIL objective-smoke"
    fail=1
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "smoke: GREEN"
else
  echo "smoke: RED"
fi
exit "$fail"
