#!/usr/bin/env bash
# Queue coordinator for loop.sh v2 — runs N loop instances, each in its own git
# worktree, over the shared objective queue.
#
#   scripts/loop/loops.sh start [N]     spawn N instances (default 1), detached
#   scripts/loop/loops.sh run <id>      run one instance in the foreground (spawned by start)
#   scripts/loop/loops.sh status        one-line-per-objective queue status
#   scripts/loop/loops.sh stop          finish current objectives, claim no more
#
# Shared state (LOOP_HOME = <repo>/.loop, gitignored):
#   queue/OBJ-*.md   objectives (frontmatter: id/slug/model/max_iters/budget/base/gate)
#   active/instN/    claimed objective while an instance works it
#   done/ parked/    terminal states
#   reports/         per-objective reports + per-instance logs
#   locks/           ship.lock (fleet ship mutex), SHIP_HOLD (circuit breaker), STOP
set -euo pipefail

REPO="${REPO:-/Users/aayanhetamsaria/Downloads/Inspirit_project/chess-coach-ai}"
LOOP_HOME="$REPO/.loop"
WT_BASE="${WT_BASE:-/Users/aayanhetamsaria/Downloads/Inspirit_project/loop-worktrees}"
QUEUE_SPEND_CAP="${QUEUE_SPEND_CAP:-60.00}"

mkdir -p "$LOOP_HOME"/{queue,active,done,parked,reports,locks} "$WT_BASE"

hdr() { # $1=file $2=key $3=default — parse "key: value" from the frontmatter block
  local v; v=$(awk -v k="$2" 'NR>50{exit} $1==k":"{ $1=""; print; exit }' "$1" | tr -d ' ')
  echo "${v:-$3}"
}

global_spend() { # sum product-API spend recorded by finished + running objectives
  { cat "$LOOP_HOME"/reports/*-cost.log 2>/dev/null; cat "$WT_BASE"/inst*/.loop/cost.log 2>/dev/null; } \
    | awk '{s+=$1} END{printf "%.2f", s+0}'
}

claim() { # $1=instance-id — atomic via rename(2); loser silently tries the next file
  local f
  for f in $(ls "$LOOP_HOME/queue"/OBJ-*.md 2>/dev/null | sort); do
    mv "$f" "$LOOP_HOME/active/inst$1/" 2>/dev/null && { echo "$LOOP_HOME/active/inst$1/$(basename "$f")"; return 0; }
  done
  return 1
}

