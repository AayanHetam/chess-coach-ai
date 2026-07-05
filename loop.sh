#!/usr/bin/env bash
# Objective-driven autonomous loop for Claude Code — v2 "ship mode".
#
# v1 built and PARKED branches for human review. v2 builds, and when the critique
# phase confirms every acceptance criterion, SHIPS unattended:
#   merge origin/main in -> ship gate (tsc+test+build) -> push -> PR -> CI green ->
#   merge to main -> wait for Vercel prod deploy (/api/version) -> prod smoke ->
#   green: done / red: revert main, record the failure, keep iterating (bounded).
#
# Division of labor is unchanged from v1: claude only edits/commits on its branch;
# THIS SCRIPT owns every remote-touching action deterministically.
# Quality comes from the acceptance criteria + the critique phase, NOT from running longer.
#
# Usage:
#   ./loop.sh                iterate on $OBJECTIVE_FILE (default OBJECTIVE.md), ship at exit
#   ./loop.sh --ship-only    skip iterations; ship the current branch now (infra dry-runs)
#
# Fleet coordination (set by scripts/loop/loops.sh):
#   LOOP_HOME  shared dir (queue/locks/reports) in the main checkout — enables the
#              global ship mutex + SHIP_HOLD circuit breaker across instances.
set -euo pipefail

# ---- config (env-overridable; queue runner sets most of these) ----
# rm -rf .next first: stale generated types from another branch's build must never gate a ship
ITER_GATE="${ITER_GATE:-rm -rf .next && npx tsc --noEmit && npm test}"
SHIP_GATE="${SHIP_GATE:-rm -rf .next && npx tsc --noEmit && npm test && SKIP_ENV_VALIDATION=true npm run build}"
MAX_ITERS="${MAX_ITERS:-40}"                  # hard ceiling on iterations
COST_BUDGET="${COST_BUDGET:-8.00}"            # USD product-API test budget (hard cap)
SPEND_CHECKPOINT="${SPEND_CHECKPOINT:-10.00}" # crossing this requires justification in the objective
STALL_LIMIT="${STALL_LIMIT:-4}"               # iterations with no progress before stopping
CLEAN_PASSES="${CLEAN_PASSES:-2}"             # consecutive clean critique passes required to ship
MODEL="${MODEL:-opus}"                        # per-objective override via frontmatter
BASE_URL="${BASE_URL:-https://www.chessmasti.com}"
REPO_SLUG="${REPO_SLUG:-AayanHetam/chess-coach-ai}"
OBJ="${OBJECTIVE_FILE:-OBJECTIVE.md}"
OBJ_SLUG="${OBJ_SLUG:-$(basename "$OBJ" .md | tr '[:upper:] _' '[:lower:]--')}"
LOOP_HOME="${LOOP_HOME:-}"                    # empty = single-instance mode, locks are no-ops
ITER_TIMEOUT="${ITER_TIMEOUT:-2400}"          # seconds before a hung claude iteration is killed
MAX_MERGE_ATTEMPTS="${MAX_MERGE_ATTEMPTS:-3}" # main-reconcile conflicts handed back to claude
MAX_REVERT_CYCLES="${MAX_REVERT_CYCLES:-2}"
CLAUDE_RETRY_SLEEP="${CLAUDE_RETRY_SLEEP:-300}" # wait-out for API/rate failures (no status.json written)
MAX_CLAUDE_FAILS="${MAX_CLAUDE_FAILS:-6}"       # consecutive claude failures before parking

SHIP_ONLY=false
[ "${1:-}" = "--ship-only" ] && SHIP_ONLY=true

