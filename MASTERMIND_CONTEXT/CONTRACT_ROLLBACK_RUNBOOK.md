# Contract-mode rollback runbook

How to put the coach back on the legacy path if the refereed one misbehaves.

Written 2026-08-12 during CI-6. **Read the timing section before you rely on
this in an incident** — the lever is not as fast as "flip one env var" suggests.

---

## The lever

`CONTRACT_CATEGORIES` (Vercel, **Production scope only**). Its value is the list
of classified categories served through the enforced verbalizer-4.0 path.

| value | behaviour |
|---|---|
| `position_analysis,game_review` | current production: refereed coach for everyone |
| *(empty)* | legacy path for everyone, byte-identical |

`CONTRACT_UIDS` is a second, independent arm (that user, every category). It is
empty in production. **Emptying `CONTRACT_CATEGORIES` alone is sufficient today**
— but check `CONTRACT_UIDS` too if it has been used since.

Precedence is a plain OR with no override direction — see the header comment in
[`servingGate.ts`](../src/lib/contract/servingGate.ts). This is exactly why
CI-6 did **not** add `CONTRACT_ROLLOUT_PCT`: a second gate would mean emptying
the category list is no longer sufficient, and the rehearsed rollback would
quietly stop being a rollback.

---

## Timing — the part that surprises people

**A rollback is NOT instant, and setting the env var by itself changes nothing.**
Two independent reasons, both of which must be satisfied:

1. **`getContractEnv()` memoizes for the life of the process**
   ([`src/env.ts:240`](../src/env.ts#L240) — `if (cachedContractEnv) return cachedContractEnv`).
   A warm serverless instance reads the value once and never looks again, so even
   an instance that somehow saw new env would keep serving the old decision until
   it cycles.
2. **Vercel applies environment changes at deploy time.** A running deployment
   keeps the env snapshot it was built with. This is why shipping the flag on
   2026-08-11 required merging an empty commit (PR #292) after setting the var.

So the real rollback is **env change + redeploy**, and the honest estimate is
**~4–6 minutes** (build ~5m), not seconds.

If you need to be faster than that, the fastest true kill switch is a **Vercel
instant rollback to the previous production deployment** from the dashboard,
which promotes an already-built deployment rather than building a new one.

---

## Steps

```bash
# 1. Empty the lever (Production scope)
npx vercel env rm CONTRACT_CATEGORIES production
# (or set it to an empty value — parseContractCategories treats "" as no categories)

# 2. Redeploy. Do this via git, never `vercel --prod` from a working directory
#    (see the deploy-from-git memory: that ships your local tree, not main).
git commit --allow-empty -m "chore: rollback — disable contract-mode serving"
git push origin main

# 3. Confirm the new build is live
curl -sL https://chessmasti.com/api/version   # sha must match origin/main, ref: "main"
```

## Verifying the rollback actually took effect

Do not trust the env panel. Confirm from behaviour:

1. **Run a real review** (a browser game review, or the live-fire probe pattern
   below). On the SSE `done` event:
   - flag ON: `metadata.contract` present, `metadata.pipeline.contractMode: true`
   - flag OFF: **no** `metadata.contract`, no `contractMode`
2. **No new enforced telemetry.** `referee_outcomes` should stop gaining rows
   with `branch = 'contract-enforced'`.
3. **Follow-ups degrade cleanly.** CI-6a's `compactContract` is written *only* on
   the enforced path, so it self-disables — legacy-served reviews leave it
   `undefined` and `/api/chat` renders no contract block. Nothing to unwind.

### Live-fire probe

The probe must match the real client's request shape — in particular
**`stream: true`**. Omitting it takes the blocking JSON path, which is slower,
is not what users hit, and can return a 504 that looks like an outage but isn't.
Use a `claude-verify%` uid so the row is excluded from the real-traffic headline
metric in `supabase-tracking/QUERIES.sql`.

---

## Cache behaviour

Contract-mode responses are cached under `c4.0|`-prefixed keys
(`generateContractCacheKey`); legacy 3.6 keys were deliberately left unbumped.
The two key spaces do not overlap, and that separation is unit-tested at every
`generateCacheKey` call site. So after a rollback the legacy path cannot read a
contract-generated response, and a warm cache is safe to leave in place.

---

## Status

**The code-level rollback is pinned by test**
(`contractRollbackDrill.test.ts` — flag-off output is byte-identical to legacy).

**The operational drill WAS EXECUTED in production on 2026-08-12** (founder-
authorised). It works. Measured timeline, UTC:

| time | step |
|---|---|
| 14:35:56 | `vercel env rm CONTRACT_CATEGORIES production` |
| 14:37:41 | probe: **still `contractMode: true`** — see below |
| 14:38:02 | empty commit pushed **directly to `main`** |
| 14:42:43 | rollback deploy live (**4m41s** from push) |
| 14:44:05 | legacy serve **verified**: no `contract` in `done`, `refereeMode` undefined, `fallbackReason: "game_review_realtime_stream"`, all routes 200 |
| 14:44:23 | env restored, value diffed byte-identical against the pre-drill pull |
| 14:53:53 | restore deploy live; `contractMode: true`, `refereeMode: full` confirmed |

**Rollback: 6m47s** from decision to legacy live, **8m09s** to verified.
**Restore: 9m30s.** **Total legacy exposure: 11m10s.**

Note the asymmetry — coming back took longer than going down, because the
rollback deploy had a warm build cache and the restore did not. Plan for the
return leg to be the slower one; the emergency direction is the fast one, which
is the right way round.

### The finding worth keeping

**Removing the env var alone changed nothing.** At 14:37:41 — 105 seconds after
the variable was deleted from Vercel — production still answered
`contractMode: true, contractArmedBy: "category"`. This had been reasoned from
code (`getContractEnv` memoises; Vercel snapshots env at build). It is now an
observed fact.

Operationally: someone who deletes the variable in a panic and then checks the
site will conclude they have rolled back **and they will be wrong**. The
redeploy is not optional.

### Two things the drill taught that the plan did not say

1. **`git push origin HEAD:main` works directly — there is no branch
   protection.** In an incident, skip the PR: a pull request adds ~11 minutes of
   CI before the deploy can even start. Direct push → live in **under 5
   minutes**.
2. **Read the value before you delete it.** `vercel env pull` returns
   `CONTRACT_CATEGORIES` in plaintext (it is Encrypted-at-rest but not marked
   Sensitive), so the exact restore string is recoverable. Do that pull FIRST
   and keep the file — restoring from memory is how a two-category lever comes
   back as one.

**End-to-end: 8 minutes from decision to verified-legacy.** Budget 10 for the
rollback, and another 10 for the return.
