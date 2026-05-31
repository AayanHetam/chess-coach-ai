"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SchoolIcon from "@mui/icons-material/School";
import type { ChessPuzzle } from "@/lib/chessPuzzlesService";
import {
  PUZZLE_EXPLANATION_SYSTEM_PROMPT,
  buildPuzzleExplanationPrompt,
} from "@/lib/prompts/puzzleExplanation";

/**
 * Inline coach-explainer card for a puzzle just solved or failed inside
 * a chat bubble. Sibling of src/sections/practice/PuzzleCoachExplanation
 * (which lives on /practice and is jotai-coupled) — this one is
 * prop-driven so it can drop into <InlinePuzzleSet>'s solved/wrong
 * states without dragging atom plumbing.
 *
 * Network shape
 * ─────────────
 * /api/chat's Zod schema (src/lib/validation/schemas.ts) rejects any
 * messages array element with role !== "user" | "assistant". The legacy
 * PuzzleCoachExplanation component sends role: "system" and gets 400'd
 * — its rendered output is always the offline fallback. To actually
 * reach the LLM, we concatenate the puzzle-explanation system prompt
 * into the user message instead of trying to send it as a separate
 * system-role message.
 */

export interface InlinePuzzleCoachProps {
  puzzle: ChessPuzzle;
  /** Whether the user solved the puzzle or got it wrong. Drives the
   *  copy on the trigger button + the framing in the request prompt. */
  outcome: "solved" | "wrong";
  /** Most recent wrong-attempt move in SAN ("Bxh7+" or similar). Threaded
   *  into the prompt so the explanation can address what the user tried. */
  userAttemptedMoveSan?: string | null;
  /** Optional: when true, render auto-expanded without the explicit
   *  trigger button. Useful for "always-on" reveal moments after wrong. */
  autoExpand?: boolean;
}

/**
 * Offline fallback explainer used when /api/chat is unreachable.
 * Theme-keyed lookup, deterministic, no LLM dependency. Local copy of
 * the same pattern used in PuzzleCoachExplanation so the inline
 * component stays self-contained.
 */
function generateFallbackExplanation(puzzle: ChessPuzzle): string {
  const themes = puzzle.themes ?? [];
  const rating = puzzle.rating ?? 1500;

  const themeExplanations: Record<string, string> = {
    fork:
      "A fork attacks two or more pieces at once, forcing the opponent to lose material.",
    pin: "A pin restricts a piece from moving because it would expose a more valuable piece behind it.",
    skewer:
      "A skewer attacks a valuable piece, forcing it to move and exposing a less valuable piece behind it.",
    "back-rank-mate":
      "The opponent's king is trapped on the back rank with no escape squares.",
    "discovered-attack":
      "Moving one piece reveals an attack from another piece behind it.",
    sacrifice:
      "Giving up material to achieve a tactical advantage or checkmate.",
    "mate-in-1": "Find the move that delivers checkmate in one.",
    "mate-in-2": "Find the forcing sequence that leads to mate in two.",
    "exposed-king":
      "The opponent's king lacks pawn protection or has weak squares nearby.",
    "hanging-piece": "A piece is undefended and can be captured for free.",
  };

  const parts: string[] = [];
  if (themes.length > 0) {
    const primary = themes[0]
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
    parts.push(`**Key theme**: ${primary}`);
    const lookup = themeExplanations[themes[0].toLowerCase()];
    if (lookup) parts.push(lookup);
  }

  if (rating < 1200) {
    parts.push("Focus on finding the immediate tactical blow.");
  } else if (rating < 1800) {
    parts.push("Look for forcing moves first — checks, captures, threats.");
  } else {
    parts.push("Calculate precisely; the solution depends on move order.");
  }

  const solution = puzzle.solution ?? puzzle.moves ?? [];
  if (solution.length > 0) {
    parts.push(`**Starts with**: \`${solution[0]}\``);
  }

  parts.push("_(Offline explanation — restore network for the live coach.)_");
  return parts.join("\n\n");
}

/**
 * Build the single user-message body that asks the coach to explain
 * the puzzle. Prepends the system-prompt content so the coach takes the
 * puzzle-explainer voice without us trying to send a `role: "system"`
 * message (which /api/chat's Zod schema rejects).
 */
function buildCombinedPrompt(
  puzzle: ChessPuzzle,
  outcome: "solved" | "wrong",
  userAttemptedMoveSan?: string | null,
): string {
  const userPrompt = buildPuzzleExplanationPrompt({
    fen: puzzle.fen,
    themes: puzzle.themes ?? [],
    solutionMoves: puzzle.solution ?? puzzle.moves ?? [],
    puzzleRating: puzzle.rating ?? 1500,
    solved: outcome === "solved",
    userAttemptedMove: userAttemptedMoveSan ?? undefined,
  });
  return `${PUZZLE_EXPLANATION_SYSTEM_PROMPT}\n\n${userPrompt}`;
}