# ---- preflight ----
command -v jq >/dev/null || { echo "jq required"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh not authenticated"; exit 1; }
# OBJECTIVE.md is runtime state placed by the queue runner, never part of the change
if [ "$SHIP_ONLY" = "false" ] && [ -n "$(git status --porcelain --ignore-submodules=all -- ':!OBJECTIVE.md')" ]; then
  echo "Working tree is dirty. Commit or stash before running the loop."
  git status --porcelain --ignore-submodules=all -- ':!OBJECTIVE.md'
  exit 1
fi
if [ ! -f "$OBJ" ] && [ "$SHIP_ONLY" = "false" ]; then
  echo "No $OBJ found. The queue runner (scripts/loop/loops.sh) provides one; or write it from OBJECTIVE.template.md."
  exit 1
fi

LOOP_DIR=".loop"
BACKLOG="$LOOP_DIR/backlog.md"
STATUS="$LOOP_DIR/status.json"
COST_LOG="$LOOP_DIR/cost.log"
REPORT="$LOOP_DIR/report.md"
mkdir -p "$LOOP_DIR"
[ -f "$BACKLOG" ] || printf '# Backlog (auto-managed by the loop)\n\n' > "$BACKLOG"
[ -f "$COST_LOG" ] || : > "$COST_LOG"

OVER10_OK=false
[ -f "$OBJ" ] && grep -qiE '^#?[[:space:]]*budget-over-10-justification:' "$OBJ" && OVER10_OK=true

cost_spent()  { awk '{s+=$1} END{printf "%.2f", s+0}' "$COST_LOG" 2>/dev/null || echo "0.00"; }
over_budget() { awk -v s="$(cost_spent)" -v b="$COST_BUDGET" 'BEGIN{exit !(s+0 >= b+0)}'; }
over_checkpoint() { awk -v s="$(cost_spent)" -v c="$SPEND_CHECKPOINT" 'BEGIN{exit !(s+0 >= c+0)}'; }
note_backlog() { printf '\n> loop-note (%s): %s\n' "$(date '+%H:%M')" "$1" >> "$BACKLOG"; }

# ---- fleet locks (no-ops when LOOP_HOME unset) ----
ship_lock()   { [ -n "$LOOP_HOME" ] || return 0; until mkdir "$LOOP_HOME/locks/ship.lock" 2>/dev/null; do sleep 30; done; }
ship_unlock() { [ -n "$LOOP_HOME" ] || return 0; rmdir "$LOOP_HOME/locks/ship.lock" 2>/dev/null || true; }
ship_held()   { [ -n "$LOOP_HOME" ] && [ -f "$LOOP_HOME/locks/SHIP_HOLD" ]; }
set_hold()    { [ -n "$LOOP_HOME" ] && { touch "$LOOP_HOME/locks/SHIP_HOLD"; echo "  CRITICAL: SHIP_HOLD set — no instance will merge until it is cleared."; } || true; }

MERGE_SHA=""
write_report() { # $1=outcome $2=detail
  {
    echo "# Loop report — $OBJ_SLUG"
    echo "- outcome: $1"
    echo "- detail: $2"
    echo "- iterations: ${iter:-0} / $MAX_ITERS"
    echo "- product-api spent: \$$(cost_spent) (budget \$$COST_BUDGET)"
    echo "- branch: $BRANCH"
    echo "- shipped sha: ${MERGE_SHA:-none}"
    echo "- revert cycles: ${revert_cycles:-0}"
    echo "- finished: $(date '+%Y-%m-%d %H:%M')"
  } > "$REPORT"
}

park() { # $1=reason — push branch + draft PR so nothing is ever lost; queue moves on
  git push -u origin "$BRANCH" >/dev/null 2>&1 || true
  gh pr create --repo "$REPO_SLUG" --base main --head "$BRANCH" --draft \
    --title "PARKED loop($OBJ_SLUG): $1" \
    --body "$(printf 'Parked by loop v2: %s\n\nBacklog tail:\n```\n%s\n```' "$1" "$(tail -30 "$BACKLOG" 2>/dev/null)")" \
    >/dev/null 2>&1 || true
  write_report parked "$1"
}

# ---- claude invocation with watchdog + transcript capture ----
run_claude() { # $1=prompt
  rm -f "$STATUS"
  claude -p --model "$MODEL" --output-format json --dangerously-skip-permissions "$1" \
    > "$LOOP_DIR/iter-${iter:-0}.result.json" 2>"$LOOP_DIR/iter-${iter:-0}.err" &
  local pid=$! t=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 15; t=$((t+15))
    if [ "$t" -ge "$ITER_TIMEOUT" ]; then
      echo "  iteration watchdog: killing hung claude after ${ITER_TIMEOUT}s"
      kill "$pid" 2>/dev/null || true
      note_backlog "iteration $iter was killed by the ${ITER_TIMEOUT}s watchdog — whatever it was doing did not finish; check for half-done work first."
      break
    fi
  done
  wait "$pid" 2>/dev/null || true
}

# ---- reconcile with main: merge (not rebase) — agent-resolvable, no history rewrite ----
reconcile_main() {
  git fetch origin main >/dev/null 2>&1
  git merge-base --is-ancestor origin/main HEAD 2>/dev/null && return 0
  if git merge --no-edit origin/main >/dev/null 2>&1; then return 0; fi
  git merge --abort 2>/dev/null || true
  return 1
}

# ---- the ship pipeline (holds the fleet-wide ship lock end to end) ----
ship() {
  ship_lock
  if ship_held; then ship_unlock; return 10; fi
  echo "  ship: reconciling $BRANCH with origin/main"
  if ! reconcile_main; then ship_unlock; return 2; fi
  echo "  ship: running ship gate"
  if ! bash -c "$SHIP_GATE"; then ship_unlock; return 3; fi
  git tag "backup/$OBJ_SLUG-preship-$(date +%s)" >/dev/null 2>&1 || true
  if ! git push -u origin "$BRANCH" >/dev/null 2>&1; then ship_unlock; return 5; fi
  echo "  ship: opening PR"
  local pr
  pr=$(gh pr list --repo "$REPO_SLUG" --head "$BRANCH" --state open --json number -q '.[0].number' 2>/dev/null || true)
  if [ -z "$pr" ]; then
    gh pr create --repo "$REPO_SLUG" --base main --head "$BRANCH" \
      --title "loop($OBJ_SLUG): autonomous ship" \
      --body "$(printf 'Autonomous ship by loop v2.\n\nSummary: %s\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)' "$(jq -r '.summary // "n/a"' "$STATUS" 2>/dev/null)")" \
      >/dev/null 2>&1 || true
    pr=$(gh pr list --repo "$REPO_SLUG" --head "$BRANCH" --state open --json number -q '.[0].number' 2>/dev/null || true)
  fi
  if [ -z "$pr" ]; then ship_unlock; return 5; fi
  # a reused PR may be a leftover park draft: flip it ready + retitle, else merge refuses it
  gh pr edit "$pr" --repo "$REPO_SLUG" --title "loop($OBJ_SLUG): autonomous ship" >/dev/null 2>&1 || true
  gh pr ready "$pr" --repo "$REPO_SLUG" >/dev/null 2>&1 || true
  echo "  ship: waiting for CI on PR #$pr"
  sleep 15
  if ! gh pr checks "$pr" --repo "$REPO_SLUG" --watch --fail-fast; then
    gh run list --repo "$REPO_SLUG" -b "$BRANCH" -L 1 --json databaseId -q '.[0].databaseId' 2>/dev/null \
      | xargs -I{} gh run view {} --repo "$REPO_SLUG" --log-failed 2>/dev/null | tail -50 >> "$BACKLOG" || true
    ship_unlock; return 4
  fi
  echo "  ship: merging PR #$pr"
  if ! gh pr merge "$pr" --repo "$REPO_SLUG" --merge; then ship_unlock; return 5; fi
  MERGE_SHA=$(gh pr view "$pr" --repo "$REPO_SLUG" --json mergeCommit -q '.mergeCommit.oid' 2>/dev/null || true)
  if [ -z "$MERGE_SHA" ]; then git fetch origin main >/dev/null 2>&1; MERGE_SHA=$(git rev-parse origin/main); fi
  echo "  ship: merged as $MERGE_SHA — waiting for prod + smoke"
  if ! bash scripts/loop/smoke-prod.sh "$MERGE_SHA" "$BASE_URL" 2>&1 | tee -a "$LOOP_DIR/ship.log"; then
    revert_main; ship_unlock; return 6
  fi
  ship_unlock
  return 0
}

revert_main() { # revert $MERGE_SHA on origin/main; verify the revert deploys; else SHIP_HOLD
  echo "  revert: reverting $MERGE_SHA on main"
  git fetch origin main >/dev/null 2>&1
  git checkout --detach origin/main >/dev/null 2>&1
  if ! git revert --no-edit -m 1 "$MERGE_SHA" >/dev/null 2>&1; then
    git revert --abort 2>/dev/null || true
    git revert --no-edit "$MERGE_SHA" >/dev/null 2>&1 || { set_hold; git checkout "$BRANCH" >/dev/null 2>&1; return; }
  fi
  git push origin HEAD:main
  local revert_sha; revert_sha=$(git rev-parse HEAD)
  git checkout "$BRANCH" >/dev/null 2>&1
  if ! bash scripts/loop/smoke-prod.sh "$revert_sha" "$BASE_URL"; then
    set_hold
    echo "  revert: WARNING — revert pushed but did not verify green; site needs eyes."
  else
    echo "  revert: prod restored at $revert_sha"
  fi
}

# ---- ship-only mode: ship the current branch as-is (infra bootstrap / dry-runs) ----
if [ "$SHIP_ONLY" = "true" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  iter=0; revert_cycles=0
  echo "ship-only mode on $BRANCH"
  set +e; ship; rc=$?; set -e
  case "$rc" in
    0) echo "SHIPPED $BRANCH as $MERGE_SHA (prod smoke green)."; write_report shipped "ship-only"; exit 0 ;;
    6) echo "Ship reverted: prod smoke red. See $LOOP_DIR/ship.log"; write_report reverted "ship-only smoke red"; exit 1 ;;
    *) echo "Ship blocked at stage rc=$rc (2=merge-conflict 3=gate 4=CI 5=push/PR/merge 10=SHIP_HOLD)"; write_report blocked "ship-only rc=$rc"; exit 1 ;;
  esac
