#!/usr/bin/env bash
# Build (unless --no-build) and serve a production bundle on PORT, after
# stopping any stale next-server that would otherwise keep the port and answer
# with an old build. The last line compares the build id the served HTML
# references with .next/BUILD_ID; they must match or every browser check that
# follows is measuring the wrong build.
#
#   bash .claude/skills/partner-preview/scripts/local-prod.sh [port] [--no-build]
#
# Give the tool call a 10-minute timeout when building (about 5 minutes).
set -u
PORT="${1:-3123}"
BUILD=1
for arg in "$@"; do [ "$arg" = "--no-build" ] && BUILD=0; done
cd "$(git rev-parse --show-toplevel)" || exit 1

# `ss` is not installed in the remote environment and `pkill -f "next start"`
# matches the shell running it, so find the server by its process title and
# skip this shell's own pid.
for pid in $(ps -eo pid,args --no-headers | awk -v me=$$ '$1 != me && /next-server/ && !/awk/ {print $1}'); do
  kill "$pid" && echo "stopped stale next-server $pid"
done
sleep 1

export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-local-verify-only}"
if [ "$BUILD" = 1 ]; then
  rm -rf .next
  npx next build > /tmp/partner-preview-build.log 2>&1
  echo "build exit $? (log: /tmp/partner-preview-build.log)"
fi
[ -f .next/BUILD_ID ] || { echo "no .next/BUILD_ID: the build did not finish"; exit 1; }

LOG="/tmp/partner-preview-start-$PORT.log"
(nohup npx next start -p "$PORT" > "$LOG" 2>&1 &)
for _ in $(seq 1 40); do curl -sf -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done
if grep -q EADDRINUSE "$LOG"; then echo "port $PORT is still held by another server (see $LOG)"; exit 1; fi

MANIFEST=$(curl -s "http://127.0.0.1:$PORT/" | grep -o '_next/static/[^/]*/_buildManifest\.js' | head -1)
SERVED=$(echo "$MANIFEST" | cut -d/ -f3)
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/$MANIFEST")
echo "served build $SERVED (manifest $STATUS)   .next/BUILD_ID $(cat .next/BUILD_ID)"
if [ "$SERVED" = "$(cat .next/BUILD_ID)" ] && [ "$STATUS" = "200" ]; then
  echo "OK: http://127.0.0.1:$PORT serves the current build"
else
  echo "MISMATCH: a stale server is answering; stop it and rerun"
  exit 1
fi
