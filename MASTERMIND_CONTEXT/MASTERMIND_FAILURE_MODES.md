# MASTERMIND_FAILURE_MODES.md

## SUMMARY

Where the system collapses, with concrete file:line citations and named recovery paths. Ten failure classes the Mastermind agent must reason about: **Maia cold start** (HF Spaces sleeps after 48h, 30-90s warm-up); **Stockfish WASM init** (no SharedArrayBuffer / no WASM degrades to single-thread or unavailable); **hallucination validator catch paths** (invalid FEN swallowed silently, footnote-append on errors, eval-mismatch unimplemented); **Neo4j retrieval edge cases** (driver unconfigured, anchor unclassified, low-rating-band sparsity returns empty pool, theme not in graph); **FEN cosine degeneracy** (trivial endgames produce near-zero vectors that cluster artificially); **opening detector ambiguity** (transposition collisions); **two-tier Anthropic/OpenAI fallback paths** (key-prefix invalidation, Anthropic 5xx triggering OpenAI); **SSE stream timeouts** (Anthropic stream interrupts, OpenAI sent as a single non-streaming chunk); **OpenAI fallback triggers and operational gap** (logic exists, key not configured per CLAUDE.md); **Stage 3 grounding** (resolution-point heuristic misclassification, tablebase rate limit / position-rejected, invalid-FEN handling — all pre-emptively documented for the design-only Stage 3 tools per FUTURE_IDEAS.md §1). Each entry below names the trigger, cites the originating code path, describes the failure mode, and names the recovery path. Every recovery path is verified against shipped code; design-only recoveries are flagged. Cross-reference: tool-level failure modes are summarized inline in MASTERMIND_TOOLS.md; this file is the authoritative deep-dive.

---

## 1. Maia cold start (HF Spaces sleep)