fi

# ---- one branch per objective; iterations accumulate commits on it ----
# resume an existing objective branch (keep its commits); create only if absent
BRANCH="loop/obj-$OBJ_SLUG"
git checkout "$BRANCH" >/dev/null 2>&1 || git checkout -b "$BRANCH" >/dev/null 2>&1

iter=0; stall=0; clean_streak=0; merge_attempts=0; revert_cycles=0; claude_fails=0
last_head=$(git rev-parse HEAD)

while [ "$iter" -lt "$MAX_ITERS" ]; do
  iter=$((iter+1))
  echo "===== $OBJ_SLUG iter $iter | streak=$clean_streak/$CLEAN_PASSES | spent=\$$(cost_spent)/\$$COST_BUDGET ====="

  spend_rule="Product-API spend so far: \$$(cost_spent) of \$$COST_BUDGET."
  if over_budget; then
    spend_rule="$spend_rule BUDGET EXHAUSTED: make NO product-API calls; deterministic checks only."
  elif over_checkpoint && [ "$OVER10_OK" != "true" ]; then
    spend_rule="$spend_rule The \$$SPEND_CHECKPOINT checkpoint is crossed without an over-10 justification in the objective: make NO further product-API calls; finish on existing evidence or record the gap."
  fi

  run_claude "$(cat <<EOF
