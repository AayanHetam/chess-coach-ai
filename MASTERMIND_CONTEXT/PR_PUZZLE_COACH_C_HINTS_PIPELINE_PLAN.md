# PR-Puzzle-Coach-C — Staged hints pipeline ("analyze my game" for puzzles)

**Status:** Plan-review hold. Awaiting Aayan + tech-lead sign-off before code.
**Estimate:** 2-3 days implementation.
**Depends on:** PR-A (merged) for glossary scaffolding. PR-B (planned) for the demo-move handshake — `Show answer` stage leans on it.

---

## Goal

Replace the free-form coach reply on wrong-move with a structured, progressive-disclosure hint pipeline — the puzzle-board equivalent of `/analysis`'s "analyze my game" flow.

Aayan's framing: *"the puzzle equivalent of the analyze-my-game button."* Stages reveal more information in exchange for more user intent + more latency + more cost.

## The four stages

| # | Trigger | Stage | What the coach says | What it must NOT say | Latency target | Tier |
|---|---------|-------|---------------------|----------------------|---------------|------|
| 1 | Auto-fires on wrong attempt | **why_wrong** | Why the user's *specific* move was wrong. | The correct move. Any solution-line square. | 1-2 s | Haiku 4.5 |
| 2 | User clicks "Get a hint" | **hint** | A positional observation ("Queen on g5 pins g7 to king on g8") + its strategic significance ("which matters because Nxf7 then forks king and queen"). Glossary terms render as clickable chips with square-overlay capability. | Still no concrete solution move. | 2-4 s | Sonnet 4 |
| 3 | User clicks "Show the answer" | **answer** | The correct move + a short explanation of what it achieves. Triggers the PR-B demo-move dialog to play the line on the main board. | — (everything fair game) | 2-4 s | Sonnet 4 |
| 4 | User clicks "Deeper dive" | **deeper_dive** | A full pedagogical breakdown: the *pattern* (named tactic), why this position invites it, what the user could've spotted, common follow-up mistakes, similar positions worth studying. | — | 8-12 s | Sonnet 4 + extended thinking |

## Why structured stages over free-form

The current `/api/puzzle-chat` returns one bubble per turn. A user who hits a wrong move gets one wall of text covering "what you did wrong + what to try + a hint + the answer" all at once. That collapses every stage of intentional discovery into a single dump. Worse, the coach often leaks the answer in the why-wrong portion.

Structured stages enforce per-stage guarantees server-side and let the UI pace the reveal client-side.

## API contract

### New endpoint: `POST /api/puzzle-hint`

```ts
// Request
{
  puzzleId: string;
  puzzleContext: PuzzleContext;        // fen, solution, themes, rating
  userAttemptSan: string | null;       // the wrong move that triggered why_wrong
  stage: "why_wrong" | "hint" | "answer" | "deeper_dive";
  userRating?: number;
}

// Response (SSE — same shape as /api/puzzle-chat)
{
  stage: "why_wrong" | "hint" | "answer" | "deeper_dive";
  prose: string;                                   // streamed
  mentions: TermMention[];                         // structured payload, sent last
  showMoves?: string[];                            // SAN list for the answer stage
}

interface TermMention {
  term: keyof typeof CHESS_TERM_GLOSSARY;          // "pin", "fork", etc.
  squares: string[];                               // squares to overlay when clicked
  color: "red" | "blue" | "yellow" | "green";      // overlay tint
  /** Substring inside `prose` where the term was mentioned (for chip placement) */
  offset: number;
  length: number;
}
```

### Why a separate endpoint, not a stage param on `/api/puzzle-chat`

- `/api/puzzle-chat` is conversational. Stages are pedagogical: input is closed-form (puzzle + attempt), output is structured.
- Caching: `(puzzleId, userAttemptSan, stage)` is a small key space — let us cache server-side and skip the LLM call entirely on a hit.
- Cost telemetry: easy to isolate hint costs in the admin LLM stats dashboard.

### Prompt templates

Live in `src/lib/prompts/puzzleHintPrompts.ts`. Per-stage:

- **why_wrong** — system prompt explicitly forbids mentioning any of the solution's destination squares. Lists the wrong move's chess.js verbose move object. Constrained to ≤80 words.
- **hint** — gives the chess context, asks for ONE concrete positional observation + ONE strategic implication, both required. Forbids announcing the solution move. Constrained to ≤120 words. Output schema requires `mentions[]` to be populated with the glossary terms it used.
- **answer** — gives the solution move + asks for "what does this move achieve in 2 sentences." Emits `showMoves: [solution_san, opponent_san?]` so the client can trigger the PR-B demo dialog. ≤60 words prose.
- **deeper_dive** — extended thinking enabled. Format: named pattern → why this position invites it → what to look for next time. ≤300 words.

