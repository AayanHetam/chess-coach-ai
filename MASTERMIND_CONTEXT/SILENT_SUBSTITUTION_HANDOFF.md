# Silent Substitution — Audit Findings & Fix Handoff

**Written:** 2026-08-11 · **Baseline commit:** `f26507f` (main) · **Author:** Claude Fable 5 session (audit only — no fixes shipped from this doc yet)

**Who this is for:** a fresh Claude Code session picking this up cold. Read §0 and §1 before touching anything. Every file:line in this doc was opened and verified personally against `f26507f`; anchors (grep strings) are given alongside line numbers because **line numbers drift** — `enhanced-analysis/route.ts` moved 40+ lines during the audit itself.

---

## §0. STOP — four facts that will mislead you if you skip them

### 0.1 `AICoachChat.tsx` is DEAD CODE. So is the whole `panelBody` tree.

`/analysis` renders **only** `src/components/preview-analysis/AnalysisImpl.tsx` (`src/pages/analysis.tsx:28`, dynamic import).

- `src/components/AICoachChat.tsx` (~2700 lines) is imported **only** by `src/sections/analysis/panelBody/coachTab/index.tsx:11`.
- Nothing imports `coachTab` or `panelBody`. Verify yourself: `grep -rn "coachTab\|panelBody" src/ | grep -v "^src/sections/analysis/panelBody"` → **zero hits**.
- Also dead: `InlinePuzzleCoach` (only reachable from `AICoachChat`), `PuzzleCoachExplanation` (parent `sections/practice/PuzzleInfo.tsx` has no importers), `src/app/api/classify-intent` (its only caller is `AICoachChat.tsx:2244`).

**Why this matters:** `AICoachChat` contains *correct* implementations of several things the live component is missing (notably the corrected-text swap at `AICoachChat.tsx:2593-2607` and the `puzzleRecommendations` setter at `:2613`). It is very easy to read that code, conclude "this is handled", and ship nothing. **I made exactly this mistake during the audit** — I reported a bug with a confident `AICoachChat.tsx` citation before checking reachability.

**Live coach surfaces (the only ones that matter):**
| Surface | File | Mounted from |
|---|---|---|
| Game analysis coach | `src/components/preview-analysis/AnalysisImpl.tsx` | `src/pages/analysis.tsx:28` |
| Puzzle coach | `src/components/puzzle/PuzzleCoachPanel.tsx` | `src/pages/puzzles.tsx:2197` |
| Concept lesson | `src/components/curriculum/ConceptLessonCard.tsx` | `src/pages/plan.tsx` |

### 0.2 Prior audit documents in this repo contain false statements

Not "outdated" — **false as written**, including code comments that describe behavior the code does not have. Concrete examples found this session:

- `enhanced-analysis/route.ts:531-536` claims *"AnalysisImpl already sends profile.selfReportedRating (PR #64)"* — it does not (Finding A1).
- `route.ts:1185-1188` implies validators can trigger corrections that are hardcoded `warn` and therefore never can.
- `AnalysisImpl.tsx:516-518` cites `route.ts:362-363` for accuracy/Elo consumption — stale citation, real consumers are `builder.ts:632-633` → `serialize.ts:273-274`.
- `opening-explorer/route.ts:10-15` documents the wrong fallback tier order.

**Rule: a comment is a hypothesis, not evidence.** Open the code.

### 0.3 CI does not run what Vercel runs (partially fixed)

As of PR #252, `npm run build` **is** in CI. Before that, lint errors passed CI and killed every production deploy silently (prod was frozen ~24h on 2026-08-10). Related standing hazards:

