# MASTERMIND_COMPETITORS.md

## SUMMARY

Per-competitor profile drawing from three sources: the Feb 2026 Quality Improvement Plan ([Chess_Masti_AI_Quality_Improvement_Plan.docx](../Chess_Masti_AI_Quality_Improvement_Plan.docx)), the Feb 2026 Gap Analysis Roadmap ([_sources/gap_analysis_roadmap_feb2026.md](_sources/gap_analysis_roadmap_feb2026.md)), and a May 2026 competitive scan of ~35 products (kept out of the public repo). The two Feb 2026 docs are **historical context** — they predate the puzzles engine, structured 5-category prompt, hallucination validator, opponent scout, Twin Bot, and concept-first retrieval that have since shipped. Where the Feb 2026 docs say "Chess Masti AI does not have X," the entries below check the current code and override with a file citation when X has shipped. Each entry lists what the competitor does well, where Chess Masti now measurably beats them (citing the implementing file), and where they still lead. Five take-aways the agent should keep loaded: (1) Sensei Chess remains the closest architectural lookalike but lacks our hallucination validator; (2) DecodeChess pioneered the 5-category structure we now ship; (3) Lichess is free and open but has no LLM coaching layer; (4) Chess.com bundling is the #1 long-term risk; (5) "Spaced-repetition puzzles built from the user's own mistakes" remains essentially uncontested at our depth.

---

## Reading guide

The Feb 2026 docs are frozen-in-time snapshots. They list "Chess Masti AI: ✗" against many features that have since shipped. **Trust the citations in this doc over the Feb 2026 ✗-marks**:

