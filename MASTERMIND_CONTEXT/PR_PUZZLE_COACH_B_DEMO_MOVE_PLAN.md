# PR-Puzzle-Coach-B — Coach-driven demo moves on the main board

**Status:** Plan-review hold. Awaiting Aayan + tech-lead sign-off before code.
**Estimate:** ~1 day implementation.
**Depends on:** PR-A (merged) for retry-loop / next-puzzle / glossary scaffolding.

---

## Goal

Make the puzzle coach and the puzzle board behave as one surface. When the coach wants to show a line ("here's what Nxe4 looks like"), it stops rendering the move on its own tiny chessground miniboard and instead asks the user, via a dialog, for permission to play the move on the **user's main board**. On confirm, the board animates through the line in front of them.

Aayan's framing: *"as in tune as you are with the code or as a left hand is with a right hand."*

## Why now

- The miniboard takes up vertical real-estate inside chat bubbles and the user has to read both surfaces.
- It's redundant — there's a full-size board 18 inches to the left.
- The coach can never *guide* the user's eye to a square; the miniboard is a sealed off island.

## Current state (after PR-A)

- Coach prose carries `[POSITION_AFTER: san1 san2 ...]` tags.
- `PuzzleCoachBubble.renderCoachContent` replaces each tag with a `<PuzzleCoachMiniboard>` (its own chessground instance).
- Miniboard renders the position after applying the SAN moves to `studentStartFen`.

## Proposed design

### Tag swap

- Old: `[POSITION_AFTER: Nxe4 Kf7]`  →  inline miniboard
- New: `[SHOW_MOVE: Nxe4 Kf7]`  →  inline **DemoMoveCard** in the chat

Keep `[POSITION_AFTER:...]` parsing for backward compat (one old coach reply mid-conversation should still render). Coach prompt bumps the canonical tag to `SHOW_MOVE`.

### DemoMoveCard (in-chat)

Glass card the user can tap. Renders inside the chat bubble.

```
┌──────────────────────────────────────────┐
│ ↗  Show this on the board?               │
│    1. Nxe4   2. Kf7                      │
│                                          │
│             [ Show ]  [ Not now ]        │
└──────────────────────────────────────────┘
```

`Show` → opens DemoMoveDialog (confirm + tweak speed).
`Not now` → dismisses (text moves stays in the chat for reference).

### DemoMoveDialog

```
┌─ Coach wants to demonstrate ───────────┐
│                                         │
│  Line:  1. Nxe4  2. Kf7                 │
│                                         │
│  Speed: ◐ Step    ○ Auto                │
│                                         │
│  Your move (Bxc4) is paused. You'll be  │
│  returned here when the demo finishes.  │
│                                         │
│         [ Play on board ]  [ Cancel ]   │
└─────────────────────────────────────────┘
```

### Demo mode on the main board

- New parent state: `demo: { active: boolean; moves: SAN[]; idx: number; resumeFen: string | null }`
- When `demo.active`, the board is rendered with `interactive=false` (coach drives).
- Step mode: a `[ Next ]` floating button advances one ply at a time, animating via react-chessboard's natural FEN transition.
- Auto mode: a timer advances every 1200 ms.
- At end-of-demo: floating banner "Demo finished. [ Back to your move ]" — clicking restores `resumeFen` and `interactive=true`.

### Edge cases

| Case | Behavior |
|------|----------|
| User had a wrong-flash in progress when demo starts | Demo waits 200 ms for flash to clear; resume position is the position *before* the wrong move. |
| Puzzle solved during demo (coach demos the solution) | Demo finishes; "Back to your move" becomes "Next puzzle." Solved-state styling applies. |
| Coach emits invalid SAN | Demo card renders with a `[ Show ]` button that errors gracefully ("This move isn't legal from the current position") — non-blocking. |
| User clicks "Cancel" mid-demo | Restore `resumeFen`, set `interactive=true`, no further state mutations. |
| Multiple `[SHOW_MOVE:]` tags in one response | Each renders its own card. Only one demo active at a time. |

