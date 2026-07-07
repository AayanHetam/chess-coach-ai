# Contract Inversion — CoachContract, Verbalizer, and Output Referee

**Status:** DESIGN FOR REVIEW (chess/coaching questions → Aayan; architecture/scope/cost → tech-lead). Plan-first per standing Mastermind discipline; no code until sign-off.
**Date:** 2026-07-06
**Companions:** [docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md](../docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md) (§2.1, §5.4, §5.7), [docs/COACH_ACCURACY_FIX_PLAN.md](../docs/COACH_ACCURACY_FIX_PLAN.md) (PR-A..G, all shipped #209–#215), `POSITION_FACT_GROUNDING_PLAN.md`, `PR_GROUNDING_FIXES_PLAN.md`.
**One sentence:** Invert the flagship path from "prose with engine hints, checked in logs" to "LLM verbalizes a typed fact contract, and a mechanical referee blocks anything the contract can't back" — shipped shadow-first, per-category, with byte-equality gates and one-flag rollback at every phase.

---

## 1. Why

The audit's causal story (§3, five sentences) ends with: *the system streams first and asks questions later.* PR-A..G fixed the truth sources, armed post-stream correction, and resurrected measurement — but the **direction of authority is still wrong**. Evidence:

- **`buildGameContext` already computes ~90% of a fact contract and throws it away** ([route.ts:479-923](../src/app/api/enhanced-analysis/route.ts)): evals/PVs/branch points (:600-780), `detectMotifs` + `compileVoterResult` (:727-737), `buildRelationalFacts` (:799-891), threat trees / teaching spine / concepts (:869-914) — all flattened into a prose blob the moment they're born. The structured objects exist for exactly one stack frame.
- **The referee that exists is anchored wrong.** Stage-9 scanners + relationalClaim validate against a *single last-move snapshot*, so on multi-insight `game_review` prose they can only run warn-only ([streamingStage9.ts:3-14](../src/lib/mastermind/validators/streamingStage9.ts) header admits it). Per-insight anchoring — each card checked against its own `fenBefore`/`fenAfter` — is the unlock, and it requires the contract.
- **Competitor research (audit §5.4/§5.7) proves both halves are needed.** Take Take Take is the best-architected competitor: Stockfish + Maia + detectors → a typed JSON data contract → LLM verbalizes only the contract (triple-confirmed: AI Engineer Europe talk, ability.ai writeup, independent teardown). **And it still ships confident position-fact hallucinations** — "a rook on d3 cut the defense from a bishop on b3" (not how bishops move), phantom diagonal-blunting, a material blunder softened to "incredibly risky." The teardown's verdict ("no connection to what the words actually mean") is our §3 failure class inside the market-leading contract architecture. Lesson: **the contract (facts in) is necessary; the output referee (facts checked on the way out) is the missing half nobody ships.** That referee is our differentiation, and PR-B already built its correction machinery.
- **The measurement void is now closable at the artifact level.** PR-E gave us runnable harnesses; the contract gives every claim a fact ID, converting "is this review accurate?" from open-ended NL judging into string checks — and *first-generation referee pass rate* becomes the standing accuracy KPI the product has never had (audit §3.7).
- **What this is not:** training (§4 — fine-tuning neither exists nor would fix this), a rewrite (it's a re-plumbing of authority over code that already ships), or a client migration (wire format unchanged through GA).

Two free wins ride along regardless of everything else: the CHESS INTELLIGENCE LAYER currently **awaits chessdb/Maia serially per top-3 mistake inside a for-loop** (route.ts:849-855) and **re-fetches positions the TOP MISTAKES block already fetched** — one `Promise.all` in the contract builder removes 2–6s of hidden latency and up to 3 redundant round-trips.

---

## 2. Target architecture — the CoachContract

One typed, versioned object; **three projections of one object** so prompt, referee, and follow-up context can never drift:

- `serializeForVerbalizer(contract)` — canonical sorted-key JSON, the flagship user turn
- `refereeInsight(prose, contract.insights[i])` — per-insight ground truth
- `renderContractCompact(contract, {currentFen?})` — the `/api/chat` follow-up context

```typescript
// src/lib/contract/types.ts (NEW) — every field names its existing producer
import type { AnyMotif } from "@/lib/tactics/types";
import type { RelationalFactsBlock } from "@/lib/relational/relationalFactsBuilder";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { VoterConfidence, ConfidenceLevel } from "@/lib/grounding/voter";
import type { PositionConfidence } from "@/lib/grounding/positionConfidence";

export const CONTRACT_VERSION = "1.0" as const;

// ── Provenance: four-level confidence, honestly labeled ────────────────────
export type FactSource =
  | "chessjs_oracle" | "stockfish_client" | "motif_detector"
  | "chessdb" | "lc0" | "maia" | "syzygy" | "voter_derived";
export type FactConfidence =
  | "oracle_verified"    // chess.js derivation, Syzygy ≤7 men — mathematically exact
  | "engine_verified"    // SF/chessdb/Lc0 numeric output, depth recorded
  | "heuristic"          // motif detector (escapability = 1-ply SEE — NEVER labeled oracle), Maia probs
  | "client_reported";   // gameEval numbers, PGN headers, self-reported rating — unverified input
export interface Provenance { source: FactSource; confidence: FactConfidence; depth?: number; fetchedAtMs?: number }

// ── Degraded<T>: unavailability is a first-class, referee-visible state ────
// The structural fix for the six-week positionalClaim/Lc0 silent-null false-fire
// class (audit #11) and the Maia no-op (#15). Never a silent null again: an
// unavailable source mechanically generates renderer DO-NOT-CLAIM rules and
// referee forbidden-claim classes.
export type ClaimClass =
  | "tactical_motif" | "material_win" | "mate_in_n" | "positional_plan"
  | "endgame_wdl" | "user_visibility" | "relational" | "eval_numeric" | "hypothetical_line";
export type Degraded<T> =
  | ({ status: "ok" } & { value: T; provenance: Provenance })
  | { status: "unavailable";
      reason: "service_unconfigured" | "service_error" | "timeout" | "out_of_range" | "not_applicable";
      claimClassesForbidden: ClaimClass[] };  // lc0 down ⇒ ["positional_plan"] capped at SF band; syzygy >7 men ⇒ ["endgame_wdl"]

// ── Evals: display string precomputed; mate NEVER flattened to ±9999 here ──
export interface EvalFact {
  cp: number | null; mate: number | null;   // signed, white-centric (parseResults normalization)
  depth: number; sentinel: boolean;          // PR-A {unavailable} case flagged, not forged
  display: string;                           // "+1.38" | "M+5" | "engine data unavailable" —
  provenance: Provenance;                    //   verbalizer copies verbatim, referee string-matches
}
export interface LineFact { id: string /* "M3.pv0" */; san: string[]; eval: EvalFact; isPlayedLine: boolean }

export interface InsightContract {
  factIdPrefix: string;                      // "M3" — cite tokens [F:M3.pv0], [F:M3.rel2], [F:M3.motif0]…
  ply: number; moveNumber: number; color: "w" | "b";
  playedSan: string; bestSan: string | null;
  classification: "blunder" | "mistake" | "inaccuracy" | "miss" | "great" | "brilliant" | "best";
  severityDropPawns: number;                 // route.ts mistake loop, post PR-A sentinel/sortLines fixes
  fenBefore: string; fenAfter: string;       // getFenAtHalfMove — THE referee anchor pair
  evalBefore: EvalFact; evalAfter: EvalFact; // gameEval lines[0] (client SF, sanity-flagged)
  lines: LineFact[];                         // multipv via convertPvToSan (route.ts:761)
  branchPoint: { atPly: number; sharedSan: string[]; bestContinues: string; playedGoes: string } | null;
  motifs: AnyMotif[];                        // detectMotifs(fenBefore, playedSan) — confirmed AND refuted
                                             //   (heuristic confidence — 1-ply SEE, never narrated as board truth)
  allowedTacticalKeywords: string[];         // compileVoterResult (voter.ts:213)
  voterConfidence: VoterConfidence;
  positionConfidence: PositionConfidence;
  relational: RelationalFactsBlock;          // buildRelationalFacts(fenBefore); each fact gets an id + sayable
  threats: ThreatNode[];                     // buildThreatTree(fenAfter, budget)
  featureDelta: PositionFeatureDelta | null;
  pieceRoleChanges: RoleChange[];
  chessdb: Degraded<{ evalCp: number; outcomeText: string }>;          // post PR-A labels
  syzygy: Degraded<{ category: string; dtmMoves: number | null }>;     // post PR-A ply→move fix
  lc0: Degraded<{ evalCp: number; agreesWithSf: boolean }>;            // prod today: unavailable/service_unconfigured
  visibility: Degraded<{ probPlaysBest: number; level: ConfidenceLevel }>; // queryMaia via /predict (PR-A repoint)
  concept: { key: string; name: string; seedText: string } | null;     // buildConceptLayer (route.ts:881)
  teachingSpine: string | null;              // buildTeachingSpine (route.ts:902)
  engineIdea: string | null;                 // buildExplanationSeed (route.ts:866)
}
// Every ContractFact-bearing field also carries `sayable`: a canonical one-line
// English rendering — fuel for template-fallback cards and referee reference matching.

export interface CoachContract {
  version: typeof CONTRACT_VERSION;
  contractId: string;   // === contextId: sha256(moveHistory|finalFen|playerColor|uid)[:16] (uid per PR-C)
                        // ONE identity for response cache, chat context, and telemetry — never two IDs
  builtAtMs: number; buildMs: number;
  game: { pgnHeaders: Record<string, string>; playerColor: "w" | "b"; moveCount: number; finalFen: string;
          finalMaterial: string; skillLevel: "beginner" | "intermediate" | "advanced"; userRating: number | null };
  // Real zod schema + server-side sanity layer over the z.any() gameEval (audit #5): flags, never mutates
  evalIntegrity: { sentinelPlies: number[]; sanTruncatedAtPly: number | null; minDepth: number;
                   multiPv: number; suspectMixedSignMate: boolean };
  insights: InsightContract[];   // DETERMINISTIC selectInsights(): the WHAT-TO-COVER rules
                                 // (coachChatPrompt.ts:322-328) move from prompt to builder —
                                 // LLM gets zero discretion over which moves get cards; retires
                                 // the contradictory opening-cutoff rule class (audit #26) as code
  moveTable: Array<{ ply: number; san: string; evalAfter: EvalFact; classification: string | null }>;
  persona: { personalityId: string; username?: string };  // cache-key hygiene only — persona TEXT stays in system prompt
}
```

`src/lib/contract/serialize.ts` renders (a) canonical sorted-key JSON for the verbalizer, and (b) **the legacy prompt text** — Phase 1's gate is that (b) is **byte-identical** to today's `buildGameContext` output on fixtures. `maxTokens` for the flagship call is budgeted as `f(insights.length)`, with deterministic drop of lowest-severity insights when the budget won't fit — so `max_tokens` truncation never silently eats the last cards (the malformed-header history says it will otherwise).

---

## 3. The verbalizer

**ONE streamed Sonnet 4.6 flagship call per review** — same call count, same `callLLMStream` plumbing, same tier abstraction. Per-insight Haiku verbalization is explicitly rejected as the mainline (fragments the masti arc into micro-blurbs, 8× request fan-out, Haiku's 2.44/5 pre-grounding factual history); it survives only as the phase-7 measured cost experiment (§8).

- **Prompt split:** new constant `VERBALIZER_PROMPT_VERSION = "4.0"` in coachChatPrompt.ts; **legacy `PROMPT_VERSION` stays 3.6** so rollback lands on a warm, uncontaminated cache. Contract-mode responseCache keys are prefixed `c4.0|` — dual-mode never cross-serves.
- **System prompt v4.0** = the UNCHANGED persona manifesto + coachPersonalities overrides (byte-stable, Anthropic prompt-cached) + a compact verbalizer charter replacing ~40 lines of accumulated grounding pleas: *"You are given a verified fact contract as JSON. Every chess-fact sentence must be derivable from a contract field and end with its citation token [F:<id>]. You may NOT add chess facts. Certainty language must match fact confidence (heuristic facts get 'looks like', oracle facts may be stated flat). Rhetoric — analogies, encouragement, story, humor, masti voice — is entirely yours and needs no citations."*
- **User turn** = canonical contract JSON + the 3 gold-standard few-shots re-authored as contract→prose pairs (Aayan authors/reviews the prose halves — the voice reference stays his).
- **Output format:** the EXISTING bracket-token grammar, free text — NOT structured output for the main call (would break incremental card streaming). Insight headers become **server-authoritative**: the prompt dictates the exact `[INSIGHT:...]` line, and the server rewrites headers from the contract during block-gating regardless — killing the malformed-header card-drop class (parser.ts:87-101) by construction. Eval figures in prose must copy the precomputed `display` strings verbatim.
- **Structured outputs ARE adopted** for the small non-streamed Haiku calls: evalClaim/relationalClaim claim extraction and per-insight regen move to `output_config.format: json_schema` — killing the fail-open unparseable-JSON class (audit #4).
- **Citation posture (pre-committed arming decisions, not emergency retreats):** uncited-but-keyword-licensed sentences degrade to **warn**, never error (prevents under-citing cascades burning regen budgets); if sentence-level citations regress the GCC-Eval persona/fluency rubric, the fallback is **paragraph-level citation blocks**, pre-built in PR-CI-4.

---

## 4. The output referee + failure ladder

`src/lib/contract/referee.ts` — per-insight during block-gated streaming; whole-message for prefix/suffix. Cheapest-first:

1. **Header integrity** — server rewrites from `InsightContract`; passes by construction.
2. **Eval/mate numbers** — regex all `±N.NN` / `M±n` spans; each must string-match a contract `display` (±0.3 pawns tolerance on cp phrasing; exact mate distance). Deterministic; Haiku parse retained only for verbal phrasings ("completely winning"), via structured output.
3. **Square/piece mention check** (new, deterministic, $0) — every `a1–h8` token and SAN token in the body must occur in {lines[].san, motif squares, relational squares, threats, playedSan/bestSan, fen piece map}; unknown square + claim verb ⇒ error. This is aimed exactly at TTT's "rook on d3 cut the defense" class (audit §5.7).
   **Hypothetical-line allowance (must land BEFORE this check arms at error severity):** "if he takes, Rb8 wins" is legitimate pedagogy — only continuations that are **prefixes of contract PVs** may be hypothesized, tracked as an explicit `hypothetical_line` claim class; precision measured on a 30-game set first.
4. **Tactical keywords** — existing `validateMotifGrounding` vs `allowedTacticalKeywords` (full ban when empty; refuted motifs citable only with the refutation named, voter.ts:268-276).
5. **Stage-9 scanners** — mateInN/materialWin/positionalClaim/userVisibility run against a per-insight `VoterSnapshot` shim synthesized from THIS insight's contract fields — fixing the last-move anchoring that forced warn-only on game_review. `claimClassesForbidden` from Degraded sources feeds these directly (Lc0 down ⇒ positional claims capped at the PR-A SF band, mechanically).
6. **Relational claims** — relationalClaim Haiku extraction (structured output, kept **synchronous and bounded** — regex-only replacement is rejected: relational phrasings without square tokens are the documented 2×2 leak class) checked against `contract.relational` for the insight's OWN `fenBefore`.
7. **Citation validity** — every `[F:id]` must resolve; sentence claim class must match fact class; `citationRate.ts` computes coverage telemetry; uncited hard-claim sentences route to checks 2–6.

**Failure ladder** (per insight, error-severity only, in-order flush preserved — a stalled card caps the ladder, never reorders and never converts to whole-review buffering):
- **(a)** deterministic sentence-drop for an uncited disproven hard claim (span excision, no LLM);
- **(b)** Haiku surgical edit scoped to the insight body — `correctStreamedAnalysis()` as-is (streamCorrection.ts:100, sanity-ratio gate intact); **≤2 edits/review**;
- **(c)** ONE per-insight Sonnet regeneration (single-insight contract slice + persona excerpt + failed-claim feedback); **≤1/insight, ≤3/review**;
- **(d)** deterministic **template card** rendered from `sayable` strings + concept/teachingSpine/engineIdea/eval facts (fallback.ts pattern, masti-toned copy Aayan approves). A card is never silently dropped; unverified prose never ships.

**Circuit breaker (corrected from the draft design):** after a **confirmed error-class violation**, the floor is always the template card — it needs no LLM and is always available; raw prose never ships past a confirmed violation. Footnoted-raw (`buildIssueFootnotes`, fail-visible, `validation:"degraded"` telemetry) is reserved for **referee-infrastructure failure** (Haiku/API error mid-check, Anthropic-only, no fallback provider) — never blank, never a hang, never a silent pass.

**Precision discipline (audit #35, permanent):** every new check passes a **0-false-fire gate on known-good control fixtures** before arming at error; warn severity stays telemetry-only; **userVisibility/"obvious" checks stay warn/log-only in every phase — a standing prohibition** (the documented Maia regen-storm), not a judgment call.

**Standing KPI:** per-review `{factsEmitted, claimSentences, citedCoverage%, violationsByCheck, tier2Calls, correctionsApplied, insightsDropped, refereeCostUsd}` through `validatorTelemetry` → tracking tables (once `TRACKING_ENABLED` flips). **First-generation referee pass rate per VERBALIZER_PROMPT_VERSION × model is the product's accuracy number** — the metric audit §3.7 says has never existed. CMIP intern flags (payload gains `{contractId, refereeOutcomes, cited fact ids}`) become labeled precision data for the referee itself.

---

## 5. Streaming & latency

**Block-gated pipelined streaming** — never TTT-style buffer-everything (25–45s to first content is a product-killer; must not creep back via the ladder), never out-of-order card emission (pedagogical order is load-bearing).

The SSE loop (route.ts:1791-1814) gains a grammar-aware gate: prefix text before the first `[INSIGHT:` forwards raw (TTFT unchanged); each insight block buffers server-side until `[/INSIGHT]`, runs deterministic checks 1–5+7 (<50ms), flushes as one burst; Haiku checks (6, verbal-eval parse) run **concurrent with the next card's generation** (~1–2s hidden under ~3–8s/card), so only the final card pays visible referee latency. **Unclosed-block safety is mandatory and tested:** on stream end (max_tokens hit), the remainder flushes raw with a truncation footnote — never swallowed.

| Budget | Legacy | Contract mode | Gate |
|---|---|---|---|
| TTFT (first visible text) | ~3–6s | same fetches restructured ⇒ Δ≈0 | ≤ +0.5s p50 (shadow build-ms telemetry proves) |
| Contract build (over shared fetches) | — | CPU only | NET-NEW overhead vs legacy < 200ms p95 (re-baselined PR-CI-2: measured 28–160ms typical, ~1.0–1.5s on intel-heavy fixtures — the tail is threat-tree/feature-delta chess.js compute the LEGACY path already paid, not new contract cost) |
| Block hold (deterministic checks) | — | <50ms | p95 < 100ms |
| Total review p50 | ~25–45s | +1–2s (final-card referee) | ≤ legacy +20% p95 |
| Edit/regen tail p95 | 10s post-stream (PR-B) | +5–12s, per-card, pre-render | bounded by ladder budget |

The PR-CI-1 fetch parallelization (route.ts:849-855 serial loop + double-fetch dedup) banks **−2–6s** before anything else changes, so the program likely nets *faster* than today's prod. UX shift: whole cards appear sequentially instead of tokens dribbling inside a card — needs Aayan sign-off (§10).

---

## 6. Client + follow-up path

**Client: NO changes through GA (phases 1–6)** — the load-bearing risk decision. Wire format stays the bracket grammar AICoachInsights.parser.ts parses; SSE event shapes unchanged; `done.metadata.corrected`/`analysis` swap (AICoachChat.tsx:2592-2600) keeps working. `[F:...]` tokens are **stripped server-side** in the block gate — old clients never see them. Server-authoritative headers strictly improve the existing client (malformed-header drops disappear; parser lenience stays as belt-and-suspenders). Additive only: `done.metadata` gains an optional `{contractId, contractVersion, refereeOutcomes, citationCoverage}` summary (unknown keys ignored today; feeds CMIP). **Mandatory once the server stamps headers:** a render↔parse round-trip unit test — `render(contract, prose) → parseInsights → deep-equal` — because two files then own the grammar.

**Follow-up path (single-projection principle — no second builder left alive to drift):**
- `AnalysisContext` gains optional `contract?: CoachContract`, stored **size-trimmed** (drop threat bodies, cap lines at 3/insight, drop spine prose): ~20–60KB/entry ⇒ 50-entry cache ≤ 3MB/lambda, with a memory-bound test. Untrimmed 50–200KB contracts (~10MB/lambda) are explicitly forbidden.
- `renderContractCompact(contract, {currentFen?})` becomes **THE** `/api/chat` context, replacing `buildCompactGameContext` outright once stable (legacy builder retained only for contract-less cache entries) — finally satisfying the v3.x VERIFIED-POSITION-FACTS constraint (audit #18) for **mid-game** positions from one source of truth.
- **Per-turn anchor resolution:** PR-C's chat schema already carries `{fen, moveIndex}`; the route matches the navigated fen against `insight.fenBefore/fenAfter` → that `InsightContract` enters context. No match ⇒ **`buildPositionContract(fen)`** — the single-position builder slice (~30ms pure CPU: relational + motifs + positionFacts), same shape, same referee.
- **Referee-lite on every Haiku follow-up answer** (deterministic checks 2–5 only, $0, no added Haiku): error ⇒ existing footnote mechanism; warn ⇒ telemetry. The follow-up surface is most user turns (audit §3.4) — this is its first real output-side gate.
- Cache hits re-store the contract with the contextId (extends PR-D). Cold-lambda 404 behaves as today (deterministic rebuild); the KV fix stays the deferred founder infra call (§10).

---

## 7. Phased PR breakdown

Rollback at every serving phase = **one trim-hardened env-flag flip onto a warm legacy cache** (legacy path untouched after PR-CI-1; `PROMPT_VERSION` 3.6 never bumped).

### PR-CI-1 — Contract builder in SHADOW (zero serving change) — ~900 LOC + tests
**Scope:** `src/lib/contract/{types,builder,selectInsights,serialize}.ts` extracting the structured objects buildGameContext already computes; buildGameContext refactored to **render its prompt text from the contract**; real zod schema + `evalIntegrity` sanity layer over gameEval (audit #5, flags-not-mutates); **one `Promise.all` for all per-insight grounding fetches** (kills the route.ts:849-855 serial loop + the TOP-MISTAKES/INTELLIGENCE-LAYER double-fetch); deterministic `selectInsights()` + maxTokens-by-insight-count budgeting; `CONTRACT_SHADOW` flag (trim-hardened, getMastermindEnv pattern) logs contract size, buildMs, evalIntegrity findings.
**Gate:** prompt-snapshot **BYTE-EQUALITY** on ≥8 vendored fixture games (non-negotiable — "semantic equivalence" diffs are rejected; drift between paths is the exact bug class this program kills); tsc + build + vitest + validator-gate-dryrun green; SSE transcript diff on fixtures empty; shadow build-ms p95 < 200ms.
**Rollback:** flag off ⇒ literally nothing changed (render path proven byte-identical either way).

### PR-CI-2 — Contract-fidelity eval + BEFORE baseline — ~600 LOC
**Scope:** `scripts/eval/contract_fidelity_eval.ts` (tsx, offline, CI `--dry-run` smoke per PR-E discipline) + 10 vendored games with pinned gameEval JSON. Metrics: fabrication rate (deterministic referee checks over prose), citation coverage+validity, persona rubric (non-generator judge tier, 2 seeds — PR-E judge hygiene), ladder distribution. **Runs legacy-path outputs through the same checks to commit the BEFORE number** — the inversion is measured against something, retiring §3.7 as a prerequisite, not a wish.
**Gate:** harness in CI; baseline legacy fabrication-rate JSON committed to `scripts/eval/results/` stamped model+date.
**Rollback:** n/a (offline only).

### PR-CI-3 — Referee v1 + block-gating, DARK — ~800 LOC
**Scope:** `referee.ts` deterministic checks + hypothetical-line claim class + Stage-9 scanners on per-insight contract-derived VoterSnapshots + synchronous structured-output relationalClaim; grammar-aware block buffering behind `CONTRACT_REFEREE_SHADOW` (referee runs, logs only, **bytes forwarded unmodified**); unclosed-block flush safety; render↔parse round-trip test.
**Gate:** known-bad fixture suite (invented pin, wrong eval, phantom square, wrong mate distance, unconfirmed keyword, stale suggestion, illegitimate hypothetical line, 2 clean controls): 100% detection, **0 false fires on controls**; SSE transcripts byte-identical flag-on vs flag-off; block-hold p95 < 100ms; SAN/square-check false-positive rate measured on a 30-game set before any error-severity arming.
**Rollback:** flag off ⇒ gate removed, bytes identical (proven by the transcript diff).

### PR-CI-4 — Verbalizer v4.0, ENFORCED on position_analysis only — ~700 LOC
**Scope:** `VERBALIZER_PROMPT_VERSION=4.0` (legacy 3.6 untouched); contract-JSON user turn + citation charter + server-authoritative headers + `[F:]` stripping; failure ladder live for `CONTRACT_CATEGORIES="position_analysis"` (lowest traffic, already pipeline-enforced — smallest blast radius); `c4.0|` cache-key prefix + **unit test on every generateCacheKey call site**; Haiku claim parsers → `output_config.format json_schema`; gold examples re-authored (Aayan); paragraph-level citation fallback pre-built.
**Gate:** fidelity eval on position fixtures — fabrication ≤1%, citation coverage ≥80%, persona rubric ≥ baseline−0.2; ChessQA short_tactics ≥90% (vs 96% grounded baseline); cache-marker unit test; manual preview smoke; **rollback drill executed:** `CONTRACT_CATEGORIES=""` ⇒ byte-identical legacy on fixtures.
**Rollback:** empty the category list — legacy serves from its warm 3.6 cache.

### PR-CI-5 — game_review ENFORCED, intern-gated dogfood — ~500 LOC
**Scope:** `CONTRACT_CATEGORIES+=game_review` for `CONTRACT_UIDS` allowlist (CMIP `intern_allowlist` + Aayan — the people who file flags); full ladder incl. regen + template card; `done.metadata.contract` wired into CMIP flag payloads (contractId, refereeOutcomes, cited fact ids — flagged responses triageable against the exact contract that produced them).
**Gate:** 10-game fixture suite — fabrication ≤1%, every card renders, TTFT ≤ legacy+0.5s p50, total ≤ legacy+20% p95; 1-week intern dogfood, all flags triaged; **Aayan persona/voice sign-off (explicit veto point)**; referee-intervention <15% on dogfood traffic.
**Rollback:** empty the UID allowlist.

### PR-CI-6 — GA percentage ramp + follow-up grounding — ~400 LOC
**Scope:** `CONTRACT_ROLLOUT_PCT` via deterministic uid-hash (serverless-safe) 25→50→100 over ~1 week; trimmed `AnalysisContext.contract` + `renderContractCompact` as the chat context + `buildPositionContract` for navigated FENs + referee-lite on follow-ups; cache hits re-store contract.
**Gate:** 2×2 follow-up factual ≥4.3 (grounded-Haiku parity); referee-intervention <10% at 25% before each ramp step; no p95 latency regression; context-cache memory-bound test (50×60KB); **one executed mid-ramp rollback drill** (PCT=0, verify legacy serve + warm cache).
**Rollback:** PCT=0, per the rehearsed drill.

### PR-CI-7 — DEFERRED, founder-gated (~800 LOC across 3 PRs)
(a) **Skeleton-card `contract` SSE event** + rich-card client dual-render (clickable cited squares, confidence chips, replayable cited lines) — server-composed engine-fact skeletons inside the first second fix the empty-carousel papercut, **gated behind the gameEval zod+sanity schema from PR-CI-1 being live** (never render unvalidated client evals as instant authoritative UI); in-order reveal only. (b) Vercel KV/Upstash for contract+AnalysisContext (kills cold-lambda 404 → flagship re-run). (c) **Haiku-verbalizer cost experiment — measure-first hard gate:** ships only if first-try referee pass ≥90% AND 2×2 factual ≥ current Sonnet-path score on identical fixture contracts; dead until the gate passes; never the default. (d) depth-16/server eval re-check riding evalIntegrity.
The inversion is **complete without this phase**.

---

## 8. Cost analysis

Sonnet 4.6 $3/$15 per MTok, Haiku 4.5 $1/$5, cache reads ~0.1×, writes 1.25× (verify against `llmPricing.ts` before committing numbers).

| | Legacy | Contract mode |
|---|---|---|
| Flagship call | ~15k in / 2.5k out ≈ **$0.08** (persona cache-read −10%) | same single call; contract JSON ≈ prose blob ±10% tokens (per-request-unique ⇒ uncached; persona prefix stays cached) |
| Haiku claim parses | (log-only today) | ~8×(1.5k in/300 out) ≈ $0.005 typical / $0.02 worst |
| Edits/regens amortized | — | ~$0.005 |
| **Total/review** | **≈$0.08** | **≈$0.09–0.11 (+~20% typical, +$0.05 worst)** |

At ~100 MAU: noise (<$5/mo delta). Against the PR_2F $3.84M/yr-at-1M-MAU model, the referee adds ~15–20%, not an order of magnitude; the flag-selectable levers at scale are (i) the gated Haiku-verbalizer experiment and (ii) deterministic-only referee mode (checks 2–5+7, no Haiku parses). Watch `cache_read_input_tokens` telemetry: if the persona prefix ever drifts per-request (a timestamp sneaking in), contract mode pays full input price — canonical sorted-key serialization guards this.

---

## 9. Risks

1. **Persona sterility (the anti-TTT/DecodeChess failure; #1 abandonment trigger).** Over-constraint flattens the masti voice. Mitigations: rhetoric-is-cite-exempt charter, persona rubric as a hard eval gate (non-generator judge), Aayan-authored gold prose, phase-5 voice veto, paragraph-citation fallback pre-built.
2. **Contract coverage gap (#2 abandonment trigger: sustained referee-intervention >30%).** Motif coverage is the weak link: ChessQA shows the model scores only 48% on motif questions even with generic engine grounding (0pp lift — the 2026-07-05 sonnet-4-6 re-run), and the deterministic detectMotifs layer's own recall has NEVER been measured directly (audit §3.7/#34) — when the model "knows" a true tactic the contract can't express, prose goes generic or gets refereed thin. Measuring detector recall against the vendored ChessQA motifs fixtures should ride PR-CI-2. The inversion *raises* the value of Stage-5 detector work; may need an explicit uncited soft-observation vocabulary (Aayan Q4).
3. **Referee false-positive burn.** positionalClaim's Lc0-absent history is the cautionary tale — hence the mandatory 0-false-fire control gate, warn-stays-telemetry, the hypothetical-line class landing before SAN/square checks arm, and hard ladder caps.
4. **Ground truth ceiling.** The contract inherits depth-12 client Stockfish; `evalIntegrity` flags sentinels/truncation/mixed-sign mates but cannot fix depth. The referee guarantees prose-matches-contract, not contract-matches-chess. Founder-gated depth-16/server re-check (CI-7d) bounds the whole program.
5. **Block-buffering bugs.** Unclosed `[/INSIGHT]` or grammar drift could swallow content — flush-on-done + truncation footnote is mandatory and fixture-tested (PR-CI-3); round-trip test guards the two-files-own-the-grammar hazard.
6. **Dual-mode cache poisoning.** Any cache write missing the `c4.0|` marker cross-serves modes — unit-tested at every generateCacheKey call site; legacy 3.6 deliberately unbumped.
7. **Serverless timing.** The per-card ladder (edit ≤10s + regen) must fit the route's `maxDuration` — regen capped 3/review; breaker resolves to template cards, never a timeout.
8. **Anthropic-only provider.** A mid-ladder API error has no fallback — every stage fails-visible (template card for confirmed violations, footnoted raw only for infra failure), never blank, never a 500.
9. **In-memory context cache.** Trimmed contracts bound memory, but cold-lambda misses still trigger flagship re-analysis — cost amplification at scale until the deferred KV PR.
10. **Double-maintenance window.** Legacy + contract paths coexist CI-1→CI-6; the byte-equality snapshot suite stays in CI the entire window to bound drift, and the window should stay short.

---

## 10. Open questions

### For Aayan (chess/coaching)
1. **Fail-closed voice:** when a big eval drop has NO confirmed motif (the 48%-recall gap), should the coach honestly say "the engine hates this move and here's the line, though I can't name one tactic" + teach the concept/spine — or keep today's confident thematic framing? This defines the product's honesty register.
2. **Card-at-a-time streaming:** whole cards every ~3–8s instead of tokens dribbling inside a card (prefix greeting still streams) — acceptable, or a UX regression?
3. **Template fallback card (ladder d):** approve a deterministic masti-toned template from `sayable` + concept + engine line + eval facts? (After a confirmed violation this is the floor — raw prose won't ship.)
4. **Uncited vocabulary:** which soft observations stay citation-free ("your kingside looks drafty", "this knight is dreaming of e5")? Drafting this list vs the hard-claim keyword list IS the persona-vs-fabrication boundary.
5. **Gold examples:** will you author/review the prose halves of the 3 contract→prose few-shots so the voice reference is yours, not Claude-imitating-Claude?
6. **Insight selection:** pure eval-drop top-10, or prefer richly-covered mistakes (confirmed motifs/concepts verbalize best) when severities are close — worst mistakes vs best-teachable mistakes?

### For tech-lead (architecture/scope/cost)
1. **Cache/version topology:** approve the `VERBALIZER_PROMPT_VERSION=4.0` split + `c4.0|` prefix (instant-warm rollback, two prompt constants to maintain) vs a global bump? (Plan strongly prefers the split; a global bump makes rollback land on a cold cache.)
2. **Vercel KV/Upstash** for contract+AnalysisContext (~$0–10/mo at current MAU; kills the cold-lambda 404 → silent flagship re-run): pull into CI-6 or keep deferred to CI-7 per the fix plan's original deferral?
3. **Ladder budget economics:** ≤2 edits + ≤3 regens/review ⇒ +20% typical / +60% worst-case per review — acceptable at GA, or is deterministic-only referee mode the GA default with Haiku parses intern-only?
4. **`maxDuration`** on /api/enhanced-analysis: does the current limit accommodate stream + final-card referee + ladder (~60–90s worst case)? If not, which config change?
5. **CMIP as the phase-5 gate:** is the intern allowlist the right dogfood cohort, and should the flag schema formally gain the contract fields (contractId, refereeOutcomes, cited fact ids)?
6. **Structured-output claim parsers now vs phase 4:** any objection to moving evalClaim/relationalClaim to `json_schema` immediately (kills the audit-#4 fail-open class; schema-compilation latency is server-cached)?
7. **Depth-16 / server-side eval re-check:** ride this program as evalIntegrity v2 (the contract is its natural home) or stay a separate product-latency decision? Either way it caps the program's ceiling.

---

## 11. Explicit non-goals

- **No per-insight Haiku verbalization as the mainline** — phase-7 measured experiment only, behind the pass-rate + 2×2 parity gate. The masti arc across a review is the moat.
- **No whole-review buffer-then-restream** (TTT-style 25–45s hold) — in any phase, including via a stalled ladder.
- **No out-of-order card emission** — cards reveal in pedagogical order; the ladder is capped, never reordered around.
- **No client migration, ever forced** — the string wire format is not deprecated; rich cards (CI-7a) are additive and flag-gated.
- **No regex-only replacement of the relational claim parser** — it stays synchronous, bounded, structured-output.
- **No silent-null degradation anywhere in the contract** — every unavailable source carries a typed reason + `claimClassesForbidden`.
- **No error-severity arming of userVisibility/"obvious" checks — standing prohibition**, and no new check arms at error without its 0-false-fire control gate.
- **No single-flag big-bang flip of game_review** — the position_analysis → intern-dogfood → uid-hash-ramp ladder with rehearsed rollback is non-negotiable.
- **No fine-tuning** (audit §4 — wrong diagnosis, wrong fix), no Lc0 deploy, no `TRACKING_ENABLED` flip, no depth-16 default inside this program — all remain founder-gated decisions this plan stages but does not make.
- **No "semantic equivalence" shadow gates** — Phase 1 is byte-equality or it doesn't ship.

Even on mid-program abandonment, the permanent wins are banked: the typed contract builder + fetch parallelization, the fidelity eval with a committed BEFORE number, server-authoritative insight headers, structured-output claim parsers, and the gameEval sanity schema.

---

## 12. Review outcomes (2026-07-07)

**Status change:** DESIGN FOR REVIEW → **APPROVED TO BUILD PR-CI-1..3** (shadow/dark phases). Serving phases (CI-4+) additionally need the two pending UX clarifications below before their flags flip.

### Aayan (chess/coaching)
1. **Fail-closed voice — ANSWERED: honest register.** "The model should be upfront and honest and try to remain as helpful as it can despite that." Verbalizer charter gains: *"If an insight's contract has no confirmed motif, say plainly that the engine's preference is concrete but no named tactic was verified — then teach from the engine line, concept, and teaching spine. Never bluff a theme."* Template-card copy follows the same register.
2. **Card-at-a-time streaming — CLARIFICATION PENDING** (plain-language explanation + recommendation sent; gates CI-3 flag-on, not CI-3 code).
3. **Template fallback card — CLARIFICATION PENDING** (same; gates CI-4+ ladder step (d) copy sign-off, not the mechanism).
4. **Uncited soft-observation vocabulary — APPROVED; v0 draft below for review at PR-CI-4.**
   *Rule:* a sentence may go citation-free iff it (a) contains **no** square, SAN, number, eval, mate, or material term, and (b) uses hedged/figurative register. Extends `FORBIDDEN_WITHOUT_BACKING` (puzzlePatternAllowlist.ts) rather than replacing it.
   *Allowed (examples):* "your kingside looks a bit drafty" · "this knight is dreaming of an outpost" · "you were playing with fire through this stretch" · "patience wins these endings" · encouragement, humor, story, masti interjections.
   *Never citation-free:* named tactics (fork/pin/skewer/discovered/…), "winning/losing material", "hanging/undefended", any eval or mate phrasing, any concrete square or move.
5. **Gold examples — YES:** Aayan authors/reviews the prose halves of the 3 contract→prose few-shots (needed at PR-CI-4).
6. **Insight selection — YES (interpreted):** severity-first, with a teachability preference among near-equal severities (richly-covered mistakes — confirmed motifs/concepts — win ties). ⚠️ *Interpreted from a "yes" to an either/or question; implemented as a `selectInsights` config knob so it's reversible in one line.*

### Tech-lead (architecture/scope/cost) — delegated to Claude by Aayan ("You do 7"), decided 2026-07-07
1. **Cache/version topology — APPROVED as planned:** `VERBALIZER_PROMPT_VERSION="4.0"` + `c4.0|` cache prefix; legacy `PROMPT_VERSION` 3.6 untouched (warm-cache rollback beats one-constant tidiness).
2. **Vercel KV — stays deferred to CI-7b**, with a pull-forward trigger: if intern dogfood (CI-5) shows **>20% of follow-up turns** losing their context to cold-lambda misses, KV lands in CI-6 instead.
3. **Ladder economics — full ladder at GA.** +20% typical is noise at ~100 MAU. `CONTRACT_REFEREE_MODE=deterministic` (checks 2–5+7 only, no Haiku parses) ships as a flag in CI-4 so the cost lever exists from day one; default revisited at ≥10k MAU.
4. **maxDuration — stays 60s** (vercel.json `functions` cap, verified). The ladder gains a **hard wall-clock deadline**: remaining route budget minus a 5s margin; on exhaustion it short-circuits to the template card (deterministic, instant) — "never a timeout" holds without assuming a Vercel plan upgrade. An optional per-route bump to 120s is a follow-up, not a dependency.
5. **CMIP as CI-5 gate — APPROVED**; intern flag payload formally gains `{contractId, refereeOutcomes, citedFactIds}`.
6. **Structured-output claim parsers — no objection; resequenced to PR-CI-3** (the natural seam: that PR already wires relationalClaim synchronously).
7. **Depth-16 / server-side eval re-check — remains OUTSIDE this program** (founder product-latency call, per the fix plan's deferral discipline); `evalIntegrity` (CI-1) supplies the flags either way, so the program is ready to consume it whenever that decision lands.