- **Trigger**: First call to `/predict` after the HF Space has been idle ≥48h, or after a model update / redeploy.
- **Cited code path**: [api/keep-maia-alive/route.ts:42-54](../src/app/api/keep-maia-alive/route.ts#L42-L54) — the keep-alive endpoint's own comment: "HF Spaces can take 30-90s to wake from SLEEPING state, so use a long timeout. We don't care about the response body — just want HF to re-spin the container." 110-second `AbortController` budget at line 48.
- **Failure mode**: A direct user-driven call to `/predict` ([api/maia-predict/route.ts:38-46](../src/app/api/maia-predict/route.ts#L38-L46)) hits the cold container and times out the user's interactive turn. Symptoms: 502/503 from the Vercel route, fallback flag in the response body.
- **Recovery path**: The Vercel cron at [vercel.json](../vercel.json) fires the keep-alive every 12h to keep the Space warm. If a user hits the cold path anyway, [api/maia-predict/route.ts:48-58](../src/app/api/maia-predict/route.ts#L48-L58) returns `{error: "Maia-2 service error", fallback: true}` and the agent should switch the `predict_human_move` tool to its design-only fallback (Stockfish at low depth) — see MASTERMIND_TOOLS.md `engine_analyze.predict_human_move`.

## 2. Stockfish WASM init

- **Trigger**: Browser lacks WASM support, or lacks SharedArrayBuffer (multi-thread WASM).
- **Cited code path**: [engine/stockfish17.ts:5-13](../src/lib/engine/stockfish17.ts#L5-L13) checks `Stockfish17.isSupported()` (delegates to `isWasmSupported()` at [engine/shared.ts:7](../src/lib/engine/shared.ts#L7)); multi-thread detection at [engine/shared.ts:13](../src/lib/engine/shared.ts#L13).
- **Failure mode**: If WASM is unavailable, `Stockfish17.create()` throws `"Stockfish 17 is not supported"`. If multi-thread is unavailable, the engine path silently switches to single-thread by appending `"-single"` to the engine binary path ([stockfish17.ts:14-16](../src/lib/engine/stockfish17.ts#L14-L16)) — search depth is much slower, but not failing. Browsers without cross-origin isolation (no `COOP`/`COEP` headers) lose multi-thread.
- **Recovery path**: Single-thread fallback is automatic. WASM-unsupported is a hard fail — the agent's `analyze_position` tool should return an engine-unavailable error, and the agent should skip any tool calls that depend on engine truth (eval, best move, multipv) and lean on Maia or LLM-only coaching with reduced confidence claims.

## 3. Hallucination validator — catch paths

- **Trigger**: LLM emits a piece-on-square claim or move suggestion the actual board state can't support; or the FEN is malformed; or the LLM mentions a square that doesn't exist (`"i4"`, `"a9"`).
- **Cited code path**: [aiResponseValidator.ts:38-86](../src/lib/aiResponseValidator.ts#L38-L86) (`validateAIResponse`) and helpers `validatePieceOnSquareClaims` ([aiResponseValidator.ts:92-124](../src/lib/aiResponseValidator.ts#L92-L124)) and `validateMoveSuggestions` ([aiResponseValidator.ts:154+](../src/lib/aiResponseValidator.ts#L154)).
- **Failure modes**:
  - **Invalid FEN swallowed**. [aiResponseValidator.ts:60-63](../src/lib/aiResponseValidator.ts#L60-L63) catches `new Chess(fen)` errors and **passes the response through unvalidated** with a `console.warn`. The user sees the LLM's raw output with zero verification.
  - **Footnote-append, not regenerate**. On error, [aiResponseValidator.ts:71-78](../src/lib/aiResponseValidator.ts#L71-L78) appends a generic disclaimer ("Some claims in this analysis may be inaccurate. Please verify against the board position.") rather than asking the model to regenerate. The user gets the wrong claim plus a disclaimer.
  - **`eval_mismatch` declared but unimplemented**. The `ValidationIssue.type` enum at [aiResponseValidator.ts:17](../src/lib/aiResponseValidator.ts#L17) includes `"eval_mismatch"`, but only the three checks (piece-on-square, move legality, square reference) are wired at [aiResponseValidator.ts:48-58](../src/lib/aiResponseValidator.ts#L48-L58). LLM evals that disagree with Stockfish are not caught.
  - **Legacy client-side path bypasses entirely**. [enhancedOpenAIService.ts](../src/lib/enhancedOpenAIService.ts) (instantiated client-side per CLAUDE.md) does not import `validateAIResponse`. Any UI surface still routed through it is unvalidated.
- **Recovery paths**: Server-side `callLLM()` callers at [chat/route.ts:115](../src/app/api/chat/route.ts#L115) and [enhanced-analysis/route.ts:1272,1388](../src/app/api/enhanced-analysis/route.ts#L1272-L1388) always run the validator. The agent must prefer those routes when chess-correctness matters. Wiring an `eval_mismatch` check, fixing the silent invalid-FEN catch, and adding a regenerate-on-error retry are separate-PR items.

## 4. Neo4j retrieval edge cases

### 4a. Driver unconfigured

- **Trigger**: `NEO4J_URI`, `NEO4J_USERNAME`, or `NEO4J_PASSWORD` env var missing.
- **Cited code path**: [neo4j.ts:122-128](../src/lib/neo4j.ts#L122-L128) `isNeo4jConfigured()` and [conceptRetrieval.ts:91-93](../src/lib/concept/conceptRetrieval.ts#L91-L93) gate.
- **Failure mode**: `getReinforcements()` returns `empty("Neo4j not configured")` — the agent gets `puzzles: []` and a notes string. No exception thrown.
- **Recovery path**: Agent should check `result.poolSize === 0 && fallbackUsed === "none"` and surface "puzzle service unavailable" rather than fabricating reinforcements. Configuring Neo4j is an env-var step, not a code change.

### 4b. Anchor unclassified, no theme fallback supplied

- **Trigger**: The deterministic concept detector at [conceptDetector.ts](../src/lib/concept/conceptDetector.ts) returns no high-confidence concept (≥0.7 threshold at [conceptRetrieval.ts:194-197](../src/lib/concept/conceptRetrieval.ts#L194-L197)) **and** the caller didn't supply `themes[]` for fallback.
- **Cited code path**: [conceptRetrieval.ts:99-111](../src/lib/concept/conceptRetrieval.ts#L99-L111).
- **Failure mode**: Returns `{anchorConcepts: [], fallbackUsed: "none", puzzles: [], notes: ["Could not classify anchor position; no themes supplied for fallback."]}`. This is the "honesty path" — preferred over fabricating retrievals.
- **Recovery path**: Agent should re-call with explicit `themes` derived from Lichess theme tags or skip puzzle reinforcement for this position.

### 4c. Anchor classified but no candidates in rating band

- **Trigger**: Concepts detected, but no puzzles in `[userElo - 300, userElo + 300]` are tagged with those concepts in Neo4j. Common at extreme ratings.
- **Cited code path**: [conceptRetrieval.ts:133-146](../src/lib/concept/conceptRetrieval.ts#L133-L146); rating band clamped to `[400, 3000]` at [conceptRetrieval.ts:238-239](../src/lib/concept/conceptRetrieval.ts#L238-L239).
- **Failure mode**: Returns `{fallbackUsed: "concept", puzzles: [], poolSize: 0, notes: ["No puzzles in Neo4j currently tagged with <concepts> in Elo <userElo>±300."]}`.
- **Recovery path**: No automatic band-widen exists today. The agent can re-call with `themes` to use the theme fallback instead, or recommend a different concept to drill. **Design-only**: a band-widen step that retries with `RATING_BAND * 2` before giving up.

### 4d. Theme not in graph (theme fallback path empty)

- **Trigger**: Caller supplies `themes[]` but none of them match an indexed `:Theme` in Neo4j (typo, kebab-case mismatch, theme deprecated upstream).
- **Cited code path**: `themeFallback()` at [conceptRetrieval.ts:362+](../src/lib/concept/conceptRetrieval.ts#L362). Theme normalization at [puzzleRepository.ts:41-48](../src/lib/puzzleRepository.ts#L41-L48).
- **Failure mode**: Empty pool, `fallbackUsed: "theme"` with `puzzles: []`.
- **Recovery path**: Agent should treat empty as a no-op rather than retry; there is no theme-canonicalization layer beyond the kebab-case normalizer.

## 5. FEN cosine degeneracy

- **Trigger**: Trivial endgame positions (e.g., K+P vs K, K+R vs K) where most of the 49 feature dimensions collapse to zero or near-zero. Multiple unrelated endings then cluster spuriously.
- **Cited code path**: Feature extraction at [fenSimilarity.ts:14-80](../src/lib/fenSimilarity.ts#L14-L80) — material, pawn structure per file, pawn weaknesses, king safety, centralization, phase, special. In trivial endgames, pawn-structure and pawn-weakness vectors are mostly zero by definition.
- **Failure mode**: Stage 2 rerank in `getReinforcements` ([conceptRetrieval.ts:148-149](../src/lib/concept/conceptRetrieval.ts#L148-L149)) computes a high cosine between two structurally trivial positions even when the actual coaching content is different. The user gets a "structurally similar" puzzle that isn't pedagogically similar.
- **Recovery path**: The diversity step (Stage 3, MMR with `MMR_LAMBDA = 0.3` at [conceptRetrieval.ts:43](../src/lib/concept/conceptRetrieval.ts#L43)) partly mitigates by penalizing within-set similarity. Beyond that, agent should down-weight cosine-based similarity in the endgame phase. **Design-only fix**: a phase-aware rerank that uses different feature weights for endgame vs middlegame, or a learned 128-dim embedding (referenced in [conceptRetrieval.ts:13-14](../src/lib/concept/conceptRetrieval.ts#L13-L14) as future work "B3").

## 6. Opening detector ambiguity (transpositions)

- **Trigger**: A move sequence that can transpose into multiple ECO codes (e.g., 1.Nf3 d5 2.d4 → can reach Queen's Gambit, Catalan, or Slav depending on next move).
- **Cited code path**: [unifiedOpeningDetector.ts](../src/lib/unifiedOpeningDetector.ts) and [openingDetector.ts](../src/lib/openingDetector.ts).
- **Failure mode**: The detector returns one ECO label but the position genuinely belongs to multiple. Downstream coaching may quote opening-specific plans that don't apply to the transposition the user actually entered.
- **Recovery path**: The unified detector aggregates multiple sources; consumer code should treat the returned ECO as a most-likely match, not authoritative. Agent should not promise "you played the Sicilian Najdorf" when the position permits other interpretations — couch as "this looks like a Najdorf-type middlegame".

## 7. Two-tier Anthropic/OpenAI fallback paths

### 7a. Anthropic 4xx/5xx → OpenAI retry

- **Trigger**: Auth failure, rate-limit, content-policy block, server error from `api.anthropic.com`.
- **Cited code path**: [llmProvider.ts:131-135](../src/lib/llmProvider.ts#L131-L135) throws `LLMError("anthropic", status, body)`; the dispatcher (full `callLLM` body, includes the retry-on-OpenAI logic) catches and retries against OpenAI when `OPENAI_API_KEY` is configured.
- **Failure mode**: Without an OpenAI key, the LLMError propagates to the user as an interactive failure.
- **Recovery path**: OpenAI fallback is wired but not env-configured per [CLAUDE.md](../CLAUDE.md) runtime-readiness table. Coding work is done; ops work is to set `OPENAI_API_KEY` in production env.

### 7b. Key-prefix invalidation (cheap pre-flight)

- **Trigger**: An API key is set but has the wrong shape (e.g., `ssk-ant-` typo, `sk-` missing).
- **Cited code path**: [llmProvider.ts:32-37](../src/lib/llmProvider.ts#L32-L37) — `isValidAnthropicKey` requires `sk-ant-` prefix; `isValidOpenAIKey` requires `sk-` or `sess-`.
- **Failure mode**: Returns `LLMError(provider, 0, "API_KEY not configured or invalid prefix")` *before* the network round-trip — saves cost and time on obviously broken keys.
- **Recovery path**: Same as 7a. The pre-flight check is the recovery — failing fast is better than the alternative.

### 7c. Anthropic returns 200 with empty content

- **Trigger**: API returns `{content: []}` or content-block isn't text. Rare but possible with content-policy redactions.
- **Cited code path**: [llmProvider.ts:139-142](../src/lib/llmProvider.ts#L139-L142) — `if (typeof content !== "string") throw new LLMError("anthropic", 200, "Anthropic returned no text content")`.
- **Failure mode**: Treated as a 200-but-no-content failure, propagated as `LLMError`.
- **Recovery path**: Same as 7a. Note that this is **not** a retry-able error in the natural sense — retrying often returns the same redacted output. The caller should surface "no response available" rather than loop.

## 8. SSE stream timeouts

- **Trigger**: Anthropic streams an event but the connection drops mid-stream, or the upstream sends `event: error` mid-flight.
- **Cited code path**: [llmProvider.ts:224-280+](../src/lib/llmProvider.ts#L224-L280) (`callAnthropicStream`). Reader at [llmProvider.ts:265-280](../src/lib/llmProvider.ts#L265-L280); SSE event parsing in subsequent lines.
- **Failure mode**: Partial text already streamed to the UI is preserved client-side, but the final `LLMResult` (with token counts) is not delivered. The conversation is in a "you saw N tokens, but the system doesn't know" state.
- **Recovery path**: OpenAI is wired as a non-streaming fallback per [llmProvider.ts:217-218](../src/lib/llmProvider.ts#L217-L218): "OpenAI is used as a non-streaming fallback (whole response emitted as a single chunk)." The route handler at [enhanced-analysis/route.ts](../src/app/api/enhanced-analysis/route.ts) should detect mid-stream failure and either surface partial content with a warning or restart on OpenAI. **Design-only**: an "incomplete-stream" client toast that lets the user retry the turn.

## 9. OpenAI fallback triggers and operational gap

- **Trigger**: Anthropic primary fails (any of 7a-7c, or a streaming failure in 8).
- **Cited code path**: Cross-provider retry logic in `callLLM` (full file) at [llmProvider.ts:99-101,193-211](../src/lib/llmProvider.ts#L99-L211). `callOpenAI` non-streaming entry at [llmProvider.ts:157-212](../src/lib/llmProvider.ts#L157-L212). `forceProvider: "openai"` skip-Anthropic option at [llmProvider.ts:55](../src/lib/llmProvider.ts#L55).
- **Failure mode**: Code-level — none. Operational-level — `OPENAI_API_KEY` is not set in production per [CLAUDE.md](../CLAUDE.md). The fallback is dead code in the live deploy until the key is configured.
- **Recovery path**: Add `OPENAI_API_KEY` to the Vercel env. No code change required. Without it, treat Anthropic outages as full coaching-surface outages.

## 10. Stage 3 grounding — resolution-point misclassification and tablebase unavailability

Added 2026-05-08 alongside the Stage 3 grounding tools (`compute_feature_delta`, `find_resolution_point`, `fetch_lichess_tablebase`, `compare_features`) per [FUTURE_IDEAS.md §1 Stage 3](../FUTURE_IDEAS.md) and MASTERMIND_TOOLS.md. The capabilities are design-only at the time of writing; the failure modes below are the ones the implementation must handle, surfaced here in advance so the agent can reason about degraded outputs once they ship.

### 10a. Resolution-point heuristic misclassifies a tactical position as quiescent

- **Trigger**: `find_resolution_point` walks the PV until a position is "quiescent" (no captures pending, no checks, eval stable within 30cp). On unusual tactical patterns — quiet zwischenzug, deferred recapture, prophylactic move that masks a tactic two plies later — the heuristic stops too early.
- **Cited code path**: design-only — `find_resolution_point` is not yet implemented. Heuristic source signals will come from chess.js (`in_check`, `moves({verbose: true}).filter(m => m.captured)`) plus the Stockfish PV from [engine/stockfish17.ts:5-23](../src/lib/engine/stockfish17.ts#L5-L23).
- **Failure mode**: `compute_feature_delta` snapshots the wrong "after" position; the LLM receives feature deltas that don't reflect what the line actually achieves. Symptoms: explanations like "trades the bishop pair for an outpost" when the resolved line actually wins the exchange three plies later. The LLM compounds the misclassification because it trusts the structured input.
- **Recovery path**: heuristic only in v1; if quality regressions surface in the coaching-eval fixtures, fall back to a snapshot at PV depth = min(6, len(PV)). LLM-tagged resolution points are an option (open design question 6 in FUTURE_IDEAS.md §1 Stage 3) but cost a token round-trip per move. Validator does not catch this — chess.js cross-check verifies piece-on-square claims, not "is this delta the right delta."

### 10b. Resolution-point heuristic returns the same FEN as the input

- **Trigger**: PV has fewer than 2 plies, or every position in the PV is "in check" or "has captures pending" (rare but possible in long forced sequences).
- **Failure mode**: Per the spec, `find_resolution_point` returns `{resolutionFen: <inputFen>, plyOffset: 0, reason: "depth-limit"}`. `compute_feature_delta` then computes a delta of zero — no features changed — and the prompt context's `## Position changes` block is empty for that move.
- **Recovery path**: prompt-context builder must check for the empty-delta case and skip the block (or emit "no positional change at the resolution point" so the LLM has guidance). Worse than the heuristic-misclassification case in 10a, because the LLM sees an empty block and may invent prose to fill it.

### 10c. Tablebase rate limit (Lichess `tablebase.lichess.ovh`)

- **Trigger**: Heavy traffic against a long endgame phase produces enough `fetch_lichess_tablebase` calls to hit the upstream rate limit. Lichess's published rate limit is conservative; assume ~30 req/min and back off accordingly.
- **Cited code path**: design-only — `fetch_lichess_tablebase` is not yet implemented. The Lichess REST helpers at [lichess.ts](../src/lib/lichess.ts) provide the precedent for retries.
- **Failure mode**: 429 from upstream; calling code drops the tablebase block from the prompt context with no recovery, leaving the LLM to fall back to principle-only endgame prose for that move.
- **Recovery path**: 24h cache layer (positions don't change after FEN is fixed) drastically reduces requests. On 429, return `null` and let the prompt-context builder skip the tablebase block silently. **Do not retry inline** — the user-facing latency budget for `analyze_game` is already tight. **Design-only**: a Vercel-cron-warmed prefetch for the master DB of common endgame FENs (Lucena, Philidor, KP-vs-K) so the cache is hot before any user reaches them.

### 10d. Tablebase position rejected (>7 pieces, illegal castling, etc.)

- **Trigger**: Caller fails to gate the call by piece count, or the FEN has unusual flags (en-passant target square not consistent with the side to move, castling rights set but the rook isn't there).
- **Failure mode**: 400 from upstream with a `"position not in tablebase"` body, or 200 with a category but degenerate `dtm`/`dtz`.
- **Recovery path**: gate the call client-side: count pieces excluding kings; only invoke when ≤7. Piece-count check is one line of chess.js. On a 400 or unexpected response shape, log a warning and skip the tablebase block — same recovery as 10c.

### 10e. positionAnnotator runs on an invalid FEN

- **Trigger**: `compute_feature_delta` is given a FEN that chess.js rejects (corrupted PGN, mid-replay error, etc.).
- **Cited code path**: existing failure surface at [aiResponseValidator.ts:60-63](../src/lib/aiResponseValidator.ts#L60-L63) is the analog — invalid FENs are caught and swallowed silently with `console.warn`. The Stage 3 implementation must NOT replicate this pattern.
- **Failure mode**: if `annotatePosition` throws, `compute_feature_delta` throws, the per-move loop in `enhanced-analysis/route.ts` either crashes or silently drops the move's `## Position changes` block — same observability gap as PLAN.md §P1-3 (move-replay errors silently swallowed).
- **Recovery path**: surface the error to the route handler with a sentinel (`{error: "position-annotator-failed", fen}`); the prompt-context builder logs and emits a comment in the prompt context so the LLM knows the delta is unavailable for that move. Validator-style "swallow + warn" is the wrong pattern here; PLAN.md §P1-3 already names this anti-pattern.

---

## 11. Other gotchas worth knowing

These are not separate failure classes but recurring gotchas that compound the failures above.

- **Diagnostics route hardcoded model bug**. [api/health/anthropic/route.ts:71](../src/app/api/health/anthropic/route.ts#L71) hardcodes `claude-haiku-4-20250514` (not a real model id). Endpoint returns 502 permanently. Doesn't affect live coaching traffic, but if the agent uses `/api/health/anthropic` to gate behavior, it will incorrectly conclude Anthropic is down. Use `/api/health/llm` instead. Per CLAUDE.md, this is a known one-line fix.
- **Two `next.config` files exist**. `next.config.ts` wins, `next.config.js` is silently dead. If a future contributor edits the .js file expecting a behavior change, none happens. Per CLAUDE.md.
- **`npm run build` and `npm run lint` are not quality gates**. Per CLAUDE.md and [next.config.ts](../next.config.ts) — both have `ignoreBuildErrors: true` / `ignoreDuringBuilds: true`. **Use `npx tsc --noEmit`** as the pre-commit check. Today it runs clean.
- **Maia local Lc0 fallback is silent**. [engine/maiaServerService.ts:142-146,189-192](../src/lib/engine/maiaServerService.ts#L142-L192) logs a warning and switches to a heuristic-based fallback when Lc0 is missing. The fallback's chess quality is much lower than real Maia; the API does not surface "you got the heuristic, not Maia". Agent should treat any Maia-2 prediction with `model !== "maia2"` (e.g., `model: "fallback"`) as low-confidence.
- **`Chesskit/` is out-of-scope, vendored, dirty.** Per CLAUDE.md, quarantined in `.claude/settings.json`. Do not read, edit, or touch.

Tool-level summaries of these failure modes are duplicated inline in MASTERMIND_TOOLS.md per-tool `Fail mode → fallback` columns; this file is the authoritative deep dive.