You are running one iteration of an autonomous objective loop. Read $OBJ (especially its Acceptance criteria) and $BACKLOG first.

Hard rules:
- Serve the objective in $OBJ. Stay strictly inside its in-scope boundary. Never touch the do-not-touch list.
- Do NOT push, merge to main, rebase, switch branches, or touch remote infrastructure. The harness ships for you
  after critique passes clean: gate (tsc+test+build) -> PR -> CI -> merge -> deploy to chessmasti.com -> prod smoke
  -> auto-revert if smoke fails. Only edit, build, test, and commit locally on this branch.
  Exception: if $BACKLOG contains a "MERGE CONFLICT" loop-note, run 'git merge origin/main', resolve every conflict
  cleanly in favor of correct behavior (never blind-accept either side), verify with the gate, and commit the merge.
- $spend_rule Spend discipline: deterministic checks (tsc/vitest/build) are free — prefer them; while iterating use
  tiny eval samples (2-3 fixtures); run a full eval suite at most once, right before you declare the criteria met.
  After ANY product-API call, append its USD cost as a bare number line to $COST_LOG.
- Pick exactly one phase this iteration:
  * RESEARCH (use when $BACKLOG has no real plan): investigate the codebase, write the ranked task tree into
    $BACKLOG as a checklist (todo/doing/done) derived from the acceptance criteria. Make NO code changes.
  * BUILD (use when open todos exist): implement the single highest-value todo. Make it clean, complete, and
    actually working, not a stub. Commit with a clear message. Check its box in $BACKLOG.
  * CRITIQUE (use when no open todos remain): become a harsh, skeptical reviewer. Go through every acceptance
    criterion in $OBJ and verify it against the REAL built behavior, not your intention. Anything unmet, broken,
    half-working, ugly, or inconsistent with the codebase becomes a new ranked todo in $BACKLOG with a concrete
    note. Make NO feature code this phase, only the gap list.