- **"Merged" ≠ "deployed."** Always poll `https://www.chessmasti.com/api/version` for your merge SHA. `deploy-verify.yml` now does this automatically and files a GitHub issue on failure.
- E2E `webServer` needs a dummy `ANTHROPIC_API_KEY` (the instrumentation hook's `parseEnv()` requires it at boot). `SKIP_ENV_VALIDATION` is set by the build script but **read by nothing** — do not rely on it.
- **A stray `.env` file can make local runs pass that would fail in CI.** Verify with *all* env files hidden (`.env` and `.env.local`).

### 0.4 The repo has heavy concurrent agent traffic — WORK IN A GIT WORKTREE

Multiple Claude sessions merge PRs daily. During this audit, `route.ts` changed on disk mid-analysis and the working tree's HEAD was switched out from under a commit. **Always `git status` and check HEAD before committing.** Re-verify line numbers before editing.

**Sharing the checkout also breaks `npm run build` in a way that looks like your bug.** While fixing A1/A2 I hit three consecutive build failures with `ENOENT` / `MODULE_NOT_FOUND` on routes I had never touched (`/auth/age`, `/courses`, `/calibrate`, `_ssgManifest.js`) — a different one each run. Cause: another session mutating the shared checkout (its HEAD was switched mid-build, and `.next` is shared state). Nothing was wrong with the code; the same commit built cleanly in isolation.

**Do this instead — it costs about a minute and removes the whole class:**

```bash
cd ~/Downloads/Inspirit_project/chess-coach-ai
git fetch origin
git worktree add -b fix/my-thing ../wt-my-thing origin/main
ln -s "$PWD/node_modules" ../wt-my-thing/node_modules   # no reinstall needed
cd ../wt-my-thing
```

You get your own source tree **and** your own `.next`. Also: `playwright.config.ts` sets `reuseExistingServer: !CI` on port 3210, so check `lsof -ti:3210` is empty before an E2E run — otherwise you silently test **another session's build**.

Finally, branch each PR from `origin/main` (not from another fix branch), and **re-run tsc + tests + build AFTER any rebase**, not just before. Group C and A1 both touched `route.ts`; only a post-rebase run tells you the merge is actually sound.

---

## §1. The bug class, and the methodology that must be used

### 1.1 Definition

> **Silent substitution:** a correct value exists at a boundary, is not forwarded across it, and the receiver substitutes a plausible-looking default instead of failing. The result is a confident, well-formed, *wrong* answer.

Not in this class (do not conflate): anything that produces a visible error, a 4xx, an empty state, or a spinner. Those are safe by comparison — the user knows something went wrong.

Why this class dominates here: the product is an AI coach. A missing field never crashes; it just changes what the model believes. Every instance is invisible to unit tests (each component works in isolation), invisible in dev (fast machine, healthy network, demo game), and invisible in logs (nothing is logged).

### 1.2 Non-negotiable method

The founder's explicit direction: *"the worst thing we can do is to think we have solved the problem without actually solving the problem."*

1. **Reproduce before fixing.** Write a test that fails *because of the bug*. Watch it fail, and read the failure message to confirm it fails for the right reason (`expected undefined to be 'X'`, not a typo).
2. **One finding per PR.** If three fixes ship together and the symptom persists, you cannot tell which failed.
3. **Verify liveness before citing.** `grep` for importers. Dead code has fooled this repo's auditors repeatedly.
4. **No claim without a file:line you personally opened in this session.**
5. **Definition of done = verified in production**, not CI-green, not merged. Poll `/api/version`, then exercise the real user path.
6. **Prefer a probe over a hypothesis.** Example from this session: an audit flagged "the messages array starts with `role: assistant`, which the Anthropic API rejects — every fast-path turn must be 400ing." One 1-token API call proved the API **accepts** it. That saved a fix for a non-bug. See §6.1.

---

## §2. Environment & verification commands

```bash
cd ~/Downloads/Inspirit_project/chess-coach-ai      # NOT the Inspirit_project root (not a git repo)

npx tsc --noEmit                                     # must stay clean
npm test                                             # vitest: ~155 files / ~2000 tests, ~30s
npm run build                                        # Vercel parity — lint errors here kill deploys

# E2E (added 2026-08-11, PR #252)
npx playwright test --project=local-desktop-light    # boots `next start` on :3210 itself
npx playwright test --project=local-mobile-light
E2E_NO_SERVER=1 npx playwright test --project=prod-smoke   # read-only prod checks

# Verify a deploy actually shipped
curl -s https://www.chessmasti.com/api/version
```

**PR hygiene:** `gh pr create --repo AayanHetam/chess-coach-ai ...` — the `--repo` flag is mandatory (this is a fork of `GuillaumeSD/Chesskit`; `gh` defaults to upstream).

**Never** run load/abuse traffic against production. Single diagnostic requests against the user's own endpoints/keys are fine.

---

## §3. THE FINDINGS

Severity: **P0** = wrong chess content shipped to users today · **P1** = materially degraded answers · **P2** = waste/UX.

Each finding gives: evidence → mechanism → why it's silent → fix → **proof obligation** (what must fail-then-pass) → dependencies.

---

### GROUP A — Fabricated user identity

#### A1 · P0 · Every analysis user is coached as if rated 1500

**Evidence (verified):**
- `src/components/preview-analysis/AnalysisImpl.tsx:681` — anchor `userRating: userRating ?? 1500,`
- `userRating` is never supplied. The only source of these personalization fields is `coachExtras` (`AnalysisImpl.tsx:6721`, anchor `const coachExtras = useMemo(() => {`), whose returned object ends at `:6751` (anchor `personalityId: personality.id,`) and contains **no** `userRating`.
- The real value is in scope: `AnalysisImpl.tsx:6381` — anchor `const { user, profile } = useViewer();`, and is already used at `:8722` (`userRating={profile?.selfReportedRating ?? 1500}`).
- Server fallback chain: `src/app/api/enhanced-analysis/route.ts:624-629` — `userRatingFromBody ?? profileRating ?? headerElo`, where `profileRating = liveRatingSnapshot ?? measuredRating ?? selfReportedRating` (`:605-608`).

**Mechanism:** because the body *always* carries `1500`, the server's Firestore rating and the PGN header Elo are **unreachable dead code**. Downstream: `skillLevel` is permanently `"intermediate"` (`route.ts:788-790`); few-shot examples never vary; the `<1200` beginner-band prompt block (`coachChatPrompt.ts:185-191`, gated on `userRating < 1200`) can never render; the response-cache key bakes in `skillLevel` so a 700 and a 2300 can be served each other's cached analyses; and the 1500 is compiled into `systemPromptSuffix` stored in the context cache, so every follow-up inherits it.

**Why silent:** 1500 is a plausible rating. The prompt asserts `- User rating: 1500` with no hedge. The prompt's own escape hatch (`coachChatPrompt.ts:450`, "if no rating is available, default to intermediate") is unreachable.

**Fix:**
1. Add to `coachExtras`: `userRating: profile?.liveRatingSnapshot ?? profile?.measuredRating ?? profile?.selfReportedRating`.
2. Change `:681` to `userRating,` (drop `?? 1500`) so genuine absence reaches the server and its real chain runs.
3. Make `userRating` optional in `CoachChatPromptInput` and emit `- User rating: not provided — use INTERMEDIATE default calibration` when absent, instead of defaulting in the route (`route.ts:738`).

**Proof obligation:**
- Unit: prompt builder with `userRating: undefined` emits the "not provided" line, not `1500`.
- E2E/integration: intercept the outgoing `/api/enhanced-analysis` body for a signed-in user whose profile has a rating → assert the body carries that rating.
- Prod: sign in with a known rating, run an analysis, confirm from logs/telemetry that `skillLevel` is not `intermediate`.

**Dependencies:** none. **This is the recommended pilot fix.**

---

#### A2 · P0 · Puzzle coach is told "student rating: unknown"

**Evidence (verified):**
- `src/pages/puzzles.tsx:2197` — anchor `<PuzzleCoachPanel`. The mount block passes `puzzle`, `outcome`, `userAttemptSan`, `onRequestMorePuzzles`, `drillPuzzles`, `onPickDrillPuzzle`, `onResetPuzzle`… and **zero** occurrences of `userRating` (verified by grep count over the mount block).
- The panel declares `userRating?: number` and forwards it in both request bodies (`PuzzleCoachPanel.tsx:83`, `:234`, `:393`).
- The value is in scope: `puzzles.tsx:290` — anchor `const [stats, setStats] = useAtom(puzzleStatsAtom);`. `stats.rating` is already used for puzzle selection at `:338-339` (`ratingMin/ratingMax` ±150).
- Server substitution: `src/lib/prompts/puzzleChatPrompt.ts:221-223` → `"Student rating: unknown. Default to club-player depth."`; `puzzleHintPrompts.ts:69-71` similar.

**Mechanism:** the puzzle is selected for the user's exact ±150 band, then explained at a generic level. All four hint stages and the turn-0 Sonnet explanation are uncalibrated.

**Fix:** `userRating={stats.rating}` at `puzzles.tsx:2197`. One line. (`ConceptLessonCard` already does exactly this correctly with the same atom — copy that pattern.)

**Proof obligation:** unit/E2E asserting the `/api/puzzle-chat` body carries the rating; prompt-builder test asserting the "unknown" branch is not taken.

**Dependencies:** none.

---

#### A3 · P1 · Player color is asserted as fact when it is a guess

> **Partially addressed already (PR #248).** The "which side were you playing?" flow now exists with inference-first resolution and per-game memory, so `playerSide` is null less often than this finding assumes. **The prompt-side hedge below is still worth doing** — inference can still miss, and when it does the prompt asserts the guess as fact with no qualifier.

**Evidence:** `AnalysisImpl.tsx:6721-6752` (`coachExtras`) — `sideName = playerSide?.color ?? boardOrientation`; `boardOrientation` defaults to `"white"`. `playerSide` is null whenever username→PGN-header matching fails (`:6943-6960`). The "Which side were you playing?" prompt card renders (`:3739`) but does **not** gate the composer (send is gated only on `analysisActive`/`isThinking`, `:3837`, `:3864`).
Server: `route.ts:647` → `"Player is White."`; `coachChatPrompt.ts:148-157` emits *"Always analyze the game from the perspective of `<username>` playing as White"* with no hedge.

**Consequence:** for a Black-side game whose header name didn't match, the coach reviews the **opponent's** moves as the user's, and frames them as "your mistakes".

**Fix:** when `playerSide` is null, omit `playerColorName` (and let `playerColor` fall through) so the `if (username && playerColorName)` block in `coachChatPrompt.ts:148` is skipped; or gate the composer until the side is confirmed.

**Latent landmine in the same area (fix while you're here):** `route.ts:647` uses `boardOrientation ? "w" : "b"` — the string `"black"` is truthy. Currently masked only because `playerColor` is always sent explicitly.

**Proof obligation:** unit test on the prompt builder — with `playerColorName` absent, the identity block must not assert a color.

---

#### A4 · P2 · Opponent identity never sent → scout validator never runs

**Evidence:** `enhancedAnalysisSchema` accepts `opponentUsername`/`opponentPlatform` (`src/lib/validation/schemas.ts:176-181`); `AnalysisImpl`'s request body (`:675-694`) omits both, though `gameHeaders.white`/`.black` are computed at `:655-670`. Server: `routeHelpers.ts:321-330` calls `fetchDataSources` with no `pgn`, so `wireValidators.ts:290-296` `resolveOpponent` cannot run → scout data undefined → `validateScoutCitation` skipped on 100% of requests.

**Note:** this is *absence*, not fabrication — but the model still sees the opponent's name and Elo from the PGN and can characterize them unchecked.

**Fix:** derive opponent from `gameHeaders` + `playerColor` client-side and send it.

---

### GROUP B — Wrong position (SHIP AS ONE UNIT)

> ⚠️ **B1, B2 and B3 must ship together.** Fixing the request body alone leaves a contradictory, higher-authority block in the prompt, and the bug will appear fixed while remaining live. This is the single most likely way to produce a false "solved".

#### B1 · P0 · Follow-ups are answered about the game's FINAL position

**Evidence (verified end-to-end):**
- Client sends no position: `AnalysisImpl.tsx:584-588` — anchor `contextId: contextIdRef.current,` (line 585). Body is exactly `{contextId, userMessage, conversationHistory}`.
- **The correct value is in scope** — all three call sites pass it into `streamCoachReply`: `:7567` (`fen: displayFen`), `:8095` (`fen: fenAtPly`), `:8198` (`fen: displayFen`), each with `currentPly`.
- Server accepts it: `src/app/api/chat/route.ts:97-98` — anchor `fen: clientFen,` then `moveIndex,`. Schema: `src/lib/validation/schemas.ts:101,105`.
- Server fallback: `chat/route.ts:133-140` → `activeFen = context.fen` when `clientFen` is undefined.
- `context.fen` is the **final** position: `enhanced-analysis/route.ts:904-912` replays the entire `moveHistory` then takes `game.fen()` as `validationFen`.
- Mislabeling: `src/lib/mastermind/positionFacts.ts:59-61` renders `## CURRENTLY VIEWED POSITION (the board the user is looking at RIGHT NOW — answer about THIS position…)`.
- The legality validator anchors to the same wrong board (`chat/route.ts:301`, `:403`), so it cannot catch the error.

**Fix:** add `fen: displayFen, moveIndex: currentPly` to the body at `AnalysisImpl.tsx:584-588`. Server side already handles both, including slicing `effectiveMoveHistory` by `moveIndex` (`chat/route.ts:214-219`).

#### B2 · P0 · The cached context always says the final position is "the board you are commenting on"

**Evidence:** `enhanced-analysis/route.ts:336-337` unshifts `buildCurrentPositionFacts(moveHistory, gameEval)` to the **front** of the compact context. That helper replays the whole game (`positionFacts.ts:77-86`) and labels it `## CURRENT POSITION (the board you are commenting on — use these exact facts; do NOT reconstruct the board from the move list)`. This string is stored in the cache and re-sent verbatim on every follow-up (`analysisContextCache.ts:168-170` → `chat/route.ts:158`).

**Why it blocks B1:** after B1, the per-turn facts built from `activeFen` sit *next to* this block, which claims equal-or-greater authority and describes a different board.

**Fix:** rename this block to `## FINAL POSITION` inside `buildCompactGameContext`, **or** rebuild it per-turn from `activeFen` in the chat route.

#### B3 · P0 · The deep path also discards the viewed position

**Evidence:** `AnalysisImpl.tsx:678` sends `fen`, but `route.ts:643` takes the `moveHistory` branch and the 8th arg `{fen, playerColor}` is identity-only — `route.ts:655-657` states outright *"the rendered prompt never reads these"*. Rendered sections are PGN + TOP MISTAKES + `## FINAL POSITION` + `## VERIFIED POSITION FACTS — FINAL POSITION` (`contract/serialize.ts:289/303/314/322`). Validators anchor to the last half-move too (`mastermind/routeHelpers.ts:158-177`). `enhancedAnalysisSchema` has **no** `moveIndex`/`viewedPly` field at all (`schemas.ts:144-211`).

**Why it matters:** `handleAskCoachAboutMove` (`:8088-8099`) deliberately computes `fenAtPly` ("not at the current display position") — and when that click is the session's first coach message (the common entry: click a mistake row → coach opens), the *deep* path fires and discards it.

**Fix:** add `viewedPly` to the schema; render a `## POSITION UNDER DISCUSSION` block (FEN + relational facts at that ply) alongside `## FINAL POSITION`; thread it into `deriveMastermindMoveContext`.

**Proof obligation for Group B (all three):**
- Unit: `buildChatRequestBody` (already exists, already failing — see §5.1) goes green.
- Integration: POST `/api/chat` with a `fen` for ply 12 → assert the assembled prompt's position block matches ply 12 and contains no block asserting a different board is "current".
- **Browser-level (required):** intercept the outgoing `/api/chat` request after navigating to an earlier move; assert its `fen` equals the FEN rendered on the board. This is the test that would have caught the dead-component mistake, because it exercises the page a user actually loads.
- Prod: navigate to an early move, ask a position-specific question, confirm the answer describes that position.

---

### GROUP C — Fabricated engine data from timeout sentinels

**Background:** when the browser Stockfish exceeds its per-position budget (30s, retry at `max(8, depth-4)` = 12), it returns a sentinel `{pv: [], depth: 0, multiPv: 1, cp: 0}` (`src/lib/engine/uciEngine.ts:335-337`). Depth default was raised 14→16 on 2026-07-07, making timeouts more likely — and they occur almost exclusively on low-end devices, i.e. never on the developer's machine.

**The guard exists and is correctly applied in three places** — `route.ts:250-251` (anchor `const compactSentinel =`), `route.ts:282`, `selectInsights.ts:93-95`, `serialize.ts:158-160` — and is **missing in five**. This is copy-paste drift, not a design problem.

> ### ⚠️ Group C is UPSTREAM OF THE REFEREE, and the referee cannot catch it
>
> *(Raised by the contract/referee session, 2026-08-11. This changes Group C's priority — see §7.)*
>
> The output referee validates coach **prose** against the **contract**. Group C corrupts the contract itself. So when the contract says a timed-out move was a blunder, the coach says *"that was a blunder"*, and the referee marks it **BACKED**.
>
> **`cited` means "consistent with the contract". It never means "true".** C3 is the clearest case: it renders `Classification: BLUNDER` three lines above `Eval: engine data unavailable`, and both are in the same block.
>
> Two consequences worth stating plainly:
>
> 1. **Fabrication measurements do not cover this failure mode.** The referee's measured rate (0.25/100, down from 24.6) is taken on fixtures carrying real Stockfish evals, which contain **no sentinels**. The improvement is real, but real-world fabrication on slow devices is very likely higher than that number implies. Group C should land **before or alongside** the serving flip, not after.
> 2. **The depth 14→16 raise (#224) traded one for the other.** It improved ground truth on capable devices and made the sentinel bugs bite harder on weak ones — which is the population this product exists for.

#### C1 · P0 · `Current eval: +0.00` fabricated for never-evaluated positions

`src/lib/mastermind/positionFacts.ts:109` — anchor `Current eval: ${formatCp(curEval.cp ?? 0, curEval.mate)}`. Guard is `if (curEval)`; `{depth:0, cp:0}` is truthy. Also `cp ?? 0` renders `+0.00` for a line carrying neither `cp` nor `mate`.
This line is the **last line of the first block** in every follow-up context (unshifted at `route.ts:337`) — the most prominent number in the prompt.
**Wrong answer:** final position is +6.2 but timed out → every follow-up ("am I winning?") answered from "dead equal"; coach advises holding a draw in a won position.
**Fix:** `if (curEval && curEval.depth !== 0 && (curEval.cp !== undefined || curEval.mate !== undefined))`.

#### C2 · P0 · A never-evaluated move is labelled "blunder" (follow-up path)

`src/app/api/enhanced-analysis/route.ts:271` — anchor `else if (evalAfter?.moveClassification) label = evalAfter.moveClassification;`
`compactSentinel` forces `drop = 0`, so control **always** falls into this branch for sentinel plies. The guard suppresses the eval swing but not the label. The comment 20 lines above (`:248-249`) explicitly states the guard exists *"so a stalled position can't narrate as a fabricated blunder"*.
**Fix:** `else if (!compactSentinel && evalAfter?.moveClassification)`.

#### C3 · P0 · Same, deep path — "Classification: BLUNDER" printed above "engine data unavailable"

`src/lib/contract/serialize.ts:153` — anchor `Classification: ${e.classification.toUpperCase()}` — rendered unconditionally, immediately above `:158-160` which correctly prints `Eval: engine data unavailable for this move (analysis timed out)`. The same block asserts both.
Source: `builder.ts:331` `classification: evalAfter?.moveClassification ?? null`. The producer has no sentinel handling either — `moveClassification.ts:33` maps every position through `getPositionWinPercentage`, so a `{cp:0, depth:0}` ply scores 50% and corrupts **two** moves (its own and the next, via `positionsWinPercentage[index-1]` at `:73`).
**Fix:** `if (e.classification && !e.evalAfter?.sentinel)`. Consider also guarding in `moveClassification.ts`.

#### C4 · P1 · Sentinel becomes the "biggest moment of the game"

`src/lib/contract/selectInsights.ts:124` — anchor `// ── Scan 2: CHESS INTELLIGENCE top-3 (no sentinel skip, no color filter) ─`. Scan 1 (`:93-95`) skips sentinels; Scan 2 does not. A `cp:0` sentinel adjacent to a winning position yields a phantom multi-hundred-centipawn drop that sorts to rank 1, rendered under `## CHESS INTELLIGENCE LAYER (Pre-computed verified analysis…)` (`serialize.ts:334`).
**Also:** `generatePuzzleRecommendations` (`route.ts:394`) has the same gap and will build real training puzzles from the phantom mistake.
**Fix:** copy the two-line guard from `:93-95` into Scan 2 and into the puzzle-rec scan.

#### C5 · P1 · "Best was" and candidate lines render sentinel evals

`src/lib/contract/serialize.ts:179`/`:181` (anchor `Best was: ${e.bestWas.san}`) and `serialize.ts:28` (anchor `function candidateEval(lf: LineFact)`) read `mate`/`cp` directly, ignoring the `sentinel` flag that `builder.ts:89-106` already computed (and its correct `display: "engine data unavailable"`).
**Result:** `Best was: Nf3 (+0.00, depth 0)` three lines below "engine data unavailable".
**Fix:** short-circuit on `eval.sentinel`, or just use the precomputed `eval.display`.

#### C6 · P2 (latent) · `mate: null` flattens to "mate for Black"

Seven flatten sites test `mate !== undefined` only: `route.ts:224`, `:256`, `:259`, `:423`, `:426`, `builder.ts:454`, `:458`, `selectInsights.ts:64`. With `mate: null`, `null !== undefined` is true and `null > 0` is false → **−9999** plus the literal string `Mnull`. First-party producer emits `undefined` (`parseResults.ts:40`) so it is latent — but `gameEval` is `z.any()` at the request boundary (`schemas.ts:150`) and `positionFacts.ts:16` already types `mate?: number | null`.
**Fix:** `typeof mate === "number"` at all sites.

**Proof obligation for Group C:** one table-driven unit test per site feeding `{depth: 0, cp: 0}` (and `{cp: undefined, mate: undefined}`, and `mate: null`) and asserting the renderer emits *nothing* / "unavailable" rather than a number or a classification. These are pure functions — cheap, fast, deterministic. Additionally assert healthy data is unchanged (no regression).

---

### GROUP D — History contamination (compounding)

> This group is what turns a single wrong answer into a persistent one. The model treats its own prior turns as authoritative and will defend them.

#### D1 · P0 · The corrected answer is discarded; the raw one is re-sent as the model's last word

**Evidence (verified):**
- Server stores the **corrected** text as canonical: `route.ts:1288` → `storeAnalysisContext({..., initialAnalysis: analysisContent})` where `analysisContent = correction.correctedText` (`:1257`).
- Server re-injects it as the first assistant message: `src/app/api/chat/route.ts:169-172` — anchor `content: context.initialAnalysis,`.
- Server then replays client history **skipping only the first assistant entry**: `chat/route.ts:177` — anchor `let skippedFirst = false;`.
- On the live client the first assistant entry is always a **greeting**, not the analysis: `SEED_MESSAGES[0]` (`AnalysisImpl.tsx:982`, `role: "coach"`) or the load greeting (`:6999`, `setMessages([{role:"coach", content: greeting}])`).
- Client never replaces the raw text: the `done` handler (`AnalysisImpl.tsx:753` — anchor `} else if (parsed.type === "done" || parsed.type === "metadata") {`) reads **only** `contextId` and drops `metadata.analysis` / `corrected`.
- History is rebuilt from that raw state: `AnalysisImpl.tsx:567` — anchor `const conversationHistory = prevMessages`.

**Net effect on turn 3:**
```
[0] assistant: <CORRECTED analysis>        ← server-injected
[1] user:      "analyze my game"
[2] assistant: <RAW analysis, hallucination intact>   ← client re-sent, MOST RECENT
[3] user:      "walk me through that mate"
```
The model's nearest prior statement is the uncorrected one. It will defend and extend the false line; the corrected copy reads as superseded.

**Fix (two parts):**
1. Client: in the `done` handler, when `metadata.corrected && typeof metadata.analysis === "string"`, replace the last coach message's content with `metadata.analysis`. **The correct implementation already exists** in the dead component at `AICoachChat.tsx:2593-2607` — port it.
2. Server: replace the positional `skippedFirst` skip with content-identity de-dupe against `context.initialAnalysis`, or have the client tag the analysis turn.

#### D2 · P1 · A hardcoded fabricated analysis is sent as the model's own prior turn

`AnalysisImpl.tsx:982-1006` — `SEED_MESSAGES` is the initial `messages` state and contains a fabricated coach turn:
> *"Stockfish 17 sees it as the only winning move — eval jumps from +2.4 to +4.7 after 24.Rxd4 cxd4 25.Re7+! … Kasparov calculated 15+ ply to see this would work."*

These numbers were written by a human. They pass the `role` filter at `:567-572` into `conversationHistory` and are pushed into `claudeMessages` server-side (`route.ts:748-754`, no content filter).

**Mitigating (verified):** loading a real game clears them — `AnalysisImpl.tsx:6999` `setMessages([{role:"coach", content: greeting, ply: 0}])` (unless `opts.keepChat`). **So the blast radius is: a visitor who asks a question on the demo game before loading their own PGN** — which is the default first-time-visitor path, since `/analysis` shows that demo on arrival.

A partial acknowledgement already exists: the transcript-persistence filter strips `SEED_MESSAGES[0]` (`:8011-8014`) — index 0 only, persistence only, never `conversationHistory`.

**Fix:** add `synthetic: true` to `CoachMessage`, set it on all seeded/UI-authored writes, filter on it at `:567-572`.

#### D3 · P1 · UI-authored strings are sent as assistant turns

All land in `messages` with `role: "coach"` and therefore in `conversationHistory`:
- Error banners overwrite the partial stream: `:8252-8263`, `:7592-7606`, `:8135-8146` → the model reads *"**Coach is offline** (HTTP 502)…"* as something it said.
- **Suggestion pill fabricates a whole exchange with no API call:** `:8308-8316` pushes a `user` turn **and** a `coach` turn ("Pulled three positions in the same family from the master puzzle index…").
- Load greetings: `:6992-6999`, `:7040`.
- `PuzzleCoachPanel`: error text at `:346-348`, `:434-436`; and `fireHintStage` re-splices a `[SHOW_MOVE:…]` tag the server **deliberately stripped** back into turn content (`:404-406`, `:415`), so the next `/api/puzzle-chat` call feeds the model markup it never emitted.

**Fix:** same `synthetic` flag as D2.

#### D4 · P1 · Truncated streams enter history as complete turns

`AnalysisImpl.tsx:737-767`: the reader loop exits on `if (done) break;` with **no check that a `type:"done"` event was ever received**, then returns `accumulated`. A Vercel 60s kill, a dropped connection, or a proxy cutting the SSE body yields a partial answer that renders as finished and enters history.
Aggravating: `streamCoachReply` accepts a `signal` (`:543`) that **no caller passes** — there is no `AbortController` in the file, so navigating away leaves a billed flagship stream running. The transcript debounce (`:8022-8026`, 1000ms) can persist a mid-stream partial, which `?gameId=` hydration (`:8052-8058`) later replays as a complete coach turn.
`PuzzleCoachPanel.tsx:255-330` has the same hole (smaller blast radius — history resets per `puzzle.id`).

**Fix:** set a `sawDone` flag in the `done` branch; if the loop ends without it, mark the message `incomplete`, render a truncation indicator, and exclude it from `conversationHistory`.

**Proof obligation for Group D:** a test that drives two turns and asserts the outgoing `conversationHistory` (a) contains the corrected string, (b) contains no `synthetic` content, (c) contains no message flagged incomplete. Simulate truncation by closing the stubbed SSE stream without a `done` event.

---

### GROUP E — Lost context (no fabrication, but avoidable wrongness)

#### E1 · P1 · Two large cached fields are written by six call sites and read by nobody

`storeAnalysisContext` persists `gameContext` (the full `renderLegacyPrompt` output) and `fewShotExamples` at `route.ts:847/857`, `1019/1029`, `1313/1319`, `1580/1586`, `1844/1850`, `2220/2226`. **Verified:** `grep -rn "\.gameContext\b\|\.fewShotExamples\b" src/` returns zero readers. `buildCondensedContext` (`analysisContextCache.ts:148` — anchor `export function buildCondensedContext`) emits only Final FEN, player/skill, game length, plus grounding rules.

**Lost on every follow-up:** PGN headers (opponent name + Elo, event, time control), **opening name / ECO**, accuracy %, estimated Elo, result, per-ply FENs, all engine PVs and "Best was" lines, candidate rankings, branch points, pedagogical concepts.
Meanwhile the cached system prompt still instructs the model to acknowledge the opening by name (`coachChatPrompt.ts:236-237`) and to take classifications "FROM THE MOVE-BY-MOVE ANALYSIS BLOCK" (`:312`) — a block that no longer exists under that name.
**Wrong answer:** "what opening did I play?" is answered from memory over raw SAN; transposition-heavy lines get misnamed confidently.
**Fix:** append a `GAME OVERVIEW` section (headers + opening + accuracy) into `buildCondensedContext`, or stop storing the dead fields.

#### E2 · P1 · The prompt promises a VERIFIED POSITION FACTS block for every position; only 3 exist

`builder.ts:493` gates `relational`, `concepts`, `engineIdea`, `featureDelta`, `threats` behind `if (intelRank !== null)` — the intelligence top-3 only. `renderTopMistake` (`serialize.ts:188-221`) renders no relational block. But `coachChatPrompt.ts:348-360` states *"**Each** position in your context includes a 'VERIFIED POSITION FACTS' block"* and forbids attack/pin/fork/capture claims absent from it.
For the other 7 top mistakes the rule is unsatisfiable: the model must either refuse tactical language on the moves users most ask about, or break its own rule silently.
`buildRelationalFacts(fenBefore)` is a pure chess.js call and `fenBefore` is already in scope at `builder.ts:409`.
**Fix:** move the `relational` call out of the `intelRank !== null` block and render it in `renderTopMistake`.

#### E3 · P1 · SAN-replay truncation is loud on the deep path, silent on the follow-up path

Deep path tracks and warns: `builder.ts:234-238` → `serialize.ts:266-268` ("analysis covers the first N moves… Do NOT comment on moves after this point").
Follow-up path re-does the replay and just `break`s with no flag: `positionFacts.ts:79-86`. Worse, `positionFacts.ts:97`:
```ts
const lastMove = moveHistory[played - 1] ?? moveHistory[moveHistory.length - 1];
```
When the **first** move fails to replay (`played === 0`), `moveHistory[-1]` is `undefined` and the fallback names the **last move of the game** — producing a starting-position piece map captioned `Last move played: Qxh7#`.
Same silent-`break` in `getFenAtHalfMove` (`chessFormat.ts:170-176`), which feeds `fenBefore` for every insight.
**Fix:** return `{text, replayedPlies}`, drop the `??` fallback when `played === 0`, emit the same warning the deep path uses.

#### E4 · P1 · Degraded grounding sources are invisible to the model

`builder.ts:577-580` populates `chessdb`/`syzygy`/`lc0`/`visibility` as `Degraded<T>` whose unavailable arm carries `claimClassesForbidden` (`contract/types.ts:79-90`) — designed explicitly as the structural fix for the silent-null class. **Verified:** grep of `serialize.ts` for `chessdb|syzygy|lc0|visibility|claimClassesForbidden` → **0 hits**. When a source is unavailable, `buildGroundingContext` emits *nothing at all*, so a degraded prompt is byte-identical to a healthy one minus a few lines.
Also never rendered: `positionConfidence`, `sayables`, `motifs` (raw detector output — `motifsToPropmt` is imported at `route.ts:60` and **never called**), `evalBefore`, `factIdPrefix`, `game.skillLevel`, `persona`.
**Fix:** add `else` arms in `buildGroundingContext` emitting explicit negative rules — same shape as the existing, working `TACTICAL FACTS: [] — do not use: fork, pin, skewer…` fallback (`voter.ts:260-264`).

---

## §4. Adjacent findings — timing & infrastructure (different workstream, same doc)

These came from the same audit but are **not** silent-substitution; they are deadline/plumbing issues. Fix after Groups A–D unless one blocks you.

**T1 · P0 · No request-level deadline anywhere.** `vercel.json:4-8` caps every API route at `maxDuration: 60`. Every timeout in the pipeline is a *component* timeout; nothing tracks wall-clock. **The dominant path's LLM call passes no `AbortSignal`** — `callLLMStream` supports one (`llmProvider.ts:100`) but the call at `route.ts:1120` omits it. After the stream, `generatePuzzleRecommendations` is `await`ed with **no timeout and no concurrency cap** (`route.ts:1295`), a serial Neo4j loop, *before* `done` is emitted. Worst-case serial path exceeds 120s against a 60s ceiling.
**Consequence:** function killed → no `done` event → client renders a truncated answer as complete (D4), the computed correction is discarded, and `contextId` is lost so the **next** turn re-runs the full flagship analysis (a cost/latency spiral).
**Fix:** thread `requestStartMs` + `DEADLINE_MS ≈ 55_000`; derive an AbortSignal for the LLM call; gate correction and puzzle-recs on remaining budget; **always emit `done`** (degraded if necessary) before the ceiling; send `contextId` in an *early* SSE event, not only in `done`.
The pattern already exists and works in `contract/contractServing.ts:44` and `ladder.ts:375,405` — port it.

**T2 · P1 · The grounding circuit breaker can never trip.** `voterSnapshot.ts:234-241` calls `recordSuccess(key)` whenever the fetch **resolves** — and every client catches its own timeout and resolves `null` (`chessdb.ts:81-85`, `lc0.ts:134-135`, `maia.ts:171-172`, `lichessTablebase.ts:112-113`). The `catch` arm holding `recordFailure` is unreachable. So a timeout is recorded as a success and the counter resets. During an outage every turn pays the full ~8s ceiling forever. The unit test that "proves" the breaker works mocks a **rejection**, a shape production cannot produce (`__tests__/buildAsyncSnapshotForMove.test.ts:308-323`).
**Fix:** inside `fetchWithBreaker`, treat "resolved `null` **and** elapsed ≥ 0.9 × timeout" as a failure. ~3 lines, no client changes.

**T3 · P1 · Follow-ups have zero external grounding.** `grep -c "voterSnapshot\|buildAsyncSnapshotForMove\|queryChessdb\|queryMaia\|lc0" src/app/api/chat/route.ts` → **0**. Turn 1 gets the full evidence stack; every subsequent turn is Haiku with local chess.js facts only. Partly by design (speed), but it means "engine-grounded" describes the first answer, not the fourth.

**T4 · P1 · No telemetry on the prompt-side grounding path.** `builder.ts:374-393` fires all fetches with `.catch(() => null)` and logs nothing. If chessdb began failing 100% tomorrow, nothing in the logs would change and the measured +70pp tactical-accuracy result could not be re-verified. (`stage9_async_grounding_fetched` exists but only on the *validator* path.)
**Fix:** mirror that log line in `buildCoachContract` after the `Promise.all`.

**T5 · P1 · `AnalysisImpl` ignores ALL server metadata.** The `done` handler (`:753-757`) reads only `contextId`. Dropped: `metadata.analysis`/`corrected` (D1), `puzzleRecommendations` (computed on every path, pure waste), `validationScore`/`validationIssues`, `position`, `pipeline.timedOut`. Also `{type:"validating", phase}` events (emitted at `route.ts:926, 1084, 1428, 1430, 1433`) have no client branch at all. A pipeline-timeout placeholder ("Still analyzing — the deep-validation pass took longer than expected") renders identically to a real answer.

**T6 · P1 · Degraded answers are cached for 24h on the streaming path.** `route.ts:1269` calls `setCachedResponse` unconditionally; the pipeline path guards the same call with `if (!pipelineResult.timedOut && !isFallbackUsed)` (`route.ts:1534`) and a comment explaining why. Port the guard. Also add an eval fingerprint (`hasGameEval`, `positions.length`, `minDepth`) to the cache key so an engine-blind answer can't be replayed to users who do have evals.

**T7 · P1 · Coach unlocks with zero engine data.** `AnalysisImpl.tsx:6636` — `analysisActive = engine !== null && enginePositions === null && analysisError === null`. Goes false with no evals when (a) WASM is still booting (`useEngine.ts:13-25`, whose `.then()` has no `.catch()`), (b) `analysisError` is set, or (c) `/engines/*` never loads. Stockfish is **7.16 MB** and production is never cross-origin-isolated (`next.config.ts:42` sets COOP `same-origin-allow-popups`, so `SharedArrayBuffer` is undefined → single-threaded). On a mid-range Android the input box invites questions for a long window during which `gameEval` is `undefined` and the prompt silently drops TOP MISTAKES.
**Fix:** gate on `enginePositions !== null`, and show an explicit "coaching without engine data" banner instead of an open input.
Related, unverified: `handleAskCoachAboutMove` (`:8068-8072`) does **not** gate on `analysisActive` — check whether a mistake row is clickable pre-eval.

**T8 · P1 · Silent depth-12 substitution.** On a 30s per-position timeout the engine retries at `max(8, depth-4)` = 12 and merges the result indistinguishably, while `settings.depth` is stamped with the **requested** 16 (`uciEngine.ts:315-339`, `:366`). `computeEvalIntegrity` computes `minDepth` and discards it ("unused for gating by design", `gameEvalSchema.ts:117`). A d16 position minus a d12 position routinely differs 50–150cp — exactly the INACCURACY/MISTAKE thresholds (`route.ts:262-264`). Fabricated mistakes, slow devices only.
**Fix:** carry achieved depth; skip mixed-depth pairs in swing scans; surface `minDepth < requested` as a prompt line.

**T9 · Unresolved, must be MEASURED not guessed · The follow-up context cache may never hit in production.** `contextCache` is a module-level `Map` (`analysisContextCache.ts:62`, 2h TTL, cap 50) with no Redis/KV. Per-route `.nft.json` traces plus `vercel.json`'s per-source-file `functions` glob suggest `/api/chat` and `/api/enhanced-analysis` are **separate serverless functions**, in which case the fast path never hits and every follow-up has always been a full flagship re-analysis. It works perfectly in local dev (one process), which is exactly why nobody would notice.
**Do not "fix" this by adding KV.** Add a hit/miss counter to `getAnalysisContext`, read one day of production traffic, then decide.

**T10 · P2 · Other timing rot.** Revisiting a game restores `enginePositions` but not `gameEvalFull`, silently dropping accuracy/estimated-Elo from the prompt (`AnalysisImpl.tsx:6570-6584`). `savedEvalsAtom` is localStorage-persisted keyed by bare FEN with no depth check, so a stale shallow eval wins over a fresh d16 (`states.ts:27`, read at `:7269`, `:7312-7316`) — display only. The puzzle 15-min idle timer isn't re-armed by coach conversation (`puzzles.tsx:682-692`; `PuzzleCoachPanel` gets no activity callback), so a long coaching conversation "auto-saves after 15 min idle" mid-sentence. `concept-lesson/route.ts:58` holds an unbounded, TTL-less Map.

---

## §5. What already exists — do not redo

### 5.1 An executable reproduction for Group B (committed alongside this doc)

- `src/lib/coach/chatRequestBody.ts` — a faithful extraction of the fast-path body builder. **It reproduces the bug on purpose** (returns no `fen`/`moveIndex`).
- `src/lib/coach/__tests__/chatRequestBody.test.ts` — 5 tests. The three bug-demonstrating ones use **`it.fails()`**, so vitest passes them *because* the bug is live: `Tests 2 passed | 3 expected fail (5)`. CI stays green while the reproduction stays executable.

**How to use it when you fix Group B:**
1. Wire `buildChatRequestBody` into `AnalysisImpl`'s fast path **first**, behaviour-preserving (it currently returns the exact body the inline code builds). Confirm `npm test` still passes. Only now do the assertions cover real code.
2. Add `fen`/`moveIndex` to the returned object.
3. Flip `it.fails` → `it`. **If a flip does not go green, the fix is incomplete — do not delete the assertion.**

**Limitation, stated honestly:** until step 1 is done this helper is not on any live code path, so a green result would prove only that the helper satisfies its own test. It is a reproduction, not coverage. The browser-level assertion in Group B's proof obligation is the one that actually protects the user-facing behaviour.

### 5.2 The usability-detection program (shipped, PRs #252 + #255)

- **E2E harness:** `playwright.config.ts` + `tests/e2e/local/**` (desktop + mobile-emulation projects; chromium only — iPhone descriptors default to webkit, which is not installed). Secrets-free; never creates accounts. **Extend these for the fixes in this doc** rather than writing a new harness.
- **Prod smoke:** `tests/e2e/prod/smoke.spec.ts` — read-only.
- **CI:** `npm run build` gate + E2E on every PR (`.github/workflows/ci.yml`).
- **Deploy verify:** `.github/workflows/deploy-verify.yml` — polls `/api/version` after every push to main, files a GitHub issue if prod never serves the commit.
- **Heartbeat:** `.github/workflows/heartbeat.yml` (every 30 min) + `src/app/api/health/config/route.ts` (names-only env presence, 503 on drift).

### 5.3 Bugs already fixed this session (context, don't re-report)

- Intern-allowlist throw bricked all new-user signup for ~3 months (PR #232).
- Homepage rendered white for light-mode visitors; glass routes now force dark (PR #244).
- Lint errors froze production deploys ~24h (PR #244).
- COPPA DOB age gate, server-enforced on all three account-creation paths (PRs #239/#240).
- Cookie banner covered the auth dialog on mobile, blocking signup by touch (PR #252).

---

## §6. Disproved hypotheses — do NOT re-chase these

### 6.1 "The Anthropic API rejects an assistant-first messages array"

`chat/route.ts:169-172` puts `role: "assistant"` first and `llmProvider.ts` passes `opts.messages` through unmodified. An audit flagged this as a guaranteed 400 that would mean every fast-path turn is broken.
**Probed live with a 1-token call: the API returns 200 and a normal completion.** Not a bug. Do not "fix" it.

### 6.2 "Follow-ups silently lose turn-1 personalization"

**False.** All six `storeAnalysisContext` sites write an identical field set including `systemPromptStable`, `systemPromptSuffix`, `playerColor`, `skillLevel`, `gameEval`; `chat/route.ts:157-163` reassembles both halves. Persona, coachTone, playingStyle, studyGoals, favoriteOpenings, username, rating and player color all survive verbatim. The only thing wrong with the rating is that it was fabricated upstream (A1).

### 6.3 Boundaries verified CLEAN — do not re-audit

- `/api/concept-lesson` — `ConceptLessonCard.tsx:43` forwards `{themeId, userRating: stats.rating}`; the route's `1200` default never fires. **Use this as the reference pattern for A2.**
- `/api/maia-predict` — forwards `fen` + both ratings; the `|| 1500` never fires.
- **No cross-user context bleed** — `generateContextId` includes `uid` (`analysisContextCache.ts:74-87`); `AnalysisImpl.tsx:6905-6907` resets the ref on game/personality/side change.
- **Persona cache key is correctly scoped** (`route.ts:~809`) — includes personality + tone + style + goals + openings.
- **`PuzzleCoachPanel`'s correction round-trip is CORRECT** — the server emits `{type:"meta", correctedText}` only when a correction occurred (`puzzle-chat/route.ts:177-207`), the panel commits `corrected || accumulated` (`:322-326`), and that corrected string is what `apiHistory` re-sends. **This is the working reference implementation for D1.**
- `buildCurrentPositionFacts` eval indexing is off-by-one clean.
- `renderMoveByMoveLine` correctly renders the sentinel (`serialize.ts:158-160`).
- The deep path **does** emit the replay-truncation warning (`serialize.ts:266-268`).
- `coachChatPrompt` has no unpassed parameters from its live caller.
- `mate` sign-flip for Black-to-move is applied at the producer (`parseResults.ts:54`).
- No token-driven history windowing exists anywhere (no silent turn-dropping) — except the wrong-turn skip in D1.
- Share/export paths are storage-only and do not feed a model.

---

## §6.5 SHIPPED SO FAR (update this as you go)

| Item | PR | State | Notes |
|---|---|---|---|
| **A1 + A2** rating threading | **#272** | **MERGED + DEPLOYED** (`c60a541`, verified on `/api/version`) | See "still open" below — prod telemetry not yet read. |
| **Group C** sentinel guards (C1–C5) | **#275** | Open | Rebased onto main after #270/#271/#272. |

**Still open on A1 (do not tick it off yet).** The handoff's own definition of done requires production evidence, and only the deploy half is confirmed. `route.ts` now logs a `ratingSource` field per request (`body` | `profile` | `pgn_header` | `none`). **Read one day of production logs.** If it reads `none` for signed-in users who have a rating, the client fix is not reaching them and the number alone would never tell you.

**Two build-gate lessons from these two PRs — both cost real time:**

1. **App Router route modules may only export known Route fields.** Exporting a helper from `app/api/*/route.ts` for testing fails the production build (`"buildCompactGameContext" is not a valid Route export field`) **while `tsc --noEmit` and the entire vitest suite stay green.** If you need to test a route-local helper, move it to `src/lib/` — that is what `src/lib/coach/compactGameContext.ts` is.
2. **`npm run build` catches things nothing else does.** Both of the above, plus the lint class that froze prod for a day. Run it before every PR, in a worktree.

---

## §7. Recommended execution order

Ordered by (impact × ease of proof) ÷ risk. **One PR per numbered item.**

| # | Item | Files | Risk | Why here |
|---|---|---|---|---|
| 1 | ~~**A1 + A2** rating threading~~ **DONE — #272, deployed** | `AnalysisImpl.tsx`, `puzzles.tsx`, `coachChatPrompt.ts`, `route.ts` | Low | Biggest behavior change per line. Unambiguous proof. **Pilot — validates the whole method end-to-end before harder work.** |
| 2 | **Group C** sentinel guards (C1–C5) — **#275 open** | `positionFacts.ts`, `route.ts`, `serialize.ts`, `selectInsights.ts` | Very low | Pure additive guards on pure functions. Stops fabricated chess content. Table-driven tests. **Priority raised: this is upstream of the referee and the referee cannot catch it — land it before/alongside the serving flip (see the callout in Group C).** ⚠️ Collides with the live contract/referee workstream; rebase and re-verify. |
| 3 | **T1** request deadline + always-emit-`done` + early `contextId` | `route.ts`, `llmProvider` call site | Medium | Unblocks D1/D4 (corrections are lost when `done` is lost) and kills the cost spiral. |
| 4 | **Group B** (B1+B2+B3 together) | `AnalysisImpl.tsx`, `chat/route.ts`, `schemas.ts`, `serialize.ts` | Medium | Must ship as one unit. Needs the browser-level harness. |
| 5 | **Group D** (D1–D4) | `AnalysisImpl.tsx`, `chat/route.ts` | Medium | Stops compounding. D1 depends on item 3. |
| 6 | **T2 + T4** breaker + grounding telemetry | `voterSnapshot.ts`, `builder.ts` | Low | Makes future degradation *detectable* — do before you need it. |
| 7 | **T9** measure the context-cache hit rate | `analysisContextCache.ts` | Low | Instrument, wait a day, then decide. Do not pre-fix. |
| 8 | **Group E** + T5–T8, T10 | various | Mixed | No fabrication risk; schedule after the above. |
| 9 | **C6** `mate: null` hardening | 7 sites | Very low | Latent; cheap; do opportunistically. |

**Definition of done for every item:** red test fails for the right reason → minimal fix → green → `npx tsc --noEmit` + `npm test` + `npm run build` clean → PR with the red-to-green trace in the body → CI green → merged → **`/api/version` confirms the deploy** → real user path exercised on production.

---

## §8. Other open workstreams (separate handoffs; indexed here so nothing is lost)

1. **P0 legal — AGPL relicense.** This repo is a fork of `GuillaumeSD/Chesskit` (earliest commits are his; `upstream` remote confirms). Root `COPYING.md` still states AGPL-3.0. Commit `cf90060` (2026-04-18) relicensed to CC BY-NC 4.0: *"BREAKING CHANGE: License changed from AGPL-3.0 to CC BY-NC 4.0."* **100 upstream source files remain in `src/`** (37 byte-identical, 63 modified), including `useEngine`, `useChessActions`, `useGameData`. A fork cannot unilaterally relicense upstream's work, and AGPL §13 obliges source disclosure to *network* users — colliding with both the NonCommercial license and the pending $0.99 subscription. **Needs a lawyer + an email to GuillaumeSD before `FREEMIUM_ENABLED` is flipped.** Full detail in the founder's memory file `project_agpl_relicense_exposure.md`.
2. ~~**P1 privacy — LLM capture has no consent gate.**~~ **RESOLVED. Do not re-fix, and do not treat as dormant.**
   *(Flagged by the contract/referee session 2026-08-11; re-verified independently against `src/lib/tracking/llmCapture.ts` before this edit — a comment is a hypothesis, §0.2.)*
   This entry was wrong in **both** directions. "Currently dormant (tracking off in prod)" had already stopped being true, so the gap was **live**, not armed-but-idle. It was then closed by **PR #263**: `CaptureInput.consent` is a **required, un-defaultable** field (`llmCapture.ts:36`; module header `:21-23` — *"a route that forgets it fails to compile rather than silently capturing a non-consenting user"*), and `recordLLMCallFull` **fails closed** on it (`:79-80`, `if (!ctx.consent) return;`). Threaded through all four LLM routes plus `contractServing`.
   **Read the shape, not just the status.** The fix makes the safe behaviour *compile-time mandatory* rather than *remembered*. That is the same move A1 used (`userRating` is a required key with an optional value, so omitting it is a type error at every call site), and it is the only structural defence this codebase has found against silent substitution. Prefer it to a runtime default every single time.
3. **P1 privacy — deletion promised, not performable.** The privacy page promises deletion within 7 days; `purgeUserData()` only clears tracking tables (its own comment says "call from the account-deletion flow (once one exists)"), and no such flow exists. Needs an ops script now and a self-serve flow + data export later.
4. **P2 — unauthenticated billed health endpoints.** `/api/health/llm` and `/api/health/anthropic` make real Anthropic calls with no auth and no rate limit.
5. **COPPA follow-up** — the DOB gate ships, but consider whether counsel wants a stronger posture; question is written into PR #239's body.

---

## §9. Final warnings

1. **Do not batch fixes.** One PR per numbered item, or you will not know what worked.
2. **Do not trust this document's line numbers without re-grepping the anchor.** The repo moves daily.
3. **Do not trust an agent's citation, including one from this document, without opening the file.** Two of my four audit reports contained a false or dead-code citation; both were caught only by manual verification.
4. **Do not declare a fix done at merge.** Three separate times this week, "merged" did not mean "deployed" and "CI green" did not mean "working."
5. **When something looks already-handled, check whether the handling code is reachable.** `AICoachChat.tsx` contains correct implementations of at least two fixes in this document and runs for nobody.
