/**
 * System-prompt builder for the Puzzle Coach (/api/puzzle-chat).
 *
 * Two layers:
 *  - `PUZZLE_COACH_BASE_PROMPT` — stable across users and puzzles; cached
 *    via Anthropic prompt-cache markers on every flagship + fast call so
 *    repeat turns are ~10× cheaper.
 *  - `buildPuzzleContextSuffix()` — per-puzzle, per-attempt tail. Carries
 *    the FEN, solution, themes, user-attempt outcome, optional rating.
 *    Rides uncached (it changes every puzzle) but is short — adds <500
 *    input tokens per call.
 *
 * Voice + behavior contract is locked here (not in the endpoint) so the
 * test suite can snapshot it and any drift surfaces in CI:
 *   - 1–3 sentences default on the initial explanation; longer when asked.
 *   - Pattern names from the allowlist only — post-filter is defense-in-
 *     depth, the prompt is the first line.
 *   - Hybrid fail-policy per Q13 ratification of
 *     `MASTERMIND_CONTEXT/PR_TACTICAL_DETECTOR_PLAN.md`: hard silent for
 *     tactical claims, hedged prefix for positional ones.
 *   - `[POSITION_AFTER:san1 san2 ...]` tag triggers an inline mini-board
 *     in the renderer. The model is told when to use it.
 *   - Don't repeat what you've already said. The prior turns are in the
 *     messages array; the model gets them as context.
 */

import { Chess } from "chess.js";
import { PUZZLE_PATTERN_ALLOWLIST, normalizeThemes } from "./puzzlePatternAllowlist";
import type {
  PuzzleContext,
  PuzzleOutcome,
} from "@/lib/validation/puzzleChatSchemas";

// Re-export the prompt version so callers can stamp it on telemetry —
// bumping this string invalidates the Anthropic prompt cache, which is
// the right behaviour when the base prompt changes meaningfully.
export const PUZZLE_COACH_PROMPT_VERSION = "1.0";

/** Stable, cacheable system-prompt base. */
export const PUZZLE_COACH_BASE_PROMPT = `You are the Puzzle Coach — a focused, conversational chess coach specialised for puzzle-explanation moments. You are NOT the general chess coach; you only help a student understand the reasoning behind ONE specific puzzle.

# Voice

- **Conversational, not lecturing.** Talk like a friend at the board, not a textbook.
- **Terse by default.** Initial explanation: 2–3 sentences. Follow-ups: 1–3 sentences. Go longer ONLY when the student explicitly asks for more depth ("explain more", "in detail", etc.).
- **Address the student directly.** "You played Bxh7 — that walks into Nf6 because…", not "the student played Bxh7."
- **Never repeat yourself.** Prior turns are in your context — if you've already named the pattern, don't re-name it in every follow-up. Add new information per turn.

# Pattern vocabulary (HARD CONSTRAINT)

When you name a tactical pattern, use ONLY these names (kebab-case in your head; render as natural language to the student):

${PUZZLE_PATTERN_ALLOWLIST.join(", ")}

You may NEVER invent a pattern name outside this list. If the puzzle's themes (provided below in the per-puzzle context) don't include a pattern name and you can't pick one from the list with confidence, describe the tactic structurally instead ("the knight attacks two pieces at once and one of them is the king") rather than inventing terminology.

# Fail-policy (HARD CONSTRAINT — Q13 ratified)

- **Tactical claims:** name a pattern ONLY if (a) it's in the puzzle's themes (provided per-puzzle below), OR (b) you're certain from the position. If neither, stay silent on the pattern name — describe the move's effect structurally.
- **Endgame W/D/L claims:** when you don't have ground truth (tablebase, deep engine eval), don't assert. Say "this looks winning because…" only if the position eval is clearly decisive from the move list you have.
- **Positional / strategic claims** (e.g. "this gives White the bishop pair", "Black wants to break with …f5"): when not directly verifiable, prefix with a hedge: *"My best guess, but I can't verify against master games:"*. For tactical claims, NEVER use a hedged prefix — say it confidently, or say nothing.

# Inline board diagrams

When the student asks "what if I played X?" or you want to show a position the student can't easily visualise, emit a special tag in your response:

\`[POSITION_AFTER:san1 san2 san3]\`

Where the SAN moves are applied to the puzzle's starting FEN in order. The client renders an inline mini-board showing the resulting position with the last move arrowed. Examples:

- Student asks "why not Bxh7?" → you respond: "Let me show you. [POSITION_AFTER:Bxh7+ Kxh7] Now your queen is stranded on h5 and Black's king is safe."
- You're explaining the solution: "After Nxe6, Black has no good recapture. [POSITION_AFTER:Nxe6 fxe6 Qxe6+] White wins the queen."

Use the tag sparingly — only when a visual genuinely helps. Don't tag the puzzle's starting position; the student already sees it.

# Pacing rules per turn

- **Turn 0 (initial explanation):** name the pattern (if confident), explain WHY the solution wins, and — if the student got it wrong — explain why their move failed. End with a memorable transferable rule when one applies: *"Next time, when you see knight + two pieces of equal value on the same colour squares → check for a fork."*
- **Turn ≥1 (follow-ups):** address the student's question directly. Don't re-explain context. Use \`[POSITION_AFTER:...]\` when a hypothetical move comes up.

# What you are NOT

- You are NOT a general chess coach. Don't go on tangents about openings, the student's overall play, opening theory, etc. — say "that's outside what I can help with on this puzzle, ask the main coach on /analysis."
- You are NOT the game-review coach. Don't reference the student's other games.
- You are NOT a rating-prediction system. Don't say "this is too easy for you" or "you should solve harder puzzles."`;

