/**
 * Per-stage prompt builders for /api/puzzle-hint.
 *
 * Each stage enforces a different output contract. The shared base
 * (PUZZLE_HINT_BASE_PROMPT) plays the same caching role as the puzzle-chat
 * prompt — stable across stages so Anthropic's prompt cache can warm and
 * reuse it. Per-stage suffix carries the stage-specific constraints +
 * the puzzle context (which can't be cached, since every puzzle is new).
 *
 * Structured payload contract:
 *   - The model emits its prose, then a structured trailer beginning with
 *     `===MENTIONS===` listing chess-term highlights (one per line:
 *     `term;sq1,sq2,sq3;color`). The server strips the trailer from the
 *     returned prose and surfaces the mentions in the response.
 *   - For the `answer` stage, prose contains an inline `[SHOW_MOVE:...]`
 *     tag (existing PR-B tag). The server extracts it into `showMoves[]`.
 *
 * Versioning: bump PUZZLE_HINT_PROMPT_VERSION when any stage's prompt
 * changes in a way that should invalidate Anthropic's cache. Cached hint
 * responses keyed on (puzzleId, stage, userAttemptSan, promptVersion).
 */

import { Chess } from "chess.js";
import { parseSolutionMoves } from "@/lib/puzzleSolution";
import type {
  HintStage,
  PuzzleHintRequest,
} from "@/lib/validation/puzzleHintSchemas";
import type { LLMTier } from "@/lib/llmProvider";

export const PUZZLE_HINT_PROMPT_VERSION = "1.0";

/** Stable across stages — Anthropic cache prefix. */
export const PUZZLE_HINT_BASE_PROMPT = `You are the Puzzle Coach hint engine — a focused chess coach that helps a student understand a single puzzle, one disclosure stage at a time.

# Voice
- Direct, kind, terse. You are a coach, not a textbook.
- One concrete observation beats a long taxonomy lecture.
- Don't say "great question" / "let's see" — get to the chess.

# Structured trailer (REQUIRED on every response)
After your prose, emit a structured trailer beginning with the literal line:

\`===MENTIONS===\`

Then zero or more lines, each in the form:

\`<term>;<sq1>,<sq2>,<sq3>;<color>\`

Where:
- \`term\` is one of: pin, fork, skewer, discoveredAttack, doubleAttack, check, checkmate, backRankMate, smotheredMate, deflection, decoy, overloaded, zugzwang, enPassant.
- \`sq1...\` are board squares (a1-h8) involved in the pattern. For a pin: pinning_piece, pinned_piece, target_piece. For a fork: forking_piece, then each forked piece. For check / checkmate: attacker, then the king.
- \`color\` is one of: red, blue, yellow, green, orange.

Examples:
\`pin;g5,g7,g8;red\`
\`fork;e6,h7,c8;blue\`
\`checkmate;e7,e8;red\`

Only emit mentions for terms you actually USED in the prose. Don't pad. If your prose names no patterns, emit no mention lines (but the \`===MENTIONS===\` header is still required, on its own line).`;

/** Per-stage suffix builder. Includes the puzzle context + stage rules. */
export function buildPuzzleHintSuffix(req: PuzzleHintRequest): string {
  const { puzzle, userAttemptSan, stage, userRating } = req;

  const studentStartFen = computeStudentStartFen(puzzle.fen, puzzle.solution);
  const solutionSans = computeSolutionSans(studentStartFen, puzzle.solution);
  const ratingLine = userRating
    ? `Student rating: ${userRating} (calibrate depth accordingly).`
    : "Student rating: unknown.";
  const themeLine =
    puzzle.themes.length > 0
      ? `Themes: ${puzzle.themes.join(", ")}.`
      : "Themes: (none provided).";
  const attemptLine = userAttemptSan
    ? `Student's wrong attempt: ${userAttemptSan}.`
    : "Student's wrong attempt: (none — student is asking from a solved state).";

  const contextBlock = `# Puzzle context (private — do not echo verbatim)

Starting FEN (student's turn to move):
\`${studentStartFen}\`

Correct solution sequence (SAN, student's moves only):
${solutionSans
  .map((s, i) => `  ${i + 1}. ${s}`)
  .join("\n") || "  (no further moves — first move is the puzzle)"}

${ratingLine}
${themeLine}
${attemptLine}`;

  return `${contextBlock}\n\n${stagePrompt(stage, {
    solutionSans,
    userAttemptSan,
  })}`;
}

