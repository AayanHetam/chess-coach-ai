# Calibrated Hedging — making the ungroundable 80% trustworthy

**Status:** DRAFT for review (Aayan: chess/coaching; tech-lead: architecture). Plan-first per the Mastermind norm — no code shipped yet.
**Date:** 2026-06-12

## The problem

The Stage 9 grounding/validator work polices the **~20% of coaching prose that is engine-verifiable** (mate / material / tactic / move-obviousness). It does nothing for the **~80% that is strategic, positional, or pedagogical** — "your pieces lack coordination," "play on the kingside," "the bishop pair favors you." That prose can't be binary-checked against Stockfish, so today the model asserts it with whatever confidence it feels like — and **confident-but-wrong strategic claims erode trust exactly as fast as a wrong "mate in 5."**

The fix is NOT another grounding source. It's **calibration**: stop the coach from *sounding certain about things it cannot verify*. A hedged-but-reasonable strategic take ("one plan worth considering is…") costs nothing; a confidently-wrong one ("the winning plan is clearly…") costs a user.

## The core idea — one signal, two channels, same stream

The key design constraint (per Aayan): **don't build a parallel system — reuse the 20% grounding work as the hedging signal, and keep it flowing through the existing stream.**

We already compute `VoterConfidence` per claim class (HIGH / MED / LOW / NONE) in `compileVoterResult` — that's the 20% work. Calibrated hedging is just a **second consumer of that same confidence**:

```
                       voter confidence (HIGH/MED/LOW/NONE)   ← the 20% work, already computed
                          /                              \
   CHANNEL 1 (pre-stream)                                 CHANNEL 2 (post-stream)
   prompt-side priming:                                   enforcement validator:
   buildGroundingContext emits a                          overconfidence check fires when
   "confidence ladder" telling the                        certainty language appears on a
   model how strongly it may assert                       claim class at LOW/NONE confidence
   each claim class BEFORE it writes                      (modeled on userVisibility.ts)
```