### Solution-leak guard (why_wrong)

Server-side validator: after the LLM call returns, parse the prose. If any token from the solution-line's destination square set appears in the response, retry once with a stricter prompt. If it leaks again, return a generic fallback ("That move drops material — try again.") and log the violation for prompt refinement.

## UI: progressive disclosure

In `PuzzleCoachPanel`, replace the free-form auto-fired turn-0 with the stage button row:

```
On wrong attempt:
┌─────────────────────────────────────────┐
│ Coach is figuring out what happened…    │   ← thinking bubble (1s)
└─────────────────────────────────────────┘
┌─ Coach ─────────────────────────────────┐
│ Bxc4 loses a piece — the bishop is the  │   ← why_wrong, streamed
│ only defender of the d3 pawn, so when   │
│ White takes back you also lose the      │
│ pawn …                                  │
└─────────────────────────────────────────┘
                          [  Get a hint  ]   ← user can pause here

On "Get a hint" click:
┌─ Coach ─────────────────────────────────┐
│ Notice the Queen on g5 — it [pins] the  │   ← chips on glossary terms
│ g7 pawn to the king on g8. That matters │
│ because with the pawn frozen, …         │
│                                         │
│              [ "pin" chip is clickable  │
│               → highlights g5 / g7 / g8 │
│                 in red on main board ]  │
└─────────────────────────────────────────┘
        [  Show the answer  ]  [  Deeper dive  ]

On "Show the answer":
┌─ Coach ─────────────────────────────────┐
│ The move is Nxf7. After the king takes, │
│ the bishop on g6 delivers mate.         │
│                                         │
│   ↗ Show this on the board?  (PR-B card)│
└─────────────────────────────────────────┘
                          [  Deeper dive  ]

On "Deeper dive":
┌─ Coach (thinking deeply…) ──────────────┐
│ ⠋ Working it out — about 10 seconds…    │   ← long thinking bubble
└─────────────────────────────────────────┘
┌─ Coach ─────────────────────────────────┐
│ This is a classic … [4 paragraphs]      │
└─────────────────────────────────────────┘
```

The user can stop at any stage. If they solve the puzzle mid-pipeline, the remaining buttons collapse and the panel switches to the solved-celebration state.

## Square overlay system

When a user clicks a `<ChessTermInfo>` chip whose stage was `hint` or `deeper_dive` AND the LLM emitted a `TermMention` for that chip's term, the popover gains a `[ Show on board ]` button. Clicking it pushes the mention's `squares` into a new `coachHighlights` prop on `<PuzzleBoard>`:

```ts
interface CoachHighlight {
  squares: string[];
  color: "red" | "blue" | "yellow" | "green";
}
```

`PuzzleBoard` extends its `customSquareStyles` to overlay these (semi-transparent fill matching the color). Click off-board or close the popover → highlights clear.

This is the answer to *"if players click `pin` when mentioned, show a red tint line."*

## Implementation steps

1. **`src/lib/prompts/puzzleHintPrompts.ts`** (new) — four prompt templates + the per-stage constraints.
2. **`src/app/api/puzzle-hint/route.ts`** (new) — endpoint, server-side leak validator, SSE streaming, structured `mentions` emission.
3. **`src/lib/validation/puzzleHintSchemas.ts`** (new) — Zod for request/response.
4. **`src/components/puzzle/HintStageRow.tsx`** (new) — the progressive button row.
5. **`src/components/puzzle/PuzzleCoachPanel.tsx`** — auto-fire `why_wrong` on outcome change to "wrong"; render stage buttons; manage pipeline state.
6. **`src/components/puzzle/ChessTermGlossary.tsx`** — extend `<ChessTermInfo>` to accept an optional `mention` prop with a "Show on board" button.
7. **`src/components/puzzle/PuzzleBoard.tsx`** — new `coachHighlights` prop that overlays on `customSquareStyles`.
8. **`src/pages/preview/puzzles.tsx`** — own `coachHighlights` state, pass to board, clear on next attempt.
9. **Server-side cache** — Redis or in-memory map keyed on `(puzzleId, userAttemptSan, stage)`, TTL 7 days. Misses on first user; hits for everyone after.
10. **Synthetic-tester fixtures** — add 5 wrong-move fixtures per stage; assert no solution leak for `why_wrong` + `hint`.

