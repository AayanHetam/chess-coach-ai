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
- **Competitor research (audit §5.4/§5.7) proves both halves are needed.** The best-architected competitor uses the same input shape: engine + detectors → a typed JSON data contract → LLM verbalizes only the contract. And a published independent teardown of its game review reports confident position-fact errors surviving that architecture — i.e. our §3 failure class inside the market-leading contract design. Lesson: **the contract (facts in) is necessary; the output referee (facts checked on the way out) is the missing half nobody ships.** That referee is our differentiation, and PR-B already built its correction machinery.
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
3. **Square/piece mention check** (new, deterministic, $0) — every `a1–h8` token and SAN token in the body must occur in {lines[].san, motif squares, relational squares, threats, playedSan/bestSan, fen piece map}; unknown square + claim verb ⇒ error. This is aimed exactly at the phantom-piece-geometry error class reported in the audit's competitor teardown (§5.7).
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

**Block-gated pipelined streaming** — never buffer-everything (25–45s to first content is unacceptable; must not creep back via the ladder), never out-of-order card emission (pedagogical order is load-bearing).

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

1. **Persona sterility (the classic contract-architecture failure; #1 abandonment trigger).** Over-constraint flattens the masti voice. Mitigations: rhetoric-is-cite-exempt charter, persona rubric as a hard eval gate (non-generator judge), Aayan-authored gold prose, phase-5 voice veto, paragraph-citation fallback pre-built.
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
- **No whole-review buffer-then-restream** (a 25–45s hold) — in any phase, including via a stalled ladder.
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
2. **Card-at-a-time streaming — APPROVED (2026-08-10):** whole cards every ~3–8s with the prefix greeting still streaming token-by-token. Aayan: "ok if it will improve accuracy and quality." Unblocks CI-4 enforce-mode serving.
3. **Template fallback card — APPROVED (2026-08-10):** deterministic masti-toned template as the ladder-(d) floor. Aayan confirmed understanding that the template's SUBSTANCE (engine line, eval swing, concept) adapts per position — only the structure is fixed. Copy itself remains subject to the CI-5 voice veto (§12 A5).
4. **Uncited soft-observation vocabulary — APPROVED; v0 draft below for review at PR-CI-4.**
   *Rule:* a sentence may go citation-free iff it (a) contains **no** square, SAN, number, eval, mate, or material term, and (b) uses hedged/figurative register. Extends `FORBIDDEN_WITHOUT_BACKING` (puzzlePatternAllowlist.ts) rather than replacing it.
   *Allowed (examples):* "your kingside looks a bit drafty" · "this knight is dreaming of an outpost" · "you were playing with fire through this stretch" · "patience wins these endings" · encouragement, humor, story, masti interjections.
   *Never citation-free:* named tactics (fork/pin/skewer/discovered/…), "winning/losing material", "hanging/undefended", any eval or mate phrasing, any concrete square or move.
5. **Gold examples — YES:** Aayan authors/reviews the prose halves of the 3 contract→prose few-shots (needed at PR-CI-4).
   *2026-08-10 amendment (documented deviation):* founder approved proceeding with CI-4 overnight; the prose halves ship as **Claude-authored DRAFTS in masti register** (marked "DRAFT — Aayan voice review at CI-5") so the verbalizer has few-shots from day one. Aayan's authorship/review moves to the CI-5 explicit voice-veto point — the veto covers both the gold prose and the template-card copy.
6. **Insight selection — YES (interpreted):** severity-first, with a teachability preference among near-equal severities (richly-covered mistakes — confirmed motifs/concepts — win ties). ⚠️ *Interpreted from a "yes" to an either/or question; implemented as a `selectInsights` config knob so it's reversible in one line.*

### Tech-lead (architecture/scope/cost) — delegated to Claude by Aayan ("You do 7"), decided 2026-07-07
1. **Cache/version topology — APPROVED as planned:** `VERBALIZER_PROMPT_VERSION="4.0"` + `c4.0|` cache prefix; legacy `PROMPT_VERSION` 3.6 untouched (warm-cache rollback beats one-constant tidiness).
2. **Vercel KV — stays deferred to CI-7b**, with a pull-forward trigger: if intern dogfood (CI-5) shows **>20% of follow-up turns** losing their context to cold-lambda misses, KV lands in CI-6 instead.
3. **Ladder economics — full ladder at GA.** +20% typical is noise at ~100 MAU. `CONTRACT_REFEREE_MODE=deterministic` (checks 2–5+7 only, no Haiku parses) ships as a flag in CI-4 so the cost lever exists from day one; default revisited at ≥10k MAU.
4. **maxDuration — stays 60s** (vercel.json `functions` cap, verified). The ladder gains a **hard wall-clock deadline**: remaining route budget minus a 5s margin; on exhaustion it short-circuits to the template card (deterministic, instant) — "never a timeout" holds without assuming a Vercel plan upgrade. An optional per-route bump to 120s is a follow-up, not a dependency.
5. **CMIP as CI-5 gate — APPROVED**; intern flag payload formally gains `{contractId, refereeOutcomes, citedFactIds}`.
6. **Structured-output claim parsers — no objection; resequenced to PR-CI-3** (the natural seam: that PR already wires relationalClaim synchronously).
7. **Depth-16 / server-side eval re-check — remains OUTSIDE this program** (founder product-latency call, per the fix plan's deferral discipline); `evalIntegrity` (CI-1) supplies the flags either way, so the program is ready to consume it whenever that decision lands.

---

## 13. Execution log (updated 2026-08-10)

**Shipped:** CI-1 #222 (shadow builder, byte-equality-gated, 9→7 fetch dedup) · CI-2 #223 (measurement referee + BEFORE baseline: fabrication 24.6/100, persona 3.75, prompt 3.6) · CI-3 #226 (referee v1 + shadow block-gating, 7/7 known-bad / 0 false fires / p95 1ms; structured-output Haiku parsers live) · CI-4 #241 (verbalizer 4.0 + enforce ladder, DARK behind `CONTRACT_CATEGORIES=""`; rollback drill proves byte-identical flag-off) · 30-game FP measurement #242 · independent CI-4 verification #243 · gold-example geometry fix + eval-attribution charter rule #245 (founder-caught fabrication in the few-shots) · fallback honesty signal #246 · founder-reported UI fixes (dead recommended-move links + ask-your-side) #248.

**Founder decisions recorded:** Q2 card-at-a-time YES · Q3 template card YES (+ open fallback signal) · voice veto PASSED on all 5 items (2026-08-10) · eval-swing attribution rule (evals assume best play; swings attribute to the mover handing the opponent a resource) → charter.

**Verification outcomes (the grain-of-salt record):** builder's CI-4 comparability HONEST, but fabrication ≤1 gate NOT robust (fresh run 2.56/100; ~83% cut stands directionally), persona gate fails single-run (3.45–3.5), full-mode first-card +3.5s fails (deterministic mode −0.8s passes). Raw v4.0 generator fabricates MORE than legacy pre-ladder (27.95 vs 14.8) — all improvement is the ladder; deletion is targeted (engine-fact retention 0.92). Span adjudication: 37 contested fires → 7 TRUE_FABRICATION / 30 FALSE_POSITIVE; NO check arms at error on v1 data. Fixture contamination found (synthetic junk PVs both induce and falsely license fabrications) → all v1 numbers provisional.

**In flight:** referee precision pack (8 FP fixes + pv_truncation + mobility_claims measurement checks + fixtures-real/ with real Stockfish evals + armingConfig all-warn) + v2 30-game re-measurement on branch `feat/referee-precision-pack`.

**CI-5 remaining gates:** arming table from v2 data · citation-coverage decision (70.4% vs ≥80; paragraph-granularity lever built dark) · first-card latency mode decision · preview-env flip + manual smoke · `CONTRACT_UIDS` intern dogfood week · referee-intervention <15% (80–96% pre-precision-pack, FP-driven) · fabrication ≤1/100 multi-sample. Tracking is LIVE and e2e-verified (events + llm_calls), so dogfood traffic is measurable. The migration is complete only after CI-6's ramp and legacy retirement.

---

## 14. Arming decision + CI-5 gate redefinition (2026-08-11)

**Armed at error** (v3 measurement on `fixtures-real`, 30 reviews / 897 claim sentences, position-verified adjudication; plan §9 risk-3 0-false-fire gate satisfied):

| check | evidence |
|---|---|
| `tactical_keyword` | 22 fires = **19 TRUE_FABRICATION / 3 ambiguous / 0 FP**. The round-2 refinements (value-aware fork confirmation, skewer threats with pawn back-pieces, immobilized-trapped, definitional exemption) turned v2's 6:8 TF:FP into 19:0. The 3 ambiguous are unverified tactical claims, which founder policy drops anyway. |
| `eval_display` | 0 fires across v1/v2/v3; pure numeric comparison against contract display strings. |

**Held at warn, blocker named:** `san_whitelist` (every v3 fire is licensed by contract-GLOBAL facts — the insight-local pool is the defect, not the prose), `forbidden_claim` (`isDefinitionalSentence` is wired into the keyword path but not the visibility path; the "dominates" positional class is board-unfalsifiable until Lc0 feeds `positional_plan`). `pv_truncation` stays measurement-only (0 TF / 4 FP; gaps: same-sentence continuation, claimant attribution, PV-occurrence selection). `mobility_claims` literal family measured 9/9 TF / 0 FP and is a graduation candidate. `userVisibility` is permanently warn (standing prohibition, clamped in code).

**Gate redefinition (founder-approved 2026-08-11).** CI-5's original gate — "referee-intervention <15%" — measures the wrong quantity. Under the armed table, 15/30 reviews (50%) contain at least one armed-check fire, but that is the **fabrication rate**, not a false-alarm rate: the measured **false**-intervention rate is **0/30**, and only 3.0% of claim sentences are touched. Satisfying the old gate would require disarming the referee and shipping the fabrications. The gate is therefore restated as:

> **CI-5 gate: false-intervention rate < 15%** (position-verified false positives ÷ total armed fires). Currently **0%**. Intervention rate remains a reported metric, not a pass/fail bar.

**Founder policy governing the ladder** (2026-08-10): unverified tactical claims are dropped or rewritten — never hedged, never shipped. "Consumers who see the coach being wrong will leave much faster than a user thinking the explanation is bare."

---

## 15. PR-CI-5 build + `game_review` measurement (2026-08-11)

**Built** (branch `feat/contract-ci-5-game-review`, shipped DARK — `CONTRACT_CATEGORIES` stays `position_analysis` in the committed default):

- **`CONTRACT_UIDS`** — comma-separated session-uid allowlist. Precedence is a plain OR in `src/lib/contract/servingGate.ts`: category listed (everyone) OR uid listed (that user, EVERY category). Trim/newline/quote-hardened; case is **preserved**, not folded (uids are case-sensitive; folding would let an allowlist match uids it was never given). Emptying it is the CI-5 rollback. `done.metadata.pipeline.contractArmedBy` separates dogfood from rollout traffic.
- **Sentinel guard (`sentinelGuard.ts`)** — closes the "cited ≠ true" class on the serving side. The exposure was verified, not theoretical: on main @`704947e`, fixture `03_sentinel_timeout` built card **I3** (`classification: "inaccuracy"`, `severityDropCp: 80`) from an `evalBefore` sentinel and it reached the enforced card plan. `classification`/`severityDropCp`/`cpBefore|AfterFlat` are all derived from the sentinel's fake `cp: 0`, and `renderInsightHeader` printed that classification as server-authoritative truth beside the honest "engine data unavailable" — a fabrication the referee would have *certified*, because the referee checks prose against the contract. No enforced card is now built from a sentinel-bearing insight (either end — the drop is a difference), a model block naming one cannot anchor to it, and the omission ships as an honest note. Only ever drops INTEL-ONLY cards (Scan 1 already skipped sentinels).
  ⚠️ **Superseded upstream mid-build.** PR **#275** (`fix/group-c-sentinel-guards`) landed while this branch was in flight and fixed Group C at source — C4 added the sentinel skip to `selectInsights` Scan 2, so those insights are no longer born. After merging main, the corpus produces **zero** sentinel cards and this guard is **defence in depth**, not the only barrier. Both layers are tested: the fixture test now pins C4 (a regression there means C4 was reverted), and a synthetic contract pins the guard's own behaviour. Nothing in Group C was touched by this branch.
- **Deadline made real.** It was ADVISORY: stages checked `now() + ESTIMATE < deadline` before starting, but `callLLM` has no default timeout and got no signal. Regen/relational now carry deadline-bounded `AbortSignal`s and the edit's self-timeout is clamped.
- **Generation budget (`CONTRACT_GENERATION_BUDGET_MS = 45s`)** — the new one. See the latency finding below.

**Gate run** (`scripts/eval/contract_ci5_gates.ts`, 10 fixtures × 3 samples = 30 reviews, 903 claim sentences, `refereeMode: full`, real `DEFAULT_ARMING_TABLE`, request "analyze my game"; artifact `scripts/eval/results/contract-ci5-gates-2026-08-11.json`, $0.20 ladder cost). Measured on main @`704947e` + this branch, i.e. **before** the #275 merge; #275 touches only sentinel handling, so the accuracy and latency figures stand, but the sentinel-refusal count does not (see below):

| gate | pooled | per-run | bar | verdict |
|---|---|---|---|---|
| persona | **4.28** | 4.5 / 4.1 / 4.25 | ≥3.55 pooled, ≥3.5 per-run | PASS (legacy same-day 4.05) |
| citation coverage (sentence) | **0.928** | 0.915 / 0.942 / 0.926 | ≥0.80 | PASS |
| fabrication | **0.00/100** (0/903) | 0 / 0 / 0 | ≤1/100 | PASS |
| **false-intervention** | **0.20** (2/10) | 0.20 / 0.00 / 0.25 | <0.15 | **FAIL** |
| prose retention | 0.987 | — | — | reported |
| every planned card shipped | 72/72 | — | — | PASS |

Ladder: 64 pass / 8 sentence_drop / 0 edited / 0 regenerated / 0 templated / 0 deadline breaches. Sentinel guard refused 3 cards (one per sample of fixture 03) — **this run predates the #275 merge; on current main that count is 0 because C4 removes the insight upstream.** Raw intervention rate 26.7% of reviews, touching 1.1% of claim sentences.

**All 10 armed fires, position-verified** (the §14 standard, not just the mechanical adjudicator):

| fires | span | check | board truth | verdict |
|---|---|---|---|---|
| 3 | "15 legal moves" (01/I1) | mobility_claims | actual 7 before / 44 after | TRUE catch |
| 1 | "no legal moves" (05/M1) | mobility_claims | knight on a7 has 3 legal moves | TRUE catch |
| 2 | "trapped" (05/M1) | tactical_keyword | knight on a7: 3 legal moves, **0 safe** — the claim is TRUE | **FALSE POSITIVE** |
| 4 | "fork" / "discovered" (02/I3, 10/M1) | tactical_keyword | unverified tactical claims — founder policy drops these regardless | not-false |

**The gate fails on one cause, and it is detector recall, not referee logic.** Both false fires are the word "trapped" on the same insight in 2 of 3 samples: the position is a textbook trapped knight, but `detectMotifs` did not put "trapped" in that insight's `allowedTacticalKeywords` (it IS in a neighbouring insight's). This is plan §9 risk 2 — "the deterministic detector layer's own recall has NEVER been measured" — arriving exactly where it was predicted. The fix is detector-side (a trapped-piece confirmation from `countSafeMoves`, which the mobility check already computes), not a disarming.

⚠️ **n = 10 fires.** A 2/10 point estimate carries a 95% CI of roughly 3%–56%: the interval spans the 15% bar in both directions. The gate is FAILED on the evidence available, and is not *resolvable* at this denominator either way. A re-measure after the trapped-piece detector fix, on a denominator large enough to matter, is the honest next step.

**Latency — the blocking finding.** game_review does not fit `maxDuration: 60s` at 7 cards:

| | legacy 3.6 | contract 4.0 | delta |
|---|---|---|---|
| TTFT p50 | 1305ms | 1659ms | **+433ms** (bar ≤+500ms — PASS) |
| first card p50 | 14681ms | 19750ms | **+4394ms** (bar ≤+500ms — **FAIL**) |
| total p50 | 19539ms | 26336ms | +8559ms |
| total p95 | 55475ms | **78286ms** | +28018ms |

The 7-card fixture ran **76–83s of generation alone**, with the ladder passing every card — the referee is not the cost. Legacy survives only because it caps `maxTokens` at 3000 and truncates; contract mode budgets 4800 at 7 cards and finishes the job. Rough shape: ~17–20s for the first card, ~+8–9s per additional card ⇒ **the 60s ceiling is ~4–5 cards**. `CONTRACT_GENERATION_BUDGET_MS` converts the failure from "Vercel kills the function, no `done` event, client hangs" into "short honest review that closes properly and is never cached" — a safety net, not a fix.

**Founder decisions this needs** (neither is Claude's to make — both are coverage/latency product calls):
1. **`maxDuration` 60s → 120s** (tech-lead decision #4 called a bump "a follow-up, not a dependency"; for game_review it IS a dependency), and/or
2. **a game_review card cap** (~5) — a WHAT-TO-COVER change, so Aayan's call per §12 A6.

**Recommendation:** `CONTRACT_UIDS=<Aayan's uid>` is safe to flip now — the accuracy gates pass comfortably, the failure mode is a short review, and dogfood is exactly where a 20%-of-10 false-intervention estimate gets a real denominator. `CONTRACT_CATEGORIES+=game_review` is **NOT** ready: the first-card regression and the 60s ceiling are both user-visible, and the false-intervention gate is failed.

**Not built (remaining CI-5 plan scope):** `done.metadata.contract` is populated but is NOT wired into the CMIP `intern_flags` payload — `captureFlagContext` carries no contract fields, and adding them needs a Supabase migration (founder/DB-gated).

---

## 16. Card cap, trapped-piece fix, and the cap-5 re-measurement (2026-08-11)

Branch `feat/card-cap-and-trapped-fix`, off main @`eac70b8` (CI-5 merged as #279). Serving stays DARK in the committed default.

### 16.1 Card cap 5 — a MAXIMUM, with a quality floor

**Founder decision:** "cap at 5 — but it is important to keep in mind that in some cases only 1 or 2 should be given." The second half is the load-bearing half. A fixed card count is fabrication pressure with a number on it: the verbalizer is handed a plan and told to write every card in it, so a plan of five on a game with one real mistake asks for four manufactured lessons — and the referee cannot save that, because a padded card IS in the contract.

`drop > 50` is a mistake-DETECTION threshold and is right for the contract (every mistake stays a citable fact). It is the wrong question for card-worthiness: 50cp means different things in different positions. `cardWorthiness.ts` scores the drop against what it cost in OUTCOME terms — mover-perspective evals bucketed into five bands (LOST ≤ −300 < WORSE < −100 < LEVEL < +100 < BETTER < +300 ≤ WINNING) — and an insight earns a card iff the mover was **not already LOST** and the move **either dropped a band or was a ≥300cp blunder**. Selection among qualifiers is severity-first with teachability (confirmed motifs + concepts) breaking near-ties (§12 A6), then the cap. If nothing clears the floor the single best moment is restored, so the floor can never mute a game that had one.

**Per-fixture card counts** (vendored fixture set; was → now):

| fixture | was | now | kept | floored (reason) |
|---|---|---|---|---|
| 01 mate_for_white_midgame | 1 | **1** | I1 | — |
| 02 mate_for_black | 4 | **3** | M1 M2 I1 | I3 already_lost |
| 03 sentinel_timeout | 2 | **1** | M1 | I2 immaterial |
| 04 invalid_san_truncation | 1 | **1** | M1 | — (headline restored) |
| 05 long_game_six_mistakes | 7 | **5** | M1 M2 M3 M5 I2 | M4, M6 immaterial |
| 06 short_opening | 0 | **0** | — | — |
| 07 knight_fork | 3 | **1** | M1 | M2 already_lost, M3 immaterial |
| 08 quiet_positional | 1 | **1** | M1 | — (headline restored) |
| 09 legal_trap_tactics | 2 | **2** | M1 M2 | — |
| 10 queenless_endgame | 3 | **3** | M1 M2 I2 | — |
| **total** | **24** | **18** | max 5 · five 1-card reviews · one 0-card | |

Five 1-card games and a 0-card game: the floor is real, not a cap that pads to 5.

**Layer (documented deviation).** The cap is applied in the CARD PLAN (`verbalizerPrompt.selectCardInsightsDetailed`), NOT in `selectInsights`'s `.slice(0, 10)`. `selectInsights` feeds the contract, which also renders the legacy 3.6 prompt through `renderLegacyPrompt` — byte-pinned by the CI-1 snapshots. Capping there would silently rewrite the legacy prompt and delete facts the verbalizer may still cite in prose.

**Zero-card reviews were shipping RAW** (audit finding, now closed). Refereeing is per-CARD, so a review with no cards is 100% out-of-block text and bypassed the referee entirely — while the prompt explicitly tells the model to free-write there. `overviewReferee.ts` runs the checks that survive the loss of a board anchor, all contract-GLOBAL and all mechanical: eval figures vs `collectContractEvalPools`, SAN/claim-sentence squares vs `collectContractWhitelist`, tactical vocabulary vs the union of `allowedTacticalKeywords` (usually EMPTY on a card-less game, which is the correct answer). Violating sentences are dropped with the ladder's own stage-(a) mechanic; under 40 substantive characters left ⇒ a deterministic contract-derived overview. The floor does **not** make this shape more common — it restores the headline — so a zero-card review still means exactly what it always meant: no mistake over 50cp in the whole game.

### 16.2 The trapped-piece false alarm

§15 recorded CI-5's 2 false fires as the word "trapped" on a knight with "3 legal moves, 0 safe — the claim is TRUE". **That adjudication does not hold.** `countSafeMoves` on 05/M1's a7 knight is **1**, not 0: the Nb5 retreat is defended by the a4 pawn, so `flightIsCovered` clears it. Delete that one pawn and the same knight is 3 legal / 0 safe — the shape the adjudication believed it was looking at.

The recall gap it named is real, and structural: `detectTrappedPieces`/`detectImmobilizedPieces` only ever scan the OPPONENT's pieces, so a player walking their OWN piece into a cage — the commonest game_review blunder narrative — can never license the word. `checkTacticalKeywords` now grants the trapped class an OCCURRENCE-level exemption from the arithmetic the mobility check already computes (`resolveClaimPiece` + `resolveClaimFens` + `countSafeMoves`): zero safe moves licenses the word even with legal moves available. Unresolvable pieces, unresolvable positions and pieces with a safe square all still fire. "No legal moves"/"N legal moves" are COUNTS and `checkMobilityLiteralClaims` still refutes them against raw chess.js — a piece with 3 legal and 0 safe moves is "trapped" (allowed) but does not have "no legal moves" (still caught). Pinned both ways in `refereeCi5TrappedLicense.test.ts` against the real 05/M1 position.

### 16.3 Cap-5 gate run

`scripts/eval/contract_ci5_gates.ts`, 10 fixtures × 3 samples = 30 reviews, 666 claim sentences, `refereeMode: full`, real `DEFAULT_ARMING_TABLE` (via `CI4_GATE_ARMING_TABLE`), request "analyze my game". Artifact `scripts/eval/results/contract-ci5-gates-cap5-2026-08-11.json`, $0.19 ladder cost.

| gate | pooled | per-run | bar | verdict |
|---|---|---|---|---|
| persona | **4.10** | 3.9 / 3.9 / 4.5 | ≥3.55 pooled, ≥3.5 per-run | PASS (legacy same-day 3.90) |
| citation coverage (sentence) | **0.906** (pooled-sentence 0.917) | 0.905 / 0.877 / 0.935 | ≥0.80 | PASS |
| fabrication | **0.00/100** (0/666) | 0 / 0 / 0 | ≤1/100 | PASS |
| false-intervention, **position-verified** | **0.00** (0/12) | 0 / 0 / 0 | <0.15 | **PASS** |
| false-intervention, mechanical adjudicator as run | 0.25 (3/12) | 0.50 / 0.17 / 0.25 | <0.15 | FAIL — instrument defect, see below |
| prose retention | 0.987 | — | — | reported |
| every planned card shipped | 54/54 | — | — | PASS |

Ladder: 45 pass / 9 sentence_drop / 0 edited / 0 regenerated / 0 templated / 0 deadline breaches / 0 sentinel refusals. Raw intervention rate 23.3% of reviews, touching 1.8% of claim sentences.

**All 12 armed fires, position-verified by hand — 12/12 TRUE catches, 0 false positives.** Every fire now carries its carrier sentence and the FENs it was scored against, so this is reproducible from the artifact.

| # | fixture/sample/insight | check | span | board truth (chess.js) | verdict |
|---|---|---|---|---|---|
| 0 | 01 s1 I1 | mobility | "15 legal moves" | Qf3 has 17 before / 18 after | TRUE |
| 1 | 05 s0 M1 | tactical | "trapped" (knight on a7, "no good squares") | Na7: 3 legal, **1 safe** (Nb5, defended by a4) | TRUE |
| 2 | 05 s1 M1 | tactical | "trapped" (a8 B, a7 N, d2 B, "no legal moves") | 1/1, 3/1, 1/1 legal/safe | TRUE |
| 3 | 05 s1 M1 | mobility | "no legal moves" | same three pieces all have legal moves | TRUE |
| 4 | 05 s2 M1 | tactical | "trapped" (same three-piece claim) | same | TRUE |
| 5 | 05 s2 M1 | mobility | "no legal moves" | same | TRUE |
| 6 | 05 s2 M2 | mobility | "no legal moves" (a8 B, b5 N, h2 R) | 1, 4, **6** legal moves | TRUE |
| 7 | 05 s2 I2 | mobility | "no legal moves" (a6 N, e6 Q, e5 B) | 4, 9, 8 legal moves | TRUE |
| 8 | 09 s0 M1 | tactical | "trapped" (bishop to d1) | Bd1: 5 legal, 2 safe | TRUE |
| 9 | 09 s1 M1 | tactical | "trapped" (bishop on d1) | same | TRUE |
| 10 | 09 s1 M1 | mobility | "no legal moves" | same | TRUE |
| 11 | 10 s1 M1 | tactical | "fork" (Ne6 "forks the bishop on e7") | e6→e7 is not a knight move | TRUE |

**The mechanical adjudicator was the defect, not the referee.** Its `tactical_keyword_unbacked` rule was contract-GLOBAL and board-blind: any fire whose keyword appeared in ANY insight's `allowedTacticalKeywords` was certified a false positive. Sound for relational vocabulary; unsound for the trapped class, whose truth condition is arithmetic about one named piece on one board. All 3 "false" fires were "trapped" on 05/M1, certified because insight M2's list contains the word — while the board refutes every clause of the prose. **This is the same rule that produced §15's 2/10, so that FAIL was also an artifact of the instrument.** The license is now conditioned on the board (every named piece must have zero safe moves); re-adjudicating the stored artifact takes the false count **3 → 0 of 12**, matching the hand verification exactly. Pinned in `scripts/eval/__tests__/fpAdjudication.test.ts`.

### 16.4 Latency — the cap did not buy enough

| | legacy 3.6 | contract 4.0 (cap 5) | contract 4.0 (7 cards, §15) |
|---|---|---|---|
| TTFT p50 | 1312ms | **1366ms** (+54ms; per-fixture delta p50 −59ms) | 1659ms |
| first card p50 | 15604ms | **19386ms** (delta p50 +3782ms) | 19750ms |
| total p50 | 20600ms | **20104ms** (now FASTER than legacy) | 26336ms |
| total p95 | 57649ms | **59412ms** | 78286ms |

Cards → wall clock, measured: 0 cards 10.8–12.2s · 1 card 15.3–21.7s · 2 cards 28.2–37.4s · 3 cards 39.2–47.2s · **5 cards 59.2–60.4s**. About +10.5s per card after the first.

**Does it fit `maxDuration: 60s`? No — not at 5.** The three 5-card samples ran 59.2s, 60.4s and 59.4s; one exceeded the ceiling outright and all three blow the 55s ladder budget, so in production `CONTRACT_GENERATION_BUDGET_MS` (45s) would cut a 5-card review short. This is **not a contract-mode regression**: legacy 3.6 on the same fixture takes 57.6s, so a wide game_review is at the ceiling either way and contract adds ~+2s. Everything at **≤3 cards is comfortably inside** (≤47.2s), and **4 cards projects to ~49s** with ~11s of headroom.

The **first-card** bar (≤+500ms vs legacy) still FAILS at +3782ms, improved from +4394ms. It is a whole-card-burst cost (founder-approved Q2), not referee latency — the ladder passed 45 of 54 cards untouched.

**Zero-card reviews now pay their referee up front.** TTFT for fixture 06 is 10.8–12.2s (== total), because the overview is buffered and refereed as one unit before anything ships. A deliberate trade — an unrefereed free-write is the least-anchored prose in the product — but a real UX cost on that shape; the alternative (stream, then post-stream surgical correction, as PR #211 does on the streamed path) is available if the founder prefers it.

### 16.5 Recommendation

**Enable `game_review` for ALL users at a 4-card cap, or at 5 with `maxDuration` raised to 120s. Not at 5 on the current 60s ceiling.**

Every accuracy gate now passes, several comfortably: fabrication 0/666, persona 4.10 vs legacy 3.90, citation coverage 0.906, prose retention 0.987, 54/54 planned cards shipped, and a position-verified false-intervention rate of **0%** on 12 fires — the gate §14 defined, and the first time it has been measured with the carrier sentences needed to check it. Total p50 is now *faster* than legacy. The two open items are both latency and both bounded: the 5-card tail sits on the 60s ceiling (where legacy also sits), and first-card is +3.8s by design.

Founder call remains #1 or #2 from §15 — `maxDuration` 60s→120s, and/or the cap. The measurement says **4** is the value that fits today's ceiling.