## Implementation steps

1. **`src/components/puzzle/DemoMoveCard.tsx`** (new) — the inline chat card. Props: `moves: string[]`, `onShow: (moves: string[]) => void`.
2. **`src/components/puzzle/DemoMoveDialog.tsx`** (new) — the confirmation modal. Owns speed toggle.
3. **`src/components/puzzle/PuzzleCoachBubble.tsx`** — extend the `renderCoachContent` parser to detect both `POSITION_AFTER` (legacy) and `SHOW_MOVE` (new). For `SHOW_MOVE` render `<DemoMoveCard>` with `onShow` bubbled up from `PuzzleCoachPanel`.
4. **`src/components/puzzle/PuzzleCoachPanel.tsx`** — new prop `onCoachDemoRequest?: (moves: string[]) => void`. Bubbles `onShow` from card up to parent.
5. **`src/pages/preview/puzzles.tsx`** — owns `demo` state, renders the dialog, drives the board through the SAN sequence.
6. **`src/lib/prompts/coachChatPrompt.ts`** (or wherever puzzle-coach prompt lives) — bump tag instruction from `POSITION_AFTER` to `SHOW_MOVE`. Prompt version bumps to puzzle-coach v0.2.
7. Keep `PuzzleCoachMiniboard.tsx` in tree for one more cycle, marked deprecated — delete after Vercel cache cycles + a week with no fallback hits.

## Open questions

### For Aayan (chess/coaching)

1. **Demo default speed: Step or Auto?** Step gives more pedagogical control but more clicks; Auto feels coach-like but blows past insight.
2. **After demo finishes, snap back to user's attempt position automatically, or require a click?** Auto is smoother; click respects user agency.
3. **Should the coach ever drive a NON-solution line** ("if you'd played Ne5, then … ")? If yes, the demo card needs to show "side line — won't change your puzzle attempt." If no, demos are always solution-line.
4. **Audio cue when the demo plays?** A subtle tick per move would help eye tracking, but might be obnoxious on auto-speed.
5. **What does the coach say AFTER a demo?** Auto-fire a follow-up turn explaining what happened, or leave it to the user to ask?

### For tech-lead (architecture / scope / cost)

1. **Backwards compatibility window**: how long do we render legacy `[POSITION_AFTER]` tags? PR-A coach replies in production already use this tag. Three options: render-both-forever, render-both-90-days, hard-cutover-next-deploy.
2. **Eval impact**: bumping the prompt version invalidates the existing 5-fixture eval baseline in `audit/findings/agent-a-eval/`. Schedule a synthetic-tester re-run as a merge gate?
3. **Demo state vs. atom store**: should `demo` live as React state on the page, or as a Jotai atom so other surfaces (analyze, drill) can borrow the same demo machinery later?
4. **Animation cost on auto-speed**: 1200 ms × 4-move line = 4.8 s. Is that the right tradeoff between "see it clearly" and "still feels alive"? Could expose to user prefs.
5. **What's the rollout path** — flag-gated on `/preview/puzzles` first, or live for all puzzle-coach users on merge? Currently puzzle coach is /preview/* only, so no real risk.

## Risks

- **Prompt drift**: prompt version bump can subtly change coach voice across all responses. Mitigate with snapshot tests on the prompt builder.
- **Tag collision**: if any user can inject `[SHOW_MOVE:...]` into chat (they can't — there's no user-side injection path), demo could be triggered unexpectedly. Lock down to coach-role messages only.
- **Lose the at-a-glance "what's the line" affordance**: miniboard let you see the line without playing it. Mitigate by always showing the SAN list inside the demo card.

## Not in this PR

- Square-overlay highlights from glossary terms (lives in PR-C).
- Multi-line branching demos ("if A then B else C") — for now, single line.
- Voice-driven demo ("coach, walk me through it") — future, when voice surface lands.
