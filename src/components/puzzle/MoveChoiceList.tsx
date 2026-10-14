"use client";

import { Box, Typography } from "@mui/material";
import { Check, X } from "lucide-react";
import type { MoveChoice } from "@/lib/puzzle/moveChoices";
import {
  ACCENT,
  FONT_MONO,
  LINE,
  MOTION,
  RADIUS,
  STATUS,
  SURFACE,
  TEXT,
} from "@/theme/tokens";

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

/** Status hairlines at the strength of a selected control's border. */
const CORRECT_BORDER = "rgba(48,209,88,0.6)";
const WRONG_BORDER = "rgba(255,69,58,0.6)";

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
          ? `1px solid ${CORRECT_BORDER}`
          : showWrong
            ? `1px solid ${WRONG_BORDER}`
            : isChosen
              ? `1px solid ${ACCENT.border}`
              : `1px solid ${LINE.hairline}`;

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
              borderRadius: `${RADIUS.control}px`,
              border,
              background: showCorrect
                ? STATUS.successTint
                : showWrong
                  ? STATUS.errorTint
                  : isChosen
                    ? ACCENT.tint
                    : SURFACE.raisedSecondary,
              cursor: disabled ? "default" : "pointer",
              opacity: disabled && !isChosen && !showCorrect ? 0.55 : 1,
              transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}, transform ${MOTION.press}`,
              // Hover only for a row at rest: on the chosen or a marked row it
              // would swap the state's edge for a neutral one and the row
              // would stop reading as selected.
              "&:hover":
                disabled || isChosen || showCorrect || showWrong
                  ? undefined
                  : { borderColor: LINE.strong },
              "&:active": disabled
                ? undefined
                : { transform: MOTION.pressScale },
              "&:focus-visible": {
                outline: `2px solid ${TEXT.primary}`,
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
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                border: `1.5px solid ${LINE.strong}`,
                fontWeight: 600,
                fontSize: "0.95rem",
                color: TEXT.secondary,
              }}
            >
              {LETTERS[i] ?? String(i + 1)}
            </Box>

            <Typography
              sx={{
                flex: 1,
                fontFamily: FONT_MONO,
                fontSize: "0.9375rem",
                lineHeight: 1.4,
                color: TEXT.primary,
              }}
            >
              {choice.san}
            </Typography>

            {showCorrect && (
              <Check size={18} strokeWidth={1.75} color={STATUS.success} />
            )}
            {showWrong && (
              <X size={18} strokeWidth={1.75} color={STATUS.error} />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
