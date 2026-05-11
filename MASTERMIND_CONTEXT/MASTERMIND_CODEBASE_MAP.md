# MASTERMIND_CODEBASE_MAP.md

## SUMMARY

Module-by-module map of [src/lib/](../src/lib/) and [src/app/api/](../src/app/api/) at module granularity (not function granularity). For each module: purpose (one line), public surface (named exports / route methods), notable dependents, and which Mastermind tool(s) wrap it. The `src/lib/` tree has approximately 50 root-level modules and 11 subdirectories; the `src/app/api/` tree has 24 top-level route folders. Two structural callouts: **legacy / parallel paths** — [enhancedOpenAIService.ts](../src/lib/enhancedOpenAIService.ts) is a 989-line client-side AI service that runs in parallel to the server-side `callLLM()` pipeline (per CLAUDE.md), and the in-process Lc0 Maia path at [engine/maiaServerService.ts](../src/lib/engine/maiaServerService.ts) coexists with the canonical HF Spaces proxy. **Out-of-scope** — [Chesskit/](../Chesskit/) is a vendored nested git repo, currently dirty, quarantined in `.claude/settings.json`; the agent must not read or modify it. The map is structured so an agent loading this on demand can answer "where does X live?" or "what wraps Y?" in one lookup. Dependents are listed where they are non-obvious; widely-used utilities like [chess.ts](../src/lib/chess.ts) note "many" rather than enumerate.

---

## src/lib/ — root-level modules

### LLM + coaching