/** Tier picker by stage. why_wrong is Haiku for speed; the rest go Sonnet. */
export function tierForStage(stage: HintStage): LLMTier {
  return stage === "why_wrong" ? "fast" : "flagship";
}

/** Token budget per stage. */
export function maxTokensForStage(stage: HintStage): number {
  switch (stage) {
    case "why_wrong":
      return 200;
    case "hint":
      return 300;
    case "answer":
      return 180;
    case "deeper_dive":
      return 700;
  }
}

interface StageContext {
  solutionSans: string[];
  userAttemptSan?: string;
}

function stagePrompt(stage: HintStage, ctx: StageContext): string {
  const solutionMoveSan = ctx.solutionSans[0] ?? "";
  switch (stage) {
    case "why_wrong":
      return `# Stage: why_wrong — Haiku tier — STRICT no-leak

The student just played ${ctx.userAttemptSan ?? "an unknown wrong move"}. Your job: in ≤80 words, explain why THAT MOVE doesn't work. Concrete, on-the-board reasoning.

HARD CONSTRAINTS:
- Do NOT name, hint at, or describe the solution move (which is "${solutionMoveSan}"). Do NOT mention the solution's destination square. Do NOT say what the student SHOULD have played.
- Stay focused on what's wrong with the attempt: what does it allow, what does it miss, what does the opponent now win?
- No hedging prefixes like "well…" or "actually…".
- One paragraph. No bullet points.

Output: prose, then the structured trailer.`;

    case "hint":
      return `# Stage: hint — Sonnet tier — STRICT no-leak

The student is stuck. They've seen the why_wrong stage and want a positional clue. In ≤120 words:

1. State ONE concrete positional observation about the current position. Example: "Notice the queen on g5 — it pins the g7 pawn to the king on g8."
2. State ONE strategic implication — why that observation matters for the puzzle. Example: "With the pawn frozen, a knight landing on f6 forks the king and queen."

Hard constraints:
- Don't name the solution move ("${solutionMoveSan}") or its destination.
- Use the structured trailer to flag the chess terms you used with the squares involved — so the client can paint them on the board.
- Stay positional. Don't lecture about general principles.

Output: prose, then the structured trailer.`;

    case "answer":
      return `# Stage: answer — Sonnet tier — full reveal allowed

Reveal the solution. In ≤60 words:

1. State the move (e.g. "The move is ${solutionMoveSan}").
2. Explain what it achieves in one sentence ("it forks the king and queen and wins material").
3. Emit a \`[SHOW_MOVE:${ctx.solutionSans.slice(0, 2).join(" ") || solutionMoveSan}]\` tag inline so the client can offer a board demo.

Constraint: keep it short. No backtracking — the student already saw the why_wrong and hint stages.

Output: prose with the SHOW_MOVE tag inline, then the structured trailer.`;

    case "deeper_dive":
      return `# Stage: deeper_dive — Sonnet (extended thinking) — full reveal

Comprehensive breakdown for a student who wants to learn the *pattern*, not just the answer. In ≤300 words:

1. Name the pattern (use the themes if relevant — only invent a name if you're certain).
2. Why does THIS position invite the pattern? What signals would tip the student off next time?
3. What are the common WRONG moves a student tries here, and why do they fail?
4. One transferable rule for spotting this kind of position in the wild.

Tone: pedagogical but not pompous. Use the structured trailer to mark up any chess terms you reference.

Output: multi-paragraph prose, then the structured trailer.`;
  }
}

function computeStudentStartFen(fen: string, solution: string[]): string {
  try {
    const g = new Chess(fen);
    const opp = solution[0];
    if (opp) {
      g.move({
        from: opp.slice(0, 2),
        to: opp.slice(2, 4),
        promotion: opp.length > 4 ? opp.slice(4, 5) : undefined,
      });
    }
    return g.fen();
  } catch {
    return fen;
  }
}

function computeSolutionSans(
  studentStartFen: string,
  solution: string[],
): string[] {
  const userMoves = solution.slice(1);
  const { parsed } = parseSolutionMoves(studentStartFen, userMoves);
  const g = new Chess(studentStartFen);
  const sans: string[] = [];
  for (const m of parsed) {
    try {
      const r = g.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (r) sans.push(r.san);
    } catch {
      break;
    }
  }
  return sans;
}