- A "## SHIP FAILURE" or "SHIPPED THEN REVERTED" note in $BACKLOG is always the highest-priority todo.
- If the acceptance criteria include prod-visible behavior, create/maintain .loop/objective-smoke.sh during BUILD:
  fast curl-based checks against \$BASE_URL (exported when it runs post-deploy), exit nonzero on failure, <60s total.
  It runs automatically after every deploy of this objective; it is your only post-deploy verification voice.
- There is no human in this pipeline. Nothing is "for review". If shipping this work would be UNSAFE without
  something only a human can supply (a prod env var, a dashboard action, a migration), set ship_ready:false and
  name it in ship_blockers — the work will be parked as a draft PR instead of shipped.
- Scope discipline (all phases): worthwhile work outside the current todo is appended to $BACKLOG as a ranked
  todo, never built now. Nothing is dropped, nothing extra is merged.
- If something failed, record why in $BACKLOG so the next iteration does not repeat it.
- Write $STATUS as JSON and nothing else there:
  {"phase":"research|build|critique","made_changes":true|false,"gate_ready":true|false,"needs_human":false,"gaps_found":true|false,"exit":true|false,"ship_ready":true|false,"ship_blockers":[],"summary":"<=20 words"}
  gaps_found (CRITIQUE only): true if you added any todo; false only if every acceptance criterion is genuinely met.
  exit: true only from a CRITIQUE phase where every acceptance criterion is met and you added nothing.
  ship_ready: true when nothing beyond this repo is required for the change to be safe in production.