## Cost ceiling

Worst case per puzzle (user goes all the way to deeper_dive):
- why_wrong (Haiku, ~150 in / 80 out): ~$0.0001
- hint (Sonnet, ~300 in / 120 out): ~$0.0024
- answer (Sonnet, ~300 in / 60 out): ~$0.0019
- deeper_dive (Sonnet+thinking, ~400 in / 300 out + 500 thinking): ~$0.012

Per-puzzle worst-case: **~$0.016**. With caching across users for the same (puzzleId, userAttemptSan, stage), aggregate cost is amortized fast — most popular puzzles will hit cache.

Per-1M-MAU/year if 30% of users hit a wrong move once/day on average, and 40% of those go past stage 1, and cache hit ratio is 80%: ~$11k/yr. Acceptable.

## Open questions

### For Aayan (chess/coaching)

1. **Is the four-stage shape right**, or should stage 1 and stage 2 be merged (one combined "why wrong + small hint")? The risk of merging: harder to enforce the "no solution" guarantee.
2. **Leak guard on `why_wrong`**: should it block any mention of the solution's destination squares (strict), or only block the solution move's source-square + destination-square combo (loose)? Strict is safer but may make the coach awkward; loose is more natural but leakier.
3. **Solution stage triggers PR-B demo**: should the coach play the move automatically once "Show the answer" is clicked, or still gate behind the demo dialog confirmation? Auto = smooth; gated = consistent with PR-B's invariant.
4. **What's the right "deeper dive" length budget**? 300 words = ~90 s read time. Worth the 10 s of latency? Could be a "Spotify episode" style: 60 s short version vs. 3 min long version.
5. **Voice across stages**: the same coach personality, or do stages have distinct voices (why_wrong = direct, deeper_dive = professorial)? Current coach voice is set per `personalityId` in `coachChatPrompt.ts`.
6. **Glossary square-overlay colors**: pin = red line, fork = blue rays, skewer = orange arrow? Need a per-term color/shape spec before building.
7. **On a SOLVED puzzle (not wrong)**: should the user still be able to ask "Deeper dive" to learn why their correct move worked? Probably yes.

### For tech-lead (architecture / scope / cost)

1. **Endpoint shape**: separate `/api/puzzle-hint` vs. extending `/api/puzzle-chat` with `stage`? Separate gives cleaner caching + cost telemetry but doubles the surface area.
2. **Cache layer**: Redis (we don't have one wired yet) vs. in-memory (lost on cold serverless) vs. Supabase table (durable, slower)? In-memory is the fastest path; durable cache can land later.
3. **Extended thinking on `deeper_dive`**: ~10 s latency target is right at the edge of "user gives up." Acceptable, or should we run two parallel calls (one Sonnet, one Sonnet+thinking) and stream whichever returns first?
4. **`TermMention` schema**: do we lock the structure now or evolve it? Once we ship and users click chips, the schema is sticky.
5. **Eval re-run gate**: 4 new prompts × 5 fixtures each = 20 new synthetic-tester runs as a merge precondition. Build this into CI?
6. **Backwards compat**: PR-A puzzle-coach surface uses `/api/puzzle-chat` directly. After PR-C, on wrong-attempt do we (a) silently switch to `/api/puzzle-hint`, (b) feature-flag, (c) ship behind a `?staged=1` query param for opt-in beta?
7. **Solution-leak guard retry-once + fallback**: the fallback might be triggered enough to be annoying. Should we have an LLM-driven *rewrite* step instead — "this response leaked the solution, rewrite without mentioning these squares"?

## Risks

- **Prompt engineering quality**: leak guarantees depend on prompt discipline. Multiple iterations expected; eval fixtures are the only way to keep regressions out.
- **Cache poisoning**: if the first user gets a bad response and we cache it, every subsequent user sees the bad response. Mitigate with a "coach was off" feedback button that flushes the cache key.
- **Latency on deeper_dive**: 10 s is the right target but actual Sonnet+thinking latency varies — we may need to retry-with-shorter-thinking if it goes past 15 s.
- **Coach personality breakdown**: four distinct prompts on the same puzzle could feel like four different coaches. Mitigate with shared voice tokens across all four prompt files.

## Not in this PR

- Audio narration of hints (future).
- Hint streaming directly into the board overlay (the chip click triggers it; not automatic) — future.
- Hint history saved to user profile ("you needed a hint on 60% of fork puzzles") — future (Mastermind correlation).
- Multilingual hints — future.