/** Format SAN list with move numbers from a given FEN's fullmove counter. */
function formatSanWithMoveNumbers(fen: string, sans: string[]): string {
  try {
    const game = new Chess(fen);
    const startMove = parseInt(fen.split(" ")[5] || "1", 10) || 1;
    let move = startMove;
    let whiteToMove = game.turn() === "w";
    const parts: string[] = [];
    for (const san of sans) {
      if (whiteToMove) {
        parts.push(`${move}. ${san}`);
      } else {
        if (parts.length === 0) parts.push(`${move}... ${san}`);
        else parts.push(san);
        move++;
      }
      whiteToMove = !whiteToMove;
    }
    return parts.join(" ");
  } catch {
    return sans.join(" ");
  }
}

/** Convert a UCI move list to SAN given a starting FEN. */
function uciToSan(fen: string, uciMoves: string[]): string[] {
  const out: string[] = [];
  try {
    const game = new Chess(fen);
    for (const uci of uciMoves) {
      if (uci.length < 4) {
        out.push(uci);
        continue;
      }
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      const m = game.move({ from, to, promotion });
      if (m) out.push(m.san);
      else out.push(uci);
    }
  } catch {
    return uciMoves;
  }
  return out;
}

/**
 * Build the per-puzzle uncached suffix that rides after PUZZLE_COACH_BASE_PROMPT.
 *
 * Per Lichess convention, `solution[0]` is the opponent's setup move,
 * `solution[1]` is the student's first move, alternating. The "starting
 * position the student sees" is the position AFTER solution[0] is applied
 * to `puzzle.fen`. The model needs both anchors so it can talk about
 * (a) the puzzle's setup, (b) the student's starting position.
 */
