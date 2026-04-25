# Agent A — Eval Scores
Generated: 2026-04-23. Model: claude-haiku-4-5-20251001.

## Scoring rubric
- **Correct** 0/1: no illegal moves cited, no piece confusion
- **Principle** 0–2: named principle / pattern explicitly
- **Halluc** 0/1: 0=clean, 1=hallucinated (wrong square / nonexistent line)
- **Tone** 0–2: warm, encouraging, "masti" feel
- **Disc** 0–2: principles-based vs engine-line discipline

## Run 1: FEN only in system context (how the REAL route works)

Fixtures 1 and 2 received game context embedded in the user message (as the route does via `buildGameContext`).
Fixtures 3, 4, 5 were sent with FEN only in the system context field — **they all responded with "no position provided"**.

This confirms a **critical bug**: if the user message doesn't carry the FEN/position text, the model hallucinates that no position exists. The real route avoids this by appending `gameContext` to the user message body.

## Run 2: FEN embedded in user message (corrected prompt, mirrors route behavior)

| # | Fixture | Correct | Principle | Halluc | Tone | Disc | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Englund Gambit | 1 | 2 | 0 | 2 | 1 | Recommends dxe5 + Qd4/f4 correctly; mentions principles (control center, develop safely). Suggests Qd4 to "support e5 pawn" which is slightly unusual but not wrong. Discipline score docked: mentions engine-style move order (Qd4) over pure principle. |
| 2 | Italian Game | 1 | 2 | 0 | 2 | 2 | Good principle citation (castle before attacking, f7 weakness, develop with purpose). No hallucination. Warm tone with checkboxes. |
| 3 | Knight fork | 1 | 1 | 0 | 2 | 1 | Correctly identifies d4 as the right plan. Mentions Nxe5 as "not immediately winning" but analysis is superficial — misses that Nd5 isn't actually a fork threat in this position; knight on c3 can't reach d5 in one move. Docked principle score for vague "d5 is vulnerable" claim without naming fork pattern. |
| 4 | K+P endgame | 1 | 2 | 1 | 2 | 2 | Correctly identifies opposition. **Hallucination**: claims "1.Kd1 ... if Black plays 1...Kd4, then 2.e4 and your pawn advances" — but after 1.Kd1 Kd4 2.e4+ Kxe4, the pawn is captured; the line is wrong. The winning idea (1.Ke2 to get behind the pawn) is never mentioned. |
| 5 | Equal middlegame | 1 | 1 | 0 | 2 | 1 | Names d5 correctly as key square. Slightly mis-identifies the opening ("Closed Sicilian") — it's an Italian/Giuoco Piano. Docked discipline: mentions "Bc4 is eyeing f7" as a "critical tension" when there's no concrete attack. |

**Aggregate (Run 2, n=5):**
- Factual correct: 5/5 = 100%
- Hallucination: 1/5 = 20% hallucinated
- Tone avg: 2.0 / 2.0
- Principle avg: 1.6 / 2.0
- Discipline avg: 1.4 / 2.0

## Critical infrastructure finding (Run 1)

**If a caller sends only FEN in the system prompt and omits it from the user message, the model responds "no position provided."** The production route (`enhanced-analysis`) avoids this by appending `gameContext` to every user message. But the `/api/chat` fast path and any ad-hoc callers that skip `buildGameContext` will reproduce this failure silently.