| Module | Purpose | Public surface | Dependents | Wrapping tool(s) |
|---|---|---|---|---|
| [llmProvider.ts](../src/lib/llmProvider.ts) | Unified Anthropic/OpenAI client; tier-routed; OpenAI fallback; prompt caching | `callLLM`, `callLLMStream`, `LLMError`, `LLMTier`, `CallLLMOptions`, `LLMResult`, `LLMStreamEvent` | every route that emits LLM output (chat, enhanced-analysis, classify-intent, etc.) | underlies all `expensive` tools |
| [aiResponseValidator.ts](../src/lib/aiResponseValidator.ts) | Hallucination validator: chess.js cross-check on LLM claims | `validateAIResponse`, `ValidationResult`, `ValidationIssue` | [api/chat/route.ts:115](../src/app/api/chat/route.ts#L115), [api/enhanced-analysis/route.ts:1272,1388](../src/app/api/enhanced-analysis/route.ts#L1272-L1388) | (post-processor; not a standalone tool) |
| [chessPrinciples.ts](../src/lib/chessPrinciples.ts) | Grandmaster-coach system prompt body | `SYSTEM_PROMPT_TEMPLATE`, `getSystemPrompt(analysisType)` | [prompts/](../src/lib/prompts/) re-exports; legacy direct consumers | (prompt module; surfaces via `analyze_game`) |
| [chessMoveExplainer.ts](../src/lib/chessMoveExplainer.ts) | Move-explanation helpers (engine output → natural-language framing) | move/explain helpers | enhanced-analysis | partial backing for `analyze_game` |
| [responseCache.ts](../src/lib/responseCache.ts) | LRU cache for AI coaching responses, keyed by FEN + skill + query hash | `generateCacheKey`, `getCachedResponse`, `setCachedResponse` | enhanced-analysis route | (cache layer; reduces `expensive` cost) |
| [analysisContextCache.ts](../src/lib/analysisContextCache.ts) | Server-side cache for pre-computed game analysis context (keyed by `contextId`) | `generateContextId`, `storeAnalysisContext` | enhanced-analysis (write), chat (read by `contextId`) | underlies follow-up `chat/route.ts` flow |
| **[enhancedOpenAIService.ts](../src/lib/enhancedOpenAIService.ts)** | **LEGACY PARALLEL PATH** — 989-line client-side AI service. Instantiated client-side in [src/hooks/useEnhancedFenTracker.ts:88](../src/hooks/useEnhancedFenTracker.ts#L88); does **not** import the validator (validator-bypass risk per MASTERMIND_FAILURE_MODES.md §3). Per CLAUDE.md, this is parallel to, not replaced by, `callLLM()`. | (legacy class) | [EnhancedAnalysisPanel.tsx](../src/components/EnhancedAnalysisPanel.tsx), [useEnhancedFenTracker.ts](../src/hooks/useEnhancedFenTracker.ts) | **agent should avoid** — prefer server-side `callLLM` paths |

### Engine + analysis

| Module | Purpose | Public surface | Dependents | Wrapping tool(s) |
|---|---|---|---|---|
| [chess.ts](../src/lib/chess.ts) | chess.js helpers (UCI ↔ SAN, `formatGameToDatabase`, evaluation conversions) | `moveLineUciToSan`, `uciMoveParams`, `formatGameToDatabase`, many | many | foundational; underlies many tools |
| [phaseAccuracy.ts](../src/lib/phaseAccuracy.ts) | Phase-classified accuracy aggregator | phase-accuracy helpers | enhanced-analysis, accuracy/ | `score_phase_accuracy` |
| [openingDetector.ts](../src/lib/openingDetector.ts) | ECO detection from move list | `detectOpening` | many | partial backing for `detect_opening` |
| [unifiedOpeningDetector.ts](../src/lib/unifiedOpeningDetector.ts) | Aggregating ECO detector across multiple sources | unified detector | scout, enhanced-analysis | `detect_opening` |
| [collisionAnalysis.ts](../src/lib/collisionAnalysis.ts) | "You vs them" piece-collision analysis | collision helpers | scout/enhanced-analysis | (analytics support) |
| [positionAnnotator.ts](../src/lib/positionAnnotator.ts) | Annotate positions with metadata for prompt context | `annotatePosition`, `annotationToPromptContext` | enhanced-analysis | (prompt-context helper) |
| [smartColorDetection.ts](../src/lib/smartColorDetection.ts) | Decide which color a user played in a game | color heuristics | game ingest paths | (analytics support) |

### Puzzles + retrieval

| Module | Purpose | Public surface | Dependents | Wrapping tool(s) |
|---|---|---|---|---|
| [chessPuzzlesService.ts](../src/lib/chessPuzzlesService.ts) | Client-safe `ChessPuzzle` shape and `TACTICAL_THEMES` taxonomy | `ChessPuzzle`, `TACTICAL_THEMES` | many | foundational |
| [puzzleRepository.ts](../src/lib/puzzleRepository.ts) | Server-side Neo4j puzzle queries (theme + rating filters) | `queryPuzzles`, `normalizeThemeId` | api/chess-puzzles-dataset, api/courses, internal | `query_puzzles_dataset`, `find_similar_puzzles` |
| [neo4j.ts](../src/lib/neo4j.ts) | Neo4j Aura driver singleton + `executeRead` / `executeWrite` | `getDriver`, `executeRead`, `executeWrite`, `verifyConnection`, `isNeo4jConfigured`, `closeDriver` | conceptRetrieval, puzzleRepository, scout | (driver layer) |
| [fenSimilarity.ts](../src/lib/fenSimilarity.ts) | 49-dim handcrafted FEN feature vector + cosine | `extractFENFeatures`, `featuresToVector`, `cosineSimilarity` | conceptRetrieval | (Stage 2 of retrieval) |
| [puzzleRating.ts](../src/lib/puzzleRating.ts) | jotai-persisted puzzle ELO state | rating atom | puzzle UI | underlies design-only `calibrate_rating_with_quiz` |
| [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts) | Map a user mistake to drilling puzzles | mapper functions | api/mistake-puzzles | `mistake_to_puzzle` |

### User state + persistence

| Module | Purpose | Public surface | Tier | Wrapping tool(s) |
|---|---|---|---|---|
| [firestoreUsers.ts](../src/lib/firestoreUsers.ts) | Client wrapper for `/api/auth/me`, `/api/users/me` | `UserProfile`, `getUserProfile`, `updateUserProfile` | F | `get_user_profile` |
| [firestoreGames.ts](../src/lib/firestoreGames.ts) | Client wrapper for `/api/games` | `CloudGame`, `getCloudGames`, `addCloudGame`, `updateCloudGameEval`, `deleteCloudGame` | F | `get_user_games` |
| [firestoreChats.ts](../src/lib/firestoreChats.ts) | Client wrapper for `/api/chats` and subroutes | `ChatRecord`, `ChatMessageRecord`, `listChats`, `getChat`, `createChat`, `appendMessage`, `renameChat`, `deleteChat`, `generateChatTitle`, `chatTimestampMs` | F | `get_user_chat_history` |
| [firebase.ts](../src/lib/firebase.ts) | Browser-side firebase/app + analytics init (no firestore client) | firebase app handles | client init only | n/a |
| [weaknessProfile.ts](../src/lib/weaknessProfile.ts) | localStorage-backed weakness aggregation | `WeaknessProfile`, `loadWeaknessProfile`, `updateWeaknessProfile`, `getWeaknessPromptContext` | L | `get_weakness_profile` (partial) |
| [spacedRepetition.ts](../src/lib/spacedRepetition.ts) | SM-2 algorithm + jotai/localStorage SRS state | `calculateNextReview`, `isDueForReview`, `qualityFromDrill`, `drillProgressAtom`, `getLineProgress` | L | `get_srs_state` (partial) |
| [repetitTraining.ts](../src/lib/repetitTraining.ts) | localStorage-backed Repetit Training set + attempt tracking | `RepetitTrainingSet`, `PuzzleAttempt`, `UserPuzzleStats`, `createTrainingSet`, `getAllTrainingSets`, `recordPuzzleAttempt`, ... | L | `get_repetit_history` (partial) |
| [repertoireParser.ts](../src/lib/repertoireParser.ts) | PGN → `OpeningRepertoire` parser | `parsePgnToRepertoire` | repertoire UI | `lookup_user_repertoire`, `get_repertoire` |
| [feedbackStore.ts](../src/lib/feedbackStore.ts) | localStorage thumbs up/down on AI responses | feedback store helpers | feedback UI | underlies design-only feedback tools |
| [playerProfile.ts](../src/lib/playerProfile.ts) | jotai-persisted player profile (rating, prefs) | profile atoms | many | underlies `get_user_profile` derivation |
| [visitorTracker.ts](../src/lib/visitorTracker.ts) | Visit-tracking shim (post-migration: stubs out, returns empty) | shim | site-stats page | (stubbed) |

### External providers

| Module | Purpose | Public surface | Wrapping tool(s) |
|---|---|---|---|
| [chessCom.ts](../src/lib/chessCom.ts) | chess.com public-API client (`pub/player/{username}` lookups) | chess.com helpers | `fetch_chesscom_user_games` |
| [lichess.ts](../src/lib/lichess.ts) | Lichess REST helpers | lichess helpers | `fetch_lichess_user_games` |
| [lichess-board.ts](../src/lib/lichess-board.ts) | Lichess board API (event stream, seek) | board helpers | n/a (UI-driven) |
| [lichess-oauth.ts](../src/lib/lichess-oauth.ts) | Lichess OAuth flow (token exchange, account fetch, revoke) | OAuth helpers | (auth layer) |
| [ndjson-to-sse.ts](../src/lib/ndjson-to-sse.ts) | Transform Lichess NDJSON streams into SSE for the browser | stream transformer | api/lichess/events |

### Scouting + share

| Module | Purpose | Public surface | Wrapping tool(s) |
|---|---|---|---|
| [scoutService.ts](../src/lib/scoutService.ts) | Build opening-tree from a player's public games | `buildOpeningTree`, `OpeningTreeNode` | `opponent_scout`, `repertoire_gap_against_player` |
| [scoutAnalytics.ts](../src/lib/scoutAnalytics.ts) | Aggregate ATK/DEF/TIME/MIND/OVR + stalker score | scout analytics helpers | `opponent_scout` |
| [scoutEco.ts](../src/lib/scoutEco.ts) | Compact hand-curated ECO lookup (small, scout-UI-only) | scout ECO helpers | `opponent_scout` |
| [shareCard.ts](../src/lib/shareCard.ts) | 720×1024 SVG share-card builder | `buildShareCardSvg`, `ShareCardData` | `share_card_render` |
| [twinBot.ts](../src/lib/twinBot.ts) | Book-then-engine opponent simulator (book replay → ELO-clamped Stockfish) | `TwinBotMove`, `TwinBotSettings`, walking + picking helpers | `twin_bot_match` |

### Misc utility

| Module | Purpose | Public surface |
|---|---|---|
| [helpers.ts](../src/lib/helpers.ts) | Generic helpers (`getPaddedNumber`, etc.) | sundry |
| [math.ts](../src/lib/math.ts) | Stats helpers (`getHarmonicMean`, `getStandardDeviation`, `getWeightedMean`, `ceilsNumber`) | math helpers |
| [sounds.ts](../src/lib/sounds.ts) | AudioContext-backed move sounds | sound helpers |
| [sentry.ts](../src/lib/sentry.ts) | Sentry init / `withScope` wrappers | sentry helpers |

---

## src/lib/ — subdirectories

| Subdir | Purpose | Notable contents | Wrapping tool(s) |
|---|---|---|---|
| [accuracy/](../src/lib/accuracy/) | Lichess-derived accuracy + phase accuracy | `index.ts` (`computeAccuracy`, `computePhaseAccuracy`, `bandForAccuracy`, `classifyPhase`, `ACCURACY_VERSION`), `recordGame.ts`, `resolveMeta.ts`, `useRecordAnalyzedGame.ts`, `__tests__/` | `accuracy_score`, `score_phase_accuracy` |
| [auth/](../src/lib/auth/) | Server-side auth primitives | `session.ts` (signed JWT in `cm_session` httpOnly cookie), `requireAuth.ts`, `verifyFirebaseToken.ts`, `validation.ts`, `oauthState.ts`, `getAuthHeader.ts` | (auth layer; `requireSession()` gates every protected route) |
| [chessprinciples/](../src/lib/chessprinciples/) | Move-purpose / aggressive-move analyzers, principle ranking, skill calibration | `principles.ts`, `enhancedMoveAnalyzer.ts`, `aggressiveMoveAnalyzer.ts`, `moveByMoveAnalyzer.ts`, `movePurposeAnalyzer.ts`, `moveValidation.ts`, `skillLevel.ts`, `smartFiltering.ts`, `analyzers/` | underlies design-only `detect_play_style`, partial input to `analyze_game` |
| [cmip/](../src/lib/cmip/) | Schema and types for the CMIP integration | `schema.ts`, `types.ts` | (integration layer) |
| [concept/](../src/lib/concept/) | Concept taxonomy + retrieval (Stage 1 + Stage 2 + Stage 3) | `conceptTaxonomy.ts` + `conceptTaxonomy.data.json`, `conceptDetector.ts`, `conceptClassifier.ts`, `conceptLLMTagger.ts`, `conceptRetrieval.ts`, `__tests__/` | `tag_concepts`, `find_similar_puzzles`, `mistake_to_puzzle` |
| [engine/](../src/lib/engine/) | Stockfish (WASM) + Maia (Lc0) engine adapters | `stockfish17.ts`, `stockfish17.ts`-tier wrappers, `uciEngine.ts`, `worker.ts`, `shared.ts`, `maiaService.ts`, `maiaServerService.ts` (LEGACY local Lc0; coexists with HF Spaces proxy), `maiaEngine.ts`, `maiaDownloader.ts`, `surpriseAnalyzer.ts`, `surpriseEngineService.ts`, `helpers/` | `analyze_position`, `analyze_position_multipv` (partial), `predict_human_move` |
| [feedback/](../src/lib/feedback/) | Server-side feedback generation | `generateFeedback.ts` | api/feedback |
| [logging/](../src/lib/logging/) | Pino-style child loggers + sentry integration | `logger.ts`, `index.ts`, `requestContext.ts`, `sentryIntegration.ts` | (cross-cutting) |
| [prompts/](../src/lib/prompts/) | Coaching prompt templates | `coachChatPrompt.ts` (5-category prompt at line 170; `PROMPT_VERSION = "3.0"`), `gameDebrief.ts`, `openingExplanation.ts`, `puzzleExplanation.ts`, `promptHelpers.ts`, `__tests__/` | underlies `analyze_game` |
| [server/](../src/lib/server/) | Server-only utilities (Firebase Admin, email, CMIP) | `firebaseAdmin.ts`, `users.ts`, `email.ts`, `cmipEmail.ts` | (server-side, secret-bearing) |
| [validation/](../src/lib/validation/) | Zod schemas for request/response validation | `schemas.ts` (carries AUDIT-PHASE-1.4 hardening), `__tests__/` | every tool's `inputSchema` lands here |

---

## src/app/api/ — route folders

### Coaching + analysis

| Route folder | Methods + purpose | Public surface | Wrapping tool(s) |
|---|---|---|---|
| [enhanced-analysis/](../src/app/api/enhanced-analysis/) | POST — flagship deep-analysis with validator post-processing; SSE streaming. Threads weakness, repertoire, structured 5-category prompt. | `route.ts` | `analyze_game` |
| [chat/](../src/app/api/chat/) | POST — fast follow-up chat; reads server-cached context by `contextId`; uses `tier: "fast"` (Haiku). | `route.ts` | (follow-up flow inside `analyze_game`) |
| [chats/](../src/app/api/chats/) | List / create / append / rename / delete + auto-title chat threads | `route.ts`, `[id]/` subroutes | `get_user_chat_history` |
| [classify-intent/](../src/app/api/classify-intent/) | LLM-classified user intent — **router above** the agent loop, NOT a tool inside it (per MASTERMIND_TOOLS.md non-tools section) | `route.ts` | (router; not exposed as a tool) |

### Puzzles + retrieval

| Route folder | Methods + purpose | Wrapping tool(s) |
|---|---|---|
| [chess-puzzles/](../src/app/api/chess-puzzles/) | Puzzle list (legacy / static-source; predates Neo4j) | (transitional) |
| [chess-puzzles-dataset/](../src/app/api/chess-puzzles-dataset/) | Neo4j-backed puzzle dataset queries | `query_puzzles_dataset` |
| [adaptive-puzzles/](../src/app/api/adaptive-puzzles/) | Adaptive next-puzzle selection (rating-targeted) | `get_adaptive_puzzle` |
| [similar-puzzles/](../src/app/api/similar-puzzles/) | FEN-similarity puzzle search | `find_similar_puzzles` |
| [mistake-puzzles/](../src/app/api/mistake-puzzles/) | Map mistake → drilling puzzles | `mistake_to_puzzle` |
| [retrieval-telemetry/](../src/app/api/retrieval-telemetry/) | Click / solve / skip events (currently log-only) | `log_retrieval_event` |
| [commentary-by-fen/](../src/app/api/commentary-by-fen/) | Commentary lookup by FEN (uses chess-commentary corpus when wired) | (commentary lookup; partial) |
| [courses/](../src/app/api/courses/) | Opening-course content; static + Neo4j sourced | `route.ts`, `[id]/` | (curriculum surface) |

### Engines + Maia

| Route folder | Methods + purpose | Wrapping tool(s) |
|---|---|---|
| [maia-predict/](../src/app/api/maia-predict/) | POST — proxy to HF Spaces `/predict` | `predict_human_move` |
| [maia-status/](../src/app/api/maia-status/) | GET — health-check the HF Spaces `/health` | (status check, not a tool) |
| [keep-maia-alive/](../src/app/api/keep-maia-alive/) | GET — Vercel cron warming the HF Space every 12h | `keep_maia_alive` |
| [install-lc0/](../src/app/api/install-lc0/) | Local Lc0 install helper (developer-only) | (dev tooling) |

### Auth + user state + games

| Route folder | Methods + purpose |
|---|---|
| [auth/](../src/app/api/auth/) | `signin`, `signup`, `signout`, `me`, `password`, `forgot-password`, `reset-password`, `google/{start, callback}` |
| [users/me/](../src/app/api/users/me/) | GET / PATCH user-profile fields |
| [games/](../src/app/api/games/) | List / create / update / delete user games |
| [feedback/](../src/app/api/feedback/) | Capture coaching-response feedback |

### External chess platforms

| Route folder | Methods + purpose |
|---|---|
| [chesscom/](../src/app/api/chesscom/) | `ongoing/` — currently-active chess.com games (only chess.com sub-route) |
| [lichess/](../src/app/api/lichess/) | `auth`, `callback`, `current-games`, `disconnect`, `events`, `game`, `seek` — full Lichess board-API integration |
| [scout/](../src/app/api/scout/) | Opponent-tree + analytics endpoint | `opponent_scout` |

### Health

| Route folder | Methods + purpose |
|---|---|
| [health/llm/](../src/app/api/health/llm/) | 1-token probe of both providers |
| [health/anthropic/](../src/app/api/health/anthropic/) | **KNOWN BUG**: hardcodes invalid model id `claude-haiku-4-20250514` ([api/health/anthropic/route.ts:71](../src/app/api/health/anthropic/route.ts#L71)). Permanent 502. Per CLAUDE.md, one-line fix. |

---

## Out-of-scope and parallel paths

- **[Chesskit/](../Chesskit/)** — vendored nested git repo, currently dirty, quarantined in `.claude/settings.json`. The agent must not read, edit, or clean it. Not part of the runtime surface.
- **[enhancedOpenAIService.ts](../src/lib/enhancedOpenAIService.ts)** — legacy 989-line client-side service; runs in parallel to the server-side `callLLM()` pipeline; does **not** invoke the validator (per MASTERMIND_FAILURE_MODES.md §3 "legacy client-side path bypasses entirely"). Per CLAUDE.md: "It's parallel to, not replaced by, callLLM(). Be aware of which path you're modifying." The agent should avoid this path; correctness guarantees only hold on the `callLLM` routes.
- **[engine/maiaServerService.ts](../src/lib/engine/maiaServerService.ts)** — local Lc0-based Maia path, with a heuristic-only fallback at [engine/maiaServerService.ts:21-93](../src/lib/engine/maiaServerService.ts#L21-L93). Coexists with the canonical HF Spaces proxy at [api/maia-predict/route.ts](../src/app/api/maia-predict/route.ts). Per architectural constraint, the HF Spaces path is the production surface; the local path is a developer convenience. Agent should always use the HF Spaces proxy.
- **Two `next.config` files** — `next.config.ts` is live, `next.config.js` is silently dead (per CLAUDE.md). If a future contributor edits the .js, no behavior change.
- **30+ `test-*.js` files at the repo root** — ad-hoc scripts predating the audit's Phase 3 Vitest plan, not a real test suite.

---

## Quick lookup: "where is X?"

For agent self-diagnosis when CLAUDE.md or this map is the only loaded context.

- **Hallucination validator** → [aiResponseValidator.ts](../src/lib/aiResponseValidator.ts)
- **Two-tier LLM provider** → [llmProvider.ts](../src/lib/llmProvider.ts)
- **5-category coaching prompt** → [prompts/coachChatPrompt.ts](../src/lib/prompts/coachChatPrompt.ts)
- **Neo4j driver** → [neo4j.ts](../src/lib/neo4j.ts); puzzle queries → [puzzleRepository.ts](../src/lib/puzzleRepository.ts); concept-first retrieval → [concept/conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts)
- **Stockfish** → [engine/stockfish17.ts](../src/lib/engine/stockfish17.ts) + [engine/uciEngine.ts](../src/lib/engine/uciEngine.ts)
- **Maia (canonical)** → [api/maia-predict/route.ts](../src/app/api/maia-predict/route.ts); local Lc0 (parallel) → [engine/maiaServerService.ts](../src/lib/engine/maiaServerService.ts)
- **User profile (Firestore)** → [firestoreUsers.ts](../src/lib/firestoreUsers.ts)
- **Weakness profile (localStorage)** → [weaknessProfile.ts](../src/lib/weaknessProfile.ts)
- **SRS state (localStorage)** → [spacedRepetition.ts](../src/lib/spacedRepetition.ts)
- **Repetit Training (localStorage)** → [repetitTraining.ts](../src/lib/repetitTraining.ts)
- **Repertoire parser** → [repertoireParser.ts](../src/lib/repertoireParser.ts); built-in repertoires → [src/data/repertoires.ts](../src/data/repertoires.ts)
- **Twin Bot** → [twinBot.ts](../src/lib/twinBot.ts)
- **Opponent scout** → [scoutService.ts](../src/lib/scoutService.ts), [scoutAnalytics.ts](../src/lib/scoutAnalytics.ts), [api/scout/](../src/app/api/scout/), [shareCard.ts](../src/lib/shareCard.ts)
- **Concept taxonomy** → [concept/conceptTaxonomy.ts](../src/lib/concept/conceptTaxonomy.ts) + [concept/conceptTaxonomy.data.json](../src/lib/concept/conceptTaxonomy.data.json)
- **Validation schemas (Zod)** → [validation/schemas.ts](../src/lib/validation/schemas.ts)
