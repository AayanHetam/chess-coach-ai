# Future Ideas

Long-tail backlog of strategic options that aren't on the active Phase 3 plan but are worth revisiting. Captured here so they don't get lost between sessions. New items go at the bottom of the relevant section.

---

## #1 TOP PRIORITY — Claude Mastermind: agentic chess coach

Captured 2026-05-02. Strategic direction for the AI coaching surface. Not a feature — the *shape* of the product.

### The idea

The coach should have GM-tier capabilities the user can ask for anything: "show me Fischer-Spassky 1972 game 6," "drill me on knight movement," "why did I lose this rook ending?" Claude interprets the request and routes it to the right capability. Single intelligent surface, not a menu of separate tools.

### Architecture

Tool-using Claude agent loop, **built into the existing [enhanced-analysis route](src/app/api/enhanced-analysis/route.ts)** — not a new endpoint or UI. Same [AICoachChat.tsx](src/components/AICoachChat.tsx) frontend. The agent loop replaces (or extends) the current single-shot LLM call: Claude picks tool → tool runs → result feeds back → Claude decides next step → final answer streams to UI.

### Tools — two tiers

**Tier A: pre-loaded files in repo (instant, common asks).** "Sitting in the back chilling, ready to be activated if prompted." Likely under `/data/`:
- GM games archive — Fischer-Spassky, Carlsen-Nepo, Kasparov-Karpov, world championship games as PGN
- Piece-movement drills — basic piece movement, mate-in-1, fork/pin/skewer fundamentals
- Famous endgame studies (Lucena, Philidor, Réti)
- Opening traps library
- *Already wired:* Stockfish analysis, Maia, opening repertoire ([src/lib/repertoireParser.ts](src/lib/repertoireParser.ts))

**Tier B: Claude fetches live (rare requests).** Anything not pre-bundled — Lichess/Chess.com lookups by player or game ID, master-DB position search, etc.

### Stage 3 — feature deltas + tablebase grounding (added 2026-05-08)

