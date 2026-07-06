# Chess Masti AI Coach — Architecture & Accuracy Audit

**Date:** 2026-07-05 (overnight autonomous audit)
**Scope:** Full architecture of the AI chess coach (chessmasti.com), why its responses are inaccurate in production, whether "training" is the problem, and how competing products (chess.com, DecodeChess, Take Take Take, Chessvia, chesscoach.dev) architect the same problem.
**Method:** 9 parallel code-reading agents mapped every subsystem with file:line evidence; defect hunts with adversarial verification; web research sweep over competitor architectures and the academic literature. Everything cited below to `file:line` was read from the actual working tree.

> **Post-audit note (2026-07-05):** all seven fix workstreams in the companion [COACH_ACCURACY_FIX_PLAN.md](./COACH_ACCURACY_FIX_PLAN.md) shipped to main the same night (PRs #209–#215). This document describes the state that **prompted** the fixes; line numbers and behaviors below reflect the pre-fix tree. See the fix plan's STATUS table for what changed. First fresh accuracy numbers on the production flagship (`claude-sonnet-4-6`): ChessQA short_tactics **24% → 96% (+72pp)** with engine grounding, motifs 48% → 48%, 2×2 factual Haiku **2.44 → 4.36** grounded — committed under `scripts/eval/results/*-sonnet46.json`.

---

## 0. Executive summary

**The model is not trained, and it is not being "trained wrong."** There is zero fine-tuning anywhere in the product — verified exhaustively (§4). The coach is a *prompting + engine-grounding + post-hoc validation* pipeline over stock Claude models (Sonnet 4.6 flagship, Haiku 4.5 fast tier). Its accuracy is therefore determined entirely by four things: (1) the quality of the engine ground truth fed in, (2) how much of that truth actually reaches the model's prompt, (3) whether anything *enforces* correctness on the way out, and (4) whether anyone can *measure* any of it. All four are broken in production, each in a specific, fixable way.

**The huge missing piece you suspected exists, and it is this:** the anti-hallucination enforcement pipeline — the "Mastermind" validators, regeneration loop, and fallback machinery that ~6 weeks of engineering built — **never executes on the path users actually hit.** Production clients hardcode `stream: true`, and turn-1 game reviews are deliberately routed to a "realtime stream" branch where every validator is **log-only**: the raw Sonnet output is forwarded to the user verbatim, checked afterward, and shipped regardless of what the checks find ([route.ts:1698-1830](../src/app/api/enhanced-analysis/route.ts), [streamingStage9.ts:3-14](../src/lib/mastermind/validators/streamingStage9.ts) — whose own header admits "the non-streaming validator pipeline therefore never runs in prod"). Even inside the enforcing pipeline, the strongest validators are gated to `POSITION_ANCHORED_VALIDATOR_CATEGORIES = {position_analysis}` — a category that excludes `game_review`, the flagship's primary output ([validators/index.ts:120-121](../src/lib/mastermind/validators/index.ts)).

Wrapped around that central hole are three compounding layers:

- **The "ground truth" is weak and unverified.** The server never runs an engine. It trusts a `z.any()`-typed blob of client-side Stockfish WASM output computed at **depth 12, single-threaded, lite build** — with timeout sentinels that forge `0.00` evals, a sort comparator that ranks getting-mated lines above mating lines, and mate scores flattened to a ±9999 sentinel (§3.2).
- **The grounding sources are degraded or actively wrong.** Lc0 was never deployed (`LC0_API_URL` unset ⇒ an entire confidence tier is unreachable, and the positional-claim validator false-fires on every strong phrase); Maia's visibility endpoint isn't live; chessdb labels every ±2.00 position "draw" *in text injected into the prompt*; Syzygy mate distances are injected in plies mislabeled as moves — roughly 2× too large (§3.3).
- **Nobody can see any of this.** Every accuracy number ever produced came from a now-retired model (`claude-sonnet-4-20250514`); the eval harnesses depended on `/tmp` artifacts that no longer exist; nothing runs in CI; production LLM telemetry is dark because the tracking tables were never created (§3.7).

The follow-up chat path — which serves **most user turns** — is its own failure: Haiku 4.5 operating under a system prompt that *forbids* any tactical claim not backed by a "VERIFIED POSITION FACTS" block **that its context never contains**, validating every answer against a position frozen at analysis time even when the user has navigated elsewhere (§3.4).

**Competitively** (§5): every product that ships trustworthy chess explanations uses one of two architectures — *closed-world symbolic* (chess.com, DecodeChess: only emit sentences derivable from engine output; zero hallucination, low ceiling) or *structured-context LLM* (Take Take Take: Stockfish + Maia + tactical detectors → a precisely-typed data contract → LLM verbalizes *only* that contract). Chess Masti's design documents describe the second architecture — and the prompt-injection half of it is genuinely built — but production behavior is closer to "LLM with engine hints and no referee." The gap between Chess Masti and Take Take Take is not model quality or training; it is that TTT's LLM can only speak about fields in the contract, while ours streams unreviewed prose.

The paired fix plan lives at [COACH_ACCURACY_FIX_PLAN.md](./COACH_ACCURACY_FIX_PLAN.md).

---

## 1. What the system is

**Product surfaces.** The coach appears in four places:

| Surface | Endpoint | Model | Validation in prod |
|---|---|---|---|
| Turn-1 game review / "Coach tab" on `/analysis` | `POST /api/enhanced-analysis` | Sonnet 4.6 (streamed) | **Log-only** (see §3.1) |
| Follow-up chat turns | `POST /api/chat` (contextId fast path) | Haiku 4.5 | Regex-vs-final-FEN + flag-gated pipeline that silently degrades |
| Puzzle coach (`/puzzles`, in-chat) | `POST /api/puzzle-chat` | Sonnet turn 0, Haiku after | **None of any kind** |
| Puzzle hints (4-stage) | `POST /api/puzzle-hint` | Haiku (why_wrong), Sonnet (rest) | Prompt-side constraints only |

**Model stack.** All LLM calls funnel through [llmProvider.ts](../src/lib/llmProvider.ts): tier `"flagship"` → `claude-sonnet-4-6` (temperature 0.7, max_tokens 3000, `output_config.effort: "medium"`), tier `"fast"` → `claude-haiku-4-5-20251001` (Haiku 400s if sent `effort`, so it's flagship-only). A coded OpenAI fallback (`gpt-4o`/`gpt-4o-mini`) is operationally dead — `OPENAI_API_KEY` is not configured anywhere — so any single Anthropic error is a user-facing failure; there is **no retry/backoff of any kind** (raw `fetch`, no SDK).

**Engines.** Stockfish runs **only in the browser** (WASM, default Stockfish 17 Lite single-thread). The server consumes whatever eval JSON the client sends. Server-side "engines" are HTTP microservices: Maia-2 (deployed on an HF Space, kept warm by a daily cron) and Lc0 (client code exists; **service never deployed**). chessdb.cn and the Lichess Syzygy tablebase are the other grounding sources.

**No training.** Verified in §4. The public architecture page itself states the stance: *"No fine-tuned proprietary chess LLM (a fine-tuned LLM still hallucinates; the validator is what we trust)"* ([architecture/page.tsx:276-277](../src/app/architecture/page.tsx)). The irony of this audit is that the validator it trusts is the part that doesn't run.

---

## 2. Architecture in detail

### 2.1 Turn-1 request lifecycle (`/api/enhanced-analysis`, 2,808-line route)

```
CLIENT (browser)
  Stockfish 17-lite WASM sweep (depth 12, multiPv 3)  ──► GameEval JSON
  AICoachChat.tsx / AnalysisImpl.tsx  ──►  POST /api/enhanced-analysis  { stream: true  ← HARDCODED }
        │
SERVER  ▼
  requireSession → zod validate (gameEval: z.any() — unvalidated) → gateFeature
  getMastermindEnv().validatorsEnabled   (prod: "true\n", saved by .trim())
        │
  buildGameContext (route.ts:479-903)  — the ground-truth payload:
     • GAME OVERVIEW + PGN headers
     • MOVE-BY-MOVE: per half-move — SAN, FEN before/after, classification,
       eval, best-move PV (UCI→SAN)
     • TOP MISTAKES (>50cp drops, player color, top 10) — each with
       voter groundingContext = detectMotifs + chessdb + (Lc0ᵈᵉᵃᵈ) + (Maiaᵍᵃᵗᵉᵈ)
     • FINAL POSITION + material + VERIFIED POSITION FACTS (chess.js oracle)
     • CHESS INTELLIGENCE LAYER for top-3 mistakes (concepts, threat tree,
       teaching spine)
        │
  system prompt v3.5 (stable persona block, Anthropic-cached) + per-user tail
  user turn = USER REQUEST + gameContext + 3 few-shot gold examples
        │
  responseCache check (in-memory LRU 200, 24h; key = promptVer|FEN|skill|msgHash|personaHash)
        │
  prepareMastermindContext:
     turn-1 + moveHistory ⇒ category FORCED to "game_review" (no classifier)
     else Haiku classifier (6 categories; failure ⇒ meta_motivational)
     fetchDataSources (featureDelta REQUIRED; 3s/source)
        │
        ├─ category == game_review  OR  dataSources failed        ◄── THE PROD PATH
        │     buildAsyncSnapshotForMove (parallel w/ LLM — result unused for blocking)
        │     callLLMStream flagship → raw text_delta forwarded VERBATIM to user
        │     post-stream: validateAIResponse, motifGrounding, Stage-9 scans
        │        — ALL LOG-ONLY. game_review text ships EXACTLY as generated.
        │     setCachedResponse → storeAnalysisContext (contextId for /api/chat)
        │
        └─ other categories (position_analysis, …)                ◄── THE PIPELINE (rare)
              snapshot awaited → withPipelineTimeout (50s/40s/30s/25s/20s by category)
              runValidationPipeline:
                 callLLM (non-streaming) → validators in parallel
                 any issue ⇒ retry w/ feedback (game_review 1, position_analysis 2)
                 relational-only issues ⇒ cheap Haiku surgical edit
                 exhausted ⇒ deterministic template fallback
                 TIMEOUT ⇒ resolves with "Still analyzing…" placeholder (cached! §3.5)
              final text re-streamed synthetically in 60-char chunks
```

Key architectural facts:

- **The category router decides whether enforcement exists.** `resolveTurn1Category` forces `game_review` whenever there's no user message but a move history — i.e. every "Analyze my game" click — and route.ts:1698 sends `game_review` to the log-only wing *by design* (latency).
- **The async grounding snapshot races the stream it was meant to gate.** `buildAsyncSnapshotForMove` launches in parallel with `callLLMStream`; by the time sources return, the text has already reached the user. Its result feeds only telemetry on this path.
- **`buildGameContext`'s prompt-side grounding is real and substantial** — this is the half of the architecture that works. Confirmed motifs, chessdb evals, and chess.js-oracle relational facts genuinely enter the prompt with fail-closed "do not assert" instructions ([voter.ts:214-291](../src/lib/grounding/voter.ts)).

### 2.2 The prompt layer

- **System prompt v3.5** ([coachChatPrompt.ts](../src/lib/prompts/coachChatPrompt.ts), ~290 lines): persona manifesto + the load-bearing grounding rules — *"NEVER invent chess analysis beyond what the engine data shows… TRANSLATE engine output"* (:342), *"Do NOT assert any attack, capture, defense, threat, fork, or pin relationship unless it appears in the relevant VERIFIED POSITION FACTS block"* (:347), *"NEVER write out move sequences yourself — they WILL be wrong"* (:328). Version history in comments: 3.1 removed fabricated-dataset "hallucination fuel," 3.2 added hedging (CH-1a), 3.3 reverted it after measurement showed ~0 gain, 3.4 added the relational-facts constraint, 3.5 added the teaching layer.
- **Prompt caching**: stable block gets Anthropic `cache_control: ephemeral`; per-user tail rides uncached. Cache invalidation = bumping `PROMPT_VERSION`.
- **Few-shot layer**: 3 of 20 curated gold-standard examples selected by skill level, injected into the user message — the *only* production consumer of the whole offline "dataset" program (§4).
- **Defects found in the prompt text itself** (§3.6): four mutually contradictory opening-move-cutoff rules; a behavior branch for `BOOK_SOLID`/`BOOK_DUBIOUS` markers no code ever emits; a mandatory `[MAIA_CONTINUATION]` token even when Maia data doesn't exist; eval-perspective documented on the Haiku path but *not* on the richest flagship path; a "200,000+ REAL PUZZLES / Neo4j" claim asserted to the model as fact.

### 2.3 Grounding + tactics (the "Tactical Grounding Program," Stages 1–9)

Two independent mechanisms:

**Pre-generation (prompt injection)** — always on, flag-independent. For each top mistake: `detectMotifs(fenBefore, moveSan)` runs 8 chess.js-based detectors (fork, pin, skewer, discovered attack, removed defender, hanging piece, trapped piece, back-rank) with an "escapability" confirmation pass; `compileVoterResult` merges motifs + chessdb + Lc0 + Maia into per-claim-class confidence (HIGH/MED/LOW/NONE across `tactical_motif`, `material_win`, `mate_in_n`, `positional_plan`, `endgame_wdl`, `user_visibility`) and emits a fail-closed `groundingContext` block ("narrate only these motifs"; "Do not assert: fork, pin, skewer…" when nothing is confirmed).

**Post-generation (claim scanning)** — the Stage-9 validators: four $0 regex scans (`mateInN`, `materialWin`, `positionalClaim`, `userVisibility`) plus `motifGrounding` (tactical keyword ⇒ requires confirmed motif) and LLM-parsed validators (`evalClaim`, `relationalClaim` — Haiku extracts claims, chess.js oracle checks them). Only `runValidationPipeline` *enforces*; every other call site is log-only.

Degradations that define the production reality:

| Source | Status | Consequence |
|---|---|---|
| Stockfish (client) | depth-12 lite, unvalidated | weak + spoofable baseline for everything |
| chessdb.cn | live, plain HTTP | but labels ±(100..199)cp "draw" in prompt text |
| Lc0 | **never deployed** | `positional_plan` can never reach HIGH; veto/upgrade dead; `positionalClaim` false-fires on every strong phrase |
| Maia-2 | deployed; `/predict_at_rating` not live | `user_visibility` no-ops; "don't say obvious" suppression never emitted |
| Syzygy | live (≤7 men) | but prompt injects DTM in plies labeled "moves" (≈2×) |

### 2.4 Validation/enforcement

`runValidationPipeline` ([validators/index.ts:256-550](../src/lib/mastermind/validators/index.ts)) wraps `regenerateUntilValid`: initial non-streaming Sonnet call → validators in parallel → any issue fails validation → same-tier retry with feedback (per-category retry budget: game_review 1, position_analysis 2) → Haiku "surgical edit" if all issues are relational contradictions → deterministic template fallback on exhaustion. `withPipelineTimeout` (50s game_review … 20s meta) *resolves* (never rejects) with a canned "Still analyzing…" string on timeout.

Structural problems (detailed in §3.1): position-anchored validators gated to `{position_analysis}` only; retry gating is the blunt `passed: issues.length === 0` (any warn burns a flagship regeneration — a documented "arming-sequence" time bomb for the day Maia goes live); validator parsers **fail open** on any Haiku hiccup; and the whole pipeline is only reachable on a category users rarely trigger.

### 2.5 Engine layer

Client-side UCI driver ([uciEngine.ts](../src/lib/engine/uciEngine.ts)): sequential per-position sweep, 30s timeout with one depth-4 retry then a **`{cp: 0, depth: 0}` sentinel** indistinguishable from a real 0.00. Sign normalization to white-centric happens in [parseResults.ts:49-56](../src/lib/engine/helpers/parseResults.ts); classification uses the Lichess win% sigmoid + chess.com-style thresholds. The canonical `/analysis` page runs **depth 12** (its own comment claims 16); the legacy panel defaults to 14. `sortLines`' mate comparator is wrong for mixed signs (`a.mate - b.mate` ranks mate:-3 above mate:+2). Mate evals are flattened to ±9999 sentinels for mistake detection (M2→M9 shows as drop 0; M3→+9.0cp shows as a 91-pawn "blunder").

### 2.6 Follow-up chat path (`/api/chat`)

Turn 1 stores an `AnalysisContext` (contextId = sha256(moves+fen+color)[:16], **no uid**) in a **per-lambda in-memory Map** (50 entries, 2h TTL). Follow-ups send `{contextId, userMessage, conversationHistory}` — the schema has **no `fen` field**. The Haiku model receives: the same v3.5 system prompt (with its VERIFIED-POSITION-FACTS hard constraint), a condensed context = grounding rules + `compactGameContext` (PGN + one-sentence-per-move narrative + top-12 mistakes + the PR #163 `buildCurrentPositionFacts` block: final FEN, piece maps, side-to-move, eval). No relational facts. No voter grounding. Everything — grounding, validation, position facts — references the position **frozen at analysis time**.

If the Mastermind flag is on, a thinner pipeline wraps the call (maxRetries 1), but a `fetchDataSources` failure silently falls through to a **plain unvalidated Haiku call**. A cache miss on another lambda instance 404s and the client silently re-runs the full flagship analysis. The no-contextId fallback path runs Haiku under `"You are a helpful chess coach."` with zero context and zero validation — and this is exactly the path the legacy puzzle-explanation components use.

### 2.7 Caching topology (all in-memory, per-instance, on serverless)

`responseCache` (200 entries/24h; enhanced-analysis only), `analysisContextCache` (50/2h), chessdb/Lc0/Maia/tablebase TTL caches, circuit breaker state — all per-warm-lambda. Hit rates in production are near-random; every miss is either a full flagship re-run or a silently absent grounding source.

### 2.8 Config and flags — the production reality

| Flag | Prod state | Effect |
|---|---|---|
| `MASTERMIND_VALIDATORS_ENABLED` | `"true\n"` (survives via `.trim()`) | pipeline armed — but see §3.1 routing |
| `LC0_API_URL` | **unset** | Stage-7 voter tier silently dead |
| `MAIA_API_URL` | set (HF Space) but `/predict_at_rating` not live | user_visibility no-op |
| `OPENAI_API_KEY` | unset | single-provider; all fallback branches dead |
| `TRACKING_ENABLED` | off (tables never created) | zero LLM telemetry rows |
| `AUTH_ENFORCED` | parsed **untrimmed** (`=== "true"`) | the exact `"true\n"` bug class the codebase already got burned by, waiting to happen |
| `FREEMIUM_ENABLED` | off | gates no-op |

### 2.9 Measurement layer

Four offline harnesses produced every number the team cites: ChessQA grounding eval (Track A: **+70pp** short tactics, **0pp** motifs, **−4pp** semantic), GCC-Eval hedging A/B (Track B: killed CH-1a), the 2×2 factual-error eval (located the Haiku 2.8/5 leak → PR #163), and the stage9 fixture smoke. As of today: **all archived numbers are from the retired `claude-sonnet-4-20250514`**; the datasets/venv/prompt snapshots lived in `/tmp` and are gone; the python harnesses can't even `--dry-run`; `tsx` isn't a dependency; nothing runs in CI; the "100% on fixtures" figure is the validator gate passing its own construction set. The team **cannot currently detect an accuracy regression** — and one flagship model swap already shipped blind.

---

## 3. Why it doesn't work — the defect census

Ranked by production impact on user-visible accuracy. Every item was verified against the working tree with file:line evidence by at least one reader agent; items marked ✅ were additionally re-confirmed by adversarial review agents.

### 3.1 ⬛ P0 — The enforcement pipeline never runs where users are

1. **Streamed game reviews ship raw model output.** Clients hardcode `stream: true` ([AICoachChat.tsx:2493](../src/components/AICoachChat.tsx)); turn-1 reviews force category `game_review`; route.ts:1698 routes `game_review` (and any dataSources failure) to the realtime wing where `validateAIResponse`, `motifGrounding`, and all four Stage-9 validators run **after** the text has streamed, log-only. The disclaimer annotation is additionally suppressed for `game_review`. Net: **the flagship's primary output category has zero output-side defense**.
2. **Even the pipeline validates the wrong categories.** `POSITION_ANCHORED_VALIDATOR_CATEGORIES = {position_analysis}` gates evalClaim, featureDeltaCitation, and all Stage-9 scans; for `game_review` only relationalClaim + citation checks can ever fire ([validators/index.ts:120-121, 287-289, 396]).
3. **Async grounding arrives after the horse has bolted.** The snapshot races the stream (route.ts:1709-1721); its outputs feed logs, not gates.
4. **Fail-open everywhere in the enforcement layer**: evalClaim passes on unparseable Haiku JSON ([evalClaim.ts:203-214]); relationalClaim passes on parser throw ([relationalClaim.ts:243-258]); `aiResponseValidator` passes wholesale on invalid FEN (:60-63); `/api/chat` silently downgrades to an unvalidated call when fetchDataSources fails.

*This is the answer to "there is likely some huge missing piece."* The defense exists; production traffic is routed around it.

### 3.2 🟥 P1 — The ground truth itself is weak, forgeable, and occasionally fabricated

5. **`gameEval: z.any()`** ([schemas.ts:137]) — the entire grounding chain enforces the LLM against *whatever the client claims Stockfish said*. No server-side re-check exists on any route.
6. **Depth-12 single-thread lite sweep** on the canonical `/analysis` page (comment claims 16; legacy atom says 14). Coach analysis quality is bounded by this.
7. **Timeout sentinel forges 0.00 evals** (`{cp:0, depth:0}`, [uciEngine.ts:335-338]) — a stalled position in a won game narrates as a massive fake swing/blunder.
8. **`sortLines` mate comparator inverted for mixed signs** ([parseResults.ts:61-63]) — with one mating and one mated line in multipv, `lines[0]` (used everywhere as "the eval") is the *losing* line.
9. **Mate → ±9999 flattening** (route.ts:613-618) — missed-faster-mate invisible; M3→+9.0 reads as a 91-pawn blunder.
10. **Live move badges computed against fabricated `{cp:1}` dummy lines** ([useCurrentPosition.ts:186-199]) — the on-board classification users see mid-game is largely fake.

### 3.3 🟥 P1 — Grounding sources: degraded, mislabeled, or lying to the prompt

11. **Lc0 never deployed** ⇒ `positional_plan` can never reach HIGH ⇒ **`positionalClaim` fires a warn on every strong positional phrase even at +8.0** — and inside the pipeline any warn burns a flagship regeneration or drops to the template fallback. Two design iterations (trigger-band widening) shipped for a service that doesn't exist.
12. **chessdb "draw" mislabeling**: `scoreToOutcome` maps |cp|<200 → "draw" and that text is injected into the prompt — *"ChessDB cloud-eval: +1.50 pawns (draw for side to move)"* ([chessdb.ts:48-53, 130-136]). The model is *taught* wrong outcomes as grounding.
13. **Syzygy DTM units injected wrong**: Lichess DTM is signed plies; the validator normalizes (`ceil(dtm/2)`) but the **prompt** injects raw plies as "moves" (route.ts:1464, voter.ts:224) — mate distances ~2× too large, which the mate validator (±1 tolerance) would then flag if it ran.
14. **Forced mate for Black can never be grounded**: voter counts only `mate > 0` on a white-centric value ([voter.ts:118]) — a correct "forced mate" claim about Black fires `mate_claim_unsupported`. (Also ANDed with a *side-to-move* chessdb outcome — mixed conventions in one condition.)
15. **Maia visibility layer has NEVER worked in any environment** — verified: the server client calls `POST ${MAIA_API_URL}/predict_at_rating` ([maia.ts:111]) but `maia-service/maia_server.py` implements only `/health`, `/predict`, and `/` — **the endpoint does not exist and never has**. Every `queryMaiaAtRating` call 404s (silently caught). The existing `/predict` endpoint already accepts `{fen, rating, opponent_rating}` and computes the full move-probability table, so the client can be repointed without a service redeploy. Also: **misleading prompt line** emitted exactly when Lc0 *was* consulted ([voter.ts:271-276]).
16. **Escapability "confirmation" is a 1-ply SEE heuristic** that ignores pins and legality, despite the header claiming a 2-ply forcing search — false-confirmed motifs flow into "TACTICAL FACTS (confirmed)" prompt text.
17. **Prompt-injection grounding path skips the circuit breaker and Syzygy entirely** (route.ts:669-688) — endgame ground truth never appears in game-review prompts.

### 3.4 🟥 P1 — The Haiku follow-up surface (most user turns)

18. **Impossible constraint**: the shared v3.5 system prompt forbids all attack/capture/pin/fork claims not present in a VERIFIED POSITION FACTS block — but `buildCompactGameContext` never injects one. Every follow-up turn must either violate its own rules (ungrounded tactical talk) or refuse to discuss tactics.
19. **Frozen position**: no `fen` in the chat schema; grounding, positionFacts, and the regex validator all reference the analysis-time final position even when the user navigates the board and asks "what should I play here?" — with false-positive "may be inaccurate" disclaimers stapled to *correct* answers about earlier positions on the flag-off wing.
20. **Cross-user context collision**: contextId has no uid; two users analyzing the same game share one entry, last-write-wins — wrong persona, wrong rating, wrong initialAnalysis.
21. **Puzzle surfaces are the weakest-grounded LLM calls in the product**: `/api/puzzle-chat` has no validation of any kind on any turn; the legacy puzzle-explanation components smuggle their system prompt into a user message on the no-context `/api/chat` fallback ("You are a helpful chess coach.", client-chosen max_tokens, zero facts).

### 3.5 🟧 P2 — Caches that serve wrong or empty answers

22. **Timeout placeholder is cached for 24h**: "Still analyzing — the deep-validation pass took longer than expected…" scores 1.0 on the regex validator, is `setCachedResponse`'d, and replays from cache for every identical question on that FEN/persona ([pipelineTimeout.ts:289-297] + route.ts:2089). Same for the robotic template fallback.
23. **responseCache keyed on final FEN, not move history** — two games transposing into the same position share a response narrating the wrong game's moves; personaSignature excludes username while responses sometimes quote it (cross-user leak).
24. **Cache hit drops the contextId** ⇒ every subsequent message in that chat re-fires a **full flagship deep analysis** instead of the Haiku fast path — inverted cost behavior.
25. **Everything in-memory on serverless** — context 404s → silent full re-analysis; breaker/caches per-instance.

### 3.6 🟧 P2 — Prompt-text defects (flagship path)

26. Four contradictory opening-move-cutoff rules in one prompt (moves 1-15 / 1-10 / after 10 / never 1-10) — plus a WHAT-TO-COVER rule that contradicts all of them.
27. Dead `BOOK_SOLID`/`BOOK_DUBIOUS` policy branch — no code emits those markers.
28. Mandatory `[CONTINUATION]`/`[MAIA_CONTINUATION]` tokens in every insight even when Maia was never queried — broken/empty continuation slots client-side.
29. Eval perspective documented on the Haiku path but **not** on the flagship MOVE-BY-MOVE lines — the model infers the sign convention on the richest path.
30. `chess.js` game replay silently truncates on the first bad SAN (route.ts:493-495 etc.) — wrong final position, wrong FEN maps, all downstream grounding checks the wrong board.
31. `validateMoveSuggestions` checks all suggestions against the *final* position — "best was Qh5+" at move 12 validated against move 40's board → systematic false warnings that can block response caching.

### 3.7 🟥 P1 — The measurement void

32. Every archived accuracy number is from a retired model; scripts repointed (PR #185) but never re-run — **zero accuracy measurement exists for the flagship actually serving production**.
33. Harnesses non-runnable (deleted /tmp datasets/venv/prompt snapshots; `tsx` not a dependency; python-chess absent). Nothing in CI. No prod telemetry (tracking tables never created; capture no-ops).
34. Known judge-validity problems: Sonnet judging Sonnet (self-preference) in the 2×2 that justified PR #163; Haiku judge with sign-flipping deltas in Track B; headline +70pp is near-tautological (answer present in injected context); the actual `detectMotifs` detector and the shipped positionFacts fix were **never** directly measured.
35. Per-validator **precision** never tested — each false fire now costs a flagship regeneration; the Maia arming-sequence regen-storm is documented and un-mitigated.

### 3.8 🟨 P3 — Dead code, dead features, misc

36. `generatePuzzleRecommendations` fetches `http://localhost:3000/api/mistake-puzzles` — dead on Vercel; puzzle recs silently ship empty on all four branches (route.ts:1243).
37. Dead: `criticalMoments.ts`/`complexity.ts`, `gameDebrief.ts`, `openingExplanation.ts`, `chessMoveExplainer.ts` (stub "principles": any move containing "N" or "B" = development), local Maia/lc0 spawner quartet (impossible on Vercel; contains a piece-value heuristic masquerading as "Maia" if ever re-wired), `buildSyncVoterSnapshot`, jsdelivr CDN worker (supply-chain risk if mounted), `/api/commentary-by-fen` (zero callers; docstring claims a 298k dataset that was never obtained — Neo4j holds 10 synthetic comments).
38. `AUTH_ENFORCED`/`SKIP_RETRIEVAL_SELFTEST` parsed untrimmed; `ANTHROPIC_API_KEY` never trimmed (a trailing `\n` would kill every call with an invalid-header TypeError); memoized flags need a redeploy to change; classifier low-confidence default (`meta_motivational`) gives ambiguous heavy questions the smallest budget; `/api/keep-maia-alive` publicly callable when `CRON_SECRET` unset; chessdb over plain HTTP (game positions leave the server unencrypted; MITM could alter "ground truth"); client `temperature` up to 2 passes through to Anthropic (400s at >1.0) on the chat fallback; KNOWN_ISSUES #1 (concept retrieval fails open to deterministic fork puzzles) and #2 (PGN upload never asks player perspective → coach critiques the opponent) recorded 2026-04-26, still open.

### The five-sentence causal story

Users click "Analyze my game" → the review streams from Sonnet with real engine facts *in* the prompt but **nothing checking what comes out**, grounded against depth-12 client evals with occasional fabricated values and wrong outcome labels injected as "ground truth." They ask follow-ups → Haiku answers under rules it cannot satisfy, about a position that may no longer be on the board. When the enforcing pipeline does run, half its validators are dead-source no-ops and one reliably false-fires, burning regenerations or shipping a canned non-answer that then gets **cached for a day**. Nobody sees any of this because there is no telemetry, no CI eval, and no runnable harness. The result is exactly what users experience: fluent, persona-consistent coaching prose with confident factual chess errors — *not* because the model is trained wrong, but because the system streams first and asks questions later.

---

## 4. The "training" question, answered definitively

**Nothing in this product trains or fine-tunes any model.** Verified by a dedicated audit agent across both repos:

- All LLM calls use stock model IDs (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, dead `gpt-4o[-mini]` fallback). No `ft:` IDs anywhere. No fine-tuning API usage anywhere.
- The **data pipeline** (`scripts/data-pipeline/`) exists to curate ~60 gold-standard *few-shot prompt examples* — its own README says verbatim: *"These datasets feed the **prompt engineering** layer — they are NOT used for model fine-tuning."* Its sole production consumer is `selectExamples(…, 3)` injecting 3 examples as prompt text.
- The **Jhamtani experiments** (root-level `generate_jhamtani_style_dataset.js`, `jhamtani_dataset_example*.js/json`, `chess_move_explainer.py`, `your_system_vs_jhamtani_comparison.md`) are dead exploration: the real 298k GameKnot dataset was **never obtained** (the request email still says "[Your name will go here]"); the vendored paper repo contains only crawler code and third-party PyTorch code nothing invokes; the Neo4j commentary loader fell back to **10 hardcoded synthetic comments**; the one retrieval endpoint built over them has **zero in-app callers**.
- Maia-2 / Lc0 / Stockfish NNUE weights are **consumed pretrained**, never produced. The only training ever *planned* was a 128-dim position-encoder (`02-train-embed.py`) that was never written.

**Implication:** "We are training it wrong" is the wrong diagnosis, and — more useful — *fine-tuning is not the fix either*. The academic and industry evidence (§5) says the same thing the product's own architecture page says: a fine-tuned chess LLM still hallucinates; what separates trustworthy products is **what surrounds the model** — the contract of facts going in and the referee on the way out. Both of those are exactly the broken layers cataloged in §3.

---

## 5. How everyone else builds this — competitive & landscape architectures

*(Sources: primary — official docs, patents, papers, an AI Engineer Europe talk by Take Take Take's team, job postings, direct page fetches; forum — chess.com forums, a TTT teardown. §5.2–5.7 were verified 2026-07-05/06 via a **5-model cross-LLM research pass** (ChatGPT, Perplexity, Gemini, Grok, Claude; Manus blank) adjudicated against direct web fetches; §5.6's method note explains how single-model hallucinations — including two of my own over-corrections — were filtered out. Full source list in Appendix B.)*

### 5.1 The five grounding architectures that exist in the wild

| # | Architecture | Who uses it | Hallucination risk | Ceiling |
|---|---|---|---|---|
| A | **Closed-world symbolic**: engine classification + feature extraction + templated NLG. No LLM. | chess.com Game Review Coach; DecodeChess | ~zero (only emits derivable sentences) | Low — generic, users call it "vague/useless" |
| B | **End-to-end learned commentary** from scraped human commentary | Jhamtani 2018 lineage; Chris Butner's ChessCoach (2021) | High — fluent but unverified | Historical; field abandoned it |
| C | **Symbolic engine + controllable LM hybrid** | FAIR 2022 (arXiv 2212.08195) | Medium | Bridge era |
| D | **Expert-model concept extraction → typed data contract → LLM verbalizes only the contract** | **Take Take Take** (production); CCC/NAACL-2025 (academic) | Low — LLM can't speak outside the contract | **Current production state of the art** |
| E | **Weight-level grounding** (train the LLM itself on engine/expert traces) | Master Distillation 2026 (research); ChessGPT; DeepMind ChessBench | Medium; research-only | Unproven in product |
| F | **LLM + engine-fact injection + verification loop** (facts in the prompt, referee on the output) | chess.com Celebrity Coach (human reviewers as the referee); thinkfish (FEN before/after injection measurably cut motif hallucinations); **Chess Masti's design intent** | Low *if the referee runs* | This is our architecture — with the referee bypassed (§3.1) |
| G | **Human-likelihood grounding, no NLG** (visualize instead of verbalize) | maiachess.com platform (Maia-2 + Stockfish visual analytics, launched July 2025); Noctie.ai (commercial, 1B+ human games) | zero (no text) | Sidesteps the problem entirely |

### 5.2 chess.com (the incumbent)

**Game Review Coach: architecture A, confirmed non-LLM** through mid-2026: server engine evaluates every move → 9 classifications → "Coach" emits short templated text + one-line game summary. Best evidence: their **"Chess Explanation Engineer"** job post ("writing chess algorithms to recognize everything interesting about any move") and staff statements ("Engines don't explain, just give moves. The site… is building code to try to translate that"). WintrCat's open-source **freechess/WintrChess** reproduces the classification + explanation text with pure heuristics — proof no LLM is needed for this tier. Grounding is trivially guaranteed; the recurring user complaint is genericness — an April 2026 forum thread rates Take Take Take's AI review "far better than the chess.com Coach."

**But note the November 2025 pivot** (refined 2026-07-06): chess.com's separate **"Play Celebrity Coach"** delivers guidance in the **cloned voices** of Hikaru Nakamura, Levy Rozman, Magnus Carlsen, Danny Rensch, Anna Cramling, and the Botez sisters via **ElevenLabs TTS/voice-cloning** — but its runtime is a **dialogue tree, not open-ended LLM generation** (chess.com PM Gabe Jacobs, per GamesBeat; ElevenLabs' own blog). So even the incumbent's flashiest "AI coach" keeps the *chess reasoning* on rails (templated/dialogue-tree over engine facts) and uses generative AI only for the *voice* — the strongest possible signal that nobody ships live, unrefereed LLM chess prose at scale. (The Nov-2025 framing that "an LLM writes the text, the team reviews it for accuracy" is consistent with LLM-*assisted content authoring* reviewed by humans offline, not live per-query inference.)

### 5.3 DecodeChess

**Architecture A, maximalist**: Stockfish NNUE + proprietary symbolic XAI that builds "deduction chains" over human concepts (threats, plans, piece functionality), rendered in rich template language — and, distinctively, **every concept is verified for relevance against the engine search before it is shown**, which structurally precludes LLM-style hallucination. Provenance (verified 2026-07-06): made by **Decodea LTD** (formerly ChesStories), an Israeli company **founded 2015 by Zeev Fine (CEO) and Ofer Shamai**; live SaaS in 5 languages, from **$8.25/mo**, explicitly aimed at ≤2000 Elo; per its own FAQ the deployed engine is **Stockfish 12 NNUE at depth ~24** (possibly dated). DeepMind cited it in 2021 for human-understandable position explanations. It is **not dormant** (actively priced/marketed), correcting an earlier guess. Lesson for us: you can get remarkably rich, hallucination-proof explanations with zero LLM — but the language ceiling, the ≤2000 cap, and the dated non-conversational UX are exactly the gap Chess Masti's UI + conversational-coach strategy targets.

### 5.4 Take Take Take (Magnus Carlsen's app) — the reference implementation

**Architecture D, the strongest documented grounded-LLM commentary pipeline shipping today** (per their AI Engineer Europe talk):

1. a deterministic **Stockfish** pass analyses the board — the LLM is *never* asked to read or calculate the position;
2. a **context-extraction module** runs programmatic tactical/positional **detectors** (pins, forks, hangs, structural damage) plus a **Maia** ("Maya") neural net for human-move probability, deciding *what is worth explaining at the player's level*;
3. that is emitted as a **structured JSON "data contract, with every field precisely defined"**;
4. an LLM — accessed via **OpenRouter** so they can hot-swap the latest Gemini / Claude / GPT (they tested Gemini 3 Flash, Claude Opus 4.6, GPT-5 Mini against a ~3-second latency target) — **translates that JSON into prose only**, never adding chess facts;
5. quality is policed by an **"LLM-as-a-judge"** automated eval, and a downvote triggers a genuinely novel ops loop: the event posts to **Slack** and is injected into a **Claude Code session over an MCP server**, which investigates the bad comment, rewrites the offending prompt/detector, and **auto-submits a GitHub pull request** (SMEs approve).

*(Steps 4–5 verified 2026-07-06: the "System 2 AI" writeup at [ability.ai](https://www.ability.ai/blog/system-2-ai-hallucinations-operations) confirms OpenRouter model-swapping, the LLM-as-a-judge framework, the Stockfish→detectors→Maia→JSON contract, and the Slack + Claude-Code-via-MCP → auto-PR feedback loop, attributing them to Take Take Take's engineering team — independently corroborating the AI-Engineer-Europe talk and a cross-LLM research pass.)*

The architectural difference vs Chess Masti is *not* the ingredients — we have Stockfish, Maia, tactical detectors, and typed grounding blocks too. It's the **direction of authority**: TTT's LLM verbalizes a closed contract (facts→prose), while ours streams open prose that validators may later grumble about in logs (prose→facts, unenforced). Their eval loop (human downvote → agent triage → SME sign-off) is also exactly the standing measurement we lack.

*Provenance + independent confirmation (verified 2026-07-06):* Take Take Take is co-founded by **Fantasychess AS and Magnus Carlsen**, ~$3M raised (Peter Thiel, Jim Breyer, Breakthrough Initiatives); app launched late 2024, App Store 4.4 / Play 5.0. Its own copy pitches "an intelligent game review that speaks like a human, not an engine… clear, honest feedback without engine jargon." The architecture above (my prior source — the AI Engineer Europe talk) is now **triple-confirmed**: a critic who reverse-engineered the feature ([intermediatemoves.substack.com, "TakeTakeTake Game Review is a Slop Machine"](https://intermediatemoves.substack.com/p/taketaketake-game-review-is-a-slop)) independently describes the exact same pipeline — the LLM receives "current position, moves played, Stockfish's principal variation, and evaluation," then writes prose — and a cross-LLM research pass (ChatGPT with browsing) returned the same Stockfish + Maia + detector → LLM (Gemini 3 Flash / Claude Opus 4.6 / GPT-5 Mini) description. **The instructive part is that the contract architecture alone did NOT prevent hallucination** (see §5.7): the closed contract constrains *what facts go in*, but TTT ships the LLM's prose without a hard output-side check, and the errors are exactly the confident position-fact errors we saw in our own 2×2 — evidence that the data-contract is necessary but not sufficient, and that an *output* referee (our PR-B correction loop) is the missing half.

### 5.5 Maia / academic lineage (what feeds architecture D)

Maia (KDD 2020) / Maia-2 (NeurIPS 2024): rating-conditioned human-move prediction — used by products as a *salience/visibility* layer ("was this blunder predictable for a 1200?"), not NLG. CCC (NAACL 2025) is the academic form of TTT's design: expert model extracts and **prioritizes** concepts, LLM only verbalizes, GCC-Eval judges. The 2024-2026 LLM-chess-factuality literature (dynomight's experiments; Karvonen's board-state probes; the LLM Chess leaderboard's legality/hallucination benchmarks; "line-of-sight" hallucination taxonomies) converges on: raw LLMs cannot be trusted with board state, but they hold up when the state is supplied and constrained. Master Distillation (2026, Maia-lab-adjacent) is the emerging architecture-E counterpoint — distilling engine reasoning traces into a small LLM — worth watching, not worth betting the product on.

### 5.6 Chessvia and chesscoach.dev (verified across a 5-model cross-LLM pass + direct web fetches, 2026-07-05/06)

**chesscoach.dev IS Take Take Take today; its rumored indie origin is plausible but unverified.** What is *certain* (three independent fetches — mine ×2 + Claude ×1): both `chesscoach.dev/` and `chesscoach.dev/faq` issue a 308 permanent redirect to `taketaketake.com`, and its pages carry TTT branding. What is *not* certain — and where I over-corrected in two earlier drafts, so this is the locked final read: two of the five research models (Gemini, Grok) assert chesscoach.dev *began* as an indie "4 critical moments" coach by developer **gm-ai-agent** (citing a real r/chess launch thread, ~mid-2025) that was later absorbed into TTT. But the most rigorous model (Claude, which actually fetched the domain) does **not** make that link and treats chesscoach.dev as simply TTT, and my own targeted search for the `gm-ai-agent ↔ chesscoach.dev` connection returned nothing. So: the gm-ai-agent indie coach is real; that it *is* chesscoach.dev specifically (vs. a separate indie project two models conflated with the domain) is **unproven**. Bottom line for competitive purposes — **chesscoach.dev is not an independent competitor; it is Take Take Take.** (My first draft's claim that ChatGPT "fabricated" the whole backstory was too harsh; the indie coach exists. My second draft's claim that chesscoach.dev "was absorbed from that indie project" was too confident. Both are now reconciled to the evidence above.) Chris Butner's open-source `chrisbutner.github.io/ChessCoach` (architecture B, §5.1) remains a genuinely separate, unrelated project — do not conflate the three "chess coach" names.

**Chessvia** (correct domain **chessvia.ai**, not .com) is a real, live product: an AI coach **"Chessy"** billed as "the world's first voice-enabled, multi-modal chess AI." Verified: voice/text/**image** ("chess vision") interaction and live mid-game Q&A, Chess.com + Lichess import + PGN, selectable personas ("Roasty / Grandmaster / Hustler Chessy"), per-move "What to do / What to avoid / Key idea" cards, freemium (positioned ~$2–3/hr vs human coaches; some listings say $7–$30/mo). **Engine is now known: Stockfish 17.1 running locally in the browser** — verbatim from its Chrome Web Store extension listing ("Stockfish 17.1 evaluation running locally in your browser, fast, private, no server needed"), the same client-side-WASM pattern Chess Masti uses. **The LLM/vendor and grounding method remain genuinely undisclosed** (a "ChessviaGPT" custom GPT hints at OpenAI experimentation but doesn't confirm the production model); no company/team is named on any primary source. ChatGPT's specific claims — a **"Chicago startup"** and a Reddit quote ("burned 3000 tokens") — could **not** be verified (no matching thread on direct search; no source discloses the team), so treat them as **confabulated**. Verifiable sentiment is thin: a chess.com forum user merely notes it "looks pretty solid," and Grok found it grouped as "plainly bad" in r/chessbeginners (Sep 2025) — no substantive independent accuracy test exists. Net: Chessvia = Stockfish-17.1-in-browser + an **undisclosed** LLM over engine context, voice-first freemium — architecturally the "wrapper tail" with no published verification layer, the bucket an un-enforced Chess Masti sat in before this week's fixes.

**Methodology note (why the 5-model pass worked, and its own failure modes):** the forced VERIFIED/INFERRED/UNKNOWN split + running the same prompt across ChatGPT, Perplexity, Gemini, Grok, and Claude (Manus returned a blank template) exposed exactly the failure it was built to catch — and caught *my own* over-corrections. Perplexity (no browsing) honestly abstained on the niche products. ChatGPT (browsing) nailed browsable facts but confabulated un-browsable provenance (Chessvia's "Chicago," verbatim Reddit quotes). Gemini's very specific TTT claims (OpenRouter, Claude-Code-via-MCP auto-PR loop) *looked* like hallucination but **verified true** against a primary source. Claude (browsing) was the most rigorous — it disambiguated the three "chess coach" names up front and refused the gm-ai-agent↔chesscoach.dev link the other two asserted. The adjudication rule that held: **trust a claim only when it is primary-sourced or corroborated by an independent model *and* a fetched page; single-model specifics that no page confirms are the tell — and no single model, including me on the first pass, is exempt.** The competitive claim to earn remains "grounded, verified, and it shows": the wrapper tail (Chessvia, ChessLogix, wrappers) can't prove it, chess.com stays deliberately on-rails, and even TTT — the best-engineered contract pipeline in the market — ships unrefereed prose that hallucinates (§5.4/§5.7).

### 5.7 Voice of the user (forums + verified 2026-07-06)

Recurring failure modes users cite for AI chess coaches: wrong piece placements, illegal or impossible suggested lines, analysis of a move the player didn't make, generic advice ("develop your pieces, control the center") regardless of position. Users consistently rate *specific, position-true, level-appropriate* explanation as the differentiator — which is precisely a grounding + salience problem (architectures A/D), never a fluency problem. This matches our own 2×2 finding: the leak was confident *factual position errors*, not tone.

The sharpest documented example is the **Take Take Take "slop machine" teardown** ([intermediatemoves.substack.com](https://intermediatemoves.substack.com/p/taketaketake-game-review-is-a-slop)) — worth reading in full because TTT is the *best-architected* competitor and still produces these, which is the whole lesson. Verbatim errors the author caught: (1) a claim that "a rook on d3 has 'cut the defense' from a bishop on b3 of a queen on e3 — that's… not how a bishop moves" (a line-of-sight / piece-movement hallucination); (2) 1…e6 justified as "blunting the diagonal for White's light-squared bishop" when that bishop had not developed; (3) a one-move material blunder softened to "incredibly risky" instead of named as a blunder; (4) a queen already developed described as being moved "to develop the remaining pieces as fast as possible." The author's verdict — "no connection to what the words actually mean… likely to confuse beginner players" — is a precise description of confident factual-position error, i.e. our §3 failure class, in a *shipping* product that already has the data-contract architecture. The takeaway for us is direct: the contract (facts in) is necessary but the output referee (facts checked on the way out — our PR-B correction loop) is what actually stops these, and no competitor we found ships that output-side check.

---

## 6. Implications → fix plan

The full prioritized plan (with PR-sized workstreams, verification gates, and effort estimates) is in **[COACH_ACCURACY_FIX_PLAN.md](./COACH_ACCURACY_FIX_PLAN.md)**. The shape of it, from this audit:

1. **Close the enforcement hole on the dominant path** (§3.1) — buffer-validate-then-stream for game_review (or validate-while-streaming with correction), extend position-anchored validators beyond `position_analysis`, make async grounding a gate not a log.
2. **Stop feeding the model false facts** (§3.3) — fix chessdb draw labels, DTM units, Black-mate asymmetry, Lc0-absent voter semantics (and either deploy the Lc0 service or make the voter honest about its absence so `positionalClaim` stops false-firing).
3. **Fix the Haiku surface** (§3.4) — inject relational facts per-turn, accept a current FEN in the chat schema, validate against the position being discussed.
4. **Harden the ground truth** (§3.2) — validate `gameEval` server-side (schema + sanity), fix the sort/sentinel/±9999 bugs, raise or re-check analysis depth server-side for the positions the coach actually narrates.
5. **Fix the caches** (§3.5) — never cache placeholders/fallbacks, key by game not final FEN, return contextId on cache hits.
6. **Rebuild measurement as a standing capability** (§3.7) — vendor the datasets, make harnesses runnable offline in CI on fixtures, wire the tracking tables, add a small always-on prod sample with claim-level checks. *No accuracy work should ship un-measured again.*
7. **Adopt the contract direction** (§5.4) — long-term, invert the flagship path from "prose with hints" to "verbalize the grounded contract," which is what the best product in the market already does.

---

## Appendix A — Subsystem file index

| Subsystem | Core files |
|---|---|
| Turn-1 route | `src/app/api/enhanced-analysis/route.ts` (2,808 lines: context builders, 4 response branches, caches, puzzle recs) |
| Mastermind pipeline | `src/lib/mastermind/{routeHelpers,wireValidators,pipelineTimeout}.ts`, `validators/{index,regenerate,fallback,evalClaim,relationalClaim,mateInN,materialWin,positionalClaim,userVisibility,motifGrounding,streamingStage9}.ts` |
| Grounding | `src/lib/grounding/{voter,voterSnapshot,circuitBreaker,chessdb,lc0,maia,positionConfidence}.ts`, `src/lib/mastermind/lichessTablebase.ts` |
| Tactics | `src/lib/tactics/{index,escapability,utils}.ts`, `motifs/*` (8 detectors) |
| Prompts | `src/lib/prompts/{coachChatPrompt,puzzleChatPrompt,puzzleHintPrompts,puzzlePatternAllowlist,puzzleExplanation}.ts`, `src/data/goldStandardExamples.ts`, `src/lib/mastermind/positionFacts.ts`, `src/lib/relational/relationalFactsBuilder.ts` |
| Chat path | `src/app/api/chat/route.ts`, `src/app/api/classify-intent/route.ts`, `src/app/api/puzzle-chat/route.ts`, `src/lib/{analysisContextCache,responseCache}.ts` |
| Provider/config | `src/lib/{llmProvider,llmPricing}.ts`, `src/env.ts`, `src/instrumentation.ts` |
| Engine | `src/lib/engine/{uciEngine,worker,shared,stockfish17,…}.ts`, `helpers/{parseResults,winPercentage,moveClassification,accuracy,estimateElo}.ts` |
| Eval | `scripts/eval/{chessqa_grounding_eval,gcceval_hedge_eval,factual_error_eval}.py`, `stage9-live-test.ts`, `scripts/mastermind/validator-gate-dryrun.ts` |
| History docs | `MASTERMIND_CONTEXT/{COACH_ACCURACY_MASTER_PLAN,CALIBRATED_HEDGING_DEFERRED,POSITION_FACT_GROUNDING_PLAN,PR_GROUNDING_FIXES_PLAN,PR_STAGE9_ASYNC_GROUNDING_PLAN,TACTICAL_GROUNDING_HANDOFF,MASTERMIND_FAILURE_MODES,ACCURACY_BENCHMARK_SCOPE}.md`, `KNOWN_ISSUES.md` |

## Appendix B — External sources (competitor/landscape research)

Primary: chess.com Help Center (Game Review mechanics); chess.com "Chess Explanation Engineer" job post; Jhamtani et al. ACL 2018 (aclanthology.org/P18-1154); Zang et al. ACL 2019 (P19-1597); Lee et al. FAIR 2022 (arXiv 2212.08195); Kim et al. NAACL 2025 CCC + GCC-Eval (arXiv 2410.20811); McIlroy-Young et al. KDD 2020 (Maia); Tang et al. NeurIPS 2024 (Maia-2); CMU Allie (ICLR 2025); Tang et al. 2026 Master Distillation (arXiv 2603.20510); UniMaia (arXiv 2605.27767); maiachess.com; decodechess.com/about; Chris Butner's ChessCoach (chrisbutner.github.io/ChessCoach); Take Take Take AI Engineer Europe talk (youtube.com/watch?v=FlzpEGHNVKQ).
Secondary: StartupHub.ai writeup of the TTT talk; dynomight.net/chess (+ HN threads); LLM Chess Leaderboard (maxim-saplin.github.io/llm_chess, arXiv 2512.01992); "Why LLMs Can't Play Chess" (nicowesterdale.com, Dec 2025).
Forum: chess.com forums — staff statements on Coach mechanics (Martin_Stahl, 2022-2024), Coach-quality complaint threads, "AI Powered Game Review?" (Apr 2026).
*Reddit was network-blocked during the original 2026-07-05 run. A 2026-07-05/06 follow-up (5-model cross-LLM pass — ChatGPT/Perplexity/Gemini/Grok/Claude; Manus blank — + direct web fetches) closed the Chessvia / chesscoach.dev / TTT gaps; see §5.2–5.7. Load-bearing added/verified sources: **Chessvia** — chessvia.ai FAQ + AlternativeTo + its **Chrome Web Store extension listing (Stockfish 17.1 in-browser; LLM undisclosed)**; **chesscoach.dev** → taketaketake.com 308 redirect (= TTT today; indie gm-ai-agent origin asserted by 2 models, unverified); **Take Take Take** — taketaketake.com/about, Euronews + Magnus Carlsen's X announcement (maker Fantasychess AS + Magnus, Oct 25 2024 launch, ~$3M Thiel/Breyer), the StartupHub.ai writeup of the Dole/Steinskog AI-Engineer-Europe talk, and [ability.ai "System 2 AI"](https://www.ability.ai/blog/system-2-ai-hallucinations-operations) (independently confirms OpenRouter + LLM-as-judge + Stockfish/detectors/Maia→JSON contract→LLM + Slack/Claude-Code-MCP→auto-PR loop), plus intermediatemoves.substack.com "Slop Machine" (concrete hallucination examples); **DecodeChess** — decodechess.com/about + company DBs (Decodea LTD, Fine + Shamai, 2015, Stockfish 12 NNUE); **chess.com** — GamesBeat/ElevenLabs (Celebrity Coach = dialogue tree + voice cloning). Disclosed-stack wrapper example: **ChessLogix** (chesslogix.com) states "Stockfish 17, depth 22, multi-PV 3 + GPT-4 / Claude." Remaining thin spot: substantive independent r/chess/X accuracy threads on Chessvia specifically — none surfaced; a dedicated Grok X-access sweep is the best untried avenue.*
