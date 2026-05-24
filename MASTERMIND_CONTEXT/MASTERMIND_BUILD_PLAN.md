# MASTERMIND_BUILD_PLAN.md

The executable build plan for **Mastermind, the chess coaching orchestrator**. Reads as a self-contained brief for any builder (human or agent) walking in cold.

**Authored:** 2026-05-11. **Rewritten:** 2026-05-18 against an orchestrator framing per Aayan. **Approved:** 2026-05-18 (this revision is now the live plan). **Scope posture:** quality and innovation first; calendar is flexible; **cost is not a build-level gating constraint** (§1.3, §4.4, §10.3); "amazing" is the bar.

**Next active gate.** The Stage A.1 classifier-boundaries review (Aayan reads `category-seed-examples.json` and the disambiguation hints in `categoryPrompts.ts`) — independent of this rewrite, queued before the rescope. See §16. After that approval, Stage A.2 (`validator-gate-dryrun.ts`) begins per [PR_1C_PLAN.md](PR_1C_PLAN.md). Phase 2 work starts when PR 1.C merges to main.

Cross-references the static knowledge in this directory and the original Mastermind capture in [FUTURE_IDEAS.md §1](../FUTURE_IDEAS.md).

---

## 0. How to use this doc

- **First-time builder:** read sections 1, 2, and 3 (orchestrator framing, mental model, tool catalog) to get oriented (~15 min). Then read the phase you're about to ship (§7–§9) in full. Treat §10–§13 as reference.
- **Returning builder:** jump to the phase section. The mandatory call-site matrix at the bottom of each phase is the merge contract.
- **Picking up after a long pause:** the phasing table in §6 is the source of truth on what's shipped vs queued. Code paths drift; the table is kept in sync at every PR merge.

### Glossary

- **Mastermind** — the orchestrator. Not "an agent loop." A layer that knows every Chess Masti capability and composes them per turn. The Najdorf-prep example below (§1.2) is the bar.
- **Orchestrator** — the planning + execution + synthesis layer described in §4. Takes a classified question and a user context, decides which tools to call in what order, runs them, composes a response.
- **Tool catalog** — §3 of this doc. Every capability the orchestrator can call. Stable shape (name / verb / data source / I/O / cost / status), kept in lockstep with [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md).
- **Single-source validator** — PR 1.B + PR 1.C validators that check claims sourced from one data source against that source (e.g. `featureDeltaCitation` against feature deltas; `scoutCitation` against ScoutAnalytics). **Foundation, not endpoint.**
- **Composite validator** — §5 of this doc. Measures whether the orchestrator composed across **enough** sources for the question's category. The Najdorf-prep bar made operational.
- **Capability gap log** — `MASTERMIND_CONTEXT/capability_gaps.md`. Append-only log where the orchestrator records turns it identified needing a capability it doesn't have. Aayan reviews weekly. **The orchestrator never self-creates tools at runtime.**
- **Foundation** — Phase 1. The single-source validator pipeline + category classifier + persona scrape (PR 1.C). Builds the substrate the orchestrator stands on.
- **Cut-order** — §14. The order in which phases get trimmed if attention or budget runs short. Read once at planning, return to it if a phase runs slow.

---

## 1. North star — what Mastermind is

### 1.1 Reframe: orchestrator, not agent loop

The previous version of this plan treated Mastermind as "a tool-using Claude agent inside `/api/enhanced-analysis`." That framing is too small. It implies the value is *the loop itself* — that wrapping `callLLM` in `tools=[...]` is the product.

It isn't. The product is **a response no other chess coaching surface can give**, because Mastermind composes capabilities the rest of the market silos. Lichess has the master database. Chess.com has the rating history. Aimchess has the dashboard. DecodeChess has the move-by-move prose. Take Take Take has the feature deltas. **Nobody pulls these together inside one response.** Mastermind's job is to.

The agent loop is **how** Mastermind composes. The orchestrator is **what** it composes. The validators are **how we trust** the composition.

### 1.2 The Najdorf-prep bar

A user asks: *"I'm playing a 1900-rated Indian guy on Lichess tonight who's been ducking me for a month — what's my prep?"*

The response that earns the title "amazing":

> Vinod_kk is a Najdorf-as-Black player — 38 of his last 50 games as Black went into the Najdorf main lines (B90–B98), and he scored 64% against the English Attack but only 41% against 6.Be3. He doesn't have a settled 6.Be3 response — Lichess masters DB shows 6...e5 7.Nb3 Be6 8.f3 is the modern main line (Carlsen used it three times in 2024), and the engine evaluation after move 12 is roughly equal but with a king-safety advantage to White if Black mistimes …a5. **You already play 6.Be3 in your repertoire** (your Lichess study "1.e4 main lines" line 4), so this is in your prep, not novel territory.
>
> Three moments to know cold:
>
> 1. **Move 12 — the 0-0-0 trigger.** If he plays 12…b5, castle queenside immediately; if he plays 12…Be6 first, hold castling for one more tempo (Karjakin-Anand 2014 is the canonical line, attached).
> 2. **The …a5 break.** His games show he plays …a5 *only* when his queen is already on c7 — if his queen is still on d8 when you reach move 14, prophylaxis with Kb1 first.
> 3. **The endgame trap.** In his last 8 Najdorf losses, 5 went to a R+B vs R+N endgame where he traded his bishop pair too early. If he offers a bishop trade after move 22, decline if his pawn structure is intact.
>
> **PGN drill (attached).** A 28-move skeleton through 6.Be3 against his most-likely response, annotated at the three pivot points above. Open in Lichess to step through.

This response touches **seven sources** in one turn:

1. **Scout output** — Vinod_kk's opening frequencies, score per opening, archetype.
2. **User's own repertoire** — does the user already prep 6.Be3?
3. **Lichess master DB** — Carlsen 2024 games in the line.
4. **Master-game retrieval** — Karjakin-Anand 2014 as a canonical reference.
5. **Engine evaluation** — Stockfish on the post-12-move position.
6. **Opening theory web retrieval** — modern Najdorf 6.Be3 theory.
7. **PGN generation** — the annotated drill.

No competitor produces this. **This is the bar.** Quality is measured by depth, accuracy, citation breadth, and whether the user feels the coach knows them. Calendar and cost flex around that constraint.

### 1.3 Quality dimensions

| Dimension | Target | How measured |
|---|---|---|
| **Source breadth** (composite citation) | Coverage floor per category — see §5.3 | Composite validator counts distinct source types cited per turn |
| **Chess correctness** (single-source) | Hallucination ≥95% per category, no exceptions | PR 1.C validators (PR 1.B + scout + user-history); foundation gate |
| **Citation accuracy** (single-source) | Per-category floors — see [PR_1C_PLAN.md §5.3.2](PR_1C_PLAN.md) | Single-source validators |
| **Persona fidelity** | ≥7/10 per persona, mean ≥7.5 | Synthetic-tester rubric (Phase 1) → human-rating correlation (Phase 3) |
| **Depth** | Response addresses the question at the user's skill level without bottoming out at generic principles | Persona-conditioned rubric; CMIP human rating (Phase 3) |
| **PGN/show-user payload presence** | When the category warrants it (opponent_prep, game_review, position_analysis), a drillable artifact accompanies the prose | Composite validator checks for `pgn_attached` event in telemetry |
| **Cost per turn** | Median ≤ $0.10 flagship orchestrator turn; p95 ≤ $0.25 (raised from §9.4 single-shot budget — the orchestrator legitimately spends more) | Per-tool telemetry sum |
| **Latency to first token** | ≤ 4 s p50 (raised from current 1.5 s single-shot — composition costs latency) | SSE timing instrumentation |

The two budget raises (cost + latency) are explicit. The Najdorf-prep bar can't be hit inside the single-shot budget; pretending otherwise would force the orchestrator to skip tool calls. Phase 2 ships with these new ceilings; if dogfooding shows users tolerate even more for richer responses, ceilings flex up.

---

## 2. Mental model of the current system + the orchestrator pivot

Builder must internalize these facts before touching code.

### 2.1 What stays from the prior plan