run_instance() {
  local i="$1" obj id slug model iters budget base gate rc wt last_infra=""
  mkdir -p "$LOOP_HOME/active/inst$i"
  while true; do
    [ -f "$LOOP_HOME/locks/STOP" ] && { echo "inst$i: STOP present — no more claims."; break; }
    if awk -v s="$(global_spend)" -v c="$QUEUE_SPEND_CAP" 'BEGIN{exit !(s+0 >= c+0)}'; then
      echo "inst$i: queue spend cap \$$QUEUE_SPEND_CAP reached (spent \$$(global_spend)) — no more claims."
      break
    fi
    obj=$(claim "$i") || { echo "inst$i: queue empty."; break; }
    id=$(hdr "$obj" id "OBJ-XX"); slug=$(hdr "$obj" slug "$(basename "$obj" .md)")
    model=$(hdr "$obj" model opus); iters=$(hdr "$obj" max_iters 40)
    budget=$(hdr "$obj" budget 8.00); base=$(hdr "$obj" base origin/main)
    echo "inst$i: claimed $id ($slug) — base=$base model=$model budget=\$$budget"

    wt="$WT_BASE/inst$i"
    # claim.lock: worktree add + branch ops mutate the shared .git — serialize them
    # across instances (a transient ref race here halted inst2 on 2026-07-04)
    until mkdir "$LOOP_HOME/locks/claim.lock" 2>/dev/null; do sleep 5; done
    git -C "$REPO" worktree remove --force "$wt" 2>/dev/null || true
    git -C "$REPO" fetch origin >/dev/null 2>&1
    git -C "$REPO" worktree add --detach "$wt" "$base" >/dev/null 2>&1

    # tooling: reuse the main checkout's node_modules (read-only during test/build);
    # objectives that touch package.json get their own install
    if [ ! -e "$wt/node_modules" ]; then ln -s "$REPO/node_modules" "$wt/node_modules"; fi
    for envf in .env.local .env; do
      [ -f "$REPO/$envf" ] && cp "$REPO/$envf" "$wt/$envf" || true
    done

    # strip frontmatter (--- ... ---) into the worktree's OBJECTIVE.md
    awk 'BEGIN{c=0} /^---[[:space:]]*$/{c++; next} c!=1{print}' "$obj" > "$wt/OBJECTIVE.md"
    mkdir -p "$wt/.loop"
    # re-claims resume with their prior backlog (progress notes survive worktree teardown)
    [ -f "$LOOP_HOME/reports/$id-backlog.md" ] && cp "$LOOP_HOME/reports/$id-backlog.md" "$wt/.loop/backlog.md" || true

    # stacked bases (base != origin/main) predate the loop infra on main: merge main
    # in up-front so the worktree carries loop tooling + latest prod code. On conflict,
    # seed the backlog — the loop's MERGE CONFLICT protocol has claude resolve it.
    if [ "$base" != "origin/main" ]; then
      if ! git -C "$wt" merge --no-edit origin/main >/dev/null 2>&1; then
        git -C "$wt" merge --abort 2>/dev/null || true
        printf '\n> loop-note (claim): MERGE CONFLICT: this branch conflicts with origin/main. First BUILD iteration: run git merge origin/main, resolve every conflict correctly (never blind-accept either side), gate, commit the merge.\n' \
          >> "$wt/.loop/backlog.md"
        echo "inst$i: $id base conflicts with main — seeded merge todo for the loop"
      fi
    fi

    # run a private COPY of loop.sh: infra edits to the main checkout must never
    # rewrite a script bash is currently executing
    cp "$REPO/loop.sh" "$wt/.loop/runner.sh"
    rmdir "$LOOP_HOME/locks/claim.lock" 2>/dev/null || true

    set +e
    ( cd "$wt" && env \
        OBJ_SLUG="$id-$slug" LOOP_HOME="$LOOP_HOME" MODEL="$model" MAX_ITERS="$iters" \
        COST_BUDGET="$budget" REPO_SLUG="AayanHetam/chess-coach-ai" \
        bash "$wt/.loop/runner.sh" ) >> "$LOOP_HOME/reports/inst$i.log" 2>&1
    rc=$?
    set -e

    cp "$wt/.loop/report.md"  "$LOOP_HOME/reports/$id-report.md" 2>/dev/null || true
    cp "$wt/.loop/backlog.md" "$LOOP_HOME/reports/$id-backlog.md" 2>/dev/null || true
    cp "$wt/.loop/cost.log"   "$LOOP_HOME/reports/$id-cost.log" 2>/dev/null || true
    tail -c 2000 "$wt"/.loop/iter-*.err > "$LOOP_HOME/reports/$id-errors.log" 2>/dev/null || true
    # rc contract: 0 = shipped, 2 = genuinely parked (loop ran and gave up).
    # Anything else is an INFRA failure — return the objective to the queue and
    # halt this instance so a broken harness can't burn the whole queue.
    case "$rc" in
      0) mv "$obj" "$LOOP_HOME/done/";   last_infra=""; echo "inst$i: $id SHIPPED — spend total \$$(global_spend)" ;;
      2) mv "$obj" "$LOOP_HOME/parked/"; last_infra=""; echo "inst$i: $id parked (see reports/$id-report.md) — spend total \$$(global_spend)" ;;
      *) mv "$obj" "$LOOP_HOME/queue/"
         git -C "$REPO" worktree remove --force "$wt" 2>/dev/null || true
         if [ "${last_infra:-}" = "$id" ]; then
           echo "inst$i: INFRA FAILURE on $id twice in a row (rc=$rc) — instance HALTED. Fix the harness, then restart."
           return 1
         fi
         last_infra="$id"
         echo "inst$i: infra failure on $id (rc=$rc) — returned to queue, retrying once after 30s."
         sleep 30
         continue ;;
    esac

    git -C "$REPO" worktree remove --force "$wt" 2>/dev/null || true
  done
  git -C "$REPO" worktree remove --force "$WT_BASE/inst$i" 2>/dev/null || true
}

case "${1:-start}" in
  run)  run_instance "${2:?instance id required}" ;;
  start)
    N="${2:-1}"
    rm -f "$LOOP_HOME/locks/STOP"
    for i in $(seq 1 "$N"); do
      nohup bash "$REPO/scripts/loop/loops.sh" run "$i" >> "$LOOP_HOME/reports/inst$i.log" 2>&1 &
      echo "spawned instance $i (pid $!) — log: $LOOP_HOME/reports/inst$i.log"
    done ;;
  status)
    echo "queue:  $(ls "$LOOP_HOME/queue" 2>/dev/null | tr '\n' ' ')"
    echo "active: $(ls "$LOOP_HOME"/active/inst*/ 2>/dev/null | grep -v ':' | tr '\n' ' ')"
    echo "done:   $(ls "$LOOP_HOME/done" 2>/dev/null | tr '\n' ' ')"
    echo "parked: $(ls "$LOOP_HOME/parked" 2>/dev/null | tr '\n' ' ')"
    echo "spend:  \$$(global_spend) / \$$QUEUE_SPEND_CAP"
    [ -f "$LOOP_HOME/locks/SHIP_HOLD" ] && echo "SHIP_HOLD IS SET — merges frozen" || true ;;
  stop) touch "$LOOP_HOME/locks/STOP"; echo "STOP set — instances finish their current objective then exit." ;;
  *) echo "usage: loops.sh start [N] | run <id> | status | stop"; exit 1 ;;
esac