Captured after a Reddit-thread audit of how Take Take Take / Nova Chess generate their move explanations ([novachess-guy LinkedIn post excerpted in conversation 2026-05-08](#)). The architecture they describe is the same four-stage pipeline we already run: Stockfish → structured feature extraction → feature deltas at the line's resolution point → LLM as translator. We are at parity on stages 1, 2, 4 but **missing stage 3 entirely**: [positionAnnotator.ts](src/lib/positionAnnotator.ts) is called once on the resulting FEN at [enhanced-analysis/route.ts:558](src/app/api/enhanced-analysis/route.ts#L558), with no before/after diff. Eval delta (cpBefore/cpAfter) is the only delta we compute today. Tablebase is also entirely absent from the codebase.

This subsection defines stage 3 as an explicit deliverable inside the Mastermind plan, with mandatory call sites that prevent the "built and never called" failure mode.

#### What stage 3 produces

A `PositionFeatureDelta` shape: per-feature changes between **the position before the move** and **the position at the resolution point of the variation** (after forced trades and forced sequences settle). Concretely:

```ts
interface PositionFeatureDelta {
  materialDelta: { white: number; black: number };
  pawnStructureDelta: {
    gained: ("passed-pawn" | "outpost" | "open-file" | ...)[];
    lost: ("passed-pawn" | "isolated" | "backward" | ...)[];
    forOpponent: { gained: string[]; lost: string[] };
  };
  kingSafetyDelta: { white: number; black: number };  // 0–100 score diff
  pieceActivityDelta: { gainedActiveSquares: string[]; lostActiveSquares: string[] };
  hangingPiecesDelta: { newlyHanging: string[]; nowDefended: string[] };
  threatsDelta: { newThreats: ThreatTag[]; resolvedThreats: ThreatTag[] };
  resolutionFen: string;
  resolutionReason: "quiescent" | "forced-end" | "depth-limit";
}
```

The LLM receives this shape and translates phrases like *"creates a backward d6 pawn you can target"* or *"trades the bishop pair for an outpost on e5"* — sentences that today's prompt cannot produce because we don't tell the LLM what changed.

#### Tablebase (parallel deliverable)

Endgame coaching today is the weakest part of the flagship surface — see MASTERMIND_TIER_A_GAPS.md Gap 6 (endgame-principles JSON) and MASTERMIND_FAILURE_MODES.md §5 (FEN-cosine degeneracy in trivial endgames). Lichess publishes a free tablebase API (`https://tablebase.lichess.ovh/standard?fen=…`) covering ≤7-piece positions; a thin proxy lets the LLM ground every endgame claim against perfect play instead of the validator's principle-only checks. Listed as design-only in MASTERMIND_TOOLS.md's `fetch_external` group; this entry promotes it to a mandatory call site.

#### Mandatory call sites — the anti-"built but never called" contract

Every new capability below has a designated first consumer in shipped code. **No new tool ships without its call site landing in the same PR.**

1. **`compute_feature_delta(fenBefore, fenAfter, fenAtResolution)`** — core wrapper. First consumer: the per-move loop in [enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts) that today classifies INACCURACY/MISTAKE/BLUNDER at lines 705-757. After that classification, every flagged move must call `compute_feature_delta` and thread the result into the prompt context as a `## Position changes` block alongside the existing eval-drop narrative at lines 683-778. This is non-optional: the prompt-context builder asserts the delta block exists for every move classified at INACCURACY-or-worse, or the move is omitted from the LLM's "top mistakes" list.

2. **`find_resolution_point(fen, pv)`** — heuristic that walks the principal variation until it hits a quiescent position (no captures pending, no checks, eval stable within 30cp of the line's terminal eval). First consumer: `compute_feature_delta` itself — calls this internally to pick `fenAtResolution` when the caller doesn't supply one. Falls back to "after the played move" only if the PV has fewer than 2 plies. Heuristic-only in v1 — see MASTERMIND_FAILURE_MODES.md §11 for the failure mode.

3. **`fetch_lichess_tablebase(fen)`** — thin proxy to `https://tablebase.lichess.ovh/standard`. First consumer: the same per-move loop in `enhanced-analysis/route.ts`. When `fen` has ≤7 pieces (excluding kings), `fetch_lichess_tablebase` is called and its `category` (win/draw/loss) and `dtm`/`dtz` are appended to the prompt context. This grounds endgame claims that today are LLM-unverified prose.

4. **`compare_features(fenA, fenB)`** — Mastermind agent's general-purpose feature-diff tool, exposed under the `compare` verb group. Wraps `compute_feature_delta` without the resolution-point step (caller supplies both FENs). First consumer: the agent prompt's "why was that move bad?" / "what does this gain?" few-shot examples — the agent must reach for this tool whenever a user asks a positional-comparison question, before composing prose.

#### Why stage 3 lands BEFORE the agent loop

Two reasons, both load-bearing on the user's directive that this not become dead code:

- **The non-agent path consumes it first.** Even if the Mastermind agent loop slips by months (it is explicitly "not a near-term build" in the sequencing below), `compute_feature_delta` is wired into today's flagship `analyze_game` flow on day one. The improvement to coaching prose is observable immediately, not gated on the agent surface.
- **Battle-testing the primitive in production de-risks the agent layer.** When the agent loop ships, `compute_feature_delta` is already a known-good tool — its failure modes documented, its prompt-context shape proven. The agent layer becomes orchestration over verified primitives, not orchestration over speculative ones.

The corollary: if a feature can't articulate a non-agent first consumer, it does not enter the Mastermind plan. This is the test we apply to every new tool from here forward.

#### Updated open design questions for stage 3

Add to the design-questions list below:

6. **Resolution-point heuristic vs. LLM call.** Heuristic on chess.js + Stockfish quiescence (cheap, deterministic, ~80% coverage) versus LLM tag (more flexible, costs a token round-trip per move, ~50–100ms latency). The competitor's description ("a natural resolution point of the variation is detected") suggests heuristic. Default: heuristic in v1; revisit if the prose quality is bottlenecked by misclassified resolution points.
7. **Cache key for `compute_feature_delta`.** Pure function over `(fenBefore, fenAfter, fenAtResolution)` — same input always produces same delta. Cache in [responseCache.ts](src/lib/responseCache.ts)-style LRU keyed by the FEN triple. Avoids recomputing across user sessions on the same game.
8. **Tablebase rate limit.** Lichess tablebase is rate-limited (unspecified, conservatively assume ~30 req/min). For a 40-move game with ~6 endgame moves, well within limits. If we batch via `enhanced-analysis` for a long endgame, may need a 24h cache layer. See MASTERMIND_FAILURE_MODES.md §11.

### Why this is #1

Everything in the Tier 1 / Tier 2 competitor-gap lists below (insights dashboard, opening tree, opponent scouting, coordinate trainer, weekly study plan, decoded-play, voice output, piece-functionality output, guess-the-move) can be **exposed as Mastermind tools** instead of being built as separate UI surfaces. This collapses the roadmap from "20 features to build" to "1 agent + N tools."

### Open design questions (answer before any code)

1. **Tool inventory** — concrete list. Which 50 GM games? Which drill set? What file format? Picking arbitrarily means rework later.
2. **Tool-call visibility** — silent ("coach is thinking…") or transparent ("looking up Fischer-Spassky game 6 from 1972…")? Latter is more chess-coach-ish but also more UI work.
3. **Cost model** — agent loops make 2–5+ Claude calls per turn vs. one. Acceptable for the *smart* surface; deliberate tradeoff against the small-fix scope (which still optimizes for cheap responses).
4. **Streaming + tool use** — Anthropic SDK supports it, but the existing SSE streaming in `enhanced-analysis` (line 2362 of AICoachChat.tsx) would need restructuring.
5. **Prompt-injection surface** — tool inputs are a new attack surface. Phase 1.4 of the audit closed the previous P0 hole; tool args need similar discipline.

### Sequencing — not a near-term build

1. **Tool inventory doc** — list every tool, its inputs/outputs, where the data comes from. ✅ shipped as [MASTERMIND_TOOLS.md](MASTERMIND_CONTEXT/MASTERMIND_TOOLS.md) (52 tools across 10 verbs, 17 ✅ / 6 🟡 / 29 ⚪).
2. **Plan doc** — agent loop, error handling, cost projection, fallback when a tool fails. Partial: failure modes shipped at [MASTERMIND_FAILURE_MODES.md](MASTERMIND_CONTEXT/MASTERMIND_FAILURE_MODES.md); agent-loop design doc still outstanding.
3. **Stage 3 grounding lands first, in the non-agent flow.** Per the "Stage 3" subsection above, ship `compute_feature_delta` + `find_resolution_point` + `fetch_lichess_tablebase` wired into [enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts) as mandatory call sites for every INACCURACY-or-worse move (and every ≤7-piece position for tablebase). This improves the existing flagship prose immediately and de-risks the agent layer by battle-testing the primitives in production. **Acceptance test:** every flagged move in the prompt context carries a `## Position changes` block; the post-deploy 5-fixture coaching eval (audit/findings/agent-a-eval/) shows principle-citation avg ≥ 1.6 and coaching-quality score uplift over the pre-stage-3 baseline.
4. **Single-tool prototype** — e.g., GM-game lookup only — before scaling to many.
5. **Then** the agent loop refactor of `enhanced-analysis`. By this point `compute_feature_delta`, `compare_features`, and `fetch_lichess_tablebase` are already verified primitives — the agent surface orchestrates known-good tools, not speculative ones.

The Stage 3 step is the operational answer to "make sure it gets called": shipping it inside the existing flagship flow, with a per-move assertion in the prompt-context builder, makes it impossible to merge the work without it being load-bearing.

---

## Anthropic API credit acquisition strategy

Captured 2026-05-01 after a research pass on Anthropic's actual program landscape. Goal: fund the Anthropic spend that powers `callLLM()` in [src/lib/llmProvider.ts](src/lib/llmProvider.ts) without forcing premature monetization, on the way to the 50k-MAU-in-18-months target.

### Programs that don't fit the project's current shape (eligibility-blocked)

- **Anthropic Startup Program** — VC-backed only; requires a partner-VC referral link per [claude.com/programs/startups](https://claude.com/programs/startups). Not viable as a solo, unfunded HS founder.
- **Claude for Education (institutional plan)** — sold to school districts and universities, not individual builders.
- **Claude Campus / Builder Club / Campus Ambassador** — gated on enrollment at a partner university.
- **Claude for Nonprofits** ([support.claude.com](https://support.claude.com/en/articles/12893767-getting-started-with-claude-for-nonprofits)) — *important*: this is a discount on Claude.ai **subscription** plans (Team minimum 150 seats × $8/mo ≈ $1,200/mo), **not API credits**. Forming a 501(c)(3) does not directly unlock production API credits via this program.

### Programs ranked by realistic credit yield × probability of acceptance

| Path | API credits | Acceptance probability | Structural cost | College-app value |
|---|---|---|---|---|
| Win Claude/Anthropic hackathons (Devpost) | $500 – $100,000 per event | Realistic; ship-and-win | None | High |
| AWS Activate Founders → Claude via Bedrock | ~$1,000 in AWS credits | High; lightweight app | None | Low |
| AWS for Nonprofits / Google Cloud nonprofit (after 501(c)(3)) → Bedrock | Substantial cloud credits | High once 501(c)(3) approved | High (3–12mo formation) | Very high |
| UW research partnership → External Researcher Access ([support.claude.com](https://support.claude.com/en/articles/9125743-what-is-the-external-researcher-access-program)) | Direct Anthropic API credits | Medium; depends on faculty | None (just outreach) | Very high |
| Direct Anthropic dev-rel email | Variable | Low | None | Low |

### What this implies

The structural change that actually unlocks Anthropic credits for someone in this profile is **501(c)(3) → AWS for Nonprofits → Bedrock**, not anything Anthropic publishes directly. Open-sourcing the project does not unlock any verified Anthropic credit program (no "Claude for Open Source" program could be confirmed); OSS has merit for other reasons (community, hackathon eligibility, college-app credentialing) but isn't the credit lever.

### Active hackathons / venues to apply through (verify status before submitting)

- [Claude Code Hackathon — $100k credits pool](https://www.adwaitx.com/claude-code-hackathon-opus-4-6/)
- [Claude Hackathon 2026 — Columbia × NYU — $3k credits](https://claude-hackathon-2026.devpost.com/)
- [Anthropic × USC Claude Hackathon — $2.5k / $1.5k credits](https://anthropic-usc-hackathon.devpost.com/)
- [Anthropic London Hackathon](https://anthropiclondon.devpost.com/)
- [Claude Hackathon × UVicHacks — $1.5k credits](https://claude-hackathon-uvichacks.devpost.com/)
- [Anthropic × WiCS Hackathon](https://anthropic-wics-hackathon.devpost.com/)
- [Anthropic Hackathon GT × CBC — $500 credits](https://anthropic-hackathon.devpost.com/)

### Recommended sequence

1. **Immediate (≤4 weeks)**: submit Chess Masti AI (or a focused subsystem) to 2–3 currently-open Claude hackathons. Stackable; even small wins compound on the college app and produce real credits.
2. **Parallel, no commitment**: cold-email 3–5 UW faculty in CSE / HCDE / Education whose research touches AI tutoring, intelligent tutoring systems, or accessible AI. Goal: turn "potential UW partnership" into a named faculty sponsor → unlocks External Researcher Access.
3. **Medium-term lightweight nonprofit credential**: apply for **fiscal sponsorship via Hack Foundation** ([hackclub.com/fiscal-sponsorship](https://hackclub.com/fiscal-sponsorship/)). Weeks-not-months process, designed for student founders, gets most 501(c)(3)-shaped benefits without the IRS Form 1023 overhead.
4. **Long-term (only if Chess Masti AI is genuinely staying mission-driven)**: full 501(c)(3) formation → AWS for Nonprofits → Bedrock-hosted Claude. ~$275 (Form 1023-EZ) + state fees, 2–4 weeks for EZ filing, 3–12 months for standard. Mission-locks the project; not reversible. Strong college-app signal independent of credits.

### Engineering levers that compound regardless of any credit grant

These reduce the Anthropic bill directly and make any credit grant go further. Higher leverage than the credits themselves over a 12-month horizon:

- Verify `cacheSystem: true` is enabled on every flagship `callLLM` invocation. The system prompt at [src/lib/chessPrinciples.ts:172](src/lib/chessPrinciples.ts#L172) is large and reused — cache hits are ~10× cheaper.
- Audit which routes call `tier: "flagship"`. Demote any that don't truly need Sonnet 4 to `"fast"` (Haiku 4.5).
- Stand up per-route token-and-cost telemetry (Sentry / Vercel Analytics) so future optimizations are data-driven.
- Use Anthropic's Batch API for non-real-time work (e.g., the puzzle commentary generation pipeline) — 50% cheaper.

---

## B2B pivot: chess academy operator platform

Captured 2026-05-01 after looking at [chessido.com](https://chessido.com). **Not active — B2C (chessmasti.com) remains the focus.** Park here so the option isn't forgotten when B2C distribution stalls or a partnership opportunity comes up.

### What chessido is, briefly

B2B SaaS for chess academies (looks India-first — "batches," Indian student names in the demo). Sells the operator workflow: live classes, simul/puzzle-rush sessions with live leaderboards, batch scheduling, student dashboards, "Auto Marketing," and a marketplace. Hero demo is *coach running a live puzzle rush across 6 students with a real-time leaderboard* — i.e., the product earns its place inside the lesson, not just in the admin sheet. Free to start, no credit card. Their headline is workflow consolidation, not AI tutoring — "Smart Insights" gets one card.

### Why it's strategically interesting for chess-coach-ai

The AI coaching layer chess-coach-ai already has — engine analysis, mistake detection, principle-based explanations via [`callLLM()`](src/lib/llmProvider.ts) — is precisely what tools like chessido *don't* lead with. There's an opening to be the AI tutor inside academy platforms rather than the academy platform itself. Two shapes this could take:

1. **White-label / API**: expose the analysis pipeline ([src/app/api/enhanced-analysis/route.ts](src/app/api/enhanced-analysis/route.ts)) as a B2B API consumed by academy platforms. Lower distribution cost than chasing individual players one-by-one; academies bring their own students.
2. **Full B2B product**: build the academy operator surface ourselves (classroom, batches, dashboards) on top of the existing AI coaching core. Much bigger build.

Option 1 is the realistic version; option 2 is a full second product.

### When this becomes worth revisiting

- B2C growth toward 50k MAU stalls or proves uneconomical.
- An academy or coach inbound asks for a multi-student / instructor-dashboard version.
- A funding/partnership conversation makes B2B revenue strategically useful (e.g., demonstrating willingness-to-pay for a credit application or grant).

### What would need to be true before pursuing

- Per-tenant data isolation in Firestore (currently `users/{uid}` is a flat user model — no concept of an academy owning a roster of students).
- A coach-side surface: roster, assignment, progress views. None of this exists today.
- A pricing model that doesn't undercut the unit economics of the consumer product.

Not a near-term build. Reference for when the strategic question reopens.

---

## Competitor feature gaps to evaluate

Captured 2026-05-01 from a comprehensive competitive scan of ~35 chess training/coaching products. Full landscape and per-competitor profiles in [competition.md](competition.md). This section is the actionable spinoff: features observed in real competing products that chessmasti doesn't ship today, grouped by strategic fit so the highest-leverage ones surface first.

Source competitor named in parentheses; rough effort tag — `S` (small, days–weeks), `M` (medium, weeks–month), `L` (large, multi-month) — reflects scope, not difficulty.

**Priority commitments — 2026-05-01**: items tagged **[PRIORITY]** below are committed for the coming months. They cover the three product-failure themes identified in [competition.md](competition.md): **distribution** (mobile app, browser extension, multi-language), **diagnostics** (insights dashboard, personal opening tree, CAPS score, opponent scouting), and **onboarding/structure** (structured curriculum, coordinate trainer, coach persona, native annotation/studies, visualization training). Tier order still reflects effort/sequence, not priority — work generally proceeds shortest → longest within and across tiers.

### Tier 1 — High fit with our AI-coaching positioning, near-term candidates

These extend the LLM coaching surface or close obvious gaps without changing the product's center of gravity.

- **[PRIORITY]** **Structured curriculum / "what next" path** (Chess.com Lessons, ChessMood Step-by-Step, ChessDojo cohorts) — onboarding failure today: a new user lands on a broad menu (analysis / openings / practice / repetit-training / scout) with no instruction. Compounds with the cold-start of "no PGN to upload yet." **M**
- **[PRIORITY]** **Personal opening tree from your games (W/D/L per branch)** (OpeningTree) — diagnostic surface; `chesscom` + `lichess` import already exists in [src/app/api/chesscom](src/app/api/chesscom) and [src/app/api/lichess](src/app/api/lichess), so we have the data. Highest-leverage diagnostic in chess improvement. **M**
- **[PRIORITY]** **Insights dashboard — phase accuracy, time mgmt, blunder patterns** (Lichess, Chess.com, Aimchess) — descriptive baseline that every serious-improver platform ships. We compute the data in `enhanced-analysis` and throw it away after the per-game review. **S–M**
- **[PRIORITY]** **Coordinate trainer** (Lichess) — table-stakes board fluency tool; beginners need it before a coach is useful. **S**
- **[PRIORITY]** **CAPS / accuracy score per game** (Chess.com) — table-stakes metric users expect; we already compute centipawn loss in `enhanced-analysis`. Looks unfinished without it. **S**
- **[PRIORITY]** **Opponent scouting from public games** (Aimchess) — given a chess.com/lichess username, generate a prep report. Bundle with personal opening tree — same data plumbing. **M**
- **[PRIORITY]** **Coach persona customization** (Chessvia) — extend the existing `coachTone` profile field into a richer persona (voice, style, strictness, focus). LLM handles this natively; cost is UI + prompt-template wiring. **S**
- **[PRIORITY]** **Chesstalker perspective for self-analysis (2nd perspective)** — add a chesstalker-style perspective alongside the existing coach perspective in self-analysis. Goals are different from the coach perspective: the coach explains/teaches, the chesstalker narrates/commentates the player's own game from the player's seat. Two distinct prompt templates threaded through `getSystemPrompt(analysisType)` rather than a single coach voice. **S–M**
- **Auto-generated weekly study plan** (Aimchess) — natural fit for our LLM. We already analyze games and detect mistakes; package it into a shippable weekly plan with concrete drills. **M**
- **Decoded-play mode (decode while playing the engine)** (DecodeChess) — extension of the practice surface: live LLM coaching during a Stockfish/Maia game. **M**
- **Voice output for the AI coach (TTS)** (Chessvia, Dr. Wolf) — listen to coaching while reviewing. Voice *input* (STT) is more questionable for chess — notation is awkward to speak. **M**
- **"Piece functionality" output (what each piece is doing right now)** (DecodeChess) — additional analytical layer the LLM is already capable of producing. **S**
- **"Guess the Move" master-game replay** (Chess Tempo) — content product layered over a game DB; tests calculation. **M**

### Tier 2 — Larger builds that strengthen the moat

Aligned with positioning but bigger lifts. Worth evaluating when the Tier 1 backlog thins out.

- **[PRIORITY]** **Browser extension overlay on chess.com / lichess** (Chessvia) — high leverage; brings our coach to where users already play. Distribution unlock. Lichess first (chess.com is hostile to extensions). Reuses existing web stack. **M–L**
- **[PRIORITY]** **Native mobile app (iOS + Android)** (Aimchess, Dr. Wolf, ChessVision.ai) — table stakes long-term; PWA may bridge for the first few months. The fork: extension *or* mobile first — picking one and deferring the other ~3 months is realistic. **L**
- **[PRIORITY]** **Multi-language coach** (Sensei Chess: Hindi, Tamil, Kannada, Portuguese; CT-ART: 6 langs) — direct unlock for India/Brazil markets. Claude handles this natively; the lift is UI strings + prompt-template translations + QA. Start with Hindi to validate the India-market thesis before committing to 4+. **M**
- **[PRIORITY]** **Visualization training (gradually harder mental visualization drills)** (Aimchess) — distinctive niche feature; pairs naturally with the coordinate trainer. **M**
- **[PRIORITY]** **Native game annotation + shareable studies** (Lichess Studies) — collaborative annotation surface with chapters; users currently have no way to annotate or share. Lichess sets the bar. **L**
- **Skill tree with per-pattern strength tracking** (ChessPuzzle.net's 271-level / 105-skill taxonomy) — sophisticated personalization layer. Would replace some of `adaptive-puzzles` heuristics with a structured pattern model. **L**
- **Endgame trainer with 3–7 piece tablebase positions** (Chess Tempo, Lichess Practice) — content moat for serious improvers. **M**
- **Sparring positions: play a set position repeatedly vs Stockfish/Maia** (ChessDojo) — extension of our practice surface. **S–M**
- **Annotated game submissions with AI sensei review** (ChessDojo's human version) — submit a game with your annotations, AI critiques the *annotations*. Distinctive twist. **M**

### Tier 3 — Acquisition / engagement features

Less about product capability, more about distribution and stickiness.

- **Reddit board-screenshot bot** (ChessVision.ai's u/chessvision-ai-bot) — **best-validated organic acquisition pattern in chess SaaS**. Auto-reply to board screenshots on r/chess with a brief AI explanation + link. Won "Best Chess Startup 2020" largely from this flywheel. **M**
- **Daily Puzzle + streak gamification** (Chess.com, Lichess) — engagement engine. **S**
- **Leaderboards (puzzle, training, rated)** (Chess.com, Lichess, Chess Tempo) — social proof + retention. **S–M**
- **Bot personalities (Mittens-style)** (Chess.com) — viral acquisition channel; we could ship LLM-driven persona coaches with distinct voices. **M**
- **Live H2H Puzzle Battle (synchronous)** (Chess.com) — engagement loop. **L** (real-time infra)
- **Multiplayer Puzzle Racer with private friend rooms** (Lichess) — same. **L**
- **Cohort / Discord community accountability** (ChessDojo) — community moat; low product effort, high ops effort. **S** product-side, ongoing community ops.

### Tier 4 — Off-strategy or business-model-dependent

Park here for awareness; would change the company's shape if pursued.

- **Master Games Database (10M+ pro games, searchable)** (ChessBase Mega DB) — content licensing required; we can sidecar via Lichess open DBs.
- **Cross-publisher ebook reader / chess book content** (Forward Chess) — content sales channel, separate business.
- **GM video courses** (Chessable, ChessMood, Chess.com Lessons) — content production / acquisition is a different operation.
- **Live broadcast viewer with engine commentary** (Chess.com, Lichess, ICC) — engagement hook off our coaching positioning.
- **Auto-novelty detection in opening prep** (ChessBase) — pro-tier (>2200) feature; not our segment.
- **Vision OCR (scan board from image / PDF / video frame)** (ChessVision.ai) — utility, not coaching; could be a separate tool.
- **YouTube position search** (ChessVision.ai) — same.
- **eBook PDF reader for chess books** (ChessVision.ai) — same.

### Tier 5 — B2B academy features (already parked above)

If/when the academy pivot reopens (see "B2B pivot" section above), these are the must-have features observed in working B2B comps. **Do not build now.** Listed for completeness so the pivot section has a feature-gap reference.

- Teacher/coach dashboard with assignments and progress reports (ChessKid, Chessity, Chessverse.in, Chesslang)
- Class / batch / cohort management with rating-segmented enrollment (ProChessTraining, Chessverse.in)
- Family / group / school per-seat pricing (Chessity)
- COPPA-compliant kids mode + safe-chat moderation (ChessKid)
- White-label academy branding (Chessverse.in)
- School workshop kit for non-chess-playing teachers (Chessity)

### Bundling / competitive risks to actively monitor

Not features to build, but signals to watch — when these fire, accelerate or rethink.

- **Chess.com Game Review v2 with LLM coaching** — they own Aimchess + Chessable + Dr. Wolf and have all the assets. They haven't shipped LLM-grade explanations yet. The day they do, our biggest differentiator gets bundled into a Diamond sub.
- **Sensei Chess (senseichess.com) raising funding or getting GothamChess-featured** — same architectural pitch as ours, free, multi-lingual. Closest direct lookalike.
- **Chessable shipping mistake-derived puzzles** — would close our second-biggest differentiator.
- **Chessvia browser-extension adoption** — if their voice UX gets actually good, beginners adopt them before discovering us.