Both channels already exist for the 20% — `groundingContext` is injected into the system prompt ([route.ts:613](../src/app/api/enhanced-analysis/route.ts#L613) / [:736](../src/app/api/enhanced-analysis/route.ts#L736)) and the validators run in `runValidationPipeline` + the streaming branches. We extend those, we don't add new plumbing. So the 20% work stays in the stream — it just drives the 80% too.

## Channel 1 — prompt-side confidence ladder (cheap, zero latency, biggest lever)

Extend `buildGroundingContext` (`src/lib/grounding/voter.ts`) to append a calibration block derived from the confidence it already computed. Today it emits per-source RULES ("positional claims at medium confidence"); generalize that into an explicit ladder:

```
CONFIDENCE LADDER (how strongly you may state each claim type for THIS position):
- Material/winning claims: <HIGH→"state plainly" | MED→"state with mild qualification" | LOW/NONE→"hedge: 'roughly balanced', avoid 'winning'/'decisive'">
- Positional plans:        <... per positional_plan confidence ...>
- Tactics:                 <governed by TACTICAL FACTS block above>
- Anything NOT listed above (strategy, plans, endgame technique you can't verify):
  state as a SUGGESTION, not a fact. Prefer "one idea is…", "you might consider…",
  "this tends to…" over "you must", "the only plan is", "this is winning".
```

This is the highest-leverage, lowest-cost move: it shapes the prose *before* generation (no added latency, no regeneration), and it covers the truly-ungroundable residual via the catch-all last line.

## Channel 2 — overconfidence validator (enforcement, modeled on userVisibility)

A new pure string-scan validator `validateOverconfidence` (sibling of `userVisibility.ts`, `costUsd = 0`), wired into the pipeline exactly like the other four Stage 9 validators (snapshot-gated, position-anchored scope — same gate the concept_explanation fix established). It fires when **certainty language appears on a claim class the voter rates LOW/NONE**.

Token taxonomy, grouped by the claim class they over-assert (so we check each against *its* confidence — precision-first):

| token group | example tokens | fires when |
|---|---|---|
| advantage-certainty | winning, decisive, crushing, completely winning, lost, losing | `material_win` AND `positional_plan` both ≤ LOW **and** `\|sfCp\| < 150` |
| forcedness-certainty | the only move, forced, must play, no choice, has to | `mate_in_n === NONE` and move isn't a sole legal recapture |
| plan-certainty | the winning plan, the correct plan, you must, definitely should | `positional_plan` ≤ LOW |

Severity `warn` (consistent with current label-only posture — nudges regeneration, doesn't hard-fail). One issue per matched token, with a context window, just like `userVisibility`.

**Precision is the whole game here** (this is the failure mode I flagged: a validator that "corrects" a *correct* confident statement is worse than one that misses). So every fire is gated on a *quantitative* low-confidence condition (the `sfCp`/confidence checks above), never on the token alone. "Winning" when `sfCp = +600` and `material_win = HIGH` must stay silent.

## Where it plugs into the stream

No new wiring — it rides the rails the 20% already uses:
- **Snapshot:** reuses the `VoterSnapshot` already built per move (`buildAsyncSnapshotForMove`) — adds no fetches. It needs `sfCp` + the four confidences, all already on the snapshot.
- **Pipeline:** one more validator in `runValidationPipeline` (`src/lib/mastermind/validators/index.ts`), gated by the same `snap && runPositionValidators` guard.
- **Streaming:** included in `runStreamingStage9Validators` for the log-only/telemetry pass, same as the others.
- **Prompt:** Channel 1 is just more text in `groundingContext`, already injected.

## Measurement (precision-first — do NOT repeat the build-before-measure mistake)

1. **Precision unit test FIRST:** a corpus of *correct* confident sentences on grounded positions (sfCp large + HIGH confidence) → assert the validator stays SILENT. This is the guardrail against the false-positive harm. Build this before the recall tests.
2. **Recall test:** over-confident sentences on near-equal / unverified positions → assert it fires.
3. **The 80% itself can't be engine-graded** → route quality measurement through **CMIP** (interns rate strategic prose + author ideal hedged versions). That's the standing eval + few-shot feeder for this slice.
4. Baseline to beat: the frozen `audit/findings/agent-a-eval/` (20% hallucination, Haiku, 5 fixtures) — expand it before claiming a number.

## Regeneration policy & confidence transparency (Q3 — RESOLVED by Aayan 2026-06-12)

Not label-only, and not free regeneration. The decision:

**1. Regenerate at most ONCE per position — hard stop.** A genuinely low-grounding position stays low-grounding no matter how many times the model rewrites; extra regens are "shots in the dark" that burn tokens without adding accuracy. So overconfidence triggers exactly one regeneration, then we accept whatever comes back. (Wire as: the overconfidence fire contributes at most 1 to `readMaxRetries`, and only that.)

**2. Regenerate ONLY on a *fixable* overclaim, never on inherent uncertainty.** The regen is worth it only when the model *overclaimed* (said "winning" on a balanced position) — a rewrite can hedge that. If the model already hedged appropriately, or the position is simply low-grounding, there is nothing to fix → no regen. This is why the validator must be **precision-gated** (§ above): a false flag here doesn't just annoy, it wastes a whole regeneration on an answer that was already good. Precision protects tokens *and* trust.

**3. Surface confidence to the user instead of hiding it — this is the trust feature.** Every position gets a **verification-confidence score** (aggregate of the voter's per-claim confidences + eval clarity), shown as a spectrum/indicator in the analysis UI, with a one-line disclaimer when it's low: *"the engines verify less of this position than usual — more of this read is judgment than hard fact."* Honesty about uncertainty **increases** trust, not decreases it.

**The false-flag guard (Aayan's second fear) — frame it as verification-type, not quality.** A brilliant strategic analysis on a quiet position would score "low" on a naive grounding metric — and slapping a scary "LOW CONFIDENCE" badge on it would *wrongly tell the user the analysis is weak*, the exact opposite of the goal. So the spectrum must measure **"how much of this is engine-verified vs expert judgment," NOT "how good this is."** Concretely, present it as two modes rather than a quality bar:
- strong grounding → "✓ Engine-verified" (tactics/eval/endgame confirmed)
- weak grounding → "Strategic read" / "judgment-based" — a *different kind* of analysis, not a worse one.

This makes a low score feel like *honesty about what's verifiable*, never like *"the coach isn't sure it's any good."* It also means we never flag a position as low-confidence merely because it's strategic — only the verification *coverage* drops, and we say so plainly.

## CH-1 split after adversarial review (2026-06-12)

The first CH-1 implementation put a *dynamic per-position* confidence ladder inside `buildGroundingContext`. An adversarial review caught that this:
- **under-claimed verified facts** (a Stockfish forced mate scored 'strategic_read' → the coach was told to hedge a forced mate, because `cp` is null during a mate and the score never saw the mate flag; a two-engine positional consensus capped at 'mixed');
- **contradicted itself** (header said "state plainly" while the body forbade "winning" on a decisive eval; an Lc0 RULE said assert-material while the ladder said hedge-material);
- **duplicated 10–13×** per game_review prompt, each copy keyed on the *before-mistake* eval (so it hedged an engine-measured blunder).

Resolution — split CH-1:
- **CH-1a (SHIPPED):** the static catch-all hedge — a single CONFIDENCE & HEDGING block in the system prompt (`coachChatPrompt.ts`, PROMPT_VERSION 3.2). Position-independent, once per turn, no contradiction/duplication. This is the actual 80% win.
- **CH-1b (DEFERRED):** the dynamic per-position calibration. Needs the score fixes (below, done) AND once-per-focused-position injection (reuse the focused snapshot, skip/genericize for game_review). Wire alongside CH-2, which needs the same focused snapshot.
- **Score foundation fixes (DONE in `positionConfidence.ts`):** forced mate (sfMate threaded) → engine_verified regardless of cp=null; `positional_plan` weight 0.6→0.72 so a two-engine HIGH reaches engine_verified; `score` jsdoc clarified as verification COVERAGE not advantage/quality; eval-driver threshold aligned to the level math (≥140cp); boundary tests pin 0.7 and 0.35.

## Phasing

- **PR-CH-1a (SHIPPED):** static hedge in the system prompt + verification-confidence score foundation. Watch CMIP + telemetry. Likely 80% of the value.
- **PR-CH-1b (deferred):** dynamic per-position calibration, wired once-per-focused-position (alongside CH-2).
- **PR-CH-2:** Channel 2 overconfidence validator (advantage-certainty group first — cleanest, reuses `sfCp`), **precision test gating the merge**. Single-regen wiring (max 1, fixable-overclaim only).
- **PR-CH-3 (the trust feature):** verification-confidence score + UI spectrum/indicator + low-grounding disclaimer, framed as engine-verified-vs-judgment (NOT a quality bar). Apply the design OS (glass/MUI, no Tailwind) per the UX norms. This is arguably the highest *perceived*-trust item even though it's last to build.
- **PR-CH-4:** forcedness + plan token groups, only if PR-CH-2 telemetry shows they clear the precision bar.

## Open questions

1. **Q1 (Aayan):** Is hedged prose on-brand? The product brief says keep the "masti"/fun tone — does "you might consider…" read as wishy-washy to a beginner, or as honest? (Tone vs trust tradeoff.)
2. **Q2 (Aayan):** advantage-certainty `|sfCp| < 150` threshold — right cutoff for "don't say winning"? (½ pawn? full pawn?)
3. ~~**Q3 (tech-lead):** Channel 2 severity — warn vs regenerate?~~ **RESOLVED** — single capped regen on fixable overclaim + user-facing confidence spectrum. See "Regeneration policy & confidence transparency" above.
4. **Q4:** Do we gate Channel 2 to flagship only (turn-1), or also the Haiku `/api/chat` follow-ups where most turns live?
5. **Q5:** forcedness-certainty needs "is this the only legal recapture?" detection to avoid false positives on genuine forced moves — worth the chess.js check, or drop that group for v1?
