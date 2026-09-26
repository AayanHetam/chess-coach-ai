# /analysis coach conversation rework

**Shipped:** 2026-09-25, branch `claude/sleepy-pasteur-rz21ea`, four passes. **Status:** built and verified locally (tsc, vitest, Playwright against a dev server with stubbed coach endpoints); the new follow-up prompt has NOT been run against a live model — see "Before this goes live".

## The diagnosis it answers

The accuracy machinery (contract, line stories, referee) is good. The words were the problem, and the follow-up path had no shape of its own:

| | Before | After |
|---|---|---|
| Follow-up answer | 216 words, 7 paragraphs, "Great question!" opener, closing question (real Haiku answer, `scripts/eval/results/followup-story-probe.json`) | the idea behind the move and what actually happens (≤ 45 words), the line drawn by the client, a "Lesson:" naming the pattern and the check to run next time (≤ 35 words), an optional "Your turn:" question; 100-word budget, 140 for a walkthrough |
| Follow-up system prompt | the 27.6k-character turn-1 prompt (card grammar, Maia rules, "top 3 moves with full PVs") | `followUpPrompt.ts`, ~4.5k characters, per attitude, snapshot-tested |
| Follow-up context per turn | PGN + one sentence per half-move (80 lines on a 40-move game) + 12 worst moves + a piece map of the FINAL position + the contract block + the viewed board, ~15k chars uncached | overview + PGN + a move table windowed around the move under discussion (flagged moves always kept) + worst moves + an anchor block for that move |
| Which board a question is about | whatever the client's board showed | the move the question names ("8. Nc7+", "move 8", "why not Qxc1", "Nc7+"); the client moves the board there and offers the way back |
| Output cap / history | 3000 tokens / the whole transcript | 600 tokens / the last four exchanges, starting on a user turn |
| Turn-1 card | Idea/Problem/Solution/Outcome open by default, Threats, Roles, two identical "Engine line" / "Maia line" boxes, one card at a time in a carousel | headline, the Idea and the Problem, the engine's line drawn with what each move does and a Play control, the Solution and the Outcome, the takeaway as a "Lesson" note; nothing about the move hidden, only threats, roles and the concept behind pills; cards stacked under "Key moments" |
| Moves that are not key moments | a verdict glyph in the move list, nothing else | the per-move analysis card at the top of the coach panel: verdict, evals, what the move does, why it works or not, the engine's preferred line, "Ask Masti" — for every ply, from the engine data |
| Header | "Stockfish-grounded · Engine-validated" + a hard-coded Validated chip | Masti at 44px, one line of status |
| Suggestion chips | offered the opponent's blunder; tapping filled the composer | the player's own moves; tapping asks |

## Teaching, not verdicts (2026-09-25, second pass)

The first cut leaned on the verdict: "it forks, but a queen was free" plus a maxim. A coach's value is the why and the transfer, so the shape is now the four things a coach says about a move: what it was for (credited), what actually happens and why (causes, never the number), the pattern's name, and the check to run before the next move like it — "before a check or a fork, list every capture your opponent has in reply", not "be careful". The lesson is marked ("Lesson:") so the client can give it an eyebrow, and one "Your turn:" question is allowed when the player can answer it from the board and the facts can check it. Budgets grew to fit that (100 / 140 words), not to allow padding; the banned openers and closers stay.

The turn-1 card follows the same order and hides nothing: intent and problem above the line, the solution and the outcome under it, then the lesson. `insightWhy.ts` makes the cut from the body the verbalizer already writes, so no prompt change was needed there.

## Every move, not three (2026-09-25, third pass)

A review cards three moves of a forty-move game; the rest had a glyph. The per-move analysis card (`MoveAnalysisCard.tsx` over `moveAnalysis.ts`) sits at the top of the coach panel and follows the board: for the move on the board it gives the verdict, the evaluation before and after, what the move does in the line story's words, a plain sentence on why it works or does not, and, when the engine preferred something else, that line drawn and playable. It is built from the engine data and chess.js, so it exists for every ply, the opponent's included, the moment Stockfish finishes, and it never says what the board does not back. "Ask Masti about this move" sends the question, and the anchor takes the coach to that move.

## One board, one conversation (2026-09-25, fourth pass)

The words were fixed; the page around them was not. With the coach at 44px, a status line, a tab strip, a "This move" card, a side-question card, a book-exit card, a puzzle-recommendation card, bordered key-moment cards inside a bubble inside a stack, a beam running round the panel, and a strip of eight buttons and four chips under the board, the transcript had a quarter of a desktop screen and almost none of a phone's. The rebuild makes the page what it is: a board and a conversation.