- **The LLM funnel.** Every server-side LLM call goes through [`callLLM()`](../src/lib/llmProvider.ts) at [llmProvider.ts:411](../src/lib/llmProvider.ts#L411). `cacheSystem: true` on every Mastermind callsite. Tier routing via `"flagship" | "fast"`, never model name.
- **The flagship route.** [`src/app/api/enhanced-analysis/route.ts`](../src/app/api/enhanced-analysis/route.ts) (1,440 lines). The orchestrator lives **inside** this route behind a feature flag, not in a new endpoint. Same `AICoachChat.tsx` frontend.
- **The Stage 3 primitives.** PR 1.A shipped: `featureDelta`, `pieceRoles`, `threatTree`, `lichessTablebase`, `complexity`, `criticalMoments`. PR 1.B shipped: `evalClaim`, `featureDeltaCitation`, `runValidationPipeline`, `regenerate`-on-error. These are tools-in-the-catalog now (§3); the orchestrator calls them like any other tool.
- **PR 1.C scope** (in flight). Six-category classifier, `scoutCitation` (20 patterns), `userHistoryCitation` (3 derivable types), persona-scrape pipeline, sweep harness, hallucination ≥95% per category hard ceiling. Unchanged in scope by this rewrite — only its **framing** changes (see §7 / §9).
- **The Stage A.1 review pause.** Aayan reads `src/lib/mastermind/__tests__/categorization/fixtures/category-seed-examples.json` and the disambiguation hints in `categoryPrompts.ts` before Stage A.2 starts. This pause is unchanged by the rewrite.
- **The CMIP-1.A–1.D infrastructure** (shipped 2026-05-17). Intern flag-capture, dashboards, admin export. Documented in [PR_CMIP_1_PLAN.md](PR_CMIP_1_PLAN.md).

### 2.2 What changes with this rewrite

| Was | Becomes |
|---|---|
| "Phase 1.5" CMIP insertion blocks Phase 2 | **Mastermind orchestrator ships first** (new Phase 2). CMIP-2 + correlation analysis is **Phase 3**, after orchestrator. |
| Phase 2 = "agent loop refactor" (single capability change) | Phase 2 = **orchestrator + retrieval tools + PGN generation + composite validators + capability-gap logging** (5–8 PRs) |
| Stage 3 grounding is the endpoint of "smart coaching" | Stage 3 grounding is **foundation**. The endpoint is multi-source synthesis. |
| Phase 3 = Tier A content authoring | Phase 3 = CMIP-2 + correlation analysis. **Tier A content authoring is folded into Phase 2 as external retrieval at runtime** — no curated dataset, calls Lichess/web at runtime, validators cross-check. |
| Phase 4 = chesstalker perspective + persona | **Deferred indefinitely.** Persona conditioning lives in the orchestrator's synthesis step; chesstalker becomes a capability the orchestrator can request, not a phase. |
| Phase 5 = innovation + distribution | **Unchanged shape, lower priority** — orchestrator ships first because it's the moat. |

### 2.3 What the orchestrator pivot does NOT mean

To avoid drift in subsequent sessions:

- **Not a self-modifying agent.** The orchestrator picks from a fixed tool catalog (§3). It does not invent tools, does not write code at runtime, does not modify its own prompt. Capability gaps are **logged**, not patched live.
- **Not a parallel route.** The orchestrator lives inside `/api/enhanced-analysis` behind `MASTERMIND_ORCHESTRATOR_ENABLED`, same flag-pattern as `MASTERMIND_VALIDATORS_ENABLED`. Two flags, two rollout knobs. No new endpoint.
- **Not free of validators.** Single-source validators still fire per claim. The composite validator adds a layer; it doesn't replace the per-claim layer.
- **Not a replacement for PR 1.C.** PR 1.C is the foundation Phase 2 is built on. PR 1.C ships unchanged in scope; only the way we **talk about** it changes.

---

## 3. Tool catalog — every capability the orchestrator can call

This is the orchestrator's full action surface. Stable schema; one row per tool; status reflects current code reality. **The catalog is the contract.** Phase 2's first PR formalizes it into `src/lib/mastermind/tools/index.ts` (typed registry, Zod schemas, telemetry hooks); after that, every new tool must land in the registry before its first consumer can call it.

**Schema for each row:**

| Column | Meaning |
|---|---|
| Tool | Stable name. Used in telemetry. |
| Verb | The coaching action — `read_user_state`, `fetch_external`, `engine_analyze`, `retrieve`, `generate`, `compare`, `show_user`, `ask_user`, `log_writeback`, `lifecycle`. |
| Data source | Where the underlying truth comes from. |
| Input | One-line shape. |
| Output | One-line shape. |
| Cost | `cheap` (CPU only) / `medium` (single network or ~2s engine) / `expensive` (LLM or multi-stage). |
| Latency p50 | Order-of-magnitude. |
| Status | ✅ shipped (in the registry) / 🟢 shipped (in code, not yet registered) / 🟡 partial (primitive exists, no registry entry, blocker named) / ⚪ design-only / 🔵 NEW (in scope for Phase 2). |
| Phase to register | When the tool's registry entry lands. |

The full catalog. **Identified gaps surfaced inline at the bottom** (§3.7).

### 3.1 `read_user_state` — what the orchestrator knows about the user

| Tool | Data source | Input | Output | Cost | p50 | Status | Phase |
|---|---|---|---|---|---|---|---|
| `get_user_profile` | Firestore `/api/auth/me` | `{}` | `UserProfile \| null` | cheap | 100ms | 🟢 shipped | Phase 2.A |
| `get_user_games` | Firestore `users/{uid}/games` | `{limit, color?, fromDate?}` | `Game[]` | cheap | 200ms | 🟢 shipped | Phase 2.A |
| `get_user_chat_history` | Firestore `users/{uid}/chats` | `{limit}` | `ChatRecord[]` | cheap | 200ms | 🟢 shipped | Phase 2.A |
| `get_user_repertoire` | Firestore + built-ins | `{uid}` | `OpeningRepertoire \| null` | cheap | 100ms | 🟢 shipped | Phase 2.A |
| `aggregate_user_history` | `users/{uid}/games` + helpers | `{groupBy: "timeControl" \| "opening" \| "dateRange"}` | `Aggregate[]` | cheap | 300ms | 🟢 shipped (in PR 1.C `userHistoryAggregates.ts`) | Phase 2.A |
| `get_weakness_profile` | localStorage blob | `{uid}` | `WeaknessProfile \| null` | cheap | 50ms | 🟡 partial — blocked on **PR 1.E** (`POST /api/puzzle-stats`) | Phase 2.A (degraded) / unblocks on PR 1.E |
| `get_srs_state` | localStorage blob | `{uid}` | `Map<openingId, SRSEntry>` | cheap | 50ms | 🟡 partial — same blocker as above | unblocks on PR 1.E |
| `get_repetit_history` | localStorage blob | `{uid}` | `RepetitStats` | cheap | 50ms | 🟡 partial — same blocker | unblocks on PR 1.E |

### 3.2 `engine_analyze` — what Stockfish + the primitives say

| Tool | Data source | Input | Output | Cost | p50 | Status | Phase |
|---|---|---|---|---|---|---|---|
| `analyze_position` | Stockfish 17 WASM | `{fen, depth?}` | `{eval, bestLine, pv}` | medium | 1s | 🟢 shipped | Phase 2.A |
| `analyze_position_multipv` | Stockfish 17 WASM | `{fen, depth?, n: 3..5}` | `PrincipalVariation[]` | medium | 1.5s | 🟡 partial — UCI supports MultiPV; wrapper not extracted | Phase 2.A (extract wrapper) |
| `compute_feature_delta` | PR 1.A `featureDelta.ts` | `{fenBefore, fenAfter, fenAtResolution?}` | `PositionFeatureDelta` | cheap | 30ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `find_resolution_point` | PR 1.A | `{fen, pv}` | `{resolutionFen, plyOffset, reason}` | cheap | 20ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `classify_piece_roles` | PR 1.A `pieceRoles.ts` | `{fen}` | `Map<Square, PieceRole[]>` | cheap | 50ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `build_threat_tree` | PR 1.A `threatTree.ts` | `{fen, depthBudget}` | `ThreatTree` | medium | 800ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `find_critical_moments` | PR 1.A `criticalMoments.ts` | `{positions: Position[]}` | `CriticalMoment[]` | cheap | 100ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `evaluate_position_complexity` | PR 1.A `complexity.ts` | `{fen, multipv?}` | `ComplexityScore` | cheap | 50ms | 🟢 shipped (PR 1.A) | Phase 2.A |
| `predict_human_move` | Maia-2 HF Spaces | `{fen, targetElo}` | `{moveUci, prob}[]` | medium | 1.5s | 🟢 shipped | Phase 2.A |
| `prophylaxis_check` | composes `analyze_position_multipv` (opp side) | `{fen}` | `OpponentThreat[]` | medium | 1.5s | ⚪ design-only — composition primitive | Phase 2.B |
| `candidate_gap_analysis` | composes engine + `ask_user` | `{fen, userCandidates}` | `{userMoves, engineTop3, gaps}` | medium | 2s | ⚪ design-only | Phase 2.E (needs ask_user) |

### 3.3 `retrieve` — external + curated retrieval (NEW workstream for Phase 2)

| Tool | Data source | Input | Output | Cost | p50 | Status | Phase |
|---|---|---|---|---|---|---|---|
| `fetch_lichess_tablebase` | `tablebase.lichess.ovh` | `{fen}` (≤7 pieces) | `{category, dtm?, dtz?, moves}` | medium | 400ms | 🟢 shipped (PR 1.A `lichessTablebase.ts`); 24h LRU cache | Phase 2.A |
| `fetch_lichess_master_db` 🔵 | `explorer.lichess.ovh/masters?fen=...` | `{fen, until?: year}` | `{moves[], white/draws/black, topGames[]}` | medium | 500ms | 🔵 NEW — Phase 2.B | Phase 2.B |
| `fetch_lichess_opening_explorer` 🔵 | `explorer.lichess.ovh/lichess?fen=...` | `{fen, speeds?, ratings?}` | `{moves[], gameStats, topGames[]}` | medium | 500ms | 🔵 NEW — Phase 2.B | Phase 2.B |
| `fetch_master_game_pgn` 🔵 | `lichess.org/game/export/{id}.pgn` | `{gameId}` | `{pgn, headers}` | medium | 400ms | 🔵 NEW — Phase 2.B | Phase 2.B |
| `fetch_lichess_user_games` | `api/lichess/current-games`, `api/lichess/game` | `{username, limit?}` | `Game[]` | medium | 800ms | 🟢 shipped | Phase 2.A |
| `fetch_chesscom_user_games` | `api/chesscom/ongoing` + ext | `{username, limit?}` | `Game[]` | medium | 800ms | 🟢 shipped | Phase 2.A |
| `fetch_lichess_player_profile` 🔵 | `lichess.org/api/user/{username}` | `{username}` | `LichessProfile` | medium | 300ms | 🔵 NEW — Phase 2.B | Phase 2.B |
| `web_retrieve_opening_theory` 🔵 | curated allow-list (see §10.4) | `{query, eco?, opening?}` | `{snippets[], source[]}` | medium | 1.5s | 🔵 NEW — Phase 2.D | Phase 2.D |
| `lookup_jhamtani_commentary` | Neo4j `:Commentary` nodes | `{fen}` | `CommentaryEntry[]` | medium | 400ms | 🟡 partial — **blocked on PR 1.D** (corpus state unverified per [PR_1C_DATA_AUDIT.md §A](PR_1C_DATA_AUDIT.md)) | unblocks on PR 1.D |
| `opponent_scout` | `scoutService.ts` + `/api/scout` | `{username, platform}` | `ScoutAnalytics + Collisions` | medium | 2s | 🟢 shipped | Phase 2.A |

### 3.4 `generate` — synthesis tools

| Tool | Data source | Input | Output | Cost | p50 | Status | Phase |
|---|---|---|---|---|---|---|---|
| `tag_concepts` | LLM + `conceptLLMTagger.ts` | `{fen}` | `Concept[]` | expensive | 2s | 🟢 shipped | Phase 2.A |
| `find_similar_puzzles` | Neo4j + FEN cosine | `{fen, themes?, ratingBand?}` | `Puzzle[]` | medium | 400ms | 🟢 shipped (`mistakeToPuzzleMapper.ts`) | Phase 2.A |
| `generate_annotated_pgn` 🔵 | composes master DB + engine + concepts + LLM annotator | `{startingFen \| variation, themes?, userSkillLevel}` | `{pgn, comments, citations}` | expensive | 8s | 🔵 NEW — Phase 2.D | Phase 2.D |
| `share_card_render` | `shareCard.ts` | `ShareCardData` | `PNG` | medium | 300ms | 🟢 shipped | Phase 2.A |
| `synthesize_chesstalker_narrative` | LLM with second prompt | `{pgn, playerColor}` | `Narrative` | expensive | 6s | ⚪ design-only — deferred (was Phase 4.A; now optional capability) | post-Phase 2 |

### 3.5 `show_user` / `ask_user` / `log_writeback` / `lifecycle` / `compare`

| Tool | Verb | Status | Phase |
|---|---|---|---|
| `show_board_with_arrows` | show_user | ⚪ design-only — needs SSE protocol | Phase 2.D |
| `present_position_for_solving` | show_user | ⚪ design-only — needs SSE protocol | Phase 2.D |
| `ask_user_question` | ask_user | ⚪ design-only — needs `/api/chats/{id}/agent-reply` | Phase 2.E (optional) |
| `request_user_to_explain` | ask_user | ⚪ design-only — same | Phase 2.E (optional) |
| `render_board_diagram` 🔵 | show_user | 🔵 NEW — Response-object render directive: `{fen, arrows[], highlights[]}` embedded in a Response section; renderer expands it to the underlying `show_board_with_arrows` SSE event on the wire | Phase 2.F |
| `render_pgn_inline` 🔵 | show_user | 🔵 NEW — Response-object render directive: `{pgn, annotations[]}` embedded in a Response section; renderer mounts an inline PGN player in the chat bubble | Phase 2.F |
| `compare_features` | compare | 🟢 shipped (PR 1.A) | Phase 2.A |
| `compare_to_master_treatment` 🔵 | compare | 🔵 NEW — composes `fetch_lichess_master_db` + engine | Phase 2.C |
| `diff_repertoire` | compare | ⚪ design-only | post-Phase 2 |
| `repertoire_gap_against_player` | compare | 🟡 partial — primitive exists in scout | Phase 2.C |
| `find_repertoire_holes` 🔵 | compare | 🔵 NEW — composes user repertoire + master DB | Phase 2.C |
| `opening_novelty_detector` 🔵 | compare | 🔵 NEW — composes user game + master DB | Phase 2.C |
| `start_lesson_session` | lifecycle | ⚪ design-only — needs `MastermindSession` Firestore subdoc | Phase 2.E (optional) |
| `mark_concept_introduced` / `mark_concept_mastered` | lifecycle | ⚪ design-only | Phase 2.E (optional) |
| `end_session_with_summary` | lifecycle | ⚪ design-only | Phase 2.E (optional) |
| `recommend_next_topic` | lifecycle | ⚪ design-only | post-Phase 2 |
| `log_retrieval_event` | log_writeback | 🟢 shipped | Phase 2.A |
| `log_capability_gap` 🔵 | log_writeback | 🔵 NEW — writes to `capability_gaps.md` (§5.4) | Phase 2.B |

### 3.6 Explicit non-tools (do not register)

- `classify_intent` — the router *above* the orchestrator, not a tool inside it. Lives at [`api/classify-intent/route.ts`](../src/app/api/classify-intent/route.ts).
- `tts_speak` — UI-layer concern. The chat-bubble component decides whether to pipe through TTS.
- `categoryClassifier` — same router class. Runs before the orchestrator's plan step (§4.1); not invoked from inside the plan.

### 3.7 Phase 2 catalog additions (the 🔵 NEW entries — recap)

Phase 2 adds ~12 NEW tools to the catalog. The 🔵 NEW rows in §3.1–§3.5 are the full list; this is the recap with phase-of-introduction for quick reference:

| Tool | Verb | Phase |
|---|---|---|
| `fetch_lichess_master_db` | retrieve | 2.B |
| `fetch_lichess_opening_explorer` | retrieve | 2.B |
| `fetch_lichess_player_profile` | retrieve | 2.B |
| `fetch_master_game_pgn` | retrieve | 2.B |
| `compare_to_master_treatment` | compare | 2.C |
| `find_repertoire_holes` | compare | 2.C |
| `opening_novelty_detector` | compare | 2.C |
| `generate_annotated_pgn` | generate | 2.D |
| `web_retrieve_opening_theory` | retrieve | 2.D |
| `log_capability_gap` | log_writeback | 2.B |
| `render_board_diagram` | show_user | 2.F |
| `render_pgn_inline` | show_user | 2.F |

After Phase 2 ships, additions to the catalog are gated on capability-gap-log entries (§5.4), not speculation.

### 3.8 Known Gaps — Deferred to Post-Phase-2

Capabilities the orchestrator could plausibly use but that are explicitly scoped out of Phase 2. **Aayan revisits this list quarterly after Phase 2 ships.** A gap graduates to active scope when (a) the quarterly review fires it, or (b) the capability-gap log shows it repeatedly in production turns. Each entry retains description, rationale, and a one-line deferral note.

| Gap | Why it would help | Why deferred |
|---|---|---|
| **Personal opening tree** (user's own, derived from their games) | Closes the "where your own repertoire ends before your opponent's" sentence in the Najdorf-prep bar; lets the orchestrator cite from the user's actual played-game tree as a distinct source type from the static repertoire | Phase 2 timeline; `user_repertoire` already fills the same source-type slot in the §5.3 floors. Build when the gap log fires for "I needed the user's played tree, not their declared repertoire." |
| **Engine-with-Maia composition** (`engine_with_human_likely_refutation`) | Phrasing like "the engine likes Nd5 but a 1900 will probably play Nf6 — and after Nf6 the position is …" — turns engine truth into human-grounded coaching | Phase 2 timeline; the orchestrator can sequence `analyze_position_multipv` + `predict_human_move` manually in the call graph without a dedicated composition tool. Build when the manual sequencing pattern shows up repeatedly in the capability gap log. |
| **Phase accuracy + time-management diagnostics** (`compute_phase_and_time_diagnostics`) | "You time-troubled hard in the middlegame — your last 5 losses, your clock was under 60s by move 25." The Aimchess-equivalent insight, unique to game_review and improvement_strategy categories | Phase 2 timeline; existing `phaseAccuracy.ts` plus `aggregate_user_history` covers a degraded version. Promote to a first-class tool when the gap log shows recurring requests in improvement_strategy turns. |
| **Annotated game store** (persistent record of orchestrator output the user can revisit) | Each amazing response is a build-up artifact — searchable history, "show me the analysis from last Tuesday" works | Depends on infrastructure not yet built (new Firestore subdoc `users/{uid}/mastermind_responses`, retrieval UI). Bigger lift than Phase 2 timeline allows. Revisit when CMIP-2 surfaces user-side "I want my old analyses" demand. |
| **Cross-turn tool result reuse within a session** | Follow-up turns build on prior tool calls without re-fetching ("based on what you just told me about Vinod_kk's psychology, what should I do if he opens 1.e4?" reuses the prior scout call) | Phase 2 timeline; in-turn step 2→step 3 result passing is NOT deferred (it's intrinsic to the agent loop in §4.2). Only cross-turn reuse is deferred. Within-session reuse needs careful invalidation logic that's worth deferring until the cost/latency data shows it's needed. |
| **Lichess Studies retrieval** (fetch counterpart to `lichess_studies_export`) | Curated annotated content for opening theory + GM training | `web_retrieve_opening_theory` covers most cases via the Lichess studies entry in the allow-list. Revisit if the gap log fires for "I needed structured study chapters, not raw HTML." |
| **Tablebase coverage extension** (8+ pieces) | Cleanly mark capability boundary; the orchestrator should know it can't tablebase a 9-piece endgame and degrade gracefully | Not a tool — a capability boundary marker. Document in [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) §11 extension. Phase 2 ships without a "tablebase unavailable" sentinel; the orchestrator falls back to engine evaluation when tablebase 404s. |
| **Chess.com profile + games** (symmetry with Lichess) | First-class registry entries for Chess.com users so the orchestrator plans Chess.com calls as cleanly as Lichess calls | Partially shipped already; symmetry doesn't gate the Najdorf-prep bar (Lichess is the primary scout target). Add registry entries when Chess.com user base grows enough that the gap log calls it out. |
| **Live broadcast game retrieval** (Lichess broadcasts API) | Up-to-date master games beyond the classical masters DB — Carlsen 2026 events, recent broadcast play | Defer; classical masters DB covers 2024 and prior. Build when the gap log shows "I needed a 2025/2026 master game" repeatedly in opponent_prep turns. |

---

## 4. The agent loop — plan, execute, synthesize

The orchestrator's core flow. Three discrete steps, each instrumented with telemetry that threads through the existing PR 1.C pipeline.

### 4.1 Step 1: PLAN

**Inputs:**
- `question` — user's raw text
- `category` — from `categoryClassifier` (PR 1.C), already run before the orchestrator
- `userContext` — `{profile, recentGames, repertoire, openSession}` — fetched lazily from the catalog
- `priorTurns` — chat history relevant to this session

**Output:** a **call graph** — an ordered list of tool calls, each with `{toolName, args, dependsOn: toolNames[]}`. The graph is a DAG: tools can be called in parallel where they don't share dependencies (e.g., `opponent_scout` and `get_user_repertoire` can run in parallel for an opponent-prep question), and chained where they do (e.g., `compute_feature_delta` depends on the FEN that `analyze_position` produces).

**Implementation:** an LLM call using Claude's `tools` parameter — but **in planning mode only**. The LLM is given the tool catalog (§3) as system context (cached) and is asked: *"For this question, in this category, with this user context, which tools should we call and in what order?"* The LLM responds with structured JSON conforming to a `CallGraph` schema. **No tool actually runs in step 1.** The plan is a contract for step 2.

**Why a separate plan step (vs Anthropic's streaming `tools=[...]` interleave):**
- **Predictability.** Step 2 can validate the plan against caps (max 12 tool calls per turn) and budgets ($0.25 p95) before any cost is incurred.
- **Replayability.** The plan is stored with the turn for debugging. "Why did Mastermind not pull master games here?" becomes inspectable.
- **Parallelism.** Independent tool calls run in parallel — Anthropic's streaming tool use is sequential.
- **Capability-gap surfacing.** If the LLM tries to plan a tool that doesn't exist, the plan validator catches it and triggers `log_capability_gap` (§5.4).

**Cost:** 1 Sonnet call, ~1.5k tokens out, ~$0.012. Cached system shaves repeat-turn cost.

**Failure modes:**
- LLM returns malformed plan → re-prompt once, then fall back to a per-category default plan (a hard-coded "for opponent_prep, call X+Y+Z" map).
- LLM plans a tool not in the catalog → `log_capability_gap`, drop the call, continue with the rest of the plan.
- Plan exceeds 12-call cap → trim from the lowest-priority calls (priority field on each plan entry).

### 4.2 Step 2: EXECUTE

**Inputs:** the call graph from step 1.

**What it does:**
1. Walks the DAG. Calls leaves (no dependencies) first; calls parents after their dependencies resolve.
2. Runs independent leaves in parallel via `Promise.allSettled` — bounded concurrency = 4 (cap on simultaneous outbound network).
3. For each tool call: enforces timeout from a per-tool budget table; on timeout, treats as `tool_failed`.
4. On `tool_failed`: consults the tool's declared `fallback` (in `MastermindTool<I, O>`). If a fallback exists, runs it; if not, drops the call and continues with the rest of the plan.
5. Stores each tool's result in an in-turn result map keyed by tool name + args hash, so step 3 can read from it. **This is per-turn only.** Cross-turn reuse (follow-up turns within the same session re-using prior tool results without re-fetching) is deferred — see §3.8.
6. Emits per-tool telemetry (`tool_call_start`, `tool_call_end`, `tool_call_failed`) into the existing PR 1.C pipeline.

**Output:** `ToolResults` — a map of `toolName → {result, latencyMs, costUsd, errorClass?}`.

**Budget enforcement (ratified per §12.2 T3):**
- Per-Haiku-parser call: **3s** (carries forward from PR_1C_PLAN §2.3).
- Per-Sonnet-flagship call (plan, synthesize, retry): **12s** (carries forward from PR_1C_PLAN §2.3).
- Total pipeline budget per turn (plan + execute + synthesize + validators + retries): **30s** wall-clock ceiling. Beyond this, partial results pass through with a `partial_execution` flag; fail-soft, user always gets something.

**Failure handling:**
- One failed tool: synthesis continues with the rest. No regenerate at this stage.
- All tools failed: fall back to the pre-orchestrator single-shot path (the current PR 1.C behavior). User gets a coherent answer, just one without composition.

### 4.3 Step 3: SYNTHESIZE

**Inputs:**
- `ToolResults` from step 2
- `question`, `category`, `userContext`, `persona` (from user profile)

**What it does:** a single Sonnet flagship call that takes the tool results as structured context and composes the final response. The system prompt is the existing `SYSTEM_PROMPT_TEMPLATE` from `chessPrinciples.ts:172` + the persona block + a **synthesis directive** explaining how to cite from each tool's result (e.g., "when stating opponent's opening frequency, cite from `opponent_scout.prep.asBlack.weaknesses[].name`").

**Output:** the prose response, streamed to the user via SSE.

**Then:**
- Single-source validators fire on each claim (PR 1.B + PR 1.C — unchanged).
- Composite validator fires on the full response (§5).
- If hallucination ceiling miss → regenerate (PR 1.B behavior unchanged).
- If composite coverage floor miss → flag the response for capability-gap analysis (synthesis got the data but didn't compose enough sources — usually a prompt issue, not a tool-availability issue).

**Cost:** ~1 Sonnet flagship call, ~3k tokens in (from tool results) + ~1.5k out = ~$0.025.

### 4.4 Per-turn cost projection (orchestrator)

| Step | Tokens | Cost |
|---|---|---|
| Cached system + catalog (Phase 2 onward — ~10k tokens cached) | 10k cached | $0.003 |
| Plan step (Sonnet) | 1.5k out | $0.012 |
| Execute step (per-tool, median 5 calls) | mixed | $0.020 |
| Synthesize step (Sonnet) | 3k in + 1.5k out | $0.025 |
| Single-source validators (PR 1.C, ~3 Haiku parses) | — | $0.003 |
| Composite validator (1 Haiku parse) | — | $0.001 |
| **Per turn median** | | **~$0.064** |
| **Per turn p95 (12-call long turn, retry path)** | | **~$0.21** |

Both inside the §1.3 ceilings ($0.10 median, $0.25 p95). At 50k MAU × 5 turns/user/month median = 250k turns/month × $0.064 = **~$16k/month** Anthropic spend. That's the steady-state budget Phase 2 must hit. Higher than the prior plan's $5.5k–$9k projection — correctly accounting for the orchestrator's compositional value.

### 4.5 Telemetry shape (extends PR 1.C)

Per-turn `correlation_id` threads through. New event types:

```jsonc
{ "event": "plan_step_start", "correlation_id", "category", "user_id" }
{ "event": "plan_step_end", "tools_planned": [...], "plan_cost_usd": 0.012 }
{ "event": "tool_call_start", "tool": "opponent_scout", "args_hash": "..." }
{ "event": "tool_call_end", "tool": "...", "latency_ms", "cost_usd", "result_size" }
{ "event": "tool_call_failed", "tool": "...", "error_class", "fallback_used": true }
{ "event": "synthesize_step_start" }
{ "event": "synthesize_step_end", "output_tokens", "cost_usd" }
{ "event": "validator_event", ... }                          // existing PR 1.C
{ "event": "composite_coverage_check", "sources_cited": [...], "category", "floor", "passed": true }
{ "event": "capability_gap_logged", "gap_description", "category" }
```

Sentry tags add `module=mastermind-orchestrator`, `category=<value>`, `phase=plan|execute|synthesize`. ISEF dataset extraction (per PR_1C_PLAN §3.3) extends naturally.

---

## 5. Composite validator architecture + capability gap logging

The single-source validators (PR 1.B + PR 1.C) catch fabricated claims. They don't catch **shallow composition** — a response that's individually accurate but didn't pull from enough sources to be amazing. The composite validator closes that gap.

### 5.1 What the composite validator checks

For each turn, after synthesis:
1. **Count distinct source types cited.** A "source type" is one of: `feature_delta`, `scout`, `user_history`, `user_repertoire`, `jhamtani`, `lichess_master_db`, `lichess_opening_explorer`, `master_game_pgn`, `web_theory`, `engine`, `maia`, `tablebase`, `pgn_generated`, `personal_opening_tree`, `phase_diagnostics`.
2. **Check against the category's coverage floor** (§5.3).
3. **Emit `composite_coverage_check` telemetry event.**
4. **On floor miss:** flag the turn. **Does NOT regenerate.** A miss is a signal to inspect, not an immediate retry. (Regeneration on coverage miss would burn cost on what might be a legitimately simple question.) Flagged turns surface in the weekly capability-gap review.

### 5.2 How source types are detected

The composite validator does **not** re-parse the response. It reads the **tool result map** from step 2 and the **claim-attribution map** that the single-source validators already produce. Each single-source validator (`scoutCitation`, `userHistoryCitation`, etc.) tags every successfully-cross-checked claim with its source type. The composite validator unions these tags into a set; that set is the "distinct sources cited."

This means the composite validator is **cheap** (~1 Haiku parse to handle edge cases where a claim straddles two sources — for example a sentence citing both scout AND user-history; see PR 1.F conditional below). Most turns get the composite check for ~$0.001.

### 5.3 Per-category coverage floors

These are starting points calibrated against the Najdorf-prep bar and the original PR 1.C citation floors. Tune after first sweep.

| Category | Required source-type count | Required source types (any of) | Optional but counts |
|---|---|---|---|
| **opponent_prep** | ≥ 4 distinct | `scout`, `user_repertoire` OR `personal_opening_tree`, `lichess_master_db` OR `master_game_pgn`, `web_theory` OR `lichess_opening_explorer` | `pgn_generated`, `engine` |
| **game_review** | ≥ 3 distinct | `feature_delta`, `engine`, `user_history` | `master_game_pgn`, `jhamtani`, `phase_diagnostics`, `personal_opening_tree` |
| **position_analysis** | ≥ 2 distinct | `feature_delta` OR `engine`, `tablebase` (if endgame) OR `web_theory` (if opening) OR `master_game_pgn` | `maia`, `pgn_generated` |
| **concept_explanation** | ≥ 1 (permissive — explanations can legitimately come from one well-grounded source) | `jhamtani` OR `master_game_pgn` OR `web_theory` OR `feature_delta` | any |
| **improvement_strategy** | ≥ 2 distinct | `user_history`, `user_repertoire` OR `personal_opening_tree` OR `phase_diagnostics` | `web_theory`, `pgn_generated` |
| **meta_motivational** | 0 (no coverage requirement — these are about how the user feels, not what they need to know) | n/a | n/a |

### 5.4 Capability gap logging

The orchestrator maintains `MASTERMIND_CONTEXT/capability_gaps.md` (append-only). Two triggers:

**Trigger A — plan step identifies a missing tool.** During step 1 (PLAN), the LLM is allowed to describe a capability it would use if it existed (free-text). The plan validator extracts these, drops them from the actual call graph, and emits one entry per gap:

```markdown
## 2026-05-25 — turn b4c1a8

**Category:** opponent_prep
**Question summary:** "Prep for Vinod_kk tonight"
**Missing capability:** "Retrieve broadcast games from the past 30 days for this specific opening so I can show recent practical examples"
**Why agent thought it needed it:** Master DB has classical games only; recent broadcast play would show modern practice
**What agent did instead:** Used Lichess master DB only — surfaced Carlsen 2024 but no 2025/2026 games
**Frequency:** 1 (first occurrence)
```

**Trigger B — composite coverage floor miss.** When §5.3 fails despite the tools available, the gap is in synthesis prompting, not tool availability — but it's still worth logging. Less detailed entry; just records the turn + floor missed + which source types were present vs expected.

**Aayan reviews weekly.** Real engineering on missing capabilities is a separate workstream prioritized from the log. **The orchestrator does NOT attempt to self-create tools at runtime, ever.** Catalog-with-gap-logging, not self-modifying agents — this is a hard contract enforced in code (step 2 only executes tools that exist in the registry; the plan validator drops everything else).

### 5.5 Composite validator vs PR 1.F (`cross_source_claim` coordinator)

PR 1.F (from PR_1C_PLAN §11.6) is a *different* concern. PR 1.F coordinates **single claims that span two sources** (e.g. "your opponent crushes you in Najdorfs" combines opponent's opening frequency with your win-rate vs that opening — one sentence, two sources). The composite validator counts **distinct source types** across all claims in the response — different question.

Both can coexist. PR 1.F's measurement gate (≥5% of opponent_prep / improvement_strategy turns produce composite claims) still applies; PR 1.F is independent of Phase 2 critical path.

---

## 6. Phasing — three phases (rewrite)

This rewrite collapses the old 5-phase plan. Phases 4 (chesstalker + persona) and 5 (innovation + distribution) are deferred indefinitely; phase 3 (Tier A content authoring) is replaced by runtime external retrieval inside Phase 2.

| Phase | Theme | Approx PRs | Unlocks |
|---|---|---|---|
| **1 — Foundation** | PR 1.C complete (six-category classifier, single-source validators, persona scrape, Stage A-C sweep). | 1 (PR 1.C, in flight) | Substrate for Phase 2. Hallucination + citation discipline. |
| **2 — Orchestrator** | Tool catalog formalization, agent loop, external retrieval tools, PGN generation, composite validators, capability gap logging. | 5–8 (see §8) | The Najdorf-prep bar. Multi-source synthesis with real grounding. |
| **3 — CMIP + correlation** | CMIP-2 rating UI rollout, instrumentation, human evaluation of orchestrator output, correlation analysis vs Phase 1 metrics. Triggers recalibration of Phase 1 metrics if correlation is weak. | 2–4 (CMIP-2.A through 2.D, depending on rollout shape) | Real-user signal on whether the orchestrator output is amazing or just feels amazing. Validates or recalibrates the metric foundation. |

**Aayan-triggered side workstreams** — parallel with Phase 2; **do not gate it**:
- **PR 1.D — Jhamtani wire-up.** Restores `lookup_jhamtani_commentary` after investigation step. See [PR_1C_PLAN.md §11.6](PR_1C_PLAN.md).
- **PR 1.E — puzzle-stats sync + restore 3 deferred user-history claim types.** Also unblocks `get_weakness_profile`, `get_srs_state`, `get_repetit_history`. See [PR_1C_PLAN.md §11.6](PR_1C_PLAN.md).
- **PR 1.F — `cross_source_claim` coordinator** (conditional on Stage C sweep showing ≥5% composite-claim rate in opponent_prep or improvement_strategy). See [PR_1C_PLAN.md §11.6](PR_1C_PLAN.md).

**Deferred indefinitely** (not deleted — moved to backlog):
- Chesstalker perspective (was Phase 4.A) — folded into orchestrator as an optional `synthesize_chesstalker_narrative` tool, not its own phase.
- Persona conditioning extended (was Phase 4.B) — persona conditioning happens in the synthesis step's prompt; no dedicated phase needed.
- Reddit board-screenshot bot, Lichess Studies export, browser extension, adaptive cost-budget per user (was Phase 5) — distribution work, deferred until orchestrator validates.

---

## 7. Phase 1 — Foundation (unchanged scope, reframed)

**PR 1.A ✅, PR 1.B ✅, PR 1.C in flight.** Authoritative plan: [PR_1C_PLAN.md](PR_1C_PLAN.md). Stage A.1 (categoryClassifier) committed; Aayan reviews `category-seed-examples.json` before Stage A.2.

### 7.1 What Phase 1 ships

- Six-category classifier (`categoryClassifier.ts`) — runs **above** the orchestrator (the router), not inside.
- Single-source validators — `evalClaim`, `featureDeltaCitation`, `scoutCitation` (20 patterns), `userHistoryCitation` (3 derivable types).
- Stage 3 primitives — feature delta, piece roles, threat trees, tablebase, complexity, critical moments. Registered as tools in Phase 2.A.
- Persona-scrape pipeline (Reddit + Lichess forums + Stack Exchange) — produces the synthetic-tester's real-question corpus.
- Synthetic-tester gate — 50-turn sweep, hallucination ≥95% per category hard ceiling, per-category citation floors.
- Telemetry pipeline — Sentry forwarding, ISEF dataset extraction.
- Feature flag `MASTERMIND_VALIDATORS_ENABLED`, preview-only.

### 7.2 What Phase 1 does NOT ship

- Composite validator (Phase 2.B).
- Orchestrator (Phase 2.A).
- Retrieval tools beyond what already exists (Phase 2.B+).
- PGN generation (Phase 2.D).
- Capability gap log (Phase 2.B).

### 7.3 Reframing only

The PR 1.C foundation work was previously framed as the **endpoint** of "smart coaching": single-source validation catches hallucinations and that's enough. Under the orchestrator framing, PR 1.C is the **substrate**: every validator built in Phase 1 fires inside Phase 2's orchestrator on the orchestrator's tool-call results. No scope changes, no new commits added to PR 1.C from this rewrite.

### 7.4 Phase 1 unblock criterion for Phase 2

Phase 2.A starts when PR 1.C merges to main. Phase 2.A does **not** wait for CMIP rating data — that gating from the prior plan is dropped. CMIP rating data is now Phase 3's input, not Phase 2's gate.

**Rationale for dropping the CMIP gate:**
- The synthetic-tester gate (PR 1.C) is a sufficient quality floor to ship the orchestrator behind a preview flag.
- CMIP rating data takes weeks-to-months to accumulate; gating orchestrator on it locks Mastermind into single-shot for that whole period.
- The Phase 1 metrics may be miscalibrated, but they catch *the worst* failures. Shipping the orchestrator on a slightly-miscalibrated gate is cheaper than not shipping the orchestrator.
- Phase 3's correlation analysis still runs — if metrics turn out weak, the recalibration happens to the orchestrator already in production, not before it.

---

## 8. Phase 2 — Orchestrator (the rewrite's main work)

5–8 PRs depending on decomposition. Listed in dependency order; PRs marked **(parallelizable)** can ship out of order once their prerequisites land.

### 8.1 PR 2.A — Tool registry + agent loop core (~800 LOC)

**Goal:** the orchestrator runs end-to-end on the **existing** catalog (no new tools yet). Composes feature-delta-based responses for game_review and position_analysis using only Phase 1's primitives. The Najdorf-prep bar is NOT hit by 2.A — that's the cumulative outcome of 2.A through 2.D.

**New files:**
- `src/lib/mastermind/tools/registry.ts` — typed `MastermindToolRegistry` with Zod schemas, telemetry hooks, fallback declarations.
- `src/lib/mastermind/tools/index.ts` — registers ~25 existing tools (all 🟢 in §3, plus extracted-wrapper 🟡 partials).
- `src/lib/mastermind/orchestrator/plan.ts` — step 1 (PLAN). LLM-driven, structured-JSON output.
- `src/lib/mastermind/orchestrator/execute.ts` — step 2 (EXECUTE). DAG walker, parallel concurrency 4, per-tool timeouts.
- `src/lib/mastermind/orchestrator/synthesize.ts` — step 3 (SYNTHESIZE). Composes tool results into prose; runs single-source validators post-synthesis.
- `src/lib/mastermind/orchestrator/sessionContext.ts` — in-session context store keyed by `correlation_id`.
- Tests: ~600 LOC covering the three steps with mocked tools, plus integration tests with real PR 1.A primitives.

**Edits to `/api/enhanced-analysis/route.ts`:**
- Behind `MASTERMIND_ORCHESTRATOR_ENABLED` flag (preview-only at first, same posture as `MASTERMIND_VALIDATORS_ENABLED`).
- Replaces the single-shot `callLLM` path with `orchestrator.run(...)` when flag on.

**Acceptance gate:** synthetic-tester run on PR 1.C's 5 active categories shows ≥ baseline on each. Specifically, orchestrator-on responses score no worse than orchestrator-off on hallucination + citation rates. (Quality gains come in 2.B+ when retrieval lands; 2.A is parity + plumbing.)

### 8.2 PR 2.B — External retrieval tools + composite validator + capability gap log (~1,000 LOC) **(prerequisite: 2.A)**

**Goal:** the orchestrator can now reach outside Chess Masti's own data. Lichess master DB, Lichess opening explorer, Lichess player profile, master-game PGN retrieval. Composite validator measures coverage. Capability gap log starts capturing entries.

**New files:**
- `src/lib/mastermind/tools/retrieve/lichessMasterDb.ts` — wraps `explorer.lichess.ovh/masters?fen=...`. 24h LRU cache.
- `src/lib/mastermind/tools/retrieve/lichessOpeningExplorer.ts` — wraps `explorer.lichess.ovh/lichess?fen=...`.
- `src/lib/mastermind/tools/retrieve/lichessPlayerProfile.ts` — wraps `lichess.org/api/user/{username}`.
- `src/lib/mastermind/tools/retrieve/masterGamePgn.ts` — wraps `lichess.org/game/export/{id}.pgn`.
- `src/lib/mastermind/validators/compositeCoverage.ts` — composite validator per §5.
- `src/lib/mastermind/orchestrator/capabilityGapLog.ts` — append-only writer for `MASTERMIND_CONTEXT/capability_gaps.md`.
- `MASTERMIND_CONTEXT/capability_gaps.md` — initial empty file with header.
- Tests: ~400 LOC.

**Edits:**
- Registry entries for the 4 new retrieval tools + composite validator wired into post-synthesis pipeline.
- Orchestrator's plan step now sees the new tools in its catalog context.

**Acceptance gate:** opponent_prep category in synthetic-tester sweep shows ≥3 distinct source types cited per turn (90% of turns). Capability gap log has ≥10 entries from the sweep (capturing what tools still don't exist).

### 8.3 PR 2.C — Composition primitives + repertoire-vs-opponent (~450 LOC) **(parallelizable with 2.D after 2.B)**

**Goal:** the orchestrator composes engine + retrieval into compound tools. `find_repertoire_holes`, `compare_to_master_treatment`, `opening_novelty_detector`. Closes the repertoire-vs-opponent composition for the Najdorf-prep bar; the existing `user_repertoire` source covers the user's prep slot in the §5.3 coverage floor.

**New files:**
- `src/lib/mastermind/tools/compose/repertoireHoles.ts`
- `src/lib/mastermind/tools/compose/masterTreatment.ts`
- `src/lib/mastermind/tools/compose/openingNovelty.ts`
- Tests: ~200 LOC.

**Deferred from PR 2.C scope (moved to §3.8 Known Gaps — Deferred to Post-Phase-2):**
- `build_personal_opening_tree`
- `engine_with_human_likely_refutation`
- `compute_phase_and_time_diagnostics`

The Najdorf-prep bar's 4-source coverage floor (opponent_prep) is satisfied by: `scout` + `user_repertoire` + `lichess_master_db` + (`web_theory` OR `lichess_opening_explorer`), without the deferred items. The deferred items would *enrich* opponent_prep responses but are not load-bearing for the floor.

**Acceptance gate:** Najdorf-prep-like fixture (one carefully-constructed test prompt) produces a response with ≥4 distinct source types AND a coherent narrative AND zero single-source hallucination flags.

### 8.4 PR 2.D — PGN generation + show_user protocol + web theory retrieval (~900 LOC) **(parallelizable with 2.C after 2.B)**

**Goal:** the orchestrator can produce drillable PGN artifacts and render board overlays. Web retrieval over the curated allow-list lands here so PGN annotations can cite opening theory.

**New files:**
- `src/lib/mastermind/tools/generate/annotatedPgn.ts` — composes `fetch_lichess_master_db` + `analyze_position_multipv` + `tag_concepts` + LLM annotator. Output: `{pgn, comments, citations}`.
- `src/lib/mastermind/tools/retrieve/webTheory.ts` — curated allow-list (Wikipedia, chessgames.com, Lichess studies pages, Wikibooks); fetches, extracts relevant section, returns snippets with provenance.
- `src/lib/mastermind/tools/show/boardWithArrows.ts` + new SSE event type.
- `src/lib/mastermind/tools/show/positionForSolving.ts` + new SSE event + new `/api/mastermind/solve-position` endpoint.
- New components: `BoardWithArrows.tsx`, `SolvePositionBubble.tsx`, `PgnAttachment.tsx` (chat-bubble PGN preview + download).
- Tests: ~500 LOC.

**Edits to `AICoachChat.tsx`:**
- SSE consumer handles the new event types.
- PGN attachments render as collapsible-expandable cards inside the existing chat-bubble layout.

**Acceptance gate:** synthetic-tester run shows `pgn_generated` source-type in ≥70% of opponent_prep turns. Composite coverage floor for opponent_prep (≥4 distinct sources) met in ≥80% of turns.

### 8.5 PR 2.E — Lifecycle + ask_user (optional, scope-cuttable) (~600 LOC)

**Goal:** the orchestrator can persist sessions, mark concept progress, ask follow-up questions. `MastermindSession` Firestore subdoc, `start_lesson_session`, `mark_concept_introduced`, `mark_concept_mastered`, `end_session_with_summary`, `ask_user_question` + `/api/chats/{id}/agent-reply`.

**This PR is optional within Phase 2.** If timeline pressure mounts, cut this and re-introduce post-Phase 2. The orchestrator works without lifecycle persistence; it just doesn't accumulate per-user history of mastery state.

### 8.6 PR 2.F — Mastermind Response UI (~900–1400 LOC, 1–2 PRs) **(cut-LAST tier)**

**Goal:** the orchestrator's seven-source synthesis renders as an **interactive structured response**, not a wall of prose. The current Analyze-My-Game UI (eval chart, clickable moves, accuracy bands, inline panels) is Chess Masti's strongest visual pattern; Mastermind matches that bar. **Without 2.F, the orchestrator's work is mostly invisible** — the depth of the seven-source composition needs UI affordances to land.

**Decomposes into 1–2 PRs** depending on how the renderer splits. Likely shape:

**Sub-PR 2.F.i — Structured Response shape + progress events (~500 LOC).** Server-side.
- New types: `MastermindResponse { sections: ResponseSection[], citations: Citation[], artifacts: Artifact[] }`. Each `ResponseSection` carries `{ heading, prose, citations: CitationRef[], artifacts: ArtifactRef[] }`. Citations point into a flat array; artifacts are board diagrams, inline PGNs, master-game previews, opening-tree fragments, Stalker Score visualizations, repertoire collision diagrams.
- The synthesize step (§4.3) emits `MastermindResponse` as a typed object, not a prose string. The streaming-to-user step now streams structured JSON section-by-section (still over SSE; new event type `response_section`).
- **Progress events during execute step.** While step 2 runs tools in parallel, emit SSE events like `{type: "progress", message: "Analyzing your opponent's repertoire..."}` so the user sees activity during the 4s window. Messages are generated from the plan step's `tools_planned` list (Aayan-authored per-tool progress-message strings in the registry). 4s of latency feels like depth, not lag.

**Sub-PR 2.F.ii — Frontend renderer + mobile-first layout (~400–900 LOC).** Frontend.
- New component: `MastermindResponseRenderer` in `src/components/mastermind/` — reads `MastermindResponse` SSE stream, builds the interactive view.
- **Sections expand/collapse.** Heavier sections collapsed by default on mobile; expanded by default on desktop.
- **Citations are clickable.** A citation to `scout.psychology.tiltAfterLossLossRate` opens a small inset showing that exact data point with provenance. A citation to a master game opens an inline PGN preview with the position at the cited move.
- **Board diagrams** use existing react-chessboard primitives + new `BoardWithArrows` overlay (the low-level SSE event from PR 2.D).
- **Embedded PGNs** use the existing PGN trainer component if compatible; otherwise a lightweight inline viewer.
- **Mobile-first.** Per the India/Southeast Asia positioning ([project_business_goals.md](../../memory/project_business_goals.md)). Touch targets, collapsible sections by default, swipe-friendly artifacts. Tested at 360px width minimum.

**First consumer.** The opponent_prep flow. That's where the seven-source composition pays off most visibly — a Najdorf-prep response with collapsible sections, clickable Scout/master-DB/repertoire citations, an embedded PGN drill with arrows on the three pivot moves.

**Acceptance gate:** Najdorf-prep fixture from §8.3 plus a real preview-deploy walkthrough on a 360px viewport. Aayan signs off the responsive layout before merge. Composite coverage floor for opponent_prep (≥4 sources, §5.3) still passes with the new structured-response shape.

**Cut posture:** 2.F is **cut-LAST tier** (§14). The depth of the orchestrator's work is invisible without it; cutting 2.F means we shipped Phase 2 and most users won't see what makes it good. Treat 2.F as the closing argument on "amazing."

### 8.7 PR 2.G — Synthetic-tester rewrite for orchestrator metrics (~400 LOC)

**Goal:** extend the PR 1.C sweep harness to measure orchestrator-specific metrics — composite coverage by category, capability-gap log throughput per sweep, tool-call mix per turn, plan-step quality (did the LLM plan the right tools for the question?).

**New metric (becomes a gate metric in Phase 2.G's sweep):** **plan accuracy** — for each question, manually-labeled "ideal tool set" by Aayan on a 50-turn fixture; orchestrator's plan compared. Target ≥80% of ideal tools in the plan (precision can be lower — the orchestrator can plan extra tools).

### 8.8 PR 2.H — Production promotion + flag promotion criteria (~200 LOC) **(prerequisite: all of 2.A-2.G)**

**Goal:** define + meet promotion criteria for flipping `MASTERMIND_ORCHESTRATOR_ENABLED=true` in prod. Same shape as PR_1C_PLAN.md §4.4 promotion criteria.

**Criteria:**
1. Phase 2.A–2.G merged to main.
2. Composite coverage floors met per category in last 7 days of preview sweeps.
3. No tier-1 Sentry alert from `module=mastermind-orchestrator` over 7 days.
4. p95 latency in preview ≤ 5s.
5. p99 cost per turn in preview ≤ $0.35 (some headroom over the §1.3 target). **Per the §1.3 / §4.4 / §10.3 cost framing — cost is not a build-level gating constraint; this criterion exists to surface anomalies, not to cap spend.**
6. Capability gap log has been reviewed by Aayan and no P0 gap (a gap that prevents a category from hitting its coverage floor) is unresolved.
7. UI walkthrough on mobile + desktop has been signed off by Aayan (Phase 2.F closing-argument check).

**When all seven hold,** ops PR flips the prod flag.

---

## 9. Phase 3 — CMIP-2 + correlation analysis

Phase 2 ships the orchestrator. Phase 3 evaluates whether it's actually amazing.

### 9.1 What Phase 3 produces

- **CMIP-2 rating UI** on coach responses (expansion beyond CMIP-1.A-1.D interns to real-user ratings).
- **Human-rating corpus** at sufficient volume (rough threshold: ≥500 rated orchestrator turns across the six categories).
- **Correlation analysis** between synthetic-tester metrics (Phase 1 + Phase 2.F) and human ratings.
- **Metric recalibration**, if needed:
  - Strong correlation: metrics validated. Continue as planned.
  - Weak correlation: iterate on the validator pipeline, classifier, coverage floors, or persona-fidelity rubric. The recalibration happens **to the orchestrator already in production**, not before it.

### 9.2 What CMIP-2 unlocks downstream

- DPO/preference-tuning pairs for future model selection.
- Per-category recalibration data for the synthetic-tester gates.
- Distribution stress-test data: are users actually asking the questions the persona-scrape predicted, or have we calibrated against a non-representative distribution?

### 9.3 Phase 3 disposition of the persona-scrape pipeline

Per [PR_1C_PLAN.md §1.7.3](PR_1C_PLAN.md), the persona scraper retires when CMIP yields ≥500 categorized real-user questions. Phase 3's first sweep against the human-rating corpus is also the trigger to flip persona-script generation from "scrape forums" to "draw from CMIP corpus." The scraper code stays in repo for ISEF reproducibility but is no longer the source of synthetic-tester questions.

### 9.4 Phase 3 PR breakdown (provisional)

| PR | Goal | LOC est |
|---|---|---|
| CMIP-2.A | Rating UI component + Firestore write path + Supabase mirror | ~600 |
| CMIP-2.B | Cohort rollout — first 1k MAU see the UI; gather ratings | ~200 (mostly flag work) |
| CMIP-2.C | Correlation analysis notebook + dashboard | ~400 (Python/SQL, lives in `audit/`) |
| CMIP-2.D | Metric recalibration PR(s) — fired conditionally per analysis findings | varies |

---

## 10. Cross-cutting concerns

### 10.1 Observability + telemetry

Already-shipped pipeline (PR 1.C `validatorTelemetry.ts`) extends naturally to the orchestrator events in §4.5. New event types pass through the same Sentry forwarder. ISEF query patterns extend; correlation_id threads through plan + execute + synthesize + validators.

A `/admin/mastermind` dashboard (gated `users.role === "admin"`) surfaces:
- Tool-call mix per category (which tools fire how often).
- Composite coverage rate by category over time.
- Capability-gap throughput (how often the agent hits gaps).
- Per-tool error rate, latency p50/p95/p99, cost.

### 10.2 Prompt cache discipline

Catalog system context (tool catalog + per-category planning hints) is ~10k tokens. **Always** cached via `cacheSystem: true`. Within-session turns within 5 min of the last hit the cache, dropping plan-step cost from ~$0.012 to ~$0.002.

The category-specific synthesis prompt is ~2k additional tokens. Also cached. Cache fragments per category — six caches, each warm during sessions touching that category.

### 10.3 Cost model

§4.4 covers per-turn projection. Steady-state at 50k MAU is ~$16k/month flagship spend. Headroom of 2× (for traffic spikes, prompt-cache misses, long agent-loop turns) suggests **$32k/month ceiling** is the conservative budget Phase 2 must hit. Below that ceiling, no further demotion to Haiku is required; above it, complexity-aware Haiku demotion (per the prior §4.4 / §9.4) kicks in.

The original $5.5k–$9k projection assumed the orchestrator costs the same as the single-shot path. It doesn't — the orchestrator costs ~2× per turn for multi-source synthesis. That's the value trade. Anthropic-credit acquisition strategy ([FUTURE_IDEAS.md](../FUTURE_IDEAS.md)) becomes more load-bearing under this budget; flag for monitoring.

### 10.4 Web retrieval allow-list

`web_retrieve_opening_theory` does **not** crawl the open internet. Phase 2.D ships with a fixed allow-list. Sources beyond this require Aayan-reviewed addition.

Initial allow-list:
- `en.wikipedia.org` — chess pages only (URLs matching `/wiki/[A-Z][a-z_]+_(opening|defense|gambit|attack|variation|game)`)
- `chessgames.com` — game pages + opening pages
- `lichess.org/study/...` — public study pages
- `en.wikibooks.org/wiki/Chess_Opening_Theory/...` — community-maintained opening tree
- `chessprogramming.org` — for the rare engine-internals question

All retrieval is rate-limited (1 req per source per 2 seconds, polite User-Agent, no parallelism per source). Responses cached 24h. Untrusted content sanitized through HTML→text + markdown-strip before reaching synthesis.

### 10.5 Security — prompt-injection hardening

Tool inputs are an even bigger attack surface under the orchestrator (more tools, more inputs per turn). Every tool input validated via Zod schema in [src/lib/validation/schemas.ts](../src/lib/validation/schemas.ts), continuing AUDIT-PHASE-1.4.

Additional discipline specific to orchestrator:
- **The plan step's LLM output is data, not code.** Plan validator parses JSON strictly; treats unknown tool names as gaps (logs them, drops them), never as instructions.
- **Tool results are sandboxed.** Synthesis step receives tool results as structured context; the LLM can't invoke tools recursively from inside synthesis prose.
- **Untrusted retrieval results sanitized.** Web-theory retrieval output passes through an HTML→text + markdown-strip filter before reaching synthesis. Lichess/explorer outputs are trusted (well-formed JSON from known endpoints).
- **Capability gap log content sanitized.** The orchestrator's free-text gap descriptions are stripped of code blocks and angle-bracket markup before commit.

### 10.6 Failure handling

Every Phase 2 tool's failure mode lives in [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md). New ones to document during Phase 2:
- §12 — plan step LLM produces invalid JSON
- §13 — execute step tool times out
- §14 — synthesize step exceeds composite-validator floor without retrying
- §15 — capability gap log write fails
- §16 — orchestrator session context store exceeds memory bound
- §17 — `web_retrieve_opening_theory` allow-list returns a 404 or hostile content

**No "swallow + warn" anti-pattern.** Every failure surfaces a typed sentinel that the next step reasons about explicitly.

### 10.7 Per-PR merge contract (extends PR_1C_PLAN §11)

Every Phase 2 PR must satisfy:

1. **Branch hygiene** — off main, no stacked branches.
2. **TSC clean** at every commit.
3. **Tests** — every new tool has Vitest tests with mocked + real-primitive paths.
4. **Synthetic-tester pass** — full sweep on preview, no regression on §1.3 dimensions. PR description quotes the by-category + by-source-type breakdown.
5. **Mandatory call site** — every new tool declares its first consumer (orchestrator plan-step few-shots or post-synthesis composer); PR description quotes the relevant catalog row.
6. **Cost reported** — median + p95 cost per turn with cache discipline verified.
7. **Failure mode documented** — appended to MASTERMIND_FAILURE_MODES.md before merge.
8. **Feature flag** — preview-only at merge; flag promotion is a separate ops PR per §8.7.
9. **CLAUDE.md updated** if a mental-model item changes (e.g., the orchestrator path's existence).
10. **Capability gap log review** — if the PR's preview deploy generates ≥5 gap entries, Aayan reviews the log before merge.

**Auto-merge eligibility:** Phase 2 PRs are auto-merge when CI green and nothing weird, **except** PRs that introduce new retrieval tools touching external services — those require Aayan review (legal/ToS posture of each source).

---

## 11. Effort estimates

Per Aayan's directive: calendar is flexible, attention is not. These are realistic ranges with the assumption Aayan is reviewing key checkpoints on a normal cadence (a few hours per week of focused review, not full-time).

| Phase | PR | Sequential weeks | Notes |
|---|---|---|---|
| **1** | PR 1.C completion | 2–3 weeks | Stage A.2-A.9 + Stage B + Stage C sweep + iteration commits. Already mid-flight. |
| **2.A** | Tool registry + agent loop core | 2–3 weeks | Largest single PR. The orchestrator framework is most of the work. |
| **2.B** | External retrieval + composite validator + gap log | 2 weeks | Lichess endpoints are well-documented; retrieval tools are mechanically similar. |
| **2.C** | Composition primitives (3 tools — scope reduced after deferring 3 to §3.8) | 1–2 weeks | Parallelizable with 2.D and 2.F after 2.B lands. |
| **2.D** | PGN generation + show_user SSE + web retrieval | 2–3 weeks | Parallelizable with 2.C and 2.F after 2.B lands. PGN annotator is the most novel piece. |
| **2.E** | Lifecycle + ask_user (optional) | 1–2 weeks | Cut-candidate. |
| **2.F** | Mastermind Response UI | 2–3 weeks | Cut-LAST tier. Decomposes into 1–2 PRs. Parallelizable with 2.C/2.D after 2.B (structured Response shape depends on 2.A; renderer can iterate while 2.C/2.D land). |
| **2.G** | Synthetic-tester rewrite for orchestrator metrics | 1 week | Mostly extension of existing sweep harness. |
| **2.H** | Production flag promotion | 0.5 week + 1–2 weeks of preview stabilization | Mechanical PR; the weeks come from waiting for the §8.8 criteria to fire. |
| **3.A-D** | CMIP-2 + correlation analysis | 4–8 weeks | Includes time for ratings to accumulate. CMIP-2.A-2.B ship quickly; 2.C-2.D fire after ≥500 ratings collected. |

**Aggregate (sequential, no parallelism):** ~19–28 weeks Phase 1 + Phase 2 + Phase 3.

**Aggregate (with 2.C/2.D/2.F parallel, optional 2.E cut):** ~16–23 weeks.

**Parallelizable workstreams:**
- PR 1.D / 1.E / 1.F (Aayan-triggered side workstreams) can run anytime alongside Phase 2 without blocking it.
- Phase 2.C, 2.D, and 2.F are parallelizable once 2.B lands.
- Phase 3.A (CMIP-2 rating UI) can start during Phase 2 — the UI doesn't depend on the orchestrator's tools, only on its existence.

**Hard sequential dependencies:**
- 2.A → 2.B (composite validator needs the orchestrator loop to fire on).
- 2.A → 2.F (Response shape depends on the orchestrator's synthesize step existing).
- 2.B → 2.C, 2.D (composition tools and PGN need retrieval).
- 2.B → 2.H (promotion criteria reference capability-gap log + composite coverage).
- 2.F → 2.H (promotion needs UI walkthrough sign-off per §8.8 criterion 7).
- 2.G → 2.H (promotion needs orchestrator-metric data).

**Calendar posture (ratified 2026-05-18):** calendar is flexible; quality is the constraint. Summer-busy noted; no hard date. Cost is not a build-level gating constraint (§1.3, §4.4, §10.3).

---

## 12. Open design questions, by reviewer

### 12.1 Chess + coaching judgment — Aayan to review

| # | Question | Default if no input |
|---|---|---|
| C1 | **Per-category coverage floors** (§5.3). Are the source-type counts and the per-category required-source lists right? Especially: is `opponent_prep ≥ 4` too strict for the average turn? Real opponents often have sparse Lichess data — `opponent_scout` might only cover 60% of the floor's required types on its own. | Ship as specced; iterate after first orchestrator sweep |
| C2 | **What constitutes a "citation"** in the composite count. A response that mentions Lichess master DB once at the end vs threads master-game references throughout — both count as 1 source type or should the latter count more? | Each distinct source type = 1, regardless of citation count from that source (avoids over-rewarding verbose responses) |
| C3 | **Chesstalker perspective** disposition. Deferred indefinitely in this rewrite. Is the orchestrator's synthesis-step persona conditioning sufficient, or is chesstalker a distinct enough voice that it warrants its own capability? | Defer; revisit after Phase 2 dogfood |
| C4 | **PGN generation skill-level adaptation** (§3.4 `generate_annotated_pgn`). How does the annotator decide what to annotate vs skip for a given user skill level? Hardcoded thresholds by ELO, persona-driven, or per-question instruction from the orchestrator? | Per-question instruction from the orchestrator (LLM decides what to annotate based on user profile) |
| C5 | **Capability gap prioritization framework**. Once `capability_gaps.md` has hundreds of entries, how do we pick which to build? Frequency × category-floor-impact × estimated-build-cost? | Weekly review with Aayan; no automated prioritization in Phase 2 |
| C6 | **Najdorf-prep bar test fixture.** Should one carefully-constructed test prompt (the Najdorf example or similar) be a permanent acceptance gate, run on every Phase 2 PR? Or is it a one-time validation? | Permanent gate — runs on every Phase 2 PR, target is "composite coverage ≥ floor + 1 + at least one cross-source narrative thread" |
| C7 | **Tool catalog gap list (§3.7).** Are the disposition calls right? Specifically: build personal opening tree (yes/no), engine+Maia composition (yes/no), phase+time diagnostics (yes/no), annotated game store (yes/no). Each adds Phase 2 scope. | All "Build in Phase 2" as listed; cut if 2.C/2.D run over |

### 12.2 Architecture + scope + cost — ratified 2026-05-18

Tech-lead pass approved all ten decisions in bulk on 2026-05-18. Recording for the audit trail; plan body already reflects each ratification.

| # | Decision | Plan section |
|---|---|---|
| T1 | **Plan step is a separate Sonnet call producing a DAG.** Worth the extra latency for planning quality. | §4.1 |
| T2 | **Execution concurrency = 4** as the starting value. Tune based on first-sweep latency observations; raise to 8 if no rate-limit fires during Phase 2.B sweep. | §4.2 |
| T3 | **Per-tool timeouts carry forward from PR_1C_PLAN §2.3**: 3s per Haiku parser call, 12s per Sonnet flagship call, 30s total pipeline ceiling. Updated in §4.2. | §4.2 |
| T4 | **Composite validator fires after single-source validators** (single-source post-synthesis, then composite reads the source-tag union). Cheap; preserves single-source signal. | §5.2 |
| T5 | **Capability gap log is append-only Markdown** at `MASTERMIND_CONTEXT/capability_gaps.md`. Mirror to Supabase in CMIP-2.C if review throughput justifies it. | §5.4 |
| T6 | **Web theory retrieval allow-list** = Wikipedia, chessgames.com, Lichess studies, Wikibooks, ChessProgramming.org. **Allow-list can be extended via Aayan-triggered PR if a real gap is identified mid-build.** | §10.4 |
| T7 | **Master-game retrieval via Lichess explorer API.** If rate limits become a problem, fall back to local Megabase or equivalent with **explicit Aayan approval at that point**. Don't pre-build a fallback path. | §3.3, §8.2 |
| T8 | **PGN generation as a composite tool** — master DB + multipv engine + concept tagger + LLM annotator. Composition design approved. | §3.4, §8.4 |
| T9 | **Telemetry routes through the existing PR 1.C pipeline.** No new sink. Sentry tags + Sentry context as PR_1C_PLAN §3.2 describes; orchestrator events extend the existing structured-log schema. | §4.5, §10.1 |
| T10 | **Plan / Execute / Synthesize = three Sonnet calls per turn.** The separated three-step pattern is the design. (T1 + T10 are aligned: T1 = plan as separate call, T10 = full three-step pattern.) | §4 |

**Cost is not a build-level gating constraint** (§1.3, §4.4, §10.3 ratified 2026-05-18). $0.10/turn median, $0.25/turn p95, ~$16k/month at 50k MAU — all approved. No further cost gating in plan or implementation decisions. Promotion criterion §8.8 #5 surfaces anomalies, not caps spend.

### 12.3 Open questions resolved by this rewrite

(Recording for the audit trail. These were live before the rewrite; the rewrite resolves them.)

| Was open | Resolved as |
|---|---|
| Phase 2 (agent loop) blocked on CMIP rating data | **Unblocked.** Phase 2 starts when PR 1.C merges; CMIP becomes Phase 3 (correlation analysis), not a Phase 2 gate. |
| Tier A content authoring (was Phase 3) | **Folded into Phase 2 as runtime retrieval.** No curated dataset; calls Lichess/web at runtime; validators cross-check. |
| Chesstalker perspective (was Phase 4.A) | **Optional capability**, not a phase. `synthesize_chesstalker_narrative` tool, expressible by the orchestrator on demand. |
| Persona conditioning (was Phase 4.B) | **Folded into synthesis step's prompt.** No dedicated phase. |
| Streaming + tool use interleave (Anthropic SDK) | **Not used.** Separate plan + execute + synthesize steps (§4); synthesize step streams to user. |

---

## 13. Out of scope for this plan

For clarity, things that look adjacent but aren't:

- Native mobile app (post-Phase 5 — separate workstream).
- Visualization training (content product, not orchestrator-shaped).
- Native game annotation editing on Lichess Studies (vs `lichess_studies_export`).
- B2B academy pivot ([FUTURE_IDEAS.md](../FUTURE_IDEAS.md) — parked).
- Anthropic-credit acquisition strategy ([FUTURE_IDEAS.md](../FUTURE_IDEAS.md) — separate ops thread, becomes more important under §10.3 budget).
- Browser extension overlay (Phase 5 deferred — orchestrator inside the existing app first).
- Reddit bot (Phase 5 deferred).
- Multi-language (deferred — synthesis step handles via persona; UI strings translated separately).

---

## 14. Cut order under pressure

If a phase runs slow, cut in this order. Conversely, hold the cut-last tier under all circumstances — those items make the orchestrator the orchestrator.

### Cut first (drop, simplify, or defer if pressed)

1. **Composite validator complexity** — ship the simple "union tags from single-source validators" version (§5.2). Defer the multi-source single-sentence coordination logic (PR 1.F's job anyway).
2. **Persona scrape full pipeline** — fall back to Aayan's hand-authored question lists from the prior conversation if the scraper hits ToS issues or yields too few questions.
3. **Elaborate sweep metrics** — ship Phase 2.F with hallucination ceiling only; composite coverage metric and capability-gap-throughput metric added when CMIP data lands.
4. **Capability gap logging UI** — ship with raw `capability_gaps.md` file; defer any dashboard surface to CMIP-2.C.
5. **Phase 2.E entirely** (lifecycle + ask_user) — cut. Sessions are nice; not load-bearing for the Najdorf-prep bar.
6. **Web theory retrieval scope** — start with 2 allow-list sources (Wikipedia + Lichess studies) instead of 5; expand later.
7. **Engine+Maia composition** (§3.8 gap, already deferred to post-Phase-2) — ship without; the orchestrator can still produce strong opponent_prep with scout + master DB + opening explorer.

### Cut-last tier (never drop these)

These are what makes the orchestrator the orchestrator. If we're cutting these, the project isn't getting amazing — it's getting "validated single-shot," which we already have.

1. **The agent loop itself** (plan + execute + synthesize).
2. **External retrieval tools** — Lichess master DB, opening explorer, master-game PGN, player profile. Without these, the orchestrator is "Stage 3 grounding + scout + user history" — basically PR 1.C-shaped.
3. **PGN generation** — drillable artifacts are the closing argument on "amazing." A response that ends with "here's a 28-move drill annotated at the three pivot points" is qualitatively different from "here's some prose."
4. **Mastermind Response UI (Phase 2.F)** — the structured-response shape, the interactive renderer, the clickable citations, the progress events, the mobile-first layout. Without 2.F, the orchestrator's work is mostly invisible; the depth of seven-source composition needs UI affordances to land. Same tier as the agent loop and retrieval tools.
5. **Single-source validators** (PR 1.B + PR 1.C) — foundation. The orchestrator's claims need to pass these or the response is unsafe to ship.
6. **Lichess opening explorer integration** — the only path to "what does Carlsen play here." Loses too much without it.
7. **Category classifier** (PR 1.C foundation) — without it, the composite validator has no category to apply its floor to.
8. **Capability gap logging** — the discipline of "log don't patch" is what keeps the orchestrator from becoming a self-modifying mess.

Order in this tier reflects strict priority — if forced to cut, cut from the top of "cut first." If forced into "cut-last" territory, raise to Aayan immediately; the rescope changes the product, not the timeline.

---

## 15. Documentation updates queued (post-rewrite-commit, follow-up workstream)

The rewrite commit itself touches only `MASTERMIND_BUILD_PLAN.md` + archive of the prior plan. The sibling-doc updates below are a follow-up workstream — Aayan triggers them once Phase 2 detail-design starts, since some need fresh content the rewrite doesn't yet author:

- [MASTERMIND_TOOLS.md](MASTERMIND_TOOLS.md) — extend with the §3 catalog's NEW (🔵) entries; reconcile status flags to match the catalog table. Update §Mandatory call sites with Phase 2 first-consumer commitments. Add `render_board_diagram` and `render_pgn_inline` under show_user.
- [MASTERMIND_INDEX.md](MASTERMIND_INDEX.md) — add `capability_gaps.md` to the directory listing; bump version note.
- [MASTERMIND_FAILURE_MODES.md](MASTERMIND_FAILURE_MODES.md) — add §12–§17 failure modes from §10.6.
- [PR_1C_PLAN.md](PR_1C_PLAN.md) — add a §0 banner noting that PR 1.C is now framed as Phase 1 Foundation under the orchestrator framing (no scope change).
- `MASTERMIND_CONTEXT/capability_gaps.md` — created with empty header by Phase 2.B.

---

## 16. Status — approved 2026-05-18

Orchestrator framing approved. §1.2 Najdorf-prep bar stands. §5.3 coverage floors locked. §11 14–20 weeks parallelized acknowledged. §14 cut order approved (both tiers). Cost framing (§1.3, §4.4, §10.3) ratified as non-gating. §3.7 reorganized + §3.8 Known Gaps deferred to post-Phase-2. New Phase 2.F Mastermind Response UI inserted as a cut-LAST workstream. Tech-lead T1–T10 (§12.2) ratified in bulk.

**Next pause: Stage A.1 classifier-boundaries review** (independent of this rewrite, queued before the rescope). Aayan reads:

- `src/lib/mastermind/__tests__/categorization/fixtures/category-seed-examples.json` — six categories × 5–6 examples each + 4 deliberately ambiguous examples to test the low-confidence default route.
- The disambiguation hints in `src/lib/mastermind/categorization/categoryPrompts.ts` — boundary cases between opponent_prep / improvement_strategy, position_analysis / concept_explanation, improvement_strategy / meta_motivational.

Approve, request changes, or flag any category boundaries that look wrong. After approval, Stage A.2 (`validator-gate-dryrun.ts`) begins per [PR_1C_PLAN.md §1.2](PR_1C_PLAN.md). Phase 2 work does not start until Phase 1 (PR 1.C) merges to main.