export default function InlinePuzzleCoach({
  puzzle,
  outcome,
  userAttemptedMoveSan,
  autoExpand = false,
}: InlinePuzzleCoachProps) {
  const [expanded, setExpanded] = useState(autoExpand);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Avoid refetching the same puzzle when the user collapses/re-expands.
  const fetchedForRef = useRef<string | null>(null);

  // Reset when the puzzle changes (the parent re-renders us with a new id).
  useEffect(() => {
    setExpanded(autoExpand);
    setExplanation(null);
    setError(null);
    fetchedForRef.current = null;
  }, [puzzle.id, autoExpand]);

  const runFetch = useCallback(async () => {
    if (fetchedForRef.current === puzzle.id && explanation) return;
    setLoading(true);
    setError(null);
    fetchedForRef.current = puzzle.id;
    try {
      const content = buildCombinedPrompt(
        puzzle,
        outcome,
        userAttemptedMoveSan,
      );
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content }],
          temperature: 0.7,
          max_tokens: 800,
        }),
      });
      if (!res.ok) {
        // Common live cases: 400 (schema), 401/403 (auth), 5xx (provider).
        // All of them get the same UX — degrade gracefully to offline.
        setError(
          res.status === 401 || res.status === 403
            ? "Sign in for the live AI coach explanation."
            : "Live coach unavailable — showing offline explanation.",
        );
        setExplanation(generateFallbackExplanation(puzzle));
        return;
      }
      const data = await res.json();
      const text =
        (typeof data?.content === "string" && data.content) ||
        (typeof data?.reply === "string" && data.reply) ||
        (typeof data?.message === "string" && data.message) ||
        data?.choices?.[0]?.message?.content ||
        null;
      if (!text) {
        setError("Coach returned no text — showing offline explanation.");
        setExplanation(generateFallbackExplanation(puzzle));
        return;
      }
      setExplanation(text);
    } catch (err) {
      console.warn("[InlinePuzzleCoach] fetch failed:", err);
      setError("Network error — showing offline explanation.");
      setExplanation(generateFallbackExplanation(puzzle));
    } finally {
      setLoading(false);
    }
  }, [puzzle, outcome, userAttemptedMoveSan, explanation]);

  // autoExpand path: fire the fetch as soon as we're mounted/expanded.
  useEffect(() => {
    if (autoExpand && expanded && !loading && !explanation) {
      runFetch();
    }
  }, [autoExpand, expanded, loading, explanation, runFetch]);

  const handleClick = () => {
    if (!expanded) {
      setExpanded(true);
      runFetch();
    } else {
      setExpanded(false);
    }
  };

  const triggerLabel =
    outcome === "solved"
      ? "Coach: why this works"
      : "Coach: what to look for";

  return (
    <Box sx={{ mt: 1 }}>
      {!autoExpand && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoAwesomeIcon />}
          onClick={handleClick}
          sx={{
            color: "#ffa726",
            borderColor: "rgba(255,167,38,0.4)",
            "&:hover": {
              borderColor: "#ffa726",
              bgcolor: "rgba(255,167,38,0.08)",
            },
            textTransform: "none",
            fontWeight: 600,
          }}
        >
          {expanded ? "Hide coach" : triggerLabel}
        </Button>
      )}

      <Collapse in={expanded}>
        <Box
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1.5,
            bgcolor: "rgba(255,167,38,0.06)",
            border: "1px solid rgba(255,167,38,0.22)",
          }}
        >
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}
          >
            <SchoolIcon sx={{ color: "#ffa726", fontSize: 16 }} />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: "#ffa726",
                letterSpacing: 0.5,
              }}
            >
              {outcome === "solved" ? "WHY THIS WORKS" : "WHAT TO LOOK FOR"}
            </Typography>
          </Box>

          {loading && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#ffa726" }} />
              <Typography variant="body2" sx={{ color: "grey.400" }}>
                Coach is thinking…
              </Typography>
            </Box>
          )}

          {error && (
            <Typography
              variant="caption"
              sx={{ color: "grey.500", display: "block", mb: 0.5 }}
            >
              {error}
            </Typography>
          )}

          {explanation && !loading && (
            <Typography
              variant="body2"
              sx={{
                color: "grey.100",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                fontSize: "0.85rem",
              }}
            >
              {explanation}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
