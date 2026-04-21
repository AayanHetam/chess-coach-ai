# A/B Pilot: Concept-First Retrieval vs. Baselines

**Status:** Part A3 — design only, do not run yet. Trial executes after Part B ships and telemetry from Part C3 has accumulated ≥2 weeks of baseline data.
**Purpose:** falsifiable evidence that concept-first, structurally-reranked retrieval outperforms both the current theme/cosine blend and a concept-only baseline on real learning outcomes — not just offline recall metrics.

---

## Hypothesis

**H1 (primary):** Students in the concept + structural-rerank arm will solve held-out, same-concept probe puzzles at a higher rate 7 days after a miss than students in the theme-only (control) arm. Expected effect size: +8–15 percentage points absolute accuracy.

**H2 (secondary):** The concept + rerank arm will show *lower* time-to-solve on probes than concept-only, because the structural analogy reduces the "translation" cost from schema to concrete board.

**H0 (what failure looks like):** No significant difference across arms, or the control matches treatment. In that case, the concept taxonomy is either under-labeled, the embedding is not discriminating beyond surface, or near-transfer in chess is more robust than the literature predicts and retrieval quality isn't the bottleneck.

---

## Arms

Three arms, random assignment at user-registration time, sticky for the duration of the trial. Assignment persisted in Firestore `users/{uid}.retrievalArm`.

| Arm | Retrieval path | Notes |
|---|---|---|
| **A — Theme-only (control)** | Current `/api/similar-puzzles` with the 70% theme / 30% cosine blend *frozen at trial start*. | The status quo. |
| **B — Concept-only** | Part B4 Stage 1 filter only; no embedding rerank. Candidates ordered by `concept_confidence * rating_proximity`. | Isolates the value of the concept classifier. |
| **C — Concept + structural rerank (proposed)** | Full Part B4 pipeline: concept filter → 128-dim embedding cosine rerank → MMR diversity pass. | The system under test. |

Every arm serves the same number of reinforcement puzzles (5) after each qualifying miss. UI is identical across arms — no concept-label badge in the trial (honesty requirement from Part C2 is temporarily suspended inside the trial to avoid confounding treatment with UI change; re-enabled post-trial).

---

## Population and sizing

**Inclusion:**
- User has completed ≥3 coaching sessions before assignment.
- User's median puzzle-attempt Elo is in [1200, 2200] — the band where near-transfer is measurable (below, too noisy; above, ceiling effects on the 100K corpus).
- User opted in to analytics.

**Exclusion:** new users (<3 sessions), users on legacy accounts predating concept labeling, users whose miss volume is <3/week (insufficient exposure).

**Power calculation (two-proportion z-test, α=0.05, power=0.8):**
Baseline probe accuracy assumed at 0.45 (from the theme-only arm, conservative). To detect a +10-pp lift (0.45 → 0.55), n ≈ 388 per arm. Triple-arm → ~1,200 users total. With typical retention, recruit ~1,800 to land ~1,200 at week 7.

If active user base < 1,800 at trial-start, switch to a two-arm trial (A vs. C) and drop B; estimate B's contribution post-hoc via offline replay of Stage-1-only scoring on logged C-arm events.

---

## Probe mechanism (how we measure learning, not engagement)

The naive metric — "accuracy on the served reinforcement puzzles" — is **confounded by retrieval difficulty itself**. Arm A serves surface-similar puzzles that are easier to solve from memory; Arm C serves surface-varied puzzles that are harder in the moment but generalize better. Scoring the served puzzles would wrongly flatter A.

**Solution: held-out concept probes.**

1. At trial-start, for each concept in the taxonomy, set aside ~30 puzzles labeled with that concept that are **never served as reinforcement in any arm**. These are the probe pool.
2. When a user in any arm misses a puzzle with concept C, the system serves 5 reinforcement puzzles per that arm's policy.
3. **7 days later (±12 h)**, the user is served 2 probe puzzles drawn from C's held-out pool, interleaved naturally into their normal session (not labeled as a test).
4. Primary metric: proportion of probes solved on first attempt, per arm, per concept.

The probe pool is shared across arms (same held-out puzzles for the same concept), so probe difficulty is controlled.

---

## Metrics

**Primary:**
- Probe accuracy @ 7 days, aggregated per arm, per concept, and overall.

**Secondary:**
- Probe time-to-solve (median, per arm).
- Retention decay: probe accuracy at 1 day, 7 days, 30 days.
- Concept-transfer breadth: if a user missed concept C and solves a C probe, do they also improve on a *prerequisite-linked* concept C′ (per the `PREREQUISITE_OF` edges in B5)?

**Guardrail (stop the trial if these move wrong way):**
- Weekly active retention delta across arms ≤ 3 pp.
- Average session duration delta ≤ 15%.
- Self-reported frustration signal (session-end thumbs-down rate) delta ≤ 5 pp.

A treatment arm that improves learning but craters engagement is not shipped.

---

## Duration

- **Ramp:** 1 week at 10% traffic to validate pipeline correctness.
- **Main trial:** 6 weeks at full assignment. Long enough to accumulate probe events (each user should trigger ≥8 probes at moderate activity levels).
- **Holdout retention check:** continue probing a 10% holdout of Arm A users for 4 more weeks post-launch to monitor long-term behavior.

---

## Instrumentation requirements (must be live before trial)

From Part C3 telemetry, plus:

- `retrievalArm` field on every retrieval event.
- `probeEvent` events distinguishing probe attempts from normal puzzle attempts (flagged server-side; client is unaware).
- Probe scheduling daemon (Cloud Function or Vercel cron) that runs daily and queues probes for users whose 7-day window is due.
- Firestore index on `(userId, anchorConcept, missTimestamp)` to efficiently compute per-concept probe outcomes.

---

## Analysis plan (pre-registered)

1. Primary test: two-proportion z-test, Arm C vs. Arm A, probe accuracy aggregated across concepts. Bonferroni-correct if reporting per-concept breakdowns.
2. Secondary: Mann-Whitney on time-to-solve for C vs. B (non-normal distribution expected).
3. Mixed-effects logistic regression: `probe_solved ~ arm + concept + user_elo + (1 | user) + (1 | concept)` to disentangle arm effect from per-concept difficulty and per-user baseline.
4. **Decision rule:**
   - Arm C beats Arm A on primary, no guardrail breach → ship C, retire A.
   - Arm C beats Arm A only on a subset of concepts → investigate labeling quality for the losing concepts; consider shipping C for winners and keeping A for the rest until fixed.
   - Arm C ≈ Arm A → publish negative result, re-examine whether the embedding is actually learning beyond surface, reconsider labeling signal quality.

---

## Risks and mitigations

- **Contamination across arms** (users talking, shared devices): assignment at user-level, not session-level. Accept minor leakage.
- **Probe pool exhaustion for rare concepts** (e.g., underpromotion tactics): widen probe pool or collapse concept to its parent node in the taxonomy for analysis.
- **Concept classifier drift during trial**: freeze the classifier at trial-start. Any relabeling happens offline and rolls out after the trial concludes.
- **Novelty effect in Arm C**: 6-week duration is long enough that early novelty washes out; the 30-day retention check catches short-lived lifts.

---

## Out of scope for this trial (flagged for later)

- Interleaving across multiple weak concepts (cross-concept scheduling) — test separately once concept-level telemetry is mature.
- Spaced-repetition extension of SM-2 to puzzle concepts — independent change, independent test.
- Varying the size of the reinforcement batch (5 vs. 3 vs. 10) — future A/B.