- Puzzle / tactics trainer → shipped via [puzzleRepository.ts](../src/lib/puzzleRepository.ts), [api/chess-puzzles-dataset/](../src/app/api/chess-puzzles-dataset/), [api/adaptive-puzzles/](../src/app/api/adaptive-puzzles/)
- Mistakes-to-puzzles pipeline → shipped via [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts), [api/mistake-puzzles/](../src/app/api/mistake-puzzles/)
- Spaced repetition → shipped via [spacedRepetition.ts](../src/lib/spacedRepetition.ts) (SM-2 algorithm)
- Game import (chess.com / lichess) → shipped via [api/chesscom/](../src/app/api/chesscom/), [api/lichess/](../src/app/api/lichess/)
- Phase-based accuracy → shipped via [accuracy/index.ts](../src/lib/accuracy/index.ts) `computePhaseAccuracy`
- Strength / weakness profiling → shipped via [weaknessProfile.ts](../src/lib/weaknessProfile.ts)
- Humanlike AI opponent → shipped via [api/maia-predict/route.ts](../src/app/api/maia-predict/route.ts) (Maia-2 NeurIPS 2024)
- Personalized training plans → partial; weakness profile → puzzle theme map at [weaknessProfile.ts:261-269](../src/lib/weaknessProfile.ts#L261-L269)
- Multilingual support → not shipped
- Native mobile, browser extension, offline → not shipped

---

## Direct architectural lookalikes (the closest competitors)

### Sensei Chess

| Dimension | Detail |
|---|---|
| **What they do well** | Closest architectural pitch to Chess Masti — Stockfish + LLM-explained moves + spaced-rep on user mistakes, free, multi-language (Hindi, Tamil, Kannada, Portuguese), India/Brazil-flavored. AI coaching chat surface. Conversational. The closest direct lookalike in the scan. |
| **Where Chess Masti now beats them** | (1) **Hallucination validator** — Sensei does not document any chess.js cross-check on LLM output; we ship one at [aiResponseValidator.ts:38-86](../src/lib/aiResponseValidator.ts#L38-L86), invoked at [api/enhanced-analysis/route.ts:1272,1388](../src/app/api/enhanced-analysis/route.ts#L1272-L1388) and [chat/route.ts:115](../src/app/api/chat/route.ts#L115). (2) **Concept-first retrieval with FEN cosine rerank** — Sensei has flat theme-tag retrieval; we ship the three-stage pipeline at [conceptRetrieval.ts:1-50](../src/lib/concept/conceptRetrieval.ts#L1-L50) over a ~200K-puzzle Neo4j graph. (3) **Twin Bot opponent simulator** — Sensei has no opponent-rehearsal feature; we ship [twinBot.ts](../src/lib/twinBot.ts). (4) **Opponent scouting + share card** — Sensei has neither; we ship [scoutService.ts](../src/lib/scoutService.ts) + [shareCard.ts](../src/lib/shareCard.ts). |
| **Where they still lead** | Multilingual (Hindi/Tamil/Kannada/Portuguese ship today); Chess Masti is English-only. Existing distribution in India/Brazil markets is more entrenched. Per [FUTURE_IDEAS.md:171](../FUTURE_IDEAS.md#L171), multi-language is on the "Tier 2 [PRIORITY]" list — not yet shipped. |

### DecodeChess

| Dimension | Detail |
|---|---|
| **What they do well** | Pioneered the **5-category structured breakdown** (Threats / Best Moves / Plans / Piece Roles / Concepts) that the Quality Improvement Plan §3 cites as the gold standard for chess explanations. Engine-grounded — every claim verifiable against Stockfish. English-only, paid (freemium). |
| **Where Chess Masti now beats them** | (1) **The 5-category prompt is now ours too** — [coachChatPrompt.ts:170](../src/lib/prompts/coachChatPrompt.ts#L170) ships the same structure, threaded through [enhanced-analysis/route.ts:14-17](../src/app/api/enhanced-analysis/route.ts#L14-L17) — and we are free where DecodeChess is paid. (2) **Conversational follow-up** — DecodeChess outputs structured analysis but offers no chat surface; we wire follow-up Q&A through [api/chat/route.ts](../src/app/api/chat/route.ts) using the cached `contextId`. (3) **Spaced repetition + mistake-puzzle pipeline** — DecodeChess does not connect explanations to drilling; we do via [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts) and [spacedRepetition.ts](../src/lib/spacedRepetition.ts). |
| **Where they still lead** | More polished UI for the structured-output reading experience. Their 5-category framing is paired with a domain-specific UI affordance (collapsible cards per category) we don't yet have — currently we deliver the same content as flowing prose in chat bubbles. |

### Aimchess (Chess.com-owned)

| Dimension | Detail |
|---|---|
| **What they do well** | Insights dashboard (phase accuracy, time mgmt, blunder patterns), opponent scouting from public games (similar architecture to ours), auto-generated weekly study plan, visualization training. Owned by Chess.com since 2022 — distribution riding on the Chess.com bundle. |
| **Where Chess Masti now beats them** | (1) **Maia-2 (NeurIPS 2024) human-likeness** — Aimchess does not ship a humanlike opponent model; we proxy Maia-2 at [api/maia-predict/route.ts:38-69](../src/app/api/maia-predict/route.ts#L38-L69) on HF Spaces. (2) **Twin Bot** rehearses against a *specific* opponent's repertoire ([twinBot.ts:1-22](../src/lib/twinBot.ts#L1-L22)); Aimchess scouts but doesn't simulate. (3) **Hallucination validator** ([aiResponseValidator.ts](../src/lib/aiResponseValidator.ts)) — Aimchess outputs appear template-driven rather than LLM-generated, so the comparison isn't symmetric. |
| **Where they still lead** | Insights dashboard polish; weekly-plan generator. Dashboard equivalents are partial in our weakness profile but lack the auto-generated plan UI. Per [FUTURE_IDEAS.md:153,159](../FUTURE_IDEAS.md#L153-L159) those are Tier-1 [PRIORITY] items. |

### Chessvia

| Dimension | Detail |
|---|---|
| **What they do well** | Voice + chat-follow-up coaching surface; coach-persona customization. The "chat follow-up that remembers prior sessions" wedge is barely contested — only Chessvia does it well. Browser extension overlay for chess.com/lichess. |
| **Where Chess Masti now beats them** | (1) **Server-cached contextId** — we already ship the cross-turn memory primitive at [analysisContextCache.ts](../src/lib/analysisContextCache.ts), used by the [chat/route.ts](../src/app/api/chat/route.ts) follow-up surface. This is underexposed in our marketing. (2) **Two-tier provider with prompt caching** — Chessvia has no documented tier strategy; we ship [llmProvider.ts:83-92](../src/lib/llmProvider.ts#L83-L92) (Sonnet/Haiku) with `cacheSystem` ephemeral marker at [llmProvider.ts:60-64](../src/lib/llmProvider.ts#L60-L64). |
| **Where they still lead** | Voice output (TTS) is shipped on Chessvia today; ours is design-only. Browser-extension distribution surface — Chessvia overlays the user's existing chess.com / lichess game; we require the user to come to chessmasti.com. Per [FUTURE_IDEAS.md:169](../FUTURE_IDEAS.md#L169), browser extension is Tier-2 [PRIORITY], not yet shipped. |

### Noctie.ai

| Dimension | Detail |
|---|---|
| **What they do well** | Strong humanlike AI opponent; opening drills with custom-repertoire import; mistakes-to-puzzles pipeline (per the Feb 2026 Gap Analysis matrix, only Noctie shipped this in Feb 2026). Spaced-rep flashcards. |
| **Where Chess Masti now beats them** | (1) **Mistakes-to-puzzles is now shipped on our side too** — [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts) + [api/mistake-puzzles/](../src/app/api/mistake-puzzles/), backed by the ~200K Neo4j graph. (2) **Maia-2 via HF Spaces** ([api/maia-predict/route.ts](../src/app/api/maia-predict/route.ts)) is the 2024 NeurIPS revision; Noctie's humanlike model is proprietary and not the published Maia lineage. (3) **Conversational coaching surface** — Noctie has no documented chat-follow-up Q&A; we ship [api/chat/route.ts](../src/app/api/chat/route.ts). |
| **Where they still lead** | Custom repertoire import is shipped on Noctie; Chess Masti's [repertoireParser.ts](../src/lib/repertoireParser.ts) parses PGN, but per MASTERMIND_USER_MODEL.md the persistence layer for user-imported repertoires is not identified. So users can't reliably "save" a custom repertoire across sessions today. Spaced-rep flashcard UI is more polished on Noctie. |

---

## Larger platforms (incumbents, distribution risks)

### Chess.com

| Dimension | Detail |
|---|---|
| **What they do well** | Dominant global platform. Game Review, Lessons, Insights, Puzzles, Bots (Mittens et al.), Coach matching, CAPS score, Vision (board fluency), Drills, Master Games DB. Bundle includes Aimchess + Chessable + Dr. Wolf + Magnus Trainer + Chess24. Owns most of Cluster 1. |
| **Where Chess Masti now beats them** | (1) **LLM-grounded coaching** — Chess.com's Game Review commentary is template-driven rather than position-specific prose. Our [enhanced-analysis](../src/app/api/enhanced-analysis/route.ts) pipeline produces position-specific structured output with the validator at [aiResponseValidator.ts:38-86](../src/lib/aiResponseValidator.ts#L38-L86). (2) **Cross-game context** — Chess.com Game Review carries no cross-game context about a user's repertoire or recurring weaknesses; we thread `WeaknessProfile` and repertoire into the system prompt. (3) **Conversational follow-up** — Chess.com does not surface a chat layer over Game Review. (4) **Free** — most of our equivalent surfaces are gated behind Diamond ($14/mo or $99/yr). |
| **Where they still lead** | Distribution dominance (Chess Masti has no equivalent funnel). Bots like Mittens are viral acquisition channels we have no analog for. Diamond Insights dashboard is more polished than our weakness summary. Threat: a Diamond tier with true LLM coaching would absorb our value prop directly — LLM-grade review explanations are the gap our coaching targets. |

### Lichess

| Dimension | Detail |
|---|---|
| **What they do well** | Free, open-source, donation-funded. Studies (best-in-class collaborative annotation). ~3M open puzzle DB (we use a 100K subset, see [data/lichess_puzzles_100k.csv](../data/lichess_puzzles_100k.csv)). Coordinate trainer. Insights dashboard. Coach directory (no platform cut). Unmetered Stockfish. |
| **Where Chess Masti now beats them** | (1) **LLM coaching layer** — Lichess has none, period. Eval-bar only. We ship the entire [llmProvider.ts](../src/lib/llmProvider.ts) → [enhanced-analysis](../src/app/api/enhanced-analysis/route.ts) coaching pipeline. (2) **Spaced repetition over user mistakes** — Lichess puzzles are random from the global pool; we map [mistakeToPuzzleMapper.ts](../src/lib/mistakeToPuzzleMapper.ts) over [conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts) for personalized drilling. (3) **Maia-2 humanlike opponent** — Lichess does not ship a humanlike-AI opponent on-platform. |
| **Where they still lead** | Studies (collaborative chapters, sharing); puzzle DB scale (3M vs our 200K loaded into Aura). Coordinate trainer. Open API for everything. Per [FUTURE_IDEAS.md:173](../FUTURE_IDEAS.md#L173), "Native game annotation + shareable studies" is Tier-2 [PRIORITY], not yet shipped. We use Lichess as our upstream data source — they remain the floor we read from, not a competitor we displace. |

### ChessBase (Mega Database / Fritz)

| Dimension | Detail |
|---|---|
| **What they do well** | Mega Database (10M+ professional games — no real free equivalent at depth). Opening repertoire builder with novelty detection, transposition handling. Engine cloud, distributed engine analysis ("Let's Check"). |
| **Where Chess Masti now beats them** | We don't compete in the same segment. ChessBase serves >2200 ELO professionals; per [FUTURE_IDEAS.md:199](../FUTURE_IDEAS.md#L199), pro-tier features like auto-novelty detection are explicitly off-strategy for us. Where we are better: web-first, free, approachable below 1500 ELO. |
| **Where they still lead** | Master Games DB depth (their 10M is licensed). Opening-repertoire builder polish. Pro-tier transposition handling. Not a head-to-head competitor for our 1000–1800 sweet spot. |

---

## Mid-tier improver-focused

### ChessMind (web) and ChessMind AI (mobile)

The Feb 2026 Gap Analysis Roadmap names these as separate products. Notable Feb 2026 features: ChessMind web ships "personalized training plans" and "progress / ELO tracking" that we don't yet ship as polished UIs; ChessMind AI ships "mission-based opening memory" that we don't have.

| Dimension | Detail |
|---|---|
| **What they do well** | Adaptive training plan UI (web). Mission-style opening progression (mobile). |
| **Where Chess Masti now beats them** | LLM coaching surface, hallucination validator, spaced rep over user mistakes — ChessMind has none of these per the Feb 2026 matrix. |
| **Where they still lead** | Polished training-plan UI. Mobile-native. Per [FUTURE_IDEAS.md:151,170](../FUTURE_IDEAS.md#L151-L170), "structured curriculum / what next path" is Tier-1 [PRIORITY] and "native mobile app" is Tier-2 [PRIORITY] — both not yet shipped on our side. |

### Caissa

| Dimension | Detail |
|---|---|
| **What they do well** | Game import (chess.com / lichess), strength/weakness profiling, intuition / pattern training. Club-player focused. |
| **Where Chess Masti now beats them** | (1) **Game import** is now shipped on our side too — [api/chesscom/](../src/app/api/chesscom/), [api/lichess/](../src/app/api/lichess/). (2) **Weakness profiling** — [weaknessProfile.ts](../src/lib/weaknessProfile.ts) (with the localStorage caveat documented in MASTERMIND_USER_MODEL.md). (3) **LLM coaching** — Caissa does not ship NL explanations per Feb 2026 matrix. |
| **Where they still lead** | Pattern / intuition training is a distinctive UX they own. We have no analog. |

### AI Chess Coach (Android)

| Dimension | Detail |
|---|---|
| **What they do well** | Offline capability; play-vs-AI; tactics trainer; multilingual. Mobile-only. |
| **Where Chess Masti now beats them** | LLM coaching, validator, structured 5-category output, ~200K Neo4j puzzle graph, Maia-2 — all absent from AI Chess Coach. |
| **Where they still lead** | Offline mode (we don't ship). Native mobile (we don't ship). |

---

## Engagement / acquisition specialists

### ChessVision.ai

What they do well: best-validated organic-acquisition pattern in the chess SaaS space — the [u/chessvision-ai-bot](https://chessvision.ai/docs/bots/reddit/) Reddit bot auto-replies to board screenshots on r/chess; won "Best Chess Startup 2020" largely from that flywheel. Vision OCR (board scan from image / PDF / video / YouTube) is their headline.

Where Chess Masti beats them: LLM coaching depth (their bot replies are short engine-grounded summaries). They are not building a coaching surface; we are.

Where they still lead: distribution flywheel via Reddit (we have nothing comparable). Per [FUTURE_IDEAS.md:183](../FUTURE_IDEAS.md#L183), "Reddit board-screenshot bot" is on our Tier-3 backlog explicitly because of ChessVision's success.

### ChessDojo

What they do well: cohort-based progression with Discord community, sparring positions vs Stockfish/Maia, annotated game submissions reviewed by GMs. Subscription $15/mo.

Where Chess Masti beats them: free; LLM coaching depth; the entire AI/automation layer.

Where they still lead: human-coached community moat. ChessDojo's review pipeline is human-graded. Per [FUTURE_IDEAS.md:177](../FUTURE_IDEAS.md#L177), "annotated game submissions with AI sensei review" is a Tier-2 idea (an AI version of their human pipeline) — distinctive but not yet shipped.

### Chessable

What they do well: spaced-repetition drilling on opening lines, paid GM courses (Quickstarter format), large content catalog. Owned by Chess.com (2022).

Where Chess Masti beats them: SRS over user *mistakes*, not just opening lines (Chessable's SRS is restricted to authored content). LLM coaching layer — Chessable has none. Free where Chessable is paid course-by-course.

Where they still lead: GM-authored course depth; Quickstarter UX is a known good for opening study.

### Chess Tempo

What they do well: deepest tactical-puzzle catalog with sophisticated taxonomy ("Guess the Move" master-game replay, multiple puzzle modes, leaderboards, endgame trainer with 3-7 piece tablebase positions).

Where Chess Masti beats them: LLM coaching layer. Cross-puzzle context via [conceptRetrieval.ts](../src/lib/concept/conceptRetrieval.ts).

Where they still lead: puzzle taxonomy depth (they ship 271 levels / 105 skills); endgame trainer with tablebase. Per [FUTURE_IDEAS.md:163,176](../FUTURE_IDEAS.md#L163-L176), "Guess the Move" and "Endgame trainer with tablebase positions" are Tier-1 / Tier-2 backlog items — not shipped.

### Dr. Wolf

What they do well: NL move explanations during play; voice option. Owned by Chess.com.

Where Chess Masti beats them: hallucination validator; concept-first retrieval; conversational follow-up after the game (Dr. Wolf is an in-play coach, not a post-game analyst).

Where they still lead: in-play coaching UX. Voice. Per [FUTURE_IDEAS.md:160-161](../FUTURE_IDEAS.md#L160-L161), "Decoded-play mode" and "Voice output" are Tier-1 backlog — not shipped.

### ChessKid

Out-of-segment for our 1000–1800 adult sweet spot. Not a head-to-head competitor — different market (kids). Reference for B2B academy pivot evaluation per FUTURE_IDEAS.md §5.

### OpeningTree

What they do well: Personal opening tree from your games (W/D/L per branch). Exactly the diagnostic surface we already compute the data for in [scoutService.ts:16-22](../src/lib/scoutService.ts#L16-L22) but expose only as opponent-tree, not personal-tree.

Where Chess Masti beats them: structured-output coaching surface, hallucination validator, broader feature set.

Where they still lead: personal-opening-tree as a first-class user surface. Per [FUTURE_IDEAS.md:152](../FUTURE_IDEAS.md#L152), this is Tier-1 [PRIORITY] — we have the data plumbing but no first-class UI yet.

---

## Take-aways for the agent

1. **Trust the citations over the Feb 2026 ✗-marks.** Several "we don't have X" claims in [Chess_Masti_AI_Quality_Improvement_Plan.docx](../Chess_Masti_AI_Quality_Improvement_Plan.docx) and [_sources/gap_analysis_roadmap_feb2026.md](_sources/gap_analysis_roadmap_feb2026.md) are stale. Check the codebase before agreeing with the user that a feature is missing.
2. **Sensei Chess and DecodeChess are the conceptual peers.** When the user compares us to "another AI chess coach," ask whether they mean Sensei (architecturally similar, English-only at parity, Chess Masti now ahead on validator + opponent-scout) or DecodeChess (paid, structured-output reference for our 5-category prompt).
3. **Lichess is upstream, not competition.** We pull puzzles from their open DB; their Studies are a niche they own; an extension that *adds* coaching to Lichess (Tier-2 [PRIORITY] per [FUTURE_IDEAS.md:169](../FUTURE_IDEAS.md#L169)) would attack white-space, not Lichess.
4. **Chess.com bundle consolidation is the watch-this-quarter risk.** The day Game Review v2 ships LLM-grade explanations, our biggest differentiator gets bundled into a Diamond sub. Watch for LLM-grade explanations appearing in Game Review.
5. **Distribution beats features.** Chess Masti is engineering-strong, distribution-light. Hackathons and creator-funnel partnerships are the levers — not more features.