EOF
)"

  # claude died without writing status (rate limit / API error / kill): wait it out
  # and retry — an errored invocation is NOT "no progress" and must not stall the loop
  if [ ! -s "$STATUS" ]; then
    claude_fails=$((claude_fails+1))
    echo "  claude wrote no status (fail $claude_fails/$MAX_CLAUDE_FAILS): $(tail -c 200 "$LOOP_DIR/iter-$iter.err" 2>/dev/null | tr '\n' ' ')"
    if [ "$claude_fails" -ge "$MAX_CLAUDE_FAILS" ]; then park "claude invocation failed $MAX_CLAUDE_FAILS times in a row (API/rate errors)"; exit 2; fi
    iter=$((iter-1))   # retry does not consume an iteration slot
    sleep "$CLAUDE_RETRY_SLEEP"
    continue
  fi
  claude_fails=0

  # NOTE: never use jq's // for boolean fields — `false // default` yields the
  # default, silently inverting claude's answer (cost us a 6-iteration critique loop).
  jbool() { jq -r ".$1 | if . == null then \"$2\" else tostring end" "$STATUS" 2>/dev/null || echo "$2"; }
  phase=$(jq -r '.phase // "build"'           "$STATUS" 2>/dev/null || echo build)
  made=$(jbool made_changes false)
  gaps_found=$(jbool gaps_found true)
  exit_sig=$(jbool exit false)
  ship_ready=$(jbool ship_ready true)
  ship_blockers=$(jq -r '(.ship_blockers // []) | join("; ")' "$STATUS" 2>/dev/null || echo "")
  echo "  phase=$phase made=$made gaps_found=$gaps_found exit=$exit_sig ship_ready=$ship_ready"

  # cheap per-iteration gate after builds: broken commits get flagged immediately
  if [ "$phase" = "build" ] && [ "$made" = "true" ]; then
    if ! bash -c "$ITER_GATE" >/dev/null 2>&1; then
      note_backlog "ITER GATE RED after iteration $iter (tsc or tests). Fix this before anything else."
      clean_streak=0
    fi
  fi

  if [ "$phase" = "critique" ]; then
    if [ "$gaps_found" = "false" ]; then clean_streak=$((clean_streak+1)); else clean_streak=0; fi
  else
    clean_streak=0
  fi

  head_now=$(git rev-parse HEAD)
  if [ "$head_now" = "$last_head" ] && [ "$made" = "false" ] && [ "$phase" != "critique" ]; then stall=$((stall+1)); else stall=0; last_head=$head_now; fi

  # ---- ship-at-exit ----
  if [ "$exit_sig" = "true" ] && [ "$clean_streak" -ge "$CLEAN_PASSES" ]; then
    if [ "$ship_ready" != "true" ]; then park "ship_blockers: ${ship_blockers:-unspecified}"; exit 2; fi
    set +e; ship; rc=$?; set -e
    case "$rc" in
      0) echo "SHIPPED $OBJ_SLUG as $MERGE_SHA (prod smoke green)."
         write_report shipped "prod verified at $BASE_URL"
         git checkout --detach origin/main >/dev/null 2>&1
         git branch -D "$BRANCH" >/dev/null 2>&1 || true
         git push origin --delete "$BRANCH" >/dev/null 2>&1 || true
         exit 0 ;;
      2) merge_attempts=$((merge_attempts+1)); clean_streak=0
         if [ "$merge_attempts" -ge "$MAX_MERGE_ATTEMPTS" ]; then park "merge conflicts with main persisted after $MAX_MERGE_ATTEMPTS attempts"; exit 2; fi
         note_backlog "MERGE CONFLICT: 'git merge origin/main' conflicts. Next BUILD iteration: perform the merge, resolve every conflict correctly, gate, commit." ;;
      3) clean_streak=0
         note_backlog "SHIP BLOCKED: ship gate red (tsc/test/build) after reconciling with main. Reproduce locally, fix root cause, re-verify." ;;
      4) clean_streak=0
         note_backlog "SHIP BLOCKED: GitHub CI red on the PR (failing-run tail appended above). Fix root cause." ;;
      5) clean_streak=0
         note_backlog "SHIP BLOCKED: push/PR/merge failed mechanically. Investigate with 'gh pr view $BRANCH --repo $REPO_SLUG'." ;;
      6) revert_cycles=$((revert_cycles+1)); clean_streak=0
         if [ "$revert_cycles" -ge "$MAX_REVERT_CYCLES" ]; then park "prod smoke red $MAX_REVERT_CYCLES times; main reverted each time"; exit 2; fi
         note_backlog "SHIPPED THEN REVERTED: prod smoke failed after deploy of $MERGE_SHA (main auto-reverted, see .loop/ship.log). Fix the prod-only failure; strengthen .loop/objective-smoke.sh to catch it before ship." ;;
      10) park "SHIP_HOLD is set fleet-wide (a prior revert failed to verify)"; exit 2 ;;
    esac
  fi

  if [ "$stall" -ge "$STALL_LIMIT" ]; then park "no progress in $STALL_LIMIT iterations"; exit 2; fi
  sleep 2
done

park "MAX_ITERS ($MAX_ITERS) reached without a shippable clean critique"
exit 2
