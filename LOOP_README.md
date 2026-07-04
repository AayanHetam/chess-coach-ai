# Objective loop v2 — "ship mode"

A Claude Code loop that takes objectives from a queue, investigates, builds, tests, critiques —
and then **ships to production unattended**: gate (tsc + vitest + next build) → push → PR →
CI green → merge to main → Vercel deploy → prod smoke on chessmasti.com → **auto-revert if
smoke is red**. There are no human gates anywhere in the pipeline (owner mandate, 2026-07-04,
~0 live users). Claude never touches the remote; `loop.sh` (bash) owns every push/PR/merge/revert
deterministically.

## Run it

```bash
cd chess-coach-ai
# objectives live in .loop/queue/OBJ-NN-slug.md (see OBJECTIVE.template.md for the schema)
scripts/loop/loops.sh start 2     # spawn 2 instances, each in its own git worktree
scripts/loop/loops.sh status      # queue / active / done / parked / spend
scripts/loop/loops.sh stop        # finish current objectives, claim no more
```

Single objective, no queue: put it in `OBJECTIVE.md` and run `./loop.sh`.
Ship the current branch as-is (infra dry-runs): `./loop.sh --ship-only`.

## The pipeline (per objective)

1. Iterate RESEARCH → BUILD → CRITIQUE on one branch (`loop/obj-<id>-<slug>`) until every
   acceptance criterion passes and 2 consecutive critiques find nothing (v1 discipline, unchanged).
2. Reconcile with main by **merge** (agent-resolvable on conflict; never rebase, never force-push).
3. Ship gate: `tsc --noEmit && npm test && next build`.
4. Push → PR → `gh pr checks --watch` → `gh pr merge --merge` (always `--repo AayanHetam/chess-coach-ai`; this repo is a fork).
5. Poll `https://www.chessmasti.com/api/version` until the merge SHA is live (Vercel ~3-6 min).
6. `scripts/loop/smoke-prod.sh`: key routes 200 + `/api/health/llm` ok + the objective's own
   `.loop/objective-smoke.sh` if it wrote one.
7. Red smoke → `git revert` the merge on main → verify the revert deploys → the failure becomes
   the loop's top backlog item and it keeps iterating (max 2 revert cycles, then park).

Parked work (budget/iterations exhausted, unresolvable conflicts, ship blockers) is always
pushed + opened as a **draft PR** — nothing is ever stranded locally again.

## Fleet coordination (`.loop/` in the main checkout, gitignored)

- `queue/ active/ done/ parked/ reports/` — objective lifecycle; claims are atomic (`mv`).
- `locks/ship.lock` — fleet-wide ship mutex: one merge/deploy/smoke cycle at a time.
- `locks/SHIP_HOLD` — circuit breaker, set automatically when a revert fails to verify;
  all instances keep building but nothing merges until you delete the file.
- `locks/STOP` — graceful drain.

## Budgets ($ = product-API spend, not Claude Code's own cost)

Default **$8** per objective, tracked in each worktree's `.loop/cost.log`. **$10 is a hard
escalation line**: past it the loop stops spending unless the objective carries a
`budget-over-10-justification:` line. Queue-wide cap `QUEUE_SPEND_CAP` (default $60) stops
new claims. Spend cheap-first: deterministic checks free, tiny eval samples while iterating,
full suite once at ship time. Claude Code itself runs on the Max subscription.

## Concurrency

Default 2 instances (Apple M2 / 16 GB: two concurrent `next build`s fit; three swap).
Worktrees live in `../loop-worktrees/instN` and symlink the main checkout's `node_modules`.

## What it will not do

Build outside the objective's in-scope boundary; spend past its budget; force-push anything;
merge while SHIP_HOLD is set; or drop work (extra findings go to the backlog, parked work
becomes a draft PR).
