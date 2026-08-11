"use client";

import { Box, Typography } from "@mui/material";
import { Check, X } from "lucide-react";
import type { MoveChoice } from "@/lib/puzzle/moveChoices";
import { SERIF_DISPLAY } from "@/theme/fonts";

/**
 * Multiple-choice answer rows.
 *
 * Shape is lifted from the Acely reference (docs/PUZZLE_TRAINING_LAYOUT_SPEC.md
 * §1.2): a circled letter badge, generous row height, and the block indented
 * and narrower than the surrounding content so it reads as a distinct
 * interactive zone rather than a continuation of the page.
 *
 * Answering is one tap. There is deliberately no separate confirm step here
 * even when confirm-move is on for the board: picking an option IS the
 * deliberate act that confirm-move exists to create, so asking twice would be
 * friction with no safety gained.
 */

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface MoveChoiceListProps {
  choices: MoveChoice[];
  /** SAN of the option currently selected, if any. */
  chosenSan?: string | null;
  /** SAN of an option already tried and wrong. Marked red on its own — a
   *  wrong guess must NOT also reveal the right answer, or one wrong tap
   *  hands over the puzzle. */
  wrongSan?: string | null;
  /** Reveal which option was right. Only once the puzzle is solved or the
   *  solution was explicitly shown. */
  revealed?: boolean;
  disabled?: boolean;
  onPick: (choice: MoveChoice) => void;
}

export function MoveChoiceList({
  choices,
  chosenSan,
  wrongSan,
  revealed = false,
  disabled = false,
  onPick,
}: MoveChoiceListProps) {
  if (choices.length === 0) return null;

  return (
    <Box
      role="radiogroup"
      aria-label="Choose a move"
      sx={{
        mt: 2.5,
        mx: "auto",
        width: "100%",
        maxWidth: 480,
        display: "flex",
        flexDirection: "column",
        gap: 1.25,
      }}
    >
      {choices.map((choice, i) => {
        const isChosen = chosenSan === choice.san;
        // Correctness is revealed only when the puzzle is over. A wrong tap
        // marks just that row — revealing the answer on the first miss would
        // turn a four-option question into a one-guess giveaway.
        const showCorrect = revealed && choice.isSolution;
        const showWrong = wrongSan === choice.san && !choice.isSolution;

        const border = showCorrect
          ? "1.5px solid rgba(74,222,128,0.6)"
          : showWrong
          ? "1.5px solid rgba(248,113,113,0.6)"
          : isChosen
          ? "1.5px solid rgba(255,122,26,0.65)"
          : "1.5px solid rgba(255,255,255,0.14)";

        return (
          <Box
            key={choice.uci}
            role="radio"
            aria-checked={isChosen}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onPick(choice)}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onPick(choice);
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.75,
              px: 2,
              minHeight: 62,
              borderRadius: "0.7rem",
              border,
              background: showCorrect
                ? "rgba(74,222,128,0.10)"
                : showWrong
                ? "rgba(248,113,113,0.10)"
                : isChosen
                ? "rgba(255,122,26,0.10)"
                : "rgba(22,18,14,0.55)",
              cursor: disabled ? "default" : "pointer",
              opacity: disabled && !isChosen && !showCorrect ? 0.55 : 1,
              transition:
                "border-color 180ms ease-out, background 180ms ease-out",
              "&:hover": disabled
                ? undefined
                : { borderColor: "rgba(255,122,26,0.5)" },
              "&:focus-visible": {
                outline: "2px solid rgba(255,122,26,0.8)",
                outlineOffset: 2,
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                width: 30,
                height: 30,
                flexShrink: 0,
                borderRadius: "999px",
                display: "grid",
                placeItems: "center",
                border: "1.5px solid rgba(255,240,224,0.35)",
                fontFamily: SERIF_DISPLAY,
                fontWeight: 600,
                fontSize: "0.95rem",
                color: "rgba(255,240,224,0.8)",
              }}
            >
              {LETTERS[i] ?? String(i + 1)}
            </Box>

            <Typography
              sx={{
                flex: 1,
                fontFamily: SERIF_DISPLAY,
                fontSize: "1.12rem",
                color: "rgba(255,240,224,0.94)",
              }}
            >
              {choice.san}
            </Typography>

            {showCorrect && <Check size={17} color="#86efac" />}
            {showWrong && <X size={17} color="#fca5a5" />}
          </Box>
        );
      })}
    </Box>
  );
}