- **Left column.** Board, the evaluation arc as a bare scrubber, and one strip of fixed height: step buttons, the move with its verdict and evals, "Ask Masti", the board menu (flip, reset, the arrow overlays with Maia's Elo, copy link), then the move's sentence and the engine's line. The exploring and coach-jump states sit in the strip's first row in place of the move label, at the same height; they were banners above the board, which resized the board each time a line opened. Stepping through the game moves nothing but the pieces (the e2e spec holds the strip's height to ±2px across the start position, a blunder and an exploration).
- **Right column.** One header row: Masti, his attitude, and Coach / Moves / Masters / Lines as words. The transcript is the whole column: coach messages as prose beside his face, user messages as a soft bubble, no panel chrome, no animation. The side question and side line are part of the greeting, the book-exit note is its second paragraph, the puzzle-recommendation card is gone from this page. Suggestions are one row that scrolls sideways.
- **Lines.** One row of moves, Play, and under it one fact at a time (the first move's at rest, the current move's while it plays) with the ledger on the right. The chip-per-ply rendering put eight captions on screen for one line and was most of what made a card feel crowded.
- **Key moments** are passages of the message separated by rules: move and verdict, lede, Idea and Problem, the line, Solution and Outcome, the lesson. "What happened in the game" and "Practice …" are text links; the Threats and Piece-roles reveals are not rendered any more.
- **Phone.** Below `lg` the panel is a screen tall instead of a fixed 600px box, so scrolling the board away leaves the conversation filling the viewport; a tap on a line's Play scrolls the board back into view.

## Live test on production (2026-09-26)

Signed in as a throwaway account on chessmasti.com (build 5702466), the knight-fork game, the review, then four follow-ups against Haiku with prompt 1.1:

| Question | Words | Structure | Accuracy |
|---|---|---|---|
| Why was 8. Nc7+ a mistake? | 207 | Lesson, Your turn, line drawn, no filler opener | "8... Kxc7" invented in Your turn |
| What should I have played on move 8? | 197 | Lesson, line drawn | the same invented move, "the only way" |
| Walk me through 8. Qxc1 | 231 | Lesson, line drawn | the same invented move; "slightly worse for White" when the line is +2.84 |
| Was 6. Na3 a mistake? | 181 | Lesson, line drawn, board jumped to move 6 | correct |

What improved held (no banned openers, tokens emitted every time, anchors right). What did not: the 100-word budget was ignored (about the same length as the old prompt's 236 / 207), and the model borrowed "Kxc7", real one move later in the 9. Nxa8 line, for move 8. The referee accepted any move that appeared anywhere in the licensed lines, whatever its number, and a line that opened "8. Qxc1 Kxc7 …" lost its "8. " to the list-bullet stripper, so the moves fell back to that pool. The old prompt's recorded answers did not make the mistake.

Fixed the same day: the referee reads numbered moves at their own ply and a sentence's moves as a line (`followUpReferee.plies.test.ts` holds the three live sentences), the anchor block labels the engine line with its rating, says the played move is not in it, shows the asked alternative's board and forbids borrowing other moments' lines, and prompt 1.2 forbids narrating a line's moves in prose and makes the budget a hard total. Length remains the open problem: a prose budget is advisory to Haiku, and structured output per field is the reliable fix.

## What shipped, by file

Server (`/api/chat` fast path):

- `src/lib/prompts/followUpPrompt.ts` — the follow-up system prompt, `FOLLOWUP_PROMPT_VERSION = "1.1"`, `getFollowUpPromptMode()` (`COACH_FOLLOWUP_PROMPT=legacy` is the rollback), `FOLLOWUP_MAX_TOKENS = 600`. Snapshots per personality in `__tests__/followUpPrompt.test.ts`.
- `src/lib/coach/questionAnchor.ts` — `resolveQuestionAnchor(question, moves, playerColor, viewedPly)`: numbered notation (either side), "Move 3: Nxd4", "move 8" / "my 8th move" (the player's move by default), bare piece moves and cued pawn moves (nearest occurrence to the viewed board). Returns both boards and the client ply.
- `src/lib/coach/followUpContext.ts` — `buildAnchorBlock` (boards before/after, relational read before, eval swing in the table's format, engine's preferred move, engine line and the game's continuation narrated by `lineStory`), `windowMoveTable`, `buildFollowUpCondensedContext`.
- `src/lib/coach/gameOverview.ts` — the E1 overview, moved out of the cache module so both context builders share it.
- `src/lib/contract/followUpReferee.ts` — `extraFens` / `extraLicensedText`: the anchor's boards and narrated lines license claims, so a question about a move that was never a card keeps its board claims.
- `src/app/api/chat/route.ts` — wiring: anchor → `activeFen` / `effectiveMoveIndex` for facts, pipeline and referee; the response carries `anchor` and `followUpPrompt`; `followup_anchor` log line.
- `src/lib/analysisContextCache.ts`, `src/app/api/enhanced-analysis/route.ts` — `personalityId` stored with the context (six store sites).

Client (`/analysis`):

- `src/components/preview-analysis/ProofLine.tsx` — the line as one row of moves with Play, a caption row (one fact at a time) and the ledger. Stops playing when the reader touches anything else.
- `src/components/preview-analysis/coachLines.ts` — `engineLineAt`, `playedLineAt`, `splitProseByLineTokens`.
- `src/lib/coach/lineCaptions.ts` — `captionLine` over `buildLineStory` (client-side chess.js), ledger in the second person for the player's lines.
- `src/components/preview-analysis/coachMoveRefs.ts` — `buildLinePreview` (no tolerance window: an illegal ply in an engine line is corrupt data, not a typo).
- `src/components/preview-analysis/moveAnalysis.ts` + `MoveAnalysisCard.tsx` — the analysis of every move (`analyzeMoveAt`, `describeMove`); the card is the fixed-height strip under the board (nav buttons, label / verdict / evals or the exploring and coach-jump states, Ask Masti, board menu, sentence, engine line).
- `src/components/preview-analysis/insightWhy.ts` — cuts a card's [WHY] body into lead (Idea + Problem), lesson (the closing takeaway, label stripped) and rest (Solution, Outcome, the middle), for labelled and flowing bodies alike.
- `AnalysisImpl.tsx` — `ViewSwitch`, `CoachHeader`, `BoardNav`, `BoardMenu`, `ExploringState` / `CoachJumpState` replace the tab strip, the panel header, the navigator, the arrow-toggle row and the two banners; `CoachPanel` is chrome-less; `DarkInsightStack` replaces the carousel; the card shows the lead, draws the engine line, shows the rest and the lesson as a `CoachNote`, and folds only the game's continuation behind a "What happened" pill; follow-up paragraphs opening with "Lesson:" / "Your turn:" render as the same note; `InsightBodyText` drops line tokens (the card owns them); follow-up prose renders tokens as proof lines; `handleShowLinePly` (played lines move the cursor, engine lines ride the exploration preview); `CoachJumpBanner` + `coachJump` state; `onAnchor` in `streamCoachReply`; header; chips send on tap; markdown: nested elements are no longer tokenized twice (the "🔍 🔍" bug), `**bold**` is mapped, and a leading move number is escaped so "6. Na3 walked past…" is prose, not a list.
- `generateSuggestions.ts` — `playerColor` filter.

Tests: `questionAnchor`, `followUpContext`, `lineCaptions`, `followUpReferee.anchor`, `followUpPrompt` snapshots, route tests (prompt selection, history trim, anchor with the pipeline on and off), `coachMoveRefs` (`buildLinePreview`), `generateSuggestions` colour filter, and `tests/e2e/local/coach-proof-line.spec.ts` (the card's line, Play → Exploring banner, the follow-up's two lines and the jump banner with its way back).

## Before this goes live

1. **Run the follow-up prompt against a live model on more than one game.** Done once on production for the knight-fork game (above); the second real fixture and the other eight remain. Extend `scripts/eval/followup_story_probe.ts` to the new prompt and gate on: median words of model prose ≤ 80, verdict-first, referee drops per 100 sentences, and the helpfulness jury (`helpfulnessJudge.ts`) at or above baseline. The prompt was written to the measured failure modes but its outputs were not observed here (no API key in this environment). `COACH_FOLLOWUP_PROMPT=legacy` is the one-line rollback if it disappoints.
2. **Check `[CONTINUATION]` / `[PLAYED]` emission rates.** If the model rarely emits the tokens, the proof is missing from follow-ups; the fix is prompt-side (an example) or route-side (append the anchor's engine line token when the answer names the move and carries none).
3. **Turn-1 prompt is untouched.** The verbalizer charter still asks for `[THREATS]` and `[ROLES]` and both continuation tokens; the client now folds the sections and ignores the Maia token. Retiring them from the charter and gold examples needs the CI-4 gates re-run (`contract_ci4_gates.ts`), which needs an API key.
4. **Mobile.** The panel is now a screen tall under the board and the board scrolls back into view when a line is played, but board and text are still not on screen together. A bottom sheet, or a board that shrinks while the reader is in the conversation, is the next layout step.

## Not done, on purpose

- Structured (JSON) output for follow-ups: the validator pipeline and the referee are prose-based; tokens on their own lines give the same "the model never writes SAN for the proof" property without touching them.
- Inline board diagrams: the main board is the diagram; anchor sync and Play use it.
- The intro line on turn 1 ("Let's walk through the key moments") and the card sections are model-emitted; changing them is a turn-1 prompt change (see 3 above).