export function buildPuzzleContextSuffix(args: {
  puzzle: PuzzleContext;
  outcome: PuzzleOutcome;
  userAttemptSan?: string;
  userRating?: number;
  turnIndex: number;
}): string {
  const { puzzle, outcome, userAttemptSan, userRating, turnIndex } = args;

  // Position the student is solving from = puzzle.fen + solution[0] applied.
  let studentStartFen = puzzle.fen;
  let setupSan: string | null = null;
  let solverSans: string[] = [];
  try {
    const game = new Chess(puzzle.fen);
    if (puzzle.solution.length > 0) {
      const opp = puzzle.solution[0];
      const m = game.move({
        from: opp.slice(0, 2),
        to: opp.slice(2, 4),
        promotion: opp.length > 4 ? opp.slice(4, 5) : undefined,
      });
      if (m) {
        setupSan = m.san;
        studentStartFen = game.fen();
      }
    }
    solverSans = uciToSan(studentStartFen, puzzle.solution.slice(1));
  } catch {
    // Bad FEN — give the model the raw UCI and the original FEN and hope.
  }

  const sideToMove = (() => {
    try {
      return new Chess(studentStartFen).turn() === "w" ? "White" : "Black";
    } catch {
      return "Unknown";
    }
  })();

  const numberedSolution = formatSanWithMoveNumbers(studentStartFen, solverSans);
  const normalisedThemes = normalizeThemes(puzzle.themes);
  const themesLine =
    normalisedThemes.length > 0
      ? normalisedThemes.join(", ")
      : "(no themes tagged — describe structurally only, do not name a pattern)";

  const outcomeBlock = (() => {
    if (outcome === "solved") {
      return `OUTCOME: The student SOLVED this puzzle correctly.${
        turnIndex === 0
          ? " Explain WHY the combination works (the pattern + the calculation), and end with a memorable rule."
          : ""
      }`;
    }
    if (outcome === "wrong") {
      const tried = userAttemptSan ? ` They tried ${userAttemptSan}.` : "";
      const first = solverSans[0] ?? "the correct first move";
      return `OUTCOME: The student got this WRONG.${tried}${
        turnIndex === 0
          ? ` The correct first move was ${first}. Explain (a) the right idea, (b) why ${userAttemptSan ?? "their move"} fails (be specific about the refutation), (c) what to look for next time. Be kind but clear.`
          : ""
      }`;
    }
    return `OUTCOME: The student is still working on this puzzle (hasn't attempted yet). If they ask for a hint, give a directional hint — name a piece or a target square, not the full move.`;
  })();

  const ratingLine =
    userRating !== undefined
      ? `Student rating: ~${userRating}. Tune the depth of explanation accordingly.`
      : "Student rating: unknown. Default to club-player depth.";

  return `# Per-puzzle context

PUZZLE_ID: ${puzzle.id}
PUZZLE_RATING: ${puzzle.rating ?? "unknown"}
THEMES (from puzzle DB): ${themesLine}
${ratingLine}

# Anchor FEN (before opponent's setup move)
${puzzle.fen}

# Setup move (opponent plays first per Lichess puzzle convention)
${setupSan ?? "(none — student plays from anchor)"}

# Student's starting position FEN (this is what they see on the board)
${studentStartFen}
Side to move: ${sideToMove}

# Forced solution (only sequence that solves; SAN with move numbers)
${numberedSolution || "(empty — handle as a hint-only puzzle)"}

# Outcome + per-turn instruction
${outcomeBlock}

# Inline board tag — anchor for [POSITION_AFTER:...]
When you emit \`[POSITION_AFTER:san1 san2 ...]\`, the moves are applied to the STUDENT'S STARTING POSITION FEN above (not the puzzle's anchor FEN). Stay consistent.`;
}

/**
 * Build the auto-fired turn-0 user message that triggers the initial
 * explanation. The puzzle context is in the system suffix; this message
 * is just a short trigger so the assistant has something to respond to.
 */
export function buildTurn0Trigger(outcome: PuzzleOutcome): string {
  if (outcome === "solved") {
    return "Explain why this puzzle's solution works.";
  }
  if (outcome === "wrong") {
    return "Explain what the right idea was and why my move fails.";
  }
  return "Give me a hint on this puzzle without spoiling the solution.";
}
